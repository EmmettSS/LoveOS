/**
 * main.tsx — نقطه‌ی شروع LoveOS
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import './shared/i18n'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
