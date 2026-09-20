/**
 * phone-notifications.tsx — آزمونِ «اعلانِ واقعیِ گوشی»
 *
 * چرا این آزمون؟
 *   اجازه‌ی اعلان تا وقتی کسی از آن استفاده نکند هیچ اثری ندارد. این تست ثابت
 *   می‌کند خبرِ *تازه* (و فقط خبرِ تازه) وقتی اپ جلوی چشم نیست، از دلِ
 *   سرویس‌ورکر روی گوشی اعلان می‌شود و اعلان‌های قدیمی دوباره نمی‌آیند — همان
 *   چیزی که روی اندروید لازم است (new Notification آنجا کار نمی‌کند).
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(dirname(fileURLToPath(import.meta.url)))
const publicDir = join(here, '..', 'public')

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
g.scrollTo = () => undefined
w.scrollTo = () => undefined
g.URL.createObjectURL = () => 'blob:fake'

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

/* ------------------------------------------------------ گوشیِ جعلی ------ */
const shownOnPhone: { title: string; body?: string; tag?: string }[] = []
const fakeRegistration = {
  showNotification: async (title: string, options: NotificationOptions = {}) => {
    shownOnPhone.push({ title, body: options.body, tag: options.tag })
  },
}
Object.defineProperty(w.navigator, 'serviceWorker', {
  configurable: true,
  value: {
    getRegistration: async () => fakeRegistration,
    ready: Promise.resolve(fakeRegistration),
  },
})

const notificationMock = { permission: 'granted' as string }
g.Notification = notificationMock
w.Notification = notificationMock

/* ------------------------------------------------------- سرورِ جعلی ----- */
const item = (id: number, title: string, isRead = false) => ({
  id,
  kind: 'letter',
  title,
  text: `متنِ ${title}`,
  icon: 'whisper',
  action_app: 'letters',
  is_read: isRead,
  created_at: '2026-09-20T10:00:00Z',
  payload: {},
})

let notifications: any[] = [item(1, 'نامه‌ی دیشب'), item(2, 'ویسِ صبح')]
let notificationsCalls = 0

g.fetch = async (url: string) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '')
  const json = (d: unknown, status = 200) => ({
    ok: status < 400,
    status,
    json: async () => d,
    text: async () => JSON.stringify(d),
    headers: { get: () => 'application/json' },
  })
  if (path.startsWith('/locales/')) {
    const lang = path.split('/')[2] === 'en' ? 'en' : 'fa'
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  if (path.endsWith('/api/notifications')) {
    notificationsCalls += 1
    return json({ unread: notifications.filter((n) => !n.is_read).length, items: notifications })
  }
  if (path.endsWith('/api/reminders')) return json({ items: [] })
  return json({ ok: true, items: [], unread: 0 })
}

const React = await import('react')
const { act } = React as any
const { createRoot } = await import('react-dom/client')
const { createElement: h } = React as any

const i18nModule = await import('../src/shared/i18n')
await i18nModule.i18nReady
await i18nModule.default.changeLanguage('fa')

const { NotificationCenter } = await import('../src/os/NotificationCenter')
const { useOS } = await import('../src/shared/store')
const { showSystemNotification } = await import('../src/shared/notify')

async function settle(ms = 260) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })
}

console.log('🧪 آزمونِ اعلانِ واقعیِ گوشی')

/* برای شبیه‌سازیِ «اپ در پس‌زمینه است» */
Object.defineProperty(w.document, 'hidden', { configurable: true, value: true })

const host = w.document.createElement('div')
w.document.body.appendChild(host)
const root = createRoot(host)
await act(async () => {
  root.render(h(NotificationCenter))
})
await settle()

check('مرکزِ اعلان خبرهای موجود را گرفت', notificationsCalls >= 1, String(notificationsCalls))
check('اعلان‌های قدیمی روی گوشی نمی‌آیند (فقط یادداشت می‌شوند)', shownOnPhone.length === 0, JSON.stringify(shownOnPhone))

/* خبرِ تازه می‌رسد و اپ در پس‌زمینه است -> باید روی گوشی اعلان شود */
notifications = [...notifications, item(3, 'ویس تازه‌ی بابا')]
await act(async () => {
  useOS.setState({ notificationsOpen: true }) // همان کارِ «مرکز اعلان را باز کن»
})
await settle()

check('خبرِ تازه روی گوشی اعلان شد', shownOnPhone.length === 1, JSON.stringify(shownOnPhone))
check('عنوانِ درست رفت', shownOnPhone[0]?.title === 'ویس تازه‌ی بابا', shownOnPhone[0]?.title)
check('متنِ خبر هم همراهش رفت', (shownOnPhone[0]?.body || '').includes('ویس تازه‌ی بابا'), shownOnPhone[0]?.body)
check('تگِ یکتا برای هر خبر', shownOnPhone[0]?.tag === 'loveos-notif-3', shownOnPhone[0]?.tag)

/* همان خبر باز هم load شود -> نباید دوباره اعلان شود */
notifications = [...notifications]
await act(async () => {
  useOS.setState({ notificationsOpen: false })
})
await settle()
await act(async () => {
  useOS.setState({ notificationsOpen: true })
})
await settle()
check('خبرِ تکراری دوباره اعلان نمی‌شود', shownOnPhone.length === 1, String(shownOnPhone.length))

/* اپ جلوی چشم است -> اعلانِ گوشی نه، چون خودش مرکز اعلان را می‌بیند */
Object.defineProperty(w.document, 'hidden', { configurable: true, value: false })
notifications = [...notifications, item(4, 'نامه‌ی تازه')]
await act(async () => {
  useOS.setState({ notificationsOpen: false })
})
await settle()
await act(async () => {
  useOS.setState({ notificationsOpen: true })
})
await settle()
check('وقتی اپ جلوی چشم است، اعلانِ گوشی نمی‌آید', shownOnPhone.length === 1, String(shownOnPhone.length))

/* بی‌اجازه -> هیچ اعلانی، ولی هیچ خطایی هم */
notificationMock.permission = 'denied'
Object.defineProperty(w.document, 'hidden', { configurable: true, value: true })
const sent = await showSystemNotification('سلام', { body: 'بدونِ اجازه' })
check('بدونِ اجازه، اعلان بی‌صدا رد می‌شود', sent === false && shownOnPhone.length === 1)

console.log(failCount === 0 ? '\n🎉 آزمونِ اعلانِ گوشی پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
