// --- Glyph board builder (DATA + OPTS injected above) ---
const S = 0.05, UPM_H = 2479, EMH = +(UPM_H * S).toFixed(2), ASC_PX = 1984 * S;
const CW = 178.46, CH = 176;
const BOARD = '50:68', CONTENT = '50:77', SECTION = '50:2', LAYOUT = '50:3';
const VID = {"bg/subtle":"VariableID:48:44","text/primary":"VariableID:48:47","text/secondary":"VariableID:48:48","glyph/ink":"VariableID:48:53","glyph/ghost":"VariableID:48:54","glyph/guide":"VariableID:48:55","space/1":"VariableID:48:65","space/2":"VariableID:48:66","space/3":"VariableID:48:67","space/4":"VariableID:48:68","space/10":"VariableID:48:72","radius/sm":"VariableID:48:75","radius/md":"VariableID:48:76","radius/lg":"VariableID:48:77"};
const TSID = { sub: 'S:1806503c9f22aefe6e8d4f5848789f1eecfc5fcb,', mono: 'S:d48f9eb377c7b199dbea3ab1eb8ef7ba9205f4c1,' };
const COUNTS = { Uppercase: 26, Lowercase: 26, Figures: 10, Punctuation: 32, Symbols: 20, Spaces: 2, Ghost: 1 };
const ORDER = ['Uppercase', 'Lowercase', 'Figures', 'Punctuation', 'Symbols'];

const vars = {};
await Promise.all(Object.entries(VID).map(async ([k, id]) => { vars[k] = await figma.variables.getVariableByIdAsync(id); }));
const page = await figma.getNodeByIdAsync('0:1');
await figma.setCurrentPageAsync(page);
const sSub = await figma.getStyleByIdAsync(TSID.sub), sMono = await figma.getStyleByIdAsync(TSID.mono);
for (const s of [sSub, sMono]) await figma.loadFontAsync({ family: s.fontName.family, style: s.fontName.style });

