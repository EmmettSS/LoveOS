/**
 * error-boundary-wrapper.tsx — آزمون رگرسیون «سفیدشدن بدنه‌ی پنجره»
 *
 * ریشه‌ی باگ: ErrorBoundary در حالت سالم بچه‌ها را داخل یک <div> بی‌کلاس می‌پیچید.
 * آن div با ارتفاع auto وسط زنجیره، ارتفاعِ درصدیِ اپ‌ها را می‌شکند؛ آسمانِ
 * «آسمان ستاره‌ها» (h-[calc(100%+…)]) پشتش صفر می‌شد و چون overflow-hidden است،
 * بدنه‌ی پنجره کاملاً سفید دیده می‌شد (باگ PR #19، بازتولیدشده با کرومیوم واقعی).
 *
 * این آزمون قرارداد را قفل می‌کند:
 *   ۱) بدون className: هیچ المان DOMای دور بچه‌ها نباید ساخته شود (Fragment)
 *   ۲) با className: همان پوسته با کلاس داده‌شده (رفتار main.tsx) حفظ شود
 *   ۳) دکمه‌ی «دوباره» همچنان subtree را از نو مانت کند (key روی Fragment)
 *   ۴) Window.tsx نگهبان را بدون className صدا بزند (تا قرارداد ۱ پابرجا بماند)
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body><div id="root"></div></body></html>', {
  pretendToBeVisual: true,
  url: 'http://localhost:5173/',
})
const w: any = dom.window
const g = globalThis as any
g.window = w
g.document = w.document
Object.defineProperty(g, 'navigator', { value: w.navigator, configurable: true })
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent']) g[k] = (w as any)[k]
g.localStorage = w.localStorage
g.requestAnimationFrame = w.requestAnimationFrame.bind(w)
g.cancelAnimationFrame = w.cancelAnimationFrame.bind(w)
g.getComputedStyle = w.getComputedStyle.bind(w)
g.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
w.matchMedia = g.matchMedia
g.IS_REACT_ACT_ENVIRONMENT = true

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

// خطای عمدی کامپوننتِ آزمون توسط خودِ نگهبان لاگ می‌شود؛ آن را از خطاهای
// واقعیِ آزمون جدا می‌کنیم.
const consoleErrors: string[] = []
const origError = console.error
console.error = (...args: unknown[]) => {
  const msg = args.map((a) => String(a ?? '')).join(' ')
  const expectedNoise =
    msg.includes('[LoveOS] app crashed') ||
    msg.includes('not wrapped in act') ||
    // لاگ‌های خود React درباره‌ی خطای عمدیِ کامپوننت آزمون
    /error occurred in/i.test(msg) ||
    msg.includes('boom آزمون')
  if (!expectedNoise) consoleErrors.push(msg)
  origError(...args)
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createElement: h, useEffect } = await import('react')
const { ErrorBoundary } = await import('../src/shared/ErrorBoundary')

const rootEl = document.getElementById('root')!
let root = createRoot(rootEl)
/** React 19: بعد از unmount همان root قابل رندر نیست؛ برای هر بخش root تازه */
async function nextRoot() {
  await act(async () => { root.unmount() })
  root = createRoot(rootEl)
}

console.log('\n=== قرارداد پوسته‌ی نگهبان خطا ===')

// ------------------------------------------------ ۱) بدون className → بدون wrapper
let mounts = 0
function Leaf() {
  useEffect(() => { mounts += 1 }, [])
  return h('div', { id: 'leaf' }, 'محتوای اپ')
}
await act(async () => { root.render(h(ErrorBoundary, { title: 'تست' }, h(Leaf))) })
const leaf = rootEl.querySelector('#leaf')
check('محتوای سالم رندر شد', !!leaf)
check('بدون className هیچ div واسطی ساخته نمی‌شود', !!leaf && leaf.parentElement === rootEl,
  leaf ? `parent=${leaf.parentElement?.tagName}${leaf.parentElement?.id ? '#' + leaf.parentElement.id : ''}.${String(leaf.parentElement?.className || '')}` : '')
await nextRoot()

// ------------------------------------------------ ۲) با className → پوسته با همان کلاس
await act(async () => { root.render(h(ErrorBoundary, { title: 'تست', className: 'h-full w-full' }, h('div', { id: 'shell' }, 'پوسته'))) })
const shell = rootEl.querySelector('#shell')
const shellParent = shell?.parentElement as HTMLElement | null
check('با className پوسته همان کلاس را دارد (رفتار main.tsx)', !!shellParent && shellParent.tagName === 'DIV' && shellParent.className === 'h-full w-full',
  shellParent ? `class="${shellParent.className}"` : '')
await nextRoot()

// ------------------------------------------------ ۳) «دوباره» subtree را از نو مانت می‌کند
let allow = false
function Boom() {
  useEffect(() => { mounts += 1 }, [])
  if (!allow) throw new Error('boom آزمون')
  return h('p', { id: 'fine' }, 'دوباره سالم شد')
}
mounts = 0
await act(async () => { root.render(h(ErrorBoundary, { title: 'اپ آزمون' }, h(Boom))) })
await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
check('خطا پیام گرم نگهبان را نشان داد', rootEl.textContent!.includes('باز نشد'))
allow = true
const retryBtn = Array.from(rootEl.querySelectorAll('button')).find((b) => b.textContent!.includes('دوباره')) as HTMLButtonElement
check('دکمه‌ی «دوباره» هست', !!retryBtn)
await act(async () => { retryBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
check('بعد از «دوباره» محتوا دوباره سالم رندر شد', !!rootEl.querySelector('#fine'))
// افکتِ مانت فقط هنگام ساخته‌شدنِ نمونه‌ی تازه اجرا می‌شود؛ اگر React همان
// نمونه‌ی قبلی را بازیابی کرده بود، این افکت دوباره اجرا نمی‌شد.
check('«دوباره» subtree را از نو مانت کرد (ری‌مونت تمیز حفظ شده)', mounts === 1, `mounts=${mounts}`)
await act(async () => { root.unmount() })

// ------------------------------------------------ ۴) Window.tsx نگهبان را بدون className صدا می‌زند
// بعد از باندل، import.meta.url به tests/.build اشاره می‌کند؛ دو سطح بالا = ریشه‌ی frontend
const windowSrc = readFileSync(join(here, '..', '..', 'src', 'os', 'Window.tsx'), 'utf8')
const usesGuard = windowSrc.includes('<ErrorBoundary')
const withoutClassName = /<ErrorBoundary\s+title=\{[^}]+\}>\s*<Suspense/.test(windowSrc.replace(/\r/g, ''))
check('Window.tsx از نگهبان استفاده می‌کند', usesGuard)
check('Window.tsx نگهبان را بدون className صدا می‌زند (قرارداد بدون-wrapper)', withoutClassName)

check('بدون هیچ خطای کنسولیِ تازه', consoleErrors.length === 0, consoleErrors[0] || '')

console.log(failCount === 0 ? '\n🎉 آزمون پوسته‌ی نگهبان پاس شد' : `\n💥 ${failCount} مورد شکست`)
process.exit(failCount === 0 ? 0 : 1)
