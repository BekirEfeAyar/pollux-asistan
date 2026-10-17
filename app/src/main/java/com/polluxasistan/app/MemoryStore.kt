package com.polluxasistan.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Kalıcı hafıza: kullanıcının adını, sevdiklerini ve anlattıklarını
 * bu telefonda saklar. Oturumlar ve sohbetler arası hatırlanır.
 * (memory.json, filesDir altında.)
 */
class MemoryStore(private val ctx: Context) {

    private val file: File get() = File(ctx.filesDir, "memory.json")

    data class Memory(
        var name: String = "",
        val likes: MutableList<String> = mutableListOf(),
        val dislikes: MutableList<String> = mutableListOf(),
        val facts: MutableList<String> = mutableListOf(),
        var mood: String = ""
    )

    fun load(): Memory {
        return try {
            val f = file
            if (!f.exists()) return Memory()
            val o = JSONObject(f.readText())
            val m = Memory()
            m.name = o.optString("name", "")
            m.mood = o.optString("mood", "")
            fun arr(key: String): MutableList<String> {
                val out = mutableListOf<String>()
                val a = o.optJSONArray(key) ?: return out
                for (i in 0 until a.length()) {
                    val s = a.optString(i, "").trim()
                    if (s.length >= 2) out.add(s)
                }
                return out
            }
            m.likes.addAll(arr("likes"))
            m.dislikes.addAll(arr("dislikes"))
            m.facts.addAll(arr("facts"))
            m
        } catch (_: Exception) {
            Memory()
        }
    }

    fun save(m: Memory) {
        try {
            val o = JSONObject()
                .put("name", m.name)
                .put("mood", m.mood)
                .put("likes", JSONArray(m.likes))
                .put("dislikes", JSONArray(m.dislikes))
                .put("facts", JSONArray(m.facts))
            file.writeText(o.toString())
        } catch (_: Exception) {}
    }

    private fun pushUnique(list: MutableList<String>, v: String, cap: Int): Boolean {
        val s = v.trim().trimEnd('.', '!', '?')
        if (s.length < 2 || s.length > 80) return false
        if (list.any { it.lowercaseTurkish() == s.lowercaseTurkish() }) return false
        list.add(0, s)
        while (list.size > cap) list.removeAt(list.size - 1)
        return true
    }

    /** Her mesajdan ipuçları yakalar, değiştiyse true döner. */
    fun remember(raw: String, folded: String): Boolean {
        return try {
            val m = load()
            var changed = false
            // Ad: "adım Efe", "benim adım Efe"
            var nm = Regex("(?:benim ad[ıi]m|ad[ıi]m)\\s+([A-Za-zÇçĞğİıÖöŞşÜü]{2,20})")
                .find(raw)?.groupValues?.getOrNull(1) ?: ""
            if (nm.isBlank()) {
                val one = Regex("^ben\\s+([A-ZÇĞİÖŞÜ][a-zçğıöşü]{1,19})[.!.]*$")
                    .find(raw.trim())?.groupValues?.getOrNull(1) ?: ""
                if (one.isNotBlank() && one.lowercaseTurkish() !in
                    setOf("çok", "bir", "ben", "sen", "o", "bu", "şu", "de", "da", "mi", "ne")
                ) nm = one
            }
            if (nm.isNotBlank()) {
                val fixed = nm[0].uppercaseChar() + nm.substring(1)
                if (m.name != fixed) { m.name = fixed; changed = true }
            }
            // Sevilenler / sevilmeyenler
            if (!folded.contains("seni")) {
                val like = Regex("(.+?)\\s+(?:çok )?seviyorum").find(folded)?.groupValues?.getOrNull(1) ?: ""
                if (like.isNotBlank() && pushUnique(m.likes, like, 20)) changed = true
                val dl = Regex("(.+?)\\s+(?:hiç\\s+)?sevmiyorum").find(folded)?.groupValues?.getOrNull(1) ?: ""
                if (dl.isNotBlank() && pushUnique(m.dislikes, dl, 20)) changed = true
            }
            // Önemli olaylar: "yarın sınavım var"
            val ev = Regex("(yar[ıi]n|bug[üu]n|haftaya|pazartesi|sal[ıi]|çarşamba|carsamba|perşembe|persembe|cuma|cumartesi|pazar)\\s+(.{2,60}?)\\s*(var|olacak|girecegim|gireceğim)")
                .find(folded)
            if (ev != null) {
                if (pushUnique(m.facts, (ev.groupValues[1] + " " + ev.groupValues[2] + " " + ev.groupValues[3]).trim(), 30)) changed = true
            }
            // Yakınlar: "kedim hasta"
            val kin = Regex("(kedim|kopegim|oglum|oğlum|k[ıi]z[ıi]m|kardeşim|kardesim|annem|babam|eşim|esim|arkadaşım|arkadasim)\\s+(.{2,60})")
                .find(folded)
            if (kin != null) {
                if (pushUnique(m.facts, (kin.groupValues[1] + " " + kin.groupValues[2]).trim(), 30)) changed = true
            }
            // Ruh hali
            if (listOf("cok mutluyum", "harikayim", "keyfim yerinde").any { folded.contains(it) }) {
                if (m.mood != "mutlu") { m.mood = "mutlu"; changed = true }
            } else if (listOf("uzgunum", "moralim bozuk", "agliyorum", "stresliyim", "yalnizim", "depresyondayim", "canim sikiliyor").any { folded.contains(it) }) {
                if (m.mood != "uzgun") { m.mood = "uzgun"; changed = true }
            }
            if (changed) save(m)
            changed
        } catch (_: Exception) {
            false
        }
    }

    fun summary(): String {
        return try {
            val m = load()
            val parts = mutableListOf<String>()
            if (m.name.isNotBlank()) parts.add("adın " + m.name)
            if (m.likes.isNotEmpty()) parts.add("sevdiklerin: " + m.likes.take(3).joinToString(", "))
            if (m.dislikes.isNotEmpty()) parts.add("sevmediklerin: " + m.dislikes.take(3).joinToString(", "))
            if (m.facts.isNotEmpty()) parts.add("notlarım: " + m.facts.take(3).joinToString("; "))
            if (parts.isEmpty()) "" else "Senin hakkında bildiklerim — " + parts.joinToString(" • ") + "."
        } catch (_: Exception) {
            ""
        }
    }

    fun clear() {
        try {
            save(Memory())
        } catch (_: Exception) {}
    }
}
