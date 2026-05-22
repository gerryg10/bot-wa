/**
 * sender.js
 * Mengirim video ke pengguna WhatsApp via Baileys.
 */

const fs = require('fs');

/**
 * Format ukuran file ke string yang mudah dibaca.
 * @param {number} bytes
 * @returns {string}
 */
function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Kirim video ke chat WhatsApp.
 * @param {Object} sock - Instance Baileys socket
 * @param {string} jid - JID tujuan (chat ID)
 * @param {string} videoPath - Path file video yang akan dikirim
 * @param {Object} info - Informasi tambahan untuk caption
 * @param {number} info.originalSize - Ukuran file asli (bytes)
 * @param {number} info.compressedSize - Ukuran file setelah kompres (bytes)
 * @param {Object} info.metadata - Metadata video (duration, dll)
 * @param {boolean} info.skipped - True jika kompres dilewati
 * @returns {Promise<void>}
 */
async function sendVideo(sock, jid, videoPath, info = {}) {
  if (!fs.existsSync(videoPath)) {
    throw new Error(`File video tidak ditemukan: ${videoPath}`);
  }

  const { originalSize, compressedSize, metadata = {}, skipped = false } = info;

  // Buat caption informatif
  const lines = ['🎵 *Video TikTok*'];

  if (metadata.durationFormatted) {
    lines.push(`⏱️ Durasi: ${metadata.durationFormatted}`);
  }

  if (originalSize && compressedSize) {
    if (!skipped) {
      const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(0);
      lines.push(`📦 Ukuran: ${formatSize(compressedSize)} _(dari ${formatSize(originalSize)}, hemat ${ratio}%)_`);
    } else {
      lines.push(`📦 Ukuran: ${formatSize(compressedSize)}`);
    }
  }

  lines.push('');
  lines.push('_Powered by Bot WA TikTok Downloader_ 🤖');

  const caption = lines.join('\n');

  // Kirim video
  await sock.sendMessage(jid, {
    video: fs.readFileSync(videoPath),
    caption,
    mimetype: 'video/mp4',
  });

  console.log(`[Sender] ✅ Video terkirim ke ${jid}`);
}

/**
 * Kirim pesan teks biasa.
 * @param {Object} sock
 * @param {string} jid
 * @param {string} text
 * @param {Object} [options] - { quoted: message } untuk reply
 */
async function sendText(sock, jid, text, options = {}) {
  const msgContent = { text };
  const sendOptions = {};

  if (options.quoted) {
    sendOptions.quoted = options.quoted;
  }

  await sock.sendMessage(jid, msgContent, sendOptions);
}

/**
 * Kirim reaksi emoji ke pesan.
 * @param {Object} sock
 * @param {string} jid
 * @param {Object} message - Pesan yang akan diberi reaksi
 * @param {string} emoji - Emoji reaksi
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
