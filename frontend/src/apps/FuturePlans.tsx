/**
 * FuturePlans — آرزوهای ما
 * لیست مشترک؛ دخترم می‌تواند اضافه کند و تیک بزند. تیک خوردن به بابا خبر می‌دهد.
 */
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { del, patch, post } from '../shared/api'
import { digits } from '../shared/format'
import { playSuccess } from '../shared/sound'
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

export default function FuturePlans() {
  const { t } = useTranslation()
  const { data, loading, reload } = useApi<{ items: Plan[] }>('/plans')
  const [title, setTitle] = useState('')
  const [cat, setCat] = useState<(typeof CATS)[number]>('wish')
  const [filter, setFilter] = useState<'all' | (typeof CATS)[number]>('all')

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await post('/plans', { title: title.trim(), category: cat })
    setTitle('')
    await reload()
  }

  const toggle = async (p: Plan) => {
    if (!p.is_done) playSuccess()
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
              className="os-card flex items-center gap-3 p-3"
            >
              <button
                onClick={() => void toggle(p)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition active:scale-90"
                style={{
                  background: p.is_done ? 'var(--os-accent)' : 'transparent',
                  border: `1.5px solid ${p.is_done ? 'var(--os-accent)' : 'var(--os-border)'}`,
                  color: '#fff',
                }}
                aria-label={t('os.done')}
              >
                {p.is_done && <Icon name="check" size={14} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm" style={{ textDecoration: p.is_done ? 'line-through' : undefined, opacity: p.is_done ? 0.6 : 1 }}>
                  {CAT_EMOJI[p.category]} {p.title}
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
