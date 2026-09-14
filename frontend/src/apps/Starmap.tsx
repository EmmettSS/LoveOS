/**
 * Starmap — آسمان ستاره‌ها
 * حروف اسم دخترم به شکل صورت فلکی؛ با زدن روی هر حرف پیامش باز می‌شود.
 * راز ⑩: دو بار زدن روی یک ستاره.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { tone } from '../shared/sound'
import { useOS } from '../shared/store'
import { Empty, Loading, useApi } from '../shared/ui'

interface Constellation {
  id: number
  letter: string
  order: number
  message: string
  stars: [number, number][]
}

const CELL = 96 // پهنای هر حرف روی بوم
const PAD = 22

/**
 * ستاره‌ها در مختصات ریاضی ذخیره می‌شوند (y رو به بالا) ولی بوم SVG
 * مبدأش گوشه‌ی بالا-چپ است (y رو به پایین). بدون این تبدیل، هر حرف
 * عمودی آینه می‌شود و مثلاً «M» شبیه «W» دیده می‌شود.
 */
const toCanvasY = (y: number) => 1 - y

export default function Starmap() {
  const { t, i18n } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const { data, loading } = useApi<{ items: Constellation[] }>('/starmap')
  const [active, setActive] = useState<Constellation | null>(null)
  const [allLit, setAllLit] = useState(false)
  // چیدمان حروف: در فارسی اسم از راست به چپ خوانده می‌شود (حرف اول سمت راست)
  const [rtlLayout, setRtlLayout] = useState(() => i18n.dir() !== 'ltr')
  const lastTap = useRef<{ id: number; at: number } | null>(null)

  useEffect(() => {
    setRtlLayout(i18n.dir() !== 'ltr')
  }, [i18n, i18n.language])


  const dust = useMemo(
    () => Array.from({ length: 60 }).map((_, i) => ({ id: i, x: Math.random() * 100, y: Math.random() * 100, d: Math.random() * 4, s: 1 + Math.random() * 2 })),
    [],
  )

  useEffect(() => {
    document.documentElement.dataset.starmap = 'on'
    return () => { delete document.documentElement.dataset.starmap }
  }, [])

  const tapStar = async (c: Constellation) => {
    const now = Date.now()
    // راز ⑩ — دو بار زدن سریع روی یک ستاره
    if (lastTap.current && lastTap.current.id === c.id && now - lastTap.current.at < 420) {
      lastTap.current = null
      const egg = await post<{ found: boolean; title: string; message: string }>('/egg', { trigger: 'star_double_click' })
      if (egg.found) { showEgg({ title: egg.title, message: egg.message }); return }
    }
    lastTap.current = { id: c.id, at: now }
    tone({ freq: 880 + c.order * 60, duration: 0.5, type: 'sine', gain: 0.06 })
    setActive(c)
  }

  if (loading) return <Loading />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  const width = items.length * CELL + PAD * 2
  const height = CELL + PAD * 2

  return (
    <div className="space-y-3">
      <p className="text-center text-sm os-muted">{t('starmap.caption')}</p>

      <div className="relative overflow-hidden rounded-3xl" style={{ background: 'radial-gradient(120% 100% at 50% 0%, #232a5c 0%, #0b1026 75%)' }}>
        {/* غبار ستاره‌ای */}
        {dust.map((d) => (
          <motion.span
            key={d.id}
            className="absolute rounded-full bg-white"
            style={{ left: `${d.x}%`, top: `${d.y}%`, width: d.s, height: d.s }}
            animate={{ opacity: [0.15, 0.9, 0.15] }}
            transition={{ duration: 2.6, delay: d.d, repeat: Infinity }}
          />
        ))}

        <div className="overflow-x-auto no-scrollbar">
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mx-auto block">
            {items.map((c, ci) => {
              // در چیدمان راست‌به‌چپ، حرف اول سمت راست می‌نشیند
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

      <div className="flex flex-wrap gap-2">
        <button className={`os-chip ${allLit ? 'os-chip-active' : ''}`} onClick={() => setAllLit(!allLit)}>
          {t('starmap.fullName')}
        </button>
        <button className="os-chip" onClick={() => setRtlLayout(!rtlLayout)}>
          {rtlLayout ? t('starmap.layoutRtl') : t('starmap.layoutLtr')}
        </button>
        <span className="os-chip">{t('starmap.tapLetter')}</span>
      </div>

      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="os-card p-4 text-center"
          >
            <p className="os-title text-2xl" style={{ color: '#ffd98a' }}>{active.letter}</p>
            <p className="mt-2 text-sm leading-7">{active.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
