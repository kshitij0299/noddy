/* Noddy Galley: clickable prototype of the agentic editor.
   Vanilla JS, no build step. One state object (S), one render function per region,
   clicks routed through data-act attributes. Agent output is simulated from Inter (OFL). */
(function () {
'use strict';

/* =====================================================================
   1. Data
   ===================================================================== */
const SRC = window.NODDY_GLYPHS || { meta: { upm: 2048, ascender: 1984, descender: -494, xHeight: 1104, capHeight: 1490 }, glyphs: {} };
const META = SRC.meta;
const UPM = META.upm, ASC = META.ascender, DESC = META.descender;
const DEF_ADV = UPM / 2;               // Noddy's default advance width for a new glyph
const NOTDEF = '.notdef';
const NBSP = ' ';
const VERSION = '2.11.0-noddy.0';
const SVGNS = 'http://www.w3.org/2000/svg';

const GROUPS = [
  { id: 'upper', name: 'Uppercase', range: 'A–Z', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], basic: true },
  { id: 'lower', name: 'Lowercase', range: 'a–z', chars: [...'abcdefghijklmnopqrstuvwxyz'], basic: true },
  { id: 'fig', name: 'Figures', range: '0–9', chars: [...'0123456789'], basic: true },
  { id: 'punct', name: 'Punctuation', range: '', chars: [...'.,:;!?\'"-()[]{}/\\_‘’“”–—…·•'] },
  { id: 'sym', name: 'Symbols', range: '', chars: [...'#$%&*+<=>@^|~`×÷−¢£¥€©®™°'] },
  { id: 'space', name: 'Spaces', range: '', chars: [' ', NBSP], notdef: true },
];
const ALL = GROUPS.flatMap(g => g.chars);                 // 116
const BASIC = GROUPS.filter(g => g.basic).flatMap(g => g.chars); // 62
const GROUP_OF = {};
GROUPS.forEach(g => g.chars.forEach(c => { GROUP_OF[c] = g.id; }));
const KERNEL = new Set(ALL);

const CONTROLS = ['n', 'o', 'H', 'O'];
const FAMILIES = [
  { id: 'lower', title: 'Lowercase', parts: ['hmulijr', 'bdpqce', 'agsft', 'vwyxkz'] },
  { id: 'upper', title: 'Capitals', parts: ['ILEFT', 'CGDQ', 'BPRJUS', 'VAWXYKNMZ'] },
  { id: 'fig', title: 'Figures, one width', parts: ['01', '23456789'] },
];
const ORDER62 = [...CONTROLS, ...FAMILIES.flatMap(f => [...f.parts.join('')])];
const LATER = [...GROUPS[3].chars, ...GROUPS[4].chars];   // punctuation and symbols: a later plan step

const FROM = { h: 'n', m: 'n', u: 'n', r: 'n', l: 'n', i: 'l', j: 'l', b: 'o', d: 'o', p: 'o', q: 'o', c: 'o', e: 'o', a: 'o', g: 'o',
  I: 'H', L: 'H', E: 'H', F: 'H', T: 'H', U: 'H', N: 'H', M: 'H', C: 'O', G: 'O', D: 'O', Q: 'O', P: 'H', B: 'P', R: 'P',
  '6': '0', '9': '6', '8': '0', '3': '8' };
const FAILS = {
  k: { kind: 'check', short: 'leg crosses the arm', reason: 'Outline check failed: the leg crosses the arm, so part of it cancels out.' },
  D: { kind: 'direction', short: 'counter runs the wrong way', reason: 'Outline check failed: the counter runs the same way as the outside, so it fills in.' },
  '5': { kind: 'cut', short: 'answer was cut off', reason: 'Failed: the model’s answer was cut off before the outline was complete.' },
};
const COMPONENT = { '“': '‘', '”': '’', '…': '.' };

const MODELS = [
  { id: 'gpt-5', name: 'GPT-5', provider: 'OpenAI', tools: true, vision: true, paid: true },
  { id: 'claude-sonnet-4.5', name: 'Claude Sonnet 4.5', provider: 'Anthropic', tools: true, vision: true, paid: true },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', tools: true, vision: true, paid: false },
  { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', provider: 'Groq', tools: true, vision: false, paid: false },
  { id: 'mistral-7b', name: 'Mistral 7B Instruct', provider: 'OpenRouter', tools: false, vision: false, paid: false },
];

const STATUSES = ['Empty', 'Queued', 'Drafting', 'Draft', 'Kept', 'Yours', 'Held', 'Failed'];
const ST_ICON = { Empty: 'radio_button_unchecked', Queued: 'schedule', Drafting: 'pending', Draft: 'edit_note', Kept: 'check_circle', Yours: 'person', Held: 'pause_circle', Failed: 'error' };

const BRIEF = 'A simple sans for a neighbourhood bakery: menus, price cards and the shop sign. Friendly but plain, even colour, open counters. Close in spirit to Inter, a little warmer.';
const SKETCH = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 72"><rect width="120" height="72" fill="#f6f1e8"/>' +
  '<g fill="none" stroke="#4a3b30" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M10 54V30M10 36c3-6 16-8 17 2v16"/><path d="M48 42c0 7-4 12-9 12s-9-5-9-12 4-12 9-12 9 5 9 12z"/>' +
  '<path d="M56 54V18M76 54V18M56 36h20"/><path d="M110 36c0 11-6 18-13 18s-13-7-13-18 6-18 13-18 13 7 13 18z"/></g>' +
  '<path d="M6 60h108" stroke="#b9a99a" stroke-width="1" stroke-dasharray="3 3"/></svg>');

const SPEC_ITEMS = [['upm', 'UPM'], ['xHeight', 'x-height'], ['capHeight', 'Cap'], ['ascender', 'Ascender'], ['descender', 'Descender'], ['overshoot', 'Overshoot']];
const STEMS = [['stem_n', 'n'], ['stem_o', 'o'], ['stem_H', 'H'], ['stem_O', 'O']];
const SPEC_LABEL = { upm: 'UPM', xHeight: 'x-height', capHeight: 'Cap height', ascender: 'Ascender', descender: 'Descender', overshoot: 'Overshoot', stem_n: 'n stem', stem_o: 'o stem', stem_H: 'H stem', stem_O: 'O stem' };
const SPEC_PROPOSAL = { xHeight: 1117, capHeight: 1489, ascender: 1489, descender: -420, overshoot: 20, stem_n: 172, stem_o: 190, stem_H: 181, stem_O: 200 };
const SPEC_WHY = {
  xHeight: 'A tall x-height reads well on small price cards.', capHeight: 'Caps a little shorter than the ascenders’ usual 1550, like Inter.',
  ascender: 'Ascenders the same height as caps keep the sign tidy.', descender: 'Short descenders let menu lines sit closer.',
  overshoot: 'About 2% of the x-height, so round letters look as tall as flat ones.',
  stem_n: 'Regular weight for text.', stem_o: 'Rounds a touch heavier than straights.', stem_H: 'Caps a touch heavier than lowercase.', stem_O: 'Round caps heavier still.',
};

const TOOLS = [
  { id: 'rect', name: 'New rectangle', key: 'R', icon: 'rectangle' },
  { id: 'oval', name: 'New oval', key: 'O', icon: 'circle' },
  { id: 'pen', name: 'New path', key: 'P', icon: 'stylus' },
  { id: 'addpt', name: 'Add path point', key: 'U', icon: 'add_circle' },
  null,
  { id: 'edit', name: 'Path edit', key: 'V', icon: 'ink_pen' },
  { id: 'resize', name: 'Resize', key: 'A', icon: 'arrow_selector_tool' },
];
const TOOL_KEYS = { p: 'pen', v: 'edit', a: 'resize', r: 'rect', o: 'oval', u: 'addpt' };

/* =====================================================================
   2. Small helpers
   ===================================================================== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, cls) => `<span class="ms ${cls || ''}" aria-hidden="true">${name}</span>`;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtN = v => (v == null ? '—' : (v < 0 ? '−' + Math.abs(v) : String(v)));
const money = v => '$' + v.toFixed(2);
const cpId = ch => (ch === NOTDEF ? 'notdef' : String(ch.codePointAt(0)));
const chFromId = id => (id === 'notdef' ? NOTDEF : String.fromCodePoint(Number(id)));
const label = ch => (ch === ' ' ? 'space' : ch === NBSP ? 'nbspace' : ch);
const gname = ch => (ch === NOTDEF ? '.notdef' : (SRC.glyphs[ch] ? SRC.glyphs[ch].name : ch));
const uplus = ch => (ch === NOTDEF ? 'unencoded' : 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
const isLetterFig = ch => /^[A-Za-z0-9]$/.test(ch);
const dispName = ch => (isLetterFig(ch) ? ch : (ch === ' ' || ch === NBSP || ch === NOTDEF ? gname(ch) : `${ch} ${gname(ch)}`));
const plural = (n, a, b) => `${n} ${n === 1 ? a : (b || a + 's')}`;
const curModel = () => MODELS.find(m => m.id === S.model.id) || MODELS[0];
const tier = () => (innerWidth >= 1100 ? 'wide' : innerWidth >= 760 ? 'mid' : 'narrow');

function hashStr(s) { let h = 2166136261 >>> 0; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/* timers are tracked so a state jump can cancel everything */
const TIMERS = new Set();
function later(fn, ms) { const id = setTimeout(() => { TIMERS.delete(id); fn(); }, ms); TIMERS.add(id); return id; }
function clearTimers() { TIMERS.forEach(id => clearTimeout(id)); TIMERS.clear(); }

/* =====================================================================
   3. Geometry: contours of nodes with absolute cubic handles
   ===================================================================== */
function nd(x, y) { return { x, y, ix: null, iy: null, ox: null, oy: null, sm: false }; }
function parseD(d) {
  const toks = d.match(/[MLQCZ]|-?\d*\.?\d+/gi) || [];
  const cs = []; let cur = null, cmd = null, i = 0, px = 0, py = 0;
  const num = () => parseFloat(toks[i++]);
  const finish = c => {
    if (!c || c.nodes.length < 2) return;
    const a = c.nodes[0], b = c.nodes[c.nodes.length - 1];
    if (Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5) { a.ix = b.ix; a.iy = b.iy; c.nodes.pop(); }
  };
  while (i < toks.length) {
    const t = toks[i];
    if (/^[MLQCZ]$/i.test(t)) { cmd = t.toUpperCase(); i++; if (cmd === 'Z') { if (cur) { cur.closed = true; finish(cur); cur = null; } continue; } }
    if (cmd === 'M') { const x = num(), y = num(); cur = { closed: false, nodes: [nd(x, y)] }; cs.push(cur); px = x; py = y; cmd = 'L'; }
    else if (cmd === 'L') { const x = num(), y = num(); cur.nodes.push(nd(x, y)); px = x; py = y; }
    else if (cmd === 'Q') {
      const cx = num(), cy = num(), x = num(), y = num(); const last = cur.nodes[cur.nodes.length - 1];
      last.ox = px + 2 / 3 * (cx - px); last.oy = py + 2 / 3 * (cy - py);
      const n = nd(x, y); n.ix = x + 2 / 3 * (cx - x); n.iy = y + 2 / 3 * (cy - y); cur.nodes.push(n); px = x; py = y;
    } else if (cmd === 'C') {
      const c1x = num(), c1y = num(), c2x = num(), c2y = num(), x = num(), y = num(); const last = cur.nodes[cur.nodes.length - 1];
      last.ox = c1x; last.oy = c1y; const n = nd(x, y); n.ix = c2x; n.iy = c2y; cur.nodes.push(n); px = x; py = y;
    } else { i++; }
  }
  cs.forEach(c => c.nodes.forEach(n => { n.sm = smooth(n); }));
  return cs;
}
function smooth(n) {
  if (n.ix == null || n.ox == null) return false;
  const ax = n.x - n.ix, ay = n.y - n.iy, bx = n.ox - n.x, by = n.oy - n.y;
  const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by); if (la < 1 || lb < 1) return false;
  return Math.abs(ax * by - ay * bx) / (la * lb) < 0.05 && (ax * bx + ay * by) > 0;
}
const R = v => Math.round(v);
function toD(cs) {
  if (!cs) return '';
  let d = '';
  for (const c of cs) {
    const N = c.nodes; if (!N.length) continue;
    d += `M${R(N[0].x)} ${R(N[0].y)}`;
    const segs = c.closed ? N.length : N.length - 1;
    for (let k = 0; k < segs; k++) {
      const a = N[k], b = N[(k + 1) % N.length];
      if (a.ox == null && b.ix == null) d += `L${R(b.x)} ${R(b.y)}`;
      else d += `C${R(a.ox != null ? a.ox : a.x)} ${R(a.oy != null ? a.oy : a.y)} ${R(b.ix != null ? b.ix : b.x)} ${R(b.iy != null ? b.iy : b.y)} ${R(b.x)} ${R(b.y)}`;
    }
    if (c.closed) d += 'Z';
  }
  return d;
}
function clone(cs) { return cs ? cs.map(c => ({ closed: c.closed, nodes: c.nodes.map(n => Object.assign({}, n)) })) : null; }
function bez(a, b, t) {
  const p1x = a.ox != null ? a.ox : a.x, p1y = a.oy != null ? a.oy : a.y, p2x = b.ix != null ? b.ix : b.x, p2y = b.iy != null ? b.iy : b.y, u = 1 - t;
  return { x: u * u * u * a.x + 3 * u * u * t * p1x + 3 * u * t * t * p2x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * p1y + 3 * u * t * t * p2y + t * t * t * b.y };
}
function poly(c, steps) {
  const pts = [], N = c.nodes, segs = c.closed ? N.length : N.length - 1, st = steps || 8;
  for (let k = 0; k < segs; k++) { const a = N[k], b = N[(k + 1) % N.length]; for (let i = 0; i < st; i++) pts.push(bez(a, b, i / st)); }
  if (!c.closed && N.length) pts.push({ x: N[N.length - 1].x, y: N[N.length - 1].y });
  return pts;
}
function polyArea(p) { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a.x * b.y - b.x * a.y; } return s / 2; }
function inPoly(pt, p) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) ins = !ins;
  }
  return ins;
}
function bounds(cs) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  (cs || []).forEach(c => c.nodes.forEach(n => { x0 = Math.min(x0, n.x); x1 = Math.max(x1, n.x); y0 = Math.min(y0, n.y); y1 = Math.max(y1, n.y); }));
  return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
function reverseContour(c) {
  c.nodes.reverse();
  c.nodes.forEach(n => { const ix = n.ix, iy = n.iy; n.ix = n.ox; n.iy = n.oy; n.ox = ix; n.oy = iy; });
}
/* the smallest closed contour that holds every point of contour i (i is nested in it), or -1.
   Overlapping contours (the leg of R, the tail of Q) are not nested, so they are never compared. */
function parentOf(cs, polys, i) {
  const ai = Math.abs(polyArea(polys[i])); let best = -1, ba = Infinity;
  cs.forEach((d, j) => {
    if (i === j || !d.closed || d.nodes.length < 3) return;
    const aj = Math.abs(polyArea(polys[j]));
    if (aj > ai && aj < ba && polys[i].every(pt => inPoly(pt, polys[j]))) { best = j; ba = aj; }
  });
  return best;
}
/* real outline check: open contours, tiny contours, and a nested contour that runs the same way as the one around it (it fills instead of cutting a counter) */
function checkOutline(cs) {
  const issues = [];
  if (!cs || !cs.length) return { ok: true, issues };
  const polys = cs.map(c => poly(c, 6));
  cs.forEach((c, i) => {
    if (!c.closed) issues.push({ ci: i, kind: 'open', text: `Contour ${i + 1} isn’t closed. Click its first point to close it.` });
    else if (c.nodes.length < 3) issues.push({ ci: i, kind: 'tiny', text: `Contour ${i + 1} has fewer than 3 points.` });
  });
  cs.forEach((c, i) => {
    if (!c.closed || c.nodes.length < 3) return;
    const j = parentOf(cs, polys, i);
    if (j >= 0 && Math.sign(polyArea(polys[i])) === Math.sign(polyArea(polys[j]))) {
      issues.push({ ci: i, kind: 'direction', text: `Contour ${i + 1} runs the same way as the shape around it, so it fills in instead of cutting a counter.` });
    }
  });
  return { ok: issues.length === 0, issues };
}
function lerp(a, b, t) { return a + (b - a) * t; }
function splitSeg(c, k, t) {
  const N = c.nodes, a = N[k], b = N[(k + 1) % N.length];
  if (a.ox == null && b.ix == null) { N.splice(k + 1, 0, nd(R(lerp(a.x, b.x, t)), R(lerp(a.y, b.y, t)))); return k + 1; }
  const p1x = a.ox != null ? a.ox : a.x, p1y = a.oy != null ? a.oy : a.y, p2x = b.ix != null ? b.ix : b.x, p2y = b.iy != null ? b.iy : b.y;
  const q0x = lerp(a.x, p1x, t), q0y = lerp(a.y, p1y, t), q1x = lerp(p1x, p2x, t), q1y = lerp(p1y, p2y, t), q2x = lerp(p2x, b.x, t), q2y = lerp(p2y, b.y, t);
  const r0x = lerp(q0x, q1x, t), r0y = lerp(q0y, q1y, t), r1x = lerp(q1x, q2x, t), r1y = lerp(q1y, q2y, t);
  const mx = lerp(r0x, r1x, t), my = lerp(r0y, r1y, t);
  a.ox = q0x; a.oy = q0y; b.ix = q2x; b.iy = q2y;
  N.splice(k + 1, 0, { x: R(mx), y: R(my), ix: r0x, iy: r0y, ox: r1x, oy: r1y, sm: true });
  return k + 1;
}

/* base outlines (Inter, OFL) and the deliberately rough "agent draft" version */
const BASE = {};
function base(ch) {
  if (!(ch in BASE)) { const s = SRC.glyphs[ch]; BASE[ch] = s && s.d ? parseD(s.d) : (ch === NOTDEF ? notdefOutline() : []); }
  return BASE[ch];
}
function srcAdv(ch) { const s = SRC.glyphs[ch]; return s ? Math.round(s.adv) : DEF_ADV; }
/* Drafts must look rough at grid and proof sizes (30–80px), not only zoomed in. Most of the roughness is per glyph and per contour
   (lean, width, baseline, counters shifted off-centre), which reads at small sizes and never collapses a stem; per-point jitter stays small. */
function rough(cs, seedStr, amp) {
  const A = amp || 30; const r = prng(hashStr(seedStr)); const ph = r() * 6.283, ph2 = r() * 6.283;
  const b = bounds(cs); if (!b) return clone(cs);
  const cx = (b.x0 + b.x1) / 2, lean = (r() - 0.5) * 0.1, sx = 1 + (r() - 0.5) * 0.08, by = (r() - 0.5) * A * 1.2;
  return cs.map((c, ci) => {
    const cdx = ci ? (r() - 0.5) * A * 1.4 : 0, cdy = ci ? (r() - 0.5) * A : 0;
    const mv = (x, y) => [cx + (x - cx) * sx + y * lean + cdx + Math.sin(y / 240 + ph) * A * 1.5, y + by + cdy + Math.cos(x / 210 + ph2) * A * 0.8];
    return { closed: c.closed, nodes: c.nodes.map(n => {
      const jx = (r() - 0.5) * A * 0.9, jy = (r() - 0.5) * A * 0.7;
      const p = mv(n.x, n.y), m = Object.assign({}, n, { x: R(p[0] + jx), y: R(p[1] + jy) });
      if (n.ix != null) { const q = mv(n.ix, n.iy); m.ix = R(q[0] + jx + (r() - 0.5) * A * 0.5); m.iy = R(q[1] + jy + (r() - 0.5) * A * 0.5); }
      if (n.ox != null) { const q = mv(n.ox, n.oy); m.ox = R(q[0] + jx + (r() - 0.5) * A * 0.5); m.oy = R(q[1] + jy + (r() - 0.5) * A * 0.5); }
      return m;
    }) };
  });
}
function agentOutline(ch, v) { return rough(base(ch), ch + '#' + (v || 0)); }
function partialOutline(cs, step) {
  if (!cs || !cs.length) return [];
  if (step >= 3) return clone(cs);
  const total = cs.reduce((a, c) => a + c.nodes.length, 0); let budget = Math.max(2, Math.round(total * (step === 1 ? 0.35 : 0.7)));
  const out = [];
  for (const c of cs) { if (budget <= 1) break; const n = Math.min(c.nodes.length, budget); out.push({ closed: n === c.nodes.length, nodes: c.nodes.slice(0, n).map(x => Object.assign({}, x)) }); budget -= n; }
  return out;
}
function failOutline(ch) {
  const cs = agentOutline(ch, 3);
  if (FAILS[ch] && FAILS[ch].kind === 'direction') {
    /* reverse a real counter (a contour nested in another), so the check genuinely fails and Fix direction genuinely fixes it */
    const polys = cs.map(c => poly(c, 6)), ci = cs.findIndex((c, i) => parentOf(cs, polys, i) >= 0);
    if (ci >= 0) reverseContour(cs[ci]);
  }
  if (FAILS[ch] && FAILS[ch].kind === 'check' && cs[0] && cs[0].nodes.length > 6) { const n = cs[0].nodes[3]; n.x += 260; n.y -= 120; }
  return cs;
}
function notdefOutline() {
  const o = [[120, 0], [120, 1489], [904, 1489], [904, 0]], i = [[200, 80], [824, 80], [824, 1409], [200, 1409]];
  return [{ closed: true, nodes: o.map(p => nd(p[0], p[1])) }, { closed: true, nodes: i.map(p => nd(p[0], p[1])) }];
}
function sb(g) { const b = bounds(g.cs); return b ? { lsb: R(b.x0), rsb: R(g.adv - b.x1) } : { lsb: null, rsb: null }; }
/* compares outlines for "did the user change the drawing?": no outline and an empty list are the same,
   and a sideways shift (LSB) is spacing, not drawing, so it is removed before comparing */
function outlineKey(cs) {
  const b = bounds(cs); if (!b) return 'null';
  const d = R(b.x0), sx = v => (v == null ? null : R(v - d));
  return JSON.stringify(cs.map(c => [c.closed, c.nodes.map(n => [sx(n.x), R(n.y), sx(n.ix), n.iy == null ? null : R(n.iy), sx(n.ox), n.oy == null ? null : R(n.oy)])]));
}
function cost(ch) { return 0.03 + (hashStr(ch) % 5) * 0.01; }

/* =====================================================================
   4. State
   ===================================================================== */
let S;
function mkGlyph(ch) {
  return { ch, status: 'Empty', cs: null, adv: DEF_ADV, bold: false, before: undefined, beforeStatus: 'Empty', beforeBold: false, beforeAdv: DEF_ADV,
    part: null, failCs: null, failKind: null, reason: '', from: null, mine: false, spacingYours: false, ver: 0, out: false };
}
function idleRun(cap) {
  return { state: 'idle', kind: null, queue: [], total: 0, done: 0, job: null, spent: 0, cap: cap || 6, drafted: 0, failed: 0, gateAfter: null,
    confirmStop: false, wait: 0, skipped: [], label: '', interruptedNote: false, draftedChars: [] };
}
function freshState() {
  const G = {};
  ALL.forEach(ch => { G[ch] = mkGlyph(ch); });
  G[NOTDEF] = Object.assign(mkGlyph(NOTDEF), { status: 'Kept', cs: notdefOutline(), auto: true, reason: 'Noddy makes this box for characters a font is missing. You can redraw it.' });
  [' ', NBSP].forEach(ch => { G[ch].adv = 0; G[ch].reason = 'Empty by design. Its width isn’t set yet.'; });
  Object.keys(COMPONENT).forEach(ch => { G[ch].component = COMPONENT[ch]; });
  return {
    screen: 'galley', scenario: null,
    project: { name: 'Bakery Sans', file: 'Noddy Project.gs2' },
    newfont: { name: 'Bakery Sans', set: 'kernel', start: null, file: null, back: false },
    spec: { upm: 2048, xHeight: 1100, capHeight: 1480, ascender: 1550, descender: -440, overshoot: 30, stem_n: null, stem_o: null, stem_H: null, stem_O: null },
    prop: null, G, outside: [], outsideOpen: false,
    view: { all: false, filter: 'all' }, sel: [], cursor: 'A', msg: '', msgAt: 0,
    proof: { preset: 'lf', text: 'Hamburgefontsiv · Bakery 1984', group: null, exported: false, seen: {}, seenAt: {} },
    hand: null, selFreeze: null,
    editor: { open: false }, preflight: { open: false, build: 'idle', exported: false },
    model: { id: 'gpt-5', connected: false, key: '', check: 'idle', intent: false },
    pane: { open: true, details: false },
    run: idleRun(), plan: null, failedOnce: new Set(),
    thread: [], openRcpt: new Set(), rcptOf: {}, runSection: null,
    comp: { text: '', force: true, img: false, skipImg: false, scope: 'auto', stage: 'chat', gateAsk: false },
    bolder: null, checkpoints: [], history: [], cpConfirm: null,
    flags: { readOnly: false, notSaving: false, keyLost: false, focusEdge: false },
    grpConfirm: null, pop: null, ids: 0,
  };
}
const nid = p => (p || 'i') + (++S.ids);
const proto = { speed: 1, theme: 'system', grey: false, open: false };

/* =====================================================================
   5. Render scheduling (render only what changed)
   ===================================================================== */
const dirty = new Set(), dirtyCells = new Set(), dirtyGroups = new Set();
let raf = 0;
const ORDER = ['shell', 'header', 'banner', 'spec', 'proofHead', 'proofBody', 'gridTools', 'grid', 'cells', 'selbar', 'editor', 'edCanvas',
  'preflight', 'paneHead', 'paneBanner', 'run', 'plan', 'thread', 'composer', 'newfont', 'pop', 'proto'];
function inval() { for (const p of arguments) dirty.add(p); if (!raf) raf = requestAnimationFrame(flush); }
function invalCell(ch) { dirtyCells.add(ch); if (GROUP_OF[ch]) dirtyGroups.add(GROUP_OF[ch]); inval('cells'); }
function flush() {
  raf = 0;
  const d = new Set(dirty); dirty.clear();
  for (const p of ORDER) if (d.has(p)) { try { RENDER[p](); } catch (err) { console.warn('render ' + p, err); } }
}
function renderAll() { ORDER.forEach(p => dirty.add(p)); flush(); }

/* Replace a region's HTML only if it changed; keep keyboard focus (and caret) on the element with the same data-k. */
function patch(el, html) {
  if (!el || el._h === html) return;
  const a = document.activeElement;
  let key = null, s0 = null, s1 = null;
  if (a && a !== document.body && el.contains(a)) { key = a.getAttribute('data-k'); if ('selectionStart' in a) { try { s0 = a.selectionStart; s1 = a.selectionEnd; } catch (e) { /* not a text input */ } } }
  el.innerHTML = html; el._h = html;
  if (key) {
    const n = el.querySelector(`[data-k="${CSS.escape(key)}"]`);
    if (n) { n.focus({ preventScroll: true }); if (s0 != null) { try { n.setSelectionRange(s0, s1); } catch (e) { /* ignore */ } } }
  }
}
/* Messages show wherever the user is looking: the selection bar (grid), the hint slot (editor) or the preflight header. */
function say(msg) { S.msg = msg; S.msgAt = Date.now(); const L = $('#live'); if (L) L.textContent = msg; inval('selbar', 'editor', 'preflight'); later(() => { if (Date.now() - S.msgAt >= 5900) { S.msg = ''; inval('selbar', 'editor', 'preflight'); } }, 6000); }
const recentMsg = () => (S.msg && Date.now() - S.msgAt < 6000 ? S.msg : '');

/* glyph definitions shared by proof, cells and receipts via <use> */
const DEFS = {};
function defPath(ch) {
  const id = 'g-' + cpId(ch); let el = DEFS[ch];
  if (!el) { el = document.createElementNS(SVGNS, 'path'); el.setAttribute('id', id); $('#glyph-defs').appendChild(el); DEFS[ch] = el; }
  const g = S.G[ch];
  el.setAttribute('d', g && g.cs ? toD(g.cs) : '');
  if (g && g.bold) { el.setAttribute('stroke', 'currentColor'); el.setAttribute('stroke-width', '46'); el.setAttribute('stroke-linejoin', 'round'); }
  else { el.removeAttribute('stroke'); el.removeAttribute('stroke-width'); el.removeAttribute('stroke-linejoin'); }
}
function touch(ch, layout) {
  const g = S.G[ch]; if (!g) return;
  g.ver++; defPath(ch); invalCell(ch);
  if (layout !== false) inval('proofBody');
  inval('selbar', 'header', 'gridTools', 'thread', 'plan', 'run');
  if (S.editor.open && S.editor.ch === ch) inval('editor', 'edCanvas', 'proofHead');
  if (S.preflight.open) inval('preflight');
}
/* A change from outside the editor (agent, Revert, checkpoint) becomes the open editor's new starting point,
   so closing the editor never mistakes it for the user's own drawing. */
function rebaseEditor(ch) {
  const ed = S.editor; if (!ed.open || ed.ch !== ch) return;
  const g = S.G[ch], js = JSON.stringify(g.cs || null);
  if (js !== ed.snapCs) { ed.undo = []; ed.redo = []; ed.drawing = null; ed.sel = new Set(); ed.selC = null; ed.drag = null; }
  ed.snapCs = js; ed.snapAdv = g.adv; ed.snapStatus = g.status;
  inval('editor', 'edCanvas', 'proofHead');
}
/* a new draft in a group locks its Keep all again until the group is proofed */
function newDraft(ch) { const gid = GROUP_OF[ch]; if (gid) { delete S.proof.seen[gid]; delete S.proof.seenAt[gid]; dirtyGroups.add(gid); } }
/* When the agent changes the selected glyph, its action buttons swap. Hold them inactive for a moment so a click aimed at
   the old button (Take over) can't land on the new one (Redo). */
function agentTouched(ch) {
  if (S.sel.length !== 1 || S.sel[0] !== ch) return;
  S.selFreeze = { ch, until: Date.now() + 600 }; inval('selbar');
  later(() => inval('selbar'), 650);
}
const RUN_ACTIVE = ['running', 'pausing', 'paused', 'waiting', 'gate', 'cap', 'offline', 'down', 'interrupted'];
/* "Queued" only means something while the glyph is in a run's queue. An undo that brings back Queued puts it back in the queue,
   or, with no run to finish it, back to where it was before it was queued. */
function fixQueued(ch) {
  const g = S.G[ch], r = S.run; if (!g || g.status !== 'Queued' || r.queue.includes(ch)) return;
  if (RUN_ACTIVE.includes(r.state) && r.kind === 'set') { r.queue.push(ch); r.total++; inval('run', 'header'); return; }
  g.status = g.qPrev && !['Queued', 'Drafting'].includes(g.qPrev) ? g.qPrev : (hasOutline(g) ? 'Draft' : 'Empty');
}
const hasOutline = g => !!(g && g.cs && g.cs.length);
const isDrawn = g => ['Draft', 'Kept', 'Yours'].includes(g.status) || ((g.ch === ' ' || g.ch === NBSP) && g.adv > 0);
function countDrawn() { return ALL.filter(ch => isDrawn(S.G[ch])).length; }
function countBy(chars) {
  const c = {}; STATUSES.forEach(s => { c[s] = 0; });
  chars.forEach(ch => { c[S.G[ch].status]++; });
  return c;
}
function ghostH(ch) {
  const gid = GROUP_OF[ch];
  if (gid === 'lower') return S.spec.xHeight;
  if (gid === 'upper' || gid === 'fig') return S.spec.capHeight;
  return Math.round(S.spec.xHeight * 0.8);
}
function stHTML(st, extra) { return `<span class="st st--${st}">${icon(ST_ICON[st])}${st}${extra || ''}</span>`; }

/* =====================================================================
   6. Header, banner, spec line
   ===================================================================== */
