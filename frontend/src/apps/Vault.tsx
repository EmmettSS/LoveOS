/**
 * Vault — صندوقچه‌ی خصوصی با رمز جداگانه
 */
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post } from '../shared/api'
import { playError, playSuccess } from '../shared/sound'
import { ApiStatus, AudioPlayer, Empty, useApi } from '../shared/ui'

interface VItem {
  id: number
  title: string
  kind: 'photo' | 'voice' | 'text' | 'video' | string
  file: string | null
  text: string
}

export default function Vault() {
  const { t } = useTranslation()
  const { data, loading, error: apiError, reload } = useApi<{ locked: boolean; items: VItem[] }>('/vault')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)

  const unlock = async (e: React.FormEvent) => {
    e.preventDefault()
    const res = await post<{ ok: boolean; message?: string }>('/vault/unlock', { passcode: code })
    if (res.ok) {
      playSuccess()
      setError('')
      setCode('')
      await reload()
    } else {
      playError()
      setError(res.message || t('vault.wrong'))
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  if (loading || apiError) return <ApiStatus loading={loading} error={apiError} onRetry={() => void reload()} />

  if (data?.locked) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        <motion.span className={shake ? 'animate-shake' : 'animate-float'} style={{ color: 'var(--os-accent)' }}>
          <Icon name="vault" size={64} />
        </motion.span>
        <p className="text-center text-sm">{t('vault.locked')}</p>
        <form onSubmit={unlock} className="w-full max-w-xs space-y-2">
          <input
            type="password"
            inputMode="numeric"
            className="os-input text-center tracking-[0.4em]"
            placeholder={t('vault.enter')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="os-btn-primary w-full" type="submit">{t('vault.open')}</button>
        </form>
        {error && <p className="text-sm" style={{ color: '#e0478d' }}>{error}</p>}
      </div>
    )
  }

  const items = data?.items || []
  if (items.length === 0) return <Empty />

  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <motion.div key={it.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="os-card overflow-hidden">
          {it.kind === 'photo' && it.file && <img src={it.file} alt={it.title} className="w-full object-cover" />}
          {it.kind === 'video' && it.file && <video src={it.file} controls className="w-full" />}
          <div className="p-3">
            <p className="os-title text-sm">{it.title}</p>
            {it.text && <p className="mt-1 whitespace-pre-line text-sm leading-7">{it.text}</p>}
            {it.kind === 'voice' && it.file && (
              <div className="mt-2">
                <AudioPlayer src={it.file} compact />
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}
