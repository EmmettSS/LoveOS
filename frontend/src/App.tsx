/**
 * App.tsx — مدیریت مرحله‌های سیستم
 * boot → lock → desktop، به‌علاوه‌ی پرده‌ی رازها، توست، کد کونامی و تم روز/شب.
 */
import { AnimatePresence } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Boot } from './os/Boot'
import { Desktop } from './os/Desktop'
import { EggOverlay, Toast } from './os/EggOverlay'
import { Lock } from './os/Lock'
import { useNightMode } from './os/daynight'
import { post, tokenStore } from './shared/api'
import { refreshLocationIfStale } from './shared/geo'
import { applyLocalPrefs, syncSettings } from './shared/prefs'
import { setSoundEnabled } from './shared/sound'
import { useOS } from './shared/store'

const KONAMI = [
  'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
  'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a',
]

/**
 * تا چند میلی‌ثانیه «در حال اتصال» نشان بدهیم و بعد «اتصال برقرار نشد».
 * در تست‌ها با __LOVEOS_BOOT_SLOW_MS کوتاه می‌شود.
 */
function bootSlowMs(): number {
  const override = (globalThis as { __LOVEOS_BOOT_SLOW_MS?: unknown }).__LOVEOS_BOOT_SLOW_MS
  return typeof override === 'number' && override >= 0 ? override : 12_000
}

/** پس‌زمینه‌ی تیره‌ی هم‌خانواده‌ی اسپلش index.html — عمداً inline تا حتی اگر CSS لود نشد سفید نماند. */
const PRE_READY_BG = 'radial-gradient(80% 60% at 50% 28%, rgba(247,103,168,.16), transparent 70%), radial-gradient(90% 70% at 50% 100%, rgba(150,120,255,.14), transparent 70%), linear-gradient(170deg, #1d0c26 0%, #120719 55%, #0a0410 100%)'