function runChipHTML() {
  const r = S.run, m = curModel();
  const n = r.total ? `<span class="num">${r.done}/${r.total}</span>` : '';
  let ico = 'radio_button_unchecked', txt = 'Agent idle', cls = 'runchip--idle';
  switch (r.state) {
    case 'ready': ico = 'flag'; txt = `Ready · ${plural(planScope().length, 'glyph')}`; cls = ''; break;
    case 'running': ico = 'pending'; txt = r.job ? `Drafting ${esc(label(r.job.ch))} · ${n}` : `Working · ${n}`; cls = ''; break;
    case 'pausing': ico = 'pause'; txt = `Pausing… · ${n}`; cls = ''; break;
    case 'paused': ico = 'pause_circle'; txt = `Paused · ${n}`; cls = ''; break;
    case 'stopping': ico = 'stop_circle'; txt = `Stopping… · ${n}`; cls = ''; break;
    case 'stopped': ico = 'stop_circle'; txt = `Stopped · ${n}`; break;
    case 'gate': ico = 'flag'; txt = 'Check n o H O'; cls = 'runchip--attn'; break;
    case 'waiting': ico = 'hourglass_top'; txt = `Waiting <span class="num">${r.wait}</span> s · ${n}`; cls = ''; break;
    case 'cap': ico = 'payments'; txt = `Paused at cap · ${n}`; cls = 'runchip--attn'; break;
    case 'interrupted': ico = 'sync_problem'; txt = `Interrupted · ${n}`; cls = 'runchip--bad'; break;
    case 'offline': ico = 'wifi_off'; txt = 'Relay offline · paused'; cls = 'runchip--bad'; break;
    case 'down': ico = 'cloud_off'; txt = `${m.provider} down · paused`; cls = 'runchip--bad'; break;
    case 'done': ico = 'check_circle'; txt = `Run done · ${n}`; cls = ''; break;
    default: break;
  }
  const pct = r.total ? Math.round(r.done / r.total * 100) : 0;
  return `<button class="runchip ${cls}" type="button" data-act="openRun" data-k="runchip" title="Run status. Opens the agent pane. Hiding the pane never stops a run.">${icon(ico)}<span class="runchip-txt">${txt}</span><span class="runchip-bar"><i style="width:${pct}%"></i></span></button>`;
}
function rHeader() {
  const isNew = S.screen === 'new';
  let h = `<div class="brand"><img src="noddy-icon.png" width="24" height="24" alt=""><span class="wordmark">Noddy</span></div>
    <button class="btn btn--minimal hdr-menu" type="button" data-act="pop" data-pop="file" data-k="file" aria-haspopup="menu">File</button><span class="hdr-sep"></span>`;
  if (isNew) { patch($('#hdr'), h + '<span class="hdr-title">New font</span>'); return; }
  const drawn = countDrawn();
  h += `<span class="proj" title="Saved as ${esc(S.project.file)}">${esc(S.project.name)}</span>
    <button class="chip set-chip" type="button" data-act="pop" data-pop="set" data-k="setchip" aria-haspopup="dialog" title="${drawn} of 116 characters have an outline. Only you can change the set."><span class="set-name">Latin Kernel ·</span><span class="num">${drawn}/116</span></button>
    <div class="runchip-slot">${runChipHTML()}</div><div class="hdr-spacer"></div>
    ${S.flags.notSaving
      ? `<button class="save save--bad btn btn--minimal btn--sm" type="button" data-act="pop" data-pop="save" data-k="savestatus" aria-label="Not autosaving" title="Not autosaving">${icon('cloud_off', 'ms--sm')}<span class="save-txt">Not autosaving</span></button>`
      : `<span class="save" title="Saved in this browser">${icon('cloud_done', 'ms--sm')}<span class="save-txt">Saved</span></span>`}
    <button class="agent-toggle" type="button" aria-pressed="${S.pane.open}" data-act="togglePane" data-k="agenttoggle" title="Show or hide the agent. Hiding never stops a run."><span class="dot"></span>Agent</button>
    <button class="btn" type="button" data-act="openPreflight" data-k="export" aria-label="Export">${icon('ios_share', 'ms--sm')}<span class="export-txt">Export</span></button>`;
  patch($('#hdr'), h);
}
function rBanner() {
  const el = $('#banner'); const on = S.screen !== 'new' && S.flags.readOnly;
  el.hidden = !on;
  if (on) patch(el, `${icon('tab')}<span><b>Bakery Sans is open in another tab.</b> This tab is read-only so the two can’t overwrite each other.</span><button class="btn btn--sm" type="button" data-act="editHere" data-k="edithere">Edit in this tab instead</button>`);
}
function specBtn(k) {
  const v = S.spec[k], p = S.prop && k in S.prop, l = SPEC_LABEL[k];
  if (k === 'upm') return `<button class="spec-v locked" type="button" data-act="pop" data-pop="spec" data-key="upm" data-k="spec-upm" aria-label="UPM ${v}, fixed in this version" title="UPM is fixed in v1: changing it would rescale every glyph.">${icon('lock')}<span>${v}</span></button>`;
  return `<button class="spec-v ${p ? 'has-prop' : ''}" type="button" data-act="pop" data-pop="spec" data-key="${k}" data-k="spec-${k}" aria-label="${l} ${fmtN(v)}${p ? ', agent suggests ' + fmtN(S.prop[k]) : ''}"><i class="pdot"></i><span>${fmtN(v)}</span></button>`;
}
function rSpec() {
  let h = '';
  for (const [k, l] of SPEC_ITEMS) h += `<span class="spec-item"><span class="spec-l">${l}</span>${specBtn(k)}</span>`;
  h += `<span class="spec-item"><span class="spec-l">Stems</span>${STEMS.map(([k, l]) => `<span class="spec-l" style="margin-left:6px">${l}</span>${specBtn(k)}`).join('')}</span>`;
  const np = S.prop ? Object.keys(S.prop).length : 0;
  h += `<span class="spec-end">${np ? `<span class="spec-l">${plural(np, 'value')} suggested</span><button class="btn btn--sm" type="button" data-act="acceptAllSpec" data-k="acceptall">Accept all</button>` : ''}</span>`;
  patch($('#specline'), h);
}

/* =====================================================================
   7. Proof band
   ===================================================================== */
const PRESETS = [['lf', 'Letters & figures'], ['all', 'All 116'], ['spacing', 'Spacing'], ['text', 'Text'], ['waterfall', 'Waterfall']];
function itemW(ch) {
  if (ch === ' ' || ch === NBSP) { const g = S.G[ch]; return g.adv > 0 ? g.adv : 560; }
  const g = S.G[ch];
  if (!g) return DEF_ADV;
  return hasOutline(g) ? g.adv : DEF_ADV;
}
function followChars(ch) {
  const gid = GROUP_OF[ch];
  if (gid === 'lower') return [...`nn${ch}nn oo${ch}oo`];
  if (gid === 'upper') return [...`HH${ch}HH OO${ch}OO`];
  if (gid === 'fig') return [...`00${ch}00 11${ch}11`];
  if (gid === 'space') return ['n', 'n', ch, 'n', 'n', ' ', 'H', 'H', ch, 'H', 'H'];
  if (ch === NOTDEF) return ['n', 'n', NOTDEF, 'n', 'n'];
  return [...`nn${ch}nn HH${ch}HH`];
}
function wrapChars(chars, maxPx, k) {
  const rows = []; let row = [], w = 0, lastSpace = -1;
  for (const ch of chars) {
    if (ch === '\n') { rows.push(row); row = []; w = 0; lastSpace = -1; continue; }
    const cw = itemW(ch) * k;
    if (w + cw > maxPx && row.length) {
      if (lastSpace > 0) { const rest = row.splice(lastSpace + 1); row.pop(); rows.push(row); row = rest; w = row.reduce((a, c) => a + itemW(c) * k, 0); }
      else { rows.push(row); row = []; w = 0; }
      lastSpace = -1;
    }
    if (ch === ' ') lastSpace = row.length;
    row.push(ch); w += cw;
  }
  if (row.length) rows.push(row);
  return rows;
}
function emWidth(chars) { return chars.reduce((a, c) => a + itemW(c), 0) / UPM; }
function proofLines(W, H) {
  const ed = S.editor, p = S.proof, lines = [];
  if (ed.open) {
    const chars = followChars(ed.ch);
    lines.push({ chars, size: Math.min(76, (H - 10) / 1.16, W / Math.max(1, emWidth(chars))), nowrap: true });
    return lines;
  }
  if (S.run.state === 'gate') {
    const a = [...'nnonnoonn'], b = [...'HHOHHOOHH'];
    /* the measure line (~21px) sits above two rows of 1.16 × size + 6 */
    const size = Math.min(54, (H - 38) / 2.32, W / Math.max(emWidth(a), emWidth(b), 1));
    lines.push({ chars: a, size, nowrap: true }, { chars: b, size, nowrap: true });
    return lines;
  }
  if (S.bolder && S.bolder.state === 'open') {
    const t = [...'Hamburgefontsiv 1984'];
    const size = Math.min(34, (W - 70) / Math.max(1, emWidth(t)));
    lines.push({ chars: t, size, label: 'Now', nowrap: true }, { chars: t, size, label: 'Proposal', prop: true, nowrap: true });
  }
  if (p.preset === 'lf' || p.preset === 'all') {
    const nl = p.preset === 'lf' ? 3 : 5;
    /* rows are drawn at 1.16 × size + 6 each, from y = 2, so this fits the band without a scrollbar */
    const size = Math.max(14, Math.min(p.preset === 'lf' ? clamp(W / 19, 16, 34) : clamp(W / 22, 14, 26), (H - 4 - nl * 6) / (nl * 1.16)));
    GROUPS.filter(g => g.basic || p.preset === 'all').forEach(g => { if (g.id !== 'space') lines.push({ chars: g.chars, size }); });
  } else if (p.preset === 'spacing') {
    const g = p.group && GROUPS.find(x => x.id === p.group);
    if (g) {
      const ctl = g.id === 'upper' || g.id === 'sym' ? 'H' : g.id === 'fig' ? '0' : 'n';
      lines.push({ chars: [...ctl, ...g.chars.flatMap(c => [c, ctl])], size: 30 });
    } else {
      lines.push({ chars: [...'nnonnoonn HHOHHOOHH 00100'], size: 32 }, { chars: [...'hamburgefontsiv HAMBURGEFONTSIV'], size: 32 });
    }
  } else if (p.preset === 'text') {
    lines.push({ chars: [...p.text], size: 38 });
  } else if (p.preset === 'waterfall') {
    [12, 16, 22, 30, 42].forEach(s => lines.push({ chars: [...p.text], size: s, label: s + ' px', nowrap: true }));
  }
  return lines;
}
function rowSVG(chars, x0, base, k, opts) {
  let x = x0, out = '';
  const hl = opts.hl || new Set();
  for (const ch of chars) {
    const w = itemW(ch) * k;
    if (ch === ' ' || ch === NBSP) { x += w; continue; }
    const g = S.G[ch];
    const hit = `<rect class="hit" x="0" y="${(-1700 * k).toFixed(1)}" width="${w.toFixed(1)}" height="${(2200 * k).toFixed(1)}"></rect>`;
    const mark = hl.has(ch) ? `<rect class="hl" x="1" y="${(110 * k).toFixed(1)}" width="${Math.max(1, w - 2).toFixed(1)}" height="3"></rect>` : '';
    let inner;
    if (!g) inner = `<rect class="notdef" x="${(w * 0.12).toFixed(1)}" y="${(-1489 * k).toFixed(1)}" width="${(w * 0.76).toFixed(1)}" height="${(1489 * k).toFixed(1)}"></rect>`;
    else if (hasOutline(g)) inner = `<use href="#g-${cpId(ch)}" class="${opts.prop ? 'prop' : 'ink'}" transform="scale(${k.toFixed(5)},${(-k).toFixed(5)})"${opts.prop ? ' stroke-width="46" stroke-linejoin="round"' : ''}></use>`;
    else { const gh = ghostH(ch) * k; inner = `<rect class="ghost" x="${(w * 0.08).toFixed(1)}" y="${(-gh).toFixed(1)}" width="${(w * 0.84).toFixed(1)}" height="${gh.toFixed(1)}"></rect>`; }
    const attrs = g ? ` data-act="proofGlyph" data-ch="${cpId(ch)}"` : '';
    out += `<g class="pg"${attrs} transform="translate(${x.toFixed(1)},${base.toFixed(1)})">${hit}${mark}${inner}</g>`;
    x += w;
  }
  return out;
}
function rProofBody() {
  const el = $('#proof-body'); if (!el || S.screen === 'new') return;
  const W = Math.max(160, el.clientWidth - 24), H = Math.max(60, el.clientHeight - 12);
  const hl = new Set(S.sel); if (S.editor.open) hl.add(S.editor.ch);
  let y = 2, out = '', pre = '';
  if (S.run.state === 'gate' && !S.editor.open) pre = `<div class="gate-measure num" style="margin-bottom:4px">Measured from the drafts: ${gateMeasure()}</div>`;
  for (const ln of proofLines(W, H)) {
    const k = ln.size / UPM, lab = ln.label ? 64 : 0;
    const rows = ln.nowrap ? [ln.chars] : wrapChars(ln.chars, W - lab, k);
    for (const row of rows) {
      const base = y + ln.size * 0.86;
      if (ln.label) out += `<text class="rowlabel" x="0" y="${base.toFixed(1)}">${esc(ln.label)}</text>`;
      out += rowSVG(row, lab, base, k, { hl, prop: ln.prop });
      y += ln.size * 1.16 + 2;
    }
    y += 4;
  }
  const h = Math.ceil(y);
  const aria = S.editor.open ? `Follow line for ${dispName(S.editor.ch)}` : 'Live proof of the font';
  el.innerHTML = `${pre}<svg class="proof-svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(aria)}">${out}</svg>`;
}
function rProofHead() {
  const el = $('#proof-head'), p = S.proof;
  if (S.editor.open) {
    el.className = 'follow-head';
    const g = S.G[S.editor.ch], s = sb(g), ro = S.editor.mode !== 'own';
    patch(el, `<span class="meta">Follow line</span><span class="muted" style="font-size:12px;white-space:nowrap">Click a letter to switch to it</span>
      <div class="space-row" role="group" aria-label="Spacing for ${esc(dispName(S.editor.ch))}">
        <label for="sp-lsb">LSB</label><input id="sp-lsb" class="input" data-k="sp-lsb" data-change="spacing" data-f="lsb" inputmode="numeric" value="${s.lsb == null ? '' : s.lsb}" ${ro || s.lsb == null ? 'readonly' : ''}>
        <label for="sp-adv">Advance</label><input id="sp-adv" class="input" data-k="sp-adv" data-change="spacing" data-f="adv" inputmode="numeric" value="${g.adv}" ${ro ? 'readonly' : ''}>
        <label for="sp-rsb">RSB</label><input id="sp-rsb" class="input" data-k="sp-rsb" data-change="spacing" data-f="rsb" inputmode="numeric" value="${s.rsb == null ? '' : s.rsb}" ${ro || s.rsb == null ? 'readonly' : ''}>
      </div>`);
    return;
  }
  el.className = 'proof-head';
  if (S.run.state === 'gate') {
    patch(el, `${icon('flag')}<span class="gate-q">Check the style: n o H O</span><span class="proof-info gate-bar">
      <button class="btn btn--primary btn--sm w140" type="button" data-act="gateApprove" data-k="g-ok" title="Keeps n o H O and lets the agent continue">Approve and keep</button>
      <button class="btn btn--sm w120" type="button" data-act="gateAsk" data-k="g-ask">Ask for changes</button>
      <button class="btn btn--sm w120 hide-narrow" type="button" data-act="gateEdit" data-k="g-edit">Edit by hand</button></span>`);
    return;
  }
  const grp = p.group && GROUPS.find(g => g.id === p.group);
  patch(el, `<div class="tabs" role="tablist" aria-label="Proof presets">${PRESETS.map(([id, l]) => `<button class="tab" type="button" role="tab" aria-selected="${p.preset === id}" data-act="preset" data-p="${id}" data-k="pr-${id}">${l}</button>`).join('')}</div>
    <div class="proof-textslot" style="visibility:${p.preset === 'text' || p.preset === 'waterfall' ? 'visible' : 'hidden'}"><input id="proof-text" class="input" data-k="prooftext" data-input="proofText" aria-label="Sample text" value="${esc(p.text)}"></div>
    <div class="proof-info">${grp && p.preset === 'spacing' ? `<span>Spacing proof · ${grp.name}</span><button class="btn btn--minimal btn--sm" type="button" data-act="clearProofGroup" data-k="pg-clear">Clear</button>` : ''}
      ${p.exported ? `<span class="badge badge--peach">${icon('verified', 'ms--xs')}Exported file · Bakery Sans Draft.otf</span>` : `<span>${icon('sync', 'ms--xs')} Live</span>`}</div>`);
}
/* real measurement of the drafted outlines (non-zero winding along a scan line) */
function windingAt(polys, pt) {
  let w = 0;
  for (const p of polys) for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length], cr = (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y);
    if (a.y <= pt.y) { if (b.y > pt.y && cr > 0) w++; } else if (b.y <= pt.y && cr < 0) w--;
  }
  return w;
}
function stemAt(ch, y) {
  const g = S.G[ch]; if (!hasOutline(g)) return null;
  const polys = g.cs.filter(c => c.closed).map(c => poly(c, 8)); let run = 0;
  for (let x = -60; x < g.adv + 60; x += 3) { if (windingAt(polys, { x, y }) !== 0) run += 3; else if (run) return run; }
  return run || null;
}
function gateMeasure() {
  const x = S.spec.xHeight, c = S.spec.capHeight, o = S.G.o, b = bounds(o.cs);
  const parts = [['n', stemAt('n', R(x * 0.4))], ['o', stemAt('o', R(x / 2))], ['H', stemAt('H', R(c * 0.25))], ['O', stemAt('O', R(c / 2))]];
  return parts.map(([l, v]) => `${l} stem ${v == null ? '—' : v}`).join(' · ') + (b ? ` · o overshoot ${-b.y0}` : '');
}

/* =====================================================================
   8. Set grid, cells, selection bar
   ===================================================================== */
const scopeChars = () => (S.view.all ? ALL : BASIC);
const visibleGroups = () => GROUPS.filter(g => g.basic || S.view.all);
function matchFilter(g) {
  const f = S.view.filter;
  if (f === 'all') return true;
  if (f === 'needs') return ['Draft', 'Held', 'Failed'].includes(g.status);
  return g.status === f;
}
function rGridTools() {
  const scope = scopeChars(), c = countBy(scope), f = S.view.filter, needs = c.Draft + c.Held + c.Failed;
  const fl = f === 'all' ? 'All' : f === 'needs' ? 'Needs you' : f, fn = f === 'all' ? scope.length : f === 'needs' ? needs : c[f];
  patch($('#grid-tools'), `<div class="filters"><button class="chip show-chip" type="button" aria-haspopup="menu" data-act="pop" data-pop="filter" data-k="f-menu" aria-label="Show: ${fl}, ${fn}"${f !== 'all' && f !== 'needs' ? ' aria-pressed="true"' : ''}>${icon('filter_list', 'ms--xs')}<span class="show-l">Show: ${fl}</span><span class="cnt">${fn}</span>${icon('expand_more', 'ms--xs')}</button>
    <button class="chip" type="button" aria-pressed="${f === 'needs'}" data-act="filter" data-f="${f === 'needs' ? 'all' : 'needs'}" data-k="f-needs" title="Drafts to review, held and failed glyphs">${icon('priority_high', 'ms--xs')}Needs you<span class="cnt">${needs}</span></button></div>
    <button class="chip group-switch" type="button" aria-pressed="${S.view.all}" data-act="toggleAll" data-k="allswitch" title="Show punctuation, symbols and spaces in the grid"><span class="sw" aria-hidden="true"></span>Punctuation &amp; symbols · <span class="num">54</span></button>`);
}
function tagOf(g) {
  if (g.component) return ['extension', `Uses component (${g.component}) · manual only`];
  if (g.out) return ['block', 'Outside set'];
  if (g.mine) return ['front_hand', 'You’ll draw this'];
  if (g.ch === ' ' || g.ch === NBSP) return ['space_bar', 'Empty by design'];
  if (g.auto) return ['crop_square', 'Made by Noddy'];
  if (g.bold && g.status !== 'Yours') return ['format_bold', 'Bolder draft'];
  if (g.from && ['Draft', 'Kept'].includes(g.status)) return ['link', 'Built from ' + g.from];
  if (g.spacingYours) return ['format_letter_spacing', 'Spacing set by you'];
  return null;
}
const cellLabel = ch => (ch === ' ' ? 'space' : ch === NBSP ? 'nbsp' : ch === NOTDEF ? '.notdef' : ch);
function cellTitle(g) { const t = tagOf(g); return `${dispName(g.ch)} · ${uplus(g.ch)} · ${g.status}${t ? ' · ' + t[1] : ''}${g.reason ? ' · ' + g.reason : ''}`; }
function cellSVG(g, w, h) {
  const ch = g.ch, sp = ch === ' ' || ch === NBSP;
  const adv = sp ? (g.adv > 0 ? g.adv : 560) : (hasOutline(g) ? g.adv : DEF_ADV);
  const W = w || 3444, H = h || 2520, x0 = R(adv / 2 - W / 2), id = cpId(ch);
  let inner;
  if (sp) inner = g.adv > 0 ? `<rect class="wbar" x="0" y="-50" width="${g.adv}" height="100"></rect>` : `<rect class="wbar-empty" x="0" y="-50" width="560" height="100"></rect>`;
  else if (g.status === 'Drafting') inner = (hasOutline(g) ? `<use href="#g-${id}" class="prev"></use>` : '') + (g.part && g.part.length ? `<path class="draftpart" d="${toD(g.part)}"></path>` : `<rect class="ghost" x="${R(DEF_ADV * 0.08)}" y="0" width="${R(DEF_ADV * 0.84)}" height="${ghostH(ch)}"></rect>`);
  else if (g.status === 'Failed' && g.failCs) inner = `<path class="failpart" d="${toD(g.failCs)}"></path>`;
  else if (hasOutline(g)) inner = `<use href="#g-${id}" class="ink"></use>`;
  else inner = `<rect class="ghost" x="${R(DEF_ADV * 0.08)}" y="0" width="${R(DEF_ADV * 0.84)}" height="${ghostH(ch)}"></rect>`;
  return `<svg viewBox="${x0} -1990 ${W} ${H}" aria-hidden="true" focusable="false"><g transform="scale(1,-1)">${inner}</g></svg>`;
}
function cellInner(g) {
  const t = tagOf(g);
  return `${cellSVG(g)}<span class="cell-row"><span class="cell-ch">${esc(cellLabel(g.ch))}</span><span class="cell-tag">${t ? icon(t[0]) : ''}</span></span><span class="cell-row">${stHTML(g.status)}</span>`;
}
function cellHTML(ch) {
  const g = S.G[ch], id = cpId(ch), html = cellInner(g);
  return `<button class="cell${S.editor.open && S.editor.ch === ch ? ' is-open' : ''}${S.flags.focusEdge && ch === 'Z' ? ' force-focus' : ''}" type="button" role="option" id="cell-${id}" data-act="cell" data-ch="${id}" data-k="cell-${id}" tabindex="${S.cursor === ch ? 0 : -1}" aria-selected="${S.sel.includes(ch)}" aria-label="${esc(dispName(ch) + ', ' + g.status)}" title="${esc(cellTitle(g))}">${html}</button>`;
}
function groupHeadHTML(grp) {
  const chars = grp.chars, c = countBy(chars), drawn = chars.filter(ch => isDrawn(S.G[ch])).length;
  const sum = [c.Draft && plural(c.Draft, 'draft'), c.Kept && `${c.Kept} kept`, c.Yours && `${c.Yours} yours`, c.Drafting && `${c.Drafting} drafting`, c.Queued && `${c.Queued} queued`, c.Failed && `${c.Failed} failed`, c.Held && `${c.Held} held`].filter(Boolean).join(' · ') || 'Nothing drawn yet';
  let slot = '';
  if (c.Draft) {
    slot = S.proof.seen[grp.id]
      ? `<button class="btn btn--primary btn--sm w140" type="button" data-act="keepAll" data-g="${grp.id}" data-k="ka-${grp.id}" title="Keep every draft in ${grp.name}. Cmd+Z undoes.">Keep all ${c.Draft}</button>`
      : `<button class="btn btn--sm w140" type="button" data-act="proofGroup" data-g="${grp.id}" data-k="ka-${grp.id}" title="Keep all unlocks after you’ve looked at this group in a spacing proof.">${icon('visibility', 'ms--sm')}Proof ${plural(c.Draft, 'draft')}</button>`;
  }
  const rng = grp.range ? grp.range + ' ' : '';
  let confirm = '';
  if (S.grpConfirm === grp.id) {
    const n = c.Draft;
    confirm = `<div class="inline-confirm" role="alertdialog" aria-label="Discard drafts in ${grp.name}"><p>Discard ${plural(n, 'draft')} in ${grp.name}? Kept and yours letters stay.</p>
      <button class="btn btn--sm w88" type="button" data-act="grpCancel" data-k="gc-cancel">Cancel</button><button class="btn btn--danger btn--sm w140" type="button" data-act="grpRevert" data-g="${grp.id}" data-k="gc-ok">Discard ${plural(n, 'draft')}</button></div>`;
  }
  return `<div class="grp-h"><h4 id="gt-${grp.id}">${grp.name}</h4><span class="grp-count num">${rng}${drawn}/${chars.length}</span><span class="grp-sum">${sum}</span>
    <span class="grp-act"><span class="grp-slot">${slot}</span><button class="icon-btn" type="button" data-act="pop" data-pop="grp" data-g="${grp.id}" data-k="gm-${grp.id}" aria-label="More for ${grp.name}" title="More for ${grp.name}">${icon('more_horiz')}</button></span></div>${confirm}`;
}
function outsideGroupHTML() {
  return `<section class="grp"><div class="grp-h"><h4>Outside set</h4><span class="grp-count num">${S.outside.length}</span><span class="grp-sum">Not in Latin Kernel. The agent can’t touch these, and export asks about them.</span>
    <span class="grp-act"><span class="grp-slot"><button class="btn btn--sm w104" type="button" data-act="toggleOutside" aria-expanded="${S.outsideOpen}" data-k="out-tog">${S.outsideOpen ? 'Collapse' : 'Show'}</button></span></span></div>
    ${S.outsideOpen ? `<div class="cells" role="listbox" aria-label="Outside set">${S.outside.map(cellHTML).join('')}</div>` : ''}</section>`;
}
function rGrid() {
  const sc = $('#grid-scroll'); let h = '';
  for (const grp of visibleGroups()) {
    const chars = grp.chars.filter(c => matchFilter(S.G[c]));
    if (S.view.filter !== 'all' && !chars.length) continue;
    const nd2 = grp.notdef && S.view.filter === 'all' ? cellHTML(NOTDEF) : '';
    h += `<section class="grp"><div id="gh-${grp.id}">${groupHeadHTML(grp)}</div><div class="cells" role="listbox" aria-multiselectable="true" aria-labelledby="gt-${grp.id}">${chars.map(cellHTML).join('')}${nd2}</div></section>`;
  }
  if (S.outside.length) h += outsideGroupHTML();
  if (S.view.filter !== 'all' && !h) h = `<div class="filter-hint">${icon('check', 'ms--sm')}Nothing here right now.</div>`;
  if (!S.view.all) {
    if (S.view.filter !== 'all') {
      const hid = [...LATER, ' ', NBSP].filter(c => matchFilter(S.G[c])).length;
      if (hid) h += `<div class="filter-hint">${icon('visibility_off', 'ms--sm')}${hid} more in punctuation &amp; symbols.<button class="btn btn--sm" type="button" data-act="toggleAll" data-k="hint-show">Show them</button></div>`;
    }
    h += `<div class="cells-more">${icon('visibility_off', 'ms--sm')}<span>Punctuation, symbols and spaces (54) are hidden.</span><button class="btn btn--sm" type="button" data-act="toggleAll" data-k="more-show">Show them</button></div>`;
  }
  patch(sc, h);
  dirtyCells.clear(); dirtyGroups.clear();
  syncRoving();
}
function rCells() {
  for (const ch of dirtyCells) {
    const el = document.getElementById('cell-' + cpId(ch)); if (!el) continue;
    const g = S.G[ch], html = cellInner(g);
    if (el._h !== html) { el.innerHTML = html; el._h = html; $('#grid-scroll')._h = null; }
    el.setAttribute('aria-selected', String(S.sel.includes(ch)));
    el.classList.toggle('is-open', !!(S.editor.open && S.editor.ch === ch));
    el.setAttribute('aria-label', dispName(ch) + ', ' + g.status);
    el.title = cellTitle(g);
  }
  dirtyCells.clear();
  for (const gid of dirtyGroups) { const el = document.getElementById('gh-' + gid); const grp = GROUPS.find(x => x.id === gid); if (el && grp) { patch(el, groupHeadHTML(grp)); $('#grid-scroll')._h = null; } }
  dirtyGroups.clear();
}
function syncRoving() {
  const cells = $$('#grid-scroll .cell'); if (!cells.length) return;
  let cur = document.getElementById('cell-' + cpId(S.cursor));
  if (!cur) { cur = cells[0]; S.cursor = chFromId(cur.dataset.ch); }
  cells.forEach(c => { c.tabIndex = c === cur ? 0 : -1; });
}
function lastReceipt(ch) { const it = S.rcptOf[ch]; return it ? it.entries[it.entries.length - 1] : null; }
function sbBtn(act, ch, lbl, o) {
  o = o || {};
  return `<button class="btn btn--sm ${o.w || 'w88'} ${o.cls || ''}" type="button" data-act="${act}" data-ch="${cpId(ch)}" data-k="sb-${act}"${o.dis ? ' disabled' : ''}${o.frozen ? ' aria-disabled="true"' : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${lbl}</button>`;
}
/* Selection-bar actions. On a phone (monitor mode) every button is 72px so a Draft's actions fit, and the drawing action
   becomes an enabled View, whose editor banner says why drawing is off, instead of a disabled button explained only in a tooltip. */
