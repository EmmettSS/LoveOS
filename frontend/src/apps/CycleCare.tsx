/**
 * CycleCare — چرخه و مراقبت
 * تقویم پریود (در فارسی: تقویم شمسی)، ثبت علائم، داروها (خوردم/بعداً/نمی‌تونم)،
 * گزارش‌های حرفه‌ای با نمودارهای جذاب و مراقبت از خود.
 * حساس است: همه‌چیز فقط از تاریخچه‌ی خود دخترم محاسبه می‌شود و پیام سلب مسئولیت دارد.
 */
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post } from '../shared/api'
import {
  digits,
  formatDate,
  isFa,
  jalaliMonthGrid,
  jalaliToday,
  JALALI_MONTHS,
  WEEKDAYS_FA_SHORT,
} from '../shared/format'
import { playSuccess } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, Chips, Loading, SectionTitle, Toggle, useApi } from '../shared/ui'

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
interface SymptomDay { day: string; mood: number; energy: number; headache: number; backache: number; stomachache: number; nausea: number; sleep: number; appetite: number; note: string; severity: number }

type Tab = 'calendar' | 'symptoms' | 'meds' | 'reports' | 'care'

const SYMPTOM_SCALE = ['mood', 'energy', 'headache', 'backache', 'stomachache', 'nausea', 'sleep', 'appetite'] as const

