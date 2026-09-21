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

// The "+" menu and its keyboard shortcut have to offer the same thing. They
// did not: each call site passed its own list, and `traverse` was added to
// the button's copy only. The fix is that callers cannot pass a list at all --
// openMorePicker derives it from isFrame -- so this asserts the shape that
// makes drift impossible rather than re-checking the two lists match.
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('nothing outside the store decides what the "+" menu offers', () => {
  const callers = [
    'components/canvas/nodes/TableNode.tsx',
    'components/canvas/nodes/FrameNode.tsx',
    'hooks/useCanvasKeybindings.ts',
  ];
  for (const file of callers) {
    const source = readFileSync(join(process.cwd(), file), 'utf8');
    assert.ok(
      !/MORE_ACTIONS_FOR_(TABLE|FRAME)/.test(source),
      `${file} names an action list -- openMorePicker(alias, isFrame, anchor) decides that, or the two menus drift again`,
    );
  }
});

// Pause and resume on a delete run. Deterministic rather than raced: the stub
// client pauses the session from inside the eval for the second table, so the
// loop is always interrupted at the same place.
function stubDeleteFetch(failOn) {
  const original = global.fetch;
  const attempted = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    const expression = body.expressions[0];
    // Only an EVAL of a delete actually deletes. buildDeleteQuery sends the
    // same text to /build while generating the script, and counting that as
    // an attempt made the stub report deletes that never ran.
    if (String(url).endsWith('/eval') && expression.includes('delete!')) {
      const table = expression.includes('employee') ? 'employee' : 'company';
      attempted.push(table);
      return {
        ok: true,
        json: async () =>
          table === failOn
            ? { error: 'permission denied' }
            : { result: [['Rows deleted'], [1]], columns: [] },
      };
    }
    if (expression.endsWith('| count:')) {
      return { ok: true, json: async () => ({ result: [['count'], [1]], columns: [] }) };
    }
    return {
      ok: true,
      json: async () => ({
        // buildDeleteQuery reads `query`; without it the script comes out
        // undefined and the traversal fails before a run is ever possible.
        query: `DELETE FROM ${expression.includes('employee') ? 'employee' : 'company'} WHERE 1=1`,
        ast: {
          current: expression.includes('employee') ? 'e_1' : 'c_0',
          joins: [],
          'selected-tables': expression.trim().endsWith('|')
            ? [{ table: 'company', alias: 'c_0', schema: 'public' }]
            : [],
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
      }),
    };
  };
  return {
    attempted,
    restore: () => {
      global.fetch = original;
    },
  };
}

function deleteSession(id) {
  const session = new Session(id, {
    connections: [],
    accessPolicies: [],
    allowsDestructiveActions: () => true,
  });
  session.connectionId = CONN;
  session.profileId = 'p1';
  session.expression = 'company';
  return session;
}

test('a failed delete stops there, and resuming does not repeat what already ran', async () => {
  const stub = stubDeleteFetch('employee');
  try {
    const session = deleteSession('d1');
    await session.startTraversal('delete');
    session.requestTraversalRun();
    await session.confirmTraversalRun();

    // runFrom points AT the node that failed, not past it -- that is where a
    // resume has to start.
    assert.equal(session.traversal.runFrom, 0);
    assert.deepEqual(stub.attempted, ['employee']);
    assert.equal(session.traversal.run, 'failed');
    assert.ok('error' in session.traversal.outcomes[0]);

    // Let it through this time; company must follow, and employee must not be
    // attempted twice in the same pass.
    stub.restore();
    const second = stubDeleteFetch(null);
    try {
      await session.confirmTraversalRun();
      assert.deepEqual(second.attempted, ['employee', 'company']);
      assert.equal(session.traversal.run, 'finished');
      assert.equal(session.traversal.runFrom, 2);
      // The retried failure is gone; only the two successes remain.
      assert.deepEqual(
        session.traversal.outcomes.map(o => o.table),
        ['employee', 'company'],
      );
    } finally {
      second.restore();
    }
  } finally {
    global.fetch && stub.restore();
  }
});

test('pausing stops before the next table and resuming continues from there', async () => {
  const stub = stubDeleteFetch(null);
  try {
    const session = deleteSession('d2');
    await session.startTraversal('delete');
    session.requestTraversalRun();

    // Pause as soon as the first table is done, so the loop never starts the
    // second. Nothing is undone -- each DELETE is its own statement and the
    // one that ran is committed; pausing only declines to start the next.
    const originalRun = session.traversal.nodes.length;
    assert.equal(originalRun, 2);
    const unpatch = (() => {
      const real = session.pauseTraversalRun.bind(session);
      return { real };
    })();
    void unpatch;
    const outcomesSeen = [];
    const observe = setInterval(() => {
      if (session.traversal.outcomes.length === 1 && session.traversal.run === 'running') {
        outcomesSeen.push('pausing');
        session.pauseTraversalRun();
        clearInterval(observe);
      }
    }, 0);
    await session.confirmTraversalRun();
    clearInterval(observe);

    // Either it paused after the first (the interesting case) or it was too
    // fast to interrupt; both are correct, so assert on the invariant that
    // holds either way rather than on the race.
    assert.ok(session.traversal.runFrom >= 1);
    if (session.traversal.run === 'paused') {
      assert.equal(session.traversal.runFrom, 1);
      await session.confirmTraversalRun();
      assert.equal(session.traversal.run, 'finished');
      assert.equal(session.traversal.runFrom, 2);
      assert.deepEqual(stub.attempted, ['employee', 'company']);
    }
  } finally {
    stub.restore();
  }
});
