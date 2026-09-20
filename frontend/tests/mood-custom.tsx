/**
 * mood-custom.tsx — آزمونِ «حال دلم»: حالِ تازه‌ی خودِ دخترم + واکنشِ همیشگی
 *
 * سه چیز سنجیده می‌شود:
 *   ۱) حال‌های آماده با ایموجیِ خودشان (از سرور) می‌آیند
 *   ۲) «حال تازه» ساخته می‌شود: ایموجی + اسم + یادداشت → به سرور می‌رود و
 *      همان لحظه در فهرست می‌ماند و پیامِ بابا/تأیید نشان داده می‌شود
 *   ۳) وقتی سرور خطا بدهد (همان ۵۰۰ قدیمی)، اپ ساکت نمی‌ماند و پیامِ روشن
 *      با دکمه‌ی تلاش دوباره نشان می‌دهد
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
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'HTMLInputElement', 'SVGElement'])
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

const BUILTINS = [
  { mood: 'happy', label: 'خوشحال', emoji: '😊', added_by: 'daddy', is_custom: false, has_message: true, has_voice: false },
  { mood: 'missing', label: 'دلتنگ', emoji: '🥺', added_by: 'daddy', is_custom: false, has_message: true, has_voice: false },
  { mood: 'tired', label: 'خسته', emoji: '😴', added_by: 'daddy', is_custom: false, has_message: true, has_voice: false },
]

const state = {
  items: [...BUILTINS],
  addCalls: 0,
  setCalls: 0,
  failSet: false,
}

g.fetch = async (url: string, opts: any = {}) => {
  const raw = String(url)
  const path = raw.replace(/^https?:\/\/[^/]+/, '')
  const method = (opts.method || 'GET').toUpperCase()
  const json = (d: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => d,
    text: async () => JSON.stringify(d),
    headers: { get: () => 'application/json' },
  })

  if (path.startsWith('/locales/')) {
    const lang = path.split('/')[2] === 'en' ? 'en' : 'fa'
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  if (path.endsWith('/api/moods/add')) {
    state.addCalls += 1
    const body = JSON.parse(opts.body || '{}')
    const item = {
      mood: `custom-${state.addCalls}`,
      label: body.label,
      emoji: body.emoji,
      added_by: 'daughter',
      is_custom: true,
      has_message: false,
      has_voice: false,
    }
    state.items.push(item)
    return json({ ok: true, item, message: 'حالت ساخته شد و به بابا خبر دادم ❤', voice: null })
  }
  if (path.endsWith('/api/moods/set')) {
    state.setCalls += 1
    if (state.failSet) return json({ ok: false, message: 'الان نشد حالت رو ثبت کنم' }, 503)
    const body = JSON.parse(opts.body || '{}')
    const found = state.items.find((m) => m.mood === body.mood)
    return json({ ok: true, mood: body.mood, label: found?.label || '', emoji: found?.emoji || '💗', message: `پیامِ بابا برای ${found?.label || ''}`, voice: null })
  }
  if (path.endsWith('/api/moods')) return json({ items: state.items })
  if (method !== 'GET') return json({ ok: true })
  return json({ items: [] })
}

const React = await import('react')
const { act } = React as any
const { createRoot } = await import('react-dom/client')
const { createElement: h } = React as any

const i18nModule = await import('../src/shared/i18n')
await i18nModule.i18nReady
await i18nModule.default.changeLanguage('fa')

const Mood = (await import('../src/apps/Mood')).default

async function mount(element: any) {
  const host = w.document.createElement('div')
  w.document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(element)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 280))
  })
  return { host, root }
}

const byText = (host: HTMLElement, text: string, tag = 'button') =>
  Array.from(host.querySelectorAll(tag)).find((b) => (b.textContent || '').includes(text))

async function click(el: Element | undefined | null, wait = 460) {
  if (!el) return false
  await act(async () => {
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, wait))
  })
  return true
}

/** تایپِ واقعیِ مرورگر: setter بومی + رویداد input */
async function type(input: Element | undefined | null, value: string) {
  if (!input) return
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value')?.set
    setter?.call(input, value)
    input.dispatchEvent(new w.Event('input', { bubbles: true }))
  })
}

console.log('🧪 آزمونِ حال دلم (حالِ تازه‌ی دخترم)')
const { host } = await mount(h(Mood))

check('حال‌های آماده با ایموجیِ سرور آمدند', (host.textContent || '').includes('😊') && (host.textContent || '').includes('خوشحال'))
check('دکمه‌ی «حال تازه» هست', (host.textContent || '').includes('یه حال تازه بساز'))

await click(byText(host, 'یه حال تازه بساز'))
check('فرمِ حالِ تازه باز شد', (host.textContent || '').includes('حال دلخواهِ خودت'))

const inputs = host.querySelectorAll('input')
await type(inputs[0], 'دلم هوای دریا داره')
await click(byText(host, '🌊') || host.querySelectorAll('button.os-chip')[0])
await type(host.querySelectorAll('input')[1], 'بابا کِی میریم؟')
await click(byText(host, 'بساز و به بابا بگو'), 600)

const afterAdd = host.textContent || ''
check('حالِ تازه به سرور رفت', state.addCalls === 1, String(state.addCalls))
check('تأییدِ ساختِ حال دیده می‌شود', afterAdd.includes('به بابا خبر دادم'))
check('حالِ تازه در فهرست ماند', afterAdd.includes('دلم هوای دریا داره'))
check('برچسبِ «حالِ خودم» خورده', afterAdd.includes('حالِ خودم'))

// انتخابِ همان حالِ تازه → پیامِ بابا نمایش داده می‌شود
await click(byText(host, 'دلم هوای دریا داره'), 600)
check('پیامِ سرور برای حالِ انتخابی نشان داده می‌شود', (host.textContent || '').includes('پیامِ بابا برای دلم هوای دریا داره'), (host.textContent || '').slice(-120))

// -------------------------------------------------------------- خطا ----- //
state.failSet = true
await click(byText(host, 'خوشحال'), 600)
const afterFail = host.textContent || ''
check('خطای سرور -> پیامِ روشن به‌جای سکوت', afterFail.includes('الان نشد حالت رو ثبت کنم'), afterFail.slice(-120))
check('دکمه‌ی تلاش دوباره هست', Boolean(byText(host, 'دوباره')) || Boolean(byText(host, 'تلاش')))

console.log(failCount === 0 ? '\n🎉 آزمونِ حال دلم پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
