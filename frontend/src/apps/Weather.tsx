/**
 * Weather — آب‌وهوای دو شهر با انیمیشن آسمان و پیام عاشقانه‌ی مقایسه.
 */
import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '../shared/Icon'
import { digits } from '../shared/format'
import { Loading, useApi } from '../shared/ui'

interface Side {
  city: string
  ok?: boolean
  temp: number | null
  humidity?: number
  wind?: number
  label: string
  icon: string
  sunrise?: string | null
  sunset?: string | null
}

const ICON: Record<string, IconName> = { sun: 'sun', cloud: 'cloud', rain: 'rain', snow: 'snow', fog: 'cloud', storm: 'rain' }
const SKY: Record<string, string> = {
  sun: 'linear-gradient(160deg,#ffe9a8,#ffd0e0)',
  cloud: 'linear-gradient(160deg,#dbe6f5,#eee6f7)',
  rain: 'linear-gradient(160deg,#c7d6ea,#dcd3ef)',
  snow: 'linear-gradient(160deg,#eef4ff,#fbf1f8)',
  fog: 'linear-gradient(160deg,#e3e3e8,#efe9f3)',
  storm: 'linear-gradient(160deg,#b9c3d8,#cfc4e4)',
}

/** قطره‌های باران یا دانه‌های برف */
function Precip({ kind }: { kind: string }) {
  const drops = useMemo(
    () => Array.from({ length: kind === 'snow' ? 14 : 20 }).map((_, i) => ({ id: i, x: Math.random() * 100, d: Math.random() * 2, dur: 0.9 + Math.random() })),
    [kind],
  )
  if (kind !== 'rain' && kind !== 'snow') return null
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {drops.map((d) => (
        <motion.span
          key={d.id}
          className="absolute text-[11px]"
          style={{ left: `${d.x}%`, color: 'rgba(255,255,255,.9)' }}
          initial={{ y: -14, opacity: 0 }}
          animate={{ y: 120, opacity: [0, 1, 0] }}
          transition={{ duration: kind === 'snow' ? d.dur * 2.4 : d.dur, delay: d.d, repeat: Infinity, ease: 'linear' }}
        >
          {kind === 'snow' ? '❄' : '│'}
        </motion.span>
      ))}
    </div>
  )
}

function Card({ side, label }: { side: Side; label: string }) {
  const { t } = useTranslation()
  const hhmm = (iso?: string | null) => (iso ? digits(iso.slice(11, 16)) : '—')
  return (
    <div className="relative overflow-hidden rounded-3xl p-4" style={{ background: SKY[side.icon] || SKY.cloud, color: '#4a2c40' }}>
      <Precip kind={side.icon} />
      <div className="relative">
        <p className="text-[11px] opacity-70">{label}</p>
        <p className="os-title text-lg">{side.city}</p>
        <div className="mt-2 flex items-center gap-3">
          <span className={side.icon === 'sun' ? 'animate-float' : ''}>
            <Icon name={ICON[side.icon] || 'cloud'} size={44} />
          </span>
          <div>
            <p className="os-title text-3xl">{side.temp != null ? `${digits(Math.round(side.temp))}°` : '—'}</p>
            <p className="text-xs opacity-80">{side.label}</p>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 text-[11px] opacity-80">
          <span>{t('weather.humidity')}: {side.humidity != null ? `${digits(side.humidity)}٪` : '—'}</span>
          <span>{t('weather.wind')}: {side.wind != null ? digits(Math.round(side.wind)) : '—'}</span>
          <span>{t('weather.sunrise')}: {hhmm(side.sunrise)}</span>
          <span>{t('weather.sunset')}: {hhmm(side.sunset)}</span>
        </div>
      </div>
    </div>
  )
}

export default function Weather() {
  const { t } = useTranslation()
  const { data, loading } = useApi<{ daddy: Side; daughter: Side; message: string }>('/weather')
  if (loading) return <Loading />
  if (!data) return <p className="os-empty">{t('weather.unavailable')}</p>

  return (
    <div className="space-y-3">
      <Card side={data.daddy} label={t('weather.daddyCity')} />
      <Card side={data.daughter} label={t('weather.daughterCity')} />
      {data.message && (
        <p className="pt-1 text-center text-sm os-hand" style={{ color: 'var(--os-accent)' }}>{data.message}</p>
      )}
      {data.daddy.temp == null && <p className="text-center text-xs os-muted">{t('weather.unavailable')}</p>}
    </div>
  )
}
