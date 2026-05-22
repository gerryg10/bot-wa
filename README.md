# 🤖 Bot WhatsApp TikTok Downloader

Bot WhatsApp otomatis yang mendeteksi link TikTok, mengunduh video tanpa watermark, mengompresi, lalu mengirimkan kembali ke pengirim.

## ✨ Fitur

- ✅ Deteksi otomatis semua format link TikTok (`vt.tiktok.com`, `vm.tiktok.com`, `www.tiktok.com/@user/video/...`)
- ✅ Download tanpa watermark via `yt-dlp`
- ✅ Fallback ke tikwm.com API jika yt-dlp gagal
- ✅ Kompres otomatis dengan FFmpeg (target max 50MB, resolusi 720p)
- ✅ Anti-flood: cooldown 15 detik per user
- ✅ Auto-reconnect jika koneksi WhatsApp terputus
- ✅ Session persistence (tidak perlu scan QR setiap restart)
- ✅ Siap deploy di VPS dengan PM2

---

## 🖥️ Persyaratan VPS

| Spesifikasi | Minimum | Rekomendasi |
|---|---|---|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Storage | 10 GB | 20 GB |
| OS | Ubuntu 20.04+ | Ubuntu 22.04 LTS |
| Node.js | v18+ | v20 LTS |

---

## 🚀 Panduan Deploy di VPS (Ubuntu 22.04)

### 1. Update Sistem

```bash
sudo apt update && sudo apt upgrade -y
```

### 2. Install Node.js 18+ (via NodeSource)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # Harus v20.x.x
```

### 3. Install yt-dlp

```bash
sudo curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o /usr/local/bin/yt-dlp
sudo chmod a+rx /usr/local/bin/yt-dlp
yt-dlp --version  # Verifikasi instalasi
```

> **Tip:** Update yt-dlp secara berkala agar TikTok download tetap berjalan:
> ```bash
> sudo yt-dlp -U
> ```

### 4. Install PM2 (Global)

```bash
sudo npm install -g pm2
```

### 5. Upload Project ke VPS

**Opsi A — Via Git:**
```bash
git clone https://github.com/your-username/bot-wa-tiktok.git /home/user/bot-wa-tiktok
cd /home/user/bot-wa-tiktok
```

**Opsi B — Via SCP dari lokal:**
```bash
scp -r ./bot-wa-tiktok user@VPS_IP:/home/user/
```

### 6. Install Dependencies

```bash
cd /home/user/bot-wa-tiktok
npm install
```

### 7. Konfigurasi Environment

```bash
cp .env.example .env
nano .env  # Sesuaikan konfigurasi jika perlu
```

### 8. Login WhatsApp (Scan QR)

```bash
node src/index.js
```

- QR code akan muncul di terminal
- Buka WhatsApp di HP → **Perangkat Tertaut** → **Tautkan Perangkat**
- Scan QR code yang tampil
- Tunggu hingga muncul: `✅ Bot terhubung!`
- Tekan `Ctrl+C` setelah berhasil connect

### 9. Jalankan dengan PM2

```bash
pm2 start ecosystem.config.js
pm2 save                    # Simpan daftar proses PM2
pm2 startup                 # Generate auto-start saat VPS reboot
# Copy-paste perintah yang muncul dari output pm2 startup
```

---

## 📋 Perintah PM2 Berguna

```bash
pm2 status                  # Lihat status semua proses
pm2 logs bot-wa-tiktok      # Lihat log real-time
pm2 logs bot-wa-tiktok --err  # Lihat error log
pm2 restart bot-wa-tiktok   # Restart bot
pm2 stop bot-wa-tiktok      # Stop bot
pm2 delete bot-wa-tiktok    # Hapus dari PM2
```

---

## 🔧 Update yt-dlp (Penting!)

TikTok sering update, sehingga yt-dlp harus diperbarui secara berkala:

```bash
sudo yt-dlp -U
pm2 restart bot-wa-tiktok   # Restart bot setelah update
```

---

## 🔐 Session WhatsApp

Session tersimpan di folder `session/`. **Jangan hapus folder ini!**

Jika session hilang (contoh: terhapus, atau akun logout):
```bash
rm -rf session/             # Hapus session lama
node src/index.js            # Login ulang via QR
# Setelah berhasil, Ctrl+C
pm2 restart bot-wa-tiktok
```

---

## ⚙️ Konfigurasi (.env)

| Variable | Default | Keterangan |
|---|---|---|
| `DEBUG` | `false` | Mode debug (log lebih detail) |
| `YTDLP_PATH` | _(auto)_ | Path custom ke binary yt-dlp |
| `DOWNLOAD_TIMEOUT_SEC` | `120` | Timeout download (detik) |
| `MAX_VIDEO_SIZE_MB` | `50` | Ukuran max output video (MB) |

---

## 📁 Struktur Proyek

```
bot-wa-tiktok/
├── src/
│   ├── index.js        # Entry point, Baileys + QR auth
│   ├── handler.js      # Logika utama proses pesan
│   ├── detector.js     # Deteksi link TikTok
│   ├── downloader.js   # Download via yt-dlp / API
│   ├── compressor.js   # Kompres dengan FFmpeg
│   └── sender.js       # Kirim video ke WhatsApp
├── session/            # Session Baileys (auto-generated)
├── temp/               # File video sementara (auto-cleaned)
├── logs/               # Log PM2
├── .env                # Konfigurasi
├── ecosystem.config.js # Konfigurasi PM2
└── package.json
```

---

## 🔍 Troubleshooting

### Bot tidak bisa download TikTok
```bash
# Update yt-dlp
sudo yt-dlp -U
# Test manual
yt-dlp "https://vt.tiktok.com/..." -o /tmp/test.mp4
```

### Session expired / perlu scan ulang
```bash
rm -rf session/
node src/index.js  # Scan QR baru
```

### Video terlalu besar / gagal kirim
Kurangi `MAX_VIDEO_SIZE_MB` di `.env`, contoh set ke `30`.

### Bot crash terus
```bash
pm2 logs bot-wa-tiktok --err --lines 100
```

---

## 📄 Lisensi

MIT License
