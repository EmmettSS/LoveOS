/**
 * Desktop.tsx — دسکتاپ LoveOS
 * ویجت‌ها (ساعت، دیدار بعدی، آب‌وهوای دو شهر، پیام امروز) + شبکه‌ی آیکن‌ها + داک
 * راز ⑥: بین ۰۰:۰۰ تا ۰۵:۰۰ آسمان پر از قلب و ستاره می‌شود.
 * راز ⑦/⑧: تولد و سالگرد → آیکن مخفی کیک/قلب.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { digits, formatDate, formatTime, weekdayName } from '../shared/format'
import { playOpen } from '../shared/sound'
import { useOS } from '../shared/store'
import { APPS, effectiveAppOrder } from './appRegistry'
import { Dock } from './Dock'
import { GlobalSearch } from './GlobalSearch'
import { NotificationCenter } from './NotificationCenter'
import { StartMenu } from './StartMenu'
import { AppWindow } from './Window'
import { useNightMode } from './daynight'

interface NextCallPayload {
  item: {
    id: number
    date: string
    time: string
    status_label?: string
    duration_minutes?: number
    topic?: string
    seconds_to_start: number
    sides_time?: Record<string, { city: string; time: string }>
  } | null
}

interface WeatherPayload {
  daddy: { city: string; temp: number | null; label: string; icon: string }
  daughter: { city: string; temp: number | null; label: string; icon: string }
  message: string
}

const WEATHER_ICON: Record<string, 'sun' | 'cloud' | 'rain' | 'snow'> = {
  sun: 'sun', cloud: 'cloud', rain: 'rain', snow: 'snow', fog: 'cloud', storm: 'rain',
}

export function Desktop() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const windows = useOS((s) => s.windows)
  const openApp = useOS((s) => s.openApp)
  const showEgg = useOS((s) => s.showEgg)
  const isNight = useNightMode()
  const appOrder = useOS((s) => s.appOrder)
  const setAppOrder = useOS((s) => s.setAppOrder)

  const [now, setNow] = useState(new Date())
  const [weather, setWeather] = useState<WeatherPayload | null>(null)
  const [nextCall, setNextCall] = useState<NextCallPayload['item']>(null)
  // ------------------------------------------------- درگ‌اند‌دراپ آیکن‌ها
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)

  const desktopApps = useMemo(() => {
    const byKey = new Map(APPS.map((a) => [a.key, a]))
    return effectiveAppOrder(appOrder)
      .filter((k) => byKey.get(k)?.desktop)
      .map((k) => byKey.get(k)!)
  }, [appOrder])

  const dropOn = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return
    const keys = effectiveAppOrder(appOrder)
    const from = keys.indexOf(dragKey)
    const to = keys.indexOf(targetKey)
    if (from < 0 || to < 0) return
    keys.splice(to, 0, keys.splice(from, 1)[0])
    setAppOrder(keys)
  }

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

  // تماس بعدی: ویجت شمارش معکوس روی دسکتاپ
  useEffect(() => {
    const load = () =>
      get<NextCallPayload>('/calls/next')
        .then((r) => setNextCall(r.item))
        .catch(() => undefined)
    void load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    get<WeatherPayload>('/weather').then(setWeather).catch(() => undefined)
    const id = setInterval(() => get<WeatherPayload>('/weather').then(setWeather).catch(() => undefined), 900_000)
    return () => clearInterval(id)
  }, [])

  // راز ⑥ — آسمان نیمه‌شب
  const midnight = now.getHours() < 5
  useEffect(() => {
    if (!midnight) return
    const key = `loveos_midnight_${now.toDateString()}`
    if (localStorage.getItem(key)) return
    localStorage.setItem(key, '1')
    post<{ found: boolean; title: string; message: string }>('/egg', { trigger: 'midnight' })
      .then((r) => r.found && showEgg({ title: r.title, message: r.message }))
      .catch(() => undefined)
  }, [midnight, now, showEgg])

  const delta = config?.next_meeting_delta
  const bg = isNight
    ? config?.desktop_background_night || '/backgrounds/desktop-night.jpg'
    : config?.desktop_background_day || '/backgrounds/desktop-day.jpg'

  const triggerEgg = async (trigger: string) => {
    const r = await post<{ found: boolean; title: string; message: string; attachment?: string }>('/egg', { trigger })
    if (r.found) showEgg({ title: r.title, message: r.message, attachment: r.attachment })
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundImage: `linear-gradient(${
          isNight ? 'rgba(11,16,38,.72), rgba(20,26,58,.85)' : 'rgba(255,250,247,.45), rgba(247,236,255,.55)'
        }), url(${bg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {midnight && <MidnightSky />}

      <div className="h-full overflow-y-auto px-4 pb-32 pt-5 no-scrollbar md:px-8">
        {/* ------------------------------------------------------- ویجت‌ها */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="os-card p-4">
            <p className="os-title text-3xl">{formatTime(now)}</p>
            <p className="mt-1 text-xs os-muted">{weekdayName(now)} • {formatDate(now)}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06 }}
            className="os-card cursor-pointer p-4"
            onClick={() => { playOpen(); openApp('countdown') }}
          >
            <p className="text-xs os-muted">{t('desktop.nextMeeting')}</p>
            {delta ? (
              <p className="os-title mt-1 text-2xl" style={{ color: 'var(--os-accent)' }}>
                {digits(delta.days)} <span className="text-sm">{t('os.days')}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm os-muted">—</p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.09 }}
            className="os-card cursor-pointer p-4"
            onClick={() => { playOpen(); openApp('call') }}
          >
            <p className="text-xs os-muted">{t('desktop.nextCall')}</p>
            {nextCall && nextCall.date && nextCall.time ? (
              <>
                <p className="os-title mt-1 text-2xl" style={{ color: 'var(--os-accent)' }}>
                  {countdownText(nextCall.seconds_to_start, t('os.hours'), t('os.minutes'))}
                </p>
                <p className="mt-1 truncate text-[11px] os-muted">
                  {formatDate(nextCall.date)} • {digits(nextCall.time)}
                  {nextCall.topic ? ` • ${nextCall.topic}` : ''}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm os-muted">{t('calls.noNextShort')}</p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="os-card cursor-pointer p-4"
            onClick={() => { playOpen(); openApp('weather') }}
          >
            <p className="text-xs os-muted">{t('desktop.weather')}</p>
            {weather?.daddy && weather?.daughter ? (
              <div className="mt-1.5 space-y-1 text-sm">
                {[weather.daddy, weather.daughter].map((side, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <Icon name={WEATHER_ICON[side?.icon] || 'cloud'} size={16} />
                    <span className="truncate">{side?.city || '—'}</span>
                    <span className="ms-auto">
                      {side?.temp != null ? digits(Math.round(side.temp)) : '—'}°
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-sm os-muted">…</p>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="os-card col-span-2 p-4 md:col-span-1"
          >
            <p className="text-xs os-muted">{t('desktop.todayMessage')}</p>
            <p className="mt-1.5 text-sm leading-6">{config?.today_message || '❤'}</p>
          </motion.div>
        </div>

        {/* --------------------------------------------- آیکن‌های مخفی روز */}
        <div className="mt-3 flex gap-2">
          <AnimatePresence>
            {config?.is_birthday && (
              <motion.button
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                className="os-card flex items-center gap-2 px-3 py-2 text-sm animate-float"
                onClick={() => triggerEgg('birthday')}
              >
                🎂
              </motion.button>
            )}
            {config?.is_anniversary && (
              <motion.button
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="os-card flex items-center gap-2 px-3 py-2 text-sm animate-beat"
                onClick={() => triggerEgg('anniversary')}
              >
                💗
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ------------------------------------------------ شبکه‌ی اپ‌ها */}
        {/* روی دسکتاپ با درگ‌اند‌دراپ می‌توان ترتیب را عوض کرد (ذخیره می‌شود) */}
        <div className="mt-6 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {desktopApps.map((app, i) => (
            <motion.button
              key={app.key}
              initial={{ opacity: 0, y: 14, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.02 * i, type: 'spring', stiffness: 260, damping: 20 }}
              whileHover={{ y: -6, scale: 1.06 }}
              whileTap={{ scale: 0.94 }}
              onClick={() => { playOpen(); openApp(app.key) }}
              onDragOver={(e) => {
                if (!dragKey) return
                e.preventDefault()
                setOverKey(app.key)
              }}
              onDragLeave={() => setOverKey((k) => (k === app.key ? null : k))}
              onDrop={(e) => {
                e.preventDefault()
                dropOn(app.key)
                setDragKey(null)
                setOverKey(null)
              }}
              className="flex flex-col items-center gap-1.5"
              style={{
                opacity: dragKey === app.key ? 0.4 : 1,
                outline: overKey === app.key && dragKey && dragKey !== app.key ? '2px dashed var(--os-accent)' : 'none',
                outlineOffset: 4,
                borderRadius: 18,
              }}
              title={t(app.titleKey)}
            >
              {/* دستگیره‌ی درگ‌اند‌دراپ (فقط دسکتاپ) */}
              <span
                draggable
                onDragStart={(e) => {
                  setDragKey(app.key)
                  e.dataTransfer.setData('text/plain', app.key)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragEnd={() => {
                  setDragKey(null)
                  setOverKey(null)
                }}
                className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-soft md:cursor-grab active:md:cursor-grabbing"
                style={{ background: `linear-gradient(145deg, ${app.color}44, ${app.color}22)`, color: app.color }}
              >
                <Icon name={app.icon} size={26} />
              </span>
              <span className="max-w-[86px] text-center text-[11px] leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                {t(app.titleKey)}
              </span>
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {windows.map((w) => (
          <AppWindow key={w.id} win={w} />
        ))}
      </AnimatePresence>

      <StartMenu />
      <NotificationCenter />
      <GlobalSearch />
      <Dock />
    </div>
  )
}

/** «۲ روز و ۳ ساعت» از ثانیه — برای ویجت تماس بعدی */
function countdownText(total: number, hoursWord: string, minutesWord: string) {
  if (total <= 0) return '❤'
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${digits(days)} ${hoursWord}`
  if (hours > 0) return `${digits(hours)} ${hoursWord} ${digits(minutes)} ${minutesWord}`
  return `${digits(Math.max(1, minutes))} ${minutesWord}`
}

/** راز ⑥ — آسمان نیمه‌شب پر از قلب و ستاره */
function MidnightSky() {
  const items = useMemo(
    () =>
      Array.from({ length: 26 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 90,
        delay: Math.random() * 5,
        size: 8 + Math.random() * 14,
        heart: i % 4 === 0,
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((s) => (
        <span
          key={s.id}
          className="absolute animate-twinkle"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            fontSize: s.size,
            animationDelay: `${s.delay}s`,
            color: s.heart ? '#ff9ecb' : '#ffe9a8',
          }}
        >
          {s.heart ? '❤' : '✦'}
        </span>
      ))}
    </div>
  )
}