function selActs(ch) {
  const g = S.G[ch], narrow = tier() === 'narrow', conn = S.model.connected, ro = S.flags.readOnly;
  const frozen = !!(S.selFreeze && S.selFreeze.ch === ch && Date.now() < S.selFreeze.until);
  const B = (act, lbl, o) => sbBtn(act, ch, lbl, Object.assign({ w: narrow ? 'w72' : 'w88' }, o || {}, { frozen }));
  const ag = { dis: !conn || ro, title: conn ? '' : 'Connect a model to use the agent' };
  const mut = o => Object.assign({ dis: ro, title: ro ? 'This tab is read-only' : '' }, o || {});
  const draw = (lbl, o) => (narrow ? B('open', 'View', { title: 'View only. Drawing needs a window at least 760px wide.' }) : B('open', lbl, o));
  if (ch === ' ' || ch === NBSP) return B('setspace', 'Set width', mut({ w: 'w88' }));
  if (ch === NOTDEF) return draw('Edit by hand', { w: 'w104' });
  if (g.out) return draw('Open');
  switch (g.status) {
    case 'Draft': return B('keep', 'Keep', mut({ cls: 'btn--primary' })) + (narrow ? '' : draw('Edit by hand', { w: 'w104' })) + B('redo', 'Redo', ag) + B('revert', 'Revert', mut());
    case 'Kept': return draw('Edit by hand', { w: 'w104' }) + B('redo', 'Redo', ag) + B('revert', 'Revert', mut());
    case 'Yours': return draw('Edit') + (g.before !== undefined ? B('revert', 'Revert', mut()) : '');
    case 'Queued': return B('mine', 'I’ll draw this', mut({ w: 'w104' })) + B('hold', 'Hold', mut()) + draw('Open');
    case 'Drafting': return B('open', 'Watch') + B('takeover', 'Take over', mut({ w: 'w88', dis: ro || narrow, title: narrow ? 'Drawing needs a window at least 760px wide' : ro ? 'This tab is read-only' : '' }));
    case 'Held': return B('release', g.mine ? 'Give back' : 'Back in queue', mut({ w: 'w104' })) + draw('Draw');
    case 'Failed': return (g.failKind === 'direction' ? B('fixdir', 'Fix direction', mut({ cls: 'btn--primary', w: 'w104' })) : '') + B('retry', 'Retry', ag) + draw('Draw it myself', { w: 'w120' });
    default:
      if (g.component) return draw('Draw', { cls: 'btn--primary' });
      return draw('Draw', { cls: 'btn--primary' }) + (S.run.queue.length || S.plan ? B('mine', 'I’ll draw this', mut({ w: 'w104' })) : '');
  }
}
function miniGlyph(ch, cls) {
  const g = S.G[ch]; if (!g) return '';
  return cellSVG(g, 2600, 2600).replace('<svg ', `<svg class="${cls || ''}" `);
}
function rSelbar() {
  const el = $('#selbar'); const recent = recentMsg();
  if (S.sel.length === 1 && S.G[S.sel[0]]) {
    const ch = S.sel[0], g = S.G[ch], r = lastReceipt(ch), t = tagOf(g);
    const line = recent || (g.status === 'Failed' ? g.reason : r ? r.line : g.reason || `${uplus(ch)} · ${gname(ch)}${t ? ' · ' + t[1] : ''}`);
    patch(el, `<div class="selbar-glyph">${miniGlyph(ch)}</div><div class="selbar-info"><b>${esc(dispName(ch))} · ${g.status}</b><span>${esc(line)}</span></div><div class="selbar-acts">${selActs(ch)}</div>`);
  } else if (S.sel.length > 1) {
    const d = S.sel.filter(c => S.G[c] && S.G[c].status === 'Draft');
    patch(el, `<div class="selbar-info"><b>${S.sel.length} selected</b><span>${esc(recent || (d.length ? plural(d.length, 'draft') + ' among them' : 'No drafts among them'))}</span></div>
      <div class="selbar-acts">${d.length ? `<button class="btn btn--primary btn--sm w120" type="button" data-act="keepSel" data-k="sb-keepsel"${S.flags.readOnly ? ' disabled' : ''}>Keep ${plural(d.length, 'draft')}</button>` : ''}<button class="btn btn--sm w72" type="button" data-act="clearSel" data-k="sb-clear">Clear</button></div>`);
  } else {
    patch(el, `<div class="selbar-info"><b>${esc(recent || 'Nothing selected')}</b><span class="lbl-long">Click a letter to select it. Double-click or press Enter to open it. Right-click for more.</span></div>`);
  }
}

/* =====================================================================
   9. Glyph editor, opened in the grid's own box
   ===================================================================== */
