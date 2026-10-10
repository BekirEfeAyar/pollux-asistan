package com.polluxasistan.app

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate
import java.io.File

/**
 * Profil: ad, fotoğraf, tema. Telefonda saklanır (profil prefs + avatar.jpg).
 */
object ProfileStore {

    private const val F = "profil"

    fun name(ctx: Context): String =
        ctx.getSharedPreferences(F, Context.MODE_PRIVATE).getString("name", "") ?: ""

    fun setName(ctx: Context, v: String) {
        ctx.getSharedPreferences(F, Context.MODE_PRIVATE).edit()
            .putString("name", v.trim().take(28)).apply()
    }

    fun firstName(ctx: Context): String =
        name(ctx).trim().split("\\s+".toRegex()).firstOrNull() ?: ""

    fun avatarFile(ctx: Context): File = File(ctx.filesDir, "avatar.jpg")

    fun hasPhoto(ctx: Context): Boolean {
        return try {
            val f = avatarFile(ctx)
            f.exists() && f.length() > 0
        } catch (_: Exception) {
            false
        }
    }

    fun theme(ctx: Context): String =
        ctx.getSharedPreferences(F, Context.MODE_PRIVATE).getString("theme", "system") ?: "system"

    fun setTheme(ctx: Context, v: String) {
        ctx.getSharedPreferences(F, Context.MODE_PRIVATE).edit().putString("theme", v).apply()
        applyTheme(ctx)
    }

    fun applyTheme(ctx: Context) {
        try {
            val mode = when (theme(ctx)) {
                "light" -> AppCompatDelegate.MODE_NIGHT_NO
                "dark" -> AppCompatDelegate.MODE_NIGHT_YES
                else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
            }
            AppCompatDelegate.setDefaultNightMode(mode)
        } catch (_: Exception) {}
    }
}
