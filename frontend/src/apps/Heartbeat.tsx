/**
 * Heartbeat — ضربان قلب سه‌بعدی
 * تپش دوفازی، صدا و لرزش هماهنگ؛ نگه‌داشتن انگشت → bpm بالاتر.
 */
import { motion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { digits } from '../shared/format'
import { playHeartbeat, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'

const HeartbeatSceneView = lazy(() => import('../three/components/HeartbeatScene'))

export default function Heartbeat() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const [holding, setHolding] = useState(false)
  const [bpm, setBpm] = useState(72)
  const beatRef = useRef<number | null>(null)

  useEffect(() => {
    const id = setInterval(() => {
      setBpm((b) => {
        const target = holding ? 122 : 72
        return Math.round(b + (target - b) * 0.18)
      })
    }, 400)
    return () => clearInterval(id)
  }, [holding])

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

  const fallback = (
    <motion.div
      animate={{ scale: [1, 1.14, 1, 1.08, 1] }}
      transition={{ duration: 60 / bpm, repeat: Infinity, ease: 'easeInOut' }}
      className="relative select-none"
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
    </motion.div>
  )

  return (
    <div
      className="relative flex h-full min-h-[420px] flex-col items-center justify-center gap-4 overflow-hidden"
      style={{ background: 'radial-gradient(70% 60% at 50% 40%, #3a1528 0%, #120810 70%)' }}
      onPointerDown={() => setHolding(true)}
      onPointerUp={() => setHolding(false)}
      onPointerLeave={() => setHolding(false)}
      onPointerCancel={() => setHolding(false)}
    >
      <p className="relative z-10 os-title text-lg text-pink-200">{t('heartbeat.feelIt')}</p>

      <div className="relative z-10 w-full max-w-xs" aria-label={t('heartbeat.feelIt')}>
        <Suspense fallback={<div className="flex justify-center py-8">{fallback}</div>}>
          <HeartbeatSceneView bpm={bpm} holding={holding} fallback={fallback} />
        </Suspense>
      </div>

      <div className="relative z-10 text-center">
        <p className="os-title text-3xl tabular-nums text-pink-300">{digits(bpm)}</p>
        <p className="text-xs text-white/50">{t('heartbeat.bpm')}</p>
      </div>

      <p className="relative z-10 max-w-xs px-4 text-center text-sm leading-7 text-white/75">
        {config?.today_message || t('heartbeat.caption')}
      </p>
      <p className="relative z-10 text-xs text-white/45">{t('heartbeat.hold')}</p>
    </div>
  )
}
