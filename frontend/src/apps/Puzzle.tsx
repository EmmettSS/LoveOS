/**
 * Puzzle — پازل قلب
 * عکس به قطعات N×N تقسیم می‌شود؛ با جابه‌جایی دو قطعه مرتب می‌شود.
 *
 * ۱) دخترم خودش هم می‌تواند عکس بفرستد و پازل بسازد (روی سرور ذخیره می‌شود).
 * ۲) تشخیص تکمیل — سه لایه، هیچ‌کدام به سرور وابسته نیست:
 *    لایه‌ی ۱: بعد از هر جابه‌جایی، آرایه‌ی قطعه‌ها با «ترتیب درست» مقایسه می‌شود.
 *    لایه‌ی ۲: یک نگهبانِ زمان‌دار هر ۴۰۰ms دوباره بررسی می‌کند (اگر لایه‌ی ۱
 *              به هر دلیلی از دست رفت، این یکی جشن را می‌آورد).
 *    لایه‌ی ۳: دکمه‌ی «بررسی حل» که دختر خودش می‌تواند بزند.
 *    مهم‌تر از همه: جشن **بی‌درنگ و محلی** نشان داده می‌شود و ثبت نتیجه روی
 *    سرور بعداً انجام می‌شود؛ پس اگر شبکه کند/قطع بود، پایان بازی هرگز گم نمی‌شود.
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
  // نتیجه‌ی «بررسی حل»: چند قطعه سر جاست + کدام‌ها نه
  const [checkFlash, setCheckFlash] = useState<null | { correct: number; wrong: number[] }>(null)
  const finishedRef = useRef(false)
  const secondsRef = useRef(0)
  const movesRef = useRef(0)
  const tilesRef = useRef<number[]>([])
  const activeRef = useRef<P | null>(null)
  const flashTimer = useRef<number | null>(null)

  const size = active?.level || 3
  const solved = useMemo(() => isSolved(tiles), [tiles])

  useEffect(() => { secondsRef.current = seconds }, [seconds])
  useEffect(() => { movesRef.current = moves }, [moves])
  useEffect(() => { tilesRef.current = tiles }, [tiles])
  useEffect(() => { activeRef.current = active }, [active])

  useEffect(() => {
    if (!active || solved || result) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [active, solved, result])

  /**
   * پایان بازی — جشن بی‌درنگ و محلی.
   * نتیجه‌ی سرور (پیام بابا، ویس، رکورد) بعداً روی همان جشن می‌نشیند؛ اگر سرور
   * کند یا خاموش باشد هم چیزی از دست نمی‌رود.
   */
  const finish = (finalSeconds: number, finalMoves: number) => {
    const puzzle = activeRef.current
    if (finishedRef.current || !puzzle) return
    finishedRef.current = true
    setCheckFlash(null)
    setSelected(null)
    setResult({
      message: '',
      voice: null,
      best_time: finalSeconds,
      new_record: false,
      seconds: finalSeconds,
      moves: finalMoves,
    })
    playSuccess()
    void post<{ message: string; voice: string | null; best_time: number; new_record: boolean }>(`/puzzles/${puzzle.id}/complete`, {
      seconds: finalSeconds,
    })
      .then((r) => {
        setResult({
          message: r?.message || '',
          voice: r?.voice ?? null,
          best_time: r?.best_time ?? finalSeconds,
          new_record: !!r?.new_record,
          seconds: finalSeconds,
          moves: finalMoves,
        })
        void reload()
      })
      .catch(() => {
        // سرور نرسید — جشن همان جشن است، فقط پیام محلی می‌گذاریم
        setResult((cur) =>
          cur
            ? { ...cur, message: cur.message || t('puzzle.offlineWin'), best_time: finalSeconds, seconds: finalSeconds, moves: finalMoves }
            : cur,
        )
      })
  }

  // نگهبانِ زمان‌دار: اگر به هر دلیلی پایان از دست رفت، این‌جا جشن را می‌آورد
  useEffect(() => {
    if (!active || result) return
    const id = window.setInterval(() => {
      if (!finishedRef.current && isSolved(tilesRef.current)) finish(secondsRef.current, movesRef.current)
    }, 400)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, result])

  const start = async (p: P) => {
    playClick()
    finishedRef.current = false
    setActive(p)
    activeRef.current = p
    const n = p.level * p.level
    const s = shuffled(n)
    // اطمینان مضاعف: اگر شانسی مرتب شد، دوباره بریز
    const next = isSolved(s) ? shuffled(n) : s
    tilesRef.current = next
    setTiles(next)
    setSelected(null)
    setSeconds(0)
    secondsRef.current = 0
    setMoves(0)
    movesRef.current = 0
    setHints(0)
    setResult(null)
    setCheckFlash(null)
    await post(`/puzzles/${p.id}/start`).catch(() => undefined)
  }

  /**
   * «بررسی حل» — همان چیزی که دختر می‌تواند هر وقت خواست بزند:
   * اگر مرتب باشد جشن می‌آید، اگر نه می‌گوید چند قطعه سر جاست و کدام‌ها نیست.
   */
  const checkSolution = () => {
    if (!active || result) return
    playClick()
    const cur = tilesRef.current
    if (isSolved(cur)) {
      finish(secondsRef.current, movesRef.current)
      return
    }
    const wrong: number[] = []
    cur.forEach((v, i) => {
      if (v !== i) wrong.push(i)
    })
    setCheckFlash({ correct: cur.length - wrong.length, wrong })
    if (flashTimer.current) window.clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setCheckFlash(null), 3200)
  }

  useEffect(() => () => { if (flashTimer.current) window.clearTimeout(flashTimer.current) }, [])

  const tap = (i: number) => {
    if (solved || result || !active) return
    playClick()
    if (selected === null) {
      setSelected(i)
      return
    }
    if (selected === i) {
      setSelected(null)
      return
    }
    // همیشه از تازه‌ترین وضعیت می‌خوانیم (نه از کپیِ بسته‌ی کلیک)
    const cur = tilesRef.current.length === size * size ? tilesRef.current : tiles
    const next = [...cur]
    ;[next[selected], next[i]] = [next[i], next[selected]]
    const nextMoves = movesRef.current + 1
    tilesRef.current = next
    setTiles(next)
    setMoves(nextMoves)
    movesRef.current = nextMoves
    setSelected(null)
    setCheckFlash(null)
    if (isSolved(next)) {
      finish(secondsRef.current, nextMoves)
    }
  }

  const useHint = () => {
    if (!active || hints >= active.max_hints) return
    setHints((h) => h + 1)
    setShowHint(true)
    setTimeout(() => setShowHint(false), 2200)
  }

  /** به‌هم ریختن دوباره — هم state و هم ref با هم به‌روز می‌شوند */
  const shuffleNow = () => {
    if (!active || result) return
    playClick()
    let next = shuffled(size * size)
    if (isSolved(next)) next = shuffled(size * size)
    tilesRef.current = next
    setTiles(next)
    setSelected(null)
    setCheckFlash(null)
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
          // برای size=1 تقسیم بر صفر پیش نیاید
          const posX = size > 1 ? (col / (size - 1)) * 100 : 0
          const posY = size > 1 ? (row / (size - 1)) * 100 : 0
          // حالت «بررسی حل»: سبز = سرِ جاش، قرمز = نابجا
          const isWrong = !!checkFlash && !result && !correct
          const outline = selected === i
            ? '3px solid var(--os-accent)'
            : checkFlash && !result
              ? correct
                ? '2px solid rgba(52,211,153,.95)'
                : '2px solid rgba(248,113,113,.95)'
              : correct
                ? '2px solid rgba(52,211,153,.9)'
                : 'none'
          return (
            <motion.button
              key={i}
              onClick={() => tap(i)}
              className="relative overflow-hidden"
              style={{
                backgroundImage: active.image ? `url(${active.image})` : 'linear-gradient(135deg,#ff9ecb,#bba0fb)',
                backgroundSize: `${size * 100}% ${size * 100}%`,
                backgroundPosition: `${posX}% ${posY}%`,
                outline,
                outlineOffset: -2,
              }}
              animate={isWrong ? { x: [0, -3, 3, -2, 2, 0] } : { x: 0 }}
              transition={{ duration: 0.4 }}
              whileTap={{ scale: 0.92 }}
              aria-label={`${i + 1}`}
            />
          )
        })}
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
        <button className="os-btn flex-1" onClick={shuffleNow}>{t('puzzle.shuffle')}</button>
        <button className="os-btn-primary flex-1" onClick={checkSolution}>{t('puzzle.check')}</button>
      </div>

      <AnimatePresence>
        {checkFlash && !result && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="os-card text-center text-xs leading-6"
            style={{ color: 'var(--os-accent)' }}
          >
            {t('puzzle.checkResult', { correct: digits(checkFlash.correct), total: digits(size * size) })}
          </motion.p>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {result && <WinOverlay result={result} onReplay={() => void start(active)} />}
      </AnimatePresence>
    </div>
  )
}
