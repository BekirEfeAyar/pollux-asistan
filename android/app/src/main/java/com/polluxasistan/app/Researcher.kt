package com.polluxasistan.app

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import java.net.URLEncoder
import org.json.JSONObject
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/**
 * Ücretsiz + keysiz araştırma (DETAYLI cevaplar).
 * Sırayla dener:
 * 1) Wikipedia TR: başlık çözümleme (opensearch) + tam özet + sayfa linki
 * 2) DuckDuckGo html: ilk sonuçlar + snippet + link
 * İnternet yoksa null döner, çağıran "internet yok" der.
 */
class Researcher(private val context: Context) {

    fun hasInternet(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        return if (Build.VERSION.SDK_INT >= 23) {
            val net = cm.activeNetwork ?: return false
            val caps = cm.getNetworkCapabilities(net) ?: return false
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        } else {
            @Suppress("DEPRECATION")
            cm.activeNetworkInfo?.isConnected == true
        }
    }

    data class Result(
        val title: String,
        val answer: String,
        val source: String,
        val url: String = "",
        val urls: List<String> = emptyList()
    )

    fun research(query: String): Result? {
        if (!hasInternet()) return null
        val topic = cleanTopic(query)
        val raw = query.trim()
        // Katmanlar: TR tam metin -> EN tam metin -> TR özet -> DDG (detay kazanır)
        // Kaynakları BİRLEŞTİR: Wiki tam metin + DDG sonuçları (detay kazanır)
        val parts = mutableListOf<String>()
        val urls = mutableListOf<String>()
        var title = topic
        val w = wikiFull(topic) ?: wikiFull(raw)
            ?: wikiFullEn(topic) ?: wikiFullEn(raw)
            ?: wikiSummary(topic) ?: wikiSummary(raw)
        if (w != null && w.answer.length >= 100) {
            parts.add(translateTR(w.answer))
            if (w.url.isNotBlank() && !urls.contains(w.url)) urls.add(w.url)
            if (w.title.isNotBlank()) title = w.title
        }
        val d = ddgSearch(topic, query) ?: ddgSearch(raw, query)
        if (d != null) {
            parts.add("Öne çıkan sonuçlar:\n" + translateTR(d.answer))
            val du = if (d.urls.isNotEmpty()) d.urls else (if (d.url.isNotBlank()) listOf(d.url) else emptyList())
            for (u in du) if (!urls.contains(u)) urls.add(u)
            if (title == topic && d.title.isNotBlank()) title = d.title
        }
        if (parts.isEmpty()) {
            if (w != null) {
                val a = translateTR(w.answer)
                if (w.url.isNotBlank() && !urls.contains(w.url)) urls.add(w.url)
                return Result(w.title.ifBlank { topic }, a, w.source, w.url, urls)
            }
            return null
        }
        val names = mutableListOf<String>()
        if (w != null && w.answer.length >= 100) names.add(w.source)
        if (d != null) names.add(d.source)
        var answer = parts.joinToString("\n\n")
        if (answer.length > 4500) answer = answer.take(4500).trim() + "..."
        return Result(title, answer, names.joinToString(" + ").ifBlank { "İnternet" }, urls.firstOrNull() ?: "", urls)
    }

    /** İngilizce metin mi? (Türkçe harf yok + İngilizce kalıplar var) */
    fun needsTR(t: String): Boolean {
        if (Regex("[çğıöşüÇĞİÖŞÜ]").findAll(t).count() >= 3) return false
        val marks = listOf(
            "the", "and", "is", "was", "are", "were", "with", "from", "that", "have", "has",
            "for", "will", "would", "this", "these", "those", "which", "who", "been", "had",
            "his", "her", "their", "about", "into", "over", "after", "before", "between",
            "through", "during", "each", "other", "many", "some", "such", "only", "than",
            "very", "more", "most", "also", "often"
        )
        val low = " " + t.lowercase(Locale.US).replace(Regex("[^a-z ]"), " ") + " "
        var n = 0
        for (m in marks) {
            n += Regex(" $m ").findAll(low).count()
            if (n >= 4) return true
        }
        return false
    }

