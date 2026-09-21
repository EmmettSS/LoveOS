/**
 * weather-live.tsx — آزمون آب‌وهوای کلاینت‌ساید (Open-Meteo مستقیم از مرورگر)
 *
 * چرا این آزمون؟ چون هواشناسی از سرور به مرورگر منتقل شده و هیچ تستی این مسیرِ
 * تازه را پوشش نمی‌داد. اینجا:
 *   ۱) درخواست‌ها واقعاً به `api.open-meteo.com` می‌رود (با قصه‌ی fetch شبیه‌سازی
 *      شده، به شکلِ واقعیِ پاسخ سرویس)
 *   ۲) مختصات دخترم از «موقعیت زنده» خوانده می‌شود، نه از مقدار پنل
 *   ۳) کش ۱۵ دقیقه‌ای sessionStorage جلوی درخواست تکراری را می‌گیرد
 *   ۴) با قطع اینترنت، آخرین داده‌ی محفوظ نشان داده می‌شود (بدون صفحه‌ی خطا)
 *   ۵) هوای بارانی → پیامِ دل‌سوزانه‌ی مخصوص باران
 *   ۶) ویجت دسکتاپ هم همان دمای زنده را می‌آورد
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const publicDir = join(dirname(dirname(fileURLToPath(import.meta.url))), '..', 'public')

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:5173/',
})
const w: any = dom.window
const g = globalThis as any
g.window = w
g.document = w.document
Object.defineProperty(g, 'navigator', { value: w.navigator, configurable: true })
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'SVGElement'])
  g[k] = w[k]
g.localStorage = w.localStorage
g.sessionStorage = w.sessionStorage
g.requestAnimationFrame = w.requestAnimationFrame.bind(w)
g.cancelAnimationFrame = w.cancelAnimationFrame.bind(w)
g.getComputedStyle = w.getComputedStyle.bind(w)
g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
w.matchMedia = g.matchMedia
g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
g.IS_REACT_ACT_ENVIRONMENT = true
g.scrollTo = () => undefined
w.scrollTo = () => undefined

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

/* ------------------------------------------- پاسخ نمونه‌ی Open-Meteo ---- */
const ISTANBUL = { lat: 41.0082, lng: 28.9784 }
const RASHT = { lat: 37.2808, lng: 49.5832 }

type Mode = 'dry' | 'rain'

/** شکلِ واقعی پاسخ Open-Meteo برای همان پارامترهای درخواستی ما */
function forecastPayload(lat: number, mode: Mode) {
  const isDaughter = Math.abs(lat - ISTANBUL.lat) < 0.6
  const temp = isDaughter ? (mode === 'rain' ? 18.2 : 27.4) : 22.4
  const code = isDaughter ? (mode === 'rain' ? 61 : 2) : 0
  const dates = [0, 1, 2, 3, 4].map((i) => new Date(Date.now() + i * 86400000).toISOString().slice(0, 10))
  return {
    latitude: lat,
    longitude: isDaughter ? ISTANBUL.lng : RASHT.lng,
    utc_offset_seconds: 12600,
    timezone: 'auto',
    current_units: { temperature_2m: '°C' },
    current: {
      time: `${dates[0]}T21:00`,
      interval: 900,
      temperature_2m: temp,
      apparent_temperature: temp + 1.6,
      relative_humidity_2m: isDaughter ? 55 : 27,
      weather_code: code,
      wind_speed_10m: 11.3,
      wind_direction_10m: 225,
      pressure_msl: 1013.4,
      cloud_cover: isDaughter ? 60 : 8,
      is_day: 0,
      uv_index: 0.4,
    },
    daily: {
      time: dates,
      sunrise: dates.map((d) => `${d}T05:41`),
      sunset: dates.map((d) => `${d}T18:12`),
      temperature_2m_max: dates.map(() => temp + 3),
      temperature_2m_min: dates.map(() => temp - 5),
      precipitation_probability_max: dates.map(() => (mode === 'rain' ? 80 : 5)),
      weather_code: dates.map(() => code),
    },
  }
}

let mode: Mode = 'dry'
let offline = false
const meteoCalls: string[] = []

