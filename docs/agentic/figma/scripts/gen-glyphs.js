// Generates use_figma scripts for the Glyph components (chunked).
// Usage: node gen-glyphs.js <outDir>
const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '..');
const j = JSON.parse(fs.readFileSync(path.join(DIR, 'glyphs-inter.json'), 'utf8'));
const ASC = j.meta.ascender; // 1984
const out = process.argv[2] || path.join(DIR, 'scripts', 'out');
fs.mkdirSync(out, { recursive: true });

const byChar = j.glyphs;
const GROUPS = [
  { name: 'Uppercase', chars: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'] },
  { name: 'Lowercase', chars: [...'abcdefghijklmnopqrstuvwxyz'] },
  { name: 'Figures', chars: [...'0123456789'] },
  { name: 'Punctuation', chars: [...'.,:;…!?\'"‘’“”·•-–—_()[]{}/\\*#%&@'] },
  { name: 'Symbols', chars: [...'+−×÷=<>~^`|$¢£¥€©®™°'] },
  { name: 'Spaces', chars: [' ', ' '] },
];
// sanity: all 116 covered exactly once
const all = GROUPS.flatMap(g => g.chars);
const missing = Object.keys(byChar).filter(c => !all.includes(c));
const extra = all.filter(c => !byChar[c]);
const dup = all.filter((c, i) => all.indexOf(c) !== i);
if (missing.length || extra.length || dup.length || all.length !== 116) {
  console.error({ missing, extra, dup, n: all.length });
  process.exit(1);
}

// flip y in M/L/Q/Z absolute path data: y' = ASC - y
function flip(d) {
  return d.replace(/([MLQZ])([^MLQZ]*)/g, (m, cmd, args) => {
    const nums = args.trim().length ? args.trim().split(/[\s,]+/).map(Number) : [];
    const outN = [];
    for (let i = 0; i < nums.length; i += 2) outN.push(nums[i], ASC - nums[i + 1]);
    return cmd + outN.join(' ');
  });
}

function glyphData(groupName) {
  const g = GROUPS.find(x => x.name === groupName);
  return g.chars.map(c => {
    const v = byChar[c];
    return { n: v.name, c: v.cp, a: v.adv, d: v.d ? flip(v.d) : '' };
  });
}

const PRE = fs.readFileSync(path.join(__dirname, 'glyph-prelude.js'), 'utf8');

function chunk(file, groupNames, opts = {}) {
  const data = {};
  for (const g of groupNames) data[g] = glyphData(g);
  const body = `const DATA = ${JSON.stringify(data)};\nconst OPTS = ${JSON.stringify(opts)};\n` + PRE;
  fs.writeFileSync(path.join(out, file), body);
  console.log(file, body.length, 'chars', groupNames.map(g => `${g}:${data[g].length}`).join(' '));
}

chunk('call1.js', ['Uppercase', 'Lowercase'], { setup: true });
chunk('call2.js', ['Figures', 'Punctuation', 'Symbols', 'Spaces'], { ghost: true, finalize: true });
