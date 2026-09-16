/**
 * Lock.tsx — صفحه‌ی قفل
 * «امروز N روزه که بابا عاشقته.» + شمارش تا دیدار بعدی
 * رمز اشتباه → پیام بامزه + لرزش قلب. ۵ بار اشتباه → دکمه‌ی «کمک از بابا» (راز ⑮).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, LoveOSLogo } from '../shared/Icon'
import { post } from '../shared/api'
import { digits } from '../shared/format'
import { playError, playSuccess, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'
import { useFitScale } from '../shared/useFitScale'

export function Lock() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const unlock = useOS((s) => s.unlock)
  const showEgg = useOS((s) => s.showEgg)

  const [code, setCode] = useState('')
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  const [fails, setFails] = useState(0)
  const [showHelp, setShowHelp] = useState(false)
  const [forgotMode, setForgotMode] = useState(false)
  const [helpSent, setHelpSent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = 'LoveOS'
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || !code) return
    setBusy(true)
    try {
      const res = await post<{ ok: boolean; token?: string; message?: string; failed_attempts?: number; show_help_button?: boolean }>(
        '/auth/unlock',
        { passcode: code },
      )
      if (res.ok && res.token) {
        playSuccess()
        vibrate(40)
        await unlock(res.token)
        return
      }
      playError()
      vibrate([60, 40, 60])
      setError(res.message || t('os.error'))
      setShake(true)
      setTimeout(() => setShake(false), 520)
      setFails(res.failed_attempts || fails + 1)
      setCode('')
      if (res.show_help_button) {
        setShowHelp(true)
        // راز ⑮ — پنج رمز اشتباه
        try {
          const egg = await post<{ found: boolean; title: string; message: string }>('/egg', { trigger: 'lock_5_wrong' })
          if (egg.found) showEgg({ title: egg.title, message: egg.message })
        } catch {
          /* بدون نشست، تریگر سمت سرور نیاز به احراز دارد — پیام محلی کافی است */
        }
      }
    } finally {
      setBusy(false)
    }
  }

  const submitAnswer = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await post<{ ok: boolean; token?: string; message?: string }>('/auth/forgot', { answer })
    if (res.ok && res.token) {
      playSuccess()
      await unlock(res.token)
    } else {
      playError()
      setError(res.message || '')
      setShake(true)
      setTimeout(() => setShake(false), 520)
    }
  }

  const askHelp = async () => {
    await post('/auth/help')
    setHelpSent(true)
  }

  const delta = config?.next_meeting_delta
  // صفحه‌ی قفل هم دقیقاً اندازه‌ی صفحه است: در گوشی‌های کوچک یا با فونت
  // بزرگ‌تر، محتوا کمی جمع می‌شود تا هیچ اسکرولی لازم نشود.
  const { ref: fitRef, scale: fit } = useFitScale<HTMLDivElement>()

  return (
    <motion.div
      className="os-screen relative flex flex-col items-center justify-center px-6 py-6"
      style={{
        backgroundImage: `linear-gradient(170deg, rgba(255,245,249,.42), rgba(243,236,255,.48)), url(${
          config?.lock_background || '/backgrounds/lock.jpg'
        })`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.7 }}
    >
      {/* ستون محتوا — وسط‌چین، و در صفحه‌های کوتاه با مقیاسِ محاسبه‌شده */}
      <div
        ref={fitRef}
        data-fit-column="lock"
        className="flex w-full flex-col items-center"
        style={fit < 1 ? { transform: `scale(${fit})` } : undefined}
      >
      <motion.div className={shake ? 'animate-shake' : 'animate-float'}>
        {config?.logo ? (
          <img src={config.logo} alt="لوگوی LoveOS" className="h-20 w-20 rounded-3xl object-cover shadow-soft" />
        ) : (
          <LoveOSLogo size={88} />
        )}
      </motion.div>

      <p className="os-title mt-6 text-center text-xl" style={{ color: 'var(--os-accent)' }}>
        {t('lock.daysTogether', { count: config?.days_together ?? 0 }).replace(
          String(config?.days_together ?? 0),
          digits(config?.days_together ?? 0),
        )}
      </p>
      {delta && (
        <p className="mt-1 text-sm os-muted">
          {t('lock.nextMeeting', { days: digits(delta.days), hours: digits(delta.hours) })}
        </p>
      )}

      <AnimatePresence mode="wait">
        {!forgotMode ? (
          <motion.form
            key="pass"
            onSubmit={submit}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-8 w-full max-w-xs space-y-3"
          >
            <input
              type="password"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={t('lock.placeholder')}
              className="os-input text-center text-lg tracking-[0.4em]"
              autoFocus
            />
            <button type="submit" className="os-btn-primary w-full" disabled={busy}>
              {t('lock.unlock')}
            </button>
            <button
              type="button"
              onClick={() => { setForgotMode(true); setError('') }}
              className="w-full text-center text-xs os-muted underline-offset-4 hover:underline"
            >
              {t('lock.forgot')}
            </button>
          </motion.form>
        ) : (
          <motion.form
            key="forgot"
            onSubmit={submitAnswer}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-8 w-full max-w-xs space-y-3"
          >
            <div className="os-card p-4 text-center text-sm">{config?.security_question}</div>
            <input
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={t('lock.answer')}
              className="os-input text-center"
              autoFocus
            />
            <button type="submit" className="os-btn-primary w-full">{t('lock.unlock')}</button>
            <button type="button" onClick={() => setForgotMode(false)} className="w-full text-center text-xs os-muted">
              {t('os.back')}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 max-w-xs text-center text-sm"
            style={{ color: '#e0478d' }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showHelp && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="os-card mt-6 w-full max-w-xs p-4 text-center"
          >
            <p className="text-sm">{config?.lock_help_message}</p>
            {helpSent ? (
              <p className="mt-3 text-sm" style={{ color: 'var(--os-accent)' }}>{t('lock.helpSent')}</p>
            ) : (
              <button onClick={askHelp} className="os-btn-primary mt-3 w-full">
                <span className="inline-flex items-center justify-center gap-2">
                  <Icon name="heart" size={16} /> {t('lock.helpButton')}
                </span>
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {fails > 0 && !showHelp && (
        <div className="mt-4 flex gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: i < fails ? 'var(--os-accent)' : 'var(--os-border)' }}
            />
          ))}
        </div>
      )}
      </div>
    </motion.div>
  )
}
