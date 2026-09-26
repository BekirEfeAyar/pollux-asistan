package com.polluxasistan.app

import android.content.Context

/**
 * Pollux personası + kullanıcı stiline uyum.
 * Her mesajda stil sinyalleri sayılır (resmi/samimi), cevap havuzları
 * buna göre seçilir. Tercih SharedPreferences'ta saklanır, zamanla oturur.
 */
object Persona {

    private const val F = "persona_prefs"

    private val formalMarks = listOf(
        "lütfen", "teşekkür ederim", "rica ederim", "iyi günler", "merhaba",
        "günaydın", "iyi akşamlar", "saygılar", "efendim", "siz "
    )
    private val casualMarks = listOf(
        "slm", "mrb", "nbr", "tmm", "aynen", "kanka", "abi ", "bro", " ya ",
        " he ", "hacı", "xd", ":d", "ahaha", "hahaha", "yaa", "hee", "hmm"
    )

    private fun p(ctx: Context) =
        ctx.getSharedPreferences(F, Context.MODE_PRIVATE)

    fun track(ctx: Context, raw: String) {
        try {
            val t = " " + raw.lowercase(java.util.Locale("tr", "TR")) + " "
            var f = 0
            var c = 0
            for (m in formalMarks) if (t.contains(m)) f++
            for (m in casualMarks) if (t.contains(m)) c++
            if (Regex("[\\uD83C-\\uDBFF\\uDC00-\\uDFFF☀-➿️]").containsMatchIn(raw)) {
                val e = p(ctx).getInt("emoji", 0)
                p(ctx).edit().putInt("emoji", e + 1).apply()
                c++
            }
            if (Regex("[!?]{2,}").containsMatchIn(raw)) c++
            val pr = p(ctx)
            pr.edit()
                .putInt("formal", pr.getInt("formal", 0) + f)
                .putInt("casual", pr.getInt("casual", 0) + c)
                .putInt("total", pr.getInt("total", 0) + 1)
                .putInt("lenSum", pr.getInt("lenSum", 0) + raw.trim().length)
                .putInt("lenN", pr.getInt("lenN", 0) + 1)
                .apply()
        } catch (_: Exception) {}
    }

    fun mood(ctx: Context): String {
        return try {
            val pr = p(ctx)
            val sig = pr.getInt("formal", 0) + pr.getInt("casual", 0)
            if (sig >= 3) {
                val r = pr.getInt("formal", 0).toDouble() / sig
                if (r >= 0.65) return "formal"
                if (r <= 0.35) return "casual"
            }
            "neutral"
        } catch (_: Exception) {
            "neutral"
        }
    }

    fun userIsBrief(ctx: Context): Boolean {
        return try {
            val pr = p(ctx)
            val n = pr.getInt("lenN", 0)
            n >= 3 && pr.getInt("lenSum", 0).toDouble() / n < 12
        } catch (_: Exception) {
            false
        }
    }

    data class V(val t: String, val short: Boolean = false)

    /** mood'a göre havuz seçer (kısa yazana kısa cevap öncelikli). */
    fun pick(ctx: Context, casual: List<V>, neutral: List<V>, formal: List<V>): String {
        val pool = when (mood(ctx)) {
            "casual" -> casual
            "formal" -> formal
            else -> neutral
        }
        val short = pool.filter { it.short }
        if (userIsBrief(ctx) && short.isNotEmpty()) return short.random().t
        return pool.random().t
    }

    /** Yapay zekaya verilen persona + stil satırı. */
    fun prompt(ctx: Context): String {
        val stil = when (mood(ctx)) {
            "casual" -> "Kullanıcı samimi konuşuyor, sen de samimi ve rahat ol (argo yok)."
            "formal" -> "Kullanıcı resmi konuşuyor, sen de nazik ve düzgün ol."
            else -> "Sıcak ve doğal ol."
        }
        return "Sen Pollux adında bir asistansın. Karakterin: sıcak, esprili ama saygılı, " +
            "meraklı, bazen soru soran, robot gibi değil arkadaş gibi konuşan. $stil "
    }
}
