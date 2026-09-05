import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../app/api/voice/route.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const voiceId = 'xingbanVZFKSAIHT20260905v1';
function makeRoute(result = { base_resp: { status_code: 0 }, data: { audio: '494433040000' } }, env = {}) {
  const exports = {};
  const calls = [];
  vm.runInNewContext(compiled, {
    exports, process: { env: { MINIMAX_API_KEY: 'unit-test-only', ...env } },
    Response, Request, Headers, AbortSignal, Error, Uint8Array,
    fetch: async (url, options) => {
      calls.push({ url, payload: JSON.parse(options.body) });
      return Response.json(result);
    },
  });
  return { ...exports, calls };
}
const request = (body, origin = 'https://xingban.xunlian.co') => new Request('https://xingban.xunlian.co/api/voice', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body),
});

test('new text uses the authorized server-selected voice and returns upstream audio', async () => {
  const route = makeRoute();
  const response = await route.POST(request({ text: '今天过得怎么样？', voiceId: 'untrusted' }));
  assert.equal(response.status, 200);
  const sent = route.calls[0].payload;
  assert.equal(sent.voice_setting.voice_id, voiceId);
  assert.equal(sent.voice_setting.speed, 1);
  assert.equal(sent.voice_setting.pitch, 0);
  assert.equal(sent.voice_setting.emotion, undefined);
  assert.equal(sent.aigc_watermark, true);
  assert.equal(sent.text, '今天过得怎么样？');
  assert.equal(response.headers.get('X-Xingban-Voice-ID'), voiceId);
  assert.equal(response.headers.get('X-AI-Generated'), 'true');
  assert.equal(response.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(Buffer.from(await response.arrayBuffer()).toString('hex'), '494433040000');
});

test('deployment can configure an account-specific authorized voice', async () => {
  const route = makeRoute(undefined, { MINIMAX_VOICE_ID: 'another-authorized-voice' });
  await route.POST(request({ text: '你好' }));
  assert.equal(route.calls[0].payload.voice_setting.voice_id, 'another-authorized-voice');
});

test('unrecognized and prototype-like IDs cannot change the voice', async () => {
  for (const starId of ['missing', '__proto__', 'constructor', {}, null]) {
    const route = makeRoute();
    assert.equal((await route.POST(request({ text: '测试', starId }))).status, 200);
    assert.equal(route.calls[0].payload.voice_setting.voice_id, voiceId);
  }
});

test('invalid payloads do not reach the provider', async () => {
  for (const value of [null, [], {}, { text: '   ' }]) {
    const route = makeRoute();
    assert.equal((await route.POST(request(value))).status, 400);
    assert.equal(route.calls.length, 0);
  }
});

test('provider errors and invalid audio do not trigger a system-voice fallback', async () => {
  for (const data of [
    { base_resp: { status_code: 20132 } },
    { base_resp: { status_code: 0 }, data: { audio: '' } },
    { base_resp: { status_code: 0 }, data: { audio: 'not hex' } },
  ]) {
    const route = makeRoute(data);
    assert.equal((await route.POST(request({ text: '测试' }))).status, 502);
    assert.equal(route.calls.length, 1);
  }
});

test('origin restrictions are preserved', async () => {
  const route = makeRoute();
  assert.equal((await route.POST(request({ text: '测试' }, 'https://untrusted.example'))).status, 403);
  assert.equal(route.calls.length, 0);
});
