/**
 * setup-permissions.tsx — آزمونِ صفحه‌ی «آماده‌سازی» (مجوزها)
 *
 * این تست جلوی همان گلایه‌ی اصلی را می‌گیرد: «گوشی هیچ پنجره‌ی اجازه‌ای باز
 * نمی‌کند». هر مجوز باید با یک لمس واقعاً خواسته شود، کارتِ بعدی بیاید و در
 * پایان به دسکتاپ برسیم.
 *
 *  ۱) ترتیبِ قدم‌ها و پیشرفت درست است
 *  ۲) هر دکمه، همان API مرورگر را صدا می‌زند (تمام‌صفحه، اعلان، موقعیت،
 *     میکروفن، دوربین، لرزش، حافظه)
 *  ۳) بعد از گرفتنِ همه، فاز به دسکتاپ می‌رود و پرچمِ «دیده شد» ثبت می‌شود
 *  ۴) قاعده‌ی «هر بار کم بود»: اگر چیزی کم باشد صفحه می‌آید، اگر «بعداً»
 *     بزنی چند ساعت آرام می‌شود، و اگر همه داده شده باشد اصلاً نمی‌آید
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
for (const k of [
  'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent',
  'HTMLInputElement', 'HTMLTextAreaElement', 'SVGElement', 'MutationObserver',
])
  g[k] = w[k]
g.localStorage = w.localStorage
g.sessionStorage = w.sessionStorage
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

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

/* --------------------------------------------- محیطِ مرورگرِ گوشی (جعلی) -- */
const browser = {
  perms: { notifications: 'default', geolocation: 'prompt', microphone: 'prompt', camera: 'prompt' } as Record<string, string>,
  calls: [] as string[],
  fullscreen: false,
  requestFullscreenCalls: 0,
  /** نتیجه‌ی navigator.storage.persist() — روی بعضی گوشی‌ها فقط وقتی اپ نصب شده true است */
  storageGranted: true,
}

function installBrowser(storageGranted = true) {
  browser.perms = { notifications: 'prompt', geolocation: 'prompt', microphone: 'prompt', camera: 'prompt' }
  browser.calls = []
  browser.fullscreen = false
  browser.requestFullscreenCalls = 0
  browser.storageGranted = storageGranted

  Object.defineProperty(w.navigator, 'permissions', {
    configurable: true,
    value: {
      query: async ({ name }: { name: string }) => ({ state: browser.perms[name] || 'prompt' }),
    },
  })

  // در مرورگر `Notification` هم روی window و هم به‌عنوان شناسه‌ی سراسری
  // وجود دارد؛ در jsdomِ این آزمون باید هر دو جا گذاشته شود.
  const notificationMock = {
    permission: 'default',
    requestPermission: async () => {
      browser.calls.push('notification')
      browser.perms.notifications = 'granted'
      notificationMock.permission = 'granted'
      return 'granted'
    },
  }
  ;(w as any).Notification = notificationMock
  g.Notification = notificationMock

  Object.defineProperty(w.navigator, 'geolocation', {
    configurable: true,
    value: {
      getCurrentPosition: (ok: any) => {
        browser.calls.push('geolocation')
        browser.perms.geolocation = 'granted'
        ok({ coords: { latitude: 36.3, longitude: 59.6 } })
      },
      watchPosition: (ok: any) => {
        browser.calls.push('geolocation')
        ok({ coords: { latitude: 36.3, longitude: 59.6 } })
        return 1
      },
      clearWatch: () => undefined,
    },
  })

  Object.defineProperty(w.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async (constraints: any) => {
        const kind = constraints?.audio ? 'microphone' : 'camera'
        browser.calls.push(kind)
        browser.perms[kind] = 'granted'
        return { getTracks: () => [{ stop: () => undefined }] }
      },
    },
  })

  Object.defineProperty(w.navigator, 'vibrate', {
    configurable: true,
    value: (pattern: any) => {
      browser.calls.push(`vibrate:${JSON.stringify(pattern)}`)
      return true
    },
  })

  Object.defineProperty(w.navigator, 'storage', {
    configurable: true,
    value: {
      persisted: async () => browser.storageGranted,
      persist: async () => {
        browser.calls.push('persist')
        return browser.storageGranted
      },
    },
  })

  Object.defineProperty(w.document, 'fullscreenEnabled', { configurable: true, value: true })
  Object.defineProperty(w.document, 'fullscreenElement', {
    configurable: true,
    get: () => (browser.fullscreen ? w.document.documentElement : null),
  })
  w.document.documentElement.requestFullscreen = async () => {
    browser.requestFullscreenCalls += 1
    browser.calls.push('fullscreen')
    browser.fullscreen = true
  }
  w.document.exitFullscreen = async () => {
    browser.fullscreen = false
  }
}

