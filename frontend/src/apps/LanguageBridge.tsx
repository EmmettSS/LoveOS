/**
 * LanguageBridge — پل زبان 💬
 *
 * بابا و دخترم زبان همدیگر را یاد می‌گیرند: مازندرانی، ترکی، فارسی و انگلیسی.
 *
 *   ۱) دیکشنری: کلمه و اصطلاح با ترجمه‌ها، معنیِ تحت‌اللفظی و معنیِ واقعی
 *   ۲) فلش‌کارت: کارت‌ها را برمی‌گردانی، «یاد گرفتم» می‌زنی و streak بالا می‌رود
 *   ۳) تلفظ: با میکروفن خودت صدای کلمه را ضبط می‌کنی و روی همان کلمه می‌ماند
 *   ۴) کوییز: سؤال‌ها فقط از پنل بابا می‌آید (اپ اجازه‌ی ساختن سؤال از خودش ندارد)
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post, upload } from '../shared/api'
import { digits } from '../shared/format'
import { formatClock, micSupported, useRecorder } from '../shared/recorder'
import { playError, playSuccess, playClick } from '../shared/sound'
import { ApiStatus, AudioPlayer, Chips, Empty, Loading, SectionTitle, useApi } from '../shared/ui'

type Owner = 'daddy' | 'daughter'

interface Entry {
  id: number
  kind: 'word' | 'idiom'
  kind_label: string
  text: string
  language: string
  language_label: string
  translations: Record<string, string>
  translation_labels: string
  literal_meaning: string
  real_meaning: string
  example: string
  pronunciation: string | null
  category: number | null
  category_name: string
  category_icon: string
  added_by: Owner
  added_by_label: string
}

interface Progress {
  owner: Owner
  owner_label: string
  learned_count: number
  streak: number
  best_streak: number
  total_entries: number
}

interface Overview {
  entries: Entry[]
  categories: { id: number; name: string; icon: string; detail: string; count: number }[]
  languages: { key: string; label: string }[]
  stats: {
    words: number
    idioms: number
    with_audio: number
    quiz_count: number
    progress: Progress[]
    by_language: { key: string; label: string; count: number }[]
  }
}

type Tab = 'dictionary' | 'flash' | 'quiz'

export default function LanguageBridge() {
  const { t } = useTranslation()
  const overview = useApi<Overview>('/language/overview')
  const [tab, setTab] = useState<Tab>('dictionary')
  // پنل همیشه مال دختر است؛ سوییچ 👧/👨 حذف شد (درخواست صاحب پروژه)
  const owner: Owner = 'daughter'

  if (overview.loading || overview.error) return <ApiStatus loading={overview.loading} error={overview.error} onRetry={() => void overview.reload()} />
  if (!overview.data) return <Empty />
  const data = overview.data
  const myProgress = data.stats.progress.find((p) => p.owner === owner)

  return (
    <div className="space-y-3">
      <div className="os-card flex items-center gap-3 p-3">
        <span className="text-2xl">💬</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">
            {myProgress ? myProgress.owner_label : t('language.title')} • {digits(myProgress?.learned_count || 0)}/
            {digits(myProgress?.total_entries || 0)} {t('language.words')}
          </p>
          <p className="text-[11px] os-muted">
            🔥 {t('language.streak')}: {digits(myProgress?.streak || 0)} {t('os.days')} • 🏆{' '}
            {t('language.bestStreak')}: {digits(myProgress?.best_streak || 0)}
          </p>
        </div>
        <div className="w-16 shrink-0">
          <div className="h-2 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
            <motion.div
              className="h-full rounded-full"
              style={{ background: 'var(--os-accent)' }}
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, ((myProgress?.learned_count || 0) / Math.max(1, myProgress?.total_entries || 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>

      <Chips
        items={[
          { key: 'dictionary' as Tab, label: t('language.tab.dictionary') },
          { key: 'flash' as Tab, label: t('language.tab.flash') },
          { key: 'quiz' as Tab, label: t('language.tab.quiz') },
        ]}
        value={tab}
        onChange={setTab}
      />

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === 'dictionary' && (
            <DictionaryTab data={data} owner={owner} onChanged={overview.reload} />
          )}
          {tab === 'flash' && <FlashTab languages={data.languages} categories={data.categories} owner={owner} onChanged={overview.reload} />}
          {tab === 'quiz' && <QuizTab owner={owner} quizCount={data.stats.quiz_count} onChanged={overview.reload} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ----------------------------------------------------------- دیکشنری ---- */
