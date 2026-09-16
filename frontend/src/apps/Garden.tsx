/**
 * Garden — باغچه‌ی ما
 * هر گل با آب دادن رشد می‌کند و پیامی از بابا می‌آید.
 * راز ⑪: پنج بار آب دادن به یک گل.
 *
 * --------------------------------------------------------------------------
 * گیاهِ سه‌بعدی
 * --------------------------------------------------------------------------
 * در لایه‌های بلور و کهکشان، گیاه از یک SVGِ تخت به **سه لایه‌ی عمقیِ جدا**
 * تبدیل می‌شود: گلدان در سطح، ساقه و برگ‌ها کمی بالاتر، و خودِ گل بالاتر از
 * همه. با کج‌شدنِ ظرف، این سه لایه با سرعت‌های متفاوت جابه‌جا می‌شوند —
 * یعنی پارالاکسِ واقعیِ عمقی، و گل واقعاً «بالایِ» گلدان شناور دیده می‌شود.
 *
 * چرا سه SVGِ جدا و نه یک SVG با translateZ روی اجزا: ``translateZ`` در فضایِ
 * سه‌بعدیِ CSS کار می‌کند، نه داخلِ سیستمِ مختصاتِ یک SVG. تنها راهِ
 * داشتنِ عمقِ واقعی، جداکردنِ اجزا به ظرف‌های مستقل است.
 *
 * ⚠️ **فقط گیاه** تیلت می‌خورد، نه کلِ کارت. اسمِ گل، شماره‌ی مرحله و دکمه‌ی
 *    «آب بده» همه متن‌اند و کج‌شدنِ متن خوانایی را خراب می‌کند (قاعده‌ی
 *    سختِ پروژه: متن هرگز تیلت نمی‌خورد).
 */
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { Tilt, useMotionAllowed, useQualityTier } from '../shared/depth'
import { digits } from '../shared/format'
import { playBloom } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Empty, useApi } from '../shared/ui'

interface Flower {
  id: number
  name: string
  color: string
  emoji: string
  water_count: number
}

/** رشد گل در ۵ مرحله بر اساس تعداد آب دادن */
function stage(n: number) {
  return Math.min(5, Math.floor(n / 2) + (n > 0 ? 1 : 0))
}

/* --------------------------------------------------------------------------
 * اجزای گیاه
 *
 * هر جزء یک تابعِ جداست تا هم نسخه‌ی تختِ مهتاب و هم نسخه‌ی سه‌لایه‌ی عمقی
 * **از یک کد** استفاده کنند. اگر دو بار نقاشی‌اش می‌کردم، اولین باری که
 * کسی رنگِ برگ را عوض می‌کرد فقط یکی از دو نسخه عوض می‌شد و باگِ «در لایه‌ی
 * مهتاب یک‌جور است و در بلور جورِ دیگر» می‌گرفتیم.
 * -------------------------------------------------------------------------- */

const PLANT_W = 88
const PLANT_H = 120
const PLANT_VB = `0 0 ${PLANT_W} ${PLANT_H}`

/** گلدان + سایه‌ی نرمِ زیرش */
function Pot() {
  return (
    <>
      {/* سایه‌ی تماس: بدونِ آن، گلدان روی هوا معلق به نظر می‌رسد */}
      <ellipse cx="44" cy="116" rx="24" ry="3.5" fill="rgba(90,50,40,.22)" />
      <path d="M26 96h36l-4 20H30Z" fill="#e8b596" />
      <rect x="23" y="90" width="42" height="8" rx="3" fill="#d79c7c" />
      {/* لبه‌ی روشنِ بالای گلدان — یک خطِ نازک که حجمِ استوانه را می‌سازد */}
      <rect x="23" y="90" width="42" height="2.5" rx="1.2" fill="rgba(255,255,255,.32)" />
    </>
  )
}

/** ساقه و برگ‌ها */
function Stem({ s, height }: { s: number; height: number }) {
  return (
    <>
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
        <ellipse
          cx="34"
          cy={92 - height * 0.45}
          rx="9"
          ry="5"
          fill="#7ccb80"
          transform={`rotate(-25 34 ${92 - height * 0.45})`}
        />
      )}
      {s >= 3 && (
        <ellipse
          cx="54"
          cy={92 - height * 0.62}
          rx="9"
          ry="5"
          fill="#7ccb80"
          transform={`rotate(25 54 ${92 - height * 0.62})`}
        />
      )}
    </>
  )
}

