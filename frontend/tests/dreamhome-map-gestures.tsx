/**
 * dreamhome-map-gestures.tsx — آزمون تفکیک «کلیک» از «جابه‌جایی» در تب نقشه‌ی خونه‌ی رویایی
 *
 * چیزی که کاربر گزارش کرده بود: «از همان لحظه که لمس اتاق شروع می‌شود حرکت
 * کردن فعال می‌شود». حالا باید این‌ها از هم جدا باشند:
 *   ۱) سوایپِ قبل از آماده‌شدن → هیچ (نه انتخاب، نه جابه‌جایی)
 *   ۲) ضربه‌ی ساده (حتی با کمی لغزش) → انتخاب اتاق و باز شدن پنل ویرایش
 *   ۳) اتاقِ انتخاب‌شده → کشیدنِ مستقیم جابه‌جایی می‌شود (فقط یک PATCH)
 *   ۴) نگه‌داشتن ~۳۵۰ms → حالت جابه‌جایی؛ کشیدن و رها کردن → یک PATCH
 * چون jsdom مستطیل المان‌ها را صفر می‌دهد، getBoundingClientRect بومِ نقشه
 * با مقدار واقعی پر می‌شود تا مختصات درست حساب شود.
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = dirname(dirname(fileURLToPath(import.meta.url)))
// باندل از tests/.build اجرا می‌شود؛ فایل‌های واقعی کنار سورسِ تست هستند
const publicDir = join(fixturesDir, '..', 'public')
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

/** درخواست‌های ثبت‌شده: «METHOD path» + بدنه‌ی JSON */
const requested: { method: string; path: string; body?: string }[] = []
const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string, opts: any = {}) => {
  const raw = String(url)
  const method = (opts.method || 'GET').toUpperCase()
  const path = raw.replace(/^https?:\/\/[^/]+/, '')
  requested.push({ method, path: path.split('?')[0], body: typeof opts.body === 'string' ? opts.body : undefined })

  if (path.startsWith('/locales/')) {
    const lang = path.split('/')[2]
    try {
      return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
    } catch {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
    }
  }

  // ثبت/ویرایش فقط «موفق» گزارش می‌شود؛ ادعای واقعی روی requested است
  if (method !== 'GET') return json({ ok: true })

  const exact = fixtures[path]
  if (exact) return json(exact)
  const base = path.split('?')[0]
  if (fixtures[base]) return json(fixtures[base])
  const dynamic = Object.keys(fixtures).find((k) => new RegExp('^' + k.replace(/\/\d+/g, '/\\d+') + '$').test(path))
  if (dynamic) return json(fixtures[dynamic])
  return json({ items: [], count: 0, item: null })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const React = await import('react')
const { createElement: h } = React
const i18nModule = await import('../src/shared/i18n')
await i18nModule.i18nReady
await i18nModule.default.changeLanguage('fa')

/* ---- مستطیل واقعی بوم نقشه (چیدمان: ۴۰۰×۳۰۰ در نقطه‌ی ۵۰،۱۰۰) ---- */
const CANVAS = { left: 50, top: 100, width: 400, height: 300 }
w.Element.prototype.getBoundingClientRect = function () {
  if ((this as any).hasAttribute?.('data-map-canvas')) {
    return { ...CANVAS, right: CANVAS.left + CANVAS.width, bottom: CANVAS.top + CANVAS.height, x: CANVAS.left, y: CANVAS.top, toJSON: () => ({}) }
  }
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
}

const dreamHome = (await import('../src/apps/DreamHome')).default
const container = w.document.getElementById('root')!
const root = createRoot(container)
await act(async () => { root.render(h(dreamHome)) })
await act(async () => { await new Promise((r) => setTimeout(r, 300)) })

const tick = async (ms: number) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }

/** رویداد اشاره‌گر می‌سازد (jsdom کلاس PointerEvent ندارد) */
function pointerEvent(type: string, x: number, y: number, pointerType = 'touch', pointerId = 7) {
  const e: any = new w.Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, { clientX: x, clientY: y, pointerId, pointerType, button: 0, buttons: 1, isPrimary: true })
  return e
}
const fire = async (target: any, e: any) => { await act(async () => { target.dispatchEvent(e) }) }
const fireWindow = async (e: any) => { await act(async () => { w.dispatchEvent(e) }) }

const byText = (tag: string, text: string) =>
  Array.from(container.querySelectorAll(tag)).find((b: any) => (b.textContent || '').includes(text))

const patchCalls = (room: number) => requested.filter((r) => r.method === 'PATCH' && r.path === `/api/home/rooms/${room}`)

console.log('\n🧪 آزمون ژست‌های تب نقشه‌ی خونه‌ی رویایی')

/* ورود به تب نقشه */
await act(async () => {
  const mapTab = byText('button', 'نقشه')
  mapTab?.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
})
await tick(450)
const roomBtn = (id: number) => container.querySelector(`[data-room-id="${id}"]`)
check('اتاق‌ها روی بوم رندر شدند', !!roomBtn(1) && !!roomBtn(2), `${container.querySelectorAll('[data-room-id]').length} اتاق`)
check('راهنمای جدید زیر نقشه دیده می‌شود', container.innerHTML.includes('یک بار روی اتاق بزن'))

