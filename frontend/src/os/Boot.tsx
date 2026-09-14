/**
 * Boot.tsx — صفحه‌ی بوت سینمایی LoveOS
 *
 * مثل بایوس‌های عاشقانه: قلب می‌تپد، خطوط سیستم یکی‌یکی «تایپ» می‌شوند
 * (بارگذاری قلب ....... موفق)، نوار پیشرفت پر می‌شود، در پایان حقوق
 * کپی‌رایت «© بابا ❤ دخترم» و سلام بابا ظاهر می‌شود — و دسکتاپ بیدار می‌شود.
 *
 * راز ①: پنج بار کلیک روی قلب.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LoveOSLogo } from '../shared/Icon'
import { post } from '../shared/api'
import { playBootMelody, playTypeTick, tone } from '../shared/sound'
import { useOS } from '../shared/store'

interface BootLine {
  label: string
  status: string
}

const TYPE_MS = 22
const LINE_GAP_MS = 300
const END_HOLD_MS = 2200

export function Boot() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const setPhase = useOS((s) => s.setPhase)
  const showEgg = useOS((s) => s.showEgg)

  const lines = (t('boot.lines', { returnObjects: true }) as BootLine[]) || []
  const [done, setDone] = useState<number>(0)
  const [typed, setTyped] = useState(0) // تعداد کاراکترهای تایپ‌شده‌ی خط جاری
  const [finished, setFinished] = useState(false)
  const [logoClicks, setLogoClicks] = useState(0)
  const started = useRef(false)
  const finishedRef = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (config?.sound_enabled !== false) playBootMelody()

    let lineIndex = 0
    let charIndex = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      if (lineIndex >= lines.length) {
        if (finishedRef.current) return
        finishedRef.current = true
        setDone(lines.length)
        setFinished(true)
        if (config?.sound_enabled !== false) tone({ freq: 880, duration: 0.5, type: 'sine', gain: 0.08 })
        setTimeout(() => !cancelled && setPhase('lock'), END_HOLD_MS)
        return
      }
      const full = lines[lineIndex].label
      if (charIndex <= full.length) {
        setTyped(charIndex)
        if (charIndex > 0 && charIndex % 3 === 0 && config?.sound_enabled !== false) playTypeTick()
        charIndex += 1
        setTimeout(tick, TYPE_MS)
      } else {
        setDone(lineIndex + 1)
        lineIndex += 1
        charIndex = 0
        if (config?.sound_enabled !== false) tone({ freq: 520 + lineIndex * 60, duration: 0.12, type: 'triangle', gain: 0.05 })
        setTimeout(tick, LINE_GAP_MS)
      }
    }
    setTimeout(tick, 900)
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // راز ① — پنج کلیک روی قلب
  const handleLogoClick = async () => {
    const next = logoClicks + 1
    setLogoClicks(next)
    if (next >= 5) {
      setLogoClicks(0)
      try {
        const res = await post<{ found: boolean; title: string; message: string; attachment?: string }>(
          '/egg',
          { trigger: 'click_logo_5' },
        )
        if (res.found) showEgg({ title: res.title, message: res.message, attachment: res.attachment })
      } catch {
        /* قبل از باز شدن قفل نیاز به نشست دارد */
      }
    }
  }

  const totalChars = lines.reduce((acc, l) => acc + l.label.length, 0)
  const progress = finished
    ? 1
    : Math.min(1, (done * 1 + typed) / Math.max(1, totalChars + lines.length * 2))

  return (
    <motion.div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-5"
      style={{
        backgroundImage: `linear-gradient(165deg, rgba(255,245,249,.9), rgba(243,236,255,.94) 55%, rgba(255,250,243,.9)), url(${
          config?.boot_background || '/backgrounds/boot.jpg'
        })`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.6 }}
    >
      {/* ستاره‌های محو پس‌زمینه */}
      <BootDust />

      {/* ------------------------------------------------------ قلب تپنده */}
      <motion.button
        onClick={handleLogoClick}
        className="relative mb-5"
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        aria-label="LoveOS"
      >
        <motion.span
          className="absolute inset-[-30%] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(247,103,168,.35), transparent 65%)' }}
          animate={{ opacity: [0.4, 0.9, 0.4], scale: [1, 1.18, 1] }}
          transition={{ duration: 1.6, repeat: Infinity }}
        />
        <motion.span
          className="relative block"
          animate={{ scale: [1, 1.14, 1, 1.08, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, times: [0, 0.14, 0.3, 0.44, 1] }}
        >
          {config?.logo ? (
            <img src={config.logo} alt="LoveOS" className="h-24 w-24 rounded-3xl object-cover shadow-soft" />
          ) : (
            <LoveOSLogo size={104} />
          )}
        </motion.span>
        {/* جرقه‌های مداری */}
        <motion.span
          className="pointer-events-none absolute inset-[-26px] block"
          animate={{ rotate: 360 }}
          transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
        >
          {[0, 90, 200, 290].map((deg, i) => (
            <span
              key={deg}
              className="absolute text-[10px]"
              style={{
                left: `${50 + 47 * Math.cos((deg * Math.PI) / 180)}%`,
                top: `${50 + 47 * Math.sin((deg * Math.PI) / 180)}%`,
                color: i % 2 ? '#f767a8' : '#bba0fb',
              }}
            >
              ✦
            </span>
          ))}
        </motion.span>
      </motion.button>

      {/* ---------------------------------------------------- عنوان نسخه */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="os-title text-center text-2xl"
        style={{ color: 'var(--os-accent)' }}
      >
        {t('boot.version')}
      </motion.p>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="mt-1 text-sm os-hand"
        style={{ color: 'var(--os-muted)' }}
      >
        {t('boot.forYou')}
      </motion.p>

      {/* --------------------------------------------------- خطوط بایوس */}
      <div className="mt-7 w-full max-w-[340px] space-y-2" dir="auto">
        {lines.map((line, i) => {
          if (i < done) {
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-baseline gap-2 text-[13px]"
                dir={line.status === '❤' ? 'rtl' : undefined}
              >
                <span className="shrink-0 font-medium">{line.label}</span>
                <span className="flex-1 border-b-2 border-dotted" style={{ borderColor: 'var(--os-border)' }} />
                <motion.span
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                  className="shrink-0 font-bold"
                  style={{ color: line.status === '❤' ? 'var(--os-accent)' : 'var(--ok, #3fa36a)' }}
                >
                  {line.status}
                </motion.span>
              </motion.div>
            )
          }
          if (i === done && !finished) {
            return (
              <div key={i} className="flex items-baseline gap-2 text-[13px]" dir={line.label.length > 0 && /\p{Script=Arabic}/u.test(line.label) ? 'rtl' : undefined}>
                <span className="shrink-0 font-medium">
                  {line.label.slice(0, typed)}
                  <span className="animate-pulse" style={{ color: 'var(--os-accent)' }}>▌</span>
                </span>
              </div>
            )
          }
          return null
        })}
      </div>

      {/* ---------------------------------------------------- نوار پیشرفت */}
      <div className="mt-7 h-1.5 w-full max-w-[340px] overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'linear-gradient(90deg,#ff8cc0,#bba0fb)' }}
          animate={{ width: `${progress * 100}%` }}
          transition={{ ease: 'easeOut', duration: 0.3 }}
        />
      </div>

      {/* ---------------------------------------------- کپی‌رایت و سلام */}
      <AnimatePresence>
        {finished && (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="mt-6 text-center"
          >
            <p className="text-xs os-muted" style={{ letterSpacing: '0.04em' }}>
              {t('boot.copyright', { daddy: config?.daddy_name || 'بابا', daughter: config?.daughter_name || 'دخترم' })}
            </p>
            <p className="os-title mt-3 text-2xl leading-relaxed" style={{ color: 'var(--os-accent)' }}>
              {config?.boot_greeting || t('boot.forYou')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

/** غبار ستاره‌ای محو در پس‌زمینه‌ی بوت */
function BootDust() {
  const items = useRef(
    Array.from({ length: 22 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 4,
      size: 2 + Math.random() * 3,
    })),
  ).current
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {items.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, background: 'var(--os-accent)' }}
          animate={{ opacity: [0.08, 0.5, 0.08], y: [0, -12, 0] }}
          transition={{ duration: 4 + s.delay, delay: s.delay, repeat: Infinity }}
        />
      ))}
    </div>
  )
}