const MODE_OWNER = {
  own: ['owner--you', 'person', 'Yours while open'], 'watch-ask': ['owner--agent', 'pending', 'Agent drafting'], watch: ['owner--agent', 'visibility', 'Watching · read-only'],
  agent: ['owner--agent', 'forum', 'Agent editing'], ro: ['owner--ro', 'lock', 'Read-only'], monitor: ['owner--ro', 'visibility', 'View only'],
};
function buildEditorSkeleton() {
  $('#editorview').innerHTML = `<div class="ed-head" id="ed-head"></div>
    <div class="ed-body" id="ed-body">
      <div class="ed-rail" id="ed-rail" role="toolbar" aria-label="Tools" aria-orientation="vertical"></div>
      <div class="ed-canvas-wrap"><div class="ed-canvas" id="ed-canvas">
        <svg id="ed-svg" class="ed-svg" tabindex="0" role="application" aria-label="Edit canvas" xmlns="${SVGNS}"></svg>
        <div id="ed-banner"></div>
        <button id="done-pill" class="done-pill" type="button" data-act="donePath" hidden>Done creating path</button>
        <div id="ed-hint" class="ed-hint"></div>
        <div class="zoom-cluster" id="zoom" role="toolbar" aria-label="Zoom"></div>
      </div></div>
      <aside class="ed-insp" id="ed-insp" aria-label="Inspector"></aside>
    </div>`;
  const svg = $('#ed-svg');
  svg.addEventListener('pointerdown', edDown);
  svg.addEventListener('pointermove', edMove);
  svg.addEventListener('pointerup', edUp);
  svg.addEventListener('pointercancel', edUp);
  svg.addEventListener('pointerleave', () => { if (S.editor.open && !S.editor.drag) { S.editor.hover = null; inval('edCanvas'); } });
  svg.addEventListener('wheel', edWheel, { passive: false });
}
function edRO() { return S.editor.mode !== 'own'; }
function rEditor() {
  const ed = S.editor; if (!ed.open) return;
  const ch = ed.ch, g = S.G[ch], own = MODE_OWNER[ed.mode];
  const hasBefore = !!(g.before && g.before.length);
  const ro = S.flags.readOnly;
  patch($('#ed-head'), `<button class="icon-btn" type="button" data-act="edPrev" data-k="ed-prev" aria-label="Previous glyph ([)" title="Previous glyph ([)">${icon('chevron_left')}</button>
    <button class="icon-btn" type="button" data-act="edNext" data-k="ed-next" aria-label="Next glyph (])" title="Next glyph (])">${icon('chevron_right')}</button>
    <div class="ed-glyph"><b>${esc(cellLabel(ch))}</b><span>${esc(gname(ch))} · <span class="num">${uplus(ch)}</span></span></div>
    <span class="owner ${own[0]}">${icon(own[1], 'ms--xs')}${own[2]}</span>${stHTML(g.status)}
    <span class="ed-sp"></span>
    <div class="ed-acts">
      ${hasBefore ? `<button class="btn btn--sm icon-when-narrow" type="button" aria-pressed="${ed.ba}" data-act="edBA" data-k="ed-ba" aria-label="Before/After" title="Before/After: show the previous outline under this one">${icon('compare', 'ms--sm')}<span class="lbl">Before/After</span></button>` : ''}
      ${g.status === 'Draft' ? `<button class="btn btn--primary btn--sm w72" type="button" data-act="keep" data-ch="${cpId(ch)}" data-k="ed-keep"${ro ? ' disabled' : ''}>Keep</button>
        <button class="btn btn--sm w72" type="button" data-act="redo" data-ch="${cpId(ch)}" data-k="ed-redo"${S.model.connected && !ro ? '' : ' disabled'}>Redo</button>
        <button class="btn btn--sm w72" type="button" data-act="revert" data-ch="${cpId(ch)}" data-k="ed-revert"${ro ? ' disabled' : ''}>Revert</button>` : ''}
      ${ed.mode === 'own' && S.model.connected && !g.component && !g.out ? `<button class="btn btn--sm icon-when-narrow" type="button" data-act="handToAgent" data-k="ed-hand" aria-label="Hand to agent" title="Hand to agent: it edits this glyph and your tools turn off until it’s done">${icon('forum', 'ms--sm')}<span class="lbl">Hand to agent</span></button>` : ''}
      ${ed.mode === 'agent' ? `<button class="btn btn--sm" type="button" data-act="takeBack" data-k="ed-takeback">Take back</button>` : ''}
      <button class="icon-btn" type="button" data-act="closeEditor" data-k="ed-close" aria-label="Close editor (Esc)" title="Close (Esc)">${icon('close')}</button>
    </div>`);
  let rail = '';
  for (const t of TOOLS) {
    if (!t) { rail += '<span class="gap20" aria-hidden="true"></span>'; continue; }
    rail += `<button class="tool" type="button" aria-pressed="${ed.tool === t.id}" aria-disabled="${edRO()}" data-act="tool" data-tool="${t.id}" data-k="tool-${t.id}" title="${t.name} (${t.key})" aria-label="${t.name} (${t.key})">${icon(t.icon)}</button>`;
  }
  patch($('#ed-rail'), rail);
  rEdBanner(); rEdInsp(); rEdChrome();
}
function rEdBanner() {
  const ed = S.editor, ch = ed.ch, g = S.G[ch], n = esc(dispName(ch));
  let h = '';
  if (ed.mode === 'watch-ask') h = `<div class="ed-banner" role="status">${icon('pending')}<span><b>Agent is drafting ${n}.</b> Watch it form, or take over and draw it yourself.</span><span class="sp"></span>
    <button class="btn btn--sm w88" type="button" data-act="watch" data-k="bn-watch">Watch</button><button class="btn btn--primary btn--sm w104" type="button" data-act="takeover" data-ch="${cpId(ch)}" data-k="bn-take">Take over</button></div>`;
  else if (ed.mode === 'watch') h = `<div class="ed-banner" role="status">${icon('visibility')}<span><b>Watching ${n}.</b> Read-only until the agent finishes.</span><span class="sp"></span><button class="btn btn--sm w104" type="button" data-act="takeover" data-ch="${cpId(ch)}" data-k="bn-take">Take over</button></div>`;
  else if (ed.mode === 'agent') h = `<div class="ed-banner" role="status">${icon('forum')}<span><b>Agent editing ${n}.</b> ${ed.note ? esc(ed.note) : 'Your tools are off until it’s done.'}</span><span class="sp"></span><button class="btn btn--primary btn--sm w104" type="button" data-act="takeBack" data-k="bn-takeback">Take back</button></div>`;
  else if (ed.mode === 'ro') h = `<div class="ed-banner ed-banner--warn" role="status">${icon('lock')}<span><b>This tab is read-only.</b> Bakery Sans is open in another tab.</span><span class="sp"></span><button class="btn btn--sm" type="button" data-act="editHere" data-k="bn-edithere">Edit here instead</button></div>`;
  else if (ed.mode === 'monitor') h = `<div class="ed-banner" role="status">${icon('desktop_windows')}<span><b>Drawing needs a window at least 760px wide.</b> You can keep, redo or revert from the grid.</span></div>`;
  else if (ed.drawing != null) h = ''; /* while a path is open, info banners step aside so the Done pill is reachable */
  else if (ed.agentDone) h = `<div class="ed-banner" role="status">${icon('check_circle')}<span><b>Agent finished ${n}.</b> It’s a draft until you keep it.${g.before && g.before.length ? ' Before/After shows what changed.' : ''}</span><span class="sp"></span><button class="icon-btn" type="button" data-act="dismissDone" data-k="bn-x" aria-label="Dismiss">${icon('close')}</button></div>`;
  else if (g.status === 'Failed') h = `<div class="ed-banner ed-banner--warn" role="status">${icon('error')}<span><b>${esc(g.reason)}</b></span><span class="sp"></span>
    ${g.failKind === 'direction' ? `<button class="btn btn--primary btn--sm w104" type="button" data-act="fixdir" data-ch="${cpId(ch)}" data-k="bn-fix">Fix direction</button>` : ''}
    <button class="btn btn--sm w72" type="button" data-act="retry" data-ch="${cpId(ch)}" data-k="bn-retry"${S.model.connected ? '' : ' disabled'}>Retry</button></div>`;
  else if (g.component) h = `<div class="ed-banner" role="status">${icon('extension')}<span><b>Uses component (${esc(g.component)}).</b> Manual only: the agent can’t edit components in v1.</span></div>`;
  else if (ed.note) h = `<div class="ed-banner" role="status">${icon('info')}<span>${esc(ed.note)}</span><span class="sp"></span><button class="icon-btn" type="button" data-act="dismissNote" data-k="bn-x" aria-label="Dismiss">${icon('close')}</button></div>`;
  patch($('#ed-banner'), h);
}
/* What the inspector checks: a Failed glyph is checked on its failed outline (that is what failed), not on its empty current one. */
function glyphCheck(g) {
  if (g.status === 'Failed' && !hasOutline(g)) {
    if (!g.failCs) return { ok: false, failed: true, cs: null, issues: [{ kind: 'cut', text: g.reason || 'The model’s answer was cut off, so there is no outline to check.' }] };
    const c = checkOutline(g.failCs);
    if (!c.issues.length) c.issues.push({ kind: g.failKind || 'check', text: g.reason });
    return { ok: false, failed: true, cs: g.failCs, issues: c.issues };
  }
  return Object.assign(checkOutline(g.cs), { failed: false, cs: g.cs });
}
function rEdInsp() {
  const ed = S.editor, g = S.G[ed.ch], ro = edRO() || S.flags.readOnly;
  $('#ed-body').classList.toggle('insp-off', !ed.insp);
  let h = `<div class="insp-toggle"><button class="icon-btn" type="button" data-act="toggleInsp" data-k="insp-t" aria-expanded="${ed.insp}" aria-label="${ed.insp ? 'Collapse' : 'Expand'} inspector" title="${ed.insp ? 'Collapse' : 'Expand'} inspector">${icon(ed.insp ? 'right_panel_close' : 'right_panel_open')}</button></div>`;
  if (ed.insp) {
    const s = sb(g), chk = glyphCheck(g), pcs = chk.cs && chk.cs.length ? chk.cs : null;
    const inp = (f, v, dis) => `<input id="in-${f}" class="input" data-change="spacing" data-f="${f}" data-k="in-${f}" inputmode="numeric" value="${v == null ? '' : v}"${dis ? ' readonly' : ''}>`;
    const fixBtn = is => (is.kind !== 'direction' || ro ? '' : chk.failed
      ? ` <button class="btn btn--sm" type="button" data-act="fixdir" data-ch="${cpId(ed.ch)}" data-k="fd-${is.ci}" style="margin-top:4px">Fix direction</button>`
      : ` <button class="btn btn--sm" type="button" data-act="fixdirOpen" data-ci="${is.ci}" data-k="fd-${is.ci}" style="margin-top:4px">Fix direction</button>`);
    h += `<section class="insp-sec"><h5>Glyph</h5><div class="insp-grid"><span>Name</span><span class="num" style="text-align:right">${esc(gname(ed.ch))}</span><span>Unicode</span><span class="num" style="text-align:right">${uplus(ed.ch)}</span></div></section>
      <section class="insp-sec"><h5>Metrics</h5><div class="insp-grid"><label for="in-adv">Advance</label>${inp('adv', g.adv, ro)}<label for="in-lsb">LSB</label>${inp('lsb', s.lsb, ro || s.lsb == null)}<label for="in-rsb">RSB</label>${inp('rsb', s.rsb, ro || s.rsb == null)}</div></section>
      <section class="insp-sec"><h5>Paths${chk.failed && pcs ? ' · failed draft' : ''}</h5>${pcs ? pcs.map((c, i) => `<div class="insp-line">${icon(c.closed ? 'trip_origin' : 'timeline')}<span>Contour ${i + 1} · ${plural(c.nodes.length, 'point')}${c.closed ? '' : ' · open'}</span></div>`).join('') : '<div class="insp-line muted">No paths yet.</div>'}</section>
      <section class="insp-sec"><h5>Quality checks</h5>${chk.ok ? `<div class="insp-line ok">${icon('check_circle')}<span>Outline check ok</span></div>`
        : chk.issues.map(is => `<div class="insp-line bad">${icon('error')}<span>${esc(is.text)}${fixBtn(is)}</span></div>`).join('')}</section>`;
  }
  patch($('#ed-insp'), h);
}
function hintText() {
  const ed = S.editor;
  if (ed.mode === 'monitor') return 'View only on narrow screens.';
  if (ed.mode !== 'own') return '';
  if (ed.panTool || ed.space) return 'Drag to pan.';
  return { pen: ed.drawing != null ? 'Click to add a point, drag to pull a curve. Click the first point to close. Esc ends the path.' : 'Click to place points. Drag to pull curves. Click the first point to close.',
    edit: 'Drag points or handles. Shift-click adds to the selection. Delete removes a point. Arrow keys nudge.',
    resize: 'Click a shape to select it, drag to move it.', rect: 'Drag to draw a rectangle.', oval: 'Drag to draw an oval.', addpt: 'Click on an outline to add a point.' }[ed.tool] || '';
}
function rEdChrome() {
  const ed = S.editor;
  $('#done-pill').hidden = ed.drawing == null || ed.mode !== 'own';
  /* the hint slot also carries the latest message (Path closed, Undid…, Removed a path…), since the selection bar is hidden here */
  const msg = recentMsg(), hint = msg || hintText(); const hel = $('#ed-hint');
  hel.textContent = hint; hel.hidden = !hint; hel.classList.toggle('ed-hint--msg', !!msg);
  $('#ed-svg').setAttribute('class', `ed-svg t-${ed.tool}${edRO() ? ' ro' : ''}${ed.space || ed.panTool ? ' space' : ''}`);
  $('#ed-svg').setAttribute('aria-label', `Edit canvas for ${dispName(ed.ch)}`);
  const pct = ed.view ? (ed.view.s * 100).toFixed(2) + '%' : '—';
  patch($('#zoom'), `<button class="icon-btn" type="button" data-act="zoomPan" aria-pressed="${!!ed.panTool}" data-k="z-pan" title="Pan the edit canvas (hold Space)" aria-label="Pan the edit canvas">${icon('pan_tool')}</button>
    <span class="wide-only"><button class="icon-btn" type="button" data-act="zoomOut" data-k="z-out" title="Zoom out 10%" aria-label="Zoom out 10%">${icon('zoom_out')}</button><span class="zoom-read num" aria-live="off">${pct}</span>
    <button class="icon-btn" type="button" data-act="zoomIn" data-k="z-in" title="Zoom in 10%" aria-label="Zoom in 10%">${icon('zoom_in')}</button>
    <button class="icon-btn" type="button" data-act="toggleFill" aria-pressed="${!ed.fill}" data-k="z-fill" title="Toggle fill / outline display mode" aria-label="Toggle fill or outline">${icon('contrast')}</button>
    <button class="icon-btn" type="button" data-act="zoom11" data-k="z-11" title="Zoom so 1 pixel = 1 em unit" aria-label="Zoom to 1:1">${icon('crop_free')}</button></span>
    <button class="icon-btn" type="button" data-act="zoomFit" data-k="z-fit" title="Zoom to fit a full em" aria-label="Zoom to fit a full em">${icon('fit_screen')}</button>
    <button class="icon-btn" type="button" disabled title="Pop out a live preview window (not in the prototype)" aria-label="Pop out a live preview window">${icon('open_in_new')}</button>`);
}
function fitView(W, H) {
  const ed = S.editor, g = S.G[ed.ch]; const adv = g.adv > 0 ? g.adv : DEF_ADV;
  const top = Math.max(S.spec.ascender, S.spec.capHeight, 1500) + 150, bot = Math.min(S.spec.descender, -300) - 130;
  const s = Math.max(0.02, Math.min((H - 24) / (top - bot), (W - 60) / (adv + 700)));
  ed.view = { s, tx: W / 2 - adv * s / 2, ty: (H - (top - bot) * s) / 2 + top * s };
  ed.viewW = W; ed.viewH = H; ed.userZoomed = false;
}
function displayCs() {
  const ed = S.editor, g = S.G[ed.ch];
  if (g.status === 'Drafting' && ed.mode !== 'own') return { cs: g.part && g.part.length ? g.part : g.cs, cls: g.part && g.part.length ? 'gdraft' : 'gfill' };
  return { cs: g.cs, cls: ed.fill ? 'gfill' : 'gline' };
}
function rEdCanvas() {
  const ed = S.editor; if (!ed.open) return;
  const svg = $('#ed-svg'); const W = svg.clientWidth || 600, H = svg.clientHeight || 400;
  if (!ed.view || (!ed.userZoomed && (ed.viewW !== W || ed.viewH !== H))) fitView(W, H);
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const v = ed.view, g = S.G[ed.ch], sp = S.spec;
  const X = x => v.tx + x * v.s, Y = y => v.ty - y * v.s, M = `matrix(${v.s} 0 0 ${-v.s} ${v.tx} ${v.ty})`;
  let out = '';
  const byVal = new Map();
  [['Ascender', sp.ascender], ['Cap', sp.capHeight], ['x-height', sp.xHeight], ['Baseline', 0], ['Descender', sp.descender]].forEach(([l, val]) => { if (!byVal.has(val)) byVal.set(val, []); byVal.get(val).push(l); });
  byVal.forEach((ls, val) => {
    const y = Math.round(Y(val)) + 0.5;
    out += `<line class="guide${val === 0 ? ' guide--base' : ''}" x1="0" x2="${W}" y1="${y}" y2="${y}"></line><text class="guide-l" x="8" y="${y - 4}">${ls.join(' · ')} ${fmtN(val)}</text>`;
  });
  const ax0 = Math.round(X(0)) + 0.5, ax1 = Math.round(X(g.adv)) + 0.5;
  out += `<line class="guide guide--adv" x1="${ax0}" x2="${ax0}" y1="0" y2="${H}"></line><line class="guide guide--adv" x1="${ax1}" x2="${ax1}" y1="0" y2="${H}"></line>`;
  out += `<text class="guide-l" x="${ax1 + 4}" y="${H - 10}">${g.adv}</text>`;
  if (ed.ba && g.before) out += `<path class="before" transform="${M}" vector-effect="non-scaling-stroke" d="${toD(g.before)}"></path>`;
  if (g.status === 'Failed' && g.failCs && !hasOutline(g)) out += `<path class="gfail" transform="${M}" vector-effect="non-scaling-stroke" d="${toD(g.failCs)}"></path>`;
  const dc = displayCs();
  if (dc.cs && dc.cs.length) {
    const ns = dc.cls === 'gfill' && !g.bold ? '' : (dc.cls === 'gfill' ? '' : ' vector-effect="non-scaling-stroke"');
    const bold = g.bold && dc.cls === 'gfill' ? ' stroke="oklch(0.2707 0.054 44.1725)" stroke-width="46" stroke-linejoin="round"' : '';
    out += `<path class="${dc.cls}" transform="${M}" d="${toD(dc.cs)}"${ns}${bold}></path>`;
  }
  if (ed.mode === 'own' && g.cs) {
    if (ed.tool === 'resize') {
      g.cs.forEach((c, ci) => { out += `<path class="hitc" data-ci="${ci}" transform="${M}" d="${toD([c])}" style="pointer-events:all"></path>`; });
      if (ed.selC != null && g.cs[ed.selC]) { const b = bounds([g.cs[ed.selC]]); if (b) out += `<rect class="bbox" x="${X(b.x0) - 4}" y="${Y(b.y1) - 4}" width="${(b.x1 - b.x0) * v.s + 8}" height="${(b.y1 - b.y0) * v.s + 8}"></rect>`; }
    }
    if (['edit', 'pen', 'addpt'].includes(ed.tool)) {
      let handles = '', pts = '';
      g.cs.forEach((c, ci) => c.nodes.forEach((n, ni) => {
        const key = ci + ':' + ni, sel = ed.sel.has(key);
        const last = ed.drawing === ci && ni === c.nodes.length - 1;
        if (showsHandles(ci, ni) || last) {
          if (n.ix != null) handles += `<line class="handle-l" x1="${X(n.x)}" y1="${Y(n.y)}" x2="${X(n.ix)}" y2="${Y(n.iy)}"></line><circle class="handle" cx="${X(n.ix)}" cy="${Y(n.iy)}" r="3.5"></circle>`;
          if (n.ox != null) handles += `<line class="handle-l" x1="${X(n.x)}" y1="${Y(n.y)}" x2="${X(n.ox)}" y2="${Y(n.oy)}"></line><circle class="handle" cx="${X(n.ox)}" cy="${Y(n.oy)}" r="3.5"></circle>`;
        }
        const first = ed.drawing === ci && ni === 0;
        const near = first && ed.hover && c.nodes.length >= 2 && Math.hypot(ed.hover.x - X(n.x), ed.hover.y - Y(n.y)) < 10;
        const cls = `pt${sel ? ' sel' : ''}${first ? ' first' : ''}${near ? ' near' : ''}`;
        const r = near ? 6 : 4;
        pts += n.sm ? `<circle class="${cls}" cx="${X(n.x)}" cy="${Y(n.y)}" r="${r}"></circle>` : `<rect class="${cls}" x="${X(n.x) - r + 0.5}" y="${Y(n.y) - r + 0.5}" width="${2 * r - 1}" height="${2 * r - 1}"></rect>`;
      }));
      out += handles + pts;
    }
    if (ed.tool === 'pen' && ed.drawing != null && ed.hover && !ed.drag && g.cs[ed.drawing]) {
      const c = g.cs[ed.drawing], a = c.nodes[c.nodes.length - 1], hx = ed.hover.x, hy = ed.hover.y;
      out += a.ox != null ? `<path class="rubber" d="M${X(a.x)} ${Y(a.y)}C${X(a.ox)} ${Y(a.oy)} ${hx} ${hy} ${hx} ${hy}"></path>` : `<line class="rubber" x1="${X(a.x)}" y1="${Y(a.y)}" x2="${hx}" y2="${hy}"></line>`;
    }
  }
  svg.innerHTML = out;
  const zr = $('#zoom .zoom-read'); if (zr) zr.textContent = (v.s * 100).toFixed(2) + '%';
}
function showsHandles(ci, ni) {
  const ed = S.editor; if (ed.tool !== 'edit') return false;
  const c = S.G[ed.ch].cs[ci]; const L = c.nodes.length;
  return ed.sel.has(ci + ':' + ni) || ed.sel.has(ci + ':' + ((ni + 1) % L)) || ed.sel.has(ci + ':' + ((ni - 1 + L) % L));
}
/* pointer handling */
function ptOf(e) { const r = $('#ed-svg').getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function toF(p) { const v = S.editor.view; return { x: R((p.x - v.tx) / v.s), y: R((v.ty - p.y) / v.s) }; }
function toP(x, y) { const v = S.editor.view; return { x: v.tx + x * v.s, y: v.ty - y * v.s }; }
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function live(presence) { const ch = S.editor.ch; defPath(ch); invalCell(ch); inval('edCanvas'); if (presence) inval('proofBody'); }
function liveCommit() { const ch = S.editor.ch; S.G[ch].ver++; inval('editor', 'proofHead', 'selbar', 'proofBody'); }
function pushUndo() {
  const ed = S.editor, g = S.G[ed.ch];
  ed.undo.push(JSON.stringify({ cs: g.cs, adv: g.adv, drawing: ed.drawing }));
  if (ed.undo.length > 300) ed.undo.shift();
  ed.redo = [];
}
function restoreSnap(js) {
  const ed = S.editor, g = S.G[ed.ch], st = JSON.parse(js);
  g.cs = st.cs; g.adv = st.adv;
  ed.drawing = st.drawing != null && g.cs && g.cs[st.drawing] && !g.cs[st.drawing].closed ? st.drawing : null;
  ed.sel = new Set(); ed.selC = null; ed.drag = null;
  live(true); liveCommit();
}
function edUndo() {
  const ed = S.editor; if (!ed.undo || !ed.undo.length) return false;
  const g = S.G[ed.ch]; ed.redo.push(JSON.stringify({ cs: g.cs, adv: g.adv, drawing: ed.drawing }));
  restoreSnap(ed.undo.pop()); return true;
}
function edRedo() {
  const ed = S.editor; if (!ed.redo || !ed.redo.length) return false;
  const g = S.G[ed.ch]; ed.undo.push(JSON.stringify({ cs: g.cs, adv: g.adv, drawing: ed.drawing }));
  restoreSnap(ed.redo.pop()); return true;
}
function blockedNote() {
  const ed = S.editor, n = dispName(ed.ch);
  if (ed.mode === 'agent') ed.note = `The agent is editing ${n}. Take back to use the pen.`;
  else if (ed.mode === 'watch' || ed.mode === 'watch-ask') say(`Read-only while the agent drafts ${n}. Take over to edit it.`);
  else if (ed.mode === 'monitor') say('Drawing needs a window at least 760px wide.');
  else if (ed.mode === 'ro') say('This tab is read-only. Choose “Edit here instead” first.');
  inval('editor');
}
function hitTest(g, p) {
  if (!g.cs) return null;
  for (let ci = 0; ci < g.cs.length; ci++) {
    const c = g.cs[ci];
    for (let ni = 0; ni < c.nodes.length; ni++) {
      if (!showsHandles(ci, ni)) continue;
      const n = c.nodes[ni];
      if (n.ix != null && dist(p, toP(n.ix, n.iy)) < 7) return { ci, ni, h: 'i' };
      if (n.ox != null && dist(p, toP(n.ox, n.oy)) < 7) return { ci, ni, h: 'o' };
    }
  }
  for (let ci = 0; ci < g.cs.length; ci++) {
    const c = g.cs[ci];
    for (let ni = 0; ni < c.nodes.length; ni++) if (dist(p, toP(c.nodes[ni].x, c.nodes[ni].y)) < 8) return { ci, ni };
  }
  return null;
}
function edDown(e) {
  const ed = S.editor; if (!ed.open || !ed.view) return;
  if (e.button !== 0 && e.button !== 1) return;
  const svg = e.currentTarget, p = ptOf(e);
  try { svg.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault();
  if (document.activeElement !== svg) svg.focus({ preventScroll: true });
  if (e.button === 1 || ed.space || ed.panTool) { ed.drag = { type: 'pan', p0: p, tx: ed.view.tx, ty: ed.view.ty }; return; }
  if (edRO()) { blockedNote(); return; }
  if (S.flags.readOnly) { say('This tab is read-only.'); return; }
  const g = S.G[ed.ch], f = toF(p);
  if (ed.tool === 'pen') penDown(g, p, f);
  else if (ed.tool === 'edit') {
    const hit = hitTest(g, p);
    if (hit && hit.h) { ed.drag = { type: 'handle', ci: hit.ci, ni: hit.ni, h: hit.h, alt: e.altKey }; }
    else if (hit) {
      const key = hit.ci + ':' + hit.ni;
      if (e.shiftKey) { if (ed.sel.has(key)) ed.sel.delete(key); else ed.sel.add(key); }
      else if (!ed.sel.has(key)) ed.sel = new Set([key]);
      const orig = new Map(); ed.sel.forEach(k => { const [ci, ni] = k.split(':').map(Number); const n = g.cs[ci] && g.cs[ci].nodes[ni]; if (n) orig.set(k, Object.assign({}, n)); });
      ed.drag = { type: 'nodes', f0: f, orig };
    } else { ed.sel = new Set(); }
    inval('edCanvas');
  } else if (ed.tool === 'resize') {
    const t = e.target.closest && e.target.closest('[data-ci]');
    if (t) { const ci = Number(t.getAttribute('data-ci')); ed.selC = ci; ed.drag = { type: 'contour', ci, f0: f, orig: clone([g.cs[ci]])[0] }; }
    else ed.selC = null;
    inval('edCanvas');
  } else if (ed.tool === 'rect' || ed.tool === 'oval') {
    pushUndo(); if (!g.cs) g.cs = [];
    const wasEmpty = !hasOutline(g);
    g.cs.push({ closed: true, nodes: [nd(f.x, f.y), nd(f.x, f.y), nd(f.x, f.y), nd(f.x, f.y)] });
    ed.drag = { type: 'shape', kind: ed.tool, ci: g.cs.length - 1, f0: f };
    live(wasEmpty);
  } else if (ed.tool === 'addpt') {
    let best = null;
    (g.cs || []).forEach((c, ci) => {
      const segs = c.closed ? c.nodes.length : c.nodes.length - 1;
      for (let k = 0; k < segs; k++) for (let i = 1; i < 32; i++) {
        const q = bez(c.nodes[k], c.nodes[(k + 1) % c.nodes.length], i / 32), d = dist(p, toP(q.x, q.y));
        if (d < 9 && (!best || d < best.d)) best = { d, ci, k, t: i / 32 };
      }
    });
    if (best) { pushUndo(); const ni = splitSeg(g.cs[best.ci], best.k, best.t); ed.sel = new Set([best.ci + ':' + ni]); live(false); liveCommit(); say('Added a point. Switch to Path edit (V) to move it.'); }
  }
}
function penDown(g, p, f) {
  const ed = S.editor; if (!g.cs) g.cs = [];
  if (ed.note) { ed.note = ''; inval('editor'); }
  if (ed.drawing != null && g.cs[ed.drawing]) {
    const c = g.cs[ed.drawing], first = c.nodes[0];
    if (c.nodes.length >= 2 && dist(p, toP(first.x, first.y)) < 10) {
      pushUndo(); c.closed = true; ed.drawing = null; ed.drag = { type: 'newpt', node: first, p0: p };
      live(false); inval('editor'); return;
    }
    pushUndo(); const n = nd(f.x, f.y); c.nodes.push(n); ed.drag = { type: 'newpt', node: n, p0: p }; live(false); return;
  }
  pushUndo();
  const wasEmpty = !hasOutline(g);
  g.cs.push({ closed: false, nodes: [nd(f.x, f.y)] }); ed.drawing = g.cs.length - 1;
  ed.drag = { type: 'newpt', node: g.cs[ed.drawing].nodes[0], p0: p };
  live(wasEmpty); inval('editor');
}
function edMove(e) {
  const ed = S.editor; if (!ed.open || !ed.view) return;
  const p = ptOf(e);
  if (!ed.drag) { if (ed.tool === 'pen' && ed.mode === 'own' && ed.drawing != null) { ed.hover = p; inval('edCanvas'); } return; }
  const d = ed.drag, g = S.G[ed.ch], f = toF(p);
  if (d.type === 'pan') { ed.view.tx = d.tx + (p.x - d.p0.x); ed.view.ty = d.ty + (p.y - d.p0.y); ed.userZoomed = true; inval('edCanvas'); return; }
  if (d.type === 'newpt') {
    if (dist(p, d.p0) > 3) { const n = d.node; n.ox = f.x; n.oy = f.y; n.ix = 2 * n.x - f.x; n.iy = 2 * n.y - f.y; n.sm = true; live(false); }
    return;
  }
  if (d.type === 'nodes') {
    const dx = f.x - d.f0.x, dy = f.y - d.f0.y;
    if (!d.pushed) { if (!dx && !dy) return; pushUndo(); d.pushed = true; }
    d.orig.forEach((o, k) => {
      const [ci, ni] = k.split(':').map(Number); const n = g.cs[ci].nodes[ni];
      n.x = o.x + dx; n.y = o.y + dy;
      if (o.ix != null) { n.ix = o.ix + dx; n.iy = o.iy + dy; }
      if (o.ox != null) { n.ox = o.ox + dx; n.oy = o.oy + dy; }
    });
    live(false); return;
  }
  if (d.type === 'handle') {
    if (!d.pushed) { pushUndo(); d.pushed = true; }
    const n = g.cs[d.ci].nodes[d.ni]; n[d.h + 'x'] = f.x; n[d.h + 'y'] = f.y;
    if (d.alt) n.sm = false;
    const o = d.h === 'i' ? 'o' : 'i';
    if (n.sm && n[o + 'x'] != null) {
      const len = Math.hypot(n[o + 'x'] - n.x, n[o + 'y'] - n.y), vx = n.x - f.x, vy = n.y - f.y, l = Math.hypot(vx, vy) || 1;
      n[o + 'x'] = R(n.x + vx / l * len); n[o + 'y'] = R(n.y + vy / l * len);
    }
    live(false); return;
  }
  if (d.type === 'contour') {
    const dx = f.x - d.f0.x, dy = f.y - d.f0.y;
    if (!d.pushed) { if (!dx && !dy) return; pushUndo(); d.pushed = true; }
    g.cs[d.ci].nodes.forEach((n, i) => { const o = d.orig.nodes[i]; n.x = o.x + dx; n.y = o.y + dy; if (o.ix != null) { n.ix = o.ix + dx; n.iy = o.iy + dy; } if (o.ox != null) { n.ox = o.ox + dx; n.oy = o.oy + dy; } });
    live(false); return;
  }
  if (d.type === 'shape') {
    const x0 = Math.min(d.f0.x, f.x), x1 = Math.max(d.f0.x, f.x), y0 = Math.min(d.f0.y, f.y), y1 = Math.max(d.f0.y, f.y);
    const c = g.cs[d.ci];
    if (d.kind === 'rect') c.nodes = [nd(x0, y0), nd(x0, y1), nd(x1, y1), nd(x1, y0)];
    else {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = 0.5523, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
      const mk = (x, y, ix, iy, ox, oy) => ({ x: R(x), y: R(y), ix: R(ix), iy: R(iy), ox: R(ox), oy: R(oy), sm: true });
      c.nodes = [mk(x0, cy, x0, cy - k * ry, x0, cy + k * ry), mk(cx, y1, cx - k * rx, y1, cx + k * rx, y1), mk(x1, cy, x1, cy + k * ry, x1, cy - k * ry), mk(cx, y0, cx + k * rx, y0, cx - k * rx, y0)];
    }
    live(false);
  }
}
function edUp() {
  const ed = S.editor; if (!ed.open) return;
  const d = ed.drag; ed.drag = null;
  if (!d) return;
  if (d.type === 'pan') { inval('editor'); return; }
  if (d.type === 'shape') {
    const g = S.G[ed.ch], b = bounds([g.cs[d.ci]]);
    if (!b || (b.x1 - b.x0 < 12 && b.y1 - b.y0 < 12)) { g.cs.splice(d.ci, 1); ed.undo.pop(); live(true); return; }
  }
  if (d.type === 'nodes' && !d.pushed) return;
  live(true); liveCommit();
}
function edWheel(e) {
  const ed = S.editor; if (!ed.open || !ed.view) return;
  e.preventDefault();
  if (e.ctrlKey || e.metaKey) { zoomAt(Math.exp(-e.deltaY * 0.01), ptOf(e)); return; }
  ed.view.tx -= e.deltaX; ed.view.ty -= e.deltaY; ed.userZoomed = true; inval('edCanvas');
}
function zoomAt(f, p) {
  const v = S.editor.view; const ns = clamp(v.s * f, 0.02, 4); const k = ns / v.s;
  v.tx = p.x - (p.x - v.tx) * k; v.ty = p.y - (p.y - v.ty) * k; v.s = ns; S.editor.userZoomed = true; inval('edCanvas');
}
function zoomCenter(f) { const svg = $('#ed-svg'); zoomAt(f, { x: svg.clientWidth / 2, y: svg.clientHeight / 2 }); }
function endPath(silent) {
  const ed = S.editor; if (ed.drawing == null) return;
  const g = S.G[ed.ch], c = g.cs[ed.drawing];
  if (c && c.nodes.length >= 3) { pushUndo(); c.closed = true; if (!silent) say('Path closed.'); }
  else if (c) { pushUndo(); g.cs.splice(ed.drawing, 1); if (!silent) say('Removed a path with fewer than 3 points. Cmd+Z brings it back.'); }
  ed.drawing = null; ed.hover = null;
  live(true); liveCommit();
}
function deleteSel() {
  const ed = S.editor, g = S.G[ed.ch]; if (!ed.sel.size || !g.cs) return;
  pushUndo();
  const keys = [...ed.sel].map(k => k.split(':').map(Number)).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  keys.forEach(([ci, ni]) => { const c = g.cs[ci]; if (c) c.nodes.splice(ni, 1); });
  for (let i = g.cs.length - 1; i >= 0; i--) if (g.cs[i].nodes.length < 2) g.cs.splice(i, 1);
  ed.sel = new Set(); ed.drawing = null; live(true); liveCommit();
}
function nudge(dx, dy) {
  const ed = S.editor, g = S.G[ed.ch]; if (!ed.sel.size) return false;
  pushUndo();
  ed.sel.forEach(k => { const [ci, ni] = k.split(':').map(Number); const n = g.cs[ci] && g.cs[ci].nodes[ni]; if (!n) return; n.x += dx; n.y += dy; if (n.ix != null) { n.ix += dx; n.iy += dy; } if (n.ox != null) { n.ox += dx; n.oy += dy; } });
  live(false); liveCommit(); return true;
}
function editorOrder() { const sc = scopeChars(); return sc.includes(S.editor.ch) ? sc : ALL; }
function stepEditor(dir) { const o = editorOrder(), i = o.indexOf(S.editor.ch); openEditor(o[(i + dir + o.length) % o.length]); }
/* who controls the open glyph: the window width, the read-only tab, a hand-off to the agent, then a run drafting it */
function modeFor(g, opts) {
  if (tier() === 'narrow') return 'monitor';
  if (S.flags.readOnly) return 'ro';
  if (S.hand && S.hand.ch === g.ch) return 'agent';
  if (g.status === 'Drafting') return opts && opts.watch ? 'watch' : 'watch-ask';
  return 'own';
}
function openEditor(ch, opts) {
  opts = opts || {};
  const g = S.G[ch]; if (!g) return;
  /* opened from export preflight (or stepping from such an editor): closing returns to preflight */
  const fromPf = !!(S.preflight.open || (S.editor.open && S.editor.fromPf));
  if (S.preflight.open) { S.preflight.open = false; inval('preflight'); }
  if (S.editor.open) { if (S.editor.ch === ch) return; closeEditor({ retarget: true }); }
  const mode = modeFor(g, opts);
  const prevSel = S.sel.slice();
  S.editor = { open: true, ch, tool: opts.tool || (hasOutline(g) ? 'edit' : 'pen'), mode, undo: [], redo: [], snapCs: JSON.stringify(g.cs || null), snapAdv: g.adv, snapStatus: g.status,
    drawing: null, sel: new Set(), selC: null, ba: false, fill: true, view: null, insp: innerWidth >= 1180, note: '', hover: null, drag: null, space: false, panTool: false, agentDone: false, fromPf };
  S.sel = [ch]; S.cursor = ch;
  prevSel.forEach(invalCell); invalCell(ch);
  inval('shell', 'editor', 'edCanvas', 'proofHead', 'proofBody', 'selbar', 'composer', 'paneHead');
  later(() => { const svg = $('#ed-svg'); if (svg && S.editor.open) svg.focus({ preventScroll: true }); }, 0);
}
function closeEditor(opts) {
  opts = opts || {};
  const ed = S.editor; if (!ed.open) return;
  const ch = ed.ch, g = S.G[ch];
  if (ed.drawing != null) endPath(true);
  /* closing never cancels a hand-off: the agent keeps working and the glyph shows Drafting in the grid */
  if (ed.mode === 'agent' && S.hand && S.hand.ch === ch) say(`The agent keeps working on ${dispName(ch)}. It becomes a draft when it’s done.`);
  /* monitor mode counts as the user's: it may hold drawing made before the window got narrow */
  const mine = ed.mode === 'own' || ed.mode === 'monitor';
  const prevOutline = JSON.parse(ed.snapCs);
  if (mine && !hasOutline(g) && !(prevOutline && prevOutline.length)) g.cs = prevOutline; /* a pen click then Esc leaves nothing behind */
  if (mine && outlineKey(g.cs) !== outlineKey(prevOutline)) {
    const prevCs = prevOutline, prevStatus = ed.snapStatus, prevAdv = ed.snapAdv, prevMine = g.mine;
    if (!hasOutline(g)) { g.cs = null; g.status = 'Empty'; g.reason = ''; }
    else { g.status = 'Yours'; g.reason = 'Drawn by you. Runs skip it.'; }
    g.before = prevCs; g.beforeStatus = prevStatus === 'Drafting' ? 'Empty' : prevStatus; g.beforeAdv = prevAdv; g.mine = false; g.failCs = null; g.failKind = null;
    removeFromQueue(ch);
    S.history.push({ label: `Edit ${label(ch)}`, undo: () => { g.cs = prevCs; g.status = prevStatus; g.adv = prevAdv; g.mine = prevMine; g.reason = ''; fixQueued(ch); rebaseEditor(ch); touch(ch); } });
    say(hasOutline(g) ? `${dispName(ch)} is yours now. Runs will skip it.` : `${dispName(ch)} is empty again.`);
  } else if (mine && g.adv !== ed.snapAdv) {
    g.spacingYours = true; say(`Spacing of ${dispName(ch)} is yours. Its outline is unchanged.`);
  }
  const backToPf = ed.fromPf && !opts.retarget;
  S.editor = { open: false };
  touch(ch);
  inval('shell', 'proofHead', 'proofBody', 'selbar', 'composer', 'editor', 'paneHead');
  if (backToPf) {
    S.preflight.open = true; inval('shell', 'preflight');
    later(() => { const b = document.querySelector(`#preflightview [data-k="pf-${cpId(ch)}"]`) || document.querySelector('[data-k="pf-close"]'); if (b) b.focus(); }, 40);
    return;
  }
  if (!opts.retarget) later(() => { const c = document.getElementById('cell-' + cpId(ch)); if (c) { syncRoving(); c.focus({ preventScroll: false }); } }, 0);
}

/* =====================================================================
   10. Agent pane: run card, plan, thread, composer
   ===================================================================== */
function buildPaneSkeleton() {
  $('#pane').innerHTML = `<div class="pane-h" id="pane-h"></div><div id="pane-banner"></div><div id="runcard-wrap"></div>
    <div class="pane-scroll" id="pane-scroll"><div id="plan-wrap"></div><div id="thread" class="thread" role="log" aria-live="off" aria-label="Agent activity"></div></div><div id="composer" class="composer"></div>`;
}
function rPaneHead() {
  const m = curModel(), conn = S.model.connected;
  const caps = `${m.tools ? 'Tools' : 'No tools'} · ${m.vision ? 'Vision' : 'No vision'} · ${m.paid ? 'Paid' : 'Free'}`;
  patch($('#pane-h'), `<h4>Agent</h4><button class="model-chip" type="button" data-act="pop" data-pop="model" data-k="modelchip" title="${conn ? esc(`${m.name} · ${m.provider} · ${caps}`) : 'No model connected'}">${conn ? '<span class="ok-dot"></span>' : '<span class="no-dot"></span>'}<span>${conn ? esc(m.name) : 'No model'}</span></button>
    <span class="ed-sp"></span><button class="icon-btn" type="button" data-act="togglePane" data-k="pane-hide" aria-label="Hide the agent pane. A run keeps going." title="Hide (a run keeps going)">${icon(tier() === 'wide' ? 'right_panel_close' : 'close')}</button>`);
}
function rPaneBanner() {
  const m = curModel();
  patch($('#pane-banner'), S.flags.keyLost ? `<div class="pane-banner" role="status"><span><b>Your key isn’t kept after a reload.</b> ${esc(m.provider)} · ${esc(m.name)} is still selected; only the key is needed.</span>
    <div class="row"><button class="btn btn--primary btn--sm" type="button" data-act="reenterKey" data-k="kl-enter">Enter key</button><button class="btn btn--sm" type="button" data-act="drawWithout" data-k="kl-draw">Draw without the agent</button></div></div>` : '');
}
function planScope() {
  const p = S.plan || { punct: false, marks: {} };
  /* glyphs that use a component are manual only, so a run never takes them */
  return [...ORDER62, ...(p.punct ? LATER : [])].filter(ch => { const g = S.G[ch]; return ['Empty', 'Failed', 'Queued'].includes(g.status) && !g.component && !(p.marks && p.marks[ch]); });
}
function familyOf(ch) {
  if (CONTROLS.includes(ch)) return 'Control letters';
  for (const f of FAMILIES) for (const part of f.parts) if (part.includes(ch)) return `${f.title} · ${[...part].join(' ')}`;
  if (LATER.includes(ch)) return 'Punctuation & symbols';
  return '';
}
function gatePending(r) { return r.gateAfter && r.gateAfter.length ? r.gateAfter.filter(c => r.queue.includes(c)) : []; }
function waitingOnUser() {
  const r = S.run; if (r.job || !r.queue.length || !S.editor.open) return false;
  const g = gatePending(r); return (g.length ? g : r.queue).every(c => c === S.editor.ch);
}
function runSub() {
  const r = S.run; if (!r.job) return r.queue.length ? `${r.queue.length} left` : '';
  const kind = r.kind === 'bolder' ? 'Bolder · ' : '';
  const next = r.queue.slice(0, 3).map(label).join(' ');
  return esc(`${kind}${familyOf(r.job.ch)}${next ? ' · next ' + next : ''}`);
}
function rcBtn(act, lbl, o) {
  o = o || {};
  return `<button class="btn btn--sm ${o.w || 'w88'} ${o.cls || ''}" type="button" data-act="${act}" data-k="rc-${act}"${o.dis ? ' disabled' : ''}${o.title ? ` title="${esc(o.title)}"` : ''}>${lbl}</button>`;
}
function stopBtn(dis) { return `<span class="gap"></span><span class="vsep"></span>${rcBtn('askStop', icon('stop', 'ms--sm') + 'Stop', { w: 'w72', cls: 'btn--minimal', dis })}`; }
function runCardHTML() {
  const r = S.run, m = curModel(), conn = S.model.connected;
  const noModel = conn ? {} : { dis: true, title: 'Connect a model to continue the run' };
  const n = r.total ? `<span class="num">${r.done}/${r.total}</span>` : '';
  let ico = 'radio_button_unchecked', title = '', sub = '', ctrl = '', extra = '';
  switch (r.state) {
    case 'idle': title = conn ? 'No run yet' : 'No run'; sub = conn ? (S.comp.stage === 'brief' ? 'Send a brief to get a plan.' : 'Ask for a change, or draw letters yourself.') : 'Drawing works without a model.'; break;
    case 'ready': {
      const sc = planScope(), pend = S.prop ? Object.keys(S.prop).length : 0; ico = 'flag';
      title = `Draft ${plural(sc.length, 'glyph')} · stops at n o H O`;
      sub = pend ? `Review the ${plural(pend, 'spec value')} first` : 'Nothing is drawn until you press Run.';
      ctrl = rcBtn('runPlan', icon('play_arrow', 'ms--sm') + 'Run', { cls: 'btn--primary', dis: !!pend || S.flags.readOnly, title: pend ? 'Review the spec values first' : '' });
      break;
    }
    case 'running': ico = 'pending'; title = r.job ? `Drafting ${esc(label(r.job.ch))} · ${n}` : waitingOnUser() ? `Waiting for you to close ${esc(label(S.editor.ch))}` : `Working · ${n}`; sub = runSub(); ctrl = rcBtn('pause', icon('pause', 'ms--sm') + 'Pause') + stopBtn(); break;
    case 'pausing': ico = 'pause'; title = 'Pausing…'; sub = r.job ? esc(`Finishing ${label(r.job.ch)}, then pausing`) : 'Pausing'; ctrl = rcBtn('pause', 'Pausing…', { dis: true }) + stopBtn(); break;
    case 'paused': ico = 'pause_circle'; title = `Paused · ${n}`; sub = conn ? `${plural(r.queue.length, 'glyph')} left · nothing is lost` : 'Connect a model to resume. Nothing is lost.'; ctrl = rcBtn('resume', icon('play_arrow', 'ms--sm') + 'Resume', noModel) + stopBtn(); break;
    case 'stopping': ico = 'stop_circle'; title = 'Stopping…'; sub = r.discarding ? esc(`Discarding the draft of ${label(r.discarding)}`) : 'Finishing up'; ctrl = rcBtn('pause', 'Pause', { dis: true }) + stopBtn(true); break;
    case 'stopped': ico = 'stop_circle'; title = `Stopped · ${plural(r.drafted, 'draft')} stay`; sub = r.leftover ? `${plural(r.leftover, 'queued glyph')} not drafted` : ''; ctrl = r.leftover && conn ? rcBtn('runRest', 'Draft the rest', { w: 'w120' }) : ''; break;
    case 'gate': ico = 'flag'; title = 'Waiting for you · n o H O'; sub = 'Check the style in the proof to continue'; ctrl = stopBtn(); break;
    case 'waiting': ico = 'hourglass_top'; title = `Waiting <span class="num">${r.wait}</span> s · ${n}`; sub = `${esc(m.provider)} rate limit. Resumes on its own.`; ctrl = rcBtn('pause', icon('pause', 'ms--sm') + 'Pause') + stopBtn(); break;
    case 'cap': ico = 'payments'; title = `Paused at your ${money(r.cap)} cap`; sub = `${r.done} done · ${plural(r.queue.length, 'glyph')} left`; ctrl = rcBtn('raiseCap', `Raise to ${money(r.cap + 2)}`, Object.assign({ w: 'w120', cls: 'btn--primary' }, noModel)) + stopBtn(); break;
    case 'interrupted': ico = 'sync_problem'; title = `Interrupted at ${n}`; sub = 'The page reloaded during the run. Drafts so far are safe.';
      extra = `<div class="rc-line" style="padding-left:28px;gap:6px;flex-wrap:wrap">${rcBtn('resume', 'Resume', Object.assign({ cls: 'btn--primary' }, noModel))}${rcBtn('keepDrafts', 'End run, leave drafts', { w: 'w160', title: 'Ends the run. Its drafts stay drafts until you keep or revert them.' })}${rcBtn('askDiscardRun', 'Discard drafts', { w: 'w120', cls: 'btn--danger' })}</div>`; break;
    case 'offline': ico = 'wifi_off'; title = 'Can’t reach Noddy’s relay'; sub = 'Check your internet. The run is paused; nothing is lost.'; ctrl = rcBtn('retryRun', 'Retry', Object.assign({ w: 'w72', cls: 'btn--primary' }, noModel)); break;
    case 'down': ico = 'cloud_off'; title = `${esc(m.provider)} isn’t responding`; sub = conn ? 'Their server returned error 503. Your key is fine. Run paused.' : 'Connect a model to continue. Run paused.'; ctrl = rcBtn('retryRun', 'Retry', Object.assign({ w: 'w72', cls: 'btn--primary' }, noModel)); extra = `<div class="rc-line" style="padding-left:28px">${rcBtn('pickModel', 'Switch model', { w: 'w104' })}</div>`; break;
    case 'done': ico = 'check_circle'; title = `Run finished · ${r.drafted} drafted · ${r.failed} failed`; sub = 'Review the drafts, then export.'; ctrl = rcBtn('openPreflight', 'Preflight'); break;
    default: break;
  }
  const hasBar = r.total && !['idle', 'ready'].includes(r.state);
  const bar = `<div class="rc-bar" aria-hidden="true"${hasBar ? '' : ' style="visibility:hidden"'}><i style="width:${hasBar ? Math.round(r.done / r.total * 100) : 0}%"></i></div>`;
  const showMeta = !!(S.plan || r.total);
  const meta = showMeta ? `<div class="rc-meta"><span><span class="num">${money(r.spent)}</span> of <span class="num">${money(r.cap)}</span> cap · uncalibrated</span><span class="ed-sp"></span><button class="btn btn--minimal" type="button" data-act="toggleDetails" aria-expanded="${S.pane.details}" data-k="rc-details">Details ${icon(S.pane.details ? 'expand_less' : 'expand_more', 'ms--xs')}</button></div>` : '';
  let confirm = '';
  if (r.confirmStop) {
    const j = r.job;
    confirm = `<div class="inline-confirm" role="alertdialog" aria-label="Stop the run"><p>${j ? `Discard the draft of <b>${esc(label(j.ch))}</b> and stop?` : 'Stop the run?'} ${plural(r.drafted, 'draft')} stay.${r.queue.length ? ` ${plural(r.queue.length, 'queued glyph')} won’t be drafted.` : ''}</p>
      <button class="btn btn--sm w120" type="button" data-act="cancelStop" data-k="stop-cancel">Keep running</button><button class="btn btn--danger btn--sm w140" type="button" data-act="confirmStop" data-k="stop-ok">${j ? esc(`Stop, discard ${label(j.ch)}`) : 'Stop run'}</button></div>`;
  }
  if (r.confirmDiscard) {
    const d = runDrafts().length;
    confirm = `<div class="inline-confirm" role="alertdialog" aria-label="Discard drafts"><p>Discard ${plural(d, 'draft')} from this run? Kept and yours letters stay.</p>
      <button class="btn btn--sm w88" type="button" data-act="cancelDiscardRun" data-k="dr-cancel">Cancel</button><button class="btn btn--danger btn--sm w140" type="button" data-act="discardRun" data-k="dr-ok">Discard ${plural(d, 'draft')}</button></div>`;
  }
  return `<div class="runcard"><div class="rc-line"><span class="rc-ico">${icon(ico)}</span><div class="rc-txt"><b>${title}</b><span>${sub}</span></div></div><div class="rc-row2"${r.state === 'idle' ? ' hidden' : ''}>${bar}<div class="rc-ctrl">${ctrl}</div></div>${extra}${meta}${confirm}${S.pane.details && showMeta ? detailsHTML() : ''}</div>`;
}
function detailsHTML() {
  const r = S.run, left = r.queue.length + (r.job ? 1 : 0) || (r.state === 'ready' ? planScope().length : 0);
  const derived = planScope().filter(c => FROM[c]).length;
  return `<div class="rc-details"><div class="kv"><span>Spent so far</span><span class="num">${money(r.spent)}</span>
    <span>Spend cap</span><span><input class="input" style="width:72px;text-align:right" data-change="cap" data-k="cap-in" inputmode="decimal" aria-label="Spend cap in dollars" value="${r.cap.toFixed(2)}"></span>
    <span>Estimate for the rest</span><span class="num">~${money(left * 0.06)} · est.</span>
    <span>Built from other letters</span><span class="num">${derived}</span></div>
    <span class="hint">Estimates are uncalibrated until the drawing test runs. The run pauses at the cap.</span>
    <div><span class="meta">Checkpoints</span>${S.checkpoints.length ? S.checkpoints.map(cp => `<div class="cp-row">${icon('bookmark')}<span>${esc(cp.name)} <span class="muted num">${cp.time}</span></span><button class="btn btn--minimal btn--sm" type="button" data-act="askCp" data-id="${cp.id}" data-k="cp-${cp.id}">Go back</button></div>${S.cpConfirm === cp.id ? cpConfirmHTML(cp) : ''}`).join('') : '<div class="muted">None yet. Noddy saves one before each run.</div>'}</div></div>`;
}
function cpConfirmHTML(cp) {
  const ch = Object.keys(cp.snap).filter(c => S.G[c].status !== 'Yours' && JSON.stringify(cp.snap[c]) !== JSON.stringify(snapOf(S.G[c]))).length;
  const yours = ALL.filter(c => S.G[c].status === 'Yours').length;
  return `<div class="inline-confirm" role="alertdialog"><p>Go back to “${esc(cp.name)}”? ${plural(ch, 'glyph')} return to how they were.${yours ? ` Your ${plural(yours, 'glyph')} stay.` : ''}</p>
    <button class="btn btn--sm w88" type="button" data-act="cancelCp" data-k="cpc-cancel">Cancel</button><button class="btn btn--danger btn--sm w104" type="button" data-act="goCp" data-id="${cp.id}" data-k="cpc-ok">Go back</button></div>`;
}
function rRun() {
  const html = S.screen === 'new' ? '' : runCardHTML();
  patch($('#runcard-wrap'), html); patch($('#runm'), html);
  inval('header');
}
function rPlan() {
  const el = $('#plan-wrap'); const p = S.plan;
  if (!p) { patch(el, ''); return; }
  const r = S.run, pend = S.prop ? Object.keys(S.prop).length : 0, sc = planScope();
  let summary;
  if (r.state === 'ready') summary = `7 steps · stops at n o H O`;
  else if (r.state === 'done') summary = 'Done';
  else if (r.job) summary = esc(familyOf(r.job.ch).split(' · ')[0] || 'Running');
  else summary = r.state === 'gate' ? 'Step 2 of 7 · waiting for you' : 'In progress';
  let h = `<div class="plan"><button class="plan-line" type="button" data-act="togglePlan" aria-expanded="${p.open}" data-k="planline">${icon('checklist', 'ms--sm')}<span class="txt"><b>Plan</b> · ${summary}</span>${icon(p.open ? 'expand_less' : 'expand_more', 'ms--sm')}</button>`;
  if (p.open) {
    const chip = ch => { const m = p.marks[ch], g = S.G[ch]; return `<button class="pchip ${m || ''} ${CONTROLS.includes(ch) ? 'ctrl' : ''}" type="button" data-act="pop" data-pop="chip" data-ch="${cpId(ch)}" data-k="pc-${cpId(ch)}" aria-label="${esc(ch)}: ${m === 'held' ? 'held' : m === 'mine' ? 'you’ll draw it' : g.status}" title="${esc(ch)} · ${m === 'held' ? 'Held' : m === 'mine' ? 'You’ll draw this' : g.status}">${esc(ch)}</button>`; };
    const doneIco = done => icon(done ? 'check_circle' : 'radio_button_unchecked');
    const ctrlDone = CONTROLS.every(c => ['Kept', 'Yours'].includes(S.G[c].status));
    h += `<div class="plan-body">
      <div class="step">${doneIco(!pend)}<span class="step-t">Spec: metrics, overshoot, stems ${icon('flag', 'ms--xs')}</span><span class="step-chips">${pend ? `<span class="hint">${plural(pend, 'value')} to review in the spec line, marked with a dot</span><button class="btn btn--sm" type="button" data-act="acceptAllSpec" data-k="pl-accept">Accept all</button>` : '<span class="hint">Reviewed</span>'}</span></div>
      <div class="step">${doneIco(ctrlDone)}<span class="step-t">Control letters ${icon('flag', 'ms--xs')}</span><span class="step-chips">${CONTROLS.map(chip).join('')}<span class="hint" style="align-self:center">You approve the style here</span></span></div>
      ${FAMILIES.map(f => `<div class="step">${doneIco(f.parts.join('').split('').every(c => isDrawn(S.G[c])))}<span class="step-t">${f.title}</span><span class="step-chips">${f.parts.map(part => [...part].map(chip).join('')).join('<span class="step-arrow">→</span>')}</span></div>`).join('')}
      <div class="step ${p.punct ? '' : 'off'}">${icon(p.punct ? 'radio_button_unchecked' : 'block')}<span class="step-t">Punctuation &amp; symbols · <span class="num">${LATER.filter(c => !S.G[c].component).length}</span></span><span class="step-chips"><span class="hint">${p.punct ? 'Added to this run. Closing brackets are mirrors.' : 'Not in this run.'} ${Object.keys(COMPONENT).join(' ')} use components, so you draw them.</span><button class="btn btn--sm" type="button" data-act="togglePunct" data-k="pl-punct">${p.punct ? 'Remove' : 'Add to run'}</button></span></div>
      <div class="step">${icon('radio_button_unchecked')}<span class="step-t">Spacing pass</span><span class="step-chips"><span class="hint">Then reports kerning pairs. It doesn’t set them in v1.</span></span></div>
      <div class="est"><div class="est-row"><span class="num">${plural(sc.length, 'glyph')}</span>·<span>${sc.filter(c => FROM[c]).length} built from others</span>·<span class="num">~${money(sc.length * 0.06)} · est.</span><span class="muted">uncalibrated</span></div>
        <div class="est-row"><label for="cap-plan">Spend cap</label><input id="cap-plan" class="input" style="width:72px;text-align:right" data-change="cap" data-k="cap-plan" inputmode="decimal" value="${r.cap.toFixed(2)}"><span class="muted">The run pauses there.</span></div></div>
      ${r.state === 'ready' ? `<button class="btn btn--primary btn--fill" type="button" data-act="runPlan" data-k="pl-run"${pend || S.flags.readOnly ? ' disabled' : ''}>${icon('play_arrow', 'ms--sm')}Draft ${plural(sc.length, 'glyph')} · stops at n o H O</button>${pend ? `<span class="hint">Review the ${plural(pend, 'spec value')} first.</span>` : ''}` : ''}
      <span class="hint">Click a letter to hold it or draw it yourself. The agent can’t change the set, delete letters or export.</span>
    </div>`;
  }
  patch(el, h + '</div>');
}
/* thread */
function pushT(it) { it.id = it.id || nid('t'); S.thread.push(it); inval('thread'); return it; }
function miniProof(text, o) {
  o = o || {}; const size = o.size || 26, k = size / UPM; const chars = [...text];
  const w = Math.ceil(chars.reduce((a, c) => a + itemW(c) * k, 0)) + 2, h = Math.ceil(size * 1.2);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-label="${esc(text)}${o.prop ? ' (proposal)' : ''}" role="img">${rowSVG(chars, 1, size * 0.9, k, { prop: o.prop })}</svg>`;
}
function badge(name, on) { return `<span class="badge ${on ? '' : 'badge--off'}">${on ? '' : 'No '}${on ? name : name.toLowerCase()}</span>`; }
function checkResHTML() {
  const m = curModel(), st = S.model.check;
  if (st === 'checking') return `${icon('pending')}<span>Checking: one tiny billed call, then a tool-use test…</span>`;
  if (st === 'wrongkey') return `${icon('error')}<span class="bad">Wrong key. ${esc(m.provider)} says this key isn’t valid.</span><button class="btn btn--sm" type="button" data-act="reenterKey" data-k="cr-re">Re-enter key</button>`;
  if (st === 'notools') return `${icon('error')}<span class="bad">No tool use. ${esc(m.name)} can chat but can’t edit letters.</span><button class="btn btn--sm" type="button" data-act="pickModel" data-k="cr-pick">Pick another model</button>`;
  return '';
}
function connectHTML() {
  const m = curModel(), st = S.model.check;
  return `<div class="t-card connect"><h5>${icon('link', 'ms--sm')}Connect a model</h5>
    <p class="hint">Drafts are rough; you approve n o H O before the agent goes further. Pick a model that can use tools. Vision lets it read your sketches.</p>
    <div class="models" role="radiogroup" aria-label="Model">${MODELS.map(x => `<label class="model-opt"><input type="radio" name="model" value="${x.id}" data-change="model" data-k="m-${x.id}"${x.id === S.model.id ? ' checked' : ''}><span class="nm">${esc(x.name)} <span>· ${esc(x.provider)}</span></span><span class="bdg">${badge('Tools', x.tools)}${badge('Vision', x.vision)}<span class="badge">${x.paid ? 'Paid' : 'Free'}</span></span></label>`).join('')}</div>
    <div class="field"><label class="label" for="key-in">${esc(m.provider)} API key</label><div class="row"><input id="key-in" class="input input--32" type="password" autocomplete="off" spellcheck="false" data-input="key" data-k="key-in" value="${esc(S.model.key)}" placeholder="Paste your key"${st === 'checking' ? ' readonly' : ''}>
      <button class="btn btn--primary w140" type="button" data-act="checkConn" data-k="check-btn"${!S.model.key || st === 'checking' ? ' disabled' : ''}>${st === 'checking' ? 'Checking…' : 'Check connection'}</button></div>
      <span class="hint">Kept in memory only, so it’s gone when you reload. Check connection makes one tiny billed call, then tests tool use.</span></div>
    <div class="check-res" aria-live="polite">${checkResHTML()}</div>
    <div class="row" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap"><span class="hint">No model? The pen works without one.</span><button class="btn btn--sm" type="button" data-act="drawWithout" data-k="cn-draw">Draw myself</button></div></div>`;
}
function rcptHTML(it) {
  const g = S.G[it.ch], e = it.entries[it.entries.length - 1], open = S.openRcpt.has(it.id), id = cpId(it.ch);
  const B = (act, l, o) => `<button class="btn btn--sm ${(o && o.w) || 'w60'} ${(o && o.cls) || ''}" type="button" data-act="${act}" data-ch="${id}" data-k="r-${act}-${it.id}"${o && o.dis ? ' disabled' : ''}>${l}</button>`;
  let acts = '', bad = false;
  if (e.zero && g.status !== 'Draft') { bad = true; acts = B('retry', 'Retry', { dis: !S.model.connected }) + B('drawself', 'Draw it myself', { w: 'w104' }); }
  else switch (g.status) {
    case 'Draft': acts = B('keep', 'Keep', { cls: 'btn--primary' }) + B('revert', 'Revert'); break;
    case 'Kept': acts = stHTML('Kept') + B('revert', 'Revert'); break;
    case 'Failed': bad = true; acts = (g.failKind === 'direction' ? B('fixdir', 'Fix direction', { w: 'w104', cls: 'btn--primary' }) : B('retry', 'Retry', { dis: !S.model.connected })) + B('drawself', 'Draw it myself', { w: 'w104' }); break;
    case 'Empty': acts = `<span class="hint">Reverted</span>`; break;
    default: acts = stHTML(g.status);
  }
  const det = open ? `<div class="rcpt-x">${(e.detail || []).map(esc).join('<br>')}${it.entries.length > 1 ? '<br>Earlier: ' + it.entries.slice(0, -1).map(x => esc(x.line)).join(' / ') : ''}</div>` : '';
  return `<div class="rcpt${bad ? ' rcpt--bad' : ''}"><div class="rcpt-g">${miniGlyph(it.ch)}</div><div class="rcpt-t"><b>Agent · ${esc(dispName(it.ch))}</b><span title="${esc(e.line)}">${esc(e.line)}</span></div>
    <div class="rcpt-a">${acts}<button class="icon-btn" type="button" data-act="toggleRcpt" data-id="${it.id}" data-k="rx-${it.id}" aria-expanded="${open}" aria-label="Details for ${esc(dispName(it.ch))}" title="What changed">${icon(open ? 'expand_less' : 'expand_more', 'ms--sm')}</button></div>${det}</div>`;
}
function itemHTML(it) {
  const conn = S.model.connected;
  switch (it.type) {
    case 'user': return `<div class="t-user">${esc(it.text)}${it.img ? `<div style="margin-top:6px"><span class="img-chip"><img src="${SKETCH}" alt="Pencil sketch of n o H O"><span>sketch.png · n o H O</span></span></div>` : ''}</div>`;
    case 'agent': return `<div class="t-agent"><span class="who">Agent</span>${it.html || esc(it.text)}</div>`;
    case 'sys': return `<div class="t-sys">${icon(it.icon || 'info')}<span>${esc(it.text)}</span></div>`;
    case 'working': return `<div class="t-sys">${icon('pending')}<span>${esc(it.text)}</span></div>`;
    case 'runhead': return `<div class="rcpt-head">${icon('play_circle', 'ms--xs')}<span>${esc(it.text)}</span></div>`;
    case 'rcpt': return rcptHTML(it);
    case 'connect': return connectHTML();
    case 'empty': return `<div class="empty-pane"><h4>No model connected</h4><p>Drawing works without one: open any letter and use the pen. Connect a model when you want the agent to draft letters for you.</p>
      <div><button class="btn btn--primary" type="button" data-act="startConnect" data-k="ep-connect">Connect a model</button></div>
      <div class="capab">The agent can draft letters from a brief, fix one letter, adjust spacing or make the set bolder. It can’t change the set, delete letters or export.</div></div>`;
    case 'intro': { const m = curModel(); return `<div class="t-agent"><span class="who">Agent</span>Connected to ${esc(m.name)}. Drafts are rough; you approve n o H O before I continue. Describe the font below, and attach a sketch if you have one.
      <div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap">${badge('Tools', m.tools)}${badge('Vision', m.vision)}<span class="badge">${m.paid ? 'Paid' : 'Free'}</span></div></div>`; }
    case 'gate': {
      /* each gate card speaks for itself: only the open one, while the run waits at the gate, has live buttons */
      const live = it.status === 'open' && S.run.state === 'gate' && S.gateItem === it;
      const title = live ? 'n o H O are ready for your OK' : { approved: 'Style approved', changes: 'You asked for changes', stopped: 'Run stopped at n o H O' }[it.status] || 'Waiting for your OK';
      const note = it.note || { approved: 'n o H O are kept.', changes: 'The agent redrew n o H O with your note.', stopped: 'Nothing was approved. n o H O stay drafts.' }[it.status] || '';
      return `<div class="t-card t-card--peach"><h5>${icon(it.status === 'approved' ? 'check_circle' : 'flag', 'ms--sm')}${title}</h5>
        ${live ? `<p>Drafts are rough. Nothing spreads to the other letters until you approve. Approving keeps n o H O.</p><div class="mini-proof">${miniProof('nnonno HHOHHO')}<span class="num">${gateMeasure()}</span></div>
        <div class="acts--fill"><button class="btn btn--primary btn--sm" type="button" data-act="gateApprove" data-k="tg-ok">Approve and keep</button><button class="btn btn--sm" type="button" data-act="gateAsk" data-k="tg-ask">Ask for changes</button><button class="btn btn--sm hide-narrow" type="button" data-act="gateEdit" data-k="tg-edit">Edit by hand</button></div>`
        : `<p class="hint">${esc(note)}</p>`}</div>`;
    }
    case 'bolder': {
      const b = S.bolder; if (!b || b.id !== it.id) return `<div class="t-sys">${icon('format_bold')}<span>${esc(it.note || 'Bolder proposal closed.')}</span></div>`;
      const c = countBy(ALL), n = bolderScope().length, st = stemAt('n', R(S.spec.xHeight * 0.4)) || 172;
      if (b.state !== 'open') return `<div class="t-sys">${icon('format_bold')}<span>${esc(b.state === 'applied' ? `Bolder: applying to ${plural(b.n, 'glyph')}. Checkpoint “Before bolder” saved.` : 'Bolder proposal cancelled. Nothing changed.')}</span></div>`;
      const opt = (f, l, cnt) => `<label class="scope-opt"><input type="checkbox" data-change="bolderScope" data-f="${f}" data-k="bs-${f}"${b[f] ? ' checked' : ''}${conn ? '' : ' disabled'}>${l}<span class="cnt">${cnt}</span></label>`;
      return `<div class="t-card t-card--peach"><h5>${icon('format_bold', 'ms--sm')}Make it bolder</h5>
        <p>The weight setting is only a label in the font file; it doesn’t change any outline. To make the letters bolder I have to redraw them with thicker stems, about 12% (n stem ${st} → ${R(st * 1.12)}).</p>
        <div class="mini-proof"><span>Now</span>${miniProof('Hamburg 1984')}<span>Proposal, not applied</span>${miniProof('Hamburg 1984', { prop: true })}</div>
        <div class="scope-list" role="group" aria-label="Which glyphs to redraw">${opt('drafts', 'Drafts', c.Draft)}${opt('kept', '+ Kept', c.Kept)}${opt('yours', '+ Yours', c.Yours)}</div>
        <p class="hint"><span class="num">${plural(n, 'glyph')} · ~${money(n * 0.05)}</span> · uncalibrated. Noddy saves a “Before bolder” checkpoint first, so you can go back.</p>
        <div class="acts"><button class="btn btn--primary btn--sm w140" type="button" data-act="applyBolder" data-k="b-apply"${n && bolderCanApply() ? '' : ' disabled'}${bolderCanApply() ? '' : ' title="Stop or finish the run first"'}>Apply to ${plural(n, 'glyph')}</button><button class="btn btn--sm w88" type="button" data-act="cancelBolder" data-k="b-cancel">Cancel</button></div>${bolderCanApply() ? '' : '<p class="hint">A run is in progress. Stop or finish it first, then apply.</p>'}</div>`;
    }
    case 'oos': return `<div class="t-card"><p><b>${esc(it.chars.join(' '))} ${it.chars.length > 1 ? 'aren’t' : 'isn’t'} in Latin Kernel</b>, so I didn’t draw anything. Only you can change the set.</p><div class="acts"><button class="btn btn--sm" type="button" data-act="pop" data-pop="set" data-k="oos-${it.id}">Change set…</button></div></div>`;
    case 'scopeq': return `<div class="t-card"><p>${esc(it.q)}</p>${it.answer ? `<p class="hint">You chose: ${esc(it.answer)}</p>` : `<div class="acts">${it.opts.map((o, i) => `<button class="btn btn--sm" type="button" data-act="answerScope" data-id="${it.id}" data-i="${i}" data-k="sq-${it.id}-${i}">${esc(o)}</button>`).join('')}</div>`}</div>`;
    case 'summary': {
      const r = it.r;
      /* one "Review" per group that still has drafts: it opens the group's spacing proof, where Keep all unlocks */
      const grpBtns = GROUPS.map(g => ({ g, n: g.chars.filter(c => S.G[c].status === 'Draft').length })).filter(x => x.n)
        .map(({ g, n }) => `<button class="btn btn--sm" type="button" data-act="proofGroup" data-g="${g.id}" data-k="sm-pg-${g.id}-${it.id}">Review ${esc(g.range || g.name)} · <span class="num">${n}</span></button>`).join('');
      return `<div class="t-card"><h5>${icon('check_circle', 'ms--sm')}Run finished</h5><p class="num">${r.drafted} drafted · ${r.failed} failed${r.skipped ? ` · ${r.skipped} skipped (yours)` : ''}</p>
        <div class="acts">${grpBtns}
        ${r.failed ? `<button class="btn btn--sm" type="button" data-act="filter" data-f="Failed" data-k="sm-failed">Review ${r.failed} failed</button>` : ''}
        <button class="btn btn--primary btn--sm" type="button" data-act="openPreflight" data-k="sm-pf">Export preflight</button></div></div>`;
    }
    default: return '';
  }
}
function rThread() {
  const el = $('#thread'); if (!el) return;
  const items = S.thread.slice();
  if (!S.model.connected) {
    if (S.model.intent || S.model.check !== 'idle') items.push({ id: 'connect', type: 'connect' });
    else if (!S.thread.length) items.push({ id: 'empty', type: 'empty' });
  }
  const existing = new Map(Array.from(el.children).map(n => [n.dataset.id, n]));
  const sc = $('#pane-scroll');
  const atBottom = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 60;
  let prev = null, added = false;
  for (const it of items) {
    const html = itemHTML(it); let n = existing.get(it.id);
    if (!n) {
      n = document.createElement('div'); n.className = 't-item' + (it.type === 'user' ? ' t-user-wrap' : ''); n.dataset.id = it.id; n.innerHTML = html; n._h = html; added = true;
      el.insertBefore(n, prev ? prev.nextSibling : el.firstChild);
    } else {
      existing.delete(it.id); patch(n, html);
      if (n.previousSibling !== prev) el.insertBefore(n, prev ? prev.nextSibling : el.firstChild);
    }
    prev = n;
  }
  existing.forEach(n => n.remove());
  if (added && (atBottom || items.length && items[items.length - 1].type === 'connect')) sc.scrollTop = sc.scrollHeight;
}
function compScope() {
  const s = S.comp.scope;
  if (s !== 'auto') return s;
  if (S.comp.gateAsk) return 'controls';
  if (S.editor.open) return S.editor.ch;
  if (S.sel.length === 1) return S.sel[0];
  return 'set';
}
const scopeLabel = s => (s === 'set' ? 'whole set' : s === 'drafts' ? 'drafts only' : s === 'controls' ? 'n o H O' : dispName(s));
function willSend() {
  if (!S.model.connected) return 'Nothing leaves your machine until you connect a model.';
  const m = curModel(), parts = [S.comp.stage === 'brief' ? 'brief' : 'your message'], sc = compScope();
  if (S.comp.img && !S.comp.skipImg && m.vision) parts.push('1 image');
  if (sc === 'set' || sc === 'drafts') { const n = ALL.filter(c => hasOutline(S.G[c]) && (sc === 'set' || S.G[c].status === 'Draft')).length; if (n) parts.push(plural(n, 'outline')); }
  else if (sc === 'controls') parts.push('4 outlines');
  else if (S.G[sc] && hasOutline(S.G[sc])) parts.push(`1 outline (${label(sc)})`);
  return `Will send: <b>${esc(parts.join(' + '))}</b> → ${esc(m.provider)}`;
}
function placeholder() {
  if (!S.model.connected) return 'Connect a model to ask the agent.';
  if (S.comp.stage === 'brief') return 'Describe the font: who it’s for and how it should feel.';
  if (S.comp.gateAsk) return 'What should change? For example: rounder o, narrower n.';
  const sc = compScope();
  if (sc !== 'set' && sc !== 'drafts') return `Ask the agent to edit ${dispName(sc)}…`;
  return 'Ask for a change, like “Fix the g” or “Make it bolder”.';
}
function rComposer() {
  const el = $('#composer');
  if (!el._built) {
    el.innerHTML = `<div id="comp-top" class="comp-top"></div><div id="comp-warn"></div><div class="comp-box"><textarea id="comp-ta" class="comp-ta" rows="3" data-input="comp" aria-label="Message to the agent"></textarea></div><div id="comp-foot" class="comp-foot"></div>`;
    el._built = true;
  }
  const ta = $('#comp-ta');
  if (S.comp.force) { ta.value = S.comp.text; S.comp.force = false; }
  const conn = S.model.connected, dis = !conn || S.flags.readOnly;
  ta.disabled = dis; ta.placeholder = placeholder();
  const m = curModel(), sc = compScope();
  patch($('#comp-top'), `<button class="chip scope-chip" type="button" data-act="pop" data-pop="scope" data-k="scopechip"${dis ? ' disabled' : ''} title="What the agent may change">${icon('target', 'ms--xs')}Scope: ${esc(scopeLabel(sc))}${icon('expand_more', 'ms--xs')}</button>
    ${S.comp.img ? `<span class="img-chip"><img src="${SKETCH}" alt="Pencil sketch of n o H O"><span>sketch.png · shows <b>n o H O</b></span><button class="icon-btn" type="button" data-act="removeImg" data-k="img-x" aria-label="Remove image">${icon('close', 'ms--sm')}</button></span>`
      : `<button class="btn btn--minimal btn--sm" type="button" data-act="attachImg" data-k="attach"${dis ? ' disabled' : ''}>${icon('attach_file', 'ms--sm')}Image</button>`}`);
  patch($('#comp-warn'), S.comp.img && !S.comp.skipImg && conn && !m.vision ? `<div class="warnrow" role="status">${icon('visibility_off', 'ms--sm')}<span>${esc(m.name)} can’t see images.</span><button class="btn btn--sm" type="button" data-act="sendNoImg" data-k="nv-send">Send without image</button><button class="btn btn--sm" type="button" data-act="pickModel" data-k="nv-pick">Pick another model</button></div>` : '');
  patch($('#comp-foot'), `<span class="willsend"><span>${willSend()}</span></span><button class="btn btn--primary w72" type="button" data-act="send" data-k="send"${dis ? ' disabled' : ''}>Send</button>`);
}

/* =====================================================================
   11. Run engine (scripted timer standing in for real agent jobs)
   ===================================================================== */
const RUNT = { t: null };
const reduced = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const STEP = () => 340 / proto.speed;
function schedule(ms) { if (RUNT.t) clearTimeout(RUNT.t); RUNT.t = later(tick, ms); }
let clockMin = 0;
function clock() { const m = 2 * 60 + 2 + clockMin; return `${String(12 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; }
function snapOf(g) { return { status: g.status, cs: g.cs, adv: g.adv, bold: g.bold, from: g.from }; }
function checkpoint(name) {
  const snap = {}; ALL.forEach(c => { snap[c] = JSON.parse(JSON.stringify(snapOf(S.G[c]))); });
  clockMin += 3;
  S.checkpoints.push({ id: nid('cp'), name, time: clock(), snap });
  pushT({ type: 'sys', icon: 'bookmark', text: `Checkpoint saved: ${name}` });
  inval('run');
}
function removeFromQueue(ch) { const r = S.run, i = r.queue.indexOf(ch); if (i >= 0) { r.queue.splice(i, 1); r.total = Math.max(r.done, r.total - 1); inval('run', 'header'); } }
function startRun(kind, chars, o) {
  o = o || {};
  const prev = S.run;
  /* the gate covers n o H O in this run, and any of them drafted earlier but never approved (Draft the rest after a Stop at the gate) */
  const gate = o.gate ? CONTROLS.filter(c => chars.includes(c) || !['Kept', 'Yours', 'Held'].includes(S.G[c].status)) : null;
  const r = S.run = Object.assign(idleRun(prev.cap), { state: 'running', kind, queue: chars.slice(), total: chars.length, spent: prev.spent, gateAfter: gate && gate.length ? gate : null, label: o.label || 'Run' });
  chars.forEach(ch => { const g = S.G[ch]; g.qPrev = g.status; g.status = 'Queued'; touch(ch, false); });
  pushT({ type: 'runhead', text: `${r.label} · ${plural(chars.length, 'glyph')} · started ${clock()}` });
  inval('run', 'plan', 'header', 'proofBody');
  schedule(250);
}
function nextJob() {
  const r = S.run;
  for (let i = 0; i < r.queue.length; i++) {
    const ch = r.queue[i], g = S.G[ch];
    if ((r.kind !== 'bolder' && ['Yours', 'Held', 'Kept'].includes(g.status)) || g.status === 'Drafting') { r.queue.splice(i, 1); r.total = Math.max(r.done, r.total - 1); i--; continue; }
  }
  /* until n o H O are approved, nothing else is drafted, even if one of them is open in the editor (the run waits for it) */
  const gate = gatePending(r);
  for (let i = 0; i < r.queue.length; i++) {
    const ch = r.queue[i];
    if (gate.length && !gate.includes(ch)) continue;
    if (S.editor.open && S.editor.ch === ch && S.editor.mode === 'own') {
      if (!r.skipped.includes(ch)) { r.skipped.push(ch); pushT({ type: 'sys', icon: 'skip_next', text: `Skipped ${dispName(ch)}: it’s open in your editor. Coming back to it later.` }); }
      continue;
    }
    r.queue.splice(i, 1); return ch;
  }
  return null;
}
function tick() {
  const r = S.run; if (!['running', 'pausing'].includes(r.state)) return;
  if (!r.job) {
    if (r.state === 'pausing') { r.state = 'paused'; inval('run'); return; }
    if (r.gateAfter && r.gateAfter.length && r.gateAfter.every(c => !r.queue.includes(c))) { r.gateAfter = null; enterGate(); return; }
    const ch = nextJob();
    if (ch == null) { if (r.queue.length) { inval('run'); schedule(700); return; } finishRun(); return; }
    const g = S.G[ch];
    r.job = { ch, step: 0, prev: g.qPrev && g.qPrev !== 'Queued' ? g.qPrev : (hasOutline(g) ? 'Draft' : 'Empty'), target: r.kind === 'bolder' ? clone(g.cs) : agentOutline(ch, g.redo || 0) };
    g.status = 'Drafting'; g.part = null; touch(ch, false); agentTouched(ch);
    if (S.editor.open && S.editor.ch === ch && S.editor.mode !== 'own') inval('editor');
    schedule(STEP()); return;
  }
  const j = r.job, g = S.G[j.ch]; j.step++;
  const steps = reduced() ? 1 : 3;
  if (j.step <= steps) { g.part = partialOutline(j.target, reduced() ? 3 : j.step); invalCell(j.ch); if (S.editor.open && S.editor.ch === j.ch) inval('edCanvas'); schedule(STEP() * (j.mult || 1)); return; }
  commitJob();
  if (r.state === 'pausing') { r.state = 'paused'; inval('run'); say(`Paused after ${dispName(j.ch)}.`); return; }
  if (r.state !== 'running') return;
  schedule(STEP() * 0.6);
}
function receiptLine(ch, kind, prefix) {
  const g = S.G[ch], s = sb(g), n = g.cs ? g.cs.length : 0, ok = checkOutline(g.cs).ok;
  const head = prefix ? prefix + ' · ' : kind === 'bolder' ? 'stems +12% · ' : FROM[ch] ? `from ${FROM[ch]} · ` : '';
  return `${head}${plural(n, 'contour')} · RSB ${s.rsb} · check ${ok ? 'ok' : 'failed'}`;
}
function receiptDetail(ch, kind) {
  const g = S.G[ch], s = sb(g), pts = (g.cs || []).reduce((a, c) => a + c.nodes.length, 0), c = cost(ch);
  /* what Noddy actually changed, in plain words (the receipt is built from Noddy's results, not from the model's text) */
  return [kind === 'bolder' ? `Thickened the stems of ${dispName(ch)}` : FROM[ch] ? `Built ${dispName(ch)} from ${FROM[ch]}` : `Drew ${dispName(ch)}`,
    `Outline: ${plural((g.cs || []).length, 'contour')}, ${pts} points`, `Spacing: LSB ${s.lsb}, RSB ${s.rsb} · advance ${g.adv}`,
    `Outline check: ${checkOutline(g.cs).ok ? 'ok' : 'failed'}`, 'Saved as one step in the history', `~${money(c)} · uncalibrated`];
}
function addRcpt(ch, line, detail, o) {
  o = o || {};
  let it = S.rcptOf[ch]; const entry = { line, detail, zero: !!o.zero };
  if (it && S.thread.includes(it)) { it.entries.push(entry); S.thread.splice(S.thread.indexOf(it), 1); S.thread.push(it); }
  else { it = pushT({ type: 'rcpt', ch, entries: [entry] }); S.rcptOf[ch] = it; }
  inval('thread'); return it;
}
function dropT(it) { const i = S.thread.indexOf(it); if (i >= 0) { S.thread.splice(i, 1); inval('thread'); } }
function commitJob() {
  const r = S.run, j = r.job, ch = j.ch, g = S.G[ch]; r.job = null;
  const fail = r.kind === 'set' && FAILS[ch] && !S.failedOnce.has(ch);
  if (fail) {
    S.failedOnce.add(ch);
    Object.assign(g, { status: 'Failed', reason: FAILS[ch].reason, failKind: FAILS[ch].kind, failCs: FAILS[ch].kind === 'cut' ? null : failOutline(ch), part: null });
    r.failed++;
    addRcpt(ch, `failed · ${FAILS[ch].short}`, [FAILS[ch].reason, 'Nothing was saved to the glyph.', `~${money(cost(ch))} · uncalibrated`]);
  } else {
    g.before = clone(g.cs); g.beforeStatus = j.prev; g.beforeBold = g.bold; g.beforeAdv = g.adv;
    g.cs = j.target;
    if (r.kind === 'bolder') g.bold = true; else { g.adv = srcAdv(ch); g.from = FROM[ch] || null; }
    Object.assign(g, { status: 'Draft', part: null, reason: '', failCs: null, failKind: null });
    r.drafted++; r.draftedChars.push(ch); newDraft(ch);
    defPath(ch);
    addRcpt(ch, receiptLine(ch, r.kind), receiptDetail(ch, r.kind));
  }
  r.done++; r.spent += cost(ch);
  rebaseEditor(ch); touch(ch); agentTouched(ch);
  if (S.editor.open && S.editor.ch === ch && (S.editor.mode === 'watch' || S.editor.mode === 'watch-ask')) {
    const ed = S.editor; ed.mode = 'own'; ed.agentDone = !fail; ed.tool = hasOutline(g) ? 'edit' : 'pen'; ed.ba = !!(g.before && g.before.length);
    inval('editor', 'edCanvas', 'proofHead');
  }
  if (r.spent >= r.cap - 1e-9 && r.queue.length) { r.state = 'cap'; pushT({ type: 'sys', icon: 'payments', text: `Paused at your ${money(r.cap)} spend cap.` }); }
  inval('run', 'plan');
}
function enterGate() {
  const r = S.run; r.state = 'gate';
  S.gateItem = pushT({ type: 'gate', status: 'open' });
  inval('proofHead', 'proofBody', 'run', 'plan', 'thread');
  say('n o H O are drafted. Check the style in the proof to continue.');
}
function gateApprove() {
  if (S.run.state !== 'gate' || !canEdit()) return;
  CONTROLS.forEach(c => { const g = S.G[c]; if (g.status === 'Draft') { g.status = 'Kept'; touch(c, false); } });
  if (S.gateItem) { S.gateItem.status = 'approved'; S.gateItem.note = 'Approved. n o H O are kept. Checkpoint “Controls approved” saved.'; }
  checkpoint('Controls approved');
  if (S.comp.gateAsk) { S.comp.gateAsk = false; inval('composer'); }
  S.run.state = 'running'; inval('proofHead', 'proofBody', 'run', 'plan', 'thread');
  say('Style approved. The agent continues with the lowercase.');
  schedule(400);
}
function gateAsk() {
  S.comp.gateAsk = true; S.pane.open = true;
  inval('shell', 'composer', 'header', 'paneHead');
  later(() => { const ta = $('#comp-ta'); if (ta) ta.focus(); }, 30);
}
function redrawControls(note) {
  const r = S.run;
  if (S.gateItem) { S.gateItem.status = 'changes'; S.gateItem.note = `Your note: “${note}”`; }
  pushT({ type: 'agent', text: `Redrawing n o H O with your note: “${note}”. I’ll stop again when they’re done.` });
  const list = CONTROLS.filter(c => !['Yours', 'Held'].includes(S.G[c].status));
  list.forEach(c => { const g = S.G[c]; g.redo = (g.redo || 0) + 1; g.qPrev = g.status; g.status = 'Queued'; touch(c, false); });
  r.queue.unshift(...list); r.total += list.length; r.gateAfter = list.slice(); r.state = 'running';
  inval('proofHead', 'proofBody', 'run'); schedule(300);
}
function finishRun() {
  const r = S.run; r.state = 'done';
  pushT({ type: 'summary', r: { drafted: r.drafted, failed: r.failed, skipped: r.skipped.filter(c => S.G[c].status === 'Yours').length } });
  inval('run', 'plan', 'thread');
  say(`Run finished: ${r.drafted} drafted, ${r.failed} failed.`);
}
function startWaiting(sec) {
  const r = S.run; r.state = 'waiting'; r.wait = sec; inval('run');
  pushT({ type: 'sys', icon: 'hourglass_top', text: `${curModel().provider} rate limit. Waiting ${sec} s, then continuing on its own.` });
  const cd = () => { if (S.run !== r || r.state !== 'waiting') return; r.wait--; if (r.wait <= 0) { r.state = 'running'; inval('run'); schedule(200); return; } inval('run'); later(cd, 1000); };
  later(cd, 1000);
}
function pauseRun() {
  const r = S.run;
  if (r.state === 'running' || r.state === 'waiting') {
    r.state = r.job ? 'pausing' : 'paused';
    if (r.state === 'paused' && RUNT.t) clearTimeout(RUNT.t);
    inval('run');
  }
}
function resumeRun() {
  const r = S.run;
  if (['paused', 'cap', 'offline', 'down', 'interrupted'].includes(r.state)) { r.state = 'running'; inval('run'); schedule(200); }
}
function focusRunKey(k) {
  later(() => { const box = tier() === 'narrow' ? $('#runm') : $('#runcard-wrap'); const b = box && box.querySelector(`[data-k="${k}"]`); if (b) b.focus(); }, 30);
}
function askStop() { S.run.confirmStop = true; inval('run'); focusRunKey('stop-cancel'); }
function cancelStop() { S.run.confirmStop = false; inval('run'); focusRunKey('rc-askStop'); }
function confirmStop() {
  const r = S.run; r.confirmStop = false;
  if (r.state === 'gate' && S.gateItem && S.gateItem.status === 'open') S.gateItem.status = 'stopped';
  if (S.comp.gateAsk) { S.comp.gateAsk = false; inval('composer'); }
  r.state = 'stopping';
  if (RUNT.t) clearTimeout(RUNT.t);
  if (r.job) {
    const g = S.G[r.job.ch]; r.discarding = r.job.ch; g.status = r.job.prev; g.part = null; touch(r.job.ch, false);
    if (S.editor.open && S.editor.ch === r.job.ch && S.editor.mode !== 'own' && S.editor.mode !== 'monitor') { S.editor.mode = 'own'; inval('editor'); }
    r.job = null;
  }
  inval('run', 'proofHead', 'proofBody', 'thread', 'plan');
  later(() => {
    if (S.run !== r) return;
    r.leftover = 0;
    r.queue.forEach(ch => { const g = S.G[ch]; if (g.status === 'Queued') { g.status = g.qPrev && g.qPrev !== 'Queued' ? g.qPrev : 'Empty'; r.leftover++; touch(ch, false); } });
    r.queue = []; r.state = 'stopped';
    pushT({ type: 'sys', icon: 'stop_circle', text: `Run stopped${r.discarding ? `, draft of ${dispName(r.discarding)} discarded` : ''}. ${plural(r.drafted, 'draft')} stay.` });
    r.discarding = null; inval('run', 'plan', 'proofHead', 'proofBody', 'thread');
  }, 1100 / proto.speed);
}
/* the drafts this run made that are still drafts (not every draft in the font) */
function runDrafts() { return [...new Set(S.run.draftedChars || [])].filter(c => S.G[c].status === 'Draft'); }

/* =====================================================================
   12. Glyph actions (user side) and the user-only undo history
   ===================================================================== */
function canEdit() { if (S.flags.readOnly) { say('This tab is read-only. Choose “Edit in this tab instead” first.'); return false; } return true; }
function undoGlobal() {
  /* in the editor, undo the drawing first; when that is used up, fall through to your earlier changes (Keep, Revert, Hold…) */
  if (S.editor.open && S.editor.mode === 'own' && edUndo()) { say(`Undid your last change to ${dispName(S.editor.ch)}.`); return; }
  const h = S.history.pop();
  if (!h) { say('Nothing of yours to undo. Agent work is reverted from its glyph or receipt.'); return; }
  h.undo(); say(`Undid: ${h.label}.`);
}
function keep(ch) {
  const g = S.G[ch]; if (g.status !== 'Draft' || !canEdit()) return;
  g.status = 'Kept'; g.reason = '';
  S.history.push({ label: `Keep ${label(ch)}`, undo: () => { if (g.status === 'Kept') { g.status = 'Draft'; touch(ch, false); } } });
  touch(ch, false); say(`Kept ${dispName(ch)}. Cmd+Z undoes.`);
}
function keepMany(chars, what) {
  const list = chars.filter(c => S.G[c].status === 'Draft'); if (!list.length || !canEdit()) return;
  list.forEach(c => { S.G[c].status = 'Kept'; touch(c, false); });
  S.history.push({ label: what, undo: () => list.forEach(c => { if (S.G[c].status === 'Kept') { S.G[c].status = 'Draft'; touch(c, false); } }) });
  say(`${what}: ${plural(list.length, 'glyph')} kept. Cmd+Z undoes.`);
}
function hold(ch, mine) {
  const g = S.G[ch]; if (!canEdit()) return;
  const prev = { status: g.status, mine: g.mine, reason: g.reason, heldFrom: g.heldFrom };
  removeFromQueue(ch);
  g.heldFrom = g.status === 'Queued' ? 'Empty' : g.status;
  g.status = 'Held'; g.mine = !!mine; g.reason = mine ? 'You’ll draw this. The agent skips it.' : 'Held. The agent skips it until you release it.';
  if (S.plan) S.plan.marks[ch] = mine ? 'mine' : 'held';
  S.history.push({ label: `${mine ? 'I’ll draw' : 'Hold'} ${label(ch)}`, undo: () => { Object.assign(g, prev); if (S.plan) delete S.plan.marks[ch]; fixQueued(ch); touch(ch, false); } });
  touch(ch, false); say(mine ? `${dispName(ch)} is yours to draw. The agent skips it.` : `Held ${dispName(ch)}.`);
}
function release(ch) {
  const g = S.G[ch]; if (!canEdit()) return;
  g.mine = false; g.reason = ''; if (S.plan) delete S.plan.marks[ch];
  const active = RUN_ACTIVE.includes(S.run.state);
  if (active && S.run.kind === 'set' && !hasOutline(g)) { g.status = 'Queued'; g.qPrev = 'Empty'; S.run.queue.push(ch); S.run.total++; } else g.status = hasOutline(g) ? (['Draft', 'Kept', 'Yours'].includes(g.heldFrom) ? g.heldFrom : 'Draft') : 'Empty';
  g.heldFrom = null;
  touch(ch, false); say(`${dispName(ch)} is back${g.status === 'Queued' ? ' in the queue' : ''}.`);
}
function agentSingle(ch, o) {
  o = o || {};
  const g = S.G[ch];
  if (!S.model.connected) { say('Connect a model to use the agent.'); return; }
  if (S.editor.open && S.editor.ch === ch && S.editor.mode === 'own') { say(`${dispName(ch)} is open in your editor. Hand it to the agent first.`); return; }
  if (g.status === 'Drafting') return;
  removeFromQueue(ch);
  const prevStatus = g.status;
  g.status = 'Drafting'; g.part = null; g.redo = (g.redo || 0) + 1; touch(ch, false);
  const target = agentOutline(ch, g.redo + 10);
  const work = pushT({ type: 'working', text: `Working on ${dispName(ch)}…` });
  const owner = S;
  let step = 0;
  const stepFn = () => {
    if (S !== owner || S.G[ch].status !== 'Drafting') { dropT(work); return; }
    step++;
    if (step <= 3 && !reduced()) { g.part = partialOutline(target, step); invalCell(ch); if (S.editor.open && S.editor.ch === ch) inval('edCanvas'); later(stepFn, STEP() * 1.4); return; }
    g.before = clone(g.cs); g.beforeStatus = ['Failed', 'Held', 'Queued'].includes(prevStatus) ? 'Empty' : prevStatus; g.beforeBold = g.bold; g.beforeAdv = g.adv;
    g.cs = target; g.adv = srcAdv(ch); g.from = FROM[ch] || null;
    Object.assign(g, { status: 'Draft', part: null, failCs: null, failKind: null, reason: '', mine: false });
    S.run.spent += cost(ch); newDraft(ch);
    dropT(work); defPath(ch);
    addRcpt(ch, receiptLine(ch, 'set', o.prefix), receiptDetail(ch, 'set'));
    rebaseEditor(ch); touch(ch); inval('run'); agentTouched(ch);
    if (o.done) o.done();
  };
  later(stepFn, STEP() * 1.4);
}
function takeOver(ch) {
  const r = S.run, g = S.G[ch]; if (!canEdit()) return;
  if (S.hand && S.hand.ch === ch) { takeBack(); if (!S.editor.open || S.editor.ch !== ch) openEditor(ch); return; }
  if (r.job && r.job.ch === ch) {
    g.status = r.job.prev; g.part = null; r.job = null; r.done++;
    removeFromQueue(ch);
    pushT({ type: 'sys', icon: 'front_hand', text: `You took over ${dispName(ch)}. The agent’s unfinished draft was discarded; the run moves on.` });
    if (['running', 'pausing'].includes(r.state)) schedule(STEP());
    if (r.state === 'pausing') { r.state = 'paused'; }
  }
  else if (g.status === 'Drafting') { g.part = null; g.status = 'Held'; pushT({ type: 'sys', icon: 'front_hand', text: `You took over ${dispName(ch)}. The agent\u2019s unfinished draft was discarded.` }); }
  removeFromQueue(ch);
  g.mine = true; g.reason = 'You took this over.';
  if (g.status === 'Queued' || g.status === 'Empty') g.status = 'Held';
  touch(ch); inval('run');
  if (S.editor.open && S.editor.ch === ch) {
    const ed = S.editor; ed.mode = modeFor(g); ed.tool = hasOutline(g) ? 'edit' : 'pen'; rebaseEditor(ch);
  } else openEditor(ch);
}
/* Hand to agent: the hand-off lives on S.hand, not on the editor, so closing the editor (Esc, [ ], a Follow-line letter)
   or resizing the window never cancels it. Only Take back does. */
function handToAgent() {
  const ed = S.editor; if (!ed.open || ed.mode !== 'own') return;
  if (!S.model.connected) { say('Connect a model first.'); return; }
  if (!canEdit()) return;
  if (ed.drawing != null) endPath(true);
  const ch = ed.ch, g = S.G[ch];
  const job = S.hand = { ch, prev: { cs: clone(g.cs), status: g.status, adv: g.adv }, target: agentOutline(ch, (g.redo = (g.redo || 0) + 1) + 20), step: 0, t: null };
  removeFromQueue(ch);
  ed.mode = 'agent'; ed.note = ''; ed.agentDone = false;
  g.status = 'Drafting'; g.part = null; touch(ch, false);
  pushT({ type: 'sys', icon: 'forum', text: `You handed ${dispName(ch)} to the agent. Your tools are off until it’s done or you take it back.` });
  const owner = S;
  const stepFn = () => {
    if (S !== owner || S.hand !== job) return;
    job.step++;
    if (job.step <= 4) { g.part = partialOutline(job.target, Math.min(3, job.step)); invalCell(ch); if (S.editor.open && S.editor.ch === ch) inval('edCanvas'); job.t = later(stepFn, 650 / proto.speed); return; }
    S.hand = null;
    g.before = clone(job.prev.cs); g.beforeStatus = job.prev.status === 'Drafting' ? 'Empty' : job.prev.status; g.beforeAdv = job.prev.adv; g.beforeBold = g.bold;
    g.cs = job.target; g.adv = srcAdv(ch); g.status = 'Draft'; g.part = null; g.from = FROM[ch] || null; g.failCs = null; g.failKind = null; g.reason = ''; g.mine = false;
    newDraft(ch); defPath(ch);
    addRcpt(ch, receiptLine(ch, 'set', 'matched to n o H O'), receiptDetail(ch, 'set'));
    const e = S.editor, here = e.open && e.ch === ch;
    if (here) { if (e.mode === 'agent') { e.mode = 'own'; e.tool = 'edit'; } e.agentDone = true; e.ba = !!(g.before && g.before.length); }
    rebaseEditor(ch); touch(ch); agentTouched(ch);
    if (!here) say(`The agent finished ${dispName(ch)}. It’s a draft until you keep it.`);
  };
  job.t = later(stepFn, 650 / proto.speed);
  inval('editor', 'edCanvas', 'thread');
}
function takeBack(silent) {
  const h = S.hand; if (!h) return;
  if (h.t) clearTimeout(h.t);
  S.hand = null;
  const ch = h.ch, g = S.G[ch];
  g.cs = h.prev.cs; g.status = h.prev.status; g.adv = h.prev.adv; g.part = null;
  fixQueued(ch);
  const ed = S.editor;
  if (ed.open && ed.ch === ch && ed.mode === 'agent') { ed.mode = modeFor(g); ed.note = ''; }
  touch(ch);
  if (!silent) { pushT({ type: 'sys', icon: 'front_hand', text: `You took ${dispName(ch)} back. Nothing changed.` }); say(`You took ${dispName(ch)} back.`); }
}
function fixDirection(ch) {
  const g = S.G[ch]; if (!g.failCs || !canEdit()) return;
  const cs = clone(g.failCs); checkOutline(cs).issues.filter(i => i.kind === 'direction').forEach(i => reverseContour(cs[i.ci]));
  g.before = null; g.beforeStatus = 'Empty'; g.cs = cs; g.adv = srcAdv(ch); g.status = 'Draft'; g.failCs = null; g.failKind = null; g.reason = ''; g.from = FROM[ch] || null;
  defPath(ch); newDraft(ch);
  addRcpt(ch, receiptLine(ch, 'set', 'direction fixed'), ['Noddy reversed the counter’s direction', `Outline check: ${checkOutline(cs).ok ? 'ok' : 'failed'}`]);
  if (S.editor.open && S.editor.ch === ch) S.editor.tool = 'edit';
  rebaseEditor(ch); touch(ch); say(`Fixed the direction of ${dispName(ch)}. It’s a draft now.`);
}
function applySpacing(f, raw) {
  const ed = S.editor; if (!ed.open || ed.mode !== 'own' || !canEdit()) return;
  const v = parseInt(String(raw).replace('−', '-'), 10); if (!Number.isFinite(v)) { inval('proofHead', 'editor'); return; }
  const g = S.G[ed.ch], b = bounds(g.cs);
  pushUndo();
  if (f === 'adv') g.adv = clamp(v, 0, 6000);
  else if (f === 'lsb' && b) { const d = v - b.x0; g.cs.forEach(c => c.nodes.forEach(n => { n.x += d; if (n.ix != null) n.ix += d; if (n.ox != null) n.ox += d; })); g.adv += d; }
  else if (f === 'rsb' && b) g.adv = R(b.x1 + v);
  live(true); liveCommit(); inval('edCanvas');
}
function setSpec(k, v, note) {
  const prev = S.spec[k], hadProp = S.prop && k in S.prop ? S.prop[k] : undefined;
  S.spec[k] = v; if (S.prop) { delete S.prop[k]; if (!Object.keys(S.prop).length) { S.prop = null; specDone(); } }
  S.history.push({ label: `${SPEC_LABEL[k]} ${fmtN(v)}`, undo: () => { S.spec[k] = prev; if (hadProp !== undefined) { S.prop = S.prop || {}; S.prop[k] = hadProp; } specChanged(); } });
  specChanged(); say(note || `${SPEC_LABEL[k]} is ${fmtN(v)}. Cmd+Z undoes.`);
}
function specDone() { if (S.plan) { checkpoint('Spec approved'); } }
function specChanged() { inval('spec', 'grid', 'proofBody', 'plan', 'run', 'edCanvas'); }
function acceptAllSpec() {
  if (!S.prop) return;
  const prev = Object.assign({}, S.spec), props = Object.assign({}, S.prop);
  Object.assign(S.spec, S.prop); S.prop = null;
  S.history.push({ label: 'Accept spec', undo: () => { Object.assign(S.spec, prev); S.prop = props; specChanged(); } });
  specChanged(); closePop(false); specDone(); say('Spec accepted. Guides moved in the proof and editor. Cmd+Z undoes.');
}

/* =====================================================================
   13. Talking to the (simulated) agent
   ===================================================================== */
function send() {
  const ta = $('#comp-ta'); const text = (ta ? ta.value : S.comp.text).trim();
  if (!S.model.connected || S.flags.readOnly) return;
  if (!text && !(S.comp.stage === 'brief' && S.comp.img)) { if (ta) ta.focus(); return; }
  const m = curModel(), img = S.comp.img && !S.comp.skipImg && m.vision;
  const scope = compScope(), wasBrief = S.comp.stage === 'brief', gateAskNow = S.comp.gateAsk;
  pushT({ type: 'user', text: text || '(sketch only)', img });
  Object.assign(S.comp, { text: '', force: true, img: false, skipImg: false, gateAsk: false, scope: 'auto' });
  inval('composer');
  if (wasBrief) {
    S.comp.stage = 'chat';
    const w = pushT({ type: 'working', text: img ? 'Reading the brief and the sketch…' : 'Reading the brief…' });
    later(() => { dropT(w); proposePlan(); }, 900 / proto.speed);
    return;
  }
  if (gateAskNow && S.run.state === 'gate') { redrawControls(text); return; }
  route(text, scope);
}
function route(text, scope) {
  const t = text.toLowerCase();
  const oos = [...new Set([...text].filter(c => /\p{L}/u.test(c) && !KERNEL.has(c)))];
  if (oos.length) { later(() => pushT({ type: 'oos', chars: oos }), 450 / proto.speed); return; }
  if (/\b(bold|bolder|heavier|heavy|weight|thicker|darker)\b/.test(t)) { later(proposeBolder, 600 / proto.speed); return; }
  const m = text.match(/\b(?:fix|redo|redraw|improve|adjust|tweak|repair|change)\b\s+(?:the\s+)?(?:letter\s+)?["“']?([A-Za-z0-9])["”']?(?![A-Za-z0-9])/i);
  const ch = m ? m[1] : (scope !== 'set' && scope !== 'drafts' && scope !== 'controls' ? scope : null);
  if (ch && S.G[ch]) { smallAsk(ch); return; }
  if (/\b(nicer|better|improve|polish|cleaner|good)\b/.test(t) || t.split(/\s+/).length < 3) {
    later(() => pushT({ type: 'scopeq', q: 'Which letters should I change?', opts: [`Only drafts (${countBy(ALL).Draft})`, S.sel.length === 1 ? `Just ${dispName(S.sel[0])}` : 'Just the selected letter', 'Whole set, except kept and yours'] }), 450 / proto.speed);
    return;
  }
  later(() => pushT({ type: 'agent', text: 'I can draft letters, redo or fix one letter, adjust spacing or make the set bolder. Try “Fix the g” or “Make it bolder”. Nothing changed (0 edits).' }), 450 / proto.speed);
}
const PART_NAME = { g: 'the tail', a: 'the bowl', e: 'the eye', s: 'the spine', R: 'the leg', k: 'the leg', y: 'the tail', f: 'the hook', j: 'the hook', t: 'the crossbar' };
function smallAsk(ch) {
  const g = S.G[ch];
  if (g.status === 'Yours') { pushT({ type: 'scopeq', q: `${dispName(ch)} is yours, so I don’t touch it unless you say so. Change it anyway?`, opts: [`Change ${dispName(ch)}`, 'Leave it'], act: 'yours', ch }); return; }
  if (S.editor.open && S.editor.ch === ch && S.editor.mode === 'own') { pushT({ type: 'agent', html: `${esc(dispName(ch))} is open in your editor, so I won’t touch it. Use <b>Hand to agent</b> in the editor if you want me to.` }); return; }
  if (g.component) { pushT({ type: 'agent', text: `${dispName(ch)} uses a component, so it’s manual only in v1. Nothing changed (0 edits).` }); return; }
  agentSingle(ch, { prefix: `redrew ${PART_NAME[ch] || 'the outline'}` });
}
function proposePlan() {
  S.prop = Object.assign({}, SPEC_PROPOSAL);
  S.plan = { open: true, punct: false, marks: {} };
  S.run = Object.assign(idleRun(S.run.cap), { state: 'ready' });
  pushT({ type: 'agent', html: `Here’s a plan. I suggest ${plural(Object.keys(S.prop).length, 'spec value')}; they’re marked with a dot in the spec line, and each one says why. I’ll draw <b>n o H O</b> first and stop for your OK. Nothing is drawn until you press Run. Punctuation and symbols are a later step.` });
  inval('spec', 'plan', 'run', 'composer');
  later(() => { const sc = $('#pane-scroll'); if (sc) sc.scrollTop = 0; }, 60);
}
function bolderScope() {
  const b = S.bolder; if (!b) return [];
  return ALL.filter(c => hasOutline(S.G[c]) && ((b.drafts && S.G[c].status === 'Draft') || (b.kept && S.G[c].status === 'Kept') || (b.yours && S.G[c].status === 'Yours')));
}
function proposeBolder() {
  if (S.bolder && S.bolder.state === 'open') S.bolder.state = 'cancelled';
  S.bolder = { id: nid('b'), state: 'open', drafts: true, kept: false, yours: false };
  pushT({ type: 'bolder', id: S.bolder.id });
  inval('proofBody', 'thread');
}
/* a bolder run replaces S.run, so it may only start when no run is waiting to be finished */
const bolderCanApply = () => ['idle', 'done', 'stopped'].includes(S.run.state);
function applyBolder() {
  const b = S.bolder; if (!b || b.state !== 'open' || !canEdit()) return;
  if (!bolderCanApply()) { say('Stop or finish the current run first.'); return; }
  const chars = bolderScope(); if (!chars.length) return;
  checkpoint('Before bolder');
  b.state = 'applied'; b.n = chars.length;
  startRun('bolder', chars, { label: 'Bolder' });
  inval('proofBody', 'thread');
}

/* =====================================================================
   14. Export preflight
   ===================================================================== */
/* failed glyphs grouped by why they failed: an outline check is not the same as a cut-off answer */
function failReasons(list) {
  const by = { check: [], cut: [] };
  list.forEach(ch => (S.G[ch].failKind === 'cut' ? by.cut : by.check).push(esc(ch)));
  return [by.check.length ? `Outline check: ${by.check.join(' ')}.` : '', by.cut.length ? `Answer cut off: ${by.cut.join(' ')}.` : ''].filter(Boolean).join(' ');
}
function rPreflight() {
  const v = $('#preflightview');
  if (!S.preflight.open) { return; }
  const pf = S.preflight, c = countBy(ALL), drawn = countDrawn();
  const missing = ALL.filter(ch => ch !== ' ' && ch !== NBSP && !isDrawn(S.G[ch]));
  const failed = ALL.filter(ch => S.G[ch].status === 'Failed');
  const spaceSet = S.G[' '].adv > 0 && S.G[NBSP].adv > 0;
  const chk = (st, text, btn) => `<div class="pf-check">${icon(st === 'ok' ? 'check_circle' : st === 'bad' ? 'error' : 'warning', st)}<p>${text}</p><span>${btn || ''}</span></div>`;
  const pct = n => (n / 116 * 100).toFixed(2) + '%';
  const groupsMissing = GROUPS.map(g => ({ g, list: g.chars.filter(ch => missing.includes(ch)) })).filter(x => x.list.length);
  const blocking = missing.length > 0 || failed.length > 0;
  const msg = recentMsg();
  let h = `<div class="pf-head"><h4>Export preflight</h4><span class="msg-slot${msg ? ' is-msg' : ''}" role="status">${esc(msg || 'Latin Kernel · 116 characters + .notdef')}</span><button class="icon-btn" type="button" data-act="closePreflight" data-k="pf-close" aria-label="Close preflight (Esc)" title="Close (Esc)">${icon('close')}</button></div><div class="pf-body">`;
  h += `<section class="pf-cov"><div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap"><h4>Coverage</h4><span class="num">${drawn}/116</span><span class="muted" style="font-size:12px">${c.Kept} kept · ${c.Draft} drafts · ${c.Yours} yours · ${missing.length} missing</span></div>
    <div class="bar" role="img" aria-label="${drawn} of 116 have outlines"><i style="width:${pct(c.Kept)};background:var(--success)"></i><i style="width:${pct(c.Draft)};background:var(--primary)"></i><i style="width:${pct(c.Yours)};background:var(--foreground)"></i></div></section>`;
  if (groupsMissing.length) {
    h += `<section class="pf-missing"><h4>Missing glyphs</h4><span class="hint">Click one to open it. Groups hidden in the grid are listed too.</span>${groupsMissing.map(({ g, list }) => `<div class="pf-grp"><span>${g.name}${!g.basic && !S.view.all ? ' (hidden in the grid)' : ''}</span><div class="pf-chips">${list.map(ch => `<button class="gchip" type="button" data-act="open" data-ch="${cpId(ch)}" data-k="pf-${cpId(ch)}" title="${esc(dispName(ch))} · ${S.G[ch].status}">${esc(cellLabel(ch))}</button>`).join('')}</div></div>`).join('')}</section>`;
  }
  h += `<section class="pf-checks"><h4>Checks</h4>
    ${chk('ok', '.notdef: Noddy builds the box glyph shown for missing characters.')}
    ${spaceSet ? chk('ok', `Space <span class="num">${S.G[' '].adv}</span> and no-break space <span class="num">${S.G[NBSP].adv}</span> have widths.`) : chk('warn', 'Space and no-break space have no width yet, so words would run together.', `<button class="btn btn--sm" type="button" data-act="setSpaceWidth" data-k="pf-space">Set to 512</button>`)}
    ${failed.length ? chk('bad', `${plural(failed.length, 'glyph')} failed. ${failReasons(failed)}`, `<button class="btn btn--sm" type="button" data-act="showFailed" data-k="pf-failed">Show failed</button>`) : chk('ok', 'Every outline passes the check.')}
    ${c.Draft ? chk('warn', `${plural(c.Draft, 'draft')} not kept yet. Export includes them as they are.`, `<button class="btn btn--sm" type="button" data-act="showDrafts" data-k="pf-drafts">Show drafts</button>`) : chk('ok', 'No drafts waiting for review.')}
    ${chk('ok', `Ascender <span class="num">${ASC}</span> and descender <span class="num">${fmtN(DESC)}</span> cover every glyph, so nothing clips.`)}
    ${pf.build === 'ok' ? chk('ok', `Test build works: <span class="num">${drawn + 1}</span> glyphs, <span class="num">46 KB</span>.`) : pf.build === 'running' ? chk('warn', 'Building the font in memory…') : chk('warn', 'Test build not run yet. It builds the font in memory, without saving a file.', `<button class="btn btn--sm" type="button" data-act="runBuild" data-k="pf-build">Run test build</button>`)}
  </section>`;
  if (pf.exported) h += chk('ok', 'Built <b>Bakery Sans Draft.otf</b> (46 KB). In the app this downloads; the prototype doesn’t save files.', `<button class="btn btn--primary btn--sm" type="button" data-act="proofExported" data-k="pf-proof">Proof exported file</button>`);
  h += `<div class="pf-foot">${blocking ? `<button class="btn" type="button" data-act="exportAnyway" data-k="pf-anyway">Export draft anyway</button><button class="btn btn--primary" type="button" disabled title="Draw the missing glyphs and fix failed ones first">Export OTF</button><span class="hint">${plural(missing.length, 'glyph')} missing${failed.length ? `, ${failed.length} failed` : ''}.</span>`
    : `<button class="btn btn--primary" type="button" data-act="exportNow" data-k="pf-export">Export OTF</button>`}<span class="hint">Only you can export. The agent can’t.</span></div></div>`;
  patch(v, h);
}

/* =====================================================================
   15. New font screen
   ===================================================================== */
function rNewFont() {
  const el = $('#newfont'); if (S.screen !== 'new') return;
  const nf = S.newfont;
  const setOpt = (id, name, n, desc, dis) => `<label class="set-opt${dis ? ' dis' : ''}"><input type="radio" name="nf-set" value="${id}" data-change="nfSet" data-k="nfs-${id}"${nf.set === id ? ' checked' : ''}${dis ? ' disabled' : ''}><b>${name} <span class="num" style="font-weight:400;color:var(--muted-foreground)">${n}</span></b><span>${desc}</span></label>`;
  const narrow = tier() === 'narrow';
  /* opened from File › New font: the current font stays open behind this screen until a start is picked */
  const back = nf.back ? `<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><button class="btn w88" type="button" data-act="nfCancel" data-k="nf-cancel">Cancel</button><span class="hint">${esc(S.project.name)} stays open until you pick a start below.</span></div>` : '';
  patch(el, `<div class="nf card">
    <div><span class="meta">Noddy ${VERSION}</span><h1>New font</h1></div>${back}
    <div class="nf-sec nf-name"><label class="label" for="nf-name">Font name</label><input id="nf-name" class="input input--32 input--text" data-input="nfname" data-k="nf-name" value="${esc(nf.name)}" autocomplete="off"></div>
    <fieldset class="nf-sec" style="border:0;padding:0;margin:0"><legend class="label" style="padding:0;margin-bottom:8px">Character set</legend>
      <div class="sets">${setOpt('kernel', 'Latin Kernel', '116', 'English letters and figures plus everyday punctuation: curly quotes, dashes, €, ©.')}${setOpt('basic', 'Basic Latin', '95', 'Only the characters on an English keyboard. (Not wired in the prototype.)', true)}${setOpt('core', 'Latin Core', 'later', 'Western European accents. Comes after v1.', true)}</div>
      <p class="hint" style="margin-top:6px">The galley opens on letters and figures (62). Punctuation and symbols are one click away.</p></fieldset>
    <div class="nf-sec"><span class="label">How do you want to start?</span><div class="starts">
      <button class="start" type="button" data-act="nfStart" data-start="agent" data-k="st-agent">${icon('forum')}<b>Start with agent</b><span>The agent drafts the letters and stops at n o H O for your OK. You pick a model next.</span></button>
      <button class="start" type="button" data-act="nfStart" data-start="draw" data-k="st-draw">${icon('stylus')}<b>Draw myself</b><span>Pen and path tools. No model or key needed. You can bring in the agent later.${narrow ? ' Drawing needs a window at least 760px wide; on this screen you can only view.' : ''}</span></button>
      <button class="start" type="button" data-act="nfStart" data-start="file" data-k="st-file" aria-pressed="${nf.start === 'file'}">${icon('upload_file')}<b>Start from a font file</b><span>Import an OTF or TTF and keep the characters in the set. Its licence must allow changes.</span></button>
    </div></div>
    ${nf.start === 'file' ? `<div class="import"><div class="row"><label class="btn" for="nf-file">${icon('folder_open', 'ms--sm')}Choose a font file…</label><input id="nf-file" class="sr-only" type="file" accept=".otf,.ttf,.woff,.woff2" data-change="nfFile"><span class="muted">or</span><button class="btn btn--minimal" type="button" data-act="nfSample" data-k="nf-sample">Use a sample: Inter Regular (OFL)</button></div>
      ${nf.file ? `<p><b>${esc(nf.file)}</b> · <span class="num">116 of 116</span> characters found; the rest are left out. <span class="muted">(Prototype: the file isn’t read.)</span></p>
        <p class="hint">Licence check: SIL Open Font License 1.1 allows changes. Keep the licence with your font, and don’t reuse the font’s reserved name.</p>
        <div class="row"><button class="btn btn--primary" type="button" data-act="nfOpen" data-k="nf-open">Open the galley</button></div>` : '<p class="hint">Fonts you didn’t make need a licence that allows changes. Noddy shows the licence it finds before you continue.</p>'}</div>` : ''}
    <p class="hint">Noddy is a fork of Glyphr Studio 2, under GPL-3.0.</p></div>`);
}

/* =====================================================================
   16. Popovers and menus
   ===================================================================== */
const MI = (act, ic, txt, o) => { o = o || {}; return `<button class="menu-item" type="button" role="menuitem" data-act="${act}"${o.ch ? ` data-ch="${o.ch}"` : ''}${o.g ? ` data-g="${o.g}"` : ''}${o.v ? ` data-v="${o.v}"` : ''} data-k="mi-${act}${o.v ? '-' + o.v : ''}"${o.dis ? ' aria-disabled="true"' : ''}>${icon(ic, 'ms--sm')}${txt}${o.k ? `<span class="k">${o.k}</span>` : ''}</button>`; };
const POPS = {
  spec(d) {
    const k = d.key, l = SPEC_LABEL[k];
    if (k === 'upm') return { label: 'UPM', html: `<h5>UPM ${S.spec.upm}</h5><p class="hint">Fixed in v1. Changing units per em would rescale every glyph, so it isn’t editable here.</p><div class="row"><button class="btn btn--sm w72" type="button" data-act="closePop" data-k="pp-ok">OK</button></div>` };
    if (S.prop && k in S.prop && !d.edit) return { label: l, html: `<h5>${l}</h5><p>Agent suggests <b class="num">${fmtN(S.prop[k])}</b> <span class="muted">(now <span class="num">${fmtN(S.spec[k])}</span>)</span></p><p class="hint">${esc(SPEC_WHY[k] || '')}</p>
      <div class="row"><button class="btn btn--primary btn--sm w88" type="button" data-act="specAccept" data-key="${k}" data-k="pp-accept">Accept</button><button class="btn btn--sm w88" type="button" data-act="specEdit" data-key="${k}" data-k="pp-edit">Edit</button></div><p class="hint">Esc keeps <span class="num">${fmtN(S.spec[k])}</span>.</p>` };
    const val = d.edit && S.prop && k in S.prop ? S.prop[k] : (S.spec[k] == null ? '' : S.spec[k]);
    return { label: l, html: `<h5>${l}</h5><div class="row"><input id="spec-in" class="input input--32" data-k="pp-in" inputmode="numeric" value="${val}" aria-label="${l} in font units"><span class="muted">units</span></div>
      <div class="row"><button class="btn btn--primary btn--sm w88" type="button" data-act="specApply" data-key="${k}" data-k="pp-apply">Apply</button><button class="btn btn--sm w88" type="button" data-act="closePop" data-k="pp-cancel">Cancel</button></div><p class="hint">Draws as a guide in the proof and the editor. Enter applies; Esc leaves it unchanged.</p>` };
  },
  set() {
    return { label: 'Character set', html: `<h5>Character set</h5>
      <div class="scope-list"><div class="scope-opt" style="cursor:default">${icon('check', 'ms--sm')}Latin Kernel<span class="cnt">116</span></div><div class="scope-opt" style="cursor:default">${icon('radio_button_unchecked', 'ms--sm')}Basic Latin<span class="cnt">95</span></div><div class="scope-opt" style="cursor:not-allowed;color:var(--muted-foreground)">${icon('block', 'ms--sm')}Latin Core<span class="cnt">later</span></div></div>
      <p class="hint">Switching to Basic Latin would move 21 glyphs to an “Outside set” group. No outlines are deleted. Only you can change the set; the agent can’t. (Switching isn’t wired in the prototype.)</p>
      <div class="row"><button class="btn btn--sm w72" type="button" data-act="closePop" data-k="ps-ok">Close</button></div>` };
  },
  file(d) {
    const note = d.note ? `<div class="menu-note" role="status">${esc(d.note)}</div>` : '';
    return { menu: true, label: 'File', html: MI('newFont', 'note_add', 'New font…') + MI('saveCopy', 'download', 'Save a copy (Noddy Project.gs2)') + '<div class="menu-sep"></div><div class="menu-note" style="padding-bottom:0">Classic pages</div>' +
      [['Kerning', 'format_letter_spacing'], ['Live preview', 'preview'], ['Global actions', 'tune'], ['Settings', 'settings'], ['Import & export', 'swap_vert'], ['Help', 'help'], ['About Noddy', 'info']].map(([p, ic]) => MI('classicPage', ic, p, { v: p })).join('') + note };
  },
  ctx(d) {
    const ch = d.ch, g = S.G[ch], id = cpId(ch), ro = S.flags.readOnly, conn = S.model.connected, narrow = tier() === 'narrow';
    let h = '';
    const head = `<div class="menu-note" style="padding-bottom:2px"><b>${esc(dispName(ch))}</b> · ${g.status}</div>`;
    /* spaces and .notdef are not letters: no agent, hold or revert actions */
    if (ch === ' ' || ch === NBSP) return { menu: true, label: `${dispName(ch)} actions`, html: head + MI('setspace', 'space_bar', 'Set width to 512', { ch: id, dis: ro }) };
    if (ch === NOTDEF) return { menu: true, label: '.notdef actions', html: head + MI('open', 'ink_pen', narrow ? 'View' : 'Edit by hand', { ch: id, k: 'Enter' }) };
    if (g.status === 'Draft') h += MI('keep', 'check_circle', 'Keep', { ch: id, dis: ro }) + MI('redo', 'refresh', 'Redo', { ch: id, dis: !conn || ro }) + MI('open', narrow ? 'visibility' : 'ink_pen', narrow ? 'View' : 'Edit by hand', { ch: id, k: 'Enter' }) + MI('revert', 'undo', 'Revert', { ch: id, dis: ro });
    else if (g.status === 'Drafting') h += MI('open', 'visibility', 'Watch', { ch: id }) + MI('takeover', 'front_hand', 'Take over', { ch: id, dis: ro || narrow });
    else if (g.status === 'Failed') h += (g.failKind === 'direction' ? MI('fixdir', 'swap_horiz', 'Fix direction', { ch: id, dis: ro }) : '') + MI('retry', 'refresh', 'Retry', { ch: id, dis: !conn || ro }) + MI('drawself', 'ink_pen', 'Draw it myself', { ch: id, dis: narrow });
    else h += MI('open', narrow ? 'visibility' : 'ink_pen', narrow ? 'View' : hasOutline(g) ? 'Edit by hand' : 'Draw', { ch: id, k: 'Enter' }) + (g.before !== undefined && hasOutline(g) ? MI('revert', 'undo', 'Revert', { ch: id, dis: ro }) : '') + (['Kept', 'Yours'].includes(g.status) && conn ? MI('redo', 'refresh', 'Redo', { ch: id, dis: ro }) : '');
    h += '<div class="menu-sep"></div>';
    if (g.status === 'Held') h += MI('release', 'play_arrow', g.mine ? 'Give back to the agent' : 'Back in queue', { ch: id, dis: ro });
    else if (!['Yours', 'Kept', 'Drafting'].includes(g.status) && !g.out) h += MI('hold', 'pause_circle', 'Hold', { ch: id, dis: ro }) + MI('mine', 'front_hand', 'I’ll draw this', { ch: id, dis: ro });
    if (conn && !g.out) h += MI('askAbout', 'forum', 'Ask agent about this', { ch: id });
    return { menu: true, label: `${dispName(ch)} actions`, html: head + h };
  },
  grp(d) {
    const grp = GROUPS.find(x => x.id === d.g), c = countBy(grp.chars), seen = S.proof.seen[grp.id];
    return { menu: true, label: grp.name, html: (c.Draft ? (seen ? MI('keepAll', 'check_circle', `Keep all ${c.Draft} drafts`, { g: grp.id }) : MI('proofGroup', 'visibility', `Proof ${plural(c.Draft, 'draft')} first`, { g: grp.id })) : '') +
      MI('proofGroup', 'format_letter_spacing', 'Spacing proof of this group', { g: grp.id }) + (c.Draft ? MI('askGrpRevert', 'undo', `Revert ${plural(c.Draft, 'draft')}…`, { g: grp.id, dis: S.flags.readOnly }) : '') };
  },
  chip(d) {
    const ch = d.ch, id = cpId(ch), m = S.plan && S.plan.marks[ch];
    return { menu: true, label: `Plan: ${ch}`, html: `<div class="menu-note" style="padding-bottom:2px"><b>${esc(ch)}</b> · ${m === 'held' ? 'held' : m === 'mine' ? 'you’ll draw it' : 'in the plan'}</div>` +
      (m ? MI('release', 'play_arrow', 'Back in the plan', { ch: id }) : MI('hold', 'pause_circle', `Hold ${ch}`, { ch: id }) + MI('mine', 'front_hand', 'I’ll draw this', { ch: id })) };
  },
  scope() {
    const cur = S.comp.scope, sel = S.editor.open ? S.editor.ch : S.sel.length === 1 ? S.sel[0] : null;
    const o = (v, t, on) => MI('setScope', on ? 'radio_button_checked' : 'radio_button_unchecked', t, { v });
    return { menu: true, label: 'Scope', html: o('auto', 'Follow my selection', cur === 'auto') + o('set', 'Whole set', cur === 'set') + o('drafts', 'Drafts only', cur === 'drafts') + (sel ? o('ch:' + cpId(sel), `Only ${esc(dispName(sel))}`, cur === sel) : '') };
  },
  model() {
    const m = curModel();
    if (!S.model.connected) return { label: 'Model', html: `<h5>No model connected</h5><p class="hint">Drawing works without one.</p><div class="row"><button class="btn btn--primary btn--sm" type="button" data-act="startConnect" data-k="pm-connect">Connect a model</button></div>` };
    return { label: 'Model', html: `<h5>${esc(m.name)} · ${esc(m.provider)}</h5><div class="row">${badge('Tools', m.tools)}${badge('Vision', m.vision)}<span class="badge">${m.paid ? 'Paid' : 'Free'}</span></div><p class="hint">The key is kept in memory only.</p>
      <div class="row"><button class="btn btn--sm" type="button" data-act="changeModel" data-k="pm-change">Change model or key</button><button class="btn btn--sm" type="button" data-act="disconnect" data-k="pm-disc">Disconnect</button></div>` };
  },
  filter() {
    const scope = scopeChars(), c = countBy(scope);
    const items = [['all', 'All', scope.length, 'apps'], ['needs', 'Needs you', c.Draft + c.Held + c.Failed, 'priority_high'], ...STATUSES.map(s => [s, s, c[s], ST_ICON[s]])];
    return { menu: true, label: 'Show glyphs', html: items.map(([id, l, n, ic]) => `<button class="menu-item" type="button" role="menuitemradio" aria-checked="${S.view.filter === id}" data-act="filterV" data-v="${id}" data-k="fm-${id}">${icon(ic, 'ms--sm')}${l}<span class="k">${n}</span></button>`).join('') +
      `<div class="menu-note">${S.view.all ? 'Counts cover all 116.' : 'Counts cover letters and figures. Punctuation &amp; symbols are hidden.'}</div>` };
  },
  save() {
    return { label: 'Not autosaving', html: `<h5>Not autosaving</h5><p class="hint">This browser’s storage is full, so changes since 14:20 aren’t saved. Save a copy to keep your work.</p><div class="row"><button class="btn btn--primary btn--sm" type="button" data-act="saveCopy" data-k="pv-save">Save a copy (Noddy Project.gs2)</button></div>` };
  },
};
function openPop(type, anchor, data) {
  S.pop = { type, key: anchor ? anchor.getAttribute('data-k') : null, data: data || {} };
  rPop();
  later(() => { const p = $('#pop'); if (!p) return; const f = p.querySelector('input:not([disabled]), button:not([disabled]):not([aria-disabled="true"])'); if (f) { f.focus(); if (f.select) f.select(); } }, 0);
}
function closePop(restore) {
  if (!S.pop) return;
  const key = S.pop.key; S.pop = null; $('#layer').innerHTML = '';
  if (restore !== false && key) { const a = document.querySelector(`[data-k="${CSS.escape(key)}"]`); if (a) a.focus(); }
}
function rPop() {
  const L = $('#layer');
  if (!S.pop) { L.innerHTML = ''; return; }
  const P = POPS[S.pop.type]; if (!P) { S.pop = null; L.innerHTML = ''; return; }
  const a = document.activeElement, key = a && L.contains(a) ? a.getAttribute('data-k') : null;
  const res = P(S.pop.data);
  L.innerHTML = `<div class="pop${res.menu ? ' menu' : ''}" id="pop" role="${res.menu ? 'menu' : 'dialog'}" aria-label="${esc(res.label || '')}">${res.html}</div>`;
  positionPop();
  if (key) { const n = L.querySelector(`[data-k="${CSS.escape(key)}"]`); if (n) n.focus(); }
}
function positionPop() {
  const p = $('#pop'); if (!p || !S.pop) return;
  let r = S.pop.data.at || null;
  if (!r && S.pop.key) { const a = document.querySelector(`[data-k="${CSS.escape(S.pop.key)}"]`); if (a) r = a.getBoundingClientRect(); }
  if (!r) r = { left: innerWidth / 2 - 120, right: innerWidth / 2, top: innerHeight / 3, bottom: innerHeight / 3 };
  const w = p.offsetWidth, h = p.offsetHeight;
  let top = r.bottom + 6; if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
  const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
  p.style.top = top + 'px'; p.style.left = left + 'px';
}

/* =====================================================================
   17. Actions (every click goes through data-act)
   ===================================================================== */
const chOf = el => chFromId(el.dataset.ch);
const focusKey = (k, ms) => later(() => { const b = Array.from(document.querySelectorAll(`[data-k="${CSS.escape(k)}"]`)).find(x => x.getClientRects().length) || document.querySelector(`[data-k="${CSS.escape(k)}"]`); if (b) b.focus(); }, ms || 30);
function firstEmpty() { return ORDER62.find(c => S.G[c].status === 'Empty'); }
function selectCell(ch, additive) {
  const prev = S.sel.slice();
  if (additive) S.sel = S.sel.includes(ch) ? S.sel.filter(c => c !== ch) : [...S.sel, ch];
  else S.sel = [ch];
  S.cursor = ch;
  [...prev, ch].forEach(invalCell);
  inval('selbar', 'proofBody', 'composer');
  later(syncRoving, 0);
}
function revertGlyph(ch) {
  const g = S.G[ch];
  const cur = { cs: g.cs, status: g.status, bold: g.bold, adv: g.adv, before: g.before, beforeStatus: g.beforeStatus, beforeBold: g.beforeBold, beforeAdv: g.beforeAdv, from: g.from, failCs: g.failCs, failKind: g.failKind, reason: g.reason };
  g.cs = g.before == null ? null : clone(g.before);
  /* only a Keep makes Kept: an outline coming back from an unknown state comes back as a draft */
  g.status = hasOutline(g) ? (['Kept', 'Yours', 'Draft'].includes(cur.beforeStatus) ? cur.beforeStatus : 'Draft') : 'Empty';
  g.bold = hasOutline(g) ? !!cur.beforeBold : false;
  g.adv = hasOutline(g) ? (cur.beforeAdv || g.adv) : DEF_ADV;
  g.before = cur.cs ? clone(cur.cs) : null; g.beforeStatus = cur.status; g.beforeBold = cur.bold; g.beforeAdv = cur.adv;
  if (!hasOutline(g)) g.from = null;
  g.failCs = null; g.failKind = null; g.reason = '';
  if (g.status === 'Draft') newDraft(ch);
  rebaseEditor(ch); touch(ch);
  return () => { Object.assign(g, cur); rebaseEditor(ch); touch(ch); };
}
function revertMany(list, what) {
  if (!list.length) return;
  const undos = list.map(revertGlyph);
  S.history.push({ label: what, undo: () => undos.forEach(u => u()) });
  say(`${what}: ${plural(list.length, 'glyph')}. Cmd+Z undoes.`);
}
function setSpaceWidth() {
  if (!canEdit()) return;
  const prev = [' ', NBSP].map(c => ({ c, adv: S.G[c].adv, status: S.G[c].status, reason: S.G[c].reason }));
  [' ', NBSP].forEach(c => { const g = S.G[c]; g.adv = 512; g.status = 'Kept'; g.reason = 'Width 512, set by you.'; touch(c); });
  S.history.push({ label: 'Set space width', undo: () => prev.forEach(p => { Object.assign(S.G[p.c], { adv: p.adv, status: p.status, reason: p.reason }); touch(p.c); }) });
  say('Space and no-break space are 512 units wide. Cmd+Z undoes.');
}
function runFromPlan() {
  if (!canEdit()) return;
  if (S.prop) { say('Review the spec values first.'); return; }
  const chars = planScope(); if (!chars.length) return;
  checkpoint('Before run');
  S.plan.open = false;
  startRun('set', chars, { gate: true, label: 'Run' });
}
function goCheckpoint(id) {
  const cp = S.checkpoints.find(x => x.id === id); if (!cp || !canEdit()) return;
  S.cpConfirm = null;
  const before = {};
  ALL.forEach(c => {
    const g = S.G[c]; if (g.status === 'Yours') return;
    const s = cp.snap[c]; const now = JSON.stringify(snapOf(g));
    if (now === JSON.stringify(s)) return;
    before[c] = JSON.parse(now);
    Object.assign(g, { status: ['Drafting', 'Queued'].includes(s.status) ? (s.cs ? 'Draft' : 'Empty') : s.status, cs: s.cs ? JSON.parse(JSON.stringify(s.cs)) : null, adv: s.adv, bold: s.bold, from: s.from, part: null });
    touch(c);
  });
  S.history.push({ label: `Go back to ${cp.name}`, undo: () => Object.keys(before).forEach(c => { Object.assign(S.G[c], before[c]); touch(c); }) });
  pushT({ type: 'sys', icon: 'history', text: `Went back to “${cp.name}”: ${plural(Object.keys(before).length, 'glyph')} changed. Your glyphs were not touched.` });
  inval('run'); say(`Went back to ${cp.name}. Cmd+Z undoes.`);
}
function doExport() { S.preflight.exported = true; inval('preflight'); say('Built Bakery Sans Draft.otf.'); focusKey('pf-proof', 60); }
function checkConn() {
  const m = curModel(); S.model.check = 'checking'; inval('thread');
  const owner = S;
  later(() => {
    if (S !== owner) return;
    const k = S.model.key.trim();
    if (k.length < 8 || /wrong|bad|invalid/i.test(k)) S.model.check = 'wrongkey';
    else if (!m.tools) S.model.check = 'notools';
    else {
      S.model.check = 'ok'; S.model.connected = true; S.model.intent = false; S.flags.keyLost = false;
      pushT({ type: 'sys', icon: 'check_circle', text: `Connection ok · ${m.name} · tools work${m.vision ? ' · vision works' : ' · no vision'}` });
      if (!S.plan) { pushT({ type: 'intro' }); S.comp.stage = 'brief'; }
      later(() => { const ta = $('#comp-ta'); if (ta && !ta.disabled) ta.focus(); }, 80);
    }
    inval('thread', 'paneHead', 'paneBanner', 'composer', 'run', 'selbar', 'editor');
  }, 1100 / proto.speed);
}
function openCtx(cell, at) {
  const ch = chOf(cell);
  S.pop = { type: 'ctx', key: cell.getAttribute('data-k'), data: { ch, at } };
  rPop();
  later(() => { const f = $('#pop .menu-item:not([aria-disabled="true"])'); if (f) f.focus(); }, 0);
}
function applySpecInput(k) {
  const i = $('#spec-in'); if (!i) return;
  const v = parseInt(String(i.value).replace('−', '-'), 10);
  if (!Number.isFinite(v)) { i.focus(); return; }
  if (!canEdit()) return;
  closePop(); setSpec(k, v);
}
/* Keep and Revert can remove their own button. Focus then moves to something that still exists:
   the canvas in the editor, the receipt's remaining button in the thread, otherwise the glyph's cell. */
function refocus(el, ch) {
  const inEd = !!(el.closest && el.closest('#editorview')), inThread = !!(el.closest && el.closest('#thread'));
  const rid = inThread ? (el.getAttribute('data-k') || '').split('-').pop() : '';
  later(() => {
    const a = document.activeElement;
    if (a && a !== document.body && document.contains(a)) return;
    if (inEd && S.editor.open) { const svg = $('#ed-svg'); if (svg) svg.focus({ preventScroll: true }); return; }
    if (inThread) { const b = document.querySelector(`[data-k="r-revert-${rid}"]`) || document.querySelector(`[data-k="rx-${rid}"]`); if (b) { b.focus(); return; } }
    const c = document.getElementById('cell-' + cpId(ch));
    if (c && c.getClientRects().length) { S.cursor = ch; syncRoving(); c.focus({ preventScroll: true }); }
  }, 40);
}
const ACT = {
  pop(el) {
    const type = el.dataset.pop, key = el.getAttribute('data-k');
    if (S.pop && S.pop.key === key) { closePop(); return; }
    const data = {};
    if (type === 'spec') data.key = el.dataset.key;
    if (type === 'grp') data.g = el.dataset.g;
    if (type === 'chip') data.ch = chOf(el);
    openPop(type, el, data);
  },
  closePop() { closePop(); },
  togglePane() {
    S.pane.open = !S.pane.open;
    inval('shell', 'header', 'paneHead', 'proofBody', 'edCanvas', 'thread', 'composer', 'run');
    if (tier() !== 'wide') focusKey(S.pane.open ? 'pane-hide' : 'agenttoggle');
  },
  openRun() { if (!S.pane.open) { S.pane.open = true; inval('shell', 'header', 'paneHead', 'thread', 'composer', 'run'); } focusKey(tier() === 'narrow' ? 'pane-hide' : 'rc-details', 40); },
  editHere() { S.flags.readOnly = false; if (S.editor.open && S.editor.mode === 'ro') S.editor.mode = 'own'; say('This tab can edit now. The other tab becomes read-only.'); renderAll(); },
  acceptAllSpec() { if (canEdit()) acceptAllSpec(); },
  specAccept(el) { if (!canEdit()) return; const k = el.dataset.key, v = S.prop[k]; closePop(); setSpec(k, v); },
  specEdit() { S.pop.data.edit = true; rPop(); later(() => { const i = $('#spec-in'); if (i) { i.focus(); i.select(); } }, 0); },
  specApply(el) { applySpecInput(el.dataset.key); },
  preset(el) { S.proof.preset = el.dataset.p; if (el.dataset.p !== 'spacing') S.proof.group = null; S.proof.exported = false; inval('proofHead', 'proofBody'); },
  clearProofGroup() { S.proof.group = null; inval('proofHead', 'proofBody'); focusKey('pr-spacing'); },
  proofGlyph(el, e) {
    const ch = chOf(el); if (!S.G[ch]) return;
    if (S.editor.open) { if (ch !== S.editor.ch) openEditor(ch); return; }
    selectCell(ch, e.shiftKey || e.metaKey || e.ctrlKey);
  },
  gateApprove() { gateApprove(); },
  gateAsk() { gateAsk(); },
  gateEdit() { openEditor('n'); },
  filter(el) {
    S.view.filter = el.dataset.f;
    if (S.preflight.open) S.preflight.open = false;
    if (S.editor.open) closeEditor({ retarget: true });
    inval('shell', 'gridTools', 'grid');
    focusKey(el.getAttribute('data-k') || 'f-menu');
  },
  filterV(el) { closePop(false); S.view.filter = el.dataset.v; if (S.preflight.open) S.preflight.open = false; if (S.editor.open) closeEditor({ retarget: true }); inval('shell', 'gridTools', 'grid'); focusKey('f-menu'); },
  toggleAll() { S.view.all = !S.view.all; inval('gridTools', 'grid'); focusKey('allswitch'); },
  toggleOutside() { S.outsideOpen = !S.outsideOpen; inval('grid'); },
  cell(el, e) { selectCell(chOf(el), e.shiftKey || e.metaKey || e.ctrlKey); },
  keep(el) { const ch = chOf(el), from = el; closePop(false); keep(ch); refocus(from, ch); },
  keepAll(el) {
    const g = GROUPS.find(x => x.id === el.dataset.g); closePop(false);
    if (!S.proof.seen[g.id]) { ACT.proofGroup(el); return; }
    if (Date.now() - (S.proof.seenAt[g.id] || 0) < 800) return;
    keepMany(g.chars, `Keep all ${g.range || g.name}`);
  },
  proofGroup(el) {
    const gid = el.dataset.g, grp = GROUPS.find(x => x.id === gid);
    S.proof.preset = 'spacing'; S.proof.group = gid; S.proof.seen[gid] = true; S.proof.seenAt[gid] = Date.now(); S.proof.exported = false;
    closePop(false);
    if (S.editor.open) closeEditor({ retarget: true });
    if (S.preflight.open) S.preflight.open = false;
    if (!grp.basic) S.view.all = true;
    if (S.view.filter !== 'all') S.view.filter = 'all';
    inval('shell', 'proofHead', 'proofBody', 'gridTools', 'grid', 'thread');
    say(`${grp.name} is in the spacing proof. Keep all is unlocked for it.`);
    later(() => { const b = $(`[data-k="ka-${gid}"]`); if (b) { b.scrollIntoView({ block: 'nearest' }); b.focus({ preventScroll: true }); } }, 80);
  },
  grpCancel() { const g = S.grpConfirm; S.grpConfirm = null; dirtyGroups.add(g); inval('cells'); focusKey('gm-' + g); },
  askGrpRevert(el) { closePop(false); S.grpConfirm = el.dataset.g; dirtyGroups.add(el.dataset.g); inval('cells'); focusKey('gc-cancel'); },
  grpRevert(el) {
    const gid = el.dataset.g, grp = GROUPS.find(x => x.id === gid); S.grpConfirm = null; dirtyGroups.add(gid);
    revertMany(grp.chars.filter(c => S.G[c].status === 'Draft'), `Discard drafts in ${grp.name}`); inval('cells'); focusKey('gm-' + gid);
  },
  keepSel() { keepMany(S.sel.slice(), 'Keep selected'); focusKey('sb-clear'); },
  clearSel() { const prev = S.sel; S.sel = []; prev.forEach(invalCell); inval('selbar', 'proofBody', 'composer'); },
  open(el) { const ch = chOf(el); closePop(false); openEditor(ch, { watch: S.G[ch].status === 'Drafting' && /watch/i.test(el.textContent) }); },
  redo(el) { closePop(false); const ch = chOf(el); if (!canEdit()) return; if (S.editor.open && S.editor.ch === ch && S.editor.mode === 'own') { handToAgent(); return; } agentSingle(ch); },
  revert(el) { closePop(false); if (!canEdit()) return; const ch = chOf(el); const u = revertGlyph(ch); S.history.push({ label: `Revert ${label(ch)}`, undo: u }); const it = S.rcptOf[ch]; if (it) { it.entries.push({ line: `reverted by you · now ${S.G[ch].status}`, detail: ['Revert is a new step. Nothing that happened later was undone.'] }); inval('thread'); } say(`Reverted ${dispName(ch)}. Cmd+Z undoes.`); refocus(el, ch); },
  mine(el) { closePop(false); hold(chOf(el), true); },
  hold(el) { closePop(false); hold(chOf(el), false); },
  release(el) { closePop(false); release(chOf(el)); },
  takeover(el) { closePop(false); takeOver(el.dataset.ch ? chOf(el) : S.editor.ch); },
  watch() { if (S.editor.open) { S.editor.mode = 'watch'; inval('editor'); focusKey('bn-take'); } },
  retry(el) { closePop(false); const ch = chOf(el); if (!canEdit()) return; if (S.editor.open && S.editor.ch === ch && S.editor.mode === 'own') { handToAgent(); return; } agentSingle(ch); },
  drawself(el) { closePop(false); const ch = chOf(el); openEditor(ch, { tool: 'pen' }); },
  fixdir(el) { closePop(false); fixDirection(chOf(el)); },
  fixdirOpen(el) {
    const ed = S.editor, g = S.G[ed.ch], ci = Number(el.dataset.ci); if (!g.cs || !g.cs[ci]) return;
    pushUndo(); reverseContour(g.cs[ci]); live(true); liveCommit(); say(`Reversed contour ${ci + 1}. Cmd+Z undoes.`);
  },
  setspace() { setSpaceWidth(); },
  setSpaceWidth() { setSpaceWidth(); },
  askAbout(el) { closePop(false); S.comp.scope = chOf(el); S.pane.open = true; inval('shell', 'composer', 'header', 'paneHead', 'thread'); later(() => { const ta = $('#comp-ta'); if (ta && !ta.disabled) ta.focus(); }, 40); },
  tool(el) {
    const ed = S.editor; if (edRO()) { blockedNote(); return; }
    if (ed.drawing != null && el.dataset.tool !== 'pen') endPath(true);
    ed.tool = el.dataset.tool; ed.panTool = false; ed.selC = null; inval('editor', 'edCanvas');
  },
  edPrev() { stepEditor(-1); },
  edNext() { stepEditor(1); },
  edBA() { S.editor.ba = !S.editor.ba; inval('editor', 'edCanvas'); },
  closeEditor() { closeEditor(); },
  handToAgent() { handToAgent(); },
  takeBack() { takeBack(); },
  dismissDone() { S.editor.agentDone = false; inval('editor'); focusKey('ed-close'); },
  dismissNote() { S.editor.note = ''; inval('editor'); },
  donePath() { endPath(); inval('editor'); },
  toggleInsp() { S.editor.insp = !S.editor.insp; inval('editor', 'edCanvas'); },
  zoomPan() { S.editor.panTool = !S.editor.panTool; inval('editor'); },
  zoomOut() { zoomCenter(1 / 1.1); inval('editor'); },
  zoomIn() { zoomCenter(1.1); inval('editor'); },
  toggleFill() { S.editor.fill = !S.editor.fill; inval('editor', 'edCanvas'); },
  zoom11() { const svg = $('#ed-svg'); zoomAt(1 / S.editor.view.s, { x: svg.clientWidth / 2, y: svg.clientHeight / 2 }); inval('editor'); },
  zoomFit() { S.editor.view = null; inval('edCanvas', 'editor'); },
  openPreflight() { closePop(false); if (S.editor.open) closeEditor({ retarget: true }); S.preflight.open = true; inval('shell', 'preflight'); focusKey('pf-close', 50); },
  closePreflight() { S.preflight.open = false; inval('shell'); focusKey('export'); },
  exportAnyway() { doExport(); },
  exportNow() { doExport(); },
  proofExported() { S.proof.exported = true; S.preflight.open = false; S.proof.preset = 'lf'; S.proof.group = null; inval('shell', 'proofHead', 'proofBody'); say('The proof now shows the exported file.'); },
  runBuild() { S.preflight.build = 'running'; inval('preflight'); later(() => { S.preflight.build = 'ok'; inval('preflight'); }, 900 / proto.speed); },
  showFailed() { S.preflight.open = false; S.view.filter = 'Failed'; inval('shell', 'gridTools', 'grid'); focusKey('f-menu'); },
  showDrafts() { S.preflight.open = false; S.view.filter = 'Draft'; inval('shell', 'gridTools', 'grid'); focusKey('f-menu'); },
  runPlan() { runFromPlan(); },
  pause() { pauseRun(); },
  resume() { resumeRun(); },
  askStop() { askStop(); },
  cancelStop() { cancelStop(); },
  confirmStop() { confirmStop(); },
  runRest() { const chars = planScope(); if (chars.length && canEdit() && S.model.connected) startRun('set', chars, { gate: true, label: 'Run' }); },
  /* "End run, leave drafts": ends the run; its drafts stay Draft (nothing is kept without Keep) */
  keepDrafts() {
    const r = S.run; r.leftover = 0;
    r.queue.forEach(ch => { const g = S.G[ch]; if (g.status === 'Queued') { g.status = g.qPrev && !['Queued', 'Drafting'].includes(g.qPrev) ? g.qPrev : 'Empty'; r.leftover++; touch(ch, false); } });
    r.queue = []; r.job = null; r.state = 'stopped'; r.confirmDiscard = false;
    pushT({ type: 'sys', icon: 'stop_circle', text: `Run ended. Its drafts stay drafts until you keep or revert them.` }); inval('run', 'plan', 'proofHead', 'proofBody');
  },
  askDiscardRun() { S.run.confirmDiscard = true; inval('run'); focusRunKey('dr-cancel'); },
  cancelDiscardRun() { S.run.confirmDiscard = false; inval('run'); focusRunKey('rc-askDiscardRun'); },
  discardRun() { revertMany(runDrafts(), 'Discard run drafts'); ACT.keepDrafts(); },
  raiseCap() { S.run.cap += 2; resumeRun(); say(`Spend cap is ${money(S.run.cap)}. The run continues.`); },
  retryRun() { pushT({ type: 'sys', icon: 'refresh', text: 'Retrying. The run continues where it stopped.' }); resumeRun(); },
  pickModel() {
    if (S.model.connected) { S.model.connected = false; S.model.intent = true; S.model.check = 'idle'; S.model.key = ''; const alt = MODELS.find(m => m.tools && m.vision && m.id !== S.model.id); if (alt) S.model.id = alt.id; }
    else { S.model.check = 'idle'; S.model.intent = true; if (!curModel().tools) S.model.id = 'gpt-5'; }
    S.pane.open = true;
    inval('shell', 'thread', 'paneHead', 'composer', 'header', 'run');
    later(() => { const r = $(`[data-k="m-${S.model.id}"]`); if (r) { r.scrollIntoView({ block: 'nearest' }); r.focus(); } }, 50);
  },
  toggleDetails() { S.pane.details = !S.pane.details; inval('run'); },
  askCp(el) { if (['running', 'pausing', 'waiting'].includes(S.run.state)) { say('Pause or stop the run first.'); return; } S.cpConfirm = el.dataset.id; inval('run'); focusRunKey('cpc-cancel'); },
  cancelCp() { S.cpConfirm = null; inval('run'); },
  goCp(el) { goCheckpoint(el.dataset.id); },
  togglePlan() { S.plan.open = !S.plan.open; inval('plan'); },
  togglePunct() { S.plan.punct = !S.plan.punct; inval('plan', 'run'); },
  toggleRcpt(el) { const id = el.dataset.id; if (S.openRcpt.has(id)) S.openRcpt.delete(id); else S.openRcpt.add(id); inval('thread'); },
  startConnect() { closePop(false); S.model.intent = true; S.pane.open = true; inval('shell', 'thread', 'header', 'paneHead', 'composer'); focusKey('key-in', 50); },
  checkConn() { checkConn(); },
  reenterKey() { Object.assign(S.model, { check: 'idle', key: '', connected: false, intent: true }); S.flags.keyLost = false; S.pane.open = true; inval('shell', 'thread', 'paneBanner', 'paneHead', 'composer', 'header', 'run'); focusKey('key-in', 50); },
  drawWithout() { S.model.intent = false; S.flags.keyLost = false; S.model.check = 'idle'; inval('thread', 'paneBanner'); if (!S.editor.open) openEditor(firstEmpty() || 'n', { tool: 'pen' }); },
  send() { send(); },
  attachImg() { S.comp.img = true; S.comp.skipImg = false; inval('composer'); focusKey('img-x'); },
  removeImg() { S.comp.img = false; inval('composer'); focusKey('attach'); },
  sendNoImg() { S.comp.skipImg = true; inval('composer'); later(send, 0); },
  applyBolder() { applyBolder(); },
  cancelBolder() { if (S.bolder) { S.bolder.state = 'cancelled'; inval('thread', 'proofBody'); } },
  answerScope(el) {
    const it = S.thread.find(x => x.id === el.dataset.id); if (!it || it.answer) return;
    const i = Number(el.dataset.i); it.answer = it.opts[i]; inval('thread');
    if (it.act === 'yours') { if (i === 0) agentSingle(it.ch, { prefix: `redrew ${PART_NAME[it.ch] || 'the outline'}` }); else pushT({ type: 'sys', icon: 'front_hand', text: `Left ${dispName(it.ch)} as it is.` }); return; }
    S.comp.scope = i === 0 ? 'drafts' : i === 1 && S.sel.length === 1 ? S.sel[0] : 'set'; inval('composer');
    later(() => pushT({ type: 'agent', text: 'Got it. Now tell me what to change, for example “rounder”, “narrower” or “bolder”.' }), 300);
  },
  setScope(el) { const v = el.dataset.v; S.comp.scope = v.startsWith('ch:') ? chFromId(v.slice(3)) : v; closePop(); inval('composer'); },
  newFont() {
    closePop(false); if (S.screen === 'new') return;
    if (S.editor.open) closeEditor({ retarget: true });
    S.preflight.open = false;
    S.newfont = { name: 'Untitled', set: 'kernel', start: null, file: null, back: true };
    S.screen = 'new'; renderAll(); focusKey('nf-name', 40);
  },
  nfCancel() { S.screen = 'galley'; S.newfont.back = false; renderAll(); focusKey('file', 40); },
  saveCopy() { closePop(false); S.flags.notSaving = false; say('Saved a copy as Noddy Project.gs2. (The prototype doesn’t write files.)'); inval('header'); },
  classicPage(el) { S.pop.data.note = el.dataset.v === 'About Noddy' ? `Noddy ${VERSION}. A fork of Glyphr Studio 2, GPL-3.0-or-later.` : `${el.dataset.v} opens the classic page. A run keeps going there, and the Run chip stays in the header.`; rPop(); },
  changeModel() { closePop(false); Object.assign(S.model, { connected: false, intent: true, check: 'idle' }); inval('thread', 'paneHead', 'composer', 'run', 'editor'); focusKey('m-' + S.model.id, 50); },
  disconnect() {
    closePop(false); if (['running', 'waiting'].includes(S.run.state)) pauseRun();
    Object.assign(S.model, { connected: false, intent: false, key: '', check: 'idle' });
    pushT({ type: 'sys', icon: 'link_off', text: 'Disconnected. Your key was forgotten. Drawing still works.' }); inval('thread', 'paneHead', 'composer', 'run', 'editor', 'selbar');
  },
  nfStart(el) {
    const st = el.dataset.start, name = S.newfont.name.trim() || 'Untitled';
    if (st === 'file') { S.newfont.start = 'file'; inval('newfont'); focusKey('nf-sample', 40); return; }
    boot({ pane: st === 'agent' }); S.project.name = name;
    if (st === 'agent') { S.model.intent = true; ALL.forEach(defPath); renderAll(); focusKey('m-gpt-5', 60); return; }
    ALL.forEach(defPath); openEditor('n', { tool: 'pen' }); S.editor.note = 'Start with n: its stem and arch set the style. Or close this and pick any letter.'; renderAll();
  },
  nfSample() { S.newfont.file = 'Inter-Regular.ttf'; inval('newfont'); focusKey('nf-open', 40); },
  nfOpen() {
    const name = S.newfont.name.trim() || 'Untitled', file = S.newfont.file;
    boot({ pane: false }); S.project.name = name;
    ALL.forEach(ch => { if (ch !== ' ' && ch !== NBSP && SRC.glyphs[ch] && SRC.glyphs[ch].d) { const g = S.G[ch]; g.cs = clone(base(ch)); g.adv = srcAdv(ch); g.status = 'Yours'; g.reason = `Imported from ${file}.`; } });
    [' ', NBSP].forEach(c => { S.G[c].adv = srcAdv(c); S.G[c].status = 'Yours'; });
    ALL.forEach(defPath); renderAll(); say(`Imported 116 glyphs from ${file}. They’re yours; the agent only touches them if you ask.`);
  },
  protoToggle() { proto.open = !proto.open; inval('proto'); if (proto.open) later(() => { const b = $('#proto-menu button[aria-current="true"]') || $('#proto-menu button'); if (b) b.focus(); }, 20); },
  scenario(el) { applyScenario(el.dataset.id); },
  protoTheme(el) { proto.theme = el.dataset.v; if (proto.theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', proto.theme); inval('proto'); },
  protoSpeed(el) { proto.speed = Number(el.dataset.v); inval('proto'); },
  protoGrey() { proto.grey = !proto.grey; inval('proto', 'shell'); },
  protoReset() { applyScenario('s1'); },
};
const CHANGE = {
  model(t) {
    /* a key belongs to one provider: switching provider clears it */
    const prev = curModel(); S.model.id = t.value; S.model.check = 'idle';
    if (curModel().provider !== prev.provider) S.model.key = '';
    inval('thread', 'paneHead', 'composer');
  },
  spacing(t) { applySpacing(t.dataset.f, t.value); },
  cap(t) { const v = parseFloat(t.value); if (Number.isFinite(v) && v > 0) S.run.cap = Math.round(v * 100) / 100; inval('run', 'plan'); },
  bolderScope(t) { if (S.bolder) { S.bolder[t.dataset.f] = t.checked; inval('thread'); } },
  nfSet(t) { S.newfont.set = t.value; inval('newfont'); },
  nfFile(t) { const f = t.files && t.files[0]; S.newfont.file = f ? f.name : null; inval('newfont'); focusKey('nf-open', 40); },
};
const INPUT = {
  key(t) { S.model.key = t.value; const b = $('[data-k="check-btn"]'); if (b) b.disabled = !t.value || S.model.check === 'checking'; },
  comp(t) { S.comp.text = t.value; },
  proofText(t) { S.proof.text = t.value; inval('proofBody'); },
  nfname(t) { S.newfont.name = t.value; },
};

/* =====================================================================
   18. Keyboard
   ===================================================================== */
function onEscape(e) {
  if (proto.open) { proto.open = false; inval('proto'); $('#proto-btn').focus(); return true; }
  if (S.pop) { closePop(); return true; }
  if (S.screen === 'new') { if (S.newfont.back) { ACT.nfCancel(); return true; } return false; }
  if (S.run.confirmStop) { cancelStop(); return true; }
  if (S.run.confirmDiscard) { ACT.cancelDiscardRun(); return true; }
  if (S.cpConfirm) { S.cpConfirm = null; inval('run'); return true; }
  if (S.grpConfirm) { ACT.grpCancel(); return true; }
  if (e.target && e.target.id === 'comp-ta') { e.target.blur(); return true; }
  if (S.editor.open) {
    const ed = S.editor;
    if (ed.drawing != null) { endPath(); inval('editor'); return true; }
    if (ed.sel && ed.sel.size) { ed.sel = new Set(); inval('edCanvas'); return true; }
    closeEditor(); return true;
  }
  if (S.preflight.open) { ACT.closePreflight(); return true; }
  if (tier() !== 'wide' && S.pane.open && S.screen !== 'new') { ACT.togglePane(); return true; }
  if (S.sel.length) { ACT.clearSel(); return true; }
  return false;
}
function gridNav(e, cell) {
  const cells = $$('#grid-scroll .cell'), i = cells.indexOf(cell); let j = -1;
  const r = cell.getBoundingClientRect();
  switch (e.key) {
    case 'ArrowRight': j = i + 1; break;
    case 'ArrowLeft': j = i - 1; break;
    case 'Home': j = 0; break;
    case 'End': j = cells.length - 1; break;
    case 'ArrowDown': case 'ArrowUp': {
      const down = e.key === 'ArrowDown', cx = r.left + r.width / 2; let best = null, bs = Infinity;
      for (const c of cells) {
        const q = c.getBoundingClientRect();
        if (down ? q.top <= r.top + 4 : q.top >= r.top - 4) continue;
        const sc = Math.abs(q.top - r.top) * 1000 + Math.abs(q.left + q.width / 2 - cx);
        if (sc < bs) { bs = sc; best = c; }
      }
      if (best) j = cells.indexOf(best);
      break;
    }
    default: return false;
  }
  if (j < 0 || j >= cells.length) return true;
  const n = cells[j]; S.cursor = chFromId(n.dataset.ch);
  cells.forEach(c => { c.tabIndex = c === n ? 0 : -1; });
  n.focus(); n.scrollIntoView({ block: 'nearest' });
  return true;
}
function onKey(e) {
  const t = e.target, k = e.key, mod = e.metaKey || e.ctrlKey;
  const typing = !!(t && t.matches && t.matches('input, textarea, select'));
  if (k === 'Escape') { if (onEscape(e)) e.preventDefault(); return; }
  const pop = $('#pop');
  if (pop && pop.classList.contains('menu') && (k === 'ArrowDown' || k === 'ArrowUp')) {
    const items = $$('#pop .menu-item:not([aria-disabled="true"])'); const i = items.indexOf(document.activeElement);
    const n = k === 'ArrowDown' ? items[(i + 1) % items.length] : items[(i - 1 + items.length) % items.length];
    if (n) n.focus(); e.preventDefault(); return;
  }
  if (t && t.id === 'spec-in' && k === 'Enter') { e.preventDefault(); applySpecInput(S.pop && S.pop.data.key); return; }
  if (t && t.id === 'comp-ta' && k === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); return; }
  if (t && t.dataset && t.dataset.change === 'spacing' && k === 'Enter') { t.blur(); return; }
  if (mod && (k === 'z' || k === 'Z') && !typing) {
    e.preventDefault();
    if (e.shiftKey) { if (S.editor.open && S.editor.mode === 'own') { if (!edRedo()) say('Nothing to redo.'); } }
    else undoGlobal();
    return;
  }
  if (typing || mod || e.altKey) return;
  if (S.editor.open) {
    const ed = S.editor, svg = $('#ed-svg');
    /* only the drawing surface (or nothing focused) counts: Space on Take over, Done or a zoom button presses that button */
    const onCanvas = t === svg || t === document.body;
    if (k === ' ' && onCanvas) { e.preventDefault(); if (!ed.space) { ed.space = true; inval('editor'); } return; }
    if (k === '[') { e.preventDefault(); stepEditor(-1); return; }
    if (k === ']') { e.preventDefault(); stepEditor(1); return; }
    const tool = TOOL_KEYS[k.toLowerCase()];
    if (tool && !e.shiftKey) { e.preventDefault(); if (edRO()) { blockedNote(); return; } if (ed.drawing != null && tool !== 'pen') endPath(true); ed.tool = tool; ed.panTool = false; inval('editor', 'edCanvas'); return; }
    if ((k === 'Delete' || k === 'Backspace') && ed.mode === 'own' && onCanvas) { e.preventDefault(); deleteSel(); return; }
    if (k.startsWith('Arrow') && ed.mode === 'own' && ed.sel.size && onCanvas) {
      const s = e.shiftKey ? 10 : 1, d = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, s], ArrowDown: [0, -s] }[k];
      if (nudge(d[0], d[1])) e.preventDefault(); return;
    }
    if (k === 'Enter' && ed.drawing != null && onCanvas) { e.preventDefault(); endPath(); inval('editor'); }
    return;
  }
  if (t && t.classList && t.classList.contains('cell')) {
    if (k === 'Enter') { e.preventDefault(); openEditor(chOf(t)); return; }
    if (k === ' ') { e.preventDefault(); selectCell(chOf(t), true); return; }
    if (k === 'ContextMenu' || (k === 'F10' && e.shiftKey)) { e.preventDefault(); openCtx(t); return; }
    if (gridNav(e, t)) e.preventDefault();
  }
}
function onKeyUp(e) { if (e.key === ' ' && S.editor.open && S.editor.space) { S.editor.space = false; inval('editor'); } }

/* =====================================================================
   19. Prototype states (deterministic builders) and the state menu
   ===================================================================== */
function boot(o) {
  o = o || {};
  clearTimers(); RUNT.t = null;
  const th = $('#thread'); if (th) th.innerHTML = '';
  S = freshState(); clockMin = 0; S.screen = 'galley'; S.pane.open = o.pane !== false;
  if (o.connected) { S.model.connected = true; S.model.key = 'sk-proj-demo-0000'; S.model.id = o.model || 'gpt-5'; }
  return S;
}
function put(ch, status, o) {
  o = o || {};
  const g = S.G[ch];
  g.cs = o.clean ? clone(base(ch)) : agentOutline(ch, o.v || 0); g.adv = srcAdv(ch); g.status = status;
  g.from = o.clean ? null : (FROM[ch] || null); g.before = null; g.beforeStatus = 'Empty';
  if (status === 'Yours') g.reason = 'Drawn by you. Runs skip it.';
  defPath(ch);
  if (!o.clean && o.rcpt !== false) addRcpt(ch, receiptLine(ch, 'set'), receiptDetail(ch, 'set'));
}
function putFail(ch) {
  const g = S.G[ch], f = FAILS[ch]; S.failedOnce.add(ch);
  Object.assign(g, { status: 'Failed', reason: f.reason, failKind: f.kind, failCs: f.kind === 'cut' ? null : failOutline(ch) });
  addRcpt(ch, `failed · ${f.short}`, [f.reason, 'Nothing was saved to the glyph.']);
}
function connectedThread() {
  pushT({ type: 'sys', icon: 'check_circle', text: `Connection ok · ${curModel().name} · tools work${curModel().vision ? ' · vision works' : ' · no vision'}` });
  pushT({ type: 'intro' });
}
function planned() {
  boot({ connected: true }); connectedThread();
  pushT({ type: 'user', text: BRIEF, img: true });
  pushT({ type: 'agent', html: 'Here’s a plan. I suggest 9 spec values; I’ll draw <b>n o H O</b> first and stop for your OK.' });
  S.plan = { open: false, punct: false, marks: {} };
  Object.assign(S.spec, SPEC_PROPOSAL);
  checkpoint('Spec approved'); checkpoint('Before run');
}
function runState(doneIdx, o) {
  o = o || {};
  const r = S.run = Object.assign(idleRun(), { state: 'running', kind: 'set', total: 62, label: 'Run' });
  pushT({ type: 'runhead', text: `Run · 62 glyphs · started ${clock()}` });
  CONTROLS.forEach(c => put(c, o.controlsDraft ? 'Draft' : 'Kept'));
  r.drafted = 4; if (o.controlsDraft) r.draftedChars.push(...CONTROLS);
  if (!o.controlsDraft) { S.gateItem = pushT({ type: 'gate', status: 'approved', note: 'Approved. n o H O are kept. Checkpoint “Controls approved” saved.' }); checkpoint('Controls approved'); }
  ORDER62.slice(4, doneIdx).forEach(c => { if (FAILS[c]) { putFail(c); r.failed++; } else { put(c, 'Draft'); r.drafted++; r.draftedChars.push(c); } });
  ORDER62.slice(Math.max(4, doneIdx)).forEach(c => { const g = S.G[c]; g.status = 'Queued'; g.qPrev = 'Empty'; });
  r.queue = ORDER62.slice(Math.max(4, doneIdx)); r.done = Math.max(4, doneIdx);
  r.spent = ORDER62.slice(0, r.done).reduce((a, c) => a + cost(c), 0);
  return r;
}
function allDone() {
  planned();
  const r = runState(62); r.state = 'done'; r.queue = [];
  pushT({ type: 'summary', r: { drafted: r.drafted, failed: r.failed, skipped: 0 } });
  S.proof.seen.lower = true;
  GROUPS[1].chars.forEach(c => { if (S.G[c].status === 'Draft') S.G[c].status = 'Kept'; });
  pushT({ type: 'sys', icon: 'check_circle', text: 'You kept all a–z after the spacing proof.' });
  return r;
}
function outsideGlyph(ch, from, bar) {
  const g = mkGlyph(ch); g.out = true; g.status = 'Yours'; g.reason = 'Outside Latin Kernel. Kept, but not exported unless you choose to.';
  const cs = clone(base(from)); cs.push({ closed: true, nodes: bar.map(p => nd(p[0], p[1])) });
  g.cs = cs; g.adv = srcAdv(from); S.G[ch] = g; S.outside.push(ch); defPath(ch);
}
const SCEN = {
  s1() { S = freshState(); clockMin = 0; S.screen = 'new'; S.pane.open = false; },
  s2() { boot(); S.model.intent = true; },
  s3() { boot({ pane: false }); openEditor('o', { tool: 'pen' }); },
  s4() { boot({ connected: true }); connectedThread(); Object.assign(S.comp, { stage: 'brief', text: BRIEF, force: true, img: true }); },
  s5() {
    boot({ connected: true }); connectedThread(); pushT({ type: 'user', text: BRIEF, img: true }); proposePlan();
    S.post = () => { const a = $('[data-k="spec-xHeight"]'); if (a) openPop('spec', a, { key: 'xHeight' }); };
  },
  s6() {
    planned(); const r = runState(4, { controlsDraft: true });
    r.state = 'gate'; S.gateItem = pushT({ type: 'gate', status: 'open' });
  },
  s7() { planned(); runState(18); schedule(400); },
  s8() { planned(); runState(18); schedule(600); openEditor('b'); },
  s9() {
    planned(); const r = runState(18); const g = S.G.g;
    r.queue = ORDER62.slice(19);
    r.job = { ch: 'g', step: 1, prev: 'Empty', target: agentOutline('g', 0), mult: 8 };
    g.status = 'Drafting'; g.part = partialOutline(r.job.target, 1);
    openEditor('g'); schedule(STEP() * 8);
  },
  s10() {
    allDone(); S.sel = ['g']; S.cursor = 'g';
    Object.assign(S.comp, { text: 'Fix the g, its tail looks flat', force: true });
    S.post = () => send();
  },
  s11() {
    allDone(); ['a', 'Q', '7'].forEach(c => put(c, 'Yours', { clean: true }));
    pushT({ type: 'user', text: 'Make it bolder' }); proposeBolder();
  },
  s12() { allDone(); S.preflight.open = true; S.post = () => focusKey('pf-close'); },
  'e-oos'() { allDone(); pushT({ type: 'user', text: 'Add Ø and é too' }); pushT({ type: 'oos', chars: ['Ø', 'é'] }); },
  'e-cap'() { planned(); const r = runState(30); r.cap = Math.round(r.spent * 100) / 100; r.state = 'cap'; pushT({ type: 'sys', icon: 'payments', text: `Paused at your ${money(r.cap)} spend cap.` }); S.pane.details = true; },
  'e-rate'() { planned(); runState(22); startWaiting(12); },
  'e-int'() { planned(); const r = runState(41); r.state = 'interrupted'; pushT({ type: 'sys', icon: 'sync_problem', text: 'The page reloaded during the run. Noddy found the run record and stopped safely.' }); },
  'e-relay'() { planned(); const r = runState(26); r.state = 'offline'; pushT({ type: 'sys', icon: 'wifi_off', text: 'Can’t reach Noddy’s relay. The run paused after b; nothing was lost.' }); },
  'e-down'() { planned(); const r = runState(26); r.state = 'down'; pushT({ type: 'sys', icon: 'cloud_off', text: 'OpenAI returned error 503 three times. The run paused; your key is fine.' }); },
  'e-zero'() {
    allDone(); pushT({ type: 'user', text: 'Make the bowl of the a a little bigger' });
    pushT({ type: 'agent', html: '<span class="quote">“I’ve enlarged the bowl of the a and tightened its spacing.”</span>' });
    addRcpt('a', '0 edits applied · the model described a change but sent no edit', ['The model said: enlarged bowl, tightened spacing', 'What Noddy changed: nothing (no edits were sent)', 'a is unchanged'], { zero: true });
  },
  'e-check'() { allDone(); S.sel = ['D']; S.cursor = 'D'; openEditor('D'); },
  'e-wrongkey'() { boot(); S.model.intent = true; S.model.key = 'sk-wrong-key'; S.model.check = 'wrongkey'; },
  'e-checking'() { boot(); S.model.intent = true; S.model.key = 'sk-proj-demo-0000'; S.model.check = 'checking'; },
  'e-notools'() { boot(); S.model.intent = true; S.model.id = 'mistral-7b'; S.model.key = 'sk-or-demo-0000'; S.model.check = 'notools'; },
  'e-novision'() { boot({ connected: true, model: 'llama-3.3-70b' }); connectedThread(); Object.assign(S.comp, { stage: 'brief', text: BRIEF, force: true, img: true }); },
  'e-keylost'() { allDone(); S.model.connected = false; S.model.key = ''; S.flags.keyLost = true; pushT({ type: 'sys', icon: 'key_off', text: 'Noddy reloaded. The key was not kept.' }); },
  'e-notsaving'() { planned(); runState(18); S.flags.notSaving = true; schedule(400); },
  'e-tabs'() { allDone(); S.flags.readOnly = true; },
  'e-outside'() {
    allDone(); S.outsideOpen = true;
    outsideGlyph('Ø', 'O', [[180, -60], [300, -60], [1380, 1550], [1260, 1550]]);
    outsideGlyph('é', 'e', [[480, 1250], [640, 1250], [820, 1560], [640, 1560]]);
    S.post = () => { const s = $('#grid-scroll'); if (s) s.scrollTop = s.scrollHeight; };
  },
  'e-space'() {
    allDone(); S.view.all = true; const g = S.G[' ']; g.adv = 512; g.status = 'Kept'; g.reason = 'Width 512, set by you.';
    S.sel = [' ']; S.cursor = ' ';
    S.post = () => { const c = document.getElementById('cell-32'); if (c) { c.scrollIntoView({ block: 'center' }); c.focus({ preventScroll: true }); } };
  },
  'e-comp'() {
    allDone(); S.view.all = true; S.sel = ['“']; S.cursor = '“';
    S.post = () => { const c = document.getElementById('cell-' + cpId('“')); if (c) { c.scrollIntoView({ block: 'center' }); c.focus({ preventScroll: true }); } };
  },
  'e-pausing'() {
    planned(); const r = runState(18); const g = S.G.g;
    r.queue = ORDER62.slice(19); r.job = { ch: 'g', step: 1, prev: 'Empty', target: agentOutline('g', 0), mult: 7 };
    g.status = 'Drafting'; g.part = partialOutline(r.job.target, 1); r.state = 'pausing'; schedule(STEP() * 7);
  },
  'e-stopping'() {
    /* g's unfinished draft is already discarded: it is back to Empty and out of the queue */
    planned(); const r = runState(18); r.state = 'stopping'; r.discarding = 'g';
    S.G.g.status = 'Empty'; r.queue = r.queue.filter(c => c !== 'g');
    later(() => { if (S.run !== r) return; r.leftover = 0; r.queue.forEach(ch => { const g = S.G[ch]; g.status = 'Empty'; r.leftover++; touch(ch, false); }); r.queue = []; r.state = 'stopped'; pushT({ type: 'sys', icon: 'stop_circle', text: `Run stopped, draft of g discarded. ${plural(r.drafted, 'draft')} stay.` }); r.discarding = null; inval('run', 'plan'); }, 3500);
  },
  'e-hand'() { allDone(); openEditor('e'); S.post = () => { handToAgent(); S.editor.note = ''; }; },
  'e-nomodel'() { boot(); },
  'e-focus'() {
    boot({ pane: false }); S.flags.focusEdge = false;
    S.post = () => {
      const cells = $$('#grid-scroll .cell'); if (!cells.length) return;
      const top = cells[0].getBoundingClientRect().top; const row = cells.filter(c => Math.abs(c.getBoundingClientRect().top - top) < 2); const edge = row[row.length - 1];
      cells.forEach(c => { c.tabIndex = c === edge ? 0 : -1; }); S.cursor = chFromId(edge.dataset.ch);
      edge.classList.add('force-focus'); edge.focus();
    };
  },
  'e-done'() { allDone(); },
};
const PANE_SCEN = new Set(['s2', 's4', 's5', 's10', 's11', 'e-oos', 'e-zero', 'e-wrongkey', 'e-checking', 'e-notools', 'e-novision', 'e-keylost', 'e-nomodel', 'e-cap', 'e-int', 'e-relay', 'e-down']);
const SCREENS = [['s1', 'New font'], ['s2', 'Empty galley + Connect card'], ['s3', 'Draw by hand, no agent'], ['s4', 'Brief + reference image'], ['s5', 'Plan + spec proposal'], ['s6', 'Control gate: n o H O'],
  ['s7', 'Mid-run'], ['s8', 'Editor on a free glyph'], ['s9', 'Take over (agent drafting g)'], ['s10', '“Fix the g”'], ['s11', '“Make it bolder”'], ['s12', 'Export preflight']];
const EDGES = [['e-oos', 'Out-of-set request (Ø é)'], ['e-cap', 'Budget cap paused'], ['e-rate', 'Rate limit auto-pause'], ['e-int', 'Interrupted run'], ['e-relay', 'Relay offline'], ['e-down', 'Provider down'],
  ['e-zero', '“0 edits applied” receipt'], ['e-check', 'Outline check failed (D)'], ['e-checking', 'Checking connection…'], ['e-wrongkey', 'Wrong key'], ['e-notools', 'Model can’t use tools'], ['e-novision', 'Image to a model without vision'],
  ['e-keylost', 'Key lost after reload'], ['e-notsaving', 'Not autosaving'], ['e-tabs', 'Two tabs open (read-only)'], ['e-outside', 'Outside-set group'], ['e-space', 'Space width bar'], ['e-comp', 'Uses component tag'],
  ['e-pausing', 'Pausing…'], ['e-stopping', 'Stopping…'], ['e-hand', 'Hand to agent (agent editing)'], ['e-nomodel', 'Empty pane, no model'], ['e-focus', 'Keyboard focus on an edge cell'], ['e-done', 'Run finished summary']];
function rProto() {
  const m = $('#proto-menu'); m.hidden = !proto.open; $('#proto-btn').setAttribute('aria-expanded', String(proto.open));
  if (!proto.open) return;
  const cur = S.scenario;
  const item = (id, l, n) => `<button class="pm" type="button" data-act="scenario" data-id="${id}" data-k="pm-${id}"${cur === id ? ' aria-current="true"' : ''}><span class="pm-n">${n || '·'}</span>${esc(l)}</button>`;
  const seg = (act, v, l, on) => `<button type="button" data-act="${act}" data-v="${v}" data-k="pm-${act}-${v}" aria-pressed="${on}">${l}</button>`;
  patch(m, `<h6>Screens</h6>${SCREENS.map((s, i) => item(s[0], s[1], i + 1)).join('')}<h6>Edge states</h6>${EDGES.map(s => item(s[0], s[1])).join('')}
    <h6>Controls</h6><div class="pm-row"><button type="button" data-act="protoReset" data-k="pm-reset">Reset</button>${seg('protoTheme', 'system', 'System', proto.theme === 'system')}${seg('protoTheme', 'light', 'Light', proto.theme === 'light')}${seg('protoTheme', 'dark', 'Dark', proto.theme === 'dark')}</div>
    <div class="pm-row">${seg('protoSpeed', '0.25', 'Speed ¼×', proto.speed === 0.25)}${seg('protoSpeed', '1', '1×', proto.speed === 1)}${seg('protoSpeed', '3', '3×', proto.speed === 3)}<button type="button" data-act="protoGrey" data-k="pm-grey" aria-pressed="${proto.grey}">Greyscale</button></div>
    <p class="foot">Agent drafts are simulated from Inter (OFL). Real model quality is untested.</p>
    <p class="foot">Width tiers: 1100px and up docks the agent; 760–1099px makes it a drawer; under 760px is monitor mode. Resize the window to see them.</p>`);
}
function applyScenario(id) {
  const b = SCEN[id]; if (!b) return;
  clearTimers(); RUNT.t = null;
  if (S) S.pop = null;
  $('#layer').innerHTML = '';
  b();
  S.scenario = id;
  if (tier() !== 'wide' && !PANE_SCEN.has(id)) S.pane.open = false;
  ALL.forEach(defPath); defPath(NOTDEF); S.outside.forEach(defPath);
  S.comp.force = true;
  $('#thread').innerHTML = '';
  proto.open = false;
  renderAll();
  if (S.post) { const f = S.post; S.post = null; later(f, 90); }
}

/* =====================================================================
   20. Boot
   ===================================================================== */
function rShell() {
  const isNew = S.screen === 'new';
  $('#specline').hidden = isNew; $('#main').hidden = isNew; $('#newfont').hidden = !isNew;
  $('#pane').hidden = isNew || !S.pane.open;
  $('#main').classList.toggle('pane-off', !S.pane.open);
  const ed = !!S.editor.open, pf = !!S.preflight.open;
  $('#gridview').hidden = ed || pf; $('#editorview').hidden = !ed || pf; $('#preflightview').hidden = !pf;
  document.documentElement.classList.toggle('greyscale', proto.grey);
}
const RENDER = {
  shell: rShell, header: rHeader, banner: rBanner, spec: rSpec, proofHead: rProofHead, proofBody: rProofBody, gridTools: rGridTools, grid: rGrid, cells: rCells,
  selbar: rSelbar, editor: rEditor, edCanvas: rEdCanvas, preflight: rPreflight, paneHead: rPaneHead, paneBanner: rPaneBanner, run: rRun, plan: rPlan, thread: rThread,
  composer: rComposer, newfont: rNewFont, pop: rPop, proto: rProto,
};
let lastTier = 'wide';
function onResize() {
  const t = tier();
  if (t !== lastTier) {
    if (t === 'wide') S.pane.open = true; else if (lastTier === 'wide') S.pane.open = false;
    if (S.editor.open) {
      const ed = S.editor, g = S.G[ed.ch];
      const mode = t === 'narrow' ? 'monitor' : ed.mode === 'monitor' ? modeFor(g, { watch: true }) : ed.mode;
      if (mode !== ed.mode) { ed.mode = mode; ed.space = false; ed.panTool = false; ed.hover = null; ed.drag = null; }
      ed.view = null;
    }
    lastTier = t; renderAll();
  } else inval('proofBody', 'edCanvas');
  if (S.pop) positionPop();
}
function init() {
  buildEditorSkeleton(); buildPaneSkeleton();
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (S.pop && !e.target.closest('#pop') && !(t && t.dataset.act === 'pop' && t.getAttribute('data-k') === S.pop.key)) closePop(false);
    if (proto.open && !e.target.closest('#proto-menu') && !e.target.closest('#proto-btn')) { proto.open = false; inval('proto'); }
    if (!t) return;
    if (t.disabled || (t.getAttribute('aria-disabled') === 'true' && t.dataset.act !== 'tool')) return;
    const fn = ACT[t.dataset.act]; if (fn) fn(t, e);
  });
  document.addEventListener('dblclick', e => {
    const c = e.target.closest('.cell'); if (c) { openEditor(chOf(c)); return; }
    const pg = e.target.closest('[data-act="proofGlyph"]'); if (pg && !S.editor.open && S.G[chOf(pg)]) openEditor(chOf(pg));
  });
  document.addEventListener('contextmenu', e => {
    const c = e.target.closest('.cell'); if (!c) return;
    e.preventDefault(); selectCell(chOf(c), false);
    openCtx(c, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY });
  });
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('input', e => { const k = e.target.dataset && e.target.dataset.input; if (k && INPUT[k]) INPUT[k](e.target); });
  document.addEventListener('change', e => { const k = e.target.dataset && e.target.dataset.change; if (k && CHANGE[k]) CHANGE[k](e.target); });
  document.addEventListener('focusout', e => { if (e.target.classList && e.target.classList.contains('force-focus')) e.target.classList.remove('force-focus'); });
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { inval('proofBody'); if (S.editor.open) inval('edCanvas'); if (S.pop) positionPop(); });
    ro.observe($('#proof-body')); ro.observe($('#box'));
  }
  window.addEventListener('resize', onResize);
  $('#proto-btn').setAttribute('data-act', 'protoToggle');
  lastTier = tier();
  applyScenario('s1');
}
init();
})();
