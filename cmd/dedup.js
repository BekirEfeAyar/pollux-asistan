// Katlanmis-tekillestirme: ayni soruya iki kayit varsa birlestir
const fs = require('fs');
const path = require('path');
const KB = path.join(__dirname, 'knowledge.json');
const fold = (s) => s.toLocaleLowerCase('tr').replace(/[ç]/g, 'c').replace(/[ğ]/g, 'g')
  .replace(/[ı]/g, 'i').replace(/[ö]/g, 'o').replace(/[ş]/g, 's').replace(/[ü]/g, 'u');
const db = JSON.parse(fs.readFileSync(KB, 'utf8').replace(/^﻿/, ''));
const seen = new Map();
let dropped = 0;
db.entries = db.entries.filter((e) => {
  const fk = e.k.map(fold);
  const clash = fk.find((k) => seen.has(k));
  if (clash !== undefined) {
    dropped++;
    const host = seen.get(clash);
    const hostFolded = host.k.map(fold);
    fk.forEach((k, i) => {
      if (!hostFolded.includes(k)) { host.k.push(e.k[i]); seen.set(k, host); }
    });
    return false;
  }
  fk.forEach((k) => seen.set(k, e));
  return true;
});
fs.writeFileSync(KB, '﻿{"entries": [\n' +
  db.entries.map((e) => JSON.stringify({ k: e.k, a: e.a })).join(',\n') +
  '\n]}\n', 'utf8');
const check = JSON.parse(fs.readFileSync(KB, 'utf8').replace(/^﻿/, ''));
console.log('birlesen: ' + dropped + ', toplam: ' + check.entries.length);
