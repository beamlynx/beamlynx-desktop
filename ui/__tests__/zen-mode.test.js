// Ctrl/Cmd+. walks Zen mode's views: the canvas alone, then the canvas and the
// Pine/SQL panel, then the canvas, the panel and the results, then the canvas
// alone again. "Leave Zen Mode" puts things back as they were.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runInAction } = require('mobx');
const { GlobalStore } = require('../store/global.store.ts');
const { getAllCommands } = require('../utils/commands.ts');

const view = s => ({
  zen: s.isZenModeActive,
  panel: s.newLayoutPanelVisible,
  results: !s.zenHidesResults,
});

test('each press shows the next view, and the fourth goes back to the canvas alone', () => {
  const s = new GlobalStore();
  runInAction(() => (s.newLayoutPanelVisible = true));
  s.cycleZenMode();
  assert.deepEqual(view(s), { zen: true, panel: false, results: false });
  s.cycleZenMode();
  assert.deepEqual(view(s), { zen: true, panel: true, results: false });
  s.cycleZenMode();
  assert.deepEqual(view(s), { zen: true, panel: true, results: true });
  s.cycleZenMode();
  assert.deepEqual(view(s), { zen: true, panel: false, results: false });
});

test('the panel comes back in the mode it was in', () => {
  const s = new GlobalStore();
  const session = s.sessions[s.activeSessionId];
  runInAction(() => {
    s.newLayoutPanelVisible = true;
    session.setInputMode('sql');
  });
  s.cycleZenMode();
  s.cycleZenMode();
  assert.equal(session.inputMode, 'sql');
  assert.equal(s.newLayoutPanelVisible, true);
});

test('auto-run pauses while the results are hidden, and leaving puts everything back', () => {
  const s = new GlobalStore();
  runInAction(() => {
    s.autoRunEnabled = true;
    s.newLayoutPanelVisible = false;
  });
  s.cycleZenMode();
  assert.equal(s.autoRunEnabled, false);
  s.cycleZenMode();
  assert.equal(s.autoRunEnabled, false);
  s.cycleZenMode();
  assert.equal(s.autoRunEnabled, true);
  s.cycleZenMode();
  assert.equal(s.autoRunEnabled, false);
  s.cycleZenMode();
  s.exitZenMode();
  assert.deepEqual(view(s), { zen: false, panel: false, results: true });
  assert.equal(s.autoRunEnabled, true);
});

test('"Leave Zen Mode" is offered only in Zen mode', () => {
  const s = new GlobalStore();
  const session = s.sessions[s.activeSessionId];
  const leave = getAllCommands().find(c => c.id === 'exit-zen-mode');
  assert.equal(leave.isEnabled(s, session), false);
  s.cycleZenMode();
  assert.equal(leave.isEnabled(s, session), true);
  leave.handler(s, session);
  assert.equal(s.isZenModeActive, false);
});
