/**
 * Library — کتابخونه‌ی ما
 * قفسه‌ی کتاب‌ها، خواندن صفحه‌به‌صفحه با ورق زدن، حاشیه‌نویسی، نشانک،
 * و نوشتن فصل جدید توسط دخترم (پیش‌نویس → انتشار، بابا خبردار می‌شود).
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { digits } from '../shared/format'
import { exportBookPdf } from '../shared/printBook'
import { playPaper } from '../shared/sound'
import { useOS } from '../shared/store'
import { AudioPlayer, Empty, Loading, SectionTitle, useApi } from '../shared/ui'

interface Note { id: number; author: string; text: string; color: string }
interface Paragraph { id: number; order: number; text: string; author: string; audio: string | null; is_draft: boolean; notes: Note[] }
interface Page { id: number; order: number; image: string | null; audio: string | null; paragraphs: Paragraph[] }
interface Chapter { id: number; title: string; order: number; author: string; is_published: boolean; pages: Page[] }
interface BookDetail {
  id: number
  title: string
  subtitle: string
  cover: string | null
  allow_daughter_edit: boolean
  chapters: Chapter[]
  bookmarks: { id: number; page: number; label: string }[]
}
interface BookCard {
  id: number
  title: string
  subtitle: string
  cover: string | null
  description: string
  chapters: number
  allow_daughter_edit: boolean
}

export default function Library() {
  const { t } = useTranslation()
  const [bookId, setBookId] = useState<number | null>(null)
  const [creating, setCreating] = useState(false)
  const { data: shelf, loading, reload } = useApi<{ items: BookCard[] }>('/books')

  if (bookId) return <BookReader id={bookId} onBack={() => setBookId(null)} />
  if (loading) return <Loading />
  const items = shelf?.items || []

  return (
    <div className="space-y-3">
      <SectionTitle>{t('library.shelf')}</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {/* کارت «کتاب جدید» — دخترم خودش کتاب می‌سازد */}
        <motion.button
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -5, rotate: 1 }}
          onClick={() => setCreating(true)}
          className="flex h-[190px] flex-col items-center justify-center gap-2 rounded-2xl text-sm shadow-soft"
          style={{
            border: '2px dashed var(--os-accent)',
            background: 'var(--os-accent-soft)',
            color: 'var(--os-accent)',
          }}
        >
          <Icon name="pen" size={30} />
          <span className="os-title">{t('library.newBook')}</span>
        </motion.button>

        {items.map((b, i) => (
          <motion.button
            key={b.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + i * 0.05 }}
            whileHover={{ y: -5, rotate: -1 }}
            onClick={() => { playPaper(); setBookId(b.id) }}
            className="overflow-hidden rounded-2xl text-start shadow-soft"
            style={{ background: 'var(--os-card)', border: '1px solid var(--os-border)' }}
          >
            {b.cover ? (
              <img src={b.cover} alt="" className="h-36 w-full object-cover" />
            ) : (
              <div className="flex h-36 w-full items-center justify-center" style={{ background: 'linear-gradient(150deg,#f9a8d4,#c4b5fd)', color: '#fff' }}>
                <Icon name="book" size={34} />
              </div>
            )}
            <div className="p-2.5">
              <p className="os-title break-words text-sm">{b.title}</p>
              <p className="break-words text-[11px] os-muted">{b.subtitle}</p>
              <p className="mt-0.5 text-[10px] os-muted">{digits(b.chapters)} {t('library.toc')}</p>
            </div>
          </motion.button>
        ))}
      </div>

      <AnimatePresence>
        {creating && (
          <NewBook
            onDone={async (id) => {
              setCreating(false)
              await reload()
              if (id) setBookId(id)
            }}
            onCancel={() => setCreating(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

/* -------------------------------------------------------- کتاب جدید ---- */
function NewBook({ onDone, onCancel }: { onDone: (id: number | null) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!title.trim()) return
    setBusy(true)
    try {
      const res = await post<{ ok: boolean; id: number }>('/books', { title: title.trim(), subtitle: subtitle.trim() })
      showToast(t('library.bookCreated'), 'love')
      onDone(res.id ?? null)
    } catch {
      showToast(t('os.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="os-card space-y-2 p-3">
        <p className="text-sm font-semibold">✨ {t('library.newBook')}</p>
        <input className="os-input" placeholder={t('library.bookTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="os-input" placeholder={t('library.bookSubtitle')} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
        <div className="flex gap-2">
          <button className="os-btn flex-1" onClick={onCancel}>{t('os.cancel')}</button>
          <button className="os-btn-primary flex-1" onClick={() => void submit()} disabled={busy || !title.trim()}>
            {t('library.startWriting')}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

/* ------------------------------------------------------------ خواندن --- */
function BookReader({ id, onBack }: { id: number; onBack: () => void }) {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const { data, loading, reload } = useApi<BookDetail>(`/books/${id}`)
  const [chapterIdx, setChapterIdx] = useState(0)
  const [pageIdx, setPageIdx] = useState(0)
  const [dir, setDir] = useState(1)
  const [fontSize, setFontSize] = useState(15)
  const [noteFor, setNoteFor] = useState<number | null>(null)
  const [noteText, setNoteText] = useState('')
  const [writing, setWriting] = useState(false)
  const [pdfProgress, setPdfProgress] = useState<{ cur: number; total: number } | null>(null)

  /** نسخه‌ی چاپی: PDF کامل با جلد + فهرست + هدر + شماره‌ی صفحه */
  const downloadPdf = async () => {
    if (!data || pdfProgress) return
    setPdfProgress({ cur: 0, total: 0 })
    try {
      await exportBookPdf(data, (cur, total) => setPdfProgress({ cur, total }))
      showToast(t('library.pdfReady'), 'love')
    } catch {
      showToast(t('library.pdfFailed'), 'info')
    } finally {
      setPdfProgress(null)
    }
  }

  if (loading || !data) return <Loading />
  const chapters = data.chapters
  if (chapters.length === 0) {
    return (
      <div className="space-y-3">
        <button className="os-chip" onClick={onBack}>{t('os.back')}</button>
        <Empty />
        {data.allow_daughter_edit && <WriteChapter bookId={id} onDone={() => void reload()} />}
      </div>
    )
  }

  const chapter = chapters[Math.min(chapterIdx, chapters.length - 1)]
  const pages = chapter.pages.length ? chapter.pages : [{ id: -1, order: 1, image: null, audio: null, paragraphs: [] }]
  const page = pages[Math.min(pageIdx, pages.length - 1)]

  const turn = (d: number) => {
    playPaper()
    setDir(d)
    const next = pageIdx + d
    if (next < 0) {
      if (chapterIdx > 0) { setChapterIdx(chapterIdx - 1); setPageIdx(0) }
      return
    }
    if (next >= pages.length) {
      if (chapterIdx < chapters.length - 1) { setChapterIdx(chapterIdx + 1); setPageIdx(0) }
      return
    }
    setPageIdx(next)
  }

  const addNote = async (paragraphId: number) => {
    if (!noteText.trim()) return
    await post(`/paragraphs/${paragraphId}/notes`, { text: noteText })
    setNoteText('')
    setNoteFor(null)
    showToast(t('library.noteSaved'), 'love')
    await reload()
  }

  const bookmark = async () => {
    if (page.id < 0) return
    await post(`/pages/${page.id}/bookmark`)
    showToast(t('os.saved'), 'love')
    await reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="os-chip" onClick={onBack}>{t('os.back')}</button>
        <span className="os-title min-w-0 flex-1 break-words text-sm">{data.title}</span>
        <button className="os-chip" onClick={() => void bookmark()}>
          <span className="inline-flex items-center gap-1"><Icon name="star" size={12} /> {t('library.bookmark')}</span>
        </button>
        <button className="os-chip" disabled={!!pdfProgress} onClick={() => void downloadPdf()}>
          <span className="inline-flex items-center gap-1">
            ⬇️ {pdfProgress ? t('library.pdfBuilding', { cur: digits(pdfProgress.cur), total: digits(pdfProgress.total) }) : t('library.download')}
          </span>
        </button>
        <button className="os-chip" onClick={() => setFontSize((f) => (f >= 20 ? 13 : f + 1))}>
          {t('library.fontSize')} {digits(fontSize)}
        </button>
      </div>

      {/* فهرست فصل‌ها */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        {chapters.map((c, i) => (
          <button
            key={c.id}
            className={`os-chip shrink-0 ${i === chapterIdx ? 'os-chip-active' : ''}`}
            onClick={() => { setChapterIdx(i); setPageIdx(0) }}
          >
            {c.title}
            {!c.is_published && ` • ${t('library.draft')}`}
          </button>
        ))}
      </div>

      {/* صفحه */}
      <div className="relative min-h-[320px]" style={{ perspective: 1400 }}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={`${chapter.id}-${page.id}`}
            custom={dir}
            initial={{ rotateY: dir > 0 ? 55 : -55, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: dir > 0 ? -45 : 45, opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="paper rounded-3xl p-5"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {page.image && <img src={page.image} alt="" className="mb-3 w-full rounded-2xl object-cover" />}
            {page.audio && <div className="mb-3"><AudioPlayer src={page.audio} compact accent="#b9895a" /></div>}

            {page.paragraphs.length === 0 && <p className="text-center text-sm" style={{ color: '#8a7256' }}>{t('os.empty')}</p>}

            {page.paragraphs.map((p) => (
              <div key={p.id} className="group mb-3">
                <p
                  className="whitespace-pre-line leading-9"
                  style={{ fontSize, color: p.author === 'daddy' ? '#4b3a2a' : '#6b4a5e' }}
                  onDoubleClick={() => setNoteFor(p.id)}
                >
                  {p.text}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: '#a08a6a' }}>
                    {p.author === 'daddy' ? t('library.byDaddy') : t('library.byMe')}
                  </span>
                  <button className="text-[10px] underline" style={{ color: '#b9895a' }} onClick={() => setNoteFor(noteFor === p.id ? null : p.id)}>
                    {t('library.addNote')}
                  </button>
                </div>
                {p.notes.map((n) => (
                  <p key={n.id} className="mt-1 rounded-xl px-3 py-1.5 text-[12px]" style={{ background: `${n.color}22`, color: '#6b4a5e', borderInlineStart: `3px solid ${n.color}` }}>
                    {n.text}
                  </p>
                ))}
                {noteFor === p.id && (
                  <div className="mt-2 flex gap-2">
                    <input className="os-input !py-2 text-xs" placeholder={t('library.note')} value={noteText} onChange={(e) => setNoteText(e.target.value)} />
                    <button className="os-btn-primary !px-3 !py-2 !text-xs" onClick={() => void addNote(p.id)}>{t('os.save')}</button>
                  </div>
                )}
              </div>
            ))}

            <p className="mt-4 text-center text-[11px]" style={{ color: '#a08a6a' }}>
              {t('library.page', { n: digits(pageIdx + 1) })}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex gap-2">
        <button className="os-btn flex-1" onClick={() => turn(-1)}>‹</button>
        <button className="os-btn flex-1" onClick={() => turn(1)}>›</button>
      </div>

      {data.allow_daughter_edit && (
        <>
          <button className="os-btn w-full" onClick={() => setWriting(!writing)}>
            <span className="inline-flex items-center justify-center gap-2"><Icon name="pen" size={15} /> {t('library.write')}</span>
          </button>
          {writing && <WriteChapter bookId={id} onDone={() => { setWriting(false); void reload() }} />}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ نوشتن ---- */
function WriteChapter({ bookId, onDone }: { bookId: number; onDone: () => void }) {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (publish: boolean) => {
    if (!title.trim() && !text.trim()) return
    setBusy(true)
    try {
      // ساخت فصل → گرفتن صفحه‌ی اول → افزودن پاراگراف → انتشار اختیاری
      const ch = await post<{ ok: boolean; id: number }>(`/books/${bookId}/chapters`, { title: title || t('library.newChapter') })
      const book = await get<BookDetail>(`/books/${bookId}`)
      const chapter = book.chapters.find((c) => c.id === ch.id)
      const pageId = chapter?.pages?.[0]?.id
      if (pageId) await post(`/pages/${pageId}/paragraphs`, { text, is_draft: !publish })
      if (publish) await post(`/chapters/${ch.id}/publish`)
      showToast(publish ? t('library.published') : t('library.savedDraft'), 'love')
      setTitle('')
      setText('')
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="os-card space-y-2 p-3">
      <input className="os-input" placeholder={t('library.chapterTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="os-input min-h-[140px] leading-8" placeholder={t('library.writeHere')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <button className="os-btn flex-1" onClick={() => void submit(false)} disabled={busy}>{t('library.draft')}</button>
        <button className="os-btn-primary flex-1" onClick={() => void submit(true)} disabled={busy}>{t('library.publish')}</button>
      </div>
    </div>
  )
}
