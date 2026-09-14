/**
 * Window.tsx — مدیریت پنجره
 * موبایل: شیت تمام‌صفحه با انیمیشن نرم | دسکتاپ: پنجره‌ی شناور و قابل جابجایی
 */
import { motion, useDragControls } from 'framer-motion'
import { Suspense, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { playClick } from '../shared/sound'
import { useOS, type WindowState } from '../shared/store'
import { appByKey } from './appRegistry'

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
  const closeApp = useOS((s) => s.closeApp)
  const focusApp = useOS((s) => s.focusApp)
  const minimizeApp = useOS((s) => s.minimizeApp)
  const openApp = useOS((s) => s.openApp)
  const def = appByKey(win.app)
  const dragControls = useDragControls()
  const constraints = useRef<HTMLDivElement | null>(null)

  if (!def) return null
  const Comp = def.component

  const header = (
    <div
      className="flex items-center gap-2 border-b px-4 py-3"
      style={{ borderColor: 'var(--os-border)' }}
      onPointerDown={(e) => {
        if (isDesktop) dragControls.start(e)
      }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-xl"
        style={{ background: `${def.color}33`, color: def.color }}
      >
        <Icon name={def.icon} size={18} />
      </span>
      <h2 className="os-title flex-1 text-base">{t(def.titleKey)}</h2>
      {def.helpKey && (
        <button
          className="os-chip"
          onClick={() => openApp('tutorial', { focus: def.helpKey })}
          title={t('os.help')}
        >
          {t('os.help')}
        </button>
      )}
      {isDesktop && (
        <button
          className="rounded-lg p-1.5 transition hover:bg-black/5"
          onClick={() => minimizeApp(win.id, true)}
          aria-label="minimize"
        >
          <Icon name="minus" size={16} />
        </button>
      )}
      <button
        className="rounded-lg p-1.5 transition hover:bg-black/5"
        onClick={() => { playClick(); closeApp(win.id) }}
        aria-label={t('os.close')}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  )

  const body = (
    <div className="flex-1 overflow-y-auto overscroll-contain p-4 no-scrollbar">
      <Suspense fallback={<div className="py-16 text-center text-sm os-muted">{t('os.loading')}</div>}>
        <Comp {...(win.props || {})} />
      </Suspense>
    </div>
  )

  if (!isDesktop) {
    return (
      <motion.div
        className="fixed inset-x-0 bottom-0 top-0 z-40 flex flex-col os-card !rounded-b-none"
        style={{ zIndex: 40 + win.z, display: win.minimized ? 'none' : 'flex' }}
        initial={{ y: '100%', opacity: 0.6 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0.4 }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        onPointerDown={() => focusApp(win.id)}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full" style={{ background: 'var(--os-border)' }} />
        {header}
        {body}
      </motion.div>
    )
  }

  return (
    <div ref={constraints} className="pointer-events-none fixed inset-0 z-30">
      <motion.div
        drag
        dragControls={dragControls}
        dragListener={false}
        dragMomentum={false}
        dragConstraints={constraints}
        className="pointer-events-auto absolute flex flex-col overflow-hidden os-card"
        style={{
          zIndex: 30 + win.z,
          width: 'min(760px, 78vw)',
          height: 'min(620px, 76vh)',
          left: `calc(12% + ${(win.z % 5) * 26}px)`,
          top: `calc(8% + ${(win.z % 5) * 22}px)`,
          display: win.minimized ? 'none' : 'flex',
        }}
        initial={{ scale: 0.92, opacity: 0, y: 18 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        onPointerDown={() => focusApp(win.id)}
      >
        {header}
        {body}
      </motion.div>
    </div>
  )
}
