/**
 * Settings — تنظیمات
 * زبان، تم، صدا، لرزش، اندازه‌ی فونت، موقعیت مکانی، اعلان و نصب PWA.
 *
 * روش کار: هر تغییر **بلافاصله** روی خود دستگاه اعمال می‌شود (خوش‌بینانه) و
 * بعد برای سرور فرستاده می‌شود؛ اگر شبکه/سرور در دسترس نبود، تغییر محلی می‌ماند
 * و در اولین فرصت همگام می‌شود. این‌طوری هیچ‌وقت «دکمه را زدم ولی هیچی نشد» پیش نمی‌آید.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { patch } from '../shared/api'
import { getStoredSettings, setStoredSetting, syncSettings } from '../shared/prefs'
import { setLanguage } from '../shared/i18n'
import { digits } from '../shared/format'
import { enableLiveLocation, getCurrentPosition, readCachedLocation } from '../shared/geo'
import { playClick, setSoundEnabled, vibrate } from '../shared/sound'
import { useOS, type Config, type Theme } from '../shared/store'

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

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className="h-7 w-12 shrink-0 rounded-full p-0.5 transition"
      style={{ background: on ? 'var(--os-accent)' : 'var(--os-border)' }}
      aria-label="toggle"
    >
      <span className="block h-6 w-6 rounded-full bg-white transition-transform" style={{ transform: `translateX(${on ? 20 : 0}px)` }} />
    </button>
  )
}

export default function Settings() {
  const { t, i18n } = useTranslation()
  const config = useOS((s) => s.config)
  const setConfig = useOS((s) => s.setConfig)
  const patchConfig = useOS((s) => s.patchConfig)
  const logout = useOS((s) => s.logout)
  const openApp = useOS((s) => s.openApp)
  const showToast = useOS((s) => s.showToast)

  const [installEvent, setInstallEvent] = useState<any>(null)
  const [vibrationOn, setVibrationOn] = useState(() => localStorage.getItem('loveos_vibration') !== 'off')
  const [locating, setLocating] = useState(false)
  const [locationHint, setLocationHint] = useState('')
  const live = config?.live_location

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

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

      <Row label={t('settings.notificationsPerm')}>
        <button
          className="os-chip"
          onClick={async () => {
            if ('Notification' in window) {
              const p = await Notification.requestPermission()
              showToast(p === 'granted' ? t('os.saved') : t('os.error'))
            }
          }}
        >
          <span className="inline-flex items-center gap-1"><Icon name="bell" size={13} /> {t('os.yes')}</span>
        </button>
      </Row>

      {installEvent && (
        <Row label={t('settings.install')}>
          <button className="os-chip" onClick={() => { installEvent.prompt(); setInstallEvent(null) }}>
            <span className="inline-flex items-center gap-1"><Icon name="upload" size={13} /> {t('settings.install')}</span>
          </button>
        </Row>
      )}

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

/** تنظیمات ذخیره‌شده‌ی محلی (برای همگام‌سازی دوباره) */
export { getStoredSettings }
