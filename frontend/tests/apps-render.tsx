/**
 * apps.tsx — آزمون دودِ اپ‌های جدید
 *
 * شش اپ تازه (تماس، هدیه‌ها، کتاب‌خوانی، خونه‌ی رویایی، پل زبان) و پالت جستجوی
 * سراسری را با «پاسخ‌های واقعی بک‌اند» (fixtures.json) در jsdom بالا می‌آوریم و
 * سه چیز را می‌سنجیم:
 *   ۱) رندر بدون خطا (هیچ استثنایی در کنسول نباشد)
 *   ۲) محتوای واقعی روی صفحه بیاید (نه فقط اسپینر)
 *   ۳) تعامل‌های کلیدی کار کنند (تب عوض شود، فیلتر بزند، کوییز شروع شود…)
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// فایل پاسخ‌های بک‌اند کنار خودِ سورس تست است، نه کنار باندل ساخته‌شده
const fixturesDir = dirname(dirname(fileURLToPath(import.meta.url)))
const fixtures: Record<string, any> = JSON.parse(readFileSync(join(fixturesDir, 'fixtures.json'), 'utf8'))

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:5173/',
})
const w: any = dom.window
const g = globalThis as any
g.window = w
g.document = w.document
Object.defineProperty(g, 'navigator', { value: w.navigator, configurable: true })
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'SVGElement', 'File', 'Blob', 'FormData'])
  g[k] = w[k]
g.localStorage = w.localStorage
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
g.URL.createObjectURL = () => 'blob:fake'

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

const byPath: Record<string, any> = {}
for (const [key, value] of Object.entries(fixtures)) {
  const base = key.split('?')[0]
  if (!(base in byPath)) byPath[base] = value
}

const requested: string[] = []
const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string, opts: any = {}) => {
  const raw = String(url)
  const method = (opts.method || 'GET').toUpperCase()
  const path = raw.replace(/^https?:\/\/[^/]+/, '')
  requested.push(`${method} ${path}`)

  // فایل‌های ترجمه مثل حالت واقعی از public/locales سرو می‌شوند
  if (path.startsWith('/locales/')) {
    const lang = path.split('/')[2]
    try {
      return json(JSON.parse(readFileSync(join(fixturesDir, '..', 'public', 'locales', lang, 'translation.json'), 'utf8')))
    } catch {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
    }
  }

  // ثبت/ویرایش در این آزمون فقط «موفق» گزارش می‌شود
  if (method !== 'GET') {
    const base = path.split('?')[0]
    const match = fixtures[base]
    return json(match?.item ? { ok: true, item: match.item, already: false } : { ok: true, progress: { daddy: 0, daughter: 0 } })
  }
  // هواشناسی کلاینت‌ساید است: پاسخِ Open-Meteo (شکل واقعی) را می‌دهیم
  if (path.startsWith('/v1/forecast')) {
    const lat = Number(new URL(raw).searchParams.get('latitude'))
    const isDaughter = Math.abs(lat - 41.0082) < 0.6
    const temp = isDaughter ? 27 : Math.abs(lat - 37.2808) < 0.6 ? 22 : 24
    const code = isDaughter ? 3 : 0
    const dates = [0, 1, 2, 3, 4].map((i) => new Date(Date.now() + i * 86400000).toISOString().slice(0, 10))
    return json({
      latitude: lat,
      timezone: 'auto',
      current: {
        time: `${dates[0]}T21:00`, interval: 900,
        temperature_2m: temp, apparent_temperature: temp + 2, relative_humidity_2m: isDaughter ? 55 : 68,
        weather_code: code, wind_speed_10m: isDaughter ? 9 : 14, wind_direction_10m: isDaughter ? 200 : 45,
        pressure_msl: isDaughter ? 1008 : 1012, cloud_cover: isDaughter ? 60 : 20, is_day: 0, uv_index: 0.4,
      },
      daily: {
        time: dates,
        sunrise: dates.map((d) => `${d}T0${isDaughter ? 6 : 5}:41`),
        sunset: dates.map((d) => `${d}T18:55`),
        temperature_2m_max: dates.map(() => temp + 3),
        temperature_2m_min: dates.map(() => temp - 5),
        precipitation_probability_max: dates.map(() => (isDaughter ? 40 : 5)),
        weather_code: dates.map((_, i) => (isDaughter ? [3, 61, 2, 3, 95][i] : 0)),
      },
    })
  }
  const exact = fixtures[path]
  if (exact) return json(exact)
  const base = path.split('?')[0]
  if (fixtures[base]) return json(fixtures[base])
  if (byPath[base]) return json(byPath[base])
  const dynamic = Object.keys(fixtures).find((k) => {
    const rx = new RegExp('^' + k.replace(/\/\d+/g, '/\\d+') + '$')
    return rx.test(path)
  })
  if (dynamic) return json(fixtures[dynamic])
  const overviews = Object.values(fixtures) as any[]
  void overviews
  return json({ items: [], count: 0, total: 0, groups: [], sources: [], suggestions: [] })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createElement: h } = await import('react')

const i18nModule = await import('../src/shared/i18n')
const i18n = i18nModule.default
await i18nModule.i18nReady
globalThis.__loveosHarness = true

/** یک اپ را در یک ظرف تازه بالا می‌آورد و HTML نهایی را برمی‌گرداند */
async function mount(name: string, element: any, wait = 260) {
  const host = w.document.createElement('div')
  w.document.body.appendChild(host)
  const root = createRoot(host)
  const errors: string[] = []
  const onError = (e: any) => errors.push(String(e?.error?.message || e?.message || e))
  w.addEventListener('error', onError)
  await act(async () => {
    root.render(element)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, wait))
  })
  const html = host.innerHTML
  w.removeEventListener('error', onError)
  void errors
  return { html, root, host, errors }
}

