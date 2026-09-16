/**
 * Countdown — شمارش معکوس تا دیدار بعدی و مناسبت‌ها
 * دخترم هم می‌تواند تایمر اضافه کند.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '../shared/Icon'
import { DateField } from '../shared/JalaliDatePicker'
import { del, post } from '../shared/api'
import { digits, formatDate } from '../shared/format'
import { playSuccess } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Empty, useApi } from '../shared/ui'

interface Item {
  id: number
  title: string
  target: string
  icon: string
  done_message: string
  days: number
  hours: number
  minutes: number
  reached: boolean
}

const ICONS: Record<string, IconName> = {
  plane: 'map', heart: 'heart', cake: 'star', ring: 'achievements', gift: 'vault', star: 'star',
}

const ICON_CHOICES = ['heart', 'plane', 'cake', 'gift', 'star', 'ring'] as const

function Unit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex-1 rounded-2xl p-2 text-center" style={{ background: 'var(--os-accent-soft)' }}>
      <p className="os-title text-2xl tabular-nums" style={{ color: 'var(--os-accent)' }}>{digits(value)}</p>
      <p className="text-[10px] os-muted">{label}</p>
    </div>
  )
}

export default function CountdownApp() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useApi<{ items: Item[] }>('/countdowns')
  const [, setTick] = useState(0)
  const [showAdd, setShowAdd] = useState(false)

  // هر دقیقه تازه‌سازی برای زنده بودن شمارش
  useEffect(() => {
    const id = setInterval(() => { setTick((x) => x + 1); void reload() }, 60_000)
    return () => clearInterval(id)
  }, [reload])

  if (loading || error) return <ApiStatus loading={loading} error={error} onRetry={() => void reload()} />
  const items = data?.items || []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="os-title flex-1 text-sm">{t('countdown.title')}</p>
        <button className="os-chip os-chip-active" onClick={() => setShowAdd((v) => !v)}>
          <Icon name={showAdd ? 'minus' : 'plus'} size={14} /> {t('countdown.addTimer')}
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <AddForm onDone={async () => { setShowAdd(false); await reload() }} />
          </motion.div>
        )}
      </AnimatePresence>

      {items.length === 0 ? (
        <Empty text={t('countdown.noItems')} />
      ) : (
        <div className="space-y-3">
          {items.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="os-card p-4"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl animate-float" style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}>
                  <Icon name={ICONS[c.icon] || 'countdown'} size={18} />
                </span>
                <div className="flex-1">
                  <h4 className="os-title text-base">{c.title}</h4>
                  <p className="text-[11px] os-muted">{formatDate(c.target)}</p>
                </div>
                <button
                  className="os-muted rounded-full p-1 hover:bg-black/5"
                  onClick={async () => { await del(`/countdowns/${c.id}`); await reload() }}
                  title={t('os.delete')}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>

              {c.reached ? (
                <p className="mt-3 text-center text-sm animate-beat" style={{ color: 'var(--os-accent)' }}>
                  {c.done_message || t('countdown.reached')}
                </p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Unit value={c.days} label={t('os.days')} />
                  <Unit value={c.hours} label={t('os.hours')} />
                  <Unit value={c.minutes} label={t('os.minutes')} />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('12:00')
  const [icon, setIcon] = useState<(typeof ICON_CHOICES)[number]>('heart')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date) return
    setBusy(true)
    try {
      const target = `${date}T${time}:00`
      await post('/countdowns', { title: title.trim(), target, icon, done_message: msg || 'رسیدیم! 🎉' })
      playSuccess()
      showToast(t('os.saved'), 'love')
      onDone()
    } catch {
      showToast(t('os.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="os-card space-y-2 p-3">
      <input className="os-input" placeholder={t('countdown.titlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex gap-2">
        <div className="flex-1">
          <DateField value={date} onChange={setDate} placeholder={t('countdown.datePlaceholder')} />
        </div>
        <input className="os-input w-28" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ICON_CHOICES.map((ic) => (
          <button key={ic} type="button" className={`os-chip ${icon === ic ? 'os-chip-active' : ''}`} onClick={() => setIcon(ic)}>
            <Icon name={ICONS[ic] || 'star'} size={14} /> {ic}
          </button>
        ))}
      </div>
      <input className="os-input" placeholder={t('countdown.donePlaceholder')} value={msg} onChange={(e) => setMsg(e.target.value)} />
      <button type="submit" className="os-btn-primary w-full" disabled={busy}>
        {busy ? t('os.uploading') : t('countdown.addAction')}
      </button>
    </form>
  )
}
