// The Format command and button format every query in a tab, keep the cursor
// where it was, and leave values blocks and unparsed queries alone.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HttpClient } = require('../store/client.ts');
const { Session } = require('../store/session.ts');

// Pine's prettifier, roughly: each step on its own line. Text that doesn't
// parse comes back as it was.
const prettify = async text => (text.includes('!') ? text : text.split(/\s*\|\s*/).join('\n | '));

test('formats every query and keeps the cursor after the same characters', async t => {
  t.mock.method(HttpClient.prototype, 'prettify', prettify);
  t.mock.method(HttpClient.prototype, 'post', async () => undefined);
  const session = new Session('format', { connections: [], accessPolicies: [] });
  session.expression = 'company | employee\n\n\nvalues $id = 1\n\nuser | doc!ument\n\nuser | where: id = $id';
  // On the first query, right after `employee`.
  session.cursorPosition = { line: 0, character: 'company | employee'.length };
  await session.format();
  assert.equal(
    session.expression,
    'company\n | employee\n\nvalues $id = 1\n\nuser | doc!ument\n\nuser\n | where: id = $id',
  );
  assert.deepEqual(session.pendingSelection, {
    anchor: 'company\n | employee'.length,
    head: 'company\n | employee'.length,
  });
});

test('a query with a comment between steps keeps its text', async t => {
  // pine-lang's prettifier drops the comment.
  t.mock.method(HttpClient.prototype, 'prettify', async text => text.replace(/\s*-- note/, '').split(/\s*\|\s*/).join('\n | '));
  t.mock.method(HttpClient.prototype, 'post', async () => undefined);
  const session = new Session('format-comment', { connections: [], accessPolicies: [] });
  session.expression = 'company\n -- note\n | employee\n\nuser | document';
  await session.format();
  assert.equal(session.expression, 'company\n -- note\n | employee\n\nuser\n | document');
});

test('nothing changes when the server is away', async t => {
  t.mock.method(HttpClient.prototype, 'prettify', async () => {
    throw new Error('No response when trying to prettify');
  });
  t.mock.method(HttpClient.prototype, 'post', async () => undefined);
  const session = new Session('format-away', { connections: [], accessPolicies: [] });
  session.expression = 'user | document';
  await session.format();
  assert.equal(session.expression, 'user | document');
});

test('text typed while the server answers is not undone', async t => {
  const session = new Session('format-race', { connections: [], accessPolicies: [] });
  t.mock.method(HttpClient.prototype, 'post', async () => undefined);
  t.mock.method(HttpClient.prototype, 'prettify', async text => {
    session.expression = 'user | where: id = 2';
    return prettify(text);
  });
  session.expression = 'user | where: id = 1';
  await session.format();
  assert.equal(session.expression, 'user | where: id = 2');
  assert.equal(session.pendingSelection, null);
});
