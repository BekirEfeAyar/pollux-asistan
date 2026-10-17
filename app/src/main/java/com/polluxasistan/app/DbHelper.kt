package com.polluxasistan.app

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Yerel veritabanı: kullanıcılar, sohbetler, mesajlar.
 * NOT: Veriler BU TELEFONDA tutulur. Başka telefonlardaki soruları
 * görebilmek için sunucu (örn. Firebase) gerekir; moderatör paneli
 * bu cihazdaki kayıtları gösterir.
 */
class DbHelper(ctx: Context) : SQLiteOpenHelper(ctx, "asistan.db", null, 2) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL("CREATE TABLE users(email TEXT PRIMARY KEY, name TEXT, created_at INTEGER, password_hash TEXT DEFAULT '')")
        db.execSQL("CREATE TABLE chats(id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT, title TEXT, created_at INTEGER)")
        db.execSQL("CREATE TABLE messages(id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id INTEGER, role TEXT, text TEXT, created_at INTEGER)")
        db.execSQL("CREATE INDEX idx_msg_chat ON messages(chat_id)")
        db.execSQL("CREATE INDEX idx_chat_email ON chats(email)")
    }

    override fun onUpgrade(db: SQLiteDatabase, old: Int, cur: Int) {
        if (old < 2) {
            try {
                db.execSQL("ALTER TABLE users ADD COLUMN password_hash TEXT DEFAULT ''")
            } catch (_: Exception) {}
        }
    }

    data class Chat(val id: Long, val email: String, val title: String, val createdAt: Long)
    data class Msg(val id: Long, val chatId: Long, val role: String, val text: String, val createdAt: Long)
    data class UserRow(val email: String, val name: String, val createdAt: Long, val questionCount: Int)
    data class Question(val email: String, val text: String, val createdAt: Long)

    fun upsertUser(email: String, name: String) {
        val db = writableDatabase
        val cv = ContentValues().apply {
            put("email", email); put("name", name); put("created_at", System.currentTimeMillis())
        }
        db.insertWithOnConflict("users", null, cv, SQLiteDatabase.CONFLICT_IGNORE)
        db.execSQL("UPDATE users SET name=? WHERE email=?", arrayOf(name, email))
    }

    /** Kayıtlı şifre özeti (yoksa null). Şifreler açık yazılmaz, SHA-256 tutulur. */
    fun getPassHash(email: String): String? {
        readableDatabase.rawQuery("SELECT password_hash FROM users WHERE email=?", arrayOf(email)).use {
            if (!it.moveToFirst()) return null
            val h = it.getString(0) ?: ""
            return h.ifBlank { null }
        }
    }

    fun userExists(email: String): Boolean {
        readableDatabase.rawQuery("SELECT 1 FROM users WHERE email=?", arrayOf(email)).use {
            return it.moveToFirst()
        }
    }

    fun createUserWithPass(email: String, name: String, passHash: String) {
        val cv = ContentValues().apply {
            put("email", email); put("name", name)
            put("created_at", System.currentTimeMillis()); put("password_hash", passHash)
        }
        writableDatabase.insertWithOnConflict("users", null, cv, SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun setPassHash(email: String, passHash: String) {
        writableDatabase.execSQL("UPDATE users SET password_hash=? WHERE email=?", arrayOf(passHash, email))
    }

    fun getUserName(email: String): String {
        readableDatabase.rawQuery("SELECT name FROM users WHERE email=?", arrayOf(email)).use {
            return if (it.moveToFirst()) it.getString(0) else email
        }
    }

    fun createChat(email: String, title: String): Long {
        val cv = ContentValues().apply {
            put("email", email); put("title", title); put("created_at", System.currentTimeMillis())
        }
        return writableDatabase.insert("chats", null, cv)
    }

    fun addMessage(chatId: Long, role: String, text: String) {
        val cv = ContentValues().apply {
            put("chat_id", chatId); put("role", role); put("text", text)
            put("created_at", System.currentTimeMillis())
        }
        writableDatabase.insert("messages", null, cv)
    }

    fun getChats(email: String): List<Chat> {
        val out = mutableListOf<Chat>()
        readableDatabase.rawQuery(
            "SELECT id, email, title, created_at FROM chats WHERE email=? ORDER BY created_at DESC",
            arrayOf(email)
        ).use {
            while (it.moveToNext()) {
                out.add(Chat(it.getLong(0), it.getString(1), it.getString(2), it.getLong(3)))
            }
        }
        return out
    }

    fun getMessages(chatId: Long): List<Msg> {
        val out = mutableListOf<Msg>()
        readableDatabase.rawQuery(
            "SELECT id, chat_id, role, text, created_at FROM messages WHERE chat_id=? ORDER BY id ASC",
            arrayOf(chatId.toString())
        ).use {
            while (it.moveToNext()) {
                out.add(Msg(it.getLong(0), it.getLong(1), it.getString(2), it.getString(3), it.getLong(4)))
            }
        }
        return out
    }

    fun deleteChat(chatId: Long) {
        writableDatabase.delete("messages", "chat_id=?", arrayOf(chatId.toString()))
        writableDatabase.delete("chats", "id=?", arrayOf(chatId.toString()))
    }

    fun clearChat(chatId: Long) {
        writableDatabase.delete("messages", "chat_id=?", arrayOf(chatId.toString()))
    }

    // ---- Moderatör ----

    fun userCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM users", null).use {
            return if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    fun questionCount(): Int {
        readableDatabase.rawQuery("SELECT COUNT(*) FROM messages WHERE role='user'", null).use {
            return if (it.moveToFirst()) it.getInt(0) else 0
        }
    }

    fun allUsers(): List<UserRow> {
        val out = mutableListOf<UserRow>()
        readableDatabase.rawQuery(
            """SELECT u.email, u.name, u.created_at,
               (SELECT COUNT(*) FROM messages m JOIN chats c ON m.chat_id=c.id
                WHERE c.email=u.email AND m.role='user') AS qc
               FROM users u ORDER BY u.created_at DESC""", null
        ).use {
            while (it.moveToNext()) {
                out.add(UserRow(it.getString(0), it.getString(1), it.getLong(2), it.getInt(3)))
            }
        }
        return out
    }

    fun recentQuestions(limit: Int = 100): List<Question> {
        val out = mutableListOf<Question>()
        readableDatabase.rawQuery(
            """SELECT c.email, m.text, m.created_at FROM messages m
               JOIN chats c ON m.chat_id=c.id
               WHERE m.role='user' ORDER BY m.id DESC LIMIT $limit""", null
        ).use {
            while (it.moveToNext()) {
                out.add(Question(it.getString(0), it.getString(1), it.getLong(2)))
            }
        }
        return out
    }
}
