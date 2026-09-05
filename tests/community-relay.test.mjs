import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(
  readFileSync(
    new URL('../app/api/community/[[...path]]/route.ts', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function route(
  upstream = async () =>
    Response.json({ posts: [], total: 0, nextCursor: null }),
) {
  const exports = {},
    calls = [];
  vm.runInNewContext(compiled, {
    exports,
    process: { env: {} },
    URL,
    Headers,
    Request,
    Response,
    AbortSignal,
    Uint8Array,
    fetch: async (url, options) => {
      calls.push({ url, options });
      return upstream();
    },
  });
  return { ...exports, calls };
}
const root = 'https://xingban-star-companion.rzzttg2qgz.chatgpt.site';

test('Sites shares the canonical feed and forwards only the visitor credential', async () => {
  const api = route();
  const response = await api.GET(
    new Request(root + '/api/community?scope=mine', {
      headers: {
        Authorization: 'Bearer visitor-token',
        Cookie: 'private-cookie',
      },
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(
    api.calls[0].url,
    'https://xingban.xunlian.co/api/community?scope=mine',
  );
  assert.equal(
    api.calls[0].options.headers.get('Authorization'),
    'Bearer visitor-token',
  );
  assert.equal(api.calls[0].options.headers.get('Cookie'), null);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('posts preserve JSON and method without involving chat or voice', async () => {
  const api = route();
  const body = JSON.stringify({
    requestId: 'test',
    text: '图文动态',
    images: ['example'],
  });
  await api.POST(
    new Request(root + '/api/community/posts', {
      method: 'POST',
      headers: { Origin: root, 'Content-Type': 'application/json' },
      body,
    }),
  );
  assert.equal(api.calls[0].options.method, 'POST');
  assert.equal(new TextDecoder().decode(api.calls[0].options.body), body);
});

test('untrusted origins, arbitrary paths and oversized bodies are rejected before fetch', async () => {
  const api = route();
  assert.equal(
    (
      await api.POST(
        new Request(root + '/api/community/posts', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
          body: '{}',
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await api.GET(new Request(root + '/api/community/fetch/secret'))).status,
    404,
  );
  assert.equal(
    (
      await api.POST(
        new Request(root + '/api/community/posts', {
          method: 'POST',
          headers: { 'Content-Length': String(14 * 1024 * 1024) },
          body: '{}',
        }),
      )
    ).status,
    413,
  );
  assert.equal(
    (
      await api.POST(
        new Request(root + '/api/community/posts', {
          method: 'POST',
          body: 'x'.repeat(13 * 1024 * 1024 + 1),
        }),
      )
    ).status,
    413,
  );
  assert.equal(api.calls.length, 0);
});

test('upstream errors and image content types remain meaningful', async () => {
  const missing = route(async () =>
    Response.json({ error: '图片不存在' }, { status: 404 }),
  );
  assert.equal(
    (
      await missing.GET(
        new Request(root + '/api/community/images/' + 'a'.repeat(32) + '.jpg'),
      )
    ).status,
    404,
  );
  const image = route(
    async () =>
      new Response(new Uint8Array([255, 216, 255, 217]), {
        headers: { 'Content-Type': 'image/jpeg' },
      }),
  );
  assert.equal(
    (
      await image.GET(
        new Request(root + '/api/community/images/' + 'a'.repeat(32) + '.jpg'),
      )
    ).headers.get('Content-Type'),
    'image/jpeg',
  );
  const offline = route(async () => {
    throw new Error('offline');
  });
  assert.equal(
    (await offline.GET(new Request(root + '/api/community'))).status,
    502,
  );
});

test('archive-only release retains the public community until its backend is deployed', () => {
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(page, /<CommunityFeed \/>/);
  assert.match(page, /value="feed"[\s\S]*?<StarArchive/);
  assert.match(
    page,
    /const communityPosts|MVP 暂以演示数据展示|28,619 位星友|likedPosts/,
  );
});
