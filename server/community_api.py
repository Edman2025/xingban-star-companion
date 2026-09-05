#!/usr/bin/env python3
"""Shared community API. Keep COMMUNITY_DATA_DIR outside versioned releases.

Anonymous browser credentials are capabilities, not verified identities. Only
their SHA-256 digests are stored; every mutation checks ownership server-side.
"""

import base64
import binascii
import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import struct
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

TAGS = ("日常分享", "养成记录", "作品讨论", "活动互助")
MAX_BODY = 13 * 1024 * 1024
MAX_IMAGE = 1024 * 1024
ALLOWED_ORIGINS = {
    "https://xingban.xunlian.co",
    "https://xingban-star-companion.rzzttg2qgz.chatgpt.site",
}


class APIError(Exception):
    def __init__(self, status, message):
        self.status, self.message = status, message


def allowed_origin(origin):
    return origin in ALLOWED_ORIGINS or bool(re.fullmatch(r"http://(localhost|127\.0\.0\.1)(:\d+)?", origin or ""))


def validate_jpeg(value):
    if not isinstance(value, str) or len(value) > (MAX_IMAGE * 4 // 3 + 8):
        raise APIError(413, "图片过大，请重新选择图片")
    try:
        data = base64.b64decode(value, validate=True)
    except (ValueError, binascii.Error):
        raise APIError(400, "图片数据无效")
    if not (4 <= len(data) <= MAX_IMAGE and data[:2] == b"\xff\xd8" and data[-2:] == b"\xff\xd9"):
        raise APIError(400, "仅接受经过压缩处理的 JPEG 图片")
    # Check the marker structure and bounded dimensions, not a client MIME claim.
    offset, dimensions = 2, None
    try:
        while offset < len(data) - 2:
            if data[offset] != 255:
                break
            while data[offset] == 255:
                offset += 1
            marker = data[offset]
            offset += 1
            if marker == 0xDA:
                if dimensions:
                    return data
                break
            length = struct.unpack(">H", data[offset:offset + 2])[0]
            if length < 2 or offset + length > len(data):
                break
            if marker in (0xC0, 0xC1, 0xC2):
                height, width = struct.unpack(">HH", data[offset + 3:offset + 7])
                if not (1 <= width <= 1600 and 1 <= height <= 1600):
                    break
                dimensions = (width, height)
            offset += length
    except (IndexError, struct.error):
        pass
    raise APIError(400, "图片格式或尺寸无效，请重新选择")


class CommunityStore:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.images = self.directory / "images"
        self.images.mkdir(exist_ok=True)
        self.database = self.directory / "community.sqlite3"
        # This is the standalone SQLite deployment, not a D1 runtime migration.
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS sessions (
                    owner TEXT PRIMARY KEY, display_id TEXT NOT NULL, created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS posts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT, owner TEXT NOT NULL REFERENCES sessions(owner),
                    request_id TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, tag TEXT NOT NULL,
                    created_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(owner, request_id)
                );
                CREATE INDEX IF NOT EXISTS idx_posts_owner_id ON posts(owner, id DESC);
                CREATE INDEX IF NOT EXISTS idx_posts_deleted_tag_id ON posts(deleted, tag, id DESC);
                CREATE TABLE IF NOT EXISTS images (
                    id TEXT PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id), position INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_images_post_position ON images(post_id, position);
                CREATE TABLE IF NOT EXISTS likes (
                    post_id INTEGER NOT NULL REFERENCES posts(id), owner TEXT NOT NULL REFERENCES sessions(owner),
                    PRIMARY KEY(post_id, owner)
                );
                CREATE TABLE IF NOT EXISTS rate_events (
                    bucket TEXT NOT NULL, created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_rate_bucket_time ON rate_events(bucket, created_at);
                PRAGMA optimize;
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def rate(db, bucket, limit, seconds):
        now = int(time.time())
        count = db.execute("SELECT COUNT(*) FROM rate_events WHERE bucket=? AND created_at>?", (bucket, now - seconds)).fetchone()[0]
        if count >= limit:
            raise APIError(429, "操作太频繁，请稍后再试")
        db.execute("INSERT INTO rate_events VALUES (?, ?)", (bucket, now))
        db.execute("DELETE FROM rate_events WHERE created_at<?", (now - 86400,))

    def session(self, ip):
        token = secrets.token_urlsafe(32)
        owner = hashlib.sha256(token.encode()).hexdigest()
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            self.rate(db, "session:" + ip, 30, 3600)
            display_id = secrets.token_hex(3)
            db.execute("INSERT INTO sessions VALUES (?, ?, ?)", (owner, display_id, int(time.time())))
        return {"token": token, "displayId": display_id}

    def owner(self, authorization, required=False):
        owner = ""
        if re.fullmatch(r"Bearer [A-Za-z0-9_-]{43}", authorization or ""):
            candidate = hashlib.sha256(authorization[7:].encode()).hexdigest()
            with self.connect() as db:
                if db.execute("SELECT 1 FROM sessions WHERE owner=?", (candidate,)).fetchone():
                    owner = candidate
        if required and not owner:
            raise APIError(401, "访客身份已失效，请重新建立身份后发布")
        return owner

    def post_json(self, db, row, owner):
        session = db.execute("SELECT display_id FROM sessions WHERE owner=?", (row["owner"],)).fetchone()
        return {
            "id": row["id"], "author": row["name"], "displayId": session[0],
            "text": row["text"], "tag": row["tag"], "createdAt": row["created_at"] * 1000,
            "mine": row["owner"] == owner,
            "images": ["/api/community/images/" + image[0] for image in db.execute("SELECT id FROM images WHERE post_id=? ORDER BY position", (row["id"],))],
            "likes": db.execute("SELECT COUNT(*) FROM likes WHERE post_id=?", (row["id"],)).fetchone()[0],
            "liked": bool(db.execute("SELECT 1 FROM likes WHERE post_id=? AND owner=?", (row["id"], owner)).fetchone()),
        }

    def feed(self, owner, query):
        scope, tag = query.get("scope", ["all"])[0], query.get("tag", [""])[0]
        if scope not in ("all", "mine") or (tag and tag not in TAGS):
            raise APIError(400, "筛选条件无效")
        try:
            cursor = int(query.get("cursor", ["0"])[0])
            if cursor < 0 or cursor > 2**63 - 1:
                raise ValueError()
        except ValueError:
            raise APIError(400, "分页参数无效")
        where, params = ["deleted=0"], []
        if scope == "mine":
            where.append("owner=?")
            params.append(owner)
        if tag:
            where.append("tag=?")
            params.append(tag)
        with self.connect() as db:
            total = db.execute("SELECT COUNT(*) FROM posts WHERE " + " AND ".join(where), params).fetchone()[0]
            if cursor:
                where.append("id<?")
                params.append(cursor)
            rows = db.execute("SELECT * FROM posts WHERE " + " AND ".join(where) + " ORDER BY id DESC LIMIT 21", params).fetchall()
            posts = [self.post_json(db, row, owner) for row in rows[:20]]
        return {"posts": posts, "total": total, "nextCursor": posts[-1]["id"] if len(rows) > 20 else None}

    def publish(self, owner, payload, ip):
        text, name, tag, request_id = (payload.get(key) for key in ("text", "author", "tag", "requestId"))
        if not isinstance(text, str) or len(text) > 2000:
            raise APIError(400, "动态文字不能超过 2000 字")
        if not isinstance(name, str) or not 2 <= len(name.strip()) <= 16 or re.search(r"[\x00-\x1f\x7f]|官方|工作室|管理员|赵露思|趙露思", name):
            raise APIError(400, "昵称需为 2–16 字，请勿冒充明星或官方")
        if not isinstance(tag, str) or tag not in TAGS:
            raise APIError(400, "请选择有效话题")
        if not isinstance(request_id, str) or not re.fullmatch(r"[a-f0-9-]{36}", request_id):
            raise APIError(400, "发布标识无效，请重新打开发布窗口")
        images = payload.get("images", [])
        if not isinstance(images, list) or len(images) > 9:
            raise APIError(400, "最多添加 9 张图片")
        if not text.strip() and not images:
            raise APIError(400, "请填写文字或添加图片")
        with self.connect() as db:
            existing = db.execute("SELECT * FROM posts WHERE owner=? AND request_id=?", (owner, request_id)).fetchone()
            if existing:
                if existing["deleted"]:
                    raise APIError(409, "这条动态已删除，请重新创建动态")
                return self.post_json(db, existing, owner)
        data = [validate_jpeg(value) for value in images]
        if data:
            incoming = sum(map(len, data))
            used = sum(path.stat().st_size for path in self.images.glob('*.jpg'))
            if used + incoming > int(os.environ.get('COMMUNITY_MAX_MEDIA_BYTES', str(2 * 1024**3))) or shutil.disk_usage(self.directory).free < incoming + 1024**3:
                raise APIError(507, '社区图片存储空间不足，请稍后重试或发布纯文字动态')
        paths = []
        try:
            with self.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                # The same request can arrive twice after a network timeout.
                existing = db.execute("SELECT * FROM posts WHERE owner=? AND request_id=?", (owner, request_id)).fetchone()
                if existing:
                    if existing["deleted"]:
                        raise APIError(409, "这条动态已删除，请重新创建动态")
                    return self.post_json(db, existing, owner)
                self.rate(db, "post-owner:" + owner, 3, 60)
                self.rate(db, "post-ip:" + ip, 60, 86400)
                post_id = db.execute("INSERT INTO posts(owner, request_id, name, text, tag, created_at) VALUES (?, ?, ?, ?, ?, ?)", (owner, request_id, name.strip(), text.strip(), tag, int(time.time()))).lastrowid
                for position, image in enumerate(data):
                    image_id = secrets.token_hex(16) + ".jpg"
                    path = self.images / image_id
                    paths.append(path)
                    path.write_bytes(image)
                    db.execute("INSERT INTO images VALUES (?, ?, ?)", (image_id, post_id, position))
                result = self.post_json(db, db.execute("SELECT * FROM posts WHERE id=?", (post_id,)).fetchone(), owner)
            return result
        except Exception:
            for path in paths:
                path.unlink(missing_ok=True)
            raise

    def delete(self, owner, post_id):
        with self.connect() as db:
            result = db.execute("UPDATE posts SET deleted=1 WHERE id=? AND owner=?", (post_id, owner))
            if not result.rowcount:
                raise APIError(404, "动态不存在，或你无权删除")
        return {"deleted": True}

    def like(self, owner, post_id, liked):
        if not isinstance(liked, bool):
            raise APIError(400, "点赞状态无效")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if not db.execute("SELECT 1 FROM posts WHERE id=? AND deleted=0", (post_id,)).fetchone():
                raise APIError(404, "动态已不存在")
            self.rate(db, "like:" + owner, 60, 60)
            if liked:
                db.execute("INSERT OR IGNORE INTO likes VALUES (?, ?)", (post_id, owner))
            else:
                db.execute("DELETE FROM likes WHERE post_id=? AND owner=?", (post_id, owner))
            count = db.execute("SELECT COUNT(*) FROM likes WHERE post_id=?", (post_id,)).fetchone()[0]
        return {"liked": liked, "likes": count}

    def image(self, image_id):
        if not re.fullmatch(r"[a-f0-9]{32}\.jpg", image_id):
            raise APIError(404, "图片不存在")
        with self.connect() as db:
            if not db.execute("SELECT 1 FROM images JOIN posts ON posts.id=images.post_id WHERE images.id=? AND posts.deleted=0", (image_id,)).fetchone():
                raise APIError(404, "图片不存在")
        try:
            return (self.images / image_id).read_bytes()
        except FileNotFoundError:
            raise APIError(404, "图片暂不可用")


class CommunityHandler(BaseHTTPRequestHandler):
    server_version = "XingbanCommunity/1.0"

    def log_message(self, *_args):
        # Do not log visitor content, credentials, or per-image URLs.
        pass

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def respond(self, status, payload, image=False):
        body = payload if image else json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "image/jpeg" if image else "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.headers.get("Origin")
        if allowed_origin(origin):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        origin = self.headers.get("Origin")
        if not allowed_origin(origin):
            return self.respond(403, {"error": "请求来源不允许"})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", origin)
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def handle_api(self):
        try:
            origin = self.headers.get("Origin")
            if origin and not allowed_origin(origin):
                raise APIError(403, "请求来源不允许")
            url = urlsplit(self.path)
            path = url.path.rstrip("/")
            store = self.server.store
            if self.command == "GET":
                if path == "/healthz":
                    return self.respond(200, {"status": "ok", "storage": "sqlite", "revision": "community-v1"})
                if path == "/api/community":
                    return self.respond(200, store.feed(store.owner(self.headers.get("Authorization")), parse_qs(url.query)))
                if path.startswith("/api/community/images/"):
                    return self.respond(200, store.image(path.rsplit("/", 1)[-1]), image=True)
                raise APIError(404, "接口不存在")
            if not allowed_origin(origin):
                raise APIError(403, "请求来源不允许")
            payload = {}
            if self.command == "POST":
                if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
                    raise APIError(415, "请求格式无效")
                try:
                    length = int(self.headers.get("Content-Length", "0"))
                except ValueError:
                    length = 0
                if not 0 < length <= MAX_BODY:
                    raise APIError(413, "发布内容过大")
                try:
                    payload = json.loads(self.rfile.read(length))
                except (ValueError, UnicodeDecodeError):
                    raise APIError(400, "请求格式无效")
                if not isinstance(payload, dict):
                    raise APIError(400, "请求格式无效")
            # X-Real-IP is overwritten by the trusted loopback Nginx proxy.
            ip = hashlib.sha256((self.headers.get("X-Real-IP") or self.client_address[0]).encode()).hexdigest()
            if self.command == "POST" and path == "/api/community/session":
                return self.respond(201, store.session(ip))
            owner = store.owner(self.headers.get("Authorization"), required=True)
            if self.command == "POST" and path == "/api/community/posts":
                return self.respond(201, {"post": store.publish(owner, payload, ip)})
            match = re.fullmatch(r"/api/community/posts/([1-9][0-9]{0,14})(/like)?", path)
            if match:
                post_id = int(match[1])
                if self.command == "DELETE" and not match[2]:
                    return self.respond(200, store.delete(owner, post_id))
                if self.command == "POST" and match[2]:
                    return self.respond(200, store.like(owner, post_id, payload.get("liked")))
            raise APIError(404, "接口不存在")
        except APIError as error:
            self.respond(error.status, {"error": error.message})
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        except Exception:
            # Keep detailed data/paths out of public errors and container logs.
            self.respond(503, {"error": "社区服务暂不可用，你的草稿仍保留，请稍后重试"})

    do_GET = do_POST = do_DELETE = handle_api


def make_server(address, directory):
    server = ThreadingHTTPServer(address, CommunityHandler)
    server.store = CommunityStore(directory)
    return server


if __name__ == "__main__":
    directory = os.environ.get("COMMUNITY_DATA_DIR", "./work/community-data")
    server = make_server((os.environ.get("HOST", "127.0.0.1"), int(os.environ.get("PORT", "8790"))), directory)
    print("Xingban community API ready", flush=True)
    server.serve_forever()
