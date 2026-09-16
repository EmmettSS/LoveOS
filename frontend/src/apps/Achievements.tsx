/**
 * Achievements — نشان‌های دخترم
 * نشان‌های باز شده رنگی‌اند و پیام مخفی بابا را نشان می‌دهند.
 */
import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useMotionAllowed, useQualityTier } from '../shared/depth'
import { digits, formatDate } from '../shared/format'
import { ApiStatus, Empty, useApi } from '../shared/ui'

interface A {
  id: number
  code: string
  title: string
  description: string
  icon: string
  unlocked: boolean
  unlocked_at: string | null
  secret_message: string
}

const EMOJI: Record<string, string> = {
  door: '🚪', mic: '🎙️', calendar: '📅', brain: '🧠', letter: '💌', puzzle: '🧩',
  trophy: '🏆', bunny: '🐰', heart: '💗', pill: '💊', spa: '🧖‍♀️', pen: '✍️',
  book: '📖', key: '🔑', crown: '👑', star: '⭐',
}

export default function Achievements() {
  const { t } = useTranslation()
  // ⚠️ بالایِ دو ``return`` زودهنگامِ پایین (loading/error و فهرستِ خالی)
  const tier = useQualityTier()
  const allowed = useMotionAllowed()
  const deep = allowed && tier !== 'lite'
  const dz = deep ? 1 : 0
  const { data, loading, error } = useApi<{ items: A[]; unlocked: number; total: number }>('/achievements')
  const [open, setOpen] = useState<number | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)

  const toggle = (id: number) => {
    const next = open === id ? null : id
    setOpen(next)
    if (next !== null) {
      // کارت پیام پایین گرید است؛ بعد از سوار شدنش به‌آرامی اسکرول می‌کنیم تا دیده شود
      window.setTimeout(() => {
        detailRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
      }, 120)
    }
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  return (
    <div className="space-y-3">
      <div className="os-card os-slab p-3 text-center">
        <p className="os-title text-lg" style={{ color: 'var(--os-accent)' }}>
          {t('achievements.unlocked', { count: digits(data!.unlocked), total: digits(data!.total) })}
        </p>
        {/* نوارِ پیشرفت «گود» است تا پرشدنش حسِ جسم داشته باشد */}
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--well-face)', boxShadow: 'var(--well-inner)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg,#ff9ecb,#bba0fb)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.55)' }}
            initial={{ width: 0 }}
            animate={{ width: `${(data!.unlocked / Math.max(1, data!.total)) * 100}%` }}
          />
        </div>
      </div>

      <div className="os-stage-3d grid grid-cols-3 gap-3 sm:grid-cols-4">
        {items.map((a, i) => (
          <motion.button
            key={a.id}
            initial={{ opacity: 0, scale: 0.86, rotateX: 20 * dz, z: -50 * dz }}
            animate={{ opacity: 1, scale: 1, rotateX: 0, z: 0 }}
            transition={{ delay: i * 0.03, type: 'spring', stiffness: 220, damping: 21 }}
            onClick={() => toggle(a.id)}
            className="os-card flex flex-col items-center gap-1 p-3"
            style={{ opacity: a.unlocked ? 1 : 0.45, borderColor: a.unlocked ? 'var(--os-accent)' : undefined }}
          >
            {/* مدال: یک قرصِ فلزیِ ثابت + خودِ ایموجی که با مکان‌نما کج
                می‌شود. زاویه و پرسپکتیو در CSS است (``.os-tilt-medal``) و
                listenerش **سراسری** است، پس ۱۶ مدال = صفر listenerِ اضافه.
                تیلت فقط روی ایموجی است نه روی عنوانِ زیرش — متن کج
                نمی‌شود. */}
            <span className="relative grid place-items-center" style={{ width: 46, height: 46 }}>
              {/* قرصِ مدال در لایه‌ی مهتاب هم **دیده می‌شود** — مهتاب یعنی
                  «عمقِ نقاشی‌شده: سایه، پخ، گرادیان» و یک قرصِ فلزیِ گرادیانی
                  دقیقاً همان است. چیزی که در مهتاب حذف می‌شود فقط چرخشش
                  است (``--q3d`` صفر → transform همانی). */}
              <span
                className={`os-medal absolute inset-0 ${a.unlocked ? '' : 'os-medal-locked'}`}
                aria-hidden
              />
              <span className={`os-tilt-medal relative text-3xl ${a.unlocked ? '' : 'grayscale'}`}>{EMOJI[a.icon] || '🏅'}</span>
            </span>
            <span className="text-center text-[11px] leading-4">{a.title}</span>
          </motion.button>
        ))}
      </div>

      {open !== null && (() => {
        const a = items.find((x) => x.id === open)!
        return (
          <motion.div
            ref={detailRef}
            initial={{ opacity: 0, y: 8, rotateX: -8 * dz }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            style={{ transformPerspective: 1000 }}
            className="os-card p-4"
          >
            <p className="os-title text-base">{EMOJI[a.icon] || '🏅'} {a.title}</p>
            <p className="mt-1 text-sm os-muted">{a.description}</p>
            {a.unlocked ? (
              <>
                {a.unlocked_at && <p className="mt-1 text-[11px] os-muted">{formatDate(a.unlocked_at)}</p>}
                {a.secret_message && (
                  <p className="mt-2 rounded-2xl p-3 text-sm leading-7" style={{ background: 'var(--os-accent-soft)' }}>
                    {a.secret_message}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 text-sm os-muted">{t('achievements.locked')}</p>
            )}
          </motion.div>
        )
      })()}
    </div>
  )
}
