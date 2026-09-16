/**
 * NotificationCenter.tsx — مرکز اعلان
 * اعلان‌های سیستم + یادآورهای مهربان (که آیکن دسکتاپ ندارند و فقط اینجا دیده می‌شوند).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { formatDate, formatTime } from '../shared/format'
import { playClick } from '../shared/sound'
import { useOS } from '../shared/store'
import { useDepthFactor } from '../shared/depth'

interface Notif {
  id: number
  kind: string
  title: string
  text: string
  icon: string
  action_app: string
  is_read: boolean
  created_at: string
  payload: Record<string, unknown>
}

interface Rem {
  id: number
  type: string
  title: string
  text: string
  when: string | null
  muted: boolean
}

const KIND_ICON: Record<string, Parameters<typeof Icon>[0]['name']> = {
  achievement: 'achievements',
  reminder: 'bell',
  hug: 'hug',
  letter: 'whisper',
  voice: 'voice',
  music: 'music',
  chat: 'chat',
  med: 'pill',
  memory: 'memories',
  system: 'about',
}

export function NotificationCenter() {
  const { t } = useTranslation()
  const dz = useDepthFactor()
  const open = useOS((s) => s.notificationsOpen)
  const toggle = useOS((s) => s.toggleNotifications)
  const setUnread = useOS((s) => s.setUnread)
  const openApp = useOS((s) => s.openApp)

  const [items, setItems] = useState<Notif[]>([])
  const [reminders, setReminders] = useState<Rem[]>([])
  const [tab, setTab] = useState<'all' | 'reminders'>('all')

  const load = useCallback(async () => {
    try {
      const res = await get<{ unread: number; items: Notif[] }>('/notifications')
      setItems(res.items)
      setUnread(res.unread)
      const rem = await get<{ items: Rem[] }>('/reminders')
      setReminders(rem.items)
    } catch {
      /* ignore */
    }
  }, [setUnread])

  // نظرسنجی سبک هر ۴۵ ثانیه
  useEffect(() => {
    void load()
    const id = setInterval(() => void load(), 45_000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const markRead = async (n: Notif) => {
    if (!n.is_read) {
      await post(`/notifications/${n.id}/read`)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      setUnread(Math.max(0, items.filter((x) => !x.is_read).length - 1))
    }
    if (n.action_app) {
      openApp(n.action_app)
      toggle(false)
    }
  }

  const readAll = async () => {
    await post('/notifications/read-all')
    setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
    setUnread(0)
  }

  const toggleMute = async (r: Rem) => {
    const res = await post<{ muted: boolean }>(`/reminders/${r.id}/mute`)
    setReminders((prev) => prev.map((x) => (x.id === r.id ? { ...x, muted: res.muted } : x)))
  }

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
          <motion.div
            // کشویِ اعلان‌ها مثلِ یک کشویِ واقعی باز می‌شود: کمی از بالا
            // به سمتِ بیننده برمی‌گردد و بعد سرِ جایش می‌نشیند.
            initial={{ y: 40, opacity: 0, rotateX: -7 * dz }}
            animate={{ y: 0, opacity: 1, rotateX: 0 }}
            exit={{ y: 30, opacity: 0, rotateX: -5 * dz }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="os-card fixed inset-x-3 bottom-24 z-50 flex max-h-[68vh] flex-col overflow-hidden md:inset-x-auto md:end-6 md:w-[420px]"
            // ⚠️ این عنصر ``overflow-hidden`` دارد. این‌جا امن است چون
            //    چرخش روی **خودِ** همین عنصر است و هیچ فرزندی
            //    preserve-3d نمی‌گیرد. تله‌ی R-C وقتی عمل می‌کند که ظرفِ
            //    بریده **جدِ** یک فضایِ preserve-3d باشد.
            style={{ transformPerspective: 1100 }}
          >
            <div className="flex items-center gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--os-border)' }}>
              <Icon name="bell" size={18} />
              <h3 className="os-title flex-1 text-base">{t('notifications.title')}</h3>
              <button className="os-chip" onClick={() => { playClick(); void readAll() }}>
                {t('notifications.readAll')}
              </button>
            </div>

            <div className="flex gap-2 px-4 pt-3">
              <button className={`os-chip ${tab === 'all' ? 'os-chip-active' : ''}`} onClick={() => setTab('all')}>
                {t('notifications.tabAll')}
              </button>
              <button
                className={`os-chip ${tab === 'reminders' ? 'os-chip-active' : ''}`}
                onClick={() => setTab('reminders')}
              >
                {t('notifications.tabReminders')}
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4 no-scrollbar">
              {tab === 'all' &&
                (items.length === 0 ? (
                  <p className="py-10 text-center text-sm os-muted">{t('notifications.empty')}</p>
                ) : (
                  items.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => void markRead(n)}
                      className="flex w-full items-start gap-3 rounded-2xl p-3 text-start transition hover:bg-black/5"
                      style={{ background: n.is_read ? 'transparent' : 'var(--os-accent-soft)' }}
                    >
                      <span
                        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                        style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}
                      >
                        <Icon name={KIND_ICON[n.kind] || 'heart'} size={17} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{n.title}</span>
                        <span className="mt-0.5 block text-xs leading-5 os-muted">{n.text}</span>
                        <span className="mt-1 block text-[10px] os-muted">
                          {formatDate(n.created_at)} • {formatTime(new Date(n.created_at))}
                        </span>
                      </span>
                      {!n.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full" style={{ background: 'var(--os-accent)' }} />}
                    </button>
                  ))
                ))}

              {tab === 'reminders' &&
                (reminders.length === 0 ? (
                  <p className="py-10 text-center text-sm os-muted">{t('notifications.noReminders')}</p>
                ) : (
                  reminders.map((r) => (
                    <div key={r.id} className="rounded-2xl p-3" style={{ background: 'var(--os-accent-soft)' }}>
                      <div className="flex items-start gap-2">
                        <Icon name="heart" size={16} style={{ color: 'var(--os-accent)' }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">{r.title}</p>
                          <p className="mt-0.5 text-xs leading-6 os-muted">{r.text}</p>
                        </div>
                      </div>
                      <button className="os-chip mt-2" onClick={() => void toggleMute(r)}>
                        {r.muted ? t('notifications.unmute') : t('notifications.mute')}
                      </button>
                    </div>
                  ))
                ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