export default function App() {
  const { i18n } = useTranslation()
  const phase = useOS((s) => s.phase)
  const config = useOS((s) => s.config)
  const bootstrap = useOS((s) => s.bootstrap)
  const setPhase = useOS((s) => s.setPhase)
  const showEgg = useOS((s) => s.showEgg)
  const patchConfig = useOS((s) => s.patchConfig)
  const [ready, setReady] = useState(false)
  const [bootFailed, setBootFailed] = useState(false)
  const [bootSlow, setBootSlow] = useState(false)
  const [bootAttempt, setBootAttempt] = useState(0)

  useNightMode()

  // تلاش دوباره: پرچم‌ها ریست می‌شوند تا «در حال اتصال» برگردد، بعد بوتِ تازه می‌آید
  const retryBootstrap = () => {
    setBootFailed(false)
    setBootSlow(false)
    setBootAttempt((a) => a + 1)
  }

  // بارگذاری اولیه‌ی پیکربندی از بک‌اند.
  // موفق → ورود به سیستم؛ خطا/کُندی → همین‌جا «اتصال برقرار نشد + دوباره تلاش»
  // (هرگز div خالیِ سفید، و هرگز قفلِ بی‌پشتوانه با config خالی).
  useEffect(() => {
    let cancelled = false
    const slowTimer = window.setTimeout(() => {
      if (!cancelled) setBootSlow(true)
    }, bootSlowMs())
    bootstrap().then(
      () => {
        window.clearTimeout(slowTimer)
        if (cancelled) return
        setBootFailed(false)
        setReady(true)
      },
      () => {
        window.clearTimeout(slowTimer)
        if (!cancelled) setBootFailed(true)
      },
    )
    return () => {
      cancelled = true
      window.clearTimeout(slowTimer)
    }
  }, [bootstrap, bootAttempt])

  // زبان، اندازه‌ی فونت و صدا از تنظیمات پنل بابا (با احترام به انتخاب محلی دستگاه)
  useEffect(() => {
    if (!config) return
    const merged = applyLocalPrefs(config)
    if (merged.language && merged.language !== i18n.language) void i18n.changeLanguage(merged.language)
    document.documentElement.style.setProperty('--font-scale', String(merged.font_scale || 1))
    setSoundEnabled(merged.sound_enabled !== false)
    document.documentElement.dir = merged.language === 'en' ? 'ltr' : 'rtl'
  }, [config, i18n])

  // اگر تنظیمات محلی‌ای بود که ذخیره‌اش نیمه‌کاره مانده، یک بار سرِ فرصت سینک می‌شود
  useEffect(() => {
    if (phase !== 'desktop') return
    void syncSettings()
  }, [phase])

  // موقعیت واقعی دخترم: تازه‌سازی محترمانه (بدون پنجره‌ی اجازه اگر قبلاً داده نشده)
  useEffect(() => {
    if (phase !== 'desktop') return
    void (async () => {
      const loc = await refreshLocationIfStale()
      if (loc?.is_live) patchConfig({ live_location: loc })
    })()
  }, [phase, patchConfig])

  // اگر توکن معتبر داریم، پس از بوت مستقیم وارد دسکتاپ شو
  useEffect(() => {
    if (!ready) return
    if (phase === 'lock' && tokenStore.get()) {
      setPhase('desktop')
    }
  }, [ready, phase, setPhase])

  // باغچه: با هر «ورود به پروژه» (باز شدن قفل / ورود تازه) گل‌ها به
  // مرحله‌ی اول برمی‌گردند تا هر بازدید یک باغ تازه باشد.
  const wasDesktop = useRef(false)
  useEffect(() => {
    if (phase !== 'desktop') {
      wasDesktop.current = false
      return
    }
    if (wasDesktop.current) return
    wasDesktop.current = true
    post('/garden/reset').catch(() => undefined)
  }, [phase])

  // پایان نشست از سمت سرور
  useEffect(() => {
    const onLocked = () => setPhase('lock')
    window.addEventListener('loveos:locked', onLocked)
    return () => window.removeEventListener('loveos:locked', onLocked)
  }, [setPhase])

  // راز ③ — کد کونامی
  useEffect(() => {
    if (phase !== 'desktop') return
    let seq: string[] = []
    const onKey = (e: KeyboardEvent) => {
      seq = [...seq, e.key].slice(-KONAMI.length)
      if (seq.join(',').toLowerCase() === KONAMI.join(',').toLowerCase()) {
        seq = []
        post<{ found: boolean; title: string; message: string; attachment?: string }>('/egg', { trigger: 'konami' })
          .then((r) => r.found && showEgg({ title: r.title, message: r.message, attachment: r.attachment }))
          .catch(() => undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, showEgg])

  // راز ② — تایپ کردن «دوستت دارم» هر جای سیستم
  useEffect(() => {
    if (phase !== 'desktop') return
    let buf = ''
    const onKey = (e: KeyboardEvent) => {
      if (e.key.length !== 1) return
      buf = (buf + e.key).slice(-30)
      const low = buf.toLowerCase()
      if (buf.includes('دوستت دارم') || low.includes('i love you')) {
        buf = ''
        post<{ found: boolean; title: string; message: string }>('/egg', { trigger: 'type_love' })
          .then((r) => r.found && showEgg({ title: r.title, message: r.message }))
          .catch(() => undefined)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, showEgg])

  // کلیک راست، نگه‌داشتن (منوی لمس طولانی) و انتخاب/کشیدن متن:
  //   • در دسکتاپ (آیکن‌ها، ویجت‌ها، داک، منوی شروع) و اپ‌های تعاملی (.os-no-select) بسته است
  //   • در اپ‌های محتوایی (.os-allow-select: چت، نامه‌ها، کتابخانه، خاطره‌ها...) آزاد است
  //   • نزدیک‌ترین کلاس در زنجیره‌ی والدها برنده است؛ فیلدهای ورودی همیشه مستثنا هستند
  useEffect(() => {
    // selectstart در بعضی مرورگرها روی خودِ گره‌ی متنی می‌آید، نه عنصر والدش
    const targetElement = (target: EventTarget | null): Element | null => {
      if (target instanceof Element) return target
      return target instanceof Node ? target.parentElement : null
    }
    const isBlocked = (target: EventTarget | null) => {
      const el = targetElement(target)
      if (!el) return false
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return false
      const zone = el.closest('.os-no-select, .os-allow-select')
      return !!zone && zone.classList.contains('os-no-select')
    }
    const block = (e: Event) => {
      if (isBlocked(e.target)) e.preventDefault()
    }
    // لمس: اگر از یک اپ محتوایی متنی انتخاب مانده و کاربر روی دسکتاپ/اپ تعاملی می‌زند،
    // انتخابِ مانده پاک می‌شود تا با نگه‌داشتن، منوی کپی برایش بالا نیاید.
    // (بدون preventDefault روی pointerdown تا tap، اسکرول و کشیدن آیکن‌ها سالم بمانند)
    const clearStaleTouchSelection = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && isBlocked(e.target)) window.getSelection()?.removeAllRanges()
    }
    // contextmenu: کلیک راست دسکتاپ و منوی نگه‌داشتن اندروید؛
    // selectstart/dragstart: شروع انتخاب یا کشیدن متن و تصویر با موس و لمس (iOS با CSS هم پوشش داده شده)
    document.addEventListener('contextmenu', block)
    document.addEventListener('selectstart', block)
    document.addEventListener('dragstart', block)
    document.addEventListener('pointerdown', clearStaleTouchSelection, { passive: true })
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('selectstart', block)
      document.removeEventListener('dragstart', block)
      document.removeEventListener('pointerdown', clearStaleTouchSelection)
    }
  }, [])

  if (!ready) {
    const failed = bootFailed || bootSlow
    return (
      <div
        className="os-screen"
        style={{
          position: 'fixed',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: PRE_READY_BG,
          color: '#fce7f3',
          fontFamily: 'Vazirmatn, system-ui, sans-serif',
          textAlign: 'center',
        }}
      >
        {!failed ? (
          <div role="status" aria-live="polite" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            <span
              aria-hidden="true"
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,.2)',
                borderTopColor: '#f767a8',
                animation: 'loveosSpin 0.9s linear infinite',
              }}
            />
            <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>در حال اتصال به LoveOS…</p>
          </div>
        ) : (
          <div role="alert" style={{ maxWidth: 380 }}>
            <div aria-hidden="true" style={{ fontSize: 46, lineHeight: 1, marginBottom: 16 }}>🥺</div>
            <p style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700 }}>اتصال برقرار نشد</p>
            <p style={{ margin: '0 0 20px', fontSize: 13, opacity: 0.72, lineHeight: 2 }}>
              اینترنت را چک کن و دوباره تلاش کن.
              <br />
              اگر از کشِ قدیمی PWA شک دارید، اپ را یک بار تازه‌سازی/نصب مجدد کنید.
            </p>
            <button
              type="button"
              onClick={retryBootstrap}
              style={{
                border: 0,
                cursor: 'pointer',
                borderRadius: 999,
                padding: '12px 30px',
                fontWeight: 700,
                fontSize: 14,
                fontFamily: 'inherit',
                color: '#fff',
                background: 'linear-gradient(135deg,#ff8cc0,#bba0fb)',
                boxShadow: '0 12px 28px -12px rgba(247,103,168,.85)',
              }}
            >
              دوباره تلاش
            </button>
          </div>
        )}
        <style>{'@keyframes loveosSpin { to { transform: rotate(360deg); } }'}</style>
      </div>
    )
  }

  return (
    <div
      // os-no-select در ریشه: کل پوسته (بوت، قفل، دسکتاپ، اورلی‌ها و توست) به‌طور پیش‌فرض
      // نه انتخاب متن دارد، نه کلیک راست و نه منوی نگه‌داشتن؛ فقط بدنه‌ی پنجره‌ها و اپ‌های
      // محتوایی با os-allow-select دوباره آزادش می‌کنند (نزدیک‌ترین کلاس برنده است).
      className="os-screen os-no-select"
      // موقع خروج انیمیشن بوت، پس‌زمینه هم تیره بماند تا فلش سفید پیدا نشود
      style={phase === 'boot' ? { background: '#0a0410' } : undefined}
    >
      <AnimatePresence mode="wait">
        {phase === 'boot' && <Boot key="boot" />}
        {phase === 'lock' && <Lock key="lock" />}
        {phase === 'desktop' && <Desktop key="desktop" />}
      </AnimatePresence>
      <EggOverlay />
      <Toast />
    </div>
  )
}
