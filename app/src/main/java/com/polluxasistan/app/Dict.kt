package com.polluxasistan.app

import android.content.Context
import org.json.JSONObject

/** Paketlenmiş İngilizce-Türkçe mini sözlük (assets/dict.json). */
class Dict(private val ctx: Context) {

    private val pairs: List<Pair<String, String>> by lazy { load() }

    private fun load(): List<Pair<String, String>> {
        return try {
            val json = ctx.assets.open("dict.json").bufferedReader().use { it.readText() }
            val arr = JSONObject(json).getJSONArray("pairs")
            List(arr.length()) { i ->
                val p = arr.getJSONArray(i)
                p.getString(0) to p.getString(1)
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    /** "apple ne demek" / "elma ingilizce" kalıpları. Bulunamazsa null. */
    fun lookup(rawQuery: String): String? {
        var q = fold(rawQuery.lowercaseTurkish()).trim()
        val suffixes = listOf(
            "ne demek", "nedir ingilizce", "ingilizcesi ne", "ingilizcesi",
            "ingilizce ne", "ingilizce nedir",
            "ingilizce karsiligi", "ingilizcesi nedir", "in english",
            "turkcesi", "turkcesi ne", "turkce karsiligi", "turkce anlami", "ne anlama geliyor"
        )
        var stripped = false
        for (s in suffixes) {
            if (q.endsWith(s)) {
                q = q.removeSuffix(s).trim()
                stripped = true
                break
            }
        }
        if (!stripped) return null
        if (q.isBlank() || q.contains(" ")) return null
        for ((en, tr) in pairs) {
            if (q == fold(en)) return "$en = $tr"
            if (q == fold(tr)) return "$tr = $en"
        }
        // Yazım yanlışı toleransı (1 harf): "aple" -> "apple"
        if (q.length >= 4) {
            for ((en, tr) in pairs) {
                val fe = fold(en)
                val ft = fold(tr)
                if (q.length >= 4 && fe.length >= 4 &&
                    kotlin.math.abs(q.length - fe.length) <= 1 && levenshtein(q, fe) <= 1
                ) return "$en = $tr"
                if (q.length >= 4 && ft.length >= 4 && !ft.contains(" ") &&
                    kotlin.math.abs(q.length - ft.length) <= 1 && levenshtein(q, ft) <= 1
                ) return "$tr = $en"
            }
        }
        return null
    }

    private fun levenshtein(a: String, b: String): Int {
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
                else -> c
            }
        )
        return sb.toString()
    }
}
