package com.polluxasistan.app

import android.content.Context
import android.os.Handler
import android.os.Looper
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.GZIPInputStream

/**
 * Paketlenmis cevrimdisi bilgi bankasi (assets/knowledge.json).
 *
 * 3 asamali eslesme:
 * 1) Birebir obek (hizli ve kesin yol).
 * 2) Tek kelimelik anahtar: onek toleransli ("kediler" -> "kedi").
 * 3) Anlam benzeri skorlama: sira bagimsiz (devrik cumle), yazim
 *    yanlisi toleransli (1-2 harf), ek toleransli ("baskenti"~"baskent")
 *    ve esanlamli kelimeli ("bas sehir"~"baskent", "kac kisi"~"nufus").
 */
class Knowledge(private val ctx: Context) {

    data class Entry(val keys: List<String>, val answer: String)

    @Volatile
    private var cache: List<Entry>? = null

    private val entries: List<Entry>
        get() = cache ?: synchronized(this) {
            cache ?: load().also { cache = it }
        }

    /** Yeniden yukle: indirme sonrasi yeni set hemen devreye girsin. */
    fun reset() {
        synchronized(this) {
            cache = null
        }
    }

    private fun parse(json: String): List<Entry> {
        val arr = JSONObject(json).getJSONArray("entries")
        return List(arr.length()) { i ->
            val o = arr.getJSONObject(i)
            val ka = o.getJSONArray("k")
            val keys = List(ka.length()) { j -> ka.getString(j) }
            Entry(keys, o.getString("a"))
        }
    }

    private fun load(): List<Entry> {
        // Once indirilen mobil set; bozuk/eksikse sil ve paketteki 100K sete don
        val full = File(ctx.filesDir, DOWNLOADED_JSON)
        if (full.exists() && full.length() > 1_000_000) {
            if (full.length() > 50_000_000) {
                // Eski (telefona uygun olmayan ~1GB) surumden kalan dosya: sil
                try {
                    full.delete()
                } catch (_: Exception) {}
            } else {
                var oom = false
                val fromFile = try {
                    parse(full.bufferedReader().use { it.readText() })
                } catch (t: Throwable) {
                    oom = t is OutOfMemoryError
                    null
                }
                if (fromFile != null && fromFile.isNotEmpty()) return fromFile
                // Bellek yetmediyse dosyayi silme (tekrar indirmek cozum olmaz);
                // bozuksa sil ki yeniden indirilebilsin.
                if (!oom) {
                    try {
                        full.delete()
                    } catch (_: Exception) {}
                }
            }
        }
        return try {
            parse(ctx.assets.open("knowledge.json").bufferedReader().use { it.readText() })
        } catch (_: Exception) {
            emptyList()
        }
    }

    /** Uygulama acilisinda arka planda cagrilir: ilk soru beklemesin. */
    fun warmup() {
        try {
            entries.size
        } catch (_: Exception) {}
    }

