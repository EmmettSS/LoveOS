/**
 * Settings — تنظیمات
 * زبان، تم، صدا، لرزش، اندازه‌ی فونت، اجازه‌ی اعلان و نصب PWA.
 * تنظیمات روی سرور ذخیره می‌شوند تا از هر دستگاهی یکسان باشد.
 */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '../shared/Icon'
import { patch } from '../shared/api'
import { setLanguage } from '../shared/i18n'
import { digits } from '../shared/format'
import { playClick, setSoundEnabled, vibrate } from '../shared/sound'
import { useOS } from '../shared/store'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="os-card flex flex-wrap items-center gap-3 p-3">
      <span className="flex-1 text-sm">{label}</span>
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
  const logout = useOS((s) => s.logout)
  const openApp = useOS((s) => s.openApp)
  const showToast = useOS((s) => s.showToast)

  const [installEvent, setInstallEvent] = useState<any>(null)
  const [vibrationOn, setVibrationOn] = useState(() => localStorage.getItem('loveos_vibration') !== 'off')

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  if (!config) return null

  const save = async (patchBody: Record<string, unknown>) => {
    const next = await patch<typeof config>('/settings', patchBody)
    setConfig(next)
    showToast(t('os.saved'), 'love')
  }

  return (
    <div className="space-y-3">
      <Row label={t('settings.language')}>
        {(['fa', 'en'] as const).map((l) => (
          <button
            key={l}
            className={`os-chip ${i18n.language === l ? 'os-chip-active' : ''}`}
            onClick={() => { playClick(); setLanguage(l); void save({ language: l }) }}
          >
            {l === 'fa' ? 'فارسی' : 'English'}
          </button>
        ))}
      </Row>

      <Row label={t('settings.theme')}>
        {(['auto', 'day', 'night'] as const).map((th) => (
          <button
            key={th}
            className={`os-chip ${config.theme === th ? 'os-chip-active' : ''}`}
            onClick={() => { playClick(); void save({ theme: th }) }}
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
          <button className="os-chip" onClick={() => void save({ font_scale: Math.max(0.85, (config.font_scale || 1) - 0.05) })}>−</button>
          <span className="w-10 text-center text-sm tabular-nums">{digits(Math.round((config.font_scale || 1) * 100))}٪</span>
          <button className="os-chip" onClick={() => void save({ font_scale: Math.min(1.4, (config.font_scale || 1) + 0.05) })}>+</button>
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

      <button className="os-btn w-full" onClick={() => openApp('about')}>
        <span className="inline-flex items-center justify-center gap-2"><Icon name="about" size={15} /> {t('settings.about')}</span>
      </button>

      <button className="os-btn w-full" onClick={() => void logout()}>
        <span className="inline-flex items-center justify-center gap-2"><Icon name="logout" size={15} /> {t('settings.logout')}</span>
      </button>
    </div>
  )
}
