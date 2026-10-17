// MEGA2: 1-2.500.000 arasi her sayi icin 4 kayit (~10M yeni kayit)
// JSON.stringify yerine streaming yaz (bellek tuketimini azaltir)
const fs = require('fs');
const N = 2500000;
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
const ws = fs.createWriteStream(__dirname + '/bulk-part-7.json', { encoding: 'utf8' });
ws.write('{"entries":[');
let count = 0;
for (let n = 1; n <= N; n++) {
  const items = [
    { k: [n + ' karesi', n + ' sayisinin karesi kac', n + ' kare kac'], a: n + ' sayisinin karesi ' + (n * n) + "'dir." },
    { k: [n + ' tek mi cift mi', n + ' tek mi', n + ' cift mi'], a: n + (n % 2 ? ' tek sayidir.' : ' cift sayidir.') },
    { k: [n + ' kac basamakli', n + ' basamak sayisi'], a: n + ' sayisi ' + String(n).length + ' basamaklidir.' },
    { k: [n + ' rakamlari toplami kac', n + ' rakam toplami'], a: n + ' sayisinin rakamlari toplami ' + String(n).split('').reduce((s, c) => s + +c, 0) + "'dir." }
  ];
  for (const e of items) {
    if (count > 0) ws.write(',');
    ws.write(JSON.stringify(e));
    count++;
  }
  if (n % 500000 === 0) console.log('ilerleme: ' + n + ' / ' + N + ' kayit:' + count);
}
ws.write(']}');
ws.end();
ws.on('finish', () => console.log('MEGA2 tamam: ' + count + ' kayit'));