installBrowser()

const json = (d: unknown, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => d,
  text: async () => JSON.stringify(d),
  headers: { get: () => 'application/json' },
})

const config = {
  daughter_name: 'مریم', daughter_nickname: 'دخترم', daddy_name: 'بابا', days_together: 100,
  next_meeting: null, next_meeting_delta: null, boot_greeting: '', wrong_pass_message: '',
  lock_help_message: '', security_question: '', language: 'fa', theme: 'day', sound_enabled: false,
  font_scale: 1, logo: null, boot_background: null, lock_background: null,
  desktop_background_day: null, desktop_background_night: null, is_birthday: false,
  is_anniversary: false, has_passcode: true,
}

g.fetch = async (url: string, opts: any = {}) => {
  const path = String(url)
  if (path.includes('/locales/')) {
    const lang = path.includes('/en/') ? 'en' : 'fa'
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  if (path.endsWith('/api/me')) return json(config)
  if (path.endsWith('/api/boot')) return json({ config, unlocked: true })
  const method = (opts.method || 'GET').toUpperCase()
  if (method !== 'GET') return json({ ok: true })
  return json({ items: [] })
}

const React = await import('react')
const { act } = React as any
const { createRoot } = await import('react-dom/client')
const { createElement: h } = React as any

const i18nModule = await import('../src/shared/i18n')
await i18nModule.i18nReady
await i18nModule.default.changeLanguage('fa')

const { useOS } = await import('../src/shared/store')
const { markSetupSeen, markSetupSkipped, clearSetupSkip, setupNeeded, permissionStates } = await import('../src/shared/permissions')


async function mount(element: any) {
  const host = w.document.createElement('div')
  w.document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(element)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 220))
  })
  return { host, root }
}

const byText = (host: HTMLElement, text: string, tag = 'button') =>
  Array.from(host.querySelectorAll(tag)).find((b) => (b.textContent || '').includes(text))

async function click(el: Element | undefined | null, wait = 320) {
  if (!el) return false
  await act(async () => {
    el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, wait))
  })
  return true
}

console.log('🧪 آزمونِ صفحه‌ی آماده‌سازی و مجوزها')

/* ══════════════════════ ۱) از صفر تا دسکتاپ، مجوز به مجوز ════════════════ */
{
  w.localStorage.clear()
  installBrowser(false)
  const { Setup } = await import('../src/os/Setup')
  useOS.setState({ config: config as any, phase: 'setup' })
  const { host } = await mount(h(Setup))

  check('صفحه‌ی آماده‌سازی بالا آمد', (host.textContent || '').includes('آماده‌سازی'))
  check('شماره‌ی پیشرفت نشان داده می‌شود', /۱\s*\/\s*۶/.test(host.textContent || ''), (host.textContent || '').slice(0, 60))

  const allow = 'اجازه می‌دم'
  // ترتیبِ کارت‌ها همان ترتیبِ پیشنهادی است: تمام‌صفحه، اعلان، موقعیت،
  // میکروفن، دوربین، حافظه. (لرزش مجوزِ مرورگری ندارد، پس قدم نمی‌شود.)
  const seen: string[] = []
  const cardTitles: string[] = []
  const cards: [string, string][] = [
    ['تمام‌صفحه', 'fullscreen'],
    ['اعلان', 'notification'],
    ['موقعیت', 'geolocation'],
    ['میکروفن', 'microphone'],
    ['دوربین', 'camera'],
    ['حافظه', 'persist'],
  ]
  for (const [title, call] of cards) {
    const cardText = host.querySelector('main')?.textContent || ''
    cardTitles.push(cardText)
    const text = cardText
    seen.push(title)
    check(`کارتِ «${title}» به‌ترتیب آمد`, text.includes(title), text.slice(-70))
    await click(byText(host, allow), 620)
    check(`مجوزِ «${title}» واقعاً از مرورگر خواسته شد`, browser.calls.includes(call))
  }
  check('ترتیبِ قدم‌ها درست بود', seen.join(' < ') === 'تمام‌صفحه < اعلان < موقعیت < میکروفن < دوربین < حافظه', seen.join(' < '))
  check('تمام‌صفحه یک‌بار صدا زده شد', browser.requestFullscreenCalls === 1, String(browser.requestFullscreenCalls))
  check(
    'لرزش کارتِ جدا نداشت (مجوزِ مرورگری ندارد، با هر لمس خودش می‌لرزد)',
    !cardTitles.some((title) => title.includes('لرزش')),
    cardTitles.join(' | '),
  )

  await act(async () => {
    await new Promise((r) => setTimeout(r, 400))
  })
  check('بعد از گرفتنِ همه، وارد دسکتاپ شدیم', useOS.getState().phase === 'desktop', useOS.getState().phase)
  check('پرچمِ «آماده‌سازی دیده شد» ثبت شد', w.localStorage.getItem('loveos_setup_seen_v1') === '1')
  check('تمام‌صفحه فعال ماند', browser.fullscreen === true)
}

