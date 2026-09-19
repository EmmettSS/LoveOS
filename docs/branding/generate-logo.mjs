/**
 * generate-logo.mjs — توليدکننده‌ی نشان LoveOS (منبعِ یکتای همه‌ی تصاویر برند)
 *
 * ساختارِ نشان دقیقاً بر اساس گردنبندِ مرجع (Logo-idea.jpg):
 *   خطِ قلب از سمتِ راست پایین می‌آید و همان خط، در پایینِ سمتِ راست، دو حلقه‌ی ∞
 *   را روی بدنه‌ی خودش می‌سازد (دو محلِ چسبیدنِ نزدیک، تقاطعِ اریب) و بعد تا نوکِ
 *   پایینِ قلب ادامه می‌دهد. یعنی ∞ جزئی از بدنه‌ی خطِ سمتِ راست قلب است، نه
 *   شکلی جدا داخلِ قلب؛ و هر لُب یک‌بار خط را قطع می‌کند.
 *
 * خروجی‌ها:
 *   frontend/public/favicon.svg · icons/logo.svg · icons/*.png
 *   frontend/src/shared/loveosMark.ts
 *   frontend/index.html (بلوکِ اسپلش) · backend/templates/admin_gate.html (نشانه‌ها)
 *   docs/branding/logo-*.svg · logo-final-preview.png
 *
 * اجرا:  node docs/branding/generate-logo.mjs
 * PNGها به @resvg/resvg-js نیاز دارند (npm i -D @resvg/resvg-js).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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
const nrm = (a) => { const n = Math.hypot(a[0], a[1]) || 1; return [a[0] / n, a[1] / n] }
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** منحنی کلاسیک قلب (مختصات صفحه: y به پایین) — t=π نوکِ پایین، t=2π فرورفتگیِ بالا */
const YS = 1.16
const heartPt = (t) => {
  const s = Math.sin(t)
  return [16 * s * s * s, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * YS]
}
const heartTan = (t) => nrm(sub(heartPt(t + 1e-3), heartPt(t - 1e-3)))

const bez = (P, t) => {
  const u = 1 - t
  return [
    u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
    u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1],
  ]
}

/** منحنیِ نرمِ Catmull-Rom → دستورهای مسیر SVG */
function smooth(points) {
  const p = points, n = p.length
  const at = (i) => p[Math.max(0, Math.min(n - 1, i))]
  let d = `M${fmt(p[0][0])} ${fmt(p[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C${fmt(c1[0])} ${fmt(c1[1])} ${fmt(c2[0])} ${fmt(c2[1])} ${fmt(p2[0])} ${fmt(p2[1])}`
  }
  return d
}
const subsample = (a, s) => a.filter((_, i) => i % s === 0 || i === a.length - 1)
const polyLen = (p) => {
  let L = 0
  for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1])
  return L
}

/**
 * لُبی که از نقطه‌ی W روی بدنه می‌گذرد و در همان‌جا با زاویه‌ی psi نسبت به خط
 * قطع می‌شود — همان «نیمه‌ی» ∞. side تعیین می‌کند لُب کدام طرفِ خط بیفتد.
 */
function loopAt(W, t, R, side, psi, steps = 260, squash = 1) {
  const tau = [
    t[0] * Math.cos(psi) - t[1] * Math.sin(psi) * side,
    t[0] * Math.sin(psi) * side + t[1] * Math.cos(psi),
  ]
  const n = [-tau[1] * side, tau[0] * side]
  const C = add(W, mul(n, R))
  const out = []
  for (let i = 1; i <= steps; i++) {
    const phi = TAU * (i / steps)
    out.push([
      C[0] + R * (-n[0] * Math.cos(phi) + squash * tau[0] * Math.sin(phi)),
      C[1] + R * (-n[1] * Math.cos(phi) + squash * tau[1] * Math.sin(phi)),
    ])
  }
  return out
}

