/**
 * Puzzle — پازل قلب
 * عکس به قطعات N×N تقسیم می‌شود؛ با جابه‌جایی دو قطعه مرتب می‌شود.
 *
 * ۱) دخترم خودش هم می‌تواند عکس بفرستد و پازل بسازد (روی سرور ذخیره می‌شود).
 * ۲) تشخیص تکمیل: بعد از هر جابه‌جایی، صفحه‌ی فعلی با «ترتیب درست»
 *    مقایسه می‌شود؛ اگر یکی‌یکی باشند، همان لحظه جشن می‌آید — حتی اگر
 *    سرور پاسخ ندهد، بازی برای دختر تمام می‌شود (پایان محلی + تلاش برای ثبت).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { del, post, upload } from '../shared/api'
import { digits, formatDuration } from '../shared/format'
import { blobToUploadFile, resizeImage } from '../shared/image'
import { playClick, playSuccess } from '../shared/sound'
import { AudioPlayer, Chips, Loading, SectionTitle, useApi } from '../shared/ui'

interface P {
  id: number
  title: string
  level: 3 | 4 | 5
  level_label: string
  image: string | null
  hint_text: string
  max_hints: number
  best_time: number
  plays: number
  completions: number
  created_by?: 'daddy' | 'daughter'
}

function shuffled(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i)
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  // اطمینان از این‌که از اول حل‌شده نباشد
  if (arr.every((v, i) => v === i)) return shuffled(n)
  return arr
}

/** آیا صفحه کاملاً مرتب است؟ (قطعه‌ی i باید با مقدار i باشد) */
const isSolved = (tiles: number[]) => tiles.length > 0 && tiles.every((v, i) => v === i)

