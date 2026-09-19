/**
 * Boot.tsx — صفحه‌ی بوت سینمایی LoveOS - نسخه قلب+بی‌نهایت
 *
 * تغییرات جدید:
 *   • لوگوی قلب+بی‌نهایت با افکت سینمایی کامل: ساخته شدن از ذرات نور
 *   • جریان نور داخل بی‌نهایت (Infinity Flow)
 *   • درخشش الماس‌ها روی سمت چپ قلب (مثل آویز نقره‌ای)
 *   • نمودار ECG که از داخل بی‌نهایت عبور می‌کند
 *   • نور جارویی روی لوگو (Shimmer Sweep)
 *   • ذرات شناور و هاله‌های تقویت شده
 */

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { digits } from '../shared/format'
import { playBootMelody, playSuccess, playTypeTick, tone } from '../shared/sound'
import { useOS } from '../shared/store'
import { useFitScale } from '../shared/useFitScale'

type Tone = 'ok' | 'cyan' | 'violet' | 'pink' | 'amber' | 'heart'

interface BootLine {
  label: string
  status: string
  tone?: Tone
  ellipsis?: boolean
  final?: boolean
}

const START_MS = 650
const CHAR_MS = 16
const LINE_GAP_MS = 230
const END_HOLD_MS = 2100
const SKIP_HOLD_MS = 850

const TONE_COLOR: Record<Tone, string> = {
  ok: '#4ade80',
  cyan: '#67e8f9',
  violet: '#c4b5fd',
  pink: '#f9a8d4',
  amber: '#fcd34d',
  heart: '#fb7ab8',
}

const MONO_STACK = "ui-monospace, 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace"
const FA_STACK = "'Vazirmatn', 'Segoe UI', Tahoma, sans-serif"

// مسیر قلب+بی‌نهایت - دقیقاً مشابه آویز مرجع
const HEART_INFINITY_PATH = `M32 22
           C 24 14, 10 15, 8.5 26
           C 7 36, 17 43, 26 50
           C 26 46.5, 29 42.5, 33 41
           C 36 39.8, 39 40.5, 39 42.8
           C 39 45.1, 36 46, 33.5 44.8
           C 31 43.6, 32.5 40.5, 36 39.5
           C 39.5 38.5, 43 36.8, 45.5 34.2
           C 48 31.6, 48.5 29, 46.5 27.5
           C 44.5 26, 42 27, 42 29.2
           C 42 31.4, 44.5 32.4, 46.5 31.4
           C 48.5 30.4, 48 28, 45.5 27.2
           C 43 26.4, 40.5 28.2, 41.5 30.5
           C 42.5 32.8, 46 31.5, 48.5 29
           C 51 26.5, 50 15.5, 41 13.5
           C 37 12.5, 33.5 14.5, 32 22Z`

