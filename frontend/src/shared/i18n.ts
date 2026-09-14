/**
 * i18n — فارسی (پیش‌فرض) و انگلیسی
 * همه‌ی متن‌ها در public/locales هستند و بدون build قابل ویرایش‌اند.
 */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import en from '../../public/locales/en/translation.json'
import fa from '../../public/locales/fa/translation.json'

export const LANG_KEY = 'loveos_lang'

void i18n.use(initReactI18next).init({
  resources: { fa: { translation: fa }, en: { translation: en } },
  lng: localStorage.getItem(LANG_KEY) || 'fa',
  fallbackLng: 'fa',
  interpolation: { escapeValue: false },
})

export function setLanguage(lang: 'fa' | 'en') {
  localStorage.setItem(LANG_KEY, lang)
  void i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr'
}

export default i18n
