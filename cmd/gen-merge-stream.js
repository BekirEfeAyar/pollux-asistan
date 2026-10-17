// Streaming merge: bulk-part-7.json cok buyuk, parca parca oku ve birlestir
const fs = require('fs');
const path = require('path');

// Mevcut knowledge.json'i oku (57.8MB, sorun yok)
const cur = JSON.parse(fs.readFileSync(__dirname + '/knowledge.json', 'utf8').replace(/^\uFEFF/, ''));
console.log('Mevcut kayit: ' + cur.entries.length);

// bulk-part-7.json'i streaming ok
const rs = fs.createReadStream(__dirname + '/bulk-part-7.json', { encoding: 'utf8', highWaterMark: 1024 * 1024 });
let buffer = '';
let inEntries = false;
let braceDepth = 0;
let objStart = -1;
let added = 0;
let seen = new Set(cur.entries.map(e => (e.k || []).map(x => x.toLocaleLowerCase('tr').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u').replace(/[''`]/g,' ').replace(/\s+/g,' ').trim()).sort().join('||')));

function processObject(objStr) {
  try {
    const e = JSON.parse(objStr);
    if (!e.k || !e.k.length || !e.a) return;
    const key = (e.k || []).map(x => x.toLocaleLowerCase('tr').replace(/ç/g,'c').replace(/ğ/g,'g').replace(/ı/g,'i').replace(/ö/g,'o').replace(/ş/g,'s').replace(/ü/g,'u').replace(/[''`]/g,' ').replace(/\s+/g,' ').trim()).sort().join('||');
    if (seen.has(key)) return;
    seen.add(key);
    cur.entries.push({ k: e.k, a: e.a });
    added++;
    if (added % 1000000 === 0) console.log('Eklenen: ' + added + ' toplam: ' + cur.entries.length);
  } catch (err) {}
}

rs.on('data', (chunk) => {
  buffer += chunk;
  if (!inEntries) {
    const idx = buffer.indexOf('"entries"');
    if (idx >= 0) {
      buffer = buffer.slice(idx + 10);
      inEntries = true;
    }
  }
  if (!inEntries) return;
  
  let i = 0;
  while (i < buffer.length) {
    const c = buffer[i];
    if (c === '{') {
      if (braceDepth === 0) objStart = i;
      braceDepth++;
    } else if (c === '}') {
      braceDepth--;
      if (braceDepth === 0 && objStart >= 0) {
        const objStr = buffer.slice(objStart, i + 1);
        processObject(objStr);
        buffer = buffer.slice(i + 1);
        i = -1;
        objStart = -1;
      }
    }
    i++;
  }
  // Keep last 1MB of buffer for incomplete objects
  if (buffer.length > 2 * 1024 * 1024) {
    buffer = buffer.slice(buffer.length - 1024 * 1024);
  }
});

rs.on('end', () => {
  console.log('Merge tamam. Eklenen: ' + added + ' Toplam: ' + cur.entries.length);
  // Streaming yaz
  const ws = fs.createWriteStream(__dirname + '/knowledge.json', { encoding: 'utf8' });
  ws.write('﻿{"entries":[');
  for (let i = 0; i < cur.entries.length; i++) {
    if (i > 0) ws.write(',');
    ws.write(JSON.stringify(cur.entries[i]));
    if (i % 500000 === 0) console.log('Yazma ilerlemesi: ' + i + ' / ' + cur.entries.length);
  }
  ws.write(']}');
  ws.end();
  ws.on('finish', () => {
    console.log('knowledge.json yazildi. Toplam kayit: ' + cur.entries.length);
    const stats = fs.statSync(__dirname + '/knowledge.json');
    console.log('Dosya boyutu: ' + (stats.size / 1024 / 1024).toFixed(1) + ' MB');
  });
});
