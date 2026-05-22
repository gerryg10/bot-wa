/**
 * detector.js
 * Mendeteksi link TikTok dari teks pesan WhatsApp.
 * Mendukung semua format URL TikTok yang umum digunakan.
 */

// Regex untuk mendeteksi berbagai format URL TikTok
const TIKTOK_PATTERNS = [
  // Short URLs
  /https?:\/\/vt\.tiktok\.com\/[A-Za-z0-9_-]+\/?/gi,
  /https?:\/\/vm\.tiktok\.com\/[A-Za-z0-9_-]+\/?/gi,
  // Full URLs dengan username
  /https?:\/\/(?:www\.|m\.)?tiktok\.com\/@[\w.]+\/video\/\d+[^\s]*/gi,
  // Direct video URLs
  /https?:\/\/m\.tiktok\.com\/v\/\d+[^\s]*/gi,
  // TikTok with query params
  /https?:\/\/(?:www\.)?tiktok\.com\/t\/[A-Za-z0-9_-]+\/?/gi,
];

/**
 * Ekstrak URL TikTok dari teks pesan.
 * @param {string} text - Teks pesan dari WhatsApp
 * @returns {string|null} URL TikTok pertama yang ditemukan, atau null
 */
function extractTikTokUrl(text) {
  if (!text || typeof text !== 'string') return null;

  for (const pattern of TIKTOK_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex state
    const match = pattern.exec(text);
    if (match) {
      return match[0].trim().replace(/[.,!?]$/, ''); // Bersihkan trailing punctuation
    }
  }

  return null;
}

/**
 * Cek apakah teks mengandung link TikTok.
 * @param {string} text
 * @returns {boolean}
 */
function isTikTokLink(text) {
  return extractTikTokUrl(text) !== null;
}

module.exports = { extractTikTokUrl, isTikTokLink };
