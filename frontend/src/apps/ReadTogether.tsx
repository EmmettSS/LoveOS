/**
 * ReadTogether — کتابخونه مشترک ما 📚
 *
 * قفسه‌ی مشترک برای بابا و دخترم — هر دو می‌توانند کتاب اضافه کنند،
 * فصل بنویسند، یادداشت و نقل‌قول بگذارند و درباره‌ی فصل‌ها گفتگو کنند.
 * (بخش اتصال به اپ کتابخونه‌ی سابق حذف شد تا منطق ساده و درست بماند.)
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post, upload } from '../shared/api'
import { digits } from '../shared/format'
import { playSuccess } from '../shared/sound'
import { Chips, Empty, Loading, SectionTitle, useApi } from '../shared/ui'

type Owner = 'daddy' | 'daughter'
type Status = 'want' | 'reading' | 'finished'

interface Book {
  id: number | string
  library_book: number | null
  title: string
  author: string
  cover: string | null
  status: Status
  status_label: string
  summary: string
  why_this_book: string
  pdf: string | null
  link: string
  is_physical: boolean
  chapters_count: number
  added_by: Owner
  added_by_label: string
  started_on: string | null
  finished_on: string | null
  source: 'library' | 'reading'
  progress: { daddy: number; daughter: number }
  notes_count: number
  quotes_count: number
}

interface Chapter {
  id: number
  book: number
  order: number
  title: string
  label: string
  text: string
  page_from: number | null
  page_to: number | null
  notes_count: number
  comments_count: number
  read_by: { daddy: boolean; daughter: boolean }
  notes?: Note[]
  comments?: Comment[]
  quotes?: Quote[]
}

interface Note {
  id: number
  owner: Owner
  owner_label: string
  text: string
  rating: number
  is_finished: boolean
  created_at: string
}

interface Comment {
  id: number
  owner: Owner
  owner_label: string
  text: string
  reply_to: number | null
  created_at: string
}

interface Quote {
  id: number
  owner: Owner
  owner_label: string
  book: number
  book_title: string
  chapter_label: string
  text: string
  comment: string
}

interface Overview {
  shelf: Record<Status, Book[]>
  counts: Record<Status, number>
  library?: Book[]
  recent_quotes: Quote[]
  stats: {
    books_total: number
    finished: number
    notes_total: number
    quotes_total: number
    both_finished: Book[]
  }
}

export default function ReadTogether() {
  const { t } = useTranslation()
  const [openBook, setOpenBook] = useState<Book | null>(null)
  const overview = useApi<Overview>('/reading/overview')

  if (overview.loading || !overview.data) return <Loading />
  const data = overview.data

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: t('reading.stat.books'), value: digits(data.stats.books_total) },
          { label: t('reading.stat.finishedBoth'), value: digits(data.stats.both_finished.length) },
          { label: t('reading.stat.notes'), value: digits(data.stats.notes_total) },
          { label: t('reading.stat.quotes'), value: digits(data.stats.quotes_total) },
        ].map((c) => (
          <div key={c.label} className="os-card p-2.5">
            <p className="text-[10px] os-muted">{c.label}</p>
            <p className="mt-0.5 text-base font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {openBook ? (
          <motion.div key={`book-${openBook.id}`} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}>
            <BookView book={openBook} onBack={() => setOpenBook(null)} onChanged={overview.reload} />
          </motion.div>
        ) : (
          <motion.div key="shelf" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <AddBook onAdded={overview.reload} />

            <SectionTitle>{t('reading.shelf.reading')}</SectionTitle>
            <ShelfRow books={data.shelf.reading || []} onOpen={setOpenBook} />

            {(data.shelf.want || []).length > 0 && (
              <>
                <SectionTitle>{t('reading.shelf.want')}</SectionTitle>
                <ShelfRow books={data.shelf.want} onOpen={setOpenBook} />
              </>
            )}

            {(data.shelf.finished || []).length > 0 && (
              <>
                <SectionTitle>{t('reading.shelf.finished')}</SectionTitle>
                <ShelfRow books={data.shelf.finished} onOpen={setOpenBook} />
              </>
            )}

            {data.recent_quotes.length > 0 && (
              <>
                <SectionTitle>{t('reading.recentQuotes')}</SectionTitle>
                <div className="space-y-2">
                  {data.recent_quotes.map((q) => (
                    <div key={q.id} className="os-card p-3">
                      <p className="text-sm leading-7">{q.text}</p>
                      <p className="mt-1 text-[10px] os-muted">
                        {q.owner_label} • {q.book_title} {q.chapter_label ? `— ${q.chapter_label}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ShelfRow({ books, onOpen }: { books: Book[]; onOpen: (b: Book) => void }) {
  const { t } = useTranslation()
  if (books.length === 0) return <Empty text={t('reading.emptyShelf')} />
  return (
    <div className="space-y-2">
      {books.map((b, i) => (
        <motion.button
          key={b.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          onClick={() => onOpen(b)}
          className="os-card flex w-full items-center gap-3 p-3 text-start"
        >
          {b.cover ? (
            <img src={b.cover} alt="" className="h-14 w-11 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg text-xl" style={{ background: 'var(--os-accent-soft)' }}>
              📕
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{b.title}</p>
            <p className="truncate text-[11px] os-muted">
              {b.author || t('reading.noAuthor')} • {digits(b.chapters_count)} {t('reading.chapters')}
            </p>
            <ProgressBar daddy={b.progress.daddy} daughter={b.progress.daughter} />
          </div>
          <Icon name="forward" size={16} />
        </motion.button>
      ))}
    </div>
  )
}

function ProgressBar({ daddy, daughter }: { daddy: number; daughter: number }) {
  return (
    <div className="mt-1.5 space-y-1">
      {(
        [
          { label: '👨', value: daddy, color: '#7dd3fc' },
          { label: '👧', value: daughter, color: '#f9a8d4' },
        ] as const
      ).map((row) => (
        <div key={row.label} className="flex items-center gap-1.5">
          <span className="text-[10px]">{row.label}</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
            <motion.span
              className="block h-full rounded-full"
              style={{ background: row.color }}
              initial={{ width: 0 }}
              animate={{ width: `${row.value}%` }}
            />
          </span>
          <span className="w-8 text-end text-[10px] tabular-nums os-muted">{digits(row.value)}%</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ افزودن کتاب -- */
