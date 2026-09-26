package com.polluxasistan.app

import android.content.Intent
import android.os.Bundle
import android.util.Patterns
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import java.security.MessageDigest

/**
 * E-posta + şifre ile giriş. Şifre SHA-256 özetiyle veritabanında tutulur.
 * E-posta kayıtlı değilse ilk girişte hesap otomatik açılır.
 */
class LoginActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        ThemeHelper.apply(this)
        super.onCreate(savedInstanceState)
        Thread { Prefs.ensureSeedAccount(this) }.start()
        if (Prefs.sessionEmail(this) != null) {
            goMain()
            return
        }
        setContentView(R.layout.activity_login)

        val mailEdit: EditText = findViewById(R.id.mailEdit)
        val nameEdit: EditText = findViewById(R.id.nameEdit)
        val passEdit: EditText = findViewById(R.id.passEdit)
        val loginBtn: Button = findViewById(R.id.loginBtn)
        val infoText: TextView = findViewById(R.id.loginInfo)
        val passToggle: TextView = findViewById(R.id.passToggle)
        val registerBtn: Button = findViewById(R.id.registerBtn)

        var passShown = false
        passToggle.setOnClickListener {
            passShown = !passShown
            val pos = passEdit.selectionStart
            passEdit.inputType = if (passShown) {
                android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD
            } else {
                android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
            passToggle.text = if (passShown) "Gizle" else "Göster"
            try { passEdit.setSelection(pos.coerceIn(0, passEdit.text.length)) } catch (_: Exception) {}
        }

        loginBtn.setOnClickListener { doAuth(register = false, mailEdit, nameEdit, passEdit) }
        registerBtn.setOnClickListener { doAuth(register = true, mailEdit, nameEdit, passEdit) }
        infoText.text = "Hesabın yoksa önce Hesap Aç."
    }

    private fun doAuth(
        register: Boolean,
        mailEdit: EditText,
        nameEdit: EditText,
        passEdit: EditText
    ) {
        val mail = mailEdit.text.toString().trim().lowercase()
        val name = nameEdit.text.toString().trim()
        val pass = passEdit.text.toString()
        if (!Patterns.EMAIL_ADDRESS.matcher(mail).matches()) {
            Toast.makeText(this, "Geçerli bir e-posta yaz.", Toast.LENGTH_LONG).show()
            return
        }
        if (pass.length < 4) {
            Toast.makeText(this, "Şifre en az 4 karakter olmalı.", Toast.LENGTH_LONG).show()
            return
        }
        if (name.length < 2) {
            Toast.makeText(this, "Adını yaz.", Toast.LENGTH_LONG).show()
            return
        }
        Thread {
            try {
                val db = DbHelper(this)
                val hash = Prefs.sha256(pass)
                val exists = try { db.userExists(mail) } catch (_: Exception) { false }
                val stored = try { db.getPassHash(mail) } catch (_: Exception) { null }
                val result: String = when {
                    register && exists -> "taken"
                    register -> {
                        db.createUserWithPass(mail, name, hash)
                        "new"
                    }
                    !exists -> "missing"
                    stored == null -> {
                        // Eski şifresiz kayda şifre tanımla
                        db.setPassHash(mail, hash)
                        db.upsertUser(mail, name)
                        "ok"
                    }
                    stored == hash -> {
                        db.upsertUser(mail, name)
                        "ok"
                    }
                    else -> "wrong"
                }
                runOnUiThread {
                    when (result) {
                        "taken" -> Toast.makeText(
                            this, "Bu e-posta kayıtlı. Giriş Yap'a bas.", Toast.LENGTH_LONG
                        ).show()
                        "missing" -> Toast.makeText(
                            this, "Hesap bulunamadı. Önce Hesap Aç.", Toast.LENGTH_LONG
                        ).show()
                        "wrong" -> Toast.makeText(
                            this, "Şifre yanlış. Tekrar dene.", Toast.LENGTH_LONG
                        ).show()
                        "new" -> {
                            Prefs.login(this, mail, name)
                            Toast.makeText(this, "Hesabın açıldı, hoş geldin $name!", Toast.LENGTH_SHORT).show()
                            goMain()
                        }
                        else -> {
                            Prefs.login(this, mail, name)
                            Toast.makeText(this, "Hoş geldin, $name!", Toast.LENGTH_SHORT).show()
                            goMain()
                        }
                    }
                }
            } catch (e: Exception) {
                runOnUiThread {
                    Toast.makeText(this, "İşlem başarısız: ${e.message}", Toast.LENGTH_LONG).show()
                }
            }
        }.start()
    }

    private fun goMain() {
        startActivity(Intent(this, MainActivity::class.java))
        try { overridePendingTransition(R.anim.fade_in, R.anim.fade_out) } catch (_: Exception) {}
        finish()
    }
}
