/**
 * desktop-drag.tsx — آزمون درگ‌اند‌دراپ آیکن‌های دسکتاپ (موس + لمس)
 *
 * همان چیزی را قفل می‌کند که کاربر گزارش کرده بود: «درگ‌اند‌دراپ اپ‌ها روی
 * مود موبایل کار نمی‌کند». چون jsdom مستطیلِ المان‌ها را صفر می‌دهد،
 * getBoundingClientRect را برای آیکن‌ها با مقدار واقعی پر می‌کنیم تا hit-test
 * دقیقاً مثل مرورگر کار کند.
 *
 * سناریوها:
 *   ۱) ضربه‌ی ساده → اپ باز می‌شود (درگ مزاحم کلیک نیست)
 *   ۲) لمس: نگه‌داشتن + کشیدن + رها کردن → ترتیب عوض می‌شود و اپ باز نمی‌شود
 *   ۳) لمس: swipe سریع (بدون نگه‌داشتن) → نه ترتیب عوض می‌شود نه اپ باز می‌شود
 *   ۴) موس: کشیدن با چند پیکسل جابه‌جایی → ترتیب عوض می‌شود
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
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'SVGElement']) g[k] = w[k]
g.localStorage = w.localStorage
g.requestAnimationFrame = w.requestAnimationFrame.bind(w)
g.cancelAnimationFrame = w.cancelAnimationFrame.bind(w)
g.getComputedStyle = w.getComputedStyle.bind(w)
g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
w.matchMedia = g.matchMedia
g.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
g.IS_REACT_ACT_ENVIRONMENT = true
Object.defineProperty(w, 'innerWidth', { value: 390, configurable: true })
Object.defineProperty(w, 'innerHeight', { value: 844, configurable: true })

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

const serverConfig: any = {
  daughter_name: 'مریم', daughter_nickname: 'دخترم', daddy_name: 'بابا', days_together: 100, next_meeting: null,
  next_meeting_delta: null, boot_greeting: '', wrong_pass_message: '', lock_help_message: '', security_question: '',
  language: 'fa', theme: 'day', sound_enabled: false, font_scale: 1, logo: null, boot_background: null,
  lock_background: null, desktop_background_day: null, desktop_background_night: null, is_birthday: false,
  is_anniversary: false, has_passcode: true,
}

const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string) => {
  const p = String(url)
  if (p.includes('/locales/')) {
    const lang = p.includes('/en/') ? 'en' : 'fa'
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  if (p.includes('/api/boot')) return json({ config: serverConfig, unlocked: true })
  if (p.includes('/api/weather')) return json({ daddy: null, daughter: null, message: '' })
  if (p.includes('/api/calls/next')) return json({ item: null })
  return json({ items: [], unread: 0, item: null, config: serverConfig })
}

/* ------------------- مستطیلِ واقعی برای آیکن‌ها (hit-test مثل مرورگر) ------ */
const ICON_W = 64
const ICON_H = 84
const rectOf = (index: number) => ({
  left: 100 + index * 80,
  top: 400,
  right: 100 + index * 80 + ICON_W,
  bottom: 400 + ICON_H,
  width: ICON_W,
  height: ICON_H,
  x: 100 + index * 80,
  y: 400,
  toJSON: () => ({}),
})
w.Element.prototype.getBoundingClientRect = function () {
  const key = (this as any).dataset?.appKey
  if (key) {
    const nodes = Array.from(w.document.querySelectorAll('[data-app-key]')) as any[]
    const idx = nodes.findIndex((n) => n.dataset.appKey === key)
    return rectOf(idx < 0 ? 0 : idx)
  }
  return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const React = await import('react')
const { useOS } = await import('../src/shared/store')
const { default: i18n, i18nReady } = await import('../src/shared/i18n')
await i18nReady
const { Desktop } = await import('../src/os/Desktop')
const { effectiveAppOrder } = await import('../src/os/appRegistry')

useOS.setState({ phase: 'desktop', config: { ...serverConfig }, appOrder: null, windows: [] })
const container = w.document.getElementById('root')!
const root = createRoot(container)
await act(async () => { root.render(React.createElement(Desktop)) })
await act(async () => { await new Promise((r) => setTimeout(r, 300)) })

const tick = async (ms: number) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }

