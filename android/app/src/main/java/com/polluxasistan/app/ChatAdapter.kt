package com.polluxasistan.app

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

/** ChatGPT tarzı mesaj listesi: kullanıcı sağ balon, asistan düz metin. */
class ChatAdapter(private val onLink: ((String) -> Unit)? = null) : RecyclerView.Adapter<ChatAdapter.Holder>() {

    data class Item(val role: String, val text: String, val time: String = "")

    private val items = mutableListOf<Item>()
    private var animNextAdd = false

    class Holder(v: View) : RecyclerView.ViewHolder(v) {
        val body: TextView = v.findViewById(R.id.msgText)
        val time: TextView? = v.findViewById(R.id.msgTime)
    }

    override fun getItemViewType(pos: Int): Int =
        if (items[pos].role == "user") 1 else 0

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): Holder {
        val layout = if (viewType == 1) R.layout.item_msg_user else R.layout.item_msg_ai
        return Holder(LayoutInflater.from(parent.context).inflate(layout, parent, false))
    }

    override fun onBindViewHolder(h: Holder, pos: Int) {
        h.body.text = items[pos].text
        h.time?.text = items[pos].time
        h.time?.visibility = if (items[pos].time.isBlank()) View.GONE else View.VISIBLE
        // Bağlantılar uyarılı açılır
        try {
            val cb = onLink
            if (cb != null) LinkGuard.linkify(h.body, cb)
        } catch (_: Exception) {}
        // Yeni gelen mesaja yumuşak giriş efekti (hafif yüksel + belir)
        if (animNextAdd && pos == items.size - 1) {
            animNextAdd = false
            try {
                h.itemView.alpha = 0f
                h.itemView.translationY = 32f
                h.itemView.animate()
                    .alpha(1f).translationY(0f)
                    .setDuration(280)
                    .setInterpolator(android.view.animation.DecelerateInterpolator(1.5f))
                    .start()
            } catch (_: Exception) {}
        } else {
            h.itemView.alpha = 1f
            h.itemView.translationY = 0f
        }
        h.itemView.setOnLongClickListener {
            try {
                val cm = h.itemView.context.getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
                cm.setPrimaryClip(android.content.ClipData.newPlainText("mesaj", items[h.bindingAdapterPosition].text))
                android.widget.Toast.makeText(h.itemView.context, "Kopyalandı", android.widget.Toast.LENGTH_SHORT).show()
            } catch (_: Exception) {}
            true
        }
    }

    override fun getItemCount(): Int = items.size

    /** Son baloncuğu günceller (akıcı yazma için). */
    fun updateLast(text: String) {
        if (items.isNotEmpty() && items[items.size - 1].role == "ai") {
            items[items.size - 1] = items[items.size - 1].copy(text = text)
            notifyItemChanged(items.size - 1)
        }
    }

    fun setAll(list: List<Item>) {
        items.clear()
        items.addAll(list)
        animNextAdd = false
        notifyDataSetChanged()
    }

    fun add(item: Item) {
        items.add(item)
        animNextAdd = true
        notifyItemInserted(items.size - 1)
    }
}
