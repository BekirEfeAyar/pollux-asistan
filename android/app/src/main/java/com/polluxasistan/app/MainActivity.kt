package com.polluxasistan.app

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.View
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.GravityCompat
import androidx.drawerlayout.widget.DrawerLayout
import androidx.fragment.app.Fragment
import com.google.android.material.navigation.NavigationView

/** Pollux: Yazılı / Sesli sekmeler + yan menü + geçmiş. */
class MainActivity : AppCompatActivity() {

    private lateinit var drawer: DrawerLayout
    private lateinit var nav: NavigationView
    private lateinit var tabText: TextView
    private lateinit var tabVoice: TextView
    private lateinit var tabTextLine: View
    private lateinit var tabVoiceLine: View
    private lateinit var newChatBtn: android.widget.ImageButton
    private var textFrag: TextChatFragment? = null
    private var voiceFrag: VoiceFragment? = null
    private var currentTab = 0 // 0 yazılı, 1 sesli
    private var firstSwitch = true
    private lateinit var netDot: View

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeHelper.apply(this)
        super.onCreate(savedInstanceState)
        Thread { Prefs.ensureSeedAccount(this) }.start()
        if (Prefs.sessionEmail(this) == null) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        setContentView(R.layout.activity_main)

        drawer = findViewById(R.id.drawer)
        nav = findViewById(R.id.nav)
        tabText = findViewById(R.id.tabText)
        tabVoice = findViewById(R.id.tabVoice)
        tabTextLine = findViewById(R.id.tabTextLine)
        tabVoiceLine = findViewById(R.id.tabVoiceLine)
        newChatBtn = findViewById(R.id.newChatBtn)
        netDot = findViewById(R.id.netDot)
        val menuBtn: android.widget.ImageButton = findViewById(R.id.menuBtn)

        menuBtn.setOnClickListener { drawer.openDrawer(GravityCompat.START) }
        tabText.setOnClickListener { switchTab(0) }
        tabVoice.setOnClickListener { switchTab(1) }
        newChatBtn.setOnClickListener { textFrag?.startNewChat() }

        nav.setNavigationItemSelectedListener { item ->
            when (item.itemId) {
                R.id.nav_new -> {
                    switchTab(0)
                    textFrag?.startNewChat()
                    drawer.closeDrawers()
                    true
                }
                R.id.nav_clear -> {
                    switchTab(0)
                    textFrag?.clearCurrent()
                    drawer.closeDrawers()
                    true
                }
                R.id.nav_dashboard -> {
                    startActivity(Intent(this, DashboardActivity::class.java))
                    drawer.closeDrawers()
                    true
                }
                R.id.nav_logout -> {
                    Prefs.logout(this)
                    startActivity(Intent(this, LoginActivity::class.java))
                    overridePendingTransition(R.anim.fade_in, R.anim.fade_out)
                    finish()
                    true
                }
                R.id.nav_links -> {
                    drawer.closeDrawers()
                    try {
                        LinkGuard.onLink(this, "https://bekirefeayar.github.io/kisisel-linklerim/")
                    } catch (_: Exception) {}
                    true
                }
                R.id.nav_theme -> {
                    Prefs.cycleTheme(this)
                    ThemeHelper.apply(this)
                    drawer.closeDrawers()
                    recreate()
                    try { overridePendingTransition(R.anim.fade_in, R.anim.fade_out) } catch (_: Exception) {}
                    true
                }
                else -> {
                    // Geçmiş sohbetler: id = 1000 + chatId
                    val chatId = (item.itemId - 1000).toLong()
                    if (chatId > 0) {
                        switchTab(0)
                        textFrag?.loadChat(chatId)
                        drawer.closeDrawers()
                        true
                    } else false
                }
            }
        }

