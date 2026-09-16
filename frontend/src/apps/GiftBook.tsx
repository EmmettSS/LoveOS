/**
 * GiftBook — دفتر هدیه‌ها 🎁
 *
 * هر هدیه‌ای که رد و بدل می‌شود اینجا ثبت می‌شود: کِی، برای کی و مهم‌تر از همه
 * «واکنشِ لحظه‌ی گرفتنش». صفحه‌ی اول آمار کلی است (تعداد دریافتی/داده‌شده،
 * نمودار سال‌های شمسی) و بعد دفتر با فیلترهای سال/مناسبت/دهنده.
 *
 * نکته: هدیه با پول قابل سنجیدن نیست؛ هیچ بخش قیمت/مبلغی در این اپ وجود ندارد.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { DateField } from '../shared/JalaliDatePicker'
import { del, patch, upload } from '../shared/api'
import { digits, formatDate } from '../shared/format'
import { playError, playSuccess } from '../shared/sound'
import { ApiStatus, Chips, Empty, SectionTitle, useApi } from '../shared/ui'

type Owner = 'daddy' | 'daughter'

interface Gift {
  id: number
  name: string
  given_on: string
  year: number
  occasion: number | null
  occasion_name: string
  occasion_icon: string
  giver: Owner
  giver_label: string
  receiver: Owner
  receiver_label: string
  description: string
  reaction: string
  photo: string | null
  is_favorite: boolean
  memory: number | null
  recorded_by: Owner
  recorded_by_label: string
}

interface Stats {
  received_count: number
  given_count: number
  from_daddy_count: number
  total_count: number
  years: { year: number; count: number; from_daddy: number; from_daughter: number }[]
  max_year_count: number
  by_occasion: { name: string; icon: string; count: number }[]
  favorites: Gift[]
  latest: Gift | null
}

interface Occasions {
  items: { id: number; name: string; icon: string; count: number }[]
  years: number[]
}

export default function GiftBook() {
  const { t } = useTranslation()
  const [filters, setFilters] = useState<{ giver: string; year: string; occasion: string }>({
    giver: 'all',
    year: 'all',
    occasion: 'all',
  })
  const [q, setQ] = useState('')
  const [adding, setAdding] = useState(false)

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (filters.giver !== 'all') p.set('giver', filters.giver)
    if (filters.year !== 'all') p.set('year', filters.year)
    if (filters.occasion !== 'all') p.set('occasion', filters.occasion)
    if (q.trim()) p.set('q', q.trim())
    const s = p.toString()
    return `/gifts${s ? `?${s}` : ''}`
  }, [filters, q])

  const list = useApi<{ items: Gift[]; count: number }>(query)
  const stats = useApi<Stats>('/gifts/stats')
  const meta = useApi<Occasions>('/gifts/occasions')

  const reloadAll = async () => {
    await Promise.all([list.reload(), stats.reload(), meta.reload()])
  }

  const error = list.error || stats.error || meta.error
  if (list.loading && stats.loading && meta.loading) return <ApiStatus loading error={null} />
  if (error) return <ApiStatus loading={false} error={error} onRetry={() => void reloadAll()} />
  const items = list.data?.items || []
  const s = stats.data

  return (
    <div className="space-y-3">
      {/* ------------------------------------------------------------ آمار */}
      {s && (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label={t('gifts.stats.received')} value={digits(s.received_count)} emoji="🎀" />
          <StatCard label={t('gifts.stats.given')} value={digits(s.given_count)} emoji="🤲" />
        </div>
      )}

      {s && s.years.length > 0 && (
        <>
          <SectionTitle>{t('gifts.years')}</SectionTitle>
          <YearChart years={s.years} maxCount={s.max_year_count} />
        </>
      )}

      {s && s.by_occasion.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {s.by_occasion.slice(0, 8).map((o) => (
            <span key={o.name} className="os-chip">
              {o.icon} {o.name} • {digits(o.count)}
            </span>
          ))}
        </div>
      )}

      {s?.latest && (
        <div className="os-card flex items-center gap-3 p-3">
          <span className="text-2xl">{s.latest.occasion_icon}</span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] os-muted">{t('gifts.latest')}</p>
            <p className="break-words text-sm font-semibold">{s.latest.name}</p>
          </div>
          <span className="shrink-0 text-[11px] os-muted">{formatDate(s.latest.given_on)}</span>
        </div>
      )}

      {/* ---------------------------------------------------------- فیلترها */}
      <div className="os-card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Icon name="search" size={15} />
          <input
            className="os-input !border-0 !bg-transparent !px-1 !py-1"
            placeholder={t('gifts.searchPlaceholder')}
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
            { key: 'daughter' as string, label: `👧 ${t('gifts.fromMe')}` },
            { key: 'daddy' as string, label: `👨 ${t('gifts.fromDaddy')}` },
          ]}
          value={filters.giver}
          onChange={(v) => setFilters((f) => ({ ...f, giver: v }))}
        />
        <div className="flex flex-wrap gap-1.5">
          {(meta.data?.years || []).map((y) => (
            <button
              key={y}
              className={`os-chip ${filters.year === String(y) ? 'os-chip-active' : ''}`}
              onClick={() => setFilters((f) => ({ ...f, year: f.year === String(y) ? 'all' : String(y) }))}
            >
              {digits(y)}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence>
        {adding && meta.data && (
          <AddGiftForm
            occasions={meta.data.items}
            onDone={async () => {
              setAdding(false)
              await reloadAll()
            }}
          />
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------ دفتر */}
      {items.length === 0 ? (
        <Empty text={t('gifts.empty')} />
      ) : (
        <div className="space-y-2">
          {items.map((g, i) => (
            <GiftCard key={g.id} gift={g} index={i} onChange={reloadAll} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  return (
    <div className="os-card p-3">
      <p className="text-[10px] os-muted">
        {emoji} {label}
      </p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  )
}

function YearChart({ years, maxCount }: { years: Stats['years']; maxCount: number }) {
  const { t } = useTranslation()
  return (
    <div className="os-card space-y-2 p-3">
      {years.map((y) => (
        <div key={y.year} className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span>{digits(y.year)}</span>
            <span className="os-muted">
              {digits(y.count)} {t('gifts.stats.pieces')}
            </span>
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
            <motion.div
              className="h-full"
              style={{ background: '#7dd3fc', width: `${(y.from_daddy / Math.max(1, maxCount)) * 100}%` }}
              initial={{ width: 0 }}
              animate={{ width: `${(y.from_daddy / Math.max(1, maxCount)) * 100}%` }}
            />
            <motion.div
              className="h-full"
              style={{ background: '#f9a8d4', width: `${(y.from_daughter / Math.max(1, maxCount)) * 100}%` }}
              initial={{ width: 0 }}
              animate={{ width: `${(y.from_daughter / Math.max(1, maxCount)) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3 pt-1 text-[10px] os-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: '#7dd3fc' }} /> {t('gifts.fromDaddy')}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full" style={{ background: '#f9a8d4' }} /> {t('gifts.fromMe')}
        </span>
      </div>
    </div>
  )
}

function GiftCard({ gift, index, onChange }: { gift: Gift; index: number; onChange: () => Promise<void> }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [reaction, setReaction] = useState(gift.reaction)

  const saveReaction = async () => {
    await patch(`/gifts/${gift.id}`, { reaction })
    playSuccess()
    await onChange()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3) }}
      className="os-card os-gift-card overflow-hidden"
    >
      <button className="flex w-full items-center gap-3 p-3 text-start" onClick={() => setOpen((v) => !v)}>
        {/*
          بندانگشتیِ هدیه به یک **جعبه‌ی کادویِ برجسته** تبدیل می‌شود:
          پخِ روشن از بالا و تیره از پایین، یک روبانِ عمودی و یک روبانِ
          افقی، و هنگامِ هاور کمی در عمق بیرون می‌آید و دورِ خودش می‌چرخد.
          همه با ``--q3d`` گیت شده‌اند پس در مهتاب تخت است و هیچ شاخه‌ی JS
          لازم نشد.
        */}
        <span className="os-gift-stage shrink-0">
          {gift.photo ? (
            <img src={gift.photo} alt={gift.name} className="os-gift-box h-12 w-12 rounded-xl object-cover" />
          ) : (
            <span
              className="os-gift-box flex h-12 w-12 items-center justify-center rounded-xl text-xl"
              style={{ background: 'var(--os-accent-soft)' }}
            >
              {gift.occasion_icon || '🎁'}
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-semibold">
            {gift.is_favorite && '⭐ '}
            {gift.name}
          </p>
          <p className="break-words text-[11px] os-muted">
            {gift.giver_label} → {gift.receiver_label} • {formatDate(gift.given_on)}
          </p>
        </div>
        <Icon name={open ? 'minus' : 'forward'} size={15} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="space-y-2 px-3 pb-3">
              {gift.description && <p className="text-xs leading-6 os-muted">{gift.description}</p>}
              <div className="flex flex-wrap gap-1.5 text-[10px]">
                {gift.occasion_name && <span className="os-chip">{gift.occasion_icon} {gift.occasion_name}</span>}
                <span className="os-chip">{gift.recorded_by_label}</span>
              </div>

              <label className="os-label">{t('gifts.reaction')}</label>
              <textarea
                className="os-input min-h-[64px]"
                placeholder={t('gifts.reactionPlaceholder')}
                value={reaction}
                onChange={(e) => setReaction(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <button className="os-btn-primary !px-3 !py-2 text-xs" onClick={() => void saveReaction()}>
                  {t('os.save')}
                </button>
                <button
                  className="os-btn !px-3 !py-2 text-xs"
                  onClick={async () => {
                    await patch(`/gifts/${gift.id}`, { is_favorite: !gift.is_favorite })
                    await onChange()
                  }}
                >
                  <Icon name="star" size={14} /> {gift.is_favorite ? t('gifts.unfavorite') : t('gifts.favorite')}
                </button>
                <button
                  className="os-btn ms-auto !px-3 !py-2 text-xs"
                  onClick={async () => {
                    await del(`/gifts/${gift.id}`)
                    await onChange()
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function AddGiftForm({
  occasions,
  onDone,
}: {
  occasions: Occasions['items']
  onDone: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [giver, setGiver] = useState<Owner>('daddy')
  const [receiver, setReceiver] = useState<Owner>('daughter')
  const [occasion, setOccasion] = useState('')
  const [givenOn, setGivenOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [description, setDescription] = useState('')
  const [reaction, setReaction] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError(t('gifts.needName'))
      playError()
      return
    }
    setSaving(true)
    const fd = new FormData()
    fd.append('name', name.trim())
    fd.append('giver', giver)
    fd.append('receiver', receiver)
    fd.append('recorded_by', giver)
    fd.append('given_on', givenOn)
    fd.append('description', description)
    fd.append('reaction', reaction)
    if (occasion) fd.append('occasion', occasion)
    if (photo) fd.append('photo', photo, photo.name)
    try {
      await upload('/gifts', fd)
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
      <p className="text-sm font-semibold">{t('gifts.addTitle')}</p>
      <input className="os-input" placeholder={t('gifts.namePlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-2">
        <label className="os-label">
          {t('gifts.giver')}
          <select className="os-input mt-1" value={giver} onChange={(e) => setGiver(e.target.value as Owner)}>
            <option value="daddy">👨 {t('gifts.daddy')}</option>
            <option value="daughter">👧 {t('gifts.me')}</option>
          </select>
        </label>
        <label className="os-label">
          {t('gifts.receiver')}
          <select className="os-input mt-1" value={receiver} onChange={(e) => setReceiver(e.target.value as Owner)}>
            <option value="daughter">👧 {t('gifts.me')}</option>
            <option value="daddy">👨 {t('gifts.daddy')}</option>
          </select>
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="os-label">
          {t('gifts.occasion')}
          <select className="os-input mt-1" value={occasion} onChange={(e) => setOccasion(e.target.value)}>
            <option value="">—</option>
            {occasions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.icon} {o.name}
              </option>
            ))}
          </select>
        </label>
        <label className="os-label">
          {t('gifts.date')}
          <div className="mt-1">
            <DateField value={givenOn} onChange={setGivenOn} />
          </div>
        </label>
      </div>
      <textarea
        className="os-input min-h-[56px]"
        placeholder={t('gifts.descriptionPlaceholder')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <input
        className="os-input"
        placeholder={t('gifts.reactionPlaceholder')}
        value={reaction}
        onChange={(e) => setReaction(e.target.value)}
      />
      <label className="os-btn flex cursor-pointer items-center justify-center gap-2 !py-2 text-xs">
        <Icon name="camera" size={15} />
        {photo ? photo.name.slice(0, 22) : t('gifts.photo')}
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
      </label>
      {error && <p className="text-[11px]" style={{ color: '#e2557f' }}>{error}</p>}
      <button className="os-btn-primary w-full" type="submit" disabled={saving}>
        {t('os.save')}
      </button>
    </motion.form>
  )
}
