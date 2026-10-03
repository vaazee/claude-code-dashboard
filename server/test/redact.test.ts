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

test('secret flags passed as separate arguments are masked', () => {
  assert.equal(redactString('npx server --token abc123 --port 3000'), `npx server --token ${MASK} --port 3000`);
  assert.equal(redactString('uvx tool --api-key abc123'), `uvx tool --api-key ${MASK}`);
  assert.equal(redactString('run --api-key=abc123'), `run --api-key=${MASK}`);
  assert.equal(redactString('--auth-token x1 --verbose'), `--auth-token ${MASK} --verbose`);
});

test('URLs lose their query values and passwords', async () => {
  const { redactUrl } = await import('../src/lib/redact.ts');
  assert.equal(redactUrl('https://host/mcp?api_key=XYZ&team=1'), `https://host/mcp?api_key=${MASK}&team=${MASK}`);
  assert.equal(redactUrl('https://user:hunter2@host/sse'), `https://user:${MASK}@host/sse`);
  assert.ok(!redactString('see https://host/x?api_key=XYZ').includes('XYZ'));
  assert.ok(!redactString('curl -H "Authorization: Bearer abcdefgh12345678"').includes('abcdefgh'));
});

test('prose about authors and token counts is left alone', () => {
  assert.equal(redactString('Author: Jane'), 'Author: Jane');
  assert.equal(redactString('max tokens: 4096'), 'max tokens: 4096');
});
