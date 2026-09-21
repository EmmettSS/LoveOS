/**
 * Mood — حال دلم
 *
 *   • حال‌های آماده (بابا از پنل پیام و ویس گذاشته) + حال‌هایی که خودِ دخترم
 *     ساخته است.
 *   • «حال تازه» : ایموجی + اسمِ حال + یادداشت → همان لحظه ثبت می‌شود، در
 *     فهرست می‌ماند و برای بابا (پنل + سروش) خبر می‌رود.
 *   • هر خطا (شبکه/سرور) به پیامِ روشن تبدیل می‌شود؛ هیچ لمسِ بی‌واکنشی
 *     نمی‌ماند.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post } from '../shared/api'
import { playClick, playSuccess } from '../shared/sound'
import { ApiStatus, AudioPlayer, Empty, useApi } from '../shared/ui'

interface MoodItem {
  mood: string
  label: string
  emoji: string
  added_by: 'daddy' | 'daughter'
  is_custom: boolean
  has_message: boolean
  has_voice: boolean
}

const EMOJI_CHOICES = ['💗', '😊', '🥺', '😴', '😢', '🤩', '🌙', '🥰', '😤', '🤒', '🌟', '🌧️', '🌈', '🫂']

export default function Mood() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useApi<{ items: MoodItem[] }>('/moods')
  const [selected, setSelected] = useState<string | null>(null)
  const [reply, setReply] = useState<{ message: string; voice: string | null; label: string; emoji: string } | null>(null)
  const [failure, setFailure] = useState('')
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState({ label: '', emoji: '💗', note: '' })

  const choose = async (m: MoodItem) => {
    playClick()
    setSelected(m.mood)
    setReply(null)
    setFailure('')
    try {
      const res = await post<{ ok: boolean; message: string; voice: string | null; label: string; emoji: string }>(
        '/moods/set',
        { mood: m.mood },
      )
      setReply({ message: res.message, voice: res.voice, label: res.label || m.label, emoji: res.emoji || m.emoji })
    } catch (e) {
      setSelected(null)
      setFailure(e instanceof Error && e.message ? e.message : t('os.error'))
    }
  }

  const addMood = async () => {
    const label = draft.label.trim()
    if (!label || busy) return
    setBusy(true)
    setFailure('')
    try {
      const res = await post<{ ok: boolean; item: MoodItem; message: string }>('/moods/add', {
        label,
        emoji: draft.emoji,
        note: draft.note.trim(),
      })
      playSuccess()
      setReply({ message: res.message, voice: null, label: res.item.label, emoji: res.item.emoji })
      setSelected(res.item.mood)
      setDraft({ label: '', emoji: '💗', note: '' })
      setAdding(false)
      await reload()
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : t('os.error'))
    } finally {
      setBusy(false)
    }
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} onRetry={() => void reload()} />
  const items = data?.items || []

  return (
    <div className="space-y-4 os-no-select">
      <p className="os-title text-center text-lg">{t('mood.question')}</p>

      {items.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {items.map((m, i) => (
            <motion.button
              key={m.mood}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: Math.min(i, 12) * 0.04 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => void choose(m)}
              className="os-card flex flex-col items-center gap-1 p-3"
              style={{ borderColor: selected === m.mood ? 'var(--os-accent)' : undefined }}
            >
              <span className={`text-3xl ${selected === m.mood ? 'animate-beat' : ''}`}>{m.emoji || '💗'}</span>
              <span className="line-clamp-2 text-[11px] leading-4">{m.label}</span>
              {m.is_custom && (
                <span className="text-[9px] os-muted">✨ {t('mood.mine')}</span>
              )}
            </motion.button>
          ))}
        </div>
      )}

      {/* ------------------------------------------------ حالِ تازه‌ی خودم -- */}
      <button className="os-btn w-full" onClick={() => { playClick(); setAdding((v) => !v) }}>
        <span className="inline-flex items-center justify-center gap-2">
          <Icon name={adding ? 'minus' : 'plus'} size={15} /> {t('mood.addMood')}
        </span>
      </button>

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="os-card space-y-3 overflow-hidden p-3"
          >
            <p className="text-sm font-semibold">{t('mood.addTitle')}</p>
            <input
              className="os-input"
              placeholder={t('mood.namePlaceholder')}
              value={draft.label}
              maxLength={40}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_CHOICES.map((emoji) => (
                <button
                  key={emoji}
                  className={`os-chip !px-2 ${draft.emoji === emoji ? 'os-chip-active' : ''}`}
                  onClick={() => setDraft((d) => ({ ...d, emoji }))}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <input
              className="os-input"
              placeholder={t('mood.note')}
              value={draft.note}
              maxLength={500}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
            />
            <button className="os-btn-primary w-full" disabled={busy || !draft.label.trim()} onClick={() => void addMood()}>
              {busy ? t('mood.addSaving') : t('mood.addSave')}
            </button>
            <p className="text-[11px] leading-5 os-muted">{t('mood.addHint')}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {failure && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="os-card space-y-2 p-3"
            style={{ borderColor: '#e2557f' }}
            role="alert"
          >
            <p className="text-sm" style={{ color: '#e2557f' }}>😔 {failure}</p>
            <button className="os-chip" onClick={() => { setFailure(''); void reload() }}>
              <span className="inline-flex items-center gap-1"><Icon name="retry" size={13} /> {t('os.retry')}</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reply && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="os-card space-y-2 p-4">
            <p className="text-xs os-muted">
              {reply.emoji} {reply.label} • {t('mood.saved')}
            </p>
            <p className="whitespace-pre-line text-sm leading-7">{reply.message || t('mood.replyFallback')}</p>
            {reply.voice && <AudioPlayer src={reply.voice} compact autoPlay />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
