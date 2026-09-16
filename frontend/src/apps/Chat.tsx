/**
 * Chat — چت با بابا
 * پیام‌های دخترم به سروش بابا می‌رود و جواب بابا از وب‌هوک اینجا می‌نشیند.
 * راز ⑬ سمت سرور وصل است (نوشتن «دوستت دارم»).
 */
import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { useMotionAllowed, useQualityTier } from '../shared/depth'
import { formatTime } from '../shared/format'
import { playClick } from '../shared/sound'
import { useOS } from '../shared/store'
import { Loading } from '../shared/ui'

interface Msg {
  id: number
  sender: 'daddy' | 'daughter'
  text: string
  via: string
  created_at: string
  is_read: boolean
}

export default function Chat() {
  const { t } = useTranslation()
  // ⚠️ بالایِ ``if (loading) return`` — وگرنه نقضِ Rules-of-Hooks
  const tier = useQualityTier()
  const allowed = useMotionAllowed()
  const deep = allowed && tier !== 'lite'
  const dz = deep ? 1 : 0
  const config = useOS((s) => s.config)
  const showEgg = useOS((s) => s.showEgg)
  const [items, setItems] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement | null>(null)
  const lastId = useRef(0)

  const scroll = () => setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 60)

  // بارگذاری اولیه + نظرسنجی هر ۶ ثانیه برای جواب بابا
  useEffect(() => {
    let alive = true
    const load = async (initial = false) => {
      try {
        const res = await get<{ items: Msg[] }>(initial ? '/chat' : `/chat?since=${lastId.current}`)
        if (!alive) return
        if (res.items.length) {
          lastId.current = res.items[res.items.length - 1].id
          setItems((prev) => (initial ? res.items : [...prev, ...res.items]))
          scroll()
        }
      } catch {
        /* ignore */
      } finally {
        if (initial && alive) setLoading(false)
      }
    }
    void load(true)
    const id = setInterval(() => void load(), 6000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    playClick()
    try {
      const res = await post<{ ok: boolean; item: Msg; egg?: { title: string; message: string } | null }>('/chat', { text: body })
      setItems((prev) => [...prev, res.item])
      lastId.current = res.item.id
      setText('')
      scroll()
      if (res.egg) showEgg({ title: res.egg.title, message: res.egg.message })
    } finally {
      setSending(false)
    }
  }

  if (loading) return <Loading />

  return (
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="flex-1 space-y-2 overflow-y-auto pb-3 no-scrollbar">
        {items.length === 0 && <p className="os-empty">{t('chat.startTalking')}</p>}
        {items.map((m) => {
          const mine = m.sender === 'daughter'
          return (
            <motion.div
              key={m.id}
              // حباب از عمق بیرون می‌آید و در ``z: 0`` **کاملاً تخت**
              // می‌نشیند. این عمدی است: حبابِ چت متنِ خالص است و قانونِ
              // سختِ پروژه می‌گوید متن هرگز کج نماند. عمق فقط در لحظه‌ی
              // ورود هست، نه در حالتِ پایدار.
              initial={{ opacity: 0, y: 8, scale: 0.98, z: -44 * dz }}
              animate={{ opacity: 1, y: 0, scale: 1, z: 0 }}
              // ``transformPerspective`` روی خودِ حباب، چون ظرفِ اسکرولِ
              // بالا ``overflow-y-auto`` دارد و گذاشتنِ ``perspective``
              // رویش در سافاری عمق را تخت می‌کند (تله‌ی R-C).
              style={{ transformPerspective: 820 }}
              className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className="max-w-[78%] rounded-3xl px-4 py-2.5"
                style={{
                  background: mine ? 'linear-gradient(135deg,#ff9ecb,#bba0fb)' : 'var(--os-card)',
                  color: mine ? '#fff' : 'var(--os-text)',
                  border: mine ? 'none' : '1px solid var(--os-border)',
                  borderBottomRightRadius: mine ? 8 : undefined,
                  borderBottomLeftRadius: mine ? undefined : 8,
                  // حباب هم «ضخامت» می‌گیرد: لبه‌ی پایینیِ توپُر + سایه‌ی
                  // نرم زیرش. این در هر سه لایه فعال است چون حرکت ندارد
                  // (عمقِ نقاشی‌شده = دقیقاً تعریفِ لایه‌ی مهتاب).
                  boxShadow: mine
                    ? 'inset 0 var(--edge-1) 0 rgba(255,255,255,.42), 0 var(--edge-2) 0 rgba(150,70,140,.34), 0 calc(3 * var(--edge-2)) calc(7 * var(--edge-2)) calc(-3 * var(--edge-2)) rgba(120,50,110,.45)'
                    : 'var(--rim-light), var(--ao-shadow)',
                }}
              >
                <p className="whitespace-pre-line text-sm leading-6">{m.text}</p>
                <p className="mt-1 text-[10px]" style={{ opacity: 0.7 }}>
                  {formatTime(new Date(m.created_at))}
                  {m.via === 'soroush' && ` • ${t('chat.viaSoroush')}`}
                </p>
              </div>
            </motion.div>
          )
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="sticky bottom-0 flex items-center gap-2 pt-2" style={{ background: 'transparent' }}>
        <input
          className="os-input flex-1"
          placeholder={t('chat.placeholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          className="os-slab flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white transition active:scale-90"
          style={{ background: 'var(--btn-face)', boxShadow: 'inset 0 var(--edge-1) 0 rgba(255,255,255,.5), 0 var(--edge-3) 0 var(--btn-edge)' }}
          disabled={sending}
          aria-label={t('os.send')}
        >
          <Icon name="play" size={16} className="rtl:-scale-x-100" />
        </button>
      </form>
      <p className="pt-1 text-center text-[10px] os-muted">{config?.daddy_name}</p>
    </div>
  )
}
