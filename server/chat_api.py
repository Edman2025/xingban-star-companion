#!/usr/bin/env python3
"""Small dependency-free proxy for Xingban MiniMax chat and speech."""

import json
import os
import re
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


PORT = int(os.environ.get("PORT", "8788"))
HOST = os.environ.get("HOST", "127.0.0.1")
MODEL = os.environ.get("MINIMAX_MODEL", "MiniMax-M3")
API_URL = "https://api.minimaxi.com/v1/chat/completions"
TTS_API_URL = "https://api.minimaxi.com/v1/t2a_v2"
TTS_MODEL = os.environ.get("MINIMAX_TTS_MODEL", "speech-2.8-turbo")
MAX_BODY_BYTES = 32 * 1024
MAX_MESSAGES = 12
MAX_MESSAGE_CHARS = 600
MAX_TOTAL_CHARS = 6000
RATE_LIMIT = 15
RATE_WINDOW_SECONDS = 60
ALLOWED_ORIGINS = {
    "https://xingban.xunlian.co",
    "https://xingban-star-companion.rzzttg2qgz.chatgpt.site",
}
PERSONAS = json.loads(Path(__file__).with_name("companion_personas.json").read_text(encoding="utf-8"))
VOICE_PROFILES = {
    "xingyao": (os.environ.get("MINIMAX_VOICE_ID") or "xingbanVZFKSAIHT20260905v1", 1.0, 0),
}

_rate_buckets = {}
_rate_lock = threading.Lock()


def build_system_prompt(star_id):
    profiles = PERSONAS["profiles"]
    profile = profiles.get(star_id, profiles["xingyao"]) if isinstance(star_id, str) else profiles["xingyao"]
    return profile["systemPrompt"]


def is_allowed_origin(origin):
    if not origin or origin in ALLOWED_ORIGINS:
        return True
    return re.fullmatch(r"https?://(localhost|127\.0\.0\.1)(:\d+)?", origin) is not None


def clean_reply(content):
    without_reasoning = re.sub(r"<think>[\s\S]*?</think>\s*", "", content or "", flags=re.IGNORECASE)
    return without_reasoning.strip()


def is_rate_limited(client_ip):
    now = time.time()
    with _rate_lock:
        recent = [timestamp for timestamp in _rate_buckets.get(client_ip, []) if now - timestamp < RATE_WINDOW_SECONDS]
        if len(recent) >= RATE_LIMIT:
            _rate_buckets[client_ip] = recent
            return True
        recent.append(now)
        _rate_buckets[client_ip] = recent
        if len(_rate_buckets) > 1000:
            for key in list(_rate_buckets):
                _rate_buckets[key] = [timestamp for timestamp in _rate_buckets[key] if now - timestamp < RATE_WINDOW_SECONDS]
                if not _rate_buckets[key]:
                    del _rate_buckets[key]
        return False


