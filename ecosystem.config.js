/**
 * ecosystem.config.js
 * Konfigurasi PM2 untuk menjalankan Bot WA TikTok Downloader di VPS.
 * Jalankan: pm2 start ecosystem.config.js
 */

module.exports = {
  apps: [
    {
      name: 'bot-wa-tiktok',
      script: 'src/index.js',
      
      // Jangan restart otomatis saat file berubah (production)
      watch: false,
      
      // Restart jika memory melebihi 500MB
      max_memory_restart: '500M',
      
      // Environment variables
      env: {
        NODE_ENV: 'production',
        DEBUG: 'false',
      },
      env_development: {
        NODE_ENV: 'development',
        DEBUG: 'true',
      },
      
      // Log settings
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: 'logs/error.log',
      out_file: 'logs/out.log',
      merge_logs: true,
      
      // Restart delay (ms) jika crash
      restart_delay: 5000,
      
      // Maksimal restart dalam 1 menit (setelah ini, PM2 stop restart)
      max_restarts: 5,
      min_uptime: '10s',
      
      // Interpreter
      interpreter: 'node',
      interpreter_args: '--max-old-space-size=512',
    },
  ],
};
