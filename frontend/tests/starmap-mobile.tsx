/**
 * starmap-mobile.tsx — آزمون چیدمان دو ردیفی و «سینمای تمام‌صفحه‌ی موبایل» آسمان ستاره‌ها
 *
 *   ۰) ریاضی خالص چیدمان (starmapLayout.ts): تقسیم ردیف‌ها، بزرگ‌تر بودن ردیف نمادها،
 *      نداشتن هم‌پوشانی، مقیاس درست روی موبایل افقی، آینه شدن در راست‌به‌چپ، تشخیص جهت
 *   ۱) موبایلِ عمودی: آسمان با portal روی body می‌نشیند، ۹۰ درجه می‌چرخد و دکمه‌ی ✕
 *      پنجره‌ی اپ را می‌بندد
 *   ۲) چرخش خودکار (مرورگر افقی): بدون چرخش اضافه
 *   ۳) پنجره‌ی دیگری روی آسمان → لایه‌ی تمام‌صفحه کنار می‌رود؛ دسکتاپ → بدون portal
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
// ResizeObserverِ واقع‌گرا: قابِ چرخیده به اندازه‌ی (ارتفاع×پهنای) گوشی گزارش می‌شود
g.ResizeObserver = class {
  cb: () => void
  constructor(cb: () => void) { this.cb = cb }
  observe(el: HTMLElement) {
    Object.defineProperty(el, 'clientWidth', { value: 844, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 390, configurable: true })
    this.cb()
  }
  unobserve() {}
  disconnect() {}
}
// jsdom بوم canvas ندارد؛ پس‌زمینه‌ی سینمایی باید بی‌سروصدا از آن بگذرد
w.HTMLCanvasElement.prototype.getContext = () => null
g.IS_REACT_ACT_ENVIRONMENT = true

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

const setViewport = (width: number, height: number) => {
  w.innerWidth = width
  w.innerHeight = height
}

const STARMAP = {
  items: [
    { id: 1, letter: 'M', order: 0, message: 'M — مریمِ من.', stars: [[0, 0], [0, 1], [0.5, 0.5], [1, 1], [1, 0]] },
    { id: 2, letter: 'A', order: 1, message: 'A — آرامش.', stars: [[0, 0], [0.25, 1], [0.75, 1], [1, 0]] },
    { id: 3, letter: 'R', order: 2, message: 'R — رویا.', stars: [[0, 0], [0, 1], [0.8, 1], [0.8, 0.55], [0, 0.5], [0.9, 0]] },
    { id: 4, letter: 'Y', order: 3, message: 'Y — یاد.', stars: [[0, 1], [0.5, 0.5], [1, 1], [0.5, 0]] },
    { id: 5, letter: 'A', order: 4, message: 'A — امید.', stars: [[0, 0], [0.25, 1], [0.75, 1], [1, 0]] },
    { id: 6, letter: 'M', order: 5, message: 'M — موندنی.', stars: [[0, 0], [0, 1], [0.5, 0.5], [1, 1], [1, 0]] },
    { id: 7, letter: '❤', order: 6, message: '❤ — قلبی که فقط برای تو می‌تپه.', stars: [[0.5, 0.76], [0.76, 1], [1, 0.58], [0.5, 0], [0, 0.58], [0.24, 1], [0.5, 0.76]] },
    { id: 8, letter: '♾', order: 7, message: '♾ — نه اول داره، نه آخر.', stars: [[1, 0.5], [0.5, 0.5], [0, 0.5], [0.5, 0.5], [1, 0.5]] },
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
const { useOS } = await import('../src/shared/store')
const { splitRows, layoutSky, resolveSkyMode, isSymbol, SYMBOL_SCALE } = await import('../src/apps/starmapLayout')

// ---------------------------------------------------------------- ۰) ریاضی چیدمان
console.log('\n=== ۰) چیدمان دو ردیفی (starmapLayout) ===')
const rows = splitRows(STARMAP.items)
check('حروف اسم در ردیف اول و نمادها در ردیف دوم', rows.length === 2 && rows[0].length === 6 && rows[1].length === 2)
check('ترتیب حروف حفظ می‌شود', rows[0].map((c) => c.letter).join('') === 'MARYAM' && rows[1].map((c) => c.letter).join('') === '❤♾')
check('حروف فارسی هم «حرف» حساب می‌شوند', !isSymbol('م') && !isSymbol('A') && isSymbol('❤') && isSymbol('♾') && isSymbol('💖'))
check('آسمانِ فقط-حرف یک ردیف دارد', splitRows(STARMAP.items.slice(0, 6)).length === 1)

// موبایل افقی (۸۴۴×۳۹۰)
const mobileL = layoutSky({ w: 844, h: 390, rows: [6, 2], symbolRow: 1, padTop: 44, padBottom: 48 })
const r1 = mobileL.slots[0]
const r2 = mobileL.slots[1]
check('موبایل افقی: حروف دست‌کم ۹۰px هستند (قبلاً ~۴۲px)', mobileL.cell >= 90, `cell=${mobileL.cell.toFixed(1)}`)
check('ردیف نمادها ۱.۳ برابر حروف است', Math.abs(r2[0].cell / r1[0].cell - SYMBOL_SCALE) < 1e-6)
check('حروف با هم هم‌پوشانی ندارند', r1.every((s, i) => i === 0 || s.cx - r1[i - 1].cx >= s.cell - 1e-6))
check('دو ردیف روی هم نمی‌افتند', r1[0].labelY < r2[0].cy - r2[0].cell / 2)
check('همه‌چیز داخل کادر است', [...r1, ...r2].every((s) => s.cx - s.cell / 2 >= 0 && s.cx + s.cell / 2 <= 844 && s.cy - s.cell / 2 >= 0 && s.labelY <= 390))
check('ردیف نمادها وسط‌چین است', Math.abs((r2[0].cx + r2[1].cx) / 2 - 422) < 1e-6)
check('ردیف حروف وسط‌چین است', Math.abs((r1[0].cx + r1[5].cx) / 2 - 422) < 1e-6)

// راست‌به‌چپ: حرف اول سمت راست
const rtl = layoutSky({ w: 844, h: 390, rows: [6, 2], symbolRow: 1, rtl: true })
check('چیدمان راست‌به‌چپ آینه می‌شود', rtl.slots[0][0].cx > rtl.slots[0][5].cx && rtl.slots[1][0].cx > rtl.slots[1][1].cx)

// دسکتاپ و پنجره‌ی خیلی کوچک
const desk = layoutSky({ w: 728, h: 528, rows: [6, 2], symbolRow: 1 })
check('دسکتاپ: حروف بزرگ‌تر از ۹۵px', desk.cell >= 95, `cell=${desk.cell.toFixed(1)}`)
const tiny = layoutSky({ w: 320, h: 200, rows: [6, 2], symbolRow: 1 })
check('پنجره‌ی خیلی کوچک هم بدون NaN چیده می‌شود', tiny.cell >= 28 && tiny.slots.flat().every((s) => Number.isFinite(s.cx) && Number.isFinite(s.cy)))
const zero = layoutSky({ w: 0, h: 0, rows: [6, 2], symbolRow: 1 })
check('کادر اندازه‌گیری‌نشده → بدون خطا و بدون جایگاه', zero.cell === 0 && zero.slots.every((r) => r.length === 0))

check('۳۹۰×۸۴۴ → موبایل و چرخیده', JSON.stringify(resolveSkyMode(390, 844)) === '{"mobile":true,"rotated":true}')
check('۸۴۴×۳۹۰ → موبایل، بدون چرخش', JSON.stringify(resolveSkyMode(844, 390)) === '{"mobile":true,"rotated":false}')
check('۱۲۸۰×۸۰۰ → دسکتاپ', JSON.stringify(resolveSkyMode(1280, 800)) === '{"mobile":false,"rotated":false}')

// ---------------------------------------------------------------- ۱) موبایل عمودی
console.log('\n=== ۱) موبایل عمودی: سینمای تمام‌صفحه‌ی چرخیده ===')
setViewport(390, 844)
useOS.getState().openApp('starmap')
check('پنجره‌ی آسمان باز است', useOS.getState().windows.some((x) => x.app === 'starmap'))

const rootEl = document.getElementById('root')!
const root = createRoot(rootEl)
await act(async () => { root.render(h(Starmap)) })
await act(async () => { await new Promise((r) => setTimeout(r, 80)) })

check('بدون هیچ خطای کنسولی رندر شد', consoleErrors.length === 0, consoleErrors[0] || '')
let overlay = document.body.querySelector('[data-starmap-overlay]') as HTMLElement | null
check('لایه‌ی تمام‌صفحه با portal روی body نشست (نه داخل بدنه‌ی پنجره)', !!overlay && !rootEl.contains(overlay))
check('حالت «چرخیده» است', overlay?.getAttribute('data-starmap-overlay') === 'rotated')
check('بالای داک (z-50) است', !!overlay && Number(overlay.style.zIndex) >= 60, `z=${overlay?.style.zIndex}`)
const frame = overlay?.firstElementChild as HTMLElement | null
check('قاب ۹۰ درجه چرخیده', !!frame && frame.style.transform.includes('rotate(90deg)'))
check('قاب به اندازه‌ی ارتفاع×پهنای گوشی است', !!frame && frame.style.width === '844px' && frame.style.height === '390px')
check('هشت صورت فلکی داخل قاب هستند', overlay?.querySelectorAll('svg > g').length === 8)
check('راهنمای «گوشی رو بچرخون» دیده می‌شود', !!overlay?.textContent?.includes('starmap.rotateHint'))

// زدن روی ❤ → پیامش در نوار پایین
const heart = overlay!.querySelectorAll('svg > g')[6] as unknown as HTMLElement
await act(async () => { heart.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
check('با زدن روی ❤ پیامش نمایش داده شد', !!overlay!.textContent!.includes('قلبی که فقط برای تو می‌تپه'))
// لمس آسمان پیام را می‌بندد (نوار می‌ماند ولی نامرئی و غیرقابل لمس)
const strip = overlay!.querySelector('[role="status"]') as HTMLElement
await act(async () => { frame!.firstElementChild!.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
check('لمس آسمان پیام را می‌بندد', strip.getAttribute('aria-hidden') === 'true' && strip.style.pointerEvents === 'none')

// ---------------------------------------------------------------- ۲) چرخش خودکار
console.log('\n=== ۲) مرورگر خودش افقی است → بدون چرخش اضافه ===')
setViewport(844, 390)
await act(async () => { w.dispatchEvent(new w.Event('resize')) })
overlay = document.body.querySelector('[data-starmap-overlay]') as HTMLElement | null
check('حالت «افقی» بدون چرخش', overlay?.getAttribute('data-starmap-overlay') === 'landscape')
check('قاب دیگر transform ندارد', !(overlay?.firstElementChild as HTMLElement)?.style.transform)
// راهنما با انیمیشن محو می‌شود؛ کمی صبر تا از DOM برود
await act(async () => { await new Promise((r) => setTimeout(r, 700)) })
check('راهنمای چرخاندن دیده نمی‌شود', !overlay?.textContent?.includes('starmap.rotateHint'))

// ---------------------------------------------------------------- ۳) پنجره‌ی دیگر روی آسمان / دسکتاپ
console.log('\n=== ۳) هم‌زیستی با پنجره‌های دیگر و دسکتاپ ===')
await act(async () => { useOS.getState().openApp('chat') })
await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
check('وقتی اپ دیگری روی آسمان باز شد، لایه‌ی تمام‌صفحه کنار می‌رود', !document.body.querySelector('[data-starmap-overlay]'))
await act(async () => { useOS.getState().closeAppByKey('chat') })
await act(async () => { await new Promise((r) => setTimeout(r, 30)) })
overlay = document.body.querySelector('[data-starmap-overlay]') as HTMLElement | null
check('با بسته شدن آن اپ، آسمان برمی‌گردد', !!overlay)

// دکمه‌ی ✕ پنجره‌ی آسمان را می‌بندد (t بدون i18n همان کلید را برمی‌گرداند)
const closeBtn = overlay!.querySelector('button[aria-label="os.close"]') as HTMLButtonElement
check('دکمه‌ی ✕ شناور هست', !!closeBtn)
await act(async () => { closeBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
check('✕ پنجره‌ی آسمان را از مدیر پنجره بست', !useOS.getState().windows.some((x) => x.app === 'starmap'))

// دسکتاپ: هیچ portalای نیست، آسمان داخل خودِ پنجره است
setViewport(1280, 800)
await act(async () => { w.dispatchEvent(new w.Event('resize')) })
check('دسکتاپ: لایه‌ی تمام‌صفحه نیست', !document.body.querySelector('[data-starmap-overlay]'))
check('دسکتاپ: آسمان داخل بدنه‌ی پنجره با مارجین منفی است', (rootEl.firstElementChild as HTMLElement)?.className.includes('-m-4'))
check('دسکتاپ: دکمه‌ی ✕ شناور ندارد (هدر پنجره هست)', !rootEl.querySelector('button[aria-label="os.close"]:not([class*="p-1.5"])'))

check('در کل جریان هیچ خطای کنسولی نبود', consoleErrors.length === 0, consoleErrors[0] || '')

await act(async () => { root.unmount() })
console.log(failCount === 0 ? '\n🎉 آزمون موبایل/چیدمان آسمان پاس شد' : `\n💥 ${failCount} مورد شکست`)
process.exit(failCount === 0 ? 0 : 1)
