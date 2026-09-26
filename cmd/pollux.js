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
const KNOWLEDGE = readJson('knowledge.json', { entries: [] }).entries;
const DICT = readJson('dict.json', { pairs: [] }).pairs;
if (!KNOWLEDGE.length) console.error('UYARI: bilgi bankasi bos yuklendi!');
if (!DICT.length) console.error('UYARI: sozluk bos yuklendi!');
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
          // Tek kelimelik soruda 2 harfe kadar ("kanagl"->"kangal")
          if (!singleHit && kt.length >= 5 && qtokens.length <= 2) {
            const tol1 = qtokens.length === 1 ? 2 : 1;
            for (const qw of qtokens) {
              if (qw.length >= 4 && Math.abs(qw.length - kt.length) <= 1 && lev(qw, kt) <= tol1) { singleHit = e; break; }
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
    return f.trim() + ' = ' + fmtNum(v);
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
function cityPlakaAnswer(f) {
  if (!f.includes('plaka')) return null;
  const m = /(\d{1,2})\s*plaka/.exec(f);
  if (m) {
    const city = CITY_PLAKA[parseInt(m[1], 10)];
    if (city) return m[1] + ' plaka ' + city + ' ilinindir.';
    return null;
  }
  for (const code in CITY_PLAKA) {
    if (f.includes(fold(CITY_PLAKA[code].toLocaleLowerCase('tr')))) {
      return CITY_PLAKA[code] + "'nin plakası " + code + "'dir.";
    }
  }
  return null;
}
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
async function aiAsk(query) {
  try {
    const prompt = encodeURIComponent(personaPrompt() +
      'Soruyu ayrıntılı, düzenli ve akıcı Türkçe ile cevapla (gerekirse maddeler kullan, giriş cümlesi kurma): ' +
      query.trim());
    const t = await get('https://text.pollinations.ai/' + prompt, 45000);
    const text = t.trim();
    if (text.length < 30) return null;
    const tr = await translateTR(text.slice(0, 2000));
    return tr;
  } catch (e) { return null; }
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

// ---------- ana cozumleme ----------
const CREDIT = "Beni yapan muazzam kişi Bekir Efe AYAR'dır, isteyenler için Instagram hesabı şudur: https://www.instagram.com/efebekir_slm/";
function todayTR() {
  return new Date().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
}
async function answer(raw) {
  const cmd = raw.toLocaleLowerCase('tr').trim();
  if (!cmd) return 'Bir şey yazmadın.';
  trackStyle(raw);
  const f = fold(cmd);
  const tokens = f.split(' ').map((t) => t.trim()).filter(Boolean);
  const shortMsg = tokens.length <= 3;

  if ((shortMsg && !tokens.includes('misin') && (['merhaba', 'selam', 'hey', 'gunaydin', 'gunaydinlar', 'iyi', 'aksamlar'].some((w) => tokens.includes(w)) || f.includes('iyi aksam') || f.includes('iyi gunler'))) || f === 'naber') {
    return 'Merhaba! Ben Pollux, senin asistanın. Sana nasıl yardımcı olabilirim?';
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
  if (f.includes('seni seviyorum') || f.includes('seni cok seviyorum')) return 'Ben de seni seviyorum. İyi ki varsın.';
  if (f.includes('ozledim')) return 'Ben hep buradayım, özlemene gerek yok.';
  if (f.includes('harikasin') || f.includes('muhtesemsin') || f.includes('cok iyisin') || f.includes('guzelsin') || f.includes('tatlisin') || f.includes('cok zekisin') || f.includes('akillisin')) {
    return pick(['Teşekkür ederim, sen de harikasın!', 'Çok naziksin. Sen de öylesin.', 'Bunu duymak günümü aydınlattı, sağ ol.', 'Mahcup oldum. Sen de bir tanesin.']);
  }
  // Can sıkıntısı / moral bozukluğu: sıcak destek + öneri
  if (f.includes('canim sikiliyor') || f.includes('sikildim') || f.includes('cok sikildim')) {
    return pick(['Kıyamam. Sana bir fıkra anlatayım mı? Ya da bilmece sorayım, ne dersin?', 'Anlıyorum, öyle günler olur. Biraz kafanı dağıtayım: şaka mı istersin, fal mı?', 'Sıkıntıyı birlikte dağıtalım. Taş-kağıt-makas oynayalım mı?']);
  }
  if (f.includes('moralim bozuk') || f.includes('moralsizim') || f.includes('uzgunum') || f.includes('uzgnum') || f.includes('depresyondayim') || f.includes('yalnizim') || f.includes('yalniz hissediyorum')) {
    return pick(['Üzüldüm. Ama şunu bil: ben hep buradayım, dinlerim. Anlatmak ister misin?', 'Kötü hissetmek insani bir şey, geçecek. İstersen sana moral vereyim, ister misin?', 'Yanındayım. Derin bir nefes al, sonra içini dök. Dinliyorum.']);
  }
  if (f.includes('iyi misin')) return 'İyiyim, teşekkürler. Sen iyi misin?';
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
  const whoMade = f.includes('kim') && (f.includes('yapti') || f.includes('yapan') || f.includes('gelistir') ||
    f.includes('kodla') || f.includes('yazdi') || tokens.includes('sahibin') ||
    tokens.includes('sahibi') || f.includes('moderator') || f.includes('yapimci'));
  if (whoMade) return CREDIT;

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
      if (opened.kind === 'site') return opened.name + ' açılıyor: ' + opened.target;
      return opened.name + ' açılıyor.';
    }
    if (tokens.includes('ac') || tokens.includes('acar')) return 'Bu uygulamayı bulamadım. Tam adını yazmayı dene (örn: spotify aç). Yüklüleri görmek için: uygulamaları listele';
  }
  if (f.includes('kac yasindasin') || f.includes('yasin kac')) return 'Çok yeniyim, daha bebek sayılırım.';
  if (f.includes('ne yapabilirsin') || f.includes('neler yapabilirsin') || f === 'yardim' ||
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
    if (!(await hasInternet())) return 'Hava durumunu öğrenmem için internet gerekli. Şu an çevrimdışıyım.';
    const g0 = await guessPlace(raw);
    const w = await weatherNow(g0 || 'İstanbul');
    if (w) return w + (g0 ? '' : ' (İstanbul için gösterdim, şehir yazarsan onunkini söylerim.)');
    return 'O şehrin havasını bulamadım. Şehir adını net yazmayı dene.';
  }
  if (f.includes('dolar') || f.includes('euro') || f.includes('sterlin') || f.includes('altin fiyati') || f.includes('doviz')) {
    if (!(await hasInternet())) return 'Güncel kurlar için internet gerekli. Şu an çevrimdışıyım.';
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

  // hesap + birim + sicaklik ONCE (saat/tarih niyetlerini ezmesin: "1 saat kac dakika")
  const math = mathAnswer(f);
  if (math) return math;
  const unit = unitAnswer(f);
  if (unit) return unit;
  const temp = tempAnswer(f);
  if (temp) return temp;

  // tarih / saat
  const now = new Date();
  if ((f.includes('saat') && f.includes('kac')) || f === 'saat' || f === 'saat kac') {
    const wc = worldClock(f);
    if (wc) return wc;
    return 'Saat ' + now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }
  if (f.includes('tarihte bugun') || f.includes('bugun tarihte ne oldu')) {
    const md = String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
    const ev = { '01-01': 'Yılbaşı. Yeni yılın ilk günü.', '03-18': '18 Mart Çanakkale Zaferi.', '04-23': "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı. TBMM 1920'de bugün açıldı.", '05-19': "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı.", '08-30': '30 Ağustos Zafer Bayramı.', '10-29': "29 Ekim Cumhuriyet Bayramı.", '11-10': "10 Kasım Atatürk'ü Anma Günü." }[md];
    return ev || 'Bugüne özel kayıtlı bir olay yok. Başka gün de sorabilirsin.';
  }
  if (f.includes('tarih') || f.includes('bugun ne') || f.includes('gunlerden') || f.includes('hangi gundeyiz')) return 'Bugün ' + todayTR();
  if (f.includes('hangi yil') || f === 'yil kac' || f.includes('kac yilindayiz')) return 'Şu an ' + now.toLocaleDateString('tr-TR', { year: 'numeric' }) + ' yılındayız.';
  if (f.includes('hangi ay') || f === 'ay kac') return 'Şu an ' + now.toLocaleDateString('tr-TR', { month: 'long' }) + ' ayındayız.';
  // "dun"/"yarin" kelime olarak gecmeli ("dunya"nin icindeki "dun" tuzagi)
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
  const qf = raw.toLocaleLowerCase('tr').trim();
  for (const p of ['araştır ', 'arastir ', 'ara ', 'bilgi ver ', 'hakkında bilgi ver ', 'hakkinda bilgi ']) {
    if (qf.startsWith(p)) { query = raw.trim().slice(p.length).trim(); break; }
  }
  if (!query.trim()) query = raw;
  // gundem: genel ya da konulu ("galatasaray haberleri") — bankadan once (canli veri)
  if (f.includes('gundem') || f.includes('son dakika') || f.includes('son haber') ||
    f.includes('bugun ne oldu') || f.includes('turkiyede ne oluyor') || f.includes('haberler') ||
    f.includes('haberi') || f.includes('haberin')) {
    if (!(await hasInternet())) return 'Gündemi öğrenmem için internet gerekli. Şu an çevrimdışıyım.';
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
  const kb = findKnowledge(query, learned.map((e) => ({ k: [e.q], a: e.a })));
  if (kb) return kb;

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
    return 'Şu an çevrimdışıyım, o yüzden bunu araştıramadım. Ama elimden çok şey gelir: hesap yaparım, birim çeviririm, saat-tarih söylerim, uygulama açarım. İstersen farklı şekilde sormayı dene, belki kayıtlarımdadır.';
  }
  const r = await researcher(query);
  if (r) {
    const links = (r.urls && r.urls.length ? r.urls : (r.url ? [r.url] : [])).slice(0, 5);
    const linkLine = links.length ? '\nBağlantılar:\n' + links.join('\n') : '';
    const base = r.title.replace(/\s*-\s*(wikipedia|vikipedi)$/i, '').trim();
    const dup = base && (r.answer.startsWith(r.title) ||
      r.answer.toLowerCase().startsWith(base.toLowerCase()));
    const body = dup ? r.answer : r.title + ': ' + r.answer;
    const full = body + '\n(Kaynak: ' + r.source + ')' + linkLine;
    learn(query, full);
    return full;
  }
  const aiText = await aiAsk(query);
  if (aiText) {
    learn(query, aiText + '\n(Yapay zeka yanıtı)');
    return aiText + '\n(Yapay zeka yanıtı)';
  }
  return personaPick(
    [C('Hmm, bunu tam çıkaramadım ya. Başka türlü anlatsana? Kısa sorarsan daha iyi yakalarım.')],
    [C('Hmm, bunu tam çıkaramadım. Biraz daha farklı anlatır mısın? İpucu: kısa ve net sorular en iyi sonucu verir (örn: "Van kedisi nedir").')],
    [C('Affedersiniz, anlayamadım. Farklı şekilde ifade eder misiniz?')]
  );
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
function userUsesEmoji() { return style.emoji >= 2; }
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

// ---------- TUI (fotograftaki tasarim) ----------
// Kullanim: pollux --tui
// Fareyle "My Links"e tiklanir (Windows Terminal destekler), klavyeden /link de acar.
const LINKS_URL = 'https://bekirefeayar.github.io/kisisel-linklerim/';
// Nokta-matris logo (fotograf: yogun nokta + hafif golge)
const LOGO_RAW = [
  '#####  ###  #      #      #   # #   #',
  '#   # #   # #      #      #   # #   #',
  '#   # #   # #      #      #   #  # # ',
  '##### #   # #      #      #   #   #  ',
  '#     #   # #      #      #   #  # # ',
  '#     #   # #      #      #   # #   #',
  '#      ###  #####  #####   ###  #   #',
];
function tuiSize() {
  return {
    w: Math.max(40, process.stdout.columns || 80),
    h: Math.max(20, process.stdout.rows || 24),
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
async function tuiLoop() {
  const stdin = process.stdin, stdout = process.stdout;
  const { w, h } = tuiSize();
  const state = {
    input: '', cursor: 0, lines: [], offset: 0,
    status: "My Links'e tıkla / F1 / /link • PgUp/PgDn: kaydır • çıkış: /cikis",
    statusUntil: 0, busy: false, pendingUrls: [],
    linkRow: 0, linkCol: 0,
  };
  const DIM = '\x1b[2m', BRIGHT = '\x1b[1m', RESET = '\x1b[0m';
  const AGRAY = '\x1b[38;5;250m', GREEN = '\x1b[92m', MRED = '\x1b[31m';
  const GRAY = '\x1b[90m', GOLD = '\x1b[33m', BOXBG = '\x1b[48;5;236m';

  function logoLines() {
    // Golge once (gri, 1 saga + 1 asagi), sonra noktalar (beyaz)
    const rows = LOGO_RAW.map((r) => r.split(''));
    const W = rows[0].length, H = rows.length;
    const out = [];
    for (let y = 0; y <= H; y++) {
      let line = '';
      for (let x = 0; x <= W; x++) {
        const main = y < H && x < W && rows[y][x] === '#';
        const sh = y > 0 && y - 1 < H && x > 0 && x - 1 < W && rows[y - 1][x - 1] === '#';
        if (main) line += BRIGHT + '░' + RESET;
        else if (sh) line += GRAY + '░' + RESET;
        else line += ' ';
      }
      out.push(line.replace(/\s+$/, ''));
    }
    return out;
  }

  function push(text, who, topics) {
    // Ham paragraf sakla; sarma + renklendirme render'da (pencere boyuna uyar)
    for (const para of String(text).split('\n')) {
      state.lines.push({ para, who, topics: who === 'a' ? (topics || []) : [] });
    }
    while (state.lines.length > 300) state.lines.shift();
  }
  // Konu kelimelerini yesil yap (buyuk-kucuk harf duyarsiz; uzun once)
  function greenTopics(line, topics) {
    let out = line;
    const sorted = [...new Set(topics)].filter((t) => t && t.length >= 4)
      .sort((a, b) => b.length - a.length);
    const done = [];
    for (const t of sorted) {
      const low = t.toLocaleLowerCase('tr');
      if (done.some((d) => d.includes(low))) continue; // uzun olani zaten boyadi
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        const re = new RegExp(esc, 'gi');
        if (!re.test(out)) continue;
        out = out.replace(re, (m) => GREEN + m + AGRAY);
        done.push(low);
      } catch (e) {}
    }
    return out;
  }
  function flash(msg) {
    state.status = msg;
    state.statusUntil = Date.now() + 2500;
  }
  function visibleLen(s) { return s.replace(/\x1b\[[0-9;]*m/g, '').length; }
  function render() {
    const { w, h } = tuiSize();
    const logo = logoLines();
    const logoW = Math.max(...logo.map(visibleLen));
    const topPad = 2;
    let s = '\x1b[H\x1b[2J\x1b[?25l' + '\n'.repeat(topPad);
    // Logo (ortali, nokta-matris + golge) — biraz asagida
    for (const row of logo) {
      s += ' '.repeat(Math.max(0, Math.floor((w - logoW) / 2))) + row + '\n';
    }
    // Sohbet: logonun altinda, biraz asagidan baslar.
    // Kullanici ortali; asistan ortalanmis sutunda sola dayali, paragraflar aralikli,
    // konu kelimeleri yesil.
    const boxTop = h - 3;
    const gap = 2;
    const colW = Math.min(w - 8, 92);
    const colX = Math.max(0, Math.floor((w - colW) / 2));
    const histRows = Math.max(0, boxTop - (topPad + logo.length + gap));
    // Gorunen satir sayisini once hesapla (paragraf bosluklari dahil)
    function expanded() {
      const rows = [];
      for (const m of state.lines) {
        const body = m.who === 'u' ? '> ' + m.para : m.para;
        for (const ln of tuiWrap(body, colW)) rows.push({ t: ln, who: m.who, topics: m.topics });
        rows.push({ gap: true });
      }
      if (rows.length && rows[rows.length - 1].gap) rows.pop();
      return rows;
    }
    const rows = expanded();
    const off = Math.min(state.offset, Math.max(0, rows.length - histRows));
    state.offset = off;
    const tail = off === 0 ? rows.slice(-histRows)
      : rows.slice(Math.max(0, rows.length - histRows - off), rows.length - off);
    for (let i = 0; i < gap; i++) s += '\n';
    for (const ln of tail) {
      if (ln.gap) { s += '\n'; continue; }
      if (ln.who === 'u') {
        s += ' '.repeat(Math.max(0, Math.floor((w - visibleLen(ln.t)) / 2))) + BRIGHT + ln.t + RESET + '\n';
      } else {
        let t = ln.t;
        if (t.startsWith('Bağlantı:')) {
          // Etiket gri, adres boguk kirmizi
          t = 'Bağlantı: ' + MRED + t.slice('Bağlantı:'.length).trim() + AGRAY;
        } else {
          if (!t.startsWith('[!]')) t = greenTopics(t, ln.topics);
          // Kaynak + yapay zeka etiketi boguk kirmizi (civitmaz)
          t = t.replace(/\(Kaynak: [^)]+\)/g, (m) => MRED + m + AGRAY)
               .replace(/\(Yapay zeka yanıtı\)/g, (m) => MRED + m + AGRAY);
        }
        s += ' '.repeat(colX) + AGRAY + t + RESET + '\n';
      }
    }
    const used = topPad + logo.length + gap + tail.length;
    for (let i = used; i < boxTop; i++) s += '\n';
    // Giris kutusu: 1. satir ipucu, 2. satir yazilan (fotograf gibi)
    const bw = Math.min(w - 8, 64);
    const bx = Math.max(0, Math.floor((w - bw) / 2));
    const iw = bw - 4;
    const hintText = 'Ask anything... "Van kedisi nedir"';
    let shown = state.input;
    if (visibleLen(shown) > iw) shown = shown.slice(shown.length - iw);
    s += ' '.repeat(bx) + BOXBG + GOLD + '▍' + RESET + BOXBG + ' ' + DIM + hintText;
    s += ' '.repeat(Math.max(0, bw - 3 - visibleLen(hintText))) + ' ' + RESET + '\n';
    s += ' '.repeat(bx) + BOXBG + GOLD + '▍' + RESET + BOXBG + ' ' + BRIGHT + shown;
    s += ' '.repeat(Math.max(0, bw - 3 - visibleLen(shown))) + ' ' + RESET + '\n';
    // Alt durum satiri: ~ solda (silil), My Links sagda (beyaz)
    const link = 'My Links';
    state.linkRow = h;
    state.linkCol = w - 7;
    const status = (Date.now() < state.statusUntil || state.busy)
      ? (state.busy ? 'düşünüyor...' : state.status) : '';
    let bar = DIM + '~' + RESET;
    let barVis = 1;
    if (status) {
      bar += '  ' + DIM + status + RESET;
      barVis = 1 + 2 + visibleLen(status);
    }
    const maxBar = Math.max(0, state.linkCol - 2);
    if (barVis > maxBar) { bar = DIM + '~' + RESET; barVis = 1; }
    s += bar + ' '.repeat(Math.max(1, state.linkCol - barVis - 1)) + BRIGHT + link + RESET;
    stdout.write(s);
  }
  function cleanup() {
    try { stdout.write('\x1b[?1000l\x1b[?1006l\x1b[?25h' + RESET + '\n'); } catch (e) {}
    try { stdin.setRawMode(false); } catch (e) {}
    try { stdin.removeAllListeners('data'); } catch (e) {}
  }
  async function submit() {
    const t = state.input.trim();
    state.input = ''; state.cursor = 0; state.offset = 0;
    if (!t) { render(); return; }
    if (t === '/cikis' || t === '/exit' || t === 'cikis' || t === 'exit' || t === 'quit') {
      cleanup(); process.exit(0); return;
    }
    if (t === '/link' || t === 'linklerim' || t === 'linkler') {
      push(t, 'u'); openUrl(LINKS_URL); flash('Bağlantıların açılıyor...');
      render(); return;
    }
    if (/^[0-9]+$/.test(t) && state.pendingUrls.length) {
      const n = parseInt(t, 10);
      if (n >= 1 && n <= state.pendingUrls.length) {
        openUrl(state.pendingUrls[n - 1]);
        flash('Açılıyor: ' + state.pendingUrls[n - 1]);
      }
      state.pendingUrls = [];
      render(); return;
    }
    push(t, 'u');
    state.busy = true; state.pendingUrls = [];
    render();
    try {
      const out = await answer(t);
      state.busy = false;
      const qw = cleanTopic(t).split(' ').filter((x) => x);
      const topics = qw.slice();
      for (let i = 0; i + 1 < qw.length; i++) topics.push(qw[i] + ' ' + qw[i + 1]);
      // Akici yaz: once tum metni paragrafla, sonra kelime kelime buyut
      const paras = String(out).split('\n');
      const msg = { para: '', who: 'a', topics };
      state.lines.push(msg);
      const full = paras.join('\n');
      const words = full.split(/(\s+)/);
      let wi = 0;
      await new Promise((resolve) => {
        const step = () => {
          let chunk = '';
          for (let k = 0; k < 3 && wi < words.length; k++, wi++) chunk += words[wi];
          msg.para += chunk;
          render();
          if (wi >= words.length) resolve();
          else setTimeout(step, 35);
        };
        step();
      });
      const urls = extractUrls(out);
      if (urls.length) {
        state.pendingUrls = urls;
        push('[!] Açmak için numarayı yaz (' + urls.map((u, i) => (i + 1) + ') ' + u).join('  ') + ')', 'a');
      }
    } catch (e) {
      state.busy = false;
      push('Hata: ' + e.message, 'a');
    }
    render();
  }

  function openLinks() {
    flash('Bağlantıların açılıyor...');
    render();
    try {
      const cp = require('child_process');
      const u = LINKS_URL.replace(/"/g, '');
      // 2 yontem sirasiyla dene (biri calisir)
      cp.exec('start "" "' + u + '"', { windowsHide: true }, (err) => {
        if (err) {
          cp.exec('rundll32 url.dll,FileProtocolHandler "' + u + '"', { windowsHide: true }, (err2) => {
            if (err2) flash('Açılamadı, adres: ' + LINKS_URL);
            render();
          });
        }
      });
    } catch (e) {
      flash('Açılamadı, adres: ' + LINKS_URL);
      render();
    }
  }
  function onLinkClick(x, y) {
    if (y === state.linkRow && x >= state.linkCol && x < state.linkCol + 8) {
      openLinks();
      return true;
    }
    return false;
  }

  stdin.setRawMode(true);
  stdin.resume();
  stdout.write('\x1b[?1000h\x1b[?1006h');
  render();
  process.on('SIGWINCH', render);
  let mouseBuf = '';
  const decoder = new (require('string_decoder').StringDecoder)('utf8');
  stdin.on('data', async (chunk) => {
    const str = decoder.write(chunk);
    // F1 / F2: baglantilari acar (fare calismazsa garanti yol)
    if (str === '\x1bOP' || str === '\x1bOQ') { openLinks(); return; }
    // Fare SGR: ESC [ < b ; x ; y M/m
    mouseBuf += str;
    const m = mouseBuf.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (m) {
      mouseBuf = '';
      const btn = parseInt(m[1], 10);
      if (m[4] === 'M' && (btn === 0 || btn === 1)) {
        onLinkClick(parseInt(m[2], 10), parseInt(m[3], 10));
      }
      return;
    }
    // Fare eski kip: ESC [ M Cb Cx Cy (her biri +32)
    const leg = mouseBuf.match(/\x1b\[M(.)(.)(.)/);
    if (leg) {
      mouseBuf = '';
      const btn = leg[1].charCodeAt(0) - 32;
      if (btn === 0 || btn === 1) {
        onLinkClick(leg[2].charCodeAt(0) - 32, leg[3].charCodeAt(0) - 32);
      }
      return;
    }
    if (mouseBuf.length > 32) mouseBuf = '';
    if (str.startsWith('\x1b[') && !m) {
      if (str === '\x1b[5~') { // PgUp: geriye sar
        state.offset = Math.min(state.lines.length, state.offset + Math.max(1, tuiSize().h - 12));
        render(); return;
      }
      if (str === '\x1b[6~') { // PgDn: asagiya
        state.offset = Math.max(0, state.offset - Math.max(1, tuiSize().h - 12));
        render(); return;
      }
      return; // ok tuslari vb. yoksay
    }
    for (const ch of str) {
      if (ch === '\x03' || ch === '\x1b') { cleanup(); process.exit(0); return; } // Ctrl+C / Esc
      else if (ch === '\r' || ch === '\n') {
        if (!state.busy) await submit();
        else render();
        return;
      }
      else if (ch === '\x7f' || ch === '\b') {
        if (state.cursor > 0) {
          state.input = state.input.slice(0, state.cursor - 1) + state.input.slice(state.cursor);
          state.cursor--;
        }
      } else if (ch >= ' ' && ch !== '\x7f') {
        state.input = state.input.slice(0, state.cursor) + ch + state.input.slice(state.cursor);
        state.cursor++;
      }
    }
    render();
  });
  await new Promise(() => {});
}

// ---------- giris ----------
async function main() {
  const rawArgs = process.argv.slice(2);
  const autoOpen = rawArgs.includes('--ac');
  const wantChat = rawArgs.includes('--chat');
  const args = rawArgs.filter((a) => a !== '--ac' && a !== '--tui' && a !== '--chat');
  if (!args.length && !wantChat && process.stdin.isTTY && process.stdout.isTTY) {
    await tuiLoop(); return;
  }
  if (args.length) {
    const out = await answer(args.join(' '));
    await streamWords(out, 18, (chunk) => process.stdout.write(chunk));
    process.stdout.write('\n');
    const urls = extractUrls(out);
    if (urls.length && autoOpen) {
      for (const u of urls) openUrl(u);
    } else if (urls.length) {
      console.log('\n[!] Bu cevap bağlantı içeriyor. Açmak için --ac ekle: pollux --ac "soru"');
      urls.forEach((u) => console.log('    ' + u));
    }
    return;
  }
  console.log('Pollux, senin asistanın. (çıkış: /cikis)');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = () => rl.question('sen> ', async (line) => {
    const t = line.trim();
    if (!t) return ask();
    if (t === '/cikis' || t === '/exit' || t === 'cikis' || t === 'exit' || t === 'quit') { rl.close(); return; }
    if (t === '/yardim') { console.log('Komutlar: /yardim, /cikis, /ogrenilenler'); return ask(); }
    if (t === '/ogrenilenler') { console.log('Öğrenilen kayıt: ' + learned.length); return ask(); }
    const out = await answer(t);
    process.stdout.write('pollux> ');
    await streamWords(out, 18, (chunk) => process.stdout.write(chunk));
    process.stdout.write('\n');
    const urls = extractUrls(out);
    if (!urls.length) return ask();
    console.log('[!] Uygulamadan ayrılıyorsun. Bu bağlantı seni şu siteye götürüyor:');
    urls.forEach((u, i) => console.log('    [' + (i + 1) + '] ' + u));
    rl.question('Açayım mı? (numara / hepsi / geç) ', (sel) => {
      const s = sel.trim().toLowerCase();
      if (s === 'hepsi' || s === 'h' || s === 'hepsini ac') {
        urls.forEach(openUrl);
      } else {
        const n = parseInt(s, 10);
        if (n >= 1 && n <= urls.length) openUrl(urls[n - 1]);
      }
      ask();
    });
  });
  ask();
}
main().catch((e) => { console.error('Hata: ' + e.message); process.exit(1); });