export default function CycleCare() {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const [tab, setTab] = useState<Tab>('calendar')
  const { data: ov, loading, error, reload } = useApi<Overview>('/cycle')

  if (loading || error) return <ApiStatus loading={loading} error={error} onRetry={() => void reload()} />
  if (!ov) return <ApiStatus loading={false} error="empty" />

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
  const todayJ = jalaliToday()
  const [view, setView] = useState(() => ({ jy: todayJ.jy, jm: todayJ.jm }))

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

  const dateStr = (d: Date) => d.toDateString()
  const inPeriod = (d: Date) =>
    ov.entries.some((e) => {
      const s = new Date(e.start_date)
      const en = e.end_date ? new Date(e.end_date) : new Date()
      return dateStr(d) >= dateStr(new Date(s.toDateString())) && dateStr(d) <= dateStr(new Date(en.toDateString()))
    })
  const isPredicted = (d: Date) => {
    if (!ov.stats.next_start || !ov.stats.next_end) return false
    return dateStr(d) >= dateStr(new Date(ov.stats.next_start)) && dateStr(d) <= dateStr(new Date(ov.stats.next_end))
  }
  const isOvulation = (d: Date) => !!ov.stats.ovulation && dateStr(d) === dateStr(new Date(ov.stats.ovulation))

  const cells = isFa() ? jalaliMonthGrid(view.jy, view.jm) : null
  const today = new Date()
  const gregCells = useMemo(() => {
    // در حالت انگلیسی همان نمای میلادی ساده (۶ هفته‌ی اخیر)
    return Array.from({ length: 42 }).map((_, i) => {
      const d = new Date(today)
      d.setDate(today.getDate() - 35 + i)
      return d
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const moveMonth = (dir: number) => {
    setView((v) => {
      let jm = v.jm + dir
      let jy = v.jy
      if (jm < 1) { jm = 12; jy -= 1 }
      if (jm > 12) { jm = 1; jy += 1 }
      return { jy, jm }
    })
  }

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
        <motion.p
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="os-card p-3 text-center text-sm"
          style={{ color: 'var(--os-accent)' }}
        >
          {t('cycle.inPeriod')} • {formatDate(ov.active_period.start_date)}
        </motion.p>
      )}

      <div className="os-card p-3">
        {isFa() && cells ? (
          <>
            {/* نوار ماه شمسی */}
            <div className="mb-2 flex items-center justify-between">
              <button className="os-chip !text-[10px]" onClick={() => moveMonth(-1)}>← {t('cycle.prevMonth')}</button>
              <p className="os-title text-base">
                {JALALI_MONTHS[view.jm - 1]} {digits(view.jy)}
              </p>
              <button className="os-chip !text-[10px]" onClick={() => moveMonth(1)}>{t('cycle.nextMonth')} →</button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {WEEKDAYS_FA_SHORT.map((d, i) => (
                <span key={i} className="pb-1 text-center text-[10px] os-muted">{d}</span>
              ))}
              {cells.map((c, i) => {
                const period = inPeriod(c.date)
                const pred = !period && isPredicted(c.date)
                const ovu = isOvulation(c.date)
                return (
                  <div
                    key={i}
                    className="flex aspect-square items-center justify-center rounded-lg text-[11px]"
                    style={{
                      background: period ? '#f767a8' : pred ? 'rgba(247,103,168,.22)' : ovu ? 'rgba(124,203,128,.35)' : c.inMonth ? 'var(--os-accent-soft)' : 'transparent',
                      color: period ? '#fff' : c.inMonth ? 'inherit' : 'var(--os-border)',
                      outline: c.isToday ? '2px solid var(--os-accent)' : 'none',
                      fontWeight: c.isToday ? 700 : 400,
                      opacity: c.inMonth ? 1 : 0.5,
                    }}
                  >
                    {digits(c.jd)}
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <div className="grid grid-cols-7 gap-1.5">
            {gregCells.map((d, i) => {
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
        )}
        <div className="mt-2 flex flex-wrap gap-2 text-[10px] os-muted">
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: '#f767a8' }} /> {t('cycle.period')}</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(247,103,168,.35)' }} /> {t('cycle.predicted')}</span>
          <span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ background: 'rgba(124,203,128,.5)' }} /> {t('cycle.ovulation')}</span>
        </div>
      </div>

      /* آمارها divِ ساده‌اند → ``.os-depth-list`` امن است.

         ⚠️ آنچه **عمداً** دست نخورده ماند: تقویمِ ``grid grid-cols-7``.
         آن پرمتراکم‌ترین و پراستفاده‌ترین سطحِ این اپ است و کج‌شدن یا
         عمق‌گرفتنِ خانه‌هایش خواناییِ تاریخ‌ها را می‌گرفت. انتخابِ خودِ
         بابا هم «محافظه‌کارانه» بود. آمارها عمق می‌گیرند، داده‌ها نه. */
      <div className="os-depth-list os-stage-3d grid grid-cols-2 gap-3">
        <div className="os-card os-slab p-3">
          <p className="text-[11px] os-muted">{t('cycle.avgCycle')}</p>
          <p className="os-title text-xl">{digits(ov.stats.avg_cycle)} {t('cycle.day')}</p>
        </div>
        <div className="os-card os-slab p-3">
          <p className="text-[11px] os-muted">{t('cycle.avgPeriod')}</p>
          <p className="os-title text-xl">{digits(ov.stats.avg_period)} {t('cycle.day')}</p>
        </div>
        <div className="os-card os-slab col-span-2 p-3">
          <p className="text-[11px] os-muted">{t('cycle.nextPredicted')}</p>
          <p className="os-title text-base">{ov.stats.next_start ? formatDate(ov.stats.next_start) : '—'}</p>
        </div>
      </div>

      {ov.stats.messages.map((m, i) => (
        <motion.p
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.12 }}
          className="os-card flex items-center gap-2 p-3 text-sm"
          style={{ color: ov.stats.alert ? '#e0478d' : 'var(--os-text)' }}
        >
          <span>{ov.stats.alert ? '⚠️' : '🌸'}</span>
          {m}
        </motion.p>
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
  const { data, loading, error, reload } = useApi<{ items: MedSlot[] }>('/meds/today')
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

  if (loading || error) return <ApiStatus loading={loading} error={error} onRetry={() => void reload()} />
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

/* ----------------------------------------------------------- نمودارها -- */
/** نمودار خطی با نوار محدوده‌ی طبیعی (برای روند طول چرخه) */
function TrendLine({ values, normal = [21, 35], labels }: { values: number[]; normal?: [number, number]; labels: string[] }) {
  const W = 300
  const H = 120
  const PAD = 22
  const maxV = Math.max(...values, normal[1] + 2)
  const minV = Math.min(...values, normal[0] - 2)
  const x = (i: number) => PAD + (i / Math.max(1, values.length - 1)) * (W - PAD * 2)
  const y = (v: number) => H - PAD - ((v - minV) / Math.max(1, maxV - minV)) * (H - PAD * 2)
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* نوار طبیعی */}
      <rect x={PAD} y={y(normal[1])} width={W - PAD * 2} height={Math.max(2, y(normal[0]) - y(normal[1]))} rx={6} fill="rgba(124,203,128,.18)" />
      {[normal[0], normal[1]].map((n) => (
        <g key={n}>
          <line x1={PAD} x2={W - PAD} y1={y(n)} y2={y(n)} stroke="rgba(124,203,128,.5)" strokeDasharray="4 4" strokeWidth="1" />
          <text x={W - PAD} y={y(n) - 3} textAnchor="end" fontSize="8" fill="var(--os-muted)">{digits(n)}</text>
        </g>
      ))}
      {/* خط روند */}
      {values.length > 1 && (
        <motion.polyline
          points={pts}
          fill="none"
          stroke="var(--os-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
        />
      )}
      {values.map((v, i) => {
        const inRange = !normal || (v >= normal[0] && v <= normal[1])
        return (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r="4" fill={inRange ? 'var(--os-accent)' : '#e0478d'} stroke="#fff" strokeWidth="1.5" />
            <text x={x(i)} y={y(v) - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill={inRange ? 'var(--os-text)' : '#e0478d'}>{digits(v)}</text>
            <text x={x(i)} y={H - 6} textAnchor="middle" fontSize="8" fill="var(--os-muted)">{labels[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** نمودار میله‌ای ساده */
function Bars({ values, labels, color = 'var(--os-accent)', warn }: { values: number[]; labels: string[]; color?: string; warn?: (v: number) => boolean }) {
  const max = Math.max(1, ...values)
  return (
    <div className="flex h-28 items-end gap-1.5">
      {values.map((v, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1" title={String(v)}>
          <span className="text-[9px] font-bold">{v > 0 ? digits(v) : ''}</span>
          <motion.div
            className="w-full rounded-t-lg"
            style={{ background: warn && warn(v) ? '#e0478d' : color, opacity: v ? 0.9 : 0.2 }}
            initial={{ height: 4 }}
            animate={{ height: `${Math.max(6, (v / max) * 80)}px` }}
            transition={{ delay: i * 0.05, type: 'spring', stiffness: 200, damping: 24 }}
          />
          <span className="text-[8px] os-muted">{labels[i]}</span>
        </div>
      ))}
    </div>
  )
}

/** نمودار دونات پایبندی */
function Donut({ value, size = 120, label }: { value: number; size?: number; label: string }) {
  const R = size / 2 - 10
  const C = 2 * Math.PI * R
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={R} fill="none" stroke="var(--os-border)" strokeWidth="12" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          fill="none"
          stroke="url(#loveos-donut)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C - (C * value) / 100 }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="loveos-donut" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff8cc0" />
            <stop offset="100%" stopColor="#bba0fb" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="os-title text-2xl" style={{ color: 'var(--os-accent)' }}>{digits(value)}٪</span>
        <span className="text-[9px] os-muted">{label}</span>
      </div>
    </div>
  )
}

/** میله‌ی افقی برای علائم */
function HBar({ label, value, max = 5, color = 'var(--os-accent)' }: { label: string; value: number; max?: number; color?: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span>{label}</span>
        <span className="font-bold">{digits(value)}/{digits(max)}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${(value / max) * 100}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- گزارش‌ها -- */
function ReportsTab({ ov }: { ov: Overview }) {
  const { t } = useTranslation()
  const { data: meds, loading: medsLoading, error: medsError } = useApi<{ taken: number; skipped: number; total: number; adherence: number; by_day: { day: string; taken: number; skipped: number }[] }>('/meds/report')
  const { data: symptoms, loading: symLoading, error: symptomsError } = useApi<{ items: SymptomDay[] }>('/cycle/symptoms?days=90')
  const [range, setRange] = useState<'30' | '90'>('90')

  const gaps = ov.stats.gaps
  const entries = ov.entries.slice().reverse() // قدیمی → جدید
  const lengths = entries.map((e) => e.length || 0)

  const symItems = symptoms?.items || []
  const symWindow = symItems.slice(-Math.min(60, Number(range)))
  const symAvg = useMemo(() => {
    const src = symItems.length ? symItems : []
    const out: Record<string, number> = {}
    for (const f of ['headache', 'backache', 'stomachache', 'nausea', 'sleep', 'appetite'] as const) {
      out[f] = src.length ? Math.round((src.reduce((a, s) => a + (s[f] || 0), 0) / src.length) * 10) / 10 : 0
    }
    return out
  }, [symItems])

  // چرخه‌هایی که ثبت شده‌اند: برچسب «نفره» بر اساس شروع
  const gapLabels = gaps.map((_, i) => digits(i + 1))
  const lengthLabels = entries.map((_e, i) => digits(i + 1))

  // روزهای پایبندی دارو (۳۰ روز)
  const dayBars = (meds?.by_day || []).slice(-14)

  const insights: { icon: string; text: string; warn?: boolean }[] = []
  if (gaps.length >= 3) {
    const last3 = gaps.slice(-3)
    if (max3(last3) - min3(last3) <= 3) insights.push({ icon: '🌸', text: t('cycle.insightRegular') })
    else insights.push({ icon: '', text: t('cycle.insightIrregular') })
    const last = gaps[gaps.length - 1]
    if (last < 21 || last > 35) insights.push({ icon: '⚠️', text: t('cycle.insightOutlier', { n: digits(last) }), warn: true })
  }
  if (meds && meds.total > 0) {
    if (meds.adherence >= 85) insights.push({ icon: '💊', text: t('cycle.insightMedsGood', { n: digits(meds.adherence) }) })
    else if (meds.adherence < 60) insights.push({ icon: '💊', text: t('cycle.insightMedsLow', { n: digits(meds.adherence) }), warn: true })
  }
  const topSym = (Object.entries(symAvg).sort((a, b) => b[1] - a[1])[0] || null) as [string, number] | null
  if (topSym && topSym[1] >= 2) {
    insights.push({ icon: '🌡️', text: t('cycle.insightTopSymptom', { name: t(`cycle.symptomFields.${topSym[0]}`), n: digits(topSym[1]) }) })
  }
  if (ov.stats.next_start) {
    insights.push({ icon: '📅', text: t('cycle.insightNext', { date: formatDate(ov.stats.next_start) }) })
  }
  if (medsError || symptomsError) return <ApiStatus loading={false} error={medsError || symptomsError} />

  return (
    <div className="space-y-3">
      {/* ---------------------------------------------------- نمای کلی */}
      <div className="grid grid-cols-2 gap-2">
        <SummaryCard icon="🔄" label={t('cycle.avgCycle')} value={`${digits(ov.stats.avg_cycle)} ${t('cycle.day')}`} />
        <SummaryCard icon="🩸" label={t('cycle.avgPeriod')} value={`${digits(ov.stats.avg_period)} ${t('cycle.day')}`} />
        <SummaryCard icon="📆" label={t('cycle.lastPeriod')} value={ov.stats.last_start ? formatDate(ov.stats.last_start) : '—'} small />
        <SummaryCard icon="🔮" label={t('cycle.nextPredicted')} value={ov.stats.next_start ? formatDate(ov.stats.next_start) : '—'} small />
      </div>

      {/* ------------------------------------------------- روند طول چرخه */}
      {gaps.length > 0 && (
        <div className="os-card p-3">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] os-muted">{t('cycle.trendTitle')}</p>
            <span className="os-chip !text-[9px]">{t('cycle.trendRange')}</span>
          </div>
          <TrendLine values={gaps.slice(-8)} labels={gapLabels.slice(-8)} />
        </div>
      )}

      {/* ------------------------------------------------- طول دوره‌ها */}
      {lengths.length > 0 && (
        <div className="os-card p-3">
          <p className="mb-2 text-[11px] os-muted">{t('cycle.lengthTitle')}</p>
          <Bars values={lengths.slice(-8)} labels={lengthLabels.slice(-8)} warn={(v) => v < 3 || v > 8} />
        </div>
      )}

      {/* ------------------------------------------------- پایبندی دارو */}
      {medsLoading ? (
        <Loading />
      ) : (
        meds && meds.total > 0 && (
          <div className="os-card space-y-3 p-3">
            <div className="flex items-center gap-4">
              <Donut value={meds.adherence} label={t('cycle.adherence')} />
              <div className="flex-1 space-y-1.5 text-[11px]">
                <p className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: '#34d399' }} />
                  {t('cycle.taken')}: <b>{digits(meds.taken)}</b>
                </p>
                <p className="flex items-center gap-1.5">
                  <i className="h-2.5 w-2.5 rounded-full" style={{ background: '#f87171' }} />
                  {t('cycle.skipped')}: <b>{digits(meds.skipped)}</b>
                </p>
                <p className="flex items-center gap-1.5 os-muted">
                  {t('cycle.totalDoses')}: <b>{digits(meds.total)}</b>
                </p>
              </div>
            </div>
            {dayBars.length > 0 && (
              <div>
                <p className="mb-1 text-[10px] os-muted">{t('cycle.lastTwoWeeks')}</p>
                <div className="flex items-end gap-1">
                  {dayBars.map((d) => {
                    const total = d.taken + d.skipped
                    return (
                      <div key={d.day} className="flex flex-1 flex-col items-center gap-0.5" title={d.day}>
                        <div className="flex h-10 w-full flex-col-reverse overflow-hidden rounded" style={{ background: 'var(--os-border)' }}>
                          <motion.div
                            className="w-full"
                            style={{ background: '#34d399' }}
                            initial={{ height: 0 }}
                            animate={{ height: `${(d.taken / Math.max(1, total)) * 100}%` }}
                          />
                          <motion.div
                            className="w-full"
                            style={{ background: '#f87171' }}
                            initial={{ height: 0 }}
                            animate={{ height: `${(d.skipped / Math.max(1, total)) * 100}%` }}
                          />
                        </div>
                        <span className="text-[7px] os-muted">{digits(Number(d.day.slice(8, 10)))}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )
      )}

      {/* ------------------------------------------------- علائم */}
      {!symLoading && symItems.length > 0 && (
        <div className="os-card space-y-3 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] os-muted">{t('cycle.symptomReport')}</p>
            <Chips
              items={[{ key: '30' as const, label: t('cycle.days30') }, { key: '90' as const, label: t('cycle.days90') }]}
              value={range}
              onChange={setRange}
            />
          </div>
          {/* روند شدت */}
          <TrendLine values={symWindow.map((s) => s.severity)} labels={symWindow.map((s) => digits(s.day.slice(8, 10)))} normal={[0, 3]} />
          <p className="-mt-1 text-[9px] os-muted">{t('cycle.severityTrend')}</p>
          <div className="space-y-2">
            {(['headache', 'backache', 'stomachache', 'nausea'] as const).map((f) => (
              <HBar key={f} label={t(`cycle.symptomFields.${f}`)} value={symAvg[f] || 0} />
            ))}
          </div>
        </div>
      )}

      {/* ------------------------------------------------- بینش‌ها */}
      {insights.length > 0 && (
        <div className="space-y-2">
          <SectionTitle>{t('cycle.insights')}</SectionTitle>
          {insights.map((ins, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="os-card flex items-center gap-2 p-3 text-sm"
              style={ins.warn ? { borderColor: 'rgba(224,71,141,.5)', color: '#e0478d' } : undefined}
            >
              <span className="text-base">{ins.icon}</span>
              {ins.text}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

const max3 = (a: number[]) => Math.max(...a)
const min3 = (a: number[]) => Math.min(...a)

function SummaryCard({ icon, label, value, small = false }: { icon: string; label: string; value: string; small?: boolean }) {
  return (
    <div className="os-card p-3">
      <p className="text-[10px] os-muted">{icon} {label}</p>
      <p className={`os-title mt-0.5 ${small ? 'text-sm leading-5' : 'text-xl'}`}>{value}</p>
    </div>
  )
}

/* ------------------------------------------------------ مراقبت از خود -- */
function CareTab() {
  const { t } = useTranslation()
  const { data, loading, error, setData } = useApi<{ items: CareItem[] }>('/care')

  const toggle = async (c: CareItem) => {
    const res = await post<{ enabled: boolean }>(`/care/${c.id}/toggle`)
    setData((prev) => (prev ? { items: prev.items.map((x) => (x.id === c.id ? { ...x, enabled: res.enabled } : x)) } : prev))
  }

  if (loading || error) return <ApiStatus loading={loading} error={error} />
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
          <Toggle on={c.enabled} onChange={() => void toggle(c)} />
        </div>
      ))}
    </div>
  )
}
