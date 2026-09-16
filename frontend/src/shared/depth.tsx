/**
 * depth.tsx — جعبه‌ابزارِ عمقِ LoveOS
 *
 * چهار قطعه‌ی مشترک که همه‌ی اپ‌ها با آن‌ها سه‌بعدی می‌شوند:
 *
 *   ``useQualityTier()``  لایه‌ی مؤثرِ کیفیت (از store)
 *   ``<Tilt>``            ظرفی که با مکان‌نما (دسکتاپ) یا ژیروسکوپ (گوشی) کج می‌شود
 *   ``<Extrude>``         برجسته‌سازیِ یک شکلِ SVG به یک جسمِ توپُر
 *   ``<Specular>``        جاروی نور روی یک سطح
 *   ``<AmbientDepth>``    میدانِ ذره‌ی شناور در عمق (پس‌زمینه‌ی دسکتاپ)
 *
 * --------------------------------------------------------------------------
 * چرا این قطعه‌ها مشترک‌اند و نه کپی در هر اپ
 * --------------------------------------------------------------------------
 * اگر هر اپ تیلت و برجسته‌سازیِ خودش را بنویسد، سه چیز خراب می‌شود:
 *   ۱) جهتِ نور بینِ اپ‌ها یکی نمی‌ماند و «فضایِ فیزیکیِ منسجم» از بین می‌رود
 *   ۲) گاردهای لایه‌ی کیفیت و prefers-reduced-motion جای‌جای تکرار و
 *      احتمالاً یک‌جا فراموش می‌شوند
 *   ۳) هزینه‌ی پرفورمنس کنترل‌نشده بالا می‌رود (هر اپ یک حلقه‌ی rAF جدا)
 *
 * --------------------------------------------------------------------------
 * ⚠️ یک باگِ واقعی که ``<Extrude>`` عمداً از آن دوری می‌کند
 * --------------------------------------------------------------------------
 * ساده‌ترین راهِ برجسته‌سازی این است که ``children`` را N بار کپی کنیم.
 * ولی اگر آن children یک SVG با ``<defs><radialGradient id="hb">`` باشد،
 * N عنصر با **همان id** در سند ساخته می‌شود → HTML نامعتبر، و مرورگر همیشه
 * نخستین را برمی‌دارد پس همه‌ی لایه‌ها یک‌رنگ می‌شوند. قلبِ «ضربان» دقیقاً
 * همین ``id="hb"`` را دارد.
 *
 * راه‌حل: ``<Extrude>`` به‌جایِ کپی‌کردنِ children، **مسیر** (``path``) را
 * می‌گیرد و لایه‌های پشتی را با رنگِ توپُر و بدونِ هیچ ``defs`` می‌سازد.
 * ``defs`` فقط یک بار و فقط در لایه‌ی جلو رندر می‌شود. این هم از نظرِ HTML
 * معتبر است و هم از نظرِ بصری درست‌تر: در یک جسمِ واقعی، فقط «صورتِ جلو»
 * گرادیان و بازتاب دارد و پهلوها یک رنگِ تیره‌ی یکنواخت‌اند.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { attachCardTilt, attachGyroTilt, attachPointerTilt, atLeast, probeCapability, type QualityTier } from './quality'
import { useOS } from './store'

/** لایه‌ی مؤثرِ کیفیتِ سه‌بعدی (واکنشی) */
export function useQualityTier(): QualityTier {
  return useOS((s) => s.uiQuality)
}

/** آیا حرکتِ تزئینی مجاز است؟ (لایه + reduced-motion) */
export function useMotionAllowed(): boolean {
  const tier = useQualityTier()
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduced(mq.matches)
    apply()
    // کاربر ممکن است وسطِ نشست این را در سیستم‌عامل عوض کند
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [])
  return atLeast(tier, 'balanced') && !reduced
}

/* ---------------------------------------------------------------- تیلت --- */

