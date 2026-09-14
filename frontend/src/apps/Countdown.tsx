/**
 * Countdown — شمارش معکوس تا دیدار بعدی و مناسبت‌ها
 */
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '../shared/Icon'
import { digits, formatDate } from '../shared/format'
import { Empty, Loading, useApi } from '../shared/ui'

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
  const { data, loading, reload } = useApi<{ items: Item[] }>('/countdowns')
  const [, setTick] = useState(0)

  // هر دقیقه تازه‌سازی برای زنده بودن شمارش
  useEffect(() => {
    const id = setInterval(() => { setTick((x) => x + 1); void reload() }, 60_000)
    return () => clearInterval(id)
  }, [reload])

  if (loading) return <Loading />
  const items = data?.items || []
  if (items.length === 0) return <Empty text={t('countdown.noItems')} />

  return (
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
  )
}
