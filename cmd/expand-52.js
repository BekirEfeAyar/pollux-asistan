// Veritabani genisletme set 52: atasozu-2
const RAW = [
  ['besle kargayi oysun gozunu', 'İyilik bilmeyene yapılmaz.'],
  ['dereyi gormeden pacalari sivama', 'Kesinleşmeden hazırlanılmaz.', ['dereyi gormeden']],
  ['dimyata pirince giderken', 'Kâr ararken eldeki gider.'],
  ['evdeki hesap carsiya uymaz', 'Plan her zaman tutmaz.'],
  ['gemisini kurtaran kaptan', 'Zor zamanda kendini kurtaran övülür.'],
  ['hamama giren terler', 'İşe giren zorluğuna katlanır.'],
  ['her horoz kendi coplugunde', 'Herkes kendi yerinde güçlüdür.'],
  ['isleyen demir pas tutmaz', 'Çalışan yıpranmaz.', ['isleyen demir']],
  ['kacanin anasi aglamaz', 'Tehlikeden kaçan kurtulur.'],
  ['kel basa simsir tarak', 'İhtiyacı olmayana lüks verilir.'],
  ['nalinci keseri', 'Herkes kendine yontar.'],
  ['okuz altinda buzagi arama', 'Olmayanı aramak boşunadır.'],
  ['pire icin yorgan yakma', 'Küçük sorun için büyük zarar verilmez.', ['pire yakma']],
  ['sora sora bagdat bulunur', 'Sorarak her yer bulunur.'],
  ['tavsan daga kusmus', 'Güçsüzün küskünlüğü etkilemez.'],
  ['uzumu ye bagini sorma', 'Faydalan, kaynağını kurcalama.'],
  ['yatan aslandan gezen tilki', 'Çalışan tembelden iyidir.'],
  ['yuvarlanan tas yosun tutmaz', 'Sürekli gezen birikim yapamaz.'],
  ['zor oyunu bozar', 'Güç her düzeni değiştirir.'],
  ['iti an comagi hazirla', 'Tehlike anında hazırlıklı olunur.'],
];
const NEW_ENTRIES = RAW.map(([k, a, x]) => ({ k: [k, k + ' ne demek'].concat(x || []), a }));
module.exports = NEW_ENTRIES;
