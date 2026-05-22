/**
 * index.js
 * Entry point Bot WhatsApp - config IDENTIK dengan bot.js lama yang terbukti jalan.
 */

require('dotenv').config();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const { handleMessage } = require('./handler');

// ── Konfigurasi ──────────────────────────────────────────────────────────────
const SESSION_DIR = path.join(process.cwd(), 'auth_info');
const TEMP_DIR    = path.join(process.cwd(), 'temp');
const LOGS_DIR    = path.join(process.cwd(), 'logs');

[SESSION_DIR, TEMP_DIR, LOGS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Prevent double reconnect ──────────────────────────────────────────────────
let isReconnecting = false;

// ── Fungsi Utama ──────────────────────────────────────────────────────────────
async function startBot() {
  if (isReconnecting) return;
  isReconnecting = true;

  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🤖 Bot WA TikTok Downloader        ║');
  console.log('║   Powered by Baileys + yt-dlp         ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Load session - SAMA PERSIS dengan bot.js lama
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // Config socket - IDENTIK dengan bot.js lama yang terbukti jalan
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    printQRInTerminal: false,
  });

  isReconnecting = false; // Reset setelah socket dibuat

  // Simpan credentials
  sock.ev.on('creds.update', saveCreds);

  // ── Connection Update ─────────────────────────────────────────────────────
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // Tampilkan QR saat login pertama kali
    if (qr) {
      console.log('\n[Auth] 📱 Scan QR Code ini dengan WhatsApp kamu:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n[Auth] QR akan expired dalam 60 detik. Segera scan!\n');
    }

    if (connection === 'open') {
      const botNumber = sock.user?.id?.split(':')[0] || 'Unknown';
      console.log(`\n✅ BOT BERHASIL ONLINE!`);
      console.log(`📱 Nomor Bot: +${botNumber}`);
      console.log(`🟢 Siap menerima pesan!\n`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`[Connection] ❌ Koneksi terputus. Status: ${statusCode}`);

      if (isLoggedOut) {
        console.log('[Connection] ⚠️  Logout. Hapus folder auth_info/ dan scan QR ulang.');
        process.exit(1);
      }

      // Reconnect dengan delay agar QR sempat muncul & tidak flood server
      console.log('[Connection] 🔄 Reconnect dalam 5 detik...');
      setTimeout(() => startBot(), 5000);
    }
  });

  // ── Pesan Masuk ───────────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;
    await handleMessage(sock, msg);
  });
}

// ── Handle Errors ─────────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Process] ❌ Uncaught:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process] ❌ Unhandled Rejection:', reason);
});

// ── Start ─────────────────────────────────────────────────────────────────────
startBot().catch((err) => {
  console.error('[Init] ❌ Gagal start:', err.message);
  process.exit(1);
});
