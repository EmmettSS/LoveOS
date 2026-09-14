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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!path) return
    setLoading(true)
    try {
      setData(await get<T>(path))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])

  return { data, loading, error, reload, setData }
}

export function Loading() {
  const { t } = useTranslation()
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-sm os-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      {t('os.loading')}
    </div>
  )
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
      void a.play()
      if (!counted.current) {
        counted.current = true
        onPlayed?.()
      }
    } else {
      a.pause()
    }
  }

  return (
    <div className={`flex items-center gap-3 ${compact ? '' : 'os-card p-3'}`}>
      <button
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
        onPlay={() => setPlaying(true)}
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
