/**
 * Window.tsx — مدیریت پنجره‌ی اپ‌ها
 *
 * موبایل: شیت تمام‌صفحه با انیمیشن نرم و هدر چسبان
 * دسکتاپ: پنجره‌ی شناور، قابل جابجایی از ناحیه‌ی عنوان
 *
 * نکته‌های حیاتی (رفع باگ «دکمه‌های بستن/مینیمایز کار نمی‌کنند»):
 *  ۱) هیچ چیدمانی در pointerdown عوض نمی‌شود؛ کوچک‌ترین پرش پنجره باعث می‌شود
 *     مرورگر رویداد click را روی دکمه صادر نکند.
 *  ۲) z-index روی wrapper اعمال می‌شود تا فوکوس واقعاً پنجره را جلو بیاورد.
 *  ۳) پنجره‌ی در حال بسته شدن pointer-events ندارد و aria-hidden است؛
 *     وگرنه مثل یک لایه‌ی نامرئی جلوی کلیک روی دسکتاپ را می‌گیرد.
 */
import { motion, useDragControls, useIsPresent } from 'framer-motion'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { ErrorBoundary } from '../shared/ErrorBoundary'
import { Specular, useQualityTier } from '../shared/depth'
import { atLeast } from '../shared/quality'
import { playClick } from '../shared/sound'
import { useOS, type WindowState } from '../shared/store'
import { appByKey } from './appRegistry'

const MIN_W = 320
const MIN_H = 240

