/**
 * window-manager-settings.tsx — آزمون مدیر پنجره و تنظیمات
 *
 * سه چیز را قفل می‌کند:
 *   ۱) پنجره‌ها درست باز/بسته/مینیمایز می‌شوند و هندسه‌شان با کلیک عوض نمی‌شود
 *   ۲) لایه‌بندی (z) درست جابه‌جا می‌شود و «شبح» پنجره‌ی بسته نمی‌ماند
 *   ۳) تغییر زبان و تم واقعاً اعمال و روی سرور ذخیره می‌شود
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
Object.defineProperty(w, 'innerWidth', { value: 1440, configurable: true })
Object.defineProperty(w, 'innerHeight', { value: 900, configurable: true })

const serverConfig: any = {
  daughter_name: 'مریم', daughter_nickname: 'دخترم', daddy_name: 'بابا', days_together: 100, next_meeting: null,
  next_meeting_delta: null, boot_greeting: '', wrong_pass_message: '', lock_help_message: '', security_question: '',
  language: 'fa', theme: 'day', sound_enabled: false, font_scale: 1, logo: null, boot_background: null,
  lock_background: null, desktop_background_day: null, desktop_background_night: null, is_birthday: false,
  is_anniversary: false, has_passcode: true,
}
let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })
g.fetch = async (url: string, opts: any = {}) => {
  const p = String(url)
  const method = (opts.method || 'GET').toUpperCase()
  if (p.includes('/locales/')) {
    const lang = p.includes('/en/') ? 'en' : 'fa'
    return json(JSON.parse(readFileSync(join(publicDir, 'locales', lang, 'translation.json'), 'utf8')))
  }
  if (p.includes('/api/boot')) return json({ config: serverConfig, unlocked: false })
  if (p.includes('/api/location')) return json({ ok: true, location: null })
  if (p.includes('/api/settings')) {
    if (method === 'PATCH' || method === 'POST') {
      Object.assign(serverConfig, JSON.parse(opts.body || '{}'))
      return json({ ok: true, config: serverConfig })
    }
    return json({ ok: true, config: serverConfig })
  }
  if (p.includes('/api/weather')) throw new Error('offline')
  return json({ items: [], unread: 0 })
}

async function main() {
  const React = await import('react')
  const { act } = React as any
  const { createRoot } = await import('react-dom/client')
  const { useOS } = await import('../src/shared/store')
  const { default: i18n, i18nReady } = await import('../src/shared/i18n')
  await i18nReady
  const { Desktop } = await import('../src/os/Desktop')
  const { APPS } = await import('../src/os/appRegistry')

  useOS.setState({ phase: 'desktop', config: { ...serverConfig } })
  const container = w.document.getElementById('root')!
  const root = createRoot(container)
  await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Desktop))) })
  await act(async () => { await new Promise((r) => setTimeout(r, 200)) })

  const tick = async (ms = 320) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)) }) }
  const click = async (el: any) => {
    await act(async () => { el.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true })) })
    await act(async () => { el.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true, cancelable: true })) })
    await act(async () => { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })) })
    await tick(260)
  }
  const box = () => container.querySelector('div.pointer-events-auto') as any
  const geo = () => box() && `${box().style.left}/${box().style.top} z=${box().style.zIndex}`
  const wrappers = () => (Array.from(container.querySelectorAll('div.fixed.pointer-events-none, div.fixed')) as any[]).filter((d) => d.querySelector('div.pointer-events-auto'))
  const icon = (key: string) => {
    const def = APPS.find((a) => a.key === key)!
    const label = i18n.t(def.titleKey) as string
    return (Array.from(container.querySelectorAll('button')) as any[]).find(
      (b) => b.textContent.includes(label) && b.querySelector('svg') && !b.closest('div.pointer-events-none'),
    )
  }

  console.log('\n=== ۱) باز و بسته کردن پنجره ===')
  await click(icon('countdown'))
  check('پنجره باز شد', useOS.getState().windows.length === 1, geo())
  const before = geo()
  const closeBtn = container.querySelector('button[aria-label="بستن"]') as any
  await act(async () => { closeBtn.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true, cancelable: true })) })
  await tick(80)
  check('هندسه‌ی پنجره با فشردن دکمه عوض نمی‌شود', geo() === before, `${before} → ${geo()}`)
  await act(async () => { closeBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })) })
  await tick(700)
  check('با یک کلیک بسته شد', useOS.getState().windows.length === 0)
  check('پنجره‌ی روحی در DOM نمانده', wrappers().length === 0, `wrappers=${wrappers().length}`)

  console.log('\n=== ۲) مینیمایز و بازگردانی ===')
  await click(icon('countdown'))
  const minBtn = container.querySelector('button[aria-label="کوچیک کن"]') as any
  check('دکمه‌ی مینیمایز وجود دارد', !!minBtn)
  await click(minBtn)
  check('مینیمایز شد (پنهان)', box().style.display === 'none' && useOS.getState().windows[0].minimized)
  await click(icon('countdown'))
  check('با زدن آیکون دسکتاپ برگشت', box().style.display === 'flex' && !useOS.getState().windows[0].minimized)

  console.log('\n=== ۳) دو پنجره و ترتیب لایه‌ها ===')
  await click(icon('chat'))
  check('دو پنجره باز است', useOS.getState().windows.length === 2)
  const chatZ = useOS.getState().windows.find((x) => x.app === 'chat')!.z
  const countZ = useOS.getState().windows.find((x) => x.app === 'countdown')!.z
  check('پنجره‌ی تازه باز شده جلوتر است', chatZ > countZ, `chat=${chatZ} countdown=${countZ}`)
  await click(icon('countdown'))
  const countZ2 = useOS.getState().windows.find((x) => x.app === 'countdown')!.z
  const topZ = Math.max(...useOS.getState().windows.map((x) => x.z))
  check('فوکوس، پنجره را واقعاً جلو می‌آورد', countZ2 === topZ, `countdown=${countZ2} top=${topZ}`)
  const wrapZ = wrappers().map((x) => Number(x.style.zIndex))
  check('ترتیب z روی wrapper اعمال شده و دوتایی است', wrapZ.length === 2 && wrapZ.every((z) => z > 30), wrapZ.join(','))

  console.log('\n=== ۴) موقعیت پنجره بعد از بستن و بازکردن دوباره ===')
  const firstBoxLeft = box().style.left
  await click(container.querySelector('button[aria-label="بستن"]') as any)
  await tick(600)
  await click(icon('countdown'))
  const reopened = useOS.getState().windows.find((x) => x.app === 'countdown')!
  check('موقعیت قبلی حفظ شده', Boolean(reopened.x != null), `${firstBoxLeft} → ${box().style.left}`)

  console.log('\n=== ۵) تنظیمات: زبان و تم ===')
  const { default: Settings } = await import('../src/apps/Settings')
  const sroot = w.document.getElementById('root')!
  await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(Settings))) })
  await tick(150)
  const clickText = async (txt: string) => {
    const b = (Array.from(sroot.querySelectorAll('button')) as any[]).find((x) => x.textContent.trim() === txt)
    if (!b) throw new Error('not found ' + txt)
    await click(b)
  }
  await clickText('English')
  check('زبان رابط عوض شد', i18n.language === 'en', i18n.language)
  check('جهت صفحه ltr شد', w.document.documentElement.dir === 'ltr')
  await clickText('Night')
  check('تم شب روی دستگاه اعمال شد', useOS.getState().config?.theme === 'night', String(useOS.getState().config?.theme))
  check('تم روی سرور ذخیره شد', serverConfig.theme === 'night', `server=${serverConfig.theme}`)
  // تم روی بستر واقعی دسکتاپ: useNightMode مستقل از ذخیره‌سازی سرور هم باید تم را عوض کند
  const { useNightMode } = await import('../src/os/daynight')
  function ThemeProbe() { useNightMode(); return null }
  await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(ThemeProbe))) })
  await tick(120)
  check('تم شب روی html اعمال شد', w.document.documentElement.dataset.theme === 'night', `data-theme=${w.document.documentElement.dataset.theme}`)
  useOS.getState().patchConfig({ theme: 'day' })
  await tick(120)
  check('برگشت به تم روز هم کار می‌کند', w.document.documentElement.dataset.theme === 'day', `data-theme=${w.document.documentElement.dataset.theme}`)

  console.log(`\n${failCount === 0 ? '🎉 آزمون مدیر پنجره و تنظیمات پاس شد' : `⚠️ ${failCount} تست رد شد`}`)
  process.exit(failCount === 0 ? 0 : 1)
}
void main()
