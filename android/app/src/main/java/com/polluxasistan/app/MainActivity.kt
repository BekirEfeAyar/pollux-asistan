package com.polluxasistan.app

import android.Manifest
import android.animation.Animator
import android.animation.AnimatorInflater
import android.animation.AnimatorSet
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Bundle
import android.provider.Settings
import android.text.TextUtils
import android.view.LayoutInflater
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.Button
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.widget.doAfterTextChanged
import androidx.drawerlayout.widget.DrawerLayout
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Pollux kişisel sürüm: çekmece + ev + sohbet + profil sayfası. */
class MainActivity : AppCompatActivity() {

    private var email: String = ""

    private lateinit var drawer: DrawerLayout
    private lateinit var mainCol: LinearLayout
    private lateinit var drawerView: LinearLayout
    private lateinit var searchInput: EditText
    private lateinit var histBox: LinearLayout
    private lateinit var avatarSmall: ImageView
    private lateinit var profileName: TextView
    private lateinit var scroll: ScrollView
    private lateinit var content: LinearLayout
    private lateinit var introBox: LinearLayout
    private lateinit var greeting: TextView
    private lateinit var chipsBox: LinearLayout
    private lateinit var linksBox: LinearLayout
    private lateinit var input: EditText
    private lateinit var send: ImageButton
    private lateinit var sheetWrap: FrameLayout
    private lateinit var sheetBackdrop: View
    private lateinit var sheet: LinearLayout
    private lateinit var avatarBig: ImageView
    private lateinit var nameInput: EditText
    private lateinit var themeSystem: Button
    private lateinit var themeLight: Button
    private lateinit var themeDark: Button

    private lateinit var db: DbHelper
    private lateinit var brain: ChatBrain
    private var currentId: Long? = null
    private var busy = false
    private var breathSet: AnimatorSet? = null
    private var pendingAction: ChatBrain.Action? = null