    /** İngilizceyse cümle cümle Türkçeye çevir (MyMemory, anahtarsız). */
    fun translateTR(text: String): String {
        if (!needsTR(text)) return text
        return try {
            val sents = text.replace(Regex("([.!?…]+)\\s+"), "$1\n").split("\n")
                .map { it.trim() }.filter { it.isNotBlank() }
            val chunks = mutableListOf<String>()
            var cur = ""
            for (s in sents) {
                if ((cur + " " + s).trim().length > 350 && cur.isNotBlank()) {
                    chunks.add(cur.trim())
                    cur = s
                } else cur = (cur + " " + s).trim()
            }
            if (cur.isNotBlank()) chunks.add(cur.trim())
            val done = mutableListOf<String>()
            for (c in chunks.take(6)) {
                val t = translateChunk(c) ?: return text
                done.add(t)
            }
            if (chunks.size > 6) done.add("...")
            done.joinToString(" ")
        } catch (_: Exception) {
            text
        }
    }

    private fun translateChunk(chunk: String): String? {
        // Önce MyMemory, olmazsa Google gtx
        try {
            val enc = URLEncoder.encode(chunk, "UTF-8")
            val j = httpGet(
                URL("https://api.mymemory.translated.net/get?q=$enc&langpair=en|tr"), 15000
            ) ?: throw Exception("net")
            val o = JSONObject(j)
            if (o.optInt("responseStatus", 0) == 200) {
                val t = o.optJSONObject("responseData")?.optString("translatedText", "")?.trim() ?: ""
                if (t.length > 5 && !t.contains("QUERY LENGTH LIMIT", true) && !t.contains("INVALID", true)) {
                    return t
                }
            }
        } catch (_: Exception) {}
        return try {
            val enc = URLEncoder.encode(chunk, "UTF-8")
            val j = httpGet(
                URL("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=tr&dt=t&q=$enc"),
                15000
            ) ?: return null
            val outer = org.json.JSONArray(j).optJSONArray(0) ?: return null
            val sb = StringBuilder()
            for (i in 0 until outer.length()) {
                sb.append(outer.optJSONArray(i)?.optString(0, "") ?: "")
            }
            val t = sb.toString().trim()
            if (t.length > 5) t else null
        } catch (_: Exception) {
            null
        }
    }

    /** Soru kalıbını at, konuyu bırak ("kuantum nedir" -> "kuantum"). */
    fun cleanTopic(rawQuery: String): String {
        var s = rawQuery.lowercase(Locale("tr", "TR"))
            .replace(Regex("[?!.,;:()\"'«»]"), " ").replace(Regex("\\s+"), " ").trim()
        val strip = listOf(
            "nedir", "nedir", "ne demek", "ne demektir", "hangisi", "hangisidir",
            "kaç", "kaçtır", "kaçı", "ne", "nasıl", "neden", "niçin", "kim",
            "kimdir", "nerede", "neresi", "neresidir", "hakkında", "bilgi ver",
            "bilgi verir misin", "araştır", "anlat", "anlatır mısın", "söyler misin",
            "söyler misin", "söyle", "acaba", "bana", "lütfen", "mi", "mı",
            "mu", "mü", "misin", "mısın", "musun", "müsün", "miyim", "eder misin",
            "der misin", "olur musun", "kadar", "tane", "sence", "peki", "ya",
            "ise", "olan", "dir", "dır"
        )
        var changed = true
        while (changed && s.isNotBlank()) {
            changed = false
            for (w in strip) {
                if (s == w) {
                    s = ""
                    changed = true
                    break
                }
                if (s.startsWith("$w ")) {
                    s = s.substring(w.length + 1)
                    changed = true
                }
                if (s.endsWith(" $w")) {
                    s = s.substring(0, s.length - w.length - 1)
                    changed = true
                }
            }
            s = s.replace(Regex("\\s+"), " ").trim()
        }
        return s.trim()
    }

