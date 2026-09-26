const fs = require('fs');
const path = require('path');
const GENERIC = new Set(['ne zaman', 'nedir', 'nasil', 'neden', 'kim', 'nereye', 'nerede', 'kac', 'hangi', 'ne', 'nedir acaba']);
const bad = [];
fs.readdirSync(__dirname).filter((f) => /^expand-\d+\.js$/.test(f)).forEach((fn) => {
  require(path.join(__dirname, fn)).forEach((e) => {
    const arr = Array.isArray(e.k) ? e.k : [e.k];
    arr.forEach((k) => {
      String(k).split('|').map((x) => x.trim()).forEach((part) => {
        if (GENERIC.has(part)) bad.push(fn + ': [' + part + ']');
      });
    });
  });
});
console.log(bad.length ? bad.join('\n') : 'temiz');
