/**
 * Mood — حال دلم
 * انتخاب حال، پیام و ویس اختصاصی بابا برای همان حال.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { useMotionAllowed, useQualityTier } from '../shared/depth'
import { playClick } from '../shared/sound'
import { ApiStatus, AudioPlayer, Empty, useApi } from '../shared/ui'

interface MoodItem { mood: string; label: string }

const EMOJI: Record<string, string> = {
  happy: '😊', missing: '🥺', tired: '😴', sad: '😢', excited: '🤩', sleepy: '🌙',
}

export default function Mood() {
  const { t } = useTranslation()
  // ⚠️ هوک‌ها عمداً بالایِ هر دو ``return`` زودهنگامِ پایین‌اند (loading/error
  //    و فهرستِ خالی). اگر زیرشان بودند، Rules-of-Hooks نقض می‌شد.
  const tier = useQualityTier()
  const allowed = useMotionAllowed()
  const deep = allowed && tier !== 'lite'
  const { data, loading, error } = useApi<{ items: MoodItem[] }>('/moods')
  const [selected, setSelected] = useState<string | null>(null)
  const [reply, setReply] = useState<{ message: string; voice: string | null } | null>(null)

  const choose = async (m: MoodItem) => {
    playClick()
    setSelected(m.mood)
    setReply(null)
    const res = await post<{ message: string; voice: string | null }>('/moods/set', { mood: m.mood })
    setReply({ message: res.message, voice: res.voice })
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  return (
    <div className="space-y-4">
      <p className="os-title text-center text-lg">{t('mood.question')}</p>

      {/* ``os-stage-3d`` روی خودِ گرید است نه روی پنجره: گرید ``overflow``
          ندارد، پس تله‌ی R-C سافاری (تخت‌شدنِ عمق زیرِ ظرفِ بریده) اینجا
          پیش نمی‌آید. در مهتاب پرسپکتیویش عملاً بی‌نهایت است. */}
      <div className="os-stage-3d grid grid-cols-3 gap-3">
        {items.map((m, i) => {
          const on = selected === m.mood
          // مقادیرِ سه‌بعدی در ``dz`` ضرب می‌شوند تا در مهتاب دقیقاً همان
          // انیمیشنِ قبلی (فقط opacity و scale) اجرا شود.
          const dz = deep ? 1 : 0
          return (
            <motion.button
              key={m.mood}
              initial={{ opacity: 0, scale: 0.85, rotateX: 18 * dz, z: -46 * dz }}
              animate={{ opacity: 1, scale: 1, rotateX: 0, z: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 210, damping: 20 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => void choose(m)}
              className="os-card relative flex flex-col items-center gap-1 p-3"
              style={{ borderColor: on ? 'var(--os-accent)' : undefined }}
            >
              {/* گویِ نورانی پشتِ ایموجی — لحظه‌ی امضاییِ این اپ. عمداً یک
                  عنصرِ جداست چون ``animate-beat`` روی خودِ ایموجی
                  ``transform`` می‌نویسد و دو منبعِ transform روی یک عنصر
                  همدیگر را بی‌صدا می‌بلعند. */}
              {on && deep && (
                <motion.span
                  className="os-orb pointer-events-none absolute"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 0.55, scale: 1 }}
                  transition={{ duration: 0.42 }}
                  style={{
                    width: 46,
                    height: 46,
                    top: 4,
                    left: '50%',
                    marginLeft: -23,
                    ['--orb-core' as string]: 'var(--os-accent-soft)',
                    ['--orb-edge' as string]: 'var(--os-accent)',
                  }}
                  aria-hidden
                />
              )}
              <span className={`relative text-3xl ${on ? 'animate-beat' : ''}`}>{EMOJI[m.mood] || '💗'}</span>
              <span className="text-[11px]">{m.label}</span>
            </motion.button>
          )
        })}
      </div>

      <AnimatePresence>
        {reply && (
          <motion.div
            initial={{ opacity: 0, y: 10, rotateX: -9 * (deep ? 1 : 0) }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            exit={{ opacity: 0 }}
            className="os-card space-y-2 p-4"
            // ``transformPerspective`` در ``style`` است نه ``transition``:
            // پرسپکتیو را روی خودِ عنصرِ متحرک می‌گذارد تا به یک جدِ دارای
            // ``perspective`` نیاز نباشد (و جدِ اینجا یک ظرفِ اسکرول است).
            style={{ transformPerspective: 900 }}
          >
            <p className="text-xs os-muted">{t('mood.saved')}</p>
            {reply.message && <p className="whitespace-pre-line text-sm leading-7">{reply.message}</p>}
            {reply.voice && <AudioPlayer src={reply.voice} compact autoPlay />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