function DictionaryTab({ data, owner, onChanged }: { data: Overview; owner: Owner; onChanged: () => void }) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<'all' | 'word' | 'idiom'>('all')
  const [language, setLanguage] = useState('all')
  const [category, setCategory] = useState('all')
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (kind !== 'all') p.set('kind', kind)
    if (language !== 'all') p.set('language', language)
    if (category !== 'all') p.set('category', category)
    if (q.trim()) p.set('q', q.trim())
    const s = p.toString()
    return `/language/entries${s ? `?${s}` : ''}`
  }, [kind, language, category, q])

  const list = useApi<{ items: Entry[] }>(query)
  const items = list.data?.items || []

  return (
    <div className="space-y-3">
      <div className="os-card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Icon name="search" size={15} />
          <input
            className="os-input !border-0 !bg-transparent !px-1 !py-1"
            placeholder={t('language.searchPlaceholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button className="os-btn-primary shrink-0 !px-3 !py-1.5 text-xs" onClick={() => setAdding((v) => !v)}>
            <Icon name={adding ? 'minus' : 'plus'} size={14} />
          </button>
        </div>
        <Chips
          items={[
            { key: 'all' as const, label: t('os.all') },
            { key: 'word' as const, label: t('language.kind.word') },
            { key: 'idiom' as const, label: t('language.kind.idiom') },
          ]}
          value={kind}
          onChange={setKind}
        />
        <div className="flex flex-wrap gap-1.5">
          <button className={`os-chip ${language === 'all' ? 'os-chip-active' : ''}`} onClick={() => setLanguage('all')}>
            {t('language.allLanguages')}
          </button>
          {data.languages.map((l) => (
            <button
              key={l.key}
              className={`os-chip ${language === l.key ? 'os-chip-active' : ''}`}
              onClick={() => setLanguage(l.key)}
            >
              {l.label}
            </button>
          ))}
          {data.categories.map((c) => (
            <button
              key={c.id}
              className={`os-chip ${category === String(c.id) ? 'os-chip-active' : ''}`}
              onClick={() => setCategory(category === String(c.id) ? 'all' : String(c.id))}
            >
              {c.icon} {c.name}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {adding && (
          <AddEntryForm
            languages={data.languages}
            categories={data.categories}
            onDone={async () => {
              setAdding(false)
              await list.reload()
              onChanged()
            }}
          />
        )}
      </AnimatePresence>

      {list.error ? (
        <ApiStatus loading={false} error={list.error} onRetry={() => void list.reload()} />
      ) : list.loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty text={t('language.empty')} />
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <EntryCard key={e.id} entry={e} owner={owner} onChanged={async () => { await list.reload(); onChanged() }} />
          ))}
        </div>
      )}
    </div>
  )
}

