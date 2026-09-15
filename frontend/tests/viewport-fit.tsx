/**
 * viewport-fit.tsx — آزمون «صفحه‌ی تمام‌قد و بدون اسکرول»
 *
 * باگی که این تست جلوی برگشتنش را می‌گیرد: پوسته‌ی اپ (بوت، قفل، دسکتاپ) به‌جای
 * اندازه‌ی صفحه‌ی دستگاه، به‌اندازه‌ی محتوایش جمع می‌شد و پایینِ صفحه سفید
 * می‌ماند (و در دسکتاپ هم اسکرول از بیرون اضافه می‌شد). ریشه‌اش این بود که
 * نگهبان خطا در main.tsx یک `div` بی‌ارتفاع وسط زنجیره‌ی `height: 100%` بود.
 *
 * چون jsdom چیدمان واقعی را حساب نمی‌کند، این‌جا «قرارداد» آزمون می‌شود:
 *   ۱) پوسته‌ی هر مرحله کلاس `os-screen` دارد (۱۰۰٪ ارتفاع + overflow: hidden)
 *   ۲) هیچ‌جای زنجیره‌ی #root → پوسته، المانِ بی‌کلاسِ ارتفاع‌دار فاصله نمی‌اندازد
 *   ۳) نگهبان خطا دور اپ با `h-full w-full` رندر می‌شود
 *   ۴) بوت و قفل دیگر اسکرول‌بار داخلی ندارند (به‌جایش مقیاسِ جا‌شدن)
 *   ۵) CSS قرارداد `html, body { overflow: hidden }` و `100dvh` را نگه داشته
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// این فایل قبل از اجرا به tests/.build باندل می‌شود، پس یک پله بالاتر می‌رویم
const rootDir = join(dirname(dirname(fileURLToPath(import.meta.url))), '..')
const publicDir = join(rootDir, 'public')

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

const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string, opts: any = {}) => {
  const p = String(url)
  if (p.includes('/locales/')) {
    const lang = p.includes('/en/') ? 'en' : 'fa'
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  const method = (opts.method || 'GET').toUpperCase()
  if (method !== 'GET') return json({ found: false, ok: true })
  return json({})
}

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

/** کلاس‌های ارتفاع‌دارِ مجاز در زنجیره‌ی پوسته */
const HEIGHT_CLASS = /(^|\s)(os-screen|h-full|h-\[100dvh\])(\s|$)/

