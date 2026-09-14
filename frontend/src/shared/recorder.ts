/**
 * recorder.ts — ضبط صدا با میکروفنِ خودِ مرورگر
 *
 * چرا این فایل جدا است؟ چون دو اپ به ضبط صدا نیاز دارند:
 *   • هماهنگ‌کننده‌ی تماس → ضمیمه‌ی صوتی برای گزارش تماس
 *   • پل زبان → تلفظ درست کلمه‌ها
 * پس یک بار نوشته شده و هر دو جا استفاده می‌شود.
 *
 * ضبط با MediaRecorder انجام می‌شود و خروجی به‌صورت فایل به همان
 * API خودِ اپ فرستاده می‌شود؛ فایل در پوشه‌ی media ذخیره می‌شود.
 */
import { useCallback, useEffect, useRef, useState } from 'react'

export interface Recording {
  blob: Blob
  /** فایل آماده برای FormData */
  file: File
  seconds: number
  /** آدرس محلی برای پخش آزمایشی قبل از ارسال */
  url: string
}

/** بهترین فرمتِ قابل پشتیبانی مرورگر (سافاری m4a، بقیه webm) */
function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
  for (const type of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type
    } catch {
      /* مرورگرهای قدیمی isTypeSupported ندارند */
    }
  }
  return ''
}

function extFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a'
  if (mime.includes('ogg')) return 'ogg'
  if (mime.includes('wav')) return 'wav'
  return 'webm'
}

export const micSupported = () =>
  typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

/**
 * هوک ضبط صدا.
 *   start() → اجازه‌ی میکروفن می‌گیرد و شروع می‌کند
 *   stop()  → ضبط را تمام می‌کند و فایل آماده را برمی‌گرداند
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const timerRef = useRef<number | null>(null)
  const resolveRef = useRef<((r: Recording | null) => void) | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current)
      timerRef.current = null
    }
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    mediaRef.current = null
    setRecording(false)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const start = useCallback(async () => {
    setError(null)
    if (!micSupported()) {
      setError('unsupported')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = pickMimeType()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      mediaRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.start(250)
      setSeconds(0)
      setRecording(true)
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000)
      return true
    } catch {
      setError('denied')
      cleanup()
      return false
    }
  }, [cleanup])

  /** ضبط را تمام می‌کند؛ اگر ضبطی در جریان نباشد null برمی‌گردد */
  const stop = useCallback(
    () =>
      new Promise<Recording | null>((resolve) => {
        const rec = mediaRef.current
        if (!rec || rec.state === 'inactive') {
          cleanup()
          resolve(null)
          return
        }
        resolveRef.current = resolve
        rec.onstop = () => {
          const type = rec.mimeType || 'audio/webm'
          const blob = new Blob(chunksRef.current, { type })
          const secs = seconds
          cleanup()
          const file = new File([blob], `voice-${Date.now()}.${extFor(type)}`, { type })
          resolve({ blob, file, seconds: secs, url: URL.createObjectURL(blob) })
          resolveRef.current = null
        }
        rec.stop()
      }),
    [cleanup, seconds],
  )

  /** لغو ضبط بدون ساختن فایل */
  const cancel = useCallback(() => {
    resolveRef.current?.(null)
    resolveRef.current = null
    const rec = mediaRef.current
    if (rec && rec.state !== 'inactive') {
      rec.onstop = null
      try {
        rec.stop()
      } catch {
        /* ignore */
      }
    }
    cleanup()
    setSeconds(0)
  }, [cleanup])

  return { recording, seconds, error, start, stop, cancel, supported: micSupported() }
}

/** «۰:۰۷» برای نمایش زمانِ در حال ضبط */
export function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
