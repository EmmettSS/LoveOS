/**
 * Starmap — آسمان ستاره‌ها
 * حروف اسم دخترم + قلب ❤ و ابدیت ♾، هر کدام یک صورت فلکی؛ با زدن روی هر کدام پیامش باز می‌شود.
 *
 * چیدمان: آسمان در موبایل زیر هدرِ اپ کل صفحه را (هم پهنا هم ارتفاع) و در دسکتاپ کل
 * پنجره‌ی اپ را می‌پوشاند. برای لبه‌به‌لبه شدن، پدینگِ بدنه‌ی پنجره با مارجین منفی خنثی
 * می‌شود (-m-4؛ پایینِ موبایل ۷rem بزرگ‌تر است چون داک شناور آنجاست). متن، چیپ‌ها و کارت
 * پیام به‌صورت لایه‌های شیشه‌ای شناور روی خودِ آسمان می‌نشینند.
 *
 * اندازه‌ی واقعی کادر آسمان با ResizeObserver خوانده می‌شود و صورت‌های فلکی به‌جای
 * اسکرول افقی، روی کل پهنای آسمان به‌تساوی پخش می‌شوند؛ پس شکل‌ها هیچ‌وقت اعوجاج
 * نمی‌گیرند و هر دو بُعد صفحه واقعاً پر می‌شود.
 *
 * راز ⑩: دو بار زدن روی یک ستاره.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { tone } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Empty, useApi } from '../shared/ui'

interface Constellation {
  id: number
  letter: string
  order: number
  message: string
  stars: [number, number][]
}

/**
 * ستاره‌ها در مختصات ریاضی ذخیره می‌شوند (y رو به بالا) ولی بوم SVG
 * مبدأش گوشه‌ی بالا-چپ است (y رو به پایین). بدون این تبدیل، هر شکل
 * عمودی آینه می‌شود و مثلاً «M» شبیه «W» دیده می‌شود.
 */
const toCanvasY = (y: number) => 1 - y

/** شیشه‌ی نیمه‌شفاف لایه‌های شناور روی آسمان */
const GLASS = {
  background: 'rgba(10,14,34,.5)',
  border: '1px solid rgba(255,255,255,.14)',
  backdropFilter: 'blur(8px)',
} as const

