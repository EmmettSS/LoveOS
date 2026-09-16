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
        /**
         * چانکِ three.jsِ آسمانِ ستاره‌ها از precache مستثناست.
         *
         * چرا: این چانک ~۵۴۳KB (۱۳۵KB gzip) است و **فقط** وقتی لایه‌ی کیفیت
         * «کهکشان» باشد و اپِ ستاره‌ها باز شود دانلود می‌شود. اگر داخلِ
         * precache می‌ماند، کاربرِ لایه‌ی «مهتاب» هم موقعِ نصب همان ۵۴۳KB را
         * می‌گرفت و هرگز یک پیکسلش را نمی‌دید — یعنی هزینه‌ی خالص.
         *
         * به‌جایش پایین‌تر یک runtimeCaching از نوعِ CacheFirst گذاشته‌ایم، پس
         * اولین بار که کسی واقعاً آسمانِ سه‌بعدی را باز کند کش می‌شود و
         * **دفعاتِ بعد آفلاین هم کار می‌کند**. یعنی offline-first برای کسی
         * که لازم دارد حفظ شده، بدونِ جریمه‌کردنِ بقیه.
         *
         * ✅ الگو دیگر به اسمِ یک ماژولِ خاص گره نخورده: ``manualChunks``
         *    پایین‌تر همه‌ی ``src/three/**`` و خودِ ``three`` را در یک چانکِ
         *    مشترک به اسمِ ``loveos-3d`` می‌گذارد. پس افزودنِ صحنه‌ی سه‌بعدیِ
         *    تازه (سینما، خونه‌ی رویایی، ...) **هیچ** تغییری در این فایل
         *    لازم ندارد — الگویِ قدیمیِ StarmapSky هم برای اطمینان نگه
         *    داشته شده تا اگر روزی manualChunks برداشته شد، چانک بی‌صدا به
         *    precache برنگردد.
         */
        // ⚠️ **بی‌تغییر (invariant):** هر صحنه‌ی سه‌بعدیِ تازه‌ای که با
        //    ``lazy()`` بارگذاری می‌شود باید اسمِ ماژولش این‌جا اضافه شود،
        //    وگرنه بی‌صدا به precache می‌رود و کاربرِ مهتاب هم دانلودش
        //    می‌کند. این دقیقاً همان اتفاقی است که برای CinemaHall افتاد و
        //    با شمارشِ ورودی‌های manifest (۸۳ → ۸۵) کشف شد.
        //    DreamRoom از الان اینجاست چون صحنه‌ی خونه‌ی رویایی در راه است.
        globIgnores: [
          '**/loveos-3d-*.js',
          '**/StarmapSky-*.js',
          '**/CinemaHall-*.js',
          '**/DreamRoom-*.js',
        ],
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
            // چانکِ three.js (توضیحِ globIgnores بالا). اسمِ فایل content-hash
            // دارد پس محتوایش تغییرناپذیر است و CacheFirst امن‌ترین و
            // ارزان‌ترین انتخاب است؛ کش هم سقف دارد تا تلنبار نشود.
            urlPattern: /\/assets\/(loveos-3d|StarmapSky|CinemaHall|DreamRoom)-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'loveos-3d',
              // سقف ۸: چانکِ مشترکِ three + سه پوسته‌ی صحنه + اتاقِ رشد
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 60 },
            },
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
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        /**
         * همه‌ی صحنه‌های سه‌بعدی + خودِ ``three`` در **یک** چانکِ مشترک.
         *
         * چرا یک چانک و نه یکی به ازای هر صحنه: اگر هر صحنه چانکِ خودش را
         * داشت، ``three`` (۱۳۵KB gzip) یا در هر سه تکرار می‌شد یا rollup
         * خودش یک چانکِ مشترکِ بی‌نام می‌ساخت که الگویِ globIgnores بالا
         * نمی‌شناختش و بی‌صدا به precache برمی‌گشت. با یک اسمِ صریح، هم
         * دانلود یک بار است (سینما و ستاره‌ها و اتاق هر سه از همان یک فایل
         * می‌خوانند) هم الگویِ PWA پایدار می‌ماند.
         *
         * ⚠️ شرطِ لازم: هیچ ماژولِ **غیرِ lazy** نباید ``three`` را import
         *    کند، وگرنه این چانک واردِ گرافِ اصلی می‌شود و کاربرِ مهتاب هم
         *    دانلودش می‌کند. الان تنها import‌کننده‌ها داخلِ ``src/three``
         *    هستند و همه با ``lazy()`` بارگذاری می‌شوند.
         */
        manualChunks(id) {
          // فقط خودِ **کتابخانه‌ی** three این‌جا می‌رود.
          //
          // ⚠️ درسِ گرفته‌شده از یک رگرسیونِ واقعی: نسخه‌ی اولِ این قاعده
          //    ``/src/three/`` را هم شامل می‌شد. نتیجه این بود که rollup
          //    ``shared/quality.ts`` را (که ``useThreeScene`` واردش می‌کند)
          //    به چانکِ loveos-3d **مهاجرت** داد، و چون باندلِ اصلی هم به
          //    quality.ts نیاز دارد، ``index.js`` یک ``import`` **ایستا** از
          //    loveos-3d گرفت. یعنی کاربرِ مهتاب هم ۱۴۲KB three.js را در
          //    شروعِ برنامه دانلود می‌کرد — دقیقاً همان چیزی که کلِ این
          //    طراحی برای جلوگیری از آن ساخته شده.
          //
          //    قاعده‌ی کلی: به manualChunks فقط ماژولی را بده که **هیچ**
          //    ماژولِ مشترکِ پرکاربردی را import نمی‌کند. خودِ three هیچ
          //    وابستگیِ داخلی ندارد، پس امن است. فایل‌های صحنه را به الگوریتم
          //    پیش‌فرضِ rollup بسپار تا چانکِ lazy خودشان را بگیرند.
          if (id.includes('node_modules/three/')) return 'loveos-3d'
          return undefined
        },
      },
    },
  },
})
