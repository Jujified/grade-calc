// Captures the real extension on a demo page, then composes store images.
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const ext = path.resolve(__dirname, '../..'), out = path.resolve(__dirname, '../images'), raw = path.join(os.tmpdir(), 'gc-raw-' + Date.now());
fs.mkdirSync(raw, { recursive: true });
(async () => {
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'gc-')), {
    channel: 'chromium', headless: true, viewport: { width: 1080, height: 660 }, deviceScaleFactor: 2, colorScheme: 'light',
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  await ctx.route('https://classroom.google.com/**', (r) => r.fulfill({ contentType: 'text/html', body: fs.readFileSync(path.join(__dirname, 'demo.html'), 'utf8') }));
  const page = await ctx.newPage();
  await page.goto('https://classroom.google.com/c/DEMO/sp/1/all');
  const panel = page.locator('[data-grade-calc] .panel'), badge = page.locator('[data-grade-calc-badge]');
  await panel.waitFor();
  const snap = (n) => page.screenshot({ path: path.join(raw, n + '.png') });
  await panel.getByRole('button', { name: 'Weighted by category' }).click();
  for (const [n, w] of [['Labs', '25'], ['Homework', '15'], ['Participation', '10']]) await panel.getByLabel('Weight for ' + n).fill(w);
  await panel.getByRole('button', { name: '+ Add category' }).click();
  await panel.getByLabel('New category name').fill('Tests');
  for (const t of ['Final Exam', 'Unit 2 Test', 'Unit 1 Test']) await panel.locator('.check', { hasText: t }).click();
  await page.mouse.move(300, 640);
  await panel.locator('.body').evaluate((b) => { b.scrollTop = b.querySelector('.addform').offsetTop - b.offsetTop - 12; });
  await snap('custom');
  await panel.getByRole('button', { name: 'Add category', exact: true }).click();
  await panel.getByLabel('Weight for Tests').fill('50');
  await panel.getByLabel('Weight for Tests').blur();
  await snap('weighted');
  await badge.getByRole('button', { name: 'Hide details' }).click();
  await snap('badge');
  await badge.getByRole('button', { name: 'View details' }).click();
  await panel.locator('summary').click();
  await panel.getByLabel('Score for Final Exam').fill('85');
  await panel.getByLabel('Points possible for Final Exam').fill('100');
  await panel.getByLabel('Points possible for Final Exam').blur();
  await panel.locator('.body').evaluate((b) => { b.scrollTop = b.querySelector('details').offsetTop - b.offsetTop - 8; });
  await snap('whatif');
  await ctx.close();

  // ---- compose ----
  const b = await chromium.launch();
  const img = (n) => 'data:image/png;base64,' + fs.readFileSync(path.join(raw, n + '.png')).toString('base64');
  const base = `*{box-sizing:border-box}body{margin:0;font-family:Inter,Arial,sans-serif;color:#0b1f44;overflow:hidden}`;
  const icon = (s) => `<div style="width:${s}px;height:${s}px;border-radius:${s * 0.24}px;background:#1a73e8;color:#fff;font:700 ${s * 0.56}px Inter,Arial;display:flex;align-items:center;justify-content:center;flex:none">%</div>`;
  async function render(name, w, h, html, opts = {}) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    await p.setContent(`<style>${base}</style>${html}`);
    await p.screenshot({ path: path.join(out, name), omitBackground: !!opts.alpha });
    await p.close();
  }
  const shots = [
    ['1-grade-in-header', 'badge', 'See your grade, even when it’s hidden', 'Your calculated grade appears right next to your name on the “Your work” page.'],
    ['2-weighted-categories', 'weighted', 'Weighted categories, done right', 'Enter the weights from your syllabus once. They’re remembered for each class.'],
    ['3-what-if', 'whatif', 'What do I need on the final?', 'Type a score into any assignment and watch your grade update instantly.'],
    ['4-custom-categories', 'custom', 'Sort uncategorized work', 'Create your own categories for tests or projects your teacher left unsorted.'],
  ];
  for (const [file, src, title, sub] of shots) {
    await render(file + '.png', 1280, 800, `
      <div style="width:1280px;height:800px;background:linear-gradient(160deg,#eaf1ff 0%,#f7f9ff 55%,#e4edff 100%);padding:44px 0 0;text-align:center">
        <div style="font-size:44px;font-weight:700;letter-spacing:-1px">${title}</div>
        <div style="font-size:20px;color:#44506a;margin-top:10px">${sub}</div>
        <div style="width:1080px;margin:34px auto 0;border-radius:14px 14px 0 0;overflow:hidden;box-shadow:0 18px 50px rgba(26,60,140,.22);border:1px solid #d5ddef;background:#fff">
          <div style="height:34px;background:#eef1f6;display:flex;align-items:center;gap:7px;padding-left:14px">
            <i style="width:11px;height:11px;border-radius:50%;background:#f28b82"></i><i style="width:11px;height:11px;border-radius:50%;background:#fdd663"></i><i style="width:11px;height:11px;border-radius:50%;background:#81c995"></i></div>
          <img src="${img(src)}" style="width:1080px;display:block">
        </div></div>`);
  }
  const card = (scale) => `<div style="background:#fff;border-radius:${16 * scale}px;padding:${18 * scale}px ${24 * scale}px;box-shadow:0 ${10 * scale}px ${30 * scale}px rgba(0,20,80,.25);text-align:right;flex:none">
      <div style="font-size:${13 * scale}px;color:#5f6368">Semester 1 (calculated)</div>
      <div style="font-size:${40 * scale}px;font-weight:600;color:#1a73e8;line-height:1.2">94.22%</div></div>`;
  await render('small-promo-440x280.png', 440, 280, `
    <div style="width:440px;height:280px;background:linear-gradient(140deg,#1a73e8,#0b47a8);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
      ${card(1)}
      <div style="font-size:25px;font-weight:700;letter-spacing:-.4px">Classroom Grade Calculator</div></div>`);
  await render('marquee-promo-1400x560.png', 1400, 560, `
    <div style="width:1400px;height:560px;background:linear-gradient(140deg,#1a73e8,#0b47a8);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 130px">
      <div><div style="font-size:64px;font-weight:700;letter-spacing:-1.5px;line-height:1.08">Classroom<br>Grade Calculator</div>
        <div style="font-size:27px;opacity:.9;margin-top:22px">Know your grade, even when it’s hidden.</div></div>
      ${card(2.3)}</div>`);
  await render('store-icon-128.png', 128, 128, `<div style="width:128px;height:128px;display:flex;align-items:center;justify-content:center">${icon(96)}</div>`, { alpha: true });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
