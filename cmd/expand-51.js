// Veritabani genisletme set 51: dijital guvenlik + telefon
const NEW_ENTRIES = [
  { k: ['oltalama | phishing mail'], a: "Şüpheli linke tıklanmaz, banka aranarak doğrulanır." },
  { k: ['telefon dolandiriciligi | polis savci'], a: "Polis-savcı diye para isteyen dolandırıcıdır, hemen kapatılır." },
  { k: ['kargo dolandiriciligi | sms link'], a: "Kargo SMS'indeki linke tıklanmaz." },
  { k: ['sahte site | guvenli alisveris'], a: "Güvenli sitede kilit simgesi ve doğru adres olur." },
  { k: ['iki faktorlu | 2fa sms'], a: "İki faktörlü doğrulama hesabı korur." },
  { k: ['sifre sifirlama | eposta kurtarma'], a: "Şifre resmi siteden e-postayla sıfırlanır." },
  { k: ['whatsapp yedekleme | sohbet'], a: "WhatsApp sohbeti buluta yedeklenir." },
  { k: ['fotograf yedekleme | bulut'], a: "Fotoğraflar buluta otomatik yedeklenir." },
  { k: ['telefon hafiza doldu | yer acma'], a: "Yer açmak için önbellek ve gereksiz video silinir." },
  { k: ['wifi sifre degistirme | modem arayuz'], a: "Wifi şifresi modem arayüzünden değiştirilir." },
  { k: ['modem reset | internet yavas'], a: "Yavaş internette modem kapatılıp açılır." },
  { k: ['uygulama guncelleme | otomatik'], a: "Uygulamalar güncel tutulur." },
  { k: ['spam engelleme | bilinmeyen numara'], a: "Bilinmeyen numaralar engellenir." },
  { k: ['sarj cabuk bitiyor | pil sagligi'], a: "Pil sağlığı için tam boşaltma yapılmaz." },
  { k: ['kulaklik temizligi'], a: "Kulaklık kuru bezle silinir." },
];
module.exports = NEW_ENTRIES;
