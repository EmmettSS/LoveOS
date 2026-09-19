/**
 * starmap-broken-stars.tsx — آزمون پایداری آسمان در برابر داده‌ی خراب
 *
 * ردیف‌های قدیمی دیتابیس ممکن است stars غیرمعمول داشته باشند (رشته، آرایه‌ی
 * تخت، خالی، NaN، بی‌نهایت، null). این تست قفل می‌کند که در همه‌ی این حالت‌ها:
 *   ۱) بدون هیچ خطای کنسولی رندر شود
 *   ۲) هر ۸ صورت فلکی (گروه <g>) با برچسب‌هایشان باشند
 *   ۳) هیچ مختصات NaN/Infinity وارد SVG نشود
 *   ۴) زدن روی صورتِ خراب هم پیام همان صورت را نشان دهد
 *   ۵) اگر هیچ صورتی ستاره‌ی سالم نداشت، راهنمای «با بابا چک کن» دیده شود
 *   ۶) تابع خالص sanitizeStars ورودی‌های خراب را درست فیلتر کند
 */
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:5173/',
})
const w: any = dom.window
const g = globalThis as any
g.window = w
g.document = w.document
Object.defineProperty(g, 'navigator', { value: w.navigator, configurable: true })
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'SVGElement', 'File', 'Blob', 'FormData', 'PointerEvent'])
  g[k] = (w as any)[k]
g.localStorage = w.localStorage
g.requestAnimationFrame = w.requestAnimationFrame.bind(w)
g.cancelAnimationFrame = w.cancelAnimationFrame.bind(w)
g.getComputedStyle = w.getComputedStyle.bind(w)
g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
w.matchMedia = g.matchMedia
g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
// ResizeObserverِ واقع‌گرا: به محض اتصال، با ابعاد ساختگیِ یک موبایل گزارش می‌دهد
g.ResizeObserver = class {
  cb: () => void
  constructor(cb: () => void) { this.cb = cb }
  observe(el: HTMLElement) {
    Object.defineProperty(el, 'clientWidth', { value: 390, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 620, configurable: true })
    this.cb()
  }
  unobserve() {}
  disconnect() {}
}
g.IS_REACT_ACT_ENVIRONMENT = true

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

// هشت صورت فلکی با stars خراب به شکل‌های مختلف + یک سالم وسطشان
const BROKEN = {
  items: [
    { id: 1, letter: 'M', order: 0, message: 'M — پیام صورت اول.', stars: 'oops-not-an-array' },
    { id: 2, letter: 'A', order: 1, message: 'A — پیام صورت دوم.', stars: [0, 1, 2, 3] },
    { id: 3, letter: 'R', order: 2, message: 'R — پیام صورت سوم.', stars: [] },
    { id: 4, letter: 'Y', order: 3, message: 'Y — پیام صورت چهارم.', stars: [[NaN, 0.5], [0.2, Infinity], ['x', 'y']] },
    { id: 5, letter: 'A', order: 4, message: 'A — صورت سالم وسط.', stars: [[0, 0], [0.5, 1], [1, 0]] },
    { id: 6, letter: 'M', order: 5, message: 'M — پیام صورت ششم.', stars: null },
    { id: 7, letter: '❤', order: 6, message: '❤ — پیام قلب.', stars: [[0.5], [0.1, 0.2, 0.3], {}] },
    { id: 8, letter: '♾', order: 7, message: '♾ — پیام ابدیت.', stars: undefined },
  ],
}

// همه خراب — باید راهنمای «با بابا چک کن» دیده شود
const ALL_BROKEN = {
  items: BROKEN.items.map((c) => (c.id === 5 ? { ...c, stars: 'nope' } : c)),
}

let payload: unknown = BROKEN
const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  if (path.startsWith('/locales/fa')) return json({})
  if (path === '/api/starmap') return json(payload)
  return json({ ok: true, found: false })
}

const consoleErrors: string[] = []
const origError = console.error
console.error = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (!msg.includes('not wrapped in act')) consoleErrors.push(msg)
  origError(...args)
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createElement: h } = await import('react')
const { default: Starmap } = await import('../src/apps/Starmap')
const { sanitizeStars } = await import('../src/apps/starmapStars')

