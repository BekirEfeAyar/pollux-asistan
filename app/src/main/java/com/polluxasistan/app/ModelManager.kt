package com.polluxasistan.app

import android.content.Context
import android.net.Uri
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.util.zip.ZipFile

/**
 * Model kurulumu - v3.
 *
 * "am/final.mdl bulunamadı" hatasının kök sebepleri ve düzeltmeler:
 * 1) İnen dosya gerçekte ZIP olmayabiliyordu (hata sayfası / yarım indirme).
 *    -> Artık magic byte (PK) kontrolü var, ZIP değilse net hata veriyor.
 * 2) Entry adı karşılaştırması katıydı ("am/final.mdl").
 *    -> Artık normalize ediliyor (ters slash, ./ öneki, büyük/küçük harf),
 *    3 aşamalı arama + final.mdl fallback var.
 * 3) ZipInputStream çift geçişte sorun çıkarabiliyordu.
 *    -> Artık java.util.zip.ZipFile kullanılıyor (çok daha sağlam).
 * 4) Uygulama içi indirme her telefonda çalışmayabiliyordu.
 *    -> Manuel kurulum eklendi: kullanıcı zip'i tarayıcıyla indirip
 *    uygulamadan seçiyor (installFromLocalZip).
 */
object ModelManager {

    const val MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-tr-0.3.zip"

    fun modelDir(ctx: Context): File = File(ctx.filesDir, "model")

    fun isReady(ctx: Context): Boolean {
        val dir = modelDir(ctx)
        if (!isModelDir(dir)) return false
        val count = try { dir.walkTopDown().filter { it.isFile }.count() } catch (_: Exception) { 0 }
        return count >= 10
    }

    /** Vosk'un kabul ettiği düzen: flat (kökte final.mdl+mfcc.conf) VEYA canonical (am/+conf/). */
    fun isModelDir(d: File): Boolean {
        val flatFinal = File(d, "final.mdl").let { it.isFile && it.length() > 500_000 }
        val flat = flatFinal && File(d, "mfcc.conf").isFile
        val canonFinal = File(d, "am/final.mdl").let { it.isFile && it.length() > 500_000 }
        val canon = canonFinal && File(d, "conf/mfcc.conf").isFile
        return flat || canon
    }

    fun statusText(ctx: Context): String {
        val dir = modelDir(ctx)
        if (!dir.exists()) return "Model yok"
        val count = try { dir.walkTopDown().filter { it.isFile }.count() } catch (_: Exception) { 0 }
        val flat = File(dir, "final.mdl").let { if (it.isFile) it.length() / 1_048_576 else -1 }
        val canon = File(dir, "am/final.mdl").let { if (it.isFile) it.length() / 1_048_576 else -1 }
        val mb = if (flat >= 0) "${flat}MB(flat)" else if (canon >= 0) "${canon}MB" else "yok"
        return "Dosya: $count adet, final.mdl: $mb, hazır=${isReady(ctx)}"
    }

    fun deleteCorrupt(ctx: Context) {
        try { modelDir(ctx).deleteRecursively() } catch (_: Exception) {}
        try { File(ctx.filesDir, "model_tmp").deleteRecursively() } catch (_: Exception) {}
    }

