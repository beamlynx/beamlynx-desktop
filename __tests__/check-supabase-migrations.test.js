// Tests for the migration guard (scripts/check-supabase-migrations.js):
// adding is fine, anything that could break a released app is refused.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { checkMigrationSql } = require('../scripts/check-supabase-migrations.js');

test('the first migration passes', () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'migrations', '20261024000000_profiles.sql'), 'utf8');
  assert.deepEqual(checkMigrationSql(sql), []);
});

test('adding is fine', () => {
  assert.deepEqual(
    checkMigrationSql(`
      alter table public.profiles add column country text;
      alter table public.profiles add column plan text not null default 'free';
      create table public.orgs (id uuid primary key);
      create or replace function public.f(x jsonb) returns void language sql as $$ delete from t; drop table x; $$;
      -- drop table profiles; in a comment
      comment on table public.orgs is 'drop table x';
    `),
    [],
  );
});

test('anything that could break a released app is refused', () => {
  const refused = [
    'drop table public.profiles',
    'alter table public.profiles drop column os',
    'alter table public.profiles rename column os to platform',
    'alter table public.profiles alter column os type int',
    'alter table public.profiles alter column os set not null',
    'alter table public.profiles add column plan text not null',
    'revoke execute on function public.record_profile(jsonb) from authenticated',
    'drop function public.record_profile(jsonb)',
    'delete from public.profiles',
  ];
  for (const sql of refused) {
    assert.equal(checkMigrationSql(sql + ';').length, 1, sql);
  }
});

test('a line marked compat is accepted', () => {
  assert.deepEqual(checkMigrationSql('revoke all on public.t from anon; -- compat: a new table'), []);
});
