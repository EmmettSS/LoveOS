/**
 * Whisper — نامه‌های نجوا
 * پاکت‌های کاغذی که با انیمیشن باز می‌شوند؛ نامه‌های زمان‌دار قفل‌اند.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { get, post } from '../shared/api'
import { formatDate } from '../shared/format'
import { playPaper } from '../shared/sound'
import { Empty, Loading, useApi } from '../shared/ui'

interface Letter {
  id: number
  title: string
  body: string
  locked: boolean
  open_at: string | null
  is_opened: boolean
  created_at: string
}

export default function Whisper() {
  const { t } = useTranslation()
  const { data, loading, reload } = useApi<{ items: Letter[] }>('/letters')
  const [open, setOpen] = useState<Letter | null>(null)

  const openLetter = async (le: Letter) => {
    if (le.locked) return
    playPaper()
    const res = await post<{ ok: boolean; item?: Letter; message?: string }>(`/letters/${le.id}/open`)
    if (res.ok && res.item) {
      setOpen(res.item)
      void reload()
    }
  }

  const randomLetter = async () => {
    const res = await get<{ item: Letter | null }>('/letters/random')
    if (res.item) void openLetter(res.item)
  }

  if (loading) return <Loading />
  const items = data?.items || []

  return (
    <div className="space-y-3">
      <button className="os-btn-primary w-full" onClick={() => void randomLetter()}>
        <span className="inline-flex items-center justify-center gap-2">
          <Icon name="whisper" size={16} /> {t('whisper.randomLetter')}
        </span>
      </button>

      {items.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((le, i) => (
            <motion.button
              key={le.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -4, rotate: le.locked ? 0 : -1 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => void openLetter(le)}
              className="paper relative flex min-h-[120px] flex-col justify-between rounded-2xl p-3 text-start"
              style={{ opacity: le.locked ? 0.65 : 1 }}
            >
              <div className="absolute -top-px start-0 end-0 h-8 rounded-t-2xl" style={{ background: 'linear-gradient(180deg, rgba(216,180,140,.25), transparent)' }} />
              <div className="relative">
                <p className="os-title text-sm">{le.title}</p>
                <p className="mt-1 text-[11px]" style={{ color: '#8a7256' }}>
                  {le.locked ? t('whisper.sealed') : formatDate(le.created_at)}
                </p>
              </div>
              <div className="relative flex items-center justify-between">
                <Icon name={le.locked ? 'lock' : 'whisper'} size={16} style={{ color: '#b9895a' }} />
                {le.is_opened && <span className="text-[10px]" style={{ color: '#b9895a' }}>✓</span>}
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-5 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(null)}
          >
            <motion.div
              initial={{ rotateX: -85, opacity: 0, y: 30 }}
              animate={{ rotateX: 0, opacity: 1, y: 0 }}
              exit={{ rotateX: -60, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 160, damping: 20 }}
              className="paper max-h-[75vh] w-full max-w-md overflow-y-auto rounded-3xl p-6 no-scrollbar"
              style={{ transformPerspective: 1000 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="os-title text-center text-lg" style={{ color: '#8a5a3c' }}>{open.title}</h3>
              <p className="mt-4 whitespace-pre-line text-[15px] leading-9 os-hand">{open.body}</p>
              <button className="os-btn-primary mt-6 w-full" onClick={() => setOpen(null)}>{t('os.close')}</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
