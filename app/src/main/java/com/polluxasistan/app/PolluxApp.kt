package com.polluxasistan.app

import android.app.Application
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Uygulama geneli açılış: beklenmedik her çökmede hata kaydını
 * dosyaya yazar. Sonraki açılışta MainActivity/LoginActivity bu kaydı
 * gösterip "Kopyala" imkânı verir; böylece hata görünmez kalmaz.
 */
class PolluxApp : Application() {

    override fun onCreate() {
        super.onCreate()
        try {
            CrashLog.appCtxRef = this
        } catch (_: Exception) {}
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, e ->
            try {
                val sw = StringWriter()
                e.printStackTrace(PrintWriter(sw))
                val stamp = try {
                    SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale("tr")).format(Date())
                } catch (_: Exception) {
                    ""
                }
                val text = "Pollux hata kaydi\n$stamp\nAndroid ${
                    try { Build.VERSION.SDK_INT } catch (_: Exception) { 0 }
                } · ${try { Build.MANUFACTURER } catch (_: Exception) { "" }} ${try { Build.MODEL } catch (_: Exception) { "" }}\n\n" + sw.toString()
                try {
                    File(filesDir, "crash_last.txt").writeText(text)
                } catch (_: Exception) {}
                try {
                    getExternalFilesDir(null)?.let { File(it, "crash_last.txt").writeText(text) }
                } catch (_: Exception) {}
            } catch (_: Exception) {}
            try {
                prev?.uncaughtException(thread, e)
            } catch (_: Exception) {}
        }
    }
}
