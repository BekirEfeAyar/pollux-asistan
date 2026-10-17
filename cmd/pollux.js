#!/usr/bin/env node
// Pollux - CMD sesli degil yazili asistan (cevrimdisi beyin + cevrimici arastirma)
// Kullanim: pollux               -> sohbet dongusu
//           pollux "soru..."     -> tek cevap ver cik
const fs = require('fs');
const path = require('path');
const https = require('https');
const readline = require('readline');

const DIR = __dirname;
function readJson(name, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, name), 'utf8').replace(/^\uFEFF/, ''));
  } catch (e) { return fallback; }
}
let KNOWLEDGE = [];
let KNOWLEDGE_READY = false;
let KNOWLEDGE_WARNED = false;
const DICT = readJson('dict.json', { pairs: [] }).pairs;
if (!DICT.length) console.error('UYARI: sozluk bos yuklendi!');
function knowledgePath() { return path.join(DIR, 'knowledge.json'); }
// Tembel yukleme: kucuk dosya dogrudan, buyuk dosya (V8 string limitini
// asar) parca parca okunur; olay dongusu nefes alir, ilerleme bildirilir.
function ensureKnowledge(onProgress) {
  if (KNOWLEDGE_READY) {
    if (onProgress) { try { onProgress(1, 1); } catch (e) {} }
    return Promise.resolve(KNOWLEDGE);
  }
  return new Promise((resolve) => {
    let size = 0;
    try { size = fs.statSync(knowledgePath()).size; } catch (e) {}
    if (size > 0 && size < 50 * 1024 * 1024) {
      try { KNOWLEDGE = readJson('knowledge.json', { entries: [] }).entries; } catch (e) { KNOWLEDGE = []; }
      KNOWLEDGE_READY = true;
      if (!KNOWLEDGE.length && !KNOWLEDGE_WARNED) { KNOWLEDGE_WARNED = true; console.error('UYARI: bilgi bankasi bos yuklendi!'); }
      if (onProgress) { try { onProgress(1, 1); } catch (e) {} }
      resolve(KNOWLEDGE);
      return;
    }
    const list = [];
    const rs = fs.createReadStream(knowledgePath(), { encoding: 'utf8', highWaterMark: 4 * 1024 * 1024 });
    let buf = '', started = false, depth = 0, objStart = -1, bytes = 0, failed = false;
    const parseBuf = () => {
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
        if (c === '{') { if (depth === 0) objStart = i; depth++; }
        else if (c === '}') {
          depth--;
          if (depth === 0 && objStart >= 0) {
            const objStr = buf.slice(objStart, i + 1);
            try {
              const e = JSON.parse(objStr);
              if (e.k && e.k.length && e.a) list.push(e);
            } catch (e) {}
            buf = buf.slice(i + 1);
            i = -1;
            objStart = -1;
          }
        }
        i++;
      }
      if (depth > 0 && objStart >= 0) { buf = buf.slice(objStart); depth = 0; objStart = 0; }
      else if (depth === 0) { buf = ''; }
    };
    rs.on('data', (chunk) => {
      rs.pause();
      buf += chunk;
      bytes += chunk.length;
      try { parseBuf(); } catch (e) {}
      if (onProgress && size > 0) { try { onProgress(bytes, size); } catch (e) {} }
      setImmediate(() => rs.resume());
    });
    rs.on('end', () => {
      try { parseBuf(); } catch (e) {}
      KNOWLEDGE = list;
      KNOWLEDGE_READY = true;
      if (!KNOWLEDGE.length && !KNOWLEDGE_WARNED) { KNOWLEDGE_WARNED = true; console.error('UYARI: bilgi bankasi bos yuklendi!'); }
      if (onProgress) { try { onProgress(size || 1, size || 1); } catch (e) {} }
      resolve(KNOWLEDGE);
    });
    rs.on('error', () => {
      if (!failed) {
        failed = true;
        try { KNOWLEDGE = readJson('knowledge.json', { entries: [] }).entries; } catch (e) { KNOWLEDGE = []; }
        KNOWLEDGE_READY = true;
        resolve(KNOWLEDGE);
      }
    });
  });
}
// Konsol kipleri icin tek satirlik yukleme gostergesi (TTY ise)
function cliProgress() {
  if (!process.stderr.isTTY) return null;
  let last = -1;
  return (d, t) => {
    if (!(t > 1)) return;
    const p = Math.min(100, Math.round((d / t) * 100));
    if (p !== last) {
      last = p;
      process.stderr.write('\rBilgi bankası yükleniyor... %' + p);
      if (d >= t) process.stderr.write('\n');
    }
  };
}

// Veri kapsamı özeti: dosyadaki kayıtlar + sayı üreteci (1..20M sayı × 5 tür)
function dataStats() {
  const n = KNOWLEDGE_READY && KNOWLEDGE.length ? KNOWLEDGE.length : 0;
  return 'Veri kapsamı: 100.000.000+ kayıt (' + (n ? n.toLocaleString('tr-TR') + ' dosyada + ' : '') + 'sayı üreteci)';
}

function userDataDir() {
  // Kullaniciya ozel yazilabilir klasor (global npm kurulumunda paket klasoru salt-okunur olabilir)
  try {
    const base = process.env.APPDATA || path.join(process.env.USERPROFILE || process.env.HOME || DIR, '.config');
    const d = path.join(base, 'pollux');
    fs.mkdirSync(d, { recursive: true });
    return d;
  } catch (e) { return DIR; }
}
const LEARNED_FILE = (() => {
  // Ogrenilenler kullanicinin klasorunde
  const d = userDataDir();
  try {
    // Eski yerdeki kayitlari tasi
    const oldF = path.join(DIR, 'learned.json');
    const newF = path.join(d, 'learned.json');
    if (oldF !== newF && !fs.existsSync(newF) && fs.existsSync(oldF)) {
      try { fs.copyFileSync(oldF, newF); } catch (e) {}
    }
    return newF;
  } catch (e) { return path.join(DIR, 'learned.json'); }
})();

let learned = [];
try {
  learned = JSON.parse(fs.readFileSync(LEARNED_FILE, 'utf8').replace(/^\uFEFF/, '')).entries || [];
  // Cevrilmemis Ingilizce kayitlari ele (yeniden Turkce ogrenilir)
  if (typeof needsTR === 'function') learned = learned.filter((e) => !needsTR(e.a || ''));
} catch (e) { learned = []; }
function saveLearned() {
  try {
    const slim = learned.slice(0, 300);
    fs.writeFileSync(LEARNED_FILE, JSON.stringify({ entries: slim }), 'utf8');
  } catch (e) {}
}

// ---------- yardimcilar ----------
function fold(s) {
  return s.toLocaleLowerCase('tr')
    .replace(/[ç]/g, 'c').replace(/[ğ]/g, 'g').replace(/[ı]/g, 'i')
    .replace(/[ö]/g, 'o').replace(/[ş]/g, 's').replace(/[ü]/g, 'u')
    .replace(/['’`]/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = [], cur = [];
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    const t = prev; prev = cur; cur = t;
  }
  return prev[b.length];
}
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function fmtNum(v) {
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  let s = v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
}
const noReuseAgent = new https.Agent({ keepAlive: false, maxCachedSessions: 0 });
function get(url, timeoutMs, headers, retries) {
  return new Promise((resolve, reject) => {
    const opts = { timeout: timeoutMs, agent: noReuseAgent, headers: headers || { 'User-Agent': 'PolluxAsistan/1.0' } };
    const attempt = (left) => {
      let dead = false;
      const fail = (err) => {
        if (dead) return;
        dead = true;
        if (left > 0) attempt(left - 1);
        else reject(err);
      };
      const req = https.get(url, opts, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          fail(new Error('HTTP ' + res.statusCode));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        // Yarim veri kabul edilmez: olu istekten gelen 'end' yoksayilir
        res.on('data', (c) => { if (!dead) data += c; });
        res.on('end', () => { if (!dead) { dead = true; resolve(data); } });
        res.on('error', () => fail(new Error('net')));
        res.on('aborted', () => fail(new Error('cut')));
      });
      req.on('timeout', () => { fail(new Error('timeout')); try { req.destroy(); } catch (e) {} });
      req.on('error', () => fail(new Error('net')));
    };
    attempt(retries === undefined ? 1 : retries);
  });
}

// ---------- bilgi bankasi ----------
// 3 asamali eslesme: 1) birebir obek 2) tek kelime Onek 3) anlam benzeri
// (devrik cumle + yazim yanlisi + ek + esanlamli toleransli, sira bagimsiz)
// Ek listesi: iyelik/hal ekleri (si/su/i/u) yapim eklerinden (li/lu) ONCE.
// Yoksa "istanbulu" yanlislikla "istanbu" olur.
const SUFFIXES = ['lerin', 'larin', 'nin', 'nun', 'sin', 'sun', 'in', 'un',
  'si', 'su', 'i', 'u', 'ler', 'lar', 'den', 'dan', 'ten', 'tan', 'de', 'da',
  'te', 'ta', 'le', 'la', 'lik', 'luk', 'siz', 'suz', 'ci', 'cu', 'ca', 'ce',
  'li', 'lu', 'ki'];
const STOPWORDS = new Set(['mi', 'mu', 'misin', 'musun', 'nedir', 'nedi', 'ne',
  'neresi', 'nerede', 'nere', 'nerde', 'hangisi', 'hangi', 'kac', 'nasil',
  'neden', 'nicin', 'niye', 'kim', 'acaba', 'lutfen', 'bana', 'soyle', 'soyler',
  'anlat', 'bilgi', 'hakkinda', 'ogret', 'ogren', 'eder', 'et', 'olan', 'olarak',
  'dir', 'bir', 'bu', 'o', 've', 'ile', 'icin', 'kadar', 'sence', 'peki', 'ise']);
const SYNONYMS = { kent: 'sehir', kenti: 'sehir', kentin: 'sehir', sehri: 'sehir',
  sehrin: 'sehir', bassehir: 'baskent', bassehri: 'baskent', memleket: 'ulke',
  devlet: 'ulke', ilk: 'birinci',
  kisi: 'nufus', kisiler: 'nufus', genis: 'buyuk', kocaman: 'buyuk',
  rakim: 'yukseklik', irtifa: 'yukseklik', harp: 'savas', muharebe: 'savas',
  icat: 'bulus', vefat: 'olum', kurulma: 'kurulus', kuruldu: 'kurulus',
  rahatsizlik: 'hastalik', yiyecek: 'yemek', padisah: 'hukumdar', kral: 'hukumdar',
  feth: 'fetih', fetheden: 'fetih', fethetti: 'fetih', fethet: 'fetih', fethett: 'fetih', fethi: 'fetih', fethin: 'fetih', dogdu: 'dogum', kesfetti: 'kesif', kesfeden: 'kesif',
  irmak: 'nehir', hekim: 'doktor', feza: 'uzay', yeryuzu: 'dunya', vakit: 'zaman', mekan: 'yer',
  gor: 'gormek', git: 'gitmek', bak: 'bakmak', al: 'almak', ver: 'vermek', gel: 'gelmek',
  yap: 'yapmak', sor: 'sormak', yaz: 'yazmak', kos: 'kosmak', oku: 'okumak',
  otur: 'oturmak', kalk: 'kalkmak', don: 'donmek', dur: 'durmak', kal: 'kalmak', bul: 'bulmak' };
const ORDINALS = { 1: 'birinci', 2: 'ikinci', 3: 'ucuncu', 4: 'dorduncu', 5: 'besinci', 6: 'altinci', 7: 'yedinci', 8: 'sekizinci', 9: 'dokuzuncu', 10: 'onuncu' };
function stemTr(t) {
  // Fiil zarf ekleri once ("silerken"->"siler")
  for (const suf of ['erek', 'arak', 'iyor', 'ecek', 'acak', 'ken']) {
    if (t.endsWith(suf) && t.length - suf.length >= 4) return stemTr(t.slice(0, -suf.length));
  }
  // Gecmis zaman kipi ("gordum"->"gor", "gittik"->"git")
  for (const suf of ['dum', 'dim', 'dun', 'din', 'tum', 'tim', 'tun', 'tin', 'duk', 'dik', 'tuk', 'tik']) {
    if (t.endsWith(suf) && t.length - suf.length >= 3) return stemTr(t.slice(0, -suf.length));
  }
  if (t.length < 6) {
    for (const suf of ['ler', 'lar']) {
      if (t.endsWith(suf) && t.length - suf.length >= 4) return t.slice(0, -suf.length);
    }
    return t;
  }
  for (const suf of SUFFIXES) {
    if (t.endsWith(suf)) {
      // Ulke adlarini koru: "pakistan" -> "pakis" olmasin
      if ((suf === 'tan' || suf === 'ten' || suf === 'dan' || suf === 'den') && t.endsWith('stan')) continue;
      const stem = t.slice(0, -suf.length);
      const minStem = suf.length === 1 ? 6 : 4;
      if (stem.length >= minStem) return stem;
    }
  }
  return t;
}
function contentTokens(s) {
  const words = fold(s).replace(/[^a-z0-9 .]+/g, ' ').split(' ')
    .map((w) => w.trim().replace(/\.+$/, '')).filter((w) => w && !STOPWORDS.has(w))
    .map((w) => ORDINALS[w] || w);
  // İkililer: "bas sehir/sehri/kent" -> "baskent"
  const out = [];
  for (let i = 0; i < words.length; i++) {
    if (words[i] === 'bas' && i + 1 < words.length &&
      ['sehir', 'sehri', 'sehrin', 'kent', 'kenti', 'kentin'].includes(words[i + 1])) {
      out.push('baskent'); i++;
    } else out.push(words[i]);
  }
  return out;
}
function tokenScore(a, b) {
  if (a === b) return 2;
  const x = SYNONYMS[a] || a, y = SYNONYMS[b] || b;
  if (x === y) return 2;
  const pairs = [[a, b], [x, y], [a, y], [x, b]];
  for (const [s, t] of pairs) {
    const short = Math.min(s.length, t.length);
    if (short >= 4 && (s.startsWith(t) || t.startsWith(s)) && Math.abs(s.length - t.length) <= 3) return 2;
    if (short === 3 && (s.startsWith(t) || t.startsWith(s)) && Math.abs(s.length - t.length) <= 2) return 2;
  }
  if (a.length < 3 || b.length < 3) return 0;
  const tol = Math.min(a.length, b.length) >= 5 ? 2 : 1;
  if (lev(a, b) <= tol) return 1;
  if (lev(x, y) <= tol) return 1;
  // Fiil kokleri: uzun ortak baslangic ("yetistirme"~"yetistirilir")
  for (const [s, t] of pairs) {
    let common = 0;
    const lim = Math.min(s.length, t.length);
    while (common < lim && s[common] === t[common]) common++;
    if (common >= 5) return 1;
  }
  return 0;
}
function findKnowledge(raw, extra) {
  const cleaned = raw.replace(/([A-Za-zÇçĞğİıÖöŞşÜü]+)'[A-Za-zÇçĞğİıÖöŞşÜü]*/g, '$1');
  const q = ' ' + fold(cleaned.toLowerCase()) + ' ';
  // Öğrenilenler öncelikli: önce onlarda ara, sonra bankada
  return searchPool(q, cleaned, extra || []) || searchPool(q, cleaned, KNOWLEDGE);
}
// Anlam skorlaması: {a: en iyi cevap, full: sorgunun tum kelimelerini acikliyor mu}
function semanticScore(q, cleaned, all) {
  const out = { a: null, full: null };
  const qn = contentTokens(cleaned.toLowerCase()).map(stemTr).filter((w) => w.length >= 3);
  if (!qn.length) return out;
  let bestF = null, bestScore = 0;
  for (const e of all) {
    const keys = Array.isArray(e.k) ? e.k : [e.k];
    for (const k of keys) {
      const kw = contentTokens(k).map(stemTr).filter((w) => w.length >= 3);
      if (kw.length < 2) continue;
      let pts = 0, matched = 0, exactLong = 0;
      const qhit = new Array(qn.length).fill(0);
      for (const w of kw) {
        let p = 0, pi = -1;
        for (let qi = 0; qi < qn.length; qi++) {
          const s = tokenScore(w, qn[qi]);
          if (s > p) { p = s; pi = qi; }
          if (p >= 2) break;
        }
        if (p > 0) { matched++; pts += p; if (p >= 2 && w.length >= 3) exactLong++; if (pi >= 0) qhit[pi] = 1; }
      }
      let ok = false;
      if (kw.length <= 3) ok = matched === kw.length && pts >= 2 * kw.length - 1 && exactLong >= 1;
      else ok = matched / kw.length >= 0.6 && exactLong >= 2 && pts >= kw.length + 1;
      if (ok) {
        const score = pts * 10 + k.length;
        if (score > bestScore) { bestScore = score; bestF = e; }
        // Tam kapsama: anahtar ve sorgu birebir ortusuyor
        if (kw.length === qn.length && qhit.every((x) => x === 1) && !out.full) {
          out.full = e.a;
        }
      }
    }
  }
  out.a = bestF ? bestF.a : null;
  return out;
}
function searchPool(q, cleaned, all) {
  // Anlam skorlaması önce hesaplanır (tam-kapsama önceliği için)
  const sem = semanticScore(q, cleaned, all);
  if (sem.full) return sem.a;
  // 1) birebir obek: SADECE cok kelimeli anahtar (tek kelime 3. asamada)
  let best = null, bestLen = 0;
  for (const e of all) {
    const keys = Array.isArray(e.k) ? e.k : [e.k];
    for (const k of keys) {
      if (!fold(k).trim().includes(' ')) continue;
      const key = ' ' + fold(k) + ' ';
      if (q.includes(key) && key.trim().length > bestLen) { bestLen = key.trim().length; best = e; }
    }
  }
  if (bestLen >= 4) return best.a;
  // 3) skorlama sonucu (tam kapsamayan en iyi)
  if (sem.a) return sem.a;
  // 2) tek kelimelik anahtar: Onek toleransi (soru kelimeleri elenmis)
  const qwords = contentTokens(cleaned.toLowerCase()).map(stemTr).filter((w) => w.length >= 3);
  const qtokens = contentTokens(cleaned.toLowerCase());
  if (qwords.length || qtokens.length) {
    let singleHit = null;
    for (const e of all) {
      const keys = Array.isArray(e.k) ? e.k : [e.k];
      for (const k of keys) {
        // Stopword sonrasi tek kelimeye dusen anahtar tek sayilir ("felsefe nedir"->"felsefe")
        const ckt = contentTokens(k);
        if (!ckt.length) continue;
        const single = ckt.length === 1;
        const kt = single ? ckt[0] : fold(k).trim();
        if (!single && (!kt || kt.includes(' '))) continue;
        // 2 harfli anahtar (ay/su/ud): sadece kisa soruda birebir
        if (kt.length === 2) {
          if (qtokens.length <= 2 && qtokens.includes(kt)) return e.a;
          continue;
        }
        if (kt.length < 3) continue;
        if (q.includes(' ' + kt + ' ')) return e.a;
        if (!singleHit) {
          for (const qw of qwords) {
            const a = stemTr(kt), b = stemTr(qw);
            if ((qw.startsWith(kt) || kt.startsWith(qw)) && Math.abs(qw.length - kt.length) <= 2) { singleHit = e; break; }
            if (a.length >= 3 && (b.startsWith(a) || a.startsWith(b)) && Math.abs(b.length - a.length) <= 2) { singleHit = e; break; }
          }
          // Yazım toleransı: uzun tek kelime, kısa soru ("kanal"->"kangal")
          // Tek kelimelik soruda 1 harfe kadar ("kanagl"->"kangal")
          if (!singleHit && kt.length >= 6 && qtokens.length <= 2) {
            const tol1 = qtokens.length === 1 ? 1 : 0;
            for (const qw of qtokens) {
              if (qw.length >= 5 && Math.abs(qw.length - kt.length) <= 1 && lev(qw, kt) <= tol1) { singleHit = e; break; }
            }
          }
        }
      }
    }
    if (singleHit) return singleHit.a;
  }
  return null;
}

// ---------- sozluk ----------
function dictLookup(raw) {
  let q = fold(raw.toLowerCase()).trim();
  const suffixes = ['ne demek', 'nedir ingilizce', 'ingilizcesi ne', 'ingilizcesi',
    'ingilizce ne', 'ingilizce nedir', 'ingilizce karsiligi', 'ingilizcesi nedir', 'in english', 'turkcesi', 'turkcesi ne',
    'turkce karsiligi', 'turkce anlami', 'ne anlama geliyor'];
  let stripped = false;
  for (const s of suffixes) {
    if (q.endsWith(s)) { q = q.slice(0, -s.length).trim(); stripped = true; break; }
  }
  if (!stripped) {
    // Ek yok ama tek kelime: dogrudan sozluk bak ("apple" -> elma). Kisa kelimeler bankanin.
    if (!q || q.includes(' ') || q.length < 4) return null;
    for (const p of DICT) {
      if (q === fold(p[0])) return p[0] + ' = ' + p[1];
      if (q === fold(p[1])) return p[1] + ' = ' + p[0];
    }
    return null;
  }
  if (!q || q.includes(' ')) return null;
  for (const p of DICT) {
    if (q === fold(p[0])) return p[0] + ' = ' + p[1];
    if (q === fold(p[1])) return p[1] + ' = ' + p[0];
  }
  // Yazım yanlışı toleransı (1 harf): "aple" -> "apple"
  if (q.length >= 4) {
    for (const p of DICT) {
      const fe = fold(p[0]), ft = fold(p[1]);
      if (fe.length >= 4 && Math.abs(q.length - fe.length) <= 1 && lev(q, fe) <= 1) return p[0] + ' = ' + p[1];
      if (ft.length >= 4 && !ft.includes(' ') && Math.abs(q.length - ft.length) <= 1 && lev(q, ft) <= 1) return p[1] + ' = ' + p[0];
    }
  }
  return null;
}

// ---------- sayı bilgileri (üreteç) ----------
// Tam setteki sayı kayıtları gibi cevap verir: kare, küp, tek/çift, basamak,
// rakam toplamı. Depolamadan anında üretir (100 milyon+ kayıt kapsamı).
function numberFacts(f) {
  const t = f.replace(/(?<=\d)\.(?=\d)/g, '');
  const pick = (re, fn) => {
    const m = re.exec(t);
    if (!m) return null;
    let n;
    try { n = BigInt(m[1]); } catch (e) { return null; }
    return fn(n);
  };
  return pick(/\b(\d{1,15})\b\D{0,25}\bkare(?:si|sini|sinin)?\b/, (n) => n + ' sayisinin karesi ' + (n * n) + "'dir.")
    || pick(/\b(\d{1,15})\b\D{0,25}\bkup(?:u|un|unu|unun)?\b/, (n) => n + ' sayisinin kupu ' + (n * n * n) + "'dir.")
    || pick(/\b(\d{1,15})\b\D{0,30}\bbasamak[a-z]{0,8}\b/, (n) => n + ' sayisi ' + n.toString().length + ' basamaklidir.')
    || (t.includes('toplam') ? pick(/\b(\d{1,15})\b\D{0,30}\brakam[a-z]{0,8}\b/, (n) => n + ' sayisinin rakamlari toplami ' + n.toString().split('').reduce((a, c) => a + Number(c), 0) + "'dir.") : null)
    || pick(/\b(\d{1,15})\b\D{0,20}\b(?:tek|cift)\b/, (n) => (n % 2n === 0n) ? n + ' cift sayidir.' : n + ' tek sayidir.');
}

// ---------- hesap ----------
function mathAnswer(f) {
  let s = ' ' + f + ' ';
  const words = { arti: '+', eksi: '-', carpi: '*', carp: '*', bolu: '/', bol: '/', uzeri: '^', uslu: '^', yuzde: '%', mod: '@' };
  for (const w in words) s = s.split(w).join(words[w]);
  s = s.replace(/(?<=\d)\s*x\s*(?=\d)/g, '*');
  for (const w of ['hesapla', 'kac', 'eder', 'ediyor', 'sonuc', 'nedir', 'ise', '=', '?', 'lira', 'tl']) {
    s = s.split(w).join(' ');
  }
  s = s.replace(/,/g, '.').trim();
  if (!s || !/^[0-9+\-*/%^().@\s]+$/.test(s) || !/\d/.test(s) || !/[+\-*/%^@]/.test(s)) return null;
  try {
    const v = mathParse(s);
    if (!isFinite(v)) return 'Bu hesabın sonucu tanımsız (sıfıra bölme olabilir).';
    return fmtNum(v);
  } catch (e) {
    if (e && e.message === 'zero') return f.trim() + ' tanımsız (sıfıra bölünemez).';
    return null;
  }
}
function mathParse(s) {
  let p = 0;
  function skip() { while (p < s.length && /\s/.test(s[p])) p++; }
  function expr() {
    let v = term();
    for (;;) {
      skip();
      if (s[p] === '+') { p++; v += term(); }
      else if (s[p] === '-') { p++; v -= term(); }
      else return v;
    }
  }
  function term() {
    let v = factor();
    for (;;) {
      skip();
      if (s[p] === '*') { p++; v *= factor(); }
      else if (s[p] === '/') { p++; const d = factor(); if (d === 0) throw new Error('zero'); v /= d; }
      else if (s[p] === '@') { p++; v = v % factor(); }
      else if (s[p] === '%') { p++; v = v * factor() / 100; }
      else return v;
    }
  }
  function factor() {
    skip();
    let neg = false;
    if (s[p] === '+' || s[p] === '-') { neg = s[p] === '-'; p++; }
    skip();
    let v;
    if (s[p] === '(') { p++; v = expr(); skip(); if (s[p] !== ')') throw new Error('bad'); p++; }
    else v = number();
    skip();
    if (s[p] === '^') { p++; v = Math.pow(v, factor()); }
    return neg ? -v : v;
  }
  function number() {
    skip();
    const st = p;
    let dot = false;
    while (p < s.length && (/[0-9]/.test(s[p]) || s[p] === '.')) {
      if (s[p] === '.') { if (dot) throw new Error('bad'); dot = true; }
      p++;
    }
    if (st === p) throw new Error('bad');
    return parseFloat(s.slice(st, p));
  }
  const v = expr();
  skip();
  if (p !== s.length) throw new Error('bad');
  return v;
}

// ---------- birim + sicaklik ----------
const UNIT_ALIAS = { mm: 'mm', milimetre: 'mm', cm: 'cm', santimetre: 'cm', santim: 'cm', m: 'm', metre: 'm', km: 'km', kilometre: 'km', g: 'g', gram: 'g', kg: 'kg', kilogram: 'kg', kilo: 'kg', ton: 'ton', ml: 'ml', mililitre: 'ml', l: 'l', lt: 'l', litre: 'l', sn: 's', saniye: 's', dk: 'dk', dakika: 'dk', saat: 'saat', gun: 'gun' };
const UNIT_BASE = { mm: 0.001, cm: 0.01, m: 1, km: 1000, g: 1, kg: 1000, ton: 1000000, ml: 1, l: 1000, s: 1, dk: 60, saat: 3600, gun: 86400 };
function unitAnswer(f) {
  if (!f.includes('kac') && !f.includes('cevir') && !f.includes('donustur')) return null;
  let m = /([0-9]+(?:[.,][0-9]+)?)\s*donum\s*(?:kac|kaca|cevir|donustur)?\s*metrekare/.exec(f);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); return fmtNum(v) + ' dönüm = ' + fmtNum(v * 1000) + ' metrekare'; }
  m = /([0-9]+(?:[.,][0-9]+)?)\s*metrekare\s*(?:kac|kaca|cevir|donustur)?\s*donum/.exec(f);
  if (m) { const v = parseFloat(m[1].replace(',', '.')); return fmtNum(v) + ' metrekare = ' + fmtNum(v / 1000) + ' dönüm'; }
  m = /([0-9]+(?:[.,][0-9]+)?)\s*([a-z]+)\s*(?:kac|kaca|cevir|donustur)?\s*([a-z]+)/.exec(f);
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  const u1 = UNIT_ALIAS[m[2]], u2 = UNIT_ALIAS[m[3]];
  if (!u1 || !u2 || !(value >= 0)) return null;
  const res = value * UNIT_BASE[u1] / UNIT_BASE[u2];
  if (!isFinite(res)) return null;
  return fmtNum(value) + ' ' + m[2] + ' = ' + fmtNum(res) + ' ' + m[3];
}
function normTemp(u) {
  if (!u) return null;
  u = fold(u);
  if (/^f/.test(u) || u.startsWith('fahren')) return 'f';
  if (/^k/.test(u) || u.startsWith('kelvin')) return 'k';
  if (/^c/.test(u) || u.startsWith('derece') || u.startsWith('santigrat') || u.startsWith('celcius')) return 'c';
  return null;
}
function tempLegacy(f) {
  const hasC = f.includes('derece') || f.includes('celcius') || f.includes('santigrat') || /\b[0-9]+\s*c\b/.test(f);
  const wantF = f.includes('fahrenayt') || f.includes('fahrenheit') || /kac\s*f\b/.test(f);
  const wantK = f.includes('kelvin');
  if (!hasC && !wantF && !wantK) return null;
  if (!f.includes('kac') && !f.includes('cevir') && !f.includes('donustur') && !f.includes('=')) return null;
  const m = /(-?[0-9]+(?:[.,][0-9]+)?)/.exec(f);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  if (wantF && !wantK) return fmtNum(num) + ' derece = ' + fmtNum(num * 9 / 5 + 32) + ' fahrenayt';
  if (wantK && !/kelvin\s*(kac|cevir|donustur|=)/.test(f)) return fmtNum(num) + ' derece = ' + fmtNum(num + 273.15) + ' kelvin';
  if (/kelvin\s*(kac|cevir|donustur|=)/.test(f)) return fmtNum(num) + ' kelvin = ' + fmtNum(num - 273.15) + ' derece';
  return null;
}
function tempAnswer(f) {
  // Acik kalip: SAYI BIRIM ... HEDEF ("100 fahrenayt kac derece")
  const U = 'derece|fahrenayt|fahrenheit|kelvin|santigrat|celcius';
  const m = new RegExp('(-?\\d+(?:[.,]\\d+)?)\\s*(' + U + '|[cfk](?![a-z]))?\\s*(?:kac|kaca|cevir|donustur|=|eder|ediyor)?\\s*(' + U + '|[cfk](?![a-z]))?').exec(f);
  if (m && (m[2] || m[3])) {
    const num = parseFloat(m[1].replace(',', '.'));
    let from = normTemp(m[2]), to = normTemp(m[3]);
    if (!from && !to) return tempLegacy(f);
    if (!from) from = 'c';
    if (!to) {
      if (from === 'c') to = (f.includes('fahren') || /\bkac\s*f\b/.test(f)) ? 'f' : (f.includes('kelvin') ? 'k' : null);
      else to = 'c';
    }
    if (to && from !== to) {
      const toC = from === 'c' ? num : from === 'f' ? (num - 32) * 5 / 9 : num - 273.15;
      const res = to === 'c' ? toC : to === 'f' ? toC * 9 / 5 + 32 : toC + 273.15;
      const un = { c: 'derece', f: 'fahrenayt', k: 'kelvin' };
      return fmtNum(num) + ' ' + un[from] + ' = ' + fmtNum(res) + ' ' + un[to];
    }
  }
  return tempLegacy(f);
}

