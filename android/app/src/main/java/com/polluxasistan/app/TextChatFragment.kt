package com.polluxasistan.app

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView

/** Yazılı Konuşma sekmesi: ChatGPT tarzı sohbet + kayıtlı geçmiş. */
class TextChatFragment : Fragment() {

    private lateinit var rv: RecyclerView
    private lateinit var input: EditText
    private lateinit var sendBtn: android.widget.ImageButton
    private lateinit var dictateBtn: android.widget.ImageButton
    private var micTest: MicTest? = null
    private var dictating = false
    private lateinit var adapter: ChatAdapter
    private lateinit var db: DbHelper
    private lateinit var brain: ChatBrain
    private var email: String = ""
    private var chatId: Long? = null
    private val uiHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var streamTask: Runnable? = null

    /** Cevabi cumle cumle akitir (diger AI'lar gibi), bitince onDone calisir. */
    private fun streamAnswer(full: String, onDone: () -> Unit) {
        try {
            streamTask?.let { uiHandler.removeCallbacks(it) }
        } catch (_: Exception) {}
        val sents = full.split(Regex("(?<=[.!?…])\\s+")).map { it.trim() }.filter { it.isNotBlank() }
        if (sents.size <= 1 && full.length < 120) {
            adapter.updateLast(full)
            scrollDown()
            onDone()
            return
        }
        val pieces = if (sents.isEmpty()) listOf(full) else sents
        var i = 0
        val shown = StringBuilder()
        var task: Runnable? = null
        task = Runnable {
            try {
                if (!isAdded) return@Runnable
                if (i < pieces.size) {
                    if (shown.isNotEmpty()) shown.append(' ')
                    shown.append(pieces[i])
                    i++
                    adapter.updateLast(shown.toString())
                    scrollDown()
                    streamTask?.let { uiHandler.postDelayed(it, 420) }
                } else {
                    onDone()
                }
            } catch (_: Exception) {
                try {
                    onDone()
                } catch (_: Exception) {}
            }
        }
        streamTask = task
        uiHandler.post(task)
    }

    override fun onDestroyView() {
        try {
            streamTask?.let { uiHandler.removeCallbacks(it) }
        } catch (_: Exception) {}
        super.onDestroyView()
    }

    override fun onCreateView(inflater: LayoutInflater, parent: ViewGroup?, state: Bundle?): View {
        return inflater.inflate(R.layout.fragment_text, parent, false)
    }

    override fun onViewCreated(v: View, state: Bundle?) {
        email = Prefs.sessionEmail(requireContext()) ?: ""
        db = DbHelper(requireContext())
        brain = ChatBrain(
            requireContext().applicationContext,
            AppLauncher(requireContext().applicationContext),
            Researcher(requireContext().applicationContext)
        )
        rv = v.findViewById(R.id.chatRv)
        input = v.findViewById(R.id.chatInput)
        sendBtn = v.findViewById(R.id.sendBtn)
        dictateBtn = v.findViewById(R.id.dictateBtn)
        adapter = ChatAdapter { url ->
            try {
                activity?.let { LinkGuard.onLink(it, url) }
            } catch (_: Exception) {}
        }
        rv.layoutManager = LinearLayoutManager(context).apply { stackFromEnd = true }
        rv.adapter = adapter

        sendBtn.setOnClickListener { send() }
        dictateBtn.setOnClickListener { dictate() }
        input.imeOptions = android.view.inputmethod.EditorInfo.IME_ACTION_SEND
        input.setOnEditorActionListener { _, actionId, _ ->
            if (actionId == android.view.inputmethod.EditorInfo.IME_ACTION_SEND) {
                send()
                true
            } else false
        }
        if (chatId == null) startNewChat() else loadChat(chatId!!)
    }

    fun startNewChat() {
        chatId = null
        if (::adapter.isInitialized) {
            adapter.setAll(
                listOf(
                    ChatAdapter.Item(
                        "ai",
                        "Merhaba! Ben Pollux, senin asistanın. Hesap yaparım, çeviri yaparım, sorularını yanıtlarım. \"Neler yapabilirsin\" yazarak başla."
                    )
                )
            )
            scrollDown()
        }
    }

    fun clearCurrent() {
        val id = chatId ?: return
        Thread {
            try { db.clearChat(id) } catch (_: Exception) {}
            activity?.runOnUiThread {
                adapter.setAll(emptyList())
                (activity as? MainActivity)?.refreshDrawer()
            }
        }.start()
    }

    fun loadChat(id: Long) {
        chatId = id
        Thread {
            val msgs = try { db.getMessages(id) } catch (_: Exception) { emptyList() }
            activity?.runOnUiThread {
                adapter.setAll(msgs.map { ChatAdapter.Item(it.role, it.text, fmtTime(it.createdAt)) })
                scrollDown()
            }
        }.start()
    }

