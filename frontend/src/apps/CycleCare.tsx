/**
 * CycleCare — چرخه و مراقبت
 * تقویم پریود، ثبت علائم، داروها (خوردم/بعداً/نمی‌تونم)، گزارش پایبندی و مراقبت از خود.
 * حساس است: همه‌چیز فقط از تاریخچه‌ی خود دخترم محاسبه می‌شود و پیام سلب مسئولیت دارد.
 */
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post } from '../shared/api'
import { digits, formatDate } from '../shared/format'
import { playSuccess } from '../shared/sound'
import { useOS } from '../shared/store'
import { Chips, Loading, SectionTitle, useApi } from '../shared/ui'

interface Overview {
  disclaimer: string
  active_period: { id: number; start_date: string } | null
  entries: { id: number; start_date: string; end_date: string | null; length: number }[]
  stats: {
    avg_cycle: number
    avg_period: number
    gaps: number[]
    messages: string[]
    alert: boolean
    last_start: string | null
    next_start: string | null
    next_end: string | null
    ovulation: string | null
  }
}

interface MedSlot {
  medication_id: number
  name: string
  dose: string
  pills: number
  note: string
  time: string
  log_id: number | null
  status: 'pending' | 'taken' | 'snoozed' | 'skipped'
}

interface CareItem { id: number; text: string; hour: number; minute: number; enabled: boolean }

type Tab = 'calendar' | 'symptoms' | 'meds' | 'reports' | 'care'

const SYMPTOM_SCALE = ['mood', 'energy', 'headache', 'backache', 'stomachache', 'nausea', 'sleep', 'appetite'] as const

