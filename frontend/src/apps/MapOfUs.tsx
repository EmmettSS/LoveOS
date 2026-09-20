/**
 * MapOfUs — نقشه‌ی ما 🌍
 * کره‌ی واقعی زمین: پروجکشن «globe» خود MapLibre (نسخه‌ی ۶) روی همان
 * تایل‌های OSM؛ پس‌زمینه‌ی فضای ستاره‌دار با CSS و هاله‌ی جوِ صورتی دور کره.
 * دو قلب روی کره، نخ قوسی بینشان، دکمه‌ی «پرواز روی مسیر» با دنباله‌ی
 * سینمایی فشرده (~۸ ثانیه):
 *   فوران قلب ❤ و بینهایت ♾ و جرقه ✨ از هر دو خانه، درخشش و جریانِ
 *   متحرک روی نخ، و قلبِ جرقه‌ای که مسیر را می‌پیماید.
 * راز ⑨: زوم کامل روی شهر بابا (کره در زوم بالا خودش به نمای مسطح
 * خیابانی وصل می‌شود، پس راز همان‌طور کار می‌کند).
 *
 * موقعیت دخترم از دستگاه خودش خوانده می‌شود (اگر اجازه داده باشد)؛
 * شهر ثبت‌شده در پنل بابا فقط پیش‌فرض است. نشان «زنده» همیشه نشان می‌دهد
 * نقطه بر اساس کدام منبع کشیده شده است.
 */
import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { digits, formatDate, formatTime } from '../shared/format'
import { enableLiveLocation, getCurrentPosition, lookupCity, pushLocation } from '../shared/geo'
import { playBloom, playClick } from '../shared/sound'
import { useOS } from '../shared/store'
import { Loading } from '../shared/ui'

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

/**
 * زومی که کره‌ی کامل را در این ابعادِ ظرف نشان می‌دهد.
 * قطر کره در MapLibre برابر است با ‏512·2^z / (π·cos φ)؛ معکوسش می‌کنیم
 * تا کره با حاشیه‌ی مناسب در کوچک‌ترین بُعد ظرف بنشیند.
 */
function globeZoomFor(lat: number, width: number, height: number) {
  const size = Math.min(width, height)
  if (!size || size <= 0) return 1.2
  const diameter = size * 0.76
  const zoom = Math.log2((diameter * Math.PI * Math.cos((lat * Math.PI) / 180)) / 512)
  return Math.max(0.2, Math.min(1.8, zoom))
}

/** علامت‌هایی که موقع پرواز از خانه‌ها فوران می‌کنند */
const BURST_GLYPHS = ['❤', '♾', '✨', '💗', '❤', '♾'] // قلب و بینهایت بیشتر باشند
const BURST_COLORS = ['#ff8fbf', '#f767a8', '#ffd1e6', '#bba0fb', '#ffe27a']