function EntryCard({ entry, owner, onChanged }: { entry: Entry; owner: Owner; onChanged: () => Promise<void> | void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [audio, setAudio] = useState<{ file: File; url: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const rec = useRecorder()

  const otherLang = entry.language === 'tr' ? 'fa' : 'tr'
  const translated = entry.translations?.[otherLang] || entry.translations?.fa || ''

  const savePronunciation = async () => {
    if (!audio) return
    setSaving(true)
    const fd = new FormData()
    fd.append('pronunciation', audio.file, audio.file.name)
    try {
      await upload(`/language/entries/${entry.id}`, fd)
      playSuccess()
      setAudio(null)
      await onChanged()
    } catch {
      playError()
    }
    setSaving(false)
  }

  return (
    <motion.div layout className="os-card overflow-hidden">
      <button className="flex w-full items-center gap-3 p-3 text-start" onClick={() => { playClick(); setOpen((v) => !v) }}>
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg" style={{ background: 'var(--os-accent-soft)' }}>
          {entry.category_icon || '💬'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{entry.text}</p>
          <p className="truncate text-[11px] os-muted">
            {entry.language_label} → {translated || entry.translation_labels}
          </p>
        </div>
        {entry.pronunciation && <Icon name="voice" size={16} />}
        <Icon name={open ? 'minus' : 'forward'} size={15} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2 px-3 pb-3">
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {Object.entries(entry.translations || {}).map(([lang, value]) => (
                  <span key={lang} className="os-chip">
                    {lang === 'tr' ? '🇹🇷' : lang === 'en' ? '🇬🇧' : lang === 'mzn' ? '🌾' : '🇮🇷'} {value}
                  </span>
                ))}
                <span className="os-chip">{entry.kind_label}</span>
                {entry.added_by_label && <span className="os-chip">{entry.added_by_label}</span>}
              </div>
              {entry.literal_meaning && (
                <p className="text-[11px] os-muted">
                  📖 {t('language.literal')}: {entry.literal_meaning}
                </p>
              )}
              {entry.real_meaning && (
                <p className="text-[11px]">
                  💡 {t('language.real')}: {entry.real_meaning}
                </p>
              )}
              {entry.example && <p className="text-[11px] os-muted">✍️ {entry.example}</p>}

              {entry.pronunciation && (
                <AudioPlayer src={entry.pronunciation} title={t('language.pronunciation')} subtitle={entry.text} compact />
              )}

              {micSupported() && (
                <div className="rounded-xl p-2" style={{ background: 'var(--os-border)' }}>
                  {!audio && !rec.recording && (
                    <button className="os-btn w-full !py-2 text-xs" onClick={() => void rec.start()}>
                      <Icon name="mic" size={14} /> {t('language.recordPronunciation')}
                    </button>
                  )}
                  {rec.recording && (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 text-xs" style={{ color: '#e2557f' }}>
                        <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> {formatClock(rec.seconds)}
                      </span>
                      <button
                        className="os-btn ms-auto !py-1.5 text-xs"
                        onClick={async () => {
                          const r = await rec.stop()
                          if (r) setAudio({ file: r.file, url: r.url })
                        }}
                      >
                        <Icon name="stop" size={13} /> {t('language.stop')}
                      </button>
                      <button className="os-btn !py-1.5 text-xs" onClick={rec.cancel}>
                        {t('os.cancel')}
                      </button>
                    </div>
                  )}
                  {audio && (
                    <div className="flex items-center gap-2">
                      <audio controls src={audio.url} className="h-8 flex-1" />
                      <button className="os-btn-primary shrink-0 !px-3 !py-1.5 text-xs" disabled={saving} onClick={() => void savePronunciation()}>
                        {t('os.save')}
                      </button>
                    </div>
                  )}
                </div>
              )}
              {rec.error && (
                <p className="text-[11px]" style={{ color: '#e2557f' }}>
                  <Icon name="mic" size={12} /> {t('language.micError')}
                </p>
              )}

              <p className="text-[10px] os-muted">
                👤 {owner === 'daddy' ? t('language.daddy') : t('language.me')}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function AddEntryForm({
  languages,
  categories,
  onDone,
}: {
  languages: Overview['languages']
  categories: Overview['categories']
  onDone: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [kind, setKind] = useState<'word' | 'idiom'>('word')
  const [text, setText] = useState('')
  const [language, setLanguage] = useState('mzn')
  const [tr, setTr] = useState('')
  const [fa, setFa] = useState('')
  const [literal, setLiteral] = useState('')
  const [real, setReal] = useState('')
  const [example, setExample] = useState('')
  const [category, setCategory] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) {
      setError(t('language.needText'))
      playError()
      return
    }
    setSaving(true)
    try {
      await post('/language/entries', {
        kind,
        text: text.trim(),
        language,
        translations: { fa: fa.trim(), tr: tr.trim() },
        literal_meaning: literal,
        real_meaning: real,
        example,
        category: category || undefined,
        added_by: 'daughter',
      })
      playSuccess()
      await onDone()
    } catch {
      setError(t('common.tryAgain'))
    }
    setSaving(false)
  }

  return (
    <motion.form
      onSubmit={submit}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="os-card space-y-2 overflow-hidden p-3"
    >
      <p className="text-sm font-semibold">{t('language.addTitle')}</p>
      <Chips
        items={[
          { key: 'word' as const, label: t('language.kind.word') },
          { key: 'idiom' as const, label: t('language.kind.idiom') },
        ]}
        value={kind}
        onChange={setKind}
      />
      <input className="os-input" placeholder={t('language.textPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap gap-1.5">
        {languages.map((l) => (
          <button
            key={l.key}
            type="button"
            className={`os-chip ${language === l.key ? 'os-chip-active' : ''}`}
            onClick={() => setLanguage(l.key)}
          >
            {l.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className="os-input" placeholder="فارسی" value={fa} onChange={(e) => setFa(e.target.value)} />
        <input className="os-input" placeholder="Türkçe / English" value={tr} onChange={(e) => setTr(e.target.value)} />
      </div>
      {kind === 'idiom' && (
        <>
          <input className="os-input" placeholder={t('language.literalPlaceholder')} value={literal} onChange={(e) => setLiteral(e.target.value)} />
          <input className="os-input" placeholder={t('language.realPlaceholder')} value={real} onChange={(e) => setReal(e.target.value)} />
        </>
      )}
      <input className="os-input" placeholder={t('language.examplePlaceholder')} value={example} onChange={(e) => setExample(e.target.value)} />
      <select className="os-input" value={category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">{t('home.noCategory')}</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.icon} {c.name}
          </option>
        ))}
      </select>
      {error && <p className="text-[11px]" style={{ color: '#e2557f' }}>{error}</p>}
      <button className="os-btn-primary w-full" type="submit" disabled={saving}>
        {t('os.add')}
      </button>
    </motion.form>
  )
}

/* --------------------------------------------------------- فلش‌کارت ---- */
interface Card {
  id: number
  question: string
  answer: string
  language_label: string
  category: string
  category_icon: string
  example: string
  literal: string
  real: string
  pronunciation: string | null
  target_language: string
}

function FlashTab({
  languages,
  categories,
  owner,
  onChanged,
}: {
  languages: Overview['languages']
  categories: Overview['categories']
  owner: Owner
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [target, setTarget] = useState('tr')
  const [category, setCategory] = useState('all')
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [learned, setLearned] = useState<number[]>([])
  const [correct, setCorrect] = useState(0)
  const [done, setDone] = useState(false)

  const path = useMemo(() => {
    const p = new URLSearchParams({ owner, target, count: '10' })
    if (category !== 'all') p.set('category', category)
    return `/language/flashcards?${p.toString()}`
  }, [owner, target, category])

  const deck = useApi<{ items: Card[]; remaining: number; total: number }>(path)
  const cards = deck.data?.items || []
  const card = cards[index]

  const next = async (known: boolean) => {
    if (!card) return
    if (known) {
      playSuccess()
      setLearned((v) => (v.includes(card.id) ? v : [...v, card.id]))
      setCorrect((c) => c + 1)
    } else {
      playClick()
    }
    setFlipped(false)
    if (index + 1 >= cards.length) {
      await post('/language/practice', {
        owner,
        mode: 'flash',
        learned_ids: known ? [...learned, card.id] : learned,
        correct: known ? correct + 1 : correct,
        total: cards.length,
      })
      setDone(true)
      onChanged()
      return
    }
    setIndex((i) => i + 1)
  }

  const restart = () => {
    setIndex(0)
    setLearned([])
    setCorrect(0)
    setDone(false)
    setFlipped(false)
    void deck.reload()
  }

  if (deck.error) return <ApiStatus loading={false} error={deck.error} onRetry={() => void deck.reload()} />
  if (deck.loading) return <Loading />
  if (cards.length === 0) return <Empty text={t('language.noCards')} />

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] os-muted">{t('language.practiceTarget')}:</span>
        {languages.map((l) => (
          <button key={l.key} className={`os-chip ${target === l.key ? 'os-chip-active' : ''}`} onClick={() => { setTarget(l.key); restart() }}>
            {l.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className={`os-chip ${category === 'all' ? 'os-chip-active' : ''}`} onClick={() => { setCategory('all'); restart() }}>
          {t('os.all')}
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            className={`os-chip ${category === String(c.id) ? 'os-chip-active' : ''}`}
            onClick={() => { setCategory(String(c.id)); restart() }}
          >
            {c.icon} {c.name}
          </button>
        ))}
      </div>

      {done ? (
        <div className="os-card space-y-2 p-5 text-center">
          <p className="text-4xl">🌟</p>
          <p className="text-sm font-semibold">{t('language.roundDone', { correct: digits(correct), total: digits(cards.length) })}</p>
          <p className="text-[11px] os-muted">{t('language.streakHint')}</p>
          <button className="os-btn-primary mx-auto !px-5 !py-2 text-xs" onClick={restart}>
            <Icon name="retry" size={14} /> {t('language.again')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[11px] os-muted">
            <span>
              {digits(index + 1)} / {digits(cards.length)}
            </span>
            <span>
              ✅ {digits(correct)} • {t('language.remaining', { count: digits(deck.data?.remaining ?? 0) })}
            </span>
          </div>

          <motion.button
            key={`${card.id}-${flipped}`}
            initial={{ rotateY: flipped ? -90 : 90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            transition={{ duration: 0.25 }}
            onClick={() => setFlipped((v) => !v)}
            className="os-card flex min-h-[190px] w-full flex-col items-center justify-center gap-2 p-5 text-center"
          >
            <span className="os-chip">
              {card.category_icon} {card.category || card.language_label}
            </span>
            {!flipped ? (
              <>
                <p className="os-title text-2xl">{card.question}</p>
                <p className="text-[11px] os-muted">{t('language.tapToFlip')}</p>
              </>
            ) : (
              <>
                <p className="os-title text-2xl" style={{ color: 'var(--os-accent)' }}>
                  {card.answer || '—'}
                </p>
                {card.real && <p className="text-xs">💡 {card.real}</p>}
                {card.example && <p className="text-[11px] os-muted">✍️ {card.example}</p>}
              </>
            )}
            {card.pronunciation && <AudioPlayer src={card.pronunciation} compact accent="#c4b5fd" />}
          </motion.button>

          <div className="flex gap-2">
            <button className="os-btn flex-1" onClick={() => void next(false)}>
              {t('language.notYet')}
            </button>
            <button className="os-btn-primary flex-1" onClick={() => void next(true)}>
              <Icon name="check" size={14} /> {t('language.learned')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- کوییز --- */
interface QuizQuestion {
  id: number
  question: string
  options: string[]
  category: string
  category_icon: string
  feedback: string
}

function QuizTab({ owner, quizCount, onChanged }: { owner: Owner; quizCount: number; onChanged: () => void }) {
  const { t } = useTranslation()
  const [started, setStarted] = useState(false)
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<{ id: number; answer: string }[]>([])
  const [result, setResult] = useState<{ correct: number; total: number; details: any[]; message: string } | null>(null)
  const quiz = useApi<{ items: QuizQuestion[]; count: number }>(started ? '/language/quiz?count=8' : null)

  const questions = quiz.data?.items || []
  const current = questions[index]

  const answer = async (option: string) => {
    if (!current) return
    const nextAnswers = [...answers, { id: current.id, answer: option }]
    setAnswers(nextAnswers)
    if (index + 1 >= questions.length) {
      const res = await post<{ correct: number; total: number; details: any[]; message: string }>('/language/quiz/submit', {
        owner,
        answers: nextAnswers,
      })
      if (res.correct === res.total) playSuccess()
      else playError()
      setResult(res)
      onChanged()
      return
    }
    playClick()
    setIndex((i) => i + 1)
  }

  if (quizCount === 0) {
    return (
      <Empty text={t('language.noQuiz')} />
    )
  }

  if (!started) {
    return (
      <div className="os-card space-y-3 p-5 text-center">
        <p className="text-4xl">🎯</p>
        <p className="text-sm leading-7">{t('language.quizIntro', { count: digits(quizCount) })}</p>
        <button className="os-btn-primary mx-auto !px-5 !py-2 text-xs" onClick={() => setStarted(true)}>
          {t('language.quizStart')}
        </button>
      </div>
    )
  }

  if (result) {
    return (
      <div className="space-y-3">
        <div className="os-card space-y-2 p-4 text-center">
          <p className="os-title text-3xl" style={{ color: 'var(--os-accent)' }}>
            {digits(result.correct)} / {digits(result.total)}
          </p>
          <p className="text-sm">{result.message}</p>
          <button
            className="os-btn-primary mx-auto !px-5 !py-2 text-xs"
            onClick={() => {
              setResult(null)
              setAnswers([])
              setIndex(0)
              void quiz.reload()
            }}
          >
            <Icon name="retry" size={14} /> {t('language.again')}
          </button>
        </div>
        <SectionTitle>{t('language.answers')}</SectionTitle>
        <div className="space-y-2">
          {result.details.map((d, i) => (
            <div key={`${d.id}-${i}`} className="os-card space-y-1 p-3">
              <p className="text-sm">{d.explanation}</p>
              <p className="text-[11px]" style={{ color: d.correct ? '#3f9161' : '#e2557f' }}>
                {d.correct ? '✅' : '❌'} {t('language.yourAnswer')}: {d.given || '—'}
              </p>
              {!d.correct && (
                <p className="text-[11px] os-muted">
                  ✅ {t('language.rightAnswer')}: {d.answer}
                </p>
              )}
              {d.feedback && <p className="text-[11px] os-muted">💬 {d.feedback}</p>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (quiz.error) return <ApiStatus loading={false} error={quiz.error} onRetry={() => void quiz.reload()} />
  if (quiz.loading || !current) return <Loading />

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[11px] os-muted">
        <span>
          {digits(index + 1)} / {digits(questions.length)}
        </span>
        <span>
          {current.category_icon} {current.category}
        </span>
      </div>
      <div className="os-card space-y-3 p-4">
        <p className="text-base font-semibold leading-7">{current.question}</p>
        <div className="space-y-2">
          {current.options.map((o) => (
            <button
              key={o}
              onClick={() => void answer(o)}
              className="os-btn w-full !justify-start !py-2.5 text-sm"
            >
              {o}
            </button>
          ))}
        </div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: 'var(--os-accent)' }}
          animate={{ width: `${((index + 1) / questions.length) * 100}%` }}
        />
      </div>
    </div>
  )
}
