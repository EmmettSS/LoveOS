/**
 * Settings — تنظیمات
 * زبان، تم، صدا، لرزش، اندازه‌ی فونت، پس‌زمینه‌ها، موقعیت مکانی، اعلان و نصب PWA.
 *
 * روش کار: هر تغییر **بلافاصله** روی خود دستگاه اعمال می‌شود (خوش‌بینانه) و
 * بعد برای سرور فرستاده می‌شود؛ اگر شبکه/سرور در دسترس نبود، تغییر محلی می‌ماند
 * و در اولین فرصت همگام می‌شود. این‌طوری هیچ‌وقت «دکمه را زدم ولی هیچی نشد» پیش نمی‌آید.
 *
 * پس‌زمینه‌های قفل و دسکتاپ را هر دو طرف (بابا و دخترم) می‌توانند عوض کنند.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { patch, upload } from '../shared/api'
import { getStoredSettings, setStoredSetting, syncSettings } from '../shared/prefs'
import { setLanguage } from '../shared/i18n'
import { digits } from '../shared/format'
import { enableLiveLocation, getCurrentPosition, readCachedLocation } from '../shared/geo'
import {
  PERMISSION_EMOJI,
  PERMISSION_ORDER,
  autoFullscreenEnabled,
  clearSetupSkip,
  enterFullscreen,
  exitFullscreen,
  installAvailable,
  isFullscreen,
  isStandalone,
  onFullscreenChange,
  permissionStateLabel,
  permissionStates,
  promptInstall,
  requestPermission,
  setAutoFullscreen,
  type PermissionKey,
  type PermissionMap,
  type PermissionState,
} from '../shared/permissions'
import { playClick, playError, setSoundEnabled, vibrate } from '../shared/sound'
import { Toggle } from '../shared/ui'
import { useOS, type Config, type Theme } from '../shared/store'

/** رنگِ چیپِ هر وضعیتِ مجوز (سبز/زرد/قرمز) */
function permTone(state?: PermissionState): string {
  if (state === 'granted') return '#3f9161'
  if (state === 'denied') return '#e2557f'
  if (state === 'unsupported' || state === 'skipped') return 'var(--os-border)'
  return '#c58a1a'
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="os-card flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-5 os-muted">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const config = useOS((s) => s.config)
  const setConfig = useOS((s) => s.setConfig)
  const patchConfig = useOS((s) => s.patchConfig)
  const resetAppOrder = useOS((s) => s.resetAppOrder)
  const logout = useOS((s) => s.logout)
  const openApp = useOS((s) => s.openApp)
  const showToast = useOS((s) => s.showToast)

  const [vibrationOn, setVibrationOn] = useState(() => localStorage.getItem('loveos_vibration') !== 'off')
  const [perms, setPerms] = useState<PermissionMap | null>(null)
  const [askingPerm, setAskingPerm] = useState<PermissionKey | null>(null)
  const [fsActive, setFsActive] = useState(() => isFullscreen())
  const [autoFs, setAutoFs] = useState(() => autoFullscreenEnabled())
  const [canInstall, setCanInstall] = useState(() => installAvailable())
  const [locating, setLocating] = useState(false)
  const [locationHint, setLocationHint] = useState('')
  const live = config?.live_location

  // وضعیتِ مجوزها با هر بار باز شدنِ تنظیمات تازه خوانده می‌شود (بدونِ پنجره)
  useEffect(() => {
    let cancelled = false
    void permissionStates().then((next) => {
      if (!cancelled) setPerms(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => onFullscreenChange(() => setFsActive(isFullscreen())), [])

  useEffect(() => {
    const id = window.setInterval(() => setCanInstall(installAvailable()), 1500)
    return () => window.clearInterval(id)
  }, [])

  const permStateLabel = (state: PermissionState) => permissionStateLabel(state, t)

  const askPermission = async (key: PermissionKey) => {
    setAskingPerm(key)
    try {
      const state = await requestPermission(key)
      setPerms((prev) => (prev ? { ...prev, [key]: state } : prev))
      setFsActive(isFullscreen())
      if (state === 'granted') showToast(t('os.saved'))
      else if (state === 'denied') showToast(t('settings.permDeniedHint'))
    } finally {
      setAskingPerm(null)
    }
  }

  // اگر در تنظیمات محلی چیزی مانده که ذخیره‌اش شکست خورده بود، همان‌جا سرِ فرصت سینک شود
  useEffect(() => {
    void syncSettings()
  }, [])

  if (!config) return null

  /**
   * ۱) فوراً روی دستگاه اعمال کن  ۲) بعد برای سرور بفرست.
   * اگر سرور جواب نداد، تنظیم محلی باقی می‌ماند و پیام محترمانه نشان داده می‌شود.
   */
  const save = async (body: Partial<Config>, opts: { silent?: boolean } = {}) => {
    patchConfig(body)
    Object.entries(body).forEach(([k, v]) => setStoredSetting(k, v))
    try {
      const next = await patch<Config | { config: Config }>('/settings', body)
      const conf = (next && typeof next === 'object' && 'config' in next ? next.config : next) as Config
      if (conf && conf.language) setConfig(conf)
      if (!opts.silent) showToast(t('os.saved'), 'love')
    } catch {
      if (!opts.silent) showToast(t('settings.savedLocally'), 'info')
    }
  }

  const askLocation = async () => {
    setLocating(true)
    setLocationHint('')
    const geo = await enableLiveLocation()
    setLocating(false)
    if (geo.ok) {
      patchConfig({ live_location: geo.location })
      setLocationHint(t('settings.locationOk', { city: geo.location.city || '—' }))
      showToast(t('settings.locationOk', { city: geo.location.city || '—' }), 'love')
    } else {
      setLocationHint(t('settings.locationDenied'))
    }
  }

  const refreshLocation = async () => {
    setLocating(true)
    const pos = await getCurrentPosition()
    setLocating(false)
    if (pos) setLocationHint(t('settings.locationUpdated'))
    else setLocationHint(t('settings.locationDenied'))
  }

  const cached = readCachedLocation()

  return (
    <div className="space-y-3">
      <Row label={t('settings.language')} hint={t('settings.languageHint')}>
        {(['fa', 'en'] as const).map((l) => (
          <button
            key={l}
            className={`os-chip ${i18n.language === l ? 'os-chip-active' : ''}`}
            onClick={() => {
              playClick()
              setLanguage(l) // رابط کاربری بی‌درنگ عوض می‌شود (بدون انتظار برای سرور)
              void save({ language: l })
            }}
          >
            {l === 'fa' ? 'فارسی' : 'English'}
          </button>
        ))}
      </Row>

      <Row label={t('settings.theme')} hint={t('settings.themeHint')}>
        {(['auto', 'day', 'night'] as const).map((th) => (
          <button
            key={th}
            className={`os-chip ${config.theme === th ? 'os-chip-active' : ''}`}
            onClick={() => {
              playClick()
              void save({ theme: th as Theme })
            }}
          >
            {t(th === 'auto' ? 'settings.themeAuto' : th === 'day' ? 'settings.themeDay' : 'settings.themeNight')}
          </button>
        ))}
      </Row>

      <Row label={t('settings.sound')}>
        <Toggle
          on={config.sound_enabled !== false}
          onChange={(v) => { setSoundEnabled(v); void save({ sound_enabled: v }) }}
        />
      </Row>

      <Row label={t('settings.vibration')}>
        <Toggle
          on={vibrationOn}
          onChange={(v) => {
            setVibrationOn(v)
            localStorage.setItem('loveos_vibration', v ? 'on' : 'off')
            if (v) vibrate(60)
          }}
        />
      </Row>

      <Row label={t('settings.fontSize')}>
        <div className="flex items-center gap-2">
          <button className="os-chip" onClick={() => void save({ font_scale: Math.max(0.85, (config.font_scale || 1) - 0.05) }, { silent: true })}>−</button>
          <span className="w-10 text-center text-sm tabular-nums">{digits(Math.round((config.font_scale || 1) * 100))}٪</span>
          <button className="os-chip" onClick={() => void save({ font_scale: Math.min(1.4, (config.font_scale || 1) + 0.05) }, { silent: true })}>+</button>
        </div>
      </Row>

      {/* ---------------------------------------------------- پس‌زمینه‌ها --- */}
      <Row label={t('settings.backgrounds')} hint={t('settings.backgroundsHint')}>
        <div />
      </Row>
      <BackgroundPicker
        field="lock_background"
        label={t('settings.bgLock')}
        current={config.lock_background}
        onUploaded={(url) => patchConfig({ lock_background: url })}
        onReset={() => void save({ lock_background: '' }, { silent: true })}
      />
      <BackgroundPicker
        field="desktop_background_day"
        label={t('settings.bgDesktopDay')}
        current={config.desktop_background_day}
        onUploaded={(url) => patchConfig({ desktop_background_day: url })}
        onReset={() => void save({ desktop_background_day: '' }, { silent: true })}
      />
      <BackgroundPicker
        field="desktop_background_night"
        label={t('settings.bgDesktopNight')}
        current={config.desktop_background_night}
        onUploaded={(url) => patchConfig({ desktop_background_night: url })}
        onReset={() => void save({ desktop_background_night: '' }, { silent: true })}
      />

      {/* --------------------------------------------------- چیدمان دسکتاپ */}
      <Row label={t('settings.layout')} hint={t('settings.layoutHint')}>
        <button
          className="os-chip"
          onClick={() => {
            resetAppOrder()
            showToast(t('settings.layoutResetDone'), 'love')
          }}
        >
          <span className="inline-flex items-center gap-1"><Icon name="retry" size={13} /> {t('settings.layoutReset')}</span>
        </button>
      </Row>

      {/* ------------------------------------------------ موقعیت مکانی --- */}
      <Row label={t('settings.location')} hint={locationHint || t('settings.locationHint')}>
        <div className="flex flex-wrap items-center gap-2">
          {live?.is_live && (
            <span className="os-chip" style={{ borderColor: 'var(--os-accent)', color: 'var(--os-accent)' }}>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: 'var(--os-accent)' }} />
                {t('settings.locationLive')}
                {live.city ? ` • ${live.city}` : ''}
              </span>
            </span>
          )}
          <button className="os-chip" disabled={locating} onClick={() => void askLocation()}>
            <span className="inline-flex items-center gap-1">
              <Icon name="pin" size={13} /> {locating ? t('settings.locating') : t('settings.allowLocation')}
            </span>
          </button>
          {(live?.is_live || cached) && (
            <button className="os-chip" disabled={locating} onClick={() => void refreshLocation()}>
              <Icon name="retry" size={13} />
            </button>
          )}
        </div>
      </Row>

      {/* ------------------------------------------------- مجوزهای دستگاه --- */}
      <Row label={t('settings.perms')} hint={t('settings.permsHint')}>
        <button
          className="os-chip"
          onClick={() => {
            playClick()
            clearSetupSkip()
            useOS.getState().setPhase('setup')
          }}
        >
          <span className="inline-flex items-center gap-1"><Icon name="sparkle" size={13} /> {t('settings.openSetup')}</span>
        </button>
      </Row>

      <div className="os-card space-y-2 p-3">
        {PERMISSION_ORDER.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-base">{PERMISSION_EMOJI[key]}</span>
            <span className="min-w-0 flex-1 text-[12px] leading-5">{t(`setup.items.${key}.short`)}</span>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px]"
              style={{
                border: `1px solid ${permTone(perms?.[key])}`,
                color: permTone(perms?.[key]),
              }}
            >
              {permStateLabel(perms?.[key] || 'unknown')}
            </span>
            <button
              className="os-chip shrink-0 !px-2 !py-1 text-[10px]"
              disabled={perms?.[key] === 'unsupported' || askingPerm === key}
              onClick={() => void askPermission(key)}
            >
              {askingPerm === key ? '…' : t('settings.askPerm')}
            </button>
          </div>
        ))}
      </div>

      <Row label={t('settings.fullscreen')} hint={t('settings.fullscreenHint')}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="os-chip"
            onClick={async () => {
              playClick()
              if (fsActive) await exitFullscreen()
              else await enterFullscreen()
              setFsActive(isFullscreen())
            }}
          >
            <span className="inline-flex items-center gap-1">
              <Icon name={fsActive ? 'minus' : 'grid'} size={13} />
              {fsActive ? t('settings.fsExit') : t('settings.fsEnter')}
            </span>
          </button>
          <label className="inline-flex items-center gap-2 text-[11px]">
            <Toggle
              on={autoFs}
              onChange={(v) => {
                setAutoFullscreen(v)
                setAutoFs(v)
                if (!v) void exitFullscreen()
              }}
            />
            {t('settings.fsAuto')}
          </label>
        </div>
      </Row>

      <Row label={t('settings.install')} hint={t('settings.installHint')}>
        {canInstall ? (
          <button
            className="os-chip"
            onClick={async () => {
              playClick()
              await promptInstall()
              setCanInstall(installAvailable())
            }}
          >
            <span className="inline-flex items-center gap-1"><Icon name="upload" size={13} /> {t('settings.install')}</span>
          </button>
        ) : (
          <span className="text-[11px] os-muted">
            {isStandalone() ? t('setup.state.granted') : t('settings.installManual')}
          </span>
        )}
      </Row>

      <div className="os-card p-3 text-[11px] leading-6 os-muted">{t('settings.privacy')}</div>

      <button className="os-btn w-full" onClick={() => openApp('about')}>
        <span className="inline-flex items-center justify-center gap-2"><Icon name="about" size={15} /> {t('settings.about')}</span>
      </button>

      <button className="os-btn w-full" onClick={() => void logout()}>
        <span className="inline-flex items-center justify-center gap-2"><Icon name="logout" size={15} /> {t('settings.logout')}</span>
      </button>
    </div>
  )
}

