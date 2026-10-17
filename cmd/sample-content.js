// Dosyanin farkli bolgelerinden ornek: 10M'lik setin icerigi ne?
const fs = require('fs');
const b = fs.readFileSync('C:/Users/Murat/pollux/knowledge.json');
const pat = Buffer.from('{"k":', 'utf8');
const pick = [0.03, 0.10, 0.25, 0.40, 0.55, 0.70, 0.85, 0.97];
for (const p of pick) {
  const off = Math.floor(b.length * p);
  let i = b.indexOf(pat, off);
  if (i < 0) i = off;
  console.log('=== %' + Math.round(p * 100) + ' @' + i);
  console.log(b.slice(i, i + 220).toString('utf8').replace(/\n/g, ' '));
  console.log('');
}
// Ayrica "N karesi" formatinda buyuk sayilardan ornek bul (2M civari)
const karePat = Buffer.from(' karesi', 'utf8');
let from = 0, shown = 0;
while (shown < 5) {
  const idx = b.indexOf(karePat, from);
  if (idx < 0) break;
  const around = b.slice(Math.max(0, idx - 60), idx + 80).toString('utf8');
  const m = around.match(/"(\d{6,9}) karesi/);
  if (m) { console.log('BÜYÜK-KARE: ' + around.replace(/\n/g, ' ')); shown++; }
  from = idx + 7;
}
