// The SQL panel's formatter, with Pine $variables that have no value yet.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatSql } = require('../utils/formatSql');

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
