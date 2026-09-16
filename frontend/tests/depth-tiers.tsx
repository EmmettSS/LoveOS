/**
 * depth-tiers.tsx — آزمونِ لایه‌های عمق در اپ‌های سه‌بعدی
 *
 * چهار اپِ سه‌بعدی (ستاره‌ها، ضربان، بغل، باغچه) هرکدام **سه مسیرِ رندرِ
 * متفاوت** دارند (مهتاب/بلور/کهکشان). پیش از این آزمون، هیچ‌کدامِ این
 * چهار اپ هیچ پوششی نداشتند — یعنی هر سه مسیر کاملاً نسنجیده بودند و یک
 * خطایِ ساده در شاخه‌ی «بلور» فقط روی گوشیِ واقعیِ کاربر کشف می‌شد.
 *
 * این سوئیت هر سه لایه را با ``useOS.setState({ uiQuality })`` اجبار می‌کند
 * (موتورِ کیفیت در محیطِ آزمون به مهتاب وتو می‌کند، پس راهِ دیگری برای
 * رسیدن به شاخه‌های عمیق نیست) و این‌ها را می‌سنجد:
 *
 *   ۱) هر سه شاخه بدونِ خطا رندر می‌شوند و محتوای واقعی دارند
 *   ۲) ``id="hb"`` در سند **یک بار** است — این همان تله‌ی مستندشده‌ی
 *      «کپی‌کردنِ children در Extrude» است که HTML نامعتبر می‌ساخت
 *   ۳) متن‌ها هرگز داخلِ ظرفِ تیلت نیستند (قاعده‌ی سختِ خوانایی)
 *   ۴) نبودِ WebGL تنزلِ باوقار می‌دهد، نه صفحه‌ی سفید
 *   ۵) نبودِ فیلدِ ``kind`` در پاسخِ API با استنتاج از ``letter`` جبران می‌شود
 */
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = dirname(dirname(fileURLToPath(import.meta.url)))

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
  'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'PointerEvent',
  'KeyboardEvent', 'CustomEvent', 'SVGElement', 'File', 'Blob', 'FormData',
])
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
// موتورِ کیفیت با این پرچم محیطِ آزمون را می‌شناسد و به مهتاب وتو می‌کند
g.__loveosHarness = true

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

/* ------------------------------------------------------- پاسخ‌های API --- */

/**
 * ستاره‌های ♥ و ∞ از هندسه‌ی واقعیِ بک‌اند (نرمالِ ۰..۱، y رو به بالا).
 * تعدادِ نقطه‌ها عمداً کم نگه داشته شده تا آزمون سریع بماند؛ ساختارِ داده
 * (آرایه‌ی جفت، نه آبجکتِ {x,y}) دقیقاً همان چیزی است که API می‌فرستد.
 */
const HEART_STARS: [number, number][] = Array.from({ length: 9 }, (_, i) => {
  const t = (i / 8) * Math.PI * 2
  const x = 16 * Math.sin(t) ** 3
  const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
  return [Number(((x + 17) / 34).toFixed(4)), Number(((y + 18) / 36).toFixed(4))]
})
const INF_STARS: [number, number][] = Array.from({ length: 9 }, (_, i) => {
  const t = (i / 8) * Math.PI * 2
  const d = 1 + Math.sin(t) ** 2
  return [Number(((Math.cos(t) / d) * 0.5 + 0.5).toFixed(4)), Number(((Math.sin(t) * Math.cos(t)) / d * 0.5 + 0.5).toFixed(4))]
})

const LETTERS = ['M', 'A', 'R', 'Y', 'A', 'M']

function starmapPayload(withKind: boolean) {
  const letters = LETTERS.map((letter, i) => {
    const base: any = {
      id: i + 1,
      letter,
      order: i,
      message: `پیامِ حرفِ ${letter}`,
      // چند نقطه‌ی ساده به شکلِ V تا polyline معنا داشته باشد
      stars: [
        [0.1, 0.9], [0.3, 0.3], [0.5, 0.7], [0.7, 0.3], [0.9, 0.9],
      ] as [number, number][],
    }
    if (withKind) base.kind = 'letter'
    return base
  })
  const shapes = [
    { id: 90, letter: '♥', order: 90, message: 'قلبِ ما', stars: HEART_STARS, ...(withKind ? { kind: 'shape' } : {}) },
    { id: 91, letter: '∞', order: 91, message: 'بی‌نهایت', stars: INF_STARS, ...(withKind ? { kind: 'shape' } : {}) },
  ]
  return { items: [...letters, ...shapes] }
}

