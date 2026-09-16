/**
 * Mood — حال دلم (زنده‌تر + حال دلخواه + تاریخچه + یادداشت)
 */
import { AnimatePresence, motion } from 'framer-motion'
import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { playClick, playSuccess } from '../shared/sound'
import { ApiStatus, AudioPlayer, Empty, useApi } from '../shared/ui'

const MoodSceneView = lazy(() => import('../three/components/MoodScene'))

interface MoodItem {
  mood: string
  label: string
  emoji?: string
  color?: string
  custom_id?: number
  is_custom?: boolean
}

interface MoodHistoryItem {
  id: number
  mood: string
  label: string
  emoji?: string
  note: string
  created_at: string
}

const EMOJI: Record<string, string> = {
  happy: '😊',
  missing: '🥺',
  tired: '😴',
  sad: '😢',
  excited: '🤩',
  sleepy: '🌙',
}

export default function Mood() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useApi<{
    items: MoodItem[]
    history?: MoodHistoryItem[]
    customs?: MoodItem[]
  }>('/moods')
  const [selected, setSelected] = useState<string | null>(null)
  const [reply, setReply] = useState<{ message: string; voice: string | null } | null>(null)
  const [note, setNote] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [customLabel, setCustomLabel] = useState('')
  const [customEmoji, setCustomEmoji] = useState('💖')
  const [saving, setSaving] = useState(false)

  const choose = async (m: MoodItem) => {
    playClick()
    setSelected(m.is_custom ? `custom:${m.custom_id}` : m.mood)
    setReply(null)
    const body: Record<string, unknown> = { note: note.trim() }
    if (m.is_custom && m.custom_id) body.custom_id = m.custom_id
    else body.mood = m.mood
    const res = await post<{ message: string; voice: string | null }>('/moods/set', body)
    setReply({ message: res.message, voice: res.voice })
    setNote('')
    void reload()
  }

  const addCustom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customLabel.trim()) return
    setSaving(true)
    try {
      await post('/moods/custom', { label: customLabel.trim(), emoji: customEmoji || '💖' })
      playSuccess()
      setCustomLabel('')
      setShowCustom(false)
      await reload()
    } finally {
      setSaving(false)
    }
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const builtins = data?.items || []
  const customs = data?.customs || []
  const history = data?.history || []
  const all = [...builtins, ...customs]
  if (all.length === 0) return <Empty />

  const fallbackBg = (
    <div
      className="absolute inset-0"
      style={{
        background: selected
          ? 'radial-gradient(80% 60% at 50% 30%, #f9a8d455, #fdf2f8 70%)'
          : 'radial-gradient(80% 60% at 50% 20%, #fbcfe855, transparent 70%)',
      }}
    />
  )

  return (
    <div className="relative flex h-full min-h-[420px] flex-col overflow-y-auto">
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <Suspense fallback={fallbackBg}>
          <MoodSceneView mood={selected?.startsWith('custom:') ? 'custom' : selected} fallback={fallbackBg} />
        </Suspense>
      </div>

      <div className="relative z-10 space-y-4 p-4 pb-28 md:pb-4">
        <p className="os-title text-center text-lg">{t('mood.question')}</p>

        <div className="grid grid-cols-3 gap-3">
          {all.map((m, i) => {
            const key = m.is_custom ? `custom:${m.custom_id}` : m.mood
            const emoji = m.emoji || EMOJI[m.mood] || '💗'
            return (
              <motion.button
                key={key}
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
                whileTap={{ scale: 0.92 }}
                onClick={() => void choose(m)}
                className="os-card flex flex-col items-center gap-1 p-3 backdrop-blur-sm"
                style={{
                  borderColor: selected === key ? 'var(--os-accent)' : undefined,
                  background: selected === key ? 'color-mix(in srgb, var(--os-accent) 12%, var(--os-card))' : undefined,
                }}
              >
                <span className={`text-3xl ${selected === key ? 'animate-beat' : ''}`}>{emoji}</span>
                <span className="text-[11px]">{m.label}</span>
              </motion.button>
            )
          })}
        </div>

        <div className="os-card space-y-2 p-3 backdrop-blur-sm">
          <label className="text-[11px] os-muted">{t('mood.note')}</label>
          <input
            className="os-input"
            placeholder={t('mood.notePh')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
          />
        </div>

        <button type="button" className="os-btn w-full text-sm" onClick={() => setShowCustom((v) => !v)}>
          {showCustom ? t('os.cancel') : `＋ ${t('mood.custom')}`}
        </button>

        <AnimatePresence>
          {showCustom && (
            <motion.form
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onSubmit={addCustom}
              className="os-card space-y-2 p-3"
            >
              <p className="text-sm font-semibold">{t('mood.custom')}</p>
              <div className="flex gap-2">
                <input
                  className="os-input w-16 text-center text-xl"
                  value={customEmoji}
                  onChange={(e) => setCustomEmoji(e.target.value.slice(0, 4))}
                  aria-label={t('mood.emoji')}
                />
                <input
                  className="os-input flex-1"
                  placeholder={t('mood.customPh')}
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  maxLength={40}
                />
              </div>
              <button className="os-btn-primary w-full" type="submit" disabled={saving}>
                {t('os.add')}
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {reply && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="os-card space-y-2 p-4 backdrop-blur-sm"
            >
              <p className="text-xs os-muted">{t('mood.saved')}</p>
              {reply.message && <p className="whitespace-pre-line text-sm leading-7">{reply.message}</p>}
              {reply.voice && <AudioPlayer src={reply.voice} compact autoPlay />}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="os-card space-y-2 p-3 backdrop-blur-sm">
          <p className="text-sm font-semibold">{t('mood.history')}</p>
          {history.length === 0 ? (
            <p className="text-[11px] os-muted">{t('mood.historyEmpty')}</p>
          ) : (
            <ul className="space-y-1.5">
              {history.slice(0, 12).map((h) => (
                <li key={h.id} className="flex items-start gap-2 text-xs leading-5">
                  <span className="text-base">{h.emoji || EMOJI[h.mood] || '💗'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{h.label}</span>
                    {h.note ? <span className="os-muted"> — {h.note}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
