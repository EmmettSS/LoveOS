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
import { playClick, playError, setSoundEnabled, vibrate } from '../shared/sound'
import { Toggle } from '../shared/ui'
import { useOS, type Config, type Theme } from '../shared/store'

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  // ⚠️ عمداً ``os-tilt-card`` **نگرفت**: هر Row یک برچسب و یک راهنمای
  //    متنی دارد و قانونِ سختِ پروژه «متن هرگز کج نمی‌شود» است. چیزی که
  //    می‌گیرد ``os-slab`` است — لبه‌ی توپُرِ فیزیکی، بدونِ هیچ چرخش. این
  //    «عمقِ نقاشی‌شده» در هر سه لایه (حتی مهتاب) فعال است چون حرکت ندارد.
  return (
    <div className="os-card os-slab flex flex-wrap items-center gap-3 p-3">
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

  /* --------------------------------------------------- کیفیتِ سه‌بعدی --- */
  const uiQuality = useOS((s) => s.uiQuality)
  const uiQualityChoice = useOS((s) => s.uiQualityChoice)
  const qualityReasons = useOS((s) => s.qualityReasons)
  const qualityReport = useOS((s) => s.qualityReport)
  const qualityFps = useOS((s) => s.qualityFps)
  const qualityAutoDowngraded = useOS((s) => s.qualityAutoDowngraded)
  const setQualityChoice = useOS((s) => s.setQualityChoice)
  const initQuality = useOS((s) => s.initQuality)
  const [measuring, setMeasuring] = useState(false)

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
    /* هیچ ``motion.*`` در این فایل نیست، پس بچه‌ها transform درون‌خطی
       نمی‌گیرند و ``.os-depth-list`` بدونِ دعوا کار می‌کند: بخش‌ها یکی‌یکی
       از عمق بالا می‌آیند. انیمیشن ``backwards`` است، پس بعد از ورود هیچ
       transformی روی عنصر نمی‌ماند. */
    <div className="os-depth-list space-y-3">
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

      {/* ------------------------------------------------ کیفیتِ سه‌بعدی --- */}
      {/*
        نام‌های فارسیِ لایه‌ها عمداً شاعرانه‌اند (مهتاب/بلور/کهکشان) چون این
        تنظیمات را یک بچه می‌خواند، نه یک مهندس. ولی **مقدارِ ذخیره‌شده**
        همان ``lite|balanced|dream`` باقی می‌ماند تا منطقِ موتور و بک‌اند به
        زبانِ نمایش گره نخورد.

        نکته‌ی مهمِ رفتار: اگر دخترم «کهکشان» را بزند ولی دستگاهش توانش را
        نداشته باشد، موتور انتخابش را به سقفِ ممکن **گیره** می‌کند. پس این‌جا
        هم صریح می‌گوییم «الان چه لایه‌ای فعال است» و چرا — وگرنه او
        «کهکشان» را انتخاب کرده ولی «بلور» می‌بیند و فکر می‌کند اپ خراب است.
      */}
      <Row label={t('settings.quality')} hint={t('settings.qualityHint')}>
        <div className="flex w-full flex-wrap gap-1.5">
          {(['auto', 'lite', 'balanced', 'dream'] as const).map((q) => (
            <button
              key={q}
              className={`os-chip flex-1 justify-center whitespace-nowrap ${
                uiQualityChoice === q ? 'os-chip-active' : ''
              }`}
              style={{ minWidth: 72, minHeight: 44 }}
              aria-pressed={uiQualityChoice === q}
              onClick={() => {
                playClick()
                // ۱) موتورِ کیفیت بی‌درنگ تصمیمِ تازه می‌گیرد (و حافظه‌ی
                //    تنزلِ خودکار پاک می‌شود، چون کاربر صریحاً خواسته)
                void setQualityChoice(q)
                // ۲) روی سرور و localStorage ذخیره می‌شود. ترتیب عمدی است:
                //    اعمالِ بصری باید پیش از شبکه باشد تا «زدم و هیچی نشد»
                //    پیش نیاید.
                void save({ ui_quality: q }, { silent: true })
              }}
            >
              {t(`settings.tier_${q}`)}
            </button>
          ))}
        </div>
      </Row>

      <div className="os-card os-slab space-y-2 p-3" data-quality-panel>
        <p className="text-sm">
          <span className="os-muted">{t('settings.qualityNow')}</span>{' '}
          <b style={{ color: 'var(--os-accent)' }}>{t(`settings.tier_${uiQuality}`)}</b>
          {qualityFps != null && (
            <span className="os-muted text-xs"> — {t('settings.qualityFps', { n: digits(Math.round(qualityFps)) })}</span>
          )}
        </p>

        {/* توضیحِ یک‌خطیِ لایه‌ی فعال: می‌گوید چه چیزی می‌بیند */}
        <p className="text-[11px] leading-5 os-muted">{t(`settings.qualityDesc_${uiQuality}`)}</p>

        {/* دلیل‌ها از خودِ موتور می‌آیند، نه از یک متنِ ثابت. این مهم است:
            اگر موتور تنزل داد، دلیلِ واقعی‌اش هم نشان داده می‌شود. */}
        {qualityReasons.length > 0 && (
          <details className="text-[11px] leading-5">
            <summary className="cursor-pointer os-muted select-none">{t('settings.qualityWhy')}</summary>
            <ul className="mt-1.5 space-y-0.5 list-inside list-disc os-muted">
              {qualityReasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </details>
        )}

        {qualityAutoDowngraded && (
          <p className="text-[11px] leading-5 rounded-xl px-2.5 py-1.5" style={{ background: 'var(--os-warn-bg, rgba(255,193,94,.14))' }}>
            {t('settings.qualityAutoDowngradedNote')}
          </p>
        )}

        {/* اطلاعاتِ دستگاه — برای بابا، تا بداند چرا لایه این است */}
        {qualityReport && (
          <details className="text-[11px] leading-5">
            <summary className="cursor-pointer os-muted select-none">{t('settings.qualityDevice')}</summary>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 os-muted">
              <span>{t('settings.qualityCores', { n: digits(qualityReport.cores) })}</span>
              <span>
                {qualityReport.webgl === 0
                  ? t('settings.qualityNoWebgl')
                  : t('settings.qualityWebgl', { v: digits(qualityReport.webgl) })}
              </span>
              <span>DPR {qualityReport.dpr.toFixed(1)}</span>
              <span>
                {qualityReport.memoryGB != null
                  ? t('settings.qualityMemory', { n: qualityReport.memoryGB.toFixed(1) })
                  : t('settings.qualityMemoryUnknown')}
              </span>
              {/* رشته‌ی رندررِ GPU عمداً دو ستون کامل می‌گیرد: اسمِ GPUها طولانی
                  است و نصفه‌نیمه بریدنش بی‌فایده‌ترین اطلاعاتِ ممکن است. */}
              <span className="col-span-2 break-all" dir="ltr" style={{ textAlign: 'left' }}>
                {qualityReport.renderer || t('settings.qualityGpuUnknown')}
              </span>
            </div>
          </details>
        )}

        <button
          className="os-chip mt-1"
          style={{ minHeight: 44 }}
          disabled={measuring}
          onClick={() => {
            playClick()
            setMeasuring(true)
            // force=true → سنجه‌ی فریم از کش خوانده نمی‌شود و واقعاً دوباره
            // اندازه می‌گیرد. برای وقتی خوب است که گوشی داغ کرده یا برنامه‌ی
            // دیگری سنگین بوده و لایه بی‌دلیل پایین افتاده.
            void initQuality(uiQualityChoice, true).finally(() => setMeasuring(false))
          }}
        >
          {measuring ? t('settings.qualityMeasuring') : t('settings.qualityRemeasure')}
        </button>
      </div>

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

      <div className="os-card os-slab p-3 text-[11px] leading-6 os-muted">{t('settings.privacy')}</div>

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
    <div className="os-card os-slab flex flex-wrap items-center gap-3 p-3">
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
