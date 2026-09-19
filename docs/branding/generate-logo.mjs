/**
 * generate-logo.mjs — تولیدکننده‌ی نشانِ LoveOS
 * ============================================
 *
 * نشان = «قلبِ باز که خطِ پایین‌راستش داخلِ بدنه به ∞ می‌رسد» (برگرفته از
 * گردنبندِ نقره‌ی هدیه). این اسکریپت هم دارایی‌های public و هم هندسه‌ی
 * کامپوننت React (frontend/src/shared/loveosMark.ts) را می‌سازد تا همه‌جا
 * یک نشانِ واحد داشته باشیم.
 *
 * اجرا:
 *   node docs/branding/generate-logo.mjs
 *
 * خروجی‌ها:
 *   frontend/public/favicon.svg                 فاوآیکون (تایل گردگوشه‌ی براق)
 *   frontend/public/icons/logo.svg              لوگوی اصلی (۵۱۲px)
 *   frontend/public/icons/app-192.png           آیکن PWA
 *   frontend/public/icons/app-512.png           آیکن PWA
 *   frontend/public/icons/maskable-512.png      آیکن maskable (ناحیه‌ی امن بزرگ‌تر)
 *   frontend/public/icons/apple-touch-icon.png  آیکن iOS (۱۸۰px، تمام‌مربع)
 *   frontend/src/shared/loveosMark.ts           مسیرهای قلب/∞ و نگین‌ها برای React
 *   frontend/index.html                         فقط بلوکِ اسپلش به‌روزرسانی می‌شود
 *
 * PNGها با @resvg/resvg-js ساخته می‌شوند. اگر نصب نبود، SVGها ساخته می‌شوند و
 * برای PNGها پیام راهنما چاپ می‌شود:
 *   npm i -D @resvg/resvg-js
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '..', '..')
const PUBLIC = resolve(ROOT, 'frontend/public')
const SRC = resolve(ROOT, 'frontend/src/shared')

const TAU = Math.PI * 2
const fmt = (v, p = 2) => (Math.round(v * 10 ** p) / 10 ** p).toString()
const num = (v, p = 2) => Number(fmt(v, p))
const add = (a, b) => [a[0] + b[0], a[1] + b[1]]
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]]
const mul = (a, k) => [a[0] * k, a[1] * k]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1])
const nrm = (a) => { const n = Math.hypot(a[0], a[1]) || 1; return [a[0] / n, a[1] / n] }
const rot = ([x, y], r) => [x * Math.cos(r) - y * Math.sin(r), x * Math.sin(r) + y * Math.cos(r)]
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** منحنی کلاسیک قلب (مختصات صفحه: y به پایین) — t=π نوکِ پایین، t=2π فرورفتگیِ بالا */
const heartPt = (t) => {
  const s = Math.sin(t)
  return [16 * s * s * s, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]
}
/** لمینِسکِت (شکل ∞): x در [-۱،۱]، گره در مرکز */
const lemiPt = (a) => { const s = Math.sin(a), d = 1 + s * s; return [Math.cos(a) / d, (s * Math.cos(a)) / d] }

/** منحنیِ نرمِ Catmull-Rom → دستورهای مسیر SVG */
function smooth(points, closed = false) {
  const q = points, n = q.length
  const at = (i) => (closed ? q[((i % n) + n) % n] : q[Math.max(0, Math.min(n - 1, i))])
  let d = `M${fmt(q[0][0])} ${fmt(q[0][1])}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`
  }
  return closed ? d + 'Z' : d
}
const subsample = (a, s) => a.filter((_, i) => i % s === 0 || i === a.length - 1)
const polyLen = (p, closed = false) => {
  let L = 0
  for (let i = 1; i < p.length; i++) L += dist(p[i - 1], p[i])
  return closed ? L + dist(p[p.length - 1], p[0]) : L
}

