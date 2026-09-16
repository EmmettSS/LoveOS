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
      className="flex shrink-0 items-center gap-2 border-b px-4 py-3"
      style={{
        borderColor: 'var(--os-border)',
        background: 'var(--os-card)',
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
    <div
      className={
        def.immersive
          ? 'relative flex-1 overflow-hidden overscroll-none p-0 pb-24 md:pb-0'
          : 'flex-1 overflow-y-auto overscroll-contain p-4 pb-28 no-scrollbar md:pb-4'
      }
    >
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
        className="pointer-events-auto absolute flex flex-col overflow-hidden os-card"
        style={{
          pointerEvents: isPresent ? 'auto' : 'none',
          width: win.w ? `min(${win.w}px, 92vw)` : 'min(760px, 78vw)',
          height: win.h ? `min(${win.h}px, 86vh)` : 'min(620px, 76vh)',
          minWidth: MIN_W,
          minHeight: MIN_H,
          left: `${win.x ?? 24}px`,
          top: `${win.y ?? 18}px`,
          display: win.minimized ? 'none' : 'flex',
        }}
        initial={{ scale: 0.94, opacity: 0, y: 14 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onPointerDown={() => focusApp(win.id)}
      >
        {header}
        {body}
      </motion.div>
    </div>
  )
}