/* ═══════════════ ۲) اگر همه‌چیز از قبل داده شده باشد، صفحه نمی‌آید ════════ */
{
  w.localStorage.clear()
  installBrowser(true)
  markSetupSeen() // مثل دستگاهی که یک بار آماده‌سازی را دیده و همه را داده
  w.localStorage.setItem('loveos_fullscreen_done', '1') // قبلاً تمام‌صفحه گرفته شده
  browser.perms = { notifications: 'granted', geolocation: 'granted', microphone: 'granted', camera: 'granted' }
  g.Notification.permission = 'granted'
  const states = await permissionStates()
  // لرزش/حافظه/تمام‌صفحه در این محیطِ جعلی «granted» یا «قابل‌پرسیدن»اند؛
  // فقط می‌خواهیم ببینیم تصمیم‌گیری روی وضعیت‌های واقعیِ داده‌شده درست است.
  check(
    'وقتی همه‌ی مجوزهای پرسیدنی داده شده‌اند، صفحه لازم نیست',
    !setupNeeded(states),
    JSON.stringify(states),
  )

  useOS.setState({ config: config as any, phase: 'lock' })
  await act(async () => {
    await useOS.getState().unlock('token-test')
  })
  check('بدونِ مجوزِ کم، ورود مستقیم به دسکتاپ است', useOS.getState().phase === 'desktop', useOS.getState().phase)
}

/* ═══════ ۳) «هر بار کم بود»: «بعداً» فقط تا پایانِ همین باز بودنِ اپ ══════ */
{
  w.localStorage.clear()
  w.sessionStorage.clear()
  installBrowser(false)
  markSetupSeen()
  useOS.setState({ config: config as any, phase: 'lock' })
  await act(async () => {
    await useOS.getState().unlock('token-test')
  })
  check('اگر مجوزی کم باشد، اول صفحه‌ی آماده‌سازی می‌آید', useOS.getState().phase === 'setup', useOS.getState().phase)

  markSetupSkipped()
  await act(async () => {
    await useOS.getState().unlock('token-test')
  })
  check('بعد از «بعداً» همان ورود به دسکتاپ می‌رود', useOS.getState().phase === 'desktop', useOS.getState().phase)

  // «ورودِ بعدی»: مرورگر تازه باز شده (حافظه‌ی نشست خالی است) ولی مجوزها
  // هنوز کم‌اند — پس باید دوباره بپرسد.
  w.sessionStorage.clear()
  useOS.setState({ phase: 'lock' })
  await act(async () => {
    await useOS.getState().unlock('token-test')
  })
  check('ورودِ بعدی، تا وقتی مجوزی کم است، دوباره می‌پرسد', useOS.getState().phase === 'setup', useOS.getState().phase)

  clearSetupSkip()
  await act(async () => {
    await useOS.getState().unlock('token-test')
  })
  check('وقتی دوباره لازم شد، صفحه برمی‌گردد', useOS.getState().phase === 'setup', useOS.getState().phase)
}

/* ═════ ۴) مجوزی که مرورگر نمی‌دهد، هر بار دوباره پرسیده نمی‌شود ════════ */
{
  w.localStorage.clear()
  installBrowser(false) // persist() -> false (مثل مرورگری که اجازه نمی‌دهد)
  markSetupSeen()
  const before = await permissionStates()
  check('حافظه‌ی نگه‌داشته‌نشده «قابل‌پرسیدن» است', before.storage === 'prompt', before.storage)

  const { requestPermission, shouldAsk } = await import('../src/shared/permissions')
  const result = await requestPermission('storage')
  check('نتیجه‌ی «نه»ی مرورگر ثبت می‌شود', result === 'denied', result)
  const after = await permissionStates()
  check('از این به بعد دیگر روی کاربر نمی‌افتیم', !shouldAsk('storage', after.storage), after.storage)
}

console.log(failCount === 0 ? '\n🎉 آزمونِ آماده‌سازی و مجوزها پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