    /**
     * Telefon icin genisletilmis seti indirir (yaklasik 250 bin kayit).
     * Kaldigi yerden devam edebilir: yarim kalan .gz durur, sonraki
     * denemede Range ile o noktadan surer.
     * Akis: indir -> dogrulanmis gzip acma -> atomik kurma.
     */
    fun downloadFullDataset(onProgress: (Int, String) -> Unit, onDone: (Boolean, String) -> Unit) {
        if (downloading) {
            onDone(false, "İndirme zaten sürüyor")
            return
        }
        downloading = true
        Thread {
            try {
                cleanupLegacy()
                val gz = File(ctx.filesDir, DOWNLOADED_GZ)
                var startAt = if (gz.exists()) gz.length() else 0L

                var conn = openConn(startAt)
                var code = conn.responseCode
                if (code == 200 && startAt > 0) {
                    // Sunucu Range'i yok saydi: bastan indir
                    gz.delete()
                    startAt = 0L
                    conn.disconnect()
                    conn = openConn(0L)
                    code = conn.responseCode
                }
                if (code == 416 && startAt > 0) {
                    // Parca gecersiz/tam: bastan indir
                    gz.delete()
                    startAt = 0L
                    conn.disconnect()
                    conn = openConn(0L)
                    code = conn.responseCode
                }
                if (code != 200 && code != 206) {
                    postDone(onDone, false, "Sunucu hatası: HTTP $code")
                    return@Thread
                }
                val chunkLen = conn.contentLength.toLong()
                val total = if (code == 206) startAt + chunkLen else chunkLen

                FileOutputStream(gz, startAt > 0).use { out ->
                    conn.inputStream.use { input ->
                        val buf = ByteArray(65536)
                        var done = startAt
                        var lastPct = -1
                        while (true) {
                            val read = input.read(buf)
                            if (read <= 0) break
                            out.write(buf, 0, read)
                            done += read
                            if (total > 0) {
                                val pct = ((done * 100L) / total).toInt().coerceIn(0, 100)
                                if (pct != lastPct) {
                                    lastPct = pct
                                    postProgress(onProgress, pct, "İndiriliyor... %$pct")
                                }
                            }
                        }
                    }
                }

                val fileLen = gz.length()
                if (total > 0 && fileLen < total) {
                    val pct = (fileLen * 100 / total).toInt()
                    postDone(onDone, false, "Bağlantı kesildi (%$pct) — kaldığı yerden devam edecek")
                    return@Thread
                }

                postProgress(onProgress, 100, "Açılıyor...")

                val tmp = File(ctx.filesDir, "knowledge.json.tmp")
                try {
                    GZIPInputStream(gz.inputStream()).use { gzIn ->
                        FileOutputStream(tmp).use { out -> gzIn.copyTo(out, 65536) }
                    }
                } catch (_: Exception) {
                    tmp.delete()
                    gz.delete()
                    postDone(onDone, false, "İnen dosya bozuk çıktı, baştan denenecek")
                    return@Thread
                }

                val good = tmp.length() > 1_000_000 && try {
                    val head = ByteArray(1)
                    tmp.inputStream().use { it.read(head) }
                    head[0] == '{'.code.toByte()
                } catch (_: Exception) {
                    false
                }
                if (!good) {
                    tmp.delete()
                    gz.delete()
                    postDone(onDone, false, "Doğrulama başarısız")
                    return@Thread
                }

                val json = File(ctx.filesDir, DOWNLOADED_JSON)
                try {
                    json.delete()
                } catch (_: Exception) {}
                if (!tmp.renameTo(json)) {
                    try {
                        tmp.inputStream().use { i -> json.outputStream().use { o -> i.copyTo(o, 65536) } }
                        tmp.delete()
                    } catch (e: Exception) {
                        postDone(onDone, false, "Kurulamadı: ${e.message ?: "hata"}")
                        return@Thread
                    }
                }
                gz.delete()
                reset()
                postDone(onDone, true, "")
            } catch (e: Exception) {
                postDone(onDone, false, e.message ?: "Bilinmeyen hata")
            } finally {
                downloading = false
            }
        }.start()
    }

    /** Eski surumden kalan artık dosyalari temizle (yeni adlari bozmaz). */
    fun cleanupLegacy() {
        try {
            val old = File(ctx.filesDir, "knowledge.json.gz")
            if (old.exists()) old.delete()
        } catch (_: Exception) {}
        if (downloading) return
        try {
            val staleTmp = File(ctx.filesDir, "knowledge.json.tmp")
            if (staleTmp.exists()) staleTmp.delete()
        } catch (_: Exception) {}
    }

    private fun openConn(startAt: Long): HttpURLConnection {
        val conn = (URL(DATA_URL).openConnection() as HttpURLConnection).apply {
            connectTimeout = 30000
            readTimeout = 300000
            requestMethod = "GET"
            setRequestProperty("User-Agent", "PolluxAsistan/1.1")
            instanceFollowRedirects = true
        }
        if (startAt > 0) conn.setRequestProperty("Range", "bytes=$startAt-")
        conn.connect()
        return conn
    }

    private fun postProgress(cb: (Int, String) -> Unit, pct: Int, msg: String) {
        try {
            Handler(Looper.getMainLooper()).post { cb(pct, msg) }
        } catch (_: Exception) {}
    }