export function Boot() {
  const { t, i18n } = useTranslation()
  const isFa = i18n.language !== 'en'
  const config = useOS((s) => s.config)
  const setPhase = useOS((s) => s.setPhase)
  const showEgg = useOS((s) => s.showEgg)

  const lines = useMemo(() => {
    const value = t('boot.lines', { returnObjects: true })
    return Array.isArray(value) ? (value as BootLine[]) : []
  }, [t])

  const [done, setDone] = useState(0)
  const [typed, setTyped] = useState(0)
  const [finished, setFinished] = useState(false)
  const [logoClicks, setLogoClicks] = useState(0)
  const timersRef = useRef<Set<number>>(new Set())
  const finishedRef = useRef(false)

  const soundOn = () => useOS.getState().config?.sound_enabled !== false

  useEffect(() => {
    if (finishedRef.current) return
    if (!lines.length) return
    const timers = timersRef.current
    timers.forEach(clearTimeout)
    timers.clear()
    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        timers.delete(id)
        fn()
      }, ms)
      timers.add(id)
      return id
    }

    let cancelled = false
    let lineIndex = 0
    let charIndex = 0
    let localFinished = false

    const finish = () => {
      if (cancelled || localFinished) return
      localFinished = true
      finishedRef.current = true
      setDone(lines.length)
      setTyped(0)
      setFinished(true)
      if (soundOn()) playSuccess()
      later(() => {
        if (!cancelled) setPhase('lock')
      }, END_HOLD_MS)
    }

    const tick = () => {
      if (cancelled || finishedRef.current) return
      if (lineIndex >= lines.length) return finish()
      const line = lines[lineIndex]
      if (charIndex <= line.label.length) {
        setTyped(charIndex)
        if (charIndex > 0 && charIndex % 3 === 0 && soundOn()) playTypeTick()
        charIndex += 1
        later(tick, CHAR_MS)
      } else {
        setDone(lineIndex + 1)
        if (soundOn()) {
          tone({ freq: 470 + (lineIndex + 1) * 52, duration: 0.13, type: 'triangle', gain: 0.055 })
        }
        lineIndex += 1
        charIndex = 0
        later(tick, LINE_GAP_MS)
      }
    }

    if (soundOn()) playBootMelody()
    later(tick, START_MS)

    return () => {
      cancelled = true
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [lines, setPhase])

  const skip = () => {
    if (finishedRef.current) return
    finishedRef.current = true
    timersRef.current.forEach(clearTimeout)
    timersRef.current.clear()
    setDone(lines.length)
    setTyped(0)
    setFinished(true)
    if (soundOn()) playSuccess()
    const id = window.setTimeout(() => setPhase('lock'), SKIP_HOLD_MS)
    timersRef.current.add(id)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault()
        skip()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const handleLogoClick = async (e: React.MouseEvent) => {
    e.stopPropagation()
    const next = logoClicks + 1
    setLogoClicks(next)
    if (next < 5) return
    setLogoClicks(0)
    try {
      const res = await post<{ found: boolean; title: string; message: string; attachment?: string }>(
        '/egg',
        { trigger: 'click_logo_5' },
      )
      if (res.found) showEgg({ title: res.title, message: res.message, attachment: res.attachment })
    } catch {
      /* قبل از باز شدن قفل نشستی وجود ندارد */
    }
  }

  const totalChars = lines.reduce((acc, l) => acc + l.label.length, 0)
  let progress = 1
  if (!finished) {
    const doneChars = lines.slice(0, done).reduce((acc, l) => acc + l.label.length, 0)
    progress = Math.min(0.99, (doneChars + typed) / Math.max(1, totalChars + lines.length * 3))
  }
  const pct = Math.round(progress * 100)
  const bootBg = config?.boot_background || '/backgrounds/boot.jpg'
  const { ref: fitRef, scale: fit } = useFitScale<HTMLDivElement>()

  return (
    <motion.div
      onClick={skip}
      dir={isFa ? 'rtl' : 'ltr'}
      className="os-screen relative flex cursor-pointer select-none flex-col items-center justify-center px-5 py-6"
      style={{
        background:
          'radial-gradient(110% 80% at 50% 0%, #241030 0%, #160a20 48%, #0a0410 100%)',
      }}
      exit={{ opacity: 0, scale: 1.04, filter: 'brightness(1.25)' }}
      transition={{ duration: 0.6 }}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center opacity-[0.15] mix-blend-screen"
        style={{ backgroundImage: `url(${bootBg})` }}
        aria-hidden
      />
      <motion.span
        className="pointer-events-none absolute -left-20 -top-24 h-80 w-80 rounded-full blur-3xl"
        style={{ background: 'rgba(247,103,168,.20)' }}
        animate={{ x: [-24, 34, -24], y: [-8, 22, -8] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <motion.span
        className="pointer-events-none absolute -bottom-28 -right-16 h-96 w-96 rounded-full blur-3xl"
        style={{ background: 'rgba(130,110,255,.20)' }}
        animate={{ x: [26, -30, 26], y: [10, -18, 10] }}
        transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      />
      <BootSky />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.10]"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,.08) 0 1px, transparent 1px 3px)',
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: 'radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(5,2,10,.75) 100%)' }}
        aria-hidden
      />

      <div
        ref={fitRef}
        data-fit-column="boot"
        className="relative z-10 flex w-full flex-col items-center"
        style={fit < 1 ? { transform: `scale(${fit})` } : undefined}
      >
        {/* قلب + بی‌نهایت سینمایی */}
        <motion.div
          className="relative z-10 mb-5 grid h-[170px] w-[170px] place-items-center"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        >
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-dashed"
            style={{ borderColor: 'rgba(247,103,168,.55)', boxShadow: '0 0 20px rgba(247,103,168,.2)' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 14, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            className="absolute inset-[11px] rounded-full border"
            style={{ borderColor: 'rgba(187,160,251,.40)', borderStyle: 'dotted', boxShadow: '0 0 15px rgba(187,160,251,.15)' }}
            animate={{ rotate: -360 }}
            transition={{ duration: 21, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            className="absolute inset-[24px] rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(247,103,168,.38), transparent 68%)' }}
            animate={{ opacity: [0.45, 1, 0.45], scale: [1, 1.14, 1] }}
            transition={{ duration: 1.7, repeat: Infinity }}
          />
          <ParticleFormation />
          <DiamondSparkles />
          <motion.button
            onClick={handleLogoClick}
            aria-label="LoveOS"
            className="relative z-10 grid place-items-center rounded-[28px] outline-none"
            animate={{ scale: [1, 1.13, 1, 1.06, 1] }}
            transition={{ duration: 1.35, repeat: Infinity, times: [0, 0.14, 0.3, 0.44, 1] }}
          >
            {config?.logo ? (
              <img src={config.logo} alt="LoveOS" className="h-[88px] w-[88px] rounded-3xl object-cover" />
            ) : (
              <CinematicHeartInfinity size={100} />
            )}
          </motion.button>
          <InfinityFlow />
          {finished && <HeartBurst />}
          <EcgLineInfinity />
          <ShimmerSweep />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.7 }}
          className="os-title relative z-10 text-center text-[28px] text-white"
          style={{ textShadow: '0 0 26px rgba(247,103,168,.6)' }}
        >
          {t('boot.version')}
        </motion.p>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75, duration: 0.8 }}
          className="os-hand relative z-10 mt-1 text-center text-[13px]"
          style={{ color: 'rgba(253,231,243,.78)' }}
        >
          {t('boot.tagline')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.7 }}
          className="relative z-10 mt-6 w-full max-w-[400px] overflow-hidden rounded-2xl border backdrop-blur-md"
          style={{
            background: 'rgba(16,9,26,.68)',
            borderColor: 'rgba(247,103,168,.26)',
            boxShadow: '0 34px 90px -34px rgba(247,103,168,.55), inset 0 1px 0 rgba(255,255,255,.06)',
          }}
        >
          <div
            className="flex items-center gap-2 border-b px-4 py-2.5"
            style={{ borderColor: 'rgba(255,255,255,.08)', background: 'rgba(255,255,255,.03)' }}
            dir="ltr"
          >
            <span className="h-3 w-3 rounded-full" style={{ background: '#ff5f57', boxShadow: '0 0 8px rgba(255,95,87,.6)' }} />
            <span className="h-3 w-3 rounded-full" style={{ background: '#febc2e', boxShadow: '0 0 8px rgba(254,188,46,.5)' }} />
            <span className="h-3 w-3 rounded-full" style={{ background: '#28c840', boxShadow: '0 0 8px rgba(40,200,64,.55)' }} />
            <span
              className="flex-1 text-center text-[11px]"
              style={{ fontFamily: MONO_STACK, color: 'rgba(253,231,243,.55)' }}
            >
              {t('boot.terminalTitle')}
            </span>
            <span className="w-[44px]" />
          </div>

          <div
            className="space-y-[7px] px-4 py-4"
            dir={isFa ? 'rtl' : 'ltr'}
            style={{
              fontFamily: isFa ? FA_STACK : MONO_STACK,
              fontSize: isFa ? 13 : 12.5,
              minHeight: lines.length * 26 + 10,
            }}
          >
            {lines.map((line, i) => {
              const tone: Tone = line.tone || 'ok'
              const isRtlLine = isFa || /\p{Script=Arabic}/u.test(line.label)

              if (i < done) {
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: isRtlLine ? 8 : -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-baseline gap-2"
                  >
                    <span className="shrink-0 font-medium" style={{ color: 'rgba(246,235,255,.94)' }}>
                      {line.label}
                    </span>
                    <span
                      className="flex-1 border-b-2 border-dotted"
                      style={{ borderColor: 'rgba(255,255,255,.13)' }}
                    />
                    {line.final ? (
                      <motion.span
                        className="shrink-0 text-[15px] leading-none"
                        style={{ color: TONE_COLOR.heart, textShadow: '0 0 12px rgba(251,122,184,.9)' }}
                        animate={{ scale: [1, 1.4, 1, 1.18, 1] }}
                        transition={{ duration: 1.1, repeat: Infinity, times: [0, 0.16, 0.32, 0.48, 1] }}
                      >
                        ❤
                      </motion.span>
                    ) : (
                      <motion.span
                        initial={{ scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 420, damping: 17 }}
                        className="flex shrink-0 items-center font-bold"
                        style={{ color: TONE_COLOR[tone], textShadow: `0 0 12px ${TONE_COLOR[tone]}55` }}
                      >
                        {line.status}
                        {line.ellipsis && <BouncingDots color={TONE_COLOR[tone]} />}
                      </motion.span>
                    )}
                  </motion.div>
                )
              }

              if (i === done && !finished) {
                const labelDone = typed >= line.label.length
                return (
                  <div key={i} className="flex items-baseline gap-2">
                    <span className="shrink-0 font-medium" style={{ color: 'rgba(246,235,255,.94)' }}>
                      {line.label.slice(0, typed)}
                      <span className="animate-pulse" style={{ color: TONE_COLOR.heart }}>
                        ▌
                      </span>
                    </span>
                    <span className="flex-1" />
                    {labelDone && (
                      <span className="shrink-0">
                        <BouncingDots color={line.final ? TONE_COLOR.heart : 'rgba(253,231,243,.7)'} />
                      </span>
                    )}
                  </div>
                )
              }

              return <div key={i} className="h-[18px]" />
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="relative z-10 mt-6 w-full max-w-[400px]"
        >
          <div
            className="mb-2 flex items-center justify-between text-[11px]"
            dir="ltr"
            style={{ fontFamily: MONO_STACK, color: 'rgba(253,231,243,.62)' }}
          >
            <span>
              {t('boot.loadingPhrase')}
              {!finished && <BouncingDots color="rgba(253,231,243,.62)" />}
            </span>
            <span style={{ color: '#f9a8d4', textShadow: '0 0 10px rgba(249,168,212,.6)' }}>
              {digits(pct)}%
            </span>
          </div>
          <div
            className="h-[7px] w-full overflow-hidden rounded-full"
            style={{ background: 'rgba(255,255,255,.08)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.05)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: 'linear-gradient(90deg,#ff8cc0,#bba0fb)',
                boxShadow: '0 0 16px rgba(247,103,168,.75)',
              }}
              animate={{ width: `${pct}%` }}
              transition={{ ease: 'linear', duration: 0.18 }}
            />
          </div>
          <motion.p
            className="mt-3 text-center text-[10.5px]"
            style={{ color: 'rgba(253,231,243,.45)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.9, 0.9, 0] }}
            transition={{ duration: 6, times: [0, 0.12, 0.75, 1] }}
          >
            {t('boot.skipHint')}
          </motion.p>
        </motion.div>
      </div>

      <AnimatePresence>
        {finished && (
          <motion.div
            className="fixed inset-0 z-20 flex flex-col items-center justify-center px-8 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            style={{
              background:
                'radial-gradient(80% 60% at 50% 42%, rgba(30,12,38,.35), rgba(8,3,13,.92))',
            }}
          >
            <motion.p
              initial={{ y: 14, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.12, duration: 0.6 }}
              className="text-[12px] font-bold"
              dir="auto"
              style={{
                fontFamily: isFa ? FA_STACK : MONO_STACK,
                color: '#4ade80',
                textShadow: '0 0 14px rgba(74,222,128,.6)',
              }}
            >
              [ {t('boot.complete')} ]
            </motion.p>
            <motion.h2
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.28, duration: 0.7 }}
              className="os-title mt-4 text-[30px] leading-snug text-white"
              style={{ textShadow: '0 0 30px rgba(247,103,168,.65)' }}
            >
              {config?.boot_greeting || t('boot.welcome')}
            </motion.h2>
            <motion.p
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.46, duration: 0.7 }}
              className="mt-4 text-[11.5px]"
              style={{ color: 'rgba(253,231,243,.72)' }}
            >
              {t('boot.copyright', {
                daddy: config?.daddy_name || (isFa ? 'بابا' : 'Daddy'),
                daughter: config?.daughter_name || (isFa ? 'دخترم' : 'my love'),
              })}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function BouncingDots({ color }: { color: string }) {
  return (
    <span className="mx-1 inline-flex items-baseline gap-[2px]" dir="ltr" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          style={{ color, fontSize: '13px', lineHeight: 1 }}
          animate={{ y: [0, -3, 0], opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.16, ease: 'easeInOut' }}
        >
          .
        </motion.span>
      ))}
    </span>
  )
}

