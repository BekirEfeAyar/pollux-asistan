package com.polluxasistan.app

import android.Manifest
import android.animation.Animator
import android.animation.AnimatorInflater
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.LayoutInflater
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.PopupMenu
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Pollux ana ekran: karşılama + çipler + kısayollar + sohbet + giriş çubuğu. */
class MainActivity : AppCompatActivity() {

    private lateinit var scroll: ScrollView
    private lateinit var content: LinearLayout
    private lateinit var introBox: LinearLayout
    private lateinit var greeting: TextView
    private lateinit var chipsRow1: LinearLayout
    private lateinit var chipsRow2: LinearLayout
    private lateinit var linksBox: LinearLayout
    private lateinit var input: EditText
    private lateinit var send: ImageButton
    private lateinit var micBtn: ImageButton
    private lateinit var db: DbHelper
    private lateinit var brain: ChatBrain
    private var email: String = ""
    private var chatId: Long? = null
    private var thinking = false
    private var breathAnim: Animator? = null
    private var micTest: MicTest? = null
    private var dictating = false
    private var pendingAction: ChatBrain.Action? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeHelper.apply(this)
        super.onCreate(savedInstanceState)
        Thread { Prefs.ensureSeedAccount(this) }.start()
        Thread {
            try {
                Knowledge(applicationContext).warmup()
            } catch (_: Exception) {}
        }.start()
        // Tam veri seti yoksa indir (sessizce, durum Ayarlar'da görünür)
        Thread {
            try {
                val k = Knowledge(applicationContext)
                if (!k.hasFullDataset()) {
                    k.downloadFullDataset({ _, _ -> }, { _, _ -> })
                }
            } catch (_: Exception) {}
        }.start()
        if (Prefs.sessionEmail(this) == null) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_main)

        email = Prefs.sessionEmail(this) ?: ""
        db = DbHelper(this)
        brain = ChatBrain(
            applicationContext,
            AppLauncher(applicationContext),
            Researcher(applicationContext)
        )

        scroll = findViewById(R.id.scroll)
        content = findViewById(R.id.content)
        introBox = findViewById(R.id.introBox)
        greeting = findViewById(R.id.greeting)
        chipsRow1 = findViewById(R.id.chipsRow1)
        chipsRow2 = findViewById(R.id.chipsRow2)
        linksBox = findViewById(R.id.linksBox)
        input = findViewById(R.id.input)
        send = findViewById(R.id.send)
        micBtn = findViewById(R.id.micBtn)
        val menuBtn: ImageButton = findViewById(R.id.menuBtn)

        greeting.text = greetingFor()
        buildChips()
        buildLinksPreview()

        input.doAfterTextChanged { text ->
            val ready = !text.isNullOrBlank()
            send.setBackgroundResource(if (ready) R.drawable.bg_send_active else R.drawable.bg_send_idle)
            send.setColorFilter(
                ContextCompat.getColor(
                    this,
                    if (ready) R.color.kiremit_uzeri else R.color.soluk
                )
            )
        }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) {
                send()
                true
            } else false
        }
        send.setOnClickListener { send() }
        micBtn.setOnClickListener { dictate() }
        menuBtn.setOnClickListener { v -> showMenu(v) }

        loadLastChat()
    }

    override fun onResume() {
        super.onResume()
        if (Prefs.sessionEmail(this) == null) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        try {
            greeting.text = greetingFor()
        } catch (_: Exception) {}
        try {
            buildLinksPreview()
        } catch (_: Exception) {}
    }

    override fun onDestroy() {
        try { breathAnim?.cancel() } catch (_: Exception) {}
        try { micTest?.cancel() } catch (_: Exception) {}
        super.onDestroy()
    }

    // ---------- Karşılama + çipler + kısayollar ----------

    private fun greetingFor(): String {
        val hour = try {
            SimpleDateFormat("H", Locale("tr")).format(Date()).toInt()
        } catch (_: Exception) {
            12
        }
        val base = when (hour) {
            in 6..10 -> "Günaydın"
            in 11..17 -> "İyi günler"
            in 18..22 -> "İyi akşamlar"
            else -> "İyi geceler"
        }
        val name = try {
            MemoryStore(this).load().name.ifBlank { Prefs.sessionName(this) }
        } catch (_: Exception) {
            ""
        }
        return if (name.isNotBlank()) "$base, $name." else "$base."
    }

    private fun buildChips() {
        // (etiket, doldurulacak metin; "!send" ile biterse direkt gönderilir)
        val chips = listOf(
            "Hesapla" to "12*8+5 kaç",
            "Döviz" to "1 dolar kaç tl",
            "Hava" to "İstanbul hava durumu",
            "Sözlük" to "kelebek ne demek",
            "Gündem" to "gündem!send",
            "Uygulama aç" to "kamera aç ",
            "Araştır" to ""
        )
        chipsRow1.removeAllViews()
        chipsRow2.removeAllViews()
        chips.forEachIndexed { i, (label, fill) ->
            val tv = LayoutInflater.from(this)
                .inflate(android.R.layout.simple_list_item_1, chipsRow1, false) as TextView
            tv.text = label
            tv.setTextColor(ContextCompat.getColor(this, R.color.murekkep))
            tv.textSize = 14f
            tv.background = ContextCompat.getDrawable(this, R.drawable.bg_chip)
            val pad = (12 * resources.displayMetrics.density).toInt()
            tv.setPadding(pad, (8 * resources.displayMetrics.density).toInt(), pad, (8 * resources.displayMetrics.density).toInt())
            tv.minHeight = (36 * resources.displayMetrics.density).toInt()
            tv.gravity = android.view.Gravity.CENTER_VERTICAL
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                (36 * resources.displayMetrics.density).toInt()
            )
            if (i > 0) lp.marginStart = (8 * resources.displayMetrics.density).toInt()
            tv.layoutParams = lp
            tv.isClickable = true
            tv.isFocusable = true
            tv.setOnTouchListener { v, e ->
                try {
                    if (e.action == android.view.MotionEvent.ACTION_DOWN) {
                        v.animate().cancel()
                        v.animate().scaleX(0.97f).scaleY(0.97f).setDuration(90).start()
                    } else if (e.action == android.view.MotionEvent.ACTION_UP ||
                        e.action == android.view.MotionEvent.ACTION_CANCEL
                    ) {
                        v.animate().cancel()
                        v.animate().scaleX(1f).scaleY(1f).setDuration(90).start()
                    }
                } catch (_: Exception) {}
                false
            }
            tv.setOnClickListener {
                if (fill.endsWith("!send")) {
                    input.setText("")
                    sendText(fill.removeSuffix("!send"))
                } else if (fill.isNotBlank()) {
                    input.setText(fill)
                    input.setSelection(input.text.length)
                    input.requestFocus()
                } else {
                    input.setText("")
                    input.requestFocus()
                    try {
                        val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
                        imm.showSoftInput(input, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT)
                    } catch (_: Exception) {}
                }
            }
            if (i % 2 == 0) chipsRow1.addView(tv) else chipsRow2.addView(tv)
        }
    }

    private fun buildLinksPreview() {
        linksBox.removeAllViews()
        val links = try { LinkStore.all(this).take(4) } catch (_: Exception) { emptyList() }
        if (links.isEmpty()) {
            val t = TextView(this)
            t.text = getString(R.string.empty_chat)
            t.setTextColor(ContextCompat.getColor(this, R.color.soluk))
            t.textSize = 13f
            linksBox.addView(t)
            return
        }
        for (l in links) {
            val row = LinearLayout(this)
            row.orientation = LinearLayout.VERTICAL
            row.setPadding(0, (10 * resources.displayMetrics.density).toInt(), 0, (10 * resources.displayMetrics.density).toInt())
            row.isClickable = true
            row.isFocusable = true
            val title = TextView(this)
            title.text = l.title
            title.setTextColor(ContextCompat.getColor(this, R.color.murekkep))
            title.textSize = 15f
            val url = TextView(this)
            url.text = l.url
            url.setTextColor(ContextCompat.getColor(this, R.color.soluk))
            url.textSize = 13f
            url.maxLines = 1
            url.ellipsize = android.text.TextUtils.TruncateAt.END
            row.addView(title)
            row.addView(url)
            val div = View(this)
            div.setBackgroundColor(ContextCompat.getColor(this, R.color.cizgi))
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (1 * resources.displayMetrics.density).toInt())
            linksBox.addView(row)
            linksBox.addView(div, lp)
            row.setOnClickListener {
                try {
                    LinkGuard.onLink(this, l.url)
                } catch (_: Exception) {}
            }
        }
    }

    // ---------- Menü ----------

    private fun showMenu(anchor: View) {
        val popup = PopupMenu(this, anchor)
        popup.menu.add(0, 1, 0, getString(R.string.menu_new_chat))
        popup.menu.add(0, 2, 0, getString(R.string.menu_links))
        popup.menu.add(0, 3, 0, getString(R.string.menu_settings))
        if (Prefs.isModerator(this)) {
            popup.menu.add(0, 4, 0, getString(R.string.menu_panel))
        }
        popup.menu.add(0, 5, 0, getString(R.string.menu_logout))
        popup.setOnMenuItemClickListener { item ->
            when (item.itemId) {
                1 -> { newChat(); true }
                2 -> { startActivity(Intent(this, LinksActivity::class.java)); true }
                3 -> { startActivity(Intent(this, SettingsActivity::class.java)); true }
                4 -> { startActivity(Intent(this, DashboardActivity::class.java)); true }
                5 -> {
                    Prefs.logout(this)
                    startActivity(Intent(this, LoginActivity::class.java))
                    finish()
                    true
                }
                else -> false
            }
        }
        popup.show()
    }

    // ---------- Sohbet ----------

    private fun fontUser(): Float = 16f * Prefs.fontFactor(this)
    private fun fontAi(): Float = 17f * Prefs.fontFactor(this)

    private fun reducedMotion(): Boolean {
        return try {
            Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        } catch (_: Exception) {
            false
        }
    }

    private fun enterAnim(v: View) {
        try {
            if (reducedMotion()) {
                v.alpha = 1f
                v.translationY = 0f
                return
            }
            v.alpha = 0f
            v.translationY = 8f * resources.displayMetrics.density
            v.animate()
                .alpha(1f)
                .translationY(0f)
                .setDuration(220)
                .setInterpolator(DecelerateInterpolator())
                .start()
        } catch (_: Exception) {
            try {
                v.alpha = 1f
                v.translationY = 0f
            } catch (_: Exception) {}
        }
    }

    private fun haptic() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(VibratorManager::class.java)
                vm?.defaultVibrator?.vibrate(
                    VibrationEffect.createOneShot(10, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                @Suppress("DEPRECATION")
                (getSystemService(VIBRATOR_SERVICE) as? Vibrator)?.vibrate(10)
            }
        } catch (_: Exception) {}
    }

    private fun scrollDown() {
        scroll.post {
            try {
                scroll.fullScroll(View.FOCUS_DOWN)
            } catch (_: Exception) {}
        }
    }

    private fun hideIntro() {
        try {
            for (i in content.childCount - 1 downTo 0) {
                val v = content.getChildAt(i)
                if (v.tag == "empty") content.removeViewAt(i)
            }
            if (introBox.visibility != View.VISIBLE) return
            if (reducedMotion()) {
                introBox.visibility = View.GONE
                return
            }
            introBox.animate()
                .alpha(0f)
                .translationY(-8f * resources.displayMetrics.density)
                .setDuration(320)
                .setInterpolator(DecelerateInterpolator())
                .withEndAction {
                    try {
                        introBox.visibility = View.GONE
                        introBox.alpha = 1f
                        introBox.translationY = 0f
                    } catch (_: Exception) {}
                }
                .start()
        } catch (_: Exception) {
            try {
                introBox.visibility = View.GONE
            } catch (_: Exception) {}
        }
    }

    private fun getOrCreateChat(): Long {
        val id = chatId
        if (id != null) return id
        val title = "Sohbet"
        val nid = try { db.createChat(email, title) } catch (_: Exception) { -1 }
        chatId = if (nid == -1L) null else nid
        return nid
    }

    private fun loadLastChat() {
        Thread {
            val last = try { db.getChats(email).firstOrNull() } catch (_: Exception) { null }
            runOnUiThread {
                if (last == null) {
                    showEmpty()
                    return@runOnUiThread
                }
                chatId = last.id
                Thread {
                    val msgs = try { db.getMessages(last.id) } catch (_: Exception) { emptyList() }
                    runOnUiThread {
                        if (msgs.isEmpty()) {
                            showEmpty()
                            return@runOnUiThread
                        }
                        hideIntroImmediate()
                        for (m in msgs) {
                            if (m.role == "user") addUserView(m.text, false)
                            else addAssistantView(m.text, null, false)
                        }
                        scrollDown()
                    }
                }.start()
            }
        }.start()
    }

    private fun showEmpty() {
        try {
            introBox.visibility = View.VISIBLE
            val t = TextView(this)
            t.tag = "empty"
            t.text = getString(R.string.empty_chat)
            t.setTextColor(ContextCompat.getColor(this, R.color.soluk))
            t.textSize = 13f
            t.setPadding(0, (8 * resources.displayMetrics.density).toInt(), 0, 0)
            content.addView(t)
        } catch (_: Exception) {}
    }

    private fun hideIntroImmediate() {
        try {
            introBox.visibility = View.GONE
        } catch (_: Exception) {}
    }

    fun newChat() {
        Thread {
            try {
                val nid = db.createChat(email, "Sohbet")
                runOnUiThread {
                    chatId = nid
                    // Eski mesajları temizle (introBox yerinde durur)
                    for (i in content.childCount - 1 downTo 0) {
                        val v = content.getChildAt(i)
                        if (v !== introBox) content.removeViewAt(i)
                    }
                    introBox.visibility = View.VISIBLE
                    introBox.alpha = 1f
                    introBox.translationY = 0f
                    greeting.text = greetingFor()
                    buildChips()
                    buildLinksPreview()
                    scrollDown()
                }
            } catch (_: Exception) {}
        }.start()
    }

    private fun addUserView(text: String, animate: Boolean = true) {
        try {
            val v = LayoutInflater.from(this).inflate(R.layout.item_user_message, content, false) as TextView
            v.text = text
            v.textSize = fontUser()
            v.setOnLongClickListener {
                try {
                    val cm = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("mesaj", text))
                    Toast.makeText(this, getString(R.string.copied), Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {}
                true
            }
            content.addView(v)
            if (animate) enterAnim(v)
            scrollDown()
        } catch (_: Exception) {}
    }

    private fun addAssistantView(text: String, source: String?, animate: Boolean = true) {
        try {
            val v = LayoutInflater.from(this).inflate(R.layout.item_assistant_message, content, false)
            val body = v.findViewById<TextView>(R.id.text)
            val src = v.findViewById<TextView>(R.id.source)
            body.text = text
            body.textSize = fontAi()
            try {
                LinkGuard.linkify(body) { url ->
                    try {
                        LinkGuard.onLink(this, url)
                    } catch (_: Exception) {}
                }
            } catch (_: Exception) {}
            if (!source.isNullOrBlank()) {
                src.text = source
                src.visibility = View.VISIBLE
            } else {
                src.visibility = View.GONE
            }
            body.setOnLongClickListener {
                try {
                    val cm = getSystemService(CLIPBOARD_SERVICE) as android.content.ClipboardManager
                    cm.setPrimaryClip(android.content.ClipData.newPlainText("mesaj", text))
                    Toast.makeText(this, getString(R.string.copied), Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {}
                true
            }
            content.addView(v)
            if (animate) enterAnim(v)
            scrollDown()
        } catch (_: Exception) {}
    }

    private fun showThinking() {
        if (thinking) return
        thinking = true
        try {
            val dot = View(this)
            val d = (8 * resources.displayMetrics.density).toInt()
            val lp = LinearLayout.LayoutParams(d, d)
            lp.marginStart = (20 * resources.displayMetrics.density).toInt()
            lp.topMargin = (20 * resources.displayMetrics.density).toInt()
            dot.layoutParams = lp
            dot.setBackgroundResource(R.drawable.dot_typing)
            dot.tag = "thinking"
            content.addView(dot)
            scrollDown()
            if (reducedMotion()) return
            breathAnim = AnimatorInflater.loadAnimator(this, R.animator.breath).apply {
                setTarget(dot)
                start()
            }
        } catch (_: Exception) {}
    }

    private fun hideThinking() {
        thinking = false
        try {
            breathAnim?.cancel()
        } catch (_: Exception) {}
        breathAnim = null
        try {
            for (i in content.childCount - 1 downTo 0) {
                val v = content.getChildAt(i)
                if (v.tag == "thinking") content.removeViewAt(i)
            }
        } catch (_: Exception) {}
    }

    private fun sendText(text: String) {
        input.setText(text)
        send()
    }

    private fun send() {
        val text = input.text.toString().trim()
        if (text.isEmpty() || thinking) return
        input.setText("")
        haptic()
        hideIntro()
        val cid = getOrCreateChat()
        if (cid == -1L) return
        Thread {
            try { db.addMessage(cid, "user", text) } catch (_: Exception) {}
        }.start()
        runOnUiThread {
            addUserView(text)
            showThinking()
        }
        brain.answer(text, true) { ans ->
            Thread {
                try { db.addMessage(cid, "ai", ans.text) } catch (_: Exception) {}
            }.start()
            runOnUiThread {
                hideThinking()
                addAssistantView(ans.text, ans.source ?: "Bilgi bankası")
                ans.action?.let { runAction(it) }
            }
        }
    }

    // ---- Cihaz komutları ----

    private fun runAction(a: ChatBrain.Action) {
        when (a) {
            is ChatBrain.Action.FlashOn -> setFlash(true)
            is ChatBrain.Action.FlashOff -> setFlash(false)
            is ChatBrain.Action.WifiSettings -> openSettings(android.provider.Settings.ACTION_WIFI_SETTINGS)
            is ChatBrain.Action.BtSettings -> openSettings(android.provider.Settings.ACTION_BLUETOOTH_SETTINGS)
            is ChatBrain.Action.VolUp -> adjustVolume(1)
            is ChatBrain.Action.VolDown -> adjustVolume(-1)
            is ChatBrain.Action.OpenUrl -> openUrl(a.url)
        }
    }

    private fun setFlash(on: Boolean) {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            pendingAction = if (on) ChatBrain.Action.FlashOn else ChatBrain.Action.FlashOff
            requestPermissions(arrayOf(Manifest.permission.CAMERA), 300)
            return
        }
        try {
            val cm = getSystemService(CAMERA_SERVICE) as android.hardware.camera2.CameraManager
            val id = cm.cameraIdList.firstOrNull() ?: return
            cm.setTorchMode(id, on)
        } catch (_: Exception) {}
    }

    private fun openSettings(action: String) {
        try {
            startActivity(Intent(action))
        } catch (_: Exception) {}
    }

    private fun openUrl(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        } catch (_: Exception) {}
    }

    private fun adjustVolume(dir: Int) {
        try {
            val am = getSystemService(AUDIO_SERVICE) as android.media.AudioManager
            am.adjustVolume(
                if (dir > 0) android.media.AudioManager.ADJUST_RAISE else android.media.AudioManager.ADJUST_LOWER,
                android.media.AudioManager.FLAG_SHOW_UI
            )
        } catch (_: Exception) {}
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, res: IntArray) {
        super.onRequestPermissionsResult(code, perms, res)
        if (code == 300 && res.isNotEmpty() && res[0] == PackageManager.PERMISSION_GRANTED) {
            pendingAction?.let { runAction(it) }
        }
        if (code != 300) pendingAction = null
        if (code == 201 && res.isNotEmpty() && res[0] == PackageManager.PERMISSION_GRANTED) {
            dictate()
        }
    }

    /** Mikrofona konuş, yazıya dökülsün. */
    private fun dictate() {
        if (dictating) {
            micTest?.cancel()
            dictating = false
            return
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 201)
            return
        }
        if (!ModelManager.isReady(this)) {
            Toast.makeText(this, getString(R.string.no_model), Toast.LENGTH_SHORT).show()
            return
        }
        dictating = true
        Toast.makeText(this, getString(R.string.listening), Toast.LENGTH_SHORT).show()
        val t = MicTest(ModelManager.modelDir(this))
        micTest = t
        t.run(15, object : MicTest.Listener {
            override fun onPartial(p: String) {}
            override fun onDone(finalText: String) {
                dictating = false
                runOnUiThread {
                    if (finalText.isNotBlank()) {
                        val cur = input.text.toString()
                        input.setText(if (cur.isBlank()) finalText else "$cur $finalText")
                        input.setSelection(input.text.length)
                    }
                }
            }
            override fun onError(e: Exception) {
                dictating = false
            }
        })
    }
}