export default function Starmap() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const { data, loading, error } = useApi<{ items: Constellation[] }>('/starmap')
  const [active, setActive] = useState<Constellation | null>(null)
  const [allLit, setAllLit] = useState(false)
  // چیدمان پیش‌فرض: چپ به راست (حرف اول سمت چپ). دخترم می‌تواند با چیپ
  // پایین آن را به راست به چپ عوض کند.
  const [rtlLayout, setRtlLayout] = useState(false)
  const lastTap = useRef<{ id: number; at: number } | null>(null)

  // اندازه‌ی واقعی کادر آسمان — صورت‌های فلکی نسبت به همین پخش می‌شوند
  const skyRef = useRef<HTMLDivElement | null>(null)
  const [sky, setSky] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = skyRef.current
    if (!el) return
    const measure = () => setSky({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
    // کادر آسمان فقط وقتی در DOM هست که پاسخ API رسیده باشد (نه لودینگ/خطا)
  }, [loading, error])

  const dust = useMemo(
    () => Array.from({ length: 90 }).map((_, i) => ({ id: i, x: Math.random() * 100, y: Math.random() * 100, d: Math.random() * 4, s: 1 + Math.random() * 2 })),
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

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  const n = items.length
  const slotW = sky.w > 0 ? sky.w / n : 0
  // مربعِ هر صورت فلکی: به اندازه‌ی چینه‌ی افقی خودش، و روی صفحه‌های بلند از
  // ۴۲٪ ارتفاع بزرگ‌تر نشود تا جا برای عناصر شناور بماند
  const cell = Math.max(30, Math.min(slotW - 6, sky.h * 0.42, 150))
  const cy = sky.h * 0.46
  // اندازه‌ی ستاره‌ها با مربع شکل مقیاس می‌شود تا از موبایل تا دسکتاپ متعادل بماند
  const dot = Math.max(1.8, Math.min(3.4, cell * 0.036))
  const labelY = cy + cell / 2 + Math.max(18, cell * 0.18)

  return (
    <div
      ref={skyRef}
      className="relative -m-4 -mb-28 h-[calc(100%+8rem)] overflow-hidden md:-mb-4 md:h-[calc(100%+2rem)]"
      style={{ background: 'radial-gradient(120% 100% at 50% 0%, #232a5c 0%, #0b1026 75%)' }}
    >
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

      {sky.w > 0 && sky.h > 0 && (
        <svg width={sky.w} height={sky.h} viewBox={`0 0 ${sky.w} ${sky.h}`} className="absolute inset-0 block">
          {items.map((c, ci) => {
            // در چیدمان راست‌به‌چپ، اولین صورت فلکی سمت راست می‌نشیند
            const slot = rtlLayout ? n - 1 - ci : ci
            const cx = slotW * (slot + 0.5)
            const pts = c.stars.map(([x, y]) => [cx + (x - 0.5) * cell, cy + (toCanvasY(y) - 0.5) * cell])
            const lit = allLit || active?.id === c.id
            return (
              <g key={c.id} onClick={() => void tapStar(c)} style={{ cursor: 'pointer' }}>
                <polyline
                  points={pts.map((p) => p.join(',')).join(' ')}
                  fill="none"
                  stroke={lit ? '#ffd98a' : 'rgba(255,255,255,.28)'}
                  strokeWidth={lit ? Math.max(1.3, dot * 0.5) : 1}
                  strokeLinejoin="round"
                />
                {pts.map((p, pi) => (
                  <motion.circle
                    key={pi}
                    cx={p[0]}
                    cy={p[1]}
                    r={lit ? dot * 1.35 : dot}
                    fill={lit ? '#ffe9a8' : '#ffffff'}
                    animate={{ opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 2, delay: (ci + pi) * 0.12, repeat: Infinity }}
                    style={{ filter: lit ? 'drop-shadow(0 0 6px #ffd98a)' : undefined }}
                  />
                ))}
                <text x={cx} y={labelY} textAnchor="middle" fontSize="11" fill="rgba(255,255,255,.55)">
                  {c.letter}
                </text>
                {/* ناحیه‌ی لمسی نامرئی و بزرگ‌تر تا روی موبایل راحت‌تر لمس شود؛
                    بیشتر از نصف چینه‌ی خودش نمی‌گردد تا با همسایه هم‌پوشانی پیدا نکند */}
                <circle cx={cx} cy={cy} r={Math.min(cell / 2 + 14, slotW / 2)} fill="transparent" />
              </g>
            )
          })}
        </svg>
      )}

      {/* متن راهنما — شناور روی آسمان */}
      <p
        className="absolute left-1/2 top-4 z-10 max-w-[92%] -translate-x-1/2 rounded-full px-4 py-1.5 text-center text-sm text-white/90"
        style={GLASS}
      >
        {t('starmap.caption')}
      </p>

      {/* چیپ‌ها — زیر ۹۰۰px پنجره تمام‌صفحه است و داکِ شناور پایین صفحه را می‌پوشاند؛
          برای همین آستانه با حالت پنجره (۹۰۰px، نه md) هماهنگ شده تا زیر داک نروند */}
      <div className="absolute inset-x-2 bottom-24 z-10 flex flex-wrap items-center justify-center gap-2 min-[900px]:bottom-6">
        <button className={`os-chip ${allLit ? 'os-chip-active' : ''}`} onClick={() => setAllLit(!allLit)}>
          {t('starmap.fullName')}
        </button>
        <button className="os-chip" onClick={() => setRtlLayout(!rtlLayout)}>
          {rtlLayout ? t('starmap.layoutRtl') : t('starmap.layoutLtr')}
        </button>
        <span className="os-chip">{t('starmap.tapLetter')}</span>
      </div>

      {/* پیام هر صورت فلکی — کارت شیشه‌ای شناور میان آسمان و چیپ‌ها */}
      <AnimatePresence>
        {active && (
          <motion.div
            key={active.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute inset-x-6 bottom-40 z-10 rounded-3xl p-4 text-center text-white min-[900px]:inset-x-24 min-[900px]:bottom-24"
            style={GLASS}
          >
            <p className="os-title text-2xl" style={{ color: '#ffd98a' }}>{active.letter}</p>
            <p className="mt-2 text-sm leading-7">{active.message}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