/**
 * هندسه‌ی نشان. خروجی: دو مسیرِ باز (خطِ قلب و بدنه‌ی شاملِ ∞) + نگین‌ها.
 * هر دو مسیر از نوکِ قلب شروع/تمام می‌شوند، پس چشم یک خطِ پیوسته می‌بیند.
 */
export function geometry(opt = {}) {
  const O = {
    tJ: 2.50 * Math.PI,        // محلِ جدا شدنِ بدنه از خطِ قلب (سمتِ راست)
    handle: 0.40,              // نرمیِ قوسِ بدنه تا نوک
    lambda: 0.50,              // جای کمرِ ∞ روی بدنه
    gap: 0.10,                 // فاصله‌ی دو محلِ چسبیدن
    R: 4.6,                    // شعاعِ لُب‌ها
    squash: 1.0,               // کشیدگیِ لُب‌ها در جهتِ خط
    psi: 52 * (Math.PI / 180), // زاویه‌ی تقاطعِ لُب با خط
    side1: -1, side2: 1,       // بالا: بیرونِ قلب، پایین: داخلِ قلب
    view: 512, pad: 54, strokeW: null,
    ...opt,
  }
  const TIP = heartPt(Math.PI)
  const TIP_TAN = heartTan(Math.PI + 0.01)
  const A = heartPt(O.tJ), dA = heartTan(O.tJ)

  // بدنه: کوبیک از A تا نوک، با دو حلقه‌ی ∞ روی خودش
  const chord = Math.hypot(TIP[0] - A[0], TIP[1] - A[1])
  const P = [
    A,
    [A[0] + dA[0] * chord * O.handle, A[1] + dA[1] * chord * O.handle],
    [TIP[0] - TIP_TAN[0] * chord * O.handle, TIP[1] - TIP_TAN[1] * chord * O.handle],
    TIP,
  ]
  const M = 900
  const raw = [], cum = [0]
  for (let i = 0; i <= M; i++) raw.push(bez(P, i / M))
  for (let i = 1; i <= M; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]))
  const L = cum[M]
  const atS = (s) => {
    const x = Math.max(0, Math.min(1, s / L)) * M
    const i = Math.min(M - 1, Math.floor(x)), f = x - i
    return lerp(raw[i], raw[i + 1], f)
  }
  const tanAt = (s) => nrm(sub(atS(Math.min(L, s + L * 2e-3)), atS(Math.max(0, s - L * 2e-3))))

  const s1 = (O.lambda - O.gap / 2) * L
  const s2 = (O.lambda + O.gap / 2) * L
  const W1 = atS(s1), t1 = tanAt(s1)
  const W2 = atS(s2), t2 = tanAt(s2)

  const body = []
  const step = L / 500
  for (let x = 0; x < s1; x += step) body.push(atS(x))
  body.push(W1)
  for (const q of loopAt(W1, t1, O.R, O.side1, O.psi, 260, O.squash)) body.push(q)
  for (let x = s1; x < s2; x += step) body.push(atS(x))
  body.push(W2)
  for (const q of loopAt(W2, t2, O.R, O.side2, O.psi, 260, O.squash)) body.push(q)
  for (let x = s2; x <= L; x += step) body.push(atS(x))

  // خطِ قلب: از نوک تا A (لُبِ چپ، فرورفتگیِ بالا، سمتِ راست)
  const arc = []
  const N = 360
  for (let i = 0; i <= N; i++) arc.push(heartPt(Math.PI + (O.tJ - Math.PI) * (i / N)))

  // مقیاس و مرکز
  const all = [...arc, ...body]
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1])
  const bb = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }
  const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0
  const k = Math.min((O.view - 2 * O.pad) / w, (O.view - 2 * O.pad) / h)
  const ox = (O.view - k * w) / 2 - k * bb.x0
  const oy = (O.view - k * h) / 2 - k * bb.y0
  const map = ([x, y]) => [x * k + ox, y * k + oy]
  const strokeW = num(O.strokeW ?? 2.15 * k * (w / 32))

  const arcM = arc.map(map), bodyM = body.map(map)
  const heartPts = subsample(arcM, 2), bodyPts = subsample(bodyM, 3)

  return {
    view: O.view,
    pad: O.pad,
    strokeW,
    heart: heartPts,
    body: bodyPts,
    heartD: smooth(heartPts),
    bodyD: smooth(bodyPts),
    heartLen: polyLen(heartPts),
    bodyLen: polyLen(bodyPts),
    bb, O,
  }
}