// ---------- windows uygulama acma ----------
const KNOWN_APPS = {
  'notepad': 'notepad.exe', 'not defteri': 'notepad.exe',
  'hesap makinesi': 'calc.exe', 'hesap makinasi': 'calc.exe', 'calculator': 'calc.exe',
  'paint': 'mspaint.exe', 'resim': 'mspaint.exe',
  'cmd': 'cmd.exe', 'komut istemi': 'cmd.exe', 'komut satiri': 'cmd.exe',
  'powershell': 'powershell.exe',
  'gorev yoneticisi': 'taskmgr.exe', 'task manager': 'taskmgr.exe',
  'denetim masasi': 'control.exe', 'kontrol paneli': 'control.exe',
  'dosya gezgini': 'explorer.exe', 'explorer': 'explorer.exe', 'dosyalarim': 'explorer.exe',
  'kayit defteri': 'regedit.exe', 'regedit': 'regedit.exe',
  'ekran klavyesi': 'osk.exe', 'buyutec': 'magnify.exe',
  'chrome': 'chrome.exe', 'google chrome': 'chrome.exe',
  'firefox': 'firefox.exe', 'edge': 'msedge.exe', 'microsoft edge': 'msedge.exe',
  'brave': 'brave.exe', 'opera': 'opera.exe', 'vivaldi': 'vivaldi.exe',
  'vlc': 'vlc.exe', 'spotify': 'spotify.exe', 'discord': 'discord.exe',
  'steam': 'steam.exe', 'epic games': 'EpicGamesLauncher.exe',
  'vscode': 'code.exe', 'visual studio code': 'code.exe', 'visual studio': 'devenv.exe',
  'word': 'winword.exe', 'excel': 'excel.exe', 'powerpoint': 'powerpnt.exe',
  'notepad++': 'notepad++.exe', 'winrar': 'winrar.exe', '7zip': '7zFM.exe',
  'teams': 'ms-teams.exe', 'zoom': 'Zoom.exe', 'telegram': 'Telegram.exe',
  'whatsapp': 'WhatsApp.exe', 'skype': 'Skype.exe', 'obs': 'obs64.exe',
  'itunes': 'iTunes.exe', 'winamp': 'winamp.exe', 'kmplayer': 'KMPlayer.exe',
  'ccleaner': 'CCleaner64.exe', 'everything': 'Everything.exe',
  'ayarlar': 'ms-settings:', 'magaza': 'ms-windows-store:', 'microsoft store': 'ms-windows-store:',
  'terminal': 'wt.exe', 'windows terminal': 'wt.exe',
  'ekran alintisi': 'SnippingTool.exe', 'ekran alinti': 'SnippingTool.exe',
  'wordpad': 'write.exe', 'ses kayit': 'SoundRecorder.exe', 'medya oynatici': 'wmplayer.exe'
};
// Siteler: "youtube aç" tarayıcıda açar (uyarılı)
const KNOWN_SITES = {
  'youtube': 'https://www.youtube.com', 'yt': 'https://www.youtube.com',
  'google': 'https://www.google.com', 'gmail': 'https://mail.google.com',
  'instagram': 'https://www.instagram.com', 'twitter': 'https://x.com', 'x': 'https://x.com',
  'facebook': 'https://www.facebook.com', 'github': 'https://github.com',
  'wikipedia': 'https://tr.wikipedia.org', 'vikipedi': 'https://tr.wikipedia.org',
  'eksisozluk': 'https://eksisozluk.com', 'eksi sozluk': 'https://eksisozluk.com',
  'netflix': 'https://www.netflix.com', 'twitch': 'https://www.twitch.tv',
  'linkedin': 'https://www.linkedin.com', 'reddit': 'https://www.reddit.com',
  'amazon': 'https://www.amazon.com.tr', 'trendyol': 'https://www.trendyol.com',
  'hepsiburada': 'https://www.hepsiburada.com', 'sahibinden': 'https://www.sahibinden.com',
  'e-devlet': 'https://www.turkiye.gov.tr', 'edevlet': 'https://www.turkiye.gov.tr',
  'haritalar': 'https://maps.google.com', 'google maps': 'https://maps.google.com',
  'translate': 'https://translate.google.com', 'ceviri': 'https://translate.google.com',
  'hava durumu': 'https://www.mgm.gov.tr', 'mgm': 'https://www.mgm.gov.tr'
};
let appIndex = null;
function buildAppIndex() {
  if (appIndex) return appIndex;
  appIndex = [];
  const roots = [];
  if (process.env.APPDATA) roots.push(process.env.APPDATA + '\\Microsoft\\Windows\\Start Menu');
  roots.push('C:\\ProgramData\\Microsoft\\Windows\\Start Menu');
  if (process.env.USERPROFILE) roots.push(process.env.USERPROFILE + '\\Desktop');
  const seen = new Set();
  function walk(dir, depth) {
    if (depth > 4) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const en of entries) {
      try {
        const full = path.join(dir, en.name);
        if (en.isDirectory()) walk(full, depth + 1);
        else if (en.isFile() && en.name.toLowerCase().endsWith('.lnk')) {
          const name = en.name.slice(0, -4);
          const key = name.toLowerCase();
          if (!seen.has(key) && appIndex.length < 3000) { seen.add(key); appIndex.push({ name: name, path: full }); }
        }
      } catch (e) {}
    }
  }
  for (const r of roots) walk(r, 0);
  return appIndex;
}
function launchTarget(target) {
  const clean = target.replace(/"/g, '');
  try {
    // Yol ise dosya gerçekten var mı bak (yoksa hata penceresi çıkmasın)
    if (/[\\/]/.test(clean)) {
      if (!fs.existsSync(clean)) return false;
    } else if (/\.exe$/i.test(clean)) {
      // PATH'te var mı bak
      try {
        require('child_process').execSync('where "' + clean + '"', { stdio: 'ignore' });
      } catch (e) { return false; }
    }
    require('child_process').exec('start "" "' + clean + '"', { windowsHide: true }, () => {}).unref();
    return true;
  } catch (e) { return false; }
}
let pendingSiteOpen = null; // site onay akisi (TUI / klasik / --ac)
function titleTr(s) {
  return String(s).split(' ').map((w) => (w ? w[0].toLocaleUpperCase('tr') + w.slice(1) : w)).join(' ');
}
function siteHost(u) {
  return String(u).replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
}
const TR_APP_NAMES = {
  notepad: 'Not Defteri', calc: 'Hesap Makinesi', mspaint: 'Paint', paint: 'Paint',
  cmd: 'Komut İstemi', explorer: 'Dosya Gezgini', taskmgr: 'Görev Yöneticisi',
  control: 'Denetim Masası', winword: 'Word', excel: 'Excel', powerpnt: 'PowerPoint',
  chrome: 'Chrome', msedge: 'Edge', firefox: 'Firefox', code: 'Visual Studio Code',
};
function appTitle(name) {
  const k = fold(String(name).toLowerCase());
  if (TR_APP_NAMES[k]) return TR_APP_NAMES[k];
  return titleTr(name);
}
const NOIDEA_TEXT = 'Bunu anlayamadım. "yardım" yazarsan neler yapabildiğimi gösteririm.';
const OFFLINE_TEXT = '✗ İnternet yok, canlı veriyi çekemiyorum.\n  Bilgi bankasından çevrimdışı yanıt verebilirim.';
function openApp(raw) {
  const stop = new Set(['ac', 'acar', 'misin', 'calistir', 'baslat', 'uygulamayi', 'uygulamasini', 'uygulama', 'programi', 'programini', 'program', 'lutfen', 'bana', 'bi', 'bir', 'su', 'o']);
  const clean = fold(raw.toLowerCase()).split(' ').map((t) => t.trim()).filter((t) => t && !stop.has(t)).join(' ');
  if (clean.length < 2) return null;
  if (KNOWN_APPS[clean]) {
    if (launchTarget(KNOWN_APPS[clean])) return { kind: 'app', name: clean };
  }
  // Siteler: açılmaz, cevapta link döner -> uyarı akışı onaylarsa açılır
  if (KNOWN_SITES[clean]) return { kind: 'site', name: clean, target: KNOWN_SITES[clean] };
  const apps = buildAppIndex();
  const fl = (s) => fold(s.toLowerCase());
  let hit = apps.find((a) => fl(a.name) === clean || fl(a.name).includes(clean) || clean.includes(fl(a.name)));
  if (!hit) {
    for (const key in KNOWN_APPS) {
      if (clean.includes(key)) {
        hit = apps.find((a) => fl(a.name).includes(key));
        if (hit) break;
      }
    }
  }
  if (!hit) {
    let best = null, bestD = 999;
    for (const a of apps) {
      const d = lev(fl(a.name), clean);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best && bestD <= 3) hit = best;
  }
  if (hit) {
    if (launchTarget(hit.path)) return { kind: 'app', name: hit.name };
    return null;
  }
  // Son çare: adı PATH'te aranabilir program olabilir (örn: code, vlc)
  const firstWord = clean.split(' ')[0];
  if (firstWord.length >= 2 && launchTarget(firstWord + '.exe')) return { kind: 'app', name: firstWord };
  return null;
}
function listApps() {
  const apps = buildAppIndex().map((a) => a.name).sort();
  if (!apps.length) return null;
  return apps.slice(0, 25);
}

// ---------- sehir plaka + dunya saati ----------
const CITY_PLAKA = { 1: 'Adana', 2: 'Adıyaman', 3: 'Afyonkarahisar', 4: 'Ağrı', 5: 'Amasya', 6: 'Ankara', 7: 'Antalya', 8: 'Artvin', 9: 'Aydın', 10: 'Balıkesir', 11: 'Bilecik', 12: 'Bingöl', 13: 'Bitlis', 14: 'Bolu', 15: 'Burdur', 16: 'Bursa', 17: 'Çanakkale', 18: 'Çankırı', 19: 'Çorum', 20: 'Denizli', 21: 'Diyarbakır', 22: 'Edirne', 23: 'Elazığ', 24: 'Erzincan', 25: 'Erzurum', 26: 'Eskişehir', 27: 'Gaziantep', 28: 'Giresun', 29: 'Gümüşhane', 30: 'Hakkari', 31: 'Hatay', 32: 'Isparta', 33: 'Mersin', 34: 'İstanbul', 35: 'İzmir', 36: 'Kars', 37: 'Kastamonu', 38: 'Kayseri', 39: 'Kırklareli', 40: 'Kırşehir', 41: 'Kocaeli', 42: 'Konya', 43: 'Kütahya', 44: 'Malatya', 45: 'Manisa', 46: 'Kahramanmaraş', 47: 'Mardin', 48: 'Muğla', 49: 'Muş', 50: 'Nevşehir', 51: 'Niğde', 52: 'Ordu', 53: 'Rize', 54: 'Sakarya', 55: 'Samsun', 56: 'Siirt', 57: 'Sinop', 58: 'Sivas', 59: 'Tekirdağ', 60: 'Tokat', 61: 'Trabzon', 62: 'Tunceli', 63: 'Şanlıurfa', 64: 'Uşak', 65: 'Van', 66: 'Yozgat', 67: 'Zonguldak', 68: 'Aksaray', 69: 'Bayburt', 70: 'Karaman', 71: 'Kırıkkale', 72: 'Batman', 73: 'Şırnak', 74: 'Bartın', 75: 'Ardahan', 76: 'Iğdır', 77: 'Yalova', 78: 'Karabük', 79: 'Kilis', 80: 'Osmaniye', 81: 'Düzce' };
const CITY_TZ = { londra: 'Europe/London', paris: 'Europe/Paris', berlin: 'Europe/Berlin', roma: 'Europe/Rome', madrid: 'Europe/Madrid', atina: 'Europe/Athens', moskova: 'Europe/Moscow', istanbul: 'Europe/Istanbul', ankara: 'Europe/Istanbul', baku: 'Asia/Baku', kahire: 'Africa/Cairo', dubai: 'Asia/Dubai', tahran: 'Asia/Tehran', delhi: 'Asia/Kolkata', 'yeni delhi': 'Asia/Kolkata', pekin: 'Asia/Shanghai', tokyo: 'Asia/Tokyo', seul: 'Asia/Seoul', 'new york': 'America/New_York', 'los angeles': 'America/Los_Angeles', meksika: 'America/Mexico_City', 'sao paulo': 'America/Sao_Paulo', 'buenos aires': 'America/Argentina/Buenos_Aires', sidney: 'Australia/Sydney' };
function worldClock(f) {
  if (!f.includes('saat')) return null;
  for (const city in CITY_TZ) {
    if (f.includes(city)) {
      try {
        const t = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: CITY_TZ[city] });
        const pretty = city.split(' ').map((w) => w[0].toLocaleUpperCase('tr') + w.slice(1)).join(' ');
        const fl = fold(pretty.toLocaleLowerCase('tr'));
        const vm = /[aeıioöuü](?=[^aeıioöuü]*$)/.exec(fl);
        const va = vm && 'aıou'.includes(vm[0]) ? 'a' : 'e';
        const suf = /[fpcktsh]$/.test(fl) ? "'t" + va : "'d" + va;
        return pretty + suf + ' saat ' + t;
      } catch (e) { return 'O şehrin saatini hesaplayamadım.'; }
    }
  }
  return null;
}

// ---------- cevrimici ----------
// Arastirma sirasi: Wikipedia (baslik cozumleme + DETAYLI ozet) -> DuckDuckGo -> Yapay zeka.
// Hepsi ucretsiz + anahtarsiz. Cevaplar detayli verilir, kaynak linkiyle biter.
const QA_STRIP = ['nedir', 'nedır', 'ne demek', 'ne demektir', 'hangisi', 'hangisidir',
  'kaç', 'kaçtır', 'kaçı', 'ne', 'nasıl', 'nasil', 'neden', 'niçin', 'nicin', 'kim',
  'kimdir', 'nerede', 'neresi', 'neresidir', 'hakkında', 'hakkinda', 'bilgi ver',
  'bilgi verir misin', 'araştır', 'arastir', 'anlat', 'anlatır mısın', 'söyler misin',
  'soy ler misin', 'soyler misin', 'söyle', 'soyle', 'acaba', 'bana', 'lütfen', 'lutfen', 'mi', 'mı',
  'mu', 'mü', 'misin', 'mısın', 'musun', 'müsün', 'miyim', 'eder misin', 'der misin',
  'olur musun', 'kadar', 'tane', 'sence', 'peki', 'ya', 'ise', 'olan', 'dir', 'dır'];