    private fun postDone(cb: (Boolean, String) -> Unit, ok: Boolean, err: String) {
        try {
            Handler(Looper.getMainLooper()).post { cb(ok, err) }
        } catch (_: Exception) {}
    }

    /** Indirilen genisletilmis set yuklu mu? */
    fun hasFullDataset(): Boolean {
        val f = File(ctx.filesDir, DOWNLOADED_JSON)
        return f.exists() && f.length() > 1_000_000
    }

    fun find(rawQuery: String, extra: List<Entry> = emptyList()): String? {
        // "Fransa'nin" -> "Fransa": ozel isim eklerini at
        val cleaned = rawQuery.replace(Regex("([A-Za-zÇçĞğİıÖöŞşÜü]+)'[A-Za-zÇçĞğİıÖöŞşÜü]*"), "$1")
        val q = " " + fold(cleaned.lowercaseTurkish()) + " "
        // Ogrenilenler oncelikli: once onlarda ara, sonra bankada
        return searchPool(q, cleaned, extra) ?: searchPool(q, cleaned, entries)
    }

    private fun searchPool(q: String, cleaned: String, all: List<Entry>): String? {
        // (q: katlanmis tam sorgu, cleaned: ham sorgu)
        // Anlam skoru once hesaplanir (tam-kapsama onceligi icin)
        val sem = semanticScore(q, cleaned, all)
        if (sem.second != null) return sem.second
        // 1) Birebir obek: SADECE cok kelimeli anahtar (tek kelime 2. asamada)
        var best: Entry? = null
        var bestLen = 0
        for (e in all) {
            for (k in e.keys) {
                if (!fold(k).trim().contains(" ")) continue
                val key = " " + fold(k) + " "
                if (q.contains(key) && key.trim().length > bestLen) {
                    bestLen = key.trim().length
                    best = e
                }
            }
        }
        if (bestLen >= 4) return best?.answer
        // 3) Skorlama sonucu (tam kapsamayan en iyi)
        if (sem.first != null) return sem.first
        // 2) Tek kelimelik anahtarlar: onek toleransi
        return singleToken(q, all)
    }

    /**
     * Anlam skorlamasi: Pair(en iyi cevap, tam-kapsama cevabi).
     * Tam kapsama = anahtar ve sorgu birebir ortusuyor (en guclu sinyal).
     */
    private fun semanticScore(q: String, cleaned: String, all: List<Entry>): Pair<String?, String?> {
        val qwords = tokens(cleaned).map { stem(it) }.filter { it.length >= 3 }
        if (qwords.isEmpty()) return Pair(null, null)
        var best: Entry? = null
        var bestScore = 0
        var full: String? = null
        for (e in all) {
            for (k in e.keys) {
                val kw = tokens(k).map { stem(it) }.filter { it.length >= 3 }
                if (kw.size < 2) continue // tek kelime: 2. asamanin isi
                var pts = 0
                var matched = 0
                var exactLong = 0
                val qhit = BooleanArray(qwords.size)
                for (w in kw) {
                    var p = 0
                    var pi = -1
                    for ((qi, qw) in qwords.withIndex()) {
                        val s = tokenScore(w, qw)
                        if (s > p) {
                            p = s
                            pi = qi
                        }
                        if (p >= 2) break
                    }
                    if (p > 0) {
                        matched++
                        pts += p
                        if (p >= 2 && w.length >= 3) exactLong++
                        if (pi >= 0) qhit[pi] = true
                    }
                }
                val ok = if (kw.size <= 3) {
                    matched == kw.size && pts >= 2 * kw.size - 1 && exactLong >= 1
                } else {
                    matched.toDouble() / kw.size >= 0.6 && exactLong >= 2 && pts >= kw.size + 1
                }
                if (ok) {
                    val score = pts * 10 + k.length
                    if (score > bestScore) {
                        bestScore = score
                        best = e
                    }
                    if (full == null && kw.size == qwords.size && qhit.all { it }) {
                        full = e.answer
                    }
                }
            }
        }
        return Pair(best?.answer, full)
    }