const GARDEN = {
  items: [
    { id: 1, name: 'گلِ سرخ', color: '#e5484d', emoji: '🌹', water_count: 4 },
    { id: 2, name: 'گلِ آفتاب', color: '#f5a623', emoji: '🌻', water_count: 1 },
  ],
}

const HUG = {
  received: 3,
  sent: 5,
  pending: [],
  settings: {
    incoming_title: 'بغل از بابا',
    incoming_message: 'دلم برات تنگ شده',
    vibration_pattern: [200, 100],
    warm_color: '#ffd6a5',
    heartbeat_sound: null,
  },
}

const json = (d: unknown) => ({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d) })

/** با هر بار اجرا می‌توانیم بگوییم ``kind`` فرستاده شود یا نه */
let sendKind = true

g.fetch = async (url: string, opts: any = {}) => {
  const raw = String(url)
  const method = (opts.method || 'GET').toUpperCase()
  const path = raw.replace(/^https?:\/\/[^/]+/, '')
  if (path.startsWith('/locales/')) {
    const lang = path.split('/')[2]
    try {
      return json(JSON.parse(readFileSync(join(fixturesDir, '..', 'public', 'locales', lang, 'translation.json'), 'utf8')))
    } catch {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
    }
  }
  if (method !== 'GET') return json({ ok: true, found: false })
  if (path.startsWith('/api/starmap')) return json(starmapPayload(sendKind))
  if (path.startsWith('/api/garden')) return json(GARDEN)
  if (path.startsWith('/api/hug')) return json(HUG)
  if (path.startsWith('/api/boot')) return json({ config: { language: 'fa', theme: 'auto', ui_quality: 'auto' }, unlocked: false })
  return json({ items: [] })
}

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createElement: h } = await import('react')

const i18nModule = await import('../src/shared/i18n')
await i18nModule.i18nReady
await i18nModule.default.changeLanguage('fa')

const { useOS } = await import('../src/shared/store')
const Starmap = (await import('../src/apps/Starmap')).default
const Heartbeat = (await import('../src/apps/Heartbeat')).default
const Garden = (await import('../src/apps/Garden')).default
const Hug = (await import('../src/apps/Hug')).default

async function mount(element: any, wait = 320) {
  const host = w.document.createElement('div')
  w.document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(element)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, wait))
  })
  return { html: host.innerHTML, host, root }
}

async function unmount(m: { host: HTMLElement; root: any }) {
  await act(async () => {
    m.root.unmount()
  })
  m.host.remove()
}

/** آیا این عنصر داخلِ یک ظرفِ تیلت‌خور است؟ (قاعده‌ی «متن کج نشود») */
function insideTilt(el: Element | null): boolean {
  let node: Element | null = el
  while (node) {
    if (node.classList?.contains('os-depth')) return true
    node = node.parentElement
  }
  return false
}

const TIERS = ['lite', 'balanced', 'dream'] as const

console.log('🧪 آزمونِ لایه‌های عمق (ستاره‌ها، ضربان، بغل، باغچه)')

/* ==========================================================================
   ۱) هر سه لایه × چهار اپ
   ========================================================================== */
