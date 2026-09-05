const MODEL = process.env.MINIMAX_TTS_MODEL || 'speech-2.8-turbo';
const API_URL = 'https://api.minimaxi.com/v1/t2a_v2';
const MAX_TEXT_CHARS = 500;
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60_000;

const allowedOrigins = new Set([
  'https://xingban.xunlian.co',
  'https://xingban-star-companion.rzzttg2qgz.chatgpt.site',
]);

const voiceProfiles: Record<
  string,
  { voiceId: string; speed: number; pitch: number }
> = {
  lin: { voiceId: 'Chinese (Mandarin)_Gentle_Youth', speed: 0.95, pitch: 0 },
  xia: {
    voiceId: 'Chinese (Mandarin)_Unrestrained_Young_Man',
    speed: 1.03,
    pitch: 0,
  },
  gu: { voiceId: 'Chinese (Mandarin)_Sincere_Adult', speed: 0.92, pitch: -1 },
};

const rateBuckets = new Map<string, number[]>();

function isAllowedOrigin(origin: string | null) {
  if (!origin || allowedOrigins.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function corsHeaders(origin: string | null) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin && isAllowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function jsonResponse(status: number, payload: unknown, origin: string | null) {
  const headers = corsHeaders(origin);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(payload), { status, headers });
}

function isRateLimited(clientIp: string) {
  const now = Date.now();
  const recent = (rateBuckets.get(clientIp) || []).filter(
    (timestamp) => now - timestamp < RATE_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT) {
    rateBuckets.set(clientIp, recent);
    return true;
  }
  recent.push(now);
  rateBuckets.set(clientIp, recent);
  return false;
}

function hexToBytes(hex: string) {
  if (!hex || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin))
    return jsonResponse(403, { error: '当前来源不允许访问语音服务' }, origin);
  const headers = corsHeaders(origin);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin))
    return jsonResponse(403, { error: '当前来源不允许访问语音服务' }, origin);

  const forwardedFor = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  const clientIp =
    forwardedFor || request.headers.get('cf-connecting-ip') || 'unknown';
  if (isRateLimited(clientIp))
    return jsonResponse(429, { error: '语音生成太频繁，请稍后再试' }, origin);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: '语音请求格式不正确' }, origin);
  }

  const body = payload as { starId?: unknown; text?: unknown };
  const text =
    typeof body.text === 'string'
      ? body.text.trim().slice(0, MAX_TEXT_CHARS)
      : '';
  if (!text) return jsonResponse(400, { error: '缺少需要朗读的内容' }, origin);
  const profile =
    voiceProfiles[typeof body.starId === 'string' ? body.starId : ''] ||
    voiceProfiles.lin;

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return jsonResponse(503, { error: '语音服务尚未配置' }, origin);

  try {
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        text,
        stream: false,
        language_boost: 'Chinese',
        voice_setting: {
          voice_id: profile.voiceId,
          speed: profile.speed,
          vol: 1,
          pitch: profile.pitch,
          emotion: 'calm',
        },
        audio_setting: {
          sample_rate: 32000,
          bitrate: 128000,
          format: 'mp3',
          channel: 1,
        },
        subtitle_enable: false,
        output_format: 'hex',
        aigc_watermark: true,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!upstream.ok)
      return jsonResponse(
        502,
        { error: 'MiniMax 暂时无法生成语音，请稍后再试' },
        origin,
      );
    const data = (await upstream.json()) as {
      data?: { audio?: string; status?: number };
      base_resp?: { status_code?: number; status_msg?: string };
    };
    if (data.base_resp?.status_code && data.base_resp.status_code !== 0) {
      return jsonResponse(
        502,
        { error: 'MiniMax 暂时无法生成语音，请稍后再试' },
        origin,
      );
    }

    const audio = hexToBytes(data.data?.audio || '');
    if (!audio)
      return jsonResponse(
        502,
        { error: 'MiniMax 返回的语音数据异常，请稍后再试' },
        origin,
      );

    const headers = corsHeaders(origin);
    headers.set('Content-Type', 'audio/mpeg');
    headers.set('Content-Length', String(audio.byteLength));
    return new Response(audio, { status: 200, headers });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return jsonResponse(
        504,
        { error: 'MiniMax 语音生成超时，请稍后再试' },
        origin,
      );
    }
    return jsonResponse(
      502,
      { error: 'MiniMax 暂时无法生成语音，请稍后再试' },
      origin,
    );
  }
}
