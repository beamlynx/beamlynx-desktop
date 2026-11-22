// Tests for what the person sees about updates (src/main/update-decision.ts):
// the corner banners, the screen that blocks a version older than the
// minimum, and when a failed install means "download it yourself".
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'update-decision.js');
assert.ok(fs.existsSync(DIST), 'dist/main/update-decision.js is missing -- run `npm run build` first (npm test does).');
const { compareVersions, decideUpdateStatus, checkInstallAttempt, versionFromUpdateFile, minimumFromFile } = require(DIST);

const decide = (updater, minimumVersion = null, current = '0.34.0') => decideUpdateStatus({ current, updater, minimumVersion });

test('versions compare by number, not as text', () => {
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('0.34.0', '0.34.0'), 0);
  assert.equal(compareVersions('0.34', '0.34.0'), 0);
  assert.equal(compareVersions('v1.0.0', '0.99.99'), 1);
  assert.equal(compareVersions('0.35.0-beta.1', '0.35.0'), 0);
  assert.equal(compareVersions('0.33.9', '0.34.0'), -1);
});

test("the newest version is read from a release's update file", () => {
  assert.equal(versionFromUpdateFile('version: 0.34.0\nfiles:\n  - url: beamlynx-0.34.0.exe\n'), '0.34.0');
  assert.equal(versionFromUpdateFile("version: '0.35.0'\n"), '0.35.0');
  assert.equal(versionFromUpdateFile('<html>Not Found</html>'), null);
});

test('the minimum is read from minimum-version.json, and a broken file counts as unknown', () => {
  assert.equal(minimumFromFile('{"minimum_version": "0.36.0"}'), '0.36.0');
  assert.equal(minimumFromFile('{"minimum_version": null}'), null);
  assert.equal(minimumFromFile('{"minimum_version": "0.36"}'), undefined);
  assert.equal(minimumFromFile('{"minimum_version": 36}'), undefined);
  assert.equal(minimumFromFile('{}'), undefined);
  assert.equal(minimumFromFile('404: Not Found'), undefined);
});

// Every app reads this file from main, so a PR that breaks it fails here.
test('desktop/minimum-version.json in this repo reads correctly', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'minimum-version.json'), 'utf8');
  assert.notEqual(minimumFromFile(text), undefined, 'minimum_version must be null or "X.Y.Z"');
});

test('up to date, or not checked yet: nothing shows', () => {
  assert.deepEqual(decide({ kind: 'up-to-date' }), { state: 'none' });
  assert.deepEqual(decide({ kind: 'idle' }), { state: 'none' });
});

test('a downloading or downloaded update shows in a corner', () => {
  assert.deepEqual(decide({ kind: 'downloading', version: '0.35.0', percent: 40 }), {
    state: 'downloading',
    version: '0.35.0',
    percent: 40,
    required: false,
  });
  assert.deepEqual(decide({ kind: 'downloaded', version: '0.35.0' }), {
    state: 'downloaded',
    version: '0.35.0',
    required: false,
  });
});

test('an update that failed offers the download, when a newer version is known', () => {
  assert.deepEqual(decide({ kind: 'failed', version: '0.35.0' }), {
    state: 'download-yourself',
    version: '0.35.0',
    required: false,
  });
  assert.deepEqual(decide({ kind: 'failed', version: null }), { state: 'none' });
  assert.deepEqual(decide({ kind: 'failed', version: '0.34.0' }), { state: 'none' });
});

test('below the minimum, every way of updating blocks the app', () => {
  assert.equal(decide({ kind: 'downloading', version: '0.36.0', percent: 5 }, '0.35.0').required, true);
  assert.equal(decide({ kind: 'downloaded', version: '0.36.0' }, '0.35.0').required, true);
  assert.equal(decide({ kind: 'failed', version: '0.35.0' }, '0.35.0').required, true);
});

test('at or above the minimum, nothing blocks', () => {
  assert.equal(decide({ kind: 'downloaded', version: '0.36.0' }, '0.34.0').required, false);
  assert.equal(decide({ kind: 'downloaded', version: '0.36.0' }, '0.30.0').required, false);
});

test('a minimum nobody can reach yet blocks nobody', () => {
  // Raised before its release is published, or mistyped.
  assert.deepEqual(decide({ kind: 'up-to-date' }, '9.0.0'), { state: 'none' });
  assert.equal(decide({ kind: 'downloaded', version: '0.35.0' }, '0.36.0').required, false);
  assert.equal(decide({ kind: 'failed', version: '0.35.0' }, '0.36.0').required, false);
});

test('a minimum alone, with no newer version known, blocks nobody', () => {
  assert.deepEqual(decide({ kind: 'idle' }, '0.35.0'), { state: 'none' });
  assert.deepEqual(decide({ kind: 'failed', version: null }, '0.35.0'), { state: 'none' });
});

test('no install attempt on record: nothing to keep', () => {
  assert.deepEqual(checkInstallAttempt('0.34.0', null), { keep: null, failedVersion: null });
});

test('the update installed: the record is dropped', () => {
  assert.deepEqual(checkInstallAttempt('0.35.0', { version: '0.35.0', launches: 1 }), { keep: null, failedVersion: null });
  assert.deepEqual(checkInstallAttempt('0.36.0', { version: '0.35.0', launches: 0 }), { keep: null, failedVersion: null });
});

test('one launch still on the old version gets another try', () => {
  assert.deepEqual(checkInstallAttempt('0.34.0', { version: '0.35.0', launches: 0 }), {
    keep: { version: '0.35.0', launches: 1 },
    failedVersion: null,
  });
});

test('two launches still on the old version: installing has failed', () => {
  assert.deepEqual(checkInstallAttempt('0.34.0', { version: '0.35.0', launches: 1 }), {
    keep: { version: '0.35.0', launches: 2 },
    failedVersion: '0.35.0',
  });
});
