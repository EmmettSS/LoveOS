/**
 * Heartbeat — ضربان قلب بابا
 * قلبی که می‌تپد، صدای لاب-داب و لرزش هماهنگ؛ با نگه‌داشتن انگشت تندتر می‌شود.
 */
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { digits } from '../shared/format'
import { playHeartbeat, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'

export default function Heartbeat() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const [holding, setHolding] = useState(false)
  const [bpm, setBpm] = useState(72)
  const beatRef = useRef<number | null>(null)

  // ضربان: با نگه‌داشتن تا ۱۲۰ بالا می‌رود، رها که کنی آرام می‌شود
  useEffect(() => {
    const id = setInterval(() => {
      setBpm((b) => {
        const target = holding ? 122 : 72
        return Math.round(b + (target - b) * 0.18)
      })
    }, 400)
    return () => clearInterval(id)
  }, [holding])

  // هر ضربان: صدا + لرزش کوتاه
  useEffect(() => {
    const period = 60_000 / bpm
    const tick = () => {
      playHeartbeat(1)
      vibrate([28, 90, 34])
      beatRef.current = window.setTimeout(tick, period)
    }
    beatRef.current = window.setTimeout(tick, period)
    return () => {
      if (beatRef.current) window.clearTimeout(beatRef.current)
    }
  }, [bpm])

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-6 os-no-select">
      <p className="os-title text-lg" style={{ color: 'var(--os-accent)' }}>{t('heartbeat.feelIt')}</p>

      <motion.button
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        animate={{ scale: [1, 1.14, 1, 1.08, 1] }}
        transition={{ duration: 60 / bpm, repeat: Infinity, ease: 'easeInOut' }}
        className="relative select-none"
        aria-label={t('heartbeat.feelIt')}
      >
        <svg width="190" height="190" viewBox="0 0 24 24">
          <defs>
            <radialGradient id="hb" cx="50%" cy="35%">
              <stop offset="0%" stopColor="#ffb3d4" />
              <stop offset="70%" stopColor="#f767a8" />
              <stop offset="100%" stopColor="#d6467f" />
            </radialGradient>
          </defs>
          <path
            d="M12 21.5s-8.6-5.6-8.6-11.4A5.1 5.1 0 0 1 12 7.4a5.1 5.1 0 0 1 8.6 2.7c0 5.8-8.6 11.4-8.6 11.4Z"
            fill="url(#hb)"
          />
        </svg>
        <span className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 70px 10px rgba(247,103,168,.35)' }} />
      </motion.button>

      <div className="text-center">
        <p className="os-title text-3xl tabular-nums" style={{ color: 'var(--os-accent)' }}>{digits(bpm)}</p>
        <p className="text-xs os-muted">{t('heartbeat.bpm')}</p>
      </div>

      <p className="max-w-xs text-center text-sm leading-7">{config?.today_message || t('heartbeat.caption')}</p>
      <p className="text-xs os-muted">{t('heartbeat.hold')}</p>
    </div>
  )
}
