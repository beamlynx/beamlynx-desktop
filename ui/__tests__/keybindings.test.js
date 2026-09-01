// Regression tests for utils/keybindings.ts. Calls the real, exported
// `matchesCombo`/`keybindingMatches` against real fake-event objects and the
// real `KEYBINDINGS` registry, rather than regex-scanning the source text --
// a real call catches an actual matching-logic bug (e.g. checking `e.key`
// instead of `e.code`), not just the presence/absence of a token.
//
// Each case below is a real bug the file's own comments describe already
// having hit once (not a hypothetical): matching a combo's `key` instead of
// its physical `code` when Shift changes the character produced (comma/'<',
// period/'>'), and using the platform "primary" modifier (`mod`, ctrlKey ||
// metaKey) where a combo actually needs the literal physical Control key
// (Ctrl+Tab, which browsers never remap to Cmd+Tab even on Mac).
//
// Run with: node -r tsx/cjs --test __tests__
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { KEYBINDINGS, keybindingMatches } = require('../utils/keybindings.ts');
const { DevState } = require('../store/dev-state.ts');

function entry(name) {
  const config = KEYBINDINGS.find(k => k.name === name);
  assert.ok(config, `KEYBINDINGS has no entry named '${name}'`);
  return config;
}

// A real KeyboardEvent-shaped object -- only the fields matchesCombo/
// keybindingMatches actually read.
function keyEvent(overrides) {
  return { code: '', key: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...overrides };
}

beforeEach(() => {
  DevState.desktop = undefined;
});

test('toggle-sql-panel matches the physical Period key (code), not the Shifted character', () => {
  const config = entry('toggle-sql-panel');
  assert.ok(keybindingMatches(config, keyEvent({ code: 'Period', ctrlKey: true, shiftKey: true })));
  // Regression guard: Shift+period's e.key is '>', not '.' -- a version of
  // this combo that matched `key: '.'` with `shift: true` could never
  // actually fire on a real keyboard. Confirm matching by `key: '.'` alone
  // (with no `code`) does NOT fire this binding.
  assert.ok(!keybindingMatches(config, keyEvent({ key: '>', ctrlKey: true, shiftKey: true })));
});

test("next-tab/previous-tab match the literal ctrlKey, not ctrlKey || metaKey (mod)", () => {
  for (const name of ['next-tab', 'previous-tab']) {
    DevState.desktop = true;
    const config = entry(name);
    const shift = name === 'previous-tab';
    // Literal Ctrl fires...
    assert.ok(keybindingMatches(config, keyEvent({ key: 'tab', ctrlKey: true, shiftKey: shift })), name);
    // ...but Cmd (metaKey) alone, with no ctrlKey, must not -- that's the
    // platform "mod" behavior this combo deliberately avoids (a real browser
    // never remaps Ctrl+Tab to Cmd+Tab, even on Mac).
    assert.ok(!keybindingMatches(config, keyEvent({ key: 'tab', metaKey: true, shiftKey: shift })), name);
  }
});

test('new-tab/close-tab/next-tab/previous-tab only fire on desktop, not in the browser build', () => {
  for (const name of ['new-tab', 'close-tab', 'next-tab', 'previous-tab']) {
    const config = entry(name);
    const event =
      name === 'new-tab'
        ? keyEvent({ key: 't', metaKey: true })
        : name === 'close-tab'
          ? keyEvent({ key: 'w', metaKey: true })
          : keyEvent({ key: 'tab', ctrlKey: true, shiftKey: name === 'previous-tab' });

    DevState.desktop = true;
    assert.ok(keybindingMatches(config, event), `${name} should fire on desktop`);

    DevState.desktop = false;
    assert.ok(!keybindingMatches(config, event), `${name} should not fire in the browser build`);
  }
});

test('next-tab-pagedown/previous-tab-pageup fire (as aliases) but advertise nothing of their own', () => {
  DevState.desktop = true;
  for (const [name, key] of [
    ['next-tab-pagedown', 'pagedown'],
    ['previous-tab-pageup', 'pageup'],
  ]) {
    const config = entry(name);
    assert.equal(config.display, '');
    assert.ok(keybindingMatches(config, keyEvent({ key, ctrlKey: true })));
  }
});

test('command-palette fires on Ctrl/Cmd+K on desktop and Ctrl/Cmd+Shift+P in the browser -- not either combo on both hosts', () => {
  const config = entry('command-palette');

  DevState.desktop = true;
  assert.ok(keybindingMatches(config, keyEvent({ key: 'k', metaKey: true })), 'desktop should match Cmd+K');
  assert.ok(
    !keybindingMatches(config, keyEvent({ key: 'p', metaKey: true, shiftKey: true })),
    'desktop should not match the browser-only Cmd+Shift+P combo',
  );

  DevState.desktop = false;
  assert.ok(
    keybindingMatches(config, keyEvent({ key: 'p', metaKey: true, shiftKey: true })),
    'browser should match Cmd+Shift+P',
  );
  assert.ok(
    !keybindingMatches(config, keyEvent({ key: 'k', metaKey: true })),
    'browser should not match the desktop-only Cmd+K combo',
  );
});