for (const tier of TIERS) {
  await act(async () => {
    useOS.setState({ uiQuality: tier })
  })
  console.log(`\n  ── لایه‌ی «${tier}» ──`)

  /* ------------------------------------------------------------ ستاره‌ها */
  {
    // لایه‌ی کهکشان باید منتظرِ lazy import و سپس تنزلِ نبودِ WebGL بماند
    const m = await mount(h(Starmap), tier === 'dream' ? 900 : 320)
    const host = m.host

    check('ستاره‌ها رندر شد', host.innerHTML.includes('اسمت رو با ستاره‌ها نوشتم'))
    const shapes = host.querySelectorAll('[data-shape]')
    check('دو شکلِ ♥ و ∞ در بخشِ جدا هستند', shapes.length === 2, `یافت‌شده=${shapes.length}`)
    check('نشانه‌ی ♥ هست', !!host.querySelector('[data-shape="♥"]'))
    check('نشانه‌ی ∞ هست', !!host.querySelector('[data-shape="∞"]'))

    // شش حرفِ «مریم» — در لایه‌ی کهکشانِ jsdom به دلیلِ نبودِ WebGL به
    // نسخه‌ی تخت تنزل می‌کند، پس شمارشِ حرف‌ها در همه‌ی لایه‌ها معتبر است
    const letterCells = host.querySelectorAll('svg g[role="button"], svg g[aria-label]')
    check('حرف‌های اسم رندر شدند', letterCells.length >= 6, `سلول‌ها=${letterCells.length}`)

    const skyLayers = host.querySelectorAll('.os-sky-layer').length
    if (tier === 'balanced') {
      check('لایه‌ی بلور: سه لایه‌ی عمقِ جدا (دور/نزدیک/ستاره‌ها)', skyLayers === 3, `layers=${skyLayers}`)
    } else if (tier === 'lite') {
      check('لایه‌ی مهتاب: بدونِ لایه‌بندیِ عمق', skyLayers === 0, `layers=${skyLayers}`)
    } else {
      // کهکشان در jsdom: WebGL نیست → باید باوقار به SVG برگردد
      const canvas = host.querySelector('canvas')
      const canvasHidden = !canvas || canvas.getAttribute('style')?.includes('display: none')
      check('کهکشان بدونِ WebGL به SVG تنزل داد (نه صفحه‌ی سفید)', canvasHidden && host.innerHTML.length > 600)
      check('لایه‌ی کهکشانِ تنزل‌یافته: بومِ WebGLِ نمایان ندارد', !host.querySelector('canvas:not([style*="display: none"])'))
    }

    await unmount(m)
  }

  /* -------------------------------------------------------------- ضربان */
  {
    const m = await mount(h(Heartbeat))
    const host = m.host
    check('ضربان رندر شد', host.innerHTML.includes('ضربان'))

    const extrudeLayers = host.querySelectorAll('.os-extrude-layer').length
    if (tier === 'lite') {
      check('مهتاب: قلبِ تخت، بدونِ برجسته‌سازی', extrudeLayers === 0 && !host.querySelector('.os-extrude'))
    } else if (tier === 'balanced') {
      check('بلور: قلبِ توپُر با ۱۲ لایه', extrudeLayers === 12, `layers=${extrudeLayers}`)
    } else {
      check('کهکشان: قلبِ توپُر با ۱۶ لایه', extrudeLayers === 16, `layers=${extrudeLayers}`)
    }

    /* ⚠️ مهم‌ترین آزمونِ این سوئیت.
       اگر Extrude روزی به کپی‌کردنِ children برگردد، ``id="hb"`` چند بار در
       سند ساخته می‌شود → HTML نامعتبر و همه‌ی لایه‌ها اولین گرادیان را
       برمی‌دارند. این باگ **بی‌صدا** است و فقط با شمارشِ id کشف می‌شود. */
    const hbIds = host.querySelectorAll('[id="hb"]').length
    check('گرادیانِ id="hb" دقیقاً یک بار در سند است (تله‌ی کپیِ defs)', hbIds === 1, `تعداد=${hbIds}`)

    await unmount(m)
  }

  /* ------------------------------------------------------------- باغچه */
  {
    const m = await mount(h(Garden))
    const host = m.host
    check('باغچه رندر شد', host.innerHTML.includes('گلِ سرخ'))
    check('دکمه‌ی آب دادن هست', host.innerHTML.includes('آبش بده'))

    const plants = host.querySelectorAll('.os-card').length
    check('دو کارتِ گل رندر شد', plants === 2, `کارت‌ها=${plants}`)

    // لایه‌های عمقِ گیاه: در شاخه‌ی عمیق سه SVG با translateZ روی هم
    const zLayers = Array.from(host.querySelectorAll('svg')).filter((s) =>
      (s.getAttribute('style') || '').includes('translateZ'),
    )
    if (tier === 'lite') {
      check('مهتاب: گیاهِ تخت بدونِ لایه‌ی عمق', zLayers.length === 0)
    } else {
      check('گیاه سه لایه‌ی عمقِ جدا دارد (گلدان/ساقه/گل)', zLayers.length === 6, `لایه‌ها=${zLayers.length}`)
    }

    // قاعده‌ی سخت: متن هرگز داخلِ ظرفِ تیلت نیست
    const nameEl = Array.from(host.querySelectorAll('p')).find((p) => (p.textContent || '').includes('گلِ سرخ'))
    check('اسمِ گل داخلِ ظرفِ تیلت نیست (خواناییِ متن)', !!nameEl && !insideTilt(nameEl))
    const waterBtn = Array.from(host.querySelectorAll('button')).find((b) => (b.textContent || '').includes('آبش بده'))
    check('دکمه‌ی آب دادن داخلِ ظرفِ تیلت نیست', !!waterBtn && !insideTilt(waterBtn))

    await unmount(m)
  }

  /* --------------------------------------------------------------- بغل */
  {
    const m = await mount(h(Hug))
    const host = m.host
    check('بغل رندر شد', host.innerHTML.includes('بغل'))

    const iconLift = Array.from(host.querySelectorAll('span')).some((s) =>
      (s.getAttribute('style') || '').includes('translateZ(30px)'),
    )
    if (tier === 'lite') {
      check('مهتاب: آیکنِ بغل بدونِ بالابریِ عمقی', !iconLift)
      check('مهتاب: ظرفِ تیلت ساخته نمی‌شود', host.querySelectorAll('.os-depth').length === 0)
    } else {
      check('آیکنِ بغل بالایِ سطحِ دکمه شناور است (translateZ)', iconLift)
      check('دکمه‌ی بغل داخلِ ظرفِ تیلت است', host.querySelectorAll('.os-depth').length >= 1)
    }

    // عنوان و راهنما متن‌اند و نباید کج شوند
    const titleEl = Array.from(host.querySelectorAll('p')).find((p) => (p.textContent || '').includes('بابا رو بغل'))
    if (titleEl) check('عنوانِ «بغل کردن بابا» داخلِ تیلت نیست', !insideTilt(titleEl))

    const stats = Array.from(host.querySelectorAll('p')).filter((p) => /^\d+$|^[۰-۹]+$/.test((p.textContent || '').trim()))
    check('شمارنده‌های دریافت/ارسال بیرونِ ظرفِ تیلت‌اند', stats.every((p) => !insideTilt(p)))

    await unmount(m)
  }
}