/**
 * ظرفِ کج‌شونده.
 *
 * ⚠️ قانونِ سخت: این را دورِ **متن** نگذار.
 *   فارسی با ``font-scale`` تا ۱٫۴ و فونتِ نستعلیق زیرِ تیلت بد خوانده
 *   می‌شود. ``Tilt`` فقط برای عنصرِ بصریِ «قهرمان» است (قلب، شکل، جعبه،
 *   کاشیِ آیکن) — ظرفِ محتوا هرگز.
 *
 * ⚠️ قانونِ سختِ دوم: روی ظرفِ **اسکرول** نگذار.
 *   Safari وقتی ``overflow`` غیرِ ``visible`` باشد ``preserve-3d`` را تخت
 *   می‌کند. پس این باید روی کارتی باشد که **داخلِ** ناحیه‌ی اسکرول نشسته.
 *
 * دو منبعِ تیلت دارد که با هم تداخل نمی‌کنند:
 *   • مکان‌نما — فقط روی دسکتاپ (لمس حینِ اسکرول هم pointermove می‌دهد،
 *     پس attachPointerTilt خودش pointerType!=='mouse' را دور می‌ریزد)
 *   • ژیروسکوپ — فقط روی گوشیِ غیرِ iOS (iOS نیاز به پنجره‌ی اجازه دارد
 *     که برای یک افکتِ تزئینی قابلِ توجیه نیست)
 */
export function Tilt({
  children,
  className = '',
  style,
  maxDeg = 7,
  as: Tag = 'div',
  stage = true,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  maxDeg?: number
  as?: React.ElementType
  /** آیا ظرفِ بیرونی ``perspective`` بگیرد (معمولاً بله) */
  stage?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const allowed = useMotionAllowed()
  const tier = useQualityTier()

  useEffect(() => {
    const el = ref.current
    // در لایه‌ی مهتاب ``--q3d`` صفر است، پس تیلت **اثرِ بصری** ندارد. ولی
    // بدونِ این شرط، listenerها وصل می‌ماندند و هر حرکتِ موس یک نوشتن روی
    // style انجام می‌داد — کارِ بیهوده‌ی خالص روی دستگاهی که عمداً انتخاب
    // شده سبک بماند. پس اصلاً وصلشان نمی‌کنیم.
    if (!el || !allowed || tier === 'lite') return
    const offPointer = attachPointerTilt(el, { maxDeg })
    const offGyro = attachGyroTilt(el, { maxDeg: Math.min(maxDeg, 4) })
    return () => {
      offPointer()
      offGyro?.()
    }
  }, [allowed, maxDeg, tier])

  const inner = (
    <Tag ref={ref} className={`os-depth ${className}`} style={style}>
      {children}
    </Tag>
  )
  if (!stage) return inner
  return <div className="os-stage-3d">{inner}</div>
}

/* --------------------------------------------------- ضریبِ عمق --- */

/**
 * ضریبِ عمق: ``0`` در مهتاب (و با ``prefers-reduced-motion``)، ``1`` در بلور
 * و کهکشان.
 *
 * برای ضرب‌کردن در مقادیرِ انیمیشنِ framer است، تا یک اپ در مهتاب دقیقاً
 * همان انیمیشنِ **قبلیِ** خودش را اجرا کند بدونِ اینکه یک شاخه‌ی ``if``
 * جدا داشته باشد:
 *
 * ```tsx
 * const dz = useDepthFactor()
 * initial={{ opacity: 0, y: 40, rotateX: -7 * dz }}
 * ```
 *
 * ⚠️ مثلِ هر هوکِ دیگری باید **بالایِ** همه‌ی ``return``های زودهنگامِ
 *    کامپوننت صدا زده شود.
 */
export function useDepthFactor(): number {
  const tier = useQualityTier()
  const allowed = useMotionAllowed()
  return allowed && tier !== 'lite' ? 1 : 0
}

/* ------------------------------------------- تیلتِ کارت‌ها (سراسری) --- */

/**
 * تیلتِ ملایمِ همه‌ی کارت‌های ``.os-tilt-card`` در سند، با **یک** listener.
 *
 * یک بار در پوسته‌ی OS (دسکتاپ) صدا زده می‌شود نه در هر اپ — چون listener
 * سراسری است، اگر هر اپ جداگانه نصبش کند تعدادِ نصب/لغو بی‌دلیل زیاد
 * می‌شود. در لایه‌ی مهتاب و با ``prefers-reduced-motion`` اصلاً نصب نمی‌شود،
 * پس روی دستگاهی که عمداً سبک انتخاب شده هیچ رویدادی مصرف نمی‌شود.
 *
 * ⚠️ ``.os-tilt-card`` را روی ظرفِ **اسکرول** و روی ظرفِ **متنِ بلند**
 *    نگذار. همان دو قانونِ سختِ ``<Tilt>`` این‌جا هم برقرار است؛ تنها
 *    تفاوتش این است که زاویه‌اش را CSS تعیین می‌کند (``--tilt-max``) و
 *    برای کارتِ بزرگِ متنی عمداً کوچک است (۴ درجه) چون روی ده‌ها کارت
 *    هم‌زمان اعمال می‌شود.
 */
export function useCardTilt(sensitivity = 1, disabled?: () => boolean): void {
  const tier = useQualityTier()
  const allowed = useMotionAllowed()
  const active = allowed && tier !== 'lite'
  // در ref تا تغییرِ هویتِ تابع هر رندر، listener را نصب/لغو نکند
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  useEffect(() => {
    if (!active) return
    return attachCardTilt({ maxDeg: sensitivity, disabled: () => disabledRef.current?.() ?? false })
  }, [active, sensitivity])
}

/* --------------------------------------------------------- برجسته‌سازی --- */

/** روشن/تیره‌کردنِ یک رنگِ hex بدونِ وابستگی به کتابخانه‌ی رنگ */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount)))
  const r = f((n >> 16) & 255)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return `rgb(${r}, ${g}, ${b})`
}

