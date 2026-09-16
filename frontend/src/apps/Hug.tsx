/**
 * Hug — بغل
 * دو طرفه: دخترم بابا را بغل می‌کند (لرزش + پیام سروش) و بغل‌های بابا را
 * باز می‌کند. افکت‌ها: قلب‌های شناور محیطی، انفجار قلب هنگام ارسال،
 * «فشرده شدن» بزرگ هنگام باز کردن بغل، هاله‌ی گرم و بارش عشق.
 * راز ⑫: سه بار بغل پشت‌سرهم.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post } from '../shared/api'
import { digits } from '../shared/format'
import { playHeartbeat, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, useApi } from '../shared/ui'

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

/* -------------------------------------------- قلب‌های شناور محیطی ---- */
function AmbientHearts() {
  const hearts = useMemo(
    () =>
      Array.from({ length: 9 }).map((_, i) => ({
        id: i,
        left: 6 + ((i * 31) % 88),
        delay: (i * 1.1) % 8,
        dur: 7 + (i % 4) * 2,
        size: 10 + (i % 3) * 6,
        emoji: i % 3 === 0 ? '💗' : i % 3 === 1 ? '🤍' : '💕',
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {hearts.map((h) => (
        <span
          key={h.id}
          className="absolute opacity-60"
          style={{
            left: `${h.left}%`,
            bottom: -30,
            fontSize: h.size,
            animation: `loveos-heart-rise ${h.dur}s linear ${h.delay}s infinite`,
          }}
        >
          {h.emoji}
        </span>
      ))}
    </div>
  )
}

/* ---------------------------------------------- انفجار هنگام ارسال ---- */
function HugBurst({ seed }: { seed: number }) {
  const parts = useMemo(
    () =>
      Array.from({ length: 18 }).map((_, i) => {
        const angle = (i / 18) * Math.PI * 2 + (seed % 5) * 0.4
        const dist = 70 + ((seed + i * 17) % 70)
        return {
          id: i,
          x: Math.cos(angle) * dist,
          y: Math.sin(angle) * dist,
          emoji: ['❤', '💖', '✨', '💫', '💕'][i % 5],
          size: 12 + ((seed + i) % 4) * 5,
        }
      }),
    [seed],
  )
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
      {parts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute"
          style={{ fontSize: p.size }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.3 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1.2, rotate: 200 }}
          transition={{ duration: 1.1, ease: 'easeOut' }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </div>
  )
}

/* ------------------------------------------ بارش هنگام باز شدن بغل ---- */
function HugRain() {
  const parts = useMemo(
    () =>
      Array.from({ length: 16 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.4,
        dur: 1.8 + Math.random() * 1.6,
        emoji: ['💖', '❤️', '✨', '🌸'][i % 4],
        size: 14 + Math.random() * 12,
      })),
    [],
  )
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {parts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute"
          style={{ left: `${p.left}%`, top: -30, fontSize: p.size }}
          initial={{ y: -30, opacity: 0 }}
          animate={{ y: '105vh', opacity: [0, 1, 0.5], rotate: 320 }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'linear' }}
        >
          {p.emoji}
        </motion.span>
      ))}
    </div>
  )
}

