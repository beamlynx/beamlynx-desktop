// The SQL panel's formatter, with Pine $variables that have no value yet.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { autorun } = require('mobx');
const { formatSql, loadSqlFormatter } = require('../utils/formatSql');

// First, as it runs first: the formatter loads on first use.
test('SQL shows as it is until the formatter loads, then formatted', async () => {
  const sql = 'SELECT "u_0".* FROM "user" AS "u_0" LIMIT 250';
  const seen = [];
  const stop = autorun(() => seen.push(formatSql(sql)));
  assert.deepEqual(seen, [sql]);
  await loadSqlFormatter();
  stop();
  assert.equal(seen.length, 2);
  assert.match(seen[1], /\n/);
});

test('a $variable without a value still formats (Postgres)', () => {
  const out = formatSql('SELECT "u_0".* FROM "user" AS "u_0" WHERE "u_0"."name" = $test AND "u_0"."id" IN ($ids) LIMIT 250');
  assert.match(out, /\n/);
  assert.match(out, /= \$test/);
  assert.match(out, /\(\$ids\)/);
});

test('a $variable without a value still formats (MySQL)', () => {
  const out = formatSql('SELECT `u_0`.* FROM `user` AS `u_0` WHERE `u_0`.`name` = $test LIMIT 250');
  assert.match(out, /\n/);
  assert.match(out, /= \$test/);
});

test('positional ? parameters still format', () => {
  const out = formatSql('SELECT "u_0".* FROM "user" AS "u_0" WHERE "u_0"."id" = ? LIMIT 250');
  assert.match(out, /= \?/);
  assert.match(out, /\n/);
});
