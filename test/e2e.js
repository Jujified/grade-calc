// Loads the unpacked extension in Chromium and serves mock "Your work" pages
// at classroom.google.com. Run: node test/e2e.js [screenshot-dir]
const { chromium } = require('playwright');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ext = path.resolve(__dirname, '..');
const shots = process.argv[2];
const near = (a, b) => assert.ok(Math.abs(a - b) < 0.006, `${a} != ${b}`);

(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-')), {
    channel: 'chromium',
    headless: true,
    viewport: { width: 1200, height: 900 },
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await ctx.route('https://classroom.google.com/**', (route) => {
    const p = new URL(route.request().url()).pathname;
    const file = p.includes('/c/AAA/') ? 'a.html' : p.includes('/c/BBB/') ? 'b.html' : p.includes('/c/CCC/') ? 'c.html' : p.includes('/c/DDD/') ? 'd.html' : null;
    route.fulfill({
      contentType: 'text/html',
      body: file ? fs.readFileSync(path.join(__dirname, 'fixtures', file), 'utf8') : '<h1>Stream</h1><p>Due tomorrow • x</p>',
    });
  });
  const page = await ctx.newPage();
  const panel = page.locator('[data-grade-calc] .panel');
  const pct = async () => parseFloat(await panel.locator('.pct').innerText());
  const shot = async (name) => shots && page.screenshot({ path: path.join(shots, name + '.png') });

  // --- Fixture A: points mode, Semester 1 auto-selected ---
  await page.goto('https://classroom.google.com/u/0/c/AAA/sp/123/all');
  await panel.waitFor();
  near(await pct(), 96); // 9+20+9+10 of 50; hidden view, Semester 2 and excused rows excluded
  assert.match(await panel.locator('.sub').innerText(), /48 \/ 50 points/);
  assert.match(await panel.locator('summary').innerText(), /4 graded of 9/i);
  const cats = await panel.locator('tbody tr td:first-child').allInnerTexts();
  assert.deepEqual(cats, ['Assessments', 'Community', 'Labs/Projects', 'Metacognition', 'No category']);
  await shot('a-points');

  // --- weighted mode ---
  await panel.getByRole('button', { name: 'Weighted by category' }).click();
  assert.equal(await panel.locator('.pct').innerText(), '—');
  for (const [name, w] of [['Assessments', '50'], ['Community', '20'], ['Labs/Projects', '20'], ['Metacognition', '10']]) {
    await panel.getByLabel('Weight for ' + name).fill(w);
  }
  near(await pct(), 97.5); // (50*100 + 20*90 + 10*100) / 80
  assert.equal(await panel.locator('.warn').count(), 0);

  // --- what-if: 80/100 on the exam -> Assessments 100/120 ---
  await panel.locator('summary').click();
  await panel.getByLabel('Score for Kinematics & Dynamics Exam').fill('80');
  near(await pct(), 97.5); // incomplete what-if does nothing
  await panel.getByLabel('Points possible for Kinematics & Dynamics Exam').fill('100');
  near(await pct(), (50 * (100 / 120) * 100 + 20 * 90 + 10 * 100) / 80);
  assert.ok(await panel.locator('.tag').isVisible());
  await shot('a-weighted-whatif');

  // --- settings persist per class across reloads ---
  await page.reload();
  await panel.waitFor();
  near(await pct(), (50 * (100 / 120) * 100 + 20 * 90 + 10 * 100) / 80);
  await panel.getByLabel('Grading period').selectOption('Semester 2');
  near(await pct(), 10);
  await panel.getByLabel('Grading period').selectOption({ label: 'All periods' });
  near(await pct(), (50 * (101 / 130) * 100 + 20 * 90 + 10 * 100) / 80);

  // --- Fixture B: "Due ..." titles, span-separated meta, split / comma scores ---
  await page.goto('https://classroom.google.com/c/BBB/sp/123/all');
  await panel.waitFor();
  near(await pct(), (9.5 + 9.5 + 45) / 70 * 100); // new class starts in points mode
  assert.deepEqual(await panel.locator('tbody tr td:first-child').allInnerTexts(),
    ['Peer Coverages', 'Script Submissions', 'Script Coverages']);
  assert.deepEqual((await panel.locator('.item .name').allTextContents()).slice(0, 2),
    ['Due 11.23: Jain Screenplay & Coverage #2', 'SCREENPLAY #2']);
  assert.equal(await panel.locator('.item .name').last().textContent(), 'Due Nov 1 draft');
  await shot('b-points');

  // --- Fixture C: real Classroom markup (score split across spans, hidden Classwork view) ---
  await page.goto('https://classroom.google.com/u/1/c/CCC/sp/123/all/default');
  await panel.waitFor();
  const badge = page.locator('[data-grade-calc-badge]');
  near(await pct(), (9.5 + 92.5) / 110 * 100);
  assert.match(await panel.locator('summary').innerText(), /2 graded of 5/i);
  assert.deepEqual(await panel.locator('tbody tr td:first-child').allInnerTexts(),
    ['Peer Coverages', 'Script Submissions', 'No category']);
  // grade is shown in the header, at the right of the student's name
  near(parseFloat(await badge.locator('.pct').innerText()), (9.5 + 92.5) / 110 * 100);
  assert.match(await badge.locator('.label').innerText(), /Semester 1/);
  const bb = await badge.boundingBox();
  const nb = await page.locator('h2:visible', { hasText: 'Julian Cimoca' }).boundingBox();
  assert.ok(bb.x > nb.x + nb.width && Math.abs(bb.y + bb.height / 2 - (nb.y + nb.height / 2)) < 60);
  await shot('c-open');
  await badge.getByRole('button', { name: 'Hide details' }).click();
  assert.equal(await panel.isVisible(), false);
  await shot('c-badge-only');
  await badge.getByRole('button', { name: 'View details' }).click();
  await panel.getByRole('button', { name: 'Weighted by category' }).click();
  await panel.getByLabel('Weight for Peer Coverages').fill('40');
  await panel.getByLabel('Weight for Script Submissions').fill('60');
  near(await pct(), 0.4 * 95 + 0.6 * 92.5);
  near(parseFloat(await badge.locator('.pct').innerText()), 0.4 * 95 + 0.6 * 92.5);

  // --- Fixture D: no grading periods, tests posted without a category ---
  await page.goto('https://classroom.google.com/c/DDD/sp/123/all');
  await panel.waitFor();
  near(await pct(), (9 + 36 + 51.5) / (9 + 40 + 60) * 100);
  assert.equal(await panel.locator('select[aria-label="Grading period"]').count(), 0);
  await panel.getByRole('button', { name: 'Weighted by category' }).click();
  await panel.getByLabel('Weight for Homework').fill('10');
  near(await pct(), 100);
  assert.match(await panel.locator('.warn').last().innerText(), /2 graded item\(s\) with no category/);
  // create a "Tests" category and tick the two tests
  await panel.getByRole('button', { name: '+ Add category' }).click();
  await panel.getByRole('button', { name: 'Add category', exact: true }).click();
  assert.match(await panel.locator('.error').innerText(), /Type a name/);
  await panel.getByLabel('New category name').fill('homework');
  await panel.getByRole('button', { name: 'Add category', exact: true }).click();
  assert.match(await panel.locator('.error').innerText(), /already/);
  await panel.getByLabel('New category name').fill('Tests');
  assert.deepEqual(await panel.locator('.check span').allInnerTexts(), ['Assessment #3', 'Unit 1 Test', 'Quiz 1']);
  await panel.locator('.check', { hasText: 'Unit 1 Test' }).click();
  await panel.locator('.check', { hasText: 'Quiz 1' }).click();
  await panel.getByRole('button', { name: 'Add category', exact: true }).click();
  await panel.getByLabel('Weight for Tests').fill('90');
  near(await pct(), 0.1 * 100 + 0.9 * (87.5 / 100) * 100);
  assert.equal(await panel.locator('.warn').count(), 0);
  await shot('d-custom-category');
  await page.reload();
  await panel.waitFor();
  near(await pct(), 0.1 * 100 + 0.9 * 87.5);
  // move one test back out, then into Homework, via the per-assignment dropdown
  await panel.locator('summary').click();
  await panel.getByLabel('Category for Quiz 1').selectOption('');
  near(await pct(), 0.1 * 100 + 0.9 * 90);
  await panel.getByLabel('Category for Quiz 1').selectOption('Homework');
  near(await pct(), 0.1 * (60.5 / 69) * 100 + 0.9 * 90);
  // removing the category un-sorts its assignments
  await panel.getByLabel('Remove category Tests').click();
  near(await pct(), (60.5 / 69) * 100);
  assert.deepEqual(await panel.locator('tbody tr td:first-child').allInnerTexts(), ['Homework', 'No category']);

  // --- not shown on other Classroom pages ---
  await page.goto('https://classroom.google.com/u/0/h');
  await page.waitForTimeout(1500);
  assert.equal(await panel.isVisible(), false);
  assert.equal(await page.locator('[data-grade-calc-badge]').count(), 0);

  await ctx.close();
  console.log('e2e: all checks passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