export interface ExtrudeProps {
  /** مسیرِ SVG — همان مقدارِ صفتِ ``d`` */
  path: string
  viewBox?: string
  /** اندازه‌ی مربعیِ ظرف بر حسب پیکسل */
  size: number
  /** ضخامتِ کلِ جسم بر حسب پیکسل */
  depth?: number
  /** تعدادِ لایه‌ها؛ بیشتر = نرم‌تر ولی گران‌تر */
  layers?: number
  /** رنگِ پرکننده‌ی صورتِ جلو (می‌تواند ``url(#...)`` باشد) */
  frontFill: string
  /** رنگِ پایه‌ی پهلوها (به‌تدریج تیره می‌شود) */
  sideColor: string
  /** ``<defs>`` — فقط یک بار و فقط در لایه‌ی جلو رندر می‌شود */
  defs?: React.ReactNode
  /** هاله‌ی نورانیِ پشتِ جسم */
  glow?: string
  className?: string
  /** تیلتِ فعال داشته باشد؟ */
  tilt?: boolean
  maxDeg?: number
  ariaLabel?: string
}

/**
 * یک شکلِ تخت را به یک جسمِ **توپُر** تبدیل می‌کند.
 *
 * روش: ``layers`` کپی از همان مسیر که هرکدام ``translateZ`` منفیِ بیشتری
 * می‌گیرد و رنگش یک پله تیره‌تر می‌شود. وقتی ظرف بچرخد، پهلوها واقعاً دیده
 * می‌شوند — یعنی عمقِ واقعی، نه یک سایه‌ی نقاشی‌شده.
 *
 * هزینه: ۱۲ لایه = ۱۲ عنصرِ SVG با یک ``path`` ساده. این عملاً رایگان است
 * (بدونِ WebGL، بدونِ canvas) و روی گوشیِ ضعیف هم روان می‌ماند.
 */
