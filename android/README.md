# Pollux

ChatGPT tarzı mobil asistan: **Yazılı Konuşma** + **Sesli Konuşma** sekmeleri, e-posta girişi, yan menüde sohbet geçmişi, moderatör paneli.

## Özellikler
- **Yazılı sohbet**: balonlu arayüz, SQLite geçmişi, yan menüden eski sohbetlere dönüş
- **Offline yetenekler**: selamlaşma, şaka, atasözü, saat/tarih, **hesap makinesi** (örn: `12 artı 5`, `3*4`, `(10+2)/3`), **birim çevirme** (örn: `5 km kaç metre`, `2 saat kaç dakika`), temel bilgiler (başkent, nüfus, Atatürk...)
- **Cihaz komutları (yazılıda)**: `el fenerini aç/kapat`, `sesi aç/kıs`, `wifi aç`, `bluetooth aç`, `instagram aç`, `uygulamalarımı listele`
- **Sesli sohbet**: butona bas-konuş (uyandırma yok), cevap sesli okunur; sadece sohbet + araştırma
- **Araştırma (internet varken)**: DuckDuckGo + Wikipedia TR, ücretsiz ve anahtarsız
- **Ses tanıma (offline)**: Vosk Türkçe model (~37MB), ilk kurulumda bir kez iner
- **Giriş + moderatör**: e-posta ile giriş; `Prefs.kt` içindeki `MODERATOR_EMAIL` adresi paneli görür (bu cihazdaki kullanıcılar ve sorular)

## Kurulum (Android Studio)
1. `offline-asistan` klasörünü aç, Gradle sync yap.
2. Çalıştır, e-postanla giriş yap.
3. Ses sekmesinde **Modeli Kur** düğmesine bas (bir kez, ~37MB).
4. Yaz: `12 artı 5`, `5 km kaç metre`, `fıkra anlat`, `instagram aç`, `Van kedisi nedir`.

## Notlar
- Sorular ve geçmiş **bu telefonda** (SQLite) tutulur. Başka telefonlardaki soruları
  moderatör panelinde görmek için sunucu (örn. Firebase) gerekir.
- Moderatör e-postanı `Prefs.kt` → `MODERATOR_EMAIL` içine yaz.
