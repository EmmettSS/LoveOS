/**
 * GlobalSearch.tsx — جستجوی سراسری LoveOS 🔎
 *
 * یک پالت روی همه‌چیز: پیام‌ها، نامه‌ها، صداها، خاطره‌ها، آهنگ‌ها، کتاب‌ها،
 * هدیه‌ها، خونه‌ی رویایی، کلمه‌های پل زبان، تماس‌ها و… .
 *
 * باز شدن:
 *   • Ctrl/⌘ + K از هر جای سیستم
 *   • آیکن ذره‌بین در Dock
 *   • منوی شروع (Start Menu)
 *
 * خروجی هر نتیجه به اپ خودش پرتاب می‌شود: با کلیک روی نتیجه، اپ مربوطه باز
 * می‌شود و props همان رکورد به آن داده می‌شود (مثلاً کتاب و فصل).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import type { IconName } from '../shared/Icon'
import { get } from '../shared/api'
import { digits } from '../shared/format'
import { playClick, playOpen } from '../shared/sound'
import { useOS } from '../shared/store'
import { useDepthFactor } from '../shared/depth'
import { APPS, appByKey } from './appRegistry'

interface Hit {
  source: string
  source_label: string
  icon: string
  color: string
  app: string
  title: string
  snippet: string
  date: string | null
  payload: Record<string, unknown>
}

interface Group {
  source: string
  label: string
  icon: string
  color: string
  app: string
  items: Hit[]
}

interface Source {
  key: string
  label: string
  icon: string
  color: string
  app: string
}

interface Suggestion {
  key: string
  label: string
  icon: string
  color: string
  app: string
  query: string
}

interface SearchPayload {
  query: string
  total: number
  groups: Group[]
  sources: Source[]
  suggestions?: Suggestion[]
}

/** آیکن‌های API با آیکن‌های رابط نگاشت می‌شوند (اسم ناشناس → findheart) */
const ICON_FALLBACKS: Record<string, IconName> = {
  letter: 'whisper',
  memory: 'memories',
  voice: 'voice',
  song: 'music',
  book: 'book',
  chat: 'chat',
  gift: 'gift',
  call: 'call',
  home: 'dreamhome',
  language: 'language',
  reading: 'reading',
  quiz: 'quiz',
  plan: 'plans',
  achievement: 'achievements',
  key: 'key',
  star: 'star',
}

function iconFor(name: string): IconName {
  const known = APPS.find((a) => a.icon === name)?.icon
  return known || ICON_FALLBACKS[name] || 'findheart'
}

