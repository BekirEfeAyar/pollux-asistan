// Pollux eğitim bataryası: bilgi bankası eşleşme testleri (çevrimdışı, deterministik)
// Çalıştır: node test-battery.js
const fs = require('fs');
const path = require('path');
const https = require('https');

const DIR = __dirname;
const src = fs.readFileSync(path.join(DIR, 'pollux.js'), 'utf8');
function section(start, end) {
  return src.slice(src.indexOf(start) + start.length, src.indexOf(end));
}
// Yardımcılar (fold, lev, ...) + bilgi bankası motoru
eval(section('// ---------- yardimcilar ----------', '// ---------- bilgi bankasi ----------'));
const KNOWLEDGE = JSON.parse(
  fs.readFileSync(path.join(DIR, 'knowledge.json'), 'utf8').replace(/^﻿/, '')
).entries;
eval(section('// ---------- bilgi bankasi ----------', '// ---------- sozluk ----------'));
const DICT = JSON.parse(
  fs.readFileSync(path.join(DIR, 'dict.json'), 'utf8').replace(/^﻿/, '')
).pairs;
eval(section('// ---------- sozluk ----------', '// ---------- hesap ----------'));

const TESTS = [
  // [soru, beklenen-kelime (cevapta geçmeli), etiket]
  ["Fransa'nın başkenti neresi", 'Paris', 'birebir'],
  ['fransanin baskenti neresi', 'Paris', 'ek-toleransı'],
  ['almayna baskenti neresi', 'Berlin', 'yazım-yanlışı (transpozisyon)'],
  ["başkenti neresi Fransa'nın", 'Paris', 'devrik'],
  ["Fransa'nın baş şehri hangisi", 'Paris', 'eşanlamlı (baş şehir)'],
  ['fransa baskent', 'Paris', 'eksiz-yazım'],
  ['kedisi Van nedir', 'Van kedisi', 'devrik'],
  ['vang kedisi', 'Van', 'yazım-yanlışı'],
  ['kangal kopeci', 'Kangal', 'yazım-yanlışı'],
  ['canakkale savasi ne zaman', 'Çanakkale', 'birebir+ek'],
  ['kurtulus savasini kim kazandi', 'Kurtuluş', 'ek+eşanlamlı'],
  ['istanbulu kim fethetti', 'Fatih', 'ek+eşanlamlı (fethetti)'],
  ['1 dunya savasi', 'Dünya', 'noktalamasız-sayı'],
  ['everest kac metre yukseklikte', '8.848', 'tek-kelime-önek'],
  ['ankara baskent mi', 'Ankara', 'soru-eki'],
  ['van kedisi', 'Van kedisi', 'birebir'],
  ['zxyzq quxqw', null, 'NEGATİF: anlamsız girdi eşleşmemeli'],
  ['kimal derse', null, 'NEGATİF: benzer ama alakasız girdi eşleşmemeli'],
  // ---- 2. tur: sıra sayıları, yeni eşanlamlılar, ağır yazım bozuklukları ----
  ['ikinci dunya savasi', '1939', 'sıra-sayı (2. DS)'],
  ['2. dunya savasi', '1939', 'noktalı-sayı'],
  ['birinci dunya savasi kac yilinda basladi', '1914', 'sayı + ek kelime'],
  ['ilk ucak kim yapti', 'Wright', 'ilk->birinci'],
  ['osmanli devleti ne zaman kuruldu', '1299', 'devlet->ülke + ek'],
  ['frnsa baskenti', 'Paris', 'harf-düşmesi'],
  ['fransa bskenti', 'Paris', 'harf-düşmesi 2'],
  ['fransaa baskenti neresi', 'Paris', 'harf-tekrarı'],
  ['farnsa baskenti', 'Paris', 'transpozisyon-uzun'],
  ['neresidir almanyanin baskenti', 'Berlin', 'devrik + soru-eki'],
  ['japonya telefon kodu nedir', '+81', 'birebir'],
  ['wright kardesler', 'Wright', 'tek-kelime + çoğul'],
  ['kralice elizabeth kac yasinda', null, 'NEGATİF: bankada yok'],
  ['uzay istasyonu nedir', 'Uluslararası', 'birebir-kısa'],
  ['ay nedir', "Dünya'nın", '2-harf (ay)'],
  ['su nedir', 'Su,', '2-harf (su)'],
  ['ay cok guzel bir aksam', null, 'NEGATİF: 2-harf uzun cümlede eşleşmemeli'],
  // ---- 3. tur: tek-kelime toleransı + karıştırma testleri ----
  ['kanal', 'Kangal', 'tek-kelime harf-düşmesi'],
  ['kanal nedir', 'Kangal', 'tek-kelime soru-kalıbı'],
  ['zurfa nedir', 'Zürafa', 'tek-kelime yazım'],
  ['penuen', 'Penguen', 'tek-kelime harf-düşmesi 2'],
  ['van kedsi', 'Van kedisi', 'kısa-çapa + yazım'],
  ['ikinci dunya savasi kac yil surdu', '1939', 'karıştırma: 2.DS (1.DS değil)'],
  ['birinci dunya savasi kac yil surdu', '1914', 'karıştırma: 1.DS (2.DS değil)'],
  ['fatih sultan mehmet kimdir', 'Fatih', 'karıştırma: fatih'],
  ['kurtulus savasi ne zaman basladi', '1919', 'karıştırma: kurtuluş'],
  ['kangal kopegi nerelidir', 'Sivas', 'nitelik-sorusu'],
  ['kediler gunluk kac saat uyur', 'Kediler', 'çoğul + genel'],
  // ---- 4. tur: transpozisyon toleransı ----
  ['kanagl', 'Kangal', 'transpozisyon-tek'],
  ['penugen', 'Penguen', 'transpozisyon-tek 2'],
  ['balnia', 'balina', 'transpozisyon-tek 3'],
  ['kelbeek nedir', 'Kelebek', 'transpozisyon-soru'],
  // ---- 5. tur: genisletilmis veritabani ----
  ['bae para birimi nedir', 'dirhem', 'yeni: BAE'],
  ['guney kore para birimi', 'won', 'yeni: won'],
  ['jupiter hangi gezegen', 'Jüpiter', 'yeni: jüpiter'],
  ['altin sembolu nedir', 'Au', 'yeni: altın'],
  ['c vitamini nelerde var', 'portakal', 'yeni: C vitamini'],
  ['tantuni nedir', 'Mersin', 'yeni: tantuni'],
  ['mihlama nedir', 'Karadeniz', 'yeni: mıhlama'],
  ['dunya kac yasinda', 'milyar', 'yeni: dünya yaşı'],
  ['tbmm ne zaman acildi', '1920', 'yeni: TBMM'],
  ['mondros ne zaman', '1918', 'yeni: mondros'],
  ['yanik ilk yardim', 'soğuk su', 'yeni: yanık'],
  ['elektrik voltaj kac', '220', 'yeni: voltaj'],
  ['en buyuk col hangisi', 'Sahra', 'yeni: çöl'],
  ['en derin nokta neresi', 'Mariana', 'yeni: mariana'],
  ['insanda kac kemik var', '206', 'yeni: kemik'],
  ['kan gruplari nelerdir', 'AB', 'yeni: kan'],
  ['kitalar hangileri', 'Asya', 'yeni: kıta'],
  ['mersin tantunisi nedir', 'Mersin', 'yeni: tantuni-2'],
  ['kayseri mantisi', 'Kayseri', 'yeni: mantı'],
  ['sutlac nasil yapilir', 'sütlaç', 'yeni: sütlaç'],
  // ---- 6. tur: set 5 ----
  ['futbol kac kisi oynar', '11 kişi', 'yeni: futbol'],
  ['maraton kac km', '42 kilometre', 'yeni: maraton'],
  ['asal sayi nedir', '2, 3, 5', 'yeni: asal'],
  ['pi sayisi kactir', "3,14'tür", 'yeni: pi'],
  ['turk alfabesi kac harf', '29 harf', 'yeni: alfabe'],
  ['grip mi soguk alginligi mi', 'dinlenme', 'yeni: grip'],
  ['gunde kac litre su icmeli', '2 litre', 'yeni: su-miktarı'],
  ['gokkusagi nasil olusur', 'kırılmasıyla', 'yeni: gökkuşağı'],
  ['guclu sifre nasil olur', 'farklı olur', 'yeni: şifre'],
  ['satranc nasil oynanir', 'mat etmek', 'yeni: satranç'],
  // ---- 7. tur: fauna/flora + sozluk ----
  ['kaplan ne yer', 'kedi türüdür', 'yeni: kaplan'],
  ['kanguru nerede yasar', 'Avustralya', 'yeni: kanguru'],
  ['ahtapot kac kollu', 'sekiz kol', 'yeni: ahtapot'],
  ['baykus gece gorur mu', 'gece avlanan', 'yeni: baykuş'],
  ['karinca ne yer', 'kolonilerde', 'yeni: karınca'],
  ['orkide nedir', 'çiçekli', 'yeni: orkide'],
  ['zeytin nerede yetisir', 'Ege', 'yeni: zeytin'],
  ['butterfly ne demek', 'kelebek', 'sözlük: butterfly', 'dict'],
  ['golge ingilizce ne', 'shadow', 'sözlük: gölge', 'dict'],
  ['sivrisinekten nasil korunur', 'sineklik', 'yeni: sivrisinek'],
  // ---- 8. tur: es/zit anlam ----
  ['guzel es anlamli', 'hoş', 'eş-anlam'],
  ['korkak zit anlamli', 'cesur', 'zıt-anlam'],
  ['hizli es anlamlisi nedir', 'süratli', 'eş-anlam-2'],
  ['tembel zit anlami', 'çalışkan', 'zıt-anlam-2'],
  // ---- 9. tur: meslek/tasit/gunluk ----
  ['pilot ne is yapar', 'uçağı uçurur', 'yeni: pilot'],
  ['hakim savci farki', 'karar verir', 'yeni: hakim'],
  ['hizli tren kac km hiz', '250 km', 'yeni: hızlı tren'],
  ['yumurta taze mi nasil anlasilir', 'yatay', 'yeni: yumurta'],
  ['veteriner ne yapar', 'tedavi eder', 'yeni: veteriner'],
  // ---- 10. tur: cografya + uzay ----
  ['turkiye kac bolge', '7 coğrafi', 'yeni: bölge'],
  ['kizilirmak ne kadar uzun', 'en uzun', 'yeni: kızılırmak'],
  ['aya ilk kim ayak basti', 'Armstrong', 'yeni: armstrong'],
  ['gunes tutulmasi nasil olur', 'Ay Güneş', 'yeni: tutulma'],
  ['ilk turk uzayda kim', 'Gezeravcı', 'yeni: gezeravcı'],
  // ---- 11. tur: kisiler + icatlar ----
  ['fatih sultan mehmet kac yasinda fethetti', '21 yaşında', 'yeni: fetih yaşı'],
  ['ataturk ilkeleri nelerdir', 'oktur', 'yeni: ilkeler'],
  ['telefonu kim buldu', 'Bell', 'yeni: telefon'],
  ['ilk kadin pilot kim', 'Gökçen', 'yeni: pilot-kadın'],
  ['penisilin antibiyotik kim', 'Fleming', 'yeni: penisilin'],
  // ---- 12. tur: muzik + gelenek + evcil ----
  ['baglama nedir', 'halk müziği', 'yeni: bağlama'],
  ['kina gecesi ne zaman', 'düğünden önce', 'yeni: kına'],
  ['kedi mamasi ne verilir', 'inek sütü verilmez', 'yeni: mama'],
  ['iftar sahur farki', 'akşam yemeği', 'yeni: iftar'],
  // ---- 23. tur: sanat + bayram ----
  ['ebru nasil yapilir', 'su üstünde', 'yeni: ebru'],
  ['nevruz ne zaman', '21 Mart', 'yeni: nevruz'],
  ['hidrellez ne zaman', '6 Mayıs', 'yeni: hıdırellez'],
  ['kilim hali farki', 'düğümlü', 'yeni: kilim'],
  // ---- 26. tur: ruya ----
  ['ruyamda deniz gordum', 'ferahlığı', 'yeni: rüya-deniz'],
  ['ruyada altin gormek ne demek', 'kısmet', 'yeni: rüya-altın'],
  ['ruyamda altin gordum', 'kısmet', 'yeni: rüya-gecmis'],
  // ---- 27. tur: dilbilgisi ----
  ['soru eki mi nasil yazilir', 'ayrı yazılır', 'yeni: soru-eki'],
  ['de da baglaci nasil', 'ayrı yazılır', 'yeni: de-da'],
  ['sestes sozcuk nedir', 'yazılışı aynı', 'yeni: sesteş'],
  // ---- 28. tur: matematik ----
  ['daire alan formulu', 'πr²', 'yeni: daire'],
  ['pisagor bagintisi', 'a²+b²', 'yeni: pisagor'],
  ['olasilik nasil hesaplanir', 'tüm durum', 'yeni: olasılık'],
  // ---- 24. tur: oyun + masal ----
  ['mangala nasil oynanir', 'kuyulu', 'yeni: mangala'],
  ['okeyde per nedir', 'per dizmek', 'yeni: okey'],
  ['keloglan kimdir', 'masallarının', 'yeni: keloğlan'],
  ['kirmizi baslikli kiz masali', 'kurda', 'yeni: kırmızı-başlık'],
  // ---- 25. tur: deyim ----
  ['pireyi deve yapmak ne demek', 'büyütmek', 'yeni: pire'],
  ['devede kulak ne demek', 'küçük parça', 'yeni: devede-kulak'],
  ['afiyet olsun ne zaman', 'yemek yiyene', 'yeni: afiyet'],
  ['gozden dusmek ne demek', 'değerini yitirmek', 'yeni: gözden-düşme'],
  // ---- 30. tur: acil + afet ----
  ['orman yangini hangi numara', '177', 'yeni: orman'],
  ['deprem cantasinda ne olur', 'düdük', 'yeni: çanta'],
  ['dogalgaz kacaginda ne yapilir', '187', 'yeni: gaz'],
  ['kidem tazminati sarti', '1 yıl', 'yeni: kıdem'],
  // ---- 31. tur: felsefe ----
  ['sokrates ne demis', 'soru sorma', 'yeni: sokrates'],
  ['tumevarim tumdengelim farki', 'örnekten kurala', 'yeni: tümevarım'],
  ['felsefe ne demek', 'bilgelik sevgisi', 'yeni: felsefe'],
  // ---- 32. tur: kahvalti + sokak ----
  ['sucuklu yumurta nasil', 'klasiğidir', 'yeni: sucuklu'],
  ['balik ekmek nerede', 'Eminönü', 'yeni: balık-ekmek'],
  ['maden suyu soda farki', 'doğal', 'yeni: maden'],
  ['kefir nedir', 'fermente', 'yeni: kefir'],
  // ---- 33. tur: alet ----
  ['buzdolabi kac derece olmali', '4,', 'yeni: dolap'],
  ['kombi bakimi ne ise yarar', 'verimi artırır', 'yeni: kombi'],
  ['vida dubel farki', 'Alçıpanda', 'yeni: vida'],
  // ---- 34. tur: kumas ----
  ['pamuk kumas ozelligi', 'nefes alır', 'yeni: pamuk'],
  ['deri suet farki', 'tüylü', 'yeni: süet'],
  ['spor ayakkabi nasil yikanir', 'elde yıkanır', 'yeni: ayakkabı'],
  // ---- 49. tur: guvenlik ----
  ['cocuk kaybolursa ne yapmali', 'görevliye', 'yeni: kaybolma'],
  ['vejetaryen vegan farki', 'hayvansal', 'yeni: vegan'],
  // ---- 50. tur: kis ----
  ['kis lastigi ne zaman', 'soğuklar', 'yeni: lastik'],
  ['antifriz ne ise yarar', 'donmasını', 'yeni: antifriz'],
  // ---- 51. tur: dijital ----
  ['telefon dolandiriciligi nasil olur', 'dolandırıcıdır', 'yeni: dolandırıcı'],
  ['iki faktorlu nedir', 'hesabı korur', 'yeni: 2fa'],
  ['wifi sifresi nasil degisir', 'arayüzünden', 'yeni: wifi'],
  // ---- 52. tur: atasozu-2 ----
  ['dereyi gormeden ne yapma', 'hazırlanılmaz', 'yeni: dere'],
  ['isleyen demir ne olur', 'yıpranmaz', 'yeni: demir'],
  ['pire icin ne yakma', 'büyük zarar', 'yeni: pire-2'],
  // ---- 53. tur: tatli + kahve ----
  ['tiramisu nedir', 'kahveli', 'yeni: tiramisu'],
  ['yogurt nasil mayalanir', 'mayalanmasıyla', 'yeni: yoğurt'],
  ['frappe latte farki', 'köpüklü', 'yeni: frappe'],
  // ---- 54. tur: festival ----
  ['rio karnavali nedir', 'sambalı', 'yeni: rio'],
  ['oscar nedir', 'film ödülleri', 'yeni: oscar'],
  ['kirkpinar nerede', "Edirne'de", 'yeni: kırkpınar'],
  // ---- 59. tur: sporcu ----
  ['naim suleymanoglu lakabi', 'Cep Herkülü', 'yeni: naim'],
  ['mete gazoz bransi', 'okçudur', 'yeni: mete'],
  // ---- 55. tur: dizi ----
  ['ezel dizisi konusu', 'intikam', 'yeni: ezel'],
  ['avrupa yakasi turu', 'sitcom', 'yeni: avrupa'],
  // ---- 56. tur: sinema ----
  ['titanic konusu', 'batık gemi', 'yeni: titanic'],
  ['matrix nedir', 'simülasyon', 'yeni: matrix'],
  ['esaretin bedeli konusu', 'hapishane', 'yeni: esaret'],
  // ---- 57. tur: muzik ----
  ['baris manco kimdir', "77'ye", 'yeni: manço'],
  ['asik veysel eseri', 'Uzun ince', 'yeni: veysel'],
  ['neset ertas turu', 'memleketidir', 'yeni: ertaş'],
  // ---- 58. tur: kuruyemis ----
  ['antep fistigi nerede kullanilir', 'baklavanın', 'yeni: fıstık'],
  ['leblebi nereli', 'leblebisiyle', 'yeni: leblebi'],
  // ---- 40-41. tur: baskent + cografya ----
  ['vatikan baskenti neresi', 'başkentidir', 'yeni: vatikan'],
  ['nepal baskenti', 'Katmandu', 'yeni: katmandu'],
  ['amazon nehri nerede', 'su taşıyan', 'yeni: amazon'],
  ['gronland nedir', 'özerk', 'yeni: grönland'],
  ['niagara selalesi', 'ünlü şelale', 'yeni: niagara'],
  // ---- 42. tur: para ----
  ['tayland para birimi', 'baht', 'yeni: baht'],
  ['kazakistan para birimi', 'tenge', 'yeni: tenge'],
  ['azerbaycan para birimi', 'manat', 'yeni: manat'],
  // ---- 43. tur: diller ----
  ['en cok konusulan dil', "Çince'dir", 'yeni: çince'],
  ['turkce kac milyon konusur', '80 milyon', 'yeni: türkçe'],
  ['japon alfabesi', 'kanji', 'yeni: japonca'],
  // ---- 44. tur: tore ----
  ['kiz isteme nasil olur', 'söz kesilir', 'yeni: isteme'],
  ['sofra adabi nedir', 'şapırdatılmaz', 'yeni: sofra'],
  // ---- 45. tur: ilk yardim ----
  ['kalp krizi belirtisi', '112 aranır', 'yeni: kriz'],
  ['kene isirmasinda ne yapilir', 'cımbızla', 'yeni: kene'],
  ['soluk borusu tikanmasi', 'Heimlich', 'yeni: heimlich'],
  // ---- 46. tur: yolculuk ----
  ['arac kiralama sartlari', 'kredi kartı', 'yeni: kiralama'],
  ['ucak rotarinda ne olur', 'yemek', 'yeni: rötar'],
  // ---- 47. tur: evcil ----
  ['hamster bakimi nasil', 'talaş', 'yeni: hamster'],
  ['kedi tuyu nasil azalir', 'taranırsa', 'yeni: tüy'],
  // ---- 48. tur: bahce ----
  ['gul ne zaman budanir', 'sonbaharda', 'yeni: gül'],
  ['recel nasil yapilir', 'köpüğü', 'yeni: reçel'],
  ['tohum nasil saklanir', 'kese kağıdı', 'yeni: tohum'],
  // ---- 35. tur: banka + resmi ----
  ['havale eft farki', 'aynı bankaya', 'yeni: havale'],
  ['iban nerede yazar', 'uygulamada', 'yeni: iban'],
  ['vize nedir', 'giriş izni', 'yeni: vize'],
  // ---- 36. tur: cocuk ----
  ['bebek ne zaman yurur', '12-15 ay', 'yeni: yürüme'],
  ['tuvalet egitimi kac yas', '2-3 yaş', 'yeni: tuvalet-eğitim'],
  ['cocuk ekran suresi ne olmali', '1 saati', 'yeni: ekran-süre'],
  // ---- 37. tur: olcu ----
  ['inc kac cm', '2,54', 'yeni: inç'],
  ['ph nedir', 'nötr', 'yeni: ph'],
  ['beden olculeri', 'XL', 'yeni: beden'],
  // ---- 38. tur: cevre ----
  ['atik pil nereye atilir', 'kutulara', 'yeni: pil'],
  ['atik yag ne yapilir', 'bidonda', 'yeni: yağ'],
  ['barinaktan sahiplenme', 'satın almaktan', 'yeni: barınak'],
  // ---- 39. tur: spor ----
  ['halterde koparma nedir', 'koparma ve silkme', 'yeni: halter'],
  ['bowlingde strike nedir', 'hepsine', 'yeni: strike'],
  ['karate judo farki', 'güreşli', 'yeni: judo'],
  // ---- 16. tur: cumhuriyet tarihi ----
  ['buyuk taarruz ne zaman', '26 Ağustos 1922', 'yeni: taarruz'],
  ['kadin secme secilme ne zaman', '1934', 'yeni: kadın-hak'],
  ['istiklal marsi ne zaman kabul', '1921', 'yeni: marş'],
  ['musul meselesi nasil cozuldu', '1926', 'yeni: musul'],
  // ---- 17. tur: din + dunya tarihi ----
  ['hicret ne zaman oldu', '622', 'yeni: hicret'],
  ['fransiz ihtilali ne zaman', '1789', 'yeni: ihtilal'],
  ['ankara savasi ne zaman', '1402', 'yeni: ankara-savaş'],
  ['berlin duvari ne zaman yikildi', '1989', 'yeni: duvar'],
  // ---- 18. tur: edebiyat ----
  ['kurk mantolu madonna yazari', 'Sabahattin Ali', 'yeni: madonna'],
  ['suc ve ceza yazari', 'Dostoyevski', 'yeni: suç-ceza'],
  ['kucuk prens yazari', 'Exupéry', 'yeni: prens'],
  ['dede korkut kimdir', 'Oğuz', 'yeni: dede-korkut'],
  ['hamlet yazari', 'Shakespeare', 'yeni: hamlet'],
  // ---- 19. tur: atasozu ----
  ['damlaya damlaya ne olur', 'birikimler', 'yeni: damla'],
  ['acele ise ne karisir', 'bozulur', 'yeni: acele'],
  ['komşu komşunun neyine muhtaç', 'muhtaç olur', 'yeni: komşu'],
  // ---- 20. tur: bilim insanlari ----
  ['marie curie ne buldu', 'Radyum', 'yeni: curie'],
  ['darwin neyi buldu', 'evrim', 'yeni: darwin'],
  ['hezarfen nereden uctu', 'Galata', 'yeni: hezarfen'],
  ['alan turing ne yapti', 'Enigma', 'yeni: turing'],
  // ---- 21. tur: turistik ----
  ['efes nerede', 'Celsus', 'yeni: efes'],
  ['gobeklitepe nedir', 'en eski tapınak', 'yeni: göbeklitepe'],
  ['paris neyi meshur', 'Eyfel', 'yeni: paris'],
  ['olu deniz nerede', 'Fethiye', 'yeni: ölüdeniz'],
  // ---- 13. tur: mutfak-2 ----
  ['hunkar begendi nedir', 'patlıcan', 'yeni: beğendi'],
  ['karnıyarık imam bayıldı farkı', 'kıymalı', 'yeni: karnıyarık'],
  ['gullac ne zaman yenir', 'ramazan', 'yeni: güllaç'],
  ['susi nedir', 'Japon', 'yeni: suşi'],
  // ---- 14. tur: ev + bahce ----
  ['cam silerken iz kalmamasi', 'mikrofiber', 'yeni: cam'],
  ['caydanlik kireci nasil cozulur', 'sirke', 'yeni: kireç'],
  ['domates nasil yetistirilir', 'güneşi sever', 'yeni: domates'],
  ['bebek atesi kac olursa doktora', '38 üstü', 'yeni: bebek-ateş'],
];

let pass = 0, fail = 0;
for (const [q, expect, label, kind] of TESTS) {
  let ans = null;
  try { ans = kind === 'dict' ? dictLookup(q) : findKnowledge(q, []); }
  catch (e) { ans = 'HATA:' + e.message; }
  if (expect === null) {
    if (ans === null) { pass++; console.log('PASS [' + label + '] "' + q + '" -> eşleşmedi'); }
    else { fail++; console.log('FAIL [' + label + '] "' + q + '" -> eşleşMEMELİYDİ: ' + String(ans).slice(0, 80)); }
  } else {
    if (ans && ans.includes(expect)) { pass++; console.log('PASS [' + label + '] "' + q + '"'); }
    else { fail++; console.log('FAIL [' + label + '] "' + q + '" -> ' + String(ans).slice(0, 100)); }
  }
}
console.log('\nSonuç: ' + pass + ' geçti, ' + fail + ' kaldı (' + TESTS.length + ' test)');
process.exit(fail ? 1 : 0);
