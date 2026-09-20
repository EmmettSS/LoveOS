/**
 * Desktop.tsx — دسکتاپ LoveOS
 * ویجت‌ها (ساعت، دیدار بعدی، آب‌وهوای دو شهر، پیام امروز) + شبکه‌ی آیکن‌ها + داک
 * راز ⑥: بین ۰۰:۰۰ تا ۰۵:۰۰ آسمان پر از قلب و ستاره می‌شود.
 * راز ⑦/⑧: تولد و سالگرد → آیکن مخفی کیک/قلب.
 *
 * درگ‌اند‌دراپ آیکن‌ها (موس + لمس):
 *   • موس: با ۵ پیکسل جابه‌جایی، درگ شروع می‌شود.
 *   • لمس: انگشت را ~۳۲۰ms روی آیکن نگه دارید تا درگ «آماده» شود (مثل گوشی)،
 *     بعد بکشید و روی آیکن مقصد رها کنید. تا قبل از آماده‌شدن، کشیدنِ عمودی
 *     صفحه را اسکرول می‌کند (touch-action: pan-y) تا اسکرول دسکتاپ از کار نیفتد.
 *   • hit-test با getBoundingClientRect خودِ آیکن‌ها انجام می‌شود (نه
 *     elementFromPoint) و رویدادهای move/up روی window گوش داده می‌شوند، پس
 *     بیرون‌رفتن انگشت از روی آیکن هم درگ را خراب نمی‌کند.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { digits, formatDate, formatTime, weekdayName } from '../shared/format'
import { playClick, playOpen } from '../shared/sound'
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
    sides_time?: Record<string, { city?: string; label?: string; time: string }>
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

/* ---------------------------------------------------- تنظیم درگ‌اند‌دراپ -- */
const ARM_DELAY_MS = 320 // لمس: این‌قدر نگه دار تا درگ «آماده» شود
const MOUSE_SLOP = 5 // موس: با این‌قدر جابه‌جایی، درگ شروع می‌شود
const TOUCH_SLOP = 10 // لمس: کمتر از این یعنی «ضربه»، بیشتر یعنی اسکرول/swipe

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
  // درگ‌اند‌دراپ
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [overKey, setOverKey] = useState<string | null>(null)
  const [ghost, setGhost] = useState<{ x: number; y: number; key: string } | null>(null)
  const gridRef = useRef<HTMLDivElement | null>(null)
  /** وضعیت حرکتِ جاری انگشت/موس — ref است تا بین رندرها گم نشود */
  const gesture = useRef<{
    key: string
    id: number
    x0: number
    y0: number
    armed: boolean
    touch: boolean
    timer: number | null
  } | null>(null)
  const suppressClickRef = useRef(false)
  const touchBlockRef = useRef<((e: TouchEvent) => void) | null>(null)
  const appOrderRef = useRef(appOrder)
  useEffect(() => {
    appOrderRef.current = appOrder
  })

  const desktopApps = useMemo(() => {
    const byKey = new Map(APPS.map((a) => [a.key, a]))
    return effectiveAppOrder(appOrder)
      .filter((k) => byKey.get(k)?.desktop)
      .map((k) => byKey.get(k)!)
  }, [appOrder])

  const dropOn = (sourceKey: string, targetKey: string) => {
    if (!sourceKey || sourceKey === targetKey) return
    const keys = effectiveAppOrder(appOrderRef.current)
    const from = keys.indexOf(sourceKey)
    const to = keys.indexOf(targetKey)
    if (from < 0 || to < 0) return
    keys.splice(to, 0, keys.splice(from, 1)[0])
    setAppOrder(keys)
  }

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000)
    return () => clearInterval(id)
  }, [])

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

  /* --------------------------------------------------- درگ‌اند‌دراپ آیکن‌ها -- */
  const stopTouchBlock = () => {
    if (touchBlockRef.current) {
      window.removeEventListener('touchmove', touchBlockRef.current)
      touchBlockRef.current = null
    }
  }

  const endGesture = () => {
    const g = gesture.current
    if (g?.timer) window.clearTimeout(g.timer)
    gesture.current = null
    stopTouchBlock()
    setDragKey(null)
    setOverKey(null)
    setGhost(null)
  }

  const armDrag = (x: number, y: number) => {
    const g = gesture.current
    if (!g || g.armed) return
    g.armed = true
    suppressClickRef.current = true
    setDragKey(g.key)
    setGhost({ x, y, key: g.key })
    playClick()
    if (g.touch) {
      // بعد از آماده‌شدن باید اسکرولِ صفحه را ببندیم، وگرنه درگ از دست می‌رود
      const block = (ev: TouchEvent) => ev.preventDefault()
      touchBlockRef.current = block
      window.addEventListener('touchmove', block, { passive: false })
      try {
        navigator.vibrate?.(14)
      } catch {
        /* دستگاه ویبره ندارد */
      }
    }
  }

  /** کدام آیکن زیر این نقطه است؟ با rect واقعی، پس با اسکرول هم درست می‌ماند */
  const hitTest = (x: number, y: number): string | null => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-app-key]'))
    for (const node of nodes) {
      const r = node.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return node.dataset.appKey || null
    }
    return null
  }

  const onIconPointerDown = (e: React.PointerEvent, appKey: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    suppressClickRef.current = false
    const touch = e.pointerType !== 'mouse'
    gesture.current = { key: appKey, id: e.pointerId, x0: e.clientX, y0: e.clientY, armed: false, touch, timer: null }
    if (touch) {
      const g = gesture.current
      g.timer = window.setTimeout(() => {
        const cur = gesture.current
        if (cur) armDrag(cur.x0, cur.y0)
      }, ARM_DELAY_MS)
    }
  }

  // رویدادهای move/up روی window: بیرون‌رفتن انگشت از روی آیکن درگ را خراب نمی‌کند
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.id) return
      const dx = e.clientX - g.x0
      const dy = e.clientY - g.y0
      if (!g.armed) {
        if (g.touch) {
          // جابه‌جاییِ زودهنگام یعنی کاربر می‌خواهد اسکرول کند → درگ را ول کن
          if (Math.hypot(dx, dy) > TOUCH_SLOP) endGesture()
          return
        }
        if (Math.hypot(dx, dy) > MOUSE_SLOP) armDrag(e.clientX, e.clientY)
        else return
      }
      setGhost({ x: e.clientX, y: e.clientY, key: g.key })
      const hit = hitTest(e.clientX, e.clientY)
      setOverKey(hit && hit !== g.key ? hit : null)
    }
    const onUp = (e: PointerEvent) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.id) return
      if (g.armed) {
        suppressClickRef.current = true
        const hit = hitTest(e.clientX, e.clientY)
        if (hit && hit !== g.key) dropOn(g.key, hit)
      } else if (Math.hypot(e.clientX - g.x0, e.clientY - g.y0) > TOUCH_SLOP) {
        // swipe بوده نه ضربه → اپ باز نشود
        suppressClickRef.current = true
      }
      endGesture()
    }
    const onCancel = () => endGesture()
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      endGesture()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setAppOrder])

  return (
    <div
      className="os-screen os-no-select relative"
      style={{
        // overlay کم‌رنگ‌تر شد تا والپیپر دیده شود — یک‌سومِ قبل (درخواست کاربر)
        backgroundImage: `linear-gradient(${
          isNight ? 'rgba(11,16,38,.24), rgba(20,26,58,.28)' : 'rgba(255,250,247,.14), rgba(247,236,255,.18)'
        }), url(${bg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {midnight && <MidnightSky />}

      <div className="h-full overflow-y-auto px-4 pb-32 pt-5 no-scrollbar md:px-8">
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

        {/* شبکه‌ی اپ‌ها — با موس و با لمس جابه‌جا می‌شوند */}
        <div ref={gridRef} className="mt-6 grid grid-cols-4 gap-3 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10">
          {desktopApps.map((app, i) => {
            const isDragging = dragKey === app.key
            const isOver = !!overKey && overKey === app.key && dragKey !== app.key
            return (
              <motion.button
                key={app.key}
                data-app-key={app.key}
                initial={{ opacity: 0, y: 14, scale: 0.9 }}
                animate={{ opacity: isDragging ? 0.4 : 1, y: 0, scale: 1 }}
                transition={{ delay: 0.02 * i, type: 'spring', stiffness: 260, damping: 20 }}
                whileHover={isDragging ? undefined : { y: -6, scale: 1.06 }}
                onPointerDown={(e) => onIconPointerDown(e, app.key)}
                onClick={() => {
                  // بعد از درگ (یا swipe) کلیک را نادیده می‌گیریم
                  if (suppressClickRef.current) {
                    suppressClickRef.current = false
                    return
                  }
                  playOpen()
                  openApp(app.key)
                }}
                className="flex flex-col items-center gap-1.5"
                style={{
                  outline: isOver ? '2px dashed var(--os-accent)' : 'none',
                  outlineOffset: 4,
                  borderRadius: 18,
                  cursor: 'pointer',
                  // لمس: تا وقتی درگ «آماده» نشده، اسکرول عمودی صفحه کار کند
                  touchAction: 'pan-y',
                  userSelect: 'none',
                  WebkitUserSelect: 'none',
                  WebkitTouchCallout: 'none',
                }}
                title={t(app.titleKey)}
              >
                <span
                  className="flex h-14 w-14 items-center justify-center rounded-2xl shadow-soft md:cursor-grab active:md:cursor-grabbing"
                  style={{
                    background: `linear-gradient(145deg, ${app.color}44, ${app.color}22)`,
                    color: app.color,
                  }}
                >
                  <Icon name={app.icon} size={26} />
                </span>
                <span className="max-w-[86px] text-center text-[11px] leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
                  {t(app.titleKey)}
                </span>
              </motion.button>
            )
          })}
        </div>
        <p className="mt-3 text-center text-[11px] os-muted md:hidden">{t('desktop.dragHint')}</p>
      </div>

      {/* شبحِ آیکنِ در حال کشیدن — دنبال انگشت/نشانگر می‌آید */}
      <AnimatePresence>
        {ghost &&
          (() => {
            const gApp = APPS.find((a) => a.key === ghost.key)
            if (!gApp) return null
            return (
              <motion.div
                key={`ghost-${ghost.key}`}
                data-drag-ghost={ghost.key}
                className="pointer-events-none fixed z-[95] flex h-14 w-14 items-center justify-center rounded-2xl shadow-soft"
                style={{
                  left: ghost.x,
                  top: ghost.y,
                  x: '-50%',
                  y: '-50%',
                  background: `linear-gradient(145deg, ${gApp.color}66, ${gApp.color}33)`,
                  color: gApp.color,
                }}
                initial={{ scale: 0.85, opacity: 0.7 }}
                animate={{ scale: 1.12, opacity: 1 }}
                exit={{ scale: 0.85, opacity: 0 }}
              >
                <Icon name={gApp.icon} size={26} />
              </motion.div>
            )
          })()}
      </AnimatePresence>

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

function countdownText(total: number, hoursWord: string, minutesWord: string) {
  if (total <= 0) return '❤'
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${digits(days)} ${hoursWord}`
  if (hours > 0) return `${digits(hours)} ${hoursWord} ${digits(minutes)} ${minutesWord}`
  return `${digits(Math.max(1, minutes))} ${minutesWord}`
}

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
