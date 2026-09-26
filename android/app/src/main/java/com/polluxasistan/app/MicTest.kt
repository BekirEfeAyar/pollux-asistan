package com.polluxasistan.app

import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Handler
import android.os.Looper
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File

/**
 * Canlı mikrofon testi: 6 saniye dinler, duyduğunu ham metin olarak gösterir.
 * Servis çalışırken mikrofon çakışır, o yüzden test öncesi servis durdurulur.
 */
class MicTest(private val modelDir: File) {

    interface Listener {
        fun onPartial(t: String)
        fun onDone(finalText: String)
        fun onError(e: Exception)
    }

    @Volatile private var running = false

    fun isRunning(): Boolean = running

    fun run(seconds: Int, listener: Listener) {
        if (running) {
            listener.onError(Exception("Test zaten çalışıyor."))
            return
        }
        Thread {
            var audio: AudioRecord? = null
            var recognizer: Recognizer? = null
            var model: Model? = null
            val main = Handler(Looper.getMainLooper())
            fun post(fn: () -> Unit) = main.post { try { fn() } catch (_: Exception) {} }
            try {
                running = true
                model = Model(modelDir.absolutePath)
                recognizer = Recognizer(model, 16000.0f)
                val minBuf = AudioRecord.getMinBufferSize(
                    16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT
                )
                if (minBuf <= 0) throw Exception("Mikrofon açılamadı.")
                val format = AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(16000)
                    .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                    .build()
                audio = AudioRecord.Builder()
                    .setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                    .setAudioFormat(format)
                    .setBufferSizeInBytes(minBuf * 4)
                    .build()
                if (audio.state != AudioRecord.STATE_INITIALIZED) throw Exception("Mikrofon açılamadı.")
                audio.startRecording()
                try {
                    val sid = audio.audioSessionId
                    if (NoiseSuppressor.isAvailable()) {
                        try { NoiseSuppressor.create(sid)?.enabled = true } catch (_: Exception) {}
                    }
                    if (AutomaticGainControl.isAvailable()) {
                        try { AutomaticGainControl.create(sid)?.enabled = true } catch (_: Exception) {}
                    }
                } catch (_: Exception) {}
                val buf = ShortArray(2048)
                val endAt = System.currentTimeMillis() + seconds * 1000L
                var last = ""
                while (running && System.currentTimeMillis() < endAt) {
                    val n = try { audio.read(buf, 0, buf.size) } catch (_: Exception) { -1 }
                    if (n <= 0) continue
                    val isFinal = try { recognizer.acceptWaveForm(buf, n) } catch (_: Exception) { false }
                    if (isFinal) {
                        last = extractText(recognizer.result)
                        if (last.isNotBlank()) break
                    } else {
                        val p = extractText(recognizer.partialResult)
                        if (p.isNotBlank() && p != last) {
                            last = p
                            val snapshot = p
                            post { listener.onPartial(snapshot) }
                        }
                    }
                }
                val fin = try { extractText(recognizer.finalResult) } catch (_: Exception) { "" }
                val out = fin.ifBlank { last }
                post { listener.onDone(out) }
            } catch (e: SecurityException) {
                post { listener.onError(Exception("Mikrofon izni yok.")) }
            } catch (e: Exception) {
                post { listener.onError(e) }
            } finally {
                running = false
                try { audio?.stop() } catch (_: Exception) {}
                try { audio?.release() } catch (_: Exception) {}
                try { recognizer?.close() } catch (_: Exception) {}
                try { model?.close() } catch (_: Exception) {}
            }
        }.start()
    }

    fun cancel() { running = false }

    private fun extractText(json: String?): String {
        if (json.isNullOrBlank()) return ""
        return try {
            var i = json.indexOf("\"text\"")
            if (i < 0) i = json.indexOf("\"partial\"")
            if (i < 0) return ""
            val colon = json.indexOf(":", i)
            val q1 = json.indexOf("\"", colon)
            val q2 = json.indexOf("\"", q1 + 1)
            if (q1 < 0 || q2 < 0) "" else json.substring(q1 + 1, q2)
        } catch (_: Exception) { "" }
    }
}