    /** Tek kelimelik anahtarlar: birebir ya da onek ("kediler"->"kedi"). */
    private fun singleToken(q: String, all: List<Entry>): String? {
        // Soru kelimeleri ("kim" gibi) onek tuzagina dusmesin diye elenir
        val raws = tokens(q)
        val qwords = raws.map { stem(it) }.filter { it.length >= 3 }
        if (qwords.isEmpty() && raws.isEmpty()) return null
        var fallback: String? = null
        for (e in all) {
            for (k in e.keys) {
                // Stopword sonrasi tek kelimeye dusen anahtar tek sayilir ("felsefe nedir"->"felsefe")
                val ckt = tokens(k)
                if (ckt.isEmpty()) continue
                val single = ckt.size == 1
                val kt = if (single) ckt[0] else fold(k).trim()
                if (!single && (kt.isEmpty() || kt.contains(" "))) continue
                // 2 harfli anahtar (ay/su/ud): sadece kisa soruda birebir
                if (kt.length == 2) {
                    if (raws.size <= 2 && raws.contains(kt)) return e.answer
                    continue
                }
                if (kt.length < 3) continue
                if (q.contains(" $kt ")) return e.answer
                if (fallback == null) {
                    for (qw in qwords) {
                        val a = stem(kt)
                        val b = stem(qw)
                        if ((qw.startsWith(kt) || kt.startsWith(qw)) &&
                            kotlin.math.abs(qw.length - kt.length) <= 2
                        ) {
                            fallback = e.answer
                            break
                        }
                        // Ek almis hali ("kedisi" -> "kedi")
                        if ((b.startsWith(a) || a.startsWith(b)) && a.length >= 3 &&
                            kotlin.math.abs(b.length - a.length) <= 2
                        ) {
                            fallback = e.answer
                            break
                        }
                    }
                    // Yazim toleransi: uzun tek kelime, kisa soru ("kanal"->"kangal")
                    // Tek kelimelik soruda 2 harfe kadar ("kanagl"->"kangal")
                    if (fallback == null && kt.length >= 5 && raws.size <= 2) {
                        val tol1 = if (raws.size == 1) 2 else 1
                        for (qw in raws) {
                            if (qw.length >= 4 && kotlin.math.abs(qw.length - kt.length) <= 1 &&
                                levenshtein(qw, kt) <= tol1
                            ) {
                                fallback = e.answer
                                break
                            }
                        }
                    }
                }
            }
        }
        return fallback
    }

    /**
     * Iki kok arasi skor: 2 = birebir/onek/ek toleransli, 1 = yazim
     * yanlisi (kisa kelimede 1 harf, uzunda 2 harf), 0 = alakasiz.
     * Onekte 3 harf farka izin var ("sava"~"savasin": ek okumalari
     * cakisnca kok kisa kalabilir).
     */
    internal fun tokenScore(a: String, b: String): Int {
        if (a == b) return 2
        val x = synonym(a)
        val y = synonym(b)
        if (x == y) return 2
        for (p in listOf(a to b, x to y, a to y, x to b)) {
            val (s, t) = p
            val short = minOf(s.length, t.length)
            if (short >= 4 && (s.startsWith(t) || t.startsWith(s)) &&
                kotlin.math.abs(s.length - t.length) <= 3
            ) return 2
            if (short == 3 && (s.startsWith(t) || t.startsWith(s)) &&
                kotlin.math.abs(s.length - t.length) <= 2
            ) return 2
        }
        if (a.length < 3 || b.length < 3) return 0
        val tol = if (minOf(a.length, b.length) >= 5) 2 else 1
        if (levenshtein(a, b) <= tol) return 1
        if (levenshtein(x, y) <= tol) return 1
        // Fiil kokleri: uzun ortak baslangic ("yetistirme"~"yetistirilir")
        for (p in listOf(a to b, x to y, a to y, x to b)) {
            val (s, t) = p
            var common = 0
            val lim = minOf(s.length, t.length)
            while (common < lim && s[common] == t[common]) common++
            if (common >= 5) return 1
        }
        return 0
    }