/* ------------------------------------------------------------ جشن ---- */
function WinOverlay({ result, onReplay }: { result: { message: string; voice: string | null; best_time: number; new_record: boolean; seconds: number; moves: number }; onReplay: () => void }) {
  const { t } = useTranslation()
  const parts = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 1.2,
        dur: 1.6 + Math.random() * 1.4,
        emoji: ['🎉', '💖', '✨', '⭐', '🌸', '💫'][i % 6],
        size: 14 + Math.random() * 14,
      })),
    [],
  )
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: 'rgba(10,10,25,.6)', backdropFilter: 'blur(4px)' }}
    >
      {/* بارش جشن */}
      {parts.map((p) => (
        <motion.span
          key={p.id}
          className="absolute"
          style={{ left: `${p.left}%`, fontSize: p.size, top: -40 }}
          initial={{ y: -40, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', opacity: [1, 1, 0.4], rotate: 360 }}
          transition={{ duration: p.dur, delay: p.delay, ease: 'linear' }}
        >
          {p.emoji}
        </motion.span>
      ))}
      <motion.div
        initial={{ scale: 0.7, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="os-card w-full max-w-sm space-y-3 p-5 text-center"
      >
        <motion.p
          className="text-5xl"
          animate={{ scale: [1, 1.25, 1], rotate: [0, -8, 8, 0] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        >
          🧩
        </motion.p>
        <p className="os-title text-xl" style={{ color: 'var(--os-accent)' }}>
          {t('puzzle.done')}
        </p>
        <p className="text-sm">
          {t('puzzle.winStats', { time: formatDuration(result.seconds), moves: digits(result.moves) })}
        </p>
        {result.new_record && (
          <p className="text-xs font-bold" style={{ color: 'var(--os-accent)' }}>
            🏆 {t('puzzle.best')}: {formatDuration(result.best_time)}
          </p>
        )}
        {result.message && <p className="text-sm leading-7">{result.message}</p>}
        {result.voice && <AudioPlayer src={result.voice} compact autoPlay />}
        <button className="os-btn-primary w-full" onClick={onReplay}>
          {t('puzzle.playAgain')}
        </button>
      </motion.div>
    </motion.div>
  )
}

/* ---------------------------------------------------- ساخت پازل ---- */
function CreatePuzzle({ onCreated }: { onCreated: () => Promise<void> }) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [level, setLevel] = useState<'3' | '4' | '5'>('3')
  const [img, setImg] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLInputElement | null>(null)

  const pick = async (f: File | undefined) => {
    if (!f) return
    const { blob, preview: url } = await resizeImage(f, 720, 0.85)
    setImg(blobToUploadFile(blob, f.name))
    setPreview(url)
  }

  const submit = async () => {
    if (!img) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim() || 'پازل من')
      fd.append('level', level)
      fd.append('image', img)
      await upload('/puzzles/upload', fd)
      setTitle('')
      setImg(null)
      setPreview(null)
      if (ref.current) ref.current.value = ''
      await onCreated()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="os-card space-y-2 p-3">
      <div className="flex items-center gap-3">
        <button
          className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl transition active:scale-95"
          style={{ background: preview ? undefined : 'var(--os-accent-soft)', color: 'var(--os-accent)' }}
          onClick={() => ref.current?.click()}
        >
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <Icon name="camera" size={26} />}
        </button>
        <div className="min-w-0 flex-1">
          <input className="os-input" placeholder={t('puzzle.newTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="mt-2">
            <Chips
              items={[
                { key: '3' as const, label: t('puzzle.levels.3') },
                { key: '4' as const, label: t('puzzle.levels.4') },
                { key: '5' as const, label: t('puzzle.levels.5') },
              ]}
              value={level}
              onChange={setLevel}
            />
          </div>
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0])
          if (ref.current) ref.current.value = ''
        }}
      />
      <button className="os-btn-primary w-full" onClick={() => void submit()} disabled={!img || busy}>
        {busy ? t('os.uploading') : `${t('puzzle.create')} 🧩`}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------- اپ ---- */
export default function Puzzle() {
  const { t } = useTranslation()
  const { data, loading, reload } = useApi<{ items: P[] }>('/puzzles')
  const [active, setActive] = useState<P | null>(null)
  const [tiles, setTiles] = useState<number[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [seconds, setSeconds] = useState(0)
  const [moves, setMoves] = useState(0)
  const [hints, setHints] = useState(0)
  const [showHint, setShowHint] = useState(false)
  const [result, setResult] = useState<null | { message: string; voice: string | null; best_time: number; new_record: boolean; seconds: number; moves: number }>(null)
  const finishedRef = useRef(false)

  const size = active?.level || 3
  const solved = useMemo(() => isSolved(tiles), [tiles])

  useEffect(() => {
    if (!active || solved || result) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [active, solved, result])

  /** پایان بازی: همواره محلی جشن می‌آید؛ ثبت رکورد روی سرور تلاش می‌شود */
  const finish = (finalSeconds: number, finalMoves: number) => {
    if (finishedRef.current || !active) return
    finishedRef.current = true
    playSuccess()
    void post<{ message: string; voice: string | null; best_time: number; new_record: boolean }>(`/puzzles/${active.id}/complete`, {
      seconds: finalSeconds,
    })
      .then((r) => {
        setResult({ ...r, seconds: finalSeconds, moves: finalMoves })
        void reload()
      })
      .catch(() => {
        // حتی اگر سرور نبود، بازی برای دختر «تمام» می‌شود
        setResult({ message: '', voice: null, best_time: finalSeconds, new_record: false, seconds: finalSeconds, moves: finalMoves })
      })
  }

  const start = async (p: P) => {
    playClick()
    finishedRef.current = false
    setActive(p)
    setTiles(shuffled(p.level * p.level))
    setSelected(null)
    setSeconds(0)
    setMoves(0)
    setHints(0)
    setResult(null)
    await post(`/puzzles/${p.id}/start`).catch(() => undefined)
  }

  const tap = (i: number) => {
    if (solved || result) return
    playClick()
    if (selected === null) {
      setSelected(i)
      return
    }
    if (selected === i) {
      setSelected(null)
      return
    }
    const next = [...tiles]
    ;[next[selected], next[i]] = [next[i], next[selected]]
    setTiles(next)
    const m = moves + 1
    setMoves(m)
    setSelected(null)
    // تشخیص فوری و قطعی: همین‌جا چک می‌کنیم، نه در یک افکت دیرکرد
    if (isSolved(next)) finish(seconds, m)
  }

  const useHint = () => {
    if (!active || hints >= active.max_hints) return
    setHints((h) => h + 1)
    setShowHint(true)
    setTimeout(() => setShowHint(false), 2200)
  }

  if (loading) return <Loading />
  const items = data?.items || []

  if (!active) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm os-muted">{t('puzzle.choose')}</p>
        <div className="grid grid-cols-2 gap-3">
          {items.map((p) => (
            <div key={p.id} className="os-card overflow-hidden">
              <button onClick={() => void start(p)} className="block w-full text-start">
                {p.image ? <img src={p.image} alt="" className="h-28 w-full object-cover" /> : <div className="h-28 w-full" style={{ background: 'var(--os-accent-soft)' }} />}
                <div className="p-3">
                  <p className="os-title break-words text-sm">{p.title}</p>
                  <p className="text-[11px] os-muted">
                    {t(`puzzle.levels.${p.level}`)}
                    {p.created_by === 'daughter' ? ` • ${t('puzzle.byMe')}` : ''}
                  </p>
                  {p.best_time > 0 && <p className="text-[11px] os-muted">{t('puzzle.best')}: {formatDuration(p.best_time)}</p>}
                </div>
              </button>
              {p.created_by === 'daughter' && (
                <div className="flex justify-end px-2 pb-2">
                  <button
                    className="rounded-lg p-1.5 os-muted transition hover:bg-black/5"
                    onClick={async () => {
                      await del(`/puzzles/${p.id}`)
                      await reload()
                    }}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <SectionTitle>{t('puzzle.newTitle')}</SectionTitle>
        <CreatePuzzle onCreated={reload} />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button className="os-chip" onClick={() => setActive(null)}>{t('os.back')}</button>
        <span className="os-chip">{t('puzzle.time')}: {formatDuration(seconds)}</span>
        <span className="os-chip">{digits(moves)} {t('puzzle.moves')}</span>
        <button className="os-chip ms-auto" onClick={useHint} disabled={hints >= active.max_hints}>
          {t('puzzle.hintsLeft', { count: digits(active.max_hints - hints) })}
        </button>
      </div>

      <div
        className="relative mx-auto grid overflow-hidden rounded-3xl"
        style={{
          width: 'min(100%, 340px)',
          aspectRatio: '1',
          gridTemplateColumns: `repeat(${size}, 1fr)`,
          gap: 3,
          background: 'var(--os-border)',
        }}
      >
        {tiles.map((tile, i) => {
          const row = Math.floor(tile / size)
          const col = tile % size
          const correct = tile === i
          return (
            <motion.button
              key={i}
              onClick={() => tap(i)}
              className="relative overflow-hidden"
              style={{
                backgroundImage: active.image ? `url(${active.image})` : 'linear-gradient(135deg,#ff9ecb,#bba0fb)',
                backgroundSize: `${size * 100}% ${size * 100}%`,
                backgroundPosition: `${(col / (size - 1)) * 100}% ${(row / (size - 1)) * 100}%`,
                outline: selected === i ? '3px solid var(--os-accent)' : correct ? '2px solid rgba(52,211,153,.9)' : 'none',
                outlineOffset: -2,
              }}
              whileTap={{ scale: 0.92 }}
              aria-label={`${i + 1}`}
            />
          )
        })}
        {/* پیش‌نمایش کمک */}
        <AnimatePresence>
          {showHint && active.image && (
            <motion.img
              src={active.image}
              alt=""
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.92 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 h-full w-full object-cover"
            />
          )}
        </AnimatePresence>
      </div>

      {active.hint_text && showHint && <p className="text-center text-xs os-muted">{active.hint_text}</p>}

      <div className="flex gap-2">
        <button className="os-btn flex-1" onClick={() => void start(active)}>{t('puzzle.reset')}</button>
      </div>

      <AnimatePresence>
        {result && <WinOverlay result={result} onReplay={() => void start(active)} />}
      </AnimatePresence>
    </div>
  )
}