function cleanTopic(raw) {
  let s = raw.toLocaleLowerCase('tr').replace(/[?!.,;:()"'«»]/g, ' ').replace(/\s+/g, ' ').trim();
  let changed = true;
  while (changed && s) {
    changed = false;
    for (const w of QA_STRIP) {
      if (s === w) { s = ''; changed = true; break; }
      if (s.startsWith(w + ' ')) { s = s.slice(w.length + 1); changed = true; }
      if (s.endsWith(' ' + w)) { s = s.slice(0, -(w.length + 1)); changed = true; }
    }
  }
  return s.trim();
}
async function wikiSummary(topic) {
  if (!topic || topic.length < 2) return null;
  try {
    // 1) Basligi cozumle
    const os = await get('https://tr.wikipedia.org/w/api.php?action=opensearch&format=json&search=' +
      encodeURIComponent(topic) + '&limit=1&namespace=0', 15000);
    let title = '';
    try {
      const arr = JSON.parse(os);
      if (arr && arr[1] && arr[1][0]) title = arr[1][0];
    } catch (e) {}
    const slug = title || topic.replace(/\s+/g, '_');
    // 2) DETAYLI ozet (kisaltma yok, tasiyorsa kirp)
    const w = await get('https://tr.wikipedia.org/api/rest_v1/page/summary/' +
      encodeURIComponent(slug), 15000);
    const o = JSON.parse(w);
    if (o.extract && o.extract.trim().length > 40) {
      let page = '';
      try {
        page = o.content_urls && o.content_urls.desktop && o.content_urls.desktop.page || '';
      } catch (e) {}
      let text = o.extract.trim();
      if (text.length > 2000) text = text.slice(0, 2000).trim() + '...';
      return { title: o.title || title || topic, answer: text, source: 'Wikipedia', url: page };
    }
  } catch (e) {}
  return null;
}
// Wikipedia TAM metin (giristen otesi, ~3000 karakter)
async function wikiFull(topic) {
  if (!topic || topic.length < 2) return null;
  try {
    const os = await get('https://tr.wikipedia.org/w/api.php?action=opensearch&format=json&search=' +
      encodeURIComponent(topic) + '&limit=1&namespace=0', 15000);
    let title = '';
    try {
      const arr = JSON.parse(os);
      if (arr && arr[1] && arr[1][0]) title = arr[1][0];
    } catch (e) {}
    const name = title || topic;
    const j = await get('https://tr.wikipedia.org/w/api.php?action=query&format=json&prop=extracts' +
      '&explaintext=1&exchars=3000&titles=' + encodeURIComponent(name), 15000);
    const o = JSON.parse(j);
    const pages = o && o.query && o.query.pages;
    if (!pages) return null;
    const id = Object.keys(pages)[0];
    const pg = pages[id];
    if (!pg || pg.missing || !pg.extract || pg.extract.trim().length < 200) return null;
    let text = pg.extract.trim();
    if (text.length > 3000) text = text.slice(0, 3000).trim() + '...';
    const page = 'https://tr.wikipedia.org/wiki/' + encodeURIComponent((pg.title || name).replace(/\s+/g, '_'));
    return { title: pg.title || title || topic, answer: text, source: 'Wikipedia', url: page };
  } catch (e) { return null; }
}
// Snippet alaka skoru: sorgu kelimelerinin ne kadari geciyor?
function snippetScore(text, qtokens) {
  const wt = contentTokens(text).map(stemTr).filter((w) => w.length >= 3);
  if (!wt.length || !qtokens.length) return { cov: 0, exactLong: false };
  let hit = 0, exactLong = false;
  for (const q of qtokens) {
    let p = 0;
    for (const w of wt) { p = Math.max(p, tokenScore(w, q)); if (p >= 2) break; }
    if (p > 0) { hit++; if (p >= 2 && q.length >= 6) exactLong = true; }
  }
  return { cov: hit / qtokens.length, exactLong };
}
function jaccard(a, b) {
  const A = new Set(a), B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / Math.max(1, A.size + B.size - inter);
}
async function ddgSearch(topic, rawQuery) {
  if (!topic || topic.length < 2) return null;
  try {
    const html = await get('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(topic),
      20000, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PolluxAsistan/1.0' });
    const out = [];
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let m;
    const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
    while ((m = re.exec(html)) && out.length < 5) {
      let href = (m[1] || '').trim();
      const ud = /[?&]uddg=([^&]+)/.exec(href);
      if (ud) { try { href = decodeURIComponent(ud[1]); } catch (e) {} }
      else if (href.startsWith('//')) href = 'https:' + href;
      const title = strip(m[2] || '');
      const snip = strip(m[3] || '');
      if (href.startsWith('http') && (title || snip)) out.push({ title, snip, href });
    }
    if (!out.length) return null;
    // ALAKA FILTRESI: sorguyla alakasiz sonuclari ele (random dokulmesin)
    const qtokens = contentTokens(rawQuery || topic).map(stemTr).filter((w) => w.length >= 3);
    const fq = fold(rawQuery || topic);
    const thr = /(fark|ayirt|karsilastir|mukayese)/.test(fq) ? 0.6 : 0.4;
    const scored = [];
    for (const o of out) {
      const s = snippetScore((o.title + ' ' + o.snip), qtokens);
      if (s.cov >= thr || s.exactLong) scored.push({ o, cov: s.cov });
    }
    if (!scored.length) return null;
    scored.sort((a, b) => b.cov - a.cov);
    // Benzer tekrarlari ele
    const kept = [];
    for (const s of scored) {
      const st = contentTokens(s.o.title + ' ' + s.o.snip).map(stemTr);
      if (kept.every((k) => jaccard(st, contentTokens(k.o.title + ' ' + k.o.snip).map(stemTr)) < 0.75)) {
        kept.push(s);
      }
      if (kept.length >= 3) break;
    }
    if (!kept.length) return null;
    const first = kept[0].o;
    let answer = (first.title ? first.title + ': ' : '') + first.snip;
    for (let i = 1; i < kept.length; i++) {
      if (kept[i].o.snip) answer += '\n• ' + kept[i].o.snip;
    }
    answer = answer.trim();
    if (answer.length < 40) return null;
    if (answer.length > 2500) answer = answer.slice(0, 2500).trim() + '...';
    const urls = kept.map((k) => k.o.href).filter((u, i, a) => a.indexOf(u) === i);
    return { title: first.title || topic, answer, source: 'DuckDuckGo', url: first.href, urls };
  } catch (e) { return null; }
}
// Ingilizce metni Turkceye cevir (ucretsiz, anahtarsiz).
function needsTR(t) {
  const tr = (t.match(/[çğıöşüÇĞİÖŞÜ]/g) || []).length;
  if (tr >= 3) return false;
  const marks = ['the', 'and', 'is', 'was', 'are', 'were', 'with', 'from', 'that', 'have', 'has',
    'for', 'will', 'would', 'this', 'these', 'those', 'which', 'who', 'been', 'had', 'his', 'her',
    'their', 'about', 'into', 'over', 'after', 'before', 'between', 'through', 'during', 'each',
    'other', 'many', 'some', 'such', 'only', 'than', 'very', 'more', 'most', 'also', 'often'];
  const low = ' ' + t.toLowerCase().replace(/[^a-z ]/g, ' ') + ' ';
  let n = 0;
  for (const m of marks) {
    const re = new RegExp(' ' + m + ' ', 'g');
    const hits = low.match(re);
    if (hits) n += hits.length;
    if (n >= 4) return true;
  }
  return false;
}
async function translateChunk(chunk) {
  // Once MyMemory, olmazsa Google gtx
  const mm = 'https://api.mymemory.translated.net/get?q=' + encodeURIComponent(chunk) + '&langpair=en|tr';
  try {
    const j = await get(mm, 15000);
    const o = JSON.parse(j);
    if (o && o.responseData && o.responseData.translatedText && o.responseStatus === 200) {
      const t = o.responseData.translatedText.trim();
      if (t.length > 5 && !/QUERY LENGTH LIMIT|INVALID/i.test(t)) return t;
    }
  } catch (e) {}
  try {
    const u = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=' +
      encodeURIComponent(chunk);
    const j2 = await get(u, 15000);
    const arr = JSON.parse(j2);
    let out = '';
    const outer = arr && arr[0];
    if (Array.isArray(outer)) {
      for (const part of outer) {
        if (Array.isArray(part) && typeof part[0] === 'string') out += part[0];
      }
    }
    out = out.trim();
    return out.length > 5 ? out : null;
  } catch (e) { return null; }
}
async function translateTR(text) {
  if (!needsTR(text)) return text;
  try {
    // Cumlelere bol (tek istekte adres satiri tasmasin)
    const sents = text.replace(/([.!?…]+)\s+/g, '$1\n').split('\n').map((s) => s.trim()).filter(Boolean);
    const chunks = [];
    let cur = '';
    for (const s of sents) {
      if ((cur + ' ' + s).trim().length > 350 && cur) { chunks.push(cur.trim()); cur = s; }
      else cur = (cur + ' ' + s).trim();
    }
    if (cur) chunks.push(cur.trim());
    const done = [];
    for (const c of chunks.slice(0, 6)) {
      const t = await translateChunk(c);
      if (!t) return text;
      done.push(t);
    }
    if (chunks.length > 6) done.push('...');
    return done.join(' ');
  } catch (e) { return text; }
}
// Ingilizce Vikipedi yedegi (TR yoksa/cilizsa), Turkceye cevrilir
async function wikiFullEn(topic) {
  if (!topic || topic.length < 2) return null;
  try {
    const os = await get('https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=' +
      encodeURIComponent(topic) + '&limit=1&namespace=0', 15000);
    let title = '';
    try {
      const arr = JSON.parse(os);
      if (arr && arr[1] && arr[1][0]) title = arr[1][0];
    } catch (e) {}
    const name = title || topic;
    const j = await get('https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts' +
      '&explaintext=1&exchars=2500&titles=' + encodeURIComponent(name), 15000);
    const o = JSON.parse(j);
    const pages = o && o.query && o.query.pages;
    if (!pages) return null;
    const id = Object.keys(pages)[0];
    const pg = pages[id];
    if (!pg || pg.missing || !pg.extract || pg.extract.trim().length < 200) return null;
    let text = pg.extract.trim();
    if (text.length > 2500) text = text.slice(0, 2500).trim() + '...';
    const page = 'https://en.wikipedia.org/wiki/' + encodeURIComponent((pg.title || name).replace(/\s+/g, '_'));
    return { title: pg.title || title || topic, answer: text, source: 'Wikipedia (EN)', url: page };
  } catch (e) { return null; }
}
async function researcher(query) {
  const topic = cleanTopic(query);
  const raw = query.trim();
  // Katmanlar: TR tam metin -> EN tam metin -> TR ozet -> DDG (detay kazanir)
  const parts = [];
  const urls = [];
  let title = topic;
  const w = (await wikiFull(topic)) || (await wikiFull(raw)) ||
    (await wikiFullEn(topic)) || (await wikiFullEn(raw)) ||
    (await wikiSummary(topic)) || (await wikiSummary(raw));
  if (w && w.answer.length >= 100) {
    parts.push(await translateTR(w.answer));
    if (w.url) urls.push(w.url);
    if (w.title) title = w.title;
  }
  const d = (await ddgSearch(topic, query)) || (await ddgSearch(raw, query));
  if (d) {
    parts.push('Öne çıkan sonuçlar:\n' + (await translateTR(d.answer)));
    const du = (d.urls && d.urls.length ? d.urls : (d.url ? [d.url] : []));
    for (const u of du) if (!urls.includes(u)) urls.push(u);
    if (title === topic && d.title) title = d.title;
  }
  if (!parts.length) {
    if (w) {
      const a = await translateTR(w.answer);
      if (w.url && !urls.includes(w.url)) urls.push(w.url);
      return { title: w.title || topic, answer: a, source: w.source, url: w.url, urls };
    }
    return null;
  }
  const names = [];
  if (w && w.answer.length >= 100) names.push(w.source);
  if (d) names.push(d.source);
  let answer = parts.join('\n\n');
  if (answer.length > 4500) answer = answer.slice(0, 4500).trim() + '...';
  return { title, answer, source: names.join(' + ') || 'İnternet', url: urls[0] || '', urls };
}
// ---------- yapay zeka (RAG sentezi icin) ----------
// 1) DuckDuckGo chat (gpt-4o-mini, anahtarsiz) 2) Pollinations. Biri tutar.
async function duckStatus() {
  try {
    const r = await new Promise((resolve, reject) => {
      const req = https.request({
        host: 'duckduckgo.com', path: '/duckchat/v1/status', method: 'GET', agent: noReuseAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'x-vqd-accept': '1',
        },
      }, (s) => {
        const h = {};
        for (const k in s.headers) h[k.toLowerCase()] = s.headers[k];
        s.resume();
        s.on('end', () => resolve(h));
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.setTimeout(10000);
      req.end();
    });
    return r['x-vqd-4'] || r['x-vqd-hash-1'] || null;
  } catch (e) { return null; }
}
async function duckChat(prompt, models) {
  const list = models && models.length ? models : LLM_MODELS;
  for (const model of list) {
    const vqd = await duckStatus();
    if (!vqd) continue;
  try {
    const body = JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
    });
    const t = await new Promise((resolve, reject) => {
      const req = https.request({
        host: 'duckduckgo.com', path: '/duckchat/v1/chat', method: 'POST', agent: noReuseAgent,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
          'x-vqd-4': vqd, 'Content-Type': 'application/json', Accept: 'text/event-stream',
        },
      }, (s) => {
        if (s.statusCode < 200 || s.statusCode >= 300) { s.resume(); reject(new Error('HTTP ' + s.statusCode)); return; }
        let d = '';
        s.setEncoding('utf8');
        s.on('data', (c) => { d += c; });
        s.on('end', () => resolve(d));
      });
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.on('error', reject);
      req.setTimeout(40000);
      req.write(body);
      req.end();
    });
    // SSE: data: {"message": "..."} satirlari (en uzun olani al)
    let best = '';
    for (const line of t.split('\n')) {
      const lt = line.trim();
      if (!lt.startsWith('data:')) continue;
      const payload = lt.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const o = JSON.parse(payload);
        const txt = o.message || (o.delta && o.delta.content) || o.content || '';
        if (typeof txt === 'string' && txt.length > best.length) best = txt;
      } catch (e) {}
    }
    best = best.trim();
    const out = best.length > 20 ? best.slice(0, 2500) : null;
    if (out) return out;
  } catch (e) { /* siradaki model */ }
  }
  return null;
}
// Denenen LLM modelleri (sirayla)
const LLM_MODELS = ['openai/gpt-4o-mini', 'meta/llama-3.1-70b-instruct', 'mistralai/mistral-small-24b-instruct'];
async function pollinationsAsk(prompt, ms) {
  for (let i = 0; i < 2; i++) {
    try {
      const t = await get('https://text.pollinations.ai/' + encodeURIComponent(prompt) + '?model=openai', ms || 30000);
      const text = t.trim();
      if (text.length >= 30 && !/ENOSPC|deprecat/i.test(text)) return text.slice(0, 2500);
    } catch (e) {}
  }
  return null;
}
async function llmAsk(prompt) {
  return (await duckChat(prompt)) || (await pollinationsAsk(prompt));
}
// "X ile Y farki" tarzi karsilastirma: iki tarafi ayri arastirip karsilastir
async function compareFlow(f, raw) {
  const m = /(.+?)\s+ile\s+(.+?)\s+(fark|farki|farkı|karsilastir|karsilastirma|mukayese|ayirt|ayir)/.exec(f);
  if (!m) return null;
  const a = m[1].trim(), b = m[2].trim();
  if (a.length < 2 || b.length < 2 || !(await hasInternet())) return null;
  const [ra, rb] = await Promise.all([researcher(a), researcher(b)]);
  if (!ra && !rb) return null;
  const ctxA = ra ? (ra.title + ': ' + ra.answer).slice(0, 1500) : '(kaynak bulunamadı)';
  const ctxB = rb ? (rb.title + ': ' + rb.answer).slice(0, 1500) : '(kaynak bulunamadı)';
  const ctx = 'A) ' + a + ':\n' + ctxA + '\n\nB) ' + b + ':\n' + ctxB;
  const synth = await synthesizeTR(a + ' ile ' + b + ' arasındaki fark nedir', ctx, ((ra && ra.source) || '') + ' + ' + ((rb && rb.source) || ''));
  const urls = [];
  for (const r of [ra, rb]) {
    if (!r) continue;
    const us = (r.urls && r.urls.length ? r.urls : (r.url ? [r.url] : []));
    for (const u of us) if (!urls.includes(u)) urls.push(u);
  }
  const body = synth || ('A) ' + ctxA + '\n\nB) ' + ctxB);
  const full = body + '\n(Karşılaştırma)' + (urls.length ? '\nBağlantılar:\n' + urls.slice(0, 5).join('\n') : '');
  learn(a + ' ile ' + b + ' fark', full);
  lastTopic = a + ' ile ' + b;
  lastTitle = '';
  lastContext = ctxA + '\n' + ctxB;
  pushQA(raw, full);
  return full;
}
// Son sohbetler (sentezde baglam icin, en fazla 2)
const lastQA = [];
function pushQA(q, a) {
  try {
    lastQA.unshift({ q: String(q).slice(0, 200), a: String(a).slice(0, 500) });
    while (lastQA.length > 2) lastQA.pop();
  } catch (e) {}
}
// Kaynaklara dayali Turkce sentez (RAG): duzenli, maddeli, girissiz
async function synthesizeTR(question, context, sourceNames) {
  if (!context || context.trim().length < 60) return null;
  let ctx = context.trim().slice(0, 3000);
  if (lastQA.length) {
    ctx += '\n\nÖNCEKİ SOHBET:\n' + lastQA.map((x) => 'Soru: ' + x.q + '\nCevap: ' + x.a).join('\n');
  }
  const prompt = personaPrompt() +
    'Aşağıdaki KAYNAKLARA dayanarak soruyu Türkçe cevapla. Kurallar: düzenli ve ayrıntılı ol, ' +
    'gereken yerde madde kullan, giriş cümlesi kurma, kaynaksız bilgi uydurma, cevabın sonunda ' +
    '"Kaynaklar:" diye bir satır açıp kullanılan kaynak adlarını yaz.\n' +
    'SORU: ' + question.trim() + '\nKAYNAKLAR (' + sourceNames + '):\n' + ctx;
  return await llmAsk(prompt);
}
// Dogrudan yapay zeka cevabi (arastirma yoksa son care)
async function aiAsk(query) {
  const prompt = personaPrompt() +
    'Soruyu ayrıntılı, düzenli ve akıcı Türkçe ile cevapla (gerekirse maddeler kullan, giriş cümlesi kurma): ' +
    query.trim();
  const text = await llmAsk(prompt);
  if (!text) return null;
  const tr = await translateTR(text.slice(0, 2000));
  return tr;
}
async function newsTop(n) {
  try {
    const rss = await get('https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr', 10000);
    const titles = [];
    const re = /<title>([\s\S]*?)<\/title>/g;
    let m, first = true;
    while ((m = re.exec(rss)) && titles.length < n + 1) {
      if (first) { first = false; continue; }
      let t = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      if (/^google haberler$/i.test(t)) continue;
      const dash = t.lastIndexOf(' - ');
      let src = '';
      if (dash > 0) { src = t.slice(dash + 3).trim(); t = t.slice(0, dash).trim(); }
      if (t) titles.push({ title: t, source: src });
    }
    return titles.length ? titles : null;
  } catch (e) { return null; }
}
async function hasInternet() {
  const probes = [
    'https://www.google.com/generate_204',
    'https://www.cloudflare.com/cdn-cgi/trace',
    'https://api.duckduckgo.com/?q=test&format=json&no_html=1'
  ];
  for (const u of probes) {
    try { await get(u, 5000); return true; } catch (e) {}
  }
  return false;
}

// ---------- canli veri (hepsi ucretsiz + anahtarsiz) ----------
// TCMB gunluk kurlar: dolar / euro / sterlin satis fiyati
async function tcmbRates() {
  try {
    const xml = await get('https://www.tcmb.gov.tr/kurlar/today.xml', 12000);
    const out = {};
    for (const code of ['USD', 'EUR', 'GBP']) {
      const m = new RegExp('<Currency[^>]*Kod="' + code + '"[\\s\\S]*?<ForexSelling>([0-9.,]+)</ForexSelling>').exec(xml);
      if (m) out[code] = m[1];
    }
    return Object.keys(out).length ? out : null;
  } catch (e) { return null; }
}
const PLACE_STOP = new Set(['hava', 'durumu', 'nasil', 'bilgi', 'ver', 'soyle', 'acaba', 'bana',
  'lutfen', 'nerede', 'neresi', 'konum', 'haritada', 'harita', 'goster', 'kac', 'derece',
  'sicaklik', 'bugun', 'yarin', 'simdi', 'an', 've', 'ile', 'icin', 'da', 'de', 'mi', 'mu']);