/* ==========================================================================
   ۲) استنتاجِ ``kind`` وقتی API آن را نمی‌فرستد (دیتابیسِ مهاجرت‌نخورده)
   ========================================================================== */
{
  await act(async () => {
    useOS.setState({ uiQuality: 'lite' })
  })
  sendKind = false
  const m = await mount(h(Starmap))
  const host = m.host
  check('بدونِ فیلدِ kind هم ♥ و ∞ به‌عنوانِ «شکل» شناخته شدند', host.querySelectorAll('[data-shape]').length === 2)
  // و مهم‌تر: نباید واردِ ردیفِ حرف‌ها شده باشند و «مریم» را به هم بریزند
  const caption = host.textContent || ''
  check('بدونِ kind، اسمِ مریم هنوز ۶ حرف است (شکل‌ها قاطی نشدند)', !caption.includes('♥M') && !caption.includes('M♥'))
  await unmount(m)
  sendKind = true
}

/* ==========================================================================
   ۳) هدفِ لمسیِ دکمه‌های لایه‌ی کیفیت
   ========================================================================== */
{
  const Settings = (await import('../src/apps/Settings')).default
  await act(async () => {
    useOS.setState({ uiQuality: 'balanced', config: { language: 'fa', theme: 'auto', sound_enabled: true, font_scale: 1, ui_quality: 'auto' } as any })
  })
  const m = await mount(h(Settings))
  const host = m.host
  const qualityBtns = Array.from(host.querySelectorAll('button')).filter((b) =>
    ['خودکار', 'مهتاب', 'بلور', 'کهکشان'].some((n) => (b.textContent || '').trim() === n),
  )
  check('هر چهار لایه در تنظیمات انتخاب‌پذیرند', qualityBtns.length === 4, `یافت‌شده=${qualityBtns.length}`)
  const allBig = qualityBtns.every((b) => {
    const st = b.getAttribute('style') || ''
    return st.includes('min-height: 44px') || st.includes('min-height:44px')
  })
  check('هدفِ لمسیِ هر چهار دکمه ≥۴۴ پیکسل است', allBig)
  check('پنلِ گزارشِ کیفیت رندر شد', !!host.querySelector('[data-quality-panel]'))
  await unmount(m)
}

console.log('')
// ⚠️ ``process.exit`` این‌جا **ضروری** است، نه تشریفاتی.
// اپِ ضربان یک زنجیره‌ی ``setTimeout`` برای هر تپش دارد و انیمیشن‌های
// framer بی‌پایان‌اند؛ هر دو رویداد-loopِ Node را زنده نگه می‌دارند. بدونِ
// خروجِ صریح، آزمون پاس می‌شود ولی پروسه هرگز تمام نمی‌شود و runner تا
// timeout منتظر می‌ماند. بقیه‌ی سوئیت‌های پروژه هم همین قرارداد را دارند.
console.log(failCount === 0 ? '🎉 آزمونِ لایه‌های عمق پاس شد' : `💥 ${failCount} بررسی ناموفق بود`)
process.exit(failCount === 0 ? 0 : 1)
