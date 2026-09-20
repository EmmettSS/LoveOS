/**
 * MapOfUs — نقشه‌ی ما 🌍
 * کره‌ی واقعی زمین: پروجکشن «globe» خود MapLibre (نسخه‌ی ۶) روی همان تایل‌های OSM؛
 * پس‌زمینه‌ی فضای ستاره‌دار با CSS و هاله‌ی جوِ صورتی دور کره.
 *
 * قابِ استراحت (هم بعد از انیمیشن ورودی و هم در پایان سکانس پرواز) «تمامِ ایران» است:
 * از دریای خزر تا خلیج فارس و از مرز غربی تا مرز شرقی، با fitBounds روی IRAN_BOUNDS و
 * حاشیه‌ی نامتقارن (پایین بیشتر، تا اورلیِ پیام پایانی روی خلیج فارس نیفتد). شروعِ
 * انیمیشن ورودی از کره‌ی کامل است که نرم به ایران می‌رسد؛ لحظه‌ی «کره» به‌عنوان سینما
 * می‌ماند ولی استراحت همیشه روی ایران است.
 *
 * دکمه‌ی «پرواز روی مسیر» یک دنباله‌ی سینماییِ ~۲۰ ثانیه‌ای و غیرقابل‌رد می‌سازد:
 *   پرده‌ی سینما و عقب‌کشی به کره‌ی کامل با شهاب و شکوفاییِ هاله‌ی جو، شیرجه به خانه‌ی
 *   بابا با مدار و مکث، بلند شدن با هُوووش، پروازِ آهسته روی کمان با قلبِ جرقه‌ای و
 *   ردپای قلب‌های محوشونده و شمارنده‌ی زنده‌ی کیلومتر، فرودِ جشن‌گونه‌ی چهارموجی، و
 *   بازگشتِ نرم به همان قابِ ایران. نخِ بین دو خانه همگام با ضربانِ قلب می‌تپد
 *   (صدا و نور با هم).
 * همه‌ی عددهای زمان‌بندی و ریاضیِ قاب در «mapOfUsCinema.ts» است (خالص و آزمودنی).
 *
 * راز ⑨: زوم کامل روی شهر بابا (کره در زوم بالا خودش به نمای مسطح خیابانی وصل می‌شود،
 * پس راز همان‌طور کار می‌کند). سقف زومِ سکانس ۱۱٫۶ است — خیلی زیر آستانه‌ی ۱۳ — و تا
 * پایان سکانس هندلرِ راز خاموش است تا تصادفی مصرف نشود.
 *
 * موقعیت دخترم از دستگاه خودش خوانده می‌شود (اگر اجازه داده باشد)؛ شهر ثبت‌شده در پنل
 * بابا فقط پیش‌فرض است. نشان «زنده» همیشه نشان می‌دهد نقطه بر اساس کدام منبع کشیده شده.
 */
import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap, SkySpecification } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { digits, formatDate, formatTime } from '../shared/format'
import { enableLiveLocation, getCurrentPosition, lookupCity, pushLocation } from '../shared/geo'
import { playBloom, playClick, playHeartbeat, tone } from '../shared/sound'
import { useOS } from '../shared/store'
import { Loading } from '../shared/ui'
import {
  CAPTION_KEYS,
  FLIGHT_BEARING,
  FLIGHT_ZOOM,
  GLOBE_SETTLE_ZOOM,
  IRAN_BOUNDS,
  IRAN_CENTER,
  IRAN_FIT_MAX_ZOOM,
  LANDING_WAVES,
  cineScale,
  easeInOutCubic,
  easeInOutQuad,
  easeOutCubic,
  flightCueTimes,
  globeZoomFor,
  heartbeatEnvelope,
  iranFallbackCamera,
  iranFramePadding,
  iranFrameProbes,
  needsGlobeSettle,
  neededZoomDelta,
  pathCumulativeKm,
  sampleByDistance,
  spaceShotCenter,
  type FlightCues,
  type LngLat,
} from './mapOfUsCinema'

interface Side {
  city: string
  lat: number
  lng: number
  time: string
  hour: number
  is_night: boolean
  is_live?: boolean
  accuracy?: number | null
  captured_at?: string | null
}
interface MapData {
  daddy: Side
  daughter: Side
  distance_km: number
  end_message: string
}

/** خط منحنی (کمان) بین دو نقطه برای حس «پرواز» */
function arc(a: [number, number], b: [number, number], steps = 64): [number, number][] {
  const pts: [number, number][] = []
  const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  // انحراف عمود بر خط برای ایجاد قوس
  const ctrl: [number, number] = [mid[0] - dy * 0.18, mid[1] + dx * 0.18]
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps
    const x = (1 - t) ** 2 * a[0] + 2 * (1 - t) * t * ctrl[0] + t ** 2 * b[0]
    const y = (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * ctrl[1] + t ** 2 * b[1]
    pts.push([x, y])
  }
  return pts
}

/** علامت‌هایی که موقع پرواز از خانه‌ها فوران می‌کنند */
const BURST_GLYPHS = ['❤', '♾', '✨', '💗', '❤', '♾'] // قلب و بینهایت بیشتر باشند
const BURST_COLORS = ['#ff8fbf', '#f767a8', '#ffd1e6', '#bba0fb', '#ffe27a']
/** قلب‌های کوچکی که پشتِ جرقه‌ی در حال پرواز محو می‌شوند */
const TRAIL_GLYPHS = ['❤', '♡', '✦', '💗']

/** آسمان/هاله‌ی جو — همان تنظیمِ همیشگی؛ فقط موقع «شکوفاییِ هاله» موقتاً گرم‌تر می‌شود */
const SKY_BASE: SkySpecification = {
  'sky-color': '#0b1026',
  'horizon-color': '#f6b8d9',
  'sky-horizon-blend': 0.7,
  // هاله‌ی جو فقط در نمای کره دیده شود؛ در نمای نزدیک محو شود
  'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.45, 6, 0],
}

/** فازهای جریانِ dash روی نخِ اصلی (چون line-dasharray ترنزیشن‌پذیر نیست، فاز عوض می‌کنیم) */
const DASH_PHASES: number[][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [3.5, 4, 0.5],
]

/** «کمان نور»: یک تکه‌ی روشنِ کوتاه که روی نخ می‌خزد. دوره‌ی الگو (برابرِ خط‌چین) */
const COMET_PERIOD = 30
const COMET_LENGTH = 1.6
const COMET_STEP = 1.5

