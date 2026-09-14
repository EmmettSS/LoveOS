import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// LoveOS frontend — Vite config
// همه‌ی درخواست‌های /api و /media به بک‌اند جنگو پراکسی می‌شوند.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.svg', 'fonts/*.woff2'],
      manifest: {
        name: 'LoveOS',
        short_name: 'LoveOS',
        description: 'دنیای کوچیک ما',
        lang: 'fa',
        dir: 'rtl',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fdf2f8',
        theme_color: '#ec4899',
        icons: [
          { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // نسخه‌ی تازه فوراً جای قدیمی را می‌گیرد تا هیچ‌وقت «اپ باز می‌شود ولی خالی است» پیش نیاید
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api/, /^\/media/, /^\/daddy-panel/],
        runtimeCaching: [
          {
            // ترجمه‌ها اول از شبکه خوانده می‌شوند تا ویرایشِ بدون build فوری دیده
            // شود؛ نسخه‌ی آفلاین هم برای بار بعدی کش می‌شود.
            urlPattern: /\/locales\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'loveos-locales', expiration: { maxEntries: 20 } },
          },
          {
            urlPattern: /\/media\/.*/,
            handler: 'CacheFirst',
            options: { cacheName: 'loveos-media', expiration: { maxEntries: 120 } },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // پیش‌نمایش سندباکس و دامنه‌ی مخفی هر دو مجازند
    allowedHosts: true,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      // پنل بابا و فایل‌های استاتیک ادمین هم از همین دامنه در دسترس باشند
      '/daddy-panel-9x7k': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/healthz': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  optimizeDeps: { include: ['jspdf', 'html2canvas'] },
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 },
})
