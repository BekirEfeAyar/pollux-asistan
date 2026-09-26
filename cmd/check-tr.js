const fs = require('fs');
const path = require('path');
const https = require('https');
const src = fs.readFileSync(path.join(__dirname, 'pollux.js'), 'utf8');
const sec = (a, b) => src.slice(src.indexOf(a) + a.length, src.indexOf(b));
eval(sec('// ---------- yardimcilar ----------', '// ---------- bilgi bankasi ----------'));
eval(sec('// ---------- cevrimici ----------', '// ---------- ana cozumleme ----------'));
(async () => {
  const t = 'Thomas Joseph Welling is an American actor, director, and producer. He is best known for his role.';
  console.log('needsTR: ' + needsTR(t));
  try {
    const c = await translateChunk('Hello world, how are you today?');
    console.log('ceviri: ' + c);
  } catch (e) { console.log('ceviri ERR: ' + e.message); }
})();
