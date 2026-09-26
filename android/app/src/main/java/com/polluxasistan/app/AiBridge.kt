package com.polluxasistan.app

import android.content.Context
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Ücretsiz, anahtarsız yapay zeka köprüsü (Pollinations).
 * Veritabanında yoksa buraya sorulur, cevap sohbette gösterilir.
 */
class AiBridge(private val ctx: Context) {

    fun ask(query: String): String? {
        return try {
            val q = query.trim()
            if (q.length < 2) return null
            val prompt = URLEncoder.encode(
                Persona.prompt(ctx) +
                    "Soruyu ayrıntılı, düzenli ve akıcı Türkçe ile " +
                    "cevapla (gerekirse maddeler kullan, giriş cümlesi kurma): $q",
                "UTF-8"
            ).replace("+", "%20")
            val url = URL("https://text.pollinations.ai/$prompt")
            val conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 45_000
                setRequestProperty("User-Agent", "PolluxAsistan/1.0")
                setRequestProperty("Accept", "text/plain")
            }
            conn.connect()
            if (conn.responseCode !in 200..299) return null
            val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }.trim()
            if (text.length < 30) return null
            // İngilizce geldiyse Türkçeye çevir
            return try {
                Researcher(ctx).translateTR(text.take(2000))
            } catch (_: Exception) {
                text.take(2000)
            }
        } catch (_: Exception) {
            null
        }
    }
}
