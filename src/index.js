/**
 * index.js
 * Entry point Bot WhatsApp - menggunakan Pairing Code (bukan QR)
 * untuk fix masalah "pesan terkirim tapi tidak sampai"
 */

require('dotenv').config();

const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pino = require('pino');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { handleMessage } = require('./handler');

// ── Konfigurasi ──────────────────────────────────────────────────────────────
const SESSION_DIR = path.join(process.cwd(), 'auth_info');
const TEMP_DIR    = path.join(process.cwd(), 'temp');
const LOGS_DIR    = path.join(process.cwd(), 'logs');

// Nomor bot (tanpa +, tanpa spasi, contoh: 6282779041794)
const BOT_NUMBER = process.env.BOT_NUMBER || '';

// Mode login: 'pairing' atau 'qr'
const LOGIN_MODE = process.env.LOGIN_MODE || 'pairing';

[SESSION_DIR, TEMP_DIR, LOGS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const logger = pino({ level: process.env.DEBUG === 'true' ? 'debug' : 'silent' });

// ── Helper: Prompt input dari terminal ────────────────────────────────────────
function askQuestion(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

// ── Fungsi Utama ──────────────────────────────────────────────────────────────
async function startBot() {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   🤖 Bot WA TikTok Downloader        ║');
  console.log('║   Powered by Baileys + yt-dlp         ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');

  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(`[Init] Baileys version: ${version.join('.')} ${isLatest ? '(latest)' : ''}`);

  const sock = makeWASocket({
    version,
    logger,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    printQRInTerminal: false,
    generateHighQualityLinkPreview: false,
  });

  // ── Pairing Code Login ──────────────────────────────────────────────────
  if (!sock.authState.creds.registered) {
    if (LOGIN_MODE === 'pairing') {
      let phoneNumber = BOT_NUMBER;
      if (!phoneNumber) {
        phoneNumber = await askQuestion('\n📱 Masukkan nomor WA bot (contoh: 6282779041794): ');
      }
      phoneNumber = phoneNumber.replace(/[^0-9]/g, '');
      console.log(`\n[Auth] 📲 Meminta pairing code untuk +${phoneNumber}...`);
      
      // Tunggu sebentar agar socket siap
      await new Promise(r => setTimeout(r, 3000));
      
      const code = await sock.requestPairingCode(phoneNumber);
      console.log(`\n╔══════════════════════════════════════╗`);
      console.log(`║   📲 PAIRING CODE: ${code}          ║`);
      console.log(`╚══════════════════════════════════════╝`);
      console.log(`\nBuka WhatsApp di HP → Linked Devices → Link a Device → Link with phone number`);
      console.log(`Masukkan kode di atas. Tunggu hingga terhubung...\n`);
    } else {
      // Fallback ke QR
      console.log('[Auth] Mode QR aktif. Tunggu QR muncul...');
    }
  }

  // Simpan credentials
  sock.ev.on('creds.update', saveCreds);

  // ── Connection Update ─────────────────────────────────────────────────────
  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // QR fallback (hanya jika mode QR)
    if (qr && LOGIN_MODE !== 'pairing') {
      console.log('\n[Auth] 📱 Scan QR Code:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'open') {
      const botNumber = sock.user?.id?.split(':')[0] || 'Unknown';
      console.log(`\n✅ BOT BERHASIL ONLINE!`);
      console.log(`📱 Nomor Bot: +${botNumber}`);
      console.log(`🆔 Full ID: ${sock.user?.id}`);
      console.log(`🟢 Siap menerima pesan!\n`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      console.log(`[Connection] ❌ Terputus. Status: ${statusCode}`);

      if (isLoggedOut) {
        console.log('[Connection] ⚠️  Logout. Hapus auth_info/ dan login ulang.');
        process.exit(1);
      }

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
  console.error('[Process] ❌ Unhandled:', reason);
});

// ── Start ─────────────────────────────────────────────────────────────────────
startBot().catch((err) => {
  console.error('[Init] ❌ Gagal:', err.message);
  process.exit(1);
});