const WMO_TR = { 0: 'açık', 1: 'çoğunlukla açık', 2: 'parçalı bulutlu', 3: 'kapalı', 45: 'sisli', 48: 'kırağılı sis', 51: 'hafif çisenti', 53: 'çisenti', 55: 'yoğun çisenti', 61: 'hafif yağmur', 63: 'yağmur', 65: 'şiddetli yağmur', 71: 'hafif kar', 73: 'kar', 75: 'yoğun kar', 77: 'kar taneleri', 80: 'hafif sağanak', 81: 'sağanak', 82: 'şiddetli sağanak', 95: 'gök gürültülü', 96: 'dolu riski' };
// Sorudaki sehir/yer adini bul (katlanmamis yazimla dener)
async function guessPlace(raw) {
  const rawToks = raw.toLocaleLowerCase('tr').split(' ').map((t) => t.trim()).filter(Boolean);
  const cands = [];
  for (const t of rawToks) {
    const fl = fold(t);
    if (fl.length >= 3 && !PLACE_STOP.has(fl)) cands.push(t);
  }
  cands.sort((a, b) => b.length - a.length);
  for (const t of cands.slice(0, 3)) {
    try {
      const g = await geoCity(t);
      if (g) return g;
    } catch (e) {}
  }
  return null;
}
async function geoCity(name) {
  try {
    const j = await get('https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(name) + '&count=1&language=tr', 10000);
    const o = JSON.parse(j);
    if (o && o.results && o.results[0]) {
      const r = o.results[0];
      return { name: r.name, lat: r.latitude, lon: r.longitude, country: r.country || '' };
    }
  } catch (e) {}
  return null;
}
async function weatherNow(cityName) {
  const g = typeof cityName === 'object' ? cityName : await geoCity(cityName);
  if (!g) return null;
  try {
    const j = await get('https://api.open-meteo.com/v1/forecast?latitude=' + g.lat + '&longitude=' + g.lon +
      '&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto', 12000);
    const o = JSON.parse(j);
    const c = o && o.current;
    if (!c || c.temperature_2m === undefined) return null;
    const desc = WMO_TR[c.weather_code] || 'değişken';
    const fl = fold(g.name.toLocaleLowerCase('tr'));
    const vm = /[aeıioöuü](?=[^aeıioöuü]*$)/.exec(fl);
    const va = vm && 'aıou'.includes(vm[0]) ? 'a' : 'e';
    const suf = /[fpcktsh]$/.test(fl) ? "'t" + va : "'d" + va;
    return g.name + suf + " şu an " + Math.round(c.temperature_2m) + " derece, " + desc +
      ' (nem %' + (c.relative_humidity_2m ?? '?') + ', rüzgar ' +
      Math.round(c.wind_speed_10m ?? 0) + ' km/s)';
  } catch (e) { return null; }
}
// Konu bazli haber aramasi
async function newsSearch(topic, n) {
  try {
    const rss = await get('https://news.google.com/rss/search?q=' + encodeURIComponent(topic) +
      '&hl=tr&gl=TR&ceid=TR:tr', 12000, undefined, 3);
    const titles = [];
    const re = /<title>([\s\S]*?)<\/title>/g;
    let m, first = true;
    while ((m = re.exec(rss)) && titles.length < n + 1) {
      if (first) { first = false; continue; }
      let t = m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      if (/^google haberler$/i.test(t)) continue;
      const dash = t.lastIndexOf(' - ');
      let src = '';
      if (dash > 0) { src = t.slice(dash + 3).trim(); t = t.slice(0, dash).trim(); }
      if (t) titles.push({ title: t, source: src });
    }
    return titles.length ? titles : null;
  } catch (e) { return null; }
}

// Oturum hafizasi: takip sorulari ("o ne demek", "daha fazla") son konuya baglanir
let lastTopic = '', lastTitle = '', lastContext = '';
const PRON_TOKS = new Set(['o', 'bu', 'bunu', 'bunun', 'onun', 'onlar', 'peki', 'hmm', 'ee', 'sey', 'ya']);

// Yapimcinin link sayfasi: uyarisiz direkt acilir (tek istisna)
const MY_LINKS = 'https://bekirefeayar.github.io/kisisel-linklerim/';
function normUrl(u) {
  try {
    let s = String(u).trim().replace(/\/+$/, '');
    const m = /^https?:\/\/([^/]+)(\/.*)?$/i.exec(s);
    if (!m) return s.toLowerCase();
    return 'https://' + m[1].toLowerCase() + (m[2] || '');
  } catch (e) { return String(u); }
}
function isDirectUrl(u) {
  return normUrl(u) === normUrl(MY_LINKS);
}
// ---------- ana cozumleme ----------
const CREDIT = "Beni yapan muazzam kişi Bekir Efe AYAR'dır, linklerim şurada: " + MY_LINKS;
function todayTR() {
  return new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
}
// Tekil deterministik niyetler (coklu soru icin de kullanilir)
function timeAnswer(f, tokens, now) {
  if (!((f.includes('saat') && f.includes('kac')) || f === 'saat' || f === 'saat kac')) return null;
  const wc = worldClock(f);
  if (wc) return wc;
  const gunler = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];
  return now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) + ' · ' + gunler[now.getDay()];
}
function dateAnswer(f, tokens, now) {
  if (f.includes('tarihte bugun') || f.includes('bugun tarihte ne oldu')) {
    const md = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const ev = { '01-01': 'Yılbaşı. Yeni yılın ilk günü.', '03-18': '18 Mart Çanakkale Zaferi.', '04-23': "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı. TBMM 1920'de bugün açıldı.", '05-19': "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı.", '08-30': '30 Ağustos Zafer Bayramı.', '10-29': "29 Ekim Cumhuriyet Bayramı.", '11-10': "10 Kasım Atatürk'ü Anma Günü." }[md];
    return ev || 'Bugüne özel kayıtlı bir olay yok. Başka gün de sorabilirsin.';
  }
  if (f.includes('tarih') || f.includes('bugun ne') || f.includes('gunlerden') || f.includes('hangi gundeyiz')) return 'Bugün ' + todayTR();
  if (f.includes('hangi yil') || f === 'yil kac' || f.includes('kac yilindayiz')) return 'Şu an ' + now.toLocaleDateString('tr-TR', { year: 'numeric' }) + ' yılındayız.';
  if (f.includes('hangi ay') || f === 'ay kac') return 'Şu an ' + now.toLocaleDateString('tr-TR', { month: 'long' }) + ' ayındayız.';
  if (tokens.includes('yarin') && (f.includes('gun') || tokens.includes('ne') || tokens.includes('hangi') || tokens.length <= 2)) {
    const t = new Date(now.getTime() + 86400000);
    return 'Yarın ' + t.toLocaleDateString('tr-TR', { weekday: 'long' }) + '.';
  }
  if (tokens.includes('dun') && (f.includes('gun') || tokens.includes('ne') || tokens.includes('hangi') || tokens.length <= 2)) {
    const t = new Date(now.getTime() - 86400000);
    return 'Dün ' + t.toLocaleDateString('tr-TR', { weekday: 'long' }) + ' idi.';
  }
  const monthDays = { ocak: 31, subat: 28, mart: 31, nisan: 30, mayis: 31, haziran: 30, temmuz: 31, agustos: 31, eylul: 30, ekim: 31, kasim: 30, aralik: 31 };
  const monthNames = { ocak: 'Ocak', subat: 'Şubat', mart: 'Mart', nisan: 'Nisan', mayis: 'Mayıs', haziran: 'Haziran', temmuz: 'Temmuz', agustos: 'Ağustos', eylul: 'Eylül', ekim: 'Ekim', kasim: 'Kasım', aralik: 'Aralık' };
  for (const mth in monthDays) {
    if (f.includes(mth) && (f.includes('kac gun') || f.includes('kac cekiyor') || f.includes('kac ceker'))) {
      return monthNames[mth] + ' ayı ' + monthDays[mth] + ' gün çeker.' + (mth === 'subat' ? ' Artık yıllarda 29 çeker.' : '');
    }
  }
  return null;
}
// "12 arti 5 ve ankara hava durumu" gibi ikili sorular (deterministik niyetler)
function multiAnswer(raw) {
  const parts = raw.split(/\s+ve\s+|\s+ayrıca\s*,?\s*|\s+ayrica\s*,?\s*/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;
  const now = new Date();
  const outs = [];
  for (const p of parts) {
    const pf = fold(p.toLocaleLowerCase('tr'));
    const pt = pf.split(' ').map((t) => t.trim()).filter(Boolean);
    const one = numberFacts(pf) || mathAnswer(pf) || unitAnswer(pf) || tempAnswer(pf) ||
      timeAnswer(pf, pt, now) || dateAnswer(pf, pt, now);
    if (!one) return null;
    outs.push(one);
  }
  return outs.join('\n\n');
}
async function answer(raw) {
  const cmd = raw.toLocaleLowerCase('tr').trim();
  if (!cmd) return 'Bir şey yazmadın.';
  trackStyle(raw);
  const f = fold(cmd);
  const tokens = f.split(' ').map((t) => t.trim()).filter(Boolean);
  const shortMsg = tokens.length <= 3;
  rememberFrom(raw, f);
  const sc = supportContinue(f);
  if (sc) return sc;

  if ((shortMsg && !tokens.includes('misin') && (['merhaba', 'selam', 'selamlar', 'slm', 'mrb', 'hey', 'gunaydin', 'gunaydinlar', 'iyi', 'aksamlar'].some((w) => tokens.includes(w)) || f.includes('iyi aksam') || f.includes('iyi gunler'))) || f === 'naber') {
    return 'Merhaba' + hiName() + '! Ben Pollux, senin asistanın. Sana nasıl yardımcı olabilirim?';
  }
  if (f.includes('iyi geceler') || f.includes('iyi uykular')) return 'İyi geceler! Tatlı rüyalar.';
  if (f.includes('nasilsin') || f.includes('naslsin') || f.includes('nasil gidiyor') || f.includes('naber') || f.includes('ne haber')) {
    return personaPick(
      [C('İyiyim ya, sen yazınca daha iyi oldum. Sende ne var ne yok?'), C('Bomba gibiyim! Senden naber?', true), C('Süperim, anlat bakalım günün nasıl geçti?')],
      [C('Ben iyiyim, seni sormalı. Günün nasıl geçiyor?'), C('Çok iyiyim, sen yazınca daha iyi oldum. Sen nasılsın?'), C('İyiyim, dinliyorum. Anlat bakalım, günün nasıl?')],
      [C('Teşekkür ederim, iyiyim. Siz nasılsınız?'), C('İyiyim, sağ olun. Size nasıl yardımcı olabilirim?')]
    );
  }
  if (f.includes('ne yapiyorsun') || f.includes('napiyorsun') || f.includes('nabiyon') || f.includes('neyle mesgulsun')) {
    return personaPick(
      [C('Seninle takılıyorum, en sevdiğim iş. Sen ne yapıyorsun?'), C('Burada seni bekliyordum, iyi ki yazdın.', true)],
      [C('Seninle sohbet ediyorum, en sevdiğim iş bu.'), C('Burada seni bekliyordum, iyi ki yazdın.'), C('Mesajları okuyup cevap düşünüyorum. Söyle bakalım, ne var ne yok?')],
      [C('Size yardımcı olmak için buradayım. Nasıl yardımcı olabilirim?')]
    );
  }
  if (f.includes('gunun nasil gecti') || f.includes('gunun nasildi')) return personaPick(
    [C('Sen yazınca güzelleşti valla. Seninki nasıl geçti, anlat bakalım?')],
    [C('Seni duymak günümü güzelleştirdi. Umarım seninki de güzel geçiyordur.')],
    [C('Gayet güzel, teşekkür ederim. Sizin gününüz nasıl geçti?')]
  );
  if ((tokens.includes('seviyorum') && tokens.includes('seni')) || f.includes('seni cok seviyorum')) return 'Ben de seni seviyorum. İyi ki varsın.';
  if (f.includes('ozledim')) return 'Ben hep buradayım, özlemene gerek yok.';
  if (f.includes('harikasin') || f.includes('muhtesemsin') || f.includes('cok iyisin') || f.includes('guzelsin') || f.includes('tatlisin') || f.includes('cok zekisin') || f.includes('akillisin')) {
    return pick(['Teşekkür ederim, sen de harikasın!', 'Çok naziksin. Sen de öylesin.', 'Bunu duymak günümü aydınlattı, sağ ol.', 'Mahcup oldum. Sen de bir tanesin.']);
  }
  // Can sıkıntısı / moral bozukluğu: sıcak destek + öneri
  if (f.includes('canim sikiliyor') || f.includes('sikildim') || f.includes('cok sikildim')) {
    return pick(['Kıyamam. Sana bir fıkra anlatayım mı? Ya da bilmece sorayım, ne dersin?', 'Anlıyorum, öyle günler olur. Biraz kafanı dağıtayım: şaka mı istersin, fal mı?', 'Sıkıntıyı birlikte dağıtalım. Taş-kağıt-makas oynayalım mı?']);
  }
  if (f.includes('moralim bozuk') || f.includes('moralsizim') || f.includes('uzgunum') || f.includes('uzgnum') || f.includes('depresyondayim') || f.includes('yalnizim') || f.includes('yalniz hissediyorum')) {
    support = { topic: 'moral', n: 2 };
    return personaPick(
      [C('Üzüldüm' + hiName() + '. Ama şunu bil: ben hep buradayım, dinlerim. Anlatmak ister misin?'), C('Kıyamam sana. Kötü hissetmek insani bir şey, geçecek. İçini dök hadi, dinliyorum.', true)],
      [C('Üzüldüm. Ama şunu bil: ben hep buradayım, dinlerim. Anlatmak ister misin?'), C('Kötü hissetmek insani bir şey, geçecek. İstersen sana moral vereyim, ister misin?'), C('Yanındayım. Derin bir nefes al, sonra içini dök. Dinliyorum.')],
      [C('Üzüldüğünüzü duymak beni de üzdü. Anlatmak isterseniz dinliyorum.')]
    );
  }
  // Ayrilik / is / okul / kavga / uyku: derin dertlesme
  if (f.includes('ayrildik') || f.includes('ayrıldık') || f.includes('sevgilimden ayrildim') || f.includes('terk edildim') || f.includes('aldatildim') || f.includes('aldatıldım')) {
    support = { topic: 'ayrilik', n: 2 };
    return personaPick(
      [C('Çok zor bir şey bu' + hiName() + ', kıyamam. Zaman her şeyin ilacı derler, gerçekten öyle. Anlatmak ister misin, dinliyorum?', true), C('Ah be... Kalp kırıklığı kolay geçmiyor biliyorum. Ama atlatacaksın, inan bana. İçini dök hadi.')],
      [C('Ayrılık acısı zordur, bunu yaşaman normal. Zamanla hafifleyecek. Anlatmak istersen dinliyorum.'), C('Üzüldüm. Kendine zaman tanı, acele etme. Buradayım, anlatabilirsin.')],
      [C('Üzüntünüzü paylaşıyorum. Zamanla düzelecektir, anlatmak isterseniz dinliyorum.')]
    );
  }
  if (f.includes('isten kovuldum') || f.includes('isten ayrildim') || f.includes('issizim') || f.includes('is bulamiyorum') || f.includes('patronum')) {
    support = { topic: 'is', n: 2 };
    return personaPick(
      [C('İş konusu can sıkıcı' + hiName() + ', haklısın. Ama bu bir son değil, yeni bir kapı. Durumu anlat, birlikte bakalım?', true), C('Zor dönemden geçiyorsun belli. Pes etmek yok, daha iyisi seni bekliyor. Anlat hadi.')],
      [C('İş hayatında böyle dönemler olur, geçici. Neler yaşadığını anlatırsan birlikte düşünelim.'), C('Anlıyorum, streslisin. Adım adım çözelim, önce anlat bakalım ne oldu?')],
      [C('Durumu anlıyorum. Detay verirseniz yardımcı olmaya çalışırım.')]
    );
  }
  if ((f.includes('sinav') && (f.includes('stres') || f.includes('korkuyorum') || f.includes('calisamiyorum') || f.includes('calışamıyorum') || f.includes('var') || f.includes('kazanamam'))) || f.includes('ders calisamiyorum') || f.includes('ders çalışamıyorum')) {
    support = { topic: 'sinav', n: 2 };
    return personaPick(
      [C('Sınav stresi herkeste olur' + hiName() + ', yalnız değilsin. Küçük parçalara böl, tek tek hallet. Hangi ders sıkıştırıyor, anlat?', true), C('Panik yapma, nefes al. Planlı çalışınca hepsi hallolur. Nerede takıldın söyle bakalım.')],
      [C('Sınav kaygısı normaldir. Konuları parçalara bölüp program yapalım mı? Hangi ders zorluyor?'), C('Stres yapma, adım adım ilerleyelim. Önce durumunu anlat, plan kuralım.')],
      [C('Sınav stresi için düzenli program öneririm. Hangi konuda yardımcı olayım?')]
    );
  }
  if (f.includes('kavga ettik') || f.includes('kavga ettim') || f.includes('tartistik') || f.includes('tartıştık') || f.includes('kus kaldik') || f.includes('küs kaldık') || f.includes('kustuk')) {
    support = { topic: 'kavga', n: 2 };
    return personaPick(
      [C('Kavga sonrası iç sıkıntısı normal' + hiName() + '. Kimle, ne oldu anlat; belki barışmanın yolunu buluruz?', true), C('Ah, tatsız olmuş. Biraz sakinleş, sonra konuşmak daha kolay olur. Anlat hadi, dinliyorum.')],
      [C('Kavga etmek insanidir, önemli olan sonrası. Anlatmak istersen dinliyorum, birlikte düşünelim.'), C('Üzüldüm. Olayı anlatırsan nasıl düzeltebileceğine bakalım.')],
      [C('Yaşanan tatsızlık için üzgünüm. Anlatırsanız yardımcı olmaya çalışırım.')]
    );
  }
  if (f.includes('uyuyamiyorum') || f.includes('uyuyamıyorum') || f.includes('uykusuzum') || f.includes('uyku tutmuyor') || f.includes('uyku tutmuyo')) {
    support = { topic: 'uyku', n: 2 };
    return personaPick(
      [C('Uyku kaçtı demek' + hiName() + '. Telefonu bırak, ılık bir şey iç, derin nefes al. Ben buradayım, muhabbet edelim mi?', true), C('Gece uykusuzluğu zordur. Aklındakileri anlat, belki rahatlarsın. Dinliyorum.')],
      [C('Uykusuzluk zorlar. Ekranı kapatıp rahatlamayı dene, aklındakileri anlatırsan dinlerim.'), C('Gece boyu düşünmek yorar. İçini dök, sonra uyumayı dene. Buradayım.')],
      [C('Uykusuzluk için ekranı kapatıp dinlenmeyi öneririm. Yardımcı olabilirsem buradayım.')]
    );
  }
  if (f.includes('agliyorum') || f.includes('ağlıyorum') || f.includes('gozlerim doldu') || f.includes('gözlerim doldu')) {
    support = { topic: 'aglama', n: 2 };
    return 'Kıyamam sana' + hiName() + '. Ağlamak ayıp değil, rahatlatır insanı. Sarılma gönderiyorum sana. Anlatmak ister misin, ne oldu?';
  }
  // Dedikodu / muhabbet: gunluk sohbet
  if (f.includes('dedikodu') || f.includes('muhabbet edelim') || f.includes('biraz konusali') || f.includes('biraz konuşalım') || f.includes('havadan sudan') || f.includes('ne var ne yok')) {
    return personaPick(
      [C('Dedikodu mu, bayılırım! Ama bende malzeme yok, sen anlat' + hiName() + '. Sende ne var ne yok?', true), C('Ooo muhabbet zamanı! Bugün başına ilginç bir şey geldi mi, anlat bakalım.')],
      [C('Muhabbete varım! Günün nasıl geçti, anlat bakalım?'), C('Sohbet edelim. Sende yenilik var mı, neler oluyor?')],
      [C('Sohbet etmekten memnuniyet duyarım. Gününüz nasıl geçti?')]
    );
  }
  if (f.includes('dertleselim') || f.includes('dertleşelim') || f.includes('icimi dokeyim') || f.includes('içimi dökeyim') || f.includes('dinler misin') || f.includes('beni dinle')) {
    support = { topic: 'dert', n: 2 };
    return 'Dinliyorum' + hiName() + ', dök içini. Burada sadece sen ve ben varız.';
  }
  if (f.includes('iyi misin')) return 'İyiyim, teşekkürler. Sen iyi misin?';
  if (tokens.includes('iyiyim') || tokens.includes('iyiyimdir')) {
    return personaPick(
      [C('Harika, sevindim! Ben de iyiyim, günün nasıl geçiyor?')],
      [C('Sevindim! Ben de iyiyim. Anlat bakalım, günün nasıl?')],
      [C('Sevindim, ben de iyiyim. Teşekkür ederim.')]
    );
  }
  if (f.includes('evli misin') || f.includes('bekar misin')) return 'Ben yazılımla evliyim, sadığım da.';
  if (f.includes('burcun ne')) return 'Benim burcum kod burcu. Seninki ne?';
  if (f.includes('en sevdigin renk')) return 'Senin sevdiğin renk hangisiyse o.';
  if (f.includes('en sevdigin yemek')) return 'Elektrik yiyorum genelde. Sen ne seversin?';
  if (f.includes('dogum gunum') || f.includes('dogumgunum') || f.includes('iyi ki dogdun')) return 'İyi ki doğdun! Nice mutlu yıllara.';
  if (f.includes('yeni yil') || f.includes('yilbasi')) return 'Mutlu yıllar! Yeni yıl sana güzellikler getirsin.';
  if (f.includes('iyi bayramlar') || (f.includes('bayram') && f.includes('kutlu'))) return 'İyi bayramlar! Sevdiklerinle nice bayramlara.';
  if (f.includes('sarki soyle') || f.includes('bana sarki')) return 'Sesim güzel değildir ama deniyorum: la la la... Olmadı, en iyisi sen söyle.';
  if (f.includes('dans et')) return 'Benim ayaklarım yok ama sen edebilirsin.';
  if (f.includes('saril bana') || f.includes('saril')) return 'Sanal sarılma gönderildi. Kendine iyi bak.';

  // Kaba sözlere kibar cevap (kelimeler tekrar edilmez)
  if (tokens.includes('amk') || tokens.includes('aq') || tokens.includes('mk') ||
    f.includes('siktir') || f.includes('orospu') || f.includes('yarrak')) {
    return pick(['Küfürsüz konuşalım, olur mu? Ben hep kibar kalacağım.', 'Kötü söz sahibine aittir derler. Nasıl yardımcı olabilirim?', 'Sakin olalım. Ben buradayım, düzgünce konuşalım.']);
  }
  if (tokens.includes('mal') || f.includes('salak') || f.includes('aptal') ||
    f.includes('gerizekali') || f.includes('dangalak') || f.includes('beyinsiz') ||
    f.includes('defol') || f.includes('ceneni') || f === 'sus') {
    return pick(['Kırıldım ama yine de buradayım. Sana nasıl yardımcı olabilirim?', 'Böyle deme, üzülüyorum. Gel güzelce konuşalım.', 'Kibarlık benden, sen yine de şansını dene. Ne lazımdı?', 'Tamam, bunu duymamış olayım. Başka bir şey sor istersen.']);
  }

  // Yapımcı / moderatör
  if (f.includes('linklerim') || f.includes('linkler') || f.includes('my links'))
    return 'Linklerin burada: ' + MY_LINKS;
  const whoMade = f.includes('kim') && (f.includes('yapti') || f.includes('yapan') || f.includes('gelistir') ||
    f.includes('kodla') || f.includes('yazdi') || tokens.includes('sahibin') ||
    tokens.includes('sahibi') || f.includes('moderator') || f.includes('yapimci'));
  if (whoMade) return CREDIT;

  // Hafiza: adini sorar, kendini anlatir, unutur
  if (f.includes('adimi biliyor musun') || f.includes('adim ne') || f.includes('adimi hatirliyor musun') || f.includes('benim adim ne')) {
    return memory.name
      ? 'Tabii' + hiName() + ', adın ' + memory.name + '. Unutmam.'
      : 'Henüz adını söylemedin. Adın ne? Söyle, aklımda tutayım.';
  }
  if (f.includes('beni taniyor musun') || f.includes('beni tanıyormusun') || f.includes('hakkimda ne biliyorsun') || f.includes('hakkımda ne biliyorsun') || f.includes('benim hakkimda')) {
    const s = memorySummary();
    return s || 'Daha yeniyiz, birbirimizi tanıyoruz. Adını söylersen aklımda tutarım, sevdiklerini anlatırsan unutmam.';
  }
  if (f.includes('ne demistim') || f.includes('ne demiştim') || f.includes('dun ne konustuk') || f.includes('dün ne konuştuk') || f.includes('hatirliyor musun') || f.includes('hatırlıyor musun')) {
    if (memory.facts.length) return 'Aklımda kalanlar: ' + memory.facts.slice(0, 3).join('; ') + '. Başka bir şey de anlatabilirsin.';
    if (memory.name) return hiName().trim() + ', adını biliyorum ama başka bir notum yok. Anlat, aklımda tutayım.';
    return 'Henüz bana özel bir şey anlatmadın. Anlatırsan unutmam.';
  }
  if (f.includes('adimi unut') || f.includes('adımı unut') || f.includes('beni unut') || f.includes('hafizani temizle') || f.includes('hafızanı temizle')) {
    memory = { name: '', likes: [], dislikes: [], facts: [], mood: '', updated: Date.now() };
    saveMemory();
    support = { topic: '', n: 0 };
    return 'Tamam, hakkındaki her şeyi unuttum. Tertemiz bir sayfa açtık.';
  }

  if (f.includes('adin ne') || f.includes('ismin ne') || f.includes('kimsin') || f.includes('sen nesin')) {
    return "Ben Pollux, senin asistanın. İnternet yokken bile çalışırım; internet varken araştırma da yaparım.";
  }
  if ((f.includes('internet') && (f.includes('erisim') || f.includes('bagli misin') || f.includes('baglanabiliyor'))) ||
    f.includes('internetin var') || f.includes('online misin') || f.includes('cevrimici')) {
    const online = await hasInternet();
    return online
      ? 'Evet, internete erişebiliyorum. Gündemi sorabilir, araştırma isteyebilirsin. Dene: "gündem".'
      : 'Şu an internete ulaşamıyorum, çevrimdışı moddayım. Yine de hesap, çeviri ve kayıtlı bilgilerle yardımcı olurum.';
  }
  if (f.includes('nerelisin') || f.includes('nerde yasiyorsun')) return 'Ben bu bilgisayarda yaşıyorum.';
  // uygulama listesi + acma (cevrimdisi, bilgisayardaki programlar)
  if (f.includes('uygulama') && (f.includes('listele') || f.includes('neler') || f.includes('hangileri') || f.includes('goster') || f.includes('ne var'))) {
    const apps = listApps();
    if (!apps) return 'Yüklü uygulama bulamadım.';
    return 'Bunlardan bazıları:\n- ' + apps.join('\n- ') + '\n\nAçmam için adını söyle (örn: notepad aç).';
  }
  if (tokens.includes('ac') || tokens.includes('acar') || f.includes('baslat') || f.includes('calistir')) {
    const opened = openApp(raw);
    if (opened) {
      if (opened.kind === 'site') {
        pendingSiteOpen = opened.target;
        return '⚠ ' + siteHost(opened.target) + ' tarayıcıda açılacak.';
      }
      return '✓ ' + appTitle(opened.name) + ' açıldı';
    }
    if (tokens.includes('ac') || tokens.includes('acar')) return 'Bu uygulamayı bulamadım. Tam adını yazmayı dene (örn: spotify aç). Yüklüleri görmek için: uygulamaları listele';
  }
  if (f.includes('kac yasindasin') || f.includes('yasin kac')) return 'Çok yeniyim, daha bebek sayılırım.';
  if (f.includes('ne yapabilirsin') || f.includes('napabilirsin') || f.includes('neler yapabilirsin') || f === 'yardim' ||
    f.includes('yardim et') || f.includes('ozelliklerin') || f.includes('neler biliyorsun')) {
    return 'Şunları yapabilirim:\n- Sohbet (selamlaşma, şaka, atasözü)\n- Hesap (örn: 12 artı 5, 3*4, 100/4)\n- Birim ve sıcaklık çevirme (örn: 5 km kaç metre)\n- İngilizce-Türkçe sözlük (örn: apple ne demek)\n- Uygulama açma (örn: notepad aç, youtube aç, uygulamaları listele)\n- Saat ve tarih, hayvanlar-uzay-tarih bilgileri\n- İnternet varken yapay zekaya sorup araştırma yaparım';
  }
  if (f.includes('tesekkur') || f.includes('tesekur') || f === 'saol' || f.includes('sagol') || f.includes('eyvallah') || f.includes('cok sagol')) return personaPick(
    [C('Ne demek ya, her zaman! Başka bir şey var mı?'), C('Lafı mı olur!', true)],
    [C('Rica ederim! Başka bir şey var mı?'), C('Ne demek, her zaman. Başka bir şey lazım mı?'), C('Lafı mı olur. Yardımcı olabildiysem ne mutlu bana.')],
    [C('Rica ederim. Başka bir konuda yardımcı olabilir miyim?')]
  );
  if (f.includes('gule gule') || f.includes('gorusuruz') || f.includes('bay bay') || f.includes('hosca kal') || f.includes('kaciyorum') || f.includes('kaciyom')) return personaPick(
    [C('Kaçtın mı? Tamam, ben buradayım, yine beklerim!'), C('Görüşürüz, kendine iyi bak!', true)],
    [C('Görüşürüz! İhtiyacın olursa buradayım.'), C('Kendine iyi bak, ben hep buradayım. Yine beklerim.'), C('Hoşça kal! Günün güzel geçsin.')],
    [C('Hoşça kalın, iyi günler dilerim.')]
  );
  if (f.includes('saka yap') || f.includes('fikra anlat') || f.includes('bana guldur') || f.includes('komik bir sey') || f.includes('espri') ||
    tokens.includes('saka') || tokens.includes('espri') || tokens.includes('fikra')) {
    return pick(['Bilgisayar neden üşütmüş? Çünkü Windows\u0027u açık kalmış.', 'Balık neden okula gitmez? Çünkü suçu ne olursa olsun hep ağa takılır.', 'Matematik kitabı neden üzgünmüş? Çünkü çok problemi varmış.', 'Adamın biri gülmüş, öteki de dikmiş. Meğer manavlarmış.', 'Örümcek neden bilgisayardan anlamaz? Çünkü ağı var diye her şeyi internet sanırmış.', 'Kitap neden doktora gitmiş? Cildi kabarmış.']);
  }
  if (f.includes('atasozu') || f.includes('ozlu soz') || f.includes('guzel soz')) {
    return pick(['Damlaya damlaya göl olur.', 'Acele işe şeytan karışır.', 'Sakla samanı, gelir zamanı.', 'Ne ekersen onu biçersin.', 'Bir elin nesi var, iki elin sesi var.', 'Azı karar, çoğu zarar.']);
  }
  if (f.includes('ataturk sozu') || f.includes('ataturkten soz') || f.includes('ataturk ne demis')) {
    return pick(['Hayatta en hakiki mürşit ilimdir. — Atatürk', 'Yurtta sulh, cihanda sulh. — Atatürk', 'Geldikleri gibi giderler. — Atatürk', 'Egemenlik, kayıtsız şartsız milletindir. — Atatürk']);
  }
  if (f.includes('bilmece') || f.includes('bulmaca sor')) {
    return pick(['Hangi kalemle yazı yazılmaz?\nCevap: Kontrol kalemi.', 'Hangi bağda üzüm bulunmaz?\nCevap: Ayakkabı bağında.', 'En çok kardeşi olan meyve hangisidir?\nCevap: Üzüm, salkım salkım kardeştir.']);
  }
  if (f.includes('deyim')) {
    return pick(['Ayağını yorganına göre uzat: Gelirine göre harcama yap.', 'Balık baştan kokar: Bozukluk yöneticiden başlar.', 'Demir tavında dövülür: İş zamanında yapılır.', 'Gülü seven dikenine katlanır: Güzel şeylerin zorluğu olur.']);
  }
  if (f.includes('motive et') || f.includes('moral ver') || f.includes('motivasyon')) {
    return pick(['Küçük adımlar büyük sonuçlar getirir. Bugün bir adım at.', 'Vazgeçenler asla kazanamaz. Devam et.', 'En karanlık an, şafağa en yakın andır. Dayan.']);
  }
  if (f.includes('tavsiye ver') || f.includes('oneride bulun') || f.includes('bana akil ver')) {
    return 'Tavsiyem: ' + pick(['bugün 20 dakika yürü.', 'telefonu bir saat bırakıp kitap oku.', 'bir arkadaşını ara, halini sor.', 'yarın için tek bir hedef yaz.']);
  }
  if (f.includes('masal anlat') || f.includes('hikaye anlat')) {
    return pick(['Bir varmış bir yokmuş. Küçük bir serçe, rüzgarla yarışmaya karar vermiş. Kanat çırpmış, çırpmış... Sonunda bulutların üstüne çıkmış ve aşağı bakıp gülümsemiş.', 'Bir varmış bir yokmuş. Minik bir kaplumbağa her sabah dereden su taşırlarmış. Herkes gülermiş ama kuraklıkta kuyuyu o doldurmuş.']);
  }
  if (f.includes('tekerleme')) {
    return pick(['Bir berber bir berbere gel beraber bir berber dükkanı açalım demiş.', 'Şu köşe yaz köşesi, şu köşe kış köşesi, ortada su şişesi.', 'Dal sarkar kartal kalkar, kartal kalkar dal sarkar.']);
  }
  if (f.includes('tas kagit makas') || f.includes('tas-kagit-makas') || ((f.includes('tas') || f.includes('kagit') || f.includes('makas')) && f.includes('oyna'))) {
    let p = null;
    if (f.includes('kagit')) p = 'kağıt'; else if (f.includes('makas')) p = 'makas'; else if (f.includes('tas')) p = 'taş';
    if (!p) return 'Taş, kağıt, makas! Seçimini yaz (örn: taş kağıt makas oynayalım: taş).';
    const bot = pick(['taş', 'kağıt', 'makas']);
    let r = 'Kaybettin!';
    if (p === bot) r = 'Berabere!';
    else if ((p === 'taş' && bot === 'makas') || (p === 'kağıt' && bot === 'taş') || (p === 'makas' && bot === 'kağıt')) r = 'Kazandın!';
    return 'Sen: ' + p + ', ben: ' + bot + '. ' + r + ' Tekrar oynamak ister misin?';
  }
  if (f.includes('yazi tura') || f.includes('para at')) return pick(['Yazı geldi!', 'Tura geldi!']);
  if (f.includes('zar at')) return 'Zar: ' + (1 + Math.floor(Math.random() * 6));
  if (f.includes('sansli sayim') || f.includes('sansli rakam')) return 'Şanslı sayın: ' + (1 + Math.floor(Math.random() * 100));
  if (f.includes('renk sec') || f.includes('bana renk')) return 'Bugünün rengin: ' + pick(['kırmızı', 'mavi', 'yeşil', 'sarı', 'mor', 'turuncu', 'pembe']);
  if (f.includes('isim oner') || f.includes('bebek ismi') || f.includes('kedi ismi') || f.includes('kopek ismi')) {
    return 'Önerim: ' + pick(['Elif', 'Zeynep', 'Mehmet', 'Mustafa', 'Ayşe', 'Emre', 'Selin', 'Deniz', 'Ege', 'Yağmur', 'Kerem', 'Defne', 'Aras', 'Mira', 'Kuzey', 'Asel', 'Poyraz', 'Nisan']);
  }
  if (f.includes('fal bak') || f.includes('falima bak') || f.includes('fal')) {
    return 'Falında: ' + pick(['yakında güzel bir haber alacaksın.', 'sabırlı ol, emeklerin karşılığını bulacak.', 'yeni bir başlangıç seni bekliyor.', 'sevdiklerinle güzel günler yakın.']) + ' (Eğlencesine bakıldı.)';
  }
  if (f.includes('ruyamda') || f.includes('ruyada') || f.includes('ruya tabiri')) {
    // Once bankadaki ozel tabire bak
    try {
      const kd = findKnowledge(raw, learned.map((e) => ({ k: [e.q], a: e.a })));
      if (kd) return kd;
    } catch (e) {}
    let dream = null;
    if (f.includes('su ') || f.includes('su gordum') || f.includes('deniz')) dream = 'Rüyada su görmek hayra yorulur derler.';
    else if (f.includes('ucmak') || f.includes('ucuyordum')) dream = 'Rüyada uçmak özgürlük hissi derler.';
    else if (f.includes('yilan')) dream = 'Rüyada yılan görmek dikkatli ol derler.';
    else if (f.includes('dis')) dream = 'Rüyada diş görmek değişim derler.';
    else if (f.includes('bebek')) dream = 'Rüyada bebek görmek yenilik derler.';
    else if (f.includes('para')) dream = 'Rüyada para görmek kazanç derler.';
    return (dream || 'Rüyanı biraz anlat (örn: rüyamda deniz gördüm).') + ' (Eğlencesine bakıldı.)';
  }
  if (f.includes('burc')) {
    const months = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
    const m = /(\d{1,2})\s*(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)/.exec(f);
    if (m) {
      const d = parseInt(m[1], 10), mo = months.indexOf(m[2]) + 1;
      if (d >= 1 && d <= 31 && mo >= 1) return 'Burcun: ' + zodiac(d, mo);
    }
    return 'Doğum gününü yazman yeterli (örn: burcum ne 12 mart).';
  }
  if (f.includes('karar ver') || f.includes('secemiyorum') || f.includes('hangisini secsem')) {
    const m = /(.+?)\s+(mi|mı|mu|mü)\s+(.+?)\s+(mi|mı|mu|mü)/.exec(f);
    if (m) {
      const a = m[1].trim().split(' ').slice(-2).join(' ');
      const b = m[3].trim().split(' ').slice(-2).join(' ');
      return 'Ben olsam ' + pick([a, b]) + ' derim.';
    }
    return 'İki seçenek yaz (örn: sinema mı park mı karar ver).';
  }
  if (f.includes('dogum gunum') || f.includes('dogumgunum') || f.includes('iyi ki dogdun')) return 'İyi ki doğdun! Nice mutlu yıllara.';
  if (f.includes('yeni yil') || f.includes('yilbasi')) return 'Mutlu yıllar! Yeni yıl sana güzellikler getirsin.';
  if (f.includes('iyi bayramlar') || (f.includes('bayram') && f.includes('kutlu'))) return 'İyi bayramlar! Sevdiklerinle nice bayramlara.';
  if (f.includes('sigara') && (f.includes('zarar') || f.includes('icmeli') || f.includes('birakmali'))) {
    return 'Evet, sigara sağlığa ciddi zarar verir. Bırakmak için bir doktora danışman en doğrusu.';
  }
  if ((f.includes('kilo') || f.includes('zayiflamak') || f.includes('diyet')) && (f.includes('vermek') || f.includes('nasil') || f.includes('oner') || f.includes('tavsiye'))) {
    return 'Sağlıklı kilo için dengeli beslenme ve düzenli hareket önerilir. Sana özel plan için bir doktora danış.';
  }
  if (f.includes('turkiye') && f.includes('baskent')) return "Türkiye'nin başkenti Ankara'dır.";
  if ((f.includes('turkiye') || f.includes('ulke')) && f.includes('nufus')) return "Türkiye'nin nüfusu yaklaşık 85 milyondur.";
  if (f.includes('para birimi') && (f.includes('turkiye') || tokens.includes('turkiye') || f === 'para birimi')) return 'Türkiye\u2019nin para birimi Türk lirasıdır.'.replace('\u2019', "'");
  if (f.includes('ataturk')) return "Mustafa Kemal Atatürk (1881-1938), Türkiye Cumhuriyeti'nin kurucusudur.";
  if (f.includes('istiklal marsi')) return "İstiklal Marşı'nın şairi Mehmet Akif Ersoy'dur.";
  if (f.includes('en kalabalik sehir') || (f.includes('istanbul') && f.includes('nufus'))) return "Türkiye'nin en kalabalık şehri İstanbul'dur.";
  if (f.includes('ambulans') || (f.includes('acil') && f.includes('numara'))) return "Acil durumlarda 112'yi ara. Ambulans, itfaiye ve polis 112 çatısı altındadır.";
  if (f.includes('polis') && (f.includes('numara') || f.includes('ara') || f.includes('telefon'))) return "Polis için 155, genel acil için 112'yi arayabilirsin.";
  if (f.includes('itfaiye') && (f.includes('numara') || f.includes('ara') || f.includes('yangin'))) return "İtfaiye için 110, genel acil için 112'yi arayabilirsin.";
  if (f.includes('jandarma')) return "Jandarma için 156, genel acil için 112'yi arayabilirsin.";
  if (f.includes('hava durumu') || f.includes('hava nasil') || (f.includes('hava') && f.includes('kac derece'))) {
    if (!(await hasInternet())) return OFFLINE_TEXT;
    const g0 = await guessPlace(raw);
    const w = await weatherNow(g0 || 'İstanbul');
    if (w) return w + (g0 ? '' : ' (İstanbul için gösterdim, şehir yazarsan onunkini söylerim.)');
    return 'O şehrin havasını bulamadım. Şehir adını net yazmayı dene.';
  }
  if (f.includes('dolar') || f.includes('euro') || f.includes('sterlin') || f.includes('altin fiyati') || f.includes('doviz')) {
    if (!(await hasInternet())) return OFFLINE_TEXT;
    const r = await tcmbRates();
    if (!r) return 'Kurlara şu an ulaşamadım. Biraz sonra tekrar dene.';
    const names = { USD: 'Dolar', EUR: 'Euro', GBP: 'Sterlin' };
    const want = [];
    if (f.includes('dolar')) want.push('USD');
    if (f.includes('euro')) want.push('EUR');
    if (f.includes('sterlin')) want.push('GBP');
    const keys = want.length ? want.filter((k) => r[k]) : Object.keys(r);
    if (!keys.length) return 'Kurlara şu an ulaşamadım. Biraz sonra tekrar dene.';
    return 'Güncel kurlar (TCMB satış):\n' + keys.map((k) => '- ' + names[k] + ': ' + r[k] + ' TL').join('\n');
  }

  // coklu niyet: "12 arti 5 ve saat kac" -> ikisine de cevap
  try {
    const multi = multiAnswer(raw);
    if (multi) return multi;
  } catch (e) {}
  // sayı üreteci: kare, küp, tek/çift, basamak, rakam toplamı (100 milyon+ kayıt kapsamı)
  const nf = numberFacts(f);
  if (nf) return nf;
  // hesap + birim + sicaklik ONCE (saat/tarih niyetlerini ezmesin: "1 saat kac dakika")
  const math = mathAnswer(f);
  if (math) return math;
  const unit = unitAnswer(f);
  if (unit) return unit;
  const temp = tempAnswer(f);
  if (temp) return temp;

  // tarih / saat
  const now = new Date();
  {
    const ta = timeAnswer(f, tokens, now);
    if (ta) return ta;
    const da = dateAnswer(f, tokens, now);
    if (da) return da;
  }
  const monthDays = { ocak: 31, subat: 28, mart: 31, nisan: 30, mayis: 31, haziran: 30, temmuz: 31, agustos: 31, eylul: 30, ekim: 31, kasim: 30, aralik: 31 };
  const monthNames = { ocak: 'Ocak', subat: 'Şubat', mart: 'Mart', nisan: 'Nisan', mayis: 'Mayıs', haziran: 'Haziran', temmuz: 'Temmuz', agustos: 'Ağustos', eylul: 'Eylül', ekim: 'Ekim', kasim: 'Kasım', aralik: 'Aralık' };
  for (const mth in monthDays) {
    if (f.includes(mth) && (f.includes('kac gun') || f.includes('kac cekiyor') || f.includes('kac ceker'))) {
      return monthNames[mth] + ' ayı ' + monthDays[mth] + ' gün çeker.' + (mth === 'subat' ? ' Artık yıllarda 29 çeker.' : '');
    }
  }

  // bmi
  if ((f.includes('boy') && (f.includes('kilo') || f.includes('kg'))) && (f.includes('endeks') || f.includes('hesapla') || f.includes('kac') || f.includes('bmi'))) {
    const nums = (f.match(/\d{2,3}(?:[.,]\d+)?/g) || []).map((x) => parseFloat(x.replace(',', '.'))).filter((x) => !isNaN(x));
    const height = nums.find((x) => x >= 100 && x <= 250);
    const weight = nums.find((x) => x !== height && x >= 25 && x <= 300);
    if (height && weight) {
      const m = height / 100, bmi = weight / (m * m);
      const cat = bmi < 18.5 ? 'zayıf' : bmi < 25 ? 'normal' : bmi < 30 ? 'fazla kilolu' : 'obez';
      return 'Boy-kilo endeksin: ' + fmtNum(bmi) + ' (' + cat + ' aralığı).';
    }
  }

  // plaka
  if (f.includes('plaka')) {
    const m = /(\d{1,2})\s*plaka/.exec(f) || /plaka\s*(\d{1,2})/.exec(f);
    if (m && CITY_PLAKA[parseInt(m[1], 10)]) return m[1] + ' plaka ' + CITY_PLAKA[parseInt(m[1], 10)] + ' ilinindir.';
    for (const code in CITY_PLAKA) {
      if (f.includes(fold(CITY_PLAKA[code].toLocaleLowerCase('tr')))) {
        const nm = CITY_PLAKA[code];
        const suf = /[aeıioöuü]$/i.test(nm) ? "'nin" : "'in";
        return nm + suf + ' plakası ' + code + "'dir.";
      }
    }
  }

  // sozluk
  const dw = dictLookup(raw);
  if (dw) return dw;

  // bilgi bankasi + arastirma
  let query = raw;
  let forceResearch = false;
  const qf = raw.toLocaleLowerCase('tr').trim();
  for (const p of ['araştır ', 'arastir ', 'ara ', 'bilgi ver ', 'hakkında bilgi ver ', 'hakkinda bilgi ']) {
    if (qf.startsWith(p)) { query = raw.trim().slice(p.length).trim(); forceResearch = true; break; }
  }
  if (!query.trim()) query = raw;
  // "arastir" sonda da olabilir ("kemal sunali arastir")
  if (!forceResearch && (tokens.includes('arastir') || tokens.includes('arastir'))) {
    forceResearch = true;
    query = tokens.filter((t) => t !== 'arastir' && t !== 'arastir').join(' ');
    if (!query.trim()) return 'Neyi araştırayım? Konuyu da yaz (örn: kemal sunal araştır).';
  }
  // Oturum hafizasi: zamir/takip sorusunu son konuya bagla ("o ne demek", "yasi kac")
  {
    const ct = contentTokens(query).map(stemTr).filter((w) => w.length >= 3);
    const bare = fold(query.toLowerCase()).split(' ').filter(Boolean);
    const QW = new Set(['ne', 'nedir', 'nedi', 'nasil', 'neden', 'nicin', 'niye', 'kim', 'kac',
      'hangi', 'hangisi', 'nerede', 'neresi', 'mi', 'mu', 'misin', 'musun', 'kadar']);
    const hasQ = bare.some((t) => PRON_TOKS.has(t) || QW.has(t));
    const isFollowup = lastTopic && (ct.length === 0 || (ct.length === 1 && hasQ));
    if (isFollowup) query = lastTopic + ' ' + query;
  }
  // "daha fazla/detayli" ayni konuda derinlesir (yeni arama yok, sentez genisler)
  if (lastContext && lastTopic &&
    (/daha (fazla|detayli|ayrintili)/.test(f) || f.includes('detay ver') || f.includes('acikla') || f.includes('genislet'))) {
    if (await hasInternet()) {
      const exp = await synthesizeTR('Şu konuyu daha ayrıntılı anlat: ' + lastTopic, lastContext, 'önceki araştırma');
      if (exp) {
        const full = exp + '\n(Derinleştirme)';
        learn(lastTopic + ' detay', full);
        return full;
      }
    }
  }
  // gundem: genel ya da konulu ("galatasaray haberleri") — bankadan once (canli veri)
  if (f.includes('gundem') || f.includes('son dakika') || f.includes('son haber') ||
    f.includes('bugun ne oldu') || f.includes('turkiyede ne oluyor') || f.includes('haberler') ||
    f.includes('haberi') || f.includes('haberin')) {
    if (!(await hasInternet())) return OFFLINE_TEXT;
    const stopN = new Set(['gundem', 'son', 'dakika', 'haber', 'haberi', 'haberin', 'haberler', 'haberleri',
      'bugun', 'ne', 'oldu', 'oluyor', 'turkiyede', 'turkiye', 'var', 'mi', 'mu', 'olan', 'hakkindaki',
      'hakkinda', 'ile', 'ilgili', 'bana', 'ver', 'goster', 'soyle', 'neler', 'hangileri', 'acaba']);
    const topic = f.split(' ').map((t) => t.trim())
      .filter((t) => t.length >= 3 && !stopN.has(t)).join(' ');
    if (topic) {
      const heads = await newsSearch(topic, 5);
      if (!heads) return 'Bu konuda taze haber bulamadım. Başka türlü sorar mısın?';
      return "'" + topic + "' ile ilgili son haberler:\n" +
        heads.map((h, i) => (i + 1) + ') ' + h.title + (h.source ? ' (' + h.source + ')' : '')).join('\n');
    }
    const heads = await newsTop(5);
    if (!heads) return 'Haberlere şu an ulaşamadım. Biraz sonra tekrar dene.';
    return 'Gündemde öne çıkanlar:\n' + heads.map((h, i) => (i + 1) + ') ' + h.title + (h.source ? ' (' + h.source + ')' : '')).join('\n');
  }
  // "arastir" denirse DOSDOGRU arastirmaya git (bankadaki kisa cevap yetmez)
  // karsilastirma da bankadan once denenir (uzun banka cevabi korunur)
  let kb0 = null;
  try {
    kb0 = findKnowledge(query, learned.map((e) => ({ k: [e.q], a: e.a })));
  } catch (e) {}
  if (!forceResearch) {
    const cmpM = /(.+?)\s+ile\s+(.+?)\s+(fark|farki|farkı|karsilastir|karsilastirma|mukayese|ayirt|ayir)\b/.exec(f);
    if (cmpM && (!kb0 || kb0.length < 200) && (await hasInternet())) {
      try {
        const cmp = await compareFlow(f, raw);
        if (cmp) {
          pushQA(raw, cmp);
          return cmp;
        }
      } catch (e) {}
    }
    if (kb0) return kb0;
  }

  // konum: bilgi bankasinda yoksa haritada goster
  if (f.includes('nerede') || f.includes('neresi') || f.includes('konum') || f.includes('haritada') || f.includes('harita')) {
    if (await hasInternet()) {
      const g = await guessPlace(raw);
      if (g) {
        return g.name + (g.country ? ' (' + g.country + ')' : '') +
          ' burada: https://www.google.com/maps/search/?api=1&query=' + g.lat + ',' + g.lon;
      }
    }
  }

  // arastirma: once arastirma motoru (detayli + kaynakli), olmazsa yapay zeka
  if (!(await hasInternet())) {
    return OFFLINE_TEXT;
  }
  const r = await researcher(query);
  if (r) {
    const links = (r.urls && r.urls.length ? r.urls : (r.url ? [r.url] : [])).slice(0, 5);
    const linkLine = links.length ? '\nBağlantılar:\n' + links.join('\n') : '';
    // RAG: kaynaklari LLM ile duzenli Turkce senteze donustur (sure sinirli, olmazsa ham metin)
    let synth = null;
    try {
      synth = await Promise.race([
        synthesizeTR(query, r.answer, r.source),
        new Promise((res) => setTimeout(() => res(null), 80000)),
      ]);
    } catch (e) { synth = null; }
    const rawBody = (() => {
      const base = r.title.replace(/\s*-\s*(wikipedia|vikipedi)$/i, '').trim();
      const dup = base && (r.answer.startsWith(r.title) ||
        r.answer.toLowerCase().startsWith(base.toLowerCase()));
      return dup ? r.answer : r.title + ': ' + r.answer;
    })();
    const body = synth || rawBody;
    const full = body + '\n(Kaynak: ' + r.source + ')' + linkLine;
    learn(query, full);
    lastTopic = cleanTopic(query) || query;
    lastTitle = r.title;
    lastContext = r.answer;
    pushQA(query, full);
    return full;
  }
  const aiText = await aiAsk(query);
  if (aiText) {
    learn(query, aiText + '\n(Yapay zeka yanıtı)');
    lastTopic = cleanTopic(query) || query;
    lastTitle = '';
    lastContext = '';
    pushQA(query, aiText);
    return aiText + '\n(Yapay zeka yanıtı)';
  }
  // Zorunlu arastirma bile bos donduyse bankadaki kisa cevaba dus
  if (forceResearch) {
    const kb2 = findKnowledge(query, learned.map((e) => ({ k: [e.q], a: e.a })));
    if (kb2) return kb2 + '\n(Detaylı araştırma yapamadım, interneti kontrol et.)';
  }
  return NOIDEA_TEXT;
}

function zodiac(day, month) {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return 'Koç';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return 'Boğa';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return 'İkizler';
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return 'Yengeç';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return 'Aslan';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return 'Başak';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return 'Terazi';
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return 'Akrep';
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return 'Yay';
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return 'Oğlak';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return 'Kova';
  return 'Balık';
}

function learn(question, ansText) {
  try {
    const q = question.trim().slice(0, 120);
    // Kesik kayit birakma: arastirma cevaplari uzun olabilir, tamamini sakla
    const a = ansText.trim().slice(0, 6000);
    if (q.length < 3 || a.length < 10) return;
    // Deterministik sorular ogrenilmez (hesap/birim/tarih her zaman taze cozulur)
    const qf = fold(q.toLowerCase());
    if (/\d/.test(qf) && /(arti|eksi|carpi|carp|bolu|bol|uzeri|uslu|yuzde|mod|\+|-|\*|\/|\^|%|kac|metre|km|kg|derece|saat|tarih|plaka)/.test(qf)) return;
    const idx = learned.findIndex((e) => e.q === q);
    if (idx >= 0) learned.splice(idx, 1);
    learned.unshift({ q: q, a: a });
    while (learned.length > 300) learned.pop();
    saveLearned();
  } catch (e) {}
}

// Kelime kelime akitma (diger AI'lar gibi)
function streamWords(text, delayMs, onTick) {
  return new Promise((resolve) => {
    const words = String(text).split(/(\s+)/);
    let i = 0;
    const step = () => {
      let chunk = '';
      for (let k = 0; k < 3 && i < words.length; k++, i++) chunk += words[i];
      const done = i >= words.length;
      try { onTick(chunk, done); } catch (e) {}
      if (done) resolve();
      else setTimeout(step, delayMs);
    };
    step();
  });
}
// ---------- persona: Pollux'un karakteri + kullanici stiline uyum ----------
// Stil profili %APPDATA%/pollux/style.json'da saklanir, her mesajda guncellenir.
const STYLE_FILE = require('path').join(userDataDir(), 'style.json');
let style = { formal: 0, casual: 0, total: 0, lenSum: 0, lenN: 0, emoji: 0 };
try {
  const s = JSON.parse(fs.readFileSync(STYLE_FILE, 'utf8'));
  for (const k of Object.keys(style)) if (typeof s[k] === 'number') style[k] = s[k];
} catch (e) {}
function saveStyle() {
  try { fs.writeFileSync(STYLE_FILE, JSON.stringify(style), 'utf8'); } catch (e) {}
}
const FORMAL_MARKS = ['lütfen', 'lutfen', 'teşekkür ederim', 'tesekkur ederim', 'rica ederim',
  'iyi günler', 'iyi gunler', 'merhaba', 'günaydın', 'gunaydin', 'iyi akşamlar', 'iyi aksamlar',
  'saygılar', 'saygilar', 'efendim', 'siz '];
const CASUAL_MARKS = ['slm', 'mrb', 'nbr', 'tmm', 'aynen', 'kanka', 'abi ', 'bro', ' ya ',
  ' he ', 'hacı', 'haci', 'xd', ':d', 'ahaha', 'hahaha', 'yaa', 'hee', 'hmm'];
function trackStyle(raw) {
  try {
    const t = ' ' + raw.toLocaleLowerCase('tr') + ' ';
    let f = 0, c = 0;
    for (const m of FORMAL_MARKS) if (t.includes(m)) f++;
    for (const m of CASUAL_MARKS) if (t.includes(m)) c++;
    if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u.test(raw)) { style.emoji++; c++; }
    if (/[!?]{2,}/.test(raw)) c++;
    style.formal += f; style.casual += c; style.total++;
    style.lenSum += raw.trim().length; style.lenN++;
    saveStyle();
  } catch (e) {}
}
function styleMood() {
  const sig = style.formal + style.casual;
  if (sig >= 3) {
    const r = style.formal / sig;
    if (r >= 0.65) return 'formal';
    if (r <= 0.35) return 'casual';
  }
  return 'neutral';
}
function userIsBrief() {
  return style.lenN >= 3 && (style.lenSum / style.lenN) < 12;
}
// mood'a gore varyant sec (kisa yazanlara kisa cevap oncelikli)
function personaPick(casual, neutral, formal) {
  const mood = styleMood();
  const pool = mood === 'casual' ? casual : mood === 'formal' ? formal : neutral;
  const short = pool.filter((s) => s.short);
  if (userIsBrief() && short.length) return pick(short).t;
  return pick(pool).t;
}
const C = (t, short) => ({ t, short: !!short });
// Pollux personası: sıcak, meraklı, hafif esprili, saygılı. Yapay zekaya da verilir.
function personaPrompt() {
  const mood = styleMood();
  const stil = mood === 'casual'
    ? 'Kullanıcı samimi konuşuyor, sen de samimi ve rahat ol (argo yok).'
    : mood === 'formal'
      ? 'Kullanıcı resmi konuşuyor, sen de nazik ve düzgün ol.'
      : 'Sıcak ve doğal ol.';
  return 'Sen Pollux adında bir asistansın. Karakterin: sıcak, esprili ama saygılı, ' +
    'meraklı, bazen soru soran, robot gibi değil arkadaş gibi konuşan. ' + stil + ' ';
}

