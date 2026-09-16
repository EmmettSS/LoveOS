/**
 * VoiceVault — صندوق صدای بابا
 * دسته‌بندی بر اساس حال دل + دکمه‌ی ویس تصادفی. فقط بابا آپلود می‌کند.
 */
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { digits } from '../shared/format'
import { playClick } from '../shared/sound'
import { ApiStatus, AudioPlayer, Chips, Empty, Loading, useApi } from '../shared/ui'

interface Voice {
  id: number
  title: string
  category: string
  category_label: string
  audio: string | null
  note: string
  duration: number
  play_count: number
}

const CATEGORIES = ['random', 'morning', 'night', 'missing', 'happy', 'sad', 'sleepless'] as const
type Cat = (typeof CATEGORIES)[number]

export default function VoiceVault() {
  const { t } = useTranslation()
  const [cat, setCat] = useState<Cat>('random')
  const { data, loading, error } = useApi<{ items: Voice[] }>(`/voices?category=${cat}`, [cat])
  const [picked, setPicked] = useState<Voice | null>(null)

  const markPlayed = (id: number) => {
    void post(`/voices/${id}/played`)
  }

  const random = async () => {
    playClick()
    const res = await get<{ item: Voice | null }>('/voices/random')
    setPicked(res.item)
  }

  return (
    <div className="space-y-3">
      <Chips<Cat>
        items={CATEGORIES.map((c) => ({ key: c, label: t(`voice.categories.${c}`) }))}
        value={cat}
        onChange={setCat}
      />

      <button className="os-btn-primary w-full" onClick={() => void random()}>
        <span className="inline-flex items-center justify-center gap-2">
          <Icon name="voice" size={16} /> {t('voice.random')}
        </span>
      </button>

      {picked && picked.audio && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="os-card p-3" style={{ borderColor: 'var(--os-accent)' }}>
          <AudioPlayer
            src={picked.audio}
            title={picked.title}
            subtitle={picked.note || picked.category_label}
            autoPlay
            compact
            onPlayed={() => markPlayed(picked.id)}
          />
        </motion.div>
      )}

      {error ? (
        <ApiStatus loading={false} error={error} />
      ) : loading ? (
        <Loading />
      ) : !data || data.items.length === 0 ? (
        <Empty />
      ) : (
        <>
          <p className="text-xs os-muted">{t('voice.count', { count: data.items.length }).replace(String(data.items.length), digits(data.items.length))}</p>
          <div className="space-y-2">
            {data.items.map((v, i) => (
              <motion.div
                key={v.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                {v.audio ? (
                  <AudioPlayer
                    src={v.audio}
                    title={v.title}
                    subtitle={v.note || v.category_label}
                    onPlayed={() => markPlayed(v.id)}
                  />
                ) : null}
              </motion.div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
