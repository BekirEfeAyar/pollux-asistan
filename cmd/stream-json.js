// Streaming JSON parser: buyuk dosyalar icin (V8 string limitini asar)
const fs = require('fs');

function parseStreaming(filePath, onEntry) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 4 * 1024 * 1024 });
    let buf = '';
    let started = false;
    let depth = 0;
    let objStart = -1;
    let count = 0;

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
              onEntry(e);
              count++;
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

    rs.on('end', () => resolve(count));
    rs.on('error', reject);
  });
}

module.exports = { parseStreaming };
