const test = require('node:test');
const assert = require('node:assert');
const { autorun } = require('mobx');
const { Investigation } = require('../store/investigations');

test('the sidebar and timeline see the question when the agent sets it', () => {
  const investigation = new Investigation('a', 's');
  const seen = [];
  const stop = autorun(() => seen.push(investigation.question));
  investigation.apply({ id: 'q', tool: 'set_question', phase: 'start', at: Date.now(), detail: 'Why did signups drop?' });
  stop();
  assert.deepStrictEqual(seen, [undefined, 'Why did signups drop?']);
});
