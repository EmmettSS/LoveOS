/**
 * boot-timeout.tsx — آزمون «بوتِ کُند/بی‌پاسخ، سفیدِ خاموش نمی‌شود»
 *
 * اگر /api/boot هیچ‌وقت جواب ندهد (fetch معلق)، اپ نباید div خالی نشان دهد:
 *   ۱) اول «در حال اتصال به LoveOS…» با پس‌زمینه‌ی تیره دیده می‌شود (نه div خالی)
 *   ۲) بعد از آستانه‌ی کُندی، «اتصال برقرار نشد + دوباره تلاش» می‌آید
 *   ۳) بعد از مهلت api هم همان صفحه‌ی خطا می‌ماند (نه سفید، نه کرش)
 *   ۴) با وصل شدن سرور و زدن «دوباره تلاش»، بوت واقعی ادامه پیدا می‌کند
 *
 * آستانه‌ها با __LOVEOS_BOOT_SLOW_MS و __LOVEOS_API_TIMEOUT_MS کوتاه می‌شوند تا
 * تست سریع باشد؛ رفتار پروداکشن (۱۲ ثانیه / ۱۵ ثانیه) دست‌نخورده می‌ماند.
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
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'SVGElement'])
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

// آستانه‌های کوتاه فقط برای این تست
g.__LOVEOS_BOOT_SLOW_MS = 150
g.__LOVEOS_API_TIMEOUT_MS = 400

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

let bootPending = true
const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = (url: string, opts: any = {}) => {
  const p = String(url)
  if (p.includes('/locales/')) {
    const lang = p.includes('/en/') ? 'en' : 'fa'
    return Promise.resolve(json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8'))))
  }
  if (p.includes('/api/boot')) {
    if (!bootPending) return Promise.resolve(json({ config: serverConfig, unlocked: false }))
    // معلقِ واقعی که به abort احترام می‌گذارد (مثل مرورگر)
    return new Promise((_, reject) => {
      opts.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })
  }
  return Promise.resolve(json({}))
}

const consoleErrors: string[] = []
const origError = console.error
console.error = (...args: unknown[]) => {
  const msg = String(args[0] ?? '')
  if (!msg.includes('not wrapped in act')) consoleErrors.push(msg)
  origError(...args)
}

async function main() {
  const React = await import('react')
  const { act } = React as any
  const { createRoot } = await import('react-dom/client')
  const { i18nReady } = await import('../src/shared/i18n')
  await i18nReady

  const { default: App } = await import('../src/App')

  const sleep = async (ms: number) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }
  const waitFor = async (fn: () => boolean, ms: number) => {
    const end = Date.now() + ms
    while (Date.now() < end) {
      if (fn()) return true
      await sleep(25)
    }
    return fn()
  }

  console.log('\n=== بوتِ بی‌پاسخ: از «در حال اتصال» تا «دوباره تلاش» ===')
  const rootEl = document.getElementById('root')!
  const root = createRoot(rootEl)
  await act(async () => { root.render(React.createElement(App)) })

  // ۱) خیلی زود (قبل از آستانه‌ی کُندی): «در حال اتصال» با پس‌زمینه‌ی تیره
  await sleep(30)
  const early = rootEl.firstElementChild as HTMLElement | null
  check('قبل از آماده‌شدن، چیزی رندر شده (نه div خالی)', !!early && (early.textContent || '').trim().length > 0)
  check('«در حال اتصال به LoveOS…» دیده می‌شود', rootEl.textContent!.includes('در حال اتصال به LoveOS'))
  check(
    'پس‌زمینه‌ی تیره دارد (نه سفید)',
    !!early && (early as HTMLElement).style.background.includes('linear-gradient(170deg'),
    (early as HTMLElement | null)?.style.background.slice(0, 60) || 'no-bg',
  )

  // ۲) بعد از آستانه‌ی کُندی (fetch هنوز معلق): «اتصال برقرار نشد + دوباره تلاش»
  const sawFailure = await waitFor(() => rootEl.textContent!.includes('اتصال برقرار نشد'), 1500)
  check('بعد از کُندی، «اتصال برقرار نشد» دیده شد (نه div خالی)', sawFailure)
  const retryBtn = Array.from(rootEl.querySelectorAll('button')).find((b) => b.textContent === 'دوباره تلاش') as HTMLButtonElement | undefined
  check('دکمه‌ی «دوباره تلاش» هست', !!retryBtn)
  check('راهنمای کش PWA دیده می‌شود', rootEl.textContent!.includes('کشِ قدیمی PWA'))

  // ۳) بعد از مهلت api (۴۰۰ms) هم همان خطاست — نه سفید، نه کرش
  await sleep(600)
  check('بعد از مهلت، هنوز صفحه‌ی خطا دیده می‌شود', rootEl.textContent!.includes('اتصال برقرار نشد'))
  check('بدون هیچ خطای کنسولی تا این‌جا', consoleErrors.length === 0, consoleErrors[0] || '')

  // ۴) سرور وصل می‌شود + زدن «دوباره تلاش» → بوت واقعی ادامه پیدا می‌کند
  bootPending = false
  await act(async () => { retryBtn!.dispatchEvent(new w.MouseEvent('click', { bubbles: true })) })
  const booted = await waitFor(() => rootEl.textContent!.includes('برای او که جان و جهان من شد'), 2000)
  check('بعد از تلاش دوباره، صفحه‌ی بوت آمد', booted)
  check('صفحه‌ی خطا رفت', !rootEl.textContent!.includes('اتصال برقرار نشد'))
  check('در کل بدون خطای کنسول', consoleErrors.length === 0, consoleErrors[0] || '')

  await act(async () => { root.unmount() })
}

await main()
console.log(failCount === 0 ? '\n🎉 آزمون تایم‌اوت بوت پاس شد' : `\n💥 ${failCount} مورد شکست`)
process.exit(failCount === 0 ? 0 : 1)
