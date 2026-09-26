// Veritabani genisletme set 29: trafik + hava + cografya terimleri
const NEW_ENTRIES = [
  { k: ['dur levhasi | park yasagi'], a: "Dur levhasında durulur, park yasağında park edilmez." },
  { k: ['yaya gecidi | okul gecidi'], a: "Yaya ve okul geçitlerinde yayaya yol verilir." },
  { k: ['tek yon | girilmez'], a: "Tek yön ve girilmez levhalarına uyulur." },
  { k: ['sollama yasagi | takip mesafesi'], a: "Sollama yasağında geçilmez, takip mesafesi korunur." },
  { k: ['emniyet kemeri | hava yastigi'], a: "Emniyet kemeri her koltukta takılır." },
  { k: ['parcali bulutlu | cok bulutlu'], a: "Parçalı bulutlu güneş-bulut karışımıdır." },
  { k: ['saganak | karla karisik'], a: "Sağanak ani şiddetli yağmur, karla karışık yarı kar yağıştır." },
  { k: ['don | kiragi'], a: "Don ve kırağı soğukta suyun buz tutmasıdır." },
  { k: ['lodos | poyraz | meltem | karayel'], a: "Lodos güneybatı, poyraz kuzeydoğu, meltem yaz, karayel kuzeybatı rüzgarıdır." },
  { k: ['nem | bagil nem'], a: "Nem havadaki su buharıdır, yüksek nem bunaltır." },
  { k: ['hava basinci | barometre'], a: "Hava basıncı barometreyle ölçülür." },
  { k: ['yarimada'], a: "Yarımada üç tarafı sularla çevrili kara parçasıdır." },
  { k: ['korfez | koy fark'], a: "Körfez büyük, koy küçük deniz girintisidir." },
  { k: ['burun | delta'], a: "Burun denize uzanan kara, delta nehrin biriktirdiği ovadır." },
  { k: ['ova | plato'], a: "Ova düz, plato yüksek düzlüktür." },
  { k: ['selale | caglayan'], a: "Şelale yüksekten düşen sudur." },
  { k: ['gol cesitleri | tektonik karstik'], a: "Göller oluşumuna göre tektonik, karstik, volkanik olur." },
  { k: ['nehir | irmak | cay fark'], a: "Nehir büyük, ırmak orta, çay küçük akarsudur." },
  { k: ['dag sirasi | volkanik dag'], a: "Dağlar sıradağ ya da tek volkanik kütle olur." },
  { k: ['vadi cesitleri | kanyon kars'], a: "Vadi akarsu yatağıdır, kanyon derin vadidir." },
];
module.exports = NEW_ENTRIES;