export function Extrude({
  path,
  viewBox = '0 0 24 24',
  size,
  depth = 14,
  layers = 12,
  frontFill,
  sideColor,
  defs,
  glow,
  className = '',
  tilt = true,
  maxDeg = 10,
  ariaLabel,
}: ExtrudeProps) {
  const allowed = useMotionAllowed()
  const ref = useRef<HTMLDivElement | null>(null)
  const useTilt = tilt && allowed

  useEffect(() => {
    const el = ref.current
    if (!el || !useTilt) return
    const offPointer = attachPointerTilt(el, { maxDeg })
    const offGyro = attachGyroTilt(el, { maxDeg: Math.min(maxDeg, 5) })
    return () => {
      offPointer()
      offGyro?.()
    }
  }, [useTilt, maxDeg])

  // ضخامتِ هر لایه. اگر لایه‌ها خیلی از هم دور باشند، جسم «خط‌خطی» دیده
  // می‌شود؛ پس یک سقفِ حداقلی می‌گذاریم.
  const step = Math.max(0.6, depth / Math.max(1, layers))
  const backLayers = useMemo(() => Array.from({ length: layers }, (_, i) => i + 1), [layers])

  return (
    // ``position: relative`` عمداً این‌جاست نه در کلاسِ ``.os-stage-3d``:
    // آن کلاس در دسکتاپ و داک هم استفاده می‌شود و relative‌کردنِ سراسری‌اش
    // می‌توانست جایِ فرزندانِ absoluteِ آن‌ها را عوض کند. این‌جا فقط ظرفِ
    // Extrude را «لنگر» می‌کنیم تا هاله‌ی نورانی نسبتِ خودش اندازه بگیرد،
    // نه نسبتِ یک جدِ دورترِ تصادفی.
    <div
      className={`os-stage-3d ${className}`}
      style={{ width: size, height: size, position: 'relative' }}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
    >
      {/* هاله‌ی نورانی پشتِ جسم — در لایه‌ی مهتاب با opacity صفر محو می‌شود */}
      {glow && (
        <span
          className="pointer-events-none absolute rounded-full"
          style={{
            width: size,
            height: size,
            background: `radial-gradient(circle at 50% 45%, ${glow}, transparent 68%)`,
            opacity: 'calc(0.85 * var(--q3d))',
            filter: `blur(${Math.round(size / 14)}px)`,
          }}
          aria-hidden
        />
      )}
      <div
        ref={ref}
        className="os-extrude os-depth"
        style={{ width: size, height: size }}
      >
        {/* لایه‌های پشتی: رنگِ توپُر، بدونِ defs، بدونِ pointer-events */}
        {backLayers.map((i) => {
          // تیره‌شدنِ تدریجی: لایه‌های عمیق‌تر کمتر نور می‌گیرند
          const k = i / layers
          return (
            <svg
              key={i}
              className="os-extrude-layer"
              viewBox={viewBox}
              width={size}
              height={size}
              style={{ transform: `translateZ(${-i * step}px)` }}
              aria-hidden
              focusable="false"
            >
              <path d={path} fill={shade(sideColor, -0.18 - k * 0.42)} />
            </svg>
          )
        })}
        {/* صورتِ جلو: تنها لایه‌ای که گرادیان و defs دارد، و تنها لایه‌ی
            تعاملی. ``position: relative`` است تا در جریانِ چیدمان بماند و
            اندازه‌ی ظرف را تعیین کند. */}
        <svg
          className="relative"
          viewBox={viewBox}
          width={size}
          height={size}
          style={{ transform: 'translateZ(0px)' }}
          aria-hidden={ariaLabel ? undefined : true}
          focusable="false"
        >
          {defs ? <defs>{defs}</defs> : null}
          <path d={path} fill={frontFill} />
        </svg>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ جاروی نور --- */

/** نوارِ روشنِ متحرک روی یک سطح. در مهتاب کلاً ``display:none`` است. */
export function Specular({ className = '' }: { className?: string }) {
  return <span className={`os-specular ${className}`} aria-hidden />
}

/* ------------------------------------------------- میدانِ ذره‌ی محیطی --- */

interface Mote {
  id: number
  x: number
  y: number
  z: number
  size: number
  delay: number
  dur: number
  hue: string
}

/**
 * ذره‌های شناورِ پس‌زمینه در عمقِ واقعی.
 *
 * چرا تعدادش کم است (۲۲ تا): هر ذره یک عنصرِ DOM است که در یک حلقه‌ی
 * انیمیشنِ بی‌نهایت کامپوزیت می‌شود. روی گوشی، ۲۲ عنصرِ کوچکِ GPU-accelerated
 * عملاً رایگان است ولی ۲۰۰ تا نیست. «کم ولی در عمقِ واقعی» بر «زیاد و تخت»
 * مقدم است.
 *
 * در لایه‌ی مهتاب تعداد به صفر می‌رسد (چون ``--q3d`` صفر است و عمق معنا
 * ندارد) و در بلور نصف می‌شود.
 */
export function AmbientDepth({ count = 22, colors }: { count?: number; colors?: string[] }) {
  const tier = useQualityTier()
  const allowed = useMotionAllowed()

  // رنگ‌ها از متغیرهای CSS می‌آیند نه از مقدارِ ثابت، پس با تمِ روز/شب
  // **خودکار** عوض می‌شوند و نیازی به خواندنِ وضعیتِ تم در JS نیست. این
  // هم یک لایه‌بندیِ تمیزتر است (shared نباید به os وابسته شود) و هم یک
  // رندرِ دوباره‌ی کمتر.
  const palette = colors ?? ['var(--os-accent)', 'var(--glow-color)', 'var(--os-muted)']

  const motes = useMemo<Mote[]>(() => {
    const n = !allowed ? 0 : tier === 'dream' ? count : Math.round(count * 0.55)
    return Array.from({ length: n }, (_, i) => {
      // شبه‌تصادفیِ پایدار: با هر رندر جابه‌جا نشود (وگرنه چشم را می‌زند)
      const a = Math.sin(i * 12.9898) * 43758.5453
      const b = Math.sin(i * 78.233) * 12345.6789
      const r1 = a - Math.floor(a)
      const r2 = b - Math.floor(b)
      return {
        id: i,
        x: r1 * 100,
        y: r2 * 100,
        // عمق‌های متفاوت تا واقعاً «پشت و جلو» داشته باشیم
        z: -160 + ((i * 37) % 320),
        size: 2 + ((i * 13) % 5),
        delay: (i * 0.7) % 9,
        dur: 8 + ((i * 5) % 9),
        hue: palette[i % palette.length],
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, allowed, tier])

  if (motes.length === 0) return null

  return (
    // ⚠️ دو ظرف، نه یکی — و این یک اصلاحِ باگ است نه سلیقه:
    // ``overflow: hidden`` و ``perspective`` روی **یک** عنصر، وقتی فرزندش
    // ``preserve-3d`` باشد، در سافاری عمق را تخت می‌کند (تله‌ی R-C). ذره‌ها
    // آن‌وقت به‌جایِ «دور و نزدیک» فقط نقطه‌های تختِ هم‌اندازه می‌شدند.
    // پس بُرش (clip) را ظرفِ بیرونی می‌گیرد و پرسپکتیو را ظرفِ داخلیِ
    // بدونِ overflow — همان الگویی که برای آسمانِ آب‌وهوا جواب داد.
    <div className="os-ambient-depth" aria-hidden>
      <div className="os-ambient-stage">
        <div className="os-extrude h-full w-full">
          {motes.map((m) => (
            <span
              key={m.id}
              className="absolute rounded-full"
              style={{
                left: `${m.x}%`,
                top: `${m.y}%`,
                width: m.size,
                height: m.size,
                background: m.hue,
                opacity: 0.34,
                transform: `translateZ(${m.z}px)`,
                animation: `loveos-float-3d ${m.dur}s ease-in-out ${m.delay}s infinite`,
                boxShadow: `0 0 ${m.size * 3}px ${m.hue}`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* --------------------------------------------------- سربرگِ عمق‌دار --- */

/**
 * سربرگِ استانداردِ سه‌بعدی برای هر اپ.
 *
 * یک پوششِ نازک است که سه کار را یک‌جا و **یکدست** انجام می‌دهد تا هر اپ
 * نسخه‌ی خودش را نسازد:
 *   ۱) ظرفِ ``position: relative`` که ذره‌های محیطی بتوانند داخلش بنشینند
 *   ۲) میدانِ ذره‌ی شناور در پس‌زمینه (اختیاری، با ``motes``)
 *   ۳) پرسپکتیو برای فرزندانِ ``.os-parallax-*``
 *
 * ⚠️ خودِ سربرگ **کج نمی‌شود**. متنِ عنوان باید خوانا بماند؛ عمق این‌جا از
 *    لایه‌بندیِ Z می‌آید نه از چرخش. اگر عنصرِ بصریِ قهرمان داری (یک شکل،
 *    یک آیکون، یک عکس) آن را داخلِ ``<Tilt>`` بگذار، نه کلِ سربرگ را.
 */
export function DepthHero({
  children,
  className = '',
  motes = 0,
  style,
}: {
  children: React.ReactNode
  className?: string
  /** تعدادِ ذره‌های محیطی؛ صفر یعنی بدونِ ذره (پیش‌فرض) */
  motes?: number
  style?: React.CSSProperties
}) {
  const tier = useQualityTier()
  const allowed = useMotionAllowed()
  const deep = allowed && tier !== 'lite'

  return (
    <div className={`os-depth-hero ${className}`} style={style}>
      {deep && motes > 0 ? <AmbientDepth count={motes} /> : null}
      {children}
    </div>
  )
}

/* --------------------------------------------- عمق بر اساسِ اسکرول --- */

/**
 * پارالاکسِ اسکرول — جایگزینِ تیلت برای فهرست‌های طویلِ گوشی.
 *
 * چرا لازم است: روی گوشی تیلتِ مکان‌نما معنا ندارد و روی iOS ژیروسکوپ را
 * عمداً خاموش کرده‌ایم. پس دخترِ من با iPhone هم باید عمق را حس کند.
 * پارالاکسِ اسکرول روی **همه‌ی** دستگاه‌ها بدونِ هیچ اجازه‌ای کار می‌کند.
 *
 * هزینه: یک listener روی ``scroll`` با ``passive: true`` و نوشتنِ دو متغیرِ
 * CSS. هیچ state ری‌اکتی ست نمی‌کند، پس هیچ رندرِ دوباره‌ای رخ نمی‌دهد —
 * این مهم است، وگرنه هر پیکسلِ اسکرول یک رندرِ کاملِ اپ می‌شد.
 *
 * @returns ref برای ظرفِ اسکرول
 */
export function useScrollDepth<T extends HTMLElement>(strength = 1) {
  const ref = useRef<T | null>(null)
  const allowed = useMotionAllowed()

  useEffect(() => {
    const el = ref.current
    if (!el || !allowed) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        const max = el.scrollHeight - el.clientHeight
        const p = max > 0 ? el.scrollTop / max : 0
        el.style.setProperty('--scroll-depth', String(Math.round((p - 0.5) * 2 * 14 * strength)))
      })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [allowed, strength])

  return ref
}

/** آیا این دستگاه GPU از خانواده‌ی Mali دارد؟ (برای گاردِ کره‌ی نقشه) */
export function isMaliGpu(): boolean {
  return probeCapability().mali
}
