package com.polluxasistan.app

import android.content.Context
import androidx.appcompat.app.AppCompatDelegate

/**
 * Tema sistem ayarini takip eder.
 */
object ThemeHelper {
    fun apply(ctx: Context) {
        try {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM)
        } catch (_: Exception) {}
    }
}
