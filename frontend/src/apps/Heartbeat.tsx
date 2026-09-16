/**
 * Heartbeat — ضربان قلب بابا
 * قلبی که می‌تپد، صدای لاب-داب و لرزش هماهنگ؛ با نگه‌داشتن انگشت تندتر می‌شود.
 *
 * --------------------------------------------------------------------------
 * قلبِ توپُر
 * --------------------------------------------------------------------------
 * در لایه‌های بلور و کهکشان، قلب دیگر یک شکلِ تخت با گرادیان نیست: یک جسمِ
 * **توپُر** است که با لایه‌چینیِ ۱۲ تا ۱۶ کپیِ همان مسیر در عمق‌های متفاوت
 * ساخته می‌شود (تکنیکِ ``Extrude``). وقتی ظرف بچرخد، پهلوی قلب واقعاً دیده
 * می‌شود — بدونِ یک بایت WebGL.
 *
 * افکتی که فقط در سه‌بعد ممکن است: با تندشدنِ ضربان، **ضخامتِ خودِ قلب**
 * زیاد می‌شود. انگار قلب دارد پُرتر و محکم‌تر می‌زند. در طراحیِ تخت هیچ
 * معادلی برای این حس وجود ندارد؛ نزدیک‌ترین چیز «بزرگ‌تر شدن» است که از قبل
 * داریم و چیزِ تازه‌ای نمی‌گوید.
 *
 * --------------------------------------------------------------------------
 * ⚠️ سه منبعِ transform، سه عنصرِ جدا
 * --------------------------------------------------------------------------
 * تپش (framer، ``scale``)، تیلت (``Extrude``، روی ``--tilt-x/y``) و
 * پرسپکتیو (``.os-stage-3d``) هر سه transform می‌سازند. اگر دو‌تایشان روی
 * **یک** عنصر می‌نشستند، یکی دیگری را بی‌صدا می‌بلعید — چون انیمیشنِ CSS در
 * آبشار بر style درون‌خطی اولویت دارد. پس هرکدام عنصرِ خودش را دارد و
 * transformها با هم ترکیب می‌شوند.
 */
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Extrude, useMotionAllowed, useQualityTier } from '../shared/depth'
import { digits } from '../shared/format'
import { playHeartbeat, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'

/** مسیرِ قلب. یک بار تعریف می‌شود چون هم لایه‌ی تخت و هم توپُر از آن استفاده می‌کنند. */
const HEART_D =
  'M12 21.5s-8.6-5.6-8.6-11.4A5.1 5.1 0 0 1 12 7.4a5.1 5.1 0 0 1 8.6 2.7c0 5.8-8.6 11.4-8.6 11.4Z'

/**
 * گرادیانِ صورتِ جلو.
 *
 * ⚠️ تنها لایه‌ی **جلو** این ``defs`` را می‌گیرد. اگر مثلِ نخستین تلاشِ
 * ناکام، کلِ فرزندان ۱۲ بار کپی می‌شدند، ``id="hb"`` هم ۱۲ بار در سند
 * تکرار می‌شد → HTML نامعتبر و همه‌ی لایه‌ها اولین ``id`` را برمی‌داشتند.
 * لایه‌های پشتی رنگِ توپُر می‌گیرند و به گرادیان نیازی ندارند، چون در عمق
 * و در سایه‌اند.
 */
const HEART_DEFS = (
  <radialGradient id="hb" cx="50%" cy="35%">
    <stop offset="0%" stopColor="#ffb3d4" />
    <stop offset="70%" stopColor="#f767a8" />
    <stop offset="100%" stopColor="#d6467f" />
  </radialGradient>
)

/** رنگِ پایه‌ی پهلوها — تیره‌ترین رنگِ گرادیان، تا پهلو طبیعی در سایه بنشیند */
const HEART_SIDE = '#d6467f'

const HEART_SIZE = 190

/**
 * جاروی نور **برش‌خورده به شکلِ قلب**.
 *
 * چرا از خودِ ``<Specular/>`` استفاده نکردیم: آن یک ``span``ِ مستطیلیِ
 * تمام‌ظرف است. روی یک شکلِ گِرد مثلِ قلب، گوشه‌های مستطیل بیرون از قلب
 * روشن می‌شدند و به‌جایِ «بازتابِ نور روی سطح»، یک مربعِ زننده دیده می‌شد.
 * این‌جا همان مسیرِ قلب با یک گرادیانِ متحرکِ سفیدِ کم‌رنگ پر می‌شود، پس
 * جارو دقیقاً و فقط روی خودِ قلب می‌افتد.
 */
function HeartSpecular() {
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={HEART_SIZE}
      height={HEART_SIZE}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
      style={{ mixBlendMode: 'screen' }}
    >
      <defs>
        <linearGradient id="hbSpec" x1="-60%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="46%" stopColor="#fff" stopOpacity="0" />
          <stop offset="52%" stopColor="#fff" stopOpacity="0.42" />
          <stop offset="58%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          <animate attributeName="x1" values="-70%;130%" dur="3.6s" repeatCount="indefinite" />
          <animate attributeName="x2" values="-10%;190%" dur="3.6s" repeatCount="indefinite" />
        </linearGradient>
      </defs>
      <path d={HEART_D} fill="url(#hbSpec)" />
    </svg>
  )
}

