// Real HTTP smoke check. Creates and deletes only its own explicitly labeled test post.
import assert from 'node:assert/strict';
const base = process.env.COMMUNITY_SMOKE_URL;
if (!base)
  throw new Error(
    'Set COMMUNITY_SMOKE_URL to the exact scoped community endpoint',
  );
const origin = new URL(base).origin;
let token = '',
  post;
async function request(path, method = 'GET', body) {
  const response = await fetch(base + path, {
    method,
    headers: {
      Origin: origin,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const data = await response.json();
  assert.ok(
    response.ok,
    method + ' ' + path + ' ' + response.status + ': ' + data.error,
  );
  return data;
}
try {
  token = (await request('/session', 'POST', {})).token;
  const payload = {
    requestId: crypto.randomUUID(),
    author: '功能验收测试',
    text: '社区发布功能自动验收，验证后立即移除。',
    tag: '日常分享',
    images: [
      '/9j/4AAQSkZJRgABAQAASABIAAD/4QBMRXhpZgAATU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAACqADAAQAAAABAAAAEAAAAAD/7QA4UGhvdG9zaG9wIDMuMAA4QklNBAQAAAAAAAA4QklNBCUAAAAAABDUHYzZjwCyBOmACZjs+EJ+/8AAEQgAEAAKAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBCBRCkaGxwQkjM1LwFWJy0QoWJDThJfEXGBkaJicoKSo1Njc4OTpDREVGR0hJSlNUVVZXWFlaY2RlZmdoaWpzdHV2d3h5eoKDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uLj5OXm5+jp6vLz9PX29/j5+v/bAEMAAgICAgICAwICAwUDAwMFBgUFBQUGCAYGBgYGCAoICAgICAgKCgoKCgoKCgwMDAwMDA4ODg4ODw8PDw8PDw8PD//bAEMBAgICBAQEBwQEBxALCQsQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEP/dAAQAAf/aAAwDAQACEQMRAD8A/WX4geJtV0P4o+Drdbl0024EySW8T4aeWTCqSgIyqDnn8Oa93rA1TThcanpl+qKz2rt95Nx2sMcHtW/Xnwcry5krdPuW+v8AketX9nyQ5L3trr1u9tF07tn/2Q==',
    ],
  };
  post = (await request('/posts', 'POST', payload)).post;
  assert.equal((await request('/posts', 'POST', payload)).post.id, post.id);
  assert.ok(
    (await request('?scope=mine')).posts.some(
      (item) => item.id === post.id && item.images.length === 1,
    ),
  );
  const image = await fetch(origin + post.images[0], {
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('Content-Type'), 'image/jpeg');
  assert.ok((await image.arrayBuffer()).byteLength > 100);
  assert.equal(
    (await request('/posts/' + post.id + '/like', 'POST', { liked: true }))
      .likes,
    1,
  );
  console.log(
    'PASS: create, retry without duplicates, persistent feed, JPEG download, like',
  );
} finally {
  if (post) {
    await request('/posts/' + post.id, 'DELETE');
    assert.ok(
      !(await request('?scope=mine')).posts.some((item) => item.id === post.id),
    );
    console.log(
      'PASS: own test post deleted; no live test content retained in feed',
    );
  }
}