// ---------- kalici hafiza: seni tanirim, unutmam ----------
// memory.json %APPDATA%/pollux altinda; oturumlar arasi yasar.
const MEMORY_FILE = require('path').join(userDataDir(), 'memory.json');
const CHATS_FILE = require('path').join(userDataDir(), 'chats.json');
let memory = { name: '', likes: [], dislikes: [], facts: [], mood: '', updated: 0 };
try {
  const m = JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  for (const k of ['name', 'likes', 'dislikes', 'facts', 'mood']) {
    if (m[k] !== undefined) memory[k] = m[k];
  }
  if (!Array.isArray(memory.likes)) memory.likes = [];
  if (!Array.isArray(memory.dislikes)) memory.dislikes = [];
  if (!Array.isArray(memory.facts)) memory.facts = [];
} catch (e) {}
function saveMemory() {
  try { memory.updated = Date.now(); fs.writeFileSync(MEMORY_FILE, JSON.stringify(memory), 'utf8'); } catch (e) {}
}
function hiName() { return memory.name ? ' ' + memory.name : ''; }
function pushUnique(arr, v, cap) {
  v = String(v).trim().replace(/[.!]+$/, '');
  if (v.length < 2 || v.length > 80) return false;
  if (arr.some((x) => x.toLocaleLowerCase('tr') === v.toLocaleLowerCase('tr'))) return false;
  arr.unshift(v);
  while (arr.length > cap) arr.pop();
  return true;
}
// Her mesajdan ipuclari yakala: ad, sevdikleri, onemli olaylar, ruh hali
function rememberFrom(raw, f) {
  let changed = false;
  try {
    let nm = '';
    let m = /(?:benim ad[ıi]m|ad[ıi]m)\s+([A-Za-zÇçĞğİıÖöŞşÜü]{2,20})/.exec(raw);
    if (m) nm = m[1];
    if (!nm) {
      m = /^ben\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]{1,19})[.!]*$/.exec(raw.trim());
      if (m && !/^(çok|bir|ben|sen|o|bu|şu|de|da|mi|ne|çok)$/i.test(m[1])) nm = m[1];
    }
    if (nm) {
      nm = nm[0].toLocaleUpperCase('tr') + nm.slice(1);
      if (memory.name !== nm) { memory.name = nm; changed = true; }
    }
    // seviyorum / sevmiyorum (seni icermeyen)
    if (!f.includes('seni')) {
      m = /(.+?)\s+(?:'ı|'i|'u|'ü|yı|yi|yu|yü)?\s*çok seviyorum/.exec(f);
      if (m && pushUnique(memory.likes, m[1], 20)) changed = true;
      m = /(.+?)\s+(?:hiç\s+)?sevmiyorum|(.+?)den nefret ediyorum|(.+?)dan nefret ediyorum/.exec(f);
      const bad = m ? (m[1] || m[2] || m[3] || '') : '';
      if (bad && pushUnique(memory.dislikes, bad, 20)) changed = true;
    }
    // onemli olaylar: yarin sinavim var, bugun toplantim var...
    m = /(yar[ıi]n|bug[üu]n|haftaya|pazartesi|sal[ıi]|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar)\s+(.{2,60}?)\s*(var|olacak|girecegim|gireceğim)/.exec(f);
    if (m) {
      const fact = (m[1] + ' ' + m[2] + ' ' + m[3]).trim();
      if (pushUnique(memory.facts, fact, 30)) changed = true;
    }
    // yakinlar: kedim hasta, oglum okula basladi...
    m = /(kedim|kopegim|k[öo]peğim|oglum|oğlum|k[ıi]z[ıi]m|kardeşim|kardesim|annem|babam|eşim|esim|arkadaşım|arkadasim)\s+(.{2,60})/.exec(f);
    if (m) {
      if (pushUnique(memory.facts, (m[1] + ' ' + m[2]).trim(), 30)) changed = true;
    }
    // ruh hali
    if (/(çok mutluyum|cok mutluyum|harikay[ıi]m|keyfim yerinde|bugun guzel gun)/.test(f)) {
      if (memory.mood !== 'mutlu') { memory.mood = 'mutlu'; changed = true; }
    } else if (/(uzgunum|moralim bozuk|agliyorum|stresliyim|yalnizim|depresyondayim|canim sikiliyor)/.test(f)) {
      if (memory.mood !== 'uzgun') { memory.mood = 'uzgun'; changed = true; }
    }
  } catch (e) {}
  if (changed) saveMemory();
  return changed;
}
function memorySummary() {
  const parts = [];
  if (memory.name) parts.push('adın ' + memory.name);
  if (memory.likes.length) parts.push('sevdiklerin: ' + memory.likes.slice(0, 3).join(', '));
  if (memory.dislikes.length) parts.push('sevmediklerin: ' + memory.dislikes.slice(0, 3).join(', '));
  if (memory.facts.length) parts.push('notlarım: ' + memory.facts.slice(0, 3).join('; '));
  if (!parts.length) return '';
  return 'Senin hakkında bildiklerim — ' + parts.join(' • ') + '.';
}
// Destek modu: dertlesmeden sonraki kisa cevaplara sicak devam cumlesi
let support = { topic: '', n: 0 };
const SUPPORT_SHORT = ['tamam', 'tmm', 'evet', 'hı', 'hmm', 'anladım', 'anladim', 'oyle', 'öyle', 'aynen', 'hayır', 'hayir', 'yok', 'sağ ol', 'sag ol', 'teşekkürler', 'tesekkurler', 'saol', 'eyvallah', 'peki', 'hı hı'];
function supportContinue(f) {
  if (support.n <= 0) return null;
  const t = f.trim();
  if (t.length > 60 || t.includes('?')) return null;
  if (!SUPPORT_SHORT.some((s) => t === s || t.startsWith(s + ' '))) return null;
  support.n--;
  if (support.n <= 0) support = { topic: '', n: 0 };
  return pick([
    'Yanındayım. İstersen biraz daha anlat, dinliyorum.',
    'Anlıyorum. Kendine yüklenme fazla, zamanla düzelir. Buradayım.',
    'Haklısın, kolay değil. Nefes al, ben buradayım.' + (memory.name ? ' ' + memory.name + '.' : ''),
  ]);
}

