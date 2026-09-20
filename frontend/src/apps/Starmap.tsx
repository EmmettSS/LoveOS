/**
 * Starmap — آسمان ستاره‌ها
 * حروف اسم دخترم + قلب ❤ و ابدیت ♾، هر کدام یک صورت فلکی؛ با زدن روی هر کدام پیامش باز می‌شود.
 *
 * چیدمان (starmapLayout.ts): دو ردیف — اسم در ردیف اول، نمادها در ردیف دوم و
 * کمی بزرگ‌تر. اندازه‌ها از روی ابعاد واقعی کادر حساب می‌شوند (ResizeObserver)
 * تا بزرگ‌ترین اندازه‌ای که جا می‌شود انتخاب شود؛ بدون اعوجاج و بدون هم‌پوشانی.
 *
 * دسکتاپ: آسمان کل بدنه‌ی پنجره را لبه‌به‌لبه می‌گیرد (مارجین منفیِ پدینگ بدنه).
 *
 * موبایل (زیر ۹۰۰px): «سینمای تمام‌صفحه» — آسمان با portal روی همه‌چیز (هدر و
 * داک) می‌نشیند و اگر صفحه عمودی باشد ۹۰ درجه می‌چرخد تا کاربر گوشی را افقی
 * بگیرد و اسم در یک خط و بزرگ دیده شود. اگر مرورگر خودش افقی شده باشد
 * (چرخش خودکار روشن) دیگر نمی‌چرخانیم. دکمه‌ی ✕ شناور آن را می‌بندد.
 *
 * جلوه‌ی سینمایی روی canvas جدا (SkyCanvas.tsx): چشمک ستاره‌ها، شهاب، راه شیری،
 * ماه، وینیت و پارالاکس. صورت‌های فلکی روی SVG هستند: هنگام ورود خودشان را
 * رسم می‌کنند، حرف روشن‌شده هاله (bloom) می‌گیرد و «کل اسم» پشت‌سرهم روشن می‌شود.
 *
 * راز ⑩: دو بار زدن روی یک ستاره.
 */
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { Icon } from '../shared/Icon'
import { tone } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Empty, useApi } from '../shared/ui'
import SkyCanvas, { type Parallax } from './SkyCanvas'
import { layoutSky, resolveSkyMode, splitRows } from './starmapLayout'
import { sanitizeStars } from './starmapStars'

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

const GOLD = '#ffd98a'
const GOLD_SOFT = '#ffe9a8'
const LABEL_FONT = "'Lalezar','Baloo Bhaijaan 2','Vazirmatn',sans-serif"

/** اندازه‌ی پنجره‌ی مرورگر — برای تشخیص موبایل و جهت صفحه */
function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => setV(read())
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
  }, [])
  return v
}