/** لوگوی سینمایی قلب+بی‌نهایت - ساخته شدن از ذرات نور */
function CinematicHeartInfinity({ size = 100 }: { size?: number }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className="relative z-10">
        <defs>
          <linearGradient id="boot-heart-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff9ecb" />
            <stop offset="55%" stopColor="#f767a8" />
            <stop offset="100%" stopColor="#bba0fb" />
          </linearGradient>
          <linearGradient id="boot-heart-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff9ecb" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#bba0fb" stopOpacity="0.8" />
          </linearGradient>
          <filter id="boot-glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* سایه و هاله پس‌زمینه */}
        <path
          d={HEART_INFINITY_PATH}
          fill="none"
          stroke="url(#boot-heart-glow)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.15"
          filter="url(#boot-glow)"
        />
        {/* مسیر اصلی با انیمیشن ساخته شدن */}
        <motion.path
          d={HEART_INFINITY_PATH}
          fill="none"
          stroke="url(#boot-heart-g)"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.2, ease: 'easeInOut', delay: 0.3 }}
        />
        {/* لایه درخشان دوم با تاخیر */}
        <motion.path
          d={HEART_INFINITY_PATH}
          fill="none"
          stroke="url(#boot-heart-glow)"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.6"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2, ease: 'easeInOut', delay: 0.6 }}
          style={{ filter: 'blur(0.5px)' }}
        />
      </svg>
      {/* هاله مرکزی تپنده */}
      <motion.div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: '60%',
          height: '60%',
          background: 'radial-gradient(circle, rgba(247,103,168,.25), transparent 70%)',
        }}
        animate={{ scale: [1, 1.3, 1], opacity: [0.3, 0.6, 0.3] }}
        transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

