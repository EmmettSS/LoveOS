/**
 * CallSync — هماهنگ‌کننده‌ی تماس ❤
 *
 * چهار بخش دارد:
 *   ۱) تماس بعدی: شمارش معکوس زنده + ساعت به وقت هر دو طرف
 *   ۲) هفته‌ی ما: بازه‌های آزاد هر دو + بازه‌های مشترک (قلبِ اپ)
 *   ۳) هماهنگی: پیشنهاد تماس، تأیید/رد/جابه‌جایی
 *   ۴) دفتر تماس‌ها: ثبت تماس با مدت، حال‌وهوا و ضمیمه‌ی صوتی (ضبط با میکروفن)
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { DateField } from '../shared/JalaliDatePicker'
import { del, post, upload } from '../shared/api'
import { digits, formatDate, monthKeyLabel, weekdayName, weekdayNameByIndex } from '../shared/format'
import { formatClock, micSupported, useRecorder } from '../shared/recorder'
import { playError, playSuccess, vibrate } from '../shared/sound'
import { Chips, Empty, Loading, SectionTitle, useApi } from '../shared/ui'

type Owner = 'daddy' | 'daughter'

interface Slot {
  id: number
  owner: Owner
  owner_label: string
  weekday: number
  weekday_label: string
  start: string
  end: string
  minutes: number
  note: string
}

interface Appointment {
  id: number
  proposer: Owner
  proposer_label: string
  proposee: Owner
  proposee_label: string
  date: string
  time: string
  duration_minutes: number
  topic: string
  status: 'pending' | 'approved' | 'rejected' | 'rescheduled' | 'canceled' | 'done'
  status_label: string
  message: string
  answer_note: string
  alternative_of: number | null
  seconds_to_start: number
  is_upcoming: boolean
  sides_time: Record<string, { city: string; timezone: string; time: string; day_offset: number }>
  logged: boolean
}

interface CallLog {
  id: number
  appointment: number | null
  happened_on: string
  happened_at: string | null
  kind: string
  kind_label: string
  duration_minutes: number
  duration_label: string
  topic: string
  daddy_mood: string
  daughter_mood: string
  note: string
  attachment: string | null
  recorded_by_label: string
}

interface Stats {
  month_count: number
  month_minutes: number
  month_label: string
  total_count: number
  total_label: string
  record_title: string
  average_minutes: number
  longest: CallLog | null
  months: { key: string; label: string; count: number; minutes: number }[]
  mood_breakdown: { happy: number; normal: number; missing: number }
}

interface Overview {
  slots: Slot[]
  overlap: { weekday: number; weekday_label: string; start: string; end: string; minutes: number }[]
  appointments: Appointment[]
  next: Appointment | null
  logs: CallLog[]
  stats: Stats
  settings: { reminder_minutes: number; default_duration: number; notify_reminder: boolean }
}

const KINDS = ['video', 'voice', 'group'] as const
const MOODS: { key: string; emoji: string }[] = [
  { key: 'happy', emoji: '😄' },
  { key: 'normal', emoji: '🙂' },
  { key: 'missing', emoji: '🥺' },
]

/** ۳۶۰۰ ثانیه → «۱ ساعت و ۰ دقیقه» */
function humanSeconds(total: number, hoursWord: string, minutesWord: string) {
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0 && m > 0) return `${digits(h)} ${hoursWord} و ${digits(m)} ${minutesWord}`
  if (h > 0) return `${digits(h)} ${hoursWord}`
  return `${digits(Math.max(1, m))} ${minutesWord}`
}