/** سرِ گل (شکوفه‌ی کامل یا غنچه) */
function Head({ s, height, color, bloom }: { s: number; height: number; color: string; bloom: boolean }) {
  if (s >= 4) {
    return (
      <motion.g
        initial={{ scale: 0 }}
        animate={{ scale: bloom ? [1, 1.35, 1] : 1 }}
        transition={{ duration: 0.7 }}
        style={{ transformOrigin: `44px ${92 - height}px` }}
      >
        {[0, 72, 144, 216, 288].map((a) => (
          <ellipse
            key={a}
            cx="44"
            cy={92 - height - 8}
            rx="6"
            ry="9"
            fill={color}
            transform={`rotate(${a} 44 ${92 - height})`}
          />
        ))}
        <circle cx="44" cy={92 - height} r="5" fill="#ffe08a" />
      </motion.g>
    )
  }
  if (s > 0) return <circle cx="44" cy={92 - height} r="4" fill={color} opacity="0.7" />
  return null
}

function Plant({ f, bloom, deep }: { f: Flower; bloom: boolean; deep: boolean }) {
  const s = stage(f.water_count)
  const height = 18 + s * 16

  if (!deep) {
    // لایه‌ی مهتاب: همان یک SVGِ تختِ همیشگی
    return (
      <svg width={PLANT_W} height={PLANT_H} viewBox={PLANT_VB} className="mx-auto">
        <Pot />
        <Stem s={s} height={height} />
        <Head s={s} height={height} color={f.color} bloom={bloom} />
      </svg>
    )
  }

  // لایه‌های عمقی: سه ظرفِ هم‌اندازه روی هم، هرکدام در translateZ متفاوت.
  // عمق‌ها عمداً کوچک‌اند (قاعده‌ی «حداکثر عمقِ تودرتو ۲» و پرهیز از
  // بزرگ‌نماییِ اغراق‌شده که گیاه را کاریکاتوری می‌کند).
  const layer = (z: number, children: React.ReactNode) => (
    <svg
      width={PLANT_W}
      height={PLANT_H}
      viewBox={PLANT_VB}
      className="absolute inset-0"
      style={{ transform: `translateZ(${z}px)` }}
      aria-hidden
      focusable="false"
    >
      {children}
    </svg>
  )

  return (
    <div
      className="relative mx-auto"
      style={{ width: PLANT_W, height: PLANT_H, transformStyle: 'preserve-3d' }}
    >
      {layer(0, <Pot />)}
      {layer(10, <Stem s={s} height={height} />)}
      {layer(22, <Head s={s} height={height} color={f.color} bloom={bloom} />)}
    </div>
  )
}

export default function Garden() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const tier = useQualityTier()
  const motionAllowed = useMotionAllowed()
  const { data, loading, error, setData } = useApi<{ items: Flower[] }>('/garden')
  const [message, setMessage] = useState('')
  const [blooming, setBlooming] = useState<number | null>(null)

  const deep = tier !== 'lite' && motionAllowed

  const water = async (f: Flower) => {
    playBloom()
    setBlooming(f.id)
    setTimeout(() => setBlooming(null), 900)
    const res = await post<{ water_count: number; message: string }>(`/garden/${f.id}/water`)
    setMessage(res.message)
    setData((prev) =>
      prev ? { items: prev.items.map((x) => (x.id === f.id ? { ...x, water_count: res.water_count } : x)) } : prev,
    )
    // راز ⑪ — پنج بار آب دادن به یک گل
    if (res.water_count === 5) {
      const egg = await post<{ found: boolean; title: string; message: string }>('/egg', {
        trigger: 'garden_5_water',
      })
      if (egg.found) showEgg({ title: egg.title, message: egg.message })
    }
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  return (
    <div className="space-y-3">
      <p className="text-center text-sm os-muted">{t('garden.caption')}</p>
      <div className="grid grid-cols-2 gap-3">
        {items.map((f, i) => (
          <motion.div
            key={f.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="os-card p-3 text-center"
          >
            {deep ? (
              // ⚠️ فقط گیاه تیلت می‌خورد. متن‌ها و دکمه عمداً بیرونِ Tilt
              //    می‌مانند تا خوانایی‌شان خراب نشود.
              <div className="flex justify-center">
                <Tilt maxDeg={9}>
                  <Plant f={f} bloom={blooming === f.id} deep />
                </Tilt>
              </div>
            ) : (
              <Plant f={f} bloom={blooming === f.id} deep={false} />
            )}
            <p className="os-title mt-1 text-sm">
              {f.emoji} {f.name}
            </p>
            <p className="text-[11px] os-muted">{t('garden.level', { n: digits(stage(f.water_count)) })}</p>
            {/* هدفِ لمسی: py-2 روی دکمه‌ی تمام‌پهنا ارتفاع را بالای ۴۴ می‌برد */}
            <button className="os-btn mt-2 w-full !py-2 text-xs" onClick={() => void water(f)}>
              💧 {t('garden.water')}
            </button>
          </motion.div>
        ))}
      </div>
      {message && (
        <motion.p
          key={message}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="os-card p-3 text-center text-sm"
          style={{ color: 'var(--os-accent)' }}
        >
          {message}
        </motion.p>
      )}
    </div>
  )
}
