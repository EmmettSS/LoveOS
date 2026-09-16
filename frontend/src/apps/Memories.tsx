/**
 * Memories — جعبه‌ی خاطره‌ها
 * خط زمان عمودی، خاطره‌های قفل‌شده‌ی آینده با علامت ؟؟؟ و اسلایدشو.
 * دخترم هم می‌تواند خاطره‌ی کامل (عکس، متن، مکان، تاریخ، ویس) آپلود کند.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { Tilt, useMotionAllowed, useQualityTier } from '../shared/depth'
import { DateField } from '../shared/JalaliDatePicker'
import { del, upload } from '../shared/api'
import { formatDate } from '../shared/format'
import { playClick, playPaper, playSuccess } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, AudioPlayer, Chips, Empty, useApi } from '../shared/ui'

interface Memory {
  id: number
  title: string
  text: string
  photo: string | null
  happened_on: string | null
  place: string
  is_future: boolean
  locked: boolean
  locked_text: string
  unlock_at: string | null
  voice: string | null
}

type Tab = 'past' | 'future'

export default function Memories() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useApi<{ items: Memory[] }>('/memories')
  const [tab, setTab] = useState<Tab>('past')
  const [slideshow, setSlideshow] = useState(false)
  const [index, setIndex] = useState(0)
  const [showAdd, setShowAdd] = useState(false)

  const items = (data?.items || []).filter((m) => (tab === 'future' ? m.is_future : !m.is_future))
  // دو هوک بدونِ شرط صدا زده می‌شوند و ترکیبشان بعداً — ``&&`` بینِ دو
  // هوک یک نقضِ Rules-of-Hooks است چون short-circuit می‌کند.
  const depthTier = useQualityTier()
  const depthMotion = useMotionAllowed()
  /** عمقِ عکس فقط در بلور/کهکشان و فقط وقتی حرکت مجاز باشد */
  const photoDepth = depthTier !== 'lite' && depthMotion
  const withPhoto = items.filter((m) => m.photo && !m.locked)

  useEffect(() => {
    if (!slideshow || withPhoto.length === 0) return
    const id = setInterval(() => setIndex((i) => (i + 1) % withPhoto.length), 3500)
    return () => clearInterval(id)
  }, [slideshow, withPhoto.length])

  if (loading || error) return <ApiStatus loading={loading} error={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Chips<Tab>
          items={[
            { key: 'past', label: t('memories.past') },
            { key: 'future', label: t('memories.future') },
          ]}
          value={tab}
          onChange={(v) => { playClick(); setTab(v); setSlideshow(false) }}
        />
        <div className="ms-auto flex items-center gap-2">
          {withPhoto.length > 1 && (
            <button className={`os-chip ${slideshow ? 'os-chip-active' : ''}`} onClick={() => setSlideshow(!slideshow)}>
              {t('memories.slideshow')}
            </button>
          )}
          <button className="os-chip os-chip-active" onClick={() => setShowAdd((v) => !v)}>
            <Icon name={showAdd ? 'minus' : 'plus'} size={14} /> {t('memories.addMemory')}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <AddMemoryForm isFuture={tab === 'future'} onDone={async () => { setShowAdd(false); await reload() }} />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {slideshow && withPhoto.length > 0 && (
          <motion.div
            key={withPhoto[index].id}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="overflow-hidden rounded-3xl"
          >
            <img src={withPhoto[index].photo!} alt={withPhoto[index].title} className="h-56 w-full object-cover" />
            <p className="os-title -mt-9 px-4 pb-3 text-white drop-shadow-lg">{withPhoto[index].title}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {items.length === 0 ? (
        <Empty />
      ) : (
        <div className="relative ps-5">
          {/* خط زمان */}
          <span className="absolute bottom-2 start-1.5 top-2 w-px" style={{ background: 'var(--os-border)' }} />
          <div className="space-y-3">
            {items.map((m, i) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="relative"
              >
                <span
                  className="absolute -start-[18px] top-5 h-3 w-3 rounded-full ring-4"
                  style={{ background: m.locked ? 'var(--os-border)' : 'var(--os-accent)', boxShadow: '0 0 0 4px var(--os-card)' }}
                />
                <div className="os-card overflow-hidden" onClick={() => !m.locked && playPaper()}>
                  {/*
                    ⚠️ **فقط عکس** عمق می‌گیرد، نه متن.
                    کارتِ خاطره پر از متن است (عنوان، تاریخ، مکان) و کج‌کردنِ
                    متن خوانایی را خراب می‌کند — قاعده‌ی سختِ پروژه. پس تیلت
                    دورِ خودِ عکس است و بقیه‌ی کارت تخت می‌ماند. عکس یک
                    سطحِ بصری است و تیلتِ ملایم رویش حسِ «عکسِ چاپیِ برجسته»
                    می‌دهد.

                    عمداً سراغِ «کاورفلو» نرفتیم: خطِ زمانیِ عمودیِ فعلی
                    (خطِ زمان + نقطه‌ها) یک الگویِ معنادار و آزموده برای
                    «گذرِ زمان» است و تبدیلش به نوارِ افقیِ چرخان، خودِ
                    معنا را از بین می‌برد — یعنی آسیب به UX که خواسته‌ی صریحِ
                    کاربر «نباید» اتفاق بیفتد.
                  */}
                  {m.photo && !m.locked &&
                    (photoDepth ? (
                      <Tilt maxDeg={6}>
                        <img src={m.photo} alt={m.title} className="memories-photo h-44 w-full object-cover" />
                      </Tilt>
                    ) : (
                      <img src={m.photo} alt={m.title} className="h-44 w-full object-cover" />
                    ))}
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <h4 className="os-title flex-1 text-base">{m.title}</h4>
                      {m.locked && <Icon name="lock" size={15} style={{ color: 'var(--os-muted)' }} />}
                      <button
                        className="os-muted rounded-full p-1 hover:bg-black/5"
                        onClick={async (e) => {
                          e.stopPropagation()
                          await del(`/memories/${m.id}`)
                          await reload()
                        }}
                        title={t('os.delete')}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </div>
                    {m.happened_on && <p className="mt-0.5 text-[11px] os-muted">{formatDate(m.happened_on)}</p>}
                    {m.place && !m.locked && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] os-muted">
                        <Icon name="map" size={12} /> {m.place}
                      </p>
                    )}
                    {m.locked ? (
                      <p className="mt-2 text-sm os-muted">
                        {m.locked_text || t('memories.locked')}
                        {m.unlock_at && <span className="mt-1 block text-[11px]">{t('memories.opensOn', { date: formatDate(m.unlock_at) })}</span>}
                      </p>
                    ) : (
                      <p className="mt-2 whitespace-pre-line text-sm leading-7">{m.text}</p>
                    )}
                    {m.voice && !m.locked && (
                      <div className="mt-2">
                        <AudioPlayer src={m.voice} compact />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AddMemoryForm({ isFuture, onDone }: { isFuture: boolean; onDone: () => void }) {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [place, setPlace] = useState('')
  const [date, setDate] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [voice, setVoice] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const photoRef = useRef<HTMLInputElement | null>(null)
  const voiceRef = useRef<HTMLInputElement | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('text', text)
      fd.append('place', place)
      fd.append('is_future', isFuture ? 'true' : 'false')
      if (date) fd.append('happened_on', date)
      if (photo) fd.append('photo', photo)
      if (voice) fd.append('voice', voice)
      await upload('/memories', fd)
      playSuccess()
      showToast(t('os.saved'), 'love')
      onDone()
    } catch {
      showToast(t('os.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="os-card space-y-2 p-3">
      <p className="text-sm font-semibold">{isFuture ? t('memories.addDream') : t('memories.addMemory')}</p>
      <input className="os-input" placeholder={t('memories.titlePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="os-input min-h-[90px] leading-7" placeholder={t('memories.textPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="flex gap-2">
        <input className="os-input flex-1" placeholder={t('memories.placePlaceholder')} value={place} onChange={(e) => setPlace(e.target.value)} />
        <div className="w-36">
          <DateField value={date} onChange={setDate} placeholder={t('memories.datePlaceholder')} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="os-chip" onClick={() => photoRef.current?.click()}>
          <Icon name="camera" size={14} /> {photo ? photo.name.slice(0, 18) : t('memories.photo')}
        </button>
        <button type="button" className="os-chip" onClick={() => voiceRef.current?.click()}>
          <Icon name="voice" size={14} /> {voice ? voice.name.slice(0, 18) : t('memories.voice')}
        </button>
        {photo && <button type="button" className="os-chip" onClick={() => setPhoto(null)}>✕ {t('memories.photo')}</button>}
        {voice && <button type="button" className="os-chip" onClick={() => setVoice(null)}>✕ {t('memories.voice')}</button>}
      </div>
      <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
      <input ref={voiceRef} type="file" accept="audio/*" className="hidden" onChange={(e) => setVoice(e.target.files?.[0] || null)} />
      <button type="submit" className="os-btn-primary w-full" disabled={busy}>
        {busy ? t('os.uploading') : t('os.save')}
      </button>
    </form>
  )
}
