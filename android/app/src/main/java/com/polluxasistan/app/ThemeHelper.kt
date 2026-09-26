package com.polluxasistan.app

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

/**
 * Açık / koyu / sistem teması. Seçim Prefs'te tutulur, tüm
 * aktiviteler onCreate başında [apply] çağırır.
 */
object ThemeHelper {
    fun apply(ctx: Context) {
        try {
            AppCompatDelegate.setDefaultNightMode(
                when (Prefs.themeMode(ctx)) {
                    1 -> AppCompatDelegate.MODE_NIGHT_NO
                    2 -> AppCompatDelegate.MODE_NIGHT_YES
                    else -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM
                }
            )
        } catch (_: Exception) {}
    }
}
