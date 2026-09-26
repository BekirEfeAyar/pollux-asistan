// Veritabani genisletme set 15: seyahat + resmi is + acil + verimlilik
const NEW_ENTRIES = [
  { k: ['ehliyet yas siniri | b ehliyeti'], a: "B sınıfı ehliyet için 18 yaş gerekir." },
  { k: ['edevlet sifresi | ptt sifre'], a: "e-Devlet şifresi PTT şubelerinden kimlikle alınır." },
  { k: ['kimlik kaybi | yeni kimlik'], a: "Kimlik kaybolunca nüfus müdürlüğüne başvurulur." },
  { k: ['pasaport basvurusu | bordo pasaport'], a: "Pasaport başvurusu nüfus müdürlüklerinden yapılır." },
  { k: ['ucak check in | havalimani kac saat once'], a: "İç hatlarda uçuştan 1,5-2 saat önce havalimanında olunur." },
  { k: ['bagaj hakki | el bagaji'], a: "El bagajı kabine alınır, büyük valiz check-inde verilir." },
  { k: ['otel rezervasyon | pansiyon fark'], a: "Rezervasyonda tarih, kişi sayısı ve iptal koşulu kontrol edilir." },
  { k: ['kamp atesi | ates sondurme'], a: "Kamp ateşi ayrılırken üstüne su dökülüp köz ezilir." },
  { k: ['piknik temizlik | cop'], a: "Piknikte çöp toplanır, ateş tam söndürülür." },
  { k: ['bogulma ilk yardim | denizde bogulan'], a: "Boğulana yüzme bilinmiyorsa suya atlanmaz, can simidi atılıp 112 aranır." },
  { k: ['deprem ani | cok kapan tutun'], a: "Depremde çök-kapan-tutun yapılır, merdiven ve asansör kullanılmaz." },
  { k: ['yangin ani | duman'], a: "Yangında eğilerek dumandan uzaklaşılır, asansör kullanılmaz." },
  { k: ['sel ani | yuksek yer'], a: "Selde yüksek yere çıkılır, suyla kaplı yola girilmez." },
  { k: ['is gorusmesi | cv hazirlama'], a: "İş görüşmesinde temiz kıyafet, göz teması ve hazır cevaplar işe yarar." },
  { k: ['ders calisma | pomodoro'], a: "Pomodoro: 25 dakika ders, 5 dakika mola döngüsüdür." },
  { k: ['sinav kaygisi | heyecan'], a: "Sınav kaygısında derin nefes ve düzenli uyku işe yarar." },
  { k: ['kitap okuma | okuma aliskanligi'], a: "Her gün 20 sayfa okumak alışkanlık kazandırır." },
  { k: ['topluluk onu | sunum heyecani'], a: "Sunumda prova yapmak ve yavaş konuşmak heyecanı azaltır." },
  { k: ['para biriktirme | butce'], a: "Bütçede önce birikim ayrılır, kalan harcanır." },
  { k: ['kredi karti | asgari odeme'], a: "Asgari ödemek borcu büyütür, tamamını ödemek gerekir." },
];
module.exports = NEW_ENTRIES;