    /** Hafif kok bulma: yaygin isim eklerini at ("fransanin"->"fransa"). */
    internal fun stem(t: String): String {
        // Fiil zarf ekleri once ("silerken"->"siler")
        for (suf in VERB_SUFFIXES) {
            if (t.endsWith(suf) && t.length - suf.length >= 4) return stem(t.dropLast(suf.length))
        }
        // Gecmis zaman kipi ("gordum"->"gor", "gittik"->"git")
        for (suf in PAST_SUFFIXES) {
            if (t.endsWith(suf) && t.length - suf.length >= 3) return stem(t.dropLast(suf.length))
        }
        if (t.length < 6) {
            // Kisa kelimede sadece cogul eki (kok en az 4 harf kalirsa)
            for (suf in listOf("ler", "lar")) {
                if (t.endsWith(suf) && t.length - suf.length >= 4) return t.dropLast(suf.length)
            }
            return t
        }
        for (suf in SUFFIXES) {
            if (t.endsWith(suf)) {
                // Ulke adlarini koru: "pakistan" -> "pakis" olmasin
                if ((suf == "tan" || suf == "ten" || suf == "dan" || suf == "den") && t.endsWith("stan")) continue
                val stem = t.dropLast(suf.length)
                val minStem = if (suf.length == 1) 6 else 4
                if (stem.length >= minStem) return stem
            }
        }
        return t
    }

    internal fun tokens(s: String): List<String> {
        val words = fold(s).replace(Regex("[^a-z0-9 .]+"), " ")
            .split(" ")
            .map { it.trim().trimEnd('.') }
            .filter { it.isNotBlank() && it !in STOPWORDS }
            .map { ORDINALS[it] ?: it }
        // Ikili: "bas sehir/sehri/kent" -> "baskent"
        val out = mutableListOf<String>()
        var i = 0
        while (i < words.size) {
            if (i + 1 < words.size && words[i] == "bas" &&
                words[i + 1] in setOf("sehir", "sehri", "sehrin", "kent", "kenti", "kentin")
            ) {
                out.add("baskent")
                i += 2
            } else {
                out.add(words[i])
                i++
            }
        }
        return out
    }

    internal fun synonym(t: String): String = SYNONYMS[t] ?: t

