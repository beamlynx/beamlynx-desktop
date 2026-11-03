// Checks on src/main/mcp/pine-reference/, the Pine docs an agent reads
// through get_pine_doc and in parse errors. They are written by hand, so
// these tests catch the ways they drift from the code that serves them:
// a parse error that points at a topic with no file, a topic the overview
// doesn't list, a topic with no example, or SQL creeping into a doc.
//
// Whether the examples still parse is checked against pine-lang itself,
// when the bundled pine-lang changes. See RELEASING.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIST = path.join(__dirname, '..', 'dist', 'main', 'mcp', 'format.js');
assert.ok(fs.existsSync(DIST), 'dist/main/mcp/format.js is missing -- run `npm run build` first (npm test does).');
const { OPERATION_DOCS } = require(DIST);

const DIR = path.join(__dirname, '..', 'src', 'main', 'mcp', 'pine-reference');
const topics = fs
  .readdirSync(DIR)
  .filter(f => f.endsWith('.md') && f !== 'README.md')
  .map(f => f.replace(/\.md$/, ''));
const read = topic => fs.readFileSync(path.join(DIR, `${topic}.md`), 'utf-8');

test('every topic a parse error can point to has a file', () => {
  for (const [operation, topic] of Object.entries(OPERATION_DOCS)) {
    assert.ok(topics.includes(topic), `\`${operation}\` points to topic "${topic}", which has no ${topic}.md`);
  }
});

test('the overview lists every topic', () => {
  const overview = read('pine-lang');
  for (const topic of topics) {
    if (topic === 'pine-lang') continue;
    assert.ok(overview.includes(`\`${topic}\``), `pine-lang.md doesn't mention the "${topic}" topic`);
  }
});

test('every topic has an example', () => {
  for (const topic of topics) {
    assert.match(read(topic), /```\n\S[\s\S]*?```/, `${topic}.md has no example`);
  }
});

// Same discriminator as format.test.js: pine-lang writes SQL keywords in
// upper case, and Pine's own operations are lower case.
const SQL_KEYWORDS = /\b(SELECT|FROM|WHERE|INSERT|UPDATE|CREATE TABLE|INNER JOIN|LEFT JOIN|GROUP BY|ORDER BY)\b/;

test('no topic shows SQL', () => {
  for (const topic of topics) {
    const match = SQL_KEYWORDS.exec(read(topic));
    assert.equal(match, null, `${topic}.md contains the SQL keyword ${match?.[0]}`);
  }
});
