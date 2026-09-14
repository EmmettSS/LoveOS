/**
 * Cinema — سینمای ما
 * لیست فیلم/سریال‌هایی که با هم می‌بینیم، با وضعیت، امتیاز، لینک تماشا
 * و **پوستر** (دخترم می‌تواند برای هر فیلم پوستر بفرستد).
 */
import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { del, patch, post, upload } from '../shared/api'
import { digits } from '../shared/format'
import { blobToUploadFile, resizeImage } from '../shared/image'
import { playClick } from '../shared/sound'
import { Chips, Empty, Loading, useApi } from '../shared/ui'

interface Item {
  id: number
  title: string
  kind: 'film' | 'series'
  link: string
  status: 'todo' | 'watching' | 'done'
  rating: number
  note: string
  poster: string | null
  added_by: 'daddy' | 'daughter'
}

const STATUSES = ['todo', 'watching', 'done'] as const

/** ورودی تصویر با پیش‌نمایش کوچک */
function PosterInput({ onReady, onClear, label }: { onReady: (f: File, preview: string) => void; onClear: () => void; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    try {
      const { blob, preview: url } = await resizeImage(file, 560, 0.8)
      setPreview(url)
      onReady(blobToUploadFile(blob, file.name), url)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <span
        className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl"
        style={{ background: preview ? undefined : 'var(--os-accent-soft)', color: 'var(--os-accent)' }}
      >
        {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <Icon name="cinema" size={22} />}
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <button type="button" className="os-chip self-start" onClick={() => ref.current?.click()} disabled={busy}>
          {busy ? '...' : label}
        </button>
        <p className="text-[10px] os-muted">{preview ? 'پوستر آماده است ✔' : 'اختیاری'}</p>
      </div>
      {preview && (
        <button type="button" className="os-chip" onClick={() => { setPreview(null); onClear() }}>
          ✕
        </button>
      )}
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
    </div>
  )
}

export default function Cinema() {
  const { t } = useTranslation()
  const { data, loading, reload } = useApi<{ items: Item[] }>('/cinema')
  const [form, setForm] = useState({ title: '', kind: 'film' as 'film' | 'series', link: '' })
  const [filter, setFilter] = useState<'all' | (typeof STATUSES)[number]>('all')
  const [posterFile, setPosterFile] = useState<File | null>(null)
  const [busyPoster, setBusyPoster] = useState<number | null>(null)
  const [formKey, setFormKey] = useState(0) // برای ریست کامل فرم بعد از ثبت

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    if (posterFile) {
      const fd = new FormData()
      fd.append('title', form.title.trim())
      fd.append('kind', form.kind)
      fd.append('link', form.link)
      fd.append('poster', posterFile)
      await upload('/cinema', fd)
    } else {
      await post('/cinema', form)
    }
    setForm({ title: '', kind: 'film', link: '' })
    setPosterFile(null)
    setFormKey((k) => k + 1)
    await reload()
  }

  const setPoster = async (it: Item, file: File) => {
    setBusyPoster(it.id)
    try {
      const fd = new FormData()
      fd.append('poster', file)
      await upload(`/cinema/${it.id}`, fd)
      await reload()
    } finally {
      setBusyPoster(null)
    }
  }

  const setStatus = async (it: Item, status: string) => {
    await patch(`/cinema/${it.id}`, { status })
    await reload()
  }

  const setRating = async (it: Item, rating: number) => {
    playClick()
    await patch(`/cinema/${it.id}`, { rating })
    await reload()
  }

  if (loading) return <Loading />
  const items = data?.items || []
  const shown = filter === 'all' ? items : items.filter((i) => i.status === filter)

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="os-card space-y-2 p-3">
        <input className="os-input" placeholder={t('cinema.addPlaceholder')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <input className="os-input" placeholder={t('cinema.link')} value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} />
        <PosterInput
          key={formKey}
          label={`${t('cinema.poster')} 🖼`}
          onReady={(f) => setPosterFile(f)}
          onClear={() => setPosterFile(null)}
        />
        <div className="flex items-center gap-2">
          <Chips
            items={[{ key: 'film' as const, label: t('cinema.kind.film') }, { key: 'series' as const, label: t('cinema.kind.series') }]}
            value={form.kind}
            onChange={(v) => setForm({ ...form, kind: v })}
          />
          <button type="submit" className="os-btn-primary ms-auto !px-4 !py-2">{t('os.add')}</button>
        </div>
      </form>

      <Chips
        items={[{ key: 'all' as const, label: t('os.all') }, ...STATUSES.map((s) => ({ key: s, label: t(`cinema.status.${s}`) }))]}
        value={filter}
        onChange={setFilter}
      />

      {shown.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-2">
          {shown.map((it, i) => (
            <motion.div key={it.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="os-card overflow-hidden">
              <div className="flex gap-3 p-3">
                {it.poster ? (
                  <img src={it.poster} alt="" className="h-24 w-16 shrink-0 rounded-xl object-cover shadow" />
                ) : (
                  <span className="flex h-24 w-16 shrink-0 items-center justify-center rounded-xl" style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}>
                    <Icon name="cinema" size={22} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="os-title text-base break-words">{it.title}</p>
                  <p className="text-[11px] os-muted">{t(`cinema.kind.${it.kind}`)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {STATUSES.map((s) => (
                      <button key={s} className={`os-chip !px-2 !py-0.5 !text-[10px] ${it.status === s ? 'os-chip-active' : ''}`} onClick={() => void setStatus(it, s)}>
                        {t(`cinema.status.${s}`)}
                      </button>
                    ))}
                  </div>
                  <div className="mt-1.5 flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button key={n} onClick={() => void setRating(it, n)} aria-label={`${n}`}>
                        <Icon name="star" size={15} style={{ color: n <= it.rating ? '#fbbf24' : 'var(--os-border)' }} />
                      </button>
                    ))}
                    {it.rating > 0 && <span className="ms-1 text-[10px] os-muted">{digits(it.rating)}/۵</span>}
                  </div>
                  {it.link && (
                    <a href={it.link} target="_blank" rel="noreferrer" className="mt-1.5 inline-block text-[11px] underline" style={{ color: 'var(--os-accent)' }}>
                      {t('cinema.watchTogether')}
                    </a>
                  )}
                  {it.note && <p className="mt-1 text-[11px] os-muted">{it.note}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-center gap-1">
                  <PosterButton
                    busy={busyPoster === it.id}
                    onPick={(f) => void setPoster(it, f)}
                    label={t('cinema.poster')}
                  />
                  {it.added_by === 'daughter' && (
                    <button onClick={async () => { await del(`/cinema/${it.id}`); await reload() }} className="rounded-lg p-1.5 os-muted transition hover:bg-black/5">
                      <Icon name="trash" size={15} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

/** دکمه‌ی کوچک «افزودن/تغییر پوستر» کنار هر فیلم */
function PosterButton({ onPick, busy, label }: { onPick: (f: File) => void; busy: boolean; label: string }) {
  const ref = useRef<HTMLInputElement | null>(null)
  return (
    <>
      <button className="os-chip !text-[10px]" disabled={busy} onClick={() => ref.current?.click()} title={label}>
        {busy ? '...' : '🖼'}
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          if (f) {
            await resizeImage(f, 560, 0.8)
            onPick(blobToUploadFile(f, 'poster'))
          }
          if (ref.current) ref.current.value = ''
        }}
      />
    </>
  )
}
