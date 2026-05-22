/**
 * handler.js
 * Handler utama - gabungan command lama + fitur TikTok downloader.
 */

const axios = require('axios');
const fs = require('fs');
const { extractTikTokUrl } = require('./detector');
const { downloadTikTok, cleanupFile } = require('./downloader');
const { compressVideo } = require('./compressor');
const { sendVideo } = require('./sender');

// ── Database XP (dari bot lama) ───────────────────────────────────────────────
let database = { userXP: {} };
if (fs.existsSync('./database.json')) {
  database = JSON.parse(fs.readFileSync('./database.json'));
}
const saveData = () => fs.writeFileSync('./database.json', JSON.stringify(database, null, 2));
const getLevel = (xp) => {
  if (xp >= 4000) return 'Mythical Immortal';
  if (xp >= 1500) return 'Mythical Glory';
  if (xp >= 1200) return 'Mythical Honor';
  if (xp >= 800)  return 'Mythic';
  if (xp >= 600)  return 'Legend';
  if (xp >= 400)  return 'Epic';
  if (xp >= 200)  return 'Grand Master';
  if (xp >= 100)  return 'Master';
  if (xp >= 50)   return 'Elite';
  if (xp >= 10)   return 'Warrior';
  return 'No Rank';
};

// ── State Games ───────────────────────────────────────────────────────────────
let balapAyam = {};
let mathGame = {};

// ── Anti-flood TikTok ─────────────────────────────────────────────────────────
const processingUsers = new Set();
const USER_COOLDOWN_MS = 15000;
const userLastRequest = new Map();

function checkCooldown(userId) {
  const lastTime = userLastRequest.get(userId);
  if (!lastTime) return 0;
  const elapsed = Date.now() - lastTime;
  if (elapsed < USER_COOLDOWN_MS) return Math.ceil((USER_COOLDOWN_MS - elapsed) / 1000);
  return 0;
}