async function main() {
  const React = await import('react')
  const { act } = React as any
  const { createRoot } = await import('react-dom/client')
  const { default: i18n, i18nReady } = await import('../src/shared/i18n')
  await i18nReady
  await i18n.changeLanguage('fa')

  const { useOS } = await import('../src/shared/store')
  const { ErrorBoundary } = await import('../src/shared/ErrorBoundary')
  const { Boot } = await import('../src/os/Boot')
  const { Lock } = await import('../src/os/Lock')
  const { Desktop } = await import('../src/os/Desktop')

  // دقیقاً مثل index.html + main.tsx: #root → نگهبان خطا → App
  const rootEl = w.document.getElementById('root') as HTMLElement
  const root = createRoot(rootEl)
  const render = async (node: unknown) =>
    act(async () => {
      root.render(node as any)
    })

  console.log('\n=== ۱) قرارداد CSS پوسته‌ی تمام‌صفحه ===')
  const css = readFileSync(join(rootDir, 'src', 'styles', 'index.css'), 'utf8')
  check('کلاس os-screen تعریف شده است', /\.os-screen\s*\{/.test(css))
  check('os-screen ارتفاع ۱۰۰٪ و ۱۰۰dvh دارد', /\.os-screen\s*\{[^}]*height:\s*100%[^}]*height:\s*100dvh/s.test(css))
  check('os-screen سرریز را می‌بندد', /\.os-screen\s*\{[^}]*overflow:\s*hidden/s.test(css))
  check('html/body قفل اسکرول هستند', /html,\s*body\s*\{[^}]*overflow:\s*hidden/s.test(css))
  check('html, body, #root ارتفاع ۱۰۰٪ دارند', /html,\s*body,\s*#root\s*\{\s*height:\s*100%/.test(css))

  console.log('\n=== ۲) بوت: تمام‌قد، بدون اسکرول داخلی ===')
  useOS.setState({ phase: 'boot', config: { ...serverConfig } })
  await render(
    React.createElement(
      ErrorBoundary,
      { title: 'LoveOS', className: 'h-full w-full' },
      React.createElement(Boot),
    ),
  )
  await act(async () => { await new Promise((r) => setTimeout(r, 500)) })

  const bootShell = rootEl.firstElementChild?.firstElementChild as HTMLElement | null
  check('پوسته‌ی بوت رندر شده است', !!bootShell)
  check('پوسته‌ی بوت کلاس os-screen دارد', !!bootShell?.className.includes('os-screen'), String(bootShell?.className).slice(0, 80))
  check('بوت اسکرول‌بار داخلی ندارد', !/overflow-y-auto|overflow-auto/.test(String(bootShell?.className)))
  check('نگهبان خطا ارتفاع کامل دارد', !!rootEl.firstElementChild?.className.includes('h-full'))
  const chainOk = (() => {
    let el: HTMLElement | null = bootShell
    while (el && el !== rootEl) {
      if (!HEIGHT_CLASS.test(String(el.className))) return false
      el = el.parentElement
    }
    return true
  })()
  check('زنجیره‌ی #root → پوسته هیچ المان بی‌ارتفاعی ندارد', chainOk)
  check('متن بوت رندر شده است (مقیاس‌گیری چیزی را نشکسته)', (rootEl.textContent || '').includes('LoveOS'))

  console.log('\n=== ۳) قفل و دسکتاپ: تمام‌قد ===')
  useOS.setState({ phase: 'lock', config: { ...serverConfig } })
  await render(
    React.createElement(
      ErrorBoundary,
      { title: 'LoveOS', className: 'h-full w-full' },
      React.createElement(Lock),
    ),
  )
  await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
  const lockShell = rootEl.firstElementChild?.firstElementChild as HTMLElement | null
  check('پوسته‌ی قفل کلاس os-screen دارد', !!lockShell?.className.includes('os-screen'), String(lockShell?.className).slice(0, 80))
  check('قفل اسکرول‌بار داخلی ندارد', !/overflow-y-auto|overflow-auto/.test(String(lockShell?.className)))

  useOS.setState({ phase: 'desktop', config: { ...serverConfig }, windows: [] })
  await render(
    React.createElement(
      ErrorBoundary,
      { title: 'LoveOS', className: 'h-full w-full' },
      React.createElement(Desktop),
    ),
  )
  await act(async () => { await new Promise((r) => setTimeout(r, 300)) })
  const deskShell = rootEl.firstElementChild?.firstElementChild as HTMLElement | null
  check('پوسته‌ی دسکتاپ کلاس os-screen دارد', !!deskShell?.className.includes('os-screen'), String(deskShell?.className).slice(0, 80))
  check(
    'اسکرولِ محتوای دسکتاپ داخل خودش است، نه روی صفحه',
    !!deskShell?.querySelector('.overflow-y-auto'),
  )

  console.log('\n=== ۴) main.tsx: نگهبان خطا با ارتفاع کامل ===')
  const mainSrc = readFileSync(join(rootDir, 'src', 'main.tsx'), 'utf8')
  check(
    'ErrorBoundary در main با className ارتفاع‌دار رندر می‌شود',
    /<ErrorBoundary[^>]*className="[^"]*h-full/.test(mainSrc),
  )

  console.log('\n=== ۵) هوک جا‌شدن (useFitScale) در محیط بدون چیدمان نمی‌ترکد ===')
  const { useFitScale } = await import('../src/shared/useFitScale')
  const Probe = () => {
    const { ref } = useFitScale<HTMLDivElement>()
    return React.createElement('div', { ref, className: 'os-screen' })
  }
  await render(React.createElement(Probe))
  await act(async () => { await new Promise((r) => setTimeout(r, 60)) })
  check('رندر با useFitScale بدون خطا انجام شد', !!rootEl.querySelector('.os-screen'))

  if (failCount) {
    console.log(`\n❌ ${failCount} مورد اشتباه بود`)
    process.exit(1)
  }
  console.log('\n🎉 آزمون تمام‌قد بودن صفحه پاس شد')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
