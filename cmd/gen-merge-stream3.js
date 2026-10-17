// Streaming merge v3: bellek verimli - mevcut kayitlari tut, bulk'u direkt yaz
const fs = require('fs');

const cur = JSON.parse(fs.readFileSync(__dirname + '/knowledge.json', 'utf8').replace(/^\uFEFF/, ''));
console.log('Mevcut kayit: ' + cur.entries.length);

const seen = new Set();
for (const e of cur.entries) {
  const key = (e.k || []).map(x => x.toLocaleLowerCase('tr').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u').replace(/[''`]/g,' ').replace(/\s+/g,' ').trim()).sort().join('||');
  seen.add(key);
}

const ws = fs.createWriteStream(__dirname + '/knowledge.json', { encoding: 'utf8' });
ws.write('﻿{"entries":[');

// Mevcut kayitlari yaz
for (let i = 0; i < cur.entries.length; i++) {
  if (i > 0) ws.write(',');
  ws.write(JSON.stringify(cur.entries[i]));
}
console.log('Mevcut yazildi: ' + cur.entries.length);

// bulk-part-7.json'i streaming ok ve direkt yaz
const rs = fs.createReadStream(__dirname + '/bulk-part-7.json', { encoding: 'utf8', highWaterMark: 4 * 1024 * 1024 });
let buf = '';
let started = false;
let depth = 0;
let objStart = -1;
let added = 0;
let errors = 0;

function tryProcess() {
  let i = 0;
  while (i < buf.length) {
    if (!started) {
      const idx = buf.indexOf('{"k":', i);
      if (idx < 0) { buf = ''; return; }
      buf = buf.slice(idx);
      started = true;
      i = 0;
    }
    const c = buf[i];
    if (c === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0 && objStart >= 0) {
        const objStr = buf.slice(objStart, i + 1);
        try {
          const e = JSON.parse(objStr);
          if (e.k && e.k.length && e.a) {
            const key = e.k.map(x => x.toLocaleLowerCase('tr').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u').replace(/[''`]/g,' ').replace(/\s+/g,' ').trim()).sort().join('||');
            if (!seen.has(key)) {
              seen.add(key);
              ws.write(',' + JSON.stringify({ k: e.k, a: e.a }));
              added++;
              if (added % 500000 === 0) console.log('Eklenen: ' + added);
            }
          }
        } catch (err) { errors++; }
        buf = buf.slice(i + 1);
        i = -1;
        objStart = -1;
      }
    }
    i++;
  }
  if (depth > 0 && objStart >= 0) {
    buf = buf.slice(objStart);
    depth = 0;
    objStart = 0;
  } else if (depth === 0) {
    buf = '';
  }
}

rs.on('data', (chunk) => {
  buf += chunk;
  tryProcess();
});

rs.on('end', () => {
  console.log('Okuma tamam. Eklenen: ' + added + ' Hata: ' + errors);
  ws.write(']}');
  ws.end();
  ws.on('finish', () => {
    const stats = fs.statSync(__dirname + '/knowledge.json');
    console.log('knowledge.json yazildi. Toplam: ' + (cur.entries.length + added) + ' Boyut: ' + (stats.size / 1024 / 1024).toFixed(1) + ' MB');
  });
});
