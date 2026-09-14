/**
 * Puzzle — پازل قلب
 * عکس به قطعات N×N تقسیم می‌شود؛ با جابه‌جایی دو قطعه مرتب می‌شود.
 * زمان، تعداد حرکت، رکورد و کمک محدود. در پایان پیام/ویس بابا.
 */
import { motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { digits, formatDuration } from '../shared/format'
import { playClick, playSuccess } from '../shared/sound'
import { AudioPlayer, Empty, Loading, useApi } from '../shared/ui'

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
  const [result, setResult] = useState<null | { message: string; voice: string | null; best_time: number; new_record: boolean }>(null)

  const size = active?.level || 3
  const solved = useMemo(() => tiles.length > 0 && tiles.every((v, i) => v === i), [tiles])

  useEffect(() => {
    if (!active || solved || result) return
    const id = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [active, solved, result])

  useEffect(() => {
    if (!solved || !active || result) return
    playSuccess()
    void post<{ message: string; voice: string | null; best_time: number; new_record: boolean }>(`/puzzles/${active.id}/complete`, { seconds })
      .then((r) => { setResult(r); void reload() })
      .catch(() => undefined)
  }, [solved, active, seconds, result, reload])

  const start = async (p: P) => {
    playClick()
    setActive(p)
    setTiles(shuffled(p.level * p.level))
    setSelected(null)
    setSeconds(0)
    setMoves(0)
    setHints(0)
    setResult(null)
    await post(`/puzzles/${p.id}/start`)
  }

  const tap = (i: number) => {
    if (solved) return
    playClick()
    if (selected === null) { setSelected(i); return }
    if (selected === i) { setSelected(null); return }
    setTiles((prev) => {
      const next = [...prev]
      ;[next[selected], next[i]] = [next[i], next[selected]]
      return next
    })
    setMoves((m) => m + 1)
    setSelected(null)
  }

  const useHint = () => {
    if (!active || hints >= active.max_hints) return
    setHints((h) => h + 1)
    setShowHint(true)
    setTimeout(() => setShowHint(false), 2200)
  }

  if (loading) return <Loading />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  if (!active) {
    return (
      <div className="space-y-3">
        <p className="text-center text-sm os-muted">{t('puzzle.choose')}</p>
        <div className="grid grid-cols-2 gap-3">
          {items.map((p) => (
            <button key={p.id} onClick={() => void start(p)} className="os-card overflow-hidden text-start">
              {p.image ? <img src={p.image} alt="" className="h-28 w-full object-cover" /> : <div className="h-28 w-full" style={{ background: 'var(--os-accent-soft)' }} />}
              <div className="p-3">
                <p className="os-title text-sm">{p.title}</p>
                <p className="text-[11px] os-muted">{t(`puzzle.levels.${p.level}`)}</p>
                {p.best_time > 0 && <p className="text-[11px] os-muted">{t('puzzle.best')}: {formatDuration(p.best_time)}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs">
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
          return (
            <motion.button
              key={i}
              layout
              onClick={() => tap(i)}
              className="relative overflow-hidden"
              style={{
                backgroundImage: active.image ? `url(${active.image})` : 'linear-gradient(135deg,#ff9ecb,#bba0fb)',
                backgroundSize: `${size * 100}% ${size * 100}%`,
                backgroundPosition: `${(col / (size - 1)) * 100}% ${(row / (size - 1)) * 100}%`,
                outline: selected === i ? '3px solid var(--os-accent)' : 'none',
                outlineOffset: -3,
              }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )
        })}
        {/* پیش‌نمایش کمک */}
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
      </div>

      {active.hint_text && showHint && <p className="text-center text-xs os-muted">{active.hint_text}</p>}

      <div className="flex gap-2">
        <button className="os-btn flex-1" onClick={() => void start(active)}>{t('puzzle.reset')}</button>
      </div>

      {result && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="os-card space-y-2 p-4 text-center">
          <p className="os-title text-lg" style={{ color: 'var(--os-accent)' }}>{t('puzzle.done')}</p>
          {result.new_record && <p className="text-xs os-muted">🏆 {t('puzzle.best')}: {formatDuration(result.best_time)}</p>}
          {result.message && <p className="text-sm leading-7">{result.message}</p>}
          {result.voice && <AudioPlayer src={result.voice} compact autoPlay />}
        </motion.div>
      )}
    </div>
  )
}