    private fun fmtTime(ts: Long): String {
        return try {
            java.text.SimpleDateFormat("HH:mm", java.util.Locale("tr")).format(java.util.Date(ts))
        } catch (_: Exception) { "" }
    }

    private fun now(): String = fmtTime(System.currentTimeMillis())

    private fun scrollDown() {
        if (adapter.itemCount > 0) rv.scrollToPosition(adapter.itemCount - 1)
    }

    // ---- Cihaz komutlarını çalıştır ----

    private var pendingAction: ChatBrain.Action? = null

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
        if (androidx.core.content.ContextCompat.checkSelfPermission(
                requireContext(), android.Manifest.permission.CAMERA
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            pendingAction = if (on) ChatBrain.Action.FlashOn else ChatBrain.Action.FlashOff
            requestPermissions(arrayOf(android.Manifest.permission.CAMERA), 300)
            return
        }
        try {
            val cm = requireContext().getSystemService(android.content.Context.CAMERA_SERVICE) as android.hardware.camera2.CameraManager
            val id = cm.cameraIdList.firstOrNull() ?: return
            cm.setTorchMode(id, on)
        } catch (_: Exception) {}
    }

    override fun onRequestPermissionsResult(code: Int, perms: Array<out String>, res: IntArray) {
        if (code == 300 && res.isNotEmpty() && res[0] == android.content.pm.PackageManager.PERMISSION_GRANTED) {
            pendingAction?.let { runAction(it) }
        }
        pendingAction = null
    }

    private fun openSettings(action: String) {
        try {
            startActivity(android.content.Intent(action))
        } catch (_: Exception) {}
    }

    private fun openUrl(url: String) {
        try {
            startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, android.net.Uri.parse(url)))
        } catch (_: Exception) {}
    }

    /** Cevaptaki Linklerim adresini soru sormadan direkt açar (tek istisna). */
    private fun autoOpenDirect(text: String) {
        try {
            val urls = Regex("https?://[^\\s)\"'<>]+").findAll(text).map { it.value }.toList()
            for (u in urls) {
                if (LinkGuard.isDirect(u)) {
                    openUrl(LinkGuard.MY_LINKS)
                    break
                }
            }
        } catch (_: Exception) {}
    }

    private fun adjustVolume(dir: Int) {
        try {
            val am = requireContext().getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager
            am.adjustVolume(
                if (dir > 0) android.media.AudioManager.ADJUST_RAISE else android.media.AudioManager.ADJUST_LOWER,
                android.media.AudioManager.FLAG_SHOW_UI
            )
        } catch (_: Exception) {}
    }

    /** Mikrofona konuş, yazıya dökülsün. */
    private fun dictate() {
        if (dictating) {
            micTest?.cancel()
            return
        }
        if (androidx.core.content.ContextCompat.checkSelfPermission(
                requireContext(), android.Manifest.permission.RECORD_AUDIO
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(android.Manifest.permission.RECORD_AUDIO), 201)
            return
        }
        if (!ModelManager.isReady(requireContext())) {
            android.widget.Toast.makeText(context, "Ses modeli yok.", android.widget.Toast.LENGTH_SHORT).show()
            return
        }
        dictating = true
        android.widget.Toast.makeText(context, "Dinleniyor... konuş", android.widget.Toast.LENGTH_SHORT).show()
        val t = MicTest(ModelManager.modelDir(requireContext()))
        micTest = t
        t.run(15, object : MicTest.Listener {
            override fun onPartial(p: String) {}
            override fun onDone(finalText: String) {
                dictating = false
                activity?.runOnUiThread {
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

    private fun send() {        val text = input.text.toString().trim()
        if (text.isEmpty()) return
        input.setText("")
        Thread {
            var id = chatId
            if (id == null) {
                val title = if (text.length > 28) text.take(28) + "..." else text
                id = try { db.createChat(email, title) } catch (_: Exception) { -1 }
                if (id == -1L) return@Thread
                chatId = id
            }
            val cid = id
            try { db.addMessage(cid, "user", text) } catch (_: Exception) {}
            activity?.runOnUiThread {
                adapter.add(ChatAdapter.Item("user", text, now()))
                scrollDown()
                adapter.add(ChatAdapter.Item("ai", "..."))
                scrollDown()
            }
            brain.answer(text, allowApps = true) { ans ->
                try { db.addMessage(cid, "ai", ans.text) } catch (_: Exception) {}
                activity?.runOnUiThread {
                    streamAnswer(ans.text) {
                        autoOpenDirect(ans.text)
                        Thread {
                            val msgs = try { db.getMessages(cid) } catch (_: Exception) { emptyList() }
                            activity?.runOnUiThread {
                                adapter.setAll(msgs.map { ChatAdapter.Item(it.role, it.text, fmtTime(it.createdAt)) })
                                scrollDown()
                                (activity as? MainActivity)?.refreshDrawer()
                                ans.action?.let { runAction(it) }
                            }
                        }.start()
                    }
                }
            }
        }.start()
    }
}