function heartMarker(color: string, label: string, live = false, pulse = false, liveLabel = '') {
  const el = document.createElement('div')
  el.style.cssText =
    'display:flex;flex-direction:column;align-items:center;transform:translateY(-6px);pointer-events:auto;z-index:10'
  el.innerHTML = `
    <div style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center">
      <svg width="34" height="34" viewBox="0 0 24 24" style="filter:drop-shadow(0 4px 10px rgba(0,0,0,.32));display:block">
        <path d="M12 21s-8-5.2-8-10.6A4.7 4.7 0 0 1 12 8a4.7 4.7 0 0 1 8 2.4C20 15.8 12 21 12 21Z" fill="${color}"/>
      </svg>
      ${pulse ? `<span style="position:absolute;inset:0;border-radius:50%;background:${color};opacity:.35;animation:loveos-ping 1.8s ease-out infinite"></span>` : ''}
    </div>
    <span style="background:rgba(255,255,255,.95);color:#4a2c40;border-radius:999px;padding:2px 9px;font-size:11px;margin-top:-2px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,.15);font-weight:600">
      ${label}${live && liveLabel ? ` • ${liveLabel}` : ''}
    </span>`
  return el
}

export default function MapOfUs() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const patchConfig = useOS((s) => s.patchConfig)
  const [data, setData] = useState<MapData | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [flying, setFlying] = useState(false)
  /** اورلیِ پیام پایانیِ بابا موقع فرود */
  const [cine, setCine] = useState(false)
  /** زیرنویسِ احساسیِ روی نقشه */
  const [caption, setCaption] = useState<string | null>(null)
  /** شمارنده‌ی زنده‌ی کیلومترِ پیموده‌شده */
  const [showKm, setShowKm] = useState(false)
  /** نوارهای تیره‌ی بالا/پایین (حالت سینمایی) */
  const [cineBars, setCineBars] = useState(false)
  /** درخششِ بیشترِ ستاره‌ها موقع نمای کره */
  const [spaceMode, setSpaceMode] = useState(false)

  const container = useRef<HTMLDivElement | null>(null)
  const fxRef = useRef<HTMLDivElement | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)
  const kmRef = useRef<HTMLSpanElement | null>(null)
  const map = useRef<MLMap | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  /** مارکرهای موقتِ سکانس (جرقه، ردپای قلب، حلقه‌ها) — همه باید پاک شوند */
  const cineMarkers = useRef<maplibregl.Marker[]>([])
  const clockRaf = useRef<number | null>(null)
  /** قلبِ جرقه‌ایِ در حال پرواز — اگر سکانس از بیرون متوقف شود باید برداشته شود */
  const sparkRef = useRef<maplibregl.Marker | null>(null)
  /**
   * «فلر» لحظه‌ایِ درخششِ نخ (۰ تا ۱) که آرام فروکش می‌کند. چون پالسِ ضربانی در هر
   * فرمول line-width/line-opacity را خودش می‌نویسد، یک setGlowِ ساده در آن گم می‌شد؛
   * پس لحظه‌های اوج (بلند شدن، نزدیک شدن، فرود) به‌صورتِ ضریب به همان پالس تزریق می‌شوند.
   */
  const glowBoost = useRef(0)
  const skyBackup = useRef<SkySpecification | null>(null)
  const eggFired = useRef(false)
  const flyingRef = useRef(false)
  const routePath = useRef<[number, number][]>([])
  /** همه‌ی تایمرها/انیمیشن‌های سکانس؛ موقع پاک‌شدن اپ همه باید بفروپایند */
  const timers = useRef<number[]>([])
  const tickers = useRef<number[]>([])

  /** زمان‌بندیِ یک رویداد در سکانس؛ همه‌ی شناسه‌ها نگه داشته می‌شوند تا پاک‌سازی کامل باشد */
  const at = useCallback((ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }, [])

  const load = useCallback(async () => {
    try {
      setData(await get<MapData>('/map'))
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  /* --------------------------------------------------------- جلوه‌های سکانس --- */

  /** فوران قلب/بینهایت/جرقه از یک نقطه روی کره */
  const burst = useCallback((lngLat: LngLat, count: number) => {
    const m = map.current
    const fx = fxRef.current
    if (!m || !fx || count <= 0) return
    let p: { x: number; y: number }
    try {
      p = m.project(lngLat)
    } catch {
      return
    }
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return
    for (let i = 0; i < count; i += 1) {
      const el = document.createElement('span')
      el.className = 'loveos-fx'
      el.textContent = BURST_GLYPHS[Math.floor(Math.random() * BURST_GLYPHS.length)]
      const size = 12 + Math.random() * 13
      el.style.left = `${p.x}px`
      el.style.top = `${p.y}px`
      el.style.fontSize = `${size}px`
      el.style.color = BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)]
      fx.appendChild(el)
      const drift = (Math.random() - 0.5) * 74
      const rise = -(52 + Math.random() * 88)
      const spin = (Math.random() - 0.5) * 44
      try {
        const anim = el.animate(
          [
            { transform: 'translate(-50%,-50%) scale(.4) rotate(0deg)', opacity: 0 },
            { opacity: 1, offset: 0.16 },
            {
              transform: `translate(calc(-50% + ${drift}px), calc(-50% + ${rise}px)) scale(1.18) rotate(${spin}deg)`,
              opacity: 0,
            },
          ],
          {
            duration: 1300 + Math.random() * 900,
            delay: Math.random() * 260,
            easing: 'cubic-bezier(.2,.6,.3,1)',
            fill: 'forwards',
          },
        )
        anim.onfinish = () => el.remove()
      } catch {
        el.remove()
        return
      }
      // اگر انیمیشن (هر برای یک دلیل) تمام نشد، عنصر بی‌دفاع جمع می‌شود
      at(3200, () => el.remove())
    }
  }, [at])

  /**
   * قلبِ کوچکی که پشتِ جرقه‌ی در حال پرواز جا می‌ماند و محو می‌شود (ردپای مسیر).
   * مارکر است تا به نقطه‌ی جغرافیایی بچسبد؛ انیمیشن روی فرزندِ داخلی است تا با
   * transformِ خودِ MapLibre نجنگد.
   */
  const trailHeart = useCallback((lngLat: LngLat) => {
    const m = map.current
    if (!m) return
    const anchor = document.createElement('div')
    anchor.className = 'loveos-trail-anchor'
    anchor.innerHTML = `<div class="loveos-trail">${TRAIL_GLYPHS[Math.floor(Math.random() * TRAIL_GLYPHS.length)]}</div>`
    let mk: maplibregl.Marker
    try {
      mk = new maplibregl.Marker({ element: anchor }).setLngLat(lngLat).addTo(m)
    } catch {
      return
    }
    cineMarkers.current.push(mk)
    at(1250, () => {
      try {
        mk.remove()
      } catch {
        /* ignore */
      }
      const i = cineMarkers.current.indexOf(mk)
      if (i >= 0) cineMarkers.current.splice(i, 1)
    })
  }, [at])

  /** حلقه‌ی موجِ ضربه‌ای روی یک خانه (رسیدن/فرود) — ژئورفرنس، مثل ردپا */
  const shockwave = useCallback((lngLat: LngLat) => {
    const m = map.current
    if (!m) return
    const anchor = document.createElement('div')
    anchor.className = 'loveos-ring-anchor'
    anchor.innerHTML = '<div class="loveos-ring"></div>'
    let mk: maplibregl.Marker
    try {
      mk = new maplibregl.Marker({ element: anchor }).setLngLat(lngLat).addTo(m)
    } catch {
      return
    }
    cineMarkers.current.push(mk)
    at(1450, () => {
      try {
        mk.remove()
      } catch {
        /* ignore */
      }
      const i = cineMarkers.current.indexOf(mk)
      if (i >= 0) cineMarkers.current.splice(i, 1)
    })
  }, [at])

  /** شهابِ دنباله‌دار در فضای ستاره‌ایِ پشتِ کره (روی همان لایه‌ی جلوه‌ها) */
  const meteor = useCallback(() => {
    const host = fxRef.current
    if (!host) return
    const w = host.clientWidth || 320
    const h = host.clientHeight || 360
    const el = document.createElement('div')
    el.className = 'loveos-meteor'
    host.appendChild(el)
    const fromRight = Math.random() > 0.4
    const startX = fromRight ? w * (0.55 + Math.random() * 0.4) : w * (0.05 + Math.random() * 0.25)
    const startY = h * (0.04 + Math.random() * 0.3)
    const dx = (fromRight ? -1 : 1) * w * (0.34 + Math.random() * 0.3)
    const dy = h * (0.28 + Math.random() * 0.3)
    const angle = fromRight ? 26 : 154
    try {
      const anim = el.animate(
        [
          { transform: `translate(${startX}px, ${startY}px) rotate(${angle}deg) scaleX(.2)`, opacity: 0 },
          { opacity: 1, offset: 0.2 },
          { transform: `translate(${startX + dx}px, ${startY + dy}px) rotate(${angle}deg) scaleX(1)`, opacity: 0 },
        ],
        { duration: 1150, easing: 'cubic-bezier(.25,.6,.35,1)', fill: 'forwards' },
      )
      anim.onfinish = () => el.remove()
    } catch {
      el.remove()
      return
    }
    at(2400, () => el.remove())
  }, [at])

  /** شکوفاییِ هاله‌ی جو: یک دمِ گرمِ کوتاه روی افقِ کره، بعد بازگشت به تنظیمِ همیشگی */
  const haloBloom = useCallback(() => {
    const m = map.current
    if (!m) return
    try {
      if (!skyBackup.current) skyBackup.current = m.getSky()
      m.setSky({ 'horizon-color': '#ffdcEE', 'sky-horizon-blend': 0.88 })
    } catch {
      /* ignore */
    }
    at(1500, () => {
      const mm = map.current
      const bak = skyBackup.current
      if (!mm) return
      try {
        mm.setSky({
          'horizon-color': bak?.['horizon-color'] ?? SKY_BASE['horizon-color'],
          'sky-horizon-blend': bak?.['sky-horizon-blend'] ?? SKY_BASE['sky-horizon-blend'],
        })
      } catch {
        /* ignore */
      }
      skyBackup.current = null
    })
  }, [at])

  /** هوووشِ بلند شدن: یک تُنِ بم که به سمت بالا سُرمی‌خورد */
  const whoosh = useCallback(() => {
    tone({ freq: 150, duration: 1.05, type: 'sine', gain: 0.075, glideTo: 760 })
    tone({ freq: 300, duration: 0.9, type: 'triangle', gain: 0.03, delay: 0.06, glideTo: 1180 })
  }, [])

  /** درخششِ نخ را با گذار نرم کم/زیاد می‌کند */
  const setGlow = useCallback((opacity: number, width: number) => {
    const m = map.current
    if (!m) return
    try {
      m.setPaintProperty('route-glow', 'line-opacity', opacity)
      m.setPaintProperty('route-glow', 'line-width', width)
    } catch {
      /* لایه هنوز نیست */
    }
  }, [])

  /**
   * مدتِ گذارِ درخششِ نخ. موقع پالسِ ضربانی (که با rAF هر فرموله نوشته می‌شود) باید
   * صفر باشد، وگرنه ترنزیشنِ ۶۵۰ms با مقدارِ تازه می‌جنگد و پالس له می‌شود.
   */
  const setGlowTransition = useCallback((ms: number) => {
    const m = map.current
    if (!m) return
    try {
      m.setPaintProperty('route-glow', 'line-width-transition', { duration: ms })
      m.setPaintProperty('route-glow', 'line-opacity-transition', { duration: ms })
    } catch {
      /* ignore */
    }
  }, [])

  /** جریانِ متحرکِ dash روی نخ + «کمان نور» (هر دو در یک interval تا سبک بماند) */
  const startThreadFlow = useCallback(() => {
    const m = map.current
    if (!m) return
    try {
      m.setPaintProperty('route-comet', 'line-opacity', 0.85)
    } catch {
      /* ignore */
    }
    let i = 0
    const id = window.setInterval(() => {
      const mm = map.current
      if (!mm) return
      try {
        mm.setPaintProperty('route', 'line-dasharray', DASH_PHASES[i % DASH_PHASES.length] as [number, number, number])
      } catch {
        /* ignore */
      }
      // کمان نور: [۰، فاصله، تکه‌ی روشن، بقیه] با دوره‌ی ثابت → تکه‌ی روشن به سمت
      // خانه‌ی دخترم می‌خزد (چون الگو از آغازِ خط شمرده می‌شود)
      const gap = (i * COMET_STEP) % Math.max(1, COMET_PERIOD - COMET_LENGTH)
      try {
        mm.setPaintProperty('route-comet', 'line-dasharray', [
          0,
          gap,
          COMET_LENGTH,
          Math.max(0.01, COMET_PERIOD - COMET_LENGTH - gap),
        ] as [number, number, number, number])
      } catch {
        /* ignore */
      }
      i += 1
    }, 110)
    tickers.current.push(id)
  }, [])

  const stopThreadFlow = useCallback(() => {
    tickers.current.forEach((id) => window.clearInterval(id))
    tickers.current = []
    const m = map.current
    if (!m) return
    try {
      m.setPaintProperty('route', 'line-dasharray', [2, 1.6])
      m.setPaintProperty('route-comet', 'line-opacity', 0)
      m.setPaintProperty('route-comet', 'line-dasharray', [0, 0, COMET_LENGTH, COMET_PERIOD - COMET_LENGTH])
    } catch {
      /* ignore */
    }
  }, [])

  /* ------------------------------------------------------- ساعتِ سینماییِ rAF --- */

  /**
   * یک حلقه‌ی rAF یگانه برای همه‌ی چیزهای پیوسته‌ی سکانس:
   *   ۱) پالسِ ضربانیِ درخشش/ضخامتِ نخ (پوشِ لاب-داب، همگام با صدای ضربان قلب)
   *   ۲) قلبِ جرقه‌ای روی کمان + ردپای قلب‌های محوشونده
   *   ۳) شمارنده‌ی زنده‌ی «کیلومترِ پیموده‌شده» (بدون setState تا رندر پشتِ سر هم ندهد)
   * همه از یک مبدأِ زمانی و از همان جدولِ cue می‌خوانند، پس با تایمرها وا نمی‌افتد.
   */
  const startCineClock = useCallback(
    (t0: number, C: FlightCues, reduced: boolean, flight: { path: LngLat[]; cum: number[]; totalKm: number }) => {
      const m = map.current
      if (!m) return
      const fx = !reduced
      let spark: maplibregl.Marker | null = null
      if (fx && flight.path.length > 1) {
        const anchor = document.createElement('div')
        anchor.className = 'loveos-spark-anchor'
        anchor.innerHTML = '<div class="loveos-spark"><span>❤</span></div>'
        try {
          spark = new maplibregl.Marker({ element: anchor }).setLngLat(flight.path[0]).addTo(m)
          sparkRef.current = spark
          cineMarkers.current.push(spark)
        } catch {
          spark = null
        }
      }
      const finish = () => {
        clockRaf.current = null
        if (spark) {
          const done = spark
          spark = null
          sparkRef.current = null
          try {
            done.remove()
          } catch {
            /* ignore */
          }
          const i = cineMarkers.current.indexOf(done)
          if (i >= 0) cineMarkers.current.splice(i, 1)
        }
      }
      let lastPulse = 0
      let lastTrail = -1e9
      let lastKm = -1e9
      const step = (now: number) => {
        const mm = map.current
        if (!mm || !flyingRef.current) {
          finish()
          return
        }
        const el = now - t0
        if (el > C.home) {
          finish()
          return
        }

        // ۱) ضربانِ نخ (لاب-داب) + فلرِ لحظه‌های اوج که آرام فروکش می‌کند
        if (fx && el >= C.dive && el <= C.home && now - lastPulse >= 33) {
          lastPulse = now
          const env = heartbeatEnvelope((el - C.dive) / 1000, 0.9)
          const boost = glowBoost.current
          glowBoost.current = Math.max(0, boost - 0.02)
          try {
            mm.setPaintProperty('route-glow', 'line-width', 8 + env * 9 + boost * 6)
            mm.setPaintProperty('route-glow', 'line-opacity', Math.min(1, 0.32 + env * 0.52 + boost * 0.2))
          } catch {
            /* ignore */
          }
        }

        // ۲) پرواز روی کمان
        const flightEnd = C.flight + C.flightDur
        if (el >= C.flight && el <= flightEnd && flight.path.length > 1) {
          const raw = Math.min(1, (el - C.flight) / Math.max(1, C.flightDur))
          const eased = easeInOutQuad(raw)
          const dist = eased * flight.totalKm
          const pos = sampleByDistance(flight.path, flight.cum, dist)
          if (spark) {
            try {
              spark.setLngLat(pos)
            } catch {
              /* ignore */
            }
          }
          if (fx && el - lastTrail >= 150) {
            lastTrail = el
            trailHeart(pos)
          }
          // ۳) شمارنده‌ی کیلومتر (مستقیم روی DOM، بدون رندرِ اضافه)
          if (el - lastKm >= 100 && kmRef.current) {
            lastKm = el
            kmRef.current.textContent = t('map.cineKm', { km: digits(Math.round(dist)) })
          }
        }
        clockRaf.current = requestAnimationFrame(step)
      }
      clockRaf.current = requestAnimationFrame(step)
    },
    [t, trailHeart],
  )

  const stopCineClock = useCallback(() => {
    if (clockRaf.current != null) {
      cancelAnimationFrame(clockRaf.current)
      clockRaf.current = null
    }
    // اگر حلقه از بیرون خاموش شد، خودِ حلقه فرصت نکرد جرقه را بردارد
    const spark = sparkRef.current
    if (spark) {
      sparkRef.current = null
      try {
        spark.remove()
      } catch {
        /* ignore */
      }
      const i = cineMarkers.current.indexOf(spark)
      if (i >= 0) cineMarkers.current.splice(i, 1)
    }
  }, [])

  const clearCineMarkers = useCallback(() => {
    cineMarkers.current.forEach((mk) => {
      try {
        mk.remove()
      } catch {
        /* ignore */
      }
    })
    cineMarkers.current = []
  }, [])

  /* ------------------------------------------------------------ قابِ ایران --- */

  /**
   * نشاندنِ «تمامِ ایران» در قاب (دریای خزر تا خلیج فارس).
   * fitBounds خودش کره‌ای محاسبه می‌کند، اما مقدارِ «کره‌بودنِ» پروجکشن را از وضعیتِ
   * فعلی به ارث می‌برد؛ اگر از نمای نزدیکِ نیمه‌مسطح صدا بزنیم، قابِ ایران اشتباه
   * درمی‌آید. پس اول یک پیش‌نشستِ کوتاه به ناحیه‌ی تمام‌کره می‌کنیم.
   */
  const frameIran = useCallback((duration: number) => {
    const m = map.current
    if (!m) return
    const el = m.getContainer()
    const w = el.clientWidth || 360
    const h = el.clientHeight || 360
    const padding = iranFramePadding(w, h)
    let zoom = 0
    try {
      zoom = m.getZoom()
    } catch {
      /* ignore */
    }
    const fit = (fitDur: number) => {
      const mm = map.current
      if (!mm) return
      const fallback = iranFallbackCamera(w, h)
      let center: maplibregl.LngLatLike = fallback.center
      let z = fallback.zoom
      try {
        const cam = mm.cameraForBounds(IRAN_BOUNDS, { padding, maxZoom: IRAN_FIT_MAX_ZOOM, bearing: 0 })
        if (cam && typeof cam.zoom === 'number' && Number.isFinite(cam.zoom)) {
          z = cam.zoom
          if (cam.center) center = cam.center
        }
      } catch {
        /* ignore */
      }
      try {
        mm.easeTo({ center, zoom: z, bearing: 0, duration: fitDur, easing: easeInOutCubic })
      } catch {
        /* ignore */
      }
    }
    if (needsGlobeSettle(zoom)) {
      // پیش‌نشست ۳۸٪ از زمان را می‌گیرد و بقیه به خودِ قاب می‌رسد تا مجموعِ دو تکه همان
      // ‏duration شود؛ وگرنه راستی‌آزماییِ بعدی وسطِ انیمیشن می‌افتد و قاب را خراب می‌کند.
      const settleDur = Math.round(duration * 0.38)
      try {
        m.easeTo({ center: IRAN_CENTER, zoom: GLOBE_SETTLE_ZOOM, bearing: 0, duration: settleDur, easing: easeInOutCubic })
      } catch {
        /* ignore */
      }
      at(settleDur + 20, () => fit(duration - settleDur))
    } else {
      fit(duration)
    }
  }, [at])

  /**
   * راستی‌آزماییِ قاب بعد از fit: محیطِ ایران را نقطه‌به‌نقطه تصویر می‌کنیم و اگر جایی
   * بیرونِ جعبه‌ی مفید ماند، همان اندازه عقب می‌رویم. (نسخه‌ی خالصِ محاسبه در
   * ‏neededZoomDelta است و در jsdom آزموده می‌شود.)
   */
  const verifyIranFrame = useCallback((duration = 420) => {
    const m = map.current
    if (!m) return
    const el = m.getContainer()
    const w = el.clientWidth
    const h = el.clientHeight
    if (!w || !h) return
    const pts: { x: number; y: number }[] = []
    for (const probe of iranFrameProbes()) {
      try {
        const p = m.project(probe)
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) pts.push({ x: p.x, y: p.y })
      } catch {
        /* ignore */
      }
    }
    if (pts.length === 0) return
    // اگر کاربر خودش نمای را جابه‌جا کرده، دیگر دست به دوربین نمی‌زنیم (سنجش فقط برای
    // قابِ خودکارِ ایران است، نه برای تعقیبِ هر نمای دلخواهِ کاربر)
    const c = m.getCenter()
    if (Math.abs(c.lng - IRAN_CENTER[0]) > 6 || Math.abs(c.lat - IRAN_CENTER[1]) > 6) return
    const delta = neededZoomDelta(pts, { w, h, padding: iranFramePadding(w, h) })
    if (delta < -0.02) {
      try {
        m.easeTo({ zoom: m.getZoom() + delta, duration, easing: easeOutCubic })
      } catch {
        /* ignore */
      }
    }
  }, [])

  /* ------------------------------------------------------------- پاک‌سازی --- */

  /**
   * پایانِ بی‌قیدوشرطِ سکانس: هر تایمر، interval، حلقه‌ی rAF، مارکرِ موقت و حالتِ
   * بصری باید برود. هم موقع unmount و هم موقعِ ساخته‌شدنِ نقشه‌ی تازه صدا زده می‌شود
   * (اگر وسط پرواز پنجره بسته شود یا موقعیت تازه برسد).
   */
  const stopCinema = useCallback(() => {
    flyingRef.current = false
    timers.current.forEach((id) => window.clearTimeout(id))
    tickers.current.forEach((id) => window.clearInterval(id))
    timers.current = []
    tickers.current = []
    stopCineClock()
    stopThreadFlow()
    clearCineMarkers()
    const m = map.current
    if (m) {
      try {
        if (skyBackup.current) {
          m.setSky({
            'horizon-color': SKY_BASE['horizon-color'],
            'sky-horizon-blend': SKY_BASE['sky-horizon-blend'],
          })
          skyBackup.current = null
        }
      } catch {
        /* ignore */
      }
      setGlowTransition(650)
      setGlow(0.16, 6)
    }
    glowBoost.current = 0
    setFlying(false)
    setCine(false)
    setCaption(null)
    setShowKm(false)
    setCineBars(false)
    setSpaceMode(false)
  }, [clearCineMarkers, setGlow, setGlowTransition, stopCineClock, stopThreadFlow])

  useEffect(() => stopCinema, [stopCinema])

  /* --------------------------------------------------------------- نقشه --- */

  useEffect(() => {
    if (!data || !container.current || map.current) return
    const daddy: LngLat = [data.daddy.lng, data.daddy.lat]
    const daughter: LngLat = [data.daughter.lng, data.daughter.lat]
    routePath.current = arc(daddy, daughter)
    const space = spaceShotCenter(daddy, daughter)
    const liveLabel = t('map.live')

    // آدرس صریح ورکر: با اسم‌هش‌خورده‌ی بیلد هم درست حل می‌شود (به‌همراه
    // optimizeDeps.exclude در vite.config این خطای ورکر را می‌بندد)
    maplibregl.config.WORKER_URL = maplibreWorkerUrl
    const m = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        // کره‌ی واقعی زمین به‌جای نقشه‌ی مسطح؛ با زوم بالا خودش به
        // مرکاتور (نمای خیابانی) نرم وصل می‌شود
        projection: { type: 'globe' },
        sky: SKY_BASE,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap',
          },
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center: space,
      zoom: 1.1,
      attributionControl: { compact: true },
    })
    map.current = m

    const ensureMarkers = () => {
      if (markers.current.length === 0) {
        markers.current = [
          new maplibregl.Marker({ element: heartMarker('#f767a8', t('map.daddyHome'), false, false, liveLabel) })
            .setLngLat(daddy)
            .addTo(m),
          new maplibregl.Marker({
            element: heartMarker('#bba0fb', t('map.daughterHome'), !!data.daughter.is_live, !!data.daughter.is_live, liveLabel),
          })
            .setLngLat(daughter)
            .addTo(m),
        ]
      }
    }

    m.on('load', () => {
      // دو resize تا قاب بعد از جاگذاری لایه‌ها دقیق شود؛ fitBounds باید با ابعادِ
      // نهاییِ ظرف حساب شود، وگرنه در بارِ اول کمی جابه‌جا می‌نشیند.
      at(80, () => {
        try {
          m.resize()
        } catch {
          /* ignore */
        }
      })
      at(500, () => {
        try {
          m.resize()
        } catch {
          /* ignore */
        }
      })

      m.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: routePath.current },
        },
      })
      // لایه‌ی درخشش زیر نخ — جادوی نخ موقع پرواز روشن‌تر می‌شود و همگام با ضربان می‌تپد
      m.addLayer({
        id: 'route-glow',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#f767a8',
          'line-width': 6,
          'line-blur': 7,
          'line-opacity': 0.16,
          'line-opacity-transition': { duration: 650 },
          'line-width-transition': { duration: 650 },
        },
      })
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#f767a8', 'line-width': 3, 'line-dasharray': [2, 1.6] },
      })
      // «کمان نور»: نورِ سفیدِ کوتاهی که روی نخ به سمت خانه‌ی دخترم می‌خزد
      m.addLayer({
        id: 'route-comet',
        type: 'line',
        source: 'route',
        paint: {
          'line-color': '#fff2f8',
          'line-width': 5,
          'line-blur': 1.6,
          'line-opacity': 0,
          'line-opacity-transition': { duration: 420 },
          'line-dasharray': [0, 0, COMET_LENGTH, COMET_PERIOD - COMET_LENGTH],
        },
      })
      markers.current = [
        new maplibregl.Marker({ element: heartMarker('#f767a8', t('map.daddyHome'), false, false, liveLabel) })
          .setLngLat(daddy)
          .addTo(m),
        new maplibregl.Marker({
          element: heartMarker('#bba0fb', t('map.daughterHome'), !!data.daughter.is_live, !!data.daughter.is_live, liveLabel),
        })
          .setLngLat(daughter)
          .addTo(m),
      ]

      /* نمای ورودی: کره‌ی کامل با هر دو قلب رو به ما → زومِ نرمِ خوش‌آمدگویی روی ایران */
      const el = m.getContainer()
      const gz = globeZoomFor(space[1], el.clientWidth, el.clientHeight)
      try {
        m.jumpTo({ center: space, zoom: Math.max(0.2, gz - 0.4), bearing: -16 })
      } catch {
        /* ignore */
      }
      // بعد از هر دو resize؛ استراحتِ نهایی روی قابِ کاملِ ایران است (نه کره)
      at(620, () => frameIran(1500))
      at(2300, () => verifyIranFrame(420))
      // سنجشِ دوم: اگر سنجشِ نخست وادار به اصلاح شد (مقیاسِ صفحه‌ای روی کره دقیقاً 2^Δz نیست)
      // یک بارِ دیگر هم می‌سنجیم تا ایران بی‌کم‌وکاست در قاب بماند
      at(3200, () => verifyIranFrame(420))
    })

    // راز ⑨ — زوم کامل روی شهر بابا
    m.on('zoomend', () => {
      // تا سکانسِ پرواز تمام نشده راز مصرف نمی‌شود: سقف زومِ سکانس ۱۱٫۶ است (زیر ۱۳)
      // ولی اگر کاربر وسط پرواز خودش زوم کند هم نباید تصادفی بسوزد.
      if (eggFired.current || flyingRef.current || m.getZoom() < 13) return
      const c = m.getCenter()
      const near = Math.abs(c.lng - daddy[0]) < 0.25 && Math.abs(c.lat - daddy[1]) < 0.25
      if (!near) return
      eggFired.current = true
      post<{ found: boolean; title: string; message: string; attachment?: string }>('/egg', { trigger: 'map_zoom' })
        .then((r) => r.found && showEgg({ title: r.title, message: r.message, attachment: r.attachment }))
        .catch(() => undefined)
    })

    const fallback = window.setTimeout(ensureMarkers, 1200)

    return () => {
      window.clearTimeout(fallback)
      // اگر وسط سکانس پنجره بسته شد یا نقشه دوباره ساخته شد، هیچ تایمر/انیمیشنی
      // نباید روی نقشه‌ی مرده باقی بماند
      stopCinema()
      m.remove()
      map.current = null
      markers.current = []
    }
  }, [at, data, frameIran, showEgg, stopCinema, t, verifyIranFrame])

  /** وقتی موقعیت تازه ثبت شد، نقطه‌ی دخترم بی‌درنگ جابجا می‌شود */
  useEffect(() => {
    if (!map.current || markers.current.length < 2 || !data?.daughter) return
    const daughter: [number, number] = [data.daughter.lng, data.daughter.lat]
    const path = arc([data.daddy.lng, data.daddy.lat], daughter)
    routePath.current = path
    markers.current[1].setLngLat(daughter)
    const src = map.current.getSource('route') as maplibregl.GeoJSONSource | undefined
    src?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: path },
    })
  }, [data])

  /**
   * 🎬 پرواز روی مسیر — دنباله‌ی سینماییِ کامل (~۲۰٫۴ ثانیه، غیرقابل‌رد):
   *   ۰٫۰s   پرده‌ی سینما، زیرنویس ۱، فوران از خانه‌ی بابا
   *   ۰٫۳s   عقب‌کشی نرم به کره‌ی کامل + دو شهاب + شکوفاییِ هاله‌ی جو
   *   ۲٫۹s   شیرجه به خانه‌ی بابا (زوم ۱۱٫۲) + شروعِ ضربانِ نخ و جریانِ نور
   *   ۵٫۵s   رسیدن: حلقه‌ی موجِ ضربه‌ای، مدارِ bearing تا ۴۶° و زوم ۱۱٫۶ با مکث
   *   ۷٫۶s   بلند شدن: هوووش + فورانِ بزرگ + زیرنویس ۳
   *   ۷٫۹s   پروازِ ۶ ثانیه‌ای روی کمان: جرقه با ردپای قلب، شمارنده‌ی کیلومتر،
   *           کمانِ نور، فورانِ پیوسته از هر دو خانه، ضربانِ قلبِ همگام
   *   ۱۳٫۹s  فرودِ جشن‌گونه: اورلیِ پیام پایانی + چهار موجِ آتشینی + مدار تا ۱۱۲°
   *   ۱۷٫۳s  بازگشتِ نرم به همان قابِ ایران (با راستی‌آزماییِ ۱۶ نقطه‌ی محیطی)
   *   ۲۰٫۴s  باز شدنِ قفلِ دکمه
   * همه‌ی لحظه‌ها از FLIGHT_BASE در mapOfUsCinema.ts می‌آیند و برای
   * prefers-reduced-motion با ضریب ۰٫۱۵ فشرده و بدون ذره/صدا اجرا می‌شوند.
   */
  const fly = () => {
    const m = map.current
    if (!data || !m || flyingRef.current) return
    playClick()
    flyingRef.current = true
    setFlying(true)
    stopThreadFlow()
    // نقشه پایینِ محتواست؛ اول به بالای اپ اسکرول می‌کنیم تا پرواز دیده شود
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      topRef.current
        ?.closest?.('.overflow-y-auto')
        ?.scrollTo?.({ top: 0, behavior: 'smooth' })
    }, 60)

    const daddy: LngLat = [data.daddy.lng, data.daddy.lat]
    const daughter: LngLat = [data.daughter.lng, data.daughter.lat]
    const path = routePath.current.length > 1 ? routePath.current : arc(daddy, daughter)
    const cum = pathCumulativeKm(path)
    const totalKm = cum[cum.length - 1] ?? 0
    const el = m.getContainer()
    const space = spaceShotCenter(daddy, daughter)
    const gz = globeZoomFor(space[1], el.clientWidth, el.clientHeight)
    let reduced = false
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      /* ignore */
    }
    // مقیاس زمان: برای حرکت کمتر، سکانس فشرده و بی‌ذره/بی‌صدا اجرا می‌شود
    const D = cineScale(reduced)
    const C = flightCueTimes(reduced)
    const fx = !reduced
    const t0 = performance.now()
    glowBoost.current = 0

    /* ——— فاز ۰: پرده‌ی سینما و عقب‌کشی به کره‌ی کامل ——— */
    setCineBars(true)
    setSpaceMode(true)
    setCaption(t(CAPTION_KEYS[0]))
    if (fx) at(C.burstCurtain, () => burst(daddy, 10))
    at(C.pullback, () => {
      try {
        m.easeTo({ center: space, zoom: gz, bearing: 0, duration: C.pullbackDur, easing: easeInOutCubic })
      } catch {
        /* ignore */
      }
    })
    if (fx) {
      at(C.meteor1, () => meteor())
      at(C.halo, () => haloBloom())
      at(C.meteor2, () => meteor())
    }
    at(C.caption1Hide, () => setCaption(null))
    at(C.twinkleOff, () => setSpaceMode(false))

    /* ——— فاز ۱: شیرجه به خانه‌ی بابا، مدار و مکث ——— */
    at(C.dive, () => {
      setCaption(t(CAPTION_KEYS[1]))
      try {
        m.flyTo({ center: daddy, zoom: FLIGHT_ZOOM.approach, duration: C.diveDur, curve: 1.35, essential: true })
      } catch {
        /* ignore */
      }
      setGlowTransition(0) // پالس با rAF نوشته می‌شود؛ گذار باید خاموش باشد
      setGlow(0.5, 9)
      startThreadFlow()
      startCineClock(t0, C, reduced, { path, cum, totalKm })
      if (fx) at(D(320), () => burst(daddy, 8))
    })
    if (fx) {
      at(C.daddyWave1, () => burst(daddy, 8))
      at(C.daddyWave2, () => burst(daddy, 8))
      at(C.daddyWave3, () => burst(daddy, 6))
    }
    at(C.caption2Hide, () => setCaption(null))
    at(C.ringDaddy, () => {
      if (fx) shockwave(daddy)
    })
    at(C.orbitDaddy, () => {
      try {
        m.easeTo({
          center: daddy,
          zoom: FLIGHT_ZOOM.orbit,
          bearing: FLIGHT_BEARING.daddy,
          duration: C.orbitDaddyDur,
          easing: easeInOutCubic,
        })
      } catch {
        /* ignore */
      }
    })

    /* ——— فاز ۲: بلند شدن ——— */
    at(C.liftoff, () => {
      setCaption(t(CAPTION_KEYS[2]))
      glowBoost.current = 1
      setGlow(0.95, 15)
      if (fx) {
        whoosh()
        burst(daddy, 16)
        shockwave(daddy)
      }
    })
    at(C.caption3Hide, () => setCaption(null))

    /* ——— فاز ۳: پرواز روی کمان تا خانه‌ی دخترم ——— */
    at(C.flight, () => {
      setShowKm(true)
      try {
        m.flyTo({ center: daughter, zoom: FLIGHT_ZOOM.approach, duration: C.flightDur, curve: 1.22, essential: true })
      } catch {
        /* ignore */
      }
      if (fx) {
        // در طول مسیر، از هر دو خانه بی‌وقفه قلب و بینهایت فوران می‌کند
        let flip = false
        const id = window.setInterval(() => {
          if (performance.now() - t0 >= C.land) {
            window.clearInterval(id)
            return
          }
          burst(flip ? daddy : daughter, 4)
          flip = !flip
        }, 520)
        tickers.current.push(id)
      }
    })
    at(C.captionMid, () => setCaption(t(CAPTION_KEYS[3])))
    at(C.captionMidHide, () => setCaption(null))
    at(C.approach, () => {
      glowBoost.current = 1
      setGlow(1, 17)
      if (fx) burst(daughter, 10)
    })
    // ضربان‌ها روی شبکه‌ی پالسِ نور نشسته‌اند (dive + 80 + 900k) تا صدا و نور یکی باشند؛
    // ضربانِ سوم سه ضربه دارد و از دلِ فرود هم می‌گذرد
    if (fx) {
      at(C.heartbeat1, () => playHeartbeat(2))
      at(C.heartbeat2, () => playHeartbeat(2))
      at(C.heartbeat3, () => playHeartbeat(3))
    }

    /* ——— فاز ۴: فرودِ جشن‌گونه ——— */
    at(C.land, () => {
      setCine(true)
      glowBoost.current = 1
      setGlow(0.85, 13)
      if (fx) {
        burst(daughter, LANDING_WAVES[0])
        shockwave(daughter)
        playBloom()
      }
    })
    at(C.orbitDaughter, () => {
      try {
        m.easeTo({
          center: daughter,
          zoom: FLIGHT_ZOOM.orbit,
          bearing: FLIGHT_BEARING.daughter,
          duration: C.orbitDaughterDur,
          easing: easeInOutCubic,
        })
      } catch {
        /* ignore */
      }
    })
    if (fx) {
      at(C.landWave2, () => {
        burst(daughter, LANDING_WAVES[1])
        shockwave(daughter)
      })
      at(C.landWave3, () => burst(daughter, LANDING_WAVES[2]))
      at(C.landWave4, () => {
        burst(daughter, LANDING_WAVES[3])
        shockwave(daughter)
      })
    }
    at(C.counterHide, () => setShowKm(false))
    // در حالت حرکتِ کمتر پیام متن بی‌حرکت است؛ کمی بیشتر می‌ماند تا خوانده شود
    at(reduced ? C.land + 2100 : C.cineHide, () => setCine(false))

    /* ——— فاز ۵: بازگشتِ نرم به همان قابِ ایران ——— */
    at(C.home, () => {
      stopCineClock()
      stopThreadFlow()
      setGlowTransition(650)
      setGlow(0.3, 7)
      setCaption(null)
      setShowKm(false)
      setCineBars(false)
      frameIran(C.homeSettleDur + C.homeFitDur)
    })
    at(C.verify, () => verifyIranFrame(420))
    // سنجشِ دوم هم پیش از آزاد شدنِ دکمه تمام می‌شود (۱۹۸۰۰+۴۸۰+۱۱۰ < ۲۰۴۰۰)
    at(C.verify + 480, () => verifyIranFrame(110))
    at(C.unlock, () => {
      flyingRef.current = false
      setFlying(false)
    })
  }

  const askLocation = async () => {
    setBusy(true)
    setNote('')
    const res = await enableLiveLocation()
    if (res.ok) {
      patchConfig({ live_location: res.location })
      setNote(t('map.liveOk'))
      await load()
    } else {
      setNote(t('map.liveDenied'))
    }
    setBusy(false)
  }

  const refreshLocation = async () => {
    setBusy(true)
    setNote('')
    const coords = await getCurrentPosition()
    if (coords) {
      const city = await lookupCity(coords.lat, coords.lng)
      const saved = await pushLocation(coords, city)
      if (saved) patchConfig({ live_location: saved })
      setNote(t('map.liveUpdated'))
      await load()
    } else {
      setNote(t('map.liveDenied'))
    }
    setBusy(false)
  }

  if (!data) return <Loading />

  const timeDiff = Math.abs(data.daddy.hour - data.daughter.hour)

  return (
    <div ref={topRef} className="space-y-3 os-no-select">
      <div className="relative overflow-hidden rounded-3xl" style={{ border: '1px solid var(--os-border)' }}>
        <div ref={container} className={`loveos-space h-[360px] w-full${spaceMode ? ' loveos-space--cine' : ''}`} />
        {/* لایه‌ی جلوه‌ها: ذره‌های فوران و شهاب‌ها روی کره */}
        <div ref={fxRef} className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" />
        {/* نوارهای سینمایی: قابِ تیره‌ی بالا و پایین در طول سکانس */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-[3] h-5"
          style={{
            opacity: cineBars ? 1 : 0,
            transition: 'opacity 700ms ease',
            background: 'linear-gradient(to bottom, rgba(4,6,16,.92), rgba(4,6,16,0))',
          }}
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-5"
          style={{
            opacity: cineBars ? 1 : 0,
            transition: 'opacity 700ms ease',
            background: 'linear-gradient(to top, rgba(4,6,16,.92), rgba(4,6,16,0))',
          }}
        />
        {/* زیرنویسِ احساسیِ سکانس */}
        <AnimatePresence>
          {caption && (
            <motion.p
              key={caption}
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.5 }}
              className="loveos-cine-caption absolute inset-x-3 top-3 z-[5] text-center"
            >
              {caption}
            </motion.p>
          )}
        </AnimatePresence>
        {/* شمارنده‌ی زنده‌ی کیلومترِ پیموده‌شده */}
        <AnimatePresence>
          {showKm && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 top-[54px] z-[5] flex justify-center"
            >
              <span ref={kmRef} className="loveos-cine-km">
                {t('map.cineKm', { km: digits(0) })}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {/* پیام پایانی بابا — اورلی سینمایی موقع فرود */}
        <AnimatePresence>
          {cine && (
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 200, damping: 22 }}
              className="absolute inset-x-3 bottom-3 z-[4] rounded-2xl px-4 py-3 text-center"
              style={{
                background: 'linear-gradient(135deg, rgba(247,103,168,.94), rgba(187,160,251,.9))',
                color: '#fff',
                boxShadow: '0 14px 40px -12px rgba(220,60,140,.65)',
                backdropFilter: 'blur(4px)',
              }}
            >
              <p className="text-[13px] font-semibold leading-6" style={{ textShadow: '0 1px 8px rgba(0,0,0,.22)' }}>
                {data.end_message}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[data.daddy, data.daughter].map((side, i) => (
          <div key={i} className="os-card p-3">
            <p className="flex items-center gap-1.5 text-xs os-muted">
              {i === 0 ? t('map.daddyHome') : t('map.daughterHome')}
              {side.is_live && (
                <span className="inline-flex items-center gap-1" style={{ color: 'var(--os-accent)' }}>
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--os-accent)' }} />
                  {t('map.live')}
                </span>
              )}
            </p>
            <p className="os-title mt-0.5 text-base">{side.city}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <Icon name={side.is_night ? 'moon' : 'sun'} size={15} />
              {digits(side.time)}
            </p>
            <p className="mt-1 text-[11px] os-muted">{side.is_night ? t('map.nightThere') : t('map.dayThere')}</p>
            {side.is_live && side.accuracy ? (
              <p className="mt-1 text-[10px] os-muted">
                {t('map.accuracy')}: {digits(Math.round(side.accuracy))} {t('map.meters')}
              </p>
            ) : null}
            {side.is_live && side.captured_at ? (
              <p className="mt-0.5 text-[10px] os-muted">
                {formatDate(new Date(side.captured_at))} • {formatTime(new Date(side.captured_at))}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      <div className="os-card flex items-center gap-3 p-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}>
          <Icon name="heart" size={18} />
        </span>
        <div className="flex-1">
          <p className="text-xs os-muted">{t('map.ourDistance')}</p>
          <p className="os-title text-lg">{digits(data.distance_km)} {t('os.km')}</p>
        </div>
        <div className="text-end">
          <p className="text-xs os-muted">{t('map.timeDiff')}</p>
          <p className="text-sm">{digits(timeDiff)} {t('os.hours')}</p>
        </div>
      </div>

      <div className="os-card space-y-2 p-3">
        <p className="text-xs leading-6 os-muted">{data.daughter.is_live ? t('map.liveHintOn') : t('map.liveHintOff')}</p>
        <div className="flex flex-wrap gap-2">
          <button className="os-chip" disabled={busy} onClick={() => void askLocation()}>
            <span className="inline-flex items-center gap-1">
              <Icon name="pin" size={13} /> {busy ? t('settings.locating') : t('map.useMyLocation')}
            </span>
          </button>
          {data.daughter.is_live && (
            <button className="os-chip" disabled={busy} onClick={() => void refreshLocation()}>
              <span className="inline-flex items-center gap-1"><Icon name="retry" size={13} /> {t('map.refresh')}</span>
            </button>
          )}
        </div>
        {note && <p className="text-[11px]" style={{ color: 'var(--os-accent)' }}>{note}</p>}
      </div>

      <button className="os-btn-primary w-full" disabled={flying} onClick={fly}>
        {flying ? `✨ ${t('map.flying')}` : `🚀 ${t('map.flyRoute')}`}
      </button>
      <p className="pt-1 text-center text-sm os-hand" style={{ color: 'var(--os-accent)' }}>{data.end_message}</p>
    </div>
  )
}
