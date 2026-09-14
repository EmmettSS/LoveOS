/**
 * Memories — جعبه‌ی خاطره‌ها
 * خط زمان عمودی، خاطره‌های قفل‌شده‌ی آینده با علامت ؟؟؟ و اسلایدشو.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { formatDate } from '../shared/format'
import { playClick, playPaper } from '../shared/sound'
import { AudioPlayer, Chips, Empty, Loading, useApi } from '../shared/ui'

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
  const { data, loading } = useApi<{ items: Memory[] }>('/memories')
  const [tab, setTab] = useState<Tab>('past')
  const [slideshow, setSlideshow] = useState(false)
  const [index, setIndex] = useState(0)

  const items = (data?.items || []).filter((m) => (tab === 'future' ? m.is_future : !m.is_future))
  const withPhoto = items.filter((m) => m.photo && !m.locked)

  useEffect(() => {
    if (!slideshow || withPhoto.length === 0) return
    const id = setInterval(() => setIndex((i) => (i + 1) % withPhoto.length), 3500)
    return () => clearInterval(id)
  }, [slideshow, withPhoto.length])

  if (loading) return <Loading />

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
        {withPhoto.length > 1 && (
          <button className={`os-chip ms-auto ${slideshow ? 'os-chip-active' : ''}`} onClick={() => setSlideshow(!slideshow)}>
            {t('memories.slideshow')}
          </button>
        )}
      </div>

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
            <img src={withPhoto[index].photo!} alt="" className="h-56 w-full object-cover" />
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
                  {m.photo && !m.locked && <img src={m.photo} alt="" className="h-44 w-full object-cover" />}
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <h4 className="os-title flex-1 text-base">{m.title}</h4>
                      {m.locked && <Icon name="lock" size={15} style={{ color: 'var(--os-muted)' }} />}
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
