package com.polluxasistan.app

import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.ListView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Moderatör paneli: SADECE Prefs.MODERATOR_EMAIL görebilir.
 * Bu cihazdaki kullanıcıları ve sorulan soruları gösterir.
 */
class DashboardActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeHelper.apply(this)
        super.onCreate(savedInstanceState)
        if (!Prefs.isModerator(this)) {
            Toast.makeText(this, "Yetkin yok.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }
        setContentView(R.layout.activity_dashboard)

        val statsText: TextView = findViewById(R.id.statsText)
        val usersList: ListView = findViewById(R.id.usersList)
        val questionsList: ListView = findViewById(R.id.questionsList)

        Thread {
            val db = DbHelper(this)
            val users = try { db.allUsers() } catch (_: Exception) { emptyList() }
            val questions = try { db.recentQuestions(200) } catch (_: Exception) { emptyList() }
            val uc = try { db.userCount() } catch (_: Exception) { 0 }
            val qc = try { db.questionCount() } catch (_: Exception) { 0 }
            val fmt = SimpleDateFormat("d MMM HH:mm", Locale("tr"))
            runOnUiThread {
                statsText.text = "Kullanıcı: $uc • Sorulan soru: $qc"
                usersList.adapter = ArrayAdapter(
                    this, android.R.layout.simple_list_item_2, android.R.id.text1,
                    users.map { "${it.name} (${it.email})\n${it.questionCount} soru • ${fmt.format(Date(it.createdAt))}" }
                )
                val allQ = questions
                fun showQs(list: List<DbHelper.Question>) {
                    questionsList.adapter = ArrayAdapter(
                        this, android.R.layout.simple_list_item_2, android.R.id.text1,
                        list.map { "${it.email}\n\"${it.text.take(120)}\" • ${fmt.format(Date(it.createdAt))}" }
                    )
                }
                showQs(allQ)
                usersList.setOnItemClickListener { _, _, pos, _ ->
                    val mail = users[pos].email
                    showQs(allQ.filter { it.email == mail })
                    Toast.makeText(this, "$mail soruları süzüldü", Toast.LENGTH_SHORT).show()
                }
                questionsList.setOnItemClickListener { _, _, _, _ -> showQs(allQ) }
            }
        }.start()
    }
}
