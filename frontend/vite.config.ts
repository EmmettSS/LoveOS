import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// LoveOS frontend — Vite config
// درخواست‌های API، static و پنل به بک‌اند جنگو پراکسی می‌شوند.
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
        // Three.js فقط هنگام باز شدن آسمانِ Full 3D لازم است؛ آن را در
        // precache اولیه نمی‌آوریم تا نصب PWA و شروع LoveOS سنگین نشود.
        globIgnores: ['**/three.module-*.js'],
        navigateFallbackDenylist: [/^\/api/, /^\/media/, /^\/daddy-panel/],
        runtimeCaching: [
          {
            // ترجمه‌ها اول از شبکه خوانده می‌شوند تا ویرایشِ بدون build فوری دیده
            // شود؛ نسخه‌ی آفلاین هم برای بار بعدی کش می‌شود.
            urlPattern: /\/locales\/.*/,
            handler: 'NetworkFirst',
            options: { cacheName: 'loveos-locales', expiration: { maxEntries: 20 } },
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
      // پنل بابا و فایل‌های استاتیک ادمین هم از همین دامنه در دسترس باشند
      '/daddy-panel-9x7k': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/static': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/healthz': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  // maplibre-gl ورکرش (maplibre-gl-worker.mjs) را نسبت به آدرس فایل خودش پیدا
  // می‌کند؛ اگر پیش‌باندل شود، آن فایل کنار خروجیِ پیش‌باندل نیست و خطای
  // «The file does not exist at .../deps/maplibre-gl-worker.mjs» می‌گیریم.
  // پس از پیش‌باندل مستثناست (آدرس صریح ورکر هم در MapOfUs ست شده است).
  optimizeDeps: { exclude: ['maplibre-gl'] },
  // نکته: هیچ پکیج چاپ/PDF بیرونی در کار نیست (خروجی کتاب با miniPdf داخلی ساخته
  // می‌شود). اگر روزی پکیج سنگینی اضافه کردید، اسمش را در include بگذارید تا
  // dev سریع‌تر بالا بیاید.
  build: { outDir: 'dist', chunkSizeWarningLimit: 1600 },
})
