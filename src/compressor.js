/**
 * compressor.js
 * Mengompresi video menggunakan FFmpeg via fluent-ffmpeg.
 * Target: resolusi max 720p, ukuran output < MAX_VIDEO_SIZE_MB (default 50MB).
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');

// Gunakan ffmpeg dari ffmpeg-static jika tersedia, else pakai system ffmpeg
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

const TEMP_DIR = path.join(process.cwd(), 'temp');
const MAX_SIZE_MB = parseInt(process.env.MAX_VIDEO_SIZE_MB || '50');
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

/**
 * Dapatkan metadata video (durasi, resolusi, bitrate).
 * @param {string} filePath
 * @returns {Promise<Object>}
 */
function getVideoMetadata(filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata);
    });
  });
}

/**
 * Format durasi detik ke string MM:SS.
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Kompres video menggunakan FFmpeg.
 * - Jika ukuran file sudah < MAX_SIZE_BYTES, skip kompres (return langsung)
 * - Output: H.264 MP4, max 720p, audio AAC 128kbps
 *
 * @param {string} inputPath - Path file video input
 * @returns {Promise<{outputPath: string, originalSize: number, compressedSize: number, metadata: Object}>}
 */
async function compressVideo(inputPath) {
  const stats = fs.statSync(inputPath);
  const originalSize = stats.size;

  console.log(`[Compressor] Input: ${path.basename(inputPath)} (${(originalSize / 1024 / 1024).toFixed(2)} MB)`);

  // Ambil metadata video
  let metadata;
  try {
    metadata = await getVideoMetadata(inputPath);
  } catch (err) {
    console.warn(`[Compressor] Gagal ambil metadata: ${err.message}`);
    metadata = {};
  }

  const videoStream = metadata?.streams?.find(s => s.codec_type === 'video') || {};
  const duration = metadata?.format?.duration || 0;
  const width = videoStream.width || 0;
  const height = videoStream.height || 0;

  // Jika ukuran sudah kecil dan resolusi tidak perlu dikurangi, skip kompres
  if (originalSize <= MAX_SIZE_BYTES && height <= 720) {
    console.log(`[Compressor] ✅ File sudah optimal, skip kompres.`);
    return {
      outputPath: inputPath,
      originalSize,
      compressedSize: originalSize,
      skipped: true,
      metadata: { duration, width, height },
    };
  }

  const outputPath = path.join(
    TEMP_DIR,
    `compressed_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp4`
  );

  // Hitung target bitrate berdasarkan durasi dan max size
  // Formula: (MAX_SIZE_BYTES * 8 / duration) - audio_bitrate
  const audioBitrateKbps = 128;
  let targetVideoBitrateKbps = 800; // default

  if (duration > 0) {
    const totalBitrateKbps = (MAX_SIZE_BYTES * 8) / duration / 1000;
    targetVideoBitrateKbps = Math.min(
      Math.floor(totalBitrateKbps - audioBitrateKbps),
      1500 // cap di 1500kbps untuk kualitas wajar
    );
    // Minimal 200kbps agar video masih terbaca
    targetVideoBitrateKbps = Math.max(targetVideoBitrateKbps, 200);
  }

  console.log(`[Compressor] Target bitrate: ${targetVideoBitrateKbps}kbps, resolusi: max 720p`);

  await new Promise((resolve, reject) => {
    let cmd = ffmpeg(inputPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .audioBitrate(`${audioBitrateKbps}k`)
      .videoBitrate(`${targetVideoBitrateKbps}k`)
      .outputOptions([
        '-preset fast',
        '-movflags +faststart', // Streaming-friendly
        '-crf 28',             // Constant Rate Factor (kualitas)
        '-pix_fmt yuv420p',    // Kompatibilitas maksimal
      ]);

    // Scale ke max 720p jika perlu
    if (height > 720 || width > 1280) {
      cmd = cmd.videoFilter('scale=-2:720');
    }

    cmd
      .output(outputPath)
      .on('start', (cmdLine) => {
        if (process.env.DEBUG === 'true') {
          console.log(`[Compressor] FFmpeg cmd: ${cmdLine}`);
        }
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r[Compressor] Progress: ${Math.round(progress.percent)}%`);
        }
      })
      .on('end', () => {
        process.stdout.write('\n');
        resolve();
      })
      .on('error', (err) => {
        reject(new Error(`FFmpeg error: ${err.message}`));
      })
      .run();
  });

  if (!fs.existsSync(outputPath)) {
    throw new Error('Compressor: File output tidak ditemukan setelah kompres');
  }

  const compressedStats = fs.statSync(outputPath);
  const compressedSize = compressedStats.size;
  const ratio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

  console.log(
    `[Compressor] ✅ Selesai. ${(originalSize / 1024 / 1024).toFixed(2)} MB → ${(compressedSize / 1024 / 1024).toFixed(2)} MB (hemat ${ratio}%)`
  );

  return {
    outputPath,
    originalSize,
    compressedSize,
    skipped: false,
    metadata: {
      duration,
      width: videoStream.width,
      height: videoStream.height,
      durationFormatted: formatDuration(duration),
    },
  };
}

module.exports = { compressVideo, getVideoMetadata, formatDuration };