/** ذرات نور که از اطراف جمع می‌شوند و لوگو را می‌سازند */
function ParticleFormation() {
  const particles = useRef(
    Array.from({ length: 18 }).map((_, i) => ({
      id: i,
      // موقعیت اولیه پراکنده در اطراف
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      size: 1.5 + Math.random() * 2.5,
      delay: Math.random() * 1.2,
      duration: 1.5 + Math.random() * 1,
      color: i % 3 === 0 ? '#ff9ecb' : i % 3 === 1 ? '#f767a8' : '#bba0fb',
    })),
  ).current

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          }}
          initial={{ x: p.x, y: p.y, opacity: 0, scale: 0 }}
          animate={{ x: 0, y: 0, opacity: [0, 1, 0], scale: [0, 1.2, 0] }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            repeatDelay: 3 + Math.random() * 2,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

/** درخشش الماس‌ها - سمت چپ قلب (جایی که در آویز نگین دارد) */
function DiamondSparkles() {
  const sparkles = useRef(
    Array.from({ length: 7 }).map((_, i) => ({
      id: i,
      // موقعیت روی سمت چپ و بالای قلب
      left: 18 + (i % 3) * 8 + Math.random() * 4,
      top: 22 + Math.floor(i / 3) * 12 + Math.random() * 6,
      delay: i * 0.3 + Math.random() * 0.5,
      size: 2 + Math.random() * 2.5,
    })),
  ).current

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {sparkles.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            boxShadow: '0 0 6px #fff, 0 0 12px #ff9ecb',
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.4, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 1.2,
            delay: s.delay,
            repeat: Infinity,
            repeatDelay: 1.5 + Math.random() * 2,
            ease: 'easeInOut',
          }}
        />
      ))}
      {/* ستاره‌های کوچک الماسی */}
      {sparkles.slice(0, 3).map((s) => (
        <motion.span
          key={`star-${s.id}`}
          className="absolute text-[8px]"
          style={{ left: `${s.left + 2}%`, top: `${s.top - 2}%`, color: '#fff' }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.2, 0], rotate: [0, 90] }}
          transition={{
            duration: 0.8,
            delay: s.delay + 0.2,
            repeat: Infinity,
            repeatDelay: 2,
          }}
        >
          ✦
        </motion.span>
      ))}
    </div>
  )
}