export default function Starmap() {
  const { data, loading, error } = useApi<{ items: Constellation[] }>('/starmap')
  const vp = useViewport()
  const { mobile, rotated } = resolveSkyMode(vp.w, vp.h)
  const closeAppByKey = useOS((s) => s.closeAppByKey)
  const present = useIsPresent()
  /**
   * لایه‌ی تمام‌صفحه‌ی موبایل باید بالای داک (z-50) و پنجره‌ی خودش باشد، ولی
   * اگر پنجره‌ی دیگری روی آسمان باز شد یا پنجره مینیمایز بود، اصلاً رندر نشود
   * (صفر) تا جلوی آن اپ را نگیرد.
   */
  const overlayZ = useOS((s) => {
    const me = s.windows.find((w) => w.app === 'starmap')
    if (!me) return 60
    if (me.minimized) return 0
    const covered = s.windows.some((w) => w.id !== me.id && !w.minimized && w.z > me.z)
    return covered ? 0 : Math.max(60, 41 + me.z)
  })

  useEffect(() => {
    document.documentElement.dataset.starmap = 'on'
    return () => { delete document.documentElement.dataset.starmap }
  }, [])

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  if (!mobile) {
    // دسکتاپ: لبه‌به‌لبه داخل بدنه‌ی پنجره (پدینگ p-4 با مارجین منفی خنثی می‌شود)
    return <SkyScene items={items} className="relative -m-4 h-[calc(100%+2rem)] overflow-hidden" />
  }

  if (!overlayZ) return null

  // موبایل: سینمای تمام‌صفحه؛ در حالت عمودی، قاب به اندازه‌ی (ارتفاع×پهنا) ساخته و
  // ۹۰ درجه چرخانده می‌شود تا با گرفتن افقی گوشی، آسمان درست دیده شود.
  const frame: CSSProperties = rotated
    ? { position: 'absolute', top: 0, left: 0, width: vp.h, height: vp.w, transform: 'rotate(90deg) translateY(-100%)', transformOrigin: 'top left' }
    : { position: 'absolute', inset: 0 }

  return createPortal(
    <motion.div
      data-starmap-overlay={rotated ? 'rotated' : 'landscape'}
      className="fixed inset-0 overflow-hidden os-no-select"
      style={{ zIndex: overlayZ, background: '#05081a', overscrollBehavior: 'none', touchAction: 'manipulation' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: present ? 1 : 0 }}
      transition={{ duration: 0.3 }}
    >
      <div style={frame}>
        <SkyScene
          items={items}
          mobile
          rotated={rotated}
          className="relative h-full w-full overflow-hidden"
          onClose={() => closeAppByKey('starmap')}
        />
      </div>
      <RotateHint visible={rotated} />
    </motion.div>,
    document.body,
  )
}

