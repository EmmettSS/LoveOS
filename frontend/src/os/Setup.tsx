/**
 * Setup.tsx — «آماده‌سازی LoveOS» (صفحه‌ی مجوزها)
 *
 * بین صفحه‌ی قفل و دسکتاپ می‌آید. کارش این است که همه‌ی اجازه‌های لازم را با
 * لمسِ خودِ دخترم بگیرد: تمام‌صفحه، اعلان، موقعیت، لرزش، میکروفن، دوربین و
 * ذخیره‌ی دائمی. مرورگر بدونِ لمسِ کاربر هیچ‌کدام را نمی‌دهد — پس این صفحه
 * دقیقاً همان «لمس» را فراهم می‌کند.
 *
 * قاعده‌ها:
 *   • هر قدم یک کارت است با توضیحِ ساده‌ی «چرا لازم است».
 *   • هر مجوز که گرفته شد، خودش از فهرست می‌رود و کارتِ بعدی می‌آید.
 *   • «بعداً» هم هست؛ ولی اگر مجوزی در حالتِ پرسیدنی بماند، بارِ بعدِ ورود
 *     دوباره می‌آید (خواسته‌ی صاحبِ پروژه: «هر بار کم بود»).
 *   • مجوزهایی که برای همیشه رد شده‌اند یا مرورگر پشتیبانی نمی‌کند قدم
 *     نمی‌شوند؛ فقط در تنظیمات با راهنمای روشن‌کردن نشان داده می‌شوند.
 */
import { motion } from 'framer-motion'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon, LoveOSLogo } from '../shared/Icon'
import { digits } from '../shared/format'
import { playClick, playError, playSuccess, vibrate } from '../shared/sound'
import {
  PERMISSION_EMOJI,
  PERMISSION_ORDER,
  autoFullscreen,
  installAvailable,
  isIosLike,
  isStandalone,
  markSetupSeen,
  markSetupSkipped,
  onInstallAvailability,
  permissionStates,
  promptInstall,
  requestPermission,
  shouldAsk,
  type PermissionKey,
  type PermissionMap,
} from '../shared/permissions'
import { useOS } from '../shared/store'

const SCREEN_BG =
  'radial-gradient(80% 60% at 50% 20%, rgba(247,103,168,.20), transparent 70%), radial-gradient(90% 70% at 50% 100%, rgba(150,120,255,.18), transparent 70%), linear-gradient(170deg, #1d0c26 0%, #120719 55%, #0a0410 100%)'

