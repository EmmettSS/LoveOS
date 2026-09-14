/**
 * Hug — بغل
 * دو طرفه: دخترم بابا را بغل می‌کند (لرزش + پیام سروش) و بغل‌های بابا را باز می‌کند
 * (لرزش با الگوی پنل + رنگ گرم + صدای ضربان). راز ⑫: سه بار بغل پشت‌سرهم.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post } from '../shared/api'
import { digits } from '../shared/format'
import { playHeartbeat, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'
import { Loading, useApi } from '../shared/ui'

interface HugState {
  received: number
  sent: number
  pending: { id: number; text: string }[]
  settings: {
    incoming_title: string
    incoming_message: string
    vibration_pattern: number[]
    warm_color: string
    heartbeat_sound: string | null
  }
}

export default function Hug() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const showToast = useOS((s) => s.showToast)
  const { data, loading, reload } = useApi<HugState>('/hug')
  const [warm, setWarm] = useState(false)
  const [incoming, setIncoming] = useState<{ id: number; text: string } | null>(null)
  const [opened, setOpened] = useState<string | null>(null)

  // اگر بابا بغلی فرستاده که هنوز دیده نشده، همان اول نشانش بده
  useEffect(() => {
    if (data?.pending.length) setIncoming(data.pending[0])
  }, [data])

  /** دخترم → بابا : لرزش در همین اپ هم اجرا می‌شود */
  const sendHug = async () => {
    const res = await post<{ vibration_pattern: number[]; warm_color: string; sent_total: number; egg?: { title: string; message: string } | null }>('/hug/send')
    vibrate(res.vibration_pattern?.length ? res.vibration_pattern : [200, 100, 100, 100, 100, 100, 200])
    playHeartbeat(2)
    setWarm(true)
    setTimeout(() => setWarm(false), 2400)
    showToast(t('hug.sentToast'), 'love')
    if (res.egg) showEgg({ title: res.egg.title, message: res.egg.message })
    await reload()
  }

  /** بابا → دخترم : باز کردن بغل با لرزش و رنگ گرم */
  const openHug = async (id: number) => {
    const res = await post<{ message: string; vibration_pattern: number[]; warm_color: string; heartbeat_sound: string | null }>(`/hug/${id}/open`)
    vibrate(res.vibration_pattern?.length ? res.vibration_pattern : [200, 100, 100, 100, 100, 100, 200])
    if (res.heartbeat_sound) {
      const a = new Audio(res.heartbeat_sound)
      void a.play().catch(() => undefined)
    } else {
      playHeartbeat(3)
    }
    setWarm(true)
    setOpened(res.message)
    setIncoming(null)
    setTimeout(() => setWarm(false), 3200)
    await reload()
  }

  if (loading || !data) return <Loading />
  const warmColor = data.settings.warm_color || '#ffd6a5'

  return (
    <div className="relative flex flex-col items-center gap-5 py-4">
      {/* هاله‌ی گرم هنگام بغل */}
      <AnimatePresence>
        {warm && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.65, 0.4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3 }}
            style={{ background: `radial-gradient(70% 60% at 50% 50%, ${warmColor}cc, transparent 70%)` }}
          />
        )}
      </AnimatePresence>

      {/* بغل دریافتی از بابا */}
      <AnimatePresence>
        {incoming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="os-card w-full p-4 text-center"
            style={{ borderColor: warmColor, background: `${warmColor}22` }}
          >
            <p className="os-title text-base">{data.settings.incoming_title}</p>
            <p className="mt-1 text-sm">{incoming.text}</p>
            <button className="os-btn-primary mt-3 w-full" onClick={() => void openHug(incoming.id)}>
              {t('hug.openHug')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {opened && !incoming && (
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="os-card w-full p-4 text-center text-sm leading-7">
          {opened}
        </motion.p>
      )}

      {/* دکمه‌ی بغل کردن بابا */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        onClick={() => void sendHug()}
        className="relative flex h-44 w-44 items-center justify-center rounded-full text-white"
        style={{ background: 'radial-gradient(circle at 40% 30%, #ffb3d4, #f767a8 65%, #d6467f)', boxShadow: `0 20px 50px -18px ${warmColor}` }}
      >
        <Icon name="hug" size={72} />
      </motion.button>
      <p className="os-title text-base">{t('hug.hugDaddy')}</p>
      <p className="-mt-3 text-xs os-muted">{t('hug.squeeze')}</p>

      <div className="grid w-full grid-cols-2 gap-3">
        <div className="os-card p-3 text-center">
          <p className="os-title text-2xl" style={{ color: 'var(--os-accent)' }}>{digits(data.received)}</p>
          <p className="text-[11px] os-muted">{t('hug.received', { count: digits(data.received) })}</p>
        </div>
        <div className="os-card p-3 text-center">
          <p className="os-title text-2xl" style={{ color: 'var(--os-accent)' }}>{digits(data.sent)}</p>
          <p className="text-[11px] os-muted">{t('hug.sent', { count: digits(data.sent) })}</p>
        </div>
      </div>
    </div>
  )
}