    private fun wikiSummary(topic: String): Result? {
        if (topic.length < 2) return null
        return try {
            // 1) Başlığı çözümle
            val enc = URLEncoder.encode(topic, "UTF-8")
            val os = httpGet(
                URL("https://tr.wikipedia.org/w/api.php?action=opensearch&format=json&search=$enc&limit=1&namespace=0"),
                15000
            ) ?: return null
            var title = ""
            try {
                val arr = JSONArray(os)
                val titles = arr.optJSONArray(1)
                if (titles != null && titles.length() > 0) title = titles.optString(0, "")
            } catch (_: Exception) {}
            val slug = URLEncoder.encode(if (title.isNotBlank()) title else topic.replace(" ", "_"), "UTF-8")
            // 2) DETAYLI özet
            val json = httpGet(URL("https://tr.wikipedia.org/api/rest_v1/page/summary/$slug"), 15000)
                ?: return null
            val obj = JSONObject(json)
            val extract = obj.optString("extract", "").trim()
            if (extract.length <= 40) return null
            var page = ""
            try {
                page = obj.optJSONObject("content_urls")
                    ?.optJSONObject("desktop")?.optString("page", "") ?: ""
            } catch (_: Exception) {}
            var text = extract
            if (text.length > 2000) text = text.take(2000).trim() + "..."
            Result(obj.optString("title", title.ifBlank { topic }), text, "Wikipedia", page, listOfNotNull(page.takeIf { it.isNotBlank() }))
        } catch (_: Exception) {
            null
        }
    }

    /** Wikipedia TAM metin (girişin ötesi, ~3000 karakter). */
    private fun wikiFull(topic: String): Result? {
        if (topic.length < 2) return null
        return try {
            val enc = URLEncoder.encode(topic, "UTF-8")
            val os = httpGet(
                URL("https://tr.wikipedia.org/w/api.php?action=opensearch&format=json&search=$enc&limit=1&namespace=0"),
                15000
            ) ?: return null
            var title = ""
            try {
                val arr = JSONArray(os)
                val titles = arr.optJSONArray(1)
                if (titles != null && titles.length() > 0) title = titles.optString(0, "")
            } catch (_: Exception) {}
            val name = title.ifBlank { topic }
            val json = httpGet(
                URL("https://tr.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&exchars=3000&titles=" + URLEncoder.encode(name, "UTF-8")),
                15000
            ) ?: return null
            val pages = JSONObject(json).optJSONObject("query")?.optJSONObject("pages") ?: return null
            val keys = pages.keys()
            if (!keys.hasNext()) return null
            val pg = pages.optJSONObject(keys.next()) ?: return null
            if (pg.has("missing")) return null
            val extract = pg.optString("extract", "").trim()
            if (extract.length < 200) return null
            var text = extract
            if (text.length > 3000) text = text.take(3000).trim() + "..."
            val pageTitle = pg.optString("title", name)
            val page = "https://tr.wikipedia.org/wiki/" + URLEncoder.encode(pageTitle.replace(" ", "_"), "UTF-8")
            Result(pageTitle, text, "Wikipedia", page, listOf(page))
        } catch (_: Exception) {
            null
        }
    }

