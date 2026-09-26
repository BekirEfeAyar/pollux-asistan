// Fuzz: her kaydın ilk anahtarını 3 şekilde boz, eşleşme oranını ölç
// Çalıştır: node fuzz.js  (yavaş olabilir, ~1-2 dk)
const fs = require('fs');
const path = require('path');
const https = require('https');
const src = fs.readFileSync(path.join(__dirname, 'pollux.js'), 'utf8');
const sec = (a, b) => src.slice(src.indexOf(a) + a.length, src.indexOf(b));
eval(sec('// ---------- yardimcilar ----------', '// ---------- bilgi bankasi ----------'));
const KNOWLEDGE = JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge.json'), 'utf8').replace(/^﻿/, '')).entries;
eval(sec('// ---------- bilgi bankasi ----------', '// ---------- sozluk ----------'));

function variants(key) {
  const out = [];
  const words = key.split(' ');
  const long = words.find((w) => w.length >= 6) || words[words.length - 1];
  if (!long || long.length < 4) return out;
  const i = Math.floor(long.length / 2);
  // 1 harf düşür
  out.push(key.replace(long, long.slice(0, i) + long.slice(i + 1)));
  // 2 harf yer değiştir
  if (long.length >= 5) {
    const a = long.split('');
    const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t;
    out.push(key.replace(long, a.join('')));
  }
  // soru kalıbına sok (devrik + ek kelime)
  out.push(long + ' nedir acaba');
  return out;
}
let total = 0, hit = 0;
const misses = [];
for (const e of KNOWLEDGE) {
  for (const v of variants(e.k[0])) {
    total++;
    const a = findKnowledge(v, []);
    if (a === e.a) hit++;
    else if (misses.length < 15) misses.push([v, e.k[0]]);
  }
}
console.log('fuzz: ' + hit + '/' + total + ' = %' + (100 * hit / total).toFixed(1));
misses.forEach(([v, k]) => console.log('MISS "' + v + '" (asıl: ' + k + ')'));