const paint = n => figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', vars[n]);
const fill = (node, n) => { node.fills = n ? [paint(n)] : []; return node; };
const rad = (node, n) => { ['topLeftRadius', 'topRightRadius', 'bottomLeftRadius', 'bottomRightRadius'].forEach(k => node.setBoundVariable(k, vars[n])); return node; };
const padAll = (node, n) => { ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight'].forEach(k => node.setBoundVariable(k, vars[n])); return node; };
const gap = (node, n) => { node.setBoundVariable('itemSpacing', vars[n]); return node; };
const cgap = (node, n) => { node.setBoundVariable('counterAxisSpacing', vars[n]); return node; };
const AL = (dir, name, parent) => { const f = figma.createAutoLayout(dir, { name }); f.fills = []; if (parent) parent.appendChild(f); return f; };
async function T(chars, st, color, parent, name) {
  const t = figma.createText(); if (parent) parent.appendChild(t);
  await t.setTextStyleIdAsync(st === 'sub' ? sSub.id : sMono.id);
  t.characters = chars; t.fills = [paint(color)]; t.name = name; return t;
}

const board = await figma.getNodeByIdAsync(BOARD);
const content = await figma.getNodeByIdAsync(CONTENT);
const out = { groups: {}, glyphs: {}, createdCells: 0, skipped: [] };

async function makeGroup(name, parent, wrap) {
  const g = AL('VERTICAL', name, parent); gap(g, 'space/4');
  if (wrap) g.layoutSizingHorizontal = 'FILL';
  const head = AL('HORIZONTAL', 'Title', g); gap(head, 'space/2'); head.counterAxisAlignItems = 'BASELINE';
  await T(name, 'sub', 'text/primary', head, 'Group title');
  await T(String(COUNTS[name]), 'mono', 'text/secondary', head, 'Count');
  const grid = AL('HORIZONTAL', 'Grid', g); gap(grid, 'space/4');
  if (wrap) { grid.layoutSizingHorizontal = 'FILL'; grid.layoutWrap = 'WRAP'; cgap(grid, 'space/4'); }
  return g;
}
const findGroup = name => content.findAll(n => n.type === 'FRAME' && n.name === name)[0];

if (OPTS.setup) {
  content.layoutWrap = 'NO_WRAP';
  content.layoutMode = 'VERTICAL';
  content.setBoundVariable('counterAxisSpacing', null);
  gap(content, 'space/10');
  content.layoutSizingVertical = 'HUG';
  board.layoutSizingVertical = 'HUG';
  for (const name of ORDER) if (!findGroup(name)) await makeGroup(name, content, true);
  if (!findGroup('Spaces')) {
    const row = AL('HORIZONTAL', 'Spaces & ghost', content); gap(row, 'space/4');
    await makeGroup('Spaces', row, false);
    await makeGroup('Ghost', row, false);
  }
}
for (const name of [...ORDER, 'Spaces', 'Ghost']) { const g = findGroup(name); if (g) out.groups[name] = g.id; }

async function makeCell(grid, label, inner) {
  const c = AL('VERTICAL', 'Cell/' + label, grid);
  c.resize(CW, CH);
  fill(c, 'bg/subtle'); rad(c, 'radius/lg'); padAll(c, 'space/3');
  c.primaryAxisAlignItems = 'SPACE_BETWEEN'; c.counterAxisAlignItems = 'CENTER';
  c.appendChild(inner);
  const lab = await T(label, 'mono', 'text/secondary', c, 'Label');
  lab.layoutSizingHorizontal = 'FILL'; lab.textAutoResize = 'HEIGHT'; lab.textAlignHorizontal = 'LEFT';
  const bl = figma.createRectangle(); bl.name = 'Baseline';
  c.insertChild(0, bl); bl.layoutPositioning = 'ABSOLUTE';
  bl.resize(CW - 24, 1); bl.x = 12; bl.y = 12 + ASC_PX;
  bl.constraints = { horizontal: 'STRETCH', vertical: 'MIN' };
  fill(bl, 'glyph/guide');
  out.createdCells++;
  return c;
}

function makeGlyph(g) {
  const W = +(g.a * S).toFixed(2);
  let comp;
  if (g.d) {
    const fr = figma.createNodeFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${EMH}" viewBox="0 0 ${g.a} ${UPM_H}"><path fill="#000000" fill-rule="nonzero" d="${g.d}"/></svg>`);
    comp = figma.createComponentFromNode(fr);
  } else {
    comp = figma.createComponent(); comp.resize(W, EMH);
  }
  comp.name = 'Glyph/' + g.n;
  comp.fills = []; comp.clipsContent = false;
  for (const v of comp.findAllWithCriteria({ types: ['VECTOR'] })) {
    v.name = 'Outline'; v.fills = [paint('glyph/ink')]; v.strokes = [];
    v.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
  }
  const hex = 'U+' + g.c.toString(16).toUpperCase().padStart(4, '0');
  comp.description = (g.d ? String.fromCodePoint(g.c) + ' · ' : '') + hex + ' · advance ' + g.a;
  return comp;
}

function makeGhost() {
  const comp = figma.createComponent(); comp.resize(1100 * S, EMH);
  comp.name = 'Glyph/ghost'; comp.fills = []; comp.clipsContent = false;
  const r = figma.createRectangle(); comp.appendChild(r); r.name = 'Ghost';
  r.resize((1100 - 160) * S, 1489 * S); r.x = 80 * S; r.y = (1984 - 1489) * S;
  r.fills = []; r.strokes = [paint('glyph/ghost')]; r.strokeWeight = 2; r.strokeAlign = 'INSIDE'; r.dashPattern = [6, 5];
  rad(r, 'radius/md'); r.constraints = { horizontal: 'SCALE', vertical: 'SCALE' };
  comp.description = 'Missing glyph · cap-height box · advance 1100';
  return comp;
}

const existing = new Map(board.findAllWithCriteria({ types: ['COMPONENT'] }).map(c => [c.name, c]));
for (const [gname, list] of Object.entries(DATA)) {
  const grid = findGroup(gname).findChild(n => n.name === 'Grid');
  for (const g of list) {
    const nm = 'Glyph/' + g.n;
    if (existing.has(nm)) { out.glyphs[g.n] = existing.get(nm).id; out.skipped.push(g.n); continue; }
    const comp = makeGlyph(g);
    let inner = comp;
    if (!g.d) {
      inner = AL('HORIZONTAL', 'Advance', null);
      inner.appendChild(comp);
      inner.strokes = [paint('glyph/guide')]; inner.strokeWeight = 1; inner.strokeAlign = 'INSIDE'; inner.dashPattern = [4, 4];
      rad(inner, 'radius/sm');
    }
    await makeCell(grid, g.n, inner);
    out.glyphs[g.n] = comp.id;
  }
}
if (OPTS.ghost) {
  if (existing.has('Glyph/ghost')) out.glyphs.ghost = existing.get('Glyph/ghost').id;
  else {
    const grid = findGroup('Ghost').findChild(n => n.name === 'Grid');
    const gh = makeGhost();
    await makeCell(grid, 'ghost', gh);
    out.glyphs.ghost = gh.id;
  }
}

// evidence
const comps = board.findAllWithCriteria({ types: ['COMPONENT'] });
out.componentCount = comps.length;
const sample = comps.find(c => c.name === 'Glyph/A') || comps.find(c => c.name === 'Glyph/zero');
if (sample) {
  const v = sample.findOne(n => n.type === 'VECTOR');
  const bv = v && v.fills[0] && v.fills[0].boundVariables && v.fills[0].boundVariables.color;
  out.sample = { name: sample.name, w: sample.width, h: sample.height, vec: v && { x: +v.x.toFixed(2), y: +v.y.toFixed(2), w: +v.width.toFixed(2), h: +v.height.toFixed(2), wind: v.vectorPaths[0] && v.vectorPaths[0].windingRule, fillVar: bv && (await figma.variables.getVariableByIdAsync(bv.id)).name } };
}
const g2 = comps.find(c => c.name === 'Glyph/g');
if (g2) { const v = g2.findOne(n => n.type === 'VECTOR'); out.g_desc = { y: +v.y.toFixed(2), bottom: +(v.y + v.height).toFixed(2), children: g2.children.length }; }
const strayFrames = page.children.filter(n => n.id !== SECTION).map(n => n.id + ' ' + n.name);
out.stray = strayFrames;

if (OPTS.finalize) {
  board.placeholder = false;
  const layout = await figma.getNodeByIdAsync(LAYOUT), section = await figma.getNodeByIdAsync(SECTION);
  section.resizeWithoutConstraints(layout.width + 240, layout.height + 240);
  out.section = [section.width, section.height];
}
out.board = { w: board.width, h: board.height, placeholder: board.placeholder };
out.groupBounds = Object.fromEntries(Object.entries(out.groups).map(([k, id]) => { const n = content.findAll(x => x.id === id)[0]; return [k, n ? [Math.round(n.x), Math.round(n.y), Math.round(n.width), Math.round(n.height)] : null]; }));
return out;