        textFrag = TextChatFragment()
        voiceFrag = VoiceFragment()
        supportFragmentManager.beginTransaction()
            .add(R.id.fragmentBox, voiceFrag!!, "voice")
            .add(R.id.fragmentBox, textFrag!!, "text")
            .commit()
        switchTab(0)
    }

    override fun onResume() {
        super.onResume()
        if (Prefs.sessionEmail(this) == null) {
            startActivity(Intent(this, LoginActivity::class.java))
            finish()
            return
        }
        refreshDrawer()
        // İnternet noktası (yeşil çevrimiçi / kırmızı çevrimdışı)
        Thread {
            val online = try {
                Researcher(applicationContext).hasInternet()
            } catch (_: Exception) {
                false
            }
            runOnUiThread {
                try {
                    netDot.setBackgroundResource(if (online) R.drawable.dot_ok else R.drawable.dot_bad)
                } catch (_: Exception) {}
            }
        }.start()
    }

    private fun switchTab(tab: Int) {
        val forward = tab > currentTab
        val skipAnim = firstSwitch
        firstSwitch = false
        currentTab = tab
        val tx = supportFragmentManager.beginTransaction()
        try {
            // Yönlü yumuşak geçiş: sağa giderken soldan, sola dönerken sağdan kayar
            if (!skipAnim) {
                if (forward) tx.setCustomAnimations(R.anim.slide_in_right, R.anim.slide_out_left)
                else tx.setCustomAnimations(R.anim.slide_in_left, R.anim.slide_out_right)
            }
        } catch (_: Exception) {}
        if (tab == 0) {
            textFrag?.let { tx.show(it) }
            voiceFrag?.let { tx.hide(it) }
        } else {
            voiceFrag?.let { tx.show(it) }
            textFrag?.let { tx.hide(it) }
        }
        tx.commitAllowingStateLoss()
        val active = 16f
        tabText.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, if (tab == 0) active else 14f)
        tabVoice.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, if (tab == 1) active else 14f)
        tabText.setTextColor(getColor(if (tab == 0) R.color.ink else R.color.muted))
        tabVoice.setTextColor(getColor(if (tab == 1) R.color.ink else R.color.muted))
        fadeLine(tabTextLine, tab == 0)
        fadeLine(tabVoiceLine, tab == 1)
        newChatBtn.visibility = if (tab == 0) View.VISIBLE else View.INVISIBLE
        try {
            tabText.setBackgroundResource(if (tab == 0) R.drawable.tab_active else 0)
            tabVoice.setBackgroundResource(if (tab == 1) R.drawable.tab_active else 0)
        } catch (_: Exception) {}
    }

    /** Sekme çizgisi yumuşak belirir/kaybolur. */
    private fun fadeLine(v: View, show: Boolean) {
        try {
            v.animate().cancel()
            if (show) {
                v.visibility = View.VISIBLE
                v.animate().alpha(1f).setDuration(200).start()
            } else {
                v.animate().alpha(0f).setDuration(200)
                    .withEndAction { v.visibility = View.INVISIBLE }
                    .start()
            }
        } catch (_: Exception) {
            v.visibility = if (show) View.VISIBLE else View.INVISIBLE
            v.alpha = if (show) 1f else 0f
        }
    }

    fun refreshDrawer() {
        try {
            val email = Prefs.sessionEmail(this) ?: return
            val header = nav.getHeaderView(0)
            header.findViewById<TextView>(R.id.drawerName).text = Prefs.sessionName(this)
            header.findViewById<TextView>(R.id.drawerMail).text = email

            val menu = nav.menu
            menu.findItem(R.id.nav_dashboard)?.isVisible = Prefs.isModerator(this)
            menu.findItem(R.id.nav_theme)?.title = Prefs.themeLabel(Prefs.themeMode(this))

            // Geçmişi yeniden doldur
            menu.removeGroup(R.id.group_history)
            Thread {
                val chats = try { DbHelper(this).getChats(email) } catch (_: Exception) { emptyList() }
                runOnUiThread {
                    if (chats.isNotEmpty()) {
                        menu.add(R.id.group_history, Menu.NONE, Menu.NONE, "— Sohbetler —").isEnabled = false
                    }
                    chats.take(30).forEach { c ->
                        menu.add(R.id.group_history, (1000 + c.id).toInt(), Menu.NONE, c.title)
                            .setIcon(android.R.drawable.ic_menu_edit)
                    }
                }
            }.start()
        } catch (e: Exception) {
            Toast.makeText(this, "Menü yüklenemedi.", Toast.LENGTH_SHORT).show()
        }
    }

    override fun onBackPressed() {
        if (drawer.isDrawerOpen(GravityCompat.START)) drawer.closeDrawers()
        else super.onBackPressed()
    }
}
