/**
 * MapOfUs — نقشه‌ی ما
 * دو نقطه‌ی قلبی روی نقشه‌ی OSM، خط منحنی بینشان، دکمه‌ی «پرواز روی مسیر»
 * و پیام پایانی بابا. راز ⑨: زوم کامل روی شهر بابا.
 */
import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { digits } from '../shared/format'
import { playClick } from '../shared/sound'
import { useOS } from '../shared/store'
import { Loading } from '../shared/ui'

interface Side {
  city: string
  lat: number
  lng: number
  time: string
  hour: number
  is_night: boolean
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

function heartMarker(color: string, label: string) {
  const el = document.createElement('div')
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;transform:translateY(-6px)'
  el.innerHTML = `
    <svg width="34" height="34" viewBox="0 0 24 24" style="filter:drop-shadow(0 4px 8px rgba(0,0,0,.25))">
      <path d="M12 21s-8-5.2-8-10.6A4.7 4.7 0 0 1 12 8a4.7 4.7 0 0 1 8 2.4C20 15.8 12 21 12 21Z" fill="${color}"/>
    </svg>
    <span style="background:rgba(255,255,255,.9);color:#4a2c40;border-radius:999px;padding:1px 8px;font-size:11px;margin-top:-4px;white-space:nowrap">${label}</span>`
  return el
}

export default function MapOfUs() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const [data, setData] = useState<MapData | null>(null)
  const container = useRef<HTMLDivElement | null>(null)
  const map = useRef<MLMap | null>(null)
  const eggFired = useRef(false)

  useEffect(() => {
    get<MapData>('/map').then(setData).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (!data || !container.current || map.current) return
    const daddy: [number, number] = [data.daddy.lng, data.daddy.lat]
    const daughter: [number, number] = [data.daughter.lng, data.daughter.lat]

    const m = new maplibregl.Map({
      container: container.current,
      // استایل رستری از OpenStreetMap — بدون کلید API
      style: {
        version: 8,
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
      center: [(daddy[0] + daughter[0]) / 2, (daddy[1] + daughter[1]) / 2],
      zoom: 4,
      attributionControl: { compact: true },
    })
    map.current = m

    m.on('load', () => {
      m.addSource('route', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: arc(daddy, daughter) } },
      })
      m.addLayer({
        id: 'route',
        type: 'line',
        source: 'route',
        paint: { 'line-color': '#f767a8', 'line-width': 3, 'line-dasharray': [2, 1.6] },
      })
      new maplibregl.Marker({ element: heartMarker('#f767a8', t('map.daddyHome')) }).setLngLat(daddy).addTo(m)
      new maplibregl.Marker({ element: heartMarker('#bba0fb', t('map.daughterHome')) }).setLngLat(daughter).addTo(m)
      m.fitBounds([daddy, daughter], { padding: 70, duration: 1400 })
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

    return () => {
      m.remove()
      map.current = null
    }
  }, [data, showEgg, t])

  const fly = () => {
    if (!data || !map.current) return
    playClick()
    const m = map.current
    m.flyTo({ center: [data.daddy.lng, data.daddy.lat], zoom: 9, duration: 2600 })
    setTimeout(() => m.flyTo({ center: [data.daughter.lng, data.daughter.lat], zoom: 9, duration: 3200 }), 3000)
    setTimeout(
      () => m.fitBounds([[data.daddy.lng, data.daddy.lat], [data.daughter.lng, data.daughter.lat]], { padding: 70, duration: 1800 }),
      6600,
    )
  }

  if (!data) return <Loading />

  const timeDiff = Math.abs(data.daddy.hour - data.daughter.hour)

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-3xl" style={{ border: '1px solid var(--os-border)' }}>
        <div ref={container} className="h-[320px] w-full" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[data.daddy, data.daughter].map((side, i) => (
          <div key={i} className="os-card p-3">
            <p className="text-xs os-muted">{i === 0 ? t('map.daddyHome') : t('map.daughterHome')}</p>
            <p className="os-title mt-0.5 text-base">{side.city}</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm">
              <Icon name={side.is_night ? 'moon' : 'sun'} size={15} />
              {digits(side.time)}
            </p>
            <p className="mt-1 text-[11px] os-muted">{side.is_night ? t('map.nightThere') : t('map.dayThere')}</p>
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

      <button className="os-btn-primary w-full" onClick={fly}>{t('map.flyRoute')}</button>
      <p className="pt-1 text-center text-sm os-hand" style={{ color: 'var(--os-accent)' }}>{data.end_message}</p>
    </div>
  )
}
