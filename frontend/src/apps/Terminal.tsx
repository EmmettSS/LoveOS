/**
 * Terminal — ترمینال عشق
 * شبیه‌سازی ترمینال با دستورهای بامزه. خروجی‌ها از پنل بابا می‌آیند.
 * رازهای ④ و ⑤ سمت سرور وصل‌اند.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { post } from '../shared/api'
import { playTypeTick, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'

interface Line { kind: 'in' | 'out'; text: string }

interface TermResponse {
  output: string
  clear?: boolean
  exit?: boolean
  open_app?: string
  action?: string
  sudo?: string
  effect?: string
  vibration_pattern?: number[]
  egg?: { title: string; message: string; attachment?: string } | null
}

export default function Terminal() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const openApp = useOS((s) => s.openApp)
  const closeAll = useOS((s) => s.windows)
  const showEgg = useOS((s) => s.showEgg)

  const [lines, setLines] = useState<Line[]>([{ kind: 'out', text: t('terminal.hint') }])
  const [value, setValue] = useState('')
  const [history, setHistory] = useState<string[]>([])
  const [hIndex, setHIndex] = useState(-1)
  const [sudoKind, setSudoKind] = useState<string | null>(null)
  const [kiss, setKiss] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [lines])

  const push = (l: Line) => setLines((prev) => [...prev, l])

  const run = async (e: React.FormEvent) => {
    e.preventDefault()
    const cmd = value.trim()
    if (!cmd) return
    setValue('')
    setHistory((h) => [cmd, ...h])
    setHIndex(-1)

    // مرحله‌ی دوم sudo: رمز الکی
    if (sudoKind) {
      push({ kind: 'in', text: '••••••' })
      const res = await post<TermResponse>('/terminal/sudo', { kind: sudoKind })
      push({ kind: 'out', text: res.output })
      if (res.effect === 'kiss') { setKiss(true); setTimeout(() => setKiss(false), 2600) }
      if (res.effect === 'hug' && res.vibration_pattern) vibrate(res.vibration_pattern)
      setSudoKind(null)
      return
    }

    push({ kind: 'in', text: cmd })
    const res = await post<TermResponse>('/terminal', { command: cmd })
    if (res.clear) { setLines([]); return }
    if (res.output) push({ kind: 'out', text: res.output })
    if (res.sudo) {
      setSudoKind(res.sudo)
      push({ kind: 'out', text: t('terminal.sudoPrompt', { name: config?.daughter_name || 'daughter' }) })
    }
    if (res.open_app) setTimeout(() => openApp(res.open_app!), 500)
    if (res.egg) showEgg({ title: res.egg.title, message: res.egg.message, attachment: res.egg.attachment })
    if (res.exit) setTimeout(() => { void closeAll }, 400)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const next = Math.min(hIndex + 1, history.length - 1)
      if (next >= 0) { setHIndex(next); setValue(history[next]) }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const next = hIndex - 1
      setHIndex(next)
      setValue(next >= 0 ? history[next] : '')
    } else {
      playTypeTick()
    }
  }

  return (
    <div className="relative">
      <div
        className="terminal max-h-[380px] min-h-[300px] overflow-y-auto rounded-2xl p-3 text-[13px] leading-6 no-scrollbar"
        onClick={() => inputRef.current?.focus()}
      >
        {lines.map((l, i) => (
          /* term-line → unicode-bidi: plaintext؛ قاطی فارسی و انگلیسی
             دیگر نمی‌ریزد: هر خط با زبان خودش درست چیده می‌شود */
          <pre key={i} className="term-line whitespace-pre-wrap" style={{ color: l.kind === 'in' ? '#ffd98a' : '#b6f4c8' }}>
            {l.kind === 'in' ? `$ ${l.text}` : l.text}
          </pre>
        ))}
        <form onSubmit={run} className="flex items-center gap-2">
          <span style={{ color: '#ffd98a' }}>{sudoKind ? '#' : '$'}</span>
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none"
            style={{ color: '#b6f4c8' }}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            type={sudoKind ? 'password' : 'text'}
            placeholder={sudoKind ? '' : t('terminal.placeholder')}
            autoFocus
            spellCheck={false}
            autoComplete="off"
          />
        </form>
        <div ref={endRef} />
      </div>

      {/* افکت بوسه‌ی sudo kiss */}
      {kiss && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {Array.from({ length: 14 }).map((_, i) => (
            <span
              key={i}
              className="absolute animate-rise text-2xl"
              style={{ left: `${5 + Math.random() * 90}%`, bottom: 0, animationDelay: `${Math.random()}s` }}
            >
              💋
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