    internal fun levenshtein(a: String, b: String): Int {
        if (a == b) return 0
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        var prev = IntArray(b.length + 1) { it }
        var cur = IntArray(b.length + 1)
        for (i in 1..a.length) {
            cur[0] = i
            for (j in 1..b.length) {
                cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + if (a[i - 1] == b[j - 1]) 0 else 1)
            }
            val tmp = prev; prev = cur; cur = tmp
        }
        return prev[b.length]
    }

    private fun fold(s: String): String {
        val sb = StringBuilder(s.length)
        for (c in s) sb.append(
            when (c) {
                'ç' -> 'c'; 'ğ' -> 'g'; 'ı' -> 'i'; 'ö' -> 'o'; 'ş' -> 's'; 'ü' -> 'u'
                '\'', '’', '`' -> ' '
                else -> c
            }
        )
        return sb.toString().replace(Regex("\\s+"), " ")
    }

    companion object {
        /** Telefona uygun genisletilmis set (yaklasik 250 bin kayit, ~3 MB indirme). */
        const val DATA_URL =
            "https://github.com/BekirEfeAyar/pollux-asistan/releases/download/v2.0.23-data/knowledge-mobile.json.gz"
        private const val DOWNLOADED_JSON = "knowledge.json"
        private const val DOWNLOADED_GZ = "knowledge-mobile.json.gz"

        /** Tum Knowledge nesneleri arasinda paylasilan indirme kilidi. */
        @Volatile
        internal var downloading = false

        /** Fiil zarf ekleri (isim eklerinden once denenir). */
        internal val VERB_SUFFIXES = listOf("erek", "arak", "iyor", "ecek", "acak", "ken")

        /** Gecmis zaman kipi ("gordum"->"gor"). Kok en az 3 harf kalir. */
        internal val PAST_SUFFIXES = listOf(
            "dum", "dim", "dun", "din", "tum", "tim", "tun", "tin",
            "duk", "dik", "tuk", "tik"
        )
        /**
         * Uzundan kisaya sirali ek listesi. Iyelik/hal ekleri (si/su/i/u)
         * yapim eklerinden (li/lu) ONCE denenir, yoksa "istanbulu"
         * yanlislikla "istanbu" olur.
         */
        internal val SUFFIXES = listOf(
            "lerin", "larin", "nin", "nun", "sin", "sun", "in", "un",
            "si", "su", "i", "u", "ler", "lar",
            "den", "dan", "ten", "tan", "de", "da", "te", "ta",
            "le", "la", "lik", "luk", "siz", "suz", "ci", "cu",
            "ca", "ce", "li", "lu", "ki"
        )

        /** Soru iskeleti: anlama katki vermeyen kelimeler (katlanmis). */
        internal val STOPWORDS = setOf(
            "mi", "mu", "misin", "musun", "nedir", "nedi", "ne",
            "neresi", "nerede", "nere", "nerde", "hangisi", "hangi",
            "kac", "nasil", "neden", "nicin", "niye", "kim",
            "acaba", "lutfen", "bana", "soyle", "soyler", "anlat",
            "bilgi", "hakkinda", "ogret", "ogren", "eder", "et",
            "olan", "olarak", "dir", "bir", "bu", "o",
            "ve", "ile", "icin", "kadar", "sence", "peki", "ise"
        )

        /** Esanlamlilar: ayni anlama gelen farkli yazimlar (katlanmis). */
        internal val SYNONYMS = mapOf(
            "kent" to "sehir",
            "kenti" to "sehir",
            "kentin" to "sehir",
            "sehri" to "sehir",
            "sehrin" to "sehir",
            "bassehir" to "baskent",
            "bassehri" to "baskent",
            "memleket" to "ulke",
            "devlet" to "ulke",
            "ilk" to "birinci",
            "kisi" to "nufus",
            "kisiler" to "nufus",
            "genis" to "buyuk",
            "kocaman" to "buyuk",
            "rakim" to "yukseklik",
            "irtifa" to "yukseklik",
            "harp" to "savas",
            "muharebe" to "savas",
            "icat" to "bulus",
            "vefat" to "olum",
            "kurulma" to "kurulus",
            "kuruldu" to "kurulus",
            "rahatsizlik" to "hastalik",
            "yiyecek" to "yemek",
            "padisah" to "hukumdar",
            "kral" to "hukumdar",
            "feth" to "fetih",
            "fetheden" to "fetih",
            "fethetti" to "fetih",
            "fethet" to "fetih",
            "fethett" to "fetih",
            "fethi" to "fetih",
            "fethin" to "fetih",
            "dogdu" to "dogum",
            "kesfetti" to "kesif",
            "kesfeden" to "kesif",
            "irmak" to "nehir",
            "hekim" to "doktor",
            "feza" to "uzay",
            "yeryuzu" to "dunya",
            "vakit" to "zaman",
            "mekan" to "yer",
            "gor" to "gormek",
            "git" to "gitmek",
            "bak" to "bakmak",
            "al" to "almak",
            "ver" to "vermek",
            "gel" to "gelmek",
            "yap" to "yapmak",
            "sor" to "sormak",
            "yaz" to "yazmak",
            "kos" to "kosmak",
            "oku" to "okumak",
            "otur" to "oturmak",
            "kalk" to "kalkmak",
            "don" to "donmek",
            "dur" to "durmak",
            "kal" to "kalmak",
            "bul" to "bulmak"
        )

        /** Rakam sira sayilari: "2." -> "ikinci" (katlanmis). */
        internal val ORDINALS = mapOf(
            "1" to "birinci", "2" to "ikinci", "3" to "ucuncu",
            "4" to "dorduncu", "5" to "besinci", "6" to "altinci",
            "7" to "yedinci", "8" to "sekizinci", "9" to "dokuzuncu",
            "10" to "onuncu"
        )
    }
}
