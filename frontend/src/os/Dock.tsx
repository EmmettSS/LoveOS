/**
 * Dock.tsx — نوار پایین: منوی شروع، اپ‌های باز، اعلان‌ها، تنظیمات، خروج
 */
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'

import { Icon, LoveOSLogo } from '../shared/Icon'
import { digits } from '../shared/format'
import { playClick } from '../shared/sound'
import { useOS } from '../shared/store'
import { appByKey } from './appRegistry'

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

  return (
    <motion.div
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 26 }}
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-3"
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className="os-card flex max-w-full items-center gap-1.5 overflow-x-auto px-2.5 py-2 no-scrollbar">
        <button
          onClick={() => { playClick(); toggleStartMenu() }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
          aria-label={t('desktop.startMenu')}
          title={t('desktop.startMenu')}
        >
          {/* خودِ نشان جای آیکنِ «منو» نشسته: نمادِ هدیه در همه‌ی صفحه‌ها دیده می‌شود */}
          <LoveOSLogo size={38} />
        </button>

        <button
          onClick={() => { playClick(); toggleCommand(true) }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
          style={{ background: 'linear-gradient(135deg,#f0abfc33,#7dd3fc33)', color: '#7dd3fc' }}
          aria-label={t('search.title')}
          title={t('search.title')}
        >
          <Icon name="findheart" size={20} />
        </button>

        {windows.length > 0 && <span className="h-7 w-px shrink-0" style={{ background: 'var(--os-border)' }} />}

        {windows.map((w) => {
          const def = appByKey(w.app)
          if (!def) return null
          return (
            <button
              key={w.id}
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
          )
        })}

        <span className="h-7 w-px shrink-0" style={{ background: 'var(--os-border)' }} />

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

        <button
          onClick={() => { playClick(); openApp('settings') }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
          aria-label={t('desktop.settings')}
        >
          <Icon name="settings" size={20} />
        </button>

        <button
          onClick={() => void logout()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition active:scale-90"
          aria-label={t('desktop.logout')}
        >
          <Icon name="logout" size={20} />
        </button>
      </div>
    </motion.div>
  )
}
