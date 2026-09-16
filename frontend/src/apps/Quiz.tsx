/**
 * Quiz — «چقدر بابا رو می‌شناسی؟»
 * سؤال‌ها از پنل می‌آیند، نمره‌ی کامل جایزه‌ی مخفی دارد.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { digits } from '../shared/format'
import { playClick, playError, playSuccess } from '../shared/sound'
import { ApiStatus, Empty, useApi } from '../shared/ui'

interface Q {
  id: number
  question: string
  options: string[]
  explanation: string
}
const LETTERS = ['a', 'b', 'c', 'd'] as const

export default function Quiz() {
  const { t } = useTranslation()
  const { data, loading, error } = useApi<{ items: Q[] }>('/quiz')
  const [started, setStarted] = useState(false)
  const [idx, setIdx] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<null | { score: number; total: number; perfect: boolean; reward: string | null; correct: Record<string, string> }>(null)

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  const reset = () => { setStarted(false); setIdx(0); setAnswers({}); setResult(null) }

  const pick = (q: Q, letter: string) => {
    playClick()
    setAnswers((prev) => ({ ...prev, [q.id]: letter }))
  }

  const submit = async () => {
    const res = await post<typeof result>('/quiz/submit', { answers })
    setResult(res)
    if (res && res.perfect) playSuccess()
    else playError()
  }

  if (!started) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <span className="text-5xl animate-float">🧠</span>
        <p className="os-title text-lg">{t('apps.quiz')}</p>
        <p className="text-sm os-muted">{digits(items.length)} {t('os.more')}</p>
        <button className="os-btn-primary" onClick={() => setStarted(true)}>{t('quiz.start')}</button>
      </div>
    )
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-5xl">
          {result.perfect ? '💯' : '💗'}
        </motion.span>
        <p className="os-title text-lg">
          {t('quiz.score', { score: digits(result.score), total: digits(result.total) })}
        </p>
        {result.perfect && <p className="text-sm" style={{ color: 'var(--os-accent)' }}>{t('quiz.perfect')}</p>}
        {result.reward && (
          <p className="os-card max-w-xs p-4 text-sm leading-7">{result.reward}</p>
        )}
        <div className="w-full max-w-xs space-y-2 text-start">
          {items.map((q, i) => {
            const mine = answers[String(q.id)]
            const right = result.correct[String(q.id)]
            const ok = mine === right
            return (
              <div key={q.id} className="os-card p-3">
                <p className="text-xs os-muted">{t('quiz.question', { n: digits(i + 1), total: digits(items.length) })}</p>
                <p className="mt-0.5 text-sm">{q.question}</p>
                <p className="mt-1 text-xs" style={{ color: ok ? '#4caf7d' : '#e0478d' }}>
                  {ok ? t('quiz.correct') : t('quiz.wrong')} — {q.options[LETTERS.indexOf(right as any)]}
                </p>
                {q.explanation && <p className="mt-1 text-[11px] os-muted">{q.explanation}</p>}
              </div>
            )
          })}
        </div>
        <button className="os-btn" onClick={reset}>{t('quiz.retry')}</button>
      </div>
    )
  }

  const q = items[idx]
  const chosen = answers[String(q.id)]
  const last = idx === items.length - 1

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
          <motion.div className="h-full rounded-full" style={{ background: 'var(--os-accent)' }} animate={{ width: `${((idx + 1) / items.length) * 100}%` }} />
        </div>
        <span className="text-[11px] os-muted">{digits(idx + 1)}/{digits(items.length)}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={q.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
          <p className="os-title text-base leading-8">{q.question}</p>
          <div className="mt-3 space-y-2">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => pick(q, LETTERS[i])}
                className="os-card w-full p-3 text-start text-sm transition"
                style={{
                  borderColor: chosen === LETTERS[i] ? 'var(--os-accent)' : undefined,
                  background: chosen === LETTERS[i] ? 'var(--os-accent-soft)' : undefined,
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="flex gap-2">
        {idx > 0 && <button className="os-btn flex-1" onClick={() => setIdx(idx - 1)}>{t('os.back')}</button>}
        {last ? (
          <button className="os-btn-primary flex-1" onClick={() => void submit()} disabled={!chosen}>{t('quiz.finish')}</button>
        ) : (
          <button className="os-btn-primary flex-1" onClick={() => setIdx(idx + 1)} disabled={!chosen}>{t('quiz.next')}</button>
        )}
      </div>
    </div>
  )
}
