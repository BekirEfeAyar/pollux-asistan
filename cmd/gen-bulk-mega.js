// Bulk MEGA: 1-67000 arasi sayisal bilgiler (deterministik, ~524 bin kayit)
const fs = require('fs');
const out = [];
function add(k, a) { out.push({ k, a }); }
const N = 67000;
// Turkce okunus
const B = ['', 'bir', 'iki', 'uc', 'dort', 'bes', 'alti', 'yedi', 'sekiz', 'dokuz'];
const O = ['', 'on', 'yirmi', 'otuz', 'kirk', 'elli', 'altmis', 'yetmis', 'seksen', 'doksan'];
function ucyuz(x) {
  let s = '';
  const y = Math.floor(x / 100), r = x % 100;
  if (y > 0) s += (y > 1 ? B[y] + ' ' : '') + 'yuz';
  const o = Math.floor(r / 10), b = r % 10;
  if (o > 0) s += (s ? ' ' : '') + O[o];
  if (b > 0) s += (s ? ' ' : '') + B[b];
  return s;
}
function oku(n) {
  if (n === 0) return 'sifir';
  const parts = [];
  const m = Math.floor(n / 1000000), r1 = n % 1000000;
  if (m > 0) parts.push(ucyuz(m) + ' milyon');
  const t = Math.floor(r1 / 1000), r = r1 % 1000;
  if (t > 0) parts.push(t === 1 ? 'bin' : ucyuz(t) + ' bin');
  if (r > 0) parts.push(ucyuz(r));
  return parts.join(' ');
}
function fmt(x) { return String(x).replace('.', ','); }
for (let n = 1; n <= N; n++) {
  if (n > 8000) {
    add([n + ' karesi', n + ' sayisinin karesi kac', n + ' kare kac'],
      n + ' sayisinin karesi ' + (n * n) + "'dir.");
  }
  if (n > 4000) {
    add([n + ' kupu', n + ' sayisinin kupu kac', n + ' kup kac'],
      n + ' sayisinin kupu ' + (n * n * n) + "'dir.");
  }
  add([n + ' tek mi cift mi', n + ' tek mi', n + ' cift mi'],
    n + (n % 2 ? ' tek sayidir.' : ' cift sayidir.'));
  const bas = String(n).length;
  add([n + ' kac basamakli', n + ' basamak sayisi'],
    n + ' sayisi ' + bas + ' basamaklidir.');
  let rt = 0;
  for (const c of String(n)) rt += +c;
  add([n + ' rakamlari toplami kac', n + ' rakam toplami'],
    n + ' sayisinin rakamlari toplami ' + rt + "'dir.");
  add([n + ' nasil okunur', n + ' sayisinin okunusu', n + ' okunusu'],
    n + " sayisinin okunusu '" + oku(n) + "' seklindedir.");
  add([n + ' iki kati kac', n + ' sayisinin iki kati', n + ' iki kati'],
    n + ' sayisinin iki kati ' + (2 * n) + "'dir.");
  add([n + ' yarisi kac', n + ' sayisinin yarisi', n + ' yarisi'],
    n + ' sayisinin yarisi ' + fmt(n / 2) + "'dir.");
}
fs.writeFileSync(__dirname + '/bulk-part-6.json', JSON.stringify(out), 'utf8');
console.log('MEGA: ' + out.length);
