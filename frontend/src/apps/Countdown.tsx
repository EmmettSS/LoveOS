/**
 * Countdown — شمارش معکوس تا دیدار بعدی و مناسبت‌ها
 * دخترم هم می‌تواند تایمر اضافه کند.
 */
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, type IconName } from '../shared/Icon'
import { DateField } from '../shared/JalaliDatePicker'
import { del, post } from '../shared/api'
import { useMotionAllowed, useQualityTier } from '../shared/depth'
import { digits, formatDate } from '../shared/format'
import { playSuccess } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Empty, useApi } from '../shared/ui'

interface Item {
  id: number
  title: string
  target: string
  icon: string
  done_message: string
  days: number
  hours: number
  minutes: number
  reached: boolean
}

const ICONS: Record<string, IconName> = {
  plane: 'map', heart: 'heart', cake: 'star', ring: 'achievements', gift: 'vault', star: 'star',
}

const ICON_CHOICES = ['heart', 'plane', 'cake', 'gift', 'star', 'ring'] as const

/**
 * یک خانه‌ی ساعتِ فلیپ.
 *
 * در لایه‌های عمیق، رقم هنگامِ **تغییر** دورِ محورِ X می‌چرخد: رقمِ کهنه به
 * ۹۰− درجه می‌رود و رقمِ تازه از ۹۰+ درجه می‌آید. این همان حسِ «تَق» خوردنِ
 * ساعتِ فلیپِ واقعی است.
 *
 * ⚠️ سه نکته‌ی عمدی:
 *
 * ۱) چرخش **فقط** با تغییرِ واقعیِ مقدار رخ می‌دهد، نه با هر تیک. والد هر
 *    ۶۰ ثانیه یک‌بار ``reload`` می‌کند و ``setTick`` می‌زند، ولی
 *    ``AnimatePresence`` به ``value`` کلید خورده؛ پس تا وقتی دقیقه عوض نشده
 *    هیچ انیمیشنی اجرا نمی‌شود. اگر به رندر کلید می‌خورد، عدد هر دقیقه یک
 *    بار بی‌دلیل می‌چرخید و آزاردهنده می‌شد.
 *
 * ۲) این یکی از معدود جاهایی است که **متن می‌چرخد**. قاعده‌ی پروژه «متن
 *    هرگز کج نشود» برای خواناییِ متنِ ماندگار است؛ این‌جا چرخش یک گذارِ
 *    ۰٫۴۲ ثانیه‌ای است که در حالتِ سکون به rotateX(0) می‌رسد، و موضوعش یک
 *    نمایشگرِ عددی است نه متنِ خواندنی. ضمناً فقط در لایه‌های عمیق و فقط
 *    وقتی حرکت مجاز باشد فعال است.
 *
 * ۳) دامنه‌ی چرخش عمداً بینِ ۹۰− و ۹۰+ نگه داشته شده تا هیچ‌وقت به
 *    «پشتِ» وجه نرسیم؛ با این حال ``backface-visibility: hidden`` هم گذاشته
 *    شده چون اگر روزی دامنه بازتر شد، رقمِ وارونِ آینه‌ای دیده می‌شد.
 */
function Unit({ value, label, deep }: { value: number; label: string; deep: boolean }) {
  return (
    <div className="os-flip-unit flex-1" data-flip-unit>
      <div className="os-flip-viewport">
        <AnimatePresence initial={false} mode="sync">
          <motion.div
            key={value}
            className="os-flip-face os-title tabular-nums"
            style={{ color: 'var(--os-accent)' }}
            initial={deep ? { rotateX: 90, opacity: 0 } : { opacity: 0 }}
            animate={deep ? { rotateX: 0, opacity: 1 } : { opacity: 1 }}
            exit={deep ? { rotateX: -90, opacity: 0 } : { opacity: 0 }}
            transition={{ duration: deep ? 0.42 : 0.2, ease: [0.22, 0.68, 0.36, 1] }}
            aria-hidden={false}
          >
            {digits(value)}
          </motion.div>
        </AnimatePresence>
        {/* درزِ وسطِ ساعتِ فلیپ. یک خطِ یک‌پیکسلی است، ولی همین خط است که
            «یک کارتِ رنگی» را به «یک خانه‌ی ساعتِ مکانیکی» تبدیل می‌کند. */}
        {deep && <span className="os-flip-hinge" aria-hidden />}
      </div>
      <p className="os-flip-label text-[10px] os-muted">{label}</p>
    </div>
  )
}