export function GlobalSearch() {
  const { t } = useTranslation()
  const dz = useDepthFactor()
  const open = useOS((s) => s.commandOpen)
  const toggle = useOS((s) => s.toggleCommand)
  const openApp = useOS((s) => s.openApp)
  const [q, setQ] = useState('')
  const [appFilter, setAppFilter] = useState('')
  const [payload, setPayload] = useState<SearchPayload | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  /* --------------------------------------------------- میان‌بر Ctrl/⌘+K */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        playClick()
        toggle()
      }
      if (e.key === 'Escape' && useOS.getState().commandOpen) toggle(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle])

  /* -------------------------------------------------- پیشنهادهای حالت خالی */
  useEffect(() => {
    if (!open) return
    setQ('')
    setAppFilter('')
    setPayload(null)
    inputRef.current?.focus()
    get<{ items: Suggestion[] }>('/search?suggest=1')
      .then((r) => setSuggestions(r.items || []))
      .catch(() => setSuggestions([]))
  }, [open])

  /* --------------------------------------------------------- جستجوی زنده */
  useEffect(() => {
    if (!open) return
    const query = q.trim()
    if (query.length < 2) {
      setPayload(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query })
      if (appFilter) params.set('app', appFilter)
      get<SearchPayload>(`/search?${params.toString()}`, { signal: controller.signal })
        .then((r) => setPayload(r))
        .catch(() => undefined)
        .finally(() => setLoading(false))
    }, 260)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [q, appFilter, open])

  const total = payload?.total ?? 0
  const groups = payload?.groups || []
  const sourceChips = useMemo(() => payload?.sources || [], [payload])

  const go = (app: string, props?: Record<string, unknown>) => {
    playOpen()
    if (appByKey(app)) openApp(app, props)
    toggle(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[65] bg-black/35 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => toggle(false)}
          />
          {/* پوسته‌ی تمام‌عرضِ وسط‌چین: مثل منوی شروع، translate روی خودِ
              motion در RTL پنل را نصفه از صفحه بیرون می‌برد. */}
          <motion.div
            // جستجوی سراسری از **بالا** می‌آید (مثلِ یک نورافکن که روی
            // دسکتاپ می‌افتد)، پس لبه‌ی بالایی‌اش به سمتِ بیننده برمی‌گردد
            // و بعد تخت می‌شود. علامتِ rotateX عمداً برعکسِ کشوهای پایینی
            // است تا جهتِ چرخش با جهتِ ورود یکی بماند.
            initial={{ opacity: 0, y: -18, scale: 0.98, rotateX: 8 * dz }}
            animate={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
            exit={{ opacity: 0, y: -12, scale: 0.98, rotateX: 6 * dz }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="pointer-events-none fixed inset-x-0 top-4 z-[70] flex justify-center md:top-16"
            style={{ transformPerspective: 1100 }}
          >
            <div className="os-card pointer-events-auto mx-3 flex max-h-[82vh] w-full max-w-[620px] flex-col overflow-hidden p-0">
            {/* نوار جستجو */}
            <div className="flex items-center gap-2 border-b p-3" style={{ borderColor: 'var(--os-border)' }}>
              <Icon name="findheart" size={18} />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('search.placeholder')}
                className="os-input !border-0 !bg-transparent !px-1 !py-1"
                autoFocus
              />
              {q && (
                <button className="os-muted" onClick={() => setQ('')}>
                  <Icon name="close" size={15} />
                </button>
              )}
              <kbd className="hidden shrink-0 rounded-md px-1.5 py-0.5 text-[10px] os-muted md:block" style={{ background: 'var(--os-border)' }}>
                Esc
              </kbd>
            </div>

            {/* فیلتر اپ */}
            {sourceChips.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto px-3 py-2 no-scrollbar">
                <button className={`os-chip ${!appFilter ? 'os-chip-active' : ''}`} onClick={() => setAppFilter('')}>
                  {t('os.all')}
                </button>
                {sourceChips.map((s) => (
                  <button
                    key={s.key}
                    className={`os-chip shrink-0 ${appFilter === s.key ? 'os-chip-active' : ''}`}
                    onClick={() => setAppFilter(appFilter === s.key ? '' : s.key)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {/* حالت خالی: پیشنهادها */}
              {q.trim().length < 2 && (
                <div className="space-y-3 py-2">
                  <p className="text-[11px] os-muted">{t('search.suggestions')}</p>
                  {suggestions.length === 0 ? (
                    <p className="py-6 text-center text-xs os-muted">{t('search.hint')}</p>
                  ) : (
                    <div className="grid gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s.key}
                          onClick={() => setQ(s.query)}
                          className="flex items-center gap-2 rounded-xl p-2 text-start text-xs transition hover:bg-black/5"
                        >
                          <Icon name={iconFor(s.icon)} size={15} />
                          <span className="flex-1 truncate">{s.label}</span>
                          <span className="truncate text-[10px] os-muted">{s.query}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {loading && <p className="py-4 text-center text-[11px] os-muted">{t('search.searching')}</p>}

              {!loading && q.trim().length >= 2 && total === 0 && (
                <p className="py-8 text-center text-xs os-muted">{t('search.nothing')}</p>
              )}

              {!loading &&
                groups.map((g) => (
                  <div key={g.source} className="mb-3">
                    <p className="mb-1 mt-3 flex items-center gap-1.5 text-[11px] os-muted">
                      <Icon name={iconFor(g.icon)} size={13} />
                      {g.label} • {digits(g.items.length)}
                    </p>
                    <div className="space-y-1.5">
                      {g.items.map((hit, i) => (
                        <button
                          key={`${g.source}-${i}`}
                          onClick={() =>
                            go(hit.app, {
                              focusId: hit.payload?.id,
                              bookId: hit.payload?.book,
                              chapterId: hit.payload?.chapter,
                              highlight: hit.title,
                            })
                          }
                          className="flex w-full items-start gap-2 rounded-xl p-2 text-start transition hover:bg-black/5"
                        >
                          <span
                            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                            style={{ background: `${g.color}22`, color: g.color }}
                          >
                            <Icon name={iconFor(g.icon)} size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold">{hit.title}</span>
                            {hit.snippet && <span className="block truncate text-[10px] os-muted">{hit.snippet}</span>}
                          </span>
                          {hit.date && <span className="shrink-0 text-[9px] os-muted">{hit.date}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] os-muted" style={{ borderColor: 'var(--os-border)' }}>
              <span>{t('search.footer')}</span>
              <span>{total > 0 ? t('search.results', { count: digits(total) }) : ''}</span>
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
