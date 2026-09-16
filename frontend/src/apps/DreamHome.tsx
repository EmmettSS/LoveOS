/**
 * DreamHome — خونه‌ی رویایی ما 🏡
 *
 * سه بخش:
 *   ۱) چک‌لیست آرزوها: هر ویژگی با درجه‌ی اهمیت (ضروری/دوست‌داشتنی/تجملاتی) و تیک «شد»
 *   ۲) نقشه‌ی خانه: اتاق‌ها روی یک صفحه‌ی نسبی چیده می‌شوند و با کشیدن جابه‌جا می‌شوند
 *      (مختصات درصدی است، پس روی هر صفحه‌ای یک‌شکل دیده می‌شود)
 *   ۳) گالری الهام: عکس خانه‌های قشنگ + گفتگو زیر هر عکس
 */
import { AnimatePresence, motion } from 'framer-motion'
import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { del, patch, post, upload } from '../shared/api'
import { digits } from '../shared/format'
import { playClick, playError, playSuccess } from '../shared/sound'
import { ApiStatus, Chips, Empty, useApi } from '../shared/ui'

type Owner = 'daddy' | 'daughter'
type Importance = 'must' | 'nice' | 'luxury'

interface Feature {
  id: number
  title: string
  category: number | null
  category_name: string
  category_icon: string
  importance: Importance
  importance_label: string
  description: string
  photo: string | null
  added_by: Owner
  added_by_label: string
  is_done: boolean
  order: number
}

interface Room {
  id: number
  name: string
  description: string
  floor: string
  x: number
  y: number
  w: number
  h: number
  color: string
  icon: string
  added_by: Owner
  added_by_label: string
  order: number
  inspirations_count: number
  ideas: { id: number; kind: string; text: string }[]
}

interface Inspiration {
  id: number
  photo: string | null
  title: string
  category: number | null
  category_name: string
  room: number | null
  room_name: string
  description: string
  uploaded_by: Owner
  uploaded_by_label: string
  comments_count: number
}

interface Overview {
  features: Feature[]
  rooms: Room[]
  inspirations: Inspiration[]
  categories: { id: number; name: string; icon: string; detail: string; count: number }[]
  stats: {
    features_total: number
    must: number
    nice: number
    luxury: number
    done: number
    percent: number
    percent_label: string
    rooms_total: number
    inspirations_total: number
    comments_total: number
    checklist: { must: Feature[]; nice: Feature[] }
  }
}

const FLOORS: { key: string; label: string }[] = [
  { key: 'ground', label: '' },
  { key: 'first', label: '' },
  { key: 'yard', label: '' },
]

const PALETTE = ['#f9a8d4', '#7dd3fc', '#86efac', '#fcd34d', '#c4b5fd', '#fdba74']

/**
 * ماکتِ سه‌بعدیِ خانه. ``lazy`` است تا ``three`` فقط برای کسی دانلود شود
 * که لایه‌اش کهکشان است و واقعاً تبِ «نقشه» را باز کرده. خودِ ماژول هم از
 * چانکِ مشترکِ ``loveos-3d`` می‌خواند، پس اگر کاربر پیش‌تر آسمانِ ستاره‌ها
 * یا سینما را باز کرده باشد اینجا **هیچ** دانلودِ تازه‌ای رخ نمی‌دهد.
 */
const DreamRoom = lazy(() => import('../three/DreamRoom'))