export default function CycleCare() {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const [tab, setTab] = useState<Tab>('calendar')
  const { data: ov, loading, reload } = useApi<Overview>('/cycle')

  if (loading || !ov) return <Loading />

  return (
    <div className="space-y-3">
      <Chips<Tab>
        items={[
          { key: 'calendar', label: t('cycle.calendar') },
          { key: 'symptoms', label: t('cycle.symptoms') },
          { key: 'meds', label: t('cycle.meds') },
          { key: 'reports', label: t('cycle.reports') },
          { key: 'care', label: t('cycle.care') },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'calendar' && <CalendarTab ov={ov} reload={reload} showToast={showToast} />}
      {tab === 'symptoms' && <SymptomsTab showToast={showToast} />}
      {tab === 'meds' && <MedsTab showToast={showToast} />}
      {tab === 'reports' && <ReportsTab ov={ov} />}
      {tab === 'care' && <CareTab />}

      <p className="pt-2 text-center text-[11px] os-muted">⚕️ {ov.disclaimer}</p>
    </div>
  )
}

/* ------------------------------------------------------------ تقویم ---- */
function CalendarTab({ ov, reload, showToast }: { ov: Overview; reload: () => Promise<void>; showToast: (s: string, tone?: 'love' | 'info') => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const act = async (which: 'start' | 'end') => {
    setBusy(true)
    try {
      const res = await post<{ ok: boolean; message?: string }>(`/cycle/${which}`)
      if (res.ok) { playSuccess(); showToast(t('os.saved'), 'love') } else showToast(res.message || t('os.error'))
      await reload()
    } finally {
      setBusy(false)
    }
  }

  // ۶ هفته‌ی اخیر برای نمایش سریع
  const today = new Date()
  const days = Array.from({ length: 42 }).map((_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() - 35 + i)
    return d
  })
  const inPeriod = (d: Date) =>
    ov.entries.some((e) => {
      const s = new Date(e.start_date)
      const en = e.end_date ? new Date(e.end_date) : new Date()
      return d >= new Date(s.toDateString()) && d <= new Date(en.toDateString())
    })
  const isPredicted = (d: Date) => {
    if (!ov.stats.next_start || !ov.stats.next_end) return false
    return d >= new Date(ov.stats.next_start) && d <= new Date(ov.stats.next_end)
  }
  const isOvulation = (d: Date) => ov.stats.ovulation && d.toDateString() === new Date(ov.stats.ovulation).toDateString()

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button className="os-btn-primary flex-1" onClick={() => void act('start')} disabled={busy || !!ov.active_period}>
          {t('cycle.startPeriod')}
        </button>
        <button className="os-btn flex-1" onClick={() => void act('end')} disabled={busy || !ov.active_period}>
          {t('cycle.endPeriod')}
        </button>
      </div>

      {ov.active_period && (
        <p className="os-card p-3 text-center text-sm" style={{ color: 'var(--os-accent)' }}>
          {t('cycle.inPeriod')} • {formatDate(ov.active_period.start_date)}
        </p>
      )}

      <div className="os-card p-3">
        <div className="grid grid-cols-7 gap-1.5">
          {days.map((d, i) => {
            const period = inPeriod(d)
            const pred = !period && isPredicted(d)
            const ovu = isOvulation(d)
            const isToday = d.toDateString() === today.toDateString()
            return (
              <div
                key={i}
                className="flex aspect-square items-center justify-center rounded-lg text-[10px]"
                style={{
                  background: period ? '#f767a8' : pred ? 'rgba(247,103,168,.22)' : ovu ? 'rgba(124,203,128,.35)' : 'var(--os-accent-soft)',
                  color: period ? '#fff' : 'inherit',
                  outline: isToday ? '2px solid var(--os-accent)' : 'none',
                }}
              >
                {digits(d.getDate())}
              </div>
            )
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] os-muted">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: '#f767a8' }} /> {t('cycle.period')}</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(247,103,168,.35)' }} /> {t('cycle.predicted')}</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(124,203,128,.5)' }} /> {t('cycle.ovulation')}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="os-card p-3">
          <p className="text-[11px] os-muted">{t('cycle.avgCycle')}</p>
          <p className="os-title text-xl">{digits(ov.stats.avg_cycle)} {t('cycle.day')}</p>
        </div>
        <div className="os-card p-3">
          <p className="text-[11px] os-muted">{t('cycle.avgPeriod')}</p>
          <p className="os-title text-xl">{digits(ov.stats.avg_period)} {t('cycle.day')}</p>
        </div>
        <div className="os-card col-span-2 p-3">
          <p className="text-[11px] os-muted">{t('cycle.nextPredicted')}</p>
          <p className="os-title text-base">{ov.stats.next_start ? formatDate(ov.stats.next_start) : '—'}</p>
        </div>
      </div>

      {ov.stats.messages.map((m, i) => (
        <p key={i} className="os-card p-3 text-sm" style={{ color: ov.stats.alert ? '#e0478d' : 'var(--os-text)' }}>
          {m}
        </p>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------ علائم ---- */
function SymptomsTab({ showToast }: { showToast: (s: string, tone?: 'love' | 'info') => void }) {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<string, number>>({})
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await post('/cycle/symptoms', { ...values, note })
      playSuccess()
      showToast(t('os.saved'), 'love')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {SYMPTOM_SCALE.map((f) => (
        <div key={f} className="os-card p-3">
          <div className="mb-1.5 flex items-center">
            <span className="flex-1 text-sm">{t(`cycle.symptomFields.${f}`)}</span>
            <span className="text-xs os-muted">{digits(values[f] ?? 0)}/۵</span>
          </div>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setValues((v) => ({ ...v, [f]: n }))}
                className="h-8 flex-1 rounded-lg text-[11px] transition active:scale-95"
                style={{
                  background: (values[f] ?? 0) >= n && n > 0 ? 'var(--os-accent)' : 'var(--os-accent-soft)',
                  color: (values[f] ?? 0) >= n && n > 0 ? '#fff' : 'inherit',
                }}
              >
                {digits(n)}
              </button>
            ))}
          </div>
        </div>
      ))}
      <textarea className="os-input min-h-[80px]" placeholder={t('mood.note')} value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="os-btn-primary w-full" onClick={() => void save()} disabled={saving}>{t('os.save')}</button>
    </div>
  )
}

/* ------------------------------------------------------------ داروها --- */
function MedsTab({ showToast }: { showToast: (s: string, tone?: 'love' | 'info') => void }) {
  const { t } = useTranslation()
  const { data, loading, reload } = useApi<{ items: MedSlot[] }>('/meds/today')
  const [form, setForm] = useState({ name: '', dose: '', times: '', note: '' })
  const [adding, setAdding] = useState(false)

  const act = async (slot: MedSlot, action: 'taken' | 'snooze' | 'skip') => {
    await post('/meds/act', { medication_id: slot.medication_id, time: slot.time, action })
    if (action === 'taken') playSuccess()
    showToast(t('os.saved'), action === 'taken' ? 'love' : 'info')
    await reload()
  }

  const addMed = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setAdding(true)
    try {
      await post('/meds', {
        name: form.name,
        dose: form.dose,
        note: form.note,
        times: form.times.split(',').map((s) => s.trim()).filter(Boolean),
      })
      setForm({ name: '', dose: '', times: '', note: '' })
      await reload()
    } finally {
      setAdding(false)
    }
  }

  if (loading) return <Loading />
  const items = data?.items || []

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="os-empty">{t('cycle.noMeds')}</p>
      ) : (
        items.map((s, i) => (
          <motion.div key={`${s.medication_id}-${s.time}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="os-card p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}>
                <Icon name="pill" size={17} />
              </span>
              <div className="flex-1">
                <p className="text-sm font-semibold">{s.name}</p>
                <p className="text-[11px] os-muted">{digits(s.time)} • {s.dose} • {digits(s.pills)}</p>
              </div>
              {s.status !== 'pending' && (
                <span className="os-chip !text-[10px]">{s.status === 'taken' ? '✅' : s.status === 'skipped' ? '⚠️' : '⏰'}</span>
              )}
            </div>
            {s.note && <p className="mt-1 text-[11px] os-muted">{s.note}</p>}
            {s.status !== 'taken' && (
              <div className="mt-2 flex gap-2">
                <button className="os-btn-primary flex-1 !py-2 !text-xs" onClick={() => void act(s, 'taken')}>{t('cycle.took')}</button>
                <button className="os-btn flex-1 !py-2 !text-xs" onClick={() => void act(s, 'snooze')}>{t('cycle.snooze')}</button>
                <button className="os-btn flex-1 !py-2 !text-xs" onClick={() => void act(s, 'skip')}>{t('cycle.skip')}</button>
              </div>
            )}
          </motion.div>
        ))
      )}

      <SectionTitle>{t('cycle.addMed')}</SectionTitle>
      <form onSubmit={addMed} className="os-card space-y-2 p-3">
        <input className="os-input" placeholder={t('cycle.medName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="os-input" placeholder={t('cycle.medDose')} value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
        <input className="os-input" placeholder={t('cycle.medTimes')} value={form.times} onChange={(e) => setForm({ ...form, times: e.target.value })} />
        <input className="os-input" placeholder={t('cycle.medNote')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="os-btn-primary w-full" type="submit" disabled={adding}>{t('os.add')}</button>
      </form>
    </div>
  )
}

/* ----------------------------------------------------------- گزارش‌ها -- */
function ReportsTab({ ov }: { ov: Overview }) {
  const { t } = useTranslation()
  const { data, loading } = useApi<{ taken: number; skipped: number; total: number; adherence: number; by_day: { day: string; taken: number; skipped: number }[] }>('/meds/report')
  if (loading) return <Loading />

  const maxGap = Math.max(...(ov.stats.gaps.length ? ov.stats.gaps : [28]))

  return (
    <div className="space-y-3">
      <div className="os-card p-3">
        <p className="text-[11px] os-muted">{t('cycle.adherence')}</p>
        <p className="os-title text-2xl" style={{ color: 'var(--os-accent)' }}>{digits(data?.adherence || 0)}٪</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
          <motion.div className="h-full rounded-full" style={{ background: 'linear-gradient(90deg,#ff9ecb,#bba0fb)' }} initial={{ width: 0 }} animate={{ width: `${data?.adherence || 0}%` }} />
        </div>
        <p className="mt-1.5 text-[11px] os-muted">✅ {digits(data?.taken || 0)} • ⚠️ {digits(data?.skipped || 0)}</p>
      </div>

      <div className="os-card p-3">
        <p className="mb-2 text-[11px] os-muted">{t('cycle.avgCycle')}</p>
        <div className="flex h-24 items-end gap-1.5">
          {(ov.stats.gaps.length ? ov.stats.gaps : [28]).map((g, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-t-lg"
              style={{ background: g < 21 || g > 35 ? '#e0478d' : 'var(--os-accent)' }}
              initial={{ height: 0 }}
              animate={{ height: `${(g / maxGap) * 100}%` }}
              transition={{ delay: i * 0.04 }}
              title={`${g}`}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------ مراقبت از خود -- */
function CareTab() {
  const { t } = useTranslation()
  const { data, loading, setData } = useApi<{ items: CareItem[] }>('/care')

  const toggle = async (c: CareItem) => {
    const res = await post<{ enabled: boolean }>(`/care/${c.id}/toggle`)
    setData((prev) => (prev ? { items: prev.items.map((x) => (x.id === c.id ? { ...x, enabled: res.enabled } : x)) } : prev))
  }

  if (loading) return <Loading />
  const items = data?.items || []
  if (items.length === 0) return <p className="os-empty">{t('os.empty')}</p>

  return (
    <div className="space-y-2">
      {items.map((c) => (
        <div key={c.id} className="os-card flex items-center gap-3 p-3">
          <span className="text-xl">🌷</span>
          <div className="flex-1">
            <p className="text-sm">{c.text}</p>
            <p className="text-[11px] os-muted">{digits(String(c.hour).padStart(2, '0'))}:{digits(String(c.minute).padStart(2, '0'))}</p>
          </div>
          <button
            onClick={() => void toggle(c)}
            className="h-7 w-12 rounded-full p-0.5 transition"
            style={{ background: c.enabled ? 'var(--os-accent)' : 'var(--os-border)' }}
            aria-label="toggle"
          >
            <motion.span className="block h-6 w-6 rounded-full bg-white" animate={{ x: c.enabled ? 20 : 0 }} />
          </button>
        </div>
      ))}
    </div>
  )
}