export default function CountdownApp() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useApi<{ items: Item[] }>('/countdowns')
  const [, setTick] = useState(0)
  const [showAdd, setShowAdd] = useState(false)
  const tier = useQualityTier()
  const motionAllowed = useMotionAllowed()
  /** ساعتِ فلیپ فقط در بلور و کهکشان، و فقط وقتی حرکت مجاز باشد */
  const deep = tier !== 'lite' && motionAllowed

  // هر دقیقه تازه‌سازی برای زنده بودن شمارش
  useEffect(() => {
    const id = setInterval(() => { setTick((x) => x + 1); void reload() }, 60_000)
    return () => clearInterval(id)
  }, [reload])

  if (loading || error) return <ApiStatus loading={loading} error={error} onRetry={() => void reload()} />
  const items = data?.items || []

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="os-title flex-1 text-sm">{t('countdown.title')}</p>
        <button className="os-chip os-chip-active" onClick={() => setShowAdd((v) => !v)}>
          <Icon name={showAdd ? 'minus' : 'plus'} size={14} /> {t('countdown.addTimer')}
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <AddForm onDone={async () => { setShowAdd(false); await reload() }} />
          </motion.div>
        )}
      </AnimatePresence>

      {items.length === 0 ? (
        <Empty text={t('countdown.noItems')} />
      ) : (
        <div className="space-y-3">
          {items.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="os-card p-4"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl animate-float" style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}>
                  <Icon name={ICONS[c.icon] || 'countdown'} size={18} />
                </span>
                <div className="flex-1">
                  <h4 className="os-title text-base">{c.title}</h4>
                  <p className="text-[11px] os-muted">{formatDate(c.target)}</p>
                </div>
                <button
                  className="os-muted rounded-full p-1 hover:bg-black/5"
                  onClick={async () => { await del(`/countdowns/${c.id}`); await reload() }}
                  title={t('os.delete')}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>

              {c.reached ? (
                <p className="mt-3 text-center text-sm animate-beat" style={{ color: 'var(--os-accent)' }}>
                  {c.done_message || t('countdown.reached')}
                </p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <Unit value={c.days} label={t('os.days')} deep={deep} />
                  <Unit value={c.hours} label={t('os.hours')} deep={deep} />
                  <Unit value={c.minutes} label={t('os.minutes')} deep={deep} />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

function AddForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('12:00')
  const [icon, setIcon] = useState<(typeof ICON_CHOICES)[number]>('heart')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !date) return
    setBusy(true)
    try {
      const target = `${date}T${time}:00`
      await post('/countdowns', { title: title.trim(), target, icon, done_message: msg || 'رسیدیم! 🎉' })
      playSuccess()
      showToast(t('os.saved'), 'love')
      onDone()
    } catch {
      showToast(t('os.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="os-card space-y-2 p-3">
      <input className="os-input" placeholder={t('countdown.titlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex gap-2">
        <div className="flex-1">
          <DateField value={date} onChange={setDate} placeholder={t('countdown.datePlaceholder')} />
        </div>
        <input className="os-input w-28" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {ICON_CHOICES.map((ic) => (
          <button key={ic} type="button" className={`os-chip ${icon === ic ? 'os-chip-active' : ''}`} onClick={() => setIcon(ic)}>
            <Icon name={ICONS[ic] || 'star'} size={14} /> {ic}
          </button>
        ))}
      </div>
      <input className="os-input" placeholder={t('countdown.donePlaceholder')} value={msg} onChange={(e) => setMsg(e.target.value)} />
      <button type="submit" className="os-btn-primary w-full" disabled={busy}>
        {busy ? t('os.uploading') : t('countdown.addAction')}
      </button>
    </form>
  )
}
