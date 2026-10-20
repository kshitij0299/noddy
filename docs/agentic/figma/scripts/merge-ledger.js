// node merge-ledger.js '<json patch>'  -> deep-merges into ledger.json (never drops keys)
const fs = require('fs'); const p = __dirname + '/../ledger.json';
const L = JSON.parse(fs.readFileSync(p, 'utf8')); const patch = JSON.parse(process.argv[2]);
const merge = (a, b) => { for (const [k, v] of Object.entries(b)) { if (Array.isArray(v) && Array.isArray(a[k])) { for (const x of v) if (!a[k].includes(x)) a[k].push(x); } else if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') merge(a[k], v); else a[k] = v; } return a; };
fs.writeFileSync(p, JSON.stringify(merge(L, patch), null, 2)); console.log('ok', Object.keys(L).join(','));
