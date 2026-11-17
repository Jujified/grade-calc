// Pure grade math. No DOM access, so it can be unit-tested in Node.
(function (root) {
  'use strict';

  const ALL_PERIODS = '__all__';

  function isNum(n) {
    return typeof n === 'number' && Number.isFinite(n);
  }

  // The score an item contributes, after applying any what-if override.
  // Returns null when the item should not count (ungraded and no complete what-if).
  function effectiveScore(item, whatIfs) {
    const w = (whatIfs && whatIfs[item.id]) || {};
    const earned = isNum(w.earned) ? w.earned : item.graded ? item.earned : null;
    const possible = isNum(w.possible) ? w.possible : item.possible;
    if (!isNum(earned) || !isNum(possible) || earned < 0 || possible < 0) return null;
    const whatIf =
      !item.graded || earned !== item.earned || possible !== item.possible;
    return { earned, possible, whatIf };
  }

  function inPeriod(item, period) {
    if (!period || period === ALL_PERIODS) return true;
    return !item.period || item.period === period;
  }

  // settings: { mode: 'points' | 'weighted', weights: {category: number}, period, whatIfs,
  //             categories: extra category names to list even when empty }
  function compute(items, settings) {
    const mode = settings.mode === 'weighted' ? 'weighted' : 'points';
    const weights = settings.weights || {};
    const cats = new Map(); // category name (or null) -> totals
    let usedWhatIf = false;

    for (const item of items) {
      if (!inPeriod(item, settings.period)) continue;
      const key = item.category || null;
      if (!cats.has(key)) {
        cats.set(key, { name: key, earned: 0, possible: 0, count: 0, counted: 0 });
      }
      const cat = cats.get(key);
      cat.count++;
      const score = effectiveScore(item, settings.whatIfs);
      if (!score) continue;
      cat.earned += score.earned;
      cat.possible += score.possible;
      cat.counted++;
      if (score.whatIf) usedWhatIf = true;
    }

    // Categories the student created themselves show up even while empty.
    for (const name of settings.categories || []) {
      if (name && !cats.has(name)) cats.set(name, { name, earned: 0, possible: 0, count: 0, counted: 0 });
    }
    const loose0 = cats.get(null);
    if (loose0) {
      cats.delete(null);
      cats.set(null, loose0); // keep "No category" last
    }

    const categories = [...cats.values()].map((c) => {
      const w = c.name === null ? null : weights[c.name];
      return {
        ...c,
        percent: c.possible > 0 ? (c.earned / c.possible) * 100 : null,
        weight: isNum(w) && w >= 0 ? w : null,
      };
    });

    const totalEarned = categories.reduce((s, c) => s + c.earned, 0);
    const totalPossible = categories.reduce((s, c) => s + c.possible, 0);
    const warnings = [];
    let percent = null;

    if (mode === 'points') {
      if (totalPossible > 0) percent = (totalEarned / totalPossible) * 100;
    } else {
      const named = categories.filter((c) => c.name !== null);
      const withGrades = named.filter((c) => c.percent !== null);
      const usable = withGrades.filter((c) => c.weight !== null && c.weight > 0);
      const unweighted = withGrades.filter((c) => c.weight === null);
      const usedWeight = usable.reduce((s, c) => s + c.weight, 0);
      if (usedWeight > 0) {
        percent = usable.reduce((s, c) => s + c.weight * c.percent, 0) / usedWeight;
      }
      if (named.length === 0) {
        warnings.push('No grade categories were found on this page, so weighting cannot be used. Switch to "Total points".');
      } else if (unweighted.length > 0) {
        warnings.push('Enter a weight for: ' + unweighted.map((c) => c.name).join(', ') + '. Categories without a weight are left out of the grade.');
      }
      const weightSum = named.reduce((s, c) => s + (c.weight || 0), 0);
      if (unweighted.length === 0 && named.length > 0 && Math.abs(weightSum - 100) > 0.005) {
        warnings.push('Weights add up to ' + round2(weightSum) + '%, not 100%. That is fine if some categories have no work posted yet; otherwise double-check them.');
      }
      const loose = categories.find((c) => c.name === null);
      if (loose && loose.counted > 0) {
        warnings.push(loose.counted + ' graded item(s) with no category are not counted in a weighted grade. Use "Add category" to put them in one.');
      }
    }

    return {
      mode,
      percent,
      categories,
      totalEarned,
      totalPossible,
      usedWhatIf,
      warnings,
    };
  }

  function round2(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  const api = { compute, effectiveScore, inPeriod, round2, ALL_PERIODS };
  root.GradeCalc = Object.assign(root.GradeCalc || {}, { grade: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
