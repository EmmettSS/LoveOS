/**
 * Quiz — «چقدر بابا رو می‌شناسی؟»
 * سؤال‌ها از پنل می‌آیند، نمره‌ی کامل جایزه‌ی مخفی دارد.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { useMotionAllowed, useQualityTier } from '../shared/depth'
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
  // ⚠️ بالایِ **چهار** ``return`` زودهنگام (loading/error، فهرستِ خالی،
  //    !started، result) — زیرِ هرکدام یعنی نقضِ Rules-of-Hooks
  const tier = useQualityTier()
  const allowed = useMotionAllowed()
  const deep = allowed && tier !== 'lite'
  const dz = deep ? 1 : 0
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
      <div className="os-depth-hero flex flex-col items-center gap-4 py-10 text-center">
        {/* ⚠️ ``animate-float`` روی خودِ ایموجی ``transform`` می‌نویسد، پس
            هاله‌ی نورانی و ظرفِ عمق عنصرِ **جدا** هستند. دو منبعِ transform
            روی یک عنصر = یکی دیگری را بی‌صدا می‌بلعد. */}
        <span className="relative grid place-items-center">
          {deep && (
            <span
              className="os-orb pointer-events-none absolute"
              style={{ width: 86, height: 86, opacity: 0.36, ['--orb-core' as string]: 'var(--os-accent-soft)', ['--orb-edge' as string]: 'var(--os-accent)' }}
              aria-hidden
            />
          )}
          <span className="os-parallax-near relative text-5xl animate-float">🧠</span>
        </span>
        <p className="os-title text-lg">{t('apps.quiz')}</p>
        <p className="text-sm os-muted">{digits(items.length)} {t('os.more')}</p>
        <button className="os-btn-primary" onClick={() => setStarted(true)}>{t('quiz.start')}</button>
      </div>
    )
  }

  if (result) {
    return (
      <div className="os-depth-hero flex flex-col items-center gap-4 py-8 text-center">
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="os-parallax-near relative text-5xl">
          {result.perfect ? '💯' : '💗'}
        </motion.span>
        <p className="os-title text-lg">
          {t('quiz.score', { score: digits(result.score), total: digits(result.total) })}
        </p>
        {result.perfect && <p className="text-sm" style={{ color: 'var(--os-accent)' }}>{t('quiz.perfect')}</p>}
        {result.reward && (
          <p className="os-card max-w-xs p-4 text-sm leading-7">{result.reward}</p>
        )}
        /* بچه‌های این فهرست divِ ساده‌اند و transform درون‌خطی ندارند، پس
           ``.os-depth-list`` امن است و پاسخ‌ها پلکانی از عمق بیرون می‌آیند. */
        <div className="os-depth-list w-full max-w-xs space-y-2 text-start">
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
        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--well-face)', boxShadow: 'var(--well-inner)' }}>
          <motion.div className="h-full rounded-full" style={{ background: 'var(--os-accent)' }} animate={{ width: `${((idx + 1) / items.length) * 100}%` }} />
        </div>
        <span className="text-[11px] os-muted">{digits(idx + 1)}/{digits(items.length)}</span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={q.id}
          // سؤال از عمق می‌آید و در z=0 **کاملاً تخت** می‌نشیند: متنِ سؤال
          // باید خوانا بماند، عمق فقط در لحظه‌ی جابه‌جایی هست.
          initial={{ opacity: 0, x: 24, z: -44 * dz }}
          animate={{ opacity: 1, x: 0, z: 0 }}
          exit={{ opacity: 0, x: -24, z: -30 * dz }}
          style={{ transformPerspective: 1000 }}
        >
          <p className="os-title text-base leading-8">{q.question}</p>
          {/* گزینه‌ها «کلید» هستند: پخِ توپُر (``os-slab``) + تیلتِ ملایم
              (``os-tilt-card`` = ۴ درجه). زاویه عمداً کم است چون این کارت‌ها
              متنِ پاسخ‌اند و خوانایی‌شان از افکت مهم‌تر است. */}
          <div className="os-stage-3d mt-3 space-y-2">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => pick(q, LETTERS[i])}
                className="os-card os-slab os-tilt-card w-full p-3 text-start text-sm transition"
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
