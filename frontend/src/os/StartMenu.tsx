/**
 * StartMenu.tsx — منوی همه‌ی اپ‌ها با جست‌وجو
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { playOpen } from '../shared/sound'
import { useOS } from '../shared/store'
import { APPS } from './appRegistry'

export function StartMenu() {
  const { t } = useTranslation()
  const open = useOS((s) => s.startMenuOpen)
  const toggle = useOS((s) => s.toggleStartMenu)
  const openApp = useOS((s) => s.openApp)
  const toggleCommand = useOS((s) => s.toggleCommand)
  const [q, setQ] = useState('')

  const items = useMemo(() => {
    const list = APPS.filter((a) => a.desktop || a.key === 'about')
    if (!q.trim()) return list
    return list.filter((a) => t(a.titleKey).toLowerCase().includes(q.trim().toLowerCase()))
  }, [q, t])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => toggle(false)}
          />
          <motion.button
            onClick={() => { playOpen(); toggle(false); toggleCommand(true) }}
            className="fixed inset-x-3 bottom-[8.6rem] z-50 mx-auto flex max-w-[620px] items-center gap-2 rounded-2xl px-3 py-2.5 text-start text-xs shadow-soft transition active:scale-[0.99]"
            style={{ background: 'var(--os-card, rgba(255,255,255,.9))', color: 'var(--os-muted)' }}
          >
            <Icon name="findheart" size={15} />
            <span className="flex-1">{t('search.title')}</span>
            <kbd className="rounded-md px-1.5 py-0.5 text-[10px]" style={{ background: 'var(--os-border)' }}>
              Ctrl/⌘ K
            </kbd>
          </motion.button>
          {/* پوسته‌ی تمام‌عرضِ وسط‌چین: وسط‌چینی با translate روی خودِ motion
              خراب می‌شد (ترنسفورمِ inline موشن جای کلاس می‌نشیند و در RTL پنل
              نصفه از صفحه بیرون می‌زد)؛ پس کارت واقعی یک لایه تودرتوست. */}
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center"
          >
            <div className="os-card pointer-events-auto mx-3 max-h-[65vh] w-full max-w-[620px] overflow-hidden p-4">
            <div className="mb-3 flex items-center gap-2">
              <Icon name="search" size={18} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('os.search')}
                className="os-input !border-0 !bg-transparent !px-1 !py-1"
                autoFocus
              />
            </div>
            <div className="grid max-h-[46vh] grid-cols-4 gap-3 overflow-y-auto pb-2 no-scrollbar sm:grid-cols-5 md:grid-cols-6">
              {items.map((app) => (
                <button
                  key={app.key}
                  onClick={() => { playOpen(); openApp(app.key) }}
                  className="flex flex-col items-center gap-1.5 rounded-2xl p-2 transition hover:bg-black/5 active:scale-95"
                >
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-2xl"
                    style={{ background: `${app.color}33`, color: app.color }}
                  >
                    <Icon name={app.icon} size={22} />
                  </span>
                  <span
                className="max-w-[86px] text-center text-[11px] leading-4 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden"
                title={t(app.titleKey)}
              >
                {t(app.titleKey)}
              </span>
                </button>
              ))}
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