const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string) => {
  const raw = String(url)
  if (raw.includes('/locales/')) {
    const lang = raw.includes('/en/') ? 'en' : 'fa'
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  if (raw.includes('api.open-meteo.com')) {
    meteoCalls.push(raw)
    if (offline) throw new Error('offline')
    const lat = Number(new URL(raw).searchParams.get('latitude'))
    return json(forecastPayload(lat, mode))
  }
  if (raw.includes('/api/calls/next')) return json({ item: null })
  if (raw.includes('/api/')) return json({ items: [], item: null, unread: 0, ok: true })
  return json({ items: [], item: null, unread: 0 })
}

/* ------------------------------------------------------- پیکربندی ---- */
const config: any = {
  daughter_name: 'مریم', daughter_nickname: 'دخترم', daddy_name: 'بابا', days_together: 100, next_meeting: null,
  next_meeting_delta: null, boot_greeting: '', wrong_pass_message: '', lock_help_message: '', security_question: '',
  language: 'fa', theme: 'day', sound_enabled: false, font_scale: 1, logo: null, boot_background: null,
  lock_background: null, desktop_background_day: null, desktop_background_night: null, is_birthday: false,
  is_anniversary: false, has_passcode: true,
  // بابا: رشت
  daddy_city: 'رشت', daddy_lat: RASHT.lat, daddy_lng: RASHT.lng, daddy_timezone: 'Asia/Tehran',
  // مقدار پنل دخترم: آنکارا — ولی موقعیت زنده‌اش استانبول است
  daughter_city: 'آنکارا', daughter_lat: 39.9334, daughter_lng: 32.8597, daughter_timezone: 'Europe/Istanbul',
  live_location: {
    lat: ISTANBUL.lat, lng: ISTANBUL.lng, accuracy: 18, city: 'استانبول', timezone: 'Europe/Istanbul',
    source: 'device', captured_at: new Date().toISOString(), is_live: true,
  },
}

const { act } = await import('react')
const { createElement: h } = await import('react')
const { createRoot } = await import('react-dom/client')
const { useOS } = await import('../src/shared/store')
const { i18nReady } = await import('../src/shared/i18n')
await i18nReady
const Weather = (await import('../src/apps/Weather')).default

const wait = async (ms: number) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

async function mountApp(element: any, settle = 1900) {
  const host = w.document.createElement('div')
  w.document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(element)
  })
  // شمارنده‌ی دما انیمیشنی است؛ تا آخرِ انیمیشن صبر می‌کنیم
  await wait(settle)
  return { html: host.innerHTML, host, root }
}

const clearWeatherCache = () => {
  const keys: string[] = []
  for (let i = 0; i < w.sessionStorage.length; i += 1) {
    const k = w.sessionStorage.key(i)
    if (k && k.startsWith('loveos_weather_v1')) keys.push(k)
  }
  keys.forEach((k) => w.sessionStorage.removeItem(k))
}

const ageWeatherCache = (ms: number) => {
  for (let i = 0; i < w.sessionStorage.length; i += 1) {
    const k = w.sessionStorage.key(i)
    if (!k || !k.startsWith('loveos_weather_v1')) continue
    const entry = JSON.parse(w.sessionStorage.getItem(k)!)
    entry.at -= ms
    w.sessionStorage.setItem(k, JSON.stringify(entry))
  }
}

console.log('\n🧪 آزمون آب‌وهوای کلاینت‌ساید (Open-Meteo)')
await act(async () => {
  useOS.setState({ phase: 'desktop', config: { ...config }, windows: [], appOrder: null })
})

