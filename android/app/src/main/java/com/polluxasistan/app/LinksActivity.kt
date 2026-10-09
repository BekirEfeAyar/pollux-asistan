package com.polluxasistan.app

import android.os.Bundle
import android.text.TextUtils
import android.view.View
import android.widget.EditText
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

/** Kısayollarım: kullanıcının kendi bağlantı listesi. */
class LinksActivity : AppCompatActivity() {

    private lateinit var list: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeHelper.apply(this)
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_links)
        list = findViewById(R.id.list)
        findViewById<ImageButton>(R.id.addBtn).setOnClickListener { showAdd() }
        refresh()
    }

    override fun onResume() {
        super.onResume()
        refresh()
    }

    private fun refresh() {
        list.removeAllViews()
        val links = try { LinkStore.all(this) } catch (_: Exception) { emptyList() }
        if (links.isEmpty()) {
            val t = TextView(this)
            t.text = getString(R.string.links_empty)
            t.setTextColor(ContextCompat.getColor(this, R.color.soluk))
            t.textSize = 13f
            list.addView(t)
            return
        }
        val d = resources.displayMetrics.density
        links.forEachIndexed { i, l ->
            val row = LinearLayout(this)
            row.orientation = LinearLayout.VERTICAL
            row.setPadding(0, (12 * d).toInt(), 0, (12 * d).toInt())
            row.isClickable = true
            row.isFocusable = true
            val title = TextView(this)
            title.text = l.title
            title.setTextColor(ContextCompat.getColor(this, R.color.murekkep))
            title.textSize = 15f
            title.setTypeface(title.typeface, android.graphics.Typeface.BOLD)
            val url = TextView(this)
            url.text = l.url
            url.setTextColor(ContextCompat.getColor(this, R.color.soluk))
            url.textSize = 13f
            url.maxLines = 1
            url.ellipsize = TextUtils.TruncateAt.END
            row.addView(title)
            row.addView(url)
            val div = View(this)
            div.setBackgroundColor(ContextCompat.getColor(this, R.color.cizgi))
            list.addView(row)
            list.addView(div, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, (1 * d).toInt()))
            row.setOnClickListener {
                try {
                    LinkGuard.onLink(this, l.url)
                } catch (_: Exception) {}
            }
            row.setOnLongClickListener {
                AlertDialog.Builder(this)
                    .setMessage(l.title)
                    .setPositiveButton(R.string.delete) { _, _ ->
                        LinkStore.remove(this, i)
                        Toast.makeText(this, R.string.links_deleted, Toast.LENGTH_SHORT).show()
                        refresh()
                    }
                    .setNegativeButton(R.string.cancel, null)
                    .show()
                true
            }
        }
    }

    private fun showAdd() {
        // İki alanlı küçük form
        val box = LinearLayout(this)
        box.orientation = LinearLayout.VERTICAL
        val pad = (20 * resources.displayMetrics.density).toInt()
        box.setPadding(pad, (8 * resources.displayMetrics.density).toInt(), pad, 0)
        val nameEt = EditText(this)
        nameEt.hint = getString(R.string.links_name_hint)
        val urlEt = EditText(this)
        urlEt.hint = getString(R.string.links_url_hint)
        box.addView(nameEt)
        box.addView(urlEt)
        AlertDialog.Builder(this)
            .setTitle(R.string.links_add)
            .setView(box)
            .setPositiveButton(R.string.links_add) { _, _ ->
                val t = nameEt.text.toString().trim()
                val u = urlEt.text.toString().trim()
                if (t.isBlank() || !LinkStore.add(this, t, u)) {
                    Toast.makeText(this, R.string.links_bad_url, Toast.LENGTH_LONG).show()
                } else {
                    Toast.makeText(this, R.string.links_saved, Toast.LENGTH_SHORT).show()
                    refresh()
                }
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }
}