function useIsDesktop() {
  const [v, setV] = useState(() => window.innerWidth >= 900)
  useEffect(() => {
    const on = () => setV(window.innerWidth >= 900)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return v
}

export function AppWindow({ win }: { win: WindowState }) {
  const { t } = useTranslation()
  const isDesktop = useIsDesktop()
  const isPresent = useIsPresent()
  const closeApp = useOS((s) => s.closeApp)
  const focusApp = useOS((s) => s.focusApp)
  const minimizeApp = useOS((s) => s.minimizeApp)
  const saveGeometry = useOS((s) => s.saveWindowGeometry)
  const openApp = useOS((s) => s.openApp)
  const def = appByKey(win.app)
  const dragControls = useDragControls()
  const constraints = useRef<HTMLDivElement | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  /**
   * ⚠️ این هوک عمداً **بالای** هر دو ``return`` شرطیِ پایین صدا زده می‌شود.
   * اگر مثلِ نسخه‌ی نخستینِ این تغییر پایین و در شاخه‌ی دسکتاپ بود،
   * ``Rules of Hooks`` نقض می‌شد: با عوض‌شدنِ عرضِ پنجره از موبایل به
   * دسکتاپ (یا وقتی ``def`` تهی است) تعدادِ هوک‌ها بینِ دو رندر فرق می‌کرد
   * و ری‌اکت وضعیت را به هوکِ اشتباه نسبت می‌داد.
   */
  const qualityTier = useQualityTier()

  if (!def) return null
  const Comp = def.component

  /** جا‌به‌جایی دستی پنجره را به خاطر می‌سپاریم (بدون هیچ تغییری در لایه‌ها) */
  const rememberGeometry = () => {
    const el = box.current
    const wrap = constraints.current
    if (!el || !wrap) return
    const r = el.getBoundingClientRect()
    const wr = wrap.getBoundingClientRect()
    saveGeometry(win.id, {
      x: Math.max(0, Math.round(r.left - wr.left)),
      y: Math.max(0, Math.round(r.top - wr.top)),
      w: Math.round(r.width),
      h: Math.round(r.height),
    })
  }

  const header = (
    <div
      className="relative flex shrink-0 items-center gap-2 border-b px-4 py-3"
      style={{
        borderColor: 'var(--os-border)',
        // نوارِ عنوان یک «قطعه‌ی برجسته» است نه یک خطِ تخت: گرادیانِ عمودیِ
        // ملایم + سایه‌ی زیر، تا پنجره واقعاً یک جسمِ دو‌تکه (هدرِ صلب +
        // بدنه‌ی فرو‌رفته) به نظر برسد.
        //
        // عمداً از ``color-mix()`` استفاده **نشده**: پشتیبانی‌اش از Safari
        // 16.2 شروع می‌شود و یک iPhone سه‌ساله ممکن است هنوز iOS 15 داشته
        // باشد. یک لایه‌ی سفیدِ نیمه‌شفاف روی ``--os-card`` همان اثر را در
        // همه‌ی مرورگرها می‌دهد.
        background: 'linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,0) 58%), var(--os-card)',
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,.55), 0 2px 6px -3px rgba(90,40,80,.28)',
        paddingTop: isDesktop ? undefined : 'max(0.75rem, env(safe-area-inset-top))',
      }}
      onPointerDown={(e) => {
        if (!isDesktop) return
        // اگر روی دکمه/ورودی/لینک بزند، درگ شروع نمی‌شود تا کلیک سالم بماند
        if ((e.target as HTMLElement).closest('button, a, input, textarea, select, [role="button"]')) return
        dragControls.start(e)
      }}
    >
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ background: `${def.color}33`, color: def.color }}
      >
        <Icon name={def.icon} size={18} />
      </span>
      {/* عنوان اپ نقطه‌چین نمی‌شود؛ اگر بلند باشد به خط بعد می‌رود */}
      <h2 className="os-title min-w-0 flex-1 text-base leading-5 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden">
        {t(def.titleKey)}
      </h2>
      {/* جاروی نور روی نوارِ عنوان — همان «بازتابِ شیشه» که سطحِ صلب را
          از سطحِ تخت جدا می‌کند. در لایه‌ی مهتاب خودش display:none است. */}
      <Specular />
      {def.helpKey && (
        <button className="os-chip shrink-0" onClick={() => openApp('tutorial', { focus: def.helpKey })} title={t('os.help')}>
          {t('os.help')}
        </button>
      )}
      {isDesktop && (
        <button
          className="shrink-0 rounded-lg p-2 transition hover:bg-black/5 active:scale-90"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            playClick()
            minimizeApp(win.id, true)
          }}
          aria-label={t('os.minimize')}
          title={t('os.minimize')}
        >
          <Icon name="minus" size={16} />
        </button>
      )}
      <button
        className="shrink-0 rounded-lg p-2 transition hover:bg-black/5 active:scale-90"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => {
          playClick()
          closeApp(win.id)
        }}
        aria-label={t('os.close')}
        title={t('os.close')}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )

  const body = (
    <div className="flex-1 overflow-y-auto overscroll-contain p-4 pb-28 no-scrollbar md:pb-4">
      <ErrorBoundary title={t(def.titleKey)}>
        <Suspense fallback={<div className="py-16 text-center text-sm os-muted">{t('os.loading')}</div>}>
          <Comp {...(win.props || {})} />
        </Suspense>
      </ErrorBoundary>
    </div>
  )

  // ------------------------------------------------------------- موبایل ---
  if (!isDesktop) {
    return (
      <motion.div
        className="fixed inset-0 z-40 flex flex-col os-card !rounded-b-none"
        style={{ zIndex: 40 + win.z, display: win.minimized ? 'none' : 'flex' }}
        initial={{ y: '100%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.4 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onPointerDown={() => focusApp(win.id)}
      >
        {header}
        {body}
      </motion.div>
    )
  }

  // ------------------------------------------------------------- دسکتاپ ---
  /**
   * عمقِ پنجره.
   *
   * «بازشدنِ سه‌بعدی»: پنجره از ``rotateX(-11deg)`` و کمی عقب‌تر در Z شروع
   * می‌شود و مثلِ یک قطعه‌ی فیزیکی به جلو و سرِ جایش می‌نشیند. در لایه‌ی
   * مهتاب ``deep`` نادرست است و پنجره دقیقاً همان انیمیشنِ قبلی را دارد —
   * یعنی هیچ رفتارِ تازه‌ای به دستگاهِ ضعیف تحمیل نمی‌شود.
   *
   * ⚠️ ``transformPerspective`` را خودِ framer داخلِ transform می‌گذارد، پس
   * لازم نیست به والدِ پنجره ``perspective`` بدهم. این مهم است: والدِ
   * پنجره یک ``fixed inset-0`` است و اگر به آن perspective بدهم، رفتارِ
   * لایه‌بندیِ همه‌ی پنجره‌ها عوض می‌شود.
   */
  const deep = atLeast(qualityTier, 'balanced')

  /**
   * سایه‌ی جهت‌دار.
   *
   * چون منبعِ نورِ کلِ سیستم یکتاست (بالا-چپ)، پنجره‌ای که سمتِ راستِ صفحه
   * نشسته باید سایه‌اش سمتِ راست‌تر بیفتد. اگر سایه‌ی همه‌ی پنجره‌ها یکسان
   * باشد، مغز فضا را «نقاشی‌شده» می‌خواند نه «واقعی». این همان جزئیاتی است
   * که تفاوتِ بینِ «سه‌بعدی به نظر می‌رسد» و «سه‌بعدی است» را می‌سازد.
   *
   * هزینه‌اش صفر است: از ``win.x`` موجود حساب می‌شود، بدونِ هیچ listener.
   */
  const approxCenterX = (win.x ?? 24) + (win.w ? win.w / 2 : 380)
  const viewportCenter = typeof window !== 'undefined' ? window.innerWidth / 2 : 600
  const shadowX = Math.max(-26, Math.min(26, Math.round((approxCenterX - viewportCenter) * 0.045)))

  return (
    <div
      ref={constraints}
      className="fixed inset-0"
      style={{ zIndex: 30 + win.z, pointerEvents: 'none' }}
      aria-hidden={!isPresent}
    >
      <motion.div
        ref={box}
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={constraints}
        onDragEnd={rememberGeometry}
        className="pointer-events-auto absolute flex flex-col overflow-hidden os-card os-window-shadow"
        style={{
          pointerEvents: isPresent ? 'auto' : 'none',
          width: win.w ? `min(${win.w}px, 92vw)` : 'min(760px, 78vw)',
          height: win.h ? `min(${win.h}px, 86vh)` : 'min(620px, 76vh)',
          minWidth: MIN_W,
          minHeight: MIN_H,
          left: `${win.x ?? 24}px`,
          top: `${win.y ?? 18}px`,
          display: win.minimized ? 'none' : 'flex',
          // سایه‌ی جهت‌دار (توضیح بالا)
          ['--shadow-x' as string]: `${shadowX}px`,
        }}
        initial={deep ? { scale: 0.93, opacity: 0, y: 22, rotateX: -11, transformPerspective: 1300 } : { scale: 0.94, opacity: 0, y: 14 }}
        animate={deep ? { scale: 1, opacity: 1, y: 0, rotateX: 0, transformPerspective: 1300 } : { scale: 1, opacity: 1, y: 0 }}
        exit={deep ? { scale: 0.95, opacity: 0, rotateX: -6, transformPerspective: 1300 } : { scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onPointerDown={() => focusApp(win.id)}
      >
        {header}
        {body}
      </motion.div>
    </div>
  )
}