    /** İndirilenler klasöründe zip'leri best-effort ara (Chrome ile indirilen bulunur). */
    fun findZipsInDownloads(): List<File> {
        val out = mutableListOf<File>()
        val seen = mutableSetOf<String>()
        val dirs = listOfNotNull(
            try { android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS) } catch (_: Exception) { null },
            File("/sdcard/Download"),
            File("/storage/emulated/0/Download")
        ).distinctBy { it.absolutePath }
        for (d in dirs) {
            try {
                d.listFiles { f -> f.isFile && f.name.lowercase().endsWith(".zip") }
                    ?.sortedByDescending { it.length() }
                    ?.forEach {
                        if (it.length() > 1_000_000 && seen.add(it.canonicalPath)) out.add(it)
                    }
            } catch (_: Exception) {}
        }
        return out.sortedByDescending { it.length() }
    }

    /** Hata zincirini tek satırda özetle (neden-sonuç belli olsun). */
    fun errSummary(e: Throwable): String {
        val parts = mutableListOf<String>()
        var cur: Throwable? = e
        var depth = 0
        while (cur != null && depth < 3) {
            val msg = cur.message?.take(200)
            parts.add("${cur.javaClass.simpleName}${if (msg.isNullOrBlank()) "" else ": $msg"}")
            cur = cur.cause
            depth++
        }
        return parts.joinToString(" < ")
    }

    /** "a/b\\c" -> "a/b/c", başındaki ./ ve / temizlenir */
    private fun normalize(name: String): String {
        var n = name.trim().replace('\\', '/')
        while (n.startsWith("./")) n = n.removePrefix("./")
        while (n.startsWith("/")) n = n.removePrefix("/")
        return n
    }

    /** ZIP mi? İlk 2 byte "PK" olmalı. */
    private fun assertIsZip(zip: File) {
        val header = ByteArray(4)
        zip.inputStream().use { it.read(header) }
        if (!(header[0] == 0x50.toByte() && header[1] == 0x4B.toByte())) {
            val head = header.joinToString(" ") { "%02X".format(it) }
            throw Exception(
                "İnen dosya ZIP değil (başlık: $head, boyut: ${zip.length() / 1024}KB). " +
                "Sunucu hata sayfası döndürmüş olabilir. Wifi'yi kontrol edip tekrar dene, " +
                "olmazsa zip'i tarayıcıyla indirip 'DOSYADAN KUR' ile seç."
            )
        }
    }

    @Throws(Exception::class)
    fun downloadAndInstall(ctx: Context, progress: (Int, String) -> Unit) {
        // DİKKAT: var olan sağlam modeli SİLME. Önce tmp'ye indir+çıkar+doğrula,
        // sadece en sonda atomik değiştir. Böylece başarısız deneme "model yok" bırakmaz.
        try { File(ctx.filesDir, "model_tmp").deleteRecursively() } catch (_: Exception) {}
        val tmpZip = File(ctx.cacheDir, "vosk_model.zip")
        if (tmpZip.exists()) tmpZip.delete()

        progress(2, "Bağlanıyor...")
        // Manuel redirect takibi (bazı cihazlarda otomatik çalışmıyor)
        var current = URL(MODEL_URL)
        var http: HttpURLConnection? = null
        var redirects = 0
        while (redirects < 5) {
            val c = (current.openConnection() as HttpURLConnection).apply {
                instanceFollowRedirects = false
                connectTimeout = 20_000
                readTimeout = 30_000
                setRequestProperty("User-Agent", "Mozilla/5.0 (Android) PolluxAsistan/1.0")
            }
            c.connect()
            val code = c.responseCode
            if (code in 300..399) {
                val loc = c.getHeaderField("Location")
                c.disconnect()
                if (loc.isNullOrBlank()) throw Exception("Sunucu yönlendirdi ama adres vermedi (HTTP $code).")
                current = URL(current, loc) // göreli Location desteği
                redirects++
            } else if (code !in 200..299) {
                c.disconnect()
                throw Exception("Sunucu hatası: HTTP $code. Sonra tekrar dene.")
            } else {
                http = c
                break
            }
        }
        val conn = http ?: throw Exception("Bağlantı kurulamadı (redirect döngüsü).")

        val total = conn.contentLengthLong
        BufferedInputStream(conn.inputStream).use { input ->
            FileOutputStream(tmpZip).use { output ->
                val buf = ByteArray(32 * 1024)
                var read: Int
                var done = 0L
                while (input.read(buf).also { read = it } != -1) {
                    output.write(buf, 0, read)
                    done += read
                    if (total > 0) {
                        val pct = ((done * 75) / total).toInt().coerceIn(0, 75)
                        progress(2 + pct, "İndiriliyor: ${done / 1_048_576}MB / ${total / 1_048_576}MB")
                    } else {
                        progress(10, "İndiriliyor: ${done / 1_048_576}MB...")
                    }
                }
            }
        }
        conn.disconnect()

        if (!tmpZip.exists() || tmpZip.length() < 5_000_000) {
            val kb = if (tmpZip.exists()) tmpZip.length() / 1024 else 0
            tmpZip.delete()
            throw Exception("İndirme yarım kaldı ($kb KB). Wifi'yi kontrol edip tekrar dene.")
        }
        installFromLocalZip(ctx, tmpZip, progress, deleteSource = true)
    }

    /**
     * Kullanıcının manuel indirdiği zip'ten kurulum.
     * MainActivity'deki dosya seçici burayı çağırır.
     */
    @Throws(Exception::class)
    fun installFromLocalZip(
        ctx: Context,
        zipFile: File,
        progress: (Int, String) -> Unit,
        deleteSource: Boolean = false
    ) {
        if (!zipFile.exists() || zipFile.length() < 1_000_000) {
            throw Exception("Seçilen dosya çok küçük (${zipFile.length() / 1024}KB). Doğru zip'i seçtiğinden emin ol.")
        }
        assertIsZip(zipFile)
        progress(80, "ZIP açılıyor...")

        val tmpDir = File(ctx.filesDir, "model_tmp")
        if (tmpDir.exists()) tmpDir.deleteRecursively()
        tmpDir.mkdirs()

        var zip: ZipFile? = null
        try {
            zip = ZipFile(zipFile)
            val entries = java.util.Collections.list(zip.entries())
            if (entries.isEmpty()) throw Exception("ZIP boş görünüyor.")

            val normNames = entries.map { normalize(it.name) }

            // Aşama 1: tam yol eşleşmesi
            var marker = normNames.firstOrNull { it.endsWith("am/final.mdl") }
            // Aşama 2: büyük/küçük harf duyarsız
            if (marker == null) {
                marker = normNames.firstOrNull { it.lowercase().endsWith("am/final.mdl") }
            }
            // Aşama 3: herhangi bir final.mdl (klasör adı farklıysa)
            if (marker == null) {
                marker = normNames.firstOrNull { it.endsWith("final.mdl") }
            }
            if (marker == null) {
                val preview = normNames.take(15).joinToString("\n")
                throw Exception(
                    "Bu ZIP ses modeli değil. İlk entries:\n$preview\n\n" +
                    "Doğru dosya: vosk-model-small-tr-0.3.zip (~40MB). " +
                    "Tarayıcıyla indirip tekrar seç."
                )
            }
            val prefix = marker.removeSuffix("am/final.mdl")
                .let { if (marker.endsWith("am/final.mdl")) it else marker.removeSuffix("final.mdl").removeSuffix("am/").removeSuffix("am") }

            var extracted = 0
            for (e in entries) {
                val norm = normalize(e.name)
                if (norm.isBlank() || norm.endsWith("/")) continue
                val rel = if (prefix.isNotEmpty() && norm.startsWith(prefix)) {
                    norm.removePrefix(prefix)
                } else {
                    // prefix tutmadıysa ama dosya am/conf/graph altındaysa kökten al
                    rootFallback(norm)
                }
                if (rel.isBlank()) continue
                // Güvenlik: zip-slip koruması
                val out = File(tmpDir, rel)
                if (!out.canonicalPath.startsWith(tmpDir.canonicalPath)) continue
                if (e.isDirectory) {
                    out.mkdirs()
                } else {
                    out.parentFile?.mkdirs()
                    zip.getInputStream(e).use { input ->
                        FileOutputStream(out).use { output -> input.copyTo(output) }
                    }
                    extracted++
                    if (extracted % 25 == 0) progress(85, "Çıkarılıyor: $extracted dosya...")
                }
            }

            progress(95, "Kontrol ediliyor...")
            // ZIP olduğu gibi kullanılır (Vosk flat düzeni native okuyor).
            // Model kökünü HER derinlikte ara (çift sarmal klasör vb. sorun olmaz).
            val stats = "entries=${entries.size}, marker=$marker, çıkarılan=$extracted"
            val modelRoot = locateModelRoot(tmpDir)
            if (modelRoot == null) {
                val got = try {
                    tmpDir.walkTopDown().filter { it.isFile }.take(20)
                        .joinToString("\n") { it.relativeTo(tmpDir).path }
                } catch (_: Exception) { "listelenemedi" }
                val zipAm = normNames.count { it.contains("am/") }
                val zipConf = normNames.count { it.contains("conf/") }
                tmpDir.deleteRecursively()
                throw Exception(
                    "Model kökü bulunamadı. [$stats, zipte am/=$zipAm conf/=$zipConf]\n" +
                    (if (zipAm == 0) "Bu ZIP ses modeli değil (yanlış dosya seçilmiş olabilir). Doğru dosya: vosk-model-small-tr-0.3.zip (~40MB).\n"
                     else "ZIP yapısı beklenenden farklı.\n") +
                    "Çıkanlar:\n$got"
                )
            }

            // 5) Atomik taşı: bulunan kök -> model
            val finalDir = modelDir(ctx)
            if (finalDir.exists()) finalDir.deleteRecursively()
            if (modelRoot == tmpDir) {
                if (!tmpDir.renameTo(finalDir)) {
                    finalDir.mkdirs()
                    tmpDir.copyRecursively(finalDir, overwrite = true)
                    tmpDir.deleteRecursively()
                }
            } else {
                // Alt klasörde bulundu: direkt onu model yap, tmp'yi temizle
                if (!modelRoot.renameTo(finalDir)) {
                    finalDir.mkdirs()
                    modelRoot.copyRecursively(finalDir, overwrite = true)
                }
                try { tmpDir.deleteRecursively() } catch (_: Exception) {}
            }
            if (!isReady(ctx)) throw Exception("Kurulum bitti ama doğrulama geçmedi: ${statusText(ctx)}")
            progress(100, "Hazır 🎉")
        } finally {
            try { zip?.close() } catch (_: Exception) {}
            if (deleteSource) try { zipFile.delete() } catch (_: Exception) {}
        }
    }

    /** Model kökünü HER derinlikte bul (BFS): flat veya canonical düzeni kabul eder. */
    fun locateModelRoot(base: File): File? {
        val queue = ArrayDeque<File>()
        val seen = mutableSetOf<String>()
        queue.add(base)
        while (queue.isNotEmpty()) {
            val d = queue.removeFirst()
            if (!d.isDirectory) continue
            try {
                if (isModelDir(d)) return d
            } catch (_: Exception) {}
            try {
                d.listFiles()?.filter { it.isDirectory }?.forEach {
                    val c = try { it.canonicalPath } catch (_: Exception) { it.absolutePath }
                    if (seen.add(c)) queue.add(it)
                }
            } catch (_: Exception) {}
        }
        return null
    }

    /** prefix tutmazsa am/, conf/, graph/, ivector/, test/ köklerini yakala */
    private fun rootFallback(norm: String): String {
        val roots = listOf("am/", "conf/", "graph/", "ivector/", "test/", "extra/")
        for (r in roots) {
            val i = norm.indexOf(r)
            if (i >= 0) return norm.substring(i)
        }
        // Tek dosyalık kök (örn README) -> olduğu gibi al
        return if ('/' !in norm) norm else ""
    }

    /** content:// URI'den cache'e kopyala (dosya seçici için) */
    @Throws(Exception::class)
    fun copyUriToCache(ctx: Context, uri: Uri, progress: (Int, String) -> Unit): File {
        progress(5, "Dosya okunuyor...")
        val out = File(ctx.cacheDir, "manuel_model.zip")
        if (out.exists()) out.delete()
        ctx.contentResolver.openInputStream(uri)?.use { input ->
            FileOutputStream(out).use { output ->
                val buf = ByteArray(32 * 1024)
                var r: Int
                var done = 0L
                while (input.read(buf).also { r = it } != -1) {
                    output.write(buf, 0, r)
                    done += r
                    progress(5, "Okunuyor: ${done / 1_048_576}MB...")
                }
            }
        } ?: throw Exception("Dosya açılamadı.")
        return out
    }
}
