/**
 * puzzle-win.tsx — آزمون «تشخیص برد» پازل
 *
 * دقیقاً همان چیزی را قفل می‌کند که کاربر گزارش کرده بود: پازل برد را
 * تشخیص نمی‌داد. سه سناریو:
 *   ۱) حل کامل → جشن بی‌درنگ + ثبت نتیجه روی سرور
 *   ۲) سرورِ کند/آویزان (پاسخ /complete هرگز نمی‌رسد) → جشن باز هم می‌آید
 *   ۳) دکمه‌ی «بررسی حل»: وقتی حل نشده گزارش می‌دهد، وقتی حل شده جشن می‌آورد
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
g.URL.createObjectURL = () => 'blob:fake'
w.scrollTo = () => undefined

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

const PUZZLE = {
  id: 7,
  title: 'قلب ما',
  level: 3,
  level_label: 'آسان',
  image: null,
  hint_text: 'یادت نره لبخند بزنی',
  max_hints: 3,
  best_time: 0,
  plays: 2,
  completions: 1,
}

/* ------------------------- ماکِ شبکه (قابل تعویض بین سناریوها) --------- */
let hangComplete = false
const requested: string[] = []
const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string, opts: any = {}) => {
  const raw = String(url)
  const method = (opts.method || 'GET').toUpperCase()
  const path = raw.replace(/^https?:\/\/[^/]+/, '')
  requested.push(`${method} ${path}`)
  if (path.startsWith('/locales/')) {
    const lang = path.split('/')[2]
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  if (method === 'GET' && path === '/api/puzzles') return json({ items: [PUZZLE] })
  if (path === '/api/puzzles/7/complete') {
    // سناریوی «سرور آویزان»: پاسخ هرگز نمی‌رسد (درست مثل وقتی که بک‌اند
    // منتظر سروش می‌ماند) — جشن باید بدون آن هم بیاید.
    if (hangComplete) return new Promise(() => {})
    return json({ ok: true, message: 'آفرین دخترم! 🎉', voice: null, best_time: 42, new_record: true })
  }
  if (path === '/api/puzzles/7/start') return json({ ok: true })
  return json({ ok: true })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createElement: h } = await import('react')
const i18nModule = await import('../src/shared/i18n')
await i18nModule.i18nReady
const { default: Puzzle } = await import('../src/apps/Puzzle')

const tick = async (ms = 120) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }
const tap = async (el: any) => {
  await act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })) })
  await tick(30)
}

/** شبکه‌ی قطعه‌ها را از DOM می‌خواند (جای هر قطعه از backgroundPosition) */
function readTiles(host: HTMLElement): number[] {
  const grid = host.querySelector('div[style*="grid-template-columns"]') as any
  if (!grid) return []
  const buttons = Array.from(grid.querySelectorAll('button')) as any[]
  return buttons.map((b) => {
    const pos = String(b.style.backgroundPosition || '')
    const nums = pos.split(/\s+/).map((s) => Number.parseFloat(s))
    if (nums.length < 2 || Number.isNaN(nums[0]) || Number.isNaN(nums[1])) return -1
    const col = Math.round((nums[0] / 100) * 2)
    const row = Math.round((nums[1] / 100) * 2)
    return row * 3 + col
  })
}

const gridButtons = (host: HTMLElement) =>
  Array.from((host.querySelector('div[style*="grid-template-columns"]') as any).querySelectorAll('button')) as any[]
const buttonByLabel = (host: HTMLElement, label: string) =>
  (Array.from(host.querySelectorAll('button')) as any[]).find((b) => (b.textContent || '').includes(label))

async function mountPuzzle() {
  const host = w.document.createElement('div')
  w.document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => { root.render(h(Puzzle)) })
  await tick(250)
  await tap(buttonByLabel(host, 'قلب ما'))
  return host
}

/** با ضربه‌های دوتایی، قطعه‌ها را مرتب می‌کند */
async function solveByTaps(host: HTMLElement) {
  let tiles = readTiles(host)
  let guard = 0
  while (tiles.some((t, i) => t !== i) && guard < 40) {
    const wrong = tiles.findIndex((t, i) => t !== i)
    const target = tiles.indexOf(wrong)
    await tap(gridButtons(host)[wrong])
    await tap(gridButtons(host)[target])
    tiles = readTiles(host)
    guard += 1
  }
  return { tiles, guard }
}

console.log('\n🧪 آزمون تشخیص بردِ پازل')

/* ------------------------------------------------ ۱) حل کامل، سرور سالم */
console.log('\n--- سناریوی ۱: حل کامل ---')
{
  const host = await mountPuzzle()
  const tiles0 = readTiles(host)
  const grid = host.querySelector('div[style*="grid-template-columns"]') as HTMLElement | null
  check('جهت چیدن قطعه‌های تصویر چپ‌به‌راست است', grid?.style.direction === 'ltr')
  check('۹ قطعه رندر شد', tiles0.length === 9, tiles0.join(','))
  check('شروع بازی نامرتب است', tiles0.some((t, i) => t !== i), tiles0.join(','))
  const { tiles, guard } = await solveByTaps(host)
  check('با ضربه‌ها قطعه‌ها مرتب شدند', tiles.every((t, i) => t === i), `moves=${guard}`)
  await tick(400)
  check('جشن پایان آمد (تشخیص برد)', host.innerHTML.includes('حلش کردی'))
  check('پیام سرور روی جشن نشست', host.innerHTML.includes('آفرین دخترم'))
  check('نتیجه روی سرور ثبت شد', requested.includes('POST /api/puzzles/7/complete'))
}

/* --------------------------------------- ۲) سرور آویزان، جشن باید بیاید */
console.log('\n--- سناریوی ۲: سرورِ /complete آویزان است ---')
{
  hangComplete = true
  const before = requested.filter((r) => r.includes('complete')).length
  const host = await mountPuzzle()
  const { tiles } = await solveByTaps(host)
  check('قطعه‌ها مرتب شدند', tiles.every((t, i) => t === i), tiles.join(','))
  await tick(600)
  check('جشن بدون پاسخ سرور هم آمد', host.innerHTML.includes('حلش کردی'))
  check('درخواست ثبت ارسال شد (ولی منتظرش نماندیم)', requested.filter((r) => r.includes('complete')).length === before + 1)
  hangComplete = false
}

/* -------------------------------------------------- ۳) دکمه‌ی بررسی حل */
console.log('\n--- سناریوی ۳: دکمه‌ی «بررسی حل» ---')
{
  const host = await mountPuzzle()
  const checkBtn = buttonByLabel(host, 'بررسی حل')
  check('دکمه‌ی بررسی حل هست', !!checkBtn)

  await tap(checkBtn)
  await tick(200)
  check('وقتی حل نشده، گزارش می‌دهد', /قطعه از/.test(host.innerHTML), (host.textContent || '').slice(0, 0))
  check('وقتی حل نشده، جشن نمی‌آید', !host.innerHTML.includes('حلش کردی'))

  const { tiles } = await solveByTaps(host)
  check('قطعه‌ها مرتب شدند', tiles.every((t, i) => t === i), tiles.join(','))
  await tick(400)
  check('بعد از حل، جشن آمد', host.innerHTML.includes('حلش کردی'))
}

console.log(failCount === 0 ? '\n🎉 آزمون پازل پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
