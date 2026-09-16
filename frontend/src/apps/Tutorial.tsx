/**
 * Tutorial — آموزش LoveOS
 * درس‌ها از پنل بابا می‌آیند. اگر از دکمه‌ی «کمک» یک اپ باز شود، مستقیم می‌رود سر همان درس.
 * توجه: هیچ اشاره‌ای به رازها در این اپ وجود ندارد.
 */
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { digits } from '../shared/format'
import { playClick } from '../shared/sound'
import { ApiStatus, Empty, useApi } from '../shared/ui'

interface Chapter { id: number; key: string; title: string; body: string; order: number }

export default function Tutorial({ focus }: { focus?: string }) {
  const { t } = useTranslation()
  const { data, loading, error } = useApi<{ items: Chapter[] }>('/tutorial')
  const [open, setOpen] = useState<number | null>(null)

  // اگر با «کمک» یک اپ باز شده، همان درس را باز کن
  useEffect(() => {
    if (!focus || !data) return
    const found = data.items.find((c) => c.key === focus)
    if (found) setOpen(found.id)
  }, [focus, data])

  if (loading || error) return <ApiStatus loading={loading} error={error} />
  const items = data?.items || []
  if (items.length === 0) return <Empty />

  return (
    <div className="space-y-2">
      <p className="os-title text-center text-base">{t('tutorial.title')}</p>
      {items.map((c, i) => (
        <motion.div
          key={c.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.03 }}
          className="os-card overflow-hidden"
          style={{ borderColor: open === c.id ? 'var(--os-accent)' : undefined }}
        >
          <button
            className="flex w-full items-center gap-3 p-3 text-start"
            onClick={() => { playClick(); setOpen(open === c.id ? null : c.id) }}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs" style={{ background: 'var(--os-accent-soft)', color: 'var(--os-accent)' }}>
              {digits(i + 1)}
            </span>
            <span className="flex-1 text-sm font-semibold">{c.title}</span>
            <Icon name={open === c.id ? 'minus' : 'plus'} size={15} />
          </button>
          <AnimatePresence initial={false}>
            {open === c.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="whitespace-pre-line px-4 pb-4 text-sm leading-8">{c.body}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      ))}
    </div>
  )
}
