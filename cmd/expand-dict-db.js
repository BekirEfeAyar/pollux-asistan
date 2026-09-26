// Sozluk birlestirici: expand-dict.js ciftlerini dict.json'a ekler
const fs = require('fs');
const path = require('path');
const DIR = __dirname;
const DJ = path.join(DIR, 'dict.json');
const pairs = require(path.join(DIR, 'expand-dict.js'));
const db = JSON.parse(fs.readFileSync(DJ, 'utf8').replace(/^﻿/, ''));
const have = new Set();
for (const p of db.pairs) { have.add(p[0].toLowerCase()); have.add(p[1].toLocaleLowerCase('tr')); }
let added = 0, skipped = 0;
for (const [en, tr] of pairs) {
  if (have.has(String(en).toLowerCase()) || have.has(String(tr).toLocaleLowerCase('tr'))) { skipped++; continue; }
  db.pairs.push([en, tr]);
  have.add(String(en).toLowerCase()); have.add(String(tr).toLocaleLowerCase('tr'));
  added++;
}
fs.writeFileSync(DJ, '﻿{"pairs": [\n' +
  db.pairs.map((p) => JSON.stringify(p)).join(',\n') + '\n]}\n', 'utf8');
const check = JSON.parse(fs.readFileSync(DJ, 'utf8').replace(/^﻿/, ''));
console.log('sozluk eklendi: ' + added + ', atlandi: ' + skipped + ', toplam: ' + check.entries?.length ?? check.pairs.length);
console.log('toplam cift: ' + check.pairs.length);
