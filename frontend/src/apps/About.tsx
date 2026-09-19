/**
 * About — درباره‌ی LoveOS
 * متن از پنل بابا می‌آید. هیچ اشاره‌ای به رازها اینجا نیست.
 */
import { useTranslation } from 'react-i18next'

import { LoveOSLogo } from '../shared/Icon'
import { digits } from '../shared/format'
import { useOS } from '../shared/store'

export default function About() {
  const { t } = useTranslation()
  const config = useOS((s) => s.config)

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      {config?.logo ? (
        <img src={config.logo} alt="لوگوی LoveOS" className="h-20 w-20 rounded-3xl object-cover" />
      ) : (
        <LoveOSLogo size={84} />
      )}
      <p className="os-title text-xl" style={{ color: 'var(--os-accent)' }}>LoveOS</p>
      <p className="text-xs os-muted">{t('about.version')} ۱.۰</p>
      <p className="text-sm">{t('about.madeBy')}</p>
      <p className="max-w-xs text-xs leading-6 os-muted">{t('about.symbol')}</p>
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
