/**
 * Music — موسیقی ما
 * آهنگ اصلی با توضیح «چرا این آهنگ؟»، لیست پخش، تایمر خواب،
 * و آپلود آهنگ توسط دخترم (اگر بابا اجازه داده باشد).
 * راز ⑭: سه بار پخش آهنگ اصلی.
 */
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { del, post, upload } from '../shared/api'
import { digits } from '../shared/format'
import { blobToUploadFile, resizeImage } from '../shared/image'
import { playClick } from '../shared/sound'
import { useOS } from '../shared/store'
import { AudioPlayer, Empty, Loading, SectionTitle, useApi } from '../shared/ui'

interface Song {
  id: number
  title: string
  artist: string
  audio: string | null
  cover: string | null
  is_main: boolean
  why_this_song: string
  lyrics: string
  uploaded_by: 'daddy' | 'daughter'
  play_count: number
}

const TIMERS = [0, 10, 20, 30, 45]

export default function Music() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const showEgg = useOS((s) => s.showEgg)
  const showToast = useOS((s) => s.showToast)
  const { data, loading, reload } = useApi<{ items: Song[] }>('/songs')

  const [timer, setTimer] = useState(0)
  const [showLyrics, setShowLyrics] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [form, setForm] = useState({ title: '', artist: '' })
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const coverRef = useRef<HTMLInputElement | null>(null)
  const timerRef = useRef<number | null>(null)

  // تایمر خواب: بعد از N دقیقه همه‌ی صداها متوقف می‌شوند
  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (timer > 0) {
      timerRef.current = window.setTimeout(() => {
        document.querySelectorAll('audio').forEach((a) => a.pause())
        setTimer(0)
      }, timer * 60_000)
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [timer])

  const played = async (s: Song) => {
    const res = await post<{ play_count: number }>(`/songs/${s.id}/played`)
    // راز ⑭ — سه بار پخش آهنگ اصلی
    if (s.is_main && res.play_count > 0 && res.play_count % 3 === 0) {
      const egg = await post<{ found: boolean; title: string; message: string }>('/egg', { trigger: 'music_3_play' })
      if (egg.found) showEgg({ title: egg.title, message: egg.message })
    }
  }

  const doUpload = async () => {
    const file = fileRef.current?.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('audio', file)
      fd.append('title', form.title || file.name)
      fd.append('artist', form.artist)
      if (coverFile) fd.append('cover', coverFile)
      await upload('/songs/upload', fd)
      showToast(t('music.uploadDone'), 'love')
      setForm({ title: '', artist: '' })
      setCoverFile(null)
      setCoverPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      if (coverRef.current) coverRef.current.value = ''
      await reload()
    } catch {
      showToast(t('os.error'))
    } finally {
      setUploading(false)
    }
  }

  const remove = async (id: number) => {
    await del(`/songs/${id}`)
    await reload()
  }

  if (loading) return <Loading />

  const items = data?.items || []
  const main = items.find((s) => s.is_main)
  const rest = items.filter((s) => !s.is_main)
  const canUpload = config?.allow_daughter_music_upload !== false

  return (
    <div className="space-y-3">
      {main && main.audio && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="os-card overflow-hidden">
          <div className="flex items-center gap-3 p-3">
            {main.cover ? (
              <img src={main.cover} alt="" className="h-20 w-20 rounded-2xl object-cover" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl animate-float" style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}>
                <Icon name="music" size={30} />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] os-muted">{t('music.mainSong')}</p>
              <p className="os-title truncate text-lg">{main.title}</p>
              <p className="truncate text-xs os-muted">{main.artist}</p>
            </div>
          </div>
          {main.why_this_song && (
            <p className="mx-3 mb-3 rounded-2xl p-3 text-sm leading-6" style={{ background: 'var(--os-accent-soft)' }}>
              <span className="block text-[11px] os-muted">{t('music.whyThisSong')}</span>
              {main.why_this_song}
            </p>
          )}
          <div className="px-3 pb-3">
            <AudioPlayer src={main.audio} compact onPlayed={() => void played(main)} />
          </div>
          {main.lyrics && (
            <div className="px-3 pb-3">
              <button className="os-chip" onClick={() => setShowLyrics(showLyrics === main.id ? null : main.id)}>
                {t('music.lyrics')}
              </button>
              {showLyrics === main.id && (
                <p className="mt-2 whitespace-pre-line rounded-2xl p-3 text-sm leading-7" style={{ background: 'var(--os-accent-soft)' }}>
                  {main.lyrics}
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* تایمر خواب */}
      <div className="os-card flex flex-wrap items-center gap-2 p-3">
        <span className="flex items-center gap-1.5 text-sm">
          <Icon name="moon" size={16} /> {t('music.sleepTimer')}
        </span>
        {TIMERS.map((m) => (
          <button
            key={m}
            className={`os-chip ${timer === m ? 'os-chip-active' : ''}`}
            onClick={() => { playClick(); setTimer(m) }}
          >
            {m === 0 ? t('music.off') : `${digits(m)}′`}
          </button>
        ))}
      </div>

      <SectionTitle>{t('music.playlist')}</SectionTitle>
      {rest.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-2">
          {rest.map((s) => (
            <div key={s.id} className="os-card p-3">
              {s.audio && (
                <AudioPlayer
                  src={s.audio}
                  title={s.title}
                  subtitle={`${s.artist || ''}${s.artist ? ' • ' : ''}${s.uploaded_by === 'daddy' ? t('music.byDaddy') : t('music.byMe')}`}
                  compact
                  onPlayed={() => void played(s)}
                />
              )}
              {s.uploaded_by === 'daughter' && (
                <button className="os-chip mt-2" onClick={() => void remove(s.id)}>
                  <span className="inline-flex items-center gap-1"><Icon name="trash" size={12} /> {t('os.delete')}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* آپلود آهنگ توسط دخترم — استایل هماهنگ با پروژه */}
      <SectionTitle>{t('music.upload')}</SectionTitle>
      {!canUpload ? (
        <p className="os-empty">{t('music.uploadDisabled')}</p>
      ) : (
        <div className="os-card space-y-3 p-4">
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}>
              <Icon name="music" size={18} />
            </span>
            <p className="os-title text-sm">{t('music.upload')}</p>
          </div>
          <input
            className="os-input"
            placeholder={t('music.uploadTitle')}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className="os-input"
            placeholder={t('music.uploadArtist')}
            value={form.artist}
            onChange={(e) => setForm({ ...form, artist: e.target.value })}
          />
          {/* انتخاب فایل آهنگ با دکمه‌ی خوش‌استایل */}
          <div className="flex flex-wrap items-center gap-2 rounded-2xl p-2.5" style={{ background: 'var(--os-accent-soft)' }}>
            <button type="button" className="os-chip os-chip-active" onClick={() => fileRef.current?.click()}>
              <span className="inline-flex items-center gap-1.5"><Icon name="upload" size={14} /> {t('music.uploadFile')}</span>
            </button>
            <span className="text-xs os-muted truncate">
              {fileRef.current?.files?.[0]?.name || t('music.uploadFileHint')}
            </span>
          </div>
          <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={() => { /* برای نمایش نام فایل */ setForm({ ...form }) }} />

          {/* کاور آهنگ */}
          <div className="flex items-center gap-3 rounded-2xl p-2.5" style={{ background: 'var(--os-border)' }}>
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-sm"
              style={{ background: coverPreview ? undefined : 'var(--os-accent-soft)', color: 'var(--os-accent)' }}
            >
              {coverPreview ? <img src={coverPreview} alt="" className="h-full w-full object-cover" /> : <Icon name="music" size={24} />}
            </span>
            <div className="flex-1">
              <p className="text-xs font-semibold">{t('music.cover')}</p>
              <p className="text-[11px] os-muted">{t('music.coverHint')}</p>
              <div className="mt-1.5 flex gap-2">
                <button type="button" className="os-chip" onClick={() => coverRef.current?.click()}>
                  {t('music.chooseCover')}
                </button>
                {coverPreview && (
                  <button
                    type="button"
                    className="os-chip"
                    onClick={() => {
                      setCoverFile(null)
                      setCoverPreview(null)
                      if (coverRef.current) coverRef.current.value = ''
                    }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <input
              ref={coverRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (f) {
                  const { blob, preview } = await resizeImage(f, 640, 0.82)
                  setCoverFile(blobToUploadFile(blob, f.name))
                  setCoverPreview(preview)
                }
                if (coverRef.current) coverRef.current.value = ''
              }}
            />
          </div>

          <button className="os-btn-primary w-full" onClick={() => void doUpload()} disabled={uploading}>
            <span className="inline-flex items-center justify-center gap-2">
              <Icon name="upload" size={16} /> {uploading ? t('os.uploading') : t('music.uploadAction')}
            </span>
          </button>
        </div>
      )}
    </div>
  )
}
