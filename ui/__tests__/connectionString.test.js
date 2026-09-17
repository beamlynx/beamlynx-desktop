// Regression tests for utils/connectionString.ts's two directions: parsing a
// pasted connection string into fields, and building one back from fields
// (components/settings/ConnectionsSection.tsx keeps both in sync -- see its
// handleConnectionStringChange and handleModeChange).
//
// Run with: node -r tsx/cjs --test __tests__
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseConnectionString, buildConnectionString } = require('../utils/connectionString.ts');

test('buildConnectionString: full postgres example', () => {
  const s = buildConnectionString({
    dbType: 'postgres',
    dbHost: 'db.example.com',
    dbPort: '5432',
    dbName: 'app',
    dbUser: 'alice',
    dbPassword: 'secret',
  });
  assert.equal(s, 'postgresql://alice:secret@db.example.com:5432/app');
});

test('buildConnectionString: mysql scheme', () => {
  const s = buildConnectionString({
    dbType: 'mysql',
    dbHost: 'h',
    dbPort: '3306',
    dbName: 'd',
    dbUser: 'u',
    dbPassword: 'p',
  });
  assert.match(s, /^mysql:\/\//);
});

test('buildConnectionString: blank password omits the trailing colon, not a bare one', () => {
  const s = buildConnectionString({
    dbType: 'postgres',
    dbHost: 'h',
    dbPort: '5432',
    dbName: 'd',
    dbUser: 'alice',
    dbPassword: '',
  });
  assert.equal(s, 'postgresql://alice@h:5432/d');
});

test('buildConnectionString: blank user omits the whole userinfo/@ segment', () => {
  const s = buildConnectionString({
    dbType: 'postgres',
    dbHost: 'h',
    dbPort: '5432',
    dbName: 'd',
    dbUser: '',
    dbPassword: '',
  });
  assert.equal(s, 'postgresql://h:5432/d');
});

test('buildConnectionString: percent-encodes user, password, and dbname', () => {
  const s = buildConnectionString({
    dbType: 'postgres',
    dbHost: 'h',
    dbPort: '5432',
    dbName: 'a/b',
    dbUser: 'a@b',
    dbPassword: 'p@ss:word',
  });
  const parsed = parseConnectionString(s);
  assert.equal(parsed.dbUser, 'a@b');
  assert.equal(parsed.dbPassword, 'p@ss:word');
  assert.equal(parsed.dbName, 'a/b');
});

test('build -> parse round-trips every field', () => {
  const fields = {
    dbType: 'postgres',
    dbHost: 'db.example.com',
    dbPort: '5433',
    dbName: 'app',
    dbUser: 'alice',
    dbPassword: 'secret',
  };
  const parsed = parseConnectionString(buildConnectionString(fields));
  assert.deepEqual(parsed, fields);
});