// ── Handler Utama ─────────────────────────────────────────────────────────────
async function handleMessage(sock, msg) {
  try {
    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = msg.key.participant || msg.key.remoteJid;
    const userNumber = sender.split('@')[0];
    const pushname = msg.pushName || 'Member';

    // Ekstrak teks pesan
    const body = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption || ''
    ).trim();

    const command = body.toLowerCase();

    console.log(`[Handler] 📥 Dari: ${from} | Pesan: "${body.slice(0, 80)}"`);

    // ── XP Tracker ─────────────────────────────────────────────────────────
    if (!database.userXP[sender]) database.userXP[sender] = { xp: 0, level: 'No Rank' };
    const oldLevel = getLevel(database.userXP[sender].xp);
    database.userXP[sender].xp += 1;
    saveData();
    const newLevel = getLevel(database.userXP[sender].xp);
    if (newLevel !== oldLevel) {
      await sock.sendMessage(from, {
        text: `🎉 *RANK UP!* 🎉\n\nCongrats! @${userNumber}\nRank kamu naik: *${oldLevel}* ➡️ *${newLevel}*\nTotal XP: *${database.userXP[sender].xp}*`,
        mentions: [sender],
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // COMMAND LAMA (BACKUP)
    // ═══════════════════════════════════════════════════════════════════════

    // ── /test & /ping ───────────────────────────────────────────────────────
    if (command === '/test' || command === '/ping') {
      const res = await sock.sendMessage(from, {
        text: `✅ *Bot Aktif!*\n\n🤖 Bot WA TikTok Downloader\n📱 JID: ${from}\n⏱️ Server time: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`,
      }, { quoted: msg });
      console.log(`[Handler] ✅ /test berhasil MsgID: ${res?.key?.id}`);
      return;
    }

    // ── /help & /menu ───────────────────────────────────────────────────────
    if (command === '/help' || command === '/menu') {
      const runtime = process.uptime();
      const hours = Math.floor(runtime / 3600);
      const minutes = Math.floor((runtime % 3600) / 60);
      const menuTeks = `───「 *Bot WA TikTok Downloader* 」───

*INFO BOT*
❒ *Runtime:* ${hours}h ${minutes}m
❒ *Prefix:* / (Slash)
❒ *Status:* Active

*🎵 TIKTOK*
❒ Kirim link TikTok → bot download & kompres otomatis
❒ Format: vt.tiktok.com / vm.tiktok.com / www.tiktok.com/@.../video/...

*🎮 GAMES*
❒ */suit [batu/gunting/kertas]* - Suit vs Bot
❒ */math* - Soal matematika (+10 XP)
❒ */typingfast* - Balapan ngetik

*📊 RANKING*
❒ */rank* - Cek rank & XP kamu
❒ */leaderboard* atau */lb* - Top 10

*🛠️ INFO*
❒ */device* - Cek jenis device
❒ */roll* - Roll dadu 1-100
❒ */quotes* - Quotes random
❒ */infogempa* - Info gempa BMKG
❒ *@botstatus* - Uptime bot
❒ */vngoogle [teks]* - Voice note TTS

*ADMIN ONLY*
❒ */admin* - List admin grup
────────────────────────────────`.trim();
      await sock.sendMessage(from, { text: menuTeks }, { quoted: msg });
      return;
    }

    // ── /rank ───────────────────────────────────────────────────────────────
    if (command === '/rank') {
      const userData = database.userXP[sender] || { xp: 0 };
      const currentLevel = getLevel(userData.xp);
      await sock.sendMessage(from, {
        text: `📊 *USER RANKING* 📊\n\n👤 Nama: *${pushname}*\n✨ Total XP: *${userData.xp}*\n🎖️ Level: *${currentLevel}*`,
        mentions: [sender],
      }, { quoted: msg });
      return;
    }

    // ── /leaderboard ────────────────────────────────────────────────────────
    if (command === '/leaderboard' || command === '/lb') {
      const users = Object.keys(database.userXP);
      if (users.length === 0) return await sock.sendMessage(from, { text: 'Belum ada data di Leaderboard!' });
      const sorted = users.sort((a, b) => database.userXP[b].xp - database.userXP[a].xp);
      const top10 = sorted.slice(0, 10);
      let teks = `🏆 *TOP 10 LEADERBOARD XP* 🏆\n\n`;
      top10.forEach((jid, i) => {
        const userXP = database.userXP[jid].xp;
        const userLevel = getLevel(userXP);
        const num = jid.split('@')[0];
        const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '👤';
        teks += `${emoji} *${i + 1}.* @${num}\n   └  *XP:* ${userXP} | *Rank:* ${userLevel}\n\n`;
      });
      teks += `_Tetaplah aktif untuk naik ke puncak!_`;
      await sock.sendMessage(from, { text: teks, mentions: top10 });
      return;
    }

    // ── /roll ───────────────────────────────────────────────────────────────
    if (command === '/roll') {
      const hasil = Math.floor(Math.random() * 100) + 1;
      await sock.sendMessage(from, { text: `🎲 Result: *${hasil}*` }, { quoted: msg });
      return;
    }

    // ── /quotes ─────────────────────────────────────────────────────────────
    if (command === '/quotes') {
      const daftarQuotes = [
        'Hiduplah seolah kamu mati besok. Belajarlah seolah kamu hidup selamanya. — Mahatma Gandhi',
        'Usaha tidak akan mengkhianati hasil. — Anonim',
        'Jangan berhenti ketika lelah, berhentilah ketika kamu sudah selesai. — David Goggins',
        'Waktu adalah pedang. — Al-Imam Ash-Shafi\'i',
        'Kesuksesan bukan kunci kebahagiaan. Kebahagiaanlah kunci kesuksesan. — Albert Schweitzer',
        'Sakit dalam perjuangan itu hanya sementara. — Lance Armstrong',
        'Orang yang berhenti belajar akan menjadi pemilik masa lalu. — Eric Hoffer',
      ];
      const q = daftarQuotes[Math.floor(Math.random() * daftarQuotes.length)];
      const parts = q.split(' — ');
      await sock.sendMessage(from, { text: `_"${parts[0]}"_\n\n— *${parts[1]}*` }, { quoted: msg });
      return;
    }

    // ── /device ─────────────────────────────────────────────────────────────
    if (command === '/device') {
      const msgId = msg.key.id;
      const deviceType = msgId.length > 21 ? 'Android / iPhone' : msgId.length < 21 ? 'WhatsApp Web' : 'Desktop / Tablet';
      await sock.sendMessage(from, { text: `You use device: *${deviceType}*` }, { quoted: msg });
      return;
    }

    // ── @botstatus ──────────────────────────────────────────────────────────
    if (command === '@botstatus') {
      const uptime = process.uptime();
      const h = Math.floor(uptime / 3600);
      const m = Math.floor((uptime % 3600) / 60);
      const s = Math.floor(uptime % 60);
      await sock.sendMessage(from, { text: `Bot sudah aktif selama: *${h} jam, ${m} menit, ${s} detik*` });
      return;
    }

    // ── /infogempa ──────────────────────────────────────────────────────────
    if (command === '/infogempa') {
      try {
        const res = await axios.get('https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json');
        const gempa = res.data.Infogempa.gempa;
        const teks = `🚨 *INFO GEMPA TERKINI*\n\n📅 Tanggal: ${gempa.Tanggal}\n⌚ Waktu: ${gempa.Jam}\n📏 Magnitudo: ${gempa.Magnitude}\n📍 Lokasi: ${gempa.Wilayah}\n🌊 Potensi: ${gempa.Potensi}\n🧭 Koordinat: ${gempa.Coordinates}`;
        await sock.sendMessage(from, { text: teks }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(from, { text: 'Gagal mengambil data BMKG.' });
      }
      return;
    }

    // ── /vngoogle ───────────────────────────────────────────────────────────
    if (body.startsWith('/vngoogle')) {
      const teks = body.replace(/^\/vngoogle/i, '').trim();
      if (!teks) return await sock.sendMessage(from, { text: 'Contoh: */vngoogle Halo semuanya*' }, { quoted: msg });
      try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(teks)}&tl=id&client=tw-ob`;
        await sock.sendMessage(from, { audio: { url }, mimetype: 'audio/mp4', ptt: true }, { quoted: msg });
      } catch (e) {
        await sock.sendMessage(from, { text: `Gagal: ${e.message}` });
      }
      return;
    }

    // ── /suit ───────────────────────────────────────────────────────────────
    if (command.startsWith('/suit')) {
      const pilihanUser = command.split(' ')[1];
      const pilihanBot = ['batu', 'gunting', 'kertas'][Math.floor(Math.random() * 3)];
      if (!['batu', 'gunting', 'kertas'].includes(pilihanUser)) {
        return await sock.sendMessage(from, { text: 'Cara main: */suit batu*, */suit gunting*, atau */suit kertas*' });
      }
      let hasil;
      if (pilihanUser === pilihanBot) {
        hasil = '🤝 *SERI!*';
      } else if (
        (pilihanUser === 'batu' && pilihanBot === 'gunting') ||
        (pilihanUser === 'gunting' && pilihanBot === 'kertas') ||
        (pilihanUser === 'kertas' && pilihanBot === 'batu')
      ) {
        database.userXP[sender].xp += 10; saveData();
        hasil = `🥳 *MENANG!*\nKamu: ${pilihanUser} | Bot: ${pilihanBot}\n\n+10 XP`;
      } else {
        database.userXP[sender].xp -= 2; saveData();
        hasil = `💀 *KALAH!*\nKamu: ${pilihanUser} | Bot: ${pilihanBot}\n\n-2 XP`;
      }
      await sock.sendMessage(from, { text: hasil }, { quoted: msg });
      return;
    }

    // ── /math ───────────────────────────────────────────────────────────────
    if (command === '/math') {
      if (mathGame[from]) return await sock.sendMessage(from, { text: 'Masih ada soal yang belum terjawab!' });
      const ops = ['+', '-', 'x'];
      const op = ops[Math.floor(Math.random() * ops.length)];
      let a, b, hasil;
      if (op === 'x') { a = Math.floor(Math.random() * 30) + 1; b = Math.floor(Math.random() * 10) + 1; hasil = a * b; }
      else if (op === '+') { a = Math.floor(Math.random() * 300) + 1; b = Math.floor(Math.random() * 300) + 1; hasil = a + b; }
      else { a = Math.floor(Math.random() * 300) + 1; b = Math.floor(Math.random() * a) + 1; hasil = a - b; }
      mathGame[from] = hasil;
      await sock.sendMessage(from, { text: `🧮 *MATH CHALLENGE* 🧮\n\nBerapakah hasil dari:\n*${a} ${op} ${b}* = ...?` }, { quoted: msg });
      return;
    }

    // ── Cek jawaban math ────────────────────────────────────────────────────
    if (!isNaN(body) && body !== '' && mathGame[from] !== undefined) {
      if (parseInt(body) === mathGame[from]) {
        database.userXP[sender].xp += 10; saveData();
        await sock.sendMessage(from, {
          text: `✅ *BENAR!* @${userNumber}\nJawabannya: *${mathGame[from]}*\n\n*+10 XP* ✨`,
          mentions: [sender],
        }, { quoted: msg });
        delete mathGame[from];
      }
      return;
    }

    // ── /typingfast ─────────────────────────────────────────────────────────
    if (command === '/typingfast') {
      if (balapAyam[from]) return await sock.sendMessage(from, { text: 'Masih ada balapan yang berlangsung!' });
      balapAyam[from] = true;
      await sock.sendMessage(from, { text: '🏁 *Cepet cepetan ngetik* 🏁\n\nSiapa yang paling cepat mengetik:\n*Pneumonoultramicroscopicsilicovolcanoconiosis*\n\n3... 2... 1... *GO!!!*' });
      return;
    }
    if (body === 'Pneumonoultramicroscopicsilicovolcanoconiosis' && balapAyam[from]) {
      delete balapAyam[from];
      await sock.sendMessage(from, { text: `🏆 *JUARA 1:* @${userNumber}\nCongrats! faster 💨`, mentions: [sender] }, { quoted: msg });
      return;
    }

    // ── /admin (group only) ─────────────────────────────────────────────────
    if (command === '/admin' && isGroup) {
      const metadata = await sock.groupMetadata(from);
      const admins = metadata.participants.filter(v => v.admin !== null).map(v => v.id);
      const isAdmin = metadata.participants.find(v => v.id === sender)?.admin !== null;
      if (!isAdmin) return await sock.sendMessage(from, { text: 'Command ini hanya untuk admin.' });
      let teks = '*Admin di Group ini:*\n\n';
      for (let admin of admins) teks += `- @${admin.split('@')[0]}\n`;
      await sock.sendMessage(from, { text: teks, mentions: admins });
      return;
    }

    // ── p (ping sederhana) ──────────────────────────────────────────────────
    if (command === 'p') {
      await sock.sendMessage(from, { text: 'kenapa?' });
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // FITUR TIKTOK DOWNLOADER
    // ═══════════════════════════════════════════════════════════════════════
    const tiktokUrl = extractTikTokUrl(body);
    if (!tiktokUrl) return;

    console.log(`[Handler] 🎵 Link TikTok dari ${from}: ${tiktokUrl}`);

    // Anti-flood
    const senderId = msg.key.participant || from;
    const cooldown = checkCooldown(senderId);
    if (cooldown > 0) {
      await sock.sendMessage(from, { text: `⏳ Tunggu ${cooldown} detik lagi.` }, { quoted: msg });
      return;
    }
    if (processingUsers.has(senderId)) {
      await sock.sendMessage(from, { text: '⚙️ Request sebelumnya masih diproses.' }, { quoted: msg });
      return;
    }

    processingUsers.add(senderId);
    userLastRequest.set(senderId, Date.now());

    // Reaksi loading
    try { await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } }); } catch (_) {}
    await sock.sendMessage(from, { text: '⬇️ Sedang mengunduh video TikTok...\n_Mohon tunggu sebentar_' }, { quoted: msg });

    let downloadResult = null;
    let compressResult = null;

    try {
      // Download
      downloadResult = await downloadTikTok(tiktokUrl);
      console.log(`[Handler] ✅ Download selesai`);

      // Kompres
      await sock.sendMessage(from, { text: '🔄 Sedang mengompresi video...' });
      compressResult = await compressVideo(downloadResult.filePath);
      console.log(`[Handler] ✅ Kompres selesai`);

      if (!compressResult.skipped && compressResult.outputPath !== downloadResult.filePath) {
        cleanupFile(downloadResult.filePath);
      }

      // Kirim video
      await sendVideo(sock, from, compressResult.outputPath, {
        originalSize: compressResult.originalSize,
        compressedSize: compressResult.compressedSize,
        metadata: compressResult.metadata,
        skipped: compressResult.skipped,
      });

      try { await sock.sendMessage(from, { react: { text: '✅', key: msg.key } }); } catch (_) {}

    } catch (err) {
      console.error(`[Handler] ❌ Error TikTok: ${err.message}`);
      await sock.sendMessage(from, { text: `❌ *Gagal memproses video*\n\n${err.message}\n\n_Coba lagi nanti._` }, { quoted: msg });
      try { await sock.sendMessage(from, { react: { text: '❌', key: msg.key } }); } catch (_) {}
    } finally {
      if (downloadResult?.filePath) cleanupFile(downloadResult.filePath);
      if (compressResult?.outputPath && compressResult.outputPath !== downloadResult?.filePath) {
        cleanupFile(compressResult.outputPath);
      }
      processingUsers.delete(senderId);
    }

  } catch (err) {
    console.error(`[Handler] ❌ Unexpected error: ${err.message}`);
  }
}

module.exports = { handleMessage };
