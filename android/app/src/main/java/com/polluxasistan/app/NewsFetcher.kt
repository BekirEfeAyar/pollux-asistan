package com.polluxasistan.app

import android.content.Context
import android.util.Xml
import java.net.HttpURLConnection
import java.net.URL

/**
 * Google Haberler TR RSS: ücretsiz, anahtarsız güncel gündem.
 * https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr
 */
class NewsFetcher(private val context: Context) {

    data class Headline(val title: String, val source: String, val time: String)

    fun top(n: Int = 5): List<Headline>? {
        return fetch("https://news.google.com/rss?hl=tr&gl=TR&ceid=TR:tr", n)
    }

    /** Konulu haber araması: "galatasaray" -> ilgili son haberler. */
    fun search(topic: String, n: Int = 5): List<Headline>? {
        if (topic.isBlank()) return null
        return try {
            val enc = java.net.URLEncoder.encode(topic, "UTF-8")
            fetch("https://news.google.com/rss/search?q=$enc&hl=tr&gl=TR&ceid=TR:tr", n)
        } catch (_: Exception) {
            null
        }
    }

    private fun fetch(feedUrl: String, n: Int): List<Headline>? {
        return try {
            val url = URL(feedUrl)
            val conn = (url.openConnection() as HttpURLConnection).apply {
                connectTimeout = 10_000
                readTimeout = 10_000
                setRequestProperty("User-Agent", "PolluxAsistan/1.0")
            }
            conn.connect()
            if (conn.responseCode !in 200..299) return null
            val out = mutableListOf<Headline>()
            conn.inputStream.buffered().use { input ->
                val parser = Xml.newPullParser()
                parser.setInput(input, "UTF-8")
                var event = parser.eventType
                var title = ""
                var source = ""
                var pub = ""
                var inItem = false
                while (event != org.xmlpull.v1.XmlPullParser.END_DOCUMENT && out.size < n) {
                    when (event) {
                        org.xmlpull.v1.XmlPullParser.START_TAG -> when (parser.name) {
                            "item" -> {
                                inItem = true; title = ""; source = ""; pub = ""
                            }
                            "title" -> if (inItem) title = parser.nextText()?.trim() ?: ""
                            "source" -> if (inItem) source = parser.nextText()?.trim() ?: ""
                            "pubDate" -> if (inItem) pub = parser.nextText()?.trim() ?: ""
                        }
                        org.xmlpull.v1.XmlPullParser.END_TAG -> if (parser.name == "item" && inItem) {
                            inItem = false
                            if (title.isNotBlank()) {
                                // "Başlık - Kaynak" formatını ayır
                                val cleanTitle = title.substringBeforeLast(" - ").trim()
                                val src = if (source.isNotBlank()) source
                                else title.substringAfterLast(" - ", "").trim()
                                out.add(Headline(cleanTitle.ifBlank { title }, src, pub))
                            }
                        }
                    }
                    event = parser.next()
                }
            }
            out.ifEmpty { null }
        } catch (_: Exception) {
            null
        }
    }
}
