/**
 * downloader.js
 * Download video TikTok menggunakan yt-dlp sebagai primary method
 * dan API publik tikwm.com sebagai fallback.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const execFileAsync = promisify(execFile);

const TEMP_DIR = path.join(process.cwd(), 'temp');

// Pastikan folder temp ada
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

/**
 * Cari path yt-dlp yang tersedia di sistem
 */
function getYtDlpPath() {
  // Cek environment variable dulu
  if (process.env.YTDLP_PATH) return process.env.YTDLP_PATH;
  // Default path (sudah diinstall global di /usr/local/bin/yt-dlp)
  return 'yt-dlp';
}

/**
 * Generate nama file unik berdasarkan timestamp
 */
function generateTempFilename(ext = 'mp4') {
  return path.join(TEMP_DIR, `tiktok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

/**
 * Download video menggunakan yt-dlp (method utama).
 * @param {string} url - URL TikTok
 * @returns {Promise<string>} Path file yang sudah didownload
 */
async function downloadWithYtDlp(url) {
  const outputPath = generateTempFilename('mp4');
  const ytdlp = getYtDlpPath();

  // Gunakan cookies.txt jika tersedia (untuk bypass login TikTok)
  const cookiesPath = path.join(process.cwd(), 'cookies.txt');
  const cookiesArgs = fs.existsSync(cookiesPath)
    ? ['--cookies', cookiesPath]
    : [];

  const args = [
    url,
    '--no-warnings',
    '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format', 'mp4',
    '-o', outputPath,
    '--no-playlist',
    '--extractor-args', 'tiktok:app_name=trill',
    '--add-header', 'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    '--socket-timeout', '30',
    ...cookiesArgs,
  ];

  const timeout = parseInt(process.env.DOWNLOAD_TIMEOUT_SEC || '120') * 1000;

  await execFileAsync(ytdlp, args, { timeout });

  if (!fs.existsSync(outputPath)) {
    throw new Error('yt-dlp: File output tidak ditemukan setelah download');
  }

  return outputPath;
}

/**
 * Download video menggunakan tikwm.com API (fallback method).
 * @param {string} url - URL TikTok
 * @returns {Promise<string>} Path file yang sudah didownload
 */
async function downloadWithApiFallback(url) {
  const outputPath = generateTempFilename('mp4');

  // Step 1: Dapatkan info video
  const infoRes = await axios.post(
    'https://www.tikwm.com/api/',
    new URLSearchParams({ url, hd: '1' }),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30000,
    }
  );

  if (infoRes.data?.code !== 0) {
    throw new Error(`API Fallback error: ${infoRes.data?.msg || 'Unknown error'}`);
  }

  const videoData = infoRes.data.data;
  // Prefer HD, fallback ke play URL
  const videoUrl = videoData.hdplay || videoData.play;

  if (!videoUrl) {
    throw new Error('API Fallback: URL video tidak ditemukan di respons');
  }

  // Step 2: Download video binary
  const videoRes = await axios.get(videoUrl, {
    responseType: 'stream',
    timeout: 60000,
    headers: {
      'Referer': 'https://www.tiktok.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
  });

  await new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(outputPath);
    videoRes.data.pipe(writer);
    writer.on('finish', resolve);
    writer.on('error', reject);
  });

  if (!fs.existsSync(outputPath)) {
    throw new Error('API Fallback: File output tidak ditemukan setelah download');
  }

  return outputPath;
}

/**
 * Download video TikTok - mencoba yt-dlp dulu, fallback ke API.
 * @param {string} url - URL TikTok
 * @returns {Promise<{filePath: string, source: string}>}
 */
async function downloadTikTok(url) {
  console.log(`[Downloader] Mencoba download: ${url}`);

  // Method 1: yt-dlp
  try {
    console.log('[Downloader] Menggunakan yt-dlp...');
    const filePath = await downloadWithYtDlp(url);
    const stats = fs.statSync(filePath);
    console.log(`[Downloader] ✅ yt-dlp berhasil. Ukuran: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    return { filePath, source: 'yt-dlp' };
  } catch (ytdlpErr) {
    console.warn(`[Downloader] ⚠️ yt-dlp gagal: ${ytdlpErr.message}`);
  }

  // Method 2: API Fallback
  try {
    console.log('[Downloader] Menggunakan API fallback (tikwm.com)...');
    const filePath = await downloadWithApiFallback(url);
    const stats = fs.statSync(filePath);
    console.log(`[Downloader] ✅ API fallback berhasil. Ukuran: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    return { filePath, source: 'api-fallback' };
  } catch (apiErr) {
    console.error(`[Downloader] ❌ API fallback gagal: ${apiErr.message}`);
    throw new Error('Gagal download video dari semua sumber. Coba lagi nanti.');
  }
}

/**
 * Hapus file sementara.
 * @param {string} filePath
 */
function cleanupFile(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[Downloader] 🗑️ File temp dihapus: ${path.basename(filePath)}`);
    }
  } catch (err) {
    console.warn(`[Downloader] Gagal hapus file temp: ${err.message}`);
  }
}

module.exports = { downloadTikTok, cleanupFile, TEMP_DIR };
