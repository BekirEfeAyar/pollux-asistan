// Telefon icin genisletilmis set: yayindaki (v2.0.23-data) knowledge.json.gz
// icinden ilk N kaydi ayiklar -> knowledge-mobile.json + .gz
// Streaming, dusuk bellek (extract-small.js ile ayni mantik).
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const TMP = 'C:/Users/Murat/AppData/Local/Temp/opencode';
const GZ = path.join(TMP, 'knowledge.json.gz');
const RAW = path.join(TMP, 'release-knowledge.json');
const OUT = path.join(TMP, 'knowledge-mobile.json');
const OUTGZ = path.join(TMP, 'knowledge-mobile.json.gz');
const N = 250000;

// 1) gz -> raw (bir kez)
if (!fs.existsSync(RAW) || fs.statSync(RAW).size < 500 * 1024 * 1024) {
  console.log('gunzip basliyor...');
  const buf = zlib.gunzipSync(fs.readFileSync(GZ));
  fs.writeFileSync(RAW, buf);
  console.log('raw yazildi: ' + buf.length + ' bayt');
} else {
  console.log('raw zaten var: ' + fs.statSync(RAW).size + ' bayt');
}

// 2) ilk N kaydi stream ile ayikla
let buf = '';
let started = false;
let depth = 0;
let objStart = -1;
let count = 0;
const rs = fs.createReadStream(RAW, { encoding: 'utf8', highWaterMark: 4 * 1024 * 1024 });
const ws = fs.createWriteStream(OUT, { encoding: 'utf8' });
ws.write('{"entries":[');
let finished = false;

function finish() {
  if (finished) return;
  finished = true;
  ws.write(']}');
  ws.end(() => {
    const json = fs.readFileSync(OUT);
    console.log('mobile json: ' + count + ' kayit, ' + json.length + ' bayt');
    const gz = zlib.gzipSync(json, { level: 9 });
    fs.writeFileSync(OUTGZ, gz);
    console.log('mobile gz: ' + gz.length + ' bayt');
    console.log('HAZIR');
    process.exit(0);
  });
}

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
            if (count % 50000 === 0) console.log('  ... ' + count);
            if (count >= N) {
              rs.destroy();
              finish();
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
    if (i < 0) break;
  }
  if (depth > 0 && objStart >= 0) {
    buf = buf.slice(objStart);
    depth = 0;
    objStart = 0;
  } else if (depth === 0) {
    buf = '';
  }
});
rs.on('end', () => finish());
rs.on('error', (e) => { console.error('HATA: ' + e.message); process.exit(1); });
