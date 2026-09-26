// Veritabani genisletme set 12: muzik + gelenek + evcil bakim
const NEW_ENTRIES = [
  // Muzik aletleri
  { k: ['gitar | akustik gitar'], a: "Gitar telli çalgıdır, akustik ve elektro çeşitleri vardır." },
  { k: ['keman | viyola fark'], a: "Keman yayla çalınan telli çalgıdır." },
  { k: ['piyano | kuyruklu'], a: "Piyanoda tuşlara basıldıkça çekiçler tellere vurur." },
  { k: ['baglama | saz'], a: "Bağlama Türk halk müziğinin baş çalgısıdır." },
  { k: ['ney | tasavvuf'], a: "Ney kamıştan üflemeli çalgıdır." },
  { k: ['davul | zurna dugun'], a: "Davul-zurna düğünlerin vazgeçilmezidir." },
  { k: ['klarnet | gırnata'], a: "Klarnet tek kamışlı üflemeli çalgıdır." },
  { k: ['flut | yan flut'], a: "Flüt yana tutularak çalınan üflemeli çalgıdır." },
  { k: ['bateri | davul seti'], a: "Bateri trampet, zil ve bas davuldan oluşur." },
  { k: ['kanun | ud fark'], a: "Kanun ve ud mızrapla çalınan telli çalgılardır." },
  // Gelenekler
  { k: ['kina gecesi | gelin hamami'], a: "Kına gecesi düğünden önce kadınlar arasında yapılır." },
  { k: ['asker ugurlama | havaya ates'], a: "Asker uğurlamada havaya ateş açmak tehlikeli ve yasaktır." },
  { k: ['bebek mevludu | kirklik'], a: "Kırklık bebek kırk günlük olunca yapılır." },
  { k: ['dis bugdayi | dis hedigi'], a: "Diş buğdayı ilk dişte yapılan kutlamadır." },
  { k: ['sunnet dugunu | kirve'], a: "Sünnet düğünü erkek çocuk için yapılan kutlamadır." },
  { k: ['bayramlasma | el opme | harclik'], a: "Bayramlaşmada büyüklerin eli öpülür, çocuklara harçlık verilir." },
  { k: ['iftar | sahur vakti | iftar sahur fark'], a: "İftar orucun açıldığı akşam yemeği, sahur sabah yemeğidir." },
  { k: ['kurban nasil kesilir | vekalet'], a: "Kurban dini kurallara uygun, ehil kişiye kestirilir." },
  // Evcil bakim
  { k: ['kedi mamasi | kuru mama yas mama'], a: "Kedilere yaşına uygun mama verilir, inek sütü verilmez." },
  { k: ['kopek gezdirme | tasma'], a: "Köpek günde en az iki kez tasmalı gezdirilir." },
  { k: ['kedi kumu | tuvalet egitimi'], a: "Kedi kumu haftada yenilenir, kum kabı temiz tutulur." },
  { k: ['muhabbet kusu bakimi | yem'], a: "Muhabbet kuşuna darısız yem, temiz su ve kafes temizliği gerekir." },
  { k: ['balik akvaryum | su degisimi'], a: "Akvaryum suyu haftada kısmen değiştirilir, fazla yem verilmez." },
  { k: ['kedi asisi | kuduz asisi'], a: "Kedi-köpeğe yıllık kuduz ve karma aşıları veterinerde yapılır." },
  { k: ['kopek disiplini | tuvalet'], a: "Köpek eğitiminde ödül ve sabır esastır, ceza işe yaramaz." },
];
module.exports = NEW_ENTRIES;