    /** İngilizce Vikipedi yedeği (TR yoksa/cılızsa), Türkçeye çevrilir. */
    private fun wikiFullEn(topic: String): Result? {
        if (topic.length < 2) return null
        return try {
            val enc = URLEncoder.encode(topic, "UTF-8")
            val os = httpGet(
                URL("https://en.wikipedia.org/w/api.php?action=opensearch&format=json&search=$enc&limit=1&namespace=0"),
                15000
            ) ?: return null
            var title = ""
            try {
                val arr = JSONArray(os)
                val titles = arr.optJSONArray(1)
                if (titles != null && titles.length() > 0) title = titles.optString(0, "")
            } catch (_: Exception) {}
            val name = title.ifBlank { topic }
            val json = httpGet(
                URL("https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&explaintext=1&exchars=2500&titles=" + URLEncoder.encode(name, "UTF-8")),
                15000
            ) ?: return null
            val pages = JSONObject(json).optJSONObject("query")?.optJSONObject("pages") ?: return null
            val keys = pages.keys()
            if (!keys.hasNext()) return null
            val pg = pages.optJSONObject(keys.next()) ?: return null
            if (pg.has("missing")) return null
            val extract = pg.optString("extract", "").trim()
            if (extract.length < 200) return null
            var text = extract
            if (text.length > 2500) text = text.take(2500).trim() + "..."
            val pageTitle = pg.optString("title", name)
            val page = "https://en.wikipedia.org/wiki/" + URLEncoder.encode(pageTitle.replace(" ", "_"), "UTF-8")
            Result(pageTitle, text, "Wikipedia (EN)", page, listOf(page))
        } catch (_: Exception) {
            null
        }
    }

    private fun ddgSearch(topic: String): Result? {
        return ddgSearch(topic, topic)
    }

    private fun ddgSearch(topic: String, rawQuery: String): Result? {
        if (topic.length < 2) return null
        return try {
            val enc = URLEncoder.encode(topic, "UTF-8")
            val html = httpGet(
                URL("https://html.duckduckgo.com/html/?q=$enc"), 12000,
                "Mozilla/5.0 (Linux; Android 10) PolluxAsistan/1.0"
            ) ?: return null
            data class Hit(val title: String, val snip: String, val href: String)
            val hits = mutableListOf<Hit>()
            val re = Regex("<a[^>]*class=\"result__a\"[^>]*href=\"([^\"]+)\"[^>]*>([\\s\\S]*?)</a>[\\s\\S]*?<a[^>]*class=\"result__snippet\"[^>]*>([\\s\\S]*?)</a>")
            fun strip(s: String): String {
                return s.replace(Regex("<[^>]+>"), "").replace("&quot;", "\"")
                    .replace("&#x27;", "'").replace("&amp;", "&").trim()
            }
            for (m in re.findAll(html)) {
                if (hits.size >= 5) break
                var href = m.groupValues[1].trim()
                val ud = Regex("[?&]uddg=([^&]+)").find(href)
                if (ud != null) {
                    try {
                        href = java.net.URLDecoder.decode(ud.groupValues[1], "UTF-8")
                    } catch (_: Exception) {}
                } else if (href.startsWith("//")) href = "https:$href"
                val title = strip(m.groupValues[2])
                val snip = strip(m.groupValues[3])
                if (href.startsWith("http") && (title.isNotBlank() || snip.isNotBlank())) {
                    hits.add(Hit(title, snip, href))
                }
            }
            if (hits.isEmpty()) return null
            // ALAKA FİLTRESİ: sorguyla alakasız sonuçları ele (random dökülmesin)
            val kb = try { Knowledge(context) } catch (_: Exception) { null }
            val qtokens: List<String> = if (kb != null) {
                kb.tokens(rawQuery).map { kb.stem(it) }.filter { it.length >= 3 }
            } else {
                rawQuery.lowercase(java.util.Locale("tr", "TR")).split(" ").filter { it.length >= 4 }
            }
            val thr = if (Regex("fark|ayirt|karsilastir|mukayese").containsMatchIn(
                    rawQuery.lowercase(java.util.Locale("tr", "TR"))
                )
            ) 0.6 else 0.4
            val scored = mutableListOf<Pair<Hit, Double>>()
            for (ho in hits) {
                var cov = 0.0
                var exactLong = false
                if (kb != null && qtokens.isNotEmpty()) {
                    val wt = kb.tokens(ho.title + " " + ho.snip).map { kb.stem(it) }
                        .filter { it.length >= 3 }
                    var hit = 0
                    for (q in qtokens) {
                        var p = 0
                        for (w in wt) {
                            p = maxOf(p, kb.tokenScore(w, q))
                            if (p >= 2) break
                        }
                        if (p > 0) {
                            hit++
                            if (p >= 2 && q.length >= 6) exactLong = true
                        }
                    }
                    if (wt.isNotEmpty()) cov = hit.toDouble() / qtokens.size
                } else {
                    val low = (ho.title + " " + ho.snip).lowercase()
                    var hit = 0
                    for (q in qtokens) if (low.contains(q)) hit++
                    if (qtokens.isNotEmpty()) cov = hit.toDouble() / qtokens.size
                }
                if (cov >= thr || exactLong) scored.add(Pair(ho, cov))
            }
            if (scored.isEmpty()) return null
            scored.sortByDescending { it.second }
            // Benzer tekrarları ele
            fun tokSet(hh: Hit): Set<String> {
                return (hh.title + " " + hh.snip).lowercase().split(Regex("[^a-zçğıöşü]+"))
                    .filter { it.length >= 4 }.toSet()
            }
            val kept = mutableListOf<Pair<Hit, Double>>()
            for (pr in scored) {
                val st = tokSet(pr.first)
                var dup = false
                for (kp in kept) {
                    val kt = tokSet(kp.first)
                    val inter = st.intersect(kt).size.toDouble()
                    val union = (st.size + kt.size - inter).coerceAtLeast(1.0).toDouble()
                    if (inter / union >= 0.75) {
                        dup = true
                        break
                    }
                }
                if (!dup) kept.add(pr)
                if (kept.size >= 3) break
            }
            if (kept.isEmpty()) return null
            val first = kept[0].first
            var answer = (if (first.title.isNotBlank()) first.title + ": " else "") + first.snip
            for (i in 1 until kept.size) {
                if (kept[i].first.snip.isNotBlank()) answer += "\n• " + kept[i].first.snip
            }
            answer = answer.trim()
            if (answer.length < 40) return null
            if (answer.length > 2500) answer = answer.take(2500).trim() + "..."
            val urls = kept.map { it.first.href }.distinct()
            Result(first.title.ifBlank { topic }, answer, "DuckDuckGo", first.href, urls)
        } catch (_: Exception) {
            null
        }
    }

