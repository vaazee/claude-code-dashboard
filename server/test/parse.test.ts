import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activityPhrase, describeTool, mcpParts, promptOf } from '../src/ingest/parse.ts';

const user = (content: unknown, extra = {}) => ({ type: 'user', message: { role: 'user', content }, ...extra });

test('plain prompts are recognised', () => {
  assert.deepEqual(promptOf(user('fix the build')), { text: 'fix the build', command: false });
  assert.deepEqual(promptOf(user([{ type: 'text', text: 'hello' }])), { text: 'hello', command: false });
});

test('meta records, tool results and system noise are not prompts', () => {
  assert.equal(promptOf(user('<local-command-caveat>x</local-command-caveat>', { isMeta: true })), null);
  assert.equal(promptOf(user([{ type: 'tool_result', tool_use_id: 't', content: 'ok' }])), null);
  assert.equal(promptOf(user('[Request interrupted by user]')), null);
  assert.equal(promptOf(user('<system-reminder>…</system-reminder>')), null);
  assert.equal(promptOf({ type: 'assistant', message: { content: 'hi' } }), null);
});

test('slash commands become /name args', () => {
  const p = promptOf(user('<command-name>/model</command-name>\n<command-message>model</command-message>\n<command-args>opus</command-args>'));
  assert.deepEqual(p, { text: '/model opus', command: true });
});

test('edits count added and removed lines', () => {
  assert.deepEqual(describeTool('Edit', { file_path: '/a.ts', old_string: 'a\nb', new_string: 'a\nb\nc' }), {
    detail: '/a.ts',
    added: 3,
    removed: 2,
  });
  assert.equal(describeTool('Write', { file_path: '/b', content: '1\n2\n3\n4' }).added, 4);
  assert.equal(describeTool('MultiEdit', { file_path: '/c', edits: [{ old_string: 'x', new_string: 'y\nz' }] }).added, 2);
});

test('tools with unexpected input do not throw', () => {
  assert.deepEqual(describeTool('Edit', null), { detail: null, added: 0, removed: 0 });
  assert.equal(describeTool('SomethingNew', { a: 1, b: 'text' }).detail, 'text');
});

test('mcp tool names split into server and tool', () => {
  assert.deepEqual(mcpParts('mcp__claude_ai_Gmail__send_message'), { server: 'claude_ai_Gmail', tool: 'send_message' });
  assert.equal(mcpParts('Bash'), null);
  assert.equal(activityPhrase('mcp__spotify__SpotifySearch', null), 'spotify · SpotifySearch');
});
