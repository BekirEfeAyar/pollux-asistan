package com.polluxasistan.app

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.text.Spannable
import android.text.method.LinkMovementMethod
import android.text.style.ClickableSpan
import android.text.style.URLSpan
import android.text.util.Linkify
import android.view.LayoutInflater
import android.view.View
import android.widget.CheckBox
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog

/**
 * Sohbetteki bağlantılar: Discord'daki gibi önce uyarı gösterir.
 * "Siteye Git"e basınca tarayıcıda açar. Alan adına güvenilirse
 * bir daha sormaz.
 */
object LinkGuard {

    private const val PREFS = "link_guard"
    private const val KEY_TRUSTED = "trusted"

    private fun trusted(ctx: Context): MutableSet<String> {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getStringSet(KEY_TRUSTED, emptySet())
            ?.toMutableSet() ?: mutableSetOf()
    }

    private fun trust(ctx: Context, host: String) {
        val set = trusted(ctx)
        set.add(host.lowercase())
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putStringSet(KEY_TRUSTED, set).apply()
    }

    fun normalize(raw: String): String? {
        // Yapımcının link sayfası: uyarısız direkt açılan tek adres
        return normalizeDirect(raw) ?: normalizeGeneral(raw)
    }

    const val MY_LINKS = "https://bekirefeayar.github.io/kisisel-linklerim/"

    /** Uyarısız direkt açılan tek adres: yapımcının link sayfası. */
    fun isDirect(rawUrl: String): Boolean {
        return try {
            var a = rawUrl.trim().trimEnd('/').lowercase()
            var b = MY_LINKS.trimEnd('/')
            if (!a.contains("://")) a = "https://$a"
            a == b.lowercase()
        } catch (_: Exception) {
            false
        }
    }

    private fun normalizeDirect(raw: String): String? {
        return try {
            if (isDirect(raw)) MY_LINKS else null
        } catch (_: Exception) {
            null
        }
    }

    private fun normalizeGeneral(raw: String): String? {
        var u = raw.trim()
        if (u.isEmpty()) return null
        if (!u.contains("://")) u = "https://$u"
        return try {
            val uri = Uri.parse(u)
            val scheme = (uri.scheme ?: "").lowercase()
            if (scheme != "http" && scheme != "https") return null
            if (uri.host.isNullOrBlank()) return null
            u
        } catch (_: Exception) {
            null
        }
    }

    /** Bağlantıya basılınca çağrılır: güvendeyse direkt açar, yoksa uyarır. */
    fun onLink(activity: Activity, rawUrl: String) {
        if (isDirect(rawUrl)) {
            launchBrowser(activity, MY_LINKS)
            return
        }
        val url = normalize(rawUrl)
        if (url == null) {
            Toast.makeText(activity, "Geçersiz bağlantı.", Toast.LENGTH_SHORT).show()
            return
        }
        val host = (try { Uri.parse(url).host ?: "" } catch (_: Exception) { "" }).lowercase()
        if (host.isNotBlank() && trusted(activity).contains(host)) {
            launchBrowser(activity, url)
            return
        }
        val view = LayoutInflater.from(activity).inflate(R.layout.dialog_link, null)
        view.findViewById<TextView>(R.id.linkUrl).text = url
        val trustBox = view.findViewById<CheckBox>(R.id.linkTrust)
        trustBox.text = if (host.isNotBlank()) "$host adresine her zaman güven"
        else "Bu adrese her zaman güven"
        AlertDialog.Builder(activity)
            .setTitle("Uygulamadan Ayrılıyorsun")
            .setView(view)
            .setNegativeButton("Vazgeç", null)
            .setPositiveButton("Siteye Git") { _, _ ->
                if (trustBox.isChecked && host.isNotBlank()) trust(activity, host)
                launchBrowser(activity, url)
            }
            .show()
    }

    private fun launchBrowser(ctx: Context, url: String) {
        try {
            ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            })
        } catch (_: Exception) {
            Toast.makeText(ctx, "Tarayıcı açılamadı.", Toast.LENGTH_SHORT).show()
        }
    }

    /** Mesaj metnindeki bağlantıları uyarılı tıklamaya çevirir. */
    fun linkify(tv: TextView, onLink: (String) -> Unit) {
        Linkify.addLinks(tv, Linkify.WEB_URLS)
        val text = tv.text
        if (text is Spannable) {
            val spans = text.getSpans(0, text.length, URLSpan::class.java)
            for (span in spans) {
                val start = text.getSpanStart(span)
                val end = text.getSpanEnd(span)
                val url = span.url
                text.removeSpan(span)
                text.setSpan(object : ClickableSpan() {
                    override fun onClick(widget: View) {
                        onLink(url)
                    }
                }, start, end, Spannable.SPAN_EXCLUSIVE_EXCLUSIVE)
            }
        }
        tv.movementMethod = LinkMovementMethod.getInstance()
    }
}
