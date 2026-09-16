/**
 * Starmap — آسمان ستاره‌ها
 * حروف اسم دخترم به شکل صورت فلکی؛ با زدن روی هر حرف پیامش باز می‌شود.
 * راز ⑩: دو بار زدن روی یک ستاره.
 *
 * --------------------------------------------------------------------------
 * دو صورتِ فلکیِ شکل‌دار: ♥ و ∞
 * --------------------------------------------------------------------------
 * این‌ها «حرف» نیستند، پس **جدا** از ردیفِ اسم رندر می‌شوند. سه دلیل:
 * ۱) معنا: حرف‌ها ترتیب دارند و با هم «مریم» خوانده می‌شوند؛ شکل‌ها
 *    نشانه‌اند و ترتیب بی‌معناست. قاطی‌کردنشان خواندنِ اسم را می‌شکند.
 * ۲) دسترسی: در یک ردیفِ ۸تایی پهنایِ هر سلول به ~۳۵ پیکسل می‌رسید و
 *    هدفِ لمسی زیرِ ۴۴ پیکسل می‌شد. جداکردنشان این مشکل را هم حل کرد.
 * ۳) صدا: ``tone()`` بسامد را از ``order`` می‌سازد. شکل‌ها order=۹۰/۹۱
 *    دارند → ۸۸۰+۹۰×۶۰ = **۶۲۸۰ هرتز**، یعنی یک سوتِ آزاردهنده در گوشِ
 *    بچه. پس برای شکل‌ها بسامدِ جدا و مطبوع می‌زنیم (این یک باگِ واقعی بود
 *    که فقط با اضافه‌شدنِ شکل‌ها ظاهر می‌شد).
 *
 * تشخیصِ شکل از روی فیلدِ ``kind`` که بک‌اند می‌فرستد؛ اگر absent بود
 * (دیتابیسِ قدیمیِ مهاجرت‌نخورده) از خودِ ``letter`` استنتاج می‌شود تا اپ
 * نشکند — fallback عمداً گذاشته شده.
 *
 * --------------------------------------------------------------------------
 * سه لایه‌ی بصری
 * --------------------------------------------------------------------------
 * • مهتاب: همان SVG ثابت و افقی‌اسکرولِ همیشگی، بدونِ هیچ transform سه‌بعدی
 * • بلور: SVG واکنش‌گرا در سه لایه‌ی عمقِ جدا با پارالاکسِ لمسی/ژیروسکوپ
 * • کهکشان: آسمانِ واقعیِ WebGL با ستاره‌های سه‌بعدی و پروازِ دوربین
 *
 * صحنه‌ی کهکشان با ``lazy()`` بارگذاری می‌شود تا three.js (~۱۳۵KB gzip)
 * هرگز واردِ باندلِ دو لایه‌ی دیگر نشود.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { useMotionAllowed, useQualityTier } from '../shared/depth'
import { attachGyroTilt, attachPointerTilt } from '../shared/quality'
import { tone } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Empty, useApi } from '../shared/ui'

/**
 * آسمانِ WebGL — ماژولِ جداگانه تا three.js در یک چانکِ مستقل بنشیند و فقط
 * وقتی لایه واقعاً «کهکشان» باشد درخواست شود.
 */
const StarmapSky = lazy(() => import('../three/StarmapSky'))

interface Constellation {
  id: number
  letter: string
  order: number
  message: string
  stars: [number, number][]
  /** ``letter`` یا ``shape`` — از مهاجرتِ ۰۰۰۲ به بعد همیشه هست */
  kind?: string
}

const CELL = 96 // پهنای هر حرف روی بوم (لایه‌ی مهتاب)
const PAD = 22

/** علامت‌هایی که «شکل»‌اند نه حرفِ اسم */
const SHAPE_GLYPHS = new Set(['♥', '∞'])

/** بسامدِ مطبوع برای شکل‌ها (توضیحِ بالای فایل، بندِ ۳) */
const SHAPE_TONES: Record<string, number> = { '♥': 523.25, '∞': 392.0 }

/**
 * ابعادِ بومِ لایه‌ی بلور.
 *
 * ⚠️ چرا این عدد با ``aspect-ratio``ِ ظرف **یکی** است: اگر viewBox با
 * نسبتِ ظرف فرق کند و ``preserveAspectRatio="none"`` بگذاریم، حروف
 * **کشیده** می‌شوند و «M» پهن و کج دیده می‌شود. اگر به‌جایش ``meet``
 * بگذاریم، آسمان فقط وسطِ ظرف را پر می‌کند و کناره‌ها خالی می‌ماند.
 * هم‌نسبت‌کردنِ این دو، هر دو مشکل را با هم حل می‌کند و distort نمی‌شود.
 */
