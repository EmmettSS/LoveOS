/**
 * EggOverlay.tsx — پرده‌ی رازها
 * وقتی دخترم یک راز پیدا می‌کند، قلب‌ها می‌بارند و پیام بابا ظاهر می‌شود.
 * هیچ‌جای رابط کاربری اشاره‌ای به وجود رازها نمی‌شود؛ فقط همین لحظه‌ی غافلگیری.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { playSuccess, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'

export function EggOverlay() {
  const { t } = useTranslation()
  const egg = useOS((s) => s.eggOverlay)
  const showEgg = useOS((s) => s.showEgg)

  useEffect(() => {
    if (egg) {
      playSuccess()
      vibrate([40, 60, 40])
    }
  }, [egg])

  const confetti = useMemo(
    () =>
      Array.from({ length: 34 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.9,
        dur: 2.4 + Math.random() * 2,
        size: 12 + Math.random() * 18,
        char: ['❤', '💖', '✨', '🌸', '⭐'][i % 5],
      })),
    [egg],
  )

  return (
    <AnimatePresence>
      {egg && (
        <motion.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => showEgg(null)}
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {confetti.map((c) => (
              <motion.span
                key={c.id}
                className="absolute"
                style={{ left: `${c.x}%`, fontSize: c.size }}
                initial={{ y: -60, opacity: 0, rotate: 0 }}
                animate={{ y: '110vh', opacity: [0, 1, 1, 0], rotate: 360 }}
                transition={{ duration: c.dur, delay: c.delay, repeat: Infinity, ease: 'linear' }}
              >
                {c.char}
              </motion.span>
            ))}
          </div>

          <motion.div
            initial={{ scale: 0.8, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="os-card relative z-10 w-full max-w-sm p-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 text-4xl animate-beat">💝</div>
            <h3 className="os-title text-xl" style={{ color: 'var(--os-accent)' }}>{egg.title}</h3>
            <p className="mt-3 whitespace-pre-line text-sm leading-7">{egg.message}</p>
            {egg.attachment && (
              <img src={egg.attachment} alt="پیوست راز" className="mt-4 w-full rounded-2xl object-cover" />
            )}
            <button className="os-btn-primary mt-5 w-full" onClick={() => showEgg(null)}>
              {t('os.close')}
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** پیام کوتاه گوشه‌ی صفحه */
export function Toast() {
  const toast = useOS((s) => s.toast)
  return (
    <AnimatePresence>
      {/* پوسته‌ی وسط‌چین: translate روی خودِ motion در RTL پیام را نصفه
          از صفحه بیرون می‌برد؛ کارت واقعی تودرتوست. */}
      {toast && (
        <motion.div
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -20, opacity: 0 }}
          className="pointer-events-none fixed inset-x-0 top-5 z-[95] flex justify-center"
        >
          <div
            className="os-card pointer-events-auto mx-6 w-full max-w-xs px-4 py-3 text-center text-sm"
            style={{ borderColor: toast.tone === 'love' ? 'var(--os-accent)' : 'var(--os-border)' }}
          >
            {toast.text}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
