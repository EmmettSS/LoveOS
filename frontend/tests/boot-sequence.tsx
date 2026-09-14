/**
 * boot-sequence.tsx — آزمون توالی صفحه‌ی بوت
 *
 * این تست دقیقاً جلوی باگ «فریزشدن صفحه هنگام ورود» را می‌گیرد:
 *   ۱) ترجمه‌ها باید در زمان اجرا از /locales بارگذاری شوند (نه import از public)
 *   ۲) در StrictMode (که افکت‌ها دوبار اجرا می‌شوند) حلقه‌ی تایپ نباید بمیرد
 *   ۳) خطوط بوت یکی‌یکی ظاهر شوند، درصد به ۱۰۰ برسد و فاز به lock ختم شود
 *   ۴) کلیکِ رد شدن فوری بوت را تمام کند
 *   ۵) هر دو زبان (فارسی/انگلیسی) خطوط مخصوص خود را نشان دهند
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

async function main() {
  const React = await import('react')
  const { act } = React as any
  const { createRoot } = await import('react-dom/client')
  const { default: i18n, i18nReady } = await import('../src/shared/i18n')
  await i18nReady
  check('هر دو زبان در زمان اجرا بارگذاری شدند', i18n.hasResourceBundle('fa', 'translation') && i18n.hasResourceBundle('en', 'translation'))

  const { useOS } = await import('../src/shared/store')
  const { Boot } = await import('../src/os/Boot')

  const tick = async (ms = 300) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }
  const tapScreen = async (host: HTMLElement) => {
    // کلیک باید روی خود المان ریشه‌ی بوت بخورد، نه کانتینر والد
    const target = host.firstElementChild as HTMLElement
    await act(async () => { target.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })) })
  }
  const mountBoot = async () => {
    useOS.setState({ phase: 'boot', config: { ...serverConfig } })
    const host = w.document.createElement('div')
    w.document.body.appendChild(host)
    const root = createRoot(host)
    await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Boot))) })
    return { host, root }
  }

  console.log('\n=== ۱) بوت فارسی در StrictMode (رفع باگ فریز) ===')
  await i18n.changeLanguage('fa')
  const { host, root } = await mountBoot()
  await tick(900)
  check('اولین خط بوت تایپ می‌شود', host.textContent.includes('بارگذاری قلب'), host.textContent.slice(0, 160))
  await tick(1600)
  check('حلقه‌ی بوت در StrictMode پیش می‌رود (فریز نشده)', host.textContent.includes('ماژول فاصله') || host.textContent.includes('صندوق صدا'))

  console.log('\n=== ۲) پایان خودکار بوت ===')
  for (let i = 0; i < 30; i += 1) {
    await tick(300)
    if (useOS.getState().phase !== 'boot') break
  }
  check('بعد از خط‌ها به صفحه‌ی قفل رسیدیم', useOS.getState().phase === 'lock', useOS.getState().phase)
  check('درصد نهایی ۱۰۰ است', host.textContent?.includes('۱۰۰%') === true)
  check('کپی‌رایت با اسم‌ها دیده می‌شود', host.textContent?.includes('بابا') && host.textContent.includes('مریم'))
  check('پیغام خوش‌آمد دیده می‌شود', host.textContent?.includes('جانِ دلم') === true)
  await act(async () => root.unmount())

  console.log('\n=== ۳) رد شدن با کلیک ===')
  const skipped = await mountBoot()
  await tick(400)
  await tapScreen(skipped.host)
  await tick(1200)
  check('کلیک، بوت را زود تمام کرد', useOS.getState().phase === 'lock', useOS.getState().phase)
  check('بعد از رد شدن صددرصد دیده می‌شود', skipped.host.textContent?.includes('۱۰۰%') === true)
  await act(async () => skipped.root.unmount())

  console.log('\n=== ۴) بوت انگلیسی ===')
  await i18n.changeLanguage('en')
  const en = await mountBoot()
  await tick(1400)
  check('خطوط BIOS انگلیسی هستند', en.host.textContent?.includes('BIOS check') === true, en.host.textContent?.slice(0, 100))
  await tapScreen(en.host)
  await tick(1200)
  check('بوت انگلیسی هم کامل شد', useOS.getState().phase === 'lock')
  check('درصد انگلیسی با ارقام لاتین است', en.host.textContent?.includes('100%') === true)
  check('خط Initializing desktop هست', en.host.textContent?.includes('Initializing desktop') === true)
  await act(async () => en.root.unmount())

  if (failCount) {
    console.log(`\n❌ ${failCount} مورد اشتباه بود`)
    process.exit(1)
  }
  console.log('\n🎉 آزمون توالی بوت پاس شد')
  // انیمیشن‌های بی‌پایان framer-motion ممکن است حلقه‌ی رویداد را زنده نگه دارند
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