export function Setup() {
  const { t } = useTranslation()
  const setPhase = useOS((s) => s.setPhase)
  const config = useOS((s) => s.config)

  const [states, setStates] = useState<PermissionMap | null>(null)
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [canInstall, setCanInstall] = useState(false)
  const [installed, setInstalled] = useState(false)

  // ۱) خواندنِ وضعیتِ فعلی (بدونِ باز کردنِ هیچ پنجره‌ای)
  useEffect(() => {
    let cancelled = false
    void permissionStates().then((next) => {
      if (!cancelled) setStates(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onInstallAvailability(setCanInstall), [])

  /** قدم‌ها = مجوزهایی که هنوز باید پرسیده شوند، به ترتیبِ پیشنهادی */
  const steps = useMemo<PermissionKey[]>(() => {
    if (!states) return []
    return PERMISSION_ORDER.filter((key) => shouldAsk(key, states[key]))
  }, [states])

  /** چک‌لیستِ کوچکِ پایین: چه چیزهایی همین حالا فعال‌اند */
  const granted = useMemo<PermissionKey[]>(
    () => (states ? PERMISSION_ORDER.filter((key) => states[key] === 'granted') : []),
    [states],
  )

  const installStep = canInstall && !installed && !isStandalone()
  const total = steps.length + (installStep ? 1 : 0)
  const safeIndex = Math.min(index, steps.length)
  const currentKey: PermissionKey | null = steps[safeIndex] ?? null
  const onInstallStep = installStep && safeIndex >= steps.length
  const finishedSteps = steps.length > 0 && safeIndex >= steps.length && !onInstallStep

  const finish = useCallback(() => {
    markSetupSeen()
    playClick()
    // همین لمس، آخرین فرصتِ گرفتنِ تمام‌صفحه پیش از ورود است
    void autoFullscreen()
    setPhase('desktop')
  }, [setPhase])

  const skipEverything = useCallback(() => {
    markSetupSeen()
    markSetupSkipped()
    finish()
  }, [finish])

  /** گرفتنِ یک مجوز — همین لمس، همان چیزی است که مرورگر لازم دارد */
  const ask = useCallback(
    async (key: PermissionKey) => {
      if (busy) return
      setBusy(true)
      try {
        const state = await requestPermission(key)
        setStates((prev) => (prev ? { ...prev, [key]: state } : prev))
        if (state === 'granted') {
          playSuccess()
          vibrate(40)
        } else {
          playError()
        }
        // ⚠️ هیچ‌وقت شماره را این‌جا جلو نمی‌بریم: هر نتیجه‌ای (گرفته‌شده،
        // رد‌شده یا پشتیبانی‌نشده) آن مجوز را از فهرستِ قدم‌ها برمی‌دارد و
        // کارتِ بعدی خودش جای همین شماره می‌آید. (اگر جلو ببریم، یک مجوز
        // بی‌صدا از قلم می‌افتد — همان چیزی که در تستِ jsdom لو رفت.)
      } finally {
        setBusy(false)
      }
    },
    [busy],
  )

  // اگر چیزی برای پرسیدن نماند (همه گرفته‌شده‌اند)، خودش می‌رود دسکتاپ
  useEffect(() => {
    if (states && steps.length === 0 && !installStep) finish()
  }, [states, steps.length, installStep, finish])

  return (
    <motion.div
      className="os-screen flex flex-col"
      style={{ background: SCREEN_BG, color: '#fce7f3' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45 }}
    >
      {/* ---------------------------------------------------------- سرصفحه */}
      <header className="flex items-center gap-3 px-5 pt-6">
        <LoveOSLogo size={30} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{t('setup.title')}</p>
          <p className="text-[11px] opacity-70">
            {config?.daughter_nickname ? `${config.daughter_nickname} • ` : ''}
            {t('setup.subtitle')}
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-full px-3 py-1.5 text-[11px] opacity-80"
          style={{ border: '1px solid rgba(255,255,255,.22)' }}
          onClick={skipEverything}
        >
          {t('setup.later')}
        </button>
      </header>

      {/* --------------------------------------------------------- پیشرفت */}
      <div className="mt-4 flex items-center gap-2 px-5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,.14)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'linear-gradient(90deg,#ff8cc0,#bba0fb)' }}
            initial={{ width: 0 }}
            animate={{
              width: total ? `${Math.min(100, ((total - Math.max(total - safeIndex, 0)) / total) * 100)}%` : '100%',
            }}
          />
        </div>
        <span className="shrink-0 text-[11px] tabular-nums opacity-70">
          {total ? `${digits(Math.min(safeIndex + 1, total))} / ${digits(total)}` : '—'}
        </span>
      </div>

      {/* ----------------------------------------------------------- کارت */}
      <main className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-6">
        {/* عمداً بدونِ AnimatePresence مودِ wait: کارتِ بعدی باید *بی‌درنگ*
            بیاید. (در حالتِ wait، اگر خروجِ کارتِ قبلی تمام نشود، کارتِ تازه
            هیچ‌وقت نمی‌آید — همان سکوتِ بدی که در تستِ jsdom هم دیده شد.) */}
        <motion.div
            key={states ? currentKey || (onInstallStep ? 'install' : 'done') : 'loading'}
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.26 }}
            className="w-full max-w-sm rounded-3xl p-6 text-center"
            style={{
              background: 'linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.05))',
              border: '1px solid rgba(255,255,255,.16)',
              boxShadow: '0 24px 60px -28px rgba(0,0,0,.85)',
              backdropFilter: 'blur(16px)',
            }}
          >
            {!states ? (
              <div className="flex flex-col items-center gap-4 py-6" role="status" aria-live="polite">
                <span
                  aria-hidden="true"
                  className="block h-8 w-8 rounded-full border-[3px] border-white/25"
                  style={{ borderTopColor: '#f767a8', animation: 'loveosSpin .9s linear infinite' }}
                />
                <p className="text-sm opacity-80">{t('setup.reading')}</p>
              </div>
            ) : currentKey ? (
              <PermissionCard
                permission={currentKey}
                busy={busy}
                onAsk={() => void ask(currentKey)}
                onSkip={() => setIndex((value) => value + 1)}
              />
            ) : onInstallStep ? (
              <InstallCard
                onInstall={async () => {
                  const done = await promptInstall()
                  setInstalled(done || isStandalone())
                  if (done) playSuccess()
                  setIndex((value) => value + 1)
                }}
                onSkip={() => setIndex((value) => value + 1)}
              />
            ) : (
              <DoneCard onEnter={finish} skipped={finishedSteps} />
            )}
        </motion.div>
      </main>

      {/* ----------------------------------------------------------- پایین */}
      <footer className="space-y-3 px-5 pb-7">
        {granted.length > 0 && (
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {granted.map((key) => (
              <span
                key={key}
                className="rounded-full px-2 py-0.5 text-[11px]"
                style={{ background: 'rgba(74,222,128,.14)', border: '1px solid rgba(74,222,128,.35)' }}
              >
                ✅ {PERMISSION_EMOJI[key]} {t(`setup.items.${key}.short`)}
              </span>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={finish}
          className="w-full rounded-2xl py-3 text-sm font-bold"
          style={{
            background: total ? 'rgba(255,255,255,.10)' : 'linear-gradient(135deg,#ff8cc0,#bba0fb)',
            color: '#fff',
            border: total ? '1px solid rgba(255,255,255,.18)' : '0',
            boxShadow: total ? 'none' : '0 14px 34px -16px rgba(247,103,168,.95)',
          }}
        >
          <span className="inline-flex items-center justify-center gap-2">
            <Icon name="heart" size={15} /> {t('setup.enter')}
          </span>
        </button>
        <p className="text-center text-[11px] leading-5 opacity-60">{t('setup.footer')}</p>
      </footer>
      <style>{'@keyframes loveosSpin { to { transform: rotate(360deg); } }'}</style>
    </motion.div>
  )
}

/* --------------------------------------------------------- کارتِ مجوز --- */
function PermissionCard({
  permission,
  busy,
  onAsk,
  onSkip,
}: {
  permission: PermissionKey
  busy: boolean
  onAsk: () => void
  onSkip: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="text-5xl" aria-hidden="true">
        {PERMISSION_EMOJI[permission]}
      </div>
      <div className="space-y-2">
        <h2 className="text-lg font-bold">{t(`setup.items.${permission}.title`)}</h2>
        <p className="text-[12.5px] leading-7 opacity-80">{t(`setup.items.${permission}.why`)}</p>
      </div>
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px]"
        style={{ border: '1px solid rgba(255,255,255,.28)', color: 'rgba(255,255,255,.85)' }}
      >
        ⬜ {t('setup.needTouch')}
      </span>

      {permission === 'notifications' && isIosLike() && !isStandalone() && (
        <p className="rounded-2xl p-3 text-[11px] leading-6" style={{ background: 'rgba(255,255,255,.07)' }}>
          {t('setup.iosNotificationHint')}
        </p>
      )}
      {permission === 'fullscreen' && isIosLike() && !installAvailable() && (
        <p className="rounded-2xl p-3 text-[11px] leading-6" style={{ background: 'rgba(255,255,255,.07)' }}>
          {t('setup.iosFullscreenHint')}
        </p>
      )}

      <div className="space-y-2 pt-1">
        <button
          type="button"
          disabled={busy}
          onClick={onAsk}
          className="w-full rounded-2xl py-3 text-sm font-bold disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg,#ff8cc0,#bba0fb)', color: '#fff' }}
        >
          {busy ? t('setup.asking') : t('setup.allow')}
        </button>
        <button type="button" onClick={onSkip} className="w-full py-2 text-xs opacity-70">
          {t('setup.skipItem')}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------- کارتِ نصب اپ ---- */
function InstallCard({ onInstall, onSkip }: { onInstall: () => void | Promise<void>; onSkip: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div className="text-5xl" aria-hidden="true">📲</div>
      <h2 className="text-lg font-bold">{t('setup.items.install.title')}</h2>
      <p className="text-[12.5px] leading-7 opacity-80">{t('setup.items.install.why')}</p>
      <div className="space-y-2 pt-1">
        <button
          type="button"
          onClick={() => void onInstall()}
          className="w-full rounded-2xl py-3 text-sm font-bold"
          style={{ background: 'linear-gradient(135deg,#ff8cc0,#bba0fb)', color: '#fff' }}
        >
          {t('setup.installNow')}
        </button>
        <button type="button" onClick={onSkip} className="w-full py-2 text-xs opacity-70">
          {t('setup.skipItem')}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------ کارتِ پایان ------ */
function DoneCard({ onEnter, skipped }: { onEnter: () => void; skipped: boolean }) {
  const { t } = useTranslation()
  useEffect(() => {
    playSuccess()
    vibrate([40, 60, 40])
  }, [])
  return (
    <div className="space-y-4">
      <motion.div
        className="text-5xl"
        animate={{ scale: [1, 1.14, 1] }}
        transition={{ duration: 1.1, repeat: Infinity, repeatDelay: 0.6 }}
        aria-hidden="true"
      >
        💗
      </motion.div>
      <h2 className="text-lg font-bold">{skipped ? t('setup.partialTitle') : t('setup.doneTitle')}</h2>
      <p className="text-[12.5px] leading-7 opacity-80">
        {skipped ? t('setup.partialBody') : t('setup.doneBody')}
      </p>
      <button
        type="button"
        onClick={onEnter}
        className="w-full rounded-2xl py-3 text-sm font-bold"
        style={{ background: 'linear-gradient(135deg,#ff8cc0,#bba0fb)', color: '#fff' }}
      >
        {t('setup.enter')}
      </button>
    </div>
  )
}
