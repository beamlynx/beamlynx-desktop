// The results grid draws Text cells only. next.config.js replaces the two
// packages Glide needs for Markdown and Image cells with a stub that throws
// (components/results-grid/glide-unused-peers.ts), so a grid that drew
// either kind would break. This fails first.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function sources(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(rel);
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [rel] : [];
  });
}

test('every grid cell the app makes is a Text cell', () => {
  const kinds = new Map();
  for (const file of ['components', 'pages', 'store', 'utils', 'hooks'].flatMap(sources)) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const [, kind] of text.matchAll(/GridCellKind\.(\w+)/g)) {
      kinds.set(kind, [...(kinds.get(kind) ?? []), file]);
    }
  }
  assert.ok(kinds.has('Text'), 'expected the results grid to make Text cells');
  for (const [kind, files] of kinds) {
    assert.equal(
      kind,
      'Text',
      `${files.join(', ')} uses GridCellKind.${kind}: Markdown and Image cells need the packages next.config.js stubs out`,
    );
  }
});

test('the stub stands in for both packages', () => {
  const config = fs.readFileSync(path.join(root, 'next.config.js'), 'utf8');
  assert.match(config, /marked\$: unusedPeers/);
  assert.match(config, /'react-responsive-carousel\$': unusedPeers/);
  const stub = require('../components/results-grid/glide-unused-peers.ts');
  assert.throws(() => stub.marked('# x'), /Markdown cells are not bundled/);
  assert.throws(() => stub.Carousel({}), /Image cells are not bundled/);
});
