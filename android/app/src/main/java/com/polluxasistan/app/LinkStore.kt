package com.polluxasistan.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Kısayollarım: kullanıcının kendi bağlantı listesi.
 * SharedPreferences'ta JSON dizisi tutulur. "Linklerim" hazır gelir.
 */
object LinkStore {

    data class Link(val title: String, val url: String)

    private const val F = "kisayollar"
    private const val K = "links"

    fun all(ctx: Context): MutableList<Link> {
        return try {
            val raw = ctx.getSharedPreferences(F, Context.MODE_PRIVATE).getString(K, null)
            if (raw.isNullOrBlank()) {
                val seed = mutableListOf(Link("Linklerim", LinkGuard.MY_LINKS))
                save(ctx, seed)
                return seed
            }
            val arr = JSONArray(raw)
            val out = mutableListOf<Link>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val t = o.optString("t", "").trim()
                val u = o.optString("u", "").trim()
                if (t.isNotBlank() && u.isNotBlank()) out.add(Link(t, u))
            }
            if (out.isEmpty()) {
                out.add(Link("Linklerim", LinkGuard.MY_LINKS))
            }
            out
        } catch (_: Exception) {
            mutableListOf(Link("Linklerim", LinkGuard.MY_LINKS))
        }
    }

    fun save(ctx: Context, list: List<Link>) {
        try {
            val arr = JSONArray()
            for (l in list) {
                arr.put(JSONObject().put("t", l.title).put("u", l.url))
            }
            ctx.getSharedPreferences(F, Context.MODE_PRIVATE).edit().putString(K, arr.toString()).apply()
        } catch (_: Exception) {}
    }

    fun add(ctx: Context, title: String, url: String): Boolean {
        val clean = LinkGuard.normalize(url) ?: return false
        val list = all(ctx)
        list.add(0, Link(title.trim().take(40), clean))
        while (list.size > 50) list.removeAt(list.size - 1)
        save(ctx, list)
        return true
    }

    fun remove(ctx: Context, index: Int) {
        try {
            val list = all(ctx)
            if (index in list.indices) {
                list.removeAt(index)
                save(ctx, list)
            }
        } catch (_: Exception) {}
    }
}
