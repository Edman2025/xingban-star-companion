import personas from '@/server/companion_personas.json';

const MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M3';
const API_URL = 'https://api.minimaxi.com/v1/chat/completions';
const MAX_MESSAGES = 12;
const MAX_MESSAGE_CHARS = 600;
const MAX_TOTAL_CHARS = 6000;
const RATE_LIMIT = 15;
const RATE_WINDOW_MS = 60_000;

const allowedOrigins = new Set([
  'https://xingban.xunlian.co',
  'https://xingban-star-companion.rzzttg2qgz.chatgpt.site',
]);

const starProfiles: Record<string, { systemPrompt: string }> = personas.profiles;

const rateBuckets = new Map<string, number[]>();

function isAllowedOrigin(origin: string | null) {
  if (!origin || allowedOrigins.has(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function responseHeaders(origin: string | null) {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin && isAllowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

function jsonResponse(status: number, payload: unknown, origin: string | null) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: responseHeaders(origin),
  });
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
  if (rateBuckets.size > 1000) {
    for (const [key, timestamps] of rateBuckets) {
      const active = timestamps.filter(
        (timestamp) => now - timestamp < RATE_WINDOW_MS,
      );
      if (active.length) rateBuckets.set(key, active);
      else rateBuckets.delete(key);
    }
  }
  return false;
}

function cleanReply(content: string) {
  return content.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin))
    return jsonResponse(403, { error: '当前来源不允许访问聊天服务' }, origin);
  const headers = responseHeaders(origin);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(null, { status: 204, headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get('Origin');
  if (!isAllowedOrigin(origin))
    return jsonResponse(403, { error: '当前来源不允许访问聊天服务' }, origin);

  const forwardedFor = request.headers
    .get('x-forwarded-for')
    ?.split(',')[0]
    ?.trim();
  const clientIp =
    forwardedFor || request.headers.get('cf-connecting-ip') || 'unknown';
  if (isRateLimited(clientIp))
    return jsonResponse(429, { error: '消息发送太频繁，请稍后再试' }, origin);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: '消息格式不正确' }, origin);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return jsonResponse(400, { error: '消息格式不正确' }, origin);
  }
  const body = payload as { starId?: unknown; messages?: unknown };
  const profileId = typeof body.starId === 'string' ? body.starId : '';
  const profile = Object.hasOwn(starProfiles, profileId)
    ? starProfiles[profileId]
    : starProfiles.xingyao;
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonResponse(400, { error: '请输入聊天内容' }, origin);
  }

  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let totalChars = 0;
  for (const item of body.messages.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== 'object') continue;
    const message = item as { role?: unknown; content?: unknown };
    if (
      (message.role !== 'user' && message.role !== 'assistant') ||
      typeof message.content !== 'string'
    )
      continue;
    const content = message.content.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!content) continue;
    totalChars += content.length;
    messages.push({ role: message.role, content });
  }

  if (
    !messages.length ||
    messages.at(-1)?.role !== 'user' ||
    totalChars > MAX_TOTAL_CHARS
  ) {
    return jsonResponse(400, { error: '对话内容不符合要求' }, origin);
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return jsonResponse(503, { error: '聊天服务尚未配置' }, origin);

  const systemPrompt = profile.systemPrompt;

  try {
    const upstream = await fetch(API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        temperature: 1,
        top_p: 0.95,
        max_completion_tokens: 450,
        thinking: { type: 'disabled' },
      }),
      signal: AbortSignal.timeout(45_000),
    });
    if (!upstream.ok)
      return jsonResponse(
        502,
        { error: 'MiniMax 暂时无法生成回复，请稍后再试' },
        origin,
      );

    const data = (await upstream.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const reply = cleanReply(data.choices?.[0]?.message?.content || '');
    if (!reply)
      return jsonResponse(
        502,
        { error: 'MiniMax 返回内容异常，请稍后再试' },
        origin,
      );
    return jsonResponse(
      200,
      { reply, model: data.model || MODEL, personaRevision: personas.revision },
      origin,
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return jsonResponse(
        504,
        { error: 'MiniMax 响应超时，请稍后再试' },
        origin,
      );
    }
    return jsonResponse(
      502,
      { error: 'MiniMax 暂时无法生成回复，请稍后再试' },
      origin,
    );
  }
}