/** جریان نور داخل بی‌نهایت - افکت Flow */
function InfinityFlow() {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-[100px] w-[100px] -translate-x-1/2 -translate-y-1/2"
      style={{ zIndex: 11 }}
    >
      <defs>
        <linearGradient id="inf-flow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff9ecb" stopOpacity="0" />
          <stop offset="20%" stopColor="#ff9ecb" stopOpacity="1" />
          <stop offset="50%" stopColor="#fff" stopOpacity="1" />
          <stop offset="80%" stopColor="#bba0fb" stopOpacity="1" />
          <stop offset="100%" stopColor="#bba0fb" stopOpacity="0" />
        </linearGradient>
        <filter id="inf-glow">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* بی‌نهایت کوچک در پایین راست */}
      <motion.path
        d="M26 50 C26 46.5 29 42.5 33 41 C36 39.8 39 40.5 39 42.8 C39 45.1 36 46 33.5 44.8 C31 43.6 32.5 40.5 36 39.5 C39.5 38.5 43 36.8 45.5 34.2 C48 31.6 48.5 29 46.5 27.5 C44.5 26 42 27 42 29.2 C42 31.4 44.5 32.4 46.5 31.4 C48.5 30.4 48 28 45.5 27.2 C43 26.4 40.5 28.2 41.5 30.5 C42.5 32.8 46 31.5 48.5 29"
        fill="none"
        stroke="url(#inf-flow)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#inf-glow)"
        strokeDasharray="3 6"
        initial={{ strokeDashoffset: 0 }}
        animate={{ strokeDashoffset: -18 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
      {/* نقطه نور متحرک داخل بی‌نهایت */}
      <motion.circle
        r="1.8"
        fill="#fff"
        style={{ filter: 'drop-shadow(0 0 4px #fff)' }}
        initial={{ opacity: 0 }}
        animate={{
          opacity: [0, 1, 1, 0],
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <animateMotion
          path="M26 50 C26 46.5 29 42.5 33 41 C36 39.8 39 40.5 39 42.8 C39 45.1 36 46 33.5 44.8 C31 43.6 32.5 40.5 36 39.5 C39.5 38.5 43 36.8 45.5 34.2 C48 31.6 48.5 29 46.5 27.5 C44.5 26 42 27 42 29.2 C42 31.4 44.5 32.4 46.5 31.4 C48.5 30.4 48 28 45.5 27.2 C43 26.4 40.5 28.2 41.5 30.5 C42.5 32.8 46 31.5 48.5 29"
          dur="2.5s"
          repeatCount="indefinite"
        />
      </motion.circle>
    </svg>
  )
}

/** نور جارویی روی لوگو */
function ShimmerSweep() {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden rounded-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0, 1, 0] }}
      transition={{ duration: 2.5, repeat: Infinity, repeatDelay: 4, times: [0, 0.2, 0.8, 1] }}
      aria-hidden
    >
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,.35) 50%, transparent 70%)',
        }}
        initial={{ x: '-100%' }}
        animate={{ x: '200%' }}
        transition={{ duration: 1.2, repeat: Infinity, repeatDelay: 4, ease: 'easeInOut' }}
      />
    </motion.div>
  )
}

