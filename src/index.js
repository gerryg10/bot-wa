/**
 * index.js
 * Entry point Bot WhatsApp TikTok Downloader.
 * Menginisialisasi koneksi Baileys dengan session persistence dan QR login.
 */

require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  isJidBroadcast,
  makeInMemoryStore,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const qrcode = require('qrcode-terminal');
const path = require('path');
const fs = require('fs');
const { handleMessage } = require('./handler');

// ── Konfigurasi ──────────────────────────────────────────────────────────────
const SESSION_DIR = path.join(process.cwd(), 'session');
const LOGS_DIR = path.join(process.cwd(), 'logs');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const RECONNECT_DELAY_MS = 5000;
const MAX_RECONNECT_ATTEMPTS = 10;

// Pastikan folder-folder yang diperlukan ada
[SESSION_DIR, LOGS_DIR, TEMP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[Init] 📁 Folder dibuat: ${dir}`);
  }
});

// Logger Pino (level: info di production, debug jika DEBUG=true)
const logger = pino({
  level: process.env.DEBUG === 'true' ? 'debug' : 'silent',
});

// ── In-memory message store (diperlukan Baileys untuk retry/receipt) ───────────
const store = makeInMemoryStore({ logger });

// ── Fungsi Utama ──────────────────────────────────────────────────────────────
let reconnectAttempts = 0;

async function startBot() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🤖 Bot WA TikTok Downloader        ║');
  console.log('║   Powered by Baileys + yt-dlp         ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Load atau buat session baru
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // Cek versi Baileys terbaru
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[Init] Baileys version: ${version.join('.')} ${isLatest ? '(latest)' : '(update tersedia!)'}`);

  // Buat socket WhatsApp
  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '120.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    defaultQueryTimeoutMs: 60000,
    // Diperlukan agar Baileys bisa retry pesan yang gagal deliver
    getMessage: async (key) => {
      if (store) {
        const msg = await store.loadMessage(key.remoteJid, key.id);
        return msg?.message || undefined;
      }
      return { conversation: '' };
    },
  });

  // Bind store ke socket events
  store?.bind(sock.ev);

  // ── Event: Connection Update ─────────────────────────────────────────────
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Tampilkan QR code jika perlu login
    if (qr) {
      console.log('\n[Auth] 📱 Scan QR Code ini dengan WhatsApp kamu:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n[Auth] QR Code akan expired dalam 60 detik. Segera scan!\n');
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[Connection] ❌ Koneksi terputus. Status: ${statusCode}`);

      if (statusCode === DisconnectReason.loggedOut) {
        console.log('[Connection] ⚠️  Session logout. Hapus folder session/ dan scan QR ulang.');
        process.exit(1);
      }

      if (shouldReconnect && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = RECONNECT_DELAY_MS * reconnectAttempts;
        console.log(`[Connection] 🔄 Mencoba reconnect ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} dalam ${delay / 1000}s...`);
        setTimeout(startBot, delay);
      } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('[Connection] ❌ Gagal reconnect setelah', MAX_RECONNECT_ATTEMPTS, 'percobaan. Bot berhenti.');
        process.exit(1);
      }
    }

    if (connection === 'open') {
      reconnectAttempts = 0; // Reset counter setelah berhasil connect
      const botNumber = sock.user?.id?.split(':')[0] || 'Unknown';
      console.log(`\n[Connection] ✅ Bot terhubung!`);
      console.log(`[Connection] 📱 Nomor Bot: +${botNumber}`);
      console.log(`[Connection] 🟢 Siap menerima link TikTok!\n`);
    }

    if (connection === 'connecting') {
      console.log('[Connection] 🔌 Menghubungkan ke WhatsApp...');
    }
  });

  // ── Event: Simpan Credentials ─────────────────────────────────────────────
  sock.ev.on('creds.update', saveCreds);

  // ── Event: Pesan Masuk ────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Hanya proses pesan baru (bukan history sync)
    if (type !== 'notify') return;

    for (const message of messages) {
      // Skip pesan dari broadcast/status WA
      if (isJidBroadcast(message.key.remoteJid || '')) continue;
      // Skip jika tidak ada isi pesan
      if (!message.message) continue;

      // Proses pesan di handler
      await handleMessage(sock, message);
    }
  });

  return sock;
}

// ── Handle Unhandled Errors ───────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Process] ❌ Uncaught Exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Process] ❌ Unhandled Rejection:', reason);
});

// ── Jalankan Bot ──────────────────────────────────────────────────────────────
startBot().catch((err) => {
  console.error('[Init] ❌ Gagal menjalankan bot:', err.message);
  process.exit(1);
});
