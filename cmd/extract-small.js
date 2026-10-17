// knowledge.json'in ilk 100K kaydini ayikla (streaming, dusuk bellek)
const fs = require('fs');
const rs = fs.createReadStream('knowledge.json', { encoding: 'utf8', highWaterMark: 4 * 1024 * 1024 });
let buf = '';
let started = false;
let depth = 0;
let objStart = -1;
let count = 0;
let done = false;
const ws = fs.createWriteStream('knowledge-small.json', { encoding: 'utf8' });
ws.write('{"entries":[');
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
            if (count > 0) ws.write(',');
            ws.write(JSON.stringify({ k: e.k, a: e.a }));
            count++;
            if (count >= 100000) {
              done = true;
              rs.destroy();
              ws.write(']}');
              ws.end(() => console.log('kucuk set: ' + count + ' kayit'));
              return;
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
rs.on('end', () => { if (done) return; done = true; ws.write(']}'); ws.end(() => console.log('kucuk set: ' + count + ' kayit')); });