    private fun httpGet(url: URL, timeout: Int, ua: String = "PolluxAsistan/1.0"): String? {
        return try {
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = timeout
            conn.readTimeout = timeout
            conn.setRequestProperty("User-Agent", ua)
            conn.inputStream.bufferedReader().use { it.readText() }
        } catch (_: Exception) { null }
    }

    // ---------- yapay zeka (RAG sentezi icin): DuckDuckGo chat -> Pollinations ----------

    private val duckUA =
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"

    private fun duckStatus(): String? {
        return try {
            val conn = (URL("https://duckduckgo.com/duckchat/v1/status").openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 10_000
                requestMethod = "GET"
                setRequestProperty("User-Agent", duckUA)
                setRequestProperty("x-vqd-accept", "1")
            }
            conn.connect()
            if (conn.responseCode !in 200..299) return null
            conn.inputStream.close()
            conn.getHeaderField("x-vqd-4") ?: conn.getHeaderField("x-vqd-hash-1")
        } catch (_: Exception) {
            null
        }
    }

    private fun duckChat(prompt: String): String? {
        val vqd = duckStatus() ?: return null
        return try {
            val body = JSONObject()
                .put("model", "openai/gpt-4o-mini")
                .put("messages", org.json.JSONArray().put(JSONObject().put("role", "user").put("content", prompt)))
                .toString()
            val conn = (URL("https://duckduckgo.com/duckchat/v1/chat").openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 40_000
                requestMethod = "POST"
                doOutput = true
                setRequestProperty("User-Agent", duckUA)
                setRequestProperty("x-vqd-4", vqd)
                setRequestProperty("Content-Type", "application/json")
                setRequestProperty("Accept", "text/event-stream")
            }
            conn.outputStream.bufferedWriter(Charsets.UTF_8).use { it.write(body) }
            if (conn.responseCode !in 200..299) return null
            val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            var best = ""
            for (line in text.split("\n")) {
                val lt = line.trim()
                if (!lt.startsWith("data:")) continue
                val payload = lt.removePrefix("data:").trim()
                if (payload.isBlank() || payload == "[DONE]") continue
                try {
                    val o = JSONObject(payload)
                    var txt = o.optString("message", "")
                    if (txt.isBlank()) txt = o.optJSONObject("delta")?.optString("content", "") ?: ""
                    if (txt.isBlank()) txt = o.optString("content", "")
                    if (txt.length > best.length) best = txt
                } catch (_: Exception) {}
            }
            best = best.trim()
            if (best.length > 20) best.take(2500) else null
        } catch (_: Exception) {
            null
        }
    }

