'use strict';
// Lanceur de dés : "2d6+3", "1d20+5", "4d8", "d20", "2d6+1d4+2"
const crypto = require('crypto');

function die(sides) {
  return crypto.randomInt(1, sides + 1);
}

function parse(expr) {
  const clean = String(expr).replace(/\s+/g, '').toLowerCase();
  if (!clean || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(clean)) {
    throw new Error('Formule de dés invalide : ' + expr);
  }
  const terms = [];
  const re = /([+-]?)(?:(\d*)d(\d+)|(\d+))/g;
  let m;
  while ((m = re.exec(clean))) {
    const sign = m[1] === '-' ? -1 : 1;
    if (m[3]) {
      const n = m[2] === '' ? 1 : parseInt(m[2], 10);
      const s = parseInt(m[3], 10);
      if (n < 1 || n > 100 || s < 2 || s > 1000) throw new Error('Dés hors limites : ' + expr);
      terms.push({ sign, n, s });
    } else {
      terms.push({ sign, flat: parseInt(m[4], 10) });
    }
  }
  return terms;
}

// opts.crit : double le nombre de dés (coup critique)
function roll(expr, opts = {}) {
  const terms = parse(expr);
  let total = 0;
  const groups = [];
  let flat = 0;
  for (const t of terms) {
    if (t.s) {
      const n = opts.crit ? t.n * 2 : t.n;
      const r = [];
      for (let i = 0; i < n; i++) r.push(die(t.s));
      const sum = r.reduce((a, b) => a + b, 0);
      total += t.sign * sum;
      groups.push({ n, s: t.s, sign: t.sign, r });
    } else {
      total += t.sign * t.flat;
      flat += t.sign * t.flat;
    }
  }
  const text = groups
    .map((g) => `${g.sign < 0 ? '-' : ''}${g.n}d${g.s}[${g.r.join(',')}]`)
    .join(' + ')
    .concat(flat ? ` ${flat > 0 ? '+' : '-'} ${Math.abs(flat)}` : '');
  return { total, expr: String(expr), groups, flat, text };
}

// d20 avec avantage / désavantage
function d20(mode = 'none') {
  const a = die(20);
  if (mode === 'adv' || mode === 'dis') {
    const b = die(20);
    const kept = mode === 'adv' ? Math.max(a, b) : Math.min(a, b);
    return { kept, rolls: [a, b], mode };
  }
  return { kept: a, rolls: [a], mode: 'none' };
}

module.exports = { roll, d20, die, parse };
