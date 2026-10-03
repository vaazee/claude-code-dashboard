import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MASK, redact, redactString } from '../src/lib/redact.ts';

test('secret-looking keys are masked', () => {
  const out = redact({ apiKey: 'abc', nested: { authToken: 'xyz', name: 'ok' }, env: { FOO: 'bar' } });
  assert.deepEqual(out, { apiKey: MASK, nested: { authToken: MASK, name: 'ok' }, env: { FOO: MASK } });
});

test('known token formats are masked inside free text', () => {
  assert.ok(!redactString('key sk-ant-api03-abcdefghijklmnopqrstuvwxyz').includes('abcdefghij'));
  assert.ok(!redactString('ghp_' + 'a'.repeat(36)).includes('aaaa'));
  assert.equal(redactString('GITHUB_TOKEN=supersecret npm i'), `GITHUB_TOKEN=${MASK} npm i`);
  assert.ok(!redactString('x'.repeat(3) + ' ' + 'deadbeef'.repeat(6)).includes('deadbeef'));
});

test('ordinary text survives', () => {
  assert.equal(redactString('npm run build && open http://localhost:4321'), 'npm run build && open http://localhost:4321');
});
