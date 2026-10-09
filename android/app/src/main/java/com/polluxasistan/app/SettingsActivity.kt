package com.polluxasistan.app

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.RadioGroup
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.io.File

/** Ayarlar: tema (sistem), yazı boyutu, çevrimdışı veri, ses modeli, hakkında. */
class SettingsActivity : AppCompatActivity() {

    private lateinit var builtinCount: TextView
    private lateinit var fullStatus: TextView
    private lateinit var downloadBar: ProgressBar
    private lateinit var downloadBtn: Button
    private lateinit var modelStatus: TextView
    private lateinit var modelBtn: Button

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeHelper.apply(this)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_settings)

        val fontGroup = findViewById<RadioGroup>(R.id.fontGroup)
        builtinCount = findViewById(R.id.builtinCount)
        fullStatus = findViewById(R.id.fullStatus)
        downloadBar = findViewById(R.id.downloadBar)
        downloadBtn = findViewById(R.id.downloadBtn)
        modelStatus = findViewById(R.id.modelStatus)
        modelBtn = findViewById(R.id.modelBtn)
        findViewById<TextView>(R.id.aboutText).text =
            getString(R.string.settings_about_text) + "\ncom.polluxasistan.app"

        when (Prefs.fontScale(this)) {
            0 -> fontGroup.check(R.id.fontSmall)
            2 -> fontGroup.check(R.id.fontBig)
            else -> fontGroup.check(R.id.fontNormal)
        }
        fontGroup.setOnCheckedChangeListener { _, id ->
            Prefs.setFontScale(
                this,
                when (id) {
                    R.id.fontSmall -> 0
                    R.id.fontBig -> 2
                    else -> 1
                }
            )
        }

        refreshData()
        downloadBtn.setOnClickListener { startDownload() }
        refreshModel()
        modelBtn.setOnClickListener { startModelDownload() }
    }

    override fun onResume() {
        super.onResume()
        refreshData()
        refreshModel()
    }

    private fun refreshData() {
        builtinCount.text = "…"
        Thread {
            var n = -1
            try {
                assets.open("knowledge.json").bufferedReader().use { r ->
                    var c = 0
                    var idx = 0
                    val buf = CharArray(65536)
                    var prev = ""
                    while (true) {
                        val k = r.read(buf)
                        if (k <= 0) break
                        val s = prev + String(buf, 0, k)
                        var i = 0
                        while (true) {
                            val j = s.indexOf("{\"k\":", i)
                            if (j < 0) break
                            c++
                            i = j + 5
                        }
                        idx += k
                        prev = if (s.length > 8) s.takeLast(8) else s
                    }
                    n = c
                }
            } catch (_: Exception) {}
            val full = try {
                val f = File(filesDir, "knowledge.json")
                if (f.exists()) f.length() / 1024 / 1024 else -1
            } catch (_: Exception) {
                -1
            }
            runOnUiThread {
                try {
                    builtinCount.text =
                        if (n >= 0) "%,d".format(n).replace(',', '.') + " kayıt yüklü" else "—"
                    if (full >= 0) {
                        fullStatus.text = "İndirildi (%d MB)".format(full)
                        downloadBtn.visibility = View.GONE
                        downloadBar.visibility = View.GONE
                    } else {
                        fullStatus.text = "Yüklü değil"
                        downloadBtn.visibility = View.VISIBLE
                    }
                } catch (_: Exception) {}
            }
        }.start()
    }

    private fun startDownload() {
        downloadBtn.visibility = View.GONE
        downloadBar.visibility = View.VISIBLE
        downloadBar.progress = 0
        fullStatus.text = getString(R.string.settings_downloading)
        Thread {
            try {
                Knowledge(applicationContext).downloadFullDataset({ pct, msg ->
                    runOnUiThread {
                        try {
                            downloadBar.progress = pct.coerceIn(0, 100)
                            fullStatus.text = msg
                        } catch (_: Exception) {}
                    }
                }, { ok, err ->
                    runOnUiThread {
                        try {
                            downloadBar.visibility = View.GONE
                            if (ok) {
                                Toast.makeText(this, "Tam veri seti hazır", Toast.LENGTH_LONG).show()
                            } else {
                                Toast.makeText(this, "İndirilemedi: $err", Toast.LENGTH_LONG).show()
                                downloadBtn.visibility = View.VISIBLE
                            }
                            refreshData()
                        } catch (_: Exception) {}
                    }
                })
            } catch (_: Exception) {
                runOnUiThread {
                    try {
                        downloadBar.visibility = View.GONE
                        downloadBtn.visibility = View.VISIBLE
                    } catch (_: Exception) {}
                }
            }
        }.start()
    }

    private fun refreshModel() {
        try {
            val ready = ModelManager.isReady(this)
            modelStatus.text = if (ready) "Yüklü" else "Yüklü değil"
            modelBtn.visibility = if (ready) View.GONE else View.VISIBLE
        } catch (_: Exception) {}
    }

    private fun startModelDownload() {
        modelBtn.visibility = View.GONE
        modelStatus.text = getString(R.string.settings_downloading)
        Thread {
            try {
                ModelManager.downloadAndInstall(this) { pct, msg ->
                    runOnUiThread {
                        try {
                            modelStatus.text = "$msg (%$pct)"
                        } catch (_: Exception) {}
                    }
                }
                runOnUiThread { refreshModel() }
            } catch (e: Exception) {
                runOnUiThread {
                    try {
                        modelStatus.text = "Hata: ${e.message?.take(120)}"
                        modelBtn.visibility = View.VISIBLE
                    } catch (_: Exception) {}
                }
            }
        }.start()
    }
}
