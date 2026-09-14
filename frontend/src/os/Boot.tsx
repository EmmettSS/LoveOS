/**
 * Boot.tsx — دنباله‌ی بوت سینمایی LoveOS
 * خط‌ها تایپ می‌شوند، ملودی نرم پخش می‌شود و در پایان «سلام دخترم…» می‌آید.
 * راز ①: پنج بار کلیک روی لوگو.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { LoveOSLogo } from '../shared/Icon'
import { post } from '../shared/api'
import { playBootMelody, playTypeTick } from '../shared/sound'
import { useOS } from '../shared/store'

const LINE_KEYS = ['boot.line1', 'boot.line2', 'boot.line3', 'boot.line4', 'boot.line5', 'boot.line6']

export function Boot() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const setPhase = useOS((s) => s.setPhase)
  const showEgg = useOS((s) => s.showEgg)
  const [lines, setLines] = useState<string[]>([])
  const [typed, setTyped] = useState('')
  const [greeting, setGreeting] = useState(false)
  const [logoClicks, setLogoClicks] = useState(0)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    if (config?.sound_enabled !== false) playBootMelody()

    let lineIndex = 0
    let charIndex = 0
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      if (lineIndex >= LINE_KEYS.length) {
        setGreeting(true)
        setTimeout(() => !cancelled && setPhase('lock'), 2600)
        return
      }
      const full = t(LINE_KEYS[lineIndex])
      if (charIndex <= full.length) {
        setTyped(full.slice(0, charIndex))
        if (charIndex % 3 === 0 && config?.sound_enabled !== false) playTypeTick()
        charIndex += 1
        setTimeout(tick, 26)
      } else {
        setLines((prev) => [...prev, full])
        setTyped('')
        lineIndex += 1
        charIndex = 0
        setTimeout(tick, 240)
      }
    }
    setTimeout(tick, 700)
    return () => {
      cancelled = true
    }
  }, [config, setPhase, t])

  // راز ① — پنج کلیک روی لوگو
  const handleLogoClick = async () => {
    const next = logoClicks + 1
    setLogoClicks(next)
    if (next >= 5) {
      setLogoClicks(0)
      try {
        const res = await post<{ found: boolean; title: string; message: string; attachment?: string }>('/egg', {
          trigger: 'click_logo_5',
        })
        if (res.found) showEgg({ title: res.title, message: res.message, attachment: res.attachment })
      } catch {
        /* قبل از باز شدن قفل نیاز به نشست دارد */
      }
    }
  }

  return (
    <motion.div
      className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden px-6"
      style={{
        backgroundImage: `linear-gradient(160deg, rgba(255,245,249,.86), rgba(243,236,255,.9)), url(${
          config?.boot_background || '/backgrounds/boot.jpg'
        })`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.6 }}
    >
      <motion.button
        onClick={handleLogoClick}
        className="mb-8 animate-float"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        aria-label="LoveOS"
      >
        {config?.logo ? (
          <img src={config.logo} alt="LoveOS" className="h-24 w-24 rounded-3xl object-cover shadow-soft" />
        ) : (
          <LoveOSLogo size={104} />
        )}
      </motion.button>

      <div className="w-full max-w-sm space-y-1.5 text-right text-[13px] leading-6 os-muted" dir="ltr">
        {lines.map((line) => (
          <motion.div
            key={line}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="font-mono tracking-tight"
          >
            {line}
          </motion.div>
        ))}
        {typed && <div className="font-mono tracking-tight">{typed}<span className="animate-pulse">▌</span></div>}
      </div>

      <AnimatePresence>
        {greeting && (
          <motion.p
            initial={{ opacity: 0, y: 18, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="os-title mt-10 text-center text-2xl leading-relaxed"
            style={{ color: 'var(--os-accent)' }}
          >
            {config?.boot_greeting || t('boot.line1')}
          </motion.p>
        )}
      </AnimatePresence>

      <button onClick={() => setPhase('lock')} className="absolute bottom-8 text-xs os-muted underline-offset-4 hover:underline">
        {t('boot.skip')}
      </button>
    </motion.div>
  )
}
