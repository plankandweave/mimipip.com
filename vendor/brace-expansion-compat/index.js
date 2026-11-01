'use strict';
// Compat replacement for the brace-expansion GHSA-mh99-v99m-4gvg DoS fix
// (CVE-2026-14257), wired in via the root package.json "overrides" entry for
// "brace-expansion". Vendored instead of pulled from the registry because
// the only patched release is 5.0.8, and its package only exports a named
// `expand` function — but the copies of minimatch@3.x/5.x pinned by eslint,
// glob@7 (via archiver-utils), and readdir-glob (both via exceljs) all do
// `const expand = require('brace-expansion')` and call it directly. Those
// old minimatch majors never got a brace-expansion dependency range that
// reaches 5.0.8, so a plain version-only override breaks them (TypeError:
// expand is not a function). This file re-implements the tiny, patched
// algorithm (ported from brace-expansion@5.0.8, MIT, (c) Julian Gruber) and
// exports it both ways: callable directly (old minimatch) and as a named
// `.expand` (minimatch@10, which imports `{ expand }`).
// Inlined balanced-match (MIT, (c) Julian Gruber) so this shim has zero
// external dependencies — npm's "overrides" + local "file:" combination was
// not reliably installing this package's own declared dependencies.
function maybeMatch(reg, str) {
  const m = str.match(reg);
  return m ? m[0] : null;
}

function range(a, b, str) {
  let begs, beg, left, right, result;
  let ai = str.indexOf(a);
  let bi = str.indexOf(b, ai + 1);
  let i = ai;

  if (ai >= 0 && bi > 0) {
    if (a === b) {
      return [ai, bi];
    }
    begs = [];
    left = str.length;

    while (i >= 0 && !result) {
      if (i === ai) {
        begs.push(i);
        ai = str.indexOf(a, i + 1);
      } else if (begs.length === 1) {
        result = [begs.pop(), bi];
      } else {
        beg = begs.pop();
        if (beg < left) {
          left = beg;
          right = bi;
        }
        bi = str.indexOf(b, i + 1);
      }
      i = ai < bi && ai >= 0 ? ai : bi;
    }

    if (begs.length) {
      result = [left, right];
    }
  }

  return result;
}

function balanced(a, b, str) {
  if (a instanceof RegExp) a = maybeMatch(a, str);
  if (b instanceof RegExp) b = maybeMatch(b, str);

  const r = range(a, b, str);

  return (
    r && {
      start: r[0],
      end: r[1],
      pre: str.slice(0, r[0]),
      body: str.slice(r[0] + a.length, r[1]),
      post: str.slice(r[1] + b.length),
    }
  );
}

const EXPANSION_MAX = 100_000;
const EXPANSION_MAX_LENGTH = 4_000_000;

const escSlash = '\0SLASH' + Math.random() + '\0';
const escOpen = '\0OPEN' + Math.random() + '\0';
const escClose = '\0CLOSE' + Math.random() + '\0';
const escComma = '\0COMMA' + Math.random() + '\0';
const escPeriod = '\0PERIOD' + Math.random() + '\0';
const escSlashPattern = new RegExp(escSlash, 'g');
const escOpenPattern = new RegExp(escOpen, 'g');
const escClosePattern = new RegExp(escClose, 'g');
const escCommaPattern = new RegExp(escComma, 'g');
const escPeriodPattern = new RegExp(escPeriod, 'g');
const slashPattern = /\\\\/g;
const openPattern = /\\{/g;
const closePattern = /\\}/g;
const commaPattern = /\\,/g;
const periodPattern = /\\\./g;

function numeric(str) {
  return !isNaN(str) ? parseInt(str, 10) : str.charCodeAt(0);
}

function escapeBraces(str) {
  return str
    .replace(slashPattern, escSlash)
    .replace(openPattern, escOpen)
    .replace(closePattern, escClose)
    .replace(commaPattern, escComma)
    .replace(periodPattern, escPeriod);
}

function unescapeBraces(str) {
  return str
    .replace(escSlashPattern, '\\')
    .replace(escOpenPattern, '{')
    .replace(escClosePattern, '}')
    .replace(escCommaPattern, ',')
    .replace(escPeriodPattern, '.');
}

function parseCommaParts(str) {
  if (!str) return [''];
  const parts = [];
  const m = balanced('{', '}', str);
  if (!m) return str.split(',');
  const { pre, body, post } = m;
  const p = pre.split(',');
  p[p.length - 1] += '{' + body + '}';
  const postParts = parseCommaParts(post);
  if (post.length) {
    p[p.length - 1] += postParts.shift();
    p.push.apply(p, postParts);
  }
  parts.push.apply(parts, p);
  return parts;
}