function AddBook({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [why, setWhy] = useState('')
  const [chapters, setChapters] = useState('4')
  const [status, setStatus] = useState<Status>('want')
  const [pdf, setPdf] = useState<File | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setSaving(true)
    const fd = new FormData()
    fd.append('title', title.trim())
    fd.append('author', author)
    fd.append('why_this_book', why)
    fd.append('status', status)
    fd.append('added_by', 'daughter')
    fd.append('total_chapters', chapters)
    if (pdf) fd.append('pdf', pdf, pdf.name)
    if (cover) fd.append('cover', cover, cover.name)
    await upload('/reading/books', fd)
    playSuccess()
    setTitle('')
    setAuthor('')
    setWhy('')
    setPdf(null)
    setCover(null)
    setOpen(false)
    onAdded()
    setSaving(false)
  }

  return (
    <div className="os-card overflow-hidden">
      <button className="flex w-full items-center gap-2 p-3 text-start text-sm font-semibold" onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? 'minus' : 'plus'} size={16} />
        {t('reading.addBook')}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.form
            onSubmit={submit}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="space-y-2 px-3 pb-3"
          >
            <input className="os-input" placeholder={t('reading.bookTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
            <input className="os-input" placeholder={t('reading.author')} value={author} onChange={(e) => setAuthor(e.target.value)} />
            <input className="os-input" placeholder={t('reading.why')} value={why} onChange={(e) => setWhy(e.target.value)} />
            <div className="flex items-center gap-2">
              <Chips
                items={[
                  { key: 'want' as Status, label: t('reading.shelf.want') },
                  { key: 'reading' as Status, label: t('reading.shelf.reading') },
                ]}
                value={status}
                onChange={setStatus}
              />
              <input
                className="os-input w-20"
                inputMode="numeric"
                value={chapters}
                onChange={(e) => setChapters(e.target.value.replace(/[^0-9]/g, ''))}
              />
              <span className="shrink-0 text-[11px] os-muted">{t('reading.chapters')}</span>
            </div>
            <div className="flex gap-2">
              <label className="os-btn flex flex-1 cursor-pointer items-center justify-center gap-2 !py-2 text-xs">
                <Icon name="camera" size={14} /> {cover ? cover.name.slice(0, 14) : t('reading.cover')}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setCover(e.target.files?.[0] || null)} />
              </label>
              <label className="os-btn flex flex-1 cursor-pointer items-center justify-center gap-2 !py-2 text-xs">
                <Icon name="book" size={14} /> {pdf ? pdf.name.slice(0, 14) : t('reading.pdf')}
                <input type="file" accept="application/pdf" className="hidden" onChange={(e) => setPdf(e.target.files?.[0] || null)} />
              </label>
            </div>
            <button className="os-btn-primary w-full" type="submit" disabled={saving}>
              {t('os.add')}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------- یک کتاب ---- */
function BookView({ book, onBack, onChanged }: { book: Book; onBack: () => void; onChanged: () => void }) {
  const { t } = useTranslation()
  const [owner, setOwner] = useState<Owner>('daughter')
  const [openChapter, setOpenChapter] = useState<number | null>(null)
  const [newChapter, setNewChapter] = useState('')
  const detail = useApi<{ item: Book & { chapters: Chapter[] } }>(`/reading/books/${book.id}`)

  const chapters = detail.data?.item.chapters || []

  const addChapter = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChapter.trim()) return
    await post(`/reading/books/${book.id}/chapters`, { title: newChapter.trim() })
    setNewChapter('')
    await detail.reload()
  }

  return (
    <div className="space-y-3">
      <BackButton onBack={onBack} title={book.title} subtitle={book.author || t('reading.noAuthor')} />

      <div className="os-card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <span className="os-chip os-chip-active">{book.status_label}</span>
          {book.why_this_book && <span className="truncate text-[11px] os-muted">💭 {book.why_this_book}</span>}
        </div>
        <ProgressBar daddy={book.progress.daddy} daughter={book.progress.daughter} />
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="os-chip">
            {digits(book.chapters_count)} {t('reading.chapters')}
          </span>
          <span className="os-chip">
            {digits(book.notes_count)} {t('reading.notes')}
          </span>
          <span className="os-chip">
            {digits(book.quotes_count)} {t('reading.quotes')}
          </span>
          {book.pdf && (
            <a className="os-chip" href={book.pdf} target="_blank" rel="noreferrer">
              📄 PDF
            </a>
          )}
        </div>
        <Chips
          items={[
            { key: 'daughter' as Owner, label: `👧 ${t('reading.me')}` },
            { key: 'daddy' as Owner, label: `👨 ${t('reading.daddy')}` },
          ]}
          value={owner}
          onChange={setOwner}
        />
      </div>

      <SectionTitle
        action={
          <button className="os-chip" onClick={() => void detail.reload()}>
            <Icon name="retry" size={12} /> {t('os.refresh')}
          </button>
        }
      >
        {t('reading.chapterList')}
      </SectionTitle>

      {chapters.length === 0 ? (
        <Empty text={t('reading.noChapters')} />
      ) : (
        <div className="space-y-2">
          {chapters.map((c) => (
            <div key={c.id} className="os-card overflow-hidden">
              <button className="flex w-full items-center gap-2 p-3 text-start" onClick={() => setOpenChapter(openChapter === c.id ? null : c.id)}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs" style={{ background: 'var(--os-accent-soft)' }}>
                  {digits(c.order)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.title || c.label}</p>
                  <p className="text-[10px] os-muted">
                    {c.read_by.daddy ? '👨✅ ' : '👨 '}
                    {c.read_by.daughter ? '👧✅' : '👧'} • {digits(c.comments_count)} {t('reading.comments')}
                  </p>
                </div>
                <Icon name={openChapter === c.id ? 'minus' : 'forward'} size={15} />
              </button>
              <AnimatePresence initial={false}>
                {openChapter === c.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <ChapterBody chapter={c} book={book} owner={owner} onChanged={async () => { await detail.reload(); onChanged() }} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={addChapter} className="os-card flex items-center gap-2 p-2.5">
        <input className="os-input" placeholder={t('reading.newChapter')} value={newChapter} onChange={(e) => setNewChapter(e.target.value)} />
        <button className="os-btn-primary shrink-0 !px-3 !py-2 text-xs" type="submit">
          <Icon name="plus" size={14} />
        </button>
      </form>
    </div>
  )
}

function BackButton({ onBack, title, subtitle }: { onBack: () => void; title: string; subtitle?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex items-center gap-2">
      <button className="os-chip" onClick={onBack}>
        <Icon name="back" size={14} /> {t('os.back')}
      </button>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        {subtitle && <p className="truncate text-[10px] os-muted">{subtitle}</p>}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- یک فصل ---- */
function ChapterBody({
  chapter,
  book,
  owner,
  onChanged,
}: {
  chapter: Chapter
  book: Book
  owner: Owner
  onChanged: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'note' | 'quote' | 'talk'>('note')
  const [text, setText] = useState('')
  const [rating, setRating] = useState(0)
  const [finished, setFinished] = useState(false)
  const [busy, setBusy] = useState(false)

  const myNotes = useMemo(() => (chapter.notes || []).filter((n) => n.owner === owner), [chapter.notes, owner])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim() && !(mode === 'note' && finished)) return
    setBusy(true)
    if (mode === 'note') {
      await post(`/reading/chapters/${chapter.id}/notes`, {
        owner,
        text: text.trim(),
        rating,
        is_finished: finished,
      })
    } else if (mode === 'quote') {
      await post(`/reading/chapters/${chapter.id}/quotes`, { owner, text: text.trim() })
    } else {
      await post(`/reading/chapters/${chapter.id}/comments`, { owner, text: text.trim() })
    }
    playSuccess()
    setText('')
    setFinished(false)
    setRating(0)
    await onChanged()
    setBusy(false)
  }

  return (
    <div className="space-y-3 px-3 pb-3">
      {chapter.text && <p className="whitespace-pre-line text-xs leading-7 os-muted">{chapter.text}</p>}
      {(chapter.page_from || chapter.page_to) && (
        <p className="text-[10px] os-muted">
          📄 {t('reading.pages')} {digits(chapter.page_from || 0)}–{digits(chapter.page_to || 0)}
        </p>
      )}

      <Chips
        items={[
          { key: 'note' as const, label: t('reading.tab.note') },
          { key: 'quote' as const, label: t('reading.tab.quote') },
          { key: 'talk' as const, label: t('reading.tab.talk') },
        ]}
        value={mode}
        onChange={setMode}
      />

      <form onSubmit={submit} className="space-y-2">
        <textarea
          className="os-input min-h-[70px]"
          placeholder={
            mode === 'note' ? t('reading.notePlaceholder') : mode === 'quote' ? t('reading.quotePlaceholder') : t('reading.commentPlaceholder')
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        {mode === 'note' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className="text-base transition active:scale-90"
                  style={{ filter: n <= rating ? 'none' : 'grayscale(1)', opacity: n <= rating ? 1 : 0.35 }}
                >
                  ⭐
                </button>
              ))}
            </div>
            <label className="flex items-center gap-1.5 text-xs">
              <input type="checkbox" checked={finished} onChange={(e) => setFinished(e.target.checked)} />
              {t('reading.iReadIt')}
            </label>
            <span className="ms-auto text-[10px] os-muted">
              {digits(book.progress[owner])}% {t('reading.mine')}
            </span>
          </div>
        )}
        <button className="os-btn-primary w-full !py-2 text-xs" type="submit" disabled={busy}>
          {t('os.save')}
        </button>
      </form>

      {myNotes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] os-muted">{t('reading.myNotes')}</p>
          {myNotes.map((n) => (
            <div key={n.id} className="rounded-xl p-2 text-xs" style={{ background: 'var(--os-border)' }}>
              {n.rating > 0 && <span>{'⭐'.repeat(n.rating)} </span>}
              {n.text || (n.is_finished ? '✅' : '')}
            </div>
          ))}
        </div>
      )}

      {(chapter.comments || []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] os-muted">{t('reading.talk')}</p>
          {chapter.comments!.map((c) => (
            <div key={c.id} className="flex gap-2 text-xs">
              <span>{c.owner === 'daddy' ? '👨' : '👧'}</span>
              <div className="flex-1 rounded-xl p-2" style={{ background: c.owner === 'daddy' ? '#7dd3fc1f' : '#f9a8d41f' }}>
                <p className="leading-6">{c.text}</p>
                <p className="mt-0.5 text-[9px] os-muted">{c.owner_label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(chapter.quotes || []).length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] os-muted">{t('reading.quotes')}</p>
          {chapter.quotes!.map((q) => (
            <div key={q.id} className="rounded-xl p-2 text-xs italic" style={{ background: 'var(--os-accent-soft)' }}>
              ”{q.text}“
              <p className="mt-0.5 text-[9px] not-italic os-muted">{q.owner_label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
