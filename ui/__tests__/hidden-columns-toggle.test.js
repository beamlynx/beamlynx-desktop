// The SQL panel's show/hide hidden columns button is enabled only when
// clicking it changes the SQL shown (Session.hiddenColumnsToggle).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Session } = require('../store/session.ts');

function session({ query, built, withoutHidden, has = true }) {
  const s = new Session('s', { connections: [], accessPolicies: [] });
  s.builtQuery = built;
  s.builtQueryWithoutHidden = withoutHidden;
  s.builtQueryHasWithoutHidden = has;
  s.query = query;
  return s;
}

const WITH = 'SELECT "c_0"."id" AS "__c_0__id", "c_0".* FROM "company" AS "c_0"';
const WITHOUT = 'SELECT "c_0".* FROM "company" AS "c_0"';

test('enabled when the built SQL is shown and has added columns', () => {
  assert.equal(
    session({ query: WITHOUT, built: WITH, withoutHidden: WITHOUT }).hiddenColumnsToggle,
    'available',
  );
  assert.equal(
    session({ query: WITH, built: WITH, withoutHidden: WITHOUT }).hiddenColumnsToggle,
    'available',
  );
});

test('not for SQL the person typed, pasted or edited', () => {
  assert.equal(
    session({ query: 'select * from company', built: WITH, withoutHidden: WITHOUT })
      .hiddenColumnsToggle,
    'own-sql',
  );
});

test('not for a query with no added columns', () => {
  const count = 'WITH x AS (SELECT 1) SELECT COUNT(*) FROM x';
  assert.equal(
    session({ query: count, built: count, withoutHidden: count }).hiddenColumnsToggle,
    'none',
  );
});

test('not with a server that always includes them', () => {
  assert.equal(
    session({ query: WITH, built: WITH, withoutHidden: WITH, has: false }).hiddenColumnsToggle,
    'old-server',
  );
});
