// Birlestir: mevcut + bulk parcalar, anahtar-kumesi esit olanlari ele
const fs = require('fs');
function fold(s) {
  return s.toLocaleLowerCase('tr').replace(/ç/g, 'c').replace(/ğ/g, 'g')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
    .replace(/['’`]/g, ' ').replace(/\s+/g, ' ').trim();
}
const key = (e) => (e.k || []).map((x) => fold(x)).sort().join('||');
const cur = JSON.parse(fs.readFileSync(__dirname + '/knowledge.json', 'utf8').replace(/^\uFEFF/, ''));
const seen = new Set(cur.entries.map(key));
let added = 0, dup = 0;
for (let i = 1; i <= 7; i++) {
  const part = JSON.parse(fs.readFileSync(__dirname + '/bulk-part-' + i + '.json', 'utf8'));
  for (const e of part) {
    if (!e.k || !e.k.length || !e.a) continue;
    const k = key(e);
    if (seen.has(k)) { dup++; continue; }
    seen.add(k);
    cur.entries.push({ k: e.k, a: e.a });
    added++;
  }
}
fs.writeFileSync(__dirname + '/knowledge.json', '﻿' + JSON.stringify({ entries: cur.entries }), 'utf8');
console.log('MEVCUT-TOPLAM: ' + cur.entries.length + ' eklenen:' + added + ' atlanan-tekrar:' + dup);
