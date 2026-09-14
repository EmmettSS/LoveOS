/**
 * Weather — آب‌وهوای دو شهر
 * آسمان زنده و انیمیشنی (خورشید، ابر، باران، برف، رعد، مه، شب)،
 * جزئیات کامل (حس دما، رطوبت، باد، فشار، UV، پوشش ابر)، طلوع/غروب
 * و پیش‌بینی ۵ روزه — به‌همراه پیام عاشقانه‌ی مقایسه.
 * نسخه‌ی اصلاح‌شده: رنگ متن‌ها همیشه با تم هماهنگ و خوانا است.
 */
import { motion, animate } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '../shared/Icon'
import { digits, isFa, weekdayName } from '../shared/format'
import { Loading, useApi } from '../shared/ui'

interface ForecastDay {
  date: string | null
  t_max: number | null
  t_min: number | null
  precip_prob: number | null
  label: string
  icon: string
}

interface Side {
  city: string
  ok?: boolean
  temp: number | null
  feels_like?: number | null
  humidity?: number | null
  wind?: number | null
  wind_dir?: string
  pressure?: number | null
  cloud_cover?: number | null
  uv?: number | null
  is_day?: boolean
  label: string
  icon: string
  sunrise?: string | null
  sunset?: string | null
  forecast?: ForecastDay[]
}

const ICON: Record<string, IconName> = { sun: 'sun', cloud: 'cloud', rain: 'rain', snow: 'snow', fog: 'cloud', storm: 'rain' }