/**
 * هندسه‌ی نشان.
 * دو نقطه‌ی اتصال روی خطِ قلب: tJ روی سمت راست (ورودِ ∞) و tJoin پایین‌چپ
 * (خروجِ ∞). اندازه‌ی ∞ نسبتی از پهنای قلب است و کمی چرخیده.
 */
function geometry(opt = {}) {
  const O = {
    tJ: 2.61 * Math.PI,
    tJoin: 1.33 * Math.PI,
    yStretch: 1.16,
    theta: -0.19,
    sRatio: 0.40,
    extend: 0.16,
    view: 512,
    pad: 54,
    ...opt,
  }
  const stretch = (p) => [p[0], p[1] * O.yStretch]
  const outlinePt = (t) => stretch(heartPt(((t % TAU) + TAU) % TAU))
  const outlineTan = (t) => nrm(sub(outlinePt(t + 2e-3), outlinePt(t - 2e-3)))

  const outline = []
  const STEP = TAU / 220
  for (let t = Math.PI; t < 3 * Math.PI + 1e-9; t += STEP) outline.push(outlinePt(t))
  const bx = outline.map((p) => p[0]), by = outline.map((p) => p[1])
  const bb = { x0: Math.min(...bx), x1: Math.max(...bx), y0: Math.min(...by), y1: Math.max(...by) }
  const W = bb.x1 - bb.x0

  const J = outlinePt(O.tJ)
  const tJt = outlineTan(O.tJ)
  const P0 = outlinePt(O.tJoin)
  const tP0 = outlineTan(O.tJoin)
  const S = O.sRatio * W

  // فازِ ورود: مماسِ ∞ موازیِ خطِ قلب در نقطه‌ی J
  let aIn = 0, vBest = -2
  for (let i = 0; i < 4000; i++) {
    const a = TAU * (i / 4000)
    const q1 = rot(lemiPt(a - 1e-3), O.theta), q2 = rot(lemiPt(a + 1e-3), O.theta)
    const v = ((q2[0] - q1[0]) * tJt[0] + (q2[1] - q1[1]) * tJt[1]) / Math.hypot(q2[0] - q1[0], q2[1] - q1[1])
    if (v > vBest) { vBest = v; aIn = a }
  }
  const C = sub(J, mul(rot(lemiPt(aIn), O.theta), S))
  const world = (a) => add(C, mul(rot(lemiPt(a), O.theta), S))

  // یک دور کامل + رسیدن به نقطه‌ی tJoin؛ سرِ اضافه کمی زیر خطِ قلب پنهان می‌شود
  let aEnd = aIn, dBest = Infinity
  for (let i = 0; i <= 4000; i++) {
    const a = aIn + 1.2 * TAU + (0.9 * TAU) * (i / 4000)
    const d = dist(world(a), P0)
    if (d < dBest) { dBest = d; aEnd = a }
  }
  const aEndExt = aEnd + Math.sign(aEnd - aIn) * O.extend * Math.PI

  const inf = []
  const N = 240
  for (let i = 0; i <= N; i++) inf.push(world(aIn + (aEndExt - aIn) * (i / N)))

  const all = [...outline, ...inf]
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const k = Math.min((O.view - 2 * O.pad) / (x1 - x0), (O.view - 2 * O.pad) / (y1 - y0))
  const ox = (O.view - k * (x1 - x0)) / 2 - k * x0
  const oy = (O.view - k * (y1 - y0)) / 2 - k * y0
  const map = (arr) => arr.map(([x, y]) => [x * k + ox, y * k + oy])

  return { outline: map(outline), inf: map(inf), strokeW: num(2.15 * k * (W / 32)), k, W, TAU }
}