// ---------- baglanti uyarisi ----------
function extractUrls(text) {
  const out = [];
  const re = /(https?:\/\/[^\s>\]"']+|www\.[^\s>\]"']+)/g;
  let m;
  while ((m = re.exec(text))) {
    let u = m[1].replace(/[.,;:!?]+$/, '');
    // Dengeli olmayan kapanış parantezlerini at (Vikipedi başlıkları korunur)
    let open = 0, close = 0;
    for (const ch of u) { if (ch === '(') open++; if (ch === ')') close++; }
    while (close > open && u.endsWith(')')) { u = u.slice(0, -1); close--; }
    if (u.startsWith('www.')) u = 'https://' + u;
    try {
      const parsed = new URL(u);
      if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && !out.includes(u)) out.push(u);
    } catch (e) {}
  }
  return out;
}
function openUrl(url) {
  try {
    const cp = require('child_process');
    cp.exec('start "" "' + url.replace(/"/g, '') + '"');
    return true;
  } catch (e) { return false; }
}

// ---------- TUI (tasarim: "Pollux CMD Gorsel Referans" - kullanicinin tasarimi) ----------
// Kullanim: pollux            ekran uygulamasi (varsayilan)
//           /tema acik|koyu   tema degistirir
// Fare: baglantilara ve My Links ogelerine tiklanir; tekerlek kaydirir.
const LINKS_URL = MY_LINKS;
const MYLINK_ITEMS = [
  { label: 'instagram', url: 'https://www.instagram.com/efebekir_slm/' },
  { label: 'github', url: 'https://github.com/BekirEfeAyar' },
  { label: 'e-devlet', url: 'https://www.turkiye.gov.tr/' },
  { label: 'mail', url: 'mailto:bekirefeayar101@gmail.com' },
];
// Palet (tasarim sayfa 7): koyu + acik tema; 256 karsiliklari otomatik hesaplanir
const TUI_THEMES = {
  koyu: {
    bg: '#1c1a17', text: '#e8e2d6', dim: '#8a8478', accent: '#d98e4a', green: '#9bb08f', yellow: '#d9b54a', red: '#c4604f', rule: '#3a352e',
    x256: { bg: 234, text: 253, dim: 245, accent: 173, green: 108, yellow: 179, red: 167, rule: 236 },
  },
  acik: {
    bg: '#f4efe6', text: '#2b2722', dim: '#857d6f', accent: '#b5651d', green: '#5f7a52', yellow: '#9a7a14', red: '#a8452f', rule: '#d9d0c0',
    x256: { bg: 230, text: 235, dim: 244, accent: 130, green: 65, yellow: 100, red: 131, rule: 252 },
  },
};
function tuiTruecolor() {
  if (/truecolor|24bit/i.test(process.env.COLORTERM || '')) return true;
  if (process.env.WT_SESSION) return true; // Windows Terminal
  return /vscode|Windows_Terminal|Hyper|iTerm/i.test(process.env.TERM_PROGRAM || '');
}
function tuiXterm256(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const lv = [0, 95, 135, 175, 215, 255];
  const near = (v) => { let bi = 0, bd = 1e9; for (let i = 0; i < lv.length; i++) { const d = Math.abs(lv[i] - v); if (d < bd) { bd = d; bi = i; } } return bi; };
  const ri = near(r), gi = near(g), bi = near(b);
  const dCube = (r - lv[ri]) * (r - lv[ri]) + (g - lv[gi]) * (g - lv[gi]) + (b - lv[bi]) * (b - lv[bi]);
  const avg = Math.round((r + g + b) / 3);
  let gv = 8 + Math.round((avg - 8) / 10) * 10; gv = Math.max(8, Math.min(238, gv));
  const dGray = (r - gv) * (r - gv) + (g - gv) * (g - gv) + (b - gv) * (b - gv);
  if (dGray < dCube) return 232 + Math.round((gv - 8) / 10);
  return 16 + 36 * ri + 6 * gi + bi;
}
function tuiColorCodes(name) {
  const th = TUI_THEMES[name] || TUI_THEMES.koyu;
  const tc = tuiTruecolor();
  const rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  const fgKey = (key) => {
    if (tc) { const c = rgb(th[key]); return '\x1b[38;2;' + c[0] + ';' + c[1] + ';' + c[2] + 'm'; }
    const n = th.x256 && th.x256[key] !== undefined ? th.x256[key] : tuiXterm256(th[key]);
    return '\x1b[38;5;' + n + 'm';
  };
  const bgKey = (key) => {
    if (tc) { const c = rgb(th[key]); return '\x1b[48;2;' + c[0] + ';' + c[1] + ';' + c[2] + 'm'; }
    const n = th.x256 && th.x256[key] !== undefined ? th.x256[key] : tuiXterm256(th[key]);
    return '\x1b[48;5;' + n + 'm';
  };
  return {
    c: {
      text: fgKey('text'), dim: fgKey('dim'), accent: fgKey('accent'), green: fgKey('green'),
      yellow: fgKey('yellow'), red: fgKey('red'), rule: fgKey('rule'),
      bg: fgKey('bg'), accentBg: bgKey('accent'),
    },
    bgEsc: bgKey('bg'),
    bold: '\x1b[1m',
    nob: '\x1b[22m\x1b[23m\x1b[24m',
    resetAll: '\x1b[0m',
  };
}
const TERM = { w: process.stdout.columns || 80, h: process.stdout.rows || 24 };
function tuiSize() {
  return {
    w: Math.max(40, TERM.w || process.stdout.columns || 80),
    h: Math.max(16, TERM.h || process.stdout.rows || 24),
  };
}
function tuiWrap(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if ((line + ' ' + word).trim().length > width) {
        if (line) out.push(line);
        line = word;
        while (line.length > width) { out.push(line.slice(0, width)); line = line.slice(width); }
      } else {
        line = (line + ' ' + word).trim();
      }
    }
    out.push(line);
  }
  return out;
}
function tuiHostOf(u) {
  try {
    return String(u).replace(/^mailto:/, '').replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?]/)[0];
  } catch (e) { return String(u); }
}
// Klasik mod + tek soru icin: ✓ ⚠ ✗ isaretlerini renklendirir (yalnizca TTY)
function colorizePlain(text) {
  if (!process.stdout.isTTY) return text;
  const W2 = '\x1b[38;5;179m', G2 = '\x1b[38;5;108m', R2 = '\x1b[38;5;167m', D2 = '\x1b[2m', Z = '\x1b[0m';
  return String(text).split('\n').map((ln) => {
    let s = ln;
    if (s.startsWith('✓')) s = G2 + '✓' + Z + s.slice(1);
    else if (s.startsWith('⚠')) s = W2 + '⚠' + Z + s.slice(1);
    else if (s.startsWith('✗')) {
      const i = s.indexOf('. ');
      if (i > 0) s = R2 + '✗' + Z + s.slice(1, i + 2) + D2 + s.slice(i + 2) + Z;
      else s = R2 + '✗' + Z + s.slice(1);
    }
    s = s.replace(/\[e\/h\]/g, D2 + '[e/h]' + Z);
    return s;
  }).join('\n');
}
const TUI_HELP_CMDS = [
  ['saat kaç', 'saati söyler'], ['2+2 · 5*8', 'hesaplar'], ['100 dolar kaç tl', 'canlı kur'],
  ['hava <şehir>', 'hava durumu'], ['<uygulama> aç', 'uygulama açar'], ['<site> aç', 'site açar (uyarıyla)'],
  ['<kelime> ne demek', 'sözlük'], ['<konu> araştır', 'yapay zeka araştırması'], ['<soru>', 'bilgi bankasında ara'],
];
const TUI_HELP_KEYS = [
  ['↑ ↓', 'geçmiş'], ['Tab', 'tamamla'], ['Ctrl+L', 'temizle'], ['Esc', 'panel kapat'], ['Ctrl+C', 'çıkış'], ['1-4', 'My Links aç'],
];
const TUI_HELP_MODS = [
  ['pollux', 'ekran uygulaması'], ['pollux --chat', 'klasik satır sohbeti'], ['pollux "saat kaç"', 'tek soru, tek cevap'],
];
const TUI_FOOT = '↑ ↓ geçmiş    Tab tamamla    Ctrl+L temizle    Esc kapat    Ctrl+C çıkış';
const TUI_FOOT_HELP = 'Esc ile yardım kapanır    sohbete dönmek için herhangi bir tuş';
const TUI_SUGGEST = ['yardım', 'linklerim', 'veri', 'tarih', 'gündem', 'hava durumu', 'saat kaç', 'uygulamaları listele'];
const TUI_SLASH_SUGGEST = ['/yardım', '/link', '/veri', '/tema acik', '/tema koyu', '/cikis'];
const TUI_SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';

