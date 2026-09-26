// Veritabani genisletme set 8: es ve zit anlamlilar
const PAIRS = [
  ['guzel', 'hoş, alımlı', 'çirkin'], ['buyuk', 'iri, kocaman', 'küçük'],
  ['kucuk', 'minik, ufak', 'büyük'], ['hizli', 'süratli, çabuk', 'yavaş'],
  ['yavas', 'ağır, aheste', 'hızlı'], ['zengin', 'varlıklı', 'fakir'],
  ['fakir', 'yoksul', 'zengin'], ['temiz', 'pak, arı', 'kirli'],
  ['kirli', 'pis, lekeli', 'temiz'], ['kolay', 'basit', 'zor'],
  ['zor', 'güç, çetin', 'kolay'], ['uzun', 'boyu fazla', 'kısa'],
  ['kisa', 'boyu az', 'uzun'], ['yeni', 'taze', 'eski'],
  ['eski', 'köhne, antika', 'yeni'], ['sicak', 'ılık üstü', 'soğuk'],
  ['soguk', 'serin altı', 'sıcak'], ['ac', 'açlık çeken', 'tok'],
  ['tok', 'doymuş', 'aç'], ['mutlu', 'mesut, sevinçli', 'üzgün'],
  ['uzgun', 'kederli, mahzun', 'mutlu'], ['cesur', 'yiğit, korkusuz', 'korkak'],
  ['korkak', 'ödlek', 'cesur'], ['caliskan', 'gayretli', 'tembel'],
  ['tembel', 'miskin', 'çalışkan'], ['akilli', 'zeki', 'aptal'],
  ['guclu', 'kuvvetli', 'zayıf'], ['zayif', 'güçsüz, çelimsiz', 'güçlü'],
  ['genis', 'bol, ferah', 'dar'], ['dar', 'sıkışık', 'geniş'],
  ['derin', 'dip', 'sığ'], ['yuksek', 'yüce', 'alçak'],
  ['alcak', 'basık', 'yüksek'], ['parlak', 'ışıltılı', 'mat'],
  ['karanlik', 'loş, zifiri', 'aydınlık'], ['aydinlik', 'ışıklı', 'karanlık'],
  ['sessiz', 'sakin', 'gürültülü'], ['kalabalik', 'hıncahınç', 'tenha'],
  ['yakin', 'bitişik, civar', 'uzak'], ['uzak', 'ırak', 'yakın'],
  ['dogru', 'haklı, gerçek', 'yanlış'], ['yanlis', 'hatalı', 'doğru'],
  ['baslangic', 'giriş, start', 'bitiş'], ['bitis', 'son, final', 'başlangıç'],
  ['savasci', 'muharip', 'barışçıl'], ['baris', 'sulh', 'savaş'],
  ['ozgur', 'hür, bağımsız', 'tutsak'], ['fakir', 'yoksul', 'zengin'],
  ['cimri', 'pinti, hasis', 'cömert'], ['comert', 'eli açık', 'cimri'],
  ['dost', 'arkadaş', 'düşman'], ['dusman', 'hasım', 'dost'],
  ['saglikli', 'sıhhatli', 'hasta'], ['hasta', 'rahatsız', 'sağlıklı'],
  ['genç', 'delikanlı', 'yaşlı'], ['yasli', 'ihtiyar', 'genç'],
];
const NEW_ENTRIES = [];
const seen = new Set();
for (const [w, es, zit] of PAIRS) {
  const key = w.replace(/[çğıöşü]/g, (c) => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' }[c]));
  if (seen.has(key)) continue;
  seen.add(key);
  NEW_ENTRIES.push({
    k: [key + ' es anlamli', key + ' esanlamli', 'es anlamlisi ' + key],
    a: w[0].toLocaleUpperCase('tr') + w.slice(1) + ' = ' + es + '.',
  });
  NEW_ENTRIES.push({
    k: [key + ' zit anlamli', key + ' zitanlamli', 'zit anlamlisi ' + key],
    a: w[0].toLocaleUpperCase('tr') + w.slice(1) + ' kelimesinin zıt anlamlısı: ' + zit + '.',
  });
}
module.exports = NEW_ENTRIES;
