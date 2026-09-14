/**
 * i18n — فارسی (پیش‌فرض) و انگلیسی
 *
 * فایل‌های ترجمه در `public/locales` زندگی می‌کنند تا حتی بعد از build و روی
 * هاست هم بدون بازسازی اپ قابل ویرایش باشند.
 *
 * ⚠️ مهم (رفع باگ فریز صفحه):
 * فایلِ داخل `public/` را هرگز با `import` در جاوااسکریپت وارد نمی‌کنیم.
 * Vite این کار را با خطای «Assets in public directory cannot be imported
 * from JavaScript» می‌بندد و کل باندل از کار می‌افتد (صفحه موقع ورود فریز
 * می‌شد). به‌جایش هر دو زبان را در زمان اجرا از `/locales/...` می‌گیریم و
 * main.tsx تا آماده شدن `i18nReady` صبر می‌کند؛ پس هیچ کامپوننتی با ترجمه‌ی
 * بارگذاری‌نشده رندر نمی‌شود.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const LANG_KEY = 'loveos_lang'
export type AppLang = 'fa' | 'en'

const BASE_URL: string =
  (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/'
const localeUrl = (lang: AppLang) => `${BASE_URL}locales/${lang}/translation.json`

function getInitialLang(): AppLang {
  try {
    return localStorage.getItem(LANG_KEY) === 'en' ? 'en' : 'fa'
  } catch {
    return 'fa'
  }
}

/** فایل ترجمه را با چند بار تلاش می‌گیرد و سالم‌بودنش را وارسی می‌کند. */
async function loadLocale(lang: AppLang, attempt = 0): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(localeUrl(lang), {
      cache: 'no-cache',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: unknown = await res.json()
    // اگر سرویس‌دهنده (مثلاً fallback اسپا) به‌جای JSON صفحه‌ی HTML برگرداند،
    // نباید آن را به‌عنوان بسته‌ی ترجمه وارد i18n کنیم.
    if (!data || typeof data !== 'object' || typeof (data as Record<string, unknown>).boot !== 'object') {
      throw new Error('invalid locale payload')
    }
    return data as Record<string, unknown>
  } catch (err) {
    if (attempt < 3) {
      await new Promise((r) => window.setTimeout(r, 300 * (attempt + 1)))
      return loadLocale(lang, attempt + 1)
    }
    throw err instanceof Error ? err : new Error(String(err))
  }
}

function applyDom(lang: AppLang) {
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr'
}

/**
 * آماده‌سازی پیش از رندر. main.tsx روی این قول صبر می‌کند تا مطمئن شود هر دو
 * زبان بارگذاری شده‌اند و جابه‌جایی زبان هم لحظه‌ای است. اگر هر دو زبان شکست
 * بخورند قول رد می‌شود و main یک صفحه‌ی «تلاش دوباره» نشان می‌دهد (به‌جای فریز).
 */
export const i18nReady: Promise<typeof i18n> = (async () => {
  const preferred = getInitialLang()
  const [faResult, enResult] = await Promise.allSettled([loadLocale('fa'), loadLocale('en')])

  if (faResult.status === 'rejected' && enResult.status === 'rejected') {
    throw faResult.reason
  }

  const fa = faResult.status === 'fulfilled' ? faResult.value : null
  const en = enResult.status === 'fulfilled' ? enResult.value : null

  const lng: AppLang = (preferred === 'fa' ? fa : en) ? preferred : fa ? 'fa' : 'en'

  await i18n.use(initReactI18next).init({
    resources: {
      ...(fa ? { fa: { translation: fa } } : {}),
      ...(en ? { en: { translation: en } } : {}),
    },
    lng,
    fallbackLng: fa ? (en ? ['fa', 'en'] : 'fa') : 'en',
    interpolation: { escapeValue: false },
    returnEmptyString: false,
  })
  applyDom(lng)
  return i18n
})()

export function setLanguage(lang: AppLang) {
  try {
    localStorage.setItem(LANG_KEY, lang)
  } catch {
    /* حالت ناشناس / حافظه‌ی پر */
  }
  void i18n.changeLanguage(lang)
  applyDom(lang)
}

export default i18n
