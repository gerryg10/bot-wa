/**
 * sender.js
 * Mengirim video ke pengguna WhatsApp via Baileys.
 */

const fs = require('fs');
const path = require('path');

/**
 * Format ukuran file ke string yang mudah dibaca.
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Kirim video ke chat WhatsApp.
 */
async function sendVideo(sock, jid, videoPath, info = {}) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`File video tidak ditemukan: ${videoPath}`);
  }

  const fileSize = fs.statSync(videoPath).size;
  const { originalSize, compressedSize, metadata = {}, skipped = false } = info;

  console.log(`[Sender] Mencoba kirim video ke ${jid}`);
  console.log(`[Sender] File: ${path.basename(videoPath)} (${formatSize(fileSize)})`);

  // Validasi ukuran — WhatsApp max ~64MB
  const MAX_BYTES = 64 * 1024 * 1024;
  if (fileSize > MAX_BYTES) {
    throw new Error(`Video terlalu besar (${formatSize(fileSize)}). Maksimal 64MB untuk WhatsApp.`);
  }

  // Buat caption
  const lines = ['🎵 *Video TikTok*'];
  if (metadata.durationFormatted) lines.push(`⏱️ Durasi: ${metadata.durationFormatted}`);
  if (originalSize && compressedSize) {
    if (!skipped) {
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(0);
      lines.push(`📦 Ukuran: ${formatSize(compressedSize)} _(hemat ${ratio}%)_`);
    } else {
      lines.push(`📦 Ukuran: ${formatSize(compressedSize)}`);
    }
  }
  lines.push('');
  lines.push('_Powered by Bot WA TikTok Downloader_ 🤖');
  const caption = lines.join('\n');

  // Baca file ke buffer lalu kirim
  const videoBuffer = fs.readFileSync(videoPath);
  console.log(`[Sender] Buffer size: ${formatSize(videoBuffer.length)}`);

  try {
    const result = await sock.sendMessage(jid, {
      video: videoBuffer,
      caption,
      mimetype: 'video/mp4',
      fileLength: fileSize,
      ptv: false, // Pastikan bukan video-note/circle
    });

    if (result) {
      console.log(`[Sender] ✅ Video terkirim! Message ID: ${result.key?.id}`);
    } else {
      console.warn(`[Sender] ⚠️ sendMessage selesai tapi result null/undefined`);
    }
  } catch (sendErr) {
    console.error(`[Sender] ❌ Gagal kirim video: ${sendErr.message}`);
    throw sendErr;
  }
}

/**
 * Kirim pesan teks biasa.
 */
async function sendText(sock, jid, text, options = {}) {
  try {
    const msgContent = { text };
    const sendOptions = {};
    if (options.quoted) sendOptions.quoted = options.quoted;
    await sock.sendMessage(jid, msgContent, sendOptions);
  } catch (err) {
    console.error(`[Sender] ❌ Gagal kirim teks: ${err.message}`);
  }
}

/**
 * Kirim reaksi emoji ke pesan.
 */
async function sendReaction(sock, jid, message, emoji) {
  try {
    await sock.sendMessage(jid, {
      react: {
        text: emoji,
        key: message.key,
      },
    });
  } catch (err) {
    console.warn(`[Sender] Gagal kirim reaksi: ${err.message}`);
  }
}

module.exports = { sendVideo, sendText, sendReaction, formatSize };
