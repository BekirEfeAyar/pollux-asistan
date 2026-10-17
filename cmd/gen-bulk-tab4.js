// Bulk B5: burc/olcu/bilgisayar/trafik/vitamin/fizik/bilesik/cografya/tarih/kultur
const fs = require('fs');
const out = [];
function add(k, a) { out.push({ k, a }); }
function row(line) {
  const i = line.indexOf('|');
  if (i < 0) return null;
  return [line.slice(0, i), line.slice(i + 1)];
}
// ---- Burclar: ad|tarih|element|ozellik ----
const BURC = [
'Koc|21 Mart - 20 Nisan|Ates|Koc burcu atilgan, lider ruhlu ve enerjiktir.',
'Boga|21 Nisan - 21 Mayis|Toprak|Boga burcu sabirli, guvenilir ve konforuna duskundur.',
'Ikizler|22 Mayis - 22 Haziran|Hava|Ikizler burcu konusken, merakli ve degiskendir.',
'Yengec|23 Haziran - 22 Temmuz|Su|Yengec burcu duygusal, ailesine bagli ve koruyucudur.',
'Aslan|23 Temmuz - 22 Agustos|Ates|Aslan burcu comert, sahne isigi sever ve gururludur.',
'Basak|23 Agustos - 22 Eylul|Toprak|Basak burcu titiz, caliskan ve detaycidir.',
'Terazi|23 Eylul - 22 Ekim|Hava|Terazi burcu adil, uyumlu ve estetik sever.',
'Akrep|23 Ekim - 21 Kasim|Su|Akrep burcu tutkulu, sezgileri guclu ve kararldir.',
'Yay|22 Kasim - 21 Aralik|Ates|Yay burcu ozgurlukcu, iyimser ve gezgindir.',
'Oglak|22 Aralik - 21 Ocak|Toprak|Oglak burcu disiplinli, sabirli ve hedef odaklidir.',
'Kova|22 Ocak - 19 Subat|Hava|Kova burcu ozgun, bagimsiz ve yenilikcidir.',
'Balik|20 Subat - 20 Mart|Su|Balik burcu hayalperest, merhametli ve sanatsaldir.'];
for (const r of BURC) {
  const p = r.split('|');
  add([p[0] + ' burcu tarihleri', p[0] + ' burcu ne zaman'], p[0] + ' burcu ' + p[1] + ' tarihleri arasindadir.');
  add([p[0] + ' burcu elementi', p[0] + ' hangi element'], p[0] + ' burcu ' + p[2] + ' grubundandir.');
  add([p[0] + ' burcu ozellikleri', p[0] + ' burcu nasildir'], p[3]);
}
// ---- Olcu birimleri ----
const OLCU = [
'1 kilometre kac metre|1 kilometre 1000 metredir.',
'1 metre kac santimetre|1 metre 100 santimetredir.',
'1 santimetre kac milimetre|1 santimetre 10 milimetredir.',
'1 kilogram kac gram|1 kilogram 1000 gramdir.',
'1 ton kac kilogram|1 ton 1000 kilogramdir.',
'1 litre kac mililitre|1 litre 1000 mililitredir.',
'1 saat kac dakika|1 saat 60 dakikadir.',
'1 dakika kac saniye|1 dakika 60 saniyedir.',
'1 gun kac saat|1 gun 24 saattir.',
'1 hafta kac gun|1 hafta 7 gundur.',
'1 yil kac gun|1 yil 365 gundur, artik yillarda 366 gun olur.',
'1 donum kac metrekare|1 donum 1000 metrekaredir.',
'1 hektar kac metrekare|1 hektar 10000 metrekaredir.',
'1 mil kac kilometre|1 mil yaklasik 1,609 kilometredir.',
'1 fit kac santimetre|1 fit yaklasik 30,48 santimetredir.',
'1 su bardagi su kac mililitre|1 su bardagi su yaklasik 200 mililitredir.',
'1 su bardagi un kac gram|1 su bardagi un yaklasik 120 gramdir.',
'1 su bardagi seker kac gram|1 su bardagi toz seker yaklasik 200 gramdir.',
'1 yemek kasigi kac mililitre|1 yemek kasigi yaklasik 15 mililitredir.',
'1 cay kasigi kac mililitre|1 cay kasigi yaklasik 5 mililitredir.',
'oda sicakligi kac derece|Oda sicakligi 22-24 derece kabul edilir.',
'su kac derecede kaynar|Su deniz seviyesinde 100 derecede kaynar.',
'su kac derecede donar|Su 0 derecede donar.',
'vucut sicakligi kac olmali|Saglikli vucut sicakligi 36,5-37 derecedir.',
'isik hizi kac|Isik hizi saniyede yaklasik 299795 kilometredir.',
'ses hizi kac|Ses hizi havada saniyede yaklasik 343 metredir.',
'yercekimi ivmesi kac|Yercekimi ivmesi yaklasik 9,81 metredir.',
'dunyanin cevresi kac kilometre|Dunyanin cevresi ekvatorda yaklasik 40000 kilometredir.',
'ayin dunyaya uzakligi|Ay dunyaya yaklasik 384400 kilometre uzakliktadir.',
'gunesin dunyaya uzakligi|Gunes dunyaya yaklasik 150 milyon kilometre uzakliktadir.',
'1 isik yili kac kilometre|1 isik yili yaklasik 9,46 trilyon kilometredir.'];
for (const r of OLCU) { const p = row(r); add([p[0]], p[1]); }
// ---- Bilgisayar ----
const PC = [
'git init ne ise yarar|git init komutu klasoru git deposu haline getirir.',
'git clone nasil yapilir|git clone ile uzak depo bilgisayara kopyalanir.',
'git add ne ise yarar|git add degisiklikleri kayit asamasina alir.',
'git commit nasil yapilir|git commit ile asamalanmis degisiklikler depoya kaydedilir.',
'git push ne ise yarar|git push yerel kayitlari uzak sunucuya gonderir.',
'git pull ne ise yarar|git pull uzak depodaki yenilikleri indirir.',
'git status ne gosterir|git status degisen ve yeni dosyalari listeler.',
'git branch ne ise yarar|git branch dallari listeler, yeni dal acar.',
'git log ne gosterir|git log kayit gecmisini listeler.',
'bilgisayar nasil hizlandirilir|Baslangic programlarini azaltmak ve diski temizlemek bilgisayari hizlandirir.',
'bilgisayar isinirsa ne yapilir|Toz temizligi yapilir, havalandirma delikleri acik tutulur.',
'depolama dolunca ne yapilir|Gereksiz dosyalar silinir, buyuk dosyalar harici diske tasinir.',
'kopyalama kisayolu hangisi|Kopyalama kisayolu Ctrl+C tuslaridir.',
'yapistirma kisayolu hangisi|Yapistirma kisayolu Ctrl+V tuslaridir.',
'kesme kisayolu hangisi|Kesme kisayolu Ctrl+X tuslaridir.',
'geri alma kisayolu hangisi|Geri alma kisayolu Ctrl+Z tuslaridir.',
'kaydetme kisayolu hangisi|Kaydetme kisayolu Ctrl+S tuslaridir.',
'bulma kisayolu hangisi|Metin icinde bulma kisayolu Ctrl+F tuslaridir.',
'yazdirma kisayolu hangisi|Yazdirma kisayolu Ctrl+P tuslaridir.',
'yeni sekme kisayolu hangisi|Tarayicida yeni sekme kisayolu Ctrl+T tuslaridir.',
'sekme kapatma kisayolu hangisi|Sekme kapatma kisayolu Ctrl+W tuslaridir.',
'sayfa yenileme kisayolu hangisi|Sayfa yenileme kisayolu F5 tusudur.',
'tam ekran kisayolu hangisi|Tam ekran kisayolu F11 tusudur.',
'ekran goruntusu nasil alinir|Windows tusuyla birlikte Shift+S ekran goruntusu alir.',
'bilgisayar nasil kilitlenir|Windows+L tuslari bilgisayari kilitler.',
'gorev yoneticisi nasil acilir|Ctrl+Shift+Esc gorev yoneticisini acar.',
'tumunu secme kisayolu hangisi|Tumunu secme kisayolu Ctrl+A tuslaridir.',
'wifi yavaslarsa ne yapilir|Modem kapatilip acilir, kalabalik kanal degistirilir.',
'modem nasil resetlenir|Modemin arkasindaki dugmeye 10 saniye basilir.',
'tarayıci?SKIP',
'internet kotasi cabuk biterse|Video kalitesi dusurulur, otomatik guncellemeler sinirlanir.',
'parola guvenligi nasil olur?SKIP-SIFRE',
'zip dosyasi nasil acilir|Zip dosyasina sag tiklanip tumunu ayikla secilir.',
'pdf nasil olusturulur|Yazdir menüsunde pdf olarak kaydet secilir.',
'silinen dosya nasil kurtarilir|Once geri donusum kutusuna bakilir, yoksa yedek kullanilir.',
'yedekleme nasil yapilir|Onemli dosyalar harici disk veya buluta kopyalanir.',
'python print ne ise yarar|print komutu ekrana yazi yazdirir.',
'python liste nedir|Liste koseli parantezle yazilan sirali veri toplulugudur.',
'python sozluk nedir|Sozluk suslu parantezle yazilan anahtar deger eslesmesidir.',
'python dongu nasil yazilir|for dongusu ile liste uzerinde gezilir.',
'python fonksiyon nasil tanimlanir|def anahtar kelimesiyle fonksiyon tanimlanir.',
'ekran parlakligi nasil ayarlanir|Parlaklik ayarlar menusunden veya fonksiyon tuslariyla degistirilir.',
'telefon pili cabuk biterse|Parlaklik kisilir, arka plan uygulamalari kapatilir.',
'uygulama donarsa ne yapilir|Uygulama kapatilip acilir, gerekirse telefon yeniden baslatilir.',
'eposta eki nasil gonderilir|Epostada atac simgesiyle dosya eklenir.',
'spam eposta nedir|Spam istenmeyen toplu epostalardir, baglantilarina tiklanmaz.',
'guvenli site nasil anlasilir|Adres cubugunda kilit simgesi ve https olmalidir.',
'usb bellek nasil cikarilir|Gorev cubugundaki guvenle kaldir secenegiyle cikarilir.',
'yazici kagit sikistirirsa|Yazici kapatilir, kagit yavasca cekilir.',
'kartus biterse ne olur|Baski solar, kartus veya toner yenilenir.',
'klavye calismazsa ne yapilir|Baglanti kontrol edilir, baska porta takilir.',
'fare imleci hareket etmezse|Pili veya baglantisi kontrol edilir, yuzey degistirilir.',
'hoparlor ses vermezse|Ses duzeyi ve cikis aygiti kontrol edilir.',
'mikrofon calismazsa|Gizlilik ayarlarinda mikrofona izin verilir.',
'web kamerasi acilmazsa|Diger uygulamalar kapatilir, surucu guncellenir.',
'bilgisayar acilmazsa ne yapilir|Guc kablosu ve priz kontrol edilir, batarya cikarilip takilir.',
'mavi ekran hatasi nedir|Mavi ekran sistem hatasidir, hata kodu not edilip suruculer guncellenir.',
'virüs?SKIP',
'program nasil kaldirilir|Denetim masasindan program kaldir secilir.',
'disk birlestirme ne ise yarar|Disk birlestirme daginik verileri toparlar.',
'ssd hdd farki nedir|SSD sessiz ve hizlidir, HDD daha ucuz ve yuksek kapasitelidir.',
'ram ne ise yarar|RAM calisan programlarin gecici hafizasidir.',
'islemci ne ise yarar|Islemci bilgisayarın hesap yapan beynidir.',
'ekran karti ne ise yarar|Ekran karti goruntuyu isleyip ekrana verir.',
'anakart ne ise yarar|Anakart tum parcalari birbirine baglayan karttir.',
'guç kaynagi?SKIP',
'fan ne ise yarar|Fan isinan parcalari sogutur.',
'cd dvd farki?SKIP',
'bluetooth nasil acilir|Ayarlar menusunden bluetooth acilip eslesme yapilir.',
'wifi sifresi unutulursa?SKIP-SIFRE',
'telefon ekran suresi nasil kisilir?SKIP-EKRAN',
'cocuk kilidi nasil konur|Ayarlarda ebeveyn denetimi acilir.',
'konum servisi ne ise yarar|Konum servisi harita ve hava durumu icin yerini kullanir.',
'otomatik parlaklik nedir|Ortam isigina gore ekrani ayarlayan ozelliktir.',
'gece modu ne ise yarar|Gece modu mavi isigi azaltip gozu yorar?NO',
'ucak modu ne ise yarar|Ucak modu tum kablosuz baglantilari kapatir.',
'veri tasarrufu nasil acilir|Ayarlardan veri tasarrufu acilip arka plan kisitlanir.',
'uygulama izni nasil verilir|Uygulama ayarlarinda izinler tek tek acilir.',
'bildirimler nasil kapatilir|Uygulama bildirimleri ayarlardan kapatilir.',
'depolama alani nasil bosaltilir|Kullanilmayan uygulamalar ve indirilenler silinir.',
'foto yedekleme nasil yapilir|Fotograflar buluta otomatik yedeklenir.',
'sifre yoneticisi nedir?SKIP-SIFRE',
'iki adimli dogrulama nedir?SKIP-2FA',
'karanlik mod ne ise yarar|Karanlik mod goz yormaz ve pil korur.',
'yazi boyutu nasil buyutulur|Erisilebilirlik ayarlarindan yazi buyutulur.',
'hizli sarj zararli mi|Hizli sarj pili biraz daha cabuk eskitir.',
'telefonu gece sarjda birakmak|Modern telefonlar dolunca keser ama serin tutmak iyi olur.',
'kablosuz sarj nasil calisir|Manyetik alanla enerji aktarir, yavas ama pratiktir.',
'ekran koruyucu gerekli mi|Cizilmelere karsi korur, dusmeye karsi kilif gerekir.',
'telefon kılıfı?SKIP'];
for (const r of PC) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Trafik levhalari ----
const TR = [
'dur levhasi ne demek|Dur levhasi durup yol vermek gerektigini soyler.',
'girilmez levhasi ne demek|Girilmez levhasi o yone girisin yasak oldugunu soyler.',
'hiz siniri levhasi ne demek|Hiz siniri levhasi azami hizi gosterir.',
'park yasak levhasi ne demek|Park yasak levhasi duraklamanin yasak oldugunu soyler.',
'yaya gecidi levhasi ne demek|Yaya gecidi levhasi yayalara oncelik verilecegini soyler.',
'okul gecidi levhasi ne demek|Okul gecidi yakininda yavaslanmalidir.',
'viraj levhasi ne demek|Viraj levhasi hiz dusurulmesi gerektigini soyler.',
'kaygan yol levhasi ne demek|Kaygan yol levhasi dikkatli surus ister.',
'kasis levhasi ne demek|Kasis levhasi hiz kesici ciktigini soyler.',
'tunel levhasi ne demek|Tunelde farlar yakilir, takip mesafesi artirilir.',
'demiryolu gecidi levhasi ne demek|Demiryolu gecidinde durup kontrol edilir.',
'trafik isiklari ne demek|Kirmizida durulur, yesilde gecilir.',
'tek yon levhasi ne demek|Tek yon levhasi yolun tek serit aktigini soyler.',
'sollama yasagi ne demek|Sollama yasagi bolgesinde one gecilmez.',
'emniyet kemeri neden takilir|Emniyet kemeri kazada hayatta kalma sansini artirir.',
'alkollu arac kullanma cezasi?SKIP-CEZA',
'takip mesafesi ne olmali|Takip mesafesi hizin yarisinin metre cinsidir.',
'farlar ne zaman yakilir|Gece ve gorus dusukken kisa far yakilir.',
'sis fari ne zaman kullanilir|Sisli havada kisa farla birlikte sis fari yakilir.',
'lastik basinci neden onemli|Dogru basinc yakiti dusurur, yol tutusu artirir.',
'stepne nedir|Stepne patlayan teker yerine takilan yedek tekerdir.',
'kriko ne ise yarar|Kriko araci kaldirip teker degistirmeye yarar.',
'akü biterse ne yapilir?SKIP',
'hararet yaparsa ne yapilir|Motor durdurulup sogumasi beklenir.',
'fren hidroliği?SKIP',
'silecek suyu biterse|Cam yikama deposuna su eklenir.',
'egzoz muayenesi kac yilda bir|Egzoz muayenesi arac yasina gore duzenli yapilir.',
'muayene gecikirse ne olur?SKIP-CEZA',
'plaka degisimi nasil olur|Noterden satisla plaka il degisirse yenilenir.',
'ehliyet siniflari nelerdir|B sinifi otomobil, A sinifi motosiklet kullanir.',
'stajyer surucu kurali nedir|Ilk iki yil ceza puani dusuktur.',
'hiz cezasi ne kadar?SKIP-CEZA',
'kirmizi isik cezasi ne kadar?SKIP-CEZA',
'hatali park cezasi?SKIP-CEZA',
'yaya onceligi kurali nedir|Yaya gecidinde yayanin gecmesi beklenir.',
'bisiklet surucu kurali|Bisiklet sag seritten gider, kask takilir.',
'kask neden takilir|Kask bas yaralanmalarini buyuk olcude onler.',
'cocuk koltugu kac yasina kadar|Cocuk koltugu boy 135 santime ulasana dek kullanilir.',
'gece surusu neden zor|Gorus mesafesi kisalir, far ayari onemlidir.',
'uzun yolda mola kac saatte|Uzun yolda iki saatte bir mola verilir.'];
for (const r of TR) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Vitamin/mineral ----
const VT = [
'A vitamini ne ise yarar|A vitamini goz sagligi ve bagisiklik icin gereklidir.',
'A vitamini nelerde var|A vitamini havuc, ispanak ve yumurtada bulunur.',
'B12 vitamini ne ise yarar|B12 vitamini kan hucreleri ve sinir sistemi icindir.',
'B12 vitamini nelerde var|B12 vitamini et, sut ve yumurtada bulunur.',
'C vitamini ne ise yarar|C vitamini bagisikligi destekler, demir emilimini artirir.',
'C vitamini nelerde var?DUP-TEST',
'D vitamini ne ise yarar|D vitamini kemikler icin kalsiyum emilimini saglar.',
'D vitamini nasil alinir|D vitamini gunes isigiyla ciltte uretilir.',
'E vitamini ne ise yarar|E vitamini hucreleri koruyan guclu bir antioksidandir.',
'K vitamini ne ise yarar|K vitamini kanin pihtilasmasi icin gereklidir.',
'demir ne ise yarar|Demir kana oksijen tasiyan hemoglobin icin gereklidir.',
'demir eksikligi ne yapar|Demir eksikligi halsizlik ve cabuk yorulmaya yol acar.',
'kalsiyum ne ise yarar|Kalsiyum kemik ve dislerin yapitasidir.',
'kalsiyum nelerde var|Kalsiyum sut, yogurt ve peynirde bulunur.',
'magnezyum ne ise yarar|Magnezyum kas ve sinirlerin duzgun calismasina yarar.',
'cinko ne ise yarar|Cinko bagisiklik ve yara iyilesmesi icin gereklidir.',
'potasyum ne ise yarar|Potasyum tansiyon dengesi ve kaslar icin onemlidir.',
'iyot ne ise yarar|Iyot tiroit bezinin duzgun calismasi icin gereklidir.',
'fosfor ne ise yarar|Fosfor kemiklerle enerji uretiminde rol oynar.',
'folik asit ne ise yarar|Folik asit hucre bolunmesi icin gereklidir.'];
for (const r of VT) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Bilesikler: formul|ad ----
const BI = ('H2O|su,CO2|karbondioksit,NaCl|sofra tuzu,O2|oksijen gazi,H2|hidrojen gazi,N2|azot gazi,CH4|metan gazi,NH3|amonyak,H2SO4|sulfurik asit,HCl|hidroklorik asit,NaOH|sud kostik,CaCO3|kirec tasi,C6H12O6|glikoz,CO|karbonmonoksit,O3|ozon gazi,H2O2|hidrojen peroksit,He|helyum gazi,NaHCO3|karbonat,C2H5OH|etil alkol').split(',');
for (const r of BI) {
  const p = r.split('|');
  add([p[0] + ' formulu nedir', p[0] + ' hangi bilesik'], p[0] + ' ' + p[1] + ' bilesiginin formuludur.');
  add([p[1] + ' formulu nedir', p[1] + ' kimyasal formul'], p[1] + ' bilesiginin formulu ' + p[0] + "'dir.");
}
// ---- Akarsu/dag/gol ----
const CG = [
'Firat nehri kac kilometre|Firat nehri yaklasik 2800 kilometredir.',
'Dicle nehri kac kilometre|Dicle nehri yaklasik 1900 kilometredir.',
'Sakarya nehri kac kilometre|Sakarya nehri 824 kilometredir.',
'Yesilirmak kac kilometre|Yesilirmak 519 kilometredir.',
'Seyhan nehri kac kilometre|Seyhan nehri yaklasik 560 kilometredir.',
'Ceyhan nehri kac kilometre|Ceyhan nehri yaklasik 509 kilometredir.',
'Meric nehri kac kilometre|Meric nehri yaklasik 480 kilometredir.',
'Gediz nehri kac kilometre|Gediz nehri 401 kilometredir.',
'Buyuk Menderes kac kilometre|Buyuk Menderes nehri 584 kilometredir.',
'Aras nehri kac kilometre|Aras nehri yaklasik 1072 kilometredir.',
'Coruh nehri kac kilometre|Coruh nehri yaklasik 410 kilometredir.',
'Agri dagi kac metre|Agri dagi 5137 metreyle Turkiye en yuksek dagidir.',
'Erciyes dagi kac metre|Erciyes dagi 3917 metredir.',
'Suphan dagi kac metre|Suphan dagi 4058 metredir.',
'Kackar dagi kac metre|Kackar dagi 3932 metredir.',
'Uludag kac metre|Uludag 2543 metredir ve kayak merkeziyle unludur.',
'Kaz dagi kac metre|Kaz dagi 1774 metredir.',
'Toroslar nerededir|Toros daglari Akdeniz boyunca uzanir.',
'Kuzey Anadolu daglari|Kuzey Anadolu daglari Karadeniz boyunca uzanir.',
'Tuz golu buyuklugu|Tuz golu yaklasik 1500 kilometrekareyle ikinci buyuk goldur.',
'Beysehir golu buyuklugu|Beysehir golu yaklasik 650 kilometrekaredir.',
'Egirdir golu buyuklugu|Egirdir golu yaklasik 468 kilometrekaredir.',
'Iznik golu buyuklugu|Iznik golu yaklasik 308 kilometrekaredir.',
'Nil nehri kac kilometre|Nil nehri yaklasik 6650 kilometreyle en uzunlardandir.',
'Amazon nehri ozelligi?DUP-TEST',
'Mississippi nehri nerededir|Mississippi nehri Amerika birlesik devletlerindedir.',
'Tuna nehri hangi ulkelerden gecer|Tuna nehri on ulkeden gecen Avrupa nehridir.',
'Ren nehri nerededir|Ren nehri Bati Avrupa en onemli su yollarindandir.',
'Everest yuksekligi?SKIP-TEST',
'K2 dagi kac metre|K2 dagi 8611 metreyle ikinci en yuksektir.',
'Alpler nerededir|Alpler Orta Avrupa dag silsilesidir.',
'And daglari nerededir|And daglari Guney Amerika batisindadir.',
'Himalayalar nerededir|Himalayalar Asya en yuksek dag silsilesidir.',
'Sahra colu buyuklugu?SKIP-TEST',
'Gobi colu nerededir|Gobi colu Mogolistan ile Cin arasindadir.',
'Mariana cukuru derinligi?SKIP-TEST',
'Niagara selalesi?SKIP-TEST',
'Victoria selalesi nerededir|Victoria selalesi Afrika en buyuk selalelerindendir.',
'Hazar denizi gol mu|Hazar denizi dunyadaki en buyuk goldur.'];
for (const r of CG) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Padisahlar (sira|ad) ----
const PD = ('Osman Gazi,Orhan Gazi,1 Murat,1 Mehmet,Celebi Mehmet,2 Murat,2 Mehmet,Beyazit?NO,2 Bayezit,Yavuz Sultan Selim,Kanuni Sultan Suleyman,2 Selim,3 Murat,3 Mehmet,1 Ahmet,1 Mustafa,2 Osman,4 Murat,Ibrahim,4 Mehmet,2 Suleyman,2 Ahmet,2 Mustafa,3 Ahmet,1 Mahmut,3 Osman,3 Mustafa,1 Abdulhamit,3 Selim,4 Mustafa,2 Mahmut,AbdulMecit?NO,Abdulaziz,5 Murat,2 Abdulhamit,5 Mehmet,6 Mehmet').split(',');
void PD;
const PAD = ['Osman Gazi', 'Orhan Gazi', '1 Murat', '2 Mehmet', 'Yavuz Sultan Selim', 'Kanuni Sultan Suleyman', '2 Abdulhamit', '6 Mehmet'];
void PAD;
// Sade ve dogru padisah sirasi:
const PADS = 'Osman Gazi|1,Orhan Gazi|2,1 Murat|3,1 Mehmet|4,Celebi Mehmet|5,2 Murat|6,Fatih Sultan Mehmet|7,2 Bayezit|8,Yavuz Sultan Selim|9,Kanuni Sultan Suleyman|10,2 Selim|11,3 Murat|12,3 Mehmet|13,1 Ahmet|14,2 Osman|15,4 Murat|16,4 Mehmet|17,2 Suleyman|18,2 Ahmet|19,2 Mustafa|20,3 Ahmet|21,1 Mahmut|22,3 Mustafa|23,1 Abdulhamit|24,3 Selim|25,2 Mahmut|26,AbdulMecit|27,Abdulaziz|28,2 Abdulhamit|29,5 Mehmet|30,6 Mehmet|31';
for (const r of PADS.split(',')) {
  const p = r.split('|');
  add([p[1] + ' osmanli padisahi kim', 'osmanli ' + p[1] + ' padisah'], 'Osmanli ' + p[1] + '. padisahi ' + p[0] + "'dir.");
}
// ---- Cumhurbaskanlari ----
const CB = 'Mustafa Kemal Ataturk|1,Ismet Inonu|2,Celal Bayar|3,Cemal Gursel|4,Cevdet Sunay|5,Fahri Koruturk|6,Kenan Evren|7,Turgut Ozal|8,Suleyman Demirel|9,Ahmet Necdet Sezer|10,Abdullah Gul|11,Recep Tayyip Erdogan|12';
for (const r of CB.split(',')) {
  const p = r.split('|');
  add([p[1] + ' cumhurbaskani kim', 'turkiye ' + p[1] + ' cumhurbaskani'], 'Turkiye ' + p[1] + '. cumhurbaskani ' + p[0] + "'dir.");
}
// ---- Dunyanin harikalari ----
const HA2 = [
'Keops piramidi nerededir|Keops piramidi Misir Gize antik harikalarindandir.',
'Babil asma bahceleri neredeydi|Babil asma bahceleri Irak antik harikalarindandir.',
'Artemis tapinagi neredeydi|Artemis tapinagi Selcuk Efes antik harikalarindandir.',
'Zeus heykeli neredeydi|Zeus heykeli Yunanistan Olimpia antik harikalarindandir.',
'Rodos heykeli neredeydi|Rodos heykeli Yunan adasi antik harikalarindandir.',
'Iskenderiye feneri neredeydi|Iskenderiye feneri Misir antik harikalarindandir.',
'Halikarnas mozolesi neredeydi|Halikarnas mozolesi Bodrum antik harikalarindandir.',
'Cin seddi kac kilometre|Cin seddi yaklasik 21000 kilometredir.',
'Kolezyum nerededir|Kolezyum Roma antik arenadir.',
'Petra antik kenti nerededir|Petra antik kenti Urdun kaya sehridir.',
'Machu Picchu nerededir|Machu Picchu Peru Inka sehridir.',
'Chichen Itza nerededir|Chichen Itza Meksika Maya sehridir.',
'Tac Mahal nerededir|Tac Mahal Hindistan Agra anit mezardir.'];
for (const r of HA2) { const p = row(r); add([p[0]], p[1]); }
// ---- Kita/okyanus ----
const KO = [
'en buyuk kita hangisi|En buyuk kita Asyadir.',
'en kucuk kita hangisi|En kucuk kita Okyanusyadir.',
'en kalabalik kita hangisi|En kalabalik kita Asyadir.',
'en buyuk okyanus hangisi|En buyuk okyanus Pasifik okyanusudur.',
'Atlas okyanusu nerededir|Atlas okyanusu Amerika ile Avrupa arasindadir.',
'Hint okyanusu nerededir|Hint okyanusu Guney Asya ile Afrika arasindadir.',
'Turkiye hangi kitalarda|Turkiye Asya ile Avrupa kitalarindadir.',
'Istanbul iki kitada mi|Istanbul hem Asya hem Avrupa yakasina kuruludur.'];
for (const r of KO) { const p = row(r); add([p[0]], p[1]); }
// ---- Gezegenler ----
const GZ = [
'Merkur ozelligi|Merkur gunese en yakin gezegendir.',
'Venus neden sicak|Venus kalin atmosferiyle en sicak gezegendir.',
'Dunya kac yasinda?SKIP-TEST',
'Mars neden kizil|Mars demir oksitten kizil gorunen gezegendir.',
'Jupiter buyuklugu|Jupiter gunes sisteminin en buyuk gezegenidir.',
'Saturn halkalari nedir|Saturn buz ve kayadan halkalariyla unludur.',
'Uranus ozelligi|Uranus yan yatmis ekseniyle donen gezegendir.',
'Neptun ozelligi|Neptun gunese en uzak gezegendir.',
'gunes nedir|Gunes dunyayi isitan orta buyuklukte bir yildizdir.',
'ayda atmosfer var mi|Ayda onemli bir atmosfer yoktur.'];
for (const r of GZ) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Tarih ----
const TA = [
'Malazgirt savasi ne zaman|Malazgirt savasi 1071 yilinda kazanildi.',
'Lozan antlasmasi ne zaman|Lozan antlasmasi 1923 yilinda imzalandi.',
'Cumhuriyet ne zaman ilan edildi|Cumhuriyet 29 Ekim 1923 tarihinde ilan edildi.',
'Ankara ne zaman baskent oldu|Ankara 1923 yilinda baskent oldu.',
'Istanbul fethi ne zaman|Istanbul 1453 yilinda Fatih Sultan Mehmet tarafindan fethedildi.',
'Canakkale zaferi ne zaman|Canakkale deniz zaferi 18 Mart 1915 tarihindedir.',
'Kurtulus savasi komutani|Kurtulus savasinin baskomutani Mustafa Kemal Ataturk tur.',
'Lozan heyeti baskani|Lozan heyetine Ismet Inonu baskanlik etti.',
'halifelik ne zaman kaldirildi|Halifelik 1924 yilinda kaldirildi.',
'harf devrimi ne zaman|Harf devrimi 1928 yilinda yapildi.',
'kadın?SKIP-TEST',
'Medine mudafaasi komutani|Medine mudafaasini Fahrettin Pasa yapti.',
'Trablusgarp savasi ne zaman|Trablusgarp savasi 1911 yilinda oldu.',
'Balkan savaslari ne zaman|Balkan savaslari 1912-1913 yillarinda oldu.',
'Saraybosna suikasti ne zaman|Saraybosna suikasti 1914 yilinda 1 savasi baslatti.',
'Versay antlasmasi ne zaman|Versay antlasmasi 1919 yilinda imzalandi.'];
for (const r of TA) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Yazarlar ----
const YZ = [
'Orhan Veli kimdir|Orhan Veli Garip akiminin halk diliyle yazan sairidir.',
'Nazim Hikmet eserleri|Nazim Hikmet Memleketimden Insan Manzaralari sairidir.',
'Yahya Kemal kimdir|Yahya Kemal Istanbulu anlatan sair ve yazardir.',
'Mehmet Akif Ersoy eseri|Mehmet Akif Ersoy Istiklal Marsi sairidir.',
'Necip Fazil kimdir|Necip Fazil mistik siirleriyle unlu sair ve yazardir.',
'Sait Faik kimdir|Sait Faik durum oykuleriyle unlu hikayecidir.',
'Yasar Kemal eseri|Yasar Kemal Ince Memed romaniyla unludur.',
'Orhan Pamuk odulu|Orhan Pamuk 2006 Nobel edebiyat odulunu aldi.',
'Aziz Nesin turu|Aziz Nesin mizah oykuleriyle unlu yazardir.',
'Rifat Ilgaz eseri|Rifat Ilgaz Hababam Sinifi romaniyla unludur.',
'Kemal Tahir eserleri|Kemal Tahir tarihsel romanlariyla unlu yazardir.',
'Halide Edip eseri|Halide Edip Atesten Gomlek romanini yazdi.',
'Resat Nuri eseri|Resat Nuri Calikusu romaniyla unludur.',
'Peyami Safa eseri|Peyami Safa Dokuzuncu Hariciye Kogusu romanini yazdi.',
'Tanpinar eseri|Ahmet Hamdi Tanpinar Huzur romanini yazdi.',
'Oguz Atay eseri|Oguz Atay Tutunamayanlar romanini yazdi.',
'Tolstoy eserleri|Tolstoy Savas ve Baris romaniyla unlu Rus yazardir.',
'Victor Hugo eseri|Victor Hugo Sefiller romanini yazdi.',
'Dickens eserleri|Dickens Iki Sehrin Hikayesi romanini yazdi.',
'Hemingway eseri|Hemingway Yasli Adam ve Deniz romanini yazdi.',
'Steinbeck eseri|Steinbeck Fareler ve Insanlar romanini yazdi.',
'Kafka eseri|Kafka Donusum romaniyla unlu yazardir.',
'Goethe eseri|Goethe Faust trajedisiyle unlu Alman yazardir.',
'Cervantes eseri|Cervantes Don Kisot romanini yazdi.',
'Dante eseri|Dante Ilahi Komedya destanini yazdi.',
'Homeros eserleri|Homeros Ilyada ve Odysseia destanlarini yazdi.',
'Shakespeare eserleri|Shakespeare Hamlet ve Romeo Juliet oyunlarini yazdi.'];
for (const r of YZ) { const p = row(r); add([p[0]], p[1]); }
// ---- Bilim/bulus ----
const BL = [
'Newton ne buldu|Newton yercekimi yasasiyla unlu fizikcidir.',
'Einstein teorisi nedir|Einstein gorecelik teorisiyle unlu fizikcidir.',
'Galileo ne yapti|Galileo teleskobu gelistiren unlu astronomdur.',
'Edison ne buldu|Edison ampulu ticarilestiren mucittir.',
'Tesla ne yapti|Tesla alternatif akimla unlu mucittir.',
'Pasteur ne buldu|Pasteur pastorizasyon ve kuduz asisiyla unludur.',
'Mendel ne buldu|Mendel kalitim yasalarini bulan bilim insanidir.',
'Hawking kimdir|Hawking karadelik calismalariyla unlu fizikcidir.',
'Arsimet ne buldu|Arsimet suyun kaldirma kuvvetini bulan bilginidir.',
'Oklid kimdir|Oklid geometrinin kurucusu sayilan matematikcidir.',
'Harezmi ne buldu|Harezmi cebirin kurucusu sayilan bilginidir.',
'Ibni Sina eseri|Ibni Sina Tip Kanunu kitabiyla unlu hekimdir.',
'Biruni kimdir|Biruni astronomi ve fizikte calisan unlu bilginidir.',
'Ulug Bey ne yapti|Ulug Bey Semerkant rasathanesini kurdu.',
'Ali Kuscu kimdir|Ali Kuscu astronomi bilgini ve Fatih medresesi muneccimidir.',
'Piri Reis eseri|Piri Reis dunya haritasi ve Kitabi Bahriye eseridir.',
'yazi kim buldu|Yaziyi Sumerler buldu.',
'matbaa kim buldu|Matbaayi Gutenberg gelistirdi.',
'buhar makinesi kim|Buhar makinesini Watt gelistirdi.',
'telefon patenti kim|Telefonun patentini Bell aldi.',
'araba kim buldu|Modern otomobili Benz uretti.',
'pusula kim buldu|Pusula Cinliler tarafindan bulundu.',
'barut kim buldu|Barut Cinliler tarafindan bulundu.',
'kagit kim buldu|Kagit Cinliler tarafindan uretildi.',
'tekerlek ne zaman|Tekerlek yaklasik 5500 yil once bulundu.',
'radyo kim buldu|Radyoyu Marconi gelistirdi.',
'televizyon kim buldu|Televizyonu Baird gelistirdi.',
'asi kim buldu|Cicek asisini Jenner gelistirdi.',
'rontgen kim buldu|Rontgen isinlarini Rontgen buldu.',
'internet ne zaman|Internet 1969 ARPANET ile basladi.'];
for (const r of BL) { const p = row(r); add([p[0]], p[1]); }
// ---- Spor ekstra ----
const SP = [
'olimpiyatlar kac yilda bir|Olimpiyatlar dort yilda bir duzenlenir.',
'modern olimpiyat ilk ne zaman|Modern olimpiyatlar 1896 Atina ile basladi.',
'dunya kupasi kac yilda bir|Futbol dunya kupasi dort yilda bir duzenlenir.',
'basketbol kac kisi oynar|Basketbol takimda bes kisiyle oynanir.',
'basketbolu kim buldu|Basketbolu Naismith buldu.',
'voleybol kac kisi oynar|Voleybol takimda alti kisiyle oynanir.',
'tenis sayi sistemi|Teniste sayilar 15 30 40 diye ilerler.',
'gures turleri nelerdir|Serbest ve grekoromen baslica gures turleridir.',
'yagli gures nerede olur|Yagli gures Edirne Kirkpinar er meydaninda olur.',
'okculuk nasil yapilir|Okculuk yayla hedefe ok atma sporudur.',
'yuzme stilleri nelerdir|Serbest kelebek sirt ve kurbagalama baslica stillerdir.',
'atletizm dallari nelerdir|Kosma atlama ve atma atletizm dallaridir.',
'boks raunt kac dakika|Amator boksta rauntlar uc dakikadir.',
'judo kusak sirasi|Judoda beyaz kusakla baslanir siyaha ilerlenir.',
'tekvando nereli|Tekvando Kore kokenli dovus sporudur.',
'karate nereli|Karate Japon kokenli dovus sporudur.',
'eskim?SKIP',
'formula 1 nedir|Formula 1 en hizli pist yarisi serisidir.',
'ralli nedir|Ralli zamana karsi yol yarisidir.',
'motogp nedir|MotoGP motosiklet yaris serisidir.',
'basketbol saha olcusu|Basketbol sahasi 28 metreye 15 metredir.',
'futbol saha olcusu|Futbol sahasi yaklasik 105 metreye 68 metredir.',
'futbol kalesi olcusu|Futbol kalesi 7,32 metreye 2,44 metredir.',
'penalti noktasi kac metre|Penalti noktasi kaleye 11 metre uzakliktadir.'];
for (const r of SP) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Yemek ekstra ----
const YE = [
'iskender nereli|Iskender Bursa doner yemegidir.',
'doner nasil yapilir|Doner dikey sisde pisip ince kesilir.',
'lahmacun nereli|Lahmacun Guneydogu ozellikle Antep urunudur.',
'pide nereli|Kir pidesi Karadeniz ozellikle Trabzon urunudur.',
'baklava nereli|Baklava Gaziantep fistikli tatlisidir.',
'kunefe nereli|Kunefe Hatay peynirli sicak tatlisidir.',
'asure ne zaman yapilir|Asure muharrem ayinda dagitilan tatlidir.',
'keskek nedir|Keskek bugday ve etle dovulerek yapilir.',
'cig kofte nasil yapilir|Cig kofte bulgurla yogrulup marulla yenir.',
'kisir nasil yapilir|Kisir ince bulgur salca ve yesillikle yapilir.',
'mercimek corbasi tarifi|Mercimek sogan ve havucla piser, blendirdan gecer.',
'tarhana nasil yapilir|Tarhana yogurt ve unla mayalanip kurutulur.',
'menemen nasil yapilir|Menemen domates biber ve yumurtayla tavada yapilir.',
'gozleme nasil yapilir|Gozleme acilan hamurun sacda pisirilmesiyle olur.',
'simit nasil yapilir|Simit pekmezli hamurun susamla firinlanmasiyla olur.',
'pogaca nasil yapilir|Pogaca mayali hamurun peynirle doldurulmasiyla olur.',
'dolma sarma farki|Dolma biber gibi icine, sarma yapraga sarilarak yapilir.',
'yaprak sarma tarifi|Asma yapragina pirincli har konup sarilir.',
'kuru fasulye tarifi|Kuru fasulye onceden islatilip etle pisirilir.',
'nohut yemegi tarifi|Nohut islatilip sogan ve salcayla pisirilir.',
'bulgur pilavi tarifi|Bulgur sogan ve domatesle suyunu cekene dek piser.',
'yayla corbasi tarifi|Yayla corbasi yogurt pirinc ve naneyle yapilir.',
'ezogelin corbasi tarifi|Ezogelin mercimek bulgur ve naneyle yapilir.',
'turk kahvesi nasil pisirilir|Turk kahvesi cezvede kopugu alinarak pisirilir.',
'cay nasil demlenir|Cay once ust demde demlenip suyla acilir.',
'ayran nasil yapilir|Ayran yogurt su ve tuzla cirpilarak yapilir.',
'boza nedir|Boza daridan mayalanan kis icecegidir.',
'salep nedir|Salep sut ve salep tozuyla yapilan kis icecegidir.'];
for (const r of YE) { const p = row(r); add([p[0]], p[1]); }
// ---- Sehir meshur ----
const SE = [
'Kapadokya nerededir|Kapadokya Nevsehir peri bacalariyla unlu bolgedir.',
'Pamukkale nerededir|Pamukkale Denizli travertenleriyle unludur.',
'Nemrut dagi nerededir|Nemrut dagi Adiyaman heykelleriyle unludur.',
'Ani harabeleri nerededir|Ani harabeleri Kars orta cag sehridir.',
'Troya nerededir|Troya Canakkale antik kentidir.',
'Assos nerededir|Assos Behramkale tas sokaklariyla unludur.',
'Bergama nerededir|Bergama Izmir antik kent ve Asklepion ile unludur.',
'Afrodisias nerededir|Afrodisias Aydin heykel okulu ve stadyumuyla unludur.',
'Side nerededir|Side Antalya antik tiyatro ve Apollon tapinagiyla unludur.',
'Aspendos nerededir|Aspendos Antalya saglam tiyatrosuyla unludur.',
'Perge nerededir|Perge Antalya stadyum ve sutunlu caddesiyle unludur.',
'Kas nasil bir yer|Kas Antalya dalış ve tas evleriyle unlu sahildir.',
'Bodrum nerededir|Bodrum Mugla kale ve marinasıyla unludur.',
'Marmaris nasil bir yer|Marmaris Mugla koylariyla unlu tatil beldesidir.',
'Kusadasi nerededir|Kusadasi Aydin Efes yakin tatil beldesidir.',
'Cesme nasil bir yer|Cesme Izmir ruzgari ve kalesiyle unludur.',
'Alacati neyi meshur|Alacati tas evleri ve sorfuyle unludur.',
'Bozcaada nerededir|Bozcaada Canakkale sarap ve kalesiyle unlu adadir.',
'Gokceada nerededir|Gokceada Turkiye en buyuk adasidir.',
'Amasra nasil bir yer|Amasra Bartin koylariyla unlu sahil kasabasidir.',
'Safranbolu neyi meshur|Safranbolu Osmanli evleriyle unlu Karabuk ilcesidir.',
'Yedigoller nerededir|Yedigoller Bolu yedi goluyle unlu parktir.',
'Abant nerededir|Abant Bolu golu ve ormaniyla unludur.',
'Sapanca nerededir|Sapanca Sakarya goluyle unlu beldedir.',
'Cumalikizik nerededir|Cumalikizik Bursa Osmanli koyudur.',
'Halfeti nerededir|Halfeti Sanliurfa sular altinda koyuyla unludur.',
'Mardin evleri ozelligi|Mardin tas evleri ve manzarasıyla unludur.',
'Hasankeyf nerededir|Hasankeyf Batman tarihi koprusu ve magaralariyla unludur.',
'Diyarbakir surlari kac kilometre|Diyarbakir surlari yaklasik 5,5 kilometredir.',
'Balikligol nerededir|Balikligol Sanliurfa kutsal gol ve dergahiyla unludur.',
'Zeugma nerededir|Zeugma Gaziantep mozaikleriyle unlu antik kenttir.',
'Catalhoyuk nerededir|Catalhoyuk Konya en eski yerlesimlerdendir.',
'Hattusa nerededir|Hattusa Corum Hitit baskentidir.',
'Gordion nerededir|Gordion Ankara Polatli antik Frig kentidir.',
'Sardes nerededir|Sardes Manisa Lidya baskentidir.',
'Milet nerededir|Milet Aydin antik felsefe ve tiyatro kentidir.',
'Didim neyi meshur|Didim Apollon tapinagi ve Altinkumuyla unludur.',
'Fethiye neyi meshur|Fethiye yamaç parasutu ve koylariyla unludur.',
'Ayasofya nerededir|Ayasofya Istanbul Sultanahmet tarihi mabedidir.',
'Topkapi sarayi nerededir|Topkapi sarayi Istanbul Osmanli sarayidir.',
'Suleymaniye camii mimari|Suleymaniye camii Mimar Sinan eseridir.',
'Selimiye camii nerededir|Selimiye camii Edirne Mimar Sinan ustalik eseridir.',
'Mevlana muzesi nerededir|Mevlana muzesi Konya dergahiyla unludur.',
'Sumenela manastiri nerededir|Sumenela manastiri Trabzon Macka kayaya oyuludur.',
'Ishakpasa sarayi nerededir|Ishakpasa sarayi Agri Dogubeyazit tarihi sarayidir.'];
for (const r of SE) { const p = row(r); add([p[0]], p[1]); }
// ---- Ruya ekstra ----
const RU = [
'ruyada su gormek ne demek|Ruyada su ferahliga ve berekete yorulur.',
'ruyada yilan gormek ne demek|Ruyada yilan gizli dusmana karsi uyaridir.',
'ruyada bebek gormek ne demek|Ruyada bebek yeni baslangica yorulur.',
'ruyada dugun gormek ne demek|Ruyada dugun sevincli habere yorulur.',
'ruyada ev gormek ne demek|Ruyada ev huzur ve guvene yorulur.',
'ruyada araba gormek ne demek|Ruyada araba hayat yolculuguna yorulur.',
'ruyada ucak gormek ne demek|Ruyada ucak yukselise ve hedefe yorulur.',
'ruyada okul gormek ne demek|Ruyada okul ogrenilecek derse yorulur.',
'ruyada sinav gormek ne demek|Ruyada sinav sorumluluk kaygisina yorulur.',
'ruyada para gormek ne demek|Ruyada para kazanca ve nimete yorulur.'];
for (const r of RU) { const p = row(r); add([p[0]], p[1]); }
// ---- Dini bilgiler ----
const DI = [
'oruc ne zaman tutulur|Oruc ramazan ayinda imsakla iftar arasi tutulur.',
'zekat ne demek|Zekat malin belirli oraninin yoksullara verilmesidir.',
'hac ne zaman yapilir|Hac zilhicce ayinda Mekke ziyaretidir.',
'gunde kac vakit namaz|Gunde bes vakit namaz kilinir.',
'cuma namazi ne zaman|Cuma namazi cuma gunu ogle vaktinde kilinir.',
'kadir gecesi ne zaman|Kadir gecesi ramazan ayi son gunlerindedir.',
'iftar ne demek|Iftar gun batiminda oruc acma ogunudur.',
'sahur ne demek|Sahur oruc oncesi gece yenen yemektir.'];
for (const r of DI) { const p = row(r); add([p[0]], p[1]); }
// ---- Bayramlar ----
const BA = [
'23 nisan ne bayrami|23 Nisan cocuk bayrami ve meclis acilis gunudur.',
'19 mayis ne bayrami|19 Mayis genclik ve spor bayramidir.',
'30 agustos ne bayrami|30 Agustos zafer bayramidir.',
'29 ekim ne bayrami|29 Ekim cumhuriyet bayramidir.',
'1 mayis ne gunu|1 Mayis emek ve dayanisma gunudur.',
'ramazan bayrami ne zaman|Ramazan bayrami ramazan sonrasi uc gun kutlanir.',
'kurban bayrami ne zaman|Kurban bayrami zilhiccede dort gun kutlanir.',
'annler gunu ne zaman?SKIP',
'babalar gunu ne zaman|Babalar gunu haziran ayi ucuncu pazaridir.',
'ogretmenler gunu ne zaman|Ogretmenler gunu 24 Kasimda kutlanir.'];
for (const r of BA) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Ilk yardim ekstra ----
const IY = [
'burun kanamasinda ne yapilir|Burun kanamasinda one egilip burun kanatlari sikilir.',
'ari sokmasinda ne yapilir|Ari ignesi cikarilip bol suyla yikanir.',
'burkulmada ne yapilir|Burkulmada buz konup yuksege kaldirilir.',
'kesikte ilk yardim|Kesik temizlenip baskiyla kan durdurulur.',
'gunes carpmasi belirtisi|Gunes carpmasi bas agrisi ve bulantiyla belli olur.',
'bogaza cisim kacarsa|Oksurtmeye calisilir, olmazsa heimlich?SKIP-TEST',
'yilan sokmasinda ne yapilir|Sakin kalinip 112 aranir, bolge hareketsiz tutulur.',
'elektrik carpmasinda ne yapilir|Once akim kesilir, sonra 112 aranir.'];
for (const r of IY) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
// ---- Ev/bahce ekstra ----
const EB = [
'hali lekesi nasil cikar|Hali lekesine once soguk suyla tampon yapilir.',
'banyo kufu nasil temizlenir|Banyo kufu sirke ve karbonatla ovalanir.',
'lavabo tikanirsa ne yapilir|Lavabo pompasi denenir, olmazsa tesisatci cagrilir.',
'tava yanigi nasil temizlenir|Yanmis tava karbonatli suyla kaynatilip ovalanir.',
'camasir suyu lekesi cikar mi|Camasir suyu lekesi genellikle cikmaz.',
'feslegen nasil yetistirilir|Feslegen gunesli balkonda duzenli sulanir.',
'biber nasil yetistirilir|Biber fideleri gunesli yere dikilip duzenli sulanir.',
'salatalik nasil yetistirilir|Salatalik destekle buyutulup bol sulanir.',
'maydanoz nasil yetistirilir|Maydanoz serin yerde tohumdan kolay yetisir.',
'nane nasil yetistirilir|Nane yaygin kokleriyle saksida kontrollu yetisir.'];
for (const r of EB) { const p = row(r); add([p[0]], p[1]); }
// ---- Findik/kuruyemis ----
const KU = [
'findik nerede yetisir|Findik Karadeniz ozellikle Giresun yetisir.',
'ceviz nerede yetisir|Ceviz Anadolu yuksek kesimlerde yetisir.',
'badem nerede yetisir|Badem Ege ve Akdeniz yetisir.',
'kaju nerede yetisir|Kaju tropik iklim ulkelerinde yetisir.',
'antep fistigi?SKIP-TEST',
'leblebi?SKIP-TEST',
'kabak cekirdegi faydasi|Kabak cekirdegi cinko ve magnezyum icerir.',
'aycekirdegi faydasi|Aycicek cekirdegi E vitamini icerir.'];
for (const r of KU) {
  if (!r || r.includes('?')) continue;
  const p = row(r);
  add([p[0]], p[1]);
}
fs.writeFileSync(__dirname + '/bulk-part-5.json', JSON.stringify(out), 'utf8');
console.log('PART5: ' + out.length);