export default function DreamHome() {
  const { t } = useTranslation()
  const { data, loading, error, reload } = useApi<Overview>('/home/overview')
  const [tab, setTab] = useState<'plan' | 'map' | 'gallery'>('plan')

  if (loading || error) return <ApiStatus loading={loading} error={error} onRetry={() => void reload()} />
  if (!data) return <Empty />

  return (
    <div className="space-y-3">
      <div className="os-card space-y-2 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏡</span>
          <p className="flex-1 text-sm font-semibold">{t('home.title')}</p>
          <span className="os-title text-lg" style={{ color: 'var(--os-accent)' }}>
            {digits(data.stats.percent)}%
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full" style={{ background: 'var(--os-border)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--os-accent)' }}
            initial={{ width: 0 }}
            animate={{ width: `${data.stats.percent}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <div className="grid grid-cols-4 gap-1 text-center text-[10px] os-muted">
          <span>
            {t('home.must')}: {digits(data.stats.must)}
          </span>
          <span>
            {t('home.done')}: {digits(data.stats.done)}
          </span>
          <span>
            {t('home.rooms')}: {digits(data.stats.rooms_total)}
          </span>
          <span>
            {t('home.gallery')}: {digits(data.stats.inspirations_total)}
          </span>
        </div>
      </div>

      <Chips
        items={[
          { key: 'plan' as const, label: t('home.tab.plan') },
          { key: 'map' as const, label: t('home.tab.map') },
          { key: 'gallery' as const, label: t('home.tab.gallery') },
        ]}
        value={tab}
        onChange={setTab}
      />

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
          {tab === 'plan' && <PlanTab categories={data.categories} features={data.features} reload={reload} />}
          {tab === 'map' && <MapTab rooms={data.rooms} reload={reload} />}
          {tab === 'gallery' && (
            <GalleryTab inspirations={data.inspirations} rooms={data.rooms} categories={data.categories} reload={reload} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------- چک‌لیست --- */
function PlanTab({
  categories,
  features,
  reload,
}: {
  categories: Overview['categories']
  features: Feature[]
  reload: () => void
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<'all' | Importance>('all')
  const [title, setTitle] = useState('')
  const [importance, setImportance] = useState<Importance>('must')
  const [category, setCategory] = useState('')
  const [adding, setAdding] = useState(false)

  const shown = useMemo(
    () => (filter === 'all' ? features : features.filter((f) => f.importance === filter)),
    [features, filter],
  )

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    await post('/home/features', {
      title: title.trim(),
      importance,
      category: category || undefined,
      added_by: 'daughter',
    })
    playSuccess()
    setTitle('')
    setAdding(false)
    await reload()
  }

  const toggle = async (f: Feature) => {
    await patch(`/home/features/${f.id}`, { is_done: !f.is_done })
    if (!f.is_done) playSuccess()
    await reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Chips
          items={[
            { key: 'all' as const, label: t('os.all') },
            { key: 'must' as const, label: `⭐ ${t('home.must')}` },
            { key: 'nice' as const, label: `💫 ${t('home.nice')}` },
            { key: 'luxury' as const, label: `👑 ${t('home.luxury')}` },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <button className="os-btn-primary ms-auto shrink-0 !px-3 !py-1.5 text-xs" onClick={() => setAdding((v) => !v)}>
          <Icon name={adding ? 'minus' : 'plus'} size={14} />
        </button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.form
            onSubmit={add}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="os-card space-y-2 overflow-hidden p-3"
          >
            <input className="os-input" placeholder={t('home.featurePlaceholder')} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Chips
              items={[
                { key: 'must' as Importance, label: `⭐ ${t('home.must')}` },
                { key: 'nice' as Importance, label: `💫 ${t('home.nice')}` },
                { key: 'luxury' as Importance, label: `👑 ${t('home.luxury')}` },
              ]}
              value={importance}
              onChange={setImportance}
            />
            <select className="os-input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">{t('home.noCategory')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
            <button className="os-btn-primary w-full" type="submit">
              {t('os.add')}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {shown.length === 0 ? (
        <Empty text={t('home.emptyFeatures')} />
      ) : (
        <div className="space-y-2">
          {shown.map((f) => (
            <motion.div key={f.id} layout className="os-card flex items-start gap-3 p-3">
              <button
                onClick={() => void toggle(f)}
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                style={{
                  background: f.is_done ? 'var(--os-accent)' : 'transparent',
                  border: `1.5px solid ${f.is_done ? 'var(--os-accent)' : 'var(--os-border)'}`,
                  color: '#fff',
                }}
              >
                {f.is_done && <Icon name="check" size={13} />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-sm" style={{ textDecoration: f.is_done ? 'line-through' : undefined, opacity: f.is_done ? 0.55 : 1 }}>
                  {f.category_icon} {f.title}
                </p>
                <p className="mt-0.5 text-[10px] os-muted">
                  {f.importance_label} • {f.added_by_label}
                  {f.description ? ` • ${f.description}` : ''}
                </p>
              </div>
              {f.photo && <img src={f.photo} alt={f.title} className="h-12 w-12 rounded-xl object-cover" />}
              {f.added_by === 'daughter' && (
                <button
                  className="os-muted"
                  onClick={async () => {
                    await del(`/home/features/${f.id}`)
                    await reload()
                  }}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- نقشه --- */
function MapTab({ rooms, reload }: { rooms: Room[]; reload: () => void }) {
  const { t } = useTranslation()
  // ⚠️ لایه‌ی کیفیت عمداً **اینجا** سنجیده نمی‌شود: خودِ DreamRoom و زیرش
  //    useThreeScene لایه و سقفِ context را می‌سنجند و در صورتِ نیاز به
  //    نسخه‌ی CSS تنزل می‌کنند. دو جا سنجیدنِ یک شرط یعنی دو حقیقتِ
  //    متفاوت که روزی با هم فرق می‌کنند.
  // «نقشه» سطحِ **ویرایش** است (کشیدنِ اتاق)، «ماکت» سطحِ **تماشا**. این دو
  // عمداً از هم جدا شدند: روی ماکتِ سه‌بعدی نمی‌شود اتاق را دقیق جابه‌جا
  // کرد، و اگر هر دو یکی بودند کاربر موقعِ چرخاندنِ ماکت بی‌دلیل اتاق‌ها را
  // جابه‌جا می‌کرد.
  const [view, setView] = useState<'plan' | 'model'>('plan')
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [selected, setSelected] = useState<Room | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [floor, setFloor] = useState('ground')

  const selectedRoom = selected ? rooms.find((r) => r.id === selected.id) || null : null

  /** درصد موقعیت اشاره‌گر روی نقشه (۰ تا ۱۰۰) */
  const pointerPercent = useCallback((clientX: number, clientY: number) => {
    const el = canvasRef.current
    if (!el) return null
    const rect = el.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    }
  }, [])

  const dragTo = useCallback(
    async (room: Room, clientX: number, clientY: number) => {
      const p = pointerPercent(clientX, clientY)
      if (!p) return
      const x = Math.max(0, Math.min(100 - room.w, p.x - room.w / 2))
      const y = Math.max(0, Math.min(100 - room.h, p.y - room.h / 2))
      // به‌روزرسانی خوش‌بینانه‌ی محلی برای روان بودن کشیدن
      room.x = Math.round(x)
      room.y = Math.round(y)
      setSelected({ ...room })
      await patch(`/home/rooms/${room.id}`, { x: Math.round(x), y: Math.round(y) })
    },
    [pointerPercent],
  )

  const addRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    await post('/home/rooms', {
      name: name.trim(),
      floor,
      x: 6 + Math.random() * 40,
      y: 6 + Math.random() * 40,
      w: 22,
      h: 22,
      color: PALETTE[rooms.length % PALETTE.length],
      added_by: 'daughter',
    })
    playSuccess()
    setName('')
    await reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={`os-chip ${view === 'plan' ? 'os-chip-active' : ''}`}
          onClick={() => setView('plan')}
          type="button"
        >
          {t('home.plan')}
        </button>
        <button
          className={`os-chip ${view === 'model' ? 'os-chip-active' : ''}`}
          onClick={() => { playClick(); setView('model') }}
          type="button"
        >
          {t('home.model')}
        </button>
        {view === 'model' && (
          <span className="text-[10px] os-muted">{t('home.modelHint')}</span>
        )}
      </div>

      {view === 'model' && (
        /* ماکت. اگر صحنه‌ی WebGL ساخته نشد (سقفِ context پر بود، یا لایه
           کهکشان نبود) خودِ DreamRoom به نسخه‌ی CSS تنزل می‌کند — پس اینجا
           هرگز جایِ خالی نمی‌ماند. */
        <Suspense fallback={<div className="os-card" style={{ height: 200 }} />}>
          <DreamRoom rooms={rooms} />
        </Suspense>
      )}

      <div
        ref={canvasRef}
        className="relative w-full overflow-hidden rounded-2xl border"
        // در نمایِ ماکت، نقشه‌ی ویرایش‌پذیر پنهان می‌شود. عمداً
        // ``display:none`` و نه حذف از درخت: حذف، حالتِ درگ و ref را
        // از بین می‌برد و برگشتن به «نقشه» یک بار ری‌مانتِ کامل می‌شد.
        style={{
          aspectRatio: '4 / 3',
          background: 'var(--os-accent-soft)',
          borderColor: 'var(--os-border)',
          touchAction: 'none',
          display: view === 'model' ? 'none' : undefined,
        }}
        onPointerMove={(e) => {
          if (dragging == null) return
          const room = rooms.find((r) => r.id === dragging)
          if (room) void dragTo(room, e.clientX, e.clientY)
        }}
        onPointerUp={async () => {
          if (dragging != null) {
            setDragging(null)
            await reload()
          }
        }}
        onPointerLeave={() => setDragging(null)}
      >
        {/* راهنما */}
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`v${i}`} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="100" stroke="var(--os-border)" strokeWidth="0.15" />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={(i + 1) * 10} x2="100" y2={(i + 1) * 10} stroke="var(--os-border)" strokeWidth="0.15" />
          ))}
        </svg>

        {rooms.map((r) => (
          <motion.button
            key={r.id}
            layout
            className="absolute flex flex-col items-center justify-center rounded-xl p-1 text-center shadow-soft"
            style={{
              left: `${r.x}%`,
              top: `${r.y}%`,
              width: `${r.w}%`,
              height: `${r.h}%`,
              background: `${r.color}55`,
              border: `1.5px solid ${r.color}`,
            }}
            onPointerDown={() => setDragging(r.id)}
            onClick={() => setSelected(r)}
            whileTap={{ scale: 0.97 }}
          >
            <span className="text-base leading-none">{r.icon || '🛋'}</span>
            <span className="mt-0.5 truncate text-[10px] font-semibold" style={{ maxWidth: '95%' }}>
              {r.name}
            </span>
          </motion.button>
        ))}

        {rooms.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-xs os-muted">{t('home.emptyMap')}</div>
        )}
      </div>
      <p className="px-1 text-[10px] os-muted">{t('home.mapHint')}</p>

      <AnimatePresence>
        {selectedRoom && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            className="os-card space-y-2 p-3"
          >
            <div className="flex items-center gap-2">
              <input
                className="os-input flex-1"
                defaultValue={selectedRoom.name}
                onBlur={async (e) => {
                  if (e.target.value.trim() && e.target.value !== selectedRoom.name) {
                    await patch(`/home/rooms/${selectedRoom.id}`, { name: e.target.value.trim() })
                    await reload()
                  }
                }}
              />
              <button
                className="os-muted shrink-0"
                onClick={async () => {
                  await del(`/home/rooms/${selectedRoom.id}`)
                  setSelected(null)
                  await reload()
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className="h-6 w-6 rounded-full transition active:scale-90"
                  style={{ background: c, outline: selectedRoom.color === c ? '2px solid var(--os-accent)' : 'none' }}
                  onClick={async () => {
                    await patch(`/home/rooms/${selectedRoom.id}`, { color: c })
                    await reload()
                  }}
                />
              ))}
              {['🛋', '🛏', '🍳', '🚿', '📚', '🌳', '🎮', '🍽'].map((ic) => (
                <button
                  key={ic}
                  className="os-chip !px-2 !py-0.5"
                  onClick={async () => {
                    await patch(`/home/rooms/${selectedRoom.id}`, { icon: ic })
                    await reload()
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>
            <RoomIdeas room={selectedRoom} onChanged={reload} />
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={addRoom} className="os-card flex flex-wrap items-center gap-2 p-3">
        <input className="os-input flex-1" placeholder={t('home.roomPlaceholder')} value={name} onChange={(e) => setName(e.target.value)} />
        <select className="os-input w-28" value={floor} onChange={(e) => setFloor(e.target.value)}>
          {FLOORS.map((f) => (
            <option key={f.key} value={f.key}>
              {t(`home.floors.${f.key}`)}
            </option>
          ))}
        </select>
        <button className="os-btn-primary !px-4 !py-2 text-xs" type="submit">
          {t('os.add')}
        </button>
      </form>
    </div>
  )
}

function RoomIdeas({ room, onChanged }: { room: Room; onChanged: () => void }) {
  const { t } = useTranslation()
  const { data, error, reload } = useApi<{ items: { id: number; kind: string; text: string }[] }>(`/home/rooms/${room.id}/ideas`)
  const [text, setText] = useState('')
  const [kind, setKind] = useState('idea')
  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    await post(`/home/rooms/${room.id}/ideas`, { kind, text: text.trim() })
    setText('')
    await reload()
    onChanged()
  }

  if (error) return <ApiStatus loading={false} error={error} onRetry={() => void reload()} />

  return (
    <div className="space-y-2">
      <Chips
        items={[
          { key: 'idea', label: `💡 ${t('home.idea')}` },
          { key: 'color', label: `🎨 ${t('home.color')}` },
          { key: 'furniture', label: `🪑 ${t('home.furniture')}` },
        ]}
        value={kind}
        onChange={setKind}
      />
      <form onSubmit={add} className="flex gap-2">
        <input className="os-input" placeholder={t('home.ideaPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="os-btn-primary shrink-0 !px-3 !py-2 text-xs" type="submit">
          <Icon name="plus" size={14} />
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {(data?.items || []).map((i) => (
          <span key={i.id} className="os-chip">
            {i.kind === 'color' ? '🎨' : i.kind === 'furniture' ? '🪑' : '💡'} {i.text}
          </span>
        ))}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- گالری --- */
function GalleryTab({
  inspirations,
  rooms,
  categories,
  reload,
}: {
  inspirations: Inspiration[]
  rooms: Room[]
  categories: Overview['categories']
  reload: () => void
}) {
  const { t } = useTranslation()
  const [title, setTitle] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [room, setRoom] = useState('')
  const [category, setCategory] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!photo) {
      setError(t('home.noPhoto'))
      playError()
      return
    }
    const fd = new FormData()
    fd.append('title', title.trim() || t('home.untitled'))
    fd.append('uploaded_by', 'daughter')
    if (room) fd.append('room', room)
    if (category) fd.append('category', category)
    if (photo) fd.append('photo', photo, photo.name)
    try {
      await upload('/home/inspirations', fd)
    } catch {
      setError(t('common.tryAgain'))
      playError()
      return
    }
    playSuccess()
    setTitle('')
    setPhoto(null)
    setAdding(false)
    await reload()
  }

  return (
    <div className="space-y-3">
      <button className="os-btn-primary w-full" onClick={() => setAdding((v) => !v)}>
        <Icon name={adding ? 'minus' : 'plus'} size={15} /> {t('home.addInspiration')}
      </button>

      <AnimatePresence>
        {adding && (
          <motion.form
            onSubmit={submit}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="os-card space-y-2 overflow-hidden p-3"
          >
            <input className="os-input" placeholder={t('home.inspirationTitle')} value={title} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex gap-2">
              <select className="os-input" value={room} onChange={(e) => setRoom(e.target.value)}>
                <option value="">{t('home.anyRoom')}</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.icon} {r.name}
                  </option>
                ))}
              </select>
              <select className="os-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">{t('home.noCategory')}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </div>
            <label className="os-btn flex cursor-pointer items-center justify-center gap-2 !py-2 text-xs">
              <Icon name="camera" size={15} />
              {photo ? photo.name.slice(0, 20) : t('home.pickPhoto')}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
            {error && <p className="text-[11px]" style={{ color: '#e2557f' }}>{error}</p>}
            <button className="os-btn-primary w-full" type="submit">
              {t('os.add')}
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      {inspirations.length === 0 ? (
        <Empty text={t('home.emptyGallery')} />
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {inspirations.map((i) => (
            <InspirationCard key={i.id} item={i} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  )
}

function InspirationCard({ item, onChanged }: { item: Inspiration; onChanged: () => void }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const detail = useApi<{ item: Inspiration & { comments: { id: number; owner: Owner; owner_label: string; text: string }[] } }>(
    open ? `/home/inspirations/${item.id}` : null,
  )
  const [text, setText] = useState('')
  const detailStatus = <ApiStatus loading={detail.loading} error={detail.error} onRetry={() => void detail.reload()} />

  return (
    <div className="os-card overflow-hidden">
      <button className="w-full text-start" onClick={() => setOpen((v) => !v)}>
        {item.photo ? (
          <img src={item.photo} alt={item.title} className="h-28 w-full object-cover" />
        ) : (
          <span className="flex h-28 w-full items-center justify-center text-3xl" style={{ background: 'var(--os-accent-soft)' }}>
            🖼
          </span>
        )}
        <span className="block p-2">
          <span className="block truncate text-xs font-semibold">{item.title}</span>
          <span className="block truncate text-[10px] os-muted">
            {item.room_name || item.category_name || item.uploaded_by_label}
            {item.comments_count ? ` • 💬 ${digits(item.comments_count)}` : ''}
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="space-y-2 p-2">
              {detailStatus}
              {!detailStatus && (detail.data?.item.comments || []).map((c) => (
                <div key={c.id} className="text-[11px]">
                  <span className="os-muted">{c.owner === 'daddy' ? '👨' : '👧'} </span>
                  {c.text}
                </div>
              ))}
              <form
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (!text.trim()) return
                  await post(`/home/inspirations/${item.id}/comments`, { owner: 'daughter', text: text.trim() })
                  setText('')
                  await detail.reload()
                  onChanged()
                }}
                className="flex gap-1"
              >
                <input className="os-input !py-1 text-[11px]" placeholder={t('home.commentPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} />
                <button className="os-btn-primary shrink-0 !px-2 !py-1 text-[11px]" type="submit">
                  <Icon name="forward" size={12} />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