/** نمودار ECG که از داخل بی‌نهایت عبور می‌کند - نسخه سینمایی */
function EcgLineInfinity() {
  return (
    <svg
      viewBox="0 0 280 56"
      fill="none"
      aria-hidden
      className="pointer-events-none absolute -bottom-1 left-1/2 h-12 w-[280px] -translate-x-1/2"
    >
      <defs>
        <linearGradient id="boot-ecg-inf" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#f767a8" stopOpacity="0" />
          <stop offset="15%" stopColor="#f767a8" stopOpacity="0.6" />
          <stop offset="35%" stopColor="#ff9ecb" stopOpacity="1" />
          <stop offset="55%" stopColor="#f767a8" stopOpacity="1" />
          <stop offset="75%" stopColor="#bba0fb" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#bba0fb" stopOpacity="0" />
        </linearGradient>
        <filter id="ecg-glow">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* ECG اصلی که از قلب عبور می‌کند و داخل بی‌نهایت می‌پیچد */}
      <motion.path
        d="M0 28 H60 l6 -0.5 l6 8 l8 -20 l7 14 l5 -1.5
           C 100 27, 115 22, 125 28
           C 135 34, 125 40, 115 34
           C 105 28, 115 22, 125 28
           C 135 34, 130 40, 120 38
           C 110 36, 105 32, 108 28
           L 140 28 H280"
        stroke="url(#boot-ecg-inf)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#ecg-glow)"
        initial={false}
        animate={{ pathLength: [0, 1], opacity: [0.9, 0.9, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, times: [0, 0.7, 1], ease: 'easeInOut' }}
      />
      {/* نقطه ضربان که همراه ECG حرکت می‌کند */}
      <motion.circle
        r="2.2"
        fill="#ff9ecb"
        style={{ filter: 'drop-shadow(0 0 4px #f767a8)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 1, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, times: [0, 0.1, 0.8, 1] }}
      >
        <animateMotion
          path="M0 28 H60 l6 -0.5 l6 8 l8 -20 l7 14 l5 -1.5 C 100 27, 115 22, 125 28 C 135 34, 125 40, 115 34 C 105 28, 115 22, 125 28 C 135 34, 130 40, 120 38 C 110 36, 105 32, 108 28 L 140 28 H280"
          dur="2.2s"
          repeatCount="indefinite"
        />
      </motion.circle>
    </svg>
  )
}

function HeartBurst() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {Array.from({ length: 14 }).map((_, i) => {
        const angle = (i / 14) * Math.PI * 2
        const isInfinity = i % 3 === 0
        return (
          <motion.span
            key={i}
            className="absolute text-[12px]"
            style={{ left: '50%', top: '50%', color: isInfinity ? '#bba0fb' : '#f767a8' }}
            initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
            animate={{
              x: Math.cos(angle) * (70 + (i % 3) * 10),
              y: Math.sin(angle) * (70 + (i % 3) * 10),
              opacity: 0,
              scale: 0.2,
            }}
            transition={{ duration: 1.3, ease: 'easeOut', delay: i * 0.04 }}
          >
            {isInfinity ? '∞' : '❤'}
          </motion.span>
        )
      })}
    </div>
  )
}

