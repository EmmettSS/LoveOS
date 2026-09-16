/**
 * Starmap — آسمان ستاره‌ها (سه‌بعدی + fallback دوبعدی)
 * حروف اسم + صورت‌های ♥ و ♾️؛ راز ⑩: دو بار زدن روی یک ستاره.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { tone } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Empty, useApi } from '../shared/ui'

const StarmapSky = lazy(() => import('../three/components/StarmapSky'))

interface Constellation {
  id: number
  letter: string
  order: number
  message: string
  stars: [number, number][]
}

const CELL = 96
const PAD = 22
const toCanvasY = (y: number) => 1 - y

/** پیام‌های ثابت برای صورت‌های procedural */
const SHAPE_MSG: Record<number, { letter: string; messageKey: string }> = {
  [-10]: { letter: '♥', messageKey: 'starmap.heartMsg' },
  [-11]: { letter: '∞', messageKey: 'starmap.infinityMsg' },
}

export default function Starmap() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const { data, loading, error } = useApi<{ items: Constellation[] }>('/starmap')
  const [active, setActive] = useState<Constellation | null>(null)
  const [activeShape, setActiveShape] = useState<number | null>(null)
  const [allLit, setAllLit] = useState(false)
  const [rtlLayout, setRtlLayout] = useState(false)
  const lastTap = useRef<{ id: number; at: number } | null>(null)

  const dust = useMemo(
    () =>
      Array.from({ length: 60 }).map((_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        d: Math.random() * 4,
        s: 1 + Math.random() * 2,
      })),
    [],
  )

  useEffect(() => {
    document.documentElement.dataset.starmap = 'on'
    return () => {
      delete document.documentElement.dataset.starmap
    }
  }, [])

  const fireEgg = async () => {
    const egg = await post<{ found: boolean; title: string; message: string }>('/egg', {
      trigger: 'star_double_click',
    })
    if (egg.found) showEgg({ title: egg.title, message: egg.message })
  }

  const tapStar = async (c: Constellation) => {
    const now = Date.now()
    if (lastTap.current && lastTap.current.id === c.id && now - lastTap.current.at < 420) {
      lastTap.current = null
      await fireEgg()
      return
    }
    lastTap.current = { id: c.id, at: now }
    tone({ freq: 880 + c.order * 60, duration: 0.5, type: 'sine', gain: 0.06 })
    setActive(c)
    setActiveShape(null)
  }

  const onSelect3d = (id: number) => {
    if (id < 0) {
      setActiveShape(id)
      setActive(null)
      tone({ freq: 660, duration: 0.4, type: 'sine', gain: 0.05 })
      return
    }
    const c = (data?.items || []).find((x) => x.id === id)
    if (c) void tapStar(c)
  }

  const onDouble3d = (id: number) => {
    void fireEgg()
    if (id > 0) {
      const c = (data?.items || []).find((x) => x.id === id)
      if (c) setActive(c)
    }
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  const width = items.length * CELL + PAD * 2
  const height = CELL + PAD * 2

  const fallback2d = (
    <div className="relative h-full min-h-[280px] w-full overflow-hidden" style={{ background: 'radial-gradient(120% 100% at 50% 0%, #232a5c 0%, #0b1026 75%)' }}>
      {dust.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full bg-white"
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s }}
          animate={{ opacity: [0.15, 0.9, 0.15] }}
          transition={{ duration: 2.6, delay: d.d, repeat: Infinity }}
        />
      ))}
      <div className="overflow-x-auto no-scrollbar pt-8">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto block">
          {items.map((c, ci) => {
            const slot = rtlLayout ? items.length - 1 - ci : ci
            const ox = PAD + slot * CELL
            const pts = c.stars.map(([x, y]) => [ox + x * (CELL - 26) + 13, PAD + toCanvasY(y) * (CELL - 26) + 13])
            const lit = allLit || active?.id === c.id
            return (
              <g key={c.id} onClick={() => void tapStar(c)} style={{ cursor: 'pointer' }}>
                <polyline
                  points={pts.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke={lit ? '#ffd98a' : 'rgba(255,255,255,.28)'}
                  strokeWidth={lit ? 1.6 : 1}
                  strokeLinejoin="round"
                />
                {pts.map((p, pi) => (
                  <motion.circle
                    key={pi}
                    cx={p[0]}
                    cy={p[1]}
                    r={lit ? 3.6 : 2.6}
                    fill={lit ? '#ffe9a8' : '#ffffff'}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, delay: (ci + pi) * 0.12, repeat: Infinity }}
                    style={{ filter: lit ? 'drop-shadow(0 0 6px #ffd98a)' : undefined }}
                  />
                ))}
                <text x={ox + CELL / 2} y={height - 4} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,.55)">
                  {c.letter}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )

  const activeId = activeShape ?? active?.id ?? null

  return (
    <div className="relative flex h-full min-h-[420px] flex-col" style={{ background: '#0b1026' }}>
      <div className="absolute inset-0">
        <Suspense fallback={fallback2d}>
          <StarmapSky
            items={items}
            activeId={activeId}
            allLit={allLit}
            onSelect={onSelect3d}
            onDoubleStar={onDouble3d}
            fallback={fallback2d}
          />
        </Suspense>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-[#0b1026ee] to-transparent px-3 pb-8 pt-3">
        <p className="pointer-events-auto text-center text-sm text-white/70">{t('starmap.caption')}</p>
        <p className="pointer-events-auto mt-1 text-center text-[11px] text-white/45">{t('starmap.dragHint')}</p>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-[#0b1026f2] to-transparent px-3 pb-4 pt-10">
        <div className="pointer-events-auto flex flex-wrap justify-center gap-2">
          <button className={`os-chip ${allLit ? 'os-chip-active' : ''}`} onClick={() => setAllLit(!allLit)}>
            {t('starmap.fullName')}
          </button>
          <button className="os-chip" onClick={() => setRtlLayout(!rtlLayout)}>
            {rtlLayout ? t('starmap.layoutRtl') : t('starmap.layoutLtr')}
          </button>
          <span className="os-chip">{t('starmap.tapLetter')}</span>
        </div>

        <AnimatePresence>
          {(active || activeShape != null) && (
            <motion.div
              key={active?.id ?? activeShape ?? 0}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-auto mx-auto mt-3 max-w-md rounded-2xl border border-white/10 bg-[#161b3acc] p-4 text-center backdrop-blur"
            >
              <p className="os-title text-2xl" style={{ color: '#ffd98a' }}>
                {active?.letter ?? SHAPE_MSG[activeShape!]?.letter}
              </p>
              <p className="mt-2 text-sm leading-7 text-white/85">
                {active?.message ??
                  (activeShape != null ? t(SHAPE_MSG[activeShape]?.messageKey || 'starmap.caption') : '')}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
