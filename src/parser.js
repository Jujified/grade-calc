// Reads the assignment rows off the Classroom "Your work" page.
//
// Classroom's class names are obfuscated and change, so nothing here depends on
// them. Rows are found by their visible text: every row has a line like
// "Due Nov 18, 1:10 PM • Semester 1 • Assessments" (or "No due date • ...").
(function (root) {
  'use strict';

  const MONTH = '(?:jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\\.?';
  const DAY = '(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*';
  const META_RE = new RegExp(
    '^(?:no due date\\b|due\\s+(?:today|tomorrow|yesterday|' + DAY + '\\b|' +
      MONTH + '\\s+\\d{1,2}\\b|\\d{1,2}\\s+' + MONTH + '|\\d{1,2}:\\d{2}))',
    'i'
  );
  const BULLET_RE = /\s*[•·∙‧●・]\s*/;
  const NUM = '(\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:[.,]\\d+)?)';
  const SCORE_RE = new RegExp('^' + NUM + '\\s*/\\s*' + NUM + '(?:\\s*\\(.*\\))?$');
  const SPOKEN_SCORE_RE = /(\d[\d.,]*)\s+points?\s+out\s+of\s+(?:a\s+)?possible\s+(\d[\d.,]*)/i;
  const PERIOD_NAME_RE =
    /^(?:(?:semester|quarter|trimester|term|(?:grading|marking) period)\s*\d+|[sqt]\d|\d(?:st|nd|rd|th)\s+(?:semester|quarter|trimester|term))$/i;
  const STATUS_WORDS = [
    'Excused', 'Missing', 'Done late', 'Turned in late', 'Not turned in',
    'Turned in', 'Assigned', 'Returned', 'Graded', 'Done',
  ];
  const SINGLE_ROW_MAX_HEIGHT = 140;

  function clean(s) {
    return (s || '').replace(/\s+/g, ' ').trim();
  }

  function parseNumber(s) {
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return parseFloat(s.replace(/,/g, ''));
    return parseFloat(s.replace(',', '.'));
  }

  function parseScore(text) {
    const m = SCORE_RE.exec(clean(text));
    if (!m) return null;
    const earned = parseNumber(m[1]);
    const possible = parseNumber(m[2]);
    if (!Number.isFinite(earned) || !Number.isFinite(possible)) return null;
    return { earned, possible };
  }

  // Splits the "Due ... • Period • Category" line into its parts after the due date.
  function splitMeta(fullText, nodeTexts) {
    let parts;
    if (BULLET_RE.test(fullText)) parts = fullText.split(BULLET_RE);
    else parts = nodeTexts; // separators drawn with CSS: one text node per part
    parts = parts.map(clean).filter(Boolean);
    return { due: parts[0] || '', rest: parts.slice(1) };
  }

  function parsePage(doc) {
    const win = doc.defaultView;
    const visCache = new Map();
    const styleCache = new Map();

    function style(el) {
      let s = styleCache.get(el);
      if (!s) {
        const cs = win.getComputedStyle(el);
        s = { size: parseFloat(cs.fontSize) || 0, icon: /icon|symbols/i.test(cs.fontFamily) };
        styleCache.set(el, s);
      }
      return s;
    }

    // Classroom keeps previously visited views in the DOM but hidden, so only
    // text that is actually rendered may be used.
    function visible(el) {
      let v = visCache.get(el);
      if (v === undefined) {
        const r = el.getBoundingClientRect();
        v = el.getClientRects().length > 0 && r.width > 1 && r.height > 1 &&
          win.getComputedStyle(el).visibility !== 'hidden';
        visCache.set(el, v);
      }
      return v;
    }

    function textNodes(rootEl) {
      const out = [];
      const walker = doc.createTreeWalker(rootEl, 4 /* SHOW_TEXT */);
      let n;
      while ((n = walker.nextNode())) {
        const p = n.parentElement;
        if (!p || !clean(n.nodeValue)) continue;
        if (p.closest('script,style,noscript,template,[data-grade-calc]')) continue;
        if (!visible(p) || style(p).icon) continue;
        out.push(n);
      }
      return out;
    }

    if (!doc.body) return { items: [], periods: [], categories: [], unparsed: 0 };

    // 1. Find every "due" line.
    let markers = textNodes(doc.body).filter((n) => {
      const p = n.parentElement;
      const first = [...p.childNodes].find((c) => c.nodeType === 3 && clean(c.nodeValue));
      const text = first === n ? clean(p.textContent) : clean(n.nodeValue);
      return META_RE.test(text) || META_RE.test(clean(n.nodeValue));
    });
    // An assignment *title* can also start with "Due ..." (e.g. "Due Nov 5 essay"),
    // and other parts of the page may mention due dates. Real due lines all share
    // one font size, so keep the most common size (the smaller one on a tie).
    if (markers.length) {
      const counts = new Map();
      for (const n of markers) {
        const size = Math.round(style(n.parentElement).size * 2) / 2;
        counts.set(size, (counts.get(size) || 0) + 1);
      }
      const [common] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
      markers = markers.filter((n) => Math.abs(style(n.parentElement).size - common) <= 0.5);
    }

    // 2. Each due line belongs to one row: the largest ancestor holding only it.
    const markerSet = new Set(markers);
    function markersIn(el) {
      let c = 0;
      for (const m of markerSet) if (el.contains(m)) c++;
      return c;
    }
    const seenRows = new Set();
    const rows = markers.map((m) => {
      // Classroom marks each row with the assignment's id; use that element when present.
      const tagged = m.parentElement.closest('[data-stream-item-id]');
      if (tagged && tagged !== doc.body) return { marker: m, el: tagged };
      let el = m.parentElement;
      while (el.parentElement && el.parentElement !== doc.body.parentElement) {
        const up = el.parentElement;
        if (up === doc.body || markersIn(up) !== 1) break;
        if (markers.length === 1 && up.getBoundingClientRect().height > SINGLE_ROW_MAX_HEIGHT) break;
        el = up;
      }
      return { marker: m, el };
    }).filter((r) => {
      // An expanded row can repeat its due date; one row is one assignment.
      if (seenRows.has(r.el)) return false;
      seenRows.add(r.el);
      return true;
    });

    // 3. Pull title, meta line and score out of each row.
    const raw = [];
    let unparsed = 0;
    for (const { marker, el } of rows) {
      const nodes = textNodes(el);
      const idx = nodes.indexOf(marker);
      const before = nodes.slice(0, idx);
      let titleNode = null;
      for (const n of before) {
        if (!titleNode || style(n.parentElement).size > style(titleNode.parentElement).size) {
          titleNode = n;
        }
      }
      if (!titleNode) {
        unparsed++;
        continue;
      }

      // Meta line element: grow from the marker without swallowing title or score.
      let metaEl = marker.parentElement;
      while (metaEl !== el) {
        const up = metaEl.parentElement;
        if (!up || up.contains(titleNode)) break;
        if (textNodes(up).some((n) => parseScore(n.nodeValue))) break;
        metaEl = up;
        if (up === el) break;
      }
      if (metaEl.contains(titleNode)) metaEl = marker.parentElement;
      const metaNodes = nodes.filter((n) => metaEl.contains(n));
      const meta = splitMeta(clean(metaEl.textContent), metaNodes.map((n) => n.nodeValue));
      // Classroom lays the line out as three boxes: due date, grading period, category.
      // A filled second box with an empty third is a period with no category.
      const boxes = metaEl.children;
      const periodOnly = meta.rest.length === 1 && boxes.length === 3 && boxes[0].contains(marker) &&
        clean(boxes[1].textContent) === meta.rest[0] && !clean(boxes[2].textContent);

      const others = nodes.filter((n) => n !== titleNode && !metaEl.contains(n));
      // The score can be one text node ("9/10") or split across elements
      // (Classroom renders <span>9.5</span><span>/10</span>), so also try the
      // combined text of the nearest few ancestors.
      let score = null;
      for (const n of others) {
        score = parseScore(n.nodeValue);
        let up = n.parentElement;
        for (let depth = 0; !score && depth < 3 && up && up !== el; depth++, up = up.parentElement) {
          if (up.contains(titleNode) || up.contains(marker)) break;
          score = parseScore(up.textContent);
        }
        if (score) break;
      }
      // Fallback: the screen-reader label "9.5 points out of possible 10".
      if (!score) {
        const m = SPOKEN_SCORE_RE.exec(clean(el.textContent));
        if (m) score = parseScore(m[1].replace(/[.,]$/, '') + '/' + m[2].replace(/[.,]$/, ''));
      }
      const otherText = others.map((n) => clean(n.nodeValue));
      const status =
        STATUS_WORDS.find((w) => otherText.some((t) => t.toLowerCase() === w.toLowerCase())) || '';

      // Classroom tags each row with a stable assignment id; prefer it for what-ifs.
      const idEl = el.closest('[data-stream-item-id]') || el.querySelector('[data-stream-item-id]');
      const streamId = idEl ? idEl.getAttribute('data-stream-item-id') : null;
      raw.push({ title: clean(titleNode.nodeValue), due: meta.due, rest: meta.rest, score, status, streamId, periodOnly });
    }

    // Safety net: assignment rows Classroom tagged but whose due line was not
    // recognised must not vanish silently, so report them as unread.
    const listParents = new Set(rows.map((r) => r.el.parentElement));
    for (const parent of listParents) {
      if (!parent) continue;
      for (const child of parent.children) {
        if (child.hasAttribute('data-stream-item-id') && !seenRows.has(child) && visible(child)) unparsed++;
      }
    }

    // 4. Decide which meta parts are grading periods and which are categories.
    //    Rows with two parts are always "period • category".
    const knownPeriods = new Set(raw.filter((r) => r.rest.length >= 2 || r.periodOnly).map((r) => r.rest[0]));
    const seenIds = new Map();
    const items = raw.map((r) => {
      let period = null;
      let category = null;
      if (r.rest.length >= 2) {
        period = r.rest[0];
        category = r.rest[r.rest.length - 1];
      } else if (r.rest.length === 1) {
        const s = r.rest[0];
        if (knownPeriods.has(s) || (knownPeriods.size === 0 && PERIOD_NAME_RE.test(s))) period = s;
        else category = s;
      }
      const excused = r.status === 'Excused';
      const graded = !!r.score && !excused;
      const base = r.streamId ? 'id:' + r.streamId : r.title + '¦' + r.due;
      const n = (seenIds.get(base) || 0) + 1;
      seenIds.set(base, n);
      return {
        id: n > 1 ? base + '#' + n : base,
        title: r.title,
        due: r.due,
        period,
        category,
        graded,
        earned: graded ? r.score.earned : null,
        possible: r.score && !excused ? r.score.possible : null,
        status: r.status,
      };
    });

    const uniq = (arr) => [...new Set(arr.filter(Boolean))];
    return {
      items,
      periods: uniq(items.map((i) => i.period)),
      categories: uniq(items.map((i) => i.category)),
      unparsed,
    };
  }

  const api = { parsePage, parseScore, splitMeta, META_RE };
  root.GradeCalc = Object.assign(root.GradeCalc || {}, { parser: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
