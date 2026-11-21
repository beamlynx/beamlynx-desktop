// The room the canvas leaves under a table for its chip rows (select, where,
// order, ...). Too little, and the next table, a group's or limit's line, or
// a named query's border is drawn over the chips. The heights below were
// measured in Chromium with ChipRow's styles at nodeWidth.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chipsHeight } = require('../store/canvas/layout.ts');

const node = chips => ({ selectColumns: [], whereChips: [], orderChips: [], groupChips: [], ...chips });

test('short chips share a line', () => {
  assert.equal(chipsHeight(node({ whereChips: ['id = 1', 'name = 2'] })), 21);
});

test('a long condition takes a line of its own, and room for all of them is left', () => {
  const whereChips = [
    "case_item_type = 'TextQuestionnaire'",
    "status = 'Pending'",
    'reference_id is null',
    'source_request_file_id is not null',
    'deleted_at is null',
  ];
  // Measured: 130px. Two chips to a line left only 66px.
  assert.ok(chipsHeight(node({ whereChips })) >= 130);
});

test('a select chip is as wide as its name too', () => {
  const plain = chipsHeight(node({ selectColumns: ['id', 'tenant_id'] }));
  const named = chipsHeight(
    node({ selectColumns: ['id', 'tenant_id'], selectNames: ['the_identifier', 'the_tenant_of_this_row'] }),
  );
  assert.ok(named > plain);
});

test('no chips, no room', () => {
  assert.equal(chipsHeight(node({})), 0);
});