export default function Heartbeat() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const tier = useQualityTier()
  const motionAllowed = useMotionAllowed()
  const [holding, setHolding] = useState(false)
  const [bpm, setBpm] = useState(72)
  const beatRef = useRef<number | null>(null)

  // لایه‌ی مهتاب همان قلبِ تختِ همیشگی می‌ماند: ارزان، آزموده، بدونِ transform
  const deep = tier !== 'lite'
  const dream = tier === 'dream'

  // ضربان: با نگه‌داشتن تا ۱۲۰ بالا می‌رود، رها که کنی آرام می‌شود
  useEffect(() => {
    const id = setInterval(() => {
      setBpm((b) => {
        const target = holding ? 122 : 72
        return Math.round(b + (target - b) * 0.18)
      })
    }, 400)
    return () => clearInterval(id)
  }, [holding])

  // هر ضربان: صدا + لرزش کوتاه
  useEffect(() => {
    const period = 60_000 / bpm
    const tick = () => {
      playHeartbeat(1)
      vibrate([28, 90, 34])
      beatRef.current = window.setTimeout(tick, period)
    }
    beatRef.current = window.setTimeout(tick, period)
    return () => {
      if (beatRef.current) window.clearTimeout(beatRef.current)
    }
  }, [bpm])

  /**
   * ضخامتِ قلب از روی ضربان.
   *
   * در حالتِ استراحت (۷۲) ضخامتِ پایه، و در اوج (۱۲۲) حدود ۱٫۵ برابر.
   * دامنه عمداً کوچک است: اگر قلب موقعِ تپش بیش از حد کلفت می‌شد، حسِ
   * «تپش» به حسِ «تورم» تبدیل می‌شد که ناخوشایند است.
   */
  const swell = Math.min(1, Math.max(0, (bpm - 72) / 50))
  const baseDepth = dream ? 34 : 24
  const depth = Math.round(baseDepth * (1 + swell * 0.5))
  const layers = dream ? 16 : 12

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-6">
      <p className="os-title text-lg" style={{ color: 'var(--os-accent)' }}>{t('heartbeat.feelIt')}</p>

      <motion.button
        onPointerDown={() => setHolding(true)}
        onPointerUp={() => setHolding(false)}
        onPointerLeave={() => setHolding(false)}
        onPointerCancel={() => setHolding(false)}
        animate={{ scale: [1, 1.14, 1, 1.08, 1] }}
        transition={{ duration: 60 / bpm, repeat: Infinity, ease: 'easeInOut' }}
        className="relative select-none"
        // هدفِ لمسی: کلِ قلب ۱۹۰ پیکسل است، بسیار بزرگ‌تر از ۴۴
        style={{ width: HEART_SIZE, height: HEART_SIZE }}
        aria-label={t('heartbeat.feelIt')}
        aria-pressed={holding}
      >
        {deep ? (
          <Extrude
            path={HEART_D}
            viewBox="0 0 24 24"
            size={HEART_SIZE}
            depth={depth}
            layers={layers}
            frontFill="url(#hb)"
            sideColor={HEART_SIDE}
            defs={HEART_DEFS}
            glow="rgba(247,103,168,.45)"
            tilt
            maxDeg={dream ? 13 : 10}
          />
        ) : (
          <svg width={HEART_SIZE} height={HEART_SIZE} viewBox="0 0 24 24" aria-hidden focusable="false">
            <defs>{HEART_DEFS}</defs>
            <path d={HEART_D} fill="url(#hb)" />
          </svg>
        )}

        {/* جاروی نور فقط در کهکشان و فقط وقتی حرکت مجاز است: روی قلبی که
            همین حالا هم می‌تپد، در لایه‌ی بلور یک حرکتِ اضافه‌ی بی‌دلیل بود. */}
        {dream && motionAllowed && deep && <HeartSpecular />}

        {/* هاله‌ی نورانیِ پس‌زمینه. در لایه‌های عمیق، Extrude هاله‌ی خودش را
            دارد، پس این یکی فقط در مهتاب می‌ماند تا آن لایه بی‌روح نشود. */}
        {!deep && (
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: '0 0 70px 10px rgba(247,103,168,.35)' }}
            aria-hidden
          />
        )}
      </motion.button>

      <div className="text-center">
        <p className="os-title text-3xl tabular-nums" style={{ color: 'var(--os-accent)' }}>{digits(bpm)}</p>
        <p className="text-xs os-muted">{t('heartbeat.bpm')}</p>
      </div>

      <p className="max-w-xs text-center text-sm leading-7">{config?.today_message || t('heartbeat.caption')}</p>
      <p className="text-xs os-muted">{t('heartbeat.hold')}</p>
    </div>
  )
}