export default function CallSync() {
  const { t } = useTranslation()
  const { data, loading, reload } = useApi<Overview>('/calls/overview')
  const [tab, setTab] = useState<'next' | 'week' | 'plan' | 'logs'>('next')

  if (loading || !data) return <Loading />

  return (
    <div className="space-y-3">
      <NextCallHero next={data.next} stats={data.stats} onGo={() => setTab('plan')} />

      <Chips
        items={[
          { key: 'next' as const, label: t('calls.tabs.next') },
          { key: 'week' as const, label: t('calls.tabs.week') },
          { key: 'plan' as const, label: t('calls.tabs.plan') },
          { key: 'logs' as const, label: t('calls.tabs.logs') },
        ]}
        value={tab}
        onChange={setTab}
      />

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === 'next' && <NextTab data={data} reload={reload} />}
          {tab === 'week' && <WeekTab overlap={data.overlap} slots={data.slots} reload={reload} />}
          {tab === 'plan' && <PlanTab appointments={data.appointments} reload={reload} />}
          {tab === 'logs' && <LogsTab logs={data.logs} stats={data.stats} appointments={data.appointments} reload={reload} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* --------------------------------------------------------------- تماس بعدی -- */
function NextCallHero({ next, stats, onGo }: { next: Appointment | null; stats: Stats; onGo: () => void }) {
  const { t } = useTranslation()
  const [left, setLeft] = useState(next?.seconds_to_start ?? 0)

  useEffect(() => {
    setLeft(next?.seconds_to_start ?? 0)
    const id = window.setInterval(() => setLeft((v) => Math.max(0, v - 1)), 1000)
    return () => window.clearInterval(id)
  }, [next?.id, next?.seconds_to_start])

  if (!next) {
    return (
      <div className="os-card space-y-2 p-4 text-center">
        <p className="text-3xl">📞</p>
        <p className="text-sm">{t('calls.noNext')}</p>
        <button className="os-btn-primary mx-auto !px-4 !py-2 text-xs" onClick={onGo}>
          {t('calls.proposeNow')}
        </button>
      </div>
    )
  }

  const sides = Object.values(next.sides_time || {})
  return (
    <div
      className="os-card space-y-3 p-4"
      style={{ background: 'linear-gradient(140deg, var(--os-accent-soft), transparent)' }}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl text-white" style={{ background: 'var(--os-accent)' }}>
          <Icon name="call" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="os-title text-base">{t('calls.nextTitle')}</p>
          <p className="text-[11px] os-muted">
            {weekdayName(new Date(next.date))} • {formatDate(next.date)} • {digits(next.time)}
          </p>
        </div>
        <span className="os-chip os-chip-active shrink-0">{next.status_label}</span>
      </div>

      <div className="rounded-2xl p-3 text-center" style={{ background: 'var(--os-card, rgba(255,255,255,.55))' }}>
        <p className="os-title text-3xl tabular-nums" style={{ color: 'var(--os-accent)' }}>
          {humanSeconds(left, t('os.hours'), t('os.minutes'))}
        </p>
        <p className="mt-1 text-[11px] os-muted">{t('calls.countdownHint')}</p>
      </div>

      {sides.length > 0 && (
        <div className="grid grid-cols-2 gap-2 text-center text-xs">
          {sides.map((s, i) => (
            <div key={i} className="rounded-xl p-2" style={{ background: 'var(--os-border)' }}>
              <p className="os-muted">{s.city || t('calls.yourSide')}</p>
              <p className="mt-0.5 text-base font-bold tabular-nums">{digits(s.time)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] os-muted">
        <span>⏰ {t('calls.reminderAt', { minutes: digits(60) })}</span>
        <span>
          🎯 {t('calls.record')}: {stats.longest ? `${stats.longest.duration_label} • ${formatDate(stats.longest.happened_on)}` : '—'}
        </span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ تب تماس بعدی -- */
function NextTab({ data, reload }: { data: Overview; reload: () => void }) {
  const { t } = useTranslation()
  const next = data.next
  const [busy, setBusy] = useState(false)

  const respond = async (action: 'approve' | 'reject') => {
    if (!next) return
    setBusy(true)
    await post(`/calls/appointments/${next.id}/respond`, { action })
    if (action === 'approve') playSuccess()
    else playError()
    await reload()
    setBusy(false)
  }

  const stats = data.stats
  return (
    <div className="space-y-3">
      <SectionTitle>{t('calls.monthSummary')}</SectionTitle>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: t('calls.monthCalls'), value: digits(stats.month_count) },
          { label: t('calls.monthTime'), value: stats.month_label },
          { label: t('calls.average'), value: `${digits(stats.average_minutes)} ${t('os.minutes')}` },
        ].map((c) => (
          <div key={c.label} className="os-card p-3">
            <p className="text-[10px] os-muted">{c.label}</p>
            <p className="mt-1 text-sm font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      <SectionTitle>{t('calls.lastSixMonths')}</SectionTitle>
      <MonthChart months={stats.months} />

      <SectionTitle>{t('calls.moods')}</SectionTitle>
      <div className="os-card flex items-center justify-around p-3 text-center text-xs">
        {MOODS.map((m) => (
          <div key={m.key}>
            <p className="text-xl">{m.emoji}</p>
            <p className="mt-1 os-muted">{t(`calls.mood.${m.key}`)}</p>
            <p className="font-bold">{digits(stats.mood_breakdown[m.key as 'happy'] ?? 0)}</p>
          </div>
        ))}
      </div>

      {next && next.status === 'pending' && next.proposee === 'daughter' && (
        <div className="os-card space-y-2 p-3">
          <p className="text-sm">{t('calls.answerPrompt', { name: next.proposer_label })}</p>
          <div className="flex gap-2">
            <button disabled={busy} className="os-btn-primary flex-1" onClick={() => void respond('approve')}>
              {t('calls.approve')}
            </button>
            <button disabled={busy} className="os-btn flex-1" onClick={() => void respond('reject')}>
              {t('calls.reject')}
            </button>
          </div>
        </div>
      )}

      <p className="px-1 text-[11px] os-muted">{t('calls.tipSnack')}</p>
    </div>
  )
}

/** نمودار میله‌ای ساده — بدون کتابخانه‌ی اضافه */
function MonthChart({ months }: { months: Stats['months'] }) {
  const max = Math.max(1, ...months.map((m) => m.minutes))
  return (
    <div className="os-card flex items-end gap-2 p-3" style={{ height: 150 }}>
      {months.map((m) => (
        <div key={m.key} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] tabular-nums os-muted">{m.count > 0 ? digits(m.count) : ''}</span>
          <motion.div
            className="w-full rounded-t-xl"
            style={{ background: 'var(--os-accent)', opacity: m.count ? 0.85 : 0.2 }}
            initial={{ height: 4 }}
            animate={{ height: `${Math.max(6, (m.minutes / max) * 88)}px` }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          />
          <span className="text-[9px] os-muted">{monthKeyLabel(m.key)}</span>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- هفته‌ی ما --- */
function WeekTab({
  overlap,
  slots,
  reload,
}: {
  overlap: Overview['overlap']
  slots: Slot[]
  reload: () => void
}) {
  const { t } = useTranslation()
  const [owner, setOwner] = useState<Owner>('daughter')
  const [weekday, setWeekday] = useState(0)
  const [start, setStart] = useState('20:00')
  const [end, setEnd] = useState('21:00')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const grouped = useMemo(() => {
    const map: Record<number, Slot[]> = {}
    slots.forEach((s) => {
      map[s.weekday] = map[s.weekday] || []
      map[s.weekday].push(s)
    })
    return map
  }, [slots])

  const addSlot = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (end <= start) {
      setError(t('calls.endAfterStart'))
      playError()
      return
    }
    try {
      await post('/calls/slots', { owner, weekday, start, end, note })
      playSuccess()
      setNote('')
      await reload()
    } catch {
      setError(t('calls.saveFailed'))
    }
  }

  return (
    <div className="space-y-3">
      <SectionTitle action={<span className="text-[11px] os-muted">{t('calls.overlapHint')}</span>}>
        {t('calls.sharedWindows')}
      </SectionTitle>
      {overlap.length === 0 ? (
        <Empty text={t('calls.noOverlap')} />
      ) : (
        <div className="space-y-2">
          {overlap.map((o, i) => (
            <motion.div
              key={`${o.weekday}-${o.start}`}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="os-card flex items-center gap-3 p-3"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl text-lg" style={{ background: 'var(--os-accent-soft)' }}>
                💞
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{o.weekday_label}</p>
                <p className="text-[11px] os-muted">
                  {digits(o.start)} — {digits(o.end)} • {digits(o.minutes)} {t('os.minutes')}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <SectionTitle>{t('calls.freeTimes')}</SectionTitle>
      <div className="space-y-1.5">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => {
          const list = grouped[d] || []
          if (list.length === 0) return null
          return (
            <div key={d} className="os-card p-2.5">
              <p className="mb-1.5 text-[11px] font-semibold os-muted">{weekdayNameByIndex(d)}</p>
              <div className="flex flex-wrap gap-1.5">
                {list.map((s) => (
                  <span
                    key={s.id}
                    className="group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px]"
                    style={{ background: s.owner === 'daddy' ? '#7dd3fc33' : '#f9a8d433' }}
                  >
                    {s.owner === 'daddy' ? '👨' : '👧'} {digits(s.start)}–{digits(s.end)}
                    <button
                      className="opacity-60 transition hover:opacity-100"
                      title={t('os.delete')}
                      onClick={async () => {
                        await del(`/calls/slots/${s.id}`)
                        await reload()
                      }}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={addSlot} className="os-card space-y-2 p-3">
        <p className="text-sm font-semibold">{t('calls.addFreeTime')}</p>
        <Chips
          items={[
            { key: 'daughter' as Owner, label: `👧 ${t('calls.me')}` },
            { key: 'daddy' as Owner, label: `👨 ${t('calls.daddy')}` },
          ]}
          value={owner}
          onChange={setOwner}
        />
        <div className="flex gap-2">
          <select className="os-input" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <option key={d} value={d}>
                {weekdayNameByIndex(d)}
              </option>
            ))}
          </select>
          <input className="os-input" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          <input className="os-input" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <input className="os-input" placeholder={t('calls.slotNote')} value={note} onChange={(e) => setNote(e.target.value)} />
        {error && <p className="text-[11px]" style={{ color: '#e2557f' }}>{error}</p>}
        <button className="os-btn-primary w-full" type="submit">
          {t('os.add')}
        </button>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------- هماهنگی ---- */
function PlanTab({ appointments, reload }: { appointments: Appointment[]; reload: () => void }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(() => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10))
  const [time, setTime] = useState('21:00')
  const [duration, setDuration] = useState(30)
  const [topic, setTopic] = useState('')
  const [proposer, setProposer] = useState<Owner>('daughter')
  const [busy, setBusy] = useState(false)
  const [alt, setAlt] = useState<Appointment | null>(null)

  const propose = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    await post('/calls/appointments', {
      proposer,
      date,
      time,
      duration_minutes: duration,
      topic: topic.trim(),
    })
    playSuccess()
    setTopic('')
    await reload()
    setBusy(false)
  }

  const respond = async (appt: Appointment, action: 'approve' | 'reject' | 'reschedule', extra: Record<string, unknown> = {}) => {
    await post(`/calls/appointments/${appt.id}/respond`, { action, ...extra })
    if (action === 'reject') playError()
    else playSuccess()
    setAlt(null)
    await reload()
  }

  const pending = appointments.filter((a) => a.status === 'pending')
  const upcoming = appointments.filter((a) => ['approved', 'rescheduled'].includes(a.status))
  const past = appointments.filter((a) => ['done', 'rejected', 'canceled'].includes(a.status))

  return (
    <div className="space-y-3">
      <form onSubmit={propose} className="os-card relative space-y-2 p-3 !overflow-visible" style={{ overflow: 'visible', zIndex: 20 }}>
        <p className="text-sm font-semibold">{t('calls.proposeTitle')}</p>
        <Chips
          items={[
            { key: 'daughter' as Owner, label: `👧 ${t('calls.fromMe')}` },
            { key: 'daddy' as Owner, label: `👨 ${t('calls.fromDaddy')}` },
          ]}
          value={proposer}
          onChange={setProposer}
        />
        <div className="relative flex gap-2" style={{ zIndex: 30, overflow: 'visible' }}>
          <div className="flex-1">
            <DateField value={date} onChange={setDate} />
          </div>
          <input className="os-input w-28" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          {[15, 30, 45, 60].map((d) => (
            <button
              key={d}
              type="button"
              className={`os-chip ${duration === d ? 'os-chip-active' : ''}`}
              onClick={() => setDuration(d)}
            >
              {digits(d)} {t('os.minutes')}
            </button>
          ))}
        </div>
        <input className="os-input" placeholder={t('calls.topicPlaceholder')} value={topic} onChange={(e) => setTopic(e.target.value)} />
        <button className="os-btn-primary w-full" type="submit" disabled={busy}>
          {t('calls.proposeSend')}
        </button>
      </form>

      {pending.length > 0 && <SectionTitle>{t('calls.waitingAnswer')}</SectionTitle>}
      {pending.map((a) => (
        <div key={a.id} className="os-card space-y-2 p-3">
          <div className="flex items-center gap-2 text-sm">
            <span>{a.proposer === 'daddy' ? '👨' : '👧'}</span>
            <span className="flex-1">
              {a.proposer_label} → {a.proposee_label}
            </span>
            <span className="os-chip os-chip-active">{a.status_label}</span>
          </div>
          <p className="text-[11px] os-muted">
            {formatDate(a.date)} • {digits(a.time)} • {digits(a.duration_minutes)} {t('os.minutes')}
            {a.topic ? ` • ${a.topic}` : ''}
          </p>
          <div className="flex gap-2">
            <button className="os-btn-primary flex-1 !py-2 text-xs" onClick={() => void respond(a, 'approve')}>
              <Icon name="check" size={14} /> {t('calls.approve')}
            </button>
            <button className="os-btn flex-1 !py-2 text-xs" onClick={() => void respond(a, 'reject')}>
              {t('calls.reject')}
            </button>
            <button
              className="os-btn flex-1 !py-2 text-xs"
              onClick={() => setAlt(alt?.id === a.id ? null : a)}
              title={t('calls.reschedule')}
            >
              <Icon name="retry" size={14} /> {t('calls.reschedule')}
            </button>
          </div>
          {alt?.id === a.id && (
            <RescheduleForm
              appointment={a}
              onSubmit={(d, tm) => void respond(a, 'reschedule', { date: d, time: tm })}
            />
          )}
        </div>
      ))}

      {upcoming.length > 0 && <SectionTitle>{t('calls.approved')}</SectionTitle>}
      {upcoming.map((a) => (
        <div key={a.id} className="os-card space-y-1.5 p-3">
          <div className="flex items-center gap-2 text-sm">
            <Icon name="check" size={15} />
            <span className="flex-1">
              {weekdayName(new Date(a.date))} {formatDate(a.date)} • {digits(a.time)}
            </span>
            <button
              className="os-muted"
              onClick={async () => {
                await post(`/calls/appointments/${a.id}/cancel`, {})
                await reload()
              }}
              title={t('os.cancel')}
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          {a.alternative_of && <p className="text-[10px] os-muted">🔁 {t('calls.isAlternative')}</p>}
        </div>
      ))}

      {past.length > 0 && <SectionTitle>{t('calls.history')}</SectionTitle>}
      {past.slice(0, 12).map((a) => (
        <div key={a.id} className="os-card flex items-center gap-2 p-2.5 text-[11px] os-muted">
          <span>{a.status === 'done' ? '✅' : a.status === 'rejected' ? '❌' : '🚫'}</span>
          <span className="flex-1">
            {formatDate(a.date)} • {digits(a.time)}
          </span>
          <span>{a.logged ? t('calls.logged') : a.status_label}</span>
        </div>
      ))}
    </div>
  )
}

function RescheduleForm({ appointment, onSubmit }: { appointment: Appointment; onSubmit: (date: string, time: string) => void }) {
  const { t } = useTranslation()
  const [date, setDate] = useState(appointment.date)
  const [time, setTime] = useState(appointment.time)
  return (
    <div className="relative space-y-2 rounded-xl p-2 !overflow-visible" style={{ background: 'var(--os-border)', overflow: 'visible', zIndex: 30 }}>
      <div className="relative flex gap-2" style={{ zIndex: 40, overflow: 'visible' }}>
        <div className="flex-1">
          <DateField value={date} onChange={setDate} />
        </div>
        <input className="os-input w-28" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <button className="os-btn w-full !py-2 text-xs" onClick={() => onSubmit(date, time)}>
        {t('calls.sendAlternative')}
      </button>
    </div>
  )
}

/* --------------------------------------------------------------- دفتر ------ */
function LogsTab({
  logs,
  appointments,
  reload,
}: {
  logs: CallLog[]
  stats: Stats
  appointments: Appointment[]
  reload: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<(typeof KINDS)[number]>('video')
  const [minutes, setMinutes] = useState(30)
  const [topic, setTopic] = useState('')
  const [note, setNote] = useState('')
  const [daddyMood, setDaddyMood] = useState('happy')
  const [daughterMood, setDaughterMood] = useState('happy')
  const [appointment, setAppointment] = useState('')
  const [audio, setAudio] = useState<{ file: File; url: string; seconds: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const rec = useRecorder()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData()
    fd.append('kind', kind)
    fd.append('duration_minutes', String(minutes))
    fd.append('topic', topic)
    fd.append('note', note)
    fd.append('daddy_mood', daddyMood)
    fd.append('daughter_mood', daughterMood)
    fd.append('recorded_by', 'daughter')
    if (appointment) fd.append('appointment', appointment)
    if (audio) fd.append('attachment', audio.file, audio.file.name)
    try {
      await upload('/calls/logs', fd)
      playSuccess()
      vibrate(30)
      setOpen(false)
      setTopic('')
      setNote('')
      setAudio(null)
      await reload()
    } catch {
      playError()
    }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <button className="os-btn-primary w-full" onClick={() => setOpen((v) => !v)}>
        <Icon name={open ? 'minus' : 'plus'} size={16} /> {t('calls.logCall')}
      </button>

      <AnimatePresence>
        {open && (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="os-card space-y-2 overflow-hidden p-3"
          >
            <Chips
              items={KINDS.map((k) => ({ key: k, label: t(`calls.kind.${k}`) }))}
              value={kind}
              onChange={setKind}
            />
            <div className="flex items-center gap-2">
              {[10, 30, 60, 120].map((m) => (
                <button key={m} type="button" className={`os-chip ${minutes === m ? 'os-chip-active' : ''}`} onClick={() => setMinutes(m)}>
                  {digits(m)} {t('os.minutes')}
                </button>
              ))}
            </div>
            <input className="os-input" placeholder={t('calls.topicPlaceholder')} value={topic} onChange={(e) => setTopic(e.target.value)} />
            <input className="os-input" placeholder={t('calls.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] os-muted">
                {t('calls.daddyMood')}
                <select className="os-input mt-1" value={daddyMood} onChange={(e) => setDaddyMood(e.target.value)}>
                  {MOODS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.emoji} {t(`calls.mood.${m.key}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] os-muted">
                {t('calls.myMood')}
                <select className="os-input mt-1" value={daughterMood} onChange={(e) => setDaughterMood(e.target.value)}>
                  {MOODS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.emoji} {t(`calls.mood.${m.key}`)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-[11px] os-muted">
              {t('calls.linkAppointment')}
              <select className="os-input mt-1" value={appointment} onChange={(e) => setAppointment(e.target.value)}>
                <option value="">—</option>
                {appointments
                  .filter((a) => ['approved', 'done'].includes(a.status))
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.date} • {a.time}
                    </option>
                  ))}
              </select>
            </label>

            {/* ضبط صدا با میکروفن همان‌جا */}
            {micSupported() ? (
              <div className="rounded-xl p-2" style={{ background: 'var(--os-border)' }}>
                {!audio && !rec.recording && (
                  <button type="button" className="os-btn w-full !py-2 text-xs" onClick={() => void rec.start()}>
                    <Icon name="mic" size={15} /> {t('calls.recordVoice')}
                  </button>
                )}
                {rec.recording && (
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: '#e2557f' }}>
                      <span className="h-2 w-2 animate-pulse rounded-full bg-current" /> {formatClock(rec.seconds)}
                    </span>
                    <button
                      type="button"
                      className="os-btn ms-auto !py-1.5 text-xs"
                      onClick={async () => {
                        const r = await rec.stop()
                        if (r) setAudio({ file: r.file, url: r.url, seconds: r.seconds })
                      }}
                    >
                      <Icon name="stop" size={14} /> {t('calls.stopRecord')}
                    </button>
                    <button type="button" className="os-btn !py-1.5 text-xs" onClick={rec.cancel}>
                      {t('os.cancel')}
                    </button>
                  </div>
                )}
                {audio && (
                  <div className="flex items-center gap-2">
                    <audio controls src={audio.url} className="h-8 flex-1" />
                    <button type="button" className="os-muted" onClick={() => setAudio(null)}>
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[11px] os-muted">{t('calls.micUnsupported')}</p>
            )}
            {rec.error && (
              <p className="text-[11px]" style={{ color: '#e2557f' }}>
                <Icon name="mic" size={12} /> {t('calls.micError')}
              </p>
            )}

            <button type="submit" className="os-btn-primary w-full" disabled={saving || rec.recording}>
              {t('os.save')}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {logs.length === 0 ? (
        <Empty text={t('calls.noLogs')} />
      ) : (
        <div className="space-y-2">
          {logs.map((log, i) => (
            <motion.div
              key={log.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="os-card space-y-2 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{log.kind === 'video' ? '🎥' : log.kind === 'voice' ? '📞' : '👨‍👩‍👧'}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{log.topic || log.kind_label}</p>
                  <p className="text-[11px] os-muted">
                    {formatDate(log.happened_on)} {log.happened_at ? `• ${digits(log.happened_at)}` : ''} • {log.duration_label}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] os-muted">{log.recorded_by_label}</span>
              </div>
              <div className="flex items-center gap-2 text-xs os-muted">
                <span>👨 {MOODS.find((m) => m.key === log.daddy_mood)?.emoji || '🙂'}</span>
                <span>👧 {MOODS.find((m) => m.key === log.daughter_mood)?.emoji || '🙂'}</span>
                {log.note && <span className="truncate">• {log.note}</span>}
              </div>
              {log.attachment && <audio controls src={log.attachment} className="h-9 w-full" />}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
