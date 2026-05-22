/**
 * index.js
 * Entry point Bot WhatsApp - config style dari bot lama yang terbukti jalan.
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
const SESSION_DIR = path.join(process.cwd(), 'auth_info'); // samain dengan bot lama
const TEMP_DIR = path.join(process.cwd(), 'temp');
const LOGS_DIR = path.join(process.cwd(), 'logs');

[SESSION_DIR, TEMP_DIR, LOGS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Fungsi Utama ──────────────────────────────────────────────────────────────
async function startBot() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🤖 Bot WA TikTok Downloader        ║');
  console.log('║   Powered by Baileys + yt-dlp         ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  // Load session (sama persis seperti bot lama)
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);

  // Konfigurasi socket - SAMA PERSIS dengan bot lama yang terbukti jalan
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    printQRInTerminal: false,
  });

  // Simpan credentials
  sock.ev.on('creds.update', saveCreds);

  // ── Event: Connection Update (sama seperti bot lama) ──────────────────────
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n[Auth] 📱 Scan QR Code ini dengan WhatsApp kamu:\n');
      qrcode.generate(qr, { small: true });
      console.log('\n[Auth] QR Code akan expired dalam 60 detik. Segera scan!\n');
    }

    if (connection === 'open') {
      const botNumber = sock.user?.id?.split(':')[0] || 'Unknown';
      console.log(`\n[Connection] ✅ Bot terhubung!`);
      console.log(`[Connection] 📱 Nomor Bot: +${botNumber}`);
      console.log(`[Connection] 🟢 Siap menerima pesan!\n`);
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('[Connection] ❌ Koneksi terputus, mencoba reconnect:', shouldReconnect);
      if (shouldReconnect) startBot();
    }
  });

  // ── Event: Pesan Masuk ────────────────────────────────────────────────────
  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;
    await handleMessage(sock, msg);
  });
}

// ── Handle Unhandled Errors ───────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[Process] ❌ Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process] ❌ Unhandled Rejection:', reason);
});

// ── Jalankan Bot ──────────────────────────────────────────────────────────────
startBot().catch((err) => {
  console.error('[Init] ❌ Gagal menjalankan bot:', err.message);
  process.exit(1);
});