console.log('\n=== ۰) تابع خالص sanitizeStars ===')
check('رشته → خالی', sanitizeStars('oops').length === 0)
check('null/undefined → خالی', sanitizeStars(null).length === 0 && sanitizeStars(undefined).length === 0)
check('آرایه‌ی تخت → خالی', sanitizeStars([0, 1, 2, 3]).length === 0)
check('خالی → خالی', sanitizeStars([]).length === 0)
check('NaN/Infinity/رشته حذف می‌شوند', sanitizeStars([[NaN, 0.5], [0.2, Infinity], ['x', 'y']]).length === 0)
check('جفت ناقص/اضافی حذف می‌شود', sanitizeStars([[0.5], [0.1, 0.2, 0.3], [{} as never, 1]]).length === 0)
check('جفت سالم می‌ماند', JSON.stringify(sanitizeStars([[0, 0], [0.5, 1]])) === '[[0,0],[0.5,1]]')
check(
  'ترکیب خراب و سالم فقط سالم را نگه می‌دارد',
  JSON.stringify(sanitizeStars([[0, 1], 'x', [NaN, 1], [2, 3]])) === '[[0,1],[2,3]]',
)

console.log('\n=== ۱) آسمان با stars خراب (هفت خراب + یک سالم) ===')
const rootEl = document.getElementById('root')!
const root = createRoot(rootEl)
await act(async () => { root.render(h(Starmap)) })
await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

check('بدون هیچ خطای کنسولی رندر شد', consoleErrors.length === 0, consoleErrors[0] || '')

const sky = rootEl.firstElementChild as HTMLElement
check('کادر آسمان رندر شد', !!sky)
const svg = rootEl.querySelector('svg')
check('SVG آسمان رندر شد', !!svg)

const groups = Array.from(rootEl.querySelectorAll('svg > g'))
check('هر ۸ صورت فلکی (حتی خراب‌ها) گروه خود را دارند', groups.length === 8, `count=${groups.length}`)

const texts = Array.from(rootEl.querySelectorAll('svg text')).map((el) => el.textContent)
for (const label of ['M', 'A', 'R', 'Y', '❤', '♾']) {
  check(`برچسب ${label} روی آسمان هست`, texts.includes(label))
}

const svgHtml = svg?.outerHTML || ''
check('هیچ NaN وارد SVG نشد', !svgHtml.includes('NaN'))
check('هیچ Infinity وارد SVG نشد', !svgHtml.includes('Infinity'))

// صورت سالم (پنجمین گروه) خط و ستاره دارد؛ خراب‌ها فقط برچسب‌اند
check('صورت سالم polyline دارد', groups[4].querySelector('polyline') !== null)
check('صورت سالم ستاره دارد', groups[4].querySelectorAll('circle').length >= 3)
check('صورت خرابِ اول polyline ندارد', groups[0].querySelector('polyline') === null)
check('چون یک صورت سالم هست، راهنمای نقص دیده نمی‌شود', !rootEl.textContent!.includes('با بابا چک کن'))

// زدن روی صورت خراب هم باید پیام همان صورت را نشان دهد (نه کرش، نه سکوت)
await act(async () => { (groups[0] as unknown as HTMLElement).dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
check('با زدن روی صورت خراب، پیامش نمایش داده شد', rootEl.textContent!.includes('پیام صورت اول'))

await act(async () => { root.unmount() })

console.log('\n=== ۲) آسمان با همه‌ی صورت‌ها خراب ===')
payload = ALL_BROKEN
const host2 = w.document.createElement('div')
w.document.body.appendChild(host2)
const root2 = createRoot(host2)
await act(async () => { root2.render(h(Starmap)) })
await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

check('هنوز بدون خطای کنسول است', consoleErrors.length === 0, consoleErrors[0] || '')
check('هر ۸ گروه هنوز رندر شدند', host2.querySelectorAll('svg > g').length === 8)
check(
  'برچسب‌ها هنوز هستند',
  ['M', '❤', '♾'].every((l) => Array.from(host2.querySelectorAll('svg text')).some((el) => el.textContent === l)),
)
check('راهنمای «با بابا چک کن» دیده می‌شود', host2.textContent!.includes('داده‌ی چند صورت فلکی ناقص است؛ با بابا چک کن'))
check('هیچ polylineای رندر نشده', host2.querySelectorAll('polyline').length === 0)

// زدن روی ❤یِ خراب → پیامش
const g7 = host2.querySelectorAll('svg > g')[6] as unknown as HTMLElement
await act(async () => { g7.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
check('پیام ❤ی خراب هم باز می‌شود', host2.textContent!.includes('پیام قلب'))

await act(async () => { root2.unmount() })
console.log(failCount === 0 ? '\n🎉 آزمون پایداری آسمان پاس شد' : `\n💥 ${failCount} مورد شکست`)
process.exit(failCount === 0 ? 0 : 1)