    private fun pollinationsAsk(prompt: String): String? {
        for (i in 0 until 2) {
            try {
                val enc = URLEncoder.encode(prompt, "UTF-8")
                val t = httpGet(URL("https://text.pollinations.ai/$enc?model=openai"), 30000) ?: continue
                val text = t.trim()
                if (text.length >= 30 && !text.contains("ENOSPC", true) && !text.contains("deprecat", true)) {
                    return text.take(2500)
                }
            } catch (_: Exception) {}
        }
        return null
    }

    private fun llmAsk(prompt: String): String? {
        return try {
            duckChat(prompt) ?: pollinationsAsk(prompt)
        } catch (_: Exception) {
            try {
                pollinationsAsk(prompt)
            } catch (_: Exception) {
                null
            }
        }
    }

    /** Kaynaklara dayalı Türkçe sentez (RAG): düzenli, maddeli, girişsiz. */
    fun synthesizeTR(question: String, context: String, sourceNames: String): String? {
        if (context.trim().length < 60) return null
        return try {
            val ctx = context.trim().take(3000)
            val prompt = "Sen Pollux adında bir asistansın. Karakterin: sıcak, esprili ama saygılı, " +
                "meraklı, bazen soru soran, robot gibi değil arkadaş gibi konuşan. " +
                "Aşağıdaki KAYNAKLARA dayanarak soruyu Türkçe cevapla. Kurallar: düzenli ve ayrıntılı ol, " +
                "gereken yerde madde kullan, giriş cümlesi kurma, kaynaksız bilgi uydurma, cevabın sonunda " +
                "\"Kaynaklar:\" diye bir satır açıp kullanılan kaynak adlarını yaz.\n" +
                "SORU: " + question.trim() + "\nKAYNAKLAR (" + sourceNames + "):\n" + ctx
            // Süre üst sınırı: 80 sn (olmazsa ham metin döner)
            var out: String? = null
            val t = Thread { out = try { llmAsk(prompt) } catch (_: Exception) { null } }
            t.start()
            t.join(80_000)
            try {
                if (t.isAlive) t.interrupt()
            } catch (_: Exception) {}
            out
        } catch (_: Exception) {
            null
        }
    }

    // ---------- canlı veri (hepsi ücretsiz + anahtarsız) ----------

    /** TCMB günlük kurlar: dolar / euro / sterlin satış fiyatı. */
    fun tcmbRates(): Map<String, String>? {
        return try {
            val xml = httpGet(URL("https://www.tcmb.gov.tr/kurlar/today.xml"), 12000) ?: return null
            val out = mutableMapOf<String, String>()
            for (code in listOf("USD", "EUR", "GBP")) {
                val m = Regex("<Currency[^>]*Kod=\"$code\"[\\s\\S]*?<ForexSelling>([0-9.,]+)</ForexSelling>").find(xml)
                if (m != null) out[code] = m.groupValues[1]
            }
            if (out.isEmpty()) null else out
        } catch (_: Exception) {
            null
        }
    }

    data class Geo(val name: String, val lat: Double, val lon: Double, val country: String)

