/**
 * handler.js
 * Handler utama untuk memproses pesan masuk dari WhatsApp.
 * Flow: Deteksi link TikTok → Download → Kompres → Kirim
 */

const { extractTikTokUrl } = require('./detector');
const { downloadTikTok, cleanupFile } = require('./downloader');
const { compressVideo } = require('./compressor');
const { sendVideo, sendText, sendReaction } = require('./sender');
const fs = require('fs');

// Anti-flood: tracking user yang sedang dalam proses
const processingUsers = new Set();
// Cooldown per user (ms)
const USER_COOLDOWN_MS = 15000; // 15 detik
const userLastRequest = new Map();

/**
 * Cek apakah user sedang dalam cooldown.
 * @param {string} userId
 * @returns {number} Sisa cooldown dalam detik (0 jika tidak ada)
 */
function checkCooldown(userId) {
  const lastTime = userLastRequest.get(userId);
  if (!lastTime) return 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed < USER_COOLDOWN_MS) {
    return Math.ceil((USER_COOLDOWN_MS - elapsed) / 1000);
  }
  return 0;
}

/**
 * Handler utama pesan masuk.
 * @param {Object} sock - Baileys socket instance
 * @param {Object} message - Object pesan dari Baileys
 */
async function handleMessage(sock, message) {
  try {
    // Ambil data pesan
    const jid = message.key.remoteJid;
    const isFromMe = message.key.fromMe;
    const msgType = Object.keys(message.message || {})[0];

    // Abaikan pesan dari bot sendiri
    if (isFromMe) return;
    // Abaikan pesan sistem/protokol
    if (!msgType || msgType === 'protocolMessage' || msgType === 'senderKeyDistributionMessage') return;

    // Ekstrak teks pesan
    let msgText = '';
    if (msgType === 'conversation') {
      msgText = message.message.conversation;
    } else if (msgType === 'extendedTextMessage') {
      msgText = message.message.extendedTextMessage?.text || '';
    } else if (msgType === 'imageMessage') {
      msgText = message.message.imageMessage?.caption || '';
    } else {
      return; // Abaikan tipe pesan lain
    }

    const trimmed = msgText.trim().toLowerCase();
    console.log(`[Handler] 📥 Pesan masuk dari ${jid} | type: ${msgType} | isi: "${msgText.slice(0, 80)}"`);

    // ── Command /test & /ping ─────────────────────────────────────────────
    if (trimmed === '/test' || trimmed === '/ping') {
      console.log(`[Handler] 🔧 Command ${trimmed} dari ${jid}`);
      try {
        const res = await sock.sendMessage(jid, {
          text: `✅ *Bot Aktif!*\n\n🤖 Bot WA TikTok Downloader\n📱 JID kamu: ${jid}\n⏱️ Server time: ${new Date().toISOString()}\n\nKirim link TikTok untuk download video!`,
        }, { quoted: message });
        console.log(`[Handler] ✅ Reply /test berhasil! MsgID: ${res?.key?.id}`);
      } catch (e) {
        console.error(`[Handler] ❌ Gagal reply /test: ${e.message}`);
      }
      return;
    }

    // Cek apakah ada link TikTok
    const tiktokUrl = extractTikTokUrl(msgText);
    if (!tiktokUrl) return;

    console.log(`[Handler] 📩 Link TikTok diterima dari ${jid}: ${tiktokUrl}`);

    // Identifikasi pengirim
    const senderId = message.key.participant || jid;

    // Anti-flood: cek cooldown
    const cooldownSec = checkCooldown(senderId);
    if (cooldownSec > 0) {
      await sendText(sock, jid,
        `⏳ Tunggu ${cooldownSec} detik lagi sebelum request berikutnya.`,
        { quoted: message }
      );
      return;
    }

    // Anti-flood: cek apakah user sedang diproses
    if (processingUsers.has(senderId)) {
      await sendText(sock, jid,
        `⚙️ Request sebelumnya masih diproses. Sabar ya!`,
        { quoted: message }
      );
      return;
    }

    // Tandai user sedang diproses
    processingUsers.add(senderId);
    userLastRequest.set(senderId, Date.now());

    // Kirim reaksi ⏳ sebagai tanda proses dimulai
    await sendReaction(sock, jid, message, '⏳');

    // Kirim pesan loading
    await sendText(sock, jid,
      `⬇️ Sedang mengunduh video TikTok...\n_Mohon tunggu sebentar_`,
      { quoted: message }
    );

    let downloadResult = null;
    let compressResult = null;

    try {
      // ===== STEP 1: DOWNLOAD =====
      downloadResult = await downloadTikTok(tiktokUrl);
      console.log(`[Handler] ✅ Download selesai: ${downloadResult.filePath}`);

      // ===== STEP 2: KOMPRES =====
      await sendText(sock, jid, `🔄 Sedang mengompresi video...`);
      compressResult = await compressVideo(downloadResult.filePath);
      console.log(`[Handler] ✅ Kompres selesai: ${compressResult.outputPath}`);

      // Hapus file download asli jika sudah dikompres ke file baru
      if (!compressResult.skipped && compressResult.outputPath !== downloadResult.filePath) {
        cleanupFile(downloadResult.filePath);
      }

      // ===== STEP 3: KIRIM VIDEO =====
      await sendVideo(sock, jid, compressResult.outputPath, {
        originalSize: compressResult.originalSize,
        compressedSize: compressResult.compressedSize,
        metadata: compressResult.metadata,
        skipped: compressResult.skipped,
      });

      // Reaksi sukses
      await sendReaction(sock, jid, message, '✅');

    } catch (processErr) {
      console.error(`[Handler] ❌ Error saat proses: ${processErr.message}`);

      // Kirim pesan error ke user
      await sendText(sock, jid,
        `❌ *Gagal memproses video*\n\n${processErr.message}\n\n_Pastikan link TikTok valid dan coba lagi._`,
        { quoted: message }
      );

      // Reaksi error
      await sendReaction(sock, jid, message, '❌');

    } finally {
      // Bersihkan semua file temp
      if (downloadResult?.filePath) cleanupFile(downloadResult.filePath);
      if (compressResult?.outputPath && compressResult.outputPath !== downloadResult?.filePath) {
        cleanupFile(compressResult.outputPath);
      }

      // Hapus dari tracking
      processingUsers.delete(senderId);
    }

  } catch (err) {
    console.error(`[Handler] ❌ Unexpected error: ${err.message}`);
    console.error(err.stack);
  }
}

module.exports = { handleMessage };
