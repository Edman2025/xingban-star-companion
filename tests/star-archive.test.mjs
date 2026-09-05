import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('archive shows licensed historical content in both product surfaces', () => {
  const page = fs.readFileSync('app/page.tsx', 'utf8');
  const archive = fs.readFileSync('components/star-archive.tsx', 'utf8');
  assert.match(page, /<StarArchive compact/);
  assert.match(page, /value="feed"[\s\S]*?<StarArchive/);
  assert.doesNotMatch(page, /feedItems|已验证来源|刚刚发生|九月行程图已更新/);
  for (const text of ['2023-04-25', 'Play大明星', 'CC BY 3.0', 'Q55697066', 'CC0', '非实时官宣', '未接入每日自动更新']) assert.ok(archive.includes(text));
  assert.match(archive, /src="\/zhao-lusi-bulgari-2023-ccby3.jpg"/);
  const jpg = fs.readFileSync('public/zhao-lusi-bulgari-2023-ccby3.jpg');
  assert.equal(jpg.subarray(0, 3).toString('hex'), 'ffd8ff');
  assert.ok(jpg.length > 100000);
});
