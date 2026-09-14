/**
 * Mood — حال دلم
 * انتخاب حال، پیام و ویس اختصاصی بابا برای همان حال.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { playClick } from '../shared/sound'
import { AudioPlayer, Empty, Loading, useApi } from '../shared/ui'

interface MoodItem { mood: string; label: string }

const EMOJI: Record<string, string> = {
  happy: '😊', missing: '🥺', tired: '😴', sad: '😢', excited: '🤩', sleepy: '🌙',
}

export default function Mood() {
  const { t } = useTranslation()
  const { data, loading } = useApi<{ items: MoodItem[] }>('/moods')
  const [selected, setSelected] = useState<string | null>(null)
  const [reply, setReply] = useState<{ message: string; voice: string | null } | null>(null)

  const choose = async (m: MoodItem) => {
    playClick()
    setSelected(m.mood)
    setReply(null)
    const res = await post<{ message: string; voice: string | null }>('/moods/set', { mood: m.mood })
    setReply({ message: res.message, voice: res.voice })
  }

  if (loading) return <Loading />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  return (
    <div className="space-y-4">
      <p className="os-title text-center text-lg">{t('mood.question')}</p>

      <div className="grid grid-cols-3 gap-3">
        {items.map((m, i) => (
          <motion.button
            key={m.mood}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => void choose(m)}
            className="os-card flex flex-col items-center gap-1 p-3"
            style={{ borderColor: selected === m.mood ? 'var(--os-accent)' : undefined }}
          >
            <span className={`text-3xl ${selected === m.mood ? 'animate-beat' : ''}`}>{EMOJI[m.mood] || '💗'}</span>
            <span className="text-[11px]">{m.label}</span>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {reply && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="os-card space-y-2 p-4">
            <p className="text-xs os-muted">{t('mood.saved')}</p>
            {reply.message && <p className="whitespace-pre-line text-sm leading-7">{reply.message}</p>}
            {reply.voice && <AudioPlayer src={reply.voice} compact autoPlay />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
