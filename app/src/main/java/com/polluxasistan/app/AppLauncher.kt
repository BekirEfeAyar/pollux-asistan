package com.polluxasistan.app

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build

/**
 * Telefonda yüklü TÜM uygulamaları bulur ve fuzzy eşleşmeyle açar.
 * "whatsapp aç", "youtube aç", "kamerayı aç" gibi.
 */
class AppLauncher(private val context: Context) {

    data class AppInfo(val label: String, val packageName: String)

    fun getAllApps(): List<AppInfo> {
        val pm = context.packageManager
        val intent = Intent(Intent.ACTION_MAIN, null).apply {
            addCategory(Intent.CATEGORY_LAUNCHER)
        }
        val list = if (Build.VERSION.SDK_INT >= 33) {
            pm.queryIntentActivities(intent, PackageManager.ResolveInfoFlags.of(0))
        } else {
            @Suppress("DEPRECATION")
            pm.queryIntentActivities(intent, 0)
        }
        return list.mapNotNull {
            val label = it.loadLabel(pm)?.toString() ?: return@mapNotNull null
            val pkg = it.activityInfo.packageName
            AppInfo(label, pkg)
        }.sortedBy { it.label.lowercaseTurkish() }
    }

    /**
     * @return açılan uygulamanın görünen adı, bulunamazsa null
     */
    fun openAppByVoice(spoken: String): String? {
        // Komut fiillerini KELİME bazında temizle (harf bazında silme "facebook"u bozuyordu)
        val stopWords = setOf(
            "ac", "acar", "misin", "calistir", "baslat",
            "uygulamasini", "uygulamayi", "uygulama", "lutfen", "programi", "program"
        )
        val clean = fold(spoken.lowercaseTurkish())
            .split(" ")
            .map { it.trim() }
            .filter { it.isNotBlank() && it !in stopWords }
            .joinToString(" ")
        if (clean.length < 2) return null

        val apps = getAllApps()
        fun flabel(a: AppInfo) = fold(a.label.lowercaseTurkish())

        // 1) Birebir / içerir eşleşme (aksan-sadeleştirilmiş)
        val direct = apps.firstOrNull {
            flabel(it) == clean || flabel(it).contains(clean) || clean.contains(flabel(it))
        }
        if (direct != null && launch(direct.packageName)) return direct.label

        // 2) Bilinen takma adlar: ÖNCE etikete bak (paket adı Threads'i yakalıyordu!)
        val aliases = mapOf(
            "kamera" to listOf("camera", "kamera"),
            "galeri" to listOf("gallery", "photos", "galeri"),
            "ayar" to listOf("settings"),
            "telefon" to listOf("dialer", "phone"),
            "mesaj" to listOf("messaging", "messages", "mesaj"),
            "saat" to listOf("clock", "deskclock"),
            "takvim" to listOf("calendar"),
            "harita" to listOf("maps"),
            "youtube" to listOf("youtube"),
            "whatsapp" to listOf("whatsapp"),
            "instagram" to listOf("instagram"),
            "threads" to listOf("threadsapp", "threads"),
            "spotify" to listOf("spotify"),
            "chrome" to listOf("chrome"),
            "gmail" to listOf("gmail"),
            "facebook" to listOf("facebook", "fbandroid", "katana"),
            "dosya" to listOf("files", "file manager")
        )
        for ((key, pkgs) in aliases) {
            if (clean.contains(key)) {
                val byLabel = apps.firstOrNull {
                    flabel(it) == key || flabel(it).contains(key)
                }
                if (byLabel != null && launch(byLabel.packageName)) return byLabel.label
                val byPkg = apps.firstOrNull { app ->
                    pkgs.any { p -> app.packageName.lowercase().contains(p) }
                }
                if (byPkg != null && launch(byPkg.packageName)) return byPkg.label
            }
        }

        // 3) Levenshtein ile en yakın (aksan-sadeleştirilmiş)
        val best = apps.minByOrNull { levenshtein(flabel(it), clean) }
        if (best != null && levenshtein(flabel(best), clean) <= 3) {
            if (launch(best.packageName)) return best.label
        }
        return null
    }

    /** ç→c, ğ→g, ı→i, ö→o, ş→s, ü→u: i/ı tuzağı biter. */
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

    private fun launch(packageName: String): Boolean {
        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(intent)
                true
            } else false
        } catch (_: Exception) { false }
    }

    private fun levenshtein(a: String, b: String): Int {
        val dp = Array(a.length + 1) { IntArray(b.length + 1) }
        for (i in 0..a.length) dp[i][0] = i
        for (j in 0..b.length) dp[0][j] = j
        for (i in 1..a.length) for (j in 1..b.length) {
            dp[i][j] = minOf(
                dp[i-1][j] + 1,
                dp[i][j-1] + 1,
                dp[i-1][j-1] + if (a[i-1] == b[j-1]) 0 else 1
            )
        }
        return dp[a.length][b.length]
    }
}
