// Bulk veri uretici B1: matematik (deterministik, carpim/kare/kup/roma/asal/vb.)
const fs = require('fs');
const out = [];
function add(k, a) { out.push({ k, a }); }
// Kareler 1-8000
for (let n = 1; n <= 8000; n++) {
  add([n + ' karesi', n + ' sayisinin karesi kac', n + ' kare kac'],
    n + ' sayisinin karesi ' + (n * n) + "'dir.");
}
// Kupler 1-4000
for (let n = 1; n <= 4000; n++) {
  add([n + ' kupu', n + ' sayisinin kupu kac', n + ' kup kac'],
    n + ' sayisinin kupu ' + (n * n * n) + "'dir.");
}
// Carpim tablosu 11-70 (a<=b, sira bagimsiz eslesme var)
for (let a = 11; a <= 70; a++) {
  for (let b = a; b <= 70; b++) {
    add([a + ' carpi ' + b + ' kac', a + ' ile ' + b + ' carpimi'],
      a + ' carpi ' + b + ' ' + (a * b) + ' eder.');
  }
}
// Roma rakamlari 1-1000
function roman(n) {
  const t = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of t) { while (n >= v) { s += r; n -= v; } }
  return s;
}
for (let n = 1; n <= 1000; n++) {
  add([n + ' roma rakami', 'roma rakamiyla ' + n],
    n + ' sayisi Roma rakamiyla ' + roman(n) + ' yazilir.');
}
// 2'nin kuvvetleri 1-30
for (let i = 1; i <= 30; i++) {
  add(['2 uzeri ' + i + ' kac', '2 nin ' + i + ' kuvveti'],
    '2 uzeri ' + i + ' ' + Math.pow(2, i) + "'dir.");
}
// Faktoriyel 0-20
let f = 1;
const facts = [1];
for (let i = 1; i <= 20; i++) { f *= i; facts[i] = f; }
for (let i = 0; i <= 20; i++) {
  add([i + ' faktoriyel kac', i + ' faktoriyel degeri'],
    i + ' faktoriyel ' + facts[i] + "'dir.");
}
// Fibonacci sira 1-40
const fib = [0, 1, 1];
for (let i = 3; i <= 40; i++) fib[i] = fib[i - 1] + fib[i - 2];
for (let i = 1; i <= 40; i++) {
  add(['fibonacci ' + i + ' sayi', 'fibonacci dizisi ' + i + ' eleman'],
    'Fibonacci dizisinin ' + i + '. elemani ' + fib[i] + "'dir.");
}
// Asal mi 1-300
function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
function smallestDiv(n) {
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return i;
  return n;
}
for (let n = 1; n <= 300; n++) {
  if (isPrime(n)) add([n + ' asal mi', n + ' asal sayi mi'], n + ' asal sayidir.');
  else add([n + ' asal mi', n + ' asal sayi mi'], n + ' asal sayi degildir, en kucuk boleni ' + smallestDiv(n) + "'dir.");
}
fs.writeFileSync(__dirname + '/bulk-part-1.json', JSON.stringify(out), 'utf8');
console.log('PART1: ' + out.length);
