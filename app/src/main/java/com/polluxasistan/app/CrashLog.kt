package com.polluxasistan.app

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter

/**
 * Çökme günlüğü:
 *  - yaz: yakalanan hataları dosyaya işler (çökme yerine),
 *  - göster: son çökme kaydını ekranda gösterir + kopyalanabilir yapar.
 */
object CrashLog {

    @Volatile
    var appCtxRef: Context? = null

    fun file(ctx: Context): File = File(ctx.filesDir, "crash_last.txt")

    /** Yakalanan hatayı dosyaya yazar; uygulama çalışmaya devam eder. */
    fun record(tag: String, e: Throwable) {
        try {
            val ctx = appCtxRef ?: return
            val sw = StringWriter()
            e.printStackTrace(PrintWriter(sw))
            val text = "Pollux hata kaydi (yakalandi: $tag)\n\n" + sw.toString()
            try {
                file(ctx).writeText(text)
            } catch (_: Exception) {}
            try {
                ctx.getExternalFilesDir(null)?.let { File(it, "crash_last.txt").writeText(text) }
            } catch (_: Exception) {}
        } catch (_: Exception) {}
    }

    /** Son çökme kaydı varsa ekranda gösterir; Kopyala / Sil butonları sunar. */
    fun maybeShow(activity: Activity) {
        try {
            val f = file(activity)
            if (!f.exists() || f.length() == 0L) return
            val full = try {
                f.readText()
            } catch (_: Exception) {
                return
            }
            if (full.isBlank()) return
            val shown = if (full.length > 12000) full.take(12000) + "\n..." else full
            AlertDialog.Builder(activity)
                .setTitle("Hata raporu")
                .setMessage(
                    "Pollux son seferde beklenmedik bir hata yaşadı. " +
                        "Aşağıdaki raporu KOPYALA'ya basıp sohbete yapıştırırsan hemen düzeltirim:\n\n" + shown
                )
                .setCancelable(false)
                .setPositiveButton("Kopyala") { _, _ ->
                    try {
                        val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        cm.setPrimaryClip(ClipData.newPlainText("Pollux hata raporu", full))
                        Toast.makeText(activity, "Kopyalandı — sohbete yapıştır", Toast.LENGTH_LONG).show()
                    } catch (_: Exception) {}
                    try {
                        f.delete()
                    } catch (_: Exception) {}
                }
                .setNegativeButton("Kapat") { _, _ ->
                    try {
                        f.delete()
                    } catch (_: Exception) {}
                }
                .show()
        } catch (_: Exception) {}
    }
}
