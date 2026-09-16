/**
 * Dock.tsx — نوار پایین: منوی شروع، اپ‌های باز، اعلان‌ها، تنظیمات، خروج
 *
 * پوسته‌ی «ژرفا»: داک حالا یک **قطعه‌ی شیشه‌ایِ معلق** است (نه یک نوارِ تخت)
 * و روی دسکتاپ، آیکن‌ها مثلِ macOS با نزدیک‌شدنِ نشانگر بزرگ و بلند می‌شوند.
 *
 * --------------------------------------------------------------------------
 * دو تصمیمِ فنی که عمداً این‌طور گرفته شده‌اند
 * --------------------------------------------------------------------------
 * ۱) بزرگ‌نمایی روی یک ``<span>`` **بسته‌بند** اعمال می‌شود، نه روی خودِ
 *    دکمه. چون دکمه‌ها ``active:scale-90`` تیلویند دارند و آن هم ``transform``
 *    می‌نویسد؛ اگر هر دو روی یک عنصر بودند، یکی دیگری را می‌پوشاند و یا
 *    بزرگ‌نمایی از کار می‌افتاد یا حسِ «فشرده‌شدن» دکمه. دو عنصرِ تودرتو
 *    هرکدام transformِ خودشان را دارند و به‌طور طبیعی ترکیب می‌شوند.
 *
 * ۲) موقعیتِ نشانگر در ``state`` ری‌اکت ذخیره **نمی‌شود**. بزرگ‌نمایی مستقیم
 *    روی ``style`` همان عنصرها نوشته می‌شود. اگر هر pointermove یک
 *    ``setState`` بود، در ثانیه ۶۰ بار کلِ داک (به‌همراهِ همه‌ی آیکن‌ها و
 *    نشان‌های خوانده‌نشده) دوباره رندر می‌شد — دقیقاً همان چیزی که یک
 *    افکتِ «روان» را به یک افکتِ «لگ» تبدیل می‌کند.
 *
 * بزرگ‌نمایی فقط وقتی فعال است که: لایه‌ی کیفیت دستِ‌کم بلور باشد، دستگاه
 * لمسی نباشد (hover روی لمس معنا ندارد)، و reduced-motion روشن نباشد.
 */

import { motion } from 'framer-motion'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { useMotionAllowed, useQualityTier } from '../shared/depth'
import { digits } from '../shared/format'
import { atLeast, probeCapability } from '../shared/quality'
import { playClick } from '../shared/sound'
import { useOS } from '../shared/store'
import { appByKey } from './appRegistry'

/** شعاعِ اثرِ بزرگ‌نمایی بر حسب پیکسل */
const MAG_RADIUS = 130
/** بیشترین بزرگ‌نمایی */
const MAG_MAX = 1.42
/** بیشترین بلندشدن بر حسب پیکسل */
const MAG_LIFT = -11