/* ------------------------------------------------------ آسمان زنده ---- */
function SkyScene({ icon, isDay }: { icon: string; isDay: boolean }) {
  const drops = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.6,
        dur: 0.8 + Math.random() * 0.9,
      })),
    [],
  )
  const clouds = useMemo(
    () =>
      Array.from({ length: 3 }).map((_, i) => ({
        id: i,
        top: 8 + i * 16 + Math.random() * 8,
        w: 52 + Math.random() * 34,
        delay: i * 1.7,
        dur: 9 + i * 4,
      })),
    [],
  )

  const bg = !isDay
    ? 'linear-gradient(180deg,#1b2145 0%,#2a2f5e 60%,#3a3f74 100%)'
    : {
        sun: 'linear-gradient(180deg,#bfe6ff 0%,#dff2ff 55%,#fff3d6 100%)',
        cloud: 'linear-gradient(180deg,#cfd9e8 0%,#e4e9f2 60%,#f2e9f5 100%)',
        rain: 'linear-gradient(180deg,#9fb4cc 0%,#b9c6d8 60%,#cfc7dd 100%)',
        snow: 'linear-gradient(180deg,#d7e3f2 0%,#eaf1f9 60%,#f7f3fa 100%)',
        fog: 'linear-gradient(180deg,#c9cdd4 0%,#dcdfe4 60%,#eae9ee 100%)',
        storm: 'linear-gradient(180deg,#5c6884 0%,#77829c 60%,#8d8aa6 100%)',
      }[icon] || 'linear-gradient(180deg,#cfd9e8,#f2e9f5)'

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ background: bg }} aria-hidden>
      {!isDay &&
        Array.from({ length: 12 }).map((_, i) => (
          <span
            key={`st${i}`}
            className="absolute animate-twinkle rounded-full bg-white"
            style={{
              left: `${(i * 37) % 100}%`,
              top: `${(i * 53) % 55}%`,
              width: 2 + (i % 3),
              height: 2 + (i % 3),
              animationDelay: `${(i % 5) * 0.6}s`,
            }}
          />
        ))}

      {icon === 'sun' && isDay && (
        <div className="absolute" style={{ top: '12%', insetInlineEnd: '10%' }}>
          <div style={{ position: 'relative', width: 92, height: 92 }}>
            <div
              style={{
                position: 'absolute',
                inset: -26,
                animation: 'loveos-rays 26s linear infinite',
                background:
                  'conic-gradient(from 0deg, rgba(255,205,92,.5) 0 14deg, transparent 14deg 30deg, rgba(255,205,92,.5) 30deg 44deg, transparent 44deg 60deg, rgba(255,205,92,.5) 60deg 74deg, transparent 74deg 90deg, rgba(255,205,92,.5) 90deg 104deg, transparent 104deg 120deg, rgba(255,205,92,.5) 120deg 134deg, transparent 134deg 150deg, rgba(255,205,92,.5) 150deg 164deg, transparent 164deg 180deg, rgba(255,205,92,.5) 180deg 194deg, transparent 194deg 210deg, rgba(255,205,92,.5) 210deg 224deg, transparent 224deg 240deg, rgba(255,205,92,.5) 240deg 254deg, transparent 254deg 270deg, rgba(255,205,92,.5) 270deg 284deg, transparent 284deg 300deg, rgba(255,205,92,.5) 300deg 314deg, transparent 314deg 330deg, rgba(255,205,92,.5) 330deg 344deg, transparent 344deg 360deg)',
                maskImage: 'radial-gradient(circle, transparent 38%, black 40%)',
                WebkitMaskImage: 'radial-gradient(circle, transparent 38%, black 40%)',
              }}
            />
            <div
              className="animate-float"
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background: 'radial-gradient(circle at 38% 34%, #fff7d6, #ffd257 62%, #ffb02e)',
                boxShadow: '0 0 42px 10px rgba(255,200,80,.55)',
              }}
            />
          </div>
        </div>
      )}

      {!isDay && (
        <div
          className="animate-float absolute"
          style={{
            top: '12%',
            insetInlineEnd: '10%',
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'radial-gradient(circle at 36% 32%, #ffffff, #dfe4ff 68%, #c3c9f2)',
            boxShadow: '0 0 34px 8px rgba(210,218,255,.4)',
          }}
        />
      )}

      {(icon === 'cloud' || icon === 'rain' || icon === 'snow' || icon === 'storm') &&
        clouds.map((c) => (
          <div
            key={c.id}
            style={{
              position: 'absolute',
              top: `${c.top}%`,
              width: c.w,
              height: c.w * 0.34,
              borderRadius: 999,
              background: isDay ? 'rgba(255,255,255,.92)' : 'rgba(190,198,225,.75)',
              filter: 'blur(1px)',
              animation: `loveos-drift ${c.dur}s ease-in-out ${c.delay}s infinite`,
            }}
          />
        ))}

      {icon === 'fog' &&
        [18, 34, 50].map((top, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `${top}%`,
              insetInline: '-10%',
              height: 14,
              borderRadius: 999,
              background: 'rgba(255,255,255,.6)',
              filter: 'blur(6px)',
              animation: `loveos-drift ${12 + i * 5}s ease-in-out ${i}s infinite`,
            }}
          />
        ))}

      {icon === 'storm' && (
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(60% 45% at 50% 0%, rgba(255,255,255,.9), transparent 70%)', animation: 'loveos-lightning 4.2s linear infinite' }}
        />
      )}

      {(icon === 'rain' || icon === 'snow') &&
        drops.map((d) => (
          <span
            key={d.id}
            style={{
              position: 'absolute',
              left: `${d.left}%`,
              top: '-8%',
              animation: `loveos-fall ${icon === 'snow' ? d.dur * 3.2 : d.dur}s linear ${d.delay}s infinite`,
              color: isDay ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.85)',
              fontSize: icon === 'snow' ? 11 : 12,
              fontWeight: 700,
            }}
          >
            {icon === 'snow' ? '❄' : '│'}
          </span>
        ))}
    </div>
  )
}

/* ------------------------------------------------------ دمای شمارنده ---- */
function CountUp({ to }: { to: number | null }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (to == null) return
    const controls = animate(0, to, {
      duration: 1.4,
      ease: 'easeOut',
      onUpdate: (v) => setVal(Math.round(v)),
    })
    return () => controls.stop()
  }, [to])
  if (to == null) return <span>—</span>
  return <>{digits(val)}</>
}