/** نگین‌های الماس: نقطه‌های ریز روی یک خط، با چرخشِ هم‌راستا با مسیر */
function pave(points, { count, skip = 0.05, r = 5 }) {
  const out = []
  const n = points.length
  for (let i = 0; i < count; i++) {
    const f = skip + (1 - 2 * skip) * (count === 1 ? 0.5 : i / (count - 1))
    const j = Math.min(n - 1, Math.max(1, Math.round(f * (n - 1))))
    const t = nrm(sub(points[Math.min(n - 1, j + 1)], points[j - 1]))
    out.push({ x: points[j][0], y: points[j][1], r, rot: Math.atan2(t[1], t[0]) })
  }
  return out
}

const G = geometry({ pad: 54 })
const SPARKS = [
  ...pave(subsample(G.heart, 3), { count: 9, r: G.strokeW * 0.3 }),
  ...pave(subsample(G.body, 4), { count: 6, r: G.strokeW * 0.26 }),
]

// ------------------------------------------------------------------- SVGها
const ribbonDefs = (uid) => `
    <linearGradient id="rib${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffd9ee"/><stop offset="26%" stop-color="#ff9ecb"/><stop offset="52%" stop-color="#f767a8"/><stop offset="78%" stop-color="#d982f0"/><stop offset="100%" stop-color="#bba0fb"/>
    </linearGradient>
    <linearGradient id="ribL${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff9ecb"/><stop offset="55%" stop-color="#ef4f9b"/><stop offset="100%" stop-color="#a97cf7"/>
    </linearGradient>
    <linearGradient id="bg${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#2a1030"/><stop offset="55%" stop-color="#160a1e"/><stop offset="100%" stop-color="#0b0410"/>
    </linearGradient>
    <linearGradient id="bgL${uid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff8fc"/><stop offset="100%" stop-color="#f7ecff"/>
    </linearGradient>
    <radialGradient id="halo${uid}" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ff6ab8" stop-opacity="0.42"/><stop offset="70%" stop-color="#a855f7" stop-opacity="0.12"/><stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="dia${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#ffd9ee"/></linearGradient>
    <linearGradient id="dia2${uid}" x1="1" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#cfe9ff"/><stop offset="100%" stop-color="#ffffff"/></linearGradient>
    <filter id="glow${uid}" x="-25%" y="-25%" width="150%" height="150%">
      <feGaussianBlur stdDeviation="${fmt(G.strokeW * 0.42)}" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`

const sparkleSVG = (s, uid) => {
  const rad = (s.rot * 180) / Math.PI
  return `<g transform="translate(${fmt(s.x)} ${fmt(s.y)}) rotate(${fmt(rad, 1)})"><path d="M${fmt(-s.r)} 0Q0 ${fmt(s.r * 0.3)} ${fmt(s.r)} 0Q0 ${fmt(-s.r * 0.3)} ${fmt(-s.r)} 0Z" fill="url(#dia${uid})"/><path d="M0 ${fmt(-s.r)}Q${fmt(s.r * 0.3)} 0 0 ${fmt(s.r)}Q${fmt(-s.r * 0.3)} 0 0 ${fmt(-s.r)}Z" fill="url(#dia2${uid})"/></g>`
}

/**
 * نشان در چهار سلیقه‌ی مصرفی.
 *   pad      فاصله‌ی نشان از لبه‌ی بوم
 *   bg       dark | light | none
 *   radius   گردیِ گوشه‌ها (۰ = مربع، برای ماسک‌پذیر)
 *   flat     بدونِ درخشش و نگین (برای اندازه‌های ریز)
 */