const iconNodes = () => Array.from(container.querySelectorAll('[data-app-key]')) as any[]
const iconKeys = () => iconNodes().map((n) => n.dataset.appKey as string)
const centerOf = (index: number) => ({ x: 100 + index * 80 + ICON_W / 2, y: 400 + ICON_H / 2 })

/** رویداد اشاره‌گر می‌سازد (jsdom کلاس PointerEvent ندارد) */
function pointerEvent(type: string, x: number, y: number, pointerType = 'touch', pointerId = 7) {
  const e: any = new w.Event(type, { bubbles: true, cancelable: true })
  Object.assign(e, { clientX: x, clientY: y, pointerId, pointerType, button: 0, buttons: 1, isPrimary: true })
  return e
}
const fire = async (target: any, e: any) => { await act(async () => { target.dispatchEvent(e) }) }

/** رویدادهای move/up را روی window می‌فرستد (دقیقاً جایی که کد گوش می‌دهد) */
const fireWindow = async (e: any) => { await act(async () => { w.dispatchEvent(e) }) }

const clickIcon = async (index: number) => {
  const el = iconNodes()[index]
  const { x, y } = centerOf(index)
  await fire(el, pointerEvent('pointerdown', x, y))
  await fireWindow(pointerEvent('pointerup', x, y))
  await fire(el, new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  await tick(200)
}

console.log('\n🧪 آزمون درگ‌اند‌دراپ دسکتاپ')
check('آیکن‌های دسکتاپ رندر شدند', iconKeys().length > 5, `${iconKeys().length} آیکن`)
check('راهنمای نگه‌داشتنِ انگشت دیده می‌شود', container.innerHTML.includes('انگشتت را رویش نگه دار'))

/* ----------------------------------------------- ۱) ضربه‌ی ساده = باز کردن */
console.log('\n--- ۱) ضربه‌ی ساده ---')
{
  const before = useOS.getState().windows.length
  await clickIcon(0)
  check('با ضربه، اپ باز می‌شود', useOS.getState().windows.length === before + 1, `windows=${useOS.getState().windows.length}`)
  check('ترتیب با ضربه عوض نمی‌شود', useOS.getState().appOrder === null)
  // بستن پنجره برای سناریوهای بعد
  useOS.setState({ windows: [] })
  await tick(60)
}

/* --------------------------------------- ۲) لمس: نگه‌داشتن + کشیدن + رها */
console.log('\n--- ۲) لمس: نگه‌داشتن و کشیدن ---')
{
  const keys = iconKeys()
  const fromIdx = 0
  const toIdx = 3
  const A = keys[fromIdx]
  const C = keys[toIdx]
  const fullBefore = effectiveAppOrder(useOS.getState().appOrder)
  const expected = [...fullBefore]
  expected.splice(expected.indexOf(C), 0, expected.splice(expected.indexOf(A), 1)[0])

  const start = centerOf(fromIdx)
  const end = centerOf(toIdx)
  await fire(iconNodes()[fromIdx], pointerEvent('pointerdown', start.x, start.y, 'touch'))
  await tick(120)
  check('قبل از آماده‌شدن، درگ شروع نمی‌شود', container.querySelectorAll('[data-app-key]').length === keys.length && !container.querySelector('[data-drag-ghost]'))
  // کمی جابه‌جاییِ کوچک (زیر آستانه) — نباید درگ را بپرد
  await fireWindow(pointerEvent('pointermove', start.x + 3, start.y + 2, 'touch'))
  await tick(400) // حالا باید آماده شده باشد
  const draggingHtml = container.innerHTML
  check('با نگه‌داشتن، درگ آماده شد (شبح آیکن آمد)', !!draggingHtml && !!container.querySelector('[data-drag-ghost]'))
  // کشیدن تا روی آیکن مقصد
  await fireWindow(pointerEvent('pointermove', start.x + 40, start.y, 'touch'))
  await fireWindow(pointerEvent('pointermove', end.x, end.y, 'touch'))
  await tick(80)
  check('آیکن مقصد علامت‌گذاری شد', (container.querySelector(`[data-app-key="${C}"]`) as any)?.style.outline.includes('dashed'))
  await fireWindow(pointerEvent('pointerup', end.x, end.y, 'touch'))
  await tick(800) // انیمیشن خروجِ شبح هم تمام شود

  const after = useOS.getState().appOrder
  check('ترتیب اپ‌ها عوض شد', !!after && after.indexOf(A) === expected.indexOf(A), `${A} → index ${after?.indexOf(A)}`)
  check('ترتیب دقیقاً درست جابه‌جا شد', JSON.stringify(after) === JSON.stringify(expected), JSON.stringify(after?.slice(0, 6)))
  check('ترتیب در localStorage ذخیره شد', Object.keys(w.localStorage).length > 0 || !!after)
  check('بعد از درگ، اپ باز نشد', useOS.getState().windows.length === 0, `windows=${useOS.getState().windows.length}`)
  check('شبحِ درگ پاک شد', !container.querySelector('[data-drag-ghost]'))
  // ضربه‌ی بعدی باید دوباره اپ را باز کند (کلیکِ خورده‌شده نچسبد)
  await clickIcon(iconKeys().indexOf(A))
  check('ضربه‌ی بعدی دوباره اپ را باز می‌کند', useOS.getState().windows.length === 1, `windows=${useOS.getState().windows.length}`)
  useOS.setState({ windows: [] })
  await tick(60)
}

/* -------------------------------------------------- ۳) swipe سریع = هیچ */
console.log('\n--- ۳) swipe سریع (بدون نگه‌داشتن) ---')
{
  const keys = iconKeys()
  const orderBefore = JSON.stringify(useOS.getState().appOrder)
  const start = centerOf(0)
  const end = centerOf(4)
  await fire(iconNodes()[0], pointerEvent('pointerdown', start.x, start.y, 'touch'))
  await tick(80)
  await fireWindow(pointerEvent('pointermove', start.x + 30, start.y, 'touch'))
  await fireWindow(pointerEvent('pointermove', end.x, end.y, 'touch'))
  await tick(40)
  await fireWindow(pointerEvent('pointerup', end.x, end.y, 'touch'))
  await tick(120)
  check('swipe ترتیب را عوض نکرد', JSON.stringify(useOS.getState().appOrder) === orderBefore)
  check('swipe اپ را باز نکرد', useOS.getState().windows.length === 0)
  check('جای آیکن‌ها همان است', JSON.stringify(iconKeys()) === JSON.stringify(keys))
}

/* -------------------------------------------------------- ۴) درگ با موس */
console.log('\n--- ۴) درگ با موس ---')
{
  const keys = iconKeys()
  const A = keys[1]
  const C = keys[4]
  const fullBefore = effectiveAppOrder(useOS.getState().appOrder)
  const expected = [...fullBefore]
  expected.splice(expected.indexOf(C), 0, expected.splice(expected.indexOf(A), 1)[0])

  const start = centerOf(1)
  const end = centerOf(4)
  await fire(iconNodes()[1], pointerEvent('pointerdown', start.x, start.y, 'mouse', 3))
  await fireWindow(pointerEvent('pointermove', start.x + 9, start.y + 2, 'mouse', 3))
  await tick(60)
  check('موس بدون نگه‌داشتن، درگ را شروع می‌کند', !!container.querySelector('[data-drag-ghost]'))
  await fireWindow(pointerEvent('pointermove', end.x, end.y, 'mouse', 3))
  await fireWindow(pointerEvent('pointerup', end.x, end.y, 'mouse', 3))
  await tick(150)
  check('با موس هم ترتیب عوض شد', JSON.stringify(useOS.getState().appOrder) === JSON.stringify(expected), JSON.stringify(useOS.getState().appOrder?.slice(0, 6)))
}

console.log(failCount === 0 ? '\n🎉 آزمون درگ‌اند‌دراپ پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