/** انتخاب‌گر یک تصویر پس‌زمینه: پیش‌نمایش + آپلود + بازنشانی */
function BackgroundPicker({
  field,
  label,
  current,
  onUploaded,
  onReset,
}: {
  field: 'lock_background' | 'desktop_background_day' | 'desktop_background_night'
  label: string
  current: string | null
  onUploaded: (url: string) => void
  onReset: () => void
}) {
  const { t } = useTranslation()
  const showToast = useOS((s) => s.showToast)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File) => {
    setBusy(true)
    const fd = new FormData()
    fd.append(field, file, file.name)
    try {
      const res = await upload<{ config: Config }>('/settings', fd)
      const url = res?.config?.[field] || ''
      if (url) {
        onUploaded(url)
        showToast(t('os.saved'), 'love')
      } else showToast(t('settings.savedLocally'), 'info')
    } catch {
      playError()
      showToast(t('settings.savedLocally'), 'info')
    }
    setBusy(false)
  }

  return (
    <div className="os-card flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {current && (
          <img src={current} alt="پیش‌نمایش پس‌زمینه" className="mt-2 h-14 w-24 rounded-lg object-cover" style={{ border: '1px solid var(--os-border)' }} />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button className="os-chip" disabled={busy} onClick={() => fileRef.current?.click()}>
          <span className="inline-flex items-center gap-1"><Icon name="camera" size={13} /> {t('settings.bgChoose')}</span>
        </button>
        {current && (
          <button className="os-chip" onClick={onReset} title={t('os.delete')}>
            <Icon name="trash" size={13} />
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void pick(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** تنظیمات ذخیره‌شده‌ی محلی (برای همگام‌سازی دوباره) */
export { getStoredSettings }
