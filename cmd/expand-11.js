// Veritabani genisletme set 11: tarihi kisiler + icatlar + ilkler
const NEW_ENTRIES = [
  // Tarihi kisiler
  { k: ['alparslan | malazgirt sultani'], a: "Alparslan 1071 Malazgirt Zaferi'ni kazanan Selçuklu sultanıdır." },
  { k: ['fatih sultan mehmet kac yasinda fethetti | 21 yas'], a: "Fatih Sultan Mehmet İstanbul'u 21 yaşında fethetti." },
  { k: ['mustafa kemal dogum | selanik 1881'], a: "Mustafa Kemal 1881'de Selanik'te doğdu." },
  { k: ['ismet inonu | ikinci adam'], a: "İsmet İnönü Kurtuluş komutanı ve ikinci cumhurbaşkanıdır." },
  { k: ['fevzi cakmak | maresal'], a: "Fevzi Çakmak Kurtuluş'un mareşal rütbeli komutanıdır." },
  { k: ['kazim karabekir | dogu cephesi'], a: "Kazım Karabekir Doğu Cephesi komutanıdır." },
  { k: ['halide edip | atesten gomlek'], a: "Halide Edip Ateşten Gömlek'in yazarı, Kurtuluş'un kadın kahramanıdır." },
  { k: ['mehmet akif kac yil yasadi | istiklal sairi'], a: "Mehmet Akif Ersoy İstiklal Marşı'nın şairidir." },
  { k: ['yavuz sultan selim | misir seferi'], a: "Yavuz Sultan Selim Mısır'ı alıp hilafeti Osmanlı'ya getirdi." },
  { k: ['abdulhamit | ikinci abdulhamit'], a: "II. Abdülhamit 33 yıl tahtta kalan padişahtır." },
  { k: ['ataturk ilkeleri | 6 ok'], a: "Atatürk ilkeleri 6 oktur: cumhuriyetçilik, milliyetçilik, halkçılık, devletçilik, laiklik, inkılapçılık." },
  // Icatlar
  { k: ['ampulu kim buldu | edison'], a: "Ampulü Edison yaygınlaştırdı, Tesla akımla ışık sistemini kurdu." },
  { k: ['telefonu kim buldu | bell'], a: "Telefonu Bell icat etti." },
  { k: ['ucagi kim buldu | wright kardes'], a: "İlk motorlu uçağı Wright kardeşler yaptı." },
  { k: ['arabayi kim buldu | benz'], a: "İlk otomobili Benz yaptı." },
  { k: ['matbaayi kim buldu | gutenberg'], a: "Matbaayı Gutenberg yaygınlaştırdı." },
  { k: ['barut kim buldu | cin icadi'], a: "Barut Çin'de bulundu." },
  { k: ['pusulayi kim buldu | cin'], a: "Pusula Çin'de bulundu." },
  { k: ['kagidi kim buldu | cai lun'], a: "Kağıt Çin'de bulundu." },
  { k: ['interneti kim buldu | arpanet'], a: "İnternet ARPANET projesinden doğdu." },
  { k: ['aspirin | penisilin | antibiyotik'], a: "Penisilin antibiyotiği Fleming buldu." },
  // Ilkler (Turkiye)
  { k: ['ilk kadin pilot | sabiha gokcen'], a: "İlk kadın pilot Sabiha Gökçen'dir." },
  { k: ['ilk kadin doktor turkiye | safiye ali'], a: "Türkiye'nin ilk kadın doktoru Safiye Ali'dir." },
  { k: ['ilk turkce sozluk | divanu lugati'], a: "İlk Türkçe sözlük Kaşgarlı Mahmut'un Divanü Lügati't-Türk'üdür." },
  { k: ['ilk matbaa osmanli | ibrahim muteferrika'], a: "Osmanlı'da ilk matbaayı İbrahim Müteferrika kurdu." },
  { k: ['ilk gazete | takvimi vakayi'], a: "Osmanlı'nın ilk gazetesi Takvim-i Vekayi'dir." },
  { k: ['ilk demiryolu | izmir aydin'], a: "Anadolu'nun ilk demiryolu İzmir-Aydın hattıdır." },
  { k: ['ilk universite | darulfunun'], a: "Darülfünun modern üniversitenin öncüsüdür." },
];
module.exports = NEW_ENTRIES;
