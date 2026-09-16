/**
 * About — درباره‌ی LoveOS
 * متن از پنل بابا می‌آید. هیچ اشاره‌ای به رازها اینجا نیست.
 */
import { useTranslation } from 'react-i18next'

import { LoveOSLogo } from '../shared/Icon'
import { Tilt, useMotionAllowed, useQualityTier } from '../shared/depth'
import { digits } from '../shared/format'
import { useOS } from '../shared/store'

export default function About() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)
  const tier = useQualityTier()
  const allowed = useMotionAllowed()
  const deep = allowed && tier !== 'lite'

  // لوگو یک **جسمِ بصری** است نه متن، پس تیلت می‌گیرد. همه‌ی متن‌های زیرش
  // (نام، نسخه، دل‌نوشته‌ی بابا) عمداً تخت می‌مانند: این اپ یک صفحه‌ی
  // خواندنی است و کج‌شدنِ دل‌نوشته خوانایی‌اش را می‌گرفت.
  const logo = config?.logo ? (
    <img
      src={config.logo}
      alt="لوگوی LoveOS"
      className="relative h-20 w-20 rounded-3xl object-cover"
      style={{ boxShadow: '0 var(--edge-2) calc(3 * var(--edge-2)) calc(-1 * var(--edge-2)) rgba(0,0,0,.45), inset 0 var(--edge-1) 0 rgba(255,255,255,.4)' }}
    />
  ) : (
    <LoveOSLogo size={84} />
  )

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <div className="os-depth-hero relative grid place-items-center">
        {deep && (
          <span
            className="os-orb pointer-events-none absolute"
            style={{
              width: 118,
              height: 118,
              opacity: 0.42,
              ['--orb-core' as string]: 'var(--os-accent-soft)',
              ['--orb-edge' as string]: 'var(--os-accent)',
            }}
            aria-hidden
          />
        )}
        {deep ? <Tilt maxDeg={13}>{logo}</Tilt> : logo}
      </div>
      <p className="os-title text-xl" style={{ color: 'var(--os-accent)' }}>LoveOS</p>
      <p className="text-xs os-muted">{t('about.version')} ۱.۰</p>
      <p className="text-sm">{t('about.madeBy')}</p>
      {config?.about_text && <p className="max-w-sm whitespace-pre-line text-sm leading-8 os-hand">{config.about_text}</p>}
      <p className="mt-2 text-xs os-muted">
        {config?.daddy_name} ❤ {config?.daughter_name}
      </p>
      {config?.days_together != null && (
        <p className="text-xs os-muted">{digits(config.days_together)} {t('os.days')}</p>
      )}
    </div>
  )
}
