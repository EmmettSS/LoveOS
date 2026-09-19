/**
 * starmap-sky.tsx — آزمون دودِ اپ آسمان ستاره‌ها
 * با «پاسخ واقعی بک‌اند» (هشت صورت فلکی: حروف اسم + قلب ❤ و ابدیت ♾) اپ را در jsdom
 * بالا می‌آورد و این‌ها را می‌سنجد:
 *   ۱) بدون هیچ خطای کنسولی رندر شود
 *   ۲) آسمان با مارجین منفیِ پدینگِ پنجره، لبه‌به‌لبه شود (تمام‌صفحه)
 *   ۳) بعد از «اندازه‌گیری» کادر، هشت صورت فلکی با ستاره‌هایشان پهنای آسمان را پر کنند
 *   ۴) با زدن روی ❤، پیام همان صورت فلکی نمایش داده شود
 *   ۵) چیپِ «کل اسم» همه‌ی صورت‌های فلکی را روشن کند
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

// پاسخ واقعی بک‌اند بعد از seed_loveos (حروف + دو صورت فلکی تازه)
const STARMAP = {
  items: [
    { id: 1, letter: 'M', order: 0, message: 'M — مریمِ من، اولین و آخرین حرف قلبم.', stars: [[0, 0], [0, 1], [0.5, 0.5], [1, 1], [1, 0]] },
    { id: 2, letter: 'A', order: 1, message: 'A — آرامشی که با تو اومد.', stars: [[0, 0], [0.25, 1], [0.75, 1], [1, 0], [0.2, 0.45], [0.8, 0.45]] },
    { id: 3, letter: 'R', order: 2, message: 'R — رویاهایی که با هم می‌سازیم.', stars: [[0, 0], [0, 1], [0.8, 1], [0.8, 0.55], [0, 0.5], [0.9, 0]] },
    { id: 4, letter: 'Y', order: 3, message: 'Y — یادت که همیشه با منه.', stars: [[0, 1], [0.5, 0.5], [1, 1], [0.5, 0]] },
    { id: 5, letter: 'A', order: 4, message: 'A — امیدی که تو بهم دادی.', stars: [[0, 0], [0.25, 1], [0.75, 1], [1, 0], [0.2, 0.45], [0.8, 0.45]] },
    { id: 6, letter: 'M', order: 5, message: 'M — موندنی‌ترین اتفاق زندگی من.', stars: [[0, 0], [0, 1], [0.5, 0.5], [1, 1], [1, 0]] },
    {
      id: 7, letter: '❤', order: 6, message: '❤ — قلبی که فقط برای تو می‌تپه.', stars: [
        [0.5, 0.761], [0.544, 0.877], [0.758, 1.0], [1.0, 0.865], [1.0, 0.579],
        [0.758, 0.315], [0.544, 0.098], [0.5, 0.0], [0.456, 0.098], [0.242, 0.315],
        [0.0, 0.579], [0.0, 0.865], [0.242, 1.0], [0.456, 0.877], [0.5, 0.761],
      ],
    },
    {
      id: 8, letter: '♾', order: 7, message: '♾ — عشق ما نه اول داره، نه آخر.', stars: [
        [1.0, 0.5], [0.962, 0.677], [0.854, 0.75], [0.691, 0.677], [0.5, 0.5],
        [0.309, 0.323], [0.146, 0.25], [0.038, 0.323], [0.0, 0.5], [0.038, 0.677],
        [0.146, 0.75], [0.309, 0.677], [0.5, 0.5], [0.691, 0.323], [0.854, 0.25],
        [0.962, 0.323], [1.0, 0.5],
      ],
    },
  ],
}

const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  if (path.startsWith('/locales/fa')) return json({})
  if (path === '/api/starmap') return json(STARMAP)
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

console.log('\n=== آسمان ستاره‌ها: تمام‌صفحه + صورت‌های فلکی تازه ===')
const rootEl = document.getElementById('root')!
const root = createRoot(rootEl)
await act(async () => { root.render(h(Starmap)) })
await act(async () => { await new Promise((r) => setTimeout(r, 60)) })

check('بدون هیچ خطای کنسولی رندر شد', consoleErrors.length === 0, consoleErrors[0] || '')

const sky = rootEl.firstElementChild as HTMLElement
check('کادر آسمان رندر شد', !!sky)
// مارجین منفی که پدینگِ بدنه‌ی پنجره را خنثی می‌کند تا آسمان لبه‌به‌لبه شود
check('آسمان با مارجین منفی لبه‌به‌لبه است', !!sky && sky.className.includes('-m-4') && sky.className.includes('-mb-28'))
check('ارتفاع آسمان کل بدنه‌ی پنجره را می‌گیرد', !!sky && sky.className.includes('h-[calc(100%+8rem)]'))

const svg = rootEl.querySelector('svg')
check('SVG آسمان بعد از اندازه‌گیری رندر شد', !!svg)
check('SVG به ابعاد واقعی آسمان است', svg?.getAttribute('width') === '390' && svg?.getAttribute('height') === '620')

const groups = Array.from(rootEl.querySelectorAll('svg > g'))
check('هشت صورت فلکی (۶ حرف + ❤ + ♾) رندر شدند', groups.length === 8, `count=${groups.length}`)

// قلب: ۱۵ ستاره (مسیر بسته تا نقطه‌ی اول) و ابدیت: ۱۷ ستاره
const circleCount = (gEl: Element) => gEl.querySelectorAll('circle').length
check('قلب ❤ پانزده ستاره‌ی مسیرش رندر شد', circleCount(groups[6]) >= 15, `circles=${circleCount(groups[6])}`)
check('ابدیت ♾ هفده ستاره‌ی مسیرش رندر شد', circleCount(groups[7]) >= 17, `circles=${circleCount(groups[7])}`)

// برچسب‌های زیر صورت‌های فلکی
const texts = Array.from(rootEl.querySelectorAll('svg text')).map((el) => el.textContent)
check('برچسب ❤ روی آسمان هست', texts.includes('❤'))
check('برچسب ♾ روی آسمان هست', texts.includes('♾'))

// عناصر شناور روی آسمان
const caption = rootEl.querySelector('p.absolute') as HTMLElement
check('متن راهنما به‌صورت شناور روی آسمان است', !!caption && caption.className.includes('absolute'))

// چهارم: زدن روی ❤ → پیامش نمایش داده شود
await act(async () => { (groups[6] as unknown as HTMLElement).dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
check('با زدن روی ❤ پیامش نمایش داده شد', rootEl.textContent!.includes('قلبی که فقط برای تو می‌تپه'))

// پنجم: چیپ «کل اسم» همه را روشن می‌کند
const fullBtn = Array.from(rootEl.querySelectorAll('button')).find((b) => b.className.includes('os-chip')) as HTMLButtonElement
check('چیپ روشن‌کردنِ کل اسم هست', !!fullBtn)
await act(async () => { fullBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
check('چیپ کل اسم فعال شد', fullBtn.className.includes('os-chip-active'))

// تغییر چیدمان راست‌به‌چپ کرش نکند
const layoutBtn = Array.from(rootEl.querySelectorAll('button')).find((b) => b !== fullBtn && b.className.includes('os-chip')) as HTMLButtonElement
await act(async () => { layoutBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
check('تغییر چیدمان راست‌به‌چپ/چپ‌به‌راست بدون خطا کار کرد', rootEl.querySelectorAll('svg > g').length === 8)

await act(async () => { root.unmount() })
console.log(failCount === 0 ? '\n🎉 آزمون آسمان ستاره‌ها پاس شد' : `\n💥 ${failCount} مورد شکست`)
process.exit(failCount === 0 ? 0 : 1)