const SKY_W = 160
const SKY_H = 100

/**
 * ستاره‌ها در مختصات ریاضی ذخیره می‌شوند (y رو به بالا) ولی بوم SVG
 * مبدأش گوشه‌ی بالا-چپ است (y رو به پایین). بدون این تبدیل، هر حرف
 * عمودی آینه می‌شود و مثلاً «M» شبیه «W» دیده می‌شود.
 *
 * ⚠️ این تبدیل **فقط** برای SVG است. three.js هم مثلِ بک‌اند y رو به بالا
 * دارد، پس صحنه‌ی سه‌بعدی هیچ برگرداندنی نمی‌کند — اگر آن‌جا هم می‌زدیم،
 * قلب واژگون می‌شد و نوکش رو به بالا دیده می‌شد.
 */
const toCanvasY = (y: number) => 1 - y

/** آیا این صورتِ فلکی یک «شکل» است یا یک حرفِ اسم؟ */
function isShapeItem(c: Constellation): boolean {
  if (c.kind === 'shape') return true
  if (c.kind === 'letter') return false
  return SHAPE_GLYPHS.has(c.letter)
}

export default function Starmap() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const tier = useQualityTier()
  const motionAllowed = useMotionAllowed()
  const { data, loading, error } = useApi<{ items: Constellation[] }>('/starmap')
  const [active, setActive] = useState<Constellation | null>(null)
  const [allLit, setAllLit] = useState(false)
  // چیدمان پیش‌فرض: چپ به راست (حرف اول سمت چپ). دخترم می‌تواند با چیپ
  // پایین آن را به راست به چپ عوض کند.
  const [rtlLayout, setRtlLayout] = useState(false)
  const lastTap = useRef<{ id: number; at: number } | null>(null)
  /** اگر صحنه‌ی کهکشان به هر دلیلی ساخته نشد، به نسخه‌ی بلور می‌افتیم */
  const [sceneFailed, setSceneFailed] = useState(false)

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

  /** غبارِ لایه‌ی بلور — دو دسته در عمقِ متفاوت برای پارالاکس */
  const dustFar = useMemo(
    () =>
      Array.from({ length: 34 }, (_, i) => ({
        id: i,
        x: Math.random() * SKY_W,
        y: Math.random() * SKY_H,
        r: 0.3 + Math.random() * 0.5,
        o: 0.16 + Math.random() * 0.4,
      })),
    [],
  )
  const dustNear = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * SKY_W,
        y: Math.random() * SKY_H,
        r: 0.5 + Math.random() * 0.85,
        o: 0.3 + Math.random() * 0.5,
        tw: 2.2 + Math.random() * 3.4,
      })),
    [],
  )

  useEffect(() => {
    document.documentElement.dataset.starmap = 'on'
    return () => {
      delete document.documentElement.dataset.starmap
    }
  }, [])

  const items = useMemo(() => {
    const list = [...(data?.items || [])]
    // ترتیب از بک‌اند می‌آید؛ سورتِ پایدار تا «مریم» درست خوانده شود
    list.sort((a, b) => a.order - b.order)
    return list
  }, [data?.items])

  /** فقط حرف‌ها — ردیفِ آسمان */
  const letters = useMemo(() => items.filter((c) => !isShapeItem(c)), [items])
  /** فقط شکل‌ها — بخشِ مستقلِ پایین */
  const shapes = useMemo(() => items.filter((c) => isShapeItem(c)), [items])

  /** در چیدمانِ راست‌به‌چپ، حرفِ اول سمت راست می‌نشیند */
  const rowLetters = useMemo(() => (rtlLayout ? [...letters].reverse() : letters), [letters, rtlLayout])

  /** نامِ کامل از روی **حرف‌ها** ساخته می‌شود، نه شکل‌ها */
  const fullName = useMemo(() => letters.map((c) => c.letter).join(''), [letters])

  /* ------------------------------------------------------- ضربه و راز ⑩ --- */
  const tapStar = async (c: Constellation) => {
    const now = Date.now()
    // راز ⑩ — دو بار زدن سریع روی یک ستاره
    if (lastTap.current && lastTap.current.id === c.id && now - lastTap.current.at < 420) {
      lastTap.current = null
      const egg = await post<{ found: boolean; title: string; message: string }>('/egg', {
        trigger: 'star_double_click',
      })
      if (egg.found) {
        showEgg({ title: egg.title, message: egg.message })
        return
      }
    }
    lastTap.current = { id: c.id, at: now }
    // شکل‌ها بسامدِ ثابتِ مطبوع می‌گیرند؛ حرف‌ها از order (توضیحِ بالای فایل)
    const freq = isShapeItem(c) ? (SHAPE_TONES[c.letter] ?? 523.25) : 880 + c.order * 60
    tone({ freq, duration: 0.5, type: 'sine', gain: 0.06 })
    if (isShapeItem(c) && motionAllowed) {
      // برای ♥ و ∞ یک آرپژِ کوتاه هم می‌زنیم تا «نشانه» حسِ ویژه داشته باشد
      tone({ freq: (SHAPE_TONES[c.letter] ?? 523.25) * 1.5, duration: 0.4, type: 'sine', gain: 0.04, delay: 0.09 })
    }
    setActive(c)
  }

  /* ---------------------------------------------------- لنگرِ سه‌بعدی --- */
  const depthRef = useRef<HTMLDivElement | null>(null)
  const showDreamSky = tier === 'dream' && motionAllowed && !sceneFailed
  useEffect(() => {
    const el = depthRef.current
    // فقط در لایه‌ی بلور و فقط وقتی واقعاً آسمانِ SVG رندر می‌شود.
    // در کهکشان، صحنه‌ی WebGL چرخش را خودش مدیریت می‌کند؛ اضافه‌کردنِ tiltِ
    // CSS روی آن «دو منبعِ حرکت» می‌سازد و تصویر دریفت می‌کند.
    if (!el || tier !== 'balanced' || !motionAllowed || showDreamSky) return
    const detachPointer = attachPointerTilt(el, { maxDeg: 7 })
    const detachGyro = attachGyroTilt(el, { maxDeg: 8 })
    return () => {
      detachPointer()
      // attachGyroTilt روی iOS و دستگاه‌های غیرلمسی ``null`` برمی‌گرداند
      // (عمداً هرگز فعال نمی‌شود)، پس صدازدنش باید اختیاری باشد.
      detachGyro?.()
    }
  }, [tier, motionAllowed, showDreamSky, letters.length])

  /** داده‌ی فشرده برای صحنه‌ی three.js */
  const sceneShapes = useMemo(
    () =>
      items.map((c) => ({
        id: c.id,
        letter: c.letter,
        kind: isShapeItem(c) ? 'shape' : 'letter',
        stars: c.stars,
        lit: allLit || (active ? active.id === c.id : false),
      })),
    [items, allLit, active],
  )

  /* ---------------------------------------------------- پارالاکسِ بلور --- */
  const parallax = tier === 'balanced' && motionAllowed

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  if (items.length === 0) return <Empty />

  // لایه‌ی مهتاب: همان بومِ ثابتِ قدیمی با اسکرولِ افقی (بی‌نقص و آزموده)
  const width = rowLetters.length * CELL + PAD * 2
  const height = CELL + PAD * 2

  return (
    <div className="space-y-3">
      <p className="text-center text-sm os-muted">{t('starmap.caption')}</p>

      <div
        className="os-sky-panel relative overflow-hidden rounded-3xl"
        style={{ background: 'radial-gradient(120% 100% at 50% 0%, #232a5c 0%, #0b1026 75%)' }}
        data-tier={tier}
      >
        {showDreamSky ? (
          /* ----------------------------- لایه‌ی کهکشان: آسمانِ WebGL --- */
          <div className="os-sky-canvas-wrap">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center">
                  <motion.span
                    className="h-8 w-8 rounded-full bg-white/70"
                    animate={{ opacity: [0.25, 1, 0.25] }}
                    transition={{ duration: 1.4, repeat: Infinity }}
                  />
                </div>
              }
            >
              <StarmapSky
                shapes={sceneShapes}
                focusId={active ? active.id : null}
                onFallback={() => setSceneFailed(true)}
                className="os-sky-canvas"
              />
            </Suspense>
            <p className="os-sky-drag-hint">{t('starmap.dragHint')}</p>
          </div>
        ) : parallax ? (
          /* --------------------- لایه‌ی بلور: SVG با پارالاکسِ عمقی --- */
          // ⚠️ ظرفِ سه‌بعدی عمداً **واکنش‌گرا** است و اسکرولِ افقی ندارد:
          //    در سافاری، ``overflow`` غیر از ``visible`` روی جدِ یک ظرفِ
          //    preserve-3d باعثِ تخت‌شدنِ عمق می‌شود (تله‌ی R-C).
          <div className="os-sky-stack os-stage-3d">
            <div className="os-depth os-sky-depth" ref={depthRef}>
              <svg
                className="os-sky-layer"
                viewBox={`0 0 ${SKY_W} ${SKY_H}`}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden
                style={{ transform: 'translateZ(-70px)' }}
              >
                {dustFar.map((d) => (
                  <circle key={`f${d.id}`} cx={d.x} cy={d.y} r={d.r} fill="#dfe6ff" opacity={d.o * 0.6} />
                ))}
              </svg>
              <svg
                className="os-sky-layer"
                viewBox={`0 0 ${SKY_W} ${SKY_H}`}
                preserveAspectRatio="xMidYMid meet"
                aria-hidden
                style={{ transform: 'translateZ(-30px)' }}
              >
                {dustNear.map((d) => (
                  <circle key={`n${d.id}`} cx={d.x} cy={d.y} r={d.r} fill="#ffe9c2" opacity={d.o}>
                    <animate
                      attributeName="opacity"
                      values={`${d.o};${d.o * 0.3};${d.o}`}
                      dur={`${d.tw}s`}
                      repeatCount="indefinite"
                    />
                  </circle>
                ))}
              </svg>
              <ResponsiveSky
                letters={rowLetters}
                active={active}
                allLit={allLit}
                onTap={tapStar}
                caption={t('starmap.caption')}
              />
            </div>
          </div>
        ) : (
          /* ---------------------------------- لایه‌ی مهتاب: SVG ثابت --- */
          <>
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
                {rowLetters.map((c, ci) => {
                  const ox = PAD + ci * CELL
                  const pts = c.stars.map(([x, y]) => [
                    ox + x * (CELL - 26) + 13,
                    PAD + toCanvasY(y) * (CELL - 26) + 13,
                  ])
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
                      <text
                        x={ox + CELL / 2}
                        y={height - 4}
                        textAnchor="middle"
                        fontSize="10"
                        fill="rgba(255,255,255,.55)"
                      >
                        {c.letter}
                      </text>
                    </g>
                  )
                })}
              </svg>
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------ شکل‌های آسمان --- */}
      {shapes.length > 0 && (
        <div className="space-y-2" data-starmap-shapes>
          <p className="os-title text-sm os-muted">{t('starmap.shapesTitle')}</p>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(shapes.length, 2)}, minmax(0,1fr))` }}>
            {shapes.map((c) => {
              const lit = allLit || active?.id === c.id
              const heart = c.letter === '♥'
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => void tapStar(c)}
                  className={`os-sky-shape ${lit ? 'os-sky-shape-lit' : ''}`}
                  style={{ ['--shape-color' as string]: heart ? '#ff9ecb' : '#ffd98a' }}
                  aria-pressed={lit}
                  data-shape={c.letter}
                >
                  <svg viewBox="-8 -8 116 116" className="os-sky-shape-svg" aria-hidden>
                    <polyline
                      points={c.stars.map(([x, y]) => `${(x * 100).toFixed(2)},${(toCanvasY(y) * 100).toFixed(2)}`).join(' ')}
                      fill="none"
                      stroke={lit ? (heart ? '#ff9ecb' : '#ffd98a') : 'rgba(255,255,255,.3)'}
                      strokeWidth={lit ? 2.4 : 1.4}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={lit ? 0.95 : 0.45}
                    />
                    {c.stars.map(([x, y], i) => (
                      <motion.circle
                        key={i}
                        cx={x * 100}
                        cy={toCanvasY(y) * 100}
                        r={lit ? 3.4 : 2.2}
                        fill={lit ? '#fff6d6' : '#e7eaff'}
                        animate={
                          motionAllowed
                            ? lit
                              ? { opacity: [1, 0.45, 1] }
                              : { opacity: [0.6, 0.9, 0.6] }
                            : { opacity: lit ? 1 : 0.75 }
                        }
                        transition={
                          motionAllowed
                            ? { duration: lit ? 1.9 : 2.6, delay: i * 0.07, repeat: Infinity }
                            : { duration: 0 }
                        }
                        style={{ filter: lit ? `drop-shadow(0 0 5px ${heart ? '#ff9ecb' : '#ffd98a'})` : undefined }}
                      />
                    ))}
                  </svg>
                  <span className="os-sky-shape-glyph" aria-hidden>
                    {c.letter}
                  </span>
                  <span className="sr-only">{t('starmap.shapeAria', { glyph: c.letter })}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
            <p className="os-title text-2xl" style={{ color: isShapeItem(active) ? '#ff9ecb' : '#ffd98a' }}>
              {isShapeItem(active) ? t('starmap.shapeActive', { glyph: active.letter }) : active.letter}
            </p>
            <p className="mt-2 text-sm leading-7">{active.message}</p>
            {allLit && fullName && (
              <p className="mt-2 text-xs os-muted">{t('starmap.allLit', { name: fullName })}</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* --------------------------------------------------------------------------
 * ResponsiveSky — آسمانِ واکنش‌گرا برای لایه‌ی بلور
 *
 * برخلافِ لایه‌ی مهتاب که بومِ ثابتِ ۹۶ پیکسلی با اسکرولِ افقی دارد، این‌جا
 * بوم به پهنایِ ظرف مقیاس می‌شود. دلیلش فقط زیبایی نیست: ظرفِ اسکرولِ افقی
 * در سافاری عمقِ preserve-3d را تخت می‌کند (تله‌ی R-C) و کلِ پارالاکس
 * بی‌اثر می‌شود.
 *
 * ⚠️ هدفِ لمسی: هر ``<g>`` یک ``<rect>`` شفافِ تمام‌قد دارد که کلِ ستونِ
 *    حرف را قابلِ ضربه می‌کند. با ۶ حرف روی صفحه‌ی ۳۶۰ پیکسلی، پهنایِ هر
 *    ستون ~۶۰ پیکسل است → بالایِ آستانه‌ی ۴۴ پیکسل. اگر روزی تعدادِ حرف‌ها
 *    خیلی زیاد شد، این عدد باید دوباره بررسی شود.
 * -------------------------------------------------------------------------- */

function ResponsiveSky({
  letters,
  active,
  allLit,
  onTap,
  caption,
}: {
  letters: Constellation[]
  active: Constellation | null
  allLit: boolean
  onTap: (c: Constellation) => void
  caption: string
}) {
  const n = Math.max(1, letters.length)
  const cellW = SKY_W / n
  return (
    <svg
      className="os-sky-layer os-sky-layer-sky"
      viewBox={`0 0 ${SKY_W} ${SKY_H}`}
      preserveAspectRatio="xMidYMid meet"
      role="group"
      aria-label={caption}
    >
      {letters.map((c, i) => {
        const cx = i * cellW + cellW / 2
        const size = Math.min(cellW * 0.72, 46)
        const pts = c.stars.map(([x, y]) => [
          cx + (x - 0.5) * size,
          44 + (toCanvasY(y) - 0.5) * size,
        ])
        const lit = allLit || active?.id === c.id
        return (
          <g
            key={c.id}
            onClick={() => void onTap(c)}
            style={{ cursor: 'pointer' }}
            role="button"
            aria-label={c.letter}
          >
            {/* ناحیه‌ی ضربه — عمداً تمامِ ستون، تا هدفِ لمسی کوچک نشود */}
            <rect x={i * cellW} y={0} width={cellW} height={SKY_H} fill="transparent" />
            <polyline
              points={pts.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke={lit ? '#ffd98a' : 'rgba(255,255,255,.3)'}
              strokeWidth={lit ? 1.6 : 0.9}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={lit ? 0.95 : 0.5}
            />
            {pts.map((p, pi) => (
              <motion.circle
                key={pi}
                cx={p[0]}
                cy={p[1]}
                r={lit ? 3.2 : 2.1}
                fill={lit ? '#ffe9a8' : '#ffffff'}
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{ duration: 2, delay: (i + pi) * 0.12, repeat: Infinity }}
                style={{ filter: lit ? 'drop-shadow(0 0 4px #ffd98a)' : undefined }}
              />
            ))}
            <text
              x={cx}
              y={92}
              textAnchor="middle"
              fontSize={Math.min(cellW * 0.2, 11)}
              fill={lit ? '#ffd98a' : 'rgba(255,255,255,.55)'}
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {c.letter}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
