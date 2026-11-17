// Panel UI: scans the page, computes the grade and renders a floating panel.
(() => {
  'use strict';
  if (globalThis.__gradeCalcLoaded) return;
  globalThis.__gradeCalcLoaded = true;

  const { compute, round2, ALL_PERIODS, inPeriod } = globalThis.GradeCalc.grade;
  const { parsePage } = globalThis.GradeCalc.parser;

  const WORK_PAGE_RE = /\/c\/[^/]+\/sp\//; // a student's "Your work" page
  const DEFAULTS = { mode: 'points', weights: {}, period: null, whatIfs: {}, collapsed: false };

  // ---------- storage ----------
  const memory = {};
  const hasStore = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local;
  async function load(key) {
    let saved = memory[key];
    if (hasStore) {
      try {
        saved = (await chrome.storage.local.get(key))[key];
      } catch (e) { /* extension reloaded; fall back to memory */ }
    }
    return Object.assign({}, DEFAULTS, saved, {
      weights: Object.assign({}, saved && saved.weights),
      whatIfs: Object.assign({}, saved && saved.whatIfs),
    });
  }
  function save() {
    if (!courseKey) return;
    memory[courseKey] = settings;
    if (hasStore) {
      try {
        chrome.storage.local.set({ [courseKey]: settings });
      } catch (e) { /* ignore */ }
    }
  }

  // ---------- state ----------
  let courseKey = null;
  let settings = Object.assign({}, DEFAULTS);
  let parsed = { items: [], periods: [], categories: [], unparsed: 0 };
  let lastSignature = null;
  let forced = false;
  let lastUrl = null;
  let refs = null;
  let host = null;
  let shadow = null;
  let badge = null; // inline grade shown in the page header, where Classroom's own grade would be
  let badgeRefs = null;

  function getCourseKey() {
    const m = /\/c\/([^/?#]+)/.exec(location.pathname);
    return 'course:' + (m ? m[1] : location.pathname);
  }

  function activePeriod() {
    if (!parsed.periods.length) return ALL_PERIODS;
    if (settings.period === ALL_PERIODS || parsed.periods.includes(settings.period)) return settings.period;
    return parsed.periods[0]; // newest work is listed first
  }

  function result() {
    return compute(parsed.items, Object.assign({}, settings, { period: activePeriod() }));
  }

  // ---------- helpers ----------
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const fmt = (n) => String(round2(n));
  const fmtPct = (n) => (n == null ? '—' : round2(n).toFixed(2) + '%');
  function readNum(input) {
    const v = input.value.trim().replace(',', '.');
    if (v === '' || !/^\d*\.?\d+$|^\d+\.$/.test(v)) return null;
    const n = parseFloat(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel { position: fixed; top: 76px; right: 16px; z-index: 2147483000; width: 360px; max-height: calc(100vh - 96px);
      display: flex; flex-direction: column; background: #fff; color: #1f1f1f; border: 1px solid #dadce0; border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,.18); font: 13px/1.4 "Google Sans", Roboto, Arial, sans-serif; }
    .panel.collapsed { width: auto; }
    .panel.hidden { display: none; }
    .panel.collapsed .body { display: none; }
    .head { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 16px; cursor: pointer; user-select: none; }
    .head .label { font-size: 11px; color: #5f6368; text-transform: uppercase; letter-spacing: .5px; }
    .head .pct { font-size: 22px; font-weight: 500; color: #1a73e8; font-variant-numeric: tabular-nums; }
    .head .sub { font-size: 12px; color: #5f6368; }
    .head .grow { flex: 1; min-width: 0; }
    .collapsed .head .sub, .collapsed .head .label { display: none; }
    .tag { font-size: 10px; background: #fef7e0; color: #b06000; border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: middle; }
    button { font: inherit; color: inherit; cursor: pointer; }
    .icon-btn { border: 0; background: none; width: 28px; height: 28px; border-radius: 50%; font-size: 16px; color: #5f6368; }
    .icon-btn:hover { background: #f1f3f4; }
    .body { overflow-y: auto; padding: 0 16px 14px; border-top: 1px solid #e8eaed; }
    .row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
    .row > span { color: #5f6368; width: 64px; flex: none; }
    select, input { font: inherit; color: inherit; background: #fff; border: 1px solid #dadce0; border-radius: 6px; padding: 4px 6px; }
    select { flex: 1; min-width: 0; }
    input { width: 56px; text-align: right; font-variant-numeric: tabular-nums; }
    input:focus, select:focus, button:focus-visible { outline: 2px solid #1a73e8; outline-offset: 0; }
    .seg { display: flex; flex: 1; border: 1px solid #dadce0; border-radius: 6px; overflow: hidden; }
    .seg button { flex: 1; border: 0; background: #fff; padding: 5px 4px; }
    .seg button + button { border-left: 1px solid #dadce0; }
    .seg button[aria-pressed="true"] { background: #e8f0fe; color: #1967d2; font-weight: 500; }
    h3 { font-size: 11px; font-weight: 500; color: #5f6368; text-transform: uppercase; letter-spacing: .5px; margin: 16px 0 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { font-weight: 400; font-size: 11px; color: #5f6368; text-align: right; padding: 2px 0 2px 8px; }
    td { padding: 5px 0 5px 8px; text-align: right; border-top: 1px solid #f1f3f4; font-variant-numeric: tabular-nums; white-space: nowrap; }
    th:first-child, td:first-child { text-align: left; padding-left: 0; white-space: normal; overflow-wrap: anywhere; }
    td.muted, .muted { color: #80868b; }
    .warn { margin-top: 8px; padding: 6px 8px; background: #fef7e0; color: #7a4a00; border-radius: 6px; font-size: 12px; }
    details { margin-top: 14px; }
    summary { cursor: pointer; font-size: 11px; font-weight: 500; color: #5f6368; text-transform: uppercase; letter-spacing: .5px; }
    .hint { font-size: 11px; color: #80868b; margin: 6px 0 2px; }
    .item { display: flex; align-items: center; gap: 4px; padding: 5px 0; border-top: 1px solid #f1f3f4; }
    .item .t { flex: 1; min-width: 0; }
    .item .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item .cat { font-size: 11px; color: #80868b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .item input { width: 50px; }
    .item.whatif input { border-color: #f9ab00; background: #fffbf0; }
    .item .icon-btn { visibility: hidden; width: 22px; height: 22px; font-size: 12px; }
    .item.whatif .icon-btn { visibility: visible; }
    .link { border: 0; background: none; color: #1a73e8; padding: 0; margin-top: 10px; font-size: 12px; }
    @media (prefers-color-scheme: dark) {
      .panel, select, input, .seg button { background: #202124; color: #e8eaed; }
      .panel, select, input, .seg, .seg button + button, .body { border-color: #5f6368; }
      .head .pct, .link { color: #8ab4f8; }
      .seg button[aria-pressed="true"] { background: #394457; color: #d2e3fc; }
      td, .item { border-top-color: #3c4043; }
      .icon-btn:hover { background: #3c4043; }
      .item.whatif input { background: #3a2f10; }
      .head .label, .head .sub, .row > span, h3, th, summary { color: #bdc1c6; }
    }
  `;

  const BADGE_CSS = `
    :host { all: initial; display: block; margin-left: auto; padding-left: 16px; flex: none; }
    .badge { text-align: right; font-family: "Google Sans", Roboto, Arial, sans-serif; white-space: nowrap; }
    .label { font-size: 14px; color: #5f6368; }
    .pct { font-size: 28px; line-height: 40px; color: #1a73e8; font-variant-numeric: tabular-nums; }
    .tag { font-size: 10px; background: #fef7e0; color: #b06000; border-radius: 4px; padding: 1px 5px; margin-left: 6px; vertical-align: middle; }
    button { font: 500 14px "Google Sans", Roboto, Arial, sans-serif; color: #1a73e8; background: none; border: 0; padding: 4px 0; cursor: pointer; }
    button:hover { text-decoration: underline; }
    button:focus-visible { outline: 2px solid #1a73e8; outline-offset: 2px; }
    @media (prefers-color-scheme: dark) { .label { color: #bdc1c6; } .pct, button { color: #8ab4f8; } }
  `;

  function addStyles(root, css) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
    } catch (e) {
      const st = document.createElement('style');
      st.textContent = css;
      root.append(st);
    }
  }

  // The header row with the student's avatar and name. Classroom puts the
  // overall grade at its right edge when the teacher allows it.
  function findSlot() {
    for (const h2 of document.querySelectorAll('h2')) {
      if (!h2.getClientRects().length) continue;
      let row = h2.parentElement;
      for (let i = 0; i < 4 && row && row !== document.body; i++, row = row.parentElement) {
        if (!row.querySelector('img')) continue;
        const area = (row.parentElement && row.parentElement.parentElement) || row;
        if (/\d\s*%/.test(area.textContent)) return null; // Classroom is showing its own grade
        return row;
      }
    }
    return null;
  }

  // Returns true when the badge was added, moved or removed.
  function ensureBadge() {
    const slot = findSlot();
    if (!slot) {
      if (!badge) return false;
      badge.remove();
      badge = badgeRefs = null;
      return true;
    }
    if (badge && badge.isConnected && badge.parentElement === slot) return false;
    if (badge) badge.remove();
    badge = document.createElement('div');
    badge.setAttribute('data-grade-calc-badge', '');
    const root = badge.attachShadow({ mode: 'open' });
    addStyles(root, BADGE_CSS);
    badgeRefs = {
      label: h('span', {}),
      tag: h('span', { class: 'tag' }, 'what-if'),
      pct: h('div', { class: 'pct' }),
      link: h('button', { type: 'button', onclick: () => setCollapsed(!settings.collapsed) }),
    };
    root.append(h('div', { class: 'badge' },
      h('div', { class: 'label' }, badgeRefs.label, badgeRefs.tag), badgeRefs.pct, badgeRefs.link));
    slot.append(badge);
    return true;
  }

  function setCollapsed(value) {
    settings.collapsed = value;
    save();
    applyCollapsed();
  }

  function applyCollapsed() {
    if (!refs) return;
    refs.panel.classList.toggle('collapsed', settings.collapsed);
    refs.panel.classList.toggle('hidden', settings.collapsed && !!badge);
    if (badgeRefs) {
      badgeRefs.link.textContent = settings.collapsed ? 'View details' : 'Hide details';
      badgeRefs.link.setAttribute('aria-expanded', String(!settings.collapsed));
    }
    position();
  }

  // With a badge, the panel drops down beneath it (and stays on screen when
  // the header scrolls away); otherwise it floats in the top-right corner.
  function position() {
    if (!refs) return;
    const st = refs.panel.style;
    if (!badge || !badge.isConnected) {
      st.top = st.right = st.maxHeight = '';
      return;
    }
    const r = badge.getBoundingClientRect();
    const top = Math.max(76, Math.round(r.bottom + 8));
    st.top = top + 'px';
    st.right = Math.max(16, Math.round(window.innerWidth - r.right)) + 'px';
    st.maxHeight = 'calc(100vh - ' + (top + 16) + 'px)';
  }

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement('div');
    host.setAttribute('data-grade-calc', '');
    shadow = host.attachShadow({ mode: 'open' });
    addStyles(shadow, CSS);
    document.documentElement.append(host);
    refs = null;
  }

  // ---------- render ----------
  function build() {
    ensureHost();
    const period = activePeriod();
    const items = parsed.items.filter((i) => inPeriod(i, period));
    const weighted = settings.mode === 'weighted';
    refs = { cats: new Map(), items: new Map() };

    refs.pct = h('div', { class: 'pct' });
    refs.sub = h('div', { class: 'sub' });
    refs.tag = h('span', { class: 'tag' }, 'what-if');
    const head = h('div', {
      class: 'head',
      title: 'Click to collapse / expand',
      onclick: () => setCollapsed(!settings.collapsed),
    },
      h('div', { class: 'grow' }, h('div', { class: 'label' }, 'Calculated grade', refs.tag), refs.sub),
      refs.pct
    );

    const body = h('div', { class: 'body' });

    if (parsed.periods.length) {
      const sel = h('select', {
        'aria-label': 'Grading period',
        onchange: () => {
          settings.period = sel.value;
          save();
          build();
        },
      },
        parsed.periods.map((p) => h('option', { value: p, selected: p === period }, p)),
        parsed.periods.length > 1 && h('option', { value: ALL_PERIODS, selected: period === ALL_PERIODS }, 'All periods')
      );
      body.append(h('div', { class: 'row' }, h('span', {}, 'Period'), sel));
    }

    const modeBtn = (mode, label) => h('button', {
      type: 'button',
      'aria-pressed': String(settings.mode === mode),
      onclick: () => {
        settings.mode = mode;
        save();
        build();
      },
    }, label);
    body.append(h('div', { class: 'row' }, h('span', {}, 'Grading'),
      h('div', { class: 'seg' }, modeBtn('points', 'Total points'), modeBtn('weighted', 'Weighted by category'))));

    // Categories
    const res = result();
    const tbody = h('tbody');
    for (const c of res.categories) {
      const r = { score: h('td'), pct: h('td') };
      let weightCell = null;
      if (weighted) {
        if (c.name === null) weightCell = h('td', { class: 'muted' }, '—');
        else {
          r.weight = h('input', {
            type: 'text', inputmode: 'decimal', 'aria-label': 'Weight for ' + c.name,
            value: c.weight == null ? '' : fmt(c.weight), placeholder: '%',
            oninput: () => {
              const n = readNum(r.weight);
              if (n == null) delete settings.weights[c.name];
              else settings.weights[c.name] = n;
              save();
              refresh();
            },
          });
          weightCell = h('td', {}, r.weight, ' %');
        }
      }
      refs.cats.set(c.name, r);
      tbody.append(h('tr', {}, h('td', {}, c.name === null ? 'No category' : c.name), r.score, r.pct, weightCell));
    }
    body.append(
      h('h3', {}, 'Categories'),
      h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'Points'), h('th', {}, 'Score'), weighted && h('th', {}, 'Weight'))),
        tbody)
    );
    refs.warnings = h('div');
    body.append(refs.warnings);

    // Assignments with what-if inputs
    const list = h('div');
    for (const item of items) {
      const w = settings.whatIfs[item.id] || {};
      const r = {};
      const onInput = () => {
        const e = readNum(r.earned);
        const p = readNum(r.possible);
        const next = {};
        if (e != null && e !== item.earned) next.earned = e;
        if (p != null && p !== item.possible) next.possible = p;
        if (Object.keys(next).length) settings.whatIfs[item.id] = next;
        else delete settings.whatIfs[item.id];
        save();
        refresh();
      };
      const field = (key, label) => h('input', {
        type: 'text', inputmode: 'decimal', 'aria-label': label + ' for ' + item.title,
        value: w[key] != null ? fmt(w[key]) : item[key] != null ? fmt(item[key]) : '',
        placeholder: item[key] != null ? fmt(item[key]) : '–',
        oninput: onInput,
      });
      r.earned = field('earned', 'Score');
      r.possible = field('possible', 'Points possible');
      r.row = h('div', { class: 'item' },
        h('div', { class: 't' },
          h('div', { class: 'name', title: item.title }, item.title),
          h('div', { class: 'cat' }, [item.category || 'No category', item.graded ? null : item.status || 'Not graded'].filter(Boolean).join(' · '))),
        r.earned, '/', r.possible,
        h('button', {
          type: 'button', class: 'icon-btn', title: 'Remove what-if', 'aria-label': 'Remove what-if for ' + item.title,
          onclick: () => {
            delete settings.whatIfs[item.id];
            save();
            r.earned.value = item.earned != null ? fmt(item.earned) : '';
            r.possible.value = item.possible != null ? fmt(item.possible) : '';
            refresh();
          },
        }, '✕'));
      refs.items.set(item.id, r);
      list.append(r.row);
    }
    const graded = items.filter((i) => i.graded).length;
    refs.details = h('details', { open: !!settings.detailsOpen, ontoggle: () => {
      settings.detailsOpen = refs.details.open;
      save();
    } },
      h('summary', {}, 'Assignments (' + graded + ' graded of ' + items.length + ')'),
      h('div', { class: 'hint' }, 'Type a score into any assignment to see how it would change your grade. Ungraded work is not counted until you do.'),
      list,
      h('button', { type: 'button', class: 'link', onclick: () => {
        settings.whatIfs = {};
        save();
        build();
      } }, 'Clear all what-if scores'));
    body.append(refs.details);
    body.append(h('div', { class: 'hint' },
      'Reads only what is on this page: keep the task filter on "All" and scroll down so every assignment is loaded.' +
      (parsed.unparsed ? ' ' + parsed.unparsed + ' row(s) could not be read.' : '')));

    refs.panel = h('div', { class: 'panel' + (settings.collapsed ? ' collapsed' : ''), role: 'region', 'aria-label': 'Grade calculator' }, head, body);
    shadow.querySelectorAll('.panel').forEach((p) => p.remove());
    shadow.append(refs.panel);
    applyCollapsed();
    refresh();
  }

  function refresh() {
    if (!refs) return;
    const res = result();
    refs.pct.textContent = fmtPct(res.percent);
    refs.sub.textContent = !parsed.items.length
      ? 'No assignments found on this page yet'
      : res.mode === 'points'
        ? fmt(res.totalEarned) + ' / ' + fmt(res.totalPossible) + ' points'
        : 'Weighted by category';
    refs.tag.style.display = res.usedWhatIf ? '' : 'none';
    if (badgeRefs) {
      const period = activePeriod();
      badgeRefs.label.textContent = period === ALL_PERIODS ? 'Calculated grade' : period + ' (calculated)';
      badgeRefs.pct.textContent = fmtPct(res.percent);
      badgeRefs.tag.style.display = res.usedWhatIf ? '' : 'none';
    }
    for (const c of res.categories) {
      const r = refs.cats.get(c.name);
      if (!r) continue;
      r.score.textContent = c.counted ? fmt(c.earned) + ' / ' + fmt(c.possible) : '—';
      r.pct.textContent = fmtPct(c.percent);
    }
    refs.warnings.replaceChildren(...res.warnings.map((w) => h('div', { class: 'warn' }, w)));
    for (const [id, r] of refs.items) r.row.classList.toggle('whatif', !!settings.whatIfs[id]);
  }

  // ---------- scanning ----------
  let timer = null;
  let busy = false;
  function schedule(delay) {
    clearTimeout(timer);
    timer = setTimeout(tick, delay == null ? 600 : delay);
  }

  async function tick() {
    if (busy) return schedule();
    busy = true;
    try {
      if (location.href !== lastUrl) {
        if (lastUrl !== null && getCourseKey() !== courseKey) forced = false;
        lastUrl = location.href;
      }
      const active = forced || WORK_PAGE_RE.test(location.pathname);
      if (!active) {
        if (host) host.style.display = 'none';
        if (badge) {
          badge.remove();
          badge = badgeRefs = null;
        }
        lastSignature = null;
        return;
      }
      const key = getCourseKey();
      if (key !== courseKey) {
        settings = await load(key);
        courseKey = key;
        lastSignature = null;
      }
      const next = parsePage(document);
      const sig = JSON.stringify(next);
      const badgeChanged = ensureBadge();
      if (sig !== lastSignature || !host || !host.isConnected || badgeChanged) {
        parsed = next;
        lastSignature = sig;
        build();
      }
      host.style.display = '';
      position();
    } catch (e) {
      console.error('[Grade Calculator]', e);
    } finally {
      busy = false;
    }
  }

  new MutationObserver(() => schedule()).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true,
  });
  window.addEventListener('popstate', () => schedule(100));
  window.addEventListener('scroll', position, { capture: true, passive: true });
  window.addEventListener('resize', position, { passive: true });

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'grade-calc-toggle') return;
      const shown = host && host.isConnected && host.style.display !== 'none';
      if (shown && WORK_PAGE_RE.test(location.pathname)) {
        setCollapsed(!settings.collapsed);
      } else {
        forced = !shown;
        schedule(0);
      }
    });
  }

  schedule(0);
})();
