package com.polluxasistan.app

import android.content.Context

/** Uygulama ayarları: uyandırma kelimesi, hassasiyet, ortam. Tek elden. */
object Prefs {
    private const val F = "asistan_prefs"
    const val DEF_WAKE = "eşek"
    const val DEF_SENS = 72

    /** Moderatör e-postası: paneli SADECE bu adres görür. Kendi mailini yaz. */
    const val MODERATOR_EMAIL = "bekirefeayar101@gmail.com"

    fun isModerator(ctx: Context): Boolean =
        sessionEmail(ctx)?.lowercase()?.trim() == MODERATOR_EMAIL.lowercase().trim()

    fun sessionEmail(ctx: Context): String? =
        p(ctx).getString("session_email", null)?.takeIf { it.isNotBlank() }

    fun sessionName(ctx: Context): String =
        p(ctx).getString("session_name", "") ?: ""

    fun login(ctx: Context, email: String, name: String) {
        p(ctx).edit()
            .putString("session_email", email.trim().lowercase())
            .putString("session_name", name.trim())
            .apply()
    }

    fun logout(ctx: Context) {
        p(ctx).edit().remove("session_email").remove("session_name").apply()
    }

    fun sha256(s: String): String {
        val d = java.security.MessageDigest.getInstance("SHA-256").digest(s.toByteArray(Charsets.UTF_8))
        return d.joinToString("") { "%02x".format(it) }
    }

    /**
     * Moderatör hesabını garantiye al: yoksa aç, şifresi yoksa tanımla.
     * Temiz kurulumda silinen hesap böylece kendiliğinden geri gelir.
     */
    fun ensureSeedAccount(ctx: Context) {
        try {
            val db = DbHelper(ctx)
            val hash = sha256("bekirefe5760")
            if (!db.userExists(MODERATOR_EMAIL)) {
                db.createUserWithPass(MODERATOR_EMAIL, "Bekir Efe", hash)
            } else if (db.getPassHash(MODERATOR_EMAIL) == null) {
                db.setPassHash(MODERATOR_EMAIL, hash)
            }
        } catch (_: Exception) {}
    }

    private fun p(ctx: Context) =
        ctx.getSharedPreferences(F, Context.MODE_PRIVATE)

    fun wake(ctx: Context): String {
        val w = p(ctx).getString("wake", DEF_WAKE)!!.trim()
        return if (w.length >= 2) w else DEF_WAKE
    }

    fun sens(ctx: Context): Int = p(ctx).getInt("sens", DEF_SENS).coerceIn(0, 100)

    /** 0 sessiz, 1 normal, 2 kalabalık */
    fun env(ctx: Context): Int = p(ctx).getInt("env", 1).coerceIn(0, 2)

    fun save(ctx: Context, wake: String, sens: Int, env: Int) {
        p(ctx).edit()
            .putString("wake", wake.trim().ifBlank { DEF_WAKE })
            .putInt("sens", sens.coerceIn(0, 100))
            .putInt("env", env.coerceIn(0, 2))
            .apply()
    }

    fun sensLabel(sens: Int): String = when {
        sens < 25 -> "Dikkatli"
        sens < 70 -> "Dengeli"
        else -> "Hassas"
    }

    fun avatarFile(ctx: Context): java.io.File = java.io.File(ctx.filesDir, "avatar.jpg")

    /** Tema: 0 sistem, 1 açık, 2 koyu */
    fun themeMode(ctx: Context): Int = p(ctx).getInt("theme_mode", 0)

    fun cycleTheme(ctx: Context): Int {
        val next = (themeMode(ctx) + 1) % 3
        p(ctx).edit().putInt("theme_mode", next).apply()
        return next
    }

    fun themeLabel(mode: Int): String = when (mode) {
        1 -> "Tema: Açık"
        2 -> "Tema: Koyu"
        else -> "Tema: Sistem"
    }
}

fun String.lowercaseTurkish(): String = this.lowercase(java.util.Locale("tr", "TR"))
