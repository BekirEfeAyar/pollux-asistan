# Pollux Asistan (CMD)

Çevrimdışı öncelikli Türkçe komut satırı asistanı. Sıfır bağımlılık, kurulum sonrası internetsiz çalışır.

## Kurulum

```sh
npm install -g pollux-asistan
```

veya bu klasörden:

```sh
npm install -g .
```

## Kullanım

```sh
pollux                  # ekran uygulaması (logo + sohbet + My Links)
pollux --chat           # klasik satır sohbeti
pollux --tui            # ekran uygulaması (varsayılanla aynı)
# TUI içinde: My Links'e tıkla (olmazsa F1 veya /link yaz), /veri: veri kapsamı, Esc ile çık
pollux "saat kaç"       # tek soru-cevap
pollux "notepad aç"     # uygulama açar
pollux "youtube aç"     # siteyi uyarıyla açar
pollux --ac "soru"      # cevaptaki bağlantıları otomatik açar
```

## Özellikler

- Bilgi bankası: 10M+ kayıt çevrimdışı (tam set) + 100 milyon+ kayıtlık sayı üreteci (kare, küp, tek/çift, basamak, rakam toplamı)
- İngilizce-Türkçe sözlük (800+ çift, yazım toleranslı)
- Hesap makinesi, birim/sıcaklık çevirme, plaka, burç, dünya saatleri
- Uygulama + site açma, gündem, yapay zeka araştırması (internet varken)
- Öğrenen hafıza: beğenilen cevaplar `%APPDATA%\pollux\learned.json` içinde saklanır

## Testler

```sh
node test-battery.js   # 249 eşleşme testi
node fuzz.js           # yazım-saldırı dayanıklılığı
```
