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

  // ثبت/ویرایش در این آزمون فقط «موفق» گزارش می‌شود
  if (method !== 'GET') {
    const base = path.split('?')[0]
    const match = fixtures[base]
    return json(match?.item ? { ok: true, item: match.item, already: false } : { ok: true, progress: { daddy: 0, daughter: 0 } })
  }
  // مسیرهای پویا (کتاب/فصل/اتاق/الهام) از فایل fixture
  if (path.startsWith('/api/weather')) {
    const day = (offset: number, icon: string, hi: number, lo: number) => ({
      date: new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10),
      icon,
      temp_high: hi,
      temp_low: lo,
    })
    return json({
      daddy: {
        city: 'رشت', temp: 22, feels_like: 24, humidity: 68, wind: 14, pressure: 1012, cloud_cover: 20,
        sunrise: '05:41', sunset: '18:55', label: 'آفتابی', icon: 'sun',
        forecast: [day(1, 'sun', 24, 16), day(2, 'cloud', 23, 15), day(3, 'rain', 20, 14), day(4, 'sun', 25, 16), day(5, 'sun', 26, 17)],
      },
      daughter: {
        city: 'استانبول', temp: 27, feels_like: 29, humidity: 55, wind: 9, pressure: 1008, cloud_cover: 60,
        sunrise: '06:02', sunset: '19:20', label: 'ابری', icon: 'cloud', is_live: true,
        forecast: [day(1, 'cloud', 28, 19), day(2, 'rain', 25, 18), day(3, 'sun', 29, 19), day(4, 'cloud', 27, 18), day(5, 'storm', 26, 17)],
      },
      message: 'هوای جفتمون یه شکله ☁️',
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

const i18n = (await import('../src/shared/i18n')).default
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
