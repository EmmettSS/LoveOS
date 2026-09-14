/**
 * FuturePlans — آرزوهای ما
 * لیست مشترک؛ دخترم می‌تواند اضافه کند و تیک بزند. تیک خوردن به بابا خبر
 * می‌دهد و با «تیک قلبی» + بارش اکلیل رنگی جشن گرفته می‌شود (نه خط خورده).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { del, patch, post } from '../shared/api'
import { digits } from '../shared/format'
import { playSuccess, tone } from '../shared/sound'
import { Chips, Empty, Loading, useApi } from '../shared/ui'

interface Plan {
  id: number
  title: string
  category: 'travel' | 'work' | 'wish' | 'home'
  is_done: boolean
  added_by: 'daddy' | 'daughter'
  note: string
}

const CATS = ['travel', 'work', 'wish', 'home'] as const
const CAT_EMOJI: Record<string, string> = { travel: '✈️', work: '💼', wish: '✨', home: '🏡' }

const SPARK_COLORS = ['#f767a8', '#bba0fb', '#fbbf24', '#34d399', '#38bdf8', '#fb7185']

/** بارش اکلیل رنگی هنگام تیک خوردن آرزو */
function SparkleBurst({ seed }: { seed: number }) {
  const parts = Array.from({ length: 16 }).map((_, i) => {
    const angle = (i / 16) * Math.PI * 2 + (seed % 7) * 0.3
    const dist = 26 + ((seed + i * 13) % 30)
    return {
      id: i,
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist - 8,
      color: SPARK_COLORS[(i + seed) % SPARK_COLORS.length],
      size: 5 + ((seed + i) % 5),
      heart: i % 4 === 0,
    }
  })
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {parts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute"
          style={{ color: p.color, fontSize: p.size + 6 }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1.15, rotate: p.heart ? 180 : 90 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        >
          {p.heart ? '❤' : '✦'}
        </motion.span>
      ))}
    </div>
  )
}

export default function FuturePlans() {
  const { t } = useTranslation()
  const { data, loading, reload } = useApi<{ items: Plan[] }>('/plans')
  const [title, setTitle] = useState('')
  const [cat, setCat] = useState<(typeof CATS)[number]>('wish')
  const [filter, setFilter] = useState<'all' | (typeof CATS)[number]>('all')
  const [celebrate, setCelebrate] = useState<number | null>(null)

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await post('/plans', { title: title.trim(), category: cat })
    setTitle('')
    await reload()
  }

  const toggle = async (p: Plan) => {
    if (!p.is_done) {
      playSuccess()
      tone({ freq: 1046, duration: 0.4, type: 'sine', gain: 0.05 })
      setCelebrate(p.id)
      setTimeout(() => setCelebrate(null), 1000)
    }
    await patch(`/plans/${p.id}`, { is_done: !p.is_done })
    await reload()
  }

  const remove = async (p: Plan) => {
    await del(`/plans/${p.id}`)
    await reload()
  }

  if (loading) return <Loading />
  const items = data?.items || []
  const shown = filter === 'all' ? items : items.filter((p) => p.category === filter)
  const done = items.filter((p) => p.is_done).length

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="os-card space-y-2 p-3">
        <input className="os-input" placeholder={t('plans.addPlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex items-center gap-2">
          <Chips items={CATS.map((c) => ({ key: c, label: `${CAT_EMOJI[c]} ${t(`plans.categories.${c}`)}` }))} value={cat} onChange={setCat} />
          <button type="submit" className="os-btn-primary ms-auto !px-4 !py-2">{t('os.add')}</button>
        </div>
      </form>

      <div className="flex items-center gap-2">
        <Chips
          items={[{ key: 'all' as const, label: t('os.all') }, ...CATS.map((c) => ({ key: c, label: t(`plans.categories.${c}`) }))]}
          value={filter}
          onChange={setFilter}
        />
        <span className="ms-auto shrink-0 text-[11px] os-muted">
          {t('plans.doneCount', { done: digits(done), total: digits(items.length) })}
        </span>
      </div>

      {shown.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-2">
          {shown.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
              className="os-card relative flex items-center gap-3 p-3"
              style={p.is_done ? { borderColor: 'var(--os-accent)' } : undefined}
            >
              {/* اکلیل رنگی هنگام تیک خوردن */}
              <AnimatePresence>
                {celebrate === p.id && <SparkleBurst seed={p.id} />}
              </AnimatePresence>

              <button
                onClick={() => void toggle(p)}
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                style={{
                  background: p.is_done ? 'linear-gradient(135deg,#ff8cc0,#f767a8)' : 'transparent',
                  border: `1.5px solid ${p.is_done ? 'transparent' : 'var(--os-border)'}`,
                  color: '#fff',
                  boxShadow: p.is_done ? '0 4px 14px -4px rgba(247,103,168,.8)' : 'none',
                }}
                aria-label={t('os.done')}
              >
                <AnimatePresence mode="popLayout">
                  {p.is_done ? (
                    /* تیک قلبی: قلبی که تیک دارد */
                    <motion.span
                      key="heart"
                      initial={{ scale: 0, rotate: -90 }}
                      animate={{ scale: [0, 1.35, 1], rotate: 0 }}
                      transition={{ duration: 0.5, times: [0, 0.6, 1] }}
                      className="flex h-full w-full items-center justify-center"
                    >
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                        <path
                          d="M12 20.5s-8.2-5.3-8.2-10.9A4.8 4.8 0 0 1 12 7a4.8 4.8 0 0 1 8.2 2.6c0 5.6-8.2 10.9-8.2 10.9Z"
                          fill="currentColor"
                          opacity="0.35"
                        />
                        <path
                          d="m8.4 12.2 2.5 2.5 4.7-4.9"
                          stroke="currentColor"
                          strokeWidth="2.1"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </motion.span>
                  ) : (
                    <motion.span key="empty" initial={{ scale: 0.4 }} animate={{ scale: 1 }} exit={{ scale: 0.4 }} />
                  )}
                </AnimatePresence>
              </button>

              <div className="min-w-0 flex-1">
                {/* بدون خط خورده: متن کامل خوانده می‌شود؛ قلب کنارش می‌درخشد */}
                <p className="flex items-center gap-1.5 text-sm" style={{ opacity: p.is_done ? 0.85 : 1 }}>
                  <span className="min-w-0 break-words">{CAT_EMOJI[p.category]} {p.title}</span>
                  {p.is_done && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1, rotate: [0, 12, -10, 0] }}
                      transition={{ delay: 0.15 }}
                      className="shrink-0 text-sm"
                      style={{ animation: 'beat 1.6s ease-in-out infinite' }}
                    >
                      💖
                    </motion.span>
                  )}
                </p>
                <p className="text-[10px] os-muted">
                  {t('plans.addedBy')} {p.added_by === 'daddy' ? t('plans.byDaddy') : t('plans.byMe')}
                </p>
              </div>

              {p.added_by === 'daughter' && (
                <button onClick={() => void remove(p)} className="shrink-0 rounded-lg p-1.5 os-muted transition hover:bg-black/5">
                  <Icon name="trash" size={15} />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