    private val pickPhoto = registerForActivityResult(
        ActivityResultContracts.GetContent(),
        androidx.activity.result.ActivityResultCallback { uri: Uri? ->
            try {
                if (uri == null) return@ActivityResultCallback
                contentResolver.openInputStream(uri)?.use { ins ->
                    ProfileStore.avatarFile(this).outputStream().use { out ->
                        ins.copyTo(out)
                    }
                }
                refreshAvatars()
            } catch (_: Exception) {}
        }
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        ProfileStore.applyTheme(this)
        super.onCreate(savedInstanceState)
        Thread { Prefs.ensureSeedAccount(this) }.start()
        Thread {
            try {
                Knowledge(applicationContext).warmup()
            } catch (_: Exception) {}
        }.start()
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

        drawer = findViewById(R.id.drawer)
        mainCol = findViewById(R.id.mainCol)
        drawerView = findViewById(R.id.drawerView)
        searchInput = findViewById(R.id.searchInput)
        histBox = findViewById(R.id.histBox)
        avatarSmall = findViewById(R.id.avatarSmall)
        profileName = findViewById(R.id.profileName)
        scroll = findViewById(R.id.scroll)
        content = findViewById(R.id.content)
        introBox = findViewById(R.id.introBox)
        greeting = findViewById(R.id.greeting)
        chipsBox = findViewById(R.id.chipsBox)
        linksBox = findViewById(R.id.linksBox)
        input = findViewById(R.id.input)
        send = findViewById(R.id.send)
        send.setColorFilter(ContextCompat.getColor(this, R.color.soluk))
        sheetWrap = findViewById(R.id.sheetWrap)
        sheetBackdrop = findViewById(R.id.sheetBackdrop)
        sheet = findViewById(R.id.sheet)
        avatarBig = findViewById(R.id.avatarBig)
        nameInput = findViewById(R.id.nameInput)
        themeSystem = findViewById(R.id.themeSystem)
        themeLight = findViewById(R.id.themeLight)
        themeDark = findViewById(R.id.themeDark)

        // Çekmece ana sütunu iter
        drawer.addDrawerListener(object : DrawerLayout.DrawerListener {
            override fun onDrawerSlide(v: View, o: Float) {
                try {
                    mainCol.translationX = o * drawerView.width
                } catch (_: Exception) {}
            }
            override fun onDrawerOpened(v: View) {}
            override fun onDrawerClosed(v: View) {
                try {
                    mainCol.translationX = 0f
                } catch (_: Exception) {}
            }
            override fun onDrawerStateChanged(s: Int) {}
        })
        drawer.setScrimColor(ContextCompat.getColor(this, R.color.perde))

        findViewById<ImageButton>(R.id.menuBtn).setOnClickListener {
            drawer.openDrawer(drawerView)
        }
        findViewById<ImageButton>(R.id.topNew).setOnClickListener { showHome() }
        findViewById<ImageButton>(R.id.drawerNew).setOnClickListener {
            showHome()
            drawer.closeDrawer(drawerView)
        }
        findViewById<LinearLayout>(R.id.navNew).setOnClickListener {
            showHome()
            drawer.closeDrawer(drawerView)
        }
        findViewById<LinearLayout>(R.id.navLinks).setOnClickListener {
            showHome()
            drawer.closeDrawer(drawerView)
            linksBox.postDelayed({
                try {
                    val y = (linksBox.parent as View).top + linksBox.top
                    scroll.smoothScrollTo(0, y)
                } catch (_: Exception) {}
            }, 380)
        }
        findViewById<LinearLayout>(R.id.navBank).setOnClickListener {
            showHome()
            drawer.closeDrawer(drawerView)
            linksBox.postDelayed({
                try {
                    input.setText("ağaç ne demek")
                    input.setSelection(input.text.length)
                    input.requestFocus()
                    val imm = getSystemService(INPUT_METHOD_SERVICE) as InputMethodManager
                    imm.showSoftInput(input, InputMethodManager.SHOW_IMPLICIT)
                    updateSend()
                } catch (_: Exception) {}
            }, 380)
        }
        try {
            findViewById<LinearLayout>(R.id.navPanel).visibility =
                if (Prefs.isModerator(this)) View.VISIBLE else View.GONE
        } catch (_: Exception) {}
        findViewById<LinearLayout>(R.id.navPanel).setOnClickListener {
            drawer.closeDrawer(drawerView)
            try {
                startActivity(Intent(this, DashboardActivity::class.java))
            } catch (_: Exception) {}
        }
        findViewById<LinearLayout>(R.id.meRow).setOnClickListener { openSheet() }
        searchInput.doAfterTextChanged { renderHist() }

        greeting.text = greetingFor()
        buildChips()
        buildLinks()
        refreshProfile()

        input.doAfterTextChanged { updateSend() }
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == EditorInfo.IME_ACTION_SEND) {
                ask(input.text.toString())
                true
            } else false
        }
        send.setOnClickListener { ask(input.text.toString()) }

        sheetBackdrop.setOnClickListener { closeSheet() }
        findViewById<Button>(R.id.sheetDone).setOnClickListener { closeSheet() }
        findViewById<TextView>(R.id.logoutBtn).setOnClickListener {
            Prefs.logout(this)
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
        }
        findViewById<Button>(R.id.photoPick).setOnClickListener {
            try {
                pickPhoto.launch("image/*")
            } catch (_: Exception) {}
        }
        findViewById<ImageButton>(R.id.avatarCam).setOnClickListener {
            try {
                pickPhoto.launch("image/*")
            } catch (_: Exception) {}
        }
        findViewById<Button>(R.id.photoClear).setOnClickListener {
            try {
                ProfileStore.avatarFile(this).delete()
            } catch (_: Exception) {}
            refreshAvatars()
        }
        nameInput.doAfterTextChanged { t ->
            ProfileStore.setName(this, t?.toString() ?: "")
            refreshProfile()
        }
        themeSystem.setOnClickListener { setThemeMode("system") }
        themeLight.setOnClickListener { setThemeMode("light") }
        themeDark.setOnClickListener { setThemeMode("dark") }
        syncThemeSeg()

        renderHist()
        showHome()
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
            refreshProfile()
        } catch (_: Exception) {}
        try {
            findViewById<LinearLayout>(R.id.navPanel).visibility =
                if (Prefs.isModerator(this)) View.VISIBLE else View.GONE
        } catch (_: Exception) {}
        Thread {
            val online = try {
                Researcher(applicationContext).hasInternet()
            } catch (_: Exception) {
                false
            }
            runOnUiThread {
                try {
                    val t = if (online) "Çevrimiçi" else "Çevrimdışı hazır"
                    findViewById<TextView>(R.id.topStatus).text = t
                    findViewById<TextView>(R.id.profileStatus).text = t
                } catch (_: Exception) {}
            }
        }.start()
    }

    override fun onBackPressed() {
        if (sheetWrap.visibility == View.VISIBLE) closeSheet()
        else if (drawer.isDrawerOpen(drawerView)) drawer.closeDrawer(drawerView)
        else super.onBackPressed()
    }

    override fun onDestroy() {
        try {
            breathSet?.cancel()
        } catch (_: Exception) {}
        super.onDestroy()
    }

    // ---------- Profil + tema ----------

    private fun refreshProfile() {
        try {
            val nm = ProfileStore.name(this).ifBlank {
                try {
                    MemoryStore(this).load().name.ifBlank { Prefs.sessionName(this) }
                } catch (_: Exception) {
                    try {
                        Prefs.sessionName(this)
                    } catch (_: Exception) {
                        ""
                    }
                }
            }
            profileName.text = nm.ifBlank { "Misafir" }
            if (nameInput.text.toString() != nm) {
                nameInput.setText(nm)
                nameInput.setSelection(nameInput.text.length)
            }
            greeting.text = greetingFor()
        } catch (_: Exception) {}
        refreshAvatars()
    }

    private fun refreshAvatars() {
        try {
            if (ProfileStore.hasPhoto(this)) {
                val bmp = BitmapFactory.decodeFile(ProfileStore.avatarFile(this).absolutePath)
                if (bmp != null) {
                    avatarSmall.setImageBitmap(bmp)
                    avatarBig.setImageBitmap(bmp)
                    return
                }
            }
            avatarSmall.setImageResource(R.drawable.ic_avatar_default)
            avatarBig.setImageResource(R.drawable.ic_avatar_default)
        } catch (_: Exception) {
            try {
                avatarSmall.setImageResource(R.drawable.ic_avatar_default)
                avatarBig.setImageResource(R.drawable.ic_avatar_default)
            } catch (_: Exception) {}
        }
    }

    private fun greetingFor(): String {
        val hour = try {
            SimpleDateFormat("H", Locale("tr")).format(Date()).toInt()
        } catch (_: Exception) {
            12
        }
        val g = if (hour >= 5 && hour < 11) "Günaydın"
        else if (hour >= 11 && hour < 18) "İyi günler"
        else if (hour >= 18 && hour < 23) "İyi akşamlar"
        else "İyi geceler"
        val first = ProfileStore.firstName(this).ifBlank {
            try {
                val mn = MemoryStore(this).load().name
                if (mn.isNotBlank()) mn else Prefs.sessionName(this)
            } catch (_: Exception) {
                try {
                    Prefs.sessionName(this)
                } catch (_: Exception) {
                    ""
                }
            }
        }.trim().split("\\s+".toRegex()).firstOrNull() ?: ""
        return g + (if (first.isNotBlank()) ", $first" else "") + "."
    }

    private fun syncThemeSeg() {
        try {
            val t = ProfileStore.theme(this)
            val on = mapOf(
                themeSystem to (t == "system"),
                themeLight to (t == "light"),
                themeDark to (t == "dark")
            )
            for ((b, sel) in on) {
                b.setBackgroundResource(if (sel) R.drawable.bg_seg_sel else android.R.color.transparent)
                b.setTextColor(
                    ContextCompat.getColor(
                        this,
                        if (sel) R.color.murekkep else R.color.soluk
                    )
                )
            }
        } catch (_: Exception) {}
    }

    private fun setThemeMode(v: String) {
        ProfileStore.setTheme(this, v)
        syncThemeSeg()
    }

    // ---------- Alt sayfa ----------

    private fun openSheet() {
        try {
            refreshAvatars()
            syncThemeSeg()
            sheetWrap.visibility = View.VISIBLE
            sheetBackdrop.alpha = 0f
            sheetBackdrop.animate().cancel()
            sheetBackdrop.animate().alpha(1f).setDuration(if (reducedMotion()) 0 else 300)
                .setInterpolator(DecelerateInterpolator()).start()
            sheet.translationY = sheet.height.toFloat().takeIf { it > 0 } ?: 600f
            sheet.animate().cancel()
            sheet.animate().translationY(0f)
                .setDuration(if (reducedMotion()) 0 else 380)
                .setInterpolator(DecelerateInterpolator()).start()
        } catch (_: Exception) {
            try {
                sheetWrap.visibility = View.VISIBLE
            } catch (_: Exception) {}
        }
    }

    private fun closeSheet() {
        try {
            sheetBackdrop.animate().cancel()
            sheetBackdrop.animate().alpha(0f).setDuration(if (reducedMotion()) 0 else 300)
                .setInterpolator(DecelerateInterpolator()).start()
            sheet.animate().cancel()
            sheet.animate().translationY(sheet.height.toFloat().takeIf { it > 0 } ?: 600f)
                .setDuration(if (reducedMotion()) 0 else 380)
                .setInterpolator(DecelerateInterpolator())
                .withEndAction {
                    try {
                        sheetWrap.visibility = View.GONE
                    } catch (_: Exception) {}
                }
                .start()
        } catch (_: Exception) {
            try {
                sheetWrap.visibility = View.GONE
            } catch (_: Exception) {}
        }
    }

    // ---------- Ev: çipler + kısayollar ----------

    private fun buildChips() {
        chipsBox.removeAllViews()
        val d = resources.displayMetrics.density
        val data = listOf(
            "Hesapla" to "12 çarpı 8",
            "Döviz" to "dolar kaç tl",
            "Hava" to "hava nasıl",
            "Sözlük" to "ağaç ne demek",
            "Gündem" to "gündem ne",
            "Uygulama aç" to "youtube aç"
        )
        val rows = listOf(
            LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL },
            LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                setPadding(0, (8 * d).toInt(), 0, 0)
            }
        )
        data.forEachIndexed { i, (label, q) ->
            val b = TextView(this)
            b.text = label
            b.setTextColor(ContextCompat.getColor(this, R.color.murekkep))
            b.textSize = 14f
            b.background = ContextCompat.getDrawable(this, R.drawable.bg_chip)
            b.setPadding((16 * d).toInt(), (8 * d).toInt(), (16 * d).toInt(), (8 * d).toInt())
            b.minHeight = (38 * d).toInt()
            b.gravity = android.view.Gravity.CENTER_VERTICAL
            val lp = LinearLayout.LayoutParams(LinearLayout.LayoutParams.WRAP_CONTENT, (38 * d).toInt())
            lp.marginEnd = (8 * d).toInt()
            b.layoutParams = lp
            b.isClickable = true
            b.isFocusable = true
            b.setOnTouchListener { v, e ->
                try {
                    if (e.action == MotionEvent.ACTION_DOWN) {
                        v.animate().cancel()
                        v.animate().scaleX(0.97f).scaleY(0.97f).setDuration(if (reducedMotion()) 0 else 90).start()
                    } else if (e.action == MotionEvent.ACTION_UP || e.action == MotionEvent.ACTION_CANCEL) {
                        v.animate().cancel()
                        v.animate().scaleX(1f).scaleY(1f).setDuration(if (reducedMotion()) 0 else 90).start()
                    }
                } catch (_: Exception) {}
                false
            }
            b.setOnClickListener { ask(q) }
            (if (i < 3) rows[0] else rows[1]).addView(b)
        }
        rows.forEach { chipsBox.addView(it) }
    }

    private fun buildLinks() {
        linksBox.removeAllViews()
        val d = resources.displayMetrics.density
        val links = listOf(
            "Linklerim" to LinkGuard.MY_LINKS,
            "YouTube" to "https://www.youtube.com",
            "Vikipedi" to "https://tr.wikipedia.org",
            "EBA" to "https://www.eba.gov.tr"
        )
        for ((title, url) in links) {
            val row = LayoutInflater.from(this).inflate(R.layout.row_link, linksBox, false)
            row.findViewById<TextView>(R.id.linkTitle).text = title
            val divTop = View(this)
            divTop.setBackgroundColor(ContextCompat.getColor(this, R.color.cizgi))
            linksBox.addView(divTop, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (1 * d).toInt()))
            row.isClickable = true
            row.isFocusable = true
            row.setOnClickListener {
                try {
                    LinkGuard.onLink(this, url)
                } catch (_: Exception) {}
            }
            linksBox.addView(row)
        }
        val divBot = View(this)
        divBot.setBackgroundColor(ContextCompat.getColor(this, R.color.cizgi))
        linksBox.addView(divBot, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (1 * d).toInt()))
    }

    // ---------- Geçmiş ----------

    private fun groupOf(ts: Long): String {
        return try {
            val cal = Calendar.getInstance()
            cal.timeInMillis = ts
            val today = Calendar.getInstance()
            val sameDay = cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) &&
                cal.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR)
            if (sameDay) return "Bugün"
            today.add(Calendar.DAY_OF_YEAR, -1)
            val yest = cal.get(Calendar.YEAR) == today.get(Calendar.YEAR) &&
                cal.get(Calendar.DAY_OF_YEAR) == today.get(Calendar.DAY_OF_YEAR)
            if (yest) return "Dün"
            SimpleDateFormat("d MMMM", Locale("tr")).format(Date(ts))
        } catch (_: Exception) {
            ""
        }
    }

    private fun renderHist() {
        Thread {
            val term = try {
                searchInput.text.toString().trim().lowercase(Locale("tr", "TR"))
            } catch (_: Exception) {
                ""
            }
            val chats = try { db.getChats(email) } catch (_: Exception) { emptyList() }
            val list = chats.filter { c ->
                term.isBlank() || c.title.lowercase(Locale("tr", "TR")).contains(term)
            }
            runOnUiThread {
                try {
                    histBox.removeAllViews()
                    if (list.isEmpty()) {
                        if (term.isNotBlank()) {
                            val t = TextView(this)
                            t.text = "Sonuç yok."
                            t.setTextColor(ContextCompat.getColor(this, R.color.soluk))
                            t.textSize = 14f
                            t.setPadding((12 * resources.displayMetrics.density).toInt(), (12 * resources.displayMetrics.density).toInt(), 0, 0)
                            histBox.addView(t)
                        }
                        return@runOnUiThread
                    }
                    var last = ""
                    for (c in list) {
                        val g = groupOf(c.createdAt)
                        if (g.isNotBlank() && g != last) {
                            last = g
                            val lab = TextView(this)
                            lab.text = g
                            lab.setTextColor(ContextCompat.getColor(this, R.color.soluk))
                            lab.textSize = 12f
                            lab.setPadding(
                                (12 * resources.displayMetrics.density).toInt(),
                                (18 * resources.displayMetrics.density).toInt(),
                                0,
                                (6 * resources.displayMetrics.density).toInt()
                            )
                            histBox.addView(lab)
                        }
                        val b = LayoutInflater.from(this).inflate(R.layout.row_history, histBox, false) as TextView
                        b.text = c.title.ifBlank { "Sohbet" }
                        if (currentId != null && c.id == currentId) {
                            b.setBackgroundResource(R.drawable.bg_hist_sel)
                        } else {
                            b.setBackgroundResource(android.R.color.transparent)
                        }
                        b.setOnClickListener {
                            openChat(c.id)
                            drawer.closeDrawer(drawerView)
                        }
                        histBox.addView(b)
                    }
                } catch (_: Exception) {}
            }
        }.start()
    }

    // ---------- Sohbet ----------

    private fun reducedMotion(): Boolean {
        return try {
            Settings.Global.getFloat(contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        } catch (_: Exception) {
            false
        }
    }

    private fun enterAnim(v: View, long: Boolean = false) {
        try {
            if (reducedMotion()) {
                v.alpha = 1f
                v.translationY = 0f
                return
            }
            v.alpha = 0f
            v.translationY = (if (long) 10f else 8f) * resources.displayMetrics.density
            v.animate()
                .alpha(1f)
                .translationY(0f)
                .setDuration(if (long) 550 else 320)
                .setInterpolator(DecelerateInterpolator())
                .start()
        } catch (_: Exception) {
            try {
                v.alpha = 1f
                v.translationY = 0f
            } catch (_: Exception) {}
        }
    }

    private fun scrollDown(smooth: Boolean = true) {
        scroll.post {
            try {
                if (smooth) scroll.smoothScrollTo(0, scroll.bottom)
                else scroll.scrollTo(0, scroll.bottom)
            } catch (_: Exception) {}
        }
    }

    private fun showHome() {
        currentId = null
        Thread {
            try {
                content.post {
                    content.removeAllViews()
                    content.addView(introBox)
                    introBox.visibility = View.VISIBLE
                    greeting.text = greetingFor()
                    buildChips()
                    buildLinks()
                    for (i in 0 until introBox.childCount) {
                        val v = introBox.getChildAt(i)
                        v.alpha = 0f
                        v.translationY = 10f * resources.displayMetrics.density
                        v.animate().cancel()
                        v.animate().alpha(1f).translationY(0f)
                            .setStartDelay((i * 55).toLong())
                            .setDuration(if (reducedMotion()) 0 else 550)
                            .setInterpolator(DecelerateInterpolator())
                            .start()
                    }
                    scroll.scrollTo(0, 0)
                    input.setText("")
                    updateSend()
                    renderHist()
                }
            } catch (_: Exception) {}
        }.start()
    }

    private fun openChat(id: Long) {
        currentId = id
        Thread {
            val msgs = try { db.getMessages(id) } catch (_: Exception) { emptyList() }
            content.post {
                try {
                    content.removeAllViews()
                    for (m in msgs) {
                        if (m.role == "user") addUserView(m.text, false)
                        else addAssistantRow(m.text, false)
                    }
                    scroll.post { scroll.scrollTo(0, scroll.bottom) }
                    renderHist()
                } catch (_: Exception) {}
            }
        }.start()
    }

    private fun addUserView(text: String, animate: Boolean = true) {
        try {
            val v = LayoutInflater.from(this).inflate(R.layout.item_user_message, content, false) as TextView
            v.text = text
            v.maxWidth = (resources.displayMetrics.widthPixels * 0.8).toInt()
            v.setOnLongClickListener {
                try {
                    val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("mesaj", text))
                    Toast.makeText(this, "Kopyalandı", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {}
                true
            }
            content.addView(v)
            if (animate) enterAnim(v)
            scrollDown()
        } catch (_: Exception) {}
    }

    private fun addAssistantRow(saved: String, animate: Boolean) {
        // Kayıtlı kart biçimi: CARD::başlık||açıklama||kaynak
        if (saved.startsWith("CARD::")) {
            val parts = saved.removePrefix("CARD::").split("||")
            if (parts.size >= 3) {
                addCardView(parts[0], parts[1], animate)
                return
            }
        }
        addAssistantView(saved, null, animate)
    }

    private fun addAssistantView(text: String, source: String?, animate: Boolean = true) {
        try {
            val v = LayoutInflater.from(this).inflate(R.layout.item_assistant_message, content, false)
            val body = v.findViewById<TextView>(R.id.text)
            val src = v.findViewById<TextView>(R.id.source)
            body.text = text
            try {
                LinkGuard.linkify(body) { url ->
                    try {
                        LinkGuard.onLink(this, url)
                    } catch (_: Exception) {}
                }
            } catch (_: Exception) {}
            // Kaynak satırı istek üzerine gizli
            src.visibility = View.GONE
            body.setOnLongClickListener {
                try {
                    val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
                    cm.setPrimaryClip(ClipData.newPlainText("mesaj", text))
                    Toast.makeText(this, "Kopyalandı", Toast.LENGTH_SHORT).show()
                } catch (_: Exception) {}
                true
            }
            // Kaynak satırı istek üzerine gizli
            src.visibility = View.GONE
            content.addView(v)
            if (animate) enterAnim(v)
            scrollDown()
        } catch (_: Exception) {}
    }

    private fun addCardView(title: String, sub: String, animate: Boolean = true) {
        try {
            val v = LayoutInflater.from(this).inflate(R.layout.item_result_card, content, false)
            v.findViewById<TextView>(R.id.cardTitle).text = title
            v.findViewById<TextView>(R.id.cardSub).text = sub
            content.addView(v)
            if (animate) enterAnim(v)
            scrollDown()
        } catch (_: Exception) {}
    }

    private fun showTyping() {
        try {
            val dot = View(this)
            val d = (8 * resources.displayMetrics.density).toInt()
            val lp = LinearLayout.LayoutParams(d, d)
            lp.topMargin = (24 * resources.displayMetrics.density).toInt()
            dot.layoutParams = lp
            dot.setBackgroundResource(R.drawable.dot_typing)
            dot.tag = "typing"
            content.addView(dot)
            scrollDown()
            if (reducedMotion()) return
            val a1 = AnimatorInflater.loadAnimator(this, R.animator.breath)
            val a2 = AnimatorInflater.loadAnimator(this, R.animator.breath_scale)
            breathSet = AnimatorSet().apply {
                playTogether(a1, a2)
                setTarget(dot)
                start()
            }
        } catch (_: Exception) {}
    }

    private fun hideTyping() {
        try {
            breathSet?.cancel()
        } catch (_: Exception) {}
        breathSet = null
        try {
            for (i in content.childCount - 1 downTo 0) {
                if (content.getChildAt(i).tag == "typing") content.removeViewAt(i)
            }
        } catch (_: Exception) {}
    }

    private fun updateSend() {
        val ready = input.text.toString().trim().isNotEmpty()
        send.setBackgroundResource(if (ready) R.drawable.bg_send_active else R.drawable.bg_send_idle)
        send.setColorFilter(
            ContextCompat.getColor(this, if (ready) R.color.kiremit_uzeri else R.color.soluk)
        )
    }

    private fun ask(raw: String) {
        val t = raw.trim()
        if (t.isEmpty() || busy) return
        busy = true
        val cid: Long = if (currentId != null) currentId!!
        else {
            val title = if (t.length > 30) t.take(30) + "…" else t
            try {
                db.createChat(email, title)
            } catch (_: Exception) {
                -1
            }
        }
        if (cid == -1L) {
            busy = false
            return
        }
        currentId = cid
        Thread {
            try { db.addMessage(cid, "user", t) } catch (_: Exception) {}
        }.start()
        runOnUiThread {
            if (introBox.parent != null && introBox.visibility == View.VISIBLE) {
                hideIntro()
            }
            addUserView(t)
            showTyping()
            input.setText("")
            updateSend()
        }
        val t0 = System.currentTimeMillis()
        brain.answer(t, true) { ans ->
            val wait = 650 - (System.currentTimeMillis() - t0)
            val deliver = {
                Thread {
                    try {
                        if (ans.card != null) {
                            db.addMessage(cid, "ai", "CARD::" + ans.card.title + "||" + ans.card.sub + "||" + ans.card.source)
                        } else {
                            db.addMessage(cid, "ai", ans.text)
                        }
                    } catch (_: Exception) {}
                }.start()
                runOnUiThread {
                    hideTyping()
                    if (ans.card != null) {
                        addAssistantView(ans.text, null)
                        addCardView(ans.card.title, ans.card.sub)
                    } else {
                        addAssistantView(ans.text, ans.source ?: "Bilgi bankası · çevrimdışı")
                    }
                    ans.action?.let { runAction(it) }
                    busy = false
                    renderHist()
                }
            }
            if (wait > 0) {
                content.postDelayed({ deliver() }, wait)
            } else {
                deliver()
            }
        }
    }

    private fun hideIntro() {
        try {
            if (introBox.parent == null) return
            if (reducedMotion()) {
                content.removeView(introBox)
                return
            }
            introBox.animate().cancel()
            introBox.animate().alpha(0f).translationY(-8f * resources.displayMetrics.density)
                .setDuration(320).setInterpolator(DecelerateInterpolator())
                .withEndAction {
                    try {
                        content.removeView(introBox)
                        introBox.alpha = 1f
                        introBox.translationY = 0f
                    } catch (_: Exception) {}
                }.start()
        } catch (_: Exception) {}
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
        pendingAction = null
    }
}
