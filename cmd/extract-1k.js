// 1K set: knowledge.json'in ilk 1000 kaydi (duzgu JSON, streaming)
const fs = require('fs');
const rs = fs.createReadStream('knowledge.json', { encoding: 'utf8', highWaterMark: 4 * 1024 * 1024 });
let buf = '';
let started = false;
let depth = 0;
let objStart = -1;
let count = 0;
const entries = [];
rs.on('data', (chunk) => {
  buf += chunk;
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
            entries.push({ k: e.k, a: e.a });
            count++;
            if (count >= 1000) {
              fs.writeFileSync('knowledge-1k.json', '﻿' + JSON.stringify({ entries }), 'utf8');
              console.log('1K set: ' + count + ' kayit yazildi');
              rs.destroy();
              process.exit(0);
            }
          }
        } catch (err) {}
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
});
rs.on('end', () => {
  fs.writeFileSync('knowledge-1k.json', '﻿' + JSON.stringify({ entries }), 'utf8');
  console.log('1K set: ' + count + ' kayit yazildi');
});