/* ------------------------------------------------ ۱) اپ هواشناسی ---- */
console.log('\n--- ۱) اپ هواشناسی، مستقیم از مرورگر ---')
{
  const { html } = await mountApp(h(Weather))
  check('کارت بابا آمده', html.includes('رشت'))
  check('کارت دخترم آمده', html.includes('استانبول'))
  check('دمای زنده‌ی بابا (۲۲) دیده می‌شود', html.includes('۲۲'))
  check('دمای زنده‌ی دخترم (۲۷) دیده می‌شود', html.includes('۲۷'))
  check('وضعیت هوا به فارسی ترجمه شد', html.includes('آفتابی') && html.includes('نیمه‌ابری'))
  check('جهت باد فارسی شد (۲۲۵° = جنوب‌غربی)', html.includes('جنوب‌غربی'))
  check('طلوع آفتاب از پاسخ سرویس خوانده شد', html.includes('۰۵:۴۱'))
  check('پیش‌بینی ۵ روزه رندر شد', html.includes('امروز') && html.includes('فردا'))
  check('پیامِ اختلاف دما حساب شد (۵ درجه)', html.includes('تفاوت با هوای بابا'), html.slice(0, 0))
  check('نشانِ موقعیت زنده برای دخترم هست', html.includes('زنده'))

  check('به سرویس Open-Meteo وصل شد', meteoCalls.length === 2, `${meteoCalls.length} درخواست`)
  const daddyCall = meteoCalls.find((u) => u.includes('latitude=37.2808')) || ''
  const daughterCall = meteoCalls.find((u) => u.includes('latitude=41.0082')) || ''
  check('مختصات بابا از تنظیمات پنل رفت', daddyCall.includes('latitude=37.2808'))
  check('مختصات دخترم از «موقعیت زنده» رفت (نه مقدار پنل)', !meteoCalls.some((u) => u.includes('39.9334')))
  check('منطقه‌ی زمانی زنده درخواست شد', daughterCall.includes('timezone=Europe%2FIstanbul'))
  check('همه‌ی فیلدهای خواسته‌شده در آدرس هست', daddyCall.includes('uv_index') && daddyCall.includes('sunrise') && daddyCall.includes('forecast_days=5'))
}

/* -------------------------------------------- ۲) کش ۱۵ دقیقه‌ای ---- */
console.log('\n--- ۲) کشِ نشست (بدون درخواست تکراری) ---')
{
  const before = meteoCalls.length
  const { html } = await mountApp(h(Weather), 700)
  check('بار دوم هنوز دماها را دارد', html.includes('۲۲') && html.includes('۲۷'))
  check('بار دوم درخواست تازه‌ای نفرستاد', meteoCalls.length === before, `${meteoCalls.length - before} درخواست`)
  check('راهنمای «از حافظه» نشان داده شد', html.includes('از حافظه‌ی این نشست'))
}

/* --------------------------------- ۳) قطع اینترنت + کش قدیمی ---- */
console.log('\n--- ۳) قطع اینترنت با کشِ قدیمی ---')
{
  ageWeatherCache(20 * 60 * 1000) // از مهلت ۱۵ دقیقه‌ای بیرون
  offline = true
  const { html } = await mountApp(h(Weather), 700)
  check('با قطع اینترنت، آخرین دماها می‌مانند', html.includes('۲۲') && html.includes('۲۷'))
  check('به‌جای صفحه‌ی خطا، کارت‌ها را نشان می‌دهد', !html.includes('یه چیزی درست کار نکرد'))
  check('تلاش برای تازه‌سازی انجام شد (و شکست خورد)', meteoCalls.length > 2)
  offline = false
}

/* ------------------------------------------ ۴) هوای بارانی ---- */
console.log('\n--- ۴) بارانِ شهرِ دخترم ---')
{
  mode = 'rain'
  clearWeatherCache()
  const { html } = await mountApp(h(Weather))
  check('دمای تازه‌ی بارانی آمد (۱۸)', html.includes('۱۸'))
  check('وضعیت باران ترجمه شد', html.includes('باران'))
  check('پیام دل‌سوزانه‌ی باران آمد', html.includes('چتر یادت نره'))
  check('احتمال بارش در پیش‌بینی هست', html.includes('💧'))
}

/* ------------------------------------- ۵) ویجت دسکتاپ ---- */
console.log('\n--- ۵) ویجت آب‌وهوای دسکتاپ ---')
{
  const before = meteoCalls.length
  const { Desktop } = await import('../src/os/Desktop')
  const { html } = await mountApp(h(Desktop), 800)
  check('ویجت هوای دو شهر روی دسکتاپ هست', html.includes('هوای ما'))
  check('دمای بابا (۲۲) در ویجت آمده', html.includes('۲۲°'))
  check('دمای تازه‌ی دخترم (۱۸) در ویجت آمده', html.includes('۱۸°'))
  check('ویجت از همان کشِ ۱۵ دقیقه‌ای خواند', meteoCalls.length === before, `${meteoCalls.length - before} درخواست`)
}

console.log(failCount === 0 ? '\n🎉 آزمون آب‌وهوای کلاینت‌ساید پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
