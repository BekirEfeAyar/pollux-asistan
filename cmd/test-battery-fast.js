// Hizli batarya: 1K kayit + 30 temel test (dusuk bellek, ani sonuc)
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = __dirname;
const src = fs.readFileSync(path.join(DIR, 'pollux.js'), 'utf8');
function section(start, end) {
  return src.slice(src.indexOf(start) + start.length, src.indexOf(end));
}
eval(section('// ---------- yardimcilar ----------', '// ---------- bilgi bankasi ----------'));
eval(section('// ---------- bilgi bankasi ----------', '// ---------- sozluk ----------'));
const DICT = JSON.parse(
  fs.readFileSync(path.join(DIR, 'dict.json'), 'utf8').replace(/^﻿/, '')
).pairs;
eval(section('// ---------- sozluk ----------', '// ---------- hesap ----------'));

const KNOWLEDGE = JSON.parse(
  fs.readFileSync(path.join(DIR, 'knowledge-1k.json'), 'utf8').replace(/^﻿/, '')
).entries;
console.log('1K set yuklendi: ' + KNOWLEDGE.length + ' kayit');

const TESTS = [
  ["Fransa'nın başkenti neresi", 'Paris', 'birebir'],
  ['fransanin baskenti neresi', 'Paris', 'ek-toleransi'],
  ['almayna baskenti neresi', 'Berlin', 'yazim-yanlis'],
  ["başkenti neresi Fransa'nın", 'Paris', 'devrik'],
  ['kedisi Van nedir', 'Van kedisi', 'devrik'],
  ['kangal kopeci', 'Kangal', 'yazim-yanlis'],
  ['canakkale savasi ne zaman', 'Çanakkale', 'birebir+ek'],
  ['istanbulu kim fethetti', 'Fatih', 'ek+esanlamli'],
  ['1 dunya savasi', 'Dünya', 'noktalamasi-sayi'],
  ['ankara baskent mi', 'Ankara', 'soru-eki'],
  ['van kedisi', 'Van kedisi', 'birebir'],
  ['zxyzq quxqw', null, 'NEGATIF: anlamsiz'],
  ['kimal derse', null, 'NEGATIF: benzer ama alakasiz'],
  ['ikinci dunya savasi', '1939', 'sira-sayi'],
  ['ilk ucak kim yapti', 'Wright', 'ilk->birinci'],
  ['osmanli devleti ne zaman kuruldu', '1299', 'devlet->ulke'],
  ['frnsa baskenti', 'Paris', 'harf-dusmesi'],
  ['japonya telefon kodu nedir', '+81', 'birebir'],
  ['kralice elizabeth kac yasinda', null, 'NEGATIF: bankada yok'],
  ['ay nedir', "Dünya'nın", '2-harf'],
  ['su nedir', 'Su,', '2-harf'],
  ['kanal', 'Kangal', 'tek-kelime harf-dusmesi'],
  ['zurfa nedir', 'Zürafa', 'tek-kelime yazim'],
  ['bae para birimi nedir', 'dirhem', 'yeni: BAE'],
  ['jupiter hangi gezegen', 'Jüpiter', 'yeni: jüpiter'],
  ['altin sembolu nedir', 'Au', 'yeni: altin'],
  ['tantuni nedir', 'Mersin', 'yeni: tantuni'],
  ['futbol kac kisi oynar', '11 kişi', 'yeni: futbol'],
  ['asal sayi nedir', '2, 3, 5', 'yeni: asal'],
  ['turk alfabesi kac harf', '29 harf', 'yeni: alfabe'],
];

let pass = 0, fail = 0;
for (const [q, expect, label] of TESTS) {
  let ans = null;
  try { ans = findKnowledge(q, []); }
  catch (e) { ans = 'HATA:' + e.message; }
  if (expect === null) {
    if (ans === null) { pass++; }
    else { fail++; console.log('FAIL [' + label + '] "' + q + '" -> eslesmemeliydi: ' + String(ans).slice(0, 80)); }
  } else {
    if (ans && ans.includes(expect)) { pass++; }
    else { fail++; console.log('FAIL [' + label + '] "' + q + '" -> ' + String(ans).slice(0, 100)); }
  }
}
console.log('\nSonuç: ' + pass + ' geçti, ' + fail + ' kaldı (' + TESTS.length + ' test)');
process.exit(fail ? 1 : 0);