/* -------------------------- ۱) سوایپِ قبل از آماده‌شدن = هیچ -------------------------- */
console.log('\n--- ۱) سوایپ (لمس + حرکت سریع + رها) ---')
{
  await fire(roomBtn(3), pointerEvent('pointerdown', 300, 150))
  await fireWindow(pointerEvent('pointermove', 340, 160))
  await tick(80) // کمتر از ۳۵۰ms
  await fireWindow(pointerEvent('pointerup', 340, 160))
  await tick(120)
  // پنل ویرایش = اینپوتی که اسم اتاق ۳ («اتاق من») داخلش است
  const editOpen = Array.from(container.querySelectorAll('input')).some((i: any) => i.value === 'اتاق من')
  check('سوایپ نه انتخاب می‌کند نه جابه‌جا', patchCalls(3).length === 0 && !editOpen)
  check('راهنمای حالت عادی مانده (چیزی انتخاب نشده)', container.innerHTML.includes('یک بار روی اتاق بزن'))
}

/* ---------------- ۲) ضربه‌ی ساده (با کمی لغزش) = انتخاب و پنل ویرایش ---------------- */
console.log('\n--- ۲) ضربه‌ی ساده = ویرایش ---')
{
  await fire(roomBtn(2), pointerEvent('pointerdown', 140, 150))
  await fireWindow(pointerEvent('pointermove', 143, 152)) // لغزش ناچیز زیر آستانه
  await tick(60)
  await fireWindow(pointerEvent('pointerup', 143, 152))
  // مرورگر بعد از pointerup رویداد click هم می‌فرستد — نباید انتخاب را دوباره عوض کند
  await fire(roomBtn(2), new w.MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }))
  await tick(420)
  const input = container.querySelector('.os-card .os-input') as HTMLInputElement | null
  check('با ضربه، پنل ویرایش باز شد', !!input)
  check('اسم اتاقِ انتخاب‌شده در پنل است', !!input && input.value === 'آشپزخانه', input?.value || '')
  check('ضربه هیچ درخواست جابه‌جایی نمی‌فرستد', patchCalls(2).length === 0)
  check('راهنمای حالت انتخاب دیده می‌شود', container.innerHTML.includes('این اتاق انتخابه'))
}

/* -------------------- ۳) اتاقِ انتخاب‌شده = کشیدنِ مستقیم -------------------- */
console.log('\n--- ۳) کشیدنِ مستقیمِ اتاق انتخاب‌شده ---')
{
  await fire(roomBtn(2), pointerEvent('pointerdown', 143, 152))
  await fireWindow(pointerEvent('pointermove', 200, 200))
  await tick(80)
  check('کشیدن اتاق انتخاب‌شده بلافاصله حالت جابه‌جایی می‌شود', container.innerHTML.includes('در حال جابه‌جایی'))
  await fireWindow(pointerEvent('pointermove', 250, 230))
  await fireWindow(pointerEvent('pointerup', 250, 230))
  await tick(500)
  const calls = patchCalls(2)
  check('بعد از رها فقط یک PATCH ذخیره شد', calls.length === 1, `${calls.length} درخواست`)
  // مختصات مورد انتظار: x=37، y=31 (محاسبه از مستطیل بوم ۴۰۰×۳۰۰)
  check(
    'مختصات نهایی درست است',
    calls.length === 1 && calls[0].body === JSON.stringify({ x: 37, y: 31 }),
    calls[0]?.body || '',
  )
}

/* ---------------------- ۴) نگه‌داشتن ~۳۵۰ms = حالت جابه‌جایی ---------------------- */
console.log('\n--- ۴) نگه‌داشتن و کشیدن ---')
{
  const before = patchCalls(1).length
  await fire(roomBtn(1), pointerEvent('pointerdown', 90, 150))
  await tick(120)
  check('قبل از آماده‌شدن، جابه‌جایی فعال نیست', !container.innerHTML.includes('در حال جابه‌جایی'))
  await tick(400) // جمعاً ~۵۲۰ms نگه‌داشتن
  check('با نگه‌داشتن، حالت جابه‌جایی فعال شد', container.innerHTML.includes('در حال جابه‌جایی'))
  await fireWindow(pointerEvent('pointermove', 300, 250))
  await fireWindow(pointerEvent('pointerup', 300, 250))
  await tick(500)
  const calls = patchCalls(1)
  check('با نگه‌داشتن و رها کردن فقط یک PATCH رفت', calls.length === before + 1, `${calls.length} درخواست`)
  // مختصات مورد انتظار: x=46، y=37
  check(
    'مختصات نهایی درست است',
    calls.length > 0 && calls[calls.length - 1].body === JSON.stringify({ x: 46, y: 37 }),
    calls[calls.length - 1]?.body || '',
  )
}

/* ------------ ۵) نگه‌داشتن و رها کردنِ بدون کشیدن = هیچ درخواستی نمی‌رود ------------ */
console.log('\n--- ۵) نگه‌داشتن بدون کشیدن ---')
{
  const before = patchCalls(4).length
  await fire(roomBtn(4), pointerEvent('pointerdown', 200, 220))
  await tick(520)
  check('حالت جابه‌جایی فعال شد', container.innerHTML.includes('در حال جابه‌جایی'))
  await fireWindow(pointerEvent('pointerup', 202, 221)) // بدون کشیدن
  await tick(300)
  check('بدون کشیدن، هیچ PATCH ذخیره نمی‌شود', patchCalls(4).length === before, `${patchCalls(4).length} درخواست`)
}

console.log(`\n${failCount === 0 ? '✅ همه' : '❌ بعضی'} از آزمون‌های نقشه‌ی خونه‌ی رویایی پاس شدند${failCount ? ` (${failCount} خطا)` : ''}`)
process.exit(failCount === 0 ? 0 : 1)
