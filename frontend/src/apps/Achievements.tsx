/**
 * Achievements — نشان‌های دخترم
 * نشان‌های باز شده رنگی‌اند و پیام مخفی بابا را نشان می‌دهند.
 */
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { digits, formatDate } from '../shared/format'
import { Empty, Loading, useApi } from '../shared/ui'

interface A {
  id: number
  code: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  unlocked_at: string | null
  secret_message: string
}

const EMOJI: Record<string, string> = {
  door: '🚪', mic: '🎙️', calendar: '📅', brain: '🧠', letter: '💌', puzzle: '🧩',
  trophy: '🏆', bunny: '🐰', heart: '💗', pill: '💊', spa: '🧖‍♀️', pen: '✍️',
  book: '📖', key: '🔑', crown: '👑', star: '⭐',
}

export default function Achievements() {
  const { t } = useTranslation()
  const { data, loading } = useApi<{ items: A[]; unlocked: number; total: number }>('/achievements')
  const [open, setOpen] = useState<number | null>(null)

  if (loading) return <Loading />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  return (
    <div className="space-y-3">
      <div className="os-card p-3 text-center">
        <p className="os-title text-lg" style={{ color: 'var(--os-accent)' }}>
          {t('achievements.unlocked', { count: digits(data!.unlocked), total: digits(data!.total) })}
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg,#ff9ecb,#bba0fb)' }}
            initial={{ width: 0 }}
            animate={{ width: `${(data!.unlocked / Math.max(1, data!.total)) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.map((a, i) => (
          <motion.button
            key={a.id}
            initial={{ opacity: 0, scale: 0.86 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            onClick={() => setOpen(open === a.id ? null : a.id)}
            className="os-card flex flex-col items-center gap-1 p-3"
            style={{ opacity: a.unlocked ? 1 : 0.45, borderColor: a.unlocked ? 'var(--os-accent)' : undefined }}
          >
            <span className={`text-3xl ${a.unlocked ? '' : 'grayscale'}`}>{EMOJI[a.icon] || '🏅'}</span>
            <span className="text-center text-[11px] leading-4">{a.title}</span>
          </motion.button>
        ))}
      </div>

      {open !== null && (() => {
        const a = items.find((x) => x.id === open)!
        return (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="os-card p-4">
            <p className="os-title text-base">{EMOJI[a.icon] || '🏅'} {a.title}</p>
            <p className="mt-1 text-sm os-muted">{a.description}</p>
            {a.unlocked ? (
              <>
                {a.unlocked_at && <p className="mt-1 text-[11px] os-muted">{formatDate(a.unlocked_at)}</p>}
                {a.secret_message && (
                  <p className="mt-2 rounded-2xl p-3 text-sm leading-7" style={{ background: 'var(--os-accent-soft)' }}>
                    {a.secret_message}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm os-muted">{t('achievements.locked')}</p>
            )}
          </motion.div>
        )
      })()}
    </div>
  )
}
