package com.polluxasistan.app

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import java.util.Locale

/**
 * Sesli Konuşma sekmesi: uyandırma YOK, butona bas-konuş.
 * Sadece sesli sohbet + araştırma (uygulama açma yok).
 */
class VoiceFragment : Fragment(), TextToSpeech.OnInitListener {

    private lateinit var rv: RecyclerView
    private lateinit var micBtn: android.widget.ImageButton
    private lateinit var statusText: TextView
    private lateinit var setupRow: View
    private lateinit var setupStatus: TextView
    private lateinit var setupBtn: Button
    private lateinit var autoBox: android.widget.CheckBox
    private lateinit var adapter: ChatAdapter
    private lateinit var brain: ChatBrain
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var listening = false
    private var micPulse: android.animation.ObjectAnimator? = null
    private val uiHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private var streamTask: Runnable? = null

    /** Cevabi cumle cumle akitir, bitince onDone calisir. */
    private fun streamAnswer(full: String, onDone: () -> Unit) {
        try {
            streamTask?.let { uiHandler.removeCallbacks(it) }
        } catch (_: Exception) {}
        val sents = full.split(Regex("(?<=[.!?…])\\s+")).map { it.trim() }.filter { it.isNotBlank() }
        if (sents.size <= 1 && full.length < 120) {
            try {
                adapter.updateLast(full)
                scrollDown()
            } catch (_: Exception) {}
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

    /** Dinlerken mikrofon düğmesi yumuşakça büyüyüp küçülür. */
    private fun startMicPulse() {
        try {
            stopMicPulse()
            micPulse = android.animation.ObjectAnimator.ofPropertyValuesHolder(
                micBtn,
                android.animation.PropertyValuesHolder.ofFloat(View.SCALE_X, 1f, 1.12f),
                android.animation.PropertyValuesHolder.ofFloat(View.SCALE_Y, 1f, 1.12f)
            ).apply {
                duration = 550
                repeatCount = android.animation.ObjectAnimator.INFINITE
                repeatMode = android.animation.ObjectAnimator.REVERSE
                interpolator = android.view.animation.AccelerateDecelerateInterpolator()
                start()
            }
        } catch (_: Exception) {}
    }

    private fun stopMicPulse() {
        try {
            micPulse?.cancel()
            micPulse = null
            micBtn.scaleX = 1f
            micBtn.scaleY = 1f
        } catch (_: Exception) {}
    }

    /** Boşta: tema rengine bürünmüş mikrofon; dinlerken: altın zeminde beyaz. */
    private fun setMicIdle() {
        try {
            micBtn.setBackgroundResource(R.drawable.btn_mic_off)
            micBtn.setImageResource(R.drawable.ic_mic)
            micBtn.imageTintList = android.content.res.ColorStateList.valueOf(
                ContextCompat.getColor(requireContext(), R.color.ink)
            )
        } catch (_: Exception) {}
    }

    private fun setMicLive() {
        try {
            micBtn.setBackgroundResource(R.drawable.btn_mic)
            micBtn.setImageResource(R.drawable.ic_mic_white)
            micBtn.imageTintList = null
        } catch (_: Exception) {}
    }
    private var micTest: MicTest? = null
    private var downloading = false

    override fun onCreateView(inflater: LayoutInflater, parent: ViewGroup?, state: Bundle?): View {
        return inflater.inflate(R.layout.fragment_voice, parent, false)
    }

    override fun onViewCreated(v: View, state: Bundle?) {
        rv = v.findViewById(R.id.voiceRv)
        micBtn = v.findViewById(R.id.voiceMicBtn)
        statusText = v.findViewById(R.id.voiceStatus)
        setupRow = v.findViewById(R.id.setupRow)
        setupStatus = v.findViewById(R.id.setupStatus)
        setupBtn = v.findViewById(R.id.setupBtn)
        autoBox = v.findViewById(R.id.autoBox)
        adapter = ChatAdapter { url ->
            try {
                activity?.let { LinkGuard.onLink(it, url) }
            } catch (_: Exception) {}
        }
        rv.layoutManager = LinearLayoutManager(context).apply { stackFromEnd = true }
        rv.adapter = adapter
        brain = ChatBrain(
            requireContext().applicationContext,
            AppLauncher(requireContext().applicationContext),
            Researcher(requireContext().applicationContext)
        )
        tts = TextToSpeech(context, this)
        micBtn.setOnClickListener { onMic() }
        setupBtn.setOnClickListener { downloadModel() }
        refreshSetupRow()
    }

    override fun onResume() {
        super.onResume()
        refreshSetupRow()
    }

    private fun refreshSetupRow() {
        try {
            setupRow.visibility =
                if (ModelManager.isReady(requireContext())) View.GONE else View.VISIBLE
        } catch (_: Exception) {}
    }

    private fun downloadModel() {
        if (downloading) return
        downloading = true
        setupBtn.isEnabled = false
        setupStatus.text = "İndiriliyor..."
        Thread {
            try {
                ModelManager.downloadAndInstall(requireContext()) { pct, msg ->
                    activity?.runOnUiThread { setupStatus.text = "$msg (%$pct)" }
                }
                activity?.runOnUiThread {
                    downloading = false
                    setupBtn.isEnabled = true
                    setupStatus.text = "Hazır"
                    refreshSetupRow()
                }
            } catch (e: Exception) {
                activity?.runOnUiThread {
                    downloading = false
                    setupBtn.isEnabled = true
                    setupStatus.text = "Hata: ${e.message?.take(200)}"
                }
            }
        }.start()
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            tts?.language = Locale("tr", "TR")
            ttsReady = true
        }
    }

    override fun onDestroyView() {
        try { micTest?.cancel() } catch (_: Exception) {}
        try { tts?.shutdown() } catch (_: Exception) {}
        tts = null
        try {
            streamTask?.let { uiHandler.removeCallbacks(it) }
        } catch (_: Exception) {}
        super.onDestroyView()
    }

    private fun scrollDown() {
        if (adapter.itemCount > 0) rv.scrollToPosition(adapter.itemCount - 1)
    }

    private fun now(): String {
        return try {
            java.text.SimpleDateFormat("HH:mm", java.util.Locale("tr")).format(java.util.Date())
        } catch (_: Exception) { "" }
    }

    private fun speak(text: String) {
        try {
            if (ttsReady) {
                tts?.setOnUtteranceProgressListener(object : android.speech.tts.UtteranceProgressListener() {
                    override fun onStart(id: String?) {}
                    override fun onError(id: String?) {}
                    override fun onDone(id: String?) {
                        activity?.runOnUiThread {
                            try {
                                if (isAdded && autoBox.isChecked && !listening) onMic()
                            } catch (_: Exception) {}
                        }
                    }
                })
                tts?.speak(text.take(600), TextToSpeech.QUEUE_FLUSH, null, "voice")
            }
        } catch (_: Exception) {}
    }

    private fun onMic() {
        if (listening) {
            micTest?.cancel()
            stopMicPulse()
            return
        }
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.RECORD_AUDIO) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            Toast.makeText(context, "Mikrofon izni gerekli.", Toast.LENGTH_SHORT).show()
            requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 200)
            return
        }
        if (!ModelManager.isReady(requireContext())) {
            Toast.makeText(context, "Önce aşağıdaki Modeli Kur düğmesine bas.", Toast.LENGTH_LONG).show()
            return
        }
        listening = true
        try { tts?.stop() } catch (_: Exception) {}
        setMicLive()
        startMicPulse()
        statusText.text = "Dinleniyor... konuş"
        val t = MicTest(ModelManager.modelDir(requireContext()))
        micTest = t
        t.run(20, object : MicTest.Listener {
            override fun onPartial(p: String) {
                activity?.runOnUiThread { statusText.text = "...$p" }
            }
            override fun onDone(finalText: String) {
                listening = false
                stopMicPulse()
                activity?.runOnUiThread {
                    setMicIdle()
                    if (finalText.isBlank()) {
                        statusText.text = "Duyamadım, tekrar bas ve konuş"
                    } else {
                        statusText.text = "Bas ve konuş"
                        val t = now()
                        adapter.add(ChatAdapter.Item("user", finalText, t))
                        scrollDown()
                        statusText.text = "Düşünüyor..."
                        brain.answer(finalText, allowApps = false) { ans ->
                            activity?.runOnUiThread {
                                adapter.add(ChatAdapter.Item("ai", "...", now()))
                                scrollDown()
                                streamAnswer(ans.text) {
                                    statusText.text = "Bas ve konuş"
                                }
                            }
                            speak(ans.text)
                        }
                    }
                }
            }
            override fun onError(e: Exception) {
                listening = false
                stopMicPulse()
                activity?.runOnUiThread {
                    setMicIdle()
                    statusText.text = "Hata: ${e.message}"
                }
            }
        })
    }
}