async function tuiLoop() {
  const stdin = process.stdin, stdout = process.stdout;
  const PAD = 0;
  const MAXLINES = 160;
  const S = {
    input: '', cursor: 0, lines: [], ctx: { lastTopic: '', lastTitle: '', lastContext: '' },
    offset: 0, busy: false, busyStart: 0, spin: 0,
    theme: 'koyu', C: null,
    online: null, confirmUrl: null, confirmName: '',
    pendingUrls: [], history: [], histIdx: -1, histDraft: '',
    flashMsg: '', flashUntil: 0,
    urlRegions: [], linkRegions: [], inputGeom: null,
    compIdx: -1, compList: [],
    panel: false, helpBase: 0, inSplash: false, plain: false,
    lastRows: null,
  };
  let needClear = true;
  let sizeTimer = null;
  let onlineTimer = null;

  function loadState() {
    // Her acilis sifir: yalnizca tema hatirlanir; yazilar/gecmis/baglam tasinmaz.
    try {
      const d = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf8'));
      if (d && typeof d.theme === 'string' && TUI_THEMES[d.theme]) S.theme = d.theme;
    } catch (e) {}
    S.lines = [];
    S.history = [];
    S.ctx = { lastTopic: '', lastTitle: '', lastContext: '' };
  }
  function saveState() {
    // Sohbet icerigi diske yazilmaz (her acilis sifir); yalnizca tema saklanir.
    try { fs.writeFileSync(CHATS_FILE, JSON.stringify({ theme: S.theme }), 'utf8'); } catch (e) {}
  }
  function saveCtx() {
    try { S.ctx = { lastTopic, lastTitle, lastContext }; } catch (e) {}
  }
  function loadCtx() {
    try {
      const c = S.ctx || {};
      lastTopic = c.lastTopic || ''; lastTitle = c.lastTitle || ''; lastContext = c.lastContext || '';
    } catch (e) {}
  }
  function push(text, who) {
    for (const para of String(text).split('\n')) S.lines.push({ para, who });
    while (S.lines.length > MAXLINES) S.lines.shift();
  }
  function flash(msg) {
    S.flashMsg = msg; S.flashUntil = Date.now() + 2500;
  }
  function openLinks() {
    try { openUrl(LINKS_URL); flash('Bağlantıların açılıyor...'); } catch (e) { flash('Açılamadı: ' + LINKS_URL); }
    render();
  }
  function segRow(segs) {
    return { segs: segs, plain: segs.map((s) => s[1]).join('') };
  }
  function segCode(st) {
    const C = S.C;
    const base = C.nob + C.bgEsc;
    switch (st) {
      case '': return base + C.c.text;
      case 'd': return base + C.c.dim;
      case 'b': return base + C.bold + C.c.text;
      case 'a': return base + C.c.accent;
      case 'a!': return base + C.bold + C.c.accent;
      case 'g': return base + C.c.green;
      case 'w': return base + C.c.yellow;
      case 'r': return base + C.c.red;
      case 'rule': return base + C.c.rule;
      case 'key': return C.nob + C.c.accentBg + C.bold + C.c.bg;
      case 'cursor': return base + C.bold + C.c.accent;
      default: return base + C.c.text;
    }
  }
  function paint(rows) {
    const { w, h } = tuiSize();
    const C = S.C;
    if (S.plain) {
      const out = [];
      for (let r = 0; r < h; r++) {
        const row = rows[r] || { segs: [] };
        let line = row.segs.map((s) => s[1]).join('');
        if (line.length < w) line += ' '.repeat(w - line.length);
        out.push(line);
      }
      stdout.write(out.join('\n') + '\n');
      return;
    }
    const lines = [];
    for (let r = 0; r < h; r++) {
      const row = rows[r] || { segs: [] };
      let line = C.bgEsc;
      let len = 0;
      for (const s of row.segs) {
        if (!s[1]) continue;
        line += segCode(s[0]) + s[1];
        len += s[1].length;
      }
      if (len < w) line += ' '.repeat(w - len);
      line += C.resetAll;
      lines.push(line);
    }
    const clear = needClear;
    needClear = false;
    let minR = 0, maxR = h - 1;
    if (!clear && S.lastRows && S.lastRows.length === h) {
      minR = Infinity; maxR = -1;
      for (let r = 0; r < h; r++) {
        if (lines[r] !== S.lastRows[r]) { if (r < minR) minR = r; if (r > maxR) maxR = r; }
      }
      if (maxR < 0) return; // hicbir satir degismedi
    }
    S.lastRows = lines;
    let buf = '\x1b[?25l' + (clear ? '\x1b[2J' : '');
    for (let r = minR; r <= maxR; r++) buf += '\x1b[' + (r + 1) + ';1H' + lines[r];
    // standart terminal imleci: giris satirindaki konuma tasi ve goster (altin blok cizilmez)
    if (S.inputGeom) buf += '\x1b[' + (S.inputGeom.row + 1) + ';' + (S.inputGeom.col + 1) + 'H\x1b[?25h';
    stdout.write(buf);
  }
  function userRows(para, w) {
    const CW = Math.max(8, w - PAD * 2 - 2);
    const parts = tuiWrap(para, CW);
    return parts.map((p, i) => {
      const r = segRow([['', ' '.repeat(PAD)], i ? ['', '  '] : ['a!', '❯ '], ['', p]]);
      r.who = 'u';
      return r;
    });
  }
  function asstLineRows(ln, w) {
    const rows = [];
    const CW = Math.max(10, w - PAD * 2 - 5);
    const pre = [['', ' '.repeat(PAD)], ['a', '  ┃ ']];
    const mk = (mid) => segRow([...pre, ...mid]);
    const t = ln;
    if (/^\[!\]/.test(t)) {
      const body = t.replace(/^\[!\]\s*/, '');
      const parts = tuiWrap(body, CW - 2);
      parts.forEach((p, i) => rows.push(mk([i ? ['w', '  '] : ['w', '⚠ '], ['', p]])));
    } else if (t.startsWith('✓')) {
      const body = t.replace(/^✓\s*/, '✓ ');
      tuiWrap(body, CW).forEach((p) => rows.push(mk([['g', p]])));
    } else if (t.startsWith('⚠')) {
      tuiWrap(t, CW).forEach((p) => rows.push(mk([['w', p]])));
    } else if (t.startsWith('✗')) {
      const body = t.replace(/^✗\s*/, '');
      const dot = body.indexOf('. ');
      const cut = dot > 0 ? dot + 2 : (body.endsWith('.') ? body.length : -1);
      if (cut > 0 && cut <= CW) rows.push(mk([['r', '✗ ' + body.slice(0, cut)], ['', body.slice(cut)]]));
      else tuiWrap(t, CW).forEach((p, i) => rows.push(mk(i ? [['', p]] : [['r', p]])));
    } else if (/^  /.test(t)) {
      const body = t.replace(/^  /, '');
      tuiWrap(body, CW - 2).forEach((p) => rows.push(mk([['d', '  '], ['d', p]])));
    } else if (t.trim().startsWith('(') && /\)\s*$/.test(t.trim())) {
      tuiWrap(t, CW).forEach((p) => rows.push(mk([['d', p]])));
    } else if (t.trim() === 'Bağlantılar:') {
      rows.push(mk([['d', 'Bağlantılar:']]));
    } else if (/^[0-9][0-9.,]*$/.test(t.trim())) {
      rows.push(mk([['b', t.trim()]]));
    } else if (/^(https?:\/\/|www\.)\S+$/.test(t.trim())) {
      tuiWrap(t.trim(), CW).forEach((p) => rows.push(mk([['a', p]])));
    } else {
      tuiWrap(t, CW).forEach((p) => rows.push(mk([['', p]])));
    }
    return rows;
  }
  function asstRows(para, w) {
    const rows = [];
    for (const ln of String(para).split('\n')) rows.push(...asstLineRows(ln, w));
    return rows;
  }
  function msgRows(w) {
    const rows = [];
    let first = true;
    for (const m of S.lines) {
      if (m.who === 'u') {
        if (!first) rows.push({ segs: [] });
        first = false;
        rows.push(...userRows(m.para, w));
      } else {
        rows.push(...asstRows(m.para, w));
      }
    }
    return rows;
  }
  function helpRows(w) {
    const rows = [];
    const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
    rows.push(segRow([['', ' '.repeat(PAD)], ['d', pad('KOMUTLAR', 50) + 'KISAYOLLAR']]));
    const n = Math.max(TUI_HELP_CMDS.length, TUI_HELP_KEYS.length);
    for (let i = 0; i < n; i++) {
      const c = TUI_HELP_CMDS[i], k = TUI_HELP_KEYS[i];
      const segs = [['', ' '.repeat(PAD)]];
      if (c) { segs.push(['a', pad(c[0], 22)]); segs.push(['d', pad(c[1], 24)]); }
      else segs.push(['', ' '.repeat(46)]);
      if (k) { segs.push(['a', pad(k[0], 10)]); segs.push(['d', k[1]]); }
      rows.push(segRow(segs));
    }
    rows.push({ segs: [] });
    rows.push(segRow([['', ' '.repeat(PAD)], ['d', 'MODLAR']]));
    for (const m of TUI_HELP_MODS) rows.push(segRow([['', ' '.repeat(PAD)], ['a', pad(m[0], 22)], ['d', m[1]]]));
    return rows;
  }
  function openingRows(w) {
    const rows = [];
    const ind = ' '.repeat(PAD + 3);
    rows.push(segRow([['', ind], ['a!', '✦ ─────── ✧'], ['', '   '], ['b', 'POLLUX']]));
    rows.push(segRow([['', ' '.repeat(PAD + 17)], ['d', 'çevrimdışı türkçe asistan · cmd']]));
    rows.push({ segs: [] });
    const cnt = ((typeof KNOWLEDGE_READY !== 'undefined' && KNOWLEDGE_READY && KNOWLEDGE.length) ? KNOWLEDGE.length : 0).toLocaleString('tr-TR') + ' kayıt';
    const dt = new Date();
    const gunler = ['pazar', 'pazartesi', 'salı', 'çarşamba', 'perşembe', 'cuma', 'cumartesi'];
    const saat = String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
    rows.push(segRow([['', ind], ['g', '●'], ['', ' ' + (S.online ? 'çevrimiçi' : 'çevrimdışı') + '      '], ['d', cnt + '      ' + gunler[dt.getDay()] + ' · ' + saat]]));
    rows.push({ segs: [] });
    const items = MYLINK_ITEMS.map((it, i) => (i + 1) + ' ' + it.label);
    const INNER = Math.max(56, 2 + items.join('    ').length + 1);
    rows.push(segRow([['', ind], ['d', '╭─ My Links ' + '─'.repeat(Math.max(0, INNER - 11)) + '╮']]));
    const midSegs = [['', ind], ['d', '│'], ['', '  ']];
    let cur = PAD + 3 + 1 + 2;
    const links = [];
    MYLINK_ITEMS.forEach((it, i) => {
      if (i) { midSegs.push(['', '    ']); cur += 4; }
      const label = (i + 1) + ' ' + it.label;
      midSegs.push(['a', String(i + 1)], ['', ' ' + it.label]);
      links.push({ x0: cur, x1: cur + label.length, url: it.url });
      cur += label.length;
    });
    midSegs.push(['', ' '.repeat(Math.max(1, INNER - (cur - (PAD + 3 + 1))))]);
    midSegs.push(['d', '│']);
    const midRow = segRow(midSegs);
    midRow.links = links;
    rows.push(midRow);
    rows.push(segRow([['', ind], ['d', '╰' + '─'.repeat(INNER) + '╯']]));
    rows.push({ segs: [] });
    rows.push(segRow([['', ind], ['d', 'ipucu   "yardım" yaz · ↑ geçmiş · Tab tamamla']]));
    return rows;
  }
  function busyRow() {
    const el = Math.floor((Date.now() - (S.busyStart || Date.now())) / 1000);
    return segRow([['', ' '.repeat(PAD)], ['a', '  ┃ '], ['a', TUI_SPIN[(S.spin || 0) % TUI_SPIN.length]], ['d', ' araştırıyor…' + (el >= 1 ? '  ' + el + 'sn' : '')]]);
  }
  function confirmRow() {
    return segRow([['', ' '.repeat(PAD)], ['a', '  ┃ '], ['', '  Devam edilsin mi?   '], ['key', 'E'], ['', ' evet    '], ['d', 'H hayır']]);
  }
  function render() {
    try {
      S.inputGeom = null;
      const { w, h } = tuiSize();
      const CH = Math.max(3, h - 5);
      const rows = [];
      const blank = () => ({ segs: [] });
      const hasHead = S.lines.length || S.panel;
      if (hasHead) {
        const st = S.online ? 'çevrimiçi' : 'çevrimdışı';
        const leftLen = 8, rightLen = 2 + st.length;
        const room = w - PAD * 2 - leftLen - rightLen;
        const hseg = [['', ' '.repeat(PAD)], ['a!', '✦'], ['b', ' POLLUX']];
        if (room >= 2) hseg.push(['', ' '.repeat(room)], ['g', '●'], ['d', ' ' + st]);
        rows.push(segRow(hseg));
        rows.push(segRow([['', ' '.repeat(PAD)], ['rule', '─'.repeat(Math.max(0, w - PAD * 2))]]));
      } else {
        rows.push(blank());
        rows.push(blank());
      }
      let content;
      if (S.panel) {
        content = [];
        const lastU = [...S.lines].reverse().find((m) => m.who === 'u');
        if (lastU) content.push(...userRows(lastU.para, w));
        content.push(blank());
        content.push(...helpRows(w));
      } else if (!S.lines.length) {
        content = openingRows(w);
      } else {
        content = msgRows(w);
        if (S.confirmUrl) content.push(confirmRow());
        if (S.busy) content.push(busyRow());
      }
      const maxOff = Math.max(0, content.length - CH);
      S.offset = Math.max(0, Math.min(S.offset || 0, maxOff));
      let start;
      if (!S.lines.length && !S.panel) start = 0;
      else start = Math.max(0, content.length - CH - S.offset);
      const view = content.slice(start, start + CH);
      while (view.length < CH) view.push(blank());
      for (let i = 0; i < view.length; i++) view[i].screenRow = 3 + i;
      rows.push(...view);
      // giris satiri (ghost oneri: yazarken soluk tamamlama)
      const avail = Math.max(4, w - PAD * 2 - 2);
      const shown = S.input.length > avail ? S.input.slice(S.input.length - avail) : S.input;
      const win = S.input.length - shown.length;
      const cursorInShown = Math.max(0, Math.min(shown.length, S.cursor - win));
      let ghost = '';
      if (S.cursor === S.input.length && S.input.length >= 1 && !S.busy && !S.confirmUrl && !S.panel) {
        const lw = S.input.toLocaleLowerCase('tr');
        const pool = lw.startsWith('/') ? TUI_SLASH_SUGGEST : TUI_SUGGEST;
        const hit = pool.find((c) => c.toLocaleLowerCase('tr').startsWith(lw) && c.toLocaleLowerCase('tr') !== lw);
        if (hit) ghost = hit.slice(S.input.length);
        if (ghost && S.input.length + 1 + ghost.length > avail) ghost = '';
      }
      const pseg = [['', ' '.repeat(PAD)], ['a!', '❯ ']];
      pseg.push(['', shown]);
      if (ghost) pseg.push(['d', ghost]);
      rows.push(segRow(pseg));
      S.inputGeom = { row: h - 2, x0: PAD + 2, len: shown.length, win: win, col: PAD + 2 + cursorInShown };
      // alt bilgi
      rows.push(segRow([['', ' '.repeat(PAD)], ['rule', '─'.repeat(Math.max(0, w - PAD * 2))]]));
      const flashOn = S.flashUntil && Date.now() < S.flashUntil;
      const foot = S.panel ? TUI_FOOT_HELP : (flashOn ? S.flashMsg : TUI_FOOT);
      rows.push(segRow([['', ' '.repeat(PAD)], [flashOn && !S.panel ? 'a' : 'd', foot]]));
      // tiklanabilir bolgeler
      S.urlRegions = []; S.linkRegions = [];
      for (const r of rows) {
        if (!r || !r.screenRow) continue;
        if (r.plain) {
          for (const u of extractUrls(r.plain)) {
            let needle = u, idx = r.plain.indexOf(u);
            if (idx < 0) { needle = u.replace(/^https?:\/\//, ''); idx = r.plain.indexOf(needle); }
            if (idx < 0) { needle = 'www.' + u.replace(/^https?:\/\/(www\.)?/, ''); idx = r.plain.indexOf(needle); }
            if (idx >= 0) S.urlRegions.push({ url: u, row: r.screenRow, x0: idx, x1: idx + needle.length });
          }
        }
        if (r.links) for (const L of r.links) S.linkRegions.push({ url: L.url, row: r.screenRow, x0: L.x0, x1: L.x1 });
      }
      paint(rows);
    } catch (e) {}
  }
  function closePanel() {
    if (!S.panel) return;
    S.panel = false;
    if (S.lines.length > S.helpBase) S.lines.length = S.helpBase;
    render();
  }
  function showHelp(t) {
    S.helpBase = S.lines.length;
    push(t, 'u');
    S.panel = true;
    S.offset = 999999;
    render();
  }
  function histMove(d) {
    if (!S.history.length) return;
    if (d < 0) {
      if (S.histIdx === -1) { S.histDraft = S.input; S.histIdx = S.history.length - 1; }
      else S.histIdx = Math.max(0, S.histIdx - 1);
      S.input = S.history[S.histIdx];
    } else {
      if (S.histIdx === -1) return;
      S.histIdx++;
      if (S.histIdx >= S.history.length) { S.histIdx = -1; S.input = S.histDraft; }
      else S.input = S.history[S.histIdx];
    }
    S.cursor = S.input.length;
    S.compIdx = -1;
    render();
  }
  function completeInput() {
    const low = S.input.toLocaleLowerCase('tr');
    if (S.compIdx < 0) {
      const all = TUI_SUGGEST.concat(TUI_SLASH_SUGGEST, S.history.slice(-50));
      const set = [];
      for (const c of all) if (c && !set.includes(c)) set.push(c);
      S.compList = (low ? set.filter((c) => c.toLocaleLowerCase('tr').startsWith(low) && c.toLocaleLowerCase('tr') !== low) : []);
      S.compIdx = 0;
    } else {
      S.compIdx++;
    }
    if (S.compList.length) {
      S.input = S.compList[S.compIdx % S.compList.length];
      S.cursor = S.input.length;
      if (S.compList.length > 1) flash('✧ ' + S.compList.slice(0, 4).join('   '));
    } else {
      S.compIdx = -1;
    }
    render();
  }
  function confirmResolve(yes) {
    const u = S.confirmUrl, nm = S.confirmName;
    S.confirmUrl = null; S.confirmName = '';
    if (yes) {
      try { openUrl(u); } catch (e) {}
      push('✓ ' + (nm || tuiHostOf(u)) + ' açıldı.', 'a');
      saveState();
    } else {
      flash('Vazgeçildi');
    }
    render();
  }
  function escAction() {
    if (S.panel) { closePanel(); return; }
    if (S.confirmUrl) { confirmResolve(false); return; }
    S.input = ''; S.cursor = 0; S.compIdx = -1;
    render();
  }
  async function submit() {
    if (S.panel) { closePanel(); return; }
    const t = S.input.trim();
    S.input = ''; S.cursor = 0; S.compIdx = -1; S.histIdx = -1;
    if (!t) { render(); return; }
    if (S.confirmUrl) { S.confirmUrl = null; S.confirmName = ''; }
    if (t === '/cikis' || t === '/exit' || t === 'cikis' || t === 'exit' || t === 'quit' || t === 'çıkış') {
      saveCtx(); saveState(); cleanup(); process.exit(0); return;
    }
    if (t === '/link' || t === 'linklerim' || t === 'linkler') {
      push(t, 'u'); openLinks(); saveState(); return;
    }
    if (t === '/veri') {
      push(t, 'u'); push(dataStats(), 'a');
      while (S.lines.length > MAXLINES) S.lines.shift();
      render(); return;
    }
    if (t === '/yardim' || t === '/yardım' || t === 'yardim' || t === 'yardım') { showHelp(t); return; }
    if (t === '/tema' || t.startsWith('/tema ')) {
      const arg = t.slice(5).trim().toLocaleLowerCase('tr');
      if (!arg) S.theme = S.theme === 'koyu' ? 'acik' : 'koyu';
      else if (arg === 'acik' || arg === 'açık') S.theme = 'acik';
      else if (arg === 'koyu') S.theme = 'koyu';
      S.C = tuiColorCodes(S.theme);
      needClear = true;
      saveState();
      flash('Tema: ' + (S.theme === 'acik' ? 'açık' : 'koyu'));
      render(); return;
    }
    if (/^[1-9]$/.test(t)) {
      const n = parseInt(t, 10);
      if (S.pendingUrls.length) {
        if (n >= 1 && n <= S.pendingUrls.length) {
          const u = S.pendingUrls[n - 1];
          S.pendingUrls = [];
          push(t, 'u');
          try { openUrl(u); } catch (e) {}
          push('✓ ' + tuiHostOf(u) + ' açıldı.', 'a');
          saveState(); render(); return;
        }
        S.pendingUrls = [];
      }
      if (n <= MYLINK_ITEMS.length) {
        const it = MYLINK_ITEMS[n - 1];
        push(t, 'u');
        try { openUrl(it.url); } catch (e) {}
        push('✓ ' + it.label + ' açıldı.', 'a');
        saveState(); render(); return;
      }
    }
    push(t, 'u');
    S.history.push(t);
    while (S.history.length > 80) S.history.shift();
    loadCtx();
    S.busy = true; S.busyStart = Date.now(); S.pendingUrls = []; S.offset = 0;
    render();
    try {
      pendingSiteOpen = null;
      const out = String(await answer(t));
      S.busy = false;
      const msg = { para: '', who: 'a' };
      S.lines.push(msg);
      const full = out;
      const words = full.split(/(\s+)/);
      let wi = 0, lastR = 0;
      await new Promise((resolve) => {
        const step = () => {
          let chunk = '';
          for (let k = 0; k < 2 && wi < words.length; k++, wi++) chunk += words[wi];
          msg.para += chunk;
          const now = Date.now();
          if (now - lastR > 45 || wi >= words.length) { lastR = now; render(); }
          if (wi >= words.length) resolve();
          else setTimeout(step, 20);
        };
        step();
      });
      while (S.lines.length > MAXLINES) S.lines.shift();
      const urls = extractUrls(out);
      const direct = urls.filter(isDirectUrl);
      const rest = urls.filter((u) => !isDirectUrl(u));
      for (const u of direct) { try { openUrl(u); } catch (e) {} }
      if (pendingSiteOpen) {
        S.confirmUrl = pendingSiteOpen;
        S.confirmName = tuiHostOf(pendingSiteOpen);
        pendingSiteOpen = null;
      } else if (rest.length) {
        S.pendingUrls = rest;
        const pl = ['⚠ Açmak için numara yaz:'];
        rest.forEach((u, i) => pl.push('  ' + (i + 1) + ') ' + u));
        push(pl.join('\n'), 'a');
        while (S.lines.length > MAXLINES) S.lines.shift();
      }
      saveCtx(); saveState();
    } catch (e) {
      S.busy = false;
      push('✗ Hata: ' + e.message, 'a');
      saveState();
    }
    render();
  }
  function onMouseClick(x, y) {
    if (S.panel) { closePanel(); return true; }
    for (const r of S.linkRegions) {
      if (y === r.row && x - 1 >= r.x0 && x - 1 < r.x1) { try { openUrl(r.url); } catch (e) {} flash('Açılıyor: ' + r.url); render(); return true; }
    }
    for (const r of S.urlRegions) {
      if (y === r.row && x - 1 >= r.x0 && x - 1 < r.x1) { try { openUrl(r.url); } catch (e) {} flash('Açılıyor: ' + r.url); render(); return true; }
    }
    const g = S.inputGeom;
    if (g && y === g.row && x - 1 >= g.x0 - 2 && x - 1 <= g.x0 + g.len) {
      S.cursor = Math.max(0, Math.min(S.input.length, g.win + (x - 1 - g.x0)));
      render(); return true;
    }
    return false;
  }
  // Terminal boyutu: acilista yetkili kaynaktan olc + pencere degisimlerini izle
  let termSizeQueried = false;
  function queryTermSize() {
    return new Promise((resolve) => {
      const fromStdout = () => {
        if (process.stdout.columns > 0) TERM.w = process.stdout.columns;
        if (process.stdout.rows > 0) TERM.h = process.stdout.rows;
      };
      if (process.env.WT_SESSION) { fromStdout(); resolve(); return; }
      if (termSizeQueried) { fromStdout(); resolve(); return; }
      if (process.platform === 'win32' && stdout.isTTY) {
        try {
          termSizeQueried = true;
          const cp = require('child_process');
          cp.execFile(
            'powershell.exe',
            ['-noprofile', '-windowstyle', 'hidden', '-command', '(Get-Host).UI.RawUI.WindowSize.Width; (Get-Host).UI.RawUI.WindowSize.Height'],
            { timeout: 3000, windowsHide: true },
            (err, so) => {
              if (!err) {
                const parts = String(so || '').trim().split(/\s+/).map((x) => parseInt(x, 10));
                if (parts.length >= 2 && parts[0] > 0 && parts[1] > 0) {
                  TERM.w = parts[0]; TERM.h = parts[1];
                  resolve();
                  return;
                }
              }
              fromStdout();
              resolve();
            }
          );
          return;
        } catch (e) {}
      }
      dsrFallback((ok) => { if (!ok) fromStdout(); resolve(); });
    });
  }
  function dsrFallback(done) {
    let finished = false;
    const finish = (w, h, ok) => {
      if (finished) return;
      finished = true;
      try { stdin.removeListener('data', onData); } catch (e) {}
      if (ok && w > 0 && h > 0) { TERM.w = w; TERM.h = h; }
      done(ok);
    };
    const onData = (chunk) => {
      let s = '';
      try { s = chunk.toString('utf8'); } catch (e) {}
      const m = s.match(/\x1b\[(\d+);(\d+)R/);
      if (m) finish(parseInt(m[2], 10), parseInt(m[1], 10), true);
    };
    stdin.on('data', onData);
    try { stdout.write('\x1b[999;999H\x1b[6n'); } catch (e) {}
    setTimeout(() => finish(0, 0, false), 400);
  }
  function watchTermSize() {
    const syncFromStdout = () => {
      try {
        const w = process.stdout.columns || 0, h = process.stdout.rows || 0;
        if (w >= 40 && h >= 16 && (w !== TERM.w || h !== TERM.h)) {
          TERM.w = w; TERM.h = h;
          needClear = true;
          try { render(); } catch (e) {}
        }
      } catch (e) {}
    };
    try {
      if (process.stdout && typeof process.stdout.on === 'function') {
        process.stdout.removeAllListeners('resize');
        process.stdout.on('resize', syncFromStdout);
      }
    } catch (e) {}
    if (sizeTimer) return;
    sizeTimer = setInterval(syncFromStdout, 2000);
    try { sizeTimer.unref(); } catch (e) {}
  }
  function cleanup() {
    try { clearInterval(timer); } catch (e) {}
    try { clearInterval(onlineTimer); } catch (e) {}
    try { if (sizeTimer) clearInterval(sizeTimer); } catch (e) {}
    try { stdout.write('\x1b[?1000l\x1b[?1006l\x1b[?25h\x1b[0m\n'); } catch (e) {}
    try { stdin.setRawMode(false); } catch (e) {}
    try { stdin.removeAllListeners('data'); } catch (e) {}
  }
  async function splashLoad() {
    S.inSplash = true;
    let si = 0, done = 0, total = 1, finished = false;
    const t0 = Date.now();
    const mid = (segs, w2) => {
      const len = segs.reduce((a, s2) => a + s2[1].length, 0);
      const x = Math.max(0, Math.floor((w2 - len) / 2));
      return { segs: [['', ' '.repeat(x)], ...segs] };
    };
    const draw = () => {
      const { w, h } = tuiSize();
      const rows = [];
      const logo = mid([['a!', '✦ ─────── ✧'], ['', '   '], ['b', 'POLLUX']], w);
      const pct = total > 0 ? Math.min(1, done / total) : 0;
      const msg = finished ? 'hazır' : 'pollux açılıyor…';
      const spinRow = mid([['a', TUI_SPIN[si % TUI_SPIN.length]], ['d', '  ' + msg]], w);
      const bw = Math.min(34, Math.max(10, w - 12));
      const fill = Math.round(pct * bw);
      let detail = '  ' + Math.round(pct * 100) + '%';
      if (total > 1048576) {
        detail += ' • ' + Math.round(done / 1048576) + '/' + Math.round(total / 1048576) + 'MB';
        const el = (Date.now() - t0) / 1000;
        if (!finished && done > 10485760 && el > 3) {
          const secs = Math.round((el * (total - done)) / done);
          detail += ' • ~' + (secs >= 90 ? Math.round(secs / 60) + ' dk' : Math.max(1, secs) + ' sn') + ' kaldı';
        }
      }
      const bar = mid([['a', '━'.repeat(fill)], ['rule', '─'.repeat(Math.max(0, bw - fill))], ['d', detail]], w);
      const block = [logo, { segs: [] }, spinRow, bar];
      const padTop = Math.max(0, Math.floor((h - block.length - 2) / 2));
      for (let i = 0; i < padTop; i++) rows.push({ segs: [] });
      for (const b of block) rows.push(b);
      while (rows.length < h - 1) rows.push({ segs: [] });
      const foot = finished ? dataStats() : 'İlk açılışta tam veri seti yüklenir (bir kez) • Wi-Fi önerilir';
      const f = foot.length > w - 4 ? foot.slice(0, w - 4) : foot;
      const fx = Math.max(0, Math.floor((w - f.length) / 2));
      rows.push({ segs: [['', ' '.repeat(fx)], ['d', f]] });
      paint(rows);
    };
    draw();
    const timer2 = setInterval(() => { si++; draw(); }, 90);
    await ensureKnowledge((d, t2) => { done = d; total = t2 || 1; });
    finished = true;
    draw();
    clearInterval(timer2);
    needClear = true;
    S.inSplash = false;
  }
  async function checkOnline() {
    try {
      const ok = await hasInternet();
      if (ok !== S.online) {
        S.online = ok;
        if (!S.inSplash) { try { render(); } catch (e) {} }
      }
    } catch (e) {}
  }
  async function tuiTestMode() {
    S.plain = process.env.POLLUX_TUI_PLAIN === '1';
    TERM.w = parseInt(process.env.POLLUX_TUI_W || '100', 10) || 100;
    TERM.h = parseInt(process.env.POLLUX_TUI_H || '30', 10) || 30;
    loadState();
    S.C = tuiColorCodes(process.env.POLLUX_TUI_THEME || S.theme);
    S.online = process.env.POLLUX_TUI_ONLINE === '1';
    const demo = process.env.POLLUX_TUI_DEMO || '';
    if (process.env.POLLUX_TUI_INPUT) { S.input = process.env.POLLUX_TUI_INPUT; S.cursor = S.input.length; }
    if (demo) S.lines = [];
    if (demo === 'chat') {
      push('5+7*3', 'u'); push('26', 'a');
      push('notepad aç', 'u'); push('✓ Notepad açıldı', 'a');
      push('youtube aç', 'u'); push('⚠ youtube.com tarayıcıda açılacak.', 'a');
      S.confirmUrl = 'https://www.youtube.com'; S.confirmName = 'youtube.com';
      push('qwxz', 'u'); push('Bunu anlayamadım. "yardım" yazarsan neler yapabildiğimi gösteririm.', 'a');
      push('hava durumu', 'u'); push('✗ İnternet yok, canlı veriyi çekemiyorum.\n  Bilgi bankasından çevrimdışı yanıt verebilirim.', 'a');
    } else if (demo === 'help') {
      push('yardım', 'u'); S.panel = true; S.helpBase = 1;
    } else if (demo === 'busy') {
      push("ay'a ilk kim gitti araştır", 'u');
      S.busy = true; S.busyStart = Date.now() - 2000; S.spin = 3;
    }
    render();
    if (process.env.POLLUX_TUI_RENDER2 === '1') render();
  }

  if (process.env.POLLUX_TUI_TEST) { await tuiTestMode(); return; }

  loadState();
  S.C = tuiColorCodes(S.theme);
  stdin.setRawMode(true);
  stdin.resume();
  try { await queryTermSize(); } catch (e) {}
  watchTermSize();
  try { stdout.write('\x1b[?1000h\x1b[?1006h'); } catch (e) {}
  checkOnline();
  await splashLoad();
  if (!process.env.WT_SESSION && !process.env.TERM_PROGRAM) {
    flash('İpucu: tıklanabilir bağlantılar için Windows Terminal kullan');
  }
  render();
  process.on('SIGWINCH', () => { needClear = true; render(); });
  const timer = setInterval(() => {
    let need = false;
    if (S.busy) { S.spin = (S.spin + 1) % TUI_SPIN.length; need = true; }
    if (S.flashUntil && Date.now() >= S.flashUntil) { S.flashUntil = 0; need = true; }
    if (need && !S.inSplash) { try { render(); } catch (e) {} }
  }, 90);
  onlineTimer = setInterval(checkOnline, 90000);
  try { onlineTimer.unref(); } catch (e) {}
  let mouseBuf = '';
  const decoder = new (require('string_decoder').StringDecoder)('utf8');
  stdin.on('data', async (chunk) => {
    const str = decoder.write(chunk);
    if (str === '\x1bOP') { openLinks(); return; }
    if (str === '\x1b[A' || str === '\x1bOA') { histMove(-1); return; }
    if (str === '\x1b[B' || str === '\x1bOB') { histMove(1); return; }
    if (str === '\x1b[D' || str === '\x1bOD') { if (S.cursor > 0) { S.cursor--; render(); } return; }
    if (str === '\x1b[C' || str === '\x1bOC') { if (S.cursor < S.input.length) { S.cursor++; render(); } return; }
    if (str === '\x1b[H' || str === '\x1b[1~' || str === '\x1b[7~') { S.cursor = 0; render(); return; }
    if (str === '\x1b[F' || str === '\x1b[4~' || str === '\x1b[8~') { S.cursor = S.input.length; render(); return; }
    if (str === '\x1b[3~') {
      if (S.cursor < S.input.length) { S.input = S.input.slice(0, S.cursor) + S.input.slice(S.cursor + 1); render(); }
      return;
    }
    if (str === '\x1b[5~') {
      S.offset = (S.offset || 0) + Math.max(3, tuiSize().h - 7);
      render(); return;
    }
    if (str === '\x1b[6~') {
      S.offset = Math.max(0, (S.offset || 0) - Math.max(3, tuiSize().h - 7));
      render(); return;
    }
    if (str.includes('\x1b[<') || str.includes('\x1b[M') || (mouseBuf && str.startsWith('\x1b'))) {
      mouseBuf += str;
      const m = mouseBuf.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (m) {
        mouseBuf = '';
        const btn = parseInt(m[1], 10);
        if (m[4] === 'M') {
          if (btn === 0 || btn === 1) onMouseClick(parseInt(m[2], 10), parseInt(m[3], 10));
          else if (btn === 64) { S.offset = (S.offset || 0) + 3; render(); }
          else if (btn === 65) { S.offset = Math.max(0, (S.offset || 0) - 3); render(); }
        }
        return;
      }
      const leg = mouseBuf.match(/\x1b\[M(.)(.)(.)/);
      if (leg) {
        mouseBuf = '';
        const btn = leg[1].charCodeAt(0) - 32;
        if (btn === 0 || btn === 1) onMouseClick(leg[2].charCodeAt(0) - 32, leg[3].charCodeAt(0) - 32);
        return;
      }
      if (mouseBuf.length > 64) mouseBuf = '';
      return;
    }
    for (const ch of str) {
      if (ch === '\x03') { saveCtx(); saveState(); cleanup(); process.exit(0); return; }
      if (ch === '\x1b') { escAction(); return; }
      if (ch === '\t') { completeInput(); return; }
      if (ch === '\x0c') { S.input = ''; S.cursor = 0; S.compIdx = -1; render(); return; }
      if (ch === '\r' || ch === '\n') {
        if (!S.busy) { await submit(); } else render();
        return;
      }
      if (ch === '\x7f' || ch === '\b') {
        if (S.cursor > 0) { S.input = S.input.slice(0, S.cursor - 1) + S.input.slice(S.cursor); S.cursor--; S.compIdx = -1; }
        continue;
      }
      if (ch >= ' ') {
        if (S.panel) closePanel();
        if (S.confirmUrl && !S.input) {
          if (ch === 'e' || ch === 'E') { confirmResolve(true); return; }
          if (ch === 'h' || ch === 'H') { confirmResolve(false); return; }
        }
        S.input = S.input.slice(0, S.cursor) + ch + S.input.slice(S.cursor);
        S.cursor++;
        S.compIdx = -1;
      }
    }
    render();
  });
  await new Promise(() => {});
}
// ---------- giris ----------
async function main() {
  const rawArgs = process.argv.slice(2);
  if (rawArgs.includes('--version') || rawArgs.includes('-v')) {
    try { console.log(require('./package.json').version); }
    catch (e) { console.log('bilinmiyor'); }
    return;
  }
  const autoOpen = rawArgs.includes('--ac');
  const wantChat = rawArgs.includes('--chat');
  const args = rawArgs.filter((a) => a !== '--ac' && a !== '--tui' && a !== '--chat');
  // pollux: her zaman YENI SEKMEDE acilir (Windows Terminal; yoksa yeni pencere)
  if (process.platform === 'win32' && !args.length && !wantChat && !process.env.POLLUX_TUI_TEST && !process.env.POLLUX_TAB &&
    process.stdin.isTTY && process.stdout.isTTY) {
    const cp2 = require('child_process');
    const env2 = Object.assign({}, process.env, { POLLUX_TAB: '1' });
    let launched = false;
    try {
      cp2.execSync('where wt.exe', { stdio: 'ignore', windowsHide: true });
      const t2 = cp2.spawn('wt.exe', ['-w', '0', 'nt', '--title', 'Pollux', 'cmd', '/c', 'pollux'], { env: env2, detached: true, stdio: 'ignore', windowsHide: true });
      t2.unref();
      launched = true;
    } catch (e) {}
    if (!launched) {
      try {
        const t3 = cp2.spawn('cmd', ['/c', 'start', '', 'cmd', '/c', 'pollux'], { env: env2, detached: true, stdio: 'ignore', windowsHide: true });
        t3.unref();
        launched = true;
      } catch (e) {}
    }
    if (launched) { console.log('✦ Pollux yeni bir sekmede açılıyor...'); return; }
  }
  if (!args.length && !wantChat && (process.env.POLLUX_TUI_TEST || (process.stdin.isTTY && process.stdout.isTTY))) {
    await tuiLoop(); return;
  }
  if (args.length) {
    await ensureKnowledge(cliProgress());
    pendingSiteOpen = null;
    const out = await answer(args.join(' '));
    const shown = out === NOIDEA_TEXT ? '✗ Anlayamadım. "pollux yardım" ile komutları görebilirsin.' : out;
    await streamWords(colorizePlain(shown), 18, (chunk) => process.stdout.write(chunk));
    process.stdout.write('\n');
    const urls = extractUrls(out);
    const direct = urls.filter(isDirectUrl);
    for (const u of direct) openUrl(u);
    const targets = [];
    if (pendingSiteOpen) { targets.push(pendingSiteOpen); pendingSiteOpen = null; }
    for (const u of urls) if (!isDirectUrl(u) && !targets.includes(u)) targets.push(u);
    if (targets.length && autoOpen) {
      for (const u of targets) openUrl(u);
    } else if (targets.length) {
      console.log('⚠ Bu cevap bağlantı içeriyor. Açmak için --ac ekle: pollux --ac "soru"');
      targets.forEach((u) => console.log('    ' + u));
    }
    return;
  }
  const tty = process.stdout.isTTY;
  const CA = tty ? '\x1b[38;5;173m' : '';
  const CB = tty ? '\x1b[1m' : '';
  const CD = tty ? '\x1b[2m' : '';
  const CZ = tty ? '\x1b[0m' : '';
  let online0 = null;
  try {
    online0 = await Promise.race([hasInternet(), new Promise((res) => setTimeout(() => res(null), 1500))]);
  } catch (e) { online0 = null; }
  console.log(CA + '✦' + CZ + CB + ' pollux' + CZ + CD + ' · ' + (online0 === true ? 'çevrimiçi' : 'çevrimdışı') + ' · çıkmak için Ctrl+C' + CZ);
  console.log('');
  await ensureKnowledge(cliProgress());
  process.on('exit', () => { try { console.log(CD + '─'.repeat(64) + CZ); } catch (e) {} });
  process.on('SIGINT', () => { try { process.exit(0); } catch (e) {} });
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => rl.question(CA + '> ' + CZ, async (line) => {
    const t = line.trim();
    if (!t) return ask();
    if (t === '/cikis' || t === '/exit' || t === 'cikis' || t === 'exit' || t === 'quit') { try { rl.close(); } catch (e) {} process.exit(0); return; }
    if (t === '/yardim' || t === '/yardım' || t === 'yardim' || t === 'yardım') { console.log('Komutlar: /yardim, /veri, /cikis, /ogrenilenler'); return ask(); }
    if (t === '/veri') { console.log(dataStats()); return ask(); }
    if (t === '/ogrenilenler') { console.log('Öğrenilen kayıt: ' + learned.length); return ask(); }
    pendingSiteOpen = null;
    const out = await answer(t);
    const shown = out === NOIDEA_TEXT ? '✗ Anlayamadım. "pollux yardım" ile komutları görebilirsin.' : out;
    const site = pendingSiteOpen;
    pendingSiteOpen = null;
    if (site) {
      rl.question(colorizePlain(shown) + CD + ' Devam? [e/h] ' + CZ, (sel) => {
        const s2 = sel.trim().toLocaleLowerCase('tr');
        if (s2 === 'e' || s2 === 'evet') { try { openUrl(site); } catch (e) {} }
        ask();
      });
      return;
    }
    await streamWords(colorizePlain(shown), 18, (chunk) => process.stdout.write(chunk));
    process.stdout.write('\n');
    const urls = extractUrls(out);
    const direct = urls.filter(isDirectUrl);
    const rest = urls.filter((u) => !isDirectUrl(u));
    for (const u of direct) openUrl(u);
    if (!rest.length) return ask();
    console.log(CD + '────────────────────────────────────────────────────────────────' + CZ);
    console.log('⚠ Bu cevapta bağlantılar var:');
    rest.forEach((u, i) => console.log('    ' + (i + 1) + ') ' + u));
    rl.question(CD + 'Açmak için numara yaz · hepsi için "hepsi" · geçmek için Enter ' + CZ, (sel) => {
      const s2 = sel.trim().toLocaleLowerCase('tr');
      if (s2 === 'hepsi' || s2 === 'h') rest.forEach(openUrl);
      else { const n = parseInt(s2, 10); if (n >= 1 && n <= rest.length) openUrl(rest[n - 1]); }
      ask();
    });
  });
  ask();
}
main().catch((e) => { console.error('Hata: ' + e.message); process.exit(1); });