export default function Hug() {
  const { t } = useTranslation()
  const showEgg = useOS((s) => s.showEgg)
  const showToast = useOS((s) => s.showToast)
  const { data, loading, error, reload } = useApi<HugState>('/hug')
  const [warm, setWarm] = useState(false)
  const [burst, setBurst] = useState(0)
  const [hugOpen, setHugOpen] = useState(false) // حالت «فشرده شدن» بزرگ
  const [incoming, setIncoming] = useState<{ id: number; text: string } | null>(null)
  const [opened, setOpened] = useState<string | null>(null)
  const warmTimer = useRef<number | null>(null)

  // اگر بابا بغلی فرستاده که هنوز دیده نشده، همان اول نشانش بده
  useEffect(() => {
    const pending = data?.pending || []
    if (pending.length) setIncoming(pending[0])
  }, [data])

  useEffect(() => {
    return () => {
      if (warmTimer.current) window.clearTimeout(warmTimer.current)
    }
  }, [])

  const flashWarm = (ms: number) => {
    setWarm(true)
    if (warmTimer.current) window.clearTimeout(warmTimer.current)
    warmTimer.current = window.setTimeout(() => setWarm(false), ms)
  }

  /** دخترم → بابا : لرزش + انفجار قلب */
  const sendHug = async () => {
    const res = await post<{ vibration_pattern: number[]; warm_color: string; sent_total: number; egg?: { title: string; message: string } | null }>('/hug/send')
    vibrate(res.vibration_pattern?.length ? res.vibration_pattern : [200, 100, 100, 100, 100, 100, 200])
    playHeartbeat(2)
    flashWarm(2400)
    setBurst((b) => b + 1)
    showToast(t('hug.sentToast'), 'love')
    if (res.egg) showEgg({ title: res.egg.title, message: res.egg.message })
    await reload()
  }

  /** بابا → دخترم : باز کردن بغل با «فشرده شدن» بزرگ + بارش */
  const openHug = async (id: number) => {
    const res = await post<{ message: string; vibration_pattern: number[]; warm_color: string; heartbeat_sound: string | null }>(`/hug/${id}/open`)
    vibrate(res.vibration_pattern?.length ? res.vibration_pattern : [200, 100, 100, 100, 100, 100, 200])
    if (res.heartbeat_sound) {
      const a = new Audio(res.heartbeat_sound)
      void a.play().catch(() => undefined)
    } else {
      playHeartbeat(3)
    }
    setHugOpen(true)
    flashWarm(3400)
    setOpened(res.message)
    setIncoming(null)
    setTimeout(() => setHugOpen(false), 3200)
    await reload()
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} onRetry={() => void reload()} />
  if (!data) return <ApiStatus loading={false} error="empty" />
  // پاسخ ناقص (مثلاً هنگام deploy یا نسخه‌ی قدیمی API) نباید کل پنجره را crash کند.
  const settings = data.settings || {
    incoming_title: t('hug.incoming'),
    incoming_message: t('hug.incoming'),
    vibration_pattern: [],
    warm_color: '#ffd6a5',
    heartbeat_sound: null,
  }
  const received = Number.isFinite(data.received) ? data.received : 0
  const sent = Number.isFinite(data.sent) ? data.sent : 0
  const warmColor = settings.warm_color || '#ffd6a5'

  return (
    <div className="relative flex flex-col items-center gap-5 overflow-hidden py-4">
      <AmbientHearts />

      {/* هاله‌ی گرم هنگام بغل */}
      <AnimatePresence>
        {warm && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[70]"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0.4, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 3 }}
            style={{ background: `radial-gradient(70% 60% at 50% 50%, ${warmColor}cc, transparent 70%)` }}
          />
        )}
      </AnimatePresence>

      {/* انفجار قلب‌ها هنگام ارسال */}
      {burst > 0 && <HugBurst key={burst} seed={burst} />}

      {/* بارش عشق هنگام باز شدن بغل */}
      {hugOpen && <HugRain />}

      {/* «فشرده شدن» بزرگ: قلبی که بغل می‌شود */}
      <AnimatePresence>
        {hugOpen && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[69] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.span
              className="text-[120px]"
              initial={{ scale: 2.6, opacity: 0 }}
              animate={{ scale: [2.6, 0.85, 1.15, 1], opacity: 1 }}
              transition={{ duration: 1.6, times: [0, 0.4, 0.7, 1], ease: 'easeInOut' }}
            >
              🤗
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* بغل دریافتی از بابا */}
      <AnimatePresence>
        {incoming && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="os-card relative w-full overflow-hidden p-4 text-center"
            style={{ borderColor: warmColor, background: `${warmColor}22` }}
          >
            <motion.span
              className="absolute -top-3 -end-3 text-5xl opacity-40"
              animate={{ rotate: [0, 14, -10, 0], scale: [1, 1.15, 1] }}
              transition={{ duration: 2.2, repeat: Infinity }}
            >
              🎀
            </motion.span>
            <p className="os-title text-base">{settings.incoming_title}</p>
            <p className="mt-1 text-sm">{incoming.text}</p>
            <button className="os-btn-primary mt-3 w-full" onClick={() => void openHug(incoming.id)}>
              {t('hug.openHug')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {opened && !incoming && (
        <motion.p
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="os-card w-full p-4 text-center text-sm leading-7"
        >
          {opened}
        </motion.p>
      )}

      {/* دکمه‌ی بغل کردن بابا — با حلقه‌ی درخشان و نبض */}
      <motion.button
        whileTap={{ scale: 0.88 }}
        animate={{ scale: [1, 1.05, 1] }}
        transition={{ duration: 2.4, repeat: Infinity }}
        onClick={() => void sendHug()}
        className="relative flex h-44 w-44 items-center justify-center rounded-full text-white"
        style={{
          background: 'radial-gradient(circle at 40% 30%, #ffb3d4, #f767a8 65%, #d6467f)',
          boxShadow: `0 20px 50px -18px ${warmColor}, 0 0 0 6px ${warmColor}33`,
        }}
      >
        {/* حلقه‌ی موجی دور دکمه */}
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{ border: `2px solid ${warmColor}` }}
          animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
        />
        <motion.span
          className="absolute inset-[-10px] rounded-full"
          style={{ border: `1.5px dashed ${warmColor}88` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
        />
        <motion.span
          className="relative"
          animate={{ scale: [1, 1.12, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          <Icon name="hug" size={72} />
        </motion.span>
      </motion.button>
      <p className="os-title text-base">{t('hug.hugDaddy')}</p>
      <p className="-mt-3 text-xs os-muted">{t('hug.squeeze')}</p>

      <div className="grid w-full grid-cols-2 gap-3">
        <div className="os-card p-3 text-center">
          <p className="os-title text-2xl" style={{ color: 'var(--os-accent)' }}>{digits(received)}</p>
          <p className="text-[11px] os-muted">{t('hug.received', { count: digits(received) })}</p>
        </div>
        <div className="os-card p-3 text-center">
          <p className="os-title text-2xl" style={{ color: 'var(--os-accent)' }}>{digits(sent)}</p>
          <p className="text-[11px] os-muted">{t('hug.sent', { count: digits(sent) })}</p>
        </div>
      </div>
    </div>
  )
}
