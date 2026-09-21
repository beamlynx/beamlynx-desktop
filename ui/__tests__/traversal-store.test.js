// Drives CanvasStore.startTraversal the way the UI does, over a stubbed
// network. The pure walk (runTraversal) has its own tests, and they all
// passed while the feature was completely broken in the app: the store method
// wrapping the walk never finished.
//
// The bug: the completion guards compared `this.traversalSignal !== signal` to
// tell a superseded walk from the current one. `traversalSignal` was an
// observable field, and MobX hands back a Proxy of whatever was assigned --
// so the object read back was never identical to the one passed in, every
// guard bailed, and the panel sat on "walking" forever with no error. Now a
// numeric generation counter, like the pickerSeq next to it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../store/session.ts');

const CONN = 'conn-1';

// Minimal pine-lang: one company with two employees, and nothing under them.
function stubFetch() {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const expression = body.expressions[0];
    const json = expression.endsWith('| count:')
      ? { result: [['count'], [expression.includes('employee') ? 2 : 1]], columns: [] }
      : {
          ast: {
            current: expression.includes('employee') ? 'e_1' : 'c_0',
            joins: [],
            // rootTableOf probes `<expr> |` to learn the current table's real
            // name, because selected-tables omits the pipe's final table.
            'selected-tables': expression.trim().endsWith('|')
              ? [{ table: 'company', alias: 'c_0', schema: 'public' }]
              : [],
            // Children only for the root probe; employees have none.
            hints: {
              table:
                expression.trim().endsWith('|') && !expression.includes('employee')
                  ? [
                      {
                        table: 'employee',
                        schema: 'public',
                        column: 'company_id',
                        'related-column': 'id',
                        resolution: 'fk',
                        pine: 'public.employee .company_id',
                      },
                    ]
                  : [],
            },
          },
        };
    return { ok: true, json: async () => json };
  };
  return () => {
    global.fetch = original;
  };
}

test('startTraversal finishes and records what it found', async () => {
  const restore = stubFetch();
  try {
    const session = new Session('t', { connections: [], accessPolicies: [] });
    session.connectionId = CONN;
    session.expression = 'company';
    await session.startTraversal('count');

    // The assertion that would have caught the original bug: the walk is over,
    // whatever it found.
    assert.notEqual(session.traversal.status, 'walking', 'traversal never left the walking state');
    assert.equal(session.traversal.status, 'done');
    assert.equal(session.traversal.error, null);
    // Post-order: the child before the table it hangs off.
    assert.deepEqual(
      session.traversal.nodes.map(n => `${n.table}(${n.count})`),
      ['employee(2)', 'company(1)'],
    );
  } finally {
    restore();
  }
});

test('a second traversal supersedes the first rather than merging into it', async () => {
  const restore = stubFetch();
  try {
    const session = new Session('t2', { connections: [], accessPolicies: [] });
    session.connectionId = CONN;
    session.expression = 'company';
    await Promise.all([session.startTraversal('count'), session.startTraversal('count')]);

    assert.equal(session.traversal.status, 'done');
    // The generation check is what keeps the loser's nodes out. Without it the
    // two walks would both append and the list would be doubled.
    assert.equal(session.traversal.nodes.length, 2);
  } finally {
    restore();
  }
});

// Closing a tab used to jump to tab one from anywhere in the strip. A tab
// opened to look at one row of a traversal is a detour, and finishing a
// detour should put you back where you started -- not at the far left.
const { GlobalStore } = require('../store/global.store.ts');

test('closing a tab returns to the one it was opened from', () => {
  const store = new GlobalStore();
  const a = store.sessions[store.activeSessionId];
  store.addTab();
  const b = store.sessions[store.activeSessionId];
  store.addTab();
  const c = store.sessions[store.activeSessionId];

  // A detour opened from c, the rightmost tab.
  store.addTab();
  const detour = store.sessions[store.activeSessionId];
  detour.openedFrom = c.id;

  store.closeTab(detour.id);
  assert.equal(store.activeSessionId, c.id, 'should return to the tab it was opened from');
  assert.notEqual(store.activeSessionId, a.id, 'must not jump to the first tab');
  void b;
});

test('closing a tab with no origin falls back to its left-hand neighbour', () => {
  const store = new GlobalStore();
  const a = store.sessions[store.activeSessionId];
  store.addTab();
  const b = store.sessions[store.activeSessionId];
  store.addTab();
  const c = store.sessions[store.activeSessionId];

  store.closeTab(c.id);
  assert.equal(store.activeSessionId, b.id, 'neighbour on the left, not the first tab');

  // Closing the leftmost has no left neighbour: the new first tab.
  store.activeSessionId = a.id;
  store.closeTab(a.id);
  assert.equal(store.activeSessionId, b.id);
});