export function Dock() {
  const { t } = useTranslation()
  const windows = useOS((s) => s.windows)
  const unread = useOS((s) => s.unreadCount)
  const toggleStartMenu = useOS((s) => s.toggleStartMenu)
  const toggleNotifications = useOS((s) => s.toggleNotifications)
  const toggleCommand = useOS((s) => s.toggleCommand)
  const focusApp = useOS((s) => s.focusApp)
  const openApp = useOS((s) => s.openApp)
  const logout = useOS((s) => s.logout)

  const barRef = useRef<HTMLDivElement | null>(null)
  const motionAllowed = useMotionAllowed()
  const deep = atLeast(useQualityTier(), 'balanced')

  // بزرگ‌نماییِ hover فقط روی دسکتاپِ غیرِ لمسی معنا دارد
  useEffect(() => {
    const bar = barRef.current
    if (!bar || !motionAllowed) return
    if (probeCapability().touch) return

    const items = () => Array.from(bar.querySelectorAll<HTMLElement>('[data-dock-item]'))

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return
      for (const el of items()) {
        const r = el.getBoundingClientRect()
        if (r.width === 0) continue
        const center = r.left + r.width / 2
        const d = Math.abs(e.clientX - center)
        if (d >= MAG_RADIUS) {
          el.style.setProperty('--dock-scale', '1')
          el.style.setProperty('--dock-lift', '0px')
          continue
        }
        // منحنیِ نرم: هرچه نزدیک‌تر، بزرگ‌تر. از کسینوس استفاده می‌کنیم چون
        // در لبه‌ها به صفرِ هموار می‌رسد و آیکن‌ها «نمی‌پرند».
        const k = (Math.cos((d / MAG_RADIUS) * Math.PI) + 1) / 2
        el.style.setProperty('--dock-scale', String(1 + (MAG_MAX - 1) * k))
        el.style.setProperty('--dock-lift', `${MAG_LIFT * k}px`)
      }
    }

    const onLeave = () => {
      for (const el of items()) {
        el.style.setProperty('--dock-scale', '1')
        el.style.setProperty('--dock-lift', '0px')
      }
    }

    bar.addEventListener('pointermove', onMove, { passive: true })
    bar.addEventListener('pointerleave', onLeave, { passive: true })
    return () => {
      bar.removeEventListener('pointermove', onMove)
      bar.removeEventListener('pointerleave', onLeave)
      onLeave()
    }
  }, [motionAllowed])

  /**
   * پوششِ مشترکِ هر آیکنِ داک.
   *
   * ``data-dock-item`` روی همین بسته‌بند است تا حلقه‌ی بزرگ‌نمایی پیدایش کند،
   * و ``transform`` هم فقط همین‌جا نوشته می‌شود تا با ``active:scale-90``ِ
   * دکمه‌ی داخلی تداخل نکند.
   */
  const DockSlot = ({ children }: { children: React.ReactNode }) => (
    <span
      data-dock-item=""
      className="inline-flex shrink-0"
      style={{
        transform: 'translateY(var(--dock-lift, 0px)) scale(var(--dock-scale, 1))',
        // transition این‌جاست نه در CSS، چون مقدارِ --dock-scale را JS مستقیم
        // روی style می‌نویسد؛ بدونِ transition بزرگ‌نمایی «پله‌پله» و عصبی
        // دیده می‌شد. مدتِ کوتاه عمداً انتخاب شده تا حسِ دنبال‌کردنِ نشانگر
        // از بین نرود.
        transition: 'transform 0.16s cubic-bezier(0.22,0.68,0.36,1)',
        transformOrigin: 'bottom center',
      }}
    >
      {children}
    </span>
  )

  return (
    <motion.div
      // ``transformPerspective`` عمداً از خودِ framer گرفته می‌شود نه از
      // ``perspective`` روی یک والد: خاصیتِ ``perspective`` فقط روی
      // **فرزندان** اثر می‌کند، نه روی خودِ عنصر. اگر کلاسِ os-stage-3d را
      // روی همین motion.div می‌گذاشتم، چرخشِ خودِ داک بدونِ پرسپکتیو و
      // «اورتوگرافیک» (تخت) دیده می‌شد.
      initial={{ y: 60, opacity: 0, rotateX: deep ? -18 : 0, transformPerspective: 1100 }}
      animate={{ y: 0, opacity: 1, rotateX: 0, transformPerspective: 1100 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div
        ref={barRef}
        className="os-glass-slab flex max-w-full items-center gap-1.5 overflow-x-auto px-2.5 py-2 no-scrollbar"
        style={{
          borderRadius: '1.55rem',
          // سایه‌ی عمیق‌تر از یک کارتِ معمولی، چون داک یک قطعه‌ی «معلق» است
          // و باید حسِ شناور بودن بدهد نه چسبیده به لبه‌ی صفحه.
          boxShadow:
            'var(--rim-light), 0 6px 16px -8px rgba(90,40,80,.45), 0 22px 44px -22px rgba(60,20,50,.55)',
        }}
      >
        <DockSlot>
          <button
            onClick={() => { playClick(); toggleStartMenu() }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
            style={{ background: 'linear-gradient(135deg,#ff9ecb44,#bba0fb44)', color: 'var(--os-accent)' }}
            aria-label={t('desktop.startMenu')}
          >
            <Icon name="grid" size={21} />
          </button>
        </DockSlot>

        <DockSlot>
          <button
            onClick={() => { playClick(); toggleCommand(true) }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
            style={{ background: 'linear-gradient(135deg,#f0abfc33,#7dd3fc33)', color: '#7dd3fc' }}
            aria-label={t('search.title')}
            title={t('search.title')}
          >
            <Icon name="findheart" size={20} />
          </button>
        </DockSlot>

        {windows.length > 0 && <span className="h-7 w-px shrink-0" style={{ background: 'var(--os-border)' }} />}

        {windows.map((w) => {
          const def = appByKey(w.app)
          if (!def) return null
          return (
            <DockSlot key={w.id}>
              <button
                onClick={() => { playClick(); focusApp(w.id) }}
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
                style={{ background: `${def.color}30`, color: def.color }}
                title={t(def.titleKey)}
              >
                <Icon name={def.icon} size={19} />
                {!w.minimized && (
                  <span className="absolute bottom-1 h-1 w-1 rounded-full" style={{ background: def.color }} />
                )}
              </button>
            </DockSlot>
          )
        })}

        <span className="h-7 w-px shrink-0" style={{ background: 'var(--os-border)' }} />

        <DockSlot>
          <button
            onClick={() => { playClick(); toggleNotifications() }}
            className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
            aria-label={t('desktop.notifications')}
          >
            <Icon name="bell" size={20} />
            {unread > 0 && (
              <span
                className="absolute -top-0.5 start-0.5 min-w-[18px] rounded-full px-1 text-[10px] font-bold text-white"
                style={{ background: '#f767a8' }}
              >
                {digits(unread)}
              </span>
            )}
          </button>
        </DockSlot>

        <DockSlot>
          <button
            onClick={() => { playClick(); openApp('settings') }}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
            aria-label={t('desktop.settings')}
          >
            <Icon name="settings" size={20} />
          </button>
        </DockSlot>

        <DockSlot>
          <button
            onClick={() => void logout()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
            aria-label={t('desktop.logout')}
          >
            <Icon name="logout" size={20} />
          </button>
        </DockSlot>
      </div>
    </motion.div>
  )
}