class ChatHandler(BaseHTTPRequestHandler):
    server_version = "XingbanChat/1.0"

    def log_message(self, format_string, *args):
        print("%s - %s" % (self.address_string(), format_string % args), flush=True)

    def cors_origin(self):
        origin = self.headers.get("Origin")
        return origin if is_allowed_origin(origin) and origin else None

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def send_audio(self, body, voice_id):
        self.send_response(200)
        self.send_header("Content-Type", "audio/mpeg")
        self.send_header("X-Xingban-Voice-ID", voice_id)
        self.send_header("X-AI-Generated", "true")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.cors_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if not is_allowed_origin(origin):
            self.send_json(403, {"error": "当前来源不允许访问聊天服务"})
            return
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Vary", "Origin")
        self.end_headers()

    def do_GET(self):
        if self.path == "/healthz":
            self.send_json(200, {"status": "ok", "model": MODEL, "personaRevision": PERSONAS["revision"]})
            return
        self.send_json(405, {"error": "仅支持 POST 请求"})

    def do_POST(self):
        if self.path not in ("/api/chat", "/api/voice"):
            self.send_json(404, {"error": "接口不存在"})
            return
        origin = self.headers.get("Origin")
        if not is_allowed_origin(origin):
            self.send_json(403, {"error": "当前来源不允许访问聊天服务"})
            return

        client_ip = (self.headers.get("X-Real-IP") or self.client_address[0]).strip()
        if is_rate_limited(client_ip):
            self.send_json(429, {"error": "消息发送太频繁，请稍后再试"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0
        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self.send_json(413, {"error": "消息内容过长"})
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.send_json(400, {"error": "消息格式不正确"})
            return

        if not isinstance(payload, dict):
            self.send_json(400, {"error": "消息格式不正确"})
            return

        if self.path == "/api/voice":
            self.handle_voice(payload)
            return

        raw_messages = payload.get("messages")
        if not isinstance(raw_messages, list) or not raw_messages:
            self.send_json(400, {"error": "请输入聊天内容"})
            return

        messages = []
        total_chars = 0
        for item in raw_messages[-MAX_MESSAGES:]:
            if not isinstance(item, dict) or item.get("role") not in ("user", "assistant"):
                continue
            content = item.get("content")
            if not isinstance(content, str):
                continue
            content = content.strip()[:MAX_MESSAGE_CHARS]
            if not content:
                continue
            total_chars += len(content)
            messages.append({"role": item["role"], "content": content})

        if not messages or messages[-1]["role"] != "user" or total_chars > MAX_TOTAL_CHARS:
            self.send_json(400, {"error": "对话内容不符合要求"})
            return

        api_key = os.environ.get("MINIMAX_API_KEY")
        if not api_key:
            self.send_json(503, {"error": "聊天服务尚未配置"})
            return

        system_prompt = build_system_prompt(payload.get("starId"))
        upstream_payload = json.dumps(
            {
                "model": MODEL,
                "messages": [{"role": "system", "content": system_prompt}] + messages,
                "temperature": 1.0,
                "top_p": 0.95,
                "max_completion_tokens": 450,
                "thinking": {"type": "disabled"},
            },
            ensure_ascii=False,
        ).encode("utf-8")
        request = urllib.request.Request(
            API_URL,
            data=upstream_payload,
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
                "User-Agent": "Xingban-Companion/1.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                upstream = json.loads(response.read().decode("utf-8"))
            reply = clean_reply(upstream.get("choices", [{}])[0].get("message", {}).get("content", ""))
            if not reply:
                raise ValueError("empty response")
            self.send_json(200, {"reply": reply, "model": upstream.get("model", MODEL), "personaRevision": PERSONAS["revision"]})
        except urllib.error.HTTPError as error:
            print("MiniMax HTTP error: %s" % error.code, flush=True)
            self.send_json(502, {"error": "MiniMax 暂时无法生成回复，请稍后再试"})
        except (urllib.error.URLError, TimeoutError):
            self.send_json(504, {"error": "MiniMax 响应超时，请稍后再试"})
        except (ValueError, KeyError, json.JSONDecodeError):
            self.send_json(502, {"error": "MiniMax 返回内容异常，请稍后再试"})

    def handle_voice(self, payload):
        text = payload.get("text") if isinstance(payload, dict) else None
        if not isinstance(text, str) or not text.strip():
            self.send_json(400, {"error": "缺少需要朗读的内容"})
            return
        text = text.strip()[:500]
        star_id = payload.get("starId")
        voice_id, speed, pitch = VOICE_PROFILES.get(
            star_id if isinstance(star_id, str) else "xingyao", VOICE_PROFILES["xingyao"]
        )
        api_key = os.environ.get("MINIMAX_API_KEY")
        if not api_key:
            self.send_json(503, {"error": "语音服务尚未配置"})
            return

        upstream_payload = json.dumps(
            {
                "model": TTS_MODEL,
                "text": text,
                "stream": False,
                "language_boost": "Chinese",
                "voice_setting": {
                    "voice_id": voice_id,
                    "speed": speed,
                    "vol": 1,
                    "pitch": pitch,
                },
                "audio_setting": {
                    "sample_rate": 32000,
                    "bitrate": 128000,
                    "format": "mp3",
                    "channel": 1,
                },
                "subtitle_enable": False,
                "output_format": "hex",
                "aigc_watermark": True,
            },
            ensure_ascii=False,
        ).encode("utf-8")
        request = urllib.request.Request(
            TTS_API_URL,
            data=upstream_payload,
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
                "User-Agent": "Xingban-Companion/1.0",
            },
            method="POST",
        )

        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                upstream = json.loads(response.read().decode("utf-8"))
            if upstream.get("base_resp", {}).get("status_code", 0) != 0:
                raise ValueError("upstream rejected speech request")
            audio_hex = upstream.get("data", {}).get("audio", "")
            if not isinstance(audio_hex, str) or not audio_hex or not re.fullmatch(r"(?:[0-9a-fA-F]{2})+", audio_hex):
                raise ValueError("empty or invalid audio")
            self.send_audio(bytes.fromhex(audio_hex), voice_id)
        except urllib.error.HTTPError as error:
            print("MiniMax speech HTTP error: %s" % error.code, flush=True)
            self.send_json(502, {"error": "MiniMax 暂时无法生成语音，请稍后再试"})
        except (urllib.error.URLError, TimeoutError):
            self.send_json(504, {"error": "MiniMax 语音生成超时，请稍后再试"})
        except (ValueError, KeyError, json.JSONDecodeError):
            self.send_json(502, {"error": "MiniMax 返回的语音数据异常，请稍后再试"})


if __name__ == "__main__":
    print(
        "Xingban chat and speech API listening on %s:%d with %s"
        % (HOST, PORT, MODEL),
        flush=True,
    )
    ThreadingHTTPServer((HOST, PORT), ChatHandler).serve_forever()