function BootSky() {
  const stars = useRef(
    Array.from({ length: 32 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 4,
      duration: 3 + Math.random() * 4,
      size: 1.5 + Math.random() * 2.5,
    })),
  ).current

  const hearts = useRef(
    Array.from({ length: 10 }).map((_, i) => ({
      id: i,
      left: 6 + Math.random() * 88,
      size: 9 + Math.random() * 9,
      duration: 9 + Math.random() * 8,
      delay: Math.random() * 10,
      sway: 14 + Math.random() * 22,
      color: ['#f767a8', '#bba0fb', '#ffd1e6', '#c4b5fd'][i % 4],
    })),
  ).current

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {stars.map((s) => (
        <motion.span
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size }}
          animate={{ opacity: [0.08, 0.85, 0.08], scale: [1, 1.35, 1] }}
          transition={{ duration: s.duration, delay: s.delay, repeat: Infinity }}
        />
      ))}

      {[
        { top: '12%', delay: 3, duration: 1.6 },
        { top: '30%', delay: 9, duration: 1.9 },
        { top: '58%', delay: 5, duration: 2.1 },
      ].map((m, i) => (
        <motion.span
          key={i}
          className="absolute h-px w-24"
          style={{
            top: m.top,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,.9), transparent)',
          }}
          initial={{ left: '-15%', opacity: 0 }}
          animate={{ left: ['-15%', '115%'], opacity: [0, 1, 1, 0] }}
          transition={{ duration: m.duration, delay: m.delay, repeat: Infinity, repeatDelay: 7, ease: 'easeIn' }}
        />
      ))}

      {hearts.map((h) => (
        <motion.span
          key={h.id}
          className="absolute"
          style={{ left: `${h.left}%`, bottom: '-6%', fontSize: h.size, color: h.color, opacity: 0 }}
          animate={{
            y: ['0vh', '-105vh'],
            x: [0, h.sway, -h.sway, 0],
            opacity: [0, 0.75, 0.75, 0],
          }}
          transition={{ duration: h.duration, delay: h.delay, repeat: Infinity, ease: 'linear' }}
        >
          ❤
        </motion.span>
      ))}

      {/* ذرات بی‌نهایت شناور */}
      {Array.from({ length: 4 }).map((_, i) => (
        <motion.span
          key={`inf-${i}`}
          className="absolute text-[10px]"
          style={{
            left: `${20 + i * 22}%`,
            bottom: '-4%',
            color: '#bba0fb',
            opacity: 0,
          }}
          animate={{
            y: ['0vh', '-110vh'],
            x: [0, 10, -10, 0],
            opacity: [0, 0.5, 0.5, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: 12 + i * 2,
            delay: i * 3,
            repeat: Infinity,
            ease: 'linear',
          }}
        >
          ∞
        </motion.span>
      ))}
    </div>
  )
}
