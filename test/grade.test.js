const test = require('node:test');
const assert = require('node:assert');
const { compute, ALL_PERIODS } = require('../src/grade.js');

const item = (id, category, earned, possible, period = 'S1') => ({
  id, title: id, period, category,
  graded: earned != null, earned, possible: possible ?? null,
});
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

const items = [
  item('quiz', 'Assessments', 20, 20),
  item('exam', 'Assessments', null, null),
  item('c6', 'Community', 9, 10),
  item('c5', 'Community', 9, 10),
  item('read', 'Metacognition', 10, 10),
  item('report', 'Labs/Projects', null, null),
  item('hw', null, null, null),
];

test('total points', () => {
  const r = compute(items, { mode: 'points' });
  near(r.percent, 96);
  assert.equal(r.totalEarned, 48);
  assert.equal(r.totalPossible, 50);
});

test('weighted: categories without grades are left out and the rest rescaled', () => {
  const weights = { Assessments: 50, Community: 20, Metacognition: 10, 'Labs/Projects': 20 };
  const r = compute(items, { mode: 'weighted', weights });
  near(r.percent, (50 * 100 + 20 * 90 + 10 * 100) / 80);
  assert.deepEqual(r.warnings, []);
});

test('weighted: category percent is points-based inside the category', () => {
  const r = compute(
    [item('a', 'T', 5, 10), item('b', 'T', 90, 90), item('c', 'H', 1, 2)],
    { mode: 'weighted', weights: { T: 80, H: 20 } }
  );
  near(r.percent, 0.8 * 95 + 0.2 * 50);
});

test('weighted: missing weights warn and are excluded', () => {
  const r = compute(items, { mode: 'weighted', weights: { Assessments: 50 } });
  near(r.percent, 100);
  assert.match(r.warnings[0], /Community, Metacognition/);
  assert.equal(compute(items, { mode: 'weighted', weights: {} }).percent, null);
});

test('weighted: weights not summing to 100 warn; uncategorized graded work is ignored', () => {
  const list = [item('a', 'T', 8, 10), item('b', null, 0, 10)];
  const r = compute(list, { mode: 'weighted', weights: { T: 60 } });
  near(r.percent, 80);
  assert.equal(r.warnings.length, 2);
  near(compute(list, { mode: 'points' }).percent, 40);
});

test('what-ifs: fill in ungraded work and override graded work', () => {
  const whatIfs = { exam: { earned: 80, possible: 100 }, c6: { earned: 10 } };
  const r = compute(items, { mode: 'points', whatIfs });
  near(r.percent, (20 + 80 + 10 + 9 + 10) / 150 * 100);
  assert.equal(r.usedWhatIf, true);
  // incomplete what-if (no points possible known) does not count
  const r2 = compute(items, { mode: 'points', whatIfs: { exam: { earned: 80 } } });
  near(r2.percent, 96);
  assert.equal(r2.usedWhatIf, false);
});

test('grading periods filter items', () => {
  const list = [item('a', 'T', 5, 10, 'S1'), item('b', 'T', 10, 10, 'S2')];
  near(compute(list, { mode: 'points', period: 'S1' }).percent, 50);
  near(compute(list, { mode: 'points', period: 'S2' }).percent, 100);
  near(compute(list, { mode: 'points', period: ALL_PERIODS }).percent, 75);
});

test('extra credit and empty', () => {
  near(compute([item('a', 'T', 11, 10), item('ec', 'T', 2, 0)], { mode: 'points' }).percent, 130);
  assert.equal(compute([], { mode: 'points' }).percent, null);
});
