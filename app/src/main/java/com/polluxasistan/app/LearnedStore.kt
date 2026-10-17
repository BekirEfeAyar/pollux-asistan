package com.polluxasistan.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Öğrenen hafıza: yapay zeka / arama motorundan gelen iyi cevaplar
 * bu telefona kaydedilir. Aynı soru bir daha sorulursa internet
 * yokken bile anında cevaplanır. (En fazla 300 kayıt tutulur.)
 */
class LearnedStore(private val ctx: Context) {

    private val file: File get() = File(ctx.filesDir, "learned.json")

    fun all(): List<Knowledge.Entry> {
        return try {
            val f = file
            if (!f.exists()) return emptyList()
            val arr = JSONObject(f.readText()).optJSONArray("entries") ?: return emptyList()
            val tr = try { Researcher(ctx) } catch (_: Exception) { null }
            List(arr.length()) { i ->
                val o = arr.getJSONObject(i)
                Knowledge.Entry(listOf(o.getString("q")), o.getString("a"))
            }.filter { e ->
                // Çevrilmemiş İngilizce kayıtları ele (yeniden Türkçe öğrenilir)
                try {
                    tr == null || !tr.needsTR(e.answer)
                } catch (_: Exception) {
                    true
                }
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun add(question: String, answer: String) {
        try {
            val q = question.trim().take(120)
            // Kesik kayıt bırakma: araştırma cevapları uzun olabilir, tamamını sakla
            val a = answer.trim().take(6000)
            if (q.length < 3 || a.length < 10) return
            // Deterministik sorular öğrenilmez (hesap/birim/tarih her zaman taze çözülür)
            val qf = q.lowercaseTurkish()
            if (qf.any { it.isDigit() } && listOf(
                    "artı", "eksi", "çarpı", "çarp", "bölü", "bol", "üzeri",
                    "üslü", "yüzde", "mod", "kaç", "metre", "derece",
                    "saat", "tarih", "plaka"
                ).any { qf.contains(it) }
            ) return
            val cur = all().toMutableList()
            // Aynı soru varsa güncelle
            cur.removeAll { it.keys.firstOrNull() == q }
            cur.add(0, Knowledge.Entry(listOf(q), a))
            while (cur.size > 300) cur.removeAt(cur.size - 1)
            val arr = JSONArray()
            for (e in cur) {
                arr.put(JSONObject().put("q", e.keys.first()).put("a", e.answer))
            }
            file.writeText(JSONObject().put("entries", arr).toString())
        } catch (_: Exception) {}
    }

    fun count(): Int {
        return try { all().size } catch (_: Exception) { 0 }
    }
}
