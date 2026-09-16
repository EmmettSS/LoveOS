/**
 * prefs.ts — تنظیمات محلی دستگاه
 *
 * تنظیمات LoveOS روی سرور ذخیره می‌شوند تا از هر دستگاهی یکسان باشند، ولی
 * برای این‌که «دکمه را زدم و هیچی نشد» هیچ‌وقت پیش نیاید، هر تغییر یک نسخه‌ی
 * محلی هم دارد: بی‌درنگ اعمال می‌شود، و اگر سرور در دسترس نبود در اولین
 * فرصت (بوت بعدی یا باز شدن صفحه‌ی تنظیمات) خودش سینک می‌شود.
 */
import { patch } from './api'
import type { Config } from './store'

const KEY = 'loveos_prefs_v1'

/**
 * کلیدهایی که اجازه دارند محلی ذخیره شوند (همان‌هایی که در صفحه‌ی تنظیمات هستند).
 *
 * ``ui_quality`` عمداً این‌جاست: کیفیتِ سه‌بعدی **خاصِ هر دستگاه** است
 * (گوشیِ دخترم با لپ‌تاپِ بابا یکی نیست)، پس نسخه‌ی محلی باید بر مقدارِ سرور
 * مقدم باشد — دقیقاً همان کاری که ``applyLocalPrefs`` انجام می‌دهد. ضمناً
 * اگر سرور در دسترس نبود، انتخابِ لایه باید بی‌درنگ اعمال شود تا «دکمه را
 * زدم و هیچی نشد» پیش نیاید.
 */
const ALLOWED = ['language', 'theme', 'sound_enabled', 'font_scale', 'ui_quality'] as const
type AllowedKey = (typeof ALLOWED)[number]

export type LocalPrefs = Partial<Pick<Config, AllowedKey>>

export function getStoredSettings(): LocalPrefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as Record<string, unknown>
    const out: LocalPrefs = {}
    for (const key of ALLOWED) {
      if (key in data) (out as Record<string, unknown>)[key] = data[key]
    }
    return out
  } catch {
    return {}
  }
}

export function setStoredSetting(key: string, value: unknown): void {
  if (!(ALLOWED as readonly string[]).includes(key)) return
  const current = getStoredSettings() as Record<string, unknown>
  current[key] = value
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* حافظه‌ی مرورگر پر است — بی‌خیال */
  }
}

export function clearStoredSettings(): void {
  localStorage.removeItem(KEY)
}

/** تنظیمات محلی را روی پیکربندی سرور سوار می‌کند (اولویت با دستگاه خودش) */
export function applyLocalPrefs(config: Config): Config {
  const prefs = getStoredSettings()
  if (Object.keys(prefs).length === 0) return config
  // زبان محلی از خود i18n خوانده می‌شود تا با انتخاب کاربر یکی باشد
  return { ...config, ...prefs, language: (localStorage.getItem('loveos_lang') as 'fa' | 'en') || prefs.language || config.language }
}

/** تنظیمات محلی ذخیره‌نشده روی سرور را سینک می‌کند (سکوت کامل در صورت خطا) */
export async function syncSettings(): Promise<boolean> {
  const prefs = getStoredSettings()
  if (Object.keys(prefs).length === 0) return false
  try {
    await patch('/settings', prefs)
    return true
  } catch {
    return false
  }
}