/** راهنمای «گوشی رو بچرخون» — بیرون از قاب چرخیده تا در حالت عمودی خوانا باشد */
function RotateHint({ visible }: { visible: boolean }) {
  const { t } = useTranslation()
  // چند ثانیه یا تا اولین لمس؛ بعدش دیگر مزاحم نمی‌شود
  const [dismissed, setDismissed] = useState(false)
  useEffect(() => {
    if (!visible) return
    const hide = () => setDismissed(true)
    const id = window.setTimeout(hide, 4200)
    window.addEventListener('pointerdown', hide, { once: true })
    return () => {
      window.clearTimeout(id)
      window.removeEventListener('pointerdown', hide)
    }
  }, [visible])
  const show = visible && !dismissed
  return (
    <AnimatePresence>
      {show && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-3 rounded-3xl px-5 py-4 text-center text-sm text-white"
            style={GLASS}
          >
            <motion.span
              className="block h-10 w-6 rounded-md border-2 border-white/85"
              animate={{ rotate: [0, 0, -90, -90, 0] }}
              transition={{ duration: 2.6, times: [0, 0.15, 0.4, 0.8, 1], repeat: Infinity, ease: 'easeInOut' }}
            />
            {t('starmap.rotateHint')}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

interface SceneProps {
  items: Constellation[]
  className: string
  mobile?: boolean
  rotated?: boolean
  onClose?: () => void
}

/** خودِ آسمان: canvas سینمایی + SVG صورت‌های فلکی + لایه‌های شیشه‌ای شناور */
function SkyScene({ items, className, mobile = false, rotated = false, onClose }: SceneProps) {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const reduced = useReducedMotion() ?? false
  // آخرین حرفِ زده‌شده + باز/بسته بودن پیامش (جدا، تا موقع محو شدن هم متنش بماند)
  const [active, setActive] = useState<Constellation | null>(null)
  const [open, setOpen] = useState(false)
  const [allLit, setAllLit] = useState(false)
  // چیدمان پیش‌فرض: چپ به راست (حرف اول سمت چپ). دخترم می‌تواند با چیپ
  // پایین آن را به راست به چپ عوض کند.
  const [rtlLayout, setRtlLayout] = useState(false)
  const lastTap = useRef<{ id: number; at: number } | null>(null)
  const parallax = useRef<Parallax>({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement | null>(null)

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
  }, [])

  const rows = useMemo(() => splitRows(items), [items])
  const symbolRow = rows.length > 1 ? 1 : -1
  const layout = useMemo(
    () =>
      layoutSky({
        w: sky.w,
        h: sky.h,
        rows: rows.map((r) => r.length),
        symbolRow,
        rtl: rtlLayout,
        // موبایل افقی کوتاه است: متن راهنما و چیپ‌ها فشرده‌ترند
        ...(mobile ? { padTop: 44, padBottom: 48 } : {}),
      }),
    [sky.w, sky.h, rows, symbolRow, rtlLayout, mobile],
  )
  // «کل اسم رو روشن کن»: حرف‌ها یکی‌یکی روشن می‌شوند، نه همه با هم
  const total = items.length
  const [litCount, setLitCount] = useState(0)
  useEffect(() => {
    if (!allLit) return
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setLitCount(i)
      if (i >= total) window.clearInterval(id)
    }, 190)
    return () => window.clearInterval(id)
  }, [allLit, total])
  const toggleAllLit = () => {
    setLitCount(0)
    setAllLit(!allLit)
  }
  const fullyLit = allLit && litCount >= total
  const hasAnyValidStars = items.some((c) => sanitizeStars(c.stars).length > 0)

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
    setOpen(true)
  }

  // پارالاکس موس (فقط دسکتاپ): لایه‌ی اسم کمی بیشتر از ستاره‌های دور جابه‌جا می‌شود
  const onFrame = useCallback((px: number, py: number) => {
    const el = svgRef.current
    if (el) el.style.transform = `translate(${(px * 10).toFixed(1)}px, ${(py * 10).toFixed(1)}px)`
  }, [])
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (mobile || reduced || e.pointerType !== 'mouse') return
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    parallax.current = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 }
  }
  const onLeave = () => { parallax.current = { x: 0, y: 0 } }

  // فاصله‌های امن صفحه (ناچ/نوار خانه) نسبت به قابِ چرخیده: لبه‌ی چپِ قاب همان
  // بالای فیزیکی گوشی است و لبه‌ی راستش پایین گوشی
  const insets = (
    !mobile
      ? { '--sky-t': '0px', '--sky-b': '0px', '--sky-l': '0px', '--sky-r': '0px' }
      : rotated
        ? {
            '--sky-t': 'env(safe-area-inset-right, 0px)',
            '--sky-b': 'env(safe-area-inset-left, 0px)',
            '--sky-l': 'env(safe-area-inset-top, 0px)',
            '--sky-r': 'env(safe-area-inset-bottom, 0px)',
          }
        : {
            '--sky-t': 'env(safe-area-inset-top, 0px)',
            '--sky-b': 'env(safe-area-inset-bottom, 0px)',
            '--sky-l': 'env(safe-area-inset-left, 0px)',
            '--sky-r': 'env(safe-area-inset-right, 0px)',
          }
  ) as CSSProperties
  const rtlDoc = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
  const endInset = rtlDoc ? 'var(--sky-l)' : 'var(--sky-r)'

  const measured = sky.w > 0 && sky.h > 0
  let seq = 0

  return (
    <div
      ref={skyRef}
      className={`${className} select-none os-no-select`}
      // touch-action: دوبار زدن (راز ⑩) نباید زوم مرورگر را فعال کند
      style={{ background: 'radial-gradient(120% 100% at 50% 0%, #232a5c 0%, #0b1026 75%)', touchAction: 'manipulation', ...insets }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={() => setOpen(false)}
    >
      {measured && <SkyCanvas width={sky.w} height={sky.h} parallax={parallax} onFrame={onFrame} reducedMotion={reduced} />}

      {measured && (
        <svg
          ref={svgRef}
          width={sky.w}
          height={sky.h}
          viewBox={`0 0 ${sky.w} ${sky.h}`}
          className="absolute inset-0 block"
          style={{ willChange: 'transform' }}
        >
          <defs>
            {/* هاله‌ی نور (bloom) برای صورت فلکیِ روشن */}
            <filter id="sm-bloom" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <radialGradient id="sm-halo">
              <stop offset="0" stopColor={GOLD} stopOpacity=".5" />
              <stop offset="1" stopColor={GOLD} stopOpacity="0" />
            </radialGradient>
          </defs>
          {rows.map((row, ri) =>
            row.map((c, ci) => {
              const slot = layout.slots[ri]?.[ci]
              if (!slot) return null
              const i = seq++
              const pts = sanitizeStars(c.stars).map(([x, y]) => [
                slot.cx + (x - 0.5) * slot.cell,
                slot.cy + (toCanvasY(y) - 0.5) * slot.cell,
              ])
              const lit = (open && active?.id === c.id) || (allLit && i < litCount)
              const isSymbolRow = ri === symbolRow
              return (
                <g
                  key={c.id}
                  onClick={(e) => { e.stopPropagation(); void tapStar(c) }}
                  style={{ cursor: 'pointer' }}
                  filter={lit ? 'url(#sm-bloom)' : undefined}
                >
                  {/* وقتی کل اسم روشن شد، ❤ و ♾ نفس می‌کشند */}
                  {isSymbolRow && fullyLit && (
                    <motion.circle
                      cx={slot.cx}
                      cy={slot.cy}
                      r={slot.cell * 0.62}
                      fill="url(#sm-halo)"
                      pointerEvents="none"
                      animate={{ opacity: reduced ? 0.35 : [0, 0.65, 0] }}
                      transition={{ duration: 2.2, repeat: reduced ? 0 : Infinity, delay: ci * 0.55, ease: 'easeInOut' }}
                    />
                  )}
                  {/* اگر داده‌ی این صورت فلکی خراب بود، فقط برچسبش می‌ماند (نه خطای رندر، نه آسمان خالی) */}
                  {pts.length > 0 && (
                    <>
                      <motion.polyline
                        points={pts.map((p) => p.join(',')).join(' ')}
                        fill="none"
                        stroke={lit ? GOLD : 'rgba(255,255,255,.3)'}
                        strokeWidth={lit ? Math.max(1.4, slot.dot * 0.55) : 1}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                        animate={{ pathLength: 1, opacity: 1 }}
                        transition={{ duration: 1.1, delay: 0.25 + i * 0.16, ease: 'easeInOut' }}
                      />
                      {pts.map((p, pi) => (
                        <motion.circle
                          key={pi}
                          cx={p[0]}
                          cy={p[1]}
                          fill={lit ? GOLD_SOFT : '#ffffff'}
                          initial={reduced ? false : { r: 0, opacity: 0 }}
                          animate={{ r: lit ? slot.dot * 1.35 : slot.dot, opacity: reduced ? 1 : [0.55, 1, 0.55] }}
                          transition={{
                            r: { delay: reduced ? 0 : 0.3 + i * 0.16 + pi * 0.05, duration: 0.45 },
                            opacity: {
                              duration: 1.8 + ((i * 7 + pi * 3) % 5) * 0.3,
                              delay: (i + pi) * 0.12,
                              repeat: Infinity,
                              ease: 'easeInOut',
                            },
                          }}
                        />
                      ))}
                    </>
                  )}
                  <motion.text
                    x={slot.cx}
                    y={slot.labelY}
                    textAnchor="middle"
                    fontSize={slot.fontSize}
                    fill={lit ? GOLD_SOFT : 'rgba(255,255,255,.6)'}
                    style={{ fontFamily: LABEL_FONT }}
                    initial={reduced ? false : { opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: reduced ? 0 : 1 + i * 0.16, duration: 0.6 }}
                  >
                    {c.letter}
                  </motion.text>
                  {/* ناحیه‌ی لمسی نامرئی و بزرگ‌تر تا روی موبایل راحت‌تر لمس شود؛
                      بیشتر از نصف چینه‌ی خودش نمی‌گردد تا با همسایه هم‌پوشانی پیدا نکند */}
                  <circle cx={slot.cx} cy={slot.cy} r={slot.tapR} fill="transparent" />
                </g>
              )
            }),
          )}
        </svg>
      )}

      {/* کپشن «اسمت رو با ستاره‌ها نوشتم» حذف شد — درخواست کاربر */}

      {/* اگر هیچ صورتی ستاره‌ی سالم نداشت، به‌جای آسمانِ بی‌حال یک راهنمای کوچک */}
      {!hasAnyValidStars && (
        <p
          className="absolute inset-x-2 z-10 mx-auto w-fit max-w-[92%] rounded-full px-4 py-1.5 text-center text-xs text-white/85"
          style={{ ...GLASS, top: `calc(${mobile ? 48 : 64}px + var(--sky-t))` }}
        >
          داده‌ی چند صورت فلکی ناقص است؛ با بابا چک کن
        </p>
      )}

      {/* موبایل: هدر و داک زیر آسمان پنهان‌اند؛ این ✕ تنها راه خروج است */}
      {mobile && onClose && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose() }}
          aria-label={t('os.close')}
          title={t('os.close')}
          className="absolute z-20 flex h-10 w-10 items-center justify-center rounded-full text-white transition active:scale-90"
          style={{ ...GLASS, top: 'calc(8px + var(--sky-t))', insetInlineEnd: `calc(8px + ${endInset})` }}
        >
          <Icon name="close" size={18} />
        </button>
      )}

      {/* نوار پایین: چیپ‌ها، و وقتی حرفی زده شد، پیامش مثل زیرنویس همین‌جا می‌نشیند
          تا هیچ‌چیز روی آسمان را نپوشاند. هر دو همیشه در DOM هستند و فقط محو/ظاهر
          می‌شوند تا وضعیت چیپ‌ها حفظ شود و هیچ لمسی «گم» نشود */}
      <div className="absolute inset-x-2 z-10 flex justify-center" style={{ bottom: `calc(${mobile ? 8 : 20}px + var(--sky-b))` }}>
        <div className="relative flex w-full max-w-[720px] justify-center">
          <motion.div
            className="flex flex-wrap items-center justify-center gap-2"
            animate={{ opacity: open ? 0 : 1, y: open ? 6 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ pointerEvents: open ? 'none' : 'auto' }}
            aria-hidden={open}
          >
            <button className={`os-chip ${allLit ? 'os-chip-active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleAllLit() }}>
              {t('starmap.fullName')}
            </button>
            <button className="os-chip" onClick={(e) => { e.stopPropagation(); setRtlLayout(!rtlLayout) }}>
              {rtlLayout ? t('starmap.layoutRtl') : t('starmap.layoutLtr')}
            </button>
            <span className="os-chip">{t('starmap.tapLetter')}</span>
          </motion.div>

          {active && (
            <motion.div
              key={active.id}
              role="status"
              className="absolute inset-x-0 bottom-0 flex items-center gap-3 rounded-3xl px-4 py-2 text-white"
              style={{ ...GLASS, pointerEvents: open ? 'auto' : 'none' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: open ? 1 : 0, y: open ? 0 : 8 }}
              transition={{ duration: 0.22 }}
              aria-hidden={!open}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="os-title shrink-0 text-2xl leading-none" style={{ color: GOLD }}>{active.letter}</span>
              <p className={`min-w-0 flex-1 text-start ${mobile ? 'line-clamp-2 text-xs leading-5' : 'text-sm leading-6'}`}>{active.message}</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t('os.close')}
                className="shrink-0 rounded-full p-1.5 text-white/80 transition hover:bg-white/10 active:scale-90"
              >
                <Icon name="close" size={14} />
              </button>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