function heartMarker(color: string, label: string, live = false, pulse = false) {
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
      ${label}${live ? ' • زنده' : ''}
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
  const [cine, setCine] = useState(false)
  const container = useRef<HTMLDivElement | null>(null)
  const fxRef = useRef<HTMLDivElement | null>(null)
  const topRef = useRef<HTMLDivElement | null>(null)
  const map = useRef<MLMap | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const eggFired = useRef(false)
  const flyingRef = useRef(false)
  const routePath = useRef<[number, number][]>([])
  /** همه‌ی تایمرها/انیمیشن‌های سکانس؛ موقع پاک‌شدن اپ همه باید بفروپایند */
  const timers = useRef<number[]>([])
  const tickers = useRef<number[]>([])
  const rafIds = useRef<number[]>([])

  const at = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

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

  useEffect(() => {
    return () => {
      // اگر وسط سکانس پرواز پنجره بسته شد، هیچ تایمر یا انیمیشنی در امان نماند
      flyingRef.current = false
      timers.current.forEach((id) => window.clearTimeout(id))
      tickers.current.forEach((id) => window.clearInterval(id))
      rafIds.current.forEach((id) => cancelAnimationFrame(id))
      timers.current = []
      tickers.current = []
      rafIds.current = []
    }
  }, [])

  /** فوران قلب/بینهایت/جرقه از یک نقطه روی کره */
  const burst = useCallback((lngLat: [number, number], count: number) => {
    const m = map.current
    const fx = fxRef.current
    if (!m || !fx || count <= 0) return
    let p: { x: number; y: number }
    try {
      p = m.project(lngLat)
    } catch {
      return
    }
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
      let anim: Animation | null = null
      try {
        anim = el.animate(
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
      window.setTimeout(() => el.remove(), 3200)
    }
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

  /** جریانِ متحرک dash روی نخ (مثل خزیدن نور به سمت دخترم) */
  const startDashFlow = useCallback(() => {
    const phases: number[][] = [
      [0, 4, 3],
      [0.5, 4, 2.5],
      [1, 4, 2],
      [1.5, 4, 1.5],
      [2, 4, 1],
      [2.5, 4, 0.5],
      [3, 4, 0],
      [3.5, 4, 0.5],
    ]
    let i = 0
    const id = window.setInterval(() => {
      const m = map.current
      if (!m) return
      try {
        m.setPaintProperty('route', 'line-dasharray', phases[i % phases.length] as [number, number, number])
      } catch {
        /* ignore */
      }
      i += 1
    }, 110)
    tickers.current.push(id)
  }, [])

  const stopDashFlow = useCallback(() => {
    tickers.current.forEach((id) => window.clearInterval(id))
    tickers.current = []
    const m = map.current
    if (m) {
      try {
        m.setPaintProperty('route', 'line-dasharray', [2, 1.6])
      } catch {
        /* ignore */
      }
    }
  }, [])

  /** قلبِ جرقه‌ای که روی کمان می‌پیماید؛ هم‌زمان با flyTo دوربین */
  const travelSpark = useCallback((path: [number, number][], duration: number) => {
    const m = map.current
    if (!m || path.length < 2) return
    const el = document.createElement('div')
    el.className = 'loveos-spark'
    el.innerHTML = '<span>❤</span>'
    const marker = new maplibregl.Marker({ element: el }).setLngLat(path[0]).addTo(m)
    const start = performance.now()
    const step = (now: number) => {
      const raw = Math.min(1, (now - start) / duration)
      // easeInOutQuad: آهسته بلند می‌شود، وسط مسیر تند است، نرم فرود می‌آید
      const eased = raw < 0.5 ? 2 * raw * raw : 1 - (-2 * raw + 2) ** 2 / 2
      const idx = eased * (path.length - 1)
      const i0 = Math.floor(idx)
      const i1 = Math.min(path.length - 1, i0 + 1)
      const f = idx - i0
      try {
        marker.setLngLat([
          path[i0][0] + (path[i1][0] - path[i0][0]) * f,
          path[i0][1] + (path[i1][1] - path[i0][1]) * f,
        ])
      } catch {
        marker.remove()
        return
      }
      if (raw < 1 && flyingRef.current) rafIds.current.push(requestAnimationFrame(step))
      else marker.remove()
    }
    rafIds.current.push(requestAnimationFrame(step))
  }, [])

  useEffect(() => {
    if (!data || !container.current || map.current) return
    const daddy: [number, number] = [data.daddy.lng, data.daddy.lat]
    const daughter: [number, number] = [data.daughter.lng, data.daughter.lat]
    const mid: [number, number] = [(daddy[0] + daughter[0]) / 2, (daddy[1] + daughter[1]) / 2]
    routePath.current = arc(daddy, daughter)

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
        sky: {
          'sky-color': '#0b1026',
          'horizon-color': '#f6b8d9',
          'sky-horizon-blend': 0.7,
          // هاله‌ی جو فقط در نمای کره دیده شود؛ در نمای نزدیک محو شود
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 4, 0.45, 6, 0],
        },
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
      center: mid,
      zoom: 1.1,
      attributionControl: { compact: true },
    })
    map.current = m

    const ensureMarkers = () => {
      if (markers.current.length === 0) {
        markers.current = [
          new maplibregl.Marker({ element: heartMarker('#f767a8', t('map.daddyHome')) }).setLngLat(daddy).addTo(m),
          new maplibregl.Marker({
            element: heartMarker('#bba0fb', t('map.daughterHome'), !!data.daughter.is_live, !!data.daughter.is_live),
          })
            .setLngLat(daughter)
            .addTo(m),
        ]
      }
    }

    m.on('load', () => {
      setTimeout(() => {
        try { m.resize() } catch {}
      }, 80)
      setTimeout(() => {
        try { m.resize() } catch {}
      }, 500)

      m.addSource('route', {
        type: 'geojson',
        data: {
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: routePath.current },
        },
      })
      // لایه‌ی درخشش زیر نخ — جادوی نخ موقع پرواز روشن‌تر می‌شود
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
      markers.current = [
        new maplibregl.Marker({ element: heartMarker('#f767a8', t('map.daddyHome')) }).setLngLat(daddy).addTo(m),
        new maplibregl.Marker({
          element: heartMarker('#bba0fb', t('map.daughterHome'), !!data.daughter.is_live, !!data.daughter.is_live),
        })
          .setLngLat(daughter)
          .addTo(m),
      ]
      // نمای اولیه: کره‌ی کامل با هر دو قلب رو به ما؛ یک زومِ نرمِ خوش‌آمدگویی
      const el = m.getContainer()
      const gz = globeZoomFor(mid[1], el.clientWidth, el.clientHeight)
      try { m.jumpTo({ center: mid, zoom: Math.max(0.2, gz - 0.35) }) } catch {}
      setTimeout(() => {
        try { m.easeTo({ center: mid, zoom: gz, duration: 1100 }) } catch {}
      }, 200)
    })

    // راز ⑨ — زوم کامل روی شهر بابا
    m.on('zoomend', () => {
      if (eggFired.current || m.getZoom() < 13) return
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
      m.remove()
      map.current = null
      markers.current = []
    }
  }, [data, showEgg, t])

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
   * 🎬 پرواز روی مسیر — دنباله‌ی سینمایی فشرده (~۸.۵ ثانیه):
   *   ۰.۰s  دور شدن به نمای کامل کره + فوران از خانه‌ی بابا
   *   ۰.۹s  شیرجه به خانه‌ی بابا؛ نخ روشن و روان می‌شود
   *   ۲.۶s  پرواز دوربین + قلب جرقه‌ای روی کمان تا خانه‌ی دخترم
   *   ۵.۶s  فوران فرود + پیام پایانی به‌صورت اورلی روی نقشه
   *   ۷.۴s  بازگشت نرم به نمای کره
   * برای prefers-reduced-motion همه‌چیز فشرده و بدون ذره اجرا می‌شود.
   */
  const fly = () => {
    const m = map.current
    if (!data || !m || flyingRef.current) return
    playClick()
    flyingRef.current = true
    setFlying(true)
    stopDashFlow()
    // نقشه پایینِ محتواست؛ اول به بالای اپ اسکرول می‌کنیم تا پرواز دیده شود
    topRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      topRef.current
        ?.closest?.('.overflow-y-auto')
        ?.scrollTo?.({ top: 0, behavior: 'smooth' })
    }, 60)

    const daddy: [number, number] = [data.daddy.lng, data.daddy.lat]
    const daughter: [number, number] = [data.daughter.lng, data.daughter.lat]
    const mid: [number, number] = [(daddy[0] + daughter[0]) / 2, (daddy[1] + daughter[1]) / 2]
    const path = routePath.current.length > 1 ? routePath.current : arc(daddy, daughter)
    const el = m.getContainer()
    const gz = globeZoomFor(mid[1], el.clientWidth, el.clientHeight)
    let reduced = false
    try {
      reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    } catch {
      /* ignore */
    }
    // مقیاس زمان: برای حرکت کمتر، سکانس فشرده و بی‌ذره اجرا می‌شود
    const D = (ms: number) => (reduced ? 120 + Math.round(ms * 0.14) : ms)

    // ۱) عقب‌کشی به فضای کنار کره
    try { m.easeTo({ center: mid, zoom: gz, duration: D(900) }) } catch {}
    at(D(250), () => burst(daddy, reduced ? 0 : 14))

    // ۲) شیرجه به خانه‌ی بابا؛ نخ روشن و روان می‌شود
    at(D(900), () => {
      try {
        m.flyTo({ center: daddy, zoom: 4.7, duration: D(1700), curve: 1.5 })
      } catch {}
      setGlow(0.85, 12)
      startDashFlow()
      if (!reduced) at(D(300), () => burst(daddy, 6))
    })

    // ۳) پرواز روی کمان تا خانه‌ی دخترم؛ قلب جرقه‌ای همراه دوربین می‌تازد
    at(D(2600), () => {
      try {
        m.flyTo({ center: daughter, zoom: 4.7, duration: D(3000), curve: 1.42 })
      } catch {}
      travelSpark(path, D(3000))
      if (!reduced) {
        // در طول مسیر، از هر دو خانه بی‌وقفه قلب و بینهایت فوران می‌کند
        let flip = false
        const id = window.setInterval(() => {
          burst(flip ? daddy : daughter, 4)
          flip = !flip
        }, 480)
        tickers.current.push(id)
      }
    })

    // ۴) فرود: فوران بزرگ + پیام پایانی روی نقشه
    at(D(5650), () => {
      stopDashFlow()
      setGlow(0.5, 9)
      if (!reduced) {
        burst(daughter, 18)
        playBloom()
      }
      setCine(true)
    })
    // در حالت حرکتِ کمتر پیام متن بی‌حرکت است؛ کمی بیشتر می‌ماند تا خوانده شود
    const cineHideAt = reduced ? D(5650) + 2100 : D(7100)
    at(cineHideAt, () => setCine(false))

    // ۵) بازگشت نرم به نمای کره؛ نخ با درخشش ملایم می‌ماند
    const backAt = reduced ? cineHideAt + 150 : D(7400)
    at(backAt, () => {
      try { m.easeTo({ center: mid, zoom: gz, duration: D(1000) }) } catch {}
      setGlow(0.3, 7)
    })
    at(backAt + (reduced ? 900 : D(1100)), () => {
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
        <div ref={container} className="loveos-space h-[360px] w-full" />
        {/* لایه‌ی جلوه‌ها: ذره‌های فوران روی کره */}
        <div ref={fxRef} className="pointer-events-none absolute inset-0 z-[2] overflow-hidden" />
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
