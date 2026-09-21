/**
 * ui.tsx — قطعات مشترک رابط کاربری
 * هوک بارگذاری داده، پخش‌کننده‌ی صدا، حالت خالی، اسپینر و چیپ فیلتر.
 */
import { motion } from 'framer-motion'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from './Icon'
import { get } from './api'
import { formatDuration } from './format'

/** هوک ساده برای گرفتن داده از API با وضعیت بارگذاری و امکان بارگذاری دوباره */
export function useApi<T>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(Boolean(path))
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const reload = useCallback(async () => {
    if (!path) {
      setData(null)
      setLoading(false)
      setError(null)
      return
    }
    const id = ++requestId.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    try {
      const next = await get<T>(path, { signal: controller.signal })
      if (id !== requestId.current) return
      setData(next)
      setError(null)
    } catch (e) {
      if (controller.signal.aborted || id !== requestId.current) return
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void reload()
    return () => abortRef.current?.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])

  return { data, loading, error, reload, setData }
}

export function Loading() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm os-muted" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {t('os.loading')}
    </div>
  )
}

export function ApiError({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="os-card space-y-2 p-4 text-center text-sm" role="alert">
      <p>🥺 {t('os.error')}</p>
      {onRetry && <button type="button" className="os-btn-primary !px-4 !py-2 text-xs" onClick={onRetry}>{t('os.retry')}</button>}
    </div>
  )
}

export function ApiStatus({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry?: () => void }) {
  if (loading) return <Loading />
  if (error) return <ApiError onRetry={onRetry} />
  return null
}

export function Empty({ text }: { text?: string }) {
  const { t } = useTranslation()
  return <p className="os-empty">{text || t('os.empty')}</p>
}

export function Chips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          type="button"
          key={it.key}
          className={`os-chip ${value === it.key ? 'os-chip-active' : ''}`}
          onClick={() => onChange(it.key)}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/** پخش‌کننده‌ی صوتی با نوار پیشرفت — برای ویس، آهنگ و صدای صفحه‌ی کتاب */
export function AudioPlayer({
  src,
  title,
  subtitle,
  onPlayed,
  onEnded,
  accent = 'var(--os-accent)',
  autoPlay = false,
  compact = false,
}: {
  src: string
  title?: string
  subtitle?: string
  onPlayed?: () => void
  onEnded?: () => void
  accent?: string
  autoPlay?: boolean
  compact?: boolean
}) {
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [dur, setDur] = useState(0)
  const counted = useRef(false)

  useEffect(() => {
    counted.current = false
    setTime(0)
  }, [src])

  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) {
      void a.play().catch(() => undefined)
    } else {
      a.pause()
    }
  }

  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'os-card p-3'}`}>
      <button
        type="button"
        onClick={toggle}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90"
        style={{ background: accent }}
        aria-label={playing ? 'pause' : 'play'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={18} />
      </button>
      <div className="min-w-0 flex-1">
        {title && <p className="truncate text-sm font-semibold">{title}</p>}
        {subtitle && <p className="truncate text-xs os-muted">{subtitle}</p>}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: accent, width: dur ? `${(time / dur) * 100}%` : '0%' }}
            />
          </div>
          <span className="shrink-0 text-[10px] tabular-nums os-muted">
            {formatDuration(time)} / {formatDuration(dur)}
          </span>
        </div>
      </div>
      <audio
        ref={ref}
        src={src}
        autoPlay={autoPlay}
        preload="metadata"
        onPlay={() => {
          setPlaying(true)
          if (!counted.current) {
            counted.current = true
            onPlayed?.()
          }
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime((e.target as HTMLAudioElement).currentTime)}
        onLoadedMetadata={(e) => setDur((e.target as HTMLAudioElement).duration || 0)}
        onEnded={() => { setPlaying(false); onEnded?.() }}
      />
    </div>
  )
}

/** سربرگ کوچک داخل اپ‌ها */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 mt-4 flex items-center gap-2 first:mt-0">
      <h3 className="os-title flex-1 text-sm">{children}</h3>
      {action}
    </div>
  )
}

/**
 * Toggle — کلید روشن/خاموش مشترک
 *
 * باگ قدیمی: در حالت RTL دایره با translateX(20px) همیشه به راست می‌رفت و
 * از ریل بیرون می‌زد. حالا دایره absolute است و جابه‌جایی به‌صورت
 * «آغاز/پایان منطقی» محاسبه می‌شود؛ در هر جهت کاملاً داخل ریل می‌ماند.
 */
export function Toggle({
  on,
  onChange,
  disabled = false,
  label = 'toggle',
}: {
  on: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
  label?: string
}) {
  const isRtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl'
  const TRAVEL = 20 // 48 (ریل) − 24 (دایره) − ۲×۲ (حاشیه)
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-50"
      style={{ background: on ? 'var(--os-accent)' : 'var(--os-border)' }}
    >
      <motion.span
        className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow"
        style={{ insetInlineStart: '2px' }}
        initial={false}
        animate={{ x: on ? (isRtl ? -TRAVEL : TRAVEL) : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      />
    </button>
  )
}
