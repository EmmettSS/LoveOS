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

export default function App() {
  const { i18n } = useTranslation()
  const phase = useOS((s) => s.phase)
  const config = useOS((s) => s.config)
  const bootstrap = useOS((s) => s.bootstrap)
  const setPhase = useOS((s) => s.setPhase)
  const showEgg = useOS((s) => s.showEgg)
  const patchConfig = useOS((s) => s.patchConfig)
  const [ready, setReady] = useState(false)

  useNightMode()

  // بارگذاری اولیه‌ی پیکربندی از بک‌اند
  useEffect(() => {
    bootstrap()
      .catch(() => undefined)
      .finally(() => setReady(true))
  }, [bootstrap])

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

  if (!ready) {
    return <div className="h-full w-full" />
  }

  return (
    <div className="h-full w-full overflow-hidden">
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
