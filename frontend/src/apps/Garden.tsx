/**
 * Garden — باغچه‌ی سه‌بعدی با آب‌پاش
 * راز ⑪: پنج بار آب دادن به یک گل.
 */
import { motion } from 'framer-motion'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { digits } from '../shared/format'
import { playBloom } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Empty, useApi } from '../shared/ui'
import { flowerStage } from '../three/scenes/garden'

const GardenSceneView = lazy(() => import('../three/components/GardenScene'))

interface Flower {
  id: number
  name: string
  color: string
  emoji: string
  water_count: number
}

function stage(n: number) {
  return flowerStage(n)
}

function Plant({ f, bloom }: { f: Flower; bloom: boolean }) {
  const s = stage(f.water_count)
  const height = 18 + s * 16
  return (
    <svg width="88" height="120" viewBox="0 0 88 120" className="mx-auto">
      <path d="M26 96h36l-4 20H30Z" fill="#e8b596" />
      <rect x="23" y="90" width="42" height="8" rx="3" fill="#d79c7c" />
      <motion.path
        d={`M44 92 C 40 ${92 - height / 2}, 48 ${92 - height / 1.4}, 44 ${92 - height}`}
        stroke="#6fbf73"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
        initial={false}
        animate={{ pathLength: 1 }}
      />
      {s >= 2 && (
        <ellipse cx="34" cy={92 - height * 0.45} rx="9" ry="5" fill="#7ccb80" transform={`rotate(-25 34 ${92 - height * 0.45})`} />
      )}
      {s >= 3 && (
        <ellipse cx="54" cy={92 - height * 0.62} rx="9" ry="5" fill="#7ccb80" transform={`rotate(25 54 ${92 - height * 0.62})`} />
      )}
      {s >= 4 && (
        <motion.g
          initial={{ scale: 0 }}
          animate={{ scale: bloom ? [1, 1.35, 1] : 1 }}
          transition={{ duration: 0.7 }}
          style={{ transformOrigin: `44px ${92 - height}px` }}
        >
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="44" cy={92 - height - 8} rx="6" ry="9" fill={f.color} transform={`rotate(${a} 44 ${92 - height})`} />
          ))}
          <circle cx="44" cy={92 - height} r="5" fill="#ffe08a" />
        </motion.g>
      )}
      {s < 4 && s > 0 && <circle cx="44" cy={92 - height} r="4" fill={f.color} opacity="0.7" />}
    </svg>
  )
}

export default function Garden() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const { data, loading, error, setData } = useApi<{ items: Flower[] }>('/garden')
  const [message, setMessage] = useState('')
  const [blooming, setBlooming] = useState<number | null>(null)
  const [waterReq, setWaterReq] = useState<number | null>(null)

  const water = async (f: Flower) => {
    playBloom()
    setBlooming(f.id)
    setWaterReq(f.id)
    setTimeout(() => setBlooming(null), 900)
    const res = await post<{ water_count: number; message: string }>(`/garden/${f.id}/water`)
    setMessage(res.message)
    setData((prev) =>
      prev ? { items: prev.items.map((x) => (x.id === f.id ? { ...x, water_count: res.water_count } : x)) } : prev,
    )
    if (res.water_count === 5) {
      const egg = await post<{ found: boolean; title: string; message: string }>('/egg', { trigger: 'garden_5_water' })
      if (egg.found) showEgg({ title: egg.title, message: egg.message })
    }
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  const fallback = (
    <div className="grid grid-cols-2 gap-3 p-3">
      {items.map((f, i) => (
        <motion.div
          key={f.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="os-card p-3 text-center"
        >
          <Plant f={f} bloom={blooming === f.id} />
          <p className="os-title mt-1 text-sm">
            {f.emoji} {f.name}
          </p>
          <p className="text-[11px] os-muted">{t('garden.level', { n: digits(stage(f.water_count)) })}</p>
          <button className="os-btn mt-2 w-full !py-2 text-xs" onClick={() => void water(f)}>
            💧 {t('garden.water')}
          </button>
        </motion.div>
      ))}
    </div>
  )

  return (
    <div className="relative flex h-full min-h-[420px] flex-col" style={{ background: 'linear-gradient(180deg,#87b8e8 0%,#c8e6a0 55%,#6b8f3a 100%)' }}>
      <div className="absolute inset-0">
        <Suspense fallback={fallback}>
          <GardenSceneView flowers={items} onWater={(id) => { const f = items.find((x) => x.id === id); if (f) void water(f) }} waterRequest={waterReq} fallback={fallback} />
        </Suspense>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/25 to-transparent px-3 pt-3 pb-6">
        <p className="text-center text-sm text-white drop-shadow">{t('garden.caption')}</p>
        <p className="mt-1 text-center text-[11px] text-white/80">{t('garden.dragCan')}</p>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/35 to-transparent px-3 pb-4 pt-8">
        <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
          {items.map((f) => (
            <button key={f.id} className="os-chip !bg-white/90" onClick={() => void water(f)}>
              💧 {f.emoji} {f.name}
            </button>
          ))}
        </div>
        {message && (
          <motion.p
            key={message}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="pointer-events-auto mx-auto mt-2 max-w-sm rounded-2xl bg-white/90 p-3 text-center text-sm"
            style={{ color: 'var(--os-accent)' }}
          >
            {message}
          </motion.p>
        )}
      </div>
    </div>
  )
}
