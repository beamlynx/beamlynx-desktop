// Regression test for utils/keybindings.ts's KEYBINDINGS registry -- static
// source-text assertions, not executed TS, for the same reason
// mcp-query.no-raw-sql.test.js already documents: this repo has no
// ts-node/tsx runtime wired up for `node --test` yet, so a text-level check
// is what's available (and, for a small fixed set of "this exact bug already
// happened once" cases, is a robust enough guard on its own).
//
// Each case below is a real bug the file's own comments describe already
// having hit once (not a hypothetical): matching a combo's `key` instead of
// its physical `code` when Shift changes the character produced (comma/'<',
// period/'>'), and using the platform "primary" modifier (`mod`, ctrlKey ||
// metaKey) where a combo actually needs the literal physical Control key
// (Ctrl+Tab, which browsers never remap to Cmd+Tab even on Mac).
//
// Run with: node --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const SOURCE_PATH = path.join(__dirname, '..', 'utils', 'keybindings.ts');
const SOURCE = stripComments(fs.readFileSync(SOURCE_PATH, 'utf-8'));

// Isolates one KEYBINDINGS entry's own object-literal text, from its
// `name: '<name>',` line up to (but not including) the next entry's `name:`
// line -- so assertions below can't accidentally match text that belongs to
// a different entry earlier or later in the array.
function entrySource(name) {
  const start = SOURCE.indexOf(`name: '${name}',`);
  assert.ok(start !== -1, `KEYBINDINGS has no entry named '${name}'`);
  const next = SOURCE.indexOf(`name: '`, start + 1);
  return SOURCE.slice(start, next === -1 ? undefined : next);
}

test('toggle-sql-panel matches the physical Period key (code), not the Shifted character', () => {
  const entry = entrySource('toggle-sql-panel');
  assert.match(entry, /code:\s*'Period'/);
  // Regression guard: this entry must not go back to matching `key: '.'`
  // alongside `shift: true` -- Shift+period's e.key is '>', so that
  // combination can never fire on a real keyboard.
  assert.doesNotMatch(entry, /key:\s*'\.'/);
});

test("next-tab/previous-tab use the literal `ctrl` flag, not the platform `mod` flag", () => {
  for (const name of ['next-tab', 'previous-tab']) {
    const entry = entrySource(name);
    assert.match(entry, /ctrl:\s*true/, `${name} should match literal ctrlKey`);
    assert.doesNotMatch(entry, /mod:\s*true/, `${name} should not match ctrlKey || metaKey`);
  }
});

test('new-tab/close-tab/next-tab/previous-tab have no browser-host combo (stay unbound in the browser build)', () => {
  for (const name of ['new-tab', 'close-tab', 'next-tab', 'previous-tab']) {
    const entry = entrySource(name);
    assert.match(entry, /host:\s*'desktop'/, `${name} should gate its combo to desktop`);
    assert.doesNotMatch(entry, /host:\s*'browser'/, `${name} should have no browser fallback combo`);
  }
});

test('next-tab-pagedown/previous-tab-pageup are alias bindings (fire, but display nothing of their own)', () => {
  for (const name of ['next-tab-pagedown', 'previous-tab-pageup']) {
    const entry = entrySource(name);
    assert.match(entry, /display:\s*'',/);
  }
});

test('command-palette has distinct desktop and browser combos, not one combo with a host-less fallback', () => {
  const entry = entrySource('command-palette');
  assert.match(entry, /host:\s*'desktop',\s*combo:\s*\{[^}]*key:\s*'k'/);
  assert.match(entry, /host:\s*'browser',\s*combo:\s*\{[^}]*key:\s*'p'/);
});