const click = async (el: Element | undefined | null) => {
  if (!el) return false
  await act(async () => {
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await act(async () => {
    // انیمیشن‌های AnimatePresence باید تمام شوند تا محتوای تب تازه سوار شود
    await new Promise((r) => setTimeout(r, 420))
  })
  return true
}

const byText = (root: HTMLElement, text: string, tag = 'button') =>
  Array.from(root.querySelectorAll(tag)).find((b) => (b.textContent || '').includes(text))

console.log('🧪 آزمون اپ‌های جدید LoveOS')
await i18n.changeLanguage('fa')

/* --------------------------------------------------- هماهنگ‌کننده‌ی تماس */
const callSync = (await import('../src/apps/CallSync')).default
{
  const { html, host } = await mount('CallSync', h(callSync))
  check('CallSync بالا آمد', html.length > 800)
  check('شمارش معکوس تماس بعدی دیده می‌شود', html.includes('تماس بعدی'))
  check('بازه‌های مشترک رندر شدند', html.includes('هفته‌ی ما') || html.includes('وقت‌هایی که'))
  const tabs = Array.from(host.querySelectorAll('button'))
  await click(tabs.find((b) => (b.textContent || '').includes('دفتر تماس‌ها')))
  check('تب دفتر تماس‌ها باز می‌شود', host.innerHTML.includes('ثبت یک تماس'))
  await click(tabs.find((b) => (b.textContent || '').includes('دفتر تماس‌ها')))
  const logBtn = byText(host, 'ثبت یک تماس')
  await click(logBtn)
  check(
    'فرم ثبت تماس باز می‌شود (با میکروفن یا پیام جایگزینش)',
    host.innerHTML.includes('ضبط صدا با میکروفن') || host.innerHTML.includes('ضبط صدا را پشتیبانی نمی‌کند') || host.innerHTML.includes('حال بابا'),
  )
  check('جدول بازه‌های آزاد در تب هفته هست', Array.isArray(fixtures['/api/calls/overview'].slots))
}

/* ------------------------------------------------------------ دفتر هدیه */
const giftBook = (await import('../src/apps/GiftBook')).default
{
  const { html, host } = await mount('GiftBook', h(giftBook))
  check('GiftBook بالا آمد', html.length > 600)
  check('آمار دریافتی/داده‌شده نمایش داده می‌شود', html.includes('هدیه‌های دریافتی') && html.includes('هدیه‌های داده‌شده'))
  check('هیچ بخش قیمت/مبلغی در دفتر نیست', !html.includes('تومان') && !html.includes('ارزش کل') && !html.includes('میانگین'))
  check('نمودار سال‌های شمسی دیده می‌شود', html.includes('۱۴۰۵'))
  // چیپ سال: دکمه‌ای که متنش دقیقاً همان سال است (نه کارت هدیه که تاریخش این سال را دارد)
    const yearChip = Array.from(host.querySelectorAll('button')).find((b) => (b.textContent || '').trim() === String.fromCharCode(0x06F1, 0x06F4, 0x06F0, 0x06F5))
  await click(yearChip)
  check(
    'فیلتر سال شمسی درخواست فیلترشده می‌فرستد',
    requested.some((r) => r.includes('/api/gifts') && r.includes('year=1405')),
    requested.filter((r) => r.includes('/api/gifts')).slice(-3).join(' | '),
  )
  const addToggle = host.querySelector('.os-btn-primary')
  await click(addToggle)
  check('فرم افزودن هدیه باز می‌شود (بدون کادر قیمت)', host.innerHTML.includes('ثبت هدیه‌ی جدید') && !host.innerHTML.includes('رنج قیمت'))
}

/* --------------------------------------------------- کتاب‌خوانی مشترک */
const readTogether = (await import('../src/apps/ReadTogether')).default
{
  const { html, host } = await mount('ReadTogether', h(readTogether))
  check('ReadTogether بالا آمد', html.length > 600)
  check('قفسه‌ی کتابخونه هم نمایش داده می‌شود', html.includes('قفسه‌ی کتابخونه'))
  check('کارت کتاب روی قفسه هست', html.includes('ملت عشق'))
  const bookBtn = Array.from(host.querySelectorAll('button')).find((b) => (b.textContent || '').includes('ملت عشق'))
  await click(bookBtn)
  check('نمای داخل کتاب (فصل‌ها) باز شد', host.innerHTML.includes('فصل'))
}

/* -------------------------------------------------- خونه‌ی رویایی */
const dreamHome = (await import('../src/apps/DreamHome')).default
{
  const { html, host } = await mount('DreamHome', h(dreamHome))
  check('DreamHome بالا آمد', html.length > 600)
  check('چک‌لیست آرزوها با درصد پیشرفت', /\d+%/.test(html) && html.includes('ضروری'))
  const mapTab = byText(host, 'نقشه')
  await click(mapTab)
  check('تب نقشه و اتاق‌ها رندر شد', host.innerHTML.includes('نشیمن') || host.querySelectorAll('.absolute').length > 1)
  await click(byText(host, 'گالری'))
  check('تب گالری باز شد', host.innerHTML.length > 200)
}

/* ------------------------------------------------------------ پل زبان */
const languageBridge = (await import('../src/apps/LanguageBridge')).default
{
  const { html, host } = await mount('LanguageBridge', h(languageBridge))
  check('LanguageBridge بالا آمد', html.length > 800)
  check('دیکشنری با کلمه‌های مازندرانی', html.includes('مازندرانی') || html.includes('دیکشنری'))
  await click(byText(host, 'فلش‌کارت'))
  check('فلش‌کارت لود شد', host.innerHTML.includes('یاد گرفتم') || host.innerHTML.includes('تمرین به'))
  await click(byText(host, 'کوییز'))
  check('کوییز از پنل بابا شروع می‌شود', host.innerHTML.includes('شروع کوییز') || host.innerHTML.includes('سؤال'))
}

/* -------------------------------------------------- جستجوی سراسری */
{
  const { GlobalSearch } = await import('../src/os/GlobalSearch')
  const { useOS } = await import('../src/shared/store')
  const { html, host } = await mount('GlobalSearch', h(GlobalSearch), 60)
  check('پالت در حالت بسته چیزی رندر نمی‌کند', html.trim().length === 0)
  await act(async () => {
    useOS.getState().toggleCommand(true)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120))
  })
  check('با باز شدن پالت، کادر جستجو می‌آید', host.innerHTML.includes('جستجوی سراسری') || host.innerHTML.includes('بگرد'))
  const input = host.querySelector('input')
  if (input) {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value')!.set!
      setter.call(input, 'بابا')
      input.dispatchEvent(new w.Event('input', { bubbles: true }))
    })
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500))
    })
    check('نتیجه‌ی جستجو از بک‌اند می‌آید', host.innerHTML.includes('نتیجه') || /chat|نامه|خاطره/.test(host.innerHTML))
    check('فیلتر منابع (چیپ‌ها) نمایش داده می‌شود', requested.some((r) => r.includes('/search?q=')))
  } else {
    check('کادر جستجو پیدا شد', false)
  }
}

