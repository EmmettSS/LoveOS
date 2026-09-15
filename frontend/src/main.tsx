/**
 * main.tsx — نقطه‌ی شروع LoveOS
 *
 * رندر اپ فقط بعد از آماده‌شدن ترجمه‌ها شروع می‌شود؛ در فاصله‌اش همان اسپلش
 * درون index.html دیده می‌شود و اگر بارگذاری ترجمه شکست بخورد، به‌جای صفحه‌ی
 * فریزشده یک صفحه‌ی «تلاش دوباره» نشان داده می‌شود.
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { ErrorBoundary } from './shared/ErrorBoundary'
import { i18nReady } from './shared/i18n'
import './styles/index.css'

// اگر نسخه‌ی قدیمی PWA در حافظه مانده باشد و فایل جدیدش روی سرور نباشد،
// مرورگر خطای preload می‌دهد؛ یک بار تازه‌سازی خودکار همه‌چیز را حل می‌کند.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'loveos_preload_reload_at'
  const last = Number(localStorage.getItem(KEY) || 0)
  if (Date.now() - last > 60_000) {
    localStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  }
})

const rootEl = document.getElementById('root')!

function showBootFailure() {
  rootEl.innerHTML = `
    <div style="position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;
                background:radial-gradient(120% 90% at 50% 0%,#2a1030 0%,#0b0512 70%);
                color:#fce7f3;font-family:Vazirmatn,system-ui,sans-serif;text-align:center">
      <div style="max-width:380px">
        <div style="font-size:52px;line-height:1;margin-bottom:18px;animation:loveosBeat 1.1s ease-in-out infinite">❤</div>
        <p style="font-size:16px;font-weight:700;margin:0 0 8px">نتوانستم قلب LoveOS را روشن کنم</p>
        <p dir="ltr" style="font-size:13px;opacity:.72;margin:0 0 22px;line-height:1.7">
          LoveOS could not load its language files.<br/>Please check your connection and try again.
        </p>
        <button type="button" id="loveos-retry"
          style="border:0;cursor:pointer;border-radius:999px;padding:12px 30px;font-weight:700;font-size:14px;
                 color:#fff;background:linear-gradient(135deg,#ff8cc0,#bba0fb);
                 box-shadow:0 12px 28px -12px rgba(247,103,168,.85);font-family:inherit">
          تلاش دوباره &nbsp;·&nbsp; Retry
        </button>
      </div>
    </div>`
  document.getElementById('loveos-retry')?.addEventListener('click', () => window.location.reload())
}

void i18nReady
  .then(() => {
    createRoot(rootEl).render(
      <StrictMode>
        <ErrorBoundary title="LoveOS">
          <App />
        </ErrorBoundary>
      </StrictMode>,
    )
  })
  .catch((err) => {
    console.error('[LoveOS] i18n initialization failed:', err)
    showBootFailure()
  })