/* ------------------------------------------------------- حلقه‌ی رطوبت ---- */
function HumidityRing({ value }: { value: number | null }) {
  const R = 20
  const C = 2 * Math.PI * R
  const pct = value == null ? 0 : value
  return (
    <div className="relative flex h-14 w-14 items-center justify-center">
      <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="28" cy="28" r={R} fill="none" stroke="var(--os-border)" strokeWidth="5" />
        <motion.circle
          cx="28"
          cy="28"
          r={R}
          fill="none"
          stroke="var(--os-accent)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - (C * pct) / 100 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      </svg>
      <span className="absolute text-[10px] font-bold" style={{ color: 'var(--os-text)' }}>{value != null ? `${digits(value)}٪` : '—'}</span>
    </div>
  )
}

/* ------------------------------------------------------------- کارت ---- */
function Card({ side, label }: { side: Side; label: string }) {
  const { t } = useTranslation()
  const isDay = side.is_day ?? true
  const uvTone = side.uv == null ? '' : side.uv < 3 ? '#7dd3fc' : side.uv < 6 ? '#fbbf24' : side.uv < 8 ? '#fb923c' : '#f87171'

  return (
    <div className="relative overflow-hidden rounded-3xl shadow-soft os-card" style={{ padding: 0 }}>
      <div className="relative h-40">
        <SkyScene icon={side.icon} isDay={isDay} />
        <div className="absolute inset-0 flex flex-col justify-between p-4" style={{ background: 'linear-gradient(180deg, transparent 30%, rgba(15,23,42,.42))' }}>
          <div className="flex items-center justify-between">
            <p className="os-title rounded-full bg-white/70 px-3 py-1 text-sm backdrop-blur text-[#4a2c40]">{label}</p>
            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] backdrop-blur text-[#4a2c40]">
              {side.is_day ? '☀️' : '🌙'} {side.label}
            </span>
          </div>
          <div className="flex items-end justify-between">
            <div>
              <p className="os-title text-5xl leading-none text-white drop-shadow-lg">
                {side.temp != null ? (
                  <>
                    <CountUp to={side.temp} />°
                  </>
                ) : (
                  '—'
                )}
              </p>
              <p className="mt-1 text-sm font-semibold text-white/90">{side.city}</p>
            </div>
            {side.feels_like != null && (
              <p className="rounded-full bg-white/70 px-2.5 py-1 text-[11px] backdrop-blur text-[#4a2c40]">
                {t('weather.feelsLike')}: {digits(Math.round(side.feels_like))}°
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {/* ردیف شاخص‌ها — رنگ‌ها با تم هماهنگ و خوانا */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HumidityRing value={side.humidity != null ? Math.round(side.humidity) : null} />
            <div>
              <p className="text-[10px] os-muted">{t('weather.humidity')}</p>
              <p className="text-xs font-bold" style={{ color: 'var(--os-text)' }}>{side.humidity != null ? `${digits(Math.round(side.humidity))}٪` : '—'}</p>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div className="relative h-10 w-10">
              <span
                className="absolute inset-0 flex items-center justify-center text-xl"
                style={{
                  color: 'var(--os-accent)',
                  animation: 'loveos-wind 2.6s ease-in-out infinite',
                }}
              >
                🌬
              </span>
            </div>
            <p className="text-[10px] os-muted">{t('weather.wind')}</p>
            <p className="text-xs font-bold" style={{ color: 'var(--os-text)' }}>
              {side.wind != null ? `${digits(Math.round(side.wind))}` : '—'}
              {side.wind_dir ? ` ${side.wind_dir}` : ''}
            </p>
          </div>

          <div className="flex flex-col items-center">
            <span className="text-xl">🧭</span>
            <p className="text-[10px] os-muted">{t('weather.pressure')}</p>
            <p className="text-xs font-bold" style={{ color: 'var(--os-text)' }}>{side.pressure != null ? digits(Math.round(side.pressure)) : '—'}</p>
          </div>

          <div className="flex flex-col items-center">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: uvTone || 'var(--os-accent)' }}
            >
              {side.uv != null ? digits(Math.round(side.uv)) : '—'}
            </span>
            <p className="text-[10px] os-muted">UV</p>
          </div>
        </div>

        {/* طلوع و غروب + پوشش ابر — پس‌زمینه روشن با متن تیره‌ی خوانا */}
        <div className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-[11px] os-card" style={{ background: 'var(--os-accent-soft)' }}>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--os-text)' }}>
            <Icon name="sun" size={14} /> {t('weather.sunrise')}:{' '}
            <b>{side.sunrise ? digits(side.sunrise.slice(11, 16)) : '—'}</b>
          </span>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--os-text)' }}>
            <Icon name="moon" size={14} /> {t('weather.sunset')}:{' '}
            <b>{side.sunset ? digits(side.sunset.slice(11, 16)) : '—'}</b>
          </span>
          {side.cloud_cover != null && (
            <span className="flex items-center gap-1" style={{ color: 'var(--os-text)' }}>
              <Icon name="cloud" size={14} /> {t('weather.cloudCover')} <b>{digits(Math.round(side.cloud_cover))}٪</b>
            </span>
          )}
        </div>

        {/* پیش‌بینی ۵ روزه — کارت‌های روشن با متن خوانا */}
        {side.forecast && side.forecast.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {side.forecast.map((d, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="flex min-w-[60px] flex-1 flex-col items-center gap-1 rounded-2xl p-2.5 os-card"
                style={{ background: 'var(--os-accent-soft)' }}
              >
                <span className="text-[9px]" style={{ color: 'var(--os-muted)' }}>{forecastDayName(d.date, i, t)}</span>
                <Icon name={ICON[d.icon] || 'cloud'} size={20} style={{ color: 'var(--os-accent)' }} />
                <span className="text-[10px] font-bold" style={{ color: 'var(--os-text)' }}>
                  {d.t_max != null ? `${digits(Math.round(d.t_max))}°` : '—'}
                  <span className="font-normal" style={{ color: 'var(--os-muted)' }}> / {d.t_min != null ? `${digits(Math.round(d.t_min))}°` : '—'}</span>
                </span>
                {d.precip_prob != null && d.precip_prob > 0 && (
                  <span className="text-[9px]" style={{ color: '#3b82f6' }}>
                    💧{digits(d.precip_prob)}٪
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function forecastDayName(date: string | null, i: number, t: (k: string) => string): string {
  if (i === 0) return t('weather.today')
  if (i === 1) return t('weather.tomorrow')
  if (!date) return ''
  const d = new Date(`${date}T12:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return isFa() ? weekdayName(d).slice(0, 4) : d.toLocaleDateString('en-GB', { weekday: 'short' })
}

/* ------------------------------------------------------------- اپ ---- */
export default function Weather() {
  const { t } = useTranslation()
  const { data, loading } = useApi<{ daddy: Side; daughter: Side; message: string }>('/weather')
  if (loading) return <Loading />
  if (!data) return <p className="os-empty">{t('weather.unavailable')}</p>

  const diff =
    data.daddy.temp != null && data.daughter.temp != null
      ? Math.abs(Math.round(data.daddy.temp) - Math.round(data.daughter.temp))
      : null

  return (
    <div className="space-y-3">
      <Card side={data.daddy} label={t('weather.daddyCity')} />
      <Card side={data.daughter} label={t('weather.daughterCity')} />

      {(data.message || diff != null) && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="os-card flex items-center gap-3 p-3"
        >
          <motion.span
            className="text-2xl"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          >
            💞
          </motion.span>
          <div className="min-w-0 flex-1">
            {data.message && <p className="text-sm leading-6 os-hand">{data.message}</p>}
            {diff != null && (
              <p className="text-[11px] os-muted">
                {t('weather.tempDiff', { diff: digits(diff) })}
              </p>
            )}
          </div>
          <span className="os-title shrink-0 text-lg" style={{ color: 'var(--os-accent)' }}>
            {diff != null ? `${digits(diff)}°` : '❤'}
          </span>
        </motion.div>
      )}

      {data.daddy.temp == null && <p className="text-center text-xs os-muted">{t('weather.unavailable')}</p>}
    </div>
  )
}