/** نگین‌های الماس: نقطه‌های ریز روی یک خط، با چرخشِ هم‌راستا با مسیر */
function pave(points, { count, skip = 0.05, r = 5, slant = 0.5 }) {
  const pts = subsample(points, 4)
  const total = pts.reduce((a, p, i) => (i ? a + dist(p, pts[i - 1]) : 0), 0)
  const out = []
  for (let i = 0; i < count; i++) {
    const target = total * (skip + (1 - 2 * skip) * (i / Math.max(1, count - 1)))
    let acc = 0
    for (let j = 1; j < pts.length; j++) {
      const d = dist(pts[j - 1], pts[j])
      if (acc + d >= target) {
        const t = (target - acc) / d
        const p = lerp(pts[j - 1], pts[j], t)
        const dir = nrm(sub(pts[Math.min(pts.length - 1, j + 1)], pts[j - 1]))
        out.push({ x: p[0], y: p[1], rot: Math.atan2(dir[1], dir[0]) + slant, r: r * (0.75 + 0.45 * ((i * 37) % 10) / 10) })
        break
      }
      acc += d
    }
  }
  return out
}

const G = geometry({ pad: 54 })
const SPARKS = [
  ...pave(subsample(G.outline, 3), { count: 10, r: G.strokeW * 0.30 }),
  ...pave(subsample(G.inf, 4), { count: 6, r: G.strokeW * 0.25 }),
]

// ------------------------------------------------------------------- SVGها
const ribbonDefs = (uid) => `
    <linearGradient id="ribbon${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd9ee"/><stop offset="18%" stop-color="#ff9ecb"/>
      <stop offset="52%" stop-color="#f767a8"/><stop offset="78%" stop-color="#d982f0"/>
      <stop offset="100%" stop-color="#bba0fb"/>
    </linearGradient>
    <linearGradient id="bg${uid}" x1="0" y1="0" x2="0.4" y2="1">
      <stop offset="0%" stop-color="#2a1030"/><stop offset="55%" stop-color="#160a1e"/><stop offset="100%" stop-color="#0b0410"/>
    </linearGradient>
    <linearGradient id="diamond${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/><stop offset="60%" stop-color="#ffeaf6"/><stop offset="100%" stop-color="#e8d6ff"/>
    </linearGradient>
    <linearGradient id="diamond2${uid}" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#ffffff" stop-opacity=".95"/><stop offset="100%" stop-color="#ffffff" stop-opacity=".35"/>
    </linearGradient>
    <radialGradient id="halo${uid}" cx="50%" cy="48%" r="52%">
      <stop offset="0%" stop-color="#ff8cc0" stop-opacity=".30"/><stop offset="70%" stop-color="#bba0fb" stop-opacity=".08"/><stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </radialGradient>`

const sparkleSVG = (s, uid) =>
  `<g transform="translate(${fmt(s.x, 1)} ${fmt(s.y, 1)}) rotate(${fmt((s.rot * 180) / Math.PI, 1)})">` +
  `<path d="M${fmt(-s.r, 1)} 0 L0 ${fmt(-s.r * 0.36, 1)} L${fmt(s.r, 1)} 0 L0 ${fmt(s.r * 0.36, 1)} Z" fill="url(#diamond${uid})"/>` +
  `<path d="M0 ${fmt(-s.r, 1)} L${fmt(s.r * 0.36, 1)} 0 L0 ${fmt(s.r, 1)} L${fmt(-s.r * 0.36, 1)} 0 Z" fill="url(#diamond2${uid})" opacity=".85"/></g>`

/**
 * SVGِ نشان. گزینه‌ها:
 *   pad      حاشیه‌ی داخلی (کوچک‌تر = بزرگ‌تر دیده شدن نشان)
 *   bg       'dark' تایلِ تیره · 'light' تایلِ روشن · 'none' بدون پس‌زمینه
 *   radius   گردیِ گوشه‌ها (۰ = مربع، ۱۱۲ ≈ آیکن سوپرالیپتیک)
 *   flat     true = خطِ ساده‌ی تک‌رنگِ رز (بدون گرادیان/نگین/درخشش)
 *   sparkles نگین‌های الماس
 *   glow     هاله‌ی نرمِ پشتِ نشان
 */
