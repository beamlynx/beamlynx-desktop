// What's New is generated from the app's changelog (../desktop/CHANGELOG.md)
// by utils/parseChangelog.ts. These check how an entry becomes a title and
// a description, and that the real changelog parses.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseChangelog, parseItem } = require('../utils/parseChangelog');

test('the bold part is the title, the rest the description', () => {
  assert.deepEqual(parseItem('- **Long conditions are no longer drawn over.** On the canvas, under a table.'), {
    title: 'Long conditions are no longer drawn over',
    description: 'On the canvas, under a table.',
  });
});

test('a title that runs into its sentence still reads as one', () => {
  assert.deepEqual(parseItem('- **A downloaded update shows at the top right,** instead of a note.'), {
    title: 'A downloaded update shows at the top right',
    description: 'Instead of a note.',
  });
});

test('an entry with only a title has no description', () => {
  assert.deepEqual(parseItem('- **Dark mode.**'), { title: 'Dark mode' });
  assert.deepEqual(parseItem('- Dark mode'), { title: 'Dark mode' });
});

test('links keep their text, and the old "bundled" marker goes', () => {
  assert.deepEqual(
    parseItem('- **Open source.** See [the repo](https://github.com/x/y). (bundled beamlynx-ui 0.79.0)'),
    { title: 'Open source', description: 'See the repo.' },
  );
  assert.equal(parseItem('- **Fix.** Saves. (bundled pine-lang 0.58.0, beamlynx-ui 0.79.0)').description, 'Saves.');
});

test('versions and sections are read, and Unreleased is left out', () => {
  const versions = parseChangelog(
    [
      '# Change Log',
      '## [Unreleased]',
      '### Added',
      '- **Not out yet.**',
      '## [0.35.0] - 2026-11-25',
      '### Added',
      '- **A.** One.',
      '### Fixed',
      '- **B.**',
      '## [0.34.0] - 2026-11-20',
      '### Changed',
      '- **C.**',
    ].join('\n'),
  );
  assert.deepEqual(versions, [
    { version: '0.35.0', date: '2026-11-25', added: [{ title: 'A', description: 'One.' }], fixed: [{ title: 'B' }] },
    { version: '0.34.0', date: '2026-11-20', changed: [{ title: 'C' }] },
  ]);
});

test("the app's changelog parses, newest first, and every entry has a title", () => {
  const markdown = fs.readFileSync(path.join(__dirname, '..', '..', 'desktop', 'CHANGELOG.md'), 'utf8');
  const versions = parseChangelog(markdown);
  assert.ok(versions.length > 10);
  const items = versions.flatMap(v => [v.added, v.changed, v.removed, v.fixed, v.security].flat().filter(Boolean));
  assert.ok(items.every(item => item.title && !item.title.includes('**') && !/\(bundled /.test(item.description ?? '')));
});
