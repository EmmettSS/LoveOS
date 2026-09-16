/**
 * Vault — صندوقچه‌ی خصوصی با رمز جداگانه
 * دخترم هم می‌تواند خودش محتوا اضافه کند: متن، عکس، صدا یا ویدیو.
 */
import { motion } from 'framer-motion'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { post, upload } from '../shared/api'
import { Tilt, useMotionAllowed, useQualityTier } from '../shared/depth'
import { playError, playSuccess } from '../shared/sound'
import { useOS } from '../shared/store'
import { ApiStatus, AudioPlayer, Empty, useApi } from '../shared/ui'

interface VItem {
  id: number
  title: string
  kind: 'photo' | 'image' | 'voice' | 'audio' | 'text' | 'video' | string
  file: string | null
  text: string
}

/**
 * درِ گاوصندوق.
 *
 * یک قرصِ فلزیِ پخ‌خورده با یک حلقه‌ی چرخانِ خط‌چین (دستگیره‌ی صندوق) که
 * آرام می‌چرخد. در لایه‌ی مهتاب حلقه خاموش است و فقط قرصِ تخت می‌ماند.
 *
 * رمزِ اشتباه → در **در عمق** تکان می‌خورد (rotateY)، نه فقط جابه‌جاییِ
 * تخت. یک درِ سنگینِ فلزی که اشتباه بزنید باید حولِ لولایش بلرزد؛ لرزشِ
 * چپ-راستِ تخت برای این استعاره غلط است.
 *
 * ⚠️ ``rotateY`` روی خودِ در است و تیلت روی ظرفِ ``Tilt`` بیرونش: دو عنصرِ
 *    جدا، پس دو transform با هم ترکیب می‌شوند. اگر روی یک عنصر بودند،
 *    انیمیشنِ framer و متغیرِ تیلت یکی دیگری را پاک می‌کردند.
 */
function SafeDoor({ shake, deep }: { shake: boolean; deep: boolean }) {
  return (
    <motion.div
      className="os-vault-door"
      style={{ transformPerspective: 700 }}
      initial={false}
      animate={deep && shake ? { rotateY: [0, -10, 8, -4, 0] } : { rotateY: 0 }}
      transition={{ duration: 0.5, ease: 'easeInOut' }}
      aria-hidden
    >
      <span className="os-vault-dial" aria-hidden />
      <Icon name="vault" size={64} />
    </motion.div>
  )
}

export default function Vault() {
  const { t } = useTranslation()
  const { data, loading, error: apiError, reload } = useApi<{ locked: boolean; items: VItem[] }>('/vault')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [shake, setShake] = useState(false)
  // ⚠️ هر دو هوک **بدونِ شرط** صدا زده می‌شوند و ترکیبشان بعداً انجام
  //    می‌شود. نوشتنِ ``useQualityTier() !== 'lite' && useMotionAllowed()``
  //    یک نقضِ Rules-of-Hooks است: ``&&`` وقتی سمتِ چپ false شود
  //    short-circuit می‌کند و هوکِ دوم اصلاً اجرا نمی‌شود، پس ترتیبِ
  //    هوک‌ها بینِ رندرها عوض می‌شود.
  const tier = useQualityTier()
  const motionAllowed = useMotionAllowed()
  const deep = tier !== 'lite' && motionAllowed

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

  // در یک متغیر است تا شاخه‌ی تیلت و شاخه‌ی تخت بدنه‌اش را دو بار ننویسند
  const door = <SafeDoor shake={shake} deep={deep} />

  if (data?.locked) {
    return (
      <div className="flex flex-col items-center gap-4 py-10">
        {/*
          ظرفِ بیرونی همان شناور/لرزشِ قدیمی را نگه داشته و درِ سه‌بعدی
          **داخلش** است. علتش همان است که در صفحه‌ی قفل هم آمد: ``animate-float``
          یک انیمیشنِ CSS با transform است و در آبشار بر style درون‌خطی
          اولویت دارد، پس اگر تیلت روی همان عنصر می‌نشست بی‌صدا بلعیده
          می‌شد.

          ظرف از ``span`` به ``div`` عوض شد چون ``Tilt`` یک ``div`` می‌سازد و
          ``div`` داخلِ ``span`` از نظرِ HTML نامعتبر است (span محتوای
          phrasing است). در یک چیدمانِ flex با items-center، div دقیقاً همان
          رفتار را دارد.
        */}
        <motion.div className={shake ? 'animate-shake' : 'animate-float'} style={{ color: 'var(--os-accent)' }}>
          {deep ? <Tilt maxDeg={12}>{door}</Tilt> : door}
        </motion.div>
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

  return (
    <div className="space-y-3">
      <AddVaultItem onAdded={() => void reload()} />
      {items.length === 0 ? (
        <Empty />
      ) : (
        items.map((it, i) => (
          <motion.div key={it.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="os-card overflow-hidden">
            {(it.kind === 'photo' || it.kind === 'image') && it.file && <img src={it.file} alt={it.title} className="w-full object-cover" />}
            {it.kind === 'video' && it.file && <video src={it.file} controls className="w-full" />}
            <div className="p-3">
              <p className="os-title text-sm">{it.title}</p>
              {it.text && <p className="mt-1 whitespace-pre-line text-sm leading-7">{it.text}</p>}
              {(it.kind === 'voice' || it.kind === 'audio') && it.file && (
                <div className="mt-2">
                  <AudioPlayer src={it.file} compact />
                </div>
              )}
            </div>
          </motion.div>
        ))
      )}
    </div>
  )
}

/* ------------------------------------------------- افزودن دخترم ---- */
function AddVaultItem({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      playError()
      showToast(t('vault.needTitle'))
      return
    }
    setSaving(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('text', text.trim())
      if (file) {
        fd.append('file', file, file.name)
        const mt = file.type || ''
        fd.append(
          'kind',
          mt.startsWith('image/') ? 'image' : mt.startsWith('audio/') ? 'audio' : mt.startsWith('video/') ? 'video' : 'text',
        )
      } else {
        fd.append('kind', 'text')
      }
      await upload('/vault', fd)
      playSuccess()
      showToast(t('vault.added'), 'love')
      setTitle('')
      setText('')
      setFile(null)
      setOpen(false)
      onAdded()
    } catch {
      playError()
      showToast(t('os.error'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="os-card overflow-hidden">
      <button
        type="button"
        className="flex w-full items-center gap-2 p-3 text-start text-sm font-semibold"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name={open ? 'minus' : 'plus'} size={16} />
        {t('vault.addTitle')}
      </button>
      {open && (
        <form onSubmit={submit} className="space-y-2 px-3 pb-3">
          <input className="os-input" placeholder={t('vault.titlePh')} value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="os-input min-h-[70px] leading-7"
            placeholder={t('vault.textPh')}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <label className="os-btn flex cursor-pointer items-center justify-center gap-2 !py-2 text-xs">
            <Icon name="camera" size={14} /> {file ? file.name.slice(0, 26) : t('vault.attach')}
            <input
              type="file"
              accept="image/*,audio/*,video/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <button className="os-btn-primary w-full" type="submit" disabled={saving}>
            {t('os.add')}
          </button>
        </form>
      )}
    </div>
  )
}