function embrace(str) {
  return '{' + str + '}';
}

function isPadded(el) {
  return /^-?0\d/.test(el);
}

function lte(i, y) {
  return i <= y;
}

function gte(i, y) {
  return i >= y;
}

// Caps both the number of results (`max`) and their total character count
// (`maxLength`) — the latter is the actual CVE-2026-14257 fix.
function combine(acc, pre, values, max, maxLength, dropEmpties) {
  const out = [];
  let length = 0;
  for (let a = 0; a < acc.length; a++) {
    for (let v = 0; v < values.length; v++) {
      if (out.length >= max) return out;
      const expansion = acc[a] + pre + values[v];
      if (dropEmpties && !expansion) continue;
      if (length + expansion.length > maxLength) return out;
      out.push(expansion);
      length += expansion.length;
    }
  }
  return out;
}

function expandSequence(body, isAlphaSequence, max) {
  const n = body.split(/\.\./);
  const N = [];
  if (n[0] === undefined || n[1] === undefined) return N;
  const x = numeric(n[0]);
  const y = numeric(n[1]);
  const width = Math.max(n[0].length, n[1].length);
  let incr = n.length === 3 && n[2] !== undefined ? Math.max(Math.abs(numeric(n[2])), 1) : 1;
  let test = lte;
  const reverse = y < x;
  if (reverse) {
    incr *= -1;
    test = gte;
  }
  const pad = n.some(isPadded);
  for (let i = x; test(i, y) && N.length < max; i += incr) {
    let c;
    if (isAlphaSequence) {
      c = String.fromCharCode(i);
      if (c === '\\') c = '';
    } else {
      c = String(i);
      if (pad) {
        const need = width - c.length;
        if (need > 0) {
          const z = new Array(need + 1).join('0');
          c = i < 0 ? '-' + z + c.slice(1) : z + c;
        }
      }
    }
    N.push(c);
  }
  return N;
}

function expand_(str, max, maxLength, isTop) {
  let acc = [''];
  let dropEmpties = false;
  let firstGroup = true;
  for (;;) {
    const m = balanced('{', '}', str);
    if (!m) return combine(acc, str, [''], max, maxLength, dropEmpties);
    const pre = m.pre;
    if (/\$$/.test(pre)) {
      acc = combine(acc, pre + '{' + m.body + '}', [''], max, maxLength, dropEmpties && !m.post.length);
      firstGroup = false;
      if (!m.post.length) break;
      str = m.post;
      continue;
    }
    const isNumericSequence = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(m.body);
    const isAlphaSequence = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(m.body);
    const isSequence = isNumericSequence || isAlphaSequence;
    const isOptions = m.body.indexOf(',') >= 0;
    if (!isSequence && !isOptions) {
      if (m.post.match(/,(?!,).*\}/)) {
        str = m.pre + '{' + m.body + escClose + m.post;
        isTop = true;
        continue;
      }
      return combine(acc, pre + '{' + m.body + '}' + m.post, [''], max, maxLength, dropEmpties);
    }
    if (firstGroup) {
      dropEmpties = isTop && !isSequence;
      firstGroup = false;
    }
    let values;
    if (isSequence) {
      values = expandSequence(m.body, isAlphaSequence, max);
    } else {
      let n = parseCommaParts(m.body);
      if (n.length === 1 && n[0] !== undefined) {
        n = expand_(n[0], max, maxLength, false).map(embrace);
        if (n.length === 1) {
          acc = combine(acc, pre + n[0], [''], max, maxLength, dropEmpties && !m.post.length);
          if (!m.post.length) break;
          str = m.post;
          continue;
        }
      }
      values = [];
      for (let j = 0; j < n.length; j++) {
        values.push.apply(values, expand_(n[j], max, maxLength, false));
      }
    }
    acc = combine(acc, pre, values, max, maxLength, dropEmpties && !m.post.length);
    if (!m.post.length) break;
    str = m.post;
  }
  return acc;
}

function expand(str, options = {}) {
  if (!str) return [];
  const { max = EXPANSION_MAX, maxLength = EXPANSION_MAX_LENGTH } = options;
  if (str.slice(0, 2) === '{}') str = '\\{\\}' + str.slice(2);
  return expand_(escapeBraces(str), max, maxLength, true).map(unescapeBraces);
}

module.exports = expand;
module.exports.expand = expand;
module.exports.default = expand;
module.exports.EXPANSION_MAX = EXPANSION_MAX;
module.exports.EXPANSION_MAX_LENGTH = EXPANSION_MAX_LENGTH;
