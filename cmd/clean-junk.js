const fs = require('fs');
const path = require('path');
const KB = path.join(__dirname, 'knowledge.json');
const JUNK_KEYS = new Set(['ne zaman']);
const db = JSON.parse(fs.readFileSync(KB, 'utf8').replace(/^﻿/, ''));
let touched = 0, dropped = 0;
db.entries = db.entries.filter((e) => {
  const nk = e.k.filter((k) => !JUNK_KEYS.has(k));
  if (nk.length !== e.k.length) touched++;
  e.k = nk;
  if (!e.k.length) { dropped++; return false; }
  return true;
});
fs.writeFileSync(KB, '﻿{"entries": [\n' +
  db.entries.map((e) => JSON.stringify({ k: e.k, a: e.a })).join(',\n') +
  '\n]}\n', 'utf8');
console.log('temizlenen kayit: ' + touched + ', dusen: ' + dropped);
