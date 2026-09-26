package com.polluxasistan.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.pow

/**
 * Sohbet cevap motoru: offline küçük sohbet + hesap + birim çevirme +
 * tarih/saat, yazılıda uygulama açma + cihaz komutları,
 * internet varken ücretsiz araştırma.
 * Ağ işi arka planda, cevap ana threade döner.
 */
class ChatBrain(
    private val appCtx: Context,
    private val appLauncher: AppLauncher,
    private val researcher: Researcher,
    private val knowledge: Knowledge = Knowledge(appCtx),
    private val dict: Dict = Dict(appCtx),
    private val news: NewsFetcher = NewsFetcher(appCtx),
    private val ai: AiBridge = AiBridge(appCtx),
    private val learned: LearnedStore = LearnedStore(appCtx)
    ) {

    // Oturum hafızası: takip soruları ("o ne demek", "daha fazla") son konuya bağlanır
    private var lastTopic: String = ""
    private var lastTitle: String = ""
    private var lastContext: String = ""

    private fun knowledgeTokens(s: String): List<String> {
        return try {
            knowledge.tokens(s).map { knowledge.stem(it) }.filter { it.length >= 3 }
        } catch (_: Exception) {
            emptyList()
        }
    }
    sealed interface Action {
        object FlashOn : Action
        object FlashOff : Action
        object WifiSettings : Action
        object BtSettings : Action
        object VolUp : Action
        object VolDown : Action
        data class OpenUrl(val url: String) : Action
    }

    data class Answer(val text: String, val action: Action? = null)

    private val main = Handler(Looper.getMainLooper())

    fun answer(text: String, allowApps: Boolean, cb: (Answer) -> Unit) {
        Thread {
            val out = try {
                resolve(text, allowApps)
            } catch (e: Exception) {
                Answer("Bir hata oldu, tekrar dener misin?")
            }
            main.post { try { cb(out) } catch (_: Exception) {} }
        }.start()
    }

    private fun resolve(raw: String, allowApps: Boolean): Answer {
        val cmd = raw.lowercaseTurkish().trim()
        if (cmd.isBlank()) return Answer("Bir şey yazmadın.")
        try {
            Persona.track(appCtx, raw)
        } catch (_: Exception) {}
        val f = fold(cmd)
        val tokens = f.split(" ").map { it.trim() }.filter { it.isNotBlank() }
        val shortMsg = tokens.size <= 3

        // ---- Selamlaşma / küçük sohbet ----
        if (f.contains("iyi geceler") || f.contains("iyi uykular")) {
            return Answer("İyi geceler! Tatlı rüyalar.")
        }
        if (shortMsg && !tokens.contains("misin") && tokens.any { it in setOf("merhaba", "selam", "selamlar", "slm", "mrb", "hey", "gunaydin", "gunaydinlar", "iyi", "aksamlar", "günaydın") } ||
            f.contains("iyi aksam") || f.contains("iyi gunler") || f == "naber"
        ) {
            return Answer("Merhaba! Sana nasıl yardımcı olabilirim?")
        }
        if (f.contains("nasilsin") || f.contains("naslsin") || f.contains("nasil gidiyor") || f.contains("naber") || f.contains("ne haber")) {
            return Answer(
                Persona.pick(
                    appCtx,
                    listOf(
                        Persona.V("İyiyim ya, sen yazınca daha iyi oldum. Sende ne var ne yok?"),
                        Persona.V("Bomba gibiyim! Senden naber?", true),
                        Persona.V("Süperim, anlat bakalım günün nasıl geçti?")
                    ),
                    listOf(
                        Persona.V("Ben iyiyim, seni sormalı. Günün nasıl geçiyor?"),
                        Persona.V("Çok iyiyim, sen yazınca daha iyi oldum. Sen nasılsın?"),
                        Persona.V("İyiyim, dinliyorum. Anlat bakalım, günün nasıl?")
                    ),
                    listOf(
                        Persona.V("Teşekkür ederim, iyiyim. Siz nasılsınız?"),
                        Persona.V("İyiyim, sağ olun. Size nasıl yardımcı olabilirim?")
                    )
                )
            )
        }
        if (f.contains("ne yapiyorsun") || f.contains("napiyorsun") || f.contains("nabiyon") || f.contains("neyle mesgulsun")) {
            return Answer(
                Persona.pick(
                    appCtx,
                    listOf(
                        Persona.V("Seninle takılıyorum, en sevdiğim iş. Sen ne yapıyorsun?"),
                        Persona.V("Burada seni bekliyordum, iyi ki yazdın.", true)
                    ),
                    listOf(
                        Persona.V("Seninle sohbet ediyorum, en sevdiğim iş bu."),
                        Persona.V("Burada seni bekliyordum, iyi ki yazdın."),
                        Persona.V("Mesajları okuyup cevap düşünüyorum. Söyle bakalım, ne var ne yok?")
                    ),
                    listOf(Persona.V("Size yardımcı olmak için buradayım. Nasıl yardımcı olabilirim?"))
                )
            )
        }
        if (f.contains("gunun nasil gecti") || f.contains("gunun nasildi")) {
            return Answer(
                Persona.pick(
                    appCtx,
                    listOf(Persona.V("Sen yazınca güzelleşti valla. Seninki nasıl geçti, anlat bakalım?")),
                    listOf(Persona.V("Seni duymak günümü güzelleştirdi. Umarım seninki de güzel geçiyordur.")),
                    listOf(Persona.V("Gayet güzel, teşekkür ederim. Sizin gününüz nasıl geçti?"))
                )
            )
        }
        if ((tokens.contains("seviyorum") && tokens.contains("seni")) || f.contains("seni cok seviyorum")) {
            return Answer("Ben de seni seviyorum. İyi ki varsın.")
        }
        if (f.contains("ozledim")) {
            return Answer("Ben hep buradayım, özlemene gerek yok.")
        }
        if (f.contains("harikasin") || f.contains("muhtesemsin") || f.contains("cok iyisin") || f.contains("guzelsin") || f.contains("tatlisin") || f.contains("cok zekisin") || f.contains("akillisin")) {
            return Answer(
                listOf(
                    "Teşekkür ederim, sen de harikasın!",
                    "Çok naziksin. Sen de öylesin.",
                    "Bunu duymak günümü aydınlattı, sağ ol.",
                    "Mahcup oldum. Sen de bir tanesin."
                ).random()
            )
        }
        // Can sıkıntısı / moral bozukluğu: sıcak destek + öneri
        if (f.contains("canim sikiliyor") || f.contains("sikildim") || f.contains("cok sikildim")) {
            return Answer(
                listOf(
                    "Kıyamam. Sana bir fıkra anlatayım mı? Ya da bilmece sorayım, ne dersin?",
                    "Anlıyorum, öyle günler olur. Biraz kafanı dağıtayım: şaka mı istersin, fal mı?",
                    "Sıkıntıyı birlikte dağıtalım. Taş-kağıt-makas oynayalım mı?"
                ).random()
            )
        }
        if (f.contains("moralim bozuk") || f.contains("moralsizim") || f.contains("uzgunum") || f.contains("uzgnum") || f.contains("depresyondayim") || f.contains("yalnizim") || f.contains("yalniz hissediyorum")) {
            return Answer(
                listOf(
                    "Üzüldüm. Ama şunu bil: ben hep buradayım, dinlerim. Anlatmak ister misin?",
                    "Kötü hissetmek insani bir şey, geçecek. İstersen sana moral vereyim, ister misin?",
                    "Yanındayım. Derin bir nefes al, sonra içini dök. Dinliyorum."
                ).random()
            )
        }
        if (f.contains("iyi misin")) {
            return Answer("İyiyim, teşekkürler. Sen iyi misin?")
        }
        if (tokens.contains("iyiyim") || tokens.contains("iyiyimdir")) {
            return Answer(
                Persona.pick(
                    appCtx,
                    listOf(Persona.V("Harika, sevindim! Ben de iyiyim, günün nasıl geçiyor?")),
                    listOf(Persona.V("Sevindim! Ben de iyiyim. Anlat bakalım, günün nasıl?")),
                    listOf(Persona.V("Sevindim, ben de iyiyim. Teşekkür ederim."))
                )
            )
        }
        if (f.contains("evli misin") || f.contains("bekar misin")) {
            return Answer("Ben yazılımla evliyim, sadığım da.")
        }
        if (f.contains("burcun ne")) {
            return Answer("Benim burcum kod burcu. Seninki ne?")
        }
        if (f.contains("en sevdigin renk")) {
            return Answer("Senin sevdiğin renk hangisiyse o.")
        }
        if (f.contains("en sevdigin yemek")) {
            return Answer("Elektrik yiyorum genelde. Sen ne seversin?")
        }
        // Kaba sözlere asla kaba cevap yok: nazik, kibar, küfürsüz.
        // (Kelimeler cevapta tekrar edilmez.)
        if (tokens.contains("amk") || tokens.contains("aq") || tokens.contains("mk") ||
            f.contains("siktir") || f.contains("orospu") || f.contains("yarrak")
        ) {
            return Answer(
                listOf(
                    "Küfürsüz konuşalım, olur mu? Ben hep kibar kalacağım.",
                    "Kötü söz sahibine aittir derler. Nasıl yardımcı olabilirim?",
                    "Sakin olalım. Ben buradayım, düzgünce konuşalım."
                ).random()
            )
        }
        if (tokens.contains("mal") || f.contains("salak") || f.contains("aptal") ||
            f.contains("gerizekali") || f.contains("dangalak") || f.contains("beyinsiz") ||
            f.contains("defol") || f.contains("ceneni") || f == "sus"
        ) {
            return Answer(
                listOf(
                    "Kırıldım ama yine de buradayım. Sana nasıl yardımcı olabilirim?",
                    "Böyle deme, üzülüyorum. Gel güzelce konuşalım.",
                    "Kibarlık benden, sen yine de şansını dene. Ne lazımdı?",
                    "Tamam, bunu duymamış olayım. Başka bir şey sor istersen."
                ).random()
            )
        }
        if (f.contains("adin ne") || f.contains("ismin ne") || f.contains("kimsin") || f.contains("sen nesin")) {
            return Answer("Ben Pollux, senin asistanın. İnternet yokken bile çalışırım; internet varken araştırma da yaparım.")
        }
        if ((f.contains("internet") && (f.contains("erisim") || f.contains("bagli misin") || f.contains("baglanabiliyor"))) ||
            f.contains("internetin var") || f.contains("online misin") || f.contains("cevrimici")
        ) {
            return if (researcher.hasInternet()) Answer("Evet, internete erişebiliyorum. Gündemi sorabilir, araştırma isteyebilirsin. Dene: \"gündem\".")
            else Answer("Şu an internete ulaşamıyorum, çevrimdışı moddayım. Yine de hesap, çeviri ve kayıtlı bilgilerle yardımcı olurum.")
        }
        if (f.contains("nerelisin") || f.contains("nerde yasiyorsun")) {
            return Answer("Ben bu telefonun içinde yaşıyorum.")
        }
        if (f.contains("kac yasindasin") || f.contains("yasin kac")) {
            return Answer("Çok yeniyim, daha bebek sayılırım.")
        }
        if (f.contains("ne yapabilirsin") || f.contains("napabilirsin") || f.contains("neler yapabilirsin") || f == "yardim" ||
            f.contains("yardim et") || f.contains("ozelliklerin") || f.contains("neler biliyorsun")
        ) {
            return Answer(
                "Şunları yapabilirim:\n• Sohbet (selamlaşma, şaka, bilmece, atasözü)\n" +
                    "• Hesap (örn: 12 artı 5, 3*4, 100/4)\n" +
                    "• Birim ve sıcaklık çevirme (örn: 5 km kaç metre)\n" +
                    "• İngilizce-Türkçe sözlük (örn: apple ne demek)\n" +
                    "• Saat ve tarih, hayvanlar-uzay-tarih bilgileri\n" +
                    (if (allowApps) "• Uygulama açma (örn: instagram aç) ve tarayıcıda arama\n• El feneri, ses, wifi ayarları\n" else "") +
                    "• İnternet varken yapay zekaya sorup araştırma yaparım (örn: Van kedisi nedir)"
            )
        }
        if (f.contains("tesekkur") || f.contains("tesekur") || f == "saol" || f.contains("sagol") || f.contains("eyvallah") || f.contains("cok sagol")) {
            return Answer(
                Persona.pick(
                    appCtx,
                    listOf(
                        Persona.V("Ne demek ya, her zaman! Başka bir şey var mı?"),
                        Persona.V("Lafı mı olur!", true)
                    ),
                    listOf(
                        Persona.V("Rica ederim! Başka bir şey var mı?"),
                        Persona.V("Ne demek, her zaman. Başka bir şey lazım mı?"),
                        Persona.V("Lafı mı olur. Yardımcı olabildiysem ne mutlu bana.")
                    ),
                    listOf(Persona.V("Rica ederim. Başka bir konuda yardımcı olabilir miyim?"))
                )
            )
        }
        if (f.contains("gule gule") || f.contains("gorusuruz") || f.contains("bay bay") || f.contains("hosca kal") || f.contains("kaciyorum") || f.contains("kaciyom")) {
            return Answer(
                Persona.pick(
                    appCtx,
                    listOf(
                        Persona.V("Kaçtın mı? Tamam, ben buradayım, yine beklerim!"),
                        Persona.V("Görüşürüz, kendine iyi bak!", true)
                    ),
                    listOf(
                        Persona.V("Görüşürüz! İhtiyacın olursa buradayım."),
                        Persona.V("Kendine iyi bak, ben hep buradayım. Yine beklerim."),
                        Persona.V("Hoşça kal! Günün güzel geçsin.")
                    ),
                    listOf(Persona.V("Hoşça kalın, iyi günler dilerim."))
                )
            )
        }
        // Yapımcı/moderatör soruları: kelime sırasından bağımsız yakala.
        // ("seni yapan kim", "uygulamayı kim yaptı", "moderatör kim" hepsi)
        val whoMade = f.contains("kim") && (
            f.contains("yapti") || f.contains("yapan") || f.contains("gelistir") ||
                f.contains("kodla") || f.contains("yazdi") || tokens.contains("sahibin") ||
                tokens.contains("sahibi") || f.contains("moderator") || f.contains("yapimci")
            )
        if (whoMade) {
            return Answer(
                "Beni yapan muazzam kişi Bekir Efe AYAR'dır, isteyenler için Instagram hesabı şudur: https://www.instagram.com/efebekir_slm/"
            )
        }
        if (f.contains("saka yap") || f.contains("fikra anlat") || f.contains("bana guldur") || f.contains("komik bir sey") || f.contains("espri")) {
            return Answer(
                listOf(
                    "Bilgisayar neden üşütmüş? Çünkü Windows'u açık kalmış.",
                    "Balık neden okula gitmez? Çünkü suçu ne olursa olsun hep ağa takılır.",
                    "Matematik kitabı neden üzgünmüş? Çünkü çok problemi varmış.",
                    "Adamın biri gülmüş, öteki de dikmiş. Meğer manavlarmış.",
                    "Örümcek neden bilgisayardan anlamaz? Çünkü ağı var diye her şeyi internet sanırmış.",
                    "Kitap neden doktora gitmiş? Cildi kabarmış."
                ).random()
            )
        }
        if (f.contains("atasozu") || f.contains("ozlu soz") || f.contains("guzel soz")) {
            return Answer(
                listOf(
                    "Damlaya damlaya göl olur.",
                    "Acele işe şeytan karışır.",
                    "Sakla samanı, gelir zamanı.",
                    "Ne ekersen onu biçersin.",
                    "Bir elin nesi var, iki elin sesi var.",
                    "Azı karar, çoğu zarar."
                ).random()
            )
        }
        if (f.contains("ataturk sozu") || f.contains("ataturkten soz") || f.contains("ataturk ne demis")) {
            return Answer(
                listOf(
                    "Hayatta en hakiki mürşit ilimdir. — Atatürk",
                    "Yurtta sulh, cihanda sulh. — Atatürk",
                    "Geldikleri gibi giderler. — Atatürk",
                    "Egemenlik, kayıtsız şartsız milletindir. — Atatürk"
                ).random()
            )
        }
        if (f.contains("bilmece") || f.contains("bulmaca sor")) {
            return Answer(
                listOf(
                    "Hangi kalemle yazı yazılmaz?\nCevap: Kontrol kalemi.",
                    "Hangi bağda üzüm bulunmaz?\nCevap: Ayakkabı bağında.",
                    "En çok kardeşi olan meyve hangisidir?\nCevap: Üzüm, salkım salkım kardeştir."
                ).random()
            )
        }
        if (f.contains("masal anlat") || f.contains("hikaye anlat")) {
            return Answer(
                listOf(
                    "Bir varmış bir yokmuş. Küçük bir serçe, rüzgarla yarışmaya karar vermiş. Kanat çırpmış, çırpmış... Sonunda bulutların üstüne çıkmış ve aşağı bakıp gülümsemiş.",
                    "Bir varmış bir yokmuş. Minik bir kaplumbağa her sabah dereden su taşırlarmış. Herkes gülermiş ama kuraklıkta kuyuyu o doldurmuş."
                ).random()
            )
        }
        if (f.contains("tekerleme")) {
            return Answer(
                listOf(
                    "Bir berber bir berbere gel beraber bir berber dükkanı açalım demiş.",
                    "Şu köşe yaz köşesi, şu köşe kış köşesi, ortada su şişesi.",
                    "Dal sarkar kartal kalkar, kartal kalkar dal sarkar."
                ).random()
            )
        }
        if (f.contains("deyim")) {
            return Answer(
                listOf(
                    "Ayağını yorganına göre uzat: Gelirine göre harcama yap.",
                    "Balık baştan kokar: Bozukluk yöneticiden başlar.",
                    "Demir tavında dövülür: İş zamanında yapılır.",
                    "Gülü seven dikenine katlanır: Güzel şeylerin zorluğu olur."
                ).random()
            )
        }
        if (f.contains("motive et") || f.contains("moral ver") || f.contains("motivasyon")) {
            return Answer(
                listOf(
                    "Küçük adımlar büyük sonuçlar getirir. Bugün bir adım at.",
                    "Vazgeçenler asla kazanamaz. Devam et.",
                    "En karanlık an, şafağa en yakın andır. Dayan."
                ).random()
            )
        }
        if (f.contains("tavsiye ver") || f.contains("oneride bulun") || f.contains("bana akil ver")) {
            return Answer(
                "Tavsiyem: " + listOf(
                    "bugün 20 dakika yürü.",
                    "telefonu bir saat bırakıp kitap oku.",
                    "bir arkadaşını ara, halini sor.",
                    "yarın için tek bir hedef yaz."
                ).random()
            )
        }

        // ---- Bilgi (offline, değişmeyen gerçekler) ----
        if (f.contains("turkiye") && f.contains("baskent")) return Answer("Türkiye'nin başkenti Ankara'dır.")
        if ((f.contains("turkiye") || f.contains("ulke")) && f.contains("nufus")) {
            return Answer("Türkiye'nin nüfusu yaklaşık 85 milyondur.")
        }
        if (f.contains("para birimi") && (f.contains("turkiye") || tokens.contains("turkiye") || f == "para birimi")) {
            return Answer("Türkiye'nin para birimi Türk lirasıdır.")
        }
        if (f.contains("ataturk")) {
            return Answer("Mustafa Kemal Atatürk (1881-1938), Türkiye Cumhuriyeti'nin kurucusudur.")
        }
        if (f.contains("istiklal marsi")) {
            return Answer("İstiklal Marşı'nın şairi Mehmet Akif Ersoy'dur.")
        }
        if (f.contains("en kalabalik sehir") || (f.contains("istanbul") && f.contains("nufus"))) {
            return Answer("Türkiye'nin en kalabalık şehri İstanbul'dur.")
        }
        if (f.contains("ambulans") || (f.contains("acil") && f.contains("numara"))) {
            return Answer("Acil durumlarda 112'yi ara. Ambulans, itfaiye ve polis 112 çatısı altındadır.")
        }
        if (f.contains("polis") && (f.contains("numara") || f.contains("ara") || f.contains("telefon"))) {
            return Answer("Polis için 155, genel acil için 112'yi arayabilirsin.")
        }
        if (f.contains("itfaiye") && (f.contains("numara") || f.contains("ara") || f.contains("yangin"))) {
            return Answer("İtfaiye için 110, genel acil için 112'yi arayabilirsin.")
        }
        if (f.contains("jandarma")) {
            return Answer("Jandarma için 156, genel acil için 112'yi arayabilirsin.")
        }
        val monthDays = mapOf(
            "ocak" to Pair("Ocak", 31), "subat" to Pair("Şubat", 28), "mart" to Pair("Mart", 31),
            "nisan" to Pair("Nisan", 30), "mayis" to Pair("Mayıs", 31), "haziran" to Pair("Haziran", 30),
            "temmuz" to Pair("Temmuz", 31), "agustos" to Pair("Ağustos", 31), "eylul" to Pair("Eylül", 30),
            "ekim" to Pair("Ekim", 31), "kasim" to Pair("Kasım", 30), "aralik" to Pair("Aralık", 31)
        )
        for ((m, p) in monthDays) {
            if (f.contains(m) && (f.contains("kac gun") || f.contains("kac cekiyor") || f.contains("kac ceker"))) {
                val extra = if (m == "subat") " Artık yıllarda 29 çeker." else ""
                return Answer("${p.first} ayı ${p.second} gün çeker.$extra")
            }
        }

        // ---- Plaka kodları (offline) ----
        if (f.contains("plaka")) {
            plakaAnswer(f)?.let { return it }
        }
        if (f.contains("sarki soyle") || f.contains("sarki söylesene") || f.contains("bana sarki")) {
            return Answer("Sesim güzel değildir ama deniyorum: la la la... Olmadı, en iyisi sen söyle.")
        }
        if (f.contains("dans et")) {
            return Answer("Benim ayaklarım yok ama sen edebilirsin. Müziği açıyorum... şaka, müzik çalamam.")
        }
        if (f.contains("saril bana") || f.contains("sarıl")) {
            return Answer("Sanal sarılma gönderildi. Kendine iyi bak.")
        }
        if (f.contains("beni seviyor musun") || f.contains("beni sever misin")) {
            return Answer("Tabii ki! Sen benim en sevdiğim kullanıcısın.")
        }
        if (f.contains("zeki misin") || f.contains("akilli misin")) {
            return Answer("Küçük ama çalışkan bir zekam var. Her gün yeni şeyler öğreniyorum.")
        }
        if (f.contains("uyuyor musun") || f.contains("uyudun mu")) {
            return Answer("Ben hiç uyumam, hep buradayım.")
        }
        if (f.contains("aciktim") || f.contains("acım")) {
            return Answer("Mutfakta pratik bir şeyler hazırla: menemen her zaman kurtarır.")
        }
        if (f.contains("canim sikiliyor") || f.contains("sikildim")) {
            return Answer("O zaman sana bir bilmece sorayım mı? \"Bilmece\" yazman yeterli. Ya da şaka için \"espri\" yaz.")
        }
        if (f.contains("yazi tura") || f.contains("yazı tura") || f.contains("para at")) {
            return Answer(listOf("Yazı geldi!", "Tura geldi!").random())
        }
        if (f.contains("zar at")) {
            return Answer("Zar: ${(1..6).random()}")
        }
        if (f.contains("sansli sayim") || f.contains("sansli rakam")) {
            return Answer("Şanslı sayın: ${(1..100).random()}")
        }
        if (f.contains("renk sec") || f.contains("bana renk")) {
            return Answer(
                "Bugünün rengin: " + listOf("kırmızı", "mavi", "yeşil", "sarı", "mor", "turuncu", "pembe").random()
            )
        }
        if (f.contains("isim oner") || f.contains("bebek ismi") || f.contains("kedi ismi") || f.contains("kopek ismi")) {
            return Answer(
                "Önerim: " + listOf(
                    "Elif", "Zeynep", "Mehmet", "Mustafa", "Ayşe", "Emre",
                    "Selin", "Deniz", "Ege", "Yağmur", "Kerem", "Defne",
                    "Aras", "Mira", "Kuzey", "Asel", "Poyraz", "Nisan"
                ).random()
            )
        }
        if (f.contains("fal bak") || f.contains("falima bak") || f.contains("fal")) {
            return Answer(
                "Falında: " + listOf(
                    "yakında güzel bir haber alacaksın.",
                    "sabırlı ol, emeklerin karşılığını bulacak.",
                    "yeni bir başlangıç seni bekliyor.",
                    "sevdiklerinle güzel günler yakın."
                ).random() + " (Eğlencesine bakıldı.)"
            )
        }
        if (f.contains("ruyamda") || f.contains("ruyada") || f.contains("ruya tabiri")) {
            // Önce bankadaki özel tabire bak
            try {
                knowledge.find(raw, learned.all())?.let { return Answer(it) }
            } catch (_: Exception) {}
            val dream = when {
                f.contains("su ") || f.contains("su gordum") || f.contains("deniz") -> "Rüyada su görmek hayra yorulur derler."
                f.contains("ucmak") || f.contains("ucuyordum") -> "Rüyada uçmak özgürlük hissi derler."
                f.contains("yilan") -> "Rüyada yılan görmek dikkatli ol derler."
                f.contains("dis") -> "Rüyada diş görmek değişim derler."
                f.contains("bebek") -> "Rüyada bebek görmek yenilik derler."
                f.contains("para") -> "Rüyada para görmek kazanç derler."
                else -> null
            }
            return Answer((dream ?: "Rüyanı biraz anlat (örn: rüyamda deniz gördüm).") + " (Eğlencesine bakıldı.)")
        }
        if (f.contains("tas kagit makas") || f.contains("tas-kagit-makas") ||
            ((f.contains("tas") || f.contains("kagit") || f.contains("makas")) && f.contains("oyna"))
        ) {
            val pick = when {
                f.contains("kagit") -> "kağıt"
                f.contains("makas") -> "makas"
                f.contains("tas") -> "taş"
                else -> null
            }
            if (pick == null) {
                return Answer("Taş, kağıt, makas! Seçimini yaz (örn: taş kağıt makas oynayalım: taş).")
            }
            val bot = listOf("taş", "kağıt", "makas").random()
            val result = if (pick == bot) "Berabere!"
            else if ((pick == "taş" && bot == "makas") || (pick == "kağıt" && bot == "taş") || (pick == "makas" && bot == "kağıt")) "Kazandın!"
            else "Kaybettin!"
            return Answer("Sen: $pick, ben: $bot. $result Tekrar oynamak ister misin?")
        }
        if (f.contains("tarihte bugun") || f.contains("bugun tarihte ne oldu")) {            val md = SimpleDateFormat("MM-dd", Locale.US).format(Date())
            val ev = mapOf(
                "01-01" to "Yılbaşı. Yeni yılın ilk günü.",
                "03-18" to "18 Mart Çanakkale Zaferi.",
                "04-23" to "23 Nisan Ulusal Egemenlik ve Çocuk Bayramı. TBMM 1920'de bugün açıldı.",
                "05-19" to "19 Mayıs Atatürk'ü Anma, Gençlik ve Spor Bayramı. Atatürk 1919'da bugün Samsun'a çıktı.",
                "08-30" to "30 Ağustos Zafer Bayramı. Büyük Taarruz 1922'de zaferle bitti.",
                "10-29" to "29 Ekim Cumhuriyet Bayramı. Cumhuriyet 1923'te bugün ilan edildi.",
                "11-10" to "10 Kasım Atatürk'ü Anma Günü. Atatürk 1938'de bugün vefat etti."
            )[md]
            return Answer(ev ?: "Bugüne özel kayıtlı bir olay yok. Başka gün de sorabilirsin.")
        }
        if (f.contains("burc")) {
            val months = listOf("ocak","subat","mart","nisan","mayis","haziran","temmuz","agustos","eylul","ekim","kasim","aralik")
            val m = Regex("(\\d{1,2})\\s*(ocak|subat|mart|nisan|mayis|haziran|temmuz|agustos|eylul|ekim|kasim|aralik)").find(f)
            if (m != null) {
                val d = m.groupValues[1].toIntOrNull() ?: 0
                val mo = months.indexOf(m.groupValues[2]) + 1
                if (d in 1..31 && mo in 1..12) {
                    return Answer("Burcun: ${zodiac(d, mo)}")
                }
            }
            return Answer("Doğum gününü yazman yeterli (örn: burcum ne 12 mart).")
        }
        if (f.contains("karar ver") || f.contains("secemiyorum") || f.contains("hangisini secsem")) {
            val m = Regex("(.+?)\\s+(mi|mı|mu|mü)\\s+(.+?)\\s+(mi|mı|mu|mü)").find(f)
            if (m != null) {
                val a = m.groupValues[1].trim().split(" ").takeLast(2).joinToString(" ")
                val b = m.groupValues[3].trim().split(" ").takeLast(2).joinToString(" ")
                return Answer("Ben olsam ${listOf(a, b).random()} derim.")
            }
            return Answer("İki seçenek yaz (örn: sinema mı park mı karar ver).")
        }
        if (f.contains("dogum gunum") || f.contains("dogumgunum") || f.contains("iyi ki dogdun")) {
            return Answer("İyi ki doğdun! Nice mutlu yıllara.")
        }
        if (f.contains("yeni yil") || f.contains("yilbasi")) {
            return Answer("Mutlu yıllar! Yeni yıl sana güzellikler getirsin.")
        }
        if (f.contains("iyi bayramlar") || (f.contains("bayram") && f.contains("kutlu"))) {
            return Answer("İyi bayramlar! Sevdiklerinle nice bayramlara.")
        }
        if (f.contains("sigara") && (f.contains("zarar") || f.contains("icmeli") || f.contains("birakmali"))) {
            return Answer("Evet, sigara sağlığa ciddi zarar verir. Bırakmak için bir doktora danışman en doğrusu.")
        }
        if ((f.contains("kilo") || f.contains("zayiflamak") || f.contains("diyet")) && (f.contains("vermek") || f.contains("nasil") || f.contains("oner") || f.contains("tavsiye"))) {
            return Answer("Sağlıklı kilo için dengeli beslenme ve düzenli hareket önerilir. Sana özel plan için bir doktora danış.")
        }
        if (f.contains("hava durumu") || f.contains("hava nasil") || (f.contains("hava") && f.contains("kac derece"))) {
            if (!researcher.hasInternet()) {
                return Answer("Hava durumunu öğrenmem için internet gerekli. Şu an çevrimdışıyım.")
            }
            val g0 = try { researcher.guessPlace(raw) } catch (_: Exception) { null }
            val w = try {
                if (g0 != null) researcher.weatherNow(g0) else researcher.weatherNow("İstanbul")
            } catch (_: Exception) { null }
            if (w != null) {
                return Answer(w + (if (g0 != null) "" else " (İstanbul için gösterdim, şehir yazarsan onunkini söylerim.)"))
            }
            return Answer("O şehrin havasını bulamadım. Şehir adını net yazmayı dene.")
        }
        if (f.contains("dolar") || f.contains("euro") || f.contains("sterlin") || f.contains("altin fiyati") || f.contains("doviz")) {
            if (!researcher.hasInternet()) {
                return Answer("Güncel kurlar için internet gerekli. Şu an çevrimdışıyım.")
            }
            val r = try { researcher.tcmbRates() } catch (_: Exception) { null }
            if (r.isNullOrEmpty()) {
                return Answer("Kurlara şu an ulaşamadım. Biraz sonra tekrar dene.")
            }
            val names = mapOf("USD" to "Dolar", "EUR" to "Euro", "GBP" to "Sterlin")
            val want = mutableListOf<String>()
            if (f.contains("dolar")) want.add("USD")
            if (f.contains("euro")) want.add("EUR")
            if (f.contains("sterlin")) want.add("GBP")
            val keys = (if (want.isNotEmpty()) want.filter { r.containsKey(it) } else r.keys.toList())
            if (keys.isEmpty()) {
                return Answer("Kurlara şu an ulaşamadım. Biraz sonra tekrar dene.")
            }
            return Answer("Güncel kurlar (TCMB satış):\n" + keys.joinToString("\n") { "- ${names[it]}: ${r[it]} TL" })
        }

        // ---- Dünya saatleri (offline, cihaz saatinden hesaplanır) ----
        if (f.contains("saat")) {
            val cityTz = mapOf(
                "londra" to "Europe/London", "paris" to "Europe/Paris",
                "berlin" to "Europe/Berlin", "roma" to "Europe/Rome",
                "madrid" to "Europe/Madrid", "atina" to "Europe/Athens",
                "moskova" to "Europe/Moscow", "istanbul" to "Europe/Istanbul",
                "ankara" to "Europe/Istanbul", "baku" to "Asia/Baku",
                "kahire" to "Africa/Cairo", "dubai" to "Asia/Dubai",
                "tahran" to "Asia/Tehran", "delhi" to "Asia/Kolkata",
                "yeni delhi" to "Asia/Kolkata", "pekin" to "Asia/Shanghai",
                "tokyo" to "Asia/Tokyo", "seul" to "Asia/Seoul",
                "new york" to "America/New_York", "los angeles" to "America/Los_Angeles",
                "meksika" to "America/Mexico_City", "sao paulo" to "America/Sao_Paulo",
                "buenos aires" to "America/Argentina/Buenos_Aires", "sidney" to "Australia/Sydney"
            )
            for ((city, tz) in cityTz) {
                if (f.contains(city)) {
                    return try {
                        val fmt = SimpleDateFormat("HH:mm", Locale("tr"))
                        fmt.timeZone = java.util.TimeZone.getTimeZone(tz)
                        val pretty = city.split(" ").joinToString(" ") {
                            it.replaceFirstChar { c -> c.uppercase() }
                        }
                        Answer("$pretty'de saat ${fmt.format(Date())}")
                    } catch (_: Exception) {
                        Answer("O şehrin saatini hesaplayamadım.")
                    }
                }
            }
        }

        // ---- Saat / tarih (offline) ----
        if ((f.contains("saat") && f.contains("kac")) || f == "saat" || f == "saat kac") {
            return Answer("Saat " + SimpleDateFormat("HH:mm", Locale("tr")).format(Date()))
        }
        if (f.contains("tarih") || f.contains("bugun ne") || f.contains("gunlerden") || f.contains("hangi gundeyiz")) {
            return Answer("Bugün " + SimpleDateFormat("d MMMM yyyy EEEE", Locale("tr")).format(Date()))
        }
        if (f.contains("hangi yil") || f == "yil kac" || f.contains("kac yilindayiz")) {
            return Answer("Şu an " + SimpleDateFormat("yyyy", Locale("tr")).format(Date()) + " yılındayız.")
        }
        // "dün"/"yarın" kelime olarak geçmeli ("dünya"nın içindeki "dün" tuzağı)
        if (tokens.contains("yarin") && (f.contains("gun") || tokens.contains("ne") || tokens.contains("hangi") || tokens.size <= 2)) {
            val c = java.util.Calendar.getInstance().apply { add(java.util.Calendar.DAY_OF_YEAR, 1) }
            return Answer("Yarın " + SimpleDateFormat("EEEE", Locale("tr")).format(c.time) + ".")
        }
        if (tokens.contains("dun") && (f.contains("gun") || tokens.contains("ne") || tokens.contains("hangi") || tokens.size <= 2)) {
            val c = java.util.Calendar.getInstance().apply { add(java.util.Calendar.DAY_OF_YEAR, -1) }
            return Answer("Dün " + SimpleDateFormat("EEEE", Locale("tr")).format(c.time) + " idi.")
        }
        if (f.contains("yilin kacinci gunu") || f.contains("kacinci gundeyiz")) {
            val c = java.util.Calendar.getInstance()
            return Answer("Yılın ${c.get(java.util.Calendar.DAY_OF_YEAR)}. günündeyiz.")
        }
        if (f.contains("yilin kacinci haftasi") || f.contains("kacinci hafta")) {
            val c = java.util.Calendar.getInstance()
            return Answer("Yılın ${c.get(java.util.Calendar.WEEK_OF_YEAR)}. haftasındayız.")
        }
        if (f.contains("hangi ay") || f == "ay kac") {
            return Answer("Şu an " + SimpleDateFormat("MMMM", Locale("tr")).format(Date()) + " ayındayız.")
        }

        // ---- Boy-kilo endeksi (offline) ----
        bmiAnswer(f)?.let { return it }

        // ---- Hesap makinesi (offline) ----
        mathAnswer(f)?.let { return it }

        // ---- Birim çevirme (offline) ----
        unitAnswer(f)?.let { return it }

        // ---- Sıcaklık çevirme (offline) ----
        tempAnswer(f)?.let { return it }

        // ---- Cihaz komutları (sadece yazılıda) ----
        if (allowApps) {
            deviceAnswer(f)?.let { return it }
        }

        // ---- Uygulamalarım listesi ----
        if (f.contains("uygulamalar") && (f.contains("listele") || f.contains("neler") || f.contains("hangileri") || f.contains("goster"))) {
            return try {
                val apps = appLauncher.getAllApps().take(15).map { it.label }
                if (apps.isEmpty()) Answer("Yüklü uygulama bulamadım.")
                else Answer("Bunlardan bazıları:\n• " + apps.joinToString("\n• ") + "\n\nAçmam için adını söyle (örn: ${apps.firstOrNull() ?: ""} aç).")
            } catch (_: Exception) {
                Answer("Listeyi alamadım.")
            }
        }

        // ---- Uygulama açma (sadece yazılıda) ----
        if (allowApps && (tokens.contains("ac") || f.contains("baslat") || f.contains("calistir"))) {
            val opened = try { appLauncher.openAppByVoice(raw) } catch (_: Exception) { null }
            if (opened != null) return Answer("$opened açılıyor.")
            return Answer("Bu uygulamayı telefonda bulamadım. Listeyi görmek için \"uygulamalarımı listele\" yaz.")
        }

        // ---- Tarayıcıda aç (sadece yazılıda, internet varken anlamlı) ----
        if (allowApps) {
            browserAnswer(f)?.let { return it }
        }

        // ---- Gündem / son dakika (internet varken canlı haber, konulu da olur) ----
        if (f.contains("gundem") || f.contains("son dakika") || f.contains("son haber") ||
            f.contains("bugun ne oldu") || f.contains("turkiyede ne oluyor") || f.contains("haberler") ||
            f.contains("haberi") || f.contains("haberin")
        ) {
            if (!researcher.hasInternet()) {
                return Answer("Gündemi öğrenmem için internet gerekli. Şu an çevrimdışıyım.")
            }
            val stopN = setOf(
                "gundem", "son", "dakika", "haber", "haberi", "haberin", "haberler", "haberleri",
                "bugun", "ne", "oldu", "oluyor", "turkiyede", "turkiye", "var", "mi", "mu",
                "olan", "hakkindaki", "hakkinda", "ile", "ilgili", "bana", "ver", "goster",
                "soyle", "neler", "hangileri", "acaba"
            )
            val topic = f.split(" ").map { it.trim() }
                .filter { it.length >= 3 && !stopN.contains(it) }.joinToString(" ")
            if (topic.isNotBlank()) {
                val heads = try { news.search(topic, 5) } catch (_: Exception) { null }
                if (heads.isNullOrEmpty()) {
                    return Answer("Bu konuda taze haber bulamadım. Başka türlü sorar mısın?")
                }
                val sb = StringBuilder("'$topic' ile ilgili son haberler:\n")
                heads.forEachIndexed { i, h ->
                    sb.append("${i + 1}) ${h.title}")
                    if (h.source.isNotBlank()) sb.append(" (${h.source})")
                    sb.append("\n")
                }
                return Answer(sb.toString().trim())
            }
            val heads = try { news.top(5) } catch (_: Exception) { null }
            if (heads.isNullOrEmpty()) {
                return Answer("Haberlere şu an ulaşamadım. Biraz sonra tekrar dene.")
            }
            val sb = StringBuilder("Gündemde öne çıkanlar:\n")
            heads.forEachIndexed { i, h ->
                sb.append("${i + 1}) ${h.title}")
                if (h.source.isNotBlank()) sb.append(" (${h.source})")
                sb.append("\n")
            }
            return Answer(sb.toString().trim())
        }

        // ---- Sözlük (offline) ----
        try {
            dict.lookup(raw)?.let { return Answer(it) }
        } catch (_: Exception) {}

        // ---- İl plaka kodları (offline) ----
        if (f.contains("plaka")) {
            cityPlakaAnswer(f)?.let { return it }
        }

        // ---- Bilgi bankası + araştırma ----
        // "araştır X" denirse X temizlenip DOSDOĞRU araştırmaya gidilir.
        var query = raw
        var forceResearch = false
        val qf = query.lowercaseTurkish().trim()
        for (p in listOf("araştır ", "arastir ", "ara ", "bilgi ver ", "hakkında bilgi ver ", "hakkinda bilgi ")) {
            if (qf.startsWith(p)) {
                query = query.trim().substring(p.length).trim()
                forceResearch = true
                break
            }
        }
        if (query.isBlank()) query = raw
        // "araştır" sonda da olabilir ("kemal sunal araştır", katlanmış hali arastir)
        if (!forceResearch && tokens.contains("arastir")) {
            forceResearch = true
            query = tokens.filter { it != "arastir" }.joinToString(" ")
            if (query.isBlank()) {
                return Answer("Neyi araştırayım? Konuyu da yaz (örn: kemal sunal araştır).")
            }
        }
        // Oturum hafızası: zamir/takip sorusunu son konuya bağla ("o ne demek", "yaşı kaç")
        run {
            val ct = try {
                knowledgeTokens(query)
            } catch (_: Exception) {
                emptyList()
            }
            val bare = fold(query.lowercaseTurkish()).split(" ").map { it.trim() }.filter { it.isNotBlank() }
            val qw = setOf(
                "ne", "nedir", "nedi", "nasil", "neden", "nicin", "niye", "kim", "kac",
                "hangi", "hangisi", "nerede", "neresi", "mi", "mu", "misin", "musun", "kadar"
            )
            val pron = setOf("o", "bu", "bunu", "bunun", "onun", "onlar", "peki", "hmm", "ee", "sey", "ya")
            val hasQ = bare.any { pron.contains(it) || qw.contains(it) }
            val isFollowup = lastTopic.isNotBlank() && (ct.isEmpty() || (ct.size == 1 && hasQ))
            if (isFollowup) query = "$lastTopic $query"
        }
        // "daha fazla/detaylı" aynı konuda derinleşir (yeni arama yok, sentez genişler)
        if (lastContext.isNotBlank() && lastTopic.isNotBlank() &&
            (Regex("daha (fazla|detayli|ayrintili)").containsMatchIn(f) || f.contains("detay ver") || f.contains("acikla") || f.contains("genislet"))
        ) {
            if (researcher.hasInternet()) {
                try {
                    val exp = researcher.synthesizeTR(
                        "Şu konuyu daha ayrıntılı anlat: $lastTopic", lastContext, "önceki araştırma"
                    )
                    if (!exp.isNullOrBlank()) {
                        val full = exp + "\n(Derinleştirme)"
                        learned.add("$lastTopic detay", full)
                        return Answer(full)
                    }
                } catch (_: Exception) {}
            }
        }
        // Önce bilgi bankası + öğrenilenler (internetsiz de çalışır)
        if (!forceResearch) {
            try {
                knowledge.find(query, learned.all())?.let { return Answer(it) }
            } catch (_: Exception) {}
        }

        // Konum: bankada yoksa haritada göster
        if (f.contains("nerede") || f.contains("neresi") || f.contains("konum") || f.contains("haritada") || f.contains("harita")) {
            if (researcher.hasInternet()) {
                try {
                    val g = researcher.guessPlace(raw)
                    if (g != null) {
                        return Answer(
                            g.name + (if (g.country.isNotBlank()) " (${g.country})" else "") +
                                " burada: https://www.google.com/maps/search/?api=1&query=${g.lat},${g.lon}"
                        )
                    }
                } catch (_: Exception) {}
            }
        }

        // ---- Araştırma (internet varken): önce araştırma motoru (detaylı + kaynaklı), olmazsa yapay zeka ----
        if (!researcher.hasInternet()) {
            return Answer(
                "Şu an çevrimdışıyım, o yüzden bunu araştıramadım. Ama elimden çok şey gelir: " +
                    "hesap yaparım, birim çeviririm, saat-tarih söylerim" +
                    (if (allowApps) ", uygulama açarım" else "") +
                    ". İstersen farklı şekilde sormayı dene, belki kayıtlarımdadır."
            )
        }
        val r = try { researcher.research(query) } catch (_: Exception) { null }
        if (r != null) {
            val links = (if (r.urls.isNotEmpty()) r.urls else (if (r.url.isNotBlank()) listOf(r.url) else emptyList())).take(5)
            val linkLine = if (links.isNotEmpty()) "\nBağlantılar:\n" + links.joinToString("\n") else ""
            // RAG: kaynakları LLM ile düzenli Türkçe senteze dönüştür (olmazsa ham metin)
            var synth: String? = null
            try {
                synth = researcher.synthesizeTR(query, r.answer, r.source)
            } catch (_: Exception) {
                synth = null
            }
            val rawBody = run {
                val base = r.title.replace(Regex("\\s*-\\s*(wikipedia|vikipedi)$", RegexOption.IGNORE_CASE), "").trim()
                val dup = base.isNotBlank() &&
                    (r.answer.startsWith(r.title) || r.answer.lowercase().startsWith(base.lowercase()))
                if (dup) r.answer else "${r.title}: ${r.answer}"
            }
            val body = synth ?: rawBody
            val full = "$body\n(Kaynak: ${r.source})$linkLine"
            learned.add(query, full)
            lastTopic = try {
                researcher.cleanTopic(query).ifBlank { query }
            } catch (_: Exception) {
                query
            }
            lastTitle = r.title
            lastContext = r.answer
            return Answer(full)
        }
        try {
            ai.ask(query)?.let {
                learned.add(query, "$it\n(Yapay zeka yanıtı)")
                lastTopic = try {
                    researcher.cleanTopic(query).ifBlank { query }
                } catch (_: Exception) {
                    query
                }
                lastTitle = ""
                lastContext = ""
                return Answer("$it\n(Yapay zeka yanıtı)")
            }
        } catch (_: Exception) {}
        // Zorunlu araştırma bile boş döndüyse bankadaki kısa cevaba düş
        if (forceResearch) {
            try {
                knowledge.find(query, learned.all())?.let {
                    return Answer("$it\n(Detaylı araştırma yapamadım, interneti kontrol et.)")
                }
            } catch (_: Exception) {}
        }
        return Answer(
            Persona.pick(
                appCtx,
                listOf(Persona.V("Hmm, bunu tam çıkaramadım ya. Başka türlü anlatsana? Kısa sorarsan daha iyi yakalarım.")),
                listOf(
                    Persona.V(
                        "Hmm, bunu tam çıkaramadım. Biraz daha farklı anlatır mısın? " +
                            "İpucu: kısa ve net sorular en iyi sonucu verir (örn: \"Van kedisi nedir\")."
                    )
                ),
                listOf(Persona.V("Affedersiniz, anlayamadım. Farklı şekilde ifade eder misiniz?"))
            )
        )
    }

    // ---------- Boy-kilo endeksi ----------

    private fun bmiAnswer(f: String): Answer? {
        if (!f.contains("boy") || !(f.contains("kilo") || f.contains("kg"))) return null
        if (!f.contains("endeks") && !f.contains("hesapla") && !f.contains("kac") && !f.contains("bmi")) return null
        val nums = Regex("(\\d{2,3}(?:[.,]\\d+)?)").findAll(f).map {
            it.groupValues[1].replace(",", ".").toDoubleOrNull()
        }.filterNotNull().toList()
        if (nums.size < 2) return null
        // boy genelde 100-250, kilo 25-250 aralığında; sıraya göre değil değere göre ata
        val height = nums.firstOrNull { it in 100.0..250.0 } ?: return null
        val weight = nums.firstOrNull { it != height && it in 25.0..300.0 } ?: return null
        val m = height / 100.0
        val bmi = weight / (m * m)
        val cat = when {
            bmi < 18.5 -> "zayıf"
            bmi < 25 -> "normal"
            bmi < 30 -> "fazla kilolu"
            else -> "obez"
        }
        return Answer("Boy-kilo endeksin: ${fmtNum(bmi)} ($cat aralığı).")
    }

    // ---------- Hesap makinesi ----------

    private fun mathAnswer(f: String): Answer? {
        var s = " $f "
        val words = mapOf(
            "arti" to "+", "eksi" to "-", "carpi" to "*", "carp" to "*",
            "bolu" to "/", "bol" to "/", "uzeri" to "^", "uslu" to "^",
            "yuzde" to "%", "mod" to "%"
        )
        for ((w, op) in words) s = s.replace(w, op)
        // tek başına x (örn: 3 x 4)
        s = s.replace(Regex("(?<=\\d)\\s*x\\s*(?=\\d)"), "*")
        // gereksiz kelimeleri at
        for (w in listOf("hesapla", "kac", "eder", "ediyor", "sonuc", "nedir", "ise", "=", "?", "lira", "tl")) {
            s = s.replace(w, " ")
        }
        s = s.replace(",", ".").trim()
        if (s.isEmpty()) return null
        if (!s.matches(Regex("[0-9+\\-*/%^().\\s]+"))) return null
        if (!s.any { it.isDigit() }) return null
        if (!s.any { it in "+-*/%^" }) return null
        return try {
            val v = MathParser(s).parse()
            if (v.isNaN() || v.isInfinite()) return Answer("Bu hesabın sonucu tanımsız (sıfıra bölme olabilir).")
            Answer("$f = ${fmtNum(v)}")
        } catch (_: Exception) {
            null
        }
    }

    private fun fmtNum(v: Double): String {
        if (v == kotlin.math.floor(v) && kotlin.math.abs(v) < 1e15) return v.toLong().toString()
        var s = "%.4f".format(Locale.US, v).trimEnd('0').trimEnd('.')
        if (s == "-0") s = "0"
        return s
    }

    private class MathParser(val s: String) {
        var p = 0
        fun parse(): Double {
            val v = expr()
            skip()
            if (p != s.length) throw IllegalArgumentException("bad")
            return v
        }
        private fun skip() { while (p < s.length && s[p].isWhitespace()) p++ }
        private fun expr(): Double {
            var v = term()
            while (true) {
                skip()
                v = when {
                    p < s.length && s[p] == '+' -> { p++; v + term() }
                    p < s.length && s[p] == '-' -> { p++; v - term() }
                    else -> return v
                }
            }
        }
        private fun term(): Double {
            var v = factor()
            while (true) {
                skip()
                v = when {
                    p < s.length && s[p] == '*' -> { p++; v * factor() }
                    p < s.length && s[p] == '/' -> {
                        p++
                        val d = factor()
                        if (d == 0.0) throw ArithmeticException("zero")
                        v / d
                    }
                    p < s.length && s[p] == '%' -> { p++; v * factor() / 100.0 }
                    else -> return v
                }
            }
        }
        private fun factor(): Double {
            skip()
            var neg = false
            if (p < s.length && (s[p] == '+' || s[p] == '-')) {
                neg = s[p] == '-'; p++
            }
            skip()
            var v = when {
                p < s.length && s[p] == '(' -> {
                    p++
                    val x = expr()
                    skip()
                    if (p >= s.length || s[p] != ')') throw IllegalArgumentException("bad")
                    p++; x
                }
                else -> number()
            }
            skip()
            if (p < s.length && s[p] == '^') {
                p++
                v = v.pow(factor())
            }
            return if (neg) -v else v
        }
        private fun number(): Double {
            skip()
            val st = p
            var dot = false
            while (p < s.length && (s[p].isDigit() || s[p] == '.')) {
                if (s[p] == '.') {
                    if (dot) throw IllegalArgumentException("bad")
                    dot = true
                }
                p++
            }
            if (st == p) throw IllegalArgumentException("bad")
            return s.substring(st, p).toDouble()
        }
    }

    // ---------- Birim çevirme ----------

    private val unitAlias = mapOf(
        "mm" to "mm", "milimetre" to "mm",
        "cm" to "cm", "santimetre" to "cm", "santim" to "cm",
        "m" to "m", "metre" to "m",
        "km" to "km", "kilometre" to "km",
        "g" to "g", "gram" to "g",
        "kg" to "kg", "kilogram" to "kg", "kilo" to "kg",
        "ton" to "ton",
        "ml" to "ml", "mililitre" to "ml",
        "l" to "l", "lt" to "l", "litre" to "l",
        "sn" to "s", "saniye" to "s",
        "dk" to "dk", "dakika" to "dk",
        "saat" to "saat",
        "gun" to "gun"
    )
    private val unitBase = mapOf(
        "mm" to 0.001, "cm" to 0.01, "m" to 1.0, "km" to 1000.0,
        "g" to 1.0, "kg" to 1000.0, "ton" to 1_000_000.0,
        "ml" to 1.0, "l" to 1000.0,
        "s" to 1.0, "dk" to 60.0, "saat" to 3600.0, "gun" to 86400.0
    )

    private fun unitAnswer(f: String): Answer? {
        if (!f.contains("kac") && !f.contains("cevir") && !f.contains("donustur")) return null
        // Özel: dönüm <-> metrekare
        run {
            val m = Regex("([0-9]+(?:[.,][0-9]+)?)\\s*donum\\s*(?:kac|kaca|cevir|donustur)?\\s*metrekare").find(f)
            if (m != null) {
                val v = m.groupValues[1].replace(",", ".").toDoubleOrNull() ?: return@run
                return Answer("${fmtNum(v)} dönüm = ${fmtNum(v * 1000)} metrekare")
            }
            val m2 = Regex("([0-9]+(?:[.,][0-9]+)?)\\s*metrekare\\s*(?:kac|kaca|cevir|donustur)?\\s*donum").find(f)
            if (m2 != null) {
                val v = m2.groupValues[1].replace(",", ".").toDoubleOrNull() ?: return@run
                return Answer("${fmtNum(v)} metrekare = ${fmtNum(v / 1000)} dönüm")
            }
        }
        val m = Regex("([0-9]+(?:[.,][0-9]+)?)\\s*([a-z]+)\\s*(?:kac|kaca|cevir|donustur)?\\s*([a-z]+)").find(f)
            ?: return null
        val value = m.groupValues[1].replace(",", ".").toDoubleOrNull() ?: return null
        val u1 = unitAlias[m.groupValues[2]] ?: return null
        val u2 = unitAlias[m.groupValues[3]] ?: return null
        val b1 = unitBase[u1] ?: return null
        val b2 = unitBase[u2] ?: return null
        // aynı tür olmalı (uzunluk-kütle karışmasın): oran mantıklı aralıkta olmalı
        val res = value * b1 / b2
        if (res.isNaN() || res.isInfinite()) return null
        return Answer("${fmtNum(value)} ${m.groupValues[2]} = ${fmtNum(res)} ${m.groupValues[3]}")
    }

    // ---------- Sıcaklık çevirme ----------

    private fun tempAnswer(f: String): Answer? {
        val hasC = f.contains("derece") || f.contains("celcius") || f.contains("santigrat") ||
            Regex("\\b[0-9]+\\s*c\\b").containsMatchIn(f)
        val wantF = f.contains("fahrenayt") || f.contains("fahrenheit") ||
            Regex("kac\\s*f\\b").containsMatchIn(f)
        val wantK = f.contains("kelvin")
        if (!hasC && !wantF && !wantK) return null
        if (!f.contains("kac") && !f.contains("cevir") && !f.contains("donustur") && !f.contains("=")) return null
        val num = Regex("(-?[0-9]+(?:[.,][0-9]+)?)").find(f)?.groupValues?.get(1)
            ?.replace(",", ".")?.toDoubleOrNull() ?: return null
        return when {
            wantF && !wantK -> Answer("${fmtNum(num)} derece = ${fmtNum(num * 9 / 5 + 32)} fahrenayt")
            wantK -> Answer("${fmtNum(num)} derece = ${fmtNum(num + 273.15)} kelvin")
            f.contains("kelvin") && (f.contains("derece") || true) -> {
                // "300 kelvin kaç derece" kalıbı
                if (Regex("kelvin\\s*(kac|cevir|donustur|=)").containsMatchIn(f)) {
                    Answer("${fmtNum(num)} kelvin = ${fmtNum(num - 273.15)} derece")
                } else null
            }
            else -> null
        }
    }

    // ---------- Tarayıcıda aç ----------

    private fun browserAnswer(f: String): Answer? {
        val enc = { s: String -> java.net.URLEncoder.encode(s, "UTF-8") }
        for (p in listOf("googlede ara ", "googleda ara ", "google da ara ", "internette ara ")) {
            if (f.startsWith(p)) {
                val q = f.removePrefix(p).trim()
                if (q.length < 2) return null
                return Answer("Tarayıcıda arıyorum: $q", Action.OpenUrl("https://www.google.com/search?q=${enc(q)}"))
            }
        }
        for (p in listOf("youtubeda ", "youtube da ", "youtubeda ara ", "youtube izle ")) {
            if (f.startsWith(p)) {
                val q = f.removePrefix(p).trim()
                if (q.length < 2) return null
                return Answer("YouTube'da arıyorum: $q", Action.OpenUrl("https://www.youtube.com/results?search_query=${enc(q)}"))
            }
        }
        return null
    }

    // ---------- Cihaz komutları ----------

    private fun deviceAnswer(f: String): Answer? {
        // Soru soruyorsa cihazı kurcalama ("el feneri nedir" gibi)
        if (f.contains("nedir") || f.contains("nasil calisir") || f.contains("ne ise yarar")) return null
        val off = f.contains("kapat") || f.contains("sondur") || f.contains("kapa")
        if (f.contains("fener") || f.contains("flas") || f.contains("isik")) {
            return if (off) Answer("El feneri kapatılıyor.", Action.FlashOff)
            else Answer("El feneri açılıyor.", Action.FlashOn)
        }
        if (f.contains("wifi") || f.contains("vayfay") || f.contains("wi-fi") || f.contains("kablosuz")) {
            return Answer("Wifi ayarlarını açtım.", Action.WifiSettings)
        }
        if (f.contains("bluetooth") || f.contains("mavi dis")) {
            return Answer("Bluetooth ayarlarını açtım.", Action.BtSettings)
        }
        if (f.contains("sesi ac") || f.contains("ses ac") || f.contains("sesi yukselt") || f.contains("sesi arttir")) {
            return Answer("Sesi açtım.", Action.VolUp)
        }
        if (f.contains("sesi kis") || f.contains("ses kis") || f.contains("sesi azalt")) {
            return Answer("Sesi kıstım.", Action.VolDown)
        }
        return null
    }

    // ---------- Plaka kodları ----------

    private val plaka = mapOf(
        1 to "Adana", 2 to "Adıyaman", 3 to "Afyonkarahisar", 4 to "Ağrı",
        5 to "Amasya", 6 to "Ankara", 7 to "Antalya", 8 to "Artvin",
        9 to "Aydın", 10 to "Balıkesir", 11 to "Bilecik", 12 to "Bingöl",
        13 to "Bitlis", 14 to "Bolu", 15 to "Burdur", 16 to "Bursa",
        17 to "Çanakkale", 18 to "Çankırı", 19 to "Çorum", 20 to "Denizli",
        21 to "Diyarbakır", 22 to "Edirne", 23 to "Elazığ", 24 to "Erzincan",
        25 to "Erzurum", 26 to "Eskişehir", 27 to "Gaziantep", 28 to "Giresun",
        29 to "Gümüşhane", 30 to "Hakkari", 31 to "Hatay", 32 to "Isparta",
        33 to "Mersin", 34 to "İstanbul", 35 to "İzmir", 36 to "Kars",
        37 to "Kastamonu", 38 to "Kayseri", 39 to "Kırklareli", 40 to "Kırşehir",
        41 to "Kocaeli", 42 to "Konya", 43 to "Kütahya", 44 to "Malatya",
        45 to "Manisa", 46 to "Kahramanmaraş", 47 to "Mardin", 48 to "Muğla",
        49 to "Muş", 50 to "Nevşehir", 51 to "Niğde", 52 to "Ordu",
        53 to "Rize", 54 to "Sakarya", 55 to "Samsun", 56 to "Siirt",
        57 to "Sinop", 58 to "Sivas", 59 to "Tekirdağ", 60 to "Tokat",
        61 to "Trabzon", 62 to "Tunceli", 63 to "Şanlıurfa", 64 to "Uşak",
        65 to "Van", 66 to "Yozgat", 67 to "Zonguldak", 68 to "Aksaray",
        69 to "Bayburt", 70 to "Karaman", 71 to "Kırıkkale", 72 to "Batman",
        73 to "Şırnak", 74 to "Bartın", 75 to "Ardahan", 76 to "Iğdır",
        77 to "Yalova", 78 to "Karabük", 79 to "Kilis", 80 to "Osmaniye",
        81 to "Düzce"
    )

    private fun plakaAnswer(f: String): Answer? {
        val m = Regex("(\\d{1,2})\\s*plaka").find(f)
        if (m != null) {
            val code = m.groupValues[1].toIntOrNull() ?: return null
            val city = plaka[code] ?: return null
            return Answer("$code $city plaka kodudur.")
        }
        // "ankara plaka kaç" kalıbı
        if (f.contains("plaka")) {
            for ((code, city) in plaka) {
                if (f.contains(fold(city.lowercaseTurkish()))) {
                    return Answer("$city'nin plakası $code'dir.")
                }
            }
        }
        return null
    }

    // ---------- İl plaka kodları (81 il, çift yönlü) ----------

    private val cityPlaka = mapOf(
        1 to "Adana", 2 to "Adıyaman", 3 to "Afyonkarahisar", 4 to "Ağrı",
        5 to "Amasya", 6 to "Ankara", 7 to "Antalya", 8 to "Artvin",
        9 to "Aydın", 10 to "Balıkesir", 11 to "Bilecik", 12 to "Bingöl",
        13 to "Bitlis", 14 to "Bolu", 15 to "Burdur", 16 to "Bursa",
        17 to "Çanakkale", 18 to "Çankırı", 19 to "Çorum", 20 to "Denizli",
        21 to "Diyarbakır", 22 to "Edirne", 23 to "Elazığ", 24 to "Erzincan",
        25 to "Erzurum", 26 to "Eskişehir", 27 to "Gaziantep", 28 to "Giresun",
        29 to "Gümüşhane", 30 to "Hakkari", 31 to "Hatay", 32 to "Isparta",
        33 to "Mersin", 34 to "İstanbul", 35 to "İzmir", 36 to "Kars",
        37 to "Kastamonu", 38 to "Kayseri", 39 to "Kırklareli", 40 to "Kırşehir",
        41 to "Kocaeli", 42 to "Konya", 43 to "Kütahya", 44 to "Malatya",
        45 to "Manisa", 46 to "Kahramanmaraş", 47 to "Mardin", 48 to "Muğla",
        49 to "Muş", 50 to "Nevşehir", 51 to "Niğde", 52 to "Ordu",
        53 to "Rize", 54 to "Sakarya", 55 to "Samsun", 56 to "Siirt",
        57 to "Sinop", 58 to "Sivas", 59 to "Tekirdağ", 60 to "Tokat",
        61 to "Trabzon", 62 to "Tunceli", 63 to "Şanlıurfa", 64 to "Uşak",
        65 to "Van", 66 to "Yozgat", 67 to "Zonguldak", 68 to "Aksaray",
        69 to "Bayburt", 70 to "Karaman", 71 to "Kırıkkale", 72 to "Batman",
        73 to "Şırnak", 74 to "Bartın", 75 to "Ardahan", 76 to "Iğdır",
        77 to "Yalova", 78 to "Karabük", 79 to "Kilis", 80 to "Osmaniye",
        81 to "Düzce"
    )

    private fun cityPlakaAnswer(f: String): Answer? {
        if (!f.contains("plaka")) return null
        val m = Regex("(\\d{1,2})\\s*plaka").find(f)
        if (m != null) {
            val code = m.groupValues[1].toIntOrNull() ?: return null
            val city = cityPlaka[code] ?: return null
            return Answer("$code plaka $city ilinindir.")
        }
        for ((code, city) in cityPlaka) {
            if (f.contains(fold(city.lowercaseTurkish()))) {
                return Answer("$city'nin plakası $code'dir.")
            }
        }
        return null
    }

    // ---------- Yardımcı ----------

    private fun zodiac(day: Int, month: Int): String {
        return when {
            (month == 3 && day >= 21) || (month == 4 && day <= 19) -> "Koç"
            (month == 4 && day >= 20) || (month == 5 && day <= 20) -> "Boğa"
            (month == 5 && day >= 21) || (month == 6 && day <= 20) -> "İkizler"
            (month == 6 && day >= 21) || (month == 7 && day <= 22) -> "Yengeç"
            (month == 7 && day >= 23) || (month == 8 && day <= 22) -> "Aslan"
            (month == 8 && day >= 23) || (month == 9 && day <= 22) -> "Başak"
            (month == 9 && day >= 23) || (month == 10 && day <= 22) -> "Terazi"
            (month == 10 && day >= 23) || (month == 11 && day <= 21) -> "Akrep"
            (month == 11 && day >= 22) || (month == 12 && day <= 21) -> "Yay"
            (month == 12 && day >= 22) || (month == 1 && day <= 19) -> "Oğlak"
            (month == 1 && day >= 20) || (month == 2 && day <= 18) -> "Kova"
            else -> "Balık"
        }
    }

    private fun fold(s: String): String {
        val sb = StringBuilder(s.length)
        for (c in s) sb.append(
            when (c) {
                'ç' -> 'c'; 'ğ' -> 'g'; 'ı' -> 'i'; 'ö' -> 'o'; 'ş' -> 's'; 'ü' -> 'u'
                else -> c
            }
        )
        return sb.toString()
    }
}
