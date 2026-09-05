// Both public frontends share the existing server's community database/files.
// This relay exposes only fixed community routes, never arbitrary upstream URLs.
const UPSTREAM =
  process.env.COMMUNITY_API_ORIGIN || 'https://xingban.xunlian.co';
const MAX_BODY = 13 * 1024 * 1024;

async function relay(request: Request) {
  const url = new URL(request.url);
  if (
    !/^\/api\/community(?:\/(?:session|posts(?:\/[1-9][0-9]{0,14}(?:\/like)?)?|images\/[a-f0-9]{32}\.jpg))?\/?$/.test(
      url.pathname,
    )
  ) {
    return Response.json({ error: '接口不存在' }, { status: 404 });
  }
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin)
    return Response.json({ error: '请求来源不允许' }, { status: 403 });
  if (Number(request.headers.get('Content-Length') || 0) > MAX_BODY) {
    return Response.json({ error: '发布内容过大' }, { status: 413 });
  }
  try {
    // Read a bounded body, even if Content-Length is omitted or dishonest.
    let body: Uint8Array | undefined;
    if (request.method === 'POST') {
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = request.body?.getReader();
      if (reader) {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.length;
          if (size > MAX_BODY) {
            await reader.cancel();
            return Response.json({ error: '发布内容过大' }, { status: 413 });
          }
          chunks.push(chunk.value);
        }
      }
      body = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.length;
      }
    }
    const headers = new Headers({
      'Content-Type': 'application/json',
      Origin: 'https://xingban-star-companion.rzzttg2qgz.chatgpt.site',
    });
    const authorization = request.headers.get('Authorization');
    if (authorization) headers.set('Authorization', authorization);
    const response = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
      method: request.method,
      headers,
      body: body as BodyInit | undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(50_000),
    });
    if (response.status >= 300 && response.status < 400) {
      return Response.json(
        { error: '社区服务地址异常，请稍后重试' },
        { status: 502 },
      );
    }
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type':
          response.headers.get('Content-Type') || 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.warn(
      'Community relay unavailable',
      error instanceof Error ? error.name : 'network error',
    );
    return Response.json(
      { error: '社区连接暂时中断，请稍后重试，草稿仍保留' },
      { status: 502 },
    );
  }
}

export const GET = relay;
export const POST = relay;
export const DELETE = relay;