function markSVG({ pad = 54, bg = 'dark', radius = 112, flat = false, sparkles = SPARKS, glow = true, uid = '' }) {
  const g = geometry({ pad })
  const heart = smooth(subsample(g.outline, 2), true)
  const inf = smooth(subsample(g.inf, 2))
  const w = g.strokeW
  const stroke = flat ? '#f767a8' : `url(#ribbon${uid})`
  const tile = () => {
    if (bg === 'none') return ''
    const fill = bg === 'light' ? '#fff5fa' : `url(#bg${uid})`
    return `
  <rect width="512" height="512" rx="${radius}" fill="${fill}"/>
  <g clip-path="url(#clip${uid})">
  <circle cx="256" cy="248" r="212" fill="url(#halo${uid})"/>`
  }
  const tileEnd = () => (bg === 'none' ? '' : '\n  </g>')
  const gloss = (d, k, op) =>
    flat ? '' : `\n  <path d="${d}" fill="none" stroke="#fff" stroke-opacity="${op}" stroke-width="${fmt(w * k)}" stroke-linejoin="round" stroke-linecap="round"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="LoveOS">
  <defs>${flat ? '' : ribbonDefs(uid)}
    ${glow && !flat ? `<filter id="glow${uid}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : ''}
  </defs>
  <defs><clipPath id="clip${uid}"><rect width="512" height="512" rx="${radius}"/></clipPath></defs>${tile()}
  ${glow && !flat ? `<g filter="url(#glow${uid})" opacity=".5">
    <path d="${heart}" fill="none" stroke="${stroke}" stroke-width="${fmt(w * 1.08)}" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${inf}" fill="none" stroke="${stroke}" stroke-width="${fmt(w * 1.08)}" stroke-linejoin="round" stroke-linecap="round"/>
  </g>` : ''}
  <path d="${heart}" fill="none" stroke="${stroke}" stroke-width="${fmt(w)}" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${inf}" fill="none" stroke="${stroke}" stroke-width="${fmt(w)}" stroke-linejoin="round" stroke-linecap="round"/>${gloss(heart, 0.3, 0.26)}${gloss(inf, 0.26, 0.24)}
  ${flat ? '' : sparkles.map((s) => sparkleSVG(s, uid)).join('\n  ')}${tileEnd()}
</svg>
`
}

// --------------------------------------------------------------- خروجی‌ها
const favicon = markSVG({ pad: 34, radius: 112, sparkles: SPARKS.filter((_, i) => i % 2 === 0), glow: false, uid: 'F' })
const logo = markSVG({ uid: 'L' })
const maskable = markSVG({ pad: 86, radius: 0, sparkles: SPARKS.filter((_, i) => i % 3 === 0), uid: 'M' })
const apple = markSVG({ pad: 78, radius: 0, sparkles: SPARKS.filter((_, i) => i % 2 === 0), uid: 'A' })

// بسته‌ی مستندات (docs/branding) — همان نشان در چهار سلیقه‌ی مصرفی
const docsMark = markSVG({ uid: 'D1' })
const docsGlyph = markSVG({ bg: 'none', glow: false, uid: 'D2' })
const docsFlat = markSVG({ bg: 'none', flat: true, glow: false, uid: 'D3' })
const docsLight = markSVG({ bg: 'light', glow: false, uid: 'D4' })

writeFileSync(resolve(PUBLIC, 'favicon.svg'), favicon)
writeFileSync(resolve(PUBLIC, 'icons/logo.svg'), logo)
writeFileSync(resolve(HERE, 'logo-mark.svg'), docsMark)
writeFileSync(resolve(HERE, 'logo-glyph.svg'), docsGlyph)
writeFileSync(resolve(HERE, 'logo-flat.svg'), docsFlat)
writeFileSync(resolve(HERE, 'logo-light.svg'), docsLight)

// -------------------------------------------------- داده‌ی React (loveosMark.ts)
const heart = smooth(subsample(G.outline, 2), true)
const inf = smooth(subsample(G.inf, 2))
const reactSparks = [
  ...pave(subsample(G.outline, 1), { count: 9, r: G.strokeW * 0.30 }),
  ...pave(subsample(G.inf, 1), { count: 6, r: G.strokeW * 0.25 }),
].map((s) => ({ x: num(s.x), y: num(s.y), r: num(s.r), rot: num((s.rot * 180) / Math.PI, 1) }))

writeFileSync(resolve(SRC, 'loveosMark.ts'), `/**
 * هندسه‌ی نشان LoveOS — «قلبِ باز که خطِ پایین‌راستش داخلِ بدنه به ∞ می‌رسد».
 *
 * این فایل تولیدشده است؛ دستی ویرایش نکنید.
 * منبع: docs/branding/generate-logo.mjs  (node docs/branding/generate-logo.mjs)
 *
 * قلب یک مسیر بسته است و بینهایت مسیری باز که دو سرش زیر خط قلب پنهان می‌شود،
 * پس با یک چشم «یک خط پیوسته» دیده می‌شوند — همان کاری که گردنبند مرجع می‌کند.
 */

/** اندازه‌ی بومِ نشان (viewBox) */
export const MARK_VIEW = 512

/** ضخامت خطِ روبان در مقیاسِ بوم */
export const MARK_STROKE = ${G.strokeW}

/** مسیر بسته‌ی قلب (خطِ دور تا دور) */
export const HEART_PATH =
  '${heart}'

/** مسیر بازِ بینهایت که در دو نقطه به خطِ قلب می‌رسد */
export const INF_PATH =
  '${inf}'

/** نگین‌های الماس روی خط — زاویه بر حسب درجه */
export const MARK_SPARKLES: { x: number; y: number; r: number; rot: number }[] = ${JSON.stringify(reactSparks).replace(/\},\{/g, '},\n  {')}
`)

// ------------------------------------------------------- اسپلش (index.html)
const GS = geometry({ pad: 40 })
const heartSPts = subsample(GS.outline, 2), infSPts = subsample(GS.inf, 2)
const heartS = smooth(heartSPts, true), infS = smooth(infSPts)
const hs = GS.strokeW
const hLen = Math.ceil(polyLen(heartSPts, true)), iLen = Math.ceil(polyLen(infSPts))
const splashSparks = [
  ...pave(subsample(GS.outline, 3), { count: 6, r: GS.strokeW * 0.32 }),
  ...pave(subsample(GS.inf, 4), { count: 4, r: GS.strokeW * 0.28 }),
]
const sparkMarkup = splashSparks
  .map((s, i) => `<g class="ls-sp" style="--t:${(1.9 + i * 0.23).toFixed(2)}s" transform="translate(${fmt(s.x, 2)} ${fmt(s.y, 2)}) rotate(${fmt((s.rot * 180) / Math.PI, 1)})"><path d="M${fmt(-s.r, 2)} 0 L0 ${fmt(-s.r * 0.36, 1)} L${fmt(s.r, 2)} 0 L0 ${fmt(s.r * 0.36, 1)} Z" fill="#fff"/></g>`)
  .join('\n            ')

const splash = `<svg class="ls-mark" width="104" height="104" viewBox="0 0 512 512" aria-hidden="true">
          <defs>
            <linearGradient id="ls-g" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffd9ee" />
              <stop offset="18%" stop-color="#ff9ecb" />
              <stop offset="52%" stop-color="#f767a8" />
              <stop offset="78%" stop-color="#d982f0" />
              <stop offset="100%" stop-color="#bba0fb" />
            </linearGradient>
          </defs>
          <g class="ls-pulse">
            <path class="ls-draw ls-a" d="${heartS}" stroke="url(#ls-g)" stroke-width="${hs}" />
            <path class="ls-draw ls-a ls-core" d="${heartS}" stroke-width="${fmt(hs * 0.3)}" />
            <path class="ls-draw ls-b" d="${infS}" stroke="url(#ls-g)" stroke-width="${hs}" />
            <path class="ls-draw ls-b ls-core" d="${infS}" stroke-width="${fmt(hs * 0.26)}" />
            ${sparkMarkup}
          </g>
        </svg>`

const indexPath = resolve(ROOT, 'frontend/index.html')
let html = readFileSync(indexPath, 'utf8')
const start = html.indexOf('<svg class="ls-mark"')
if (start === -1) {
  console.warn('هشدار: بلوک اسپلش در index.html پیدا نشد؛ SVG اسپلش به‌روزرسانی نشد.')
} else {
  const end = html.indexOf('</svg>', start) + '</svg>'.length
  html = html.slice(0, start) + splash + html.slice(end)
  // طول مسیرها همان‌جایی است که انیمیشنِ کشیده‌شدن از آن استفاده می‌کند
  html = html.replace(/\.ls-a \{ --len: \d+;/, `.ls-a { --len: ${hLen};`)
  html = html.replace(/\.ls-b \{ --len: \d+;/, `.ls-b { --len: ${iLen};`)
  writeFileSync(indexPath, html)
}

// ------------------------------------------------------------------- PNGها
let Resvg = null
try {
  Resvg = (await import('@resvg/resvg-js')).Resvg
} catch {
  console.warn('@resvg/resvg-js نصب نیست؛ فقط SVGها ساخته شدند. برای PNGها: npm i -D @resvg/resvg-js')
}
if (Resvg) {
  const render = (svg, px) => new Resvg(svg, { fitTo: { mode: 'width', value: px } }).render().asPng()
  writeFileSync(resolve(PUBLIC, 'icons/app-192.png'), render(logo, 192))
  writeFileSync(resolve(PUBLIC, 'icons/app-512.png'), render(logo, 512))
  writeFileSync(resolve(PUBLIC, 'icons/maskable-512.png'), render(maskable, 512))
  writeFileSync(resolve(PUBLIC, 'icons/apple-touch-icon.png'), render(apple, 180))
}

// ------------------------------------------------------- پیش‌نمایشِ بسته‌ی نشان
if (Resvg) {
  const strip = [128, 96, 64, 48, 32, 24]
  let x = 372
  let marks = ''
  for (const px of strip) {
    marks += `<g transform="translate(${x} ${330}) scale(${fmt(px / 512, 4)})">${logo.slice(logo.indexOf('>') + 1, logo.lastIndexOf('</svg>'))}</g>`
    x += px + 26
  }
  const panel = (svg, tx, ty, sc) => `<g transform="translate(${tx} ${ty}) scale(${sc})">${svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))}</g>`
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="470" viewBox="0 0 900 470">
  <rect width="900" height="470" fill="#12071a"/>
  ${panel(docsMark, 30, 30, 0.63)}
  <rect x="360" y="30" width="510" height="512" rx="0" fill="none"/>
  <rect x="380" y="40" width="230" height="230" rx="24" fill="#f6eef8"/>
  ${panel(docsGlyph, 398, 58, 0.382)}
  <rect x="634" y="40" width="236" height="230" rx="24" fill="#ffffff"/>
  ${panel(docsLight, 646, 52, 0.4)}
  <rect x="380" y="290" width="490" height="150" rx="24" fill="#1d0e26"/>
  ${marks}
  <text x="30" y="440" fill="#e9d9f2" font-family="system-ui, sans-serif" font-size="19">LoveOS — heart + infinity, one continuous line</text>
</svg>`
  writeFileSync(resolve(HERE, 'logo-final-preview.png'), new Resvg(preview, { fitTo: { mode: 'width', value: 900 } }).render().asPng())
}

console.log('نشان ساخته شد:')
console.log(`  قلب ${hLen}px خط · ∞ ${iLen}px خط · ضخامت ${G.strokeW} (اسپلش) / ${hs} (روبان)`)
console.log('  frontend/public/favicon.svg · icons/logo.svg · icons/*.png · src/shared/loveosMark.ts')