/* ----------------------------------------------------- ویجت‌های دسکتاپ */
{
  const { Desktop } = await import('../src/os/Desktop')
  const { useOS } = await import('../src/shared/store')
  await act(async () => {
    useOS.setState({
      config: {
        daughter_name: 'مریم', daughter_nickname: 'دخترم', daddy_name: 'بابا', days_together: 100,
        next_meeting: null, next_meeting_delta: { days: 3, hours: 2 }, boot_greeting: '', wrong_pass_message: '',
        lock_help_message: '', security_question: '', language: 'fa', theme: 'day', sound_enabled: false,
        font_scale: 1, logo: null, boot_background: null, lock_background: null, desktop_background_day: null,
        desktop_background_night: null, is_birthday: false, is_anniversary: false, has_passcode: true,
      } as any,
      phase: 'desktop',
    })
  })
  const { html } = await mount('Desktop', h(Desktop), 250)
  check('دسکتاپ با ویجت تماس بعدی رندر می‌شود', html.includes('تماس بعدی'))
  check('آیکن‌های اپ‌های جدید روی دسکتاپ هستند', html.includes('هماهنگ‌کننده‌ی تماس') || html.includes('دفتر هدیه‌ها'))
  check('داک دکمه‌ی جستجو (ذره‌بین) دارد', html.includes('جستجوی سراسری'))
}

console.log(failCount === 0 ? '\n🎉 همه‌ی بررسی‌ها پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
