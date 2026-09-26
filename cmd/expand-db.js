// Veritabani birlestirici: expand-N.js dosyalarindaki kayitlari
// knowledge.json'a ekler (tekrar anahtari atlar, JSON'u dogrular).
// Calistir: node expand-db.js
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const KB = path.join(DIR, 'knowledge.json');

const files = fs.readdirSync(DIR).filter((f) => /^expand-\d+\.js$/.test(f)).sort();
if (!files.length) { console.log('expand dosyasi yok'); process.exit(1); }
let fresh = [];
for (const f of files) {
  const arr = require(path.join(DIR, f));
  console.log(f + ': ' + arr.length + ' kayit');
  fresh = fresh.concat(arr);
}
// 'a | b' yazimlarini diziye cevir + katla + temizle
const fold = (s) => s.toLocaleLowerCase('tr').replace(/[ç]/g, 'c').replace(/[ğ]/g, 'g')
  .replace(/[ı]/g, 'i').replace(/[ö]/g, 'o').replace(/[ş]/g, 's').replace(/[ü]/g, 'u');
fresh = fresh.map((e) => ({
  k: [...new Set((Array.isArray(e.k) ? e.k : [e.k])
    .flatMap((s) => String(s).split('|').map((x) => fold(x).trim()).filter(Boolean)))],
  a: String(e.a).trim(),
})).filter((e) => e.k.length && e.a.length >= 10);

const db = JSON.parse(fs.readFileSync(KB, 'utf8').replace(/^﻿/, ''));
const haveKeys = new Set();
for (const e of db.entries) for (const k of e.k) haveKeys.add(k);
let added = 0, skipped = 0, trimmed = 0;
for (const e of fresh) {
  const newKeys = e.k.filter((k) => !haveKeys.has(k));
  if (!newKeys.length) { skipped++; continue; }
  if (newKeys.length < e.k.length) trimmed++;
  db.entries.push({ k: newKeys, a: e.a });
  for (const k of newKeys) haveKeys.add(k);
  added++;
}
// Ayni formati koru: BOM + {"entries": [ + satir basi 1 kayit + ]}
const out = '﻿{"entries": [\n' +
  db.entries.map((e) => JSON.stringify({ k: e.k, a: e.a })).join(',\n') +
  '\n]}';
fs.writeFileSync(KB, out + '\n', 'utf8');
// Dogrula
const check = JSON.parse(fs.readFileSync(KB, 'utf8').replace(/^﻿/, ''));
console.log('yeni kayit: ' + added + ', budanmis: ' + trimmed + ', atlandi (tamamı tekrar): ' + skipped + ', toplam: ' + check.entries.length);
if (check.entries.length !== db.entries.length) { console.error('TUTARSIZLIK'); process.exit(1); }