function markSVG({ pad = 54, bg = 'dark', radius = 112, flat = false, sparkles = SPARKS, glow = true, uid = '' } = {}) {
  const g = pad === 54 ? G : geometry({ pad })
  const sparks = flat ? [] : sparkles
  const layers = []
  if (bg === 'dark') layers.push(`<rect width="512" height="512" rx="${radius}" fill="url(#bg${uid})"/>`)
  else if (bg === 'light') layers.push(`<rect width="512" height="512" rx="${radius}" fill="url(#bgL${uid})"/>`)
  const stroke = flat ? '#f767a8' : `url(#rib${uid})`
  const clip = bg === 'none' ? '' : ` clip-path="url(#tile${uid})"`
  const body = []
  body.push(`<circle cx="256" cy="${fmt(276)}" r="${fmt(205)}" fill="url(#halo${uid})"/>`)
  const draw = (st = stroke, sw = fmt(g.strokeW), extra = '') =>
    `<path d="${g.heartD}" fill="none" stroke="${st}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${extra}/><path d="${g.bodyD}" fill="none" stroke="${st}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${extra}/>`
  if (glow && !flat) body.push(`<g filter="url(#glow${uid})" opacity="0.55">${draw()}</g>`)
  body.push(draw())
  if (!flat) body.push(draw('#ffffff', fmt(g.strokeW * 0.26), ' opacity="0.3"'))
  if (sparks.length) body.push(sparks.map((s) => sparkleSVG(s, uid)).join(''))
  if (bg === 'none') layers.push(`<g>${body.join('')}</g>`)
  else layers.push(`<g clip-path="url(#tile${uid})">${body.join('')}</g>`)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>${ribbonDefs(uid)}${bg === 'none' ? '' : `<clipPath id="tile${uid}"><rect width="512" height="512" rx="${radius}" ry="${radius}"/></clipPath>`}</defs>
  ${layers.join('\n  ')}
</svg>
`
}

// --------------------------------------------------------------- خروجی‌ها
const favicon = markSVG({ pad: 34, radius: 112, flat: true, uid: 'F' })
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
const reactSparks = SPARKS.map((s) => ({ x: num(s.x), y: num(s.y), r: num(s.r), rot: num((s.rot * 180) / Math.PI, 1) }))
writeFileSync(resolve(SRC, 'loveosMark.ts'), `/**
 * هندسه‌ی نشان LoveOS — «قلب که خطِ پایین‌راستش روی بدنه به ∞ می‌رسد».
 *
 * این فایل تولیدشده است؛ دستی ویرایش نکنید.
 * منبع: docs/branding/generate-logo.mjs  (node docs/branding/generate-logo.mjs)
 *
 * ∞ جزئی از بدنه‌ی خطِ سمتِ راستِ قلب است (مطابقِ گردنبندِ مرجع): خط از سمتِ راست
 * پایین می‌آید، دو حلقه را روی بدنه‌ی خودش می‌سازد و تا نوکِ پایین ادامه می‌دهد.
 */

/** اندازه‌ی بومِ نشان (viewBox) */
export const MARK_VIEW = 512

/** ضخامت خطِ روبان در مقیاسِ بوم */
export const MARK_STROKE = ${G.strokeW}

/** مسیرِ خطِ قلب: از نوکِ پایین، لُبِ چپ، فرورفتگیِ بالا، تا سمتِ راست */
export const HEART_PATH =
  '${G.heartD}'

/** مسیرِ بدنه: از سمتِ راست، دو حلقه‌ی ∞ روی خط، تا نوکِ پایین */
export const BODY_PATH =
  '${G.bodyD}'

/** نگین‌های الماس روی خط — زاویه بر حسب درجه */
export const MARK_SPARKLES: { x: number; y: number; r: number; rot: number }[] = ${JSON.stringify(reactSparks).replace(/\},\{/g, '},\n  {')}
`)

// ------------------------------------------------------- اسپلش (index.html)
const GS = geometry({ pad: 40 })
const heartS = smooth(subsample(GS.heart, 2))
const bodyS = smooth(subsample(GS.body, 2))
const hs = GS.strokeW
const hLen = Math.ceil(polyLen(subsample(GS.heart, 2)))
const bLen = Math.ceil(polyLen(subsample(GS.body, 2)))
const splashSparks = [
  ...pave(subsample(GS.heart, 3), { count: 6, r: GS.strokeW * 0.32 }),
  ...pave(subsample(GS.body, 4), { count: 4, r: GS.strokeW * 0.28 }),
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
            <path class="ls-draw ls-b" d="${bodyS}" stroke="url(#ls-g)" stroke-width="${hs}" />
            <path class="ls-draw ls-b ls-core" d="${bodyS}" stroke-width="${fmt(hs * 0.26)}" />
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
  html = html.replace(/\.ls-b \{ --len: \d+;/, `.ls-b { --len: ${bLen};`)
  writeFileSync(indexPath, html)
}

// ------------------------------------------- دروازه‌ی پنل بابا (Django template)
// نسخه‌ی فشرده‌ی نشان: بدون درخشش، نمونه‌برداری درشت‌تر و چند نگین — چون داخلِ
// HTML می‌نشیند و باید سبک بماند. نمایشش ۷۶ پیکسل است، پس درشتیِ نمونه‌ها دیده نمی‌شود.
/** عددها را به یک رقم اعشار گرد می‌کند تا مسیرِ داخلِ HTML سبک بماند */
const coarse = (d) =>
  d.replace(/-?\d+(?:\.\d+)?/g, (m) => {
    const v = Math.round(parseFloat(m) * 10) / 10
    return Number.isInteger(v) ? String(v) : v.toFixed(1)
  })

const GG = geometry({ pad: 58 })
const gateHeart = coarse(smooth(subsample(GG.heart, 7)))
const gateBody = coarse(smooth(subsample(GG.body, 8)))
const gateW = GG.strokeW
const gateSparkles = pave(subsample(GG.heart, 3), { count: 5, r: GG.strokeW * 0.32 })

// آیکنِ فاوآیکونِ دروازه: ریزتر دیده می‌شود، پس درشت‌تر و بدونِ نگین
const GI = geometry({ pad: 46 })
const iconHeart = coarse(smooth(subsample(GI.heart, 13)))
const iconBody = coarse(smooth(subsample(GI.body, 14)))
const iconW = GI.strokeW

const gatePaths = (h, b, w, opac = ['0.26', '0.24'], sw = [0.3, 0.26]) =>
  `<path d="${h}" fill="none" stroke="url(#lg)" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${b}" fill="none" stroke="url(#lg)" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${h}" fill="none" stroke="#fff" stroke-opacity="${opac[0]}" stroke-width="${fmt(w * sw[0])}" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${b}" fill="none" stroke="#fff" stroke-opacity="${opac[1]}" stroke-width="${fmt(w * sw[1])}" stroke-linejoin="round" stroke-linecap="round"/>`

const gateDefs = `<defs>
      <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#ffd9ee"/><stop offset="26%" stop-color="#ff9ecb"/><stop offset="52%" stop-color="#f767a8"/><stop offset="78%" stop-color="#d982f0"/><stop offset="100%" stop-color="#bba0fb"/>
      </linearGradient>
      <linearGradient id="bg" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0%" stop-color="#2a1030"/><stop offset="55%" stop-color="#160a1e"/><stop offset="100%" stop-color="#0b0410"/></linearGradient>
    </defs>`

const gateSVG = `<svg class="loveos-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="76" height="76" role="img" aria-label="LoveOS">${gateDefs}
    <rect width="512" height="512" rx="112" fill="url(#bg)"/>
    ${gatePaths(gateHeart, gateBody, fmt(gateW))}
    ${gateSparkles.map((sp) => `<g transform="translate(${fmt(sp.x, 1)} ${fmt(sp.y, 1)}) rotate(${fmt((sp.rot * 180) / Math.PI, 1)})"><path d="M${fmt(-sp.r, 1)} 0 L0 ${fmt(-sp.r * 0.36, 1)} L${fmt(sp.r, 1)} 0 L0 ${fmt(sp.r * 0.36, 1)} Z" fill="#fff" opacity=".9"/></g>`).join('\n    ')}</svg>`

const gateIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${gateDefs}<rect width="512" height="512" rx="112" fill="url(#bg)"/>${gatePaths(iconHeart, iconBody, fmt(iconW))}</svg>`
const gateIconUri = `data:image/svg+xml,${encodeURIComponent(gateIcon)}`

const gatePath = resolve(ROOT, 'backend/templates/admin_gate.html')
{
  let gate = readFileSync(gatePath, 'utf8')
  const inject = (text, name, payload) => {
    const start = `{# ${name}:START #}`, end = `{# ${name}:END #}`
    const i = text.indexOf(start), j = text.indexOf(end)
    if (i === -1 || j === -1) {
      console.warn(`هشدار: نشانه‌ی ${name} در admin_gate.html پیدا نشد؛ همان بخش دست‌نخورده ماند.`)
      return text
    }
    return text.slice(0, i + start.length) + payload + text.slice(j)
  }
  gate = inject(gate, 'LOVEOS-FAVICON', `\n  <link rel="icon" type="image/svg+xml" href="${gateIconUri}">\n  `)
  gate = inject(gate, 'LOVEOS-LOGO', gateSVG)
  writeFileSync(gatePath, gate)
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
  // نوارِ اندازه‌ها: فاوآیکونِ تک‌رنگ در اندازه‌های کوچک، تا خوانایی سنجیده شود
  const strip = [96, 72, 56, 40, 32, 24]
  let x = 380
  let marks = ''
  for (const px of strip) {
    marks += `<g transform="translate(${x} ${300}) scale(${fmt(px / 512, 4)})">${favicon.slice(favicon.indexOf('>') + 1, favicon.lastIndexOf('</svg>'))}</g>`
    x += px + 16
  }
  const panel = (svg, tx, ty, sc) => `<g transform="translate(${tx} ${ty}) scale(${sc})">${svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'))}</g>`
  const preview = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="470" viewBox="0 0 900 470">
  <rect width="900" height="470" fill="#12071a"/>
  ${panel(docsMark, 30, 26, 0.6)}
  <text x="34" y="374" fill="#e9d9f2" font-family="system-ui, sans-serif" font-size="19">LoveOS — heart + infinity</text>
  <text x="34" y="398" fill="#b79ec9" font-family="system-ui, sans-serif" font-size="14">one continuous line · ∞ on the stroke</text>
  <rect x="380" y="40" width="230" height="230" rx="24" fill="#f6eef8"/>
  ${panel(docsGlyph, 398, 58, 0.382)}
  <rect x="634" y="40" width="236" height="230" rx="24" fill="#ffffff"/>
  ${panel(docsLight, 646, 52, 0.4)}
  <rect x="380" y="286" width="490" height="152" rx="24" fill="#1d0e26"/>
  ${marks}
  <text x="380" y="424" fill="#b79ec9" font-family="system-ui, sans-serif" font-size="14">favicon · 96 → 24 px</text>
</svg>`
  writeFileSync(resolve(HERE, 'logo-final-preview.png'), new Resvg(preview, { fitTo: { mode: 'width', value: 900 } }).render().asPng())
}

console.log('نشان ساخته شد:')
console.log(`  خطِ قلب ${Math.ceil(hLen)}px · بدنه‌ی ∞ ${Math.ceil(bLen)}px · ضخامت ${hs} (اسپلش) / ${G.strokeW} (روبان)`)
console.log('  frontend/public/favicon.svg · icons/logo.svg · icons/*.png · src/shared/loveosMark.ts')
console.log('  docs/branding/logo-*.svg · backend/templates/admin_gate.html')
