// Which part of a statement's SQL each query block wrote (utils/sqlBlockRanges.ts).
// The SQL panel highlights the part of the block the canvas draws.
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { sqlBlockRanges, withQueries } = require('../utils/sqlBlockRanges.ts');
const { formatSql, loadSqlFormatter } = require('../utils/formatSql.ts');

const textOf = (sql, ranges) => (ranges ?? []).map(r => sql.slice(r.from, r.to));

test('withQueries: names and spans, not a string or a comment that looks like one', () => {
  const sql = `WITH "a" AS ( SELECT '(x AS (' FROM t ), b AS (SELECT 1 -- c AS (\n) SELECT * FROM a`;
  assert.deepEqual(
    withQueries(sql).map(q => [q.name, sql.slice(q.from, q.to)]),
    [
      ['a', `"a" AS ( SELECT '(x AS (' FROM t )`],
      ['b', 'b AS (SELECT 1 -- c AS (\n)'],
    ],
  );
});

test('sqlBlockRanges: each named block gets its WITH query, the last block the rest', () => {
  const sql = 'WITH "x" AS ( SELECT 1 ), "y_2" AS ( SELECT 2 FROM x ) SELECT * FROM y_2';
  const ranges = sqlBlockRanges(
    sql,
    [
      { index: 0, name: 'x' },
      { index: 1, name: 'y' },
    ],
    2,
  );
  assert.deepEqual(textOf(sql, ranges.get(0)), ['"x" AS ( SELECT 1 )']);
  assert.deepEqual(textOf(sql, ranges.get(1)), ['"y_2" AS ( SELECT 2 FROM x )']);
  assert.deepEqual(textOf(sql, ranges.get(2)), ['WITH', 'SELECT * FROM y_2']);
});

test('sqlBlockRanges: a named block the statement does not read gets nothing', () => {
  const sql = 'WITH "x" AS ( SELECT 1 ) SELECT * FROM x';
  const ranges = sqlBlockRanges(
    sql,
    [
      { index: 0, name: 'unused' },
      { index: 1, name: 'x' },
    ],
    2,
  );
  assert.equal(ranges.get(0), undefined);
  assert.deepEqual(textOf(sql, ranges.get(1)), ['"x" AS ( SELECT 1 )']);
});

// SQL to Pine on an UPDATE with six WITH queries gives nine blocks. pine-lang
// wrote this SQL for them (#205): the WITH queries sit inside the FROM, and
// `picked`'s group: adds "result_1" before "picked".
test('sqlBlockRanges: the converted UPDATE, formatted as the panel shows it', async () => {
  await loadSqlFormatter();
  const raw = fs.readFileSync(path.join(__dirname, 'fixtures/converted-update.sql'), 'utf8');
  const sql = formatSql(raw);
  assert.notEqual(sql, raw);
  const names = [
    'processing',
    'case_item_reference_ids',
    'candidates',
    'best_tier',
    'best_candidates',
    'picked',
    'picked_item_ids',
    'unambiguous',
  ];
  const ranges = sqlBlockRanges(
    sql,
    names.map((name, index) => ({ index, name })),
    8,
  );
  names.forEach((name, index) => {
    const [text, ...more] = textOf(sql, ranges.get(index));
    assert.equal(more.length, 0, name);
    assert.match(text, new RegExp(`^"${index === 5 ? 'result_1' : name}" AS \\(`), name);
    assert.match(text, /\)$/, name);
  });
  assert.match(textOf(sql, ranges.get(5))[0], /\n\s*"picked" AS \(/);
  const main = textOf(sql, ranges.get(8));
  assert.equal(main.length, 2);
  assert.match(main[0], /^UPDATE "public"\."case_item"/);
  assert.match(main[0], /WITH$/);
  assert.match(main[1], /^SELECT\s/);
  assert.match(main[1], /"__pine_key_1__" = "case_item"\."id";$/);
});