    fun geoCity(name: String): Geo? {
        return try {
            val enc = URLEncoder.encode(name, "UTF-8")
            val j = httpGet(
                URL("https://geocoding-api.open-meteo.com/v1/search?name=$enc&count=1&language=tr"), 10000
            ) ?: return null
            val arr = JSONObject(j).optJSONArray("results") ?: return null
            if (arr.length() == 0) return null
            val r = arr.optJSONObject(0) ?: return null
            Geo(
                r.optString("name", name),
                r.optDouble("latitude", 0.0),
                r.optDouble("longitude", 0.0),
                r.optString("country", "")
            )
        } catch (_: Exception) {
            null
        }
    }

    private val wmoTr = mapOf(
        0 to "açık", 1 to "çoğunlukla açık", 2 to "parçalı bulutlu", 3 to "kapalı",
        45 to "sisli", 48 to "kırağılı sis", 51 to "hafif çisenti", 53 to "çisenti",
        55 to "yoğun çisenti", 61 to "hafif yağmur", 63 to "yağmur", 65 to "şiddetli yağmur",
        71 to "hafif kar", 73 to "kar", 75 to "yoğun kar", 77 to "kar taneleri",
        80 to "hafif sağanak", 81 to "sağanak", 82 to "şiddetli sağanak",
        95 to "gök gürültülü", 96 to "dolu riski"
    )

    /** Şehir adı ya da Geo verilir, güncel hava durumunu döndürür. */
    fun weatherNow(cityName: String): String? {
        val g = geoCity(cityName) ?: return null
        return weatherNow(g)
    }

    fun weatherNow(g: Geo): String? {
        return try {
            val j = httpGet(
                URL("https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}" +
                    "&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto"),
                12000
            ) ?: return null
            val c = JSONObject(j).optJSONObject("current") ?: return null
            if (!c.has("temperature_2m")) return null
            val desc = wmoTr[c.optInt("weather_code", -1)] ?: "değişken"
            val lastVowel = Regex("[aeıioöuü](?=[^aeıioöuü]*$)").find(
                g.name.lowercase(java.util.Locale("tr", "TR"))
            )?.value ?: "a"
            val suf = if ("aıou".contains(lastVowel)) "'da" else "'de"
            val temp = kotlin.math.round(c.optDouble("temperature_2m", 0.0)).toInt()
            val hum = if (c.has("relative_humidity_2m")) c.optInt("relative_humidity_2m", -1).toString() else "?"
            val wind = kotlin.math.round(c.optDouble("wind_speed_10m", 0.0)).toInt()
            "${g.name}$suf şu an $temp derece, $desc (nem %$hum, rüzgar $wind km/s)"
        } catch (_: Exception) {
            null
        }
    }

    private val placeStop = setOf(
        "hava", "durumu", "nasil", "bilgi", "ver", "soyle", "acaba", "bana",
        "lutfen", "nerede", "neresi", "konum", "haritada", "harita", "goster",
        "kac", "derece", "sicaklik", "bugun", "yarin", "simdi", "an", "ve",
        "ile", "icin", "da", "de", "mi", "mu"
    )

    /** Sorudaki şehir/yer adını bul (katlanmamış yazımla dener). */
    fun guessPlace(raw: String): Geo? {
        return try {
            val toks = raw.lowercase(java.util.Locale("tr", "TR")).split(" ")
                .map { it.trim() }.filter { it.isNotBlank() }
            val cands = toks.filter { t ->
                val fl = t.replace('ç', 'c').replace('ğ', 'g').replace('ı', 'i')
                    .replace('ö', 'o').replace('ş', 's').replace('ü', 'u')
                fl.length >= 3 && !placeStop.contains(fl)
            }.sortedByDescending { it.length }.take(3)
            for (t in cands) {
                try {
                    val g = geoCity(t)
                    if (g != null) return g
                } catch (_: Exception) {}
            }
            null
        } catch (_: Exception) {
            null
        }
    }
}
