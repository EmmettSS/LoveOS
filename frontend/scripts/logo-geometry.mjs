#!/usr/bin/env node
/**
 * logo-geometry.mjs — هندسه‌ی دقیق لوگوی LoveOS (قلب + بی‌نهایت، viewBox 0 0 64 64)
 *
 * مسیرهای SVG لوگو حدس دستی نیستند؛ از این هندسه ساخته می‌شوند:
 *   • گوش‌های قلب: دو دایره (شعاع r، مرکزها 32±dx , cy) → کمان‌های بزیه‌ی دقیق
 *   • پهلوها: بزیه‌های مماس بر دایره‌ها که به نوک قلب می‌رسند
 *   • بی‌نهایت: دو حلقه‌ی دایره‌ای (شعاع rho، مرکزها ±c از تقاطع) با کمان‌های بلندتر از نیم‌دایره
 *     (beta) و گردن‌های بزیه با انحنای صفر در تقاطع (G2)، چرخیده ۴۵° و نشسته در گوشه‌ی پایین‌راست
 *   • پهلوی راست قلب دقیقاً جایی بریده می‌شود که فاصله‌ی سفیدش تا حلقه‌ی بالایی برابر gap شود
 * ساختار مطابق آویز مرجع (Logo-idea.jpg): حلقه‌ی پایینی کنار نوک قلب، حلقه‌ی بالایی کنار بدنه‌ی راست.
 *
 * اجرا:  node scripts/logo-geometry.mjs            → مسیرها و نقاط را چاپ می‌کند
 *        node scripts/logo-geometry.mjs --write    → public/favicon.svg و public/icons/logo.svg را می‌نویسد
 * خروجی‌ها باید با ثابت‌های src/shared/logo.ts و اسپلش index.html یکی باشند.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ------------------------------------------------------------------ پارامترها
const P = {
  r: 13.3, dx: 13.03, cy: 18.7,           // گوش‌ها
  tip: [33.6, 59.0],                       // نوک قلب (کمی راست‌تر از وسط، مثل آویز)
  tipAngle: 56, a: 21, b: 16,              // زاویه‌ی خروج از نوک و طول دسته‌های بزیه‌ی پهلوها
  infC: [42.49, 45.89],                    // نقطه‌ی تقاطع بی‌نهایت
  rho: 4.8, c: 6.46, beta: 30, gamma: 52, lambda: 0.417, // حلقه‌ها، کمان اضافه، نیم‌زاویه‌ی تقاطع، دسته‌ی گردن
  angle: -45,                              // محور بی‌نهایت (منفی = رو به بالا-راست)
  strokeW: 3.2, gap: 1.6,                  // ضخامت خط و فاصله‌ی سفید
  framed: { s: 0.49, tx: 16.32, ty: 19.754, stroke: 2 }, // نسخه‌ی داخل قاب پنجره (rect 7,10,50,42)
}

// ------------------------------------------------------------------ ابزار برداری
const add = (p, q) => [p[0] + q[0], p[1] + q[1]]
const sub = (p, q) => [p[0] - q[0], p[1] - q[1]]
const mul = (p, s) => [p[0] * s, p[1] * s]
const len = (p) => Math.hypot(p[0], p[1])
const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]
const rot = (p, ang) => [p[0] * Math.cos(ang) - p[1] * Math.sin(ang), p[0] * Math.sin(ang) + p[1] * Math.cos(ang)]
const deg = Math.PI / 180
const f2 = (n) => Math.round(n * 100) / 100

function bez([p0, p1, p2, p3], t) {
  const mt = 1 - t
  const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]
}
function splitLeft([p0, p1, p2, p3], t) {
  const p01 = lerp(p0, p1, t), p12 = lerp(p1, p2, t), p23 = lerp(p2, p3, t)
  const p012 = lerp(p01, p12, t), p123 = lerp(p12, p23, t)
  return [p0, p01, p012, lerp(p012, p123, t)]
}
/** کمان دایره (زاویه‌ها با قرارداد صفحه: y رو به پایین) به‌صورت بزیه‌های مکعبی */
function arc(cc, r, a0, a1, segments) {
  const out = []
  const step = (a1 - a0) / segments
  const k = (4 / 3) * Math.tan(Math.abs(step) / 4) * Math.sign(step)
  for (let i = 0; i < segments; i++) {
    const s = a0 + i * step, e = s + step
    const p0 = [cc[0] + r * Math.cos(s), cc[1] + r * Math.sin(s)]
    const p3 = [cc[0] + r * Math.cos(e), cc[1] + r * Math.sin(e)]
    const d0 = [-r * Math.sin(s), r * Math.cos(s)], d1 = [-r * Math.sin(e), r * Math.cos(e)]
    out.push([p0, add(p0, mul(d0, k)), sub(p3, mul(d1, k)), p3])
  }
  return out
}
const toPath = (cubics, close = false) => {
  let d = `M${f2(cubics[0][0][0])} ${f2(cubics[0][0][1])}`
  for (const [, p1, p2, p3] of cubics) d += ` C${f2(p1[0])} ${f2(p1[1])} ${f2(p2[0])} ${f2(p2[1])} ${f2(p3[0])} ${f2(p3[1])}`
  return close ? d + ' Z' : d
}

// ------------------------------------------------------------------ قلب
const L = [32 - P.dx, P.cy], R = [32 + P.dx, P.cy]
const west = [L[0] - P.r, P.cy], east = [R[0] + P.r, P.cy]
const notchY = P.cy - Math.sqrt(P.r * P.r - P.dx * P.dx)
const aNotchL = Math.atan2(notchY - P.cy, 32 - L[0])
const aNotchR = Math.atan2(notchY - P.cy, 32 - R[0]) + 2 * Math.PI
const dL = [-Math.cos(P.tipAngle * deg), -Math.sin(P.tipAngle * deg)]
const dR = [Math.cos(P.tipAngle * deg), -Math.sin(P.tipAngle * deg)]
const leftSide = [P.tip, add(P.tip, mul(dL, P.a)), [west[0], west[1] + P.b], west]
const leftLobe = [...arc(L, P.r, Math.PI, 1.5 * Math.PI, 1), ...arc(L, P.r, -Math.PI / 2, aNotchL, 1)]
const rightLobe = [...arc(R, P.r, aNotchR, 1.5 * Math.PI, 1), ...arc(R, P.r, -Math.PI / 2, 0, 1)]
const rightSideFull = [east, [east[0], east[1] + P.b], add(P.tip, mul(dR, P.a)), P.tip]

// ------------------------------------------------------------------ بی‌نهایت (مختصات محلی: تقاطع در مبدأ، محور +x)
function infinityLocal({ rho, c, beta, gamma, lambda }) {
  const b = beta * deg, g = gamma * deg
  const O = [0, 0]
  const aA = 90 * deg + b, aD = -90 * deg - b
  const A = [c + rho * Math.cos(aA), -rho * Math.sin(aA)]   // نقطه‌ی ورود به حلقه‌ی راست
  const D = [c + rho * Math.cos(aD), -rho * Math.sin(aD)]   // نقطه‌ی خروج از حلقه‌ی راست
  const dirO = [Math.cos(g), -Math.sin(g)], dirA = [Math.cos(b), -Math.sin(b)]
  const det = dirO[0] * dirA[1] - dirO[1] * dirA[0]
  const s = (A[0] * dirA[1] - A[1] * dirA[0]) / det       // P2 روی خط خروج از تقاطع → انحنای صفر در O
  const P2 = mul(dirO, s), P1 = mul(dirO, s * lambda)
  const mx = (p) => [p[0], -p[1]]
  // کمان حلقه‌ی راست با قرارداد ریاضی (y رو به بالا) → تبدیل به صفحه
  const arcR = []
  const segs = 3, step = (aD - aA) / segs
  const k = (4 / 3) * Math.tan(Math.abs(step) / 4) * Math.sign(step)
  for (let i = 0; i < segs; i++) {
    const a0 = aA + i * step, a1 = a0 + step
    const p0 = [c + rho * Math.cos(a0), -rho * Math.sin(a0)], p3 = [c + rho * Math.cos(a1), -rho * Math.sin(a1)]
    const d0 = [-rho * Math.sin(a0), -rho * Math.cos(a0)], d1 = [-rho * Math.sin(a1), -rho * Math.cos(a1)]
    arcR.push([p0, add(p0, mul(d0, k)), sub(p3, mul(d1, k)), p3])
  }
  const right = [[O, P1, P2, A], ...arcR, [D, mx(P2), mx(P1), O]]
  const pr = (p) => [-p[0], -p[1]]                          // حلقه‌ی چپ: تقارن مرکزی
  return [...right, ...right.map((cub) => cub.map(pr))]
}
const T = (p) => add(rot(p, P.angle * deg), P.infC)
const infinity = infinityLocal(P).map((cub) => cub.map(T))
const upperLoopC = T([P.c, 0]), lowerLoopC = T([-P.c, 0])

// ------------------------------------------------------------------ بریدن پهلوی راست قبل از حلقه‌ی بالایی
const stopDist = P.rho + P.strokeW + P.gap
let tEnd = 1
for (let i = 0; i <= 4000; i++) {
  const t = i / 4000
  if (len(sub(bez(rightSideFull, t), upperLoopC)) <= stopDist) { tEnd = t; break }
}
const rightSide = splitLeft(rightSideFull, tEnd)
const heart = [leftSide, ...leftLobe, ...rightLobe, rightSide]

// ------------------------------------------------------------------ خروجی‌ها
const heartPath = toPath(heart)
const infinityPath = toPath(infinity, true)
const { s: S, tx: TX, ty: TY } = P.framed
const tf = (cubics) => cubics.map((cub) => cub.map((p) => [p[0] * S + TX, p[1] * S + TY]))
const framedHeartPath = toPath(tf(heart))
const framedInfinityPath = toPath(tf(infinity), true)

const pt = (cub, t) => bez(cub, t).map(f2)
const gems = [pt(heart[0], 0.22), pt(heart[0], 0.42), pt(heart[0], 0.62), pt(heart[0], 0.82), pt(heart[1], 0), pt(heart[1], 0.5),
  pt(heart[2], 0), pt(heart[2], 0.5), pt(heart[3], 0.5), pt(heart[4], 0), pt(heart[4], 0.5)]
const curvePts = []
for (const cub of heart) for (let i = 0; i < 4; i++) curvePts.push(pt(cub, i / 4))
curvePts.push(pt(heart[heart.length - 1], 1))
for (const cub of infinity) for (let i = 0; i < 2; i++) curvePts.push(pt(cub, i / 2))
const seen = new Set()
const curvePoints = curvePts.filter((p) => { const k = p.join(','); if (seen.has(k)) return false; seen.add(k); return true })

const GRAD = `<linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff9ecb"/>
      <stop offset="55%" stop-color="#f767a8"/>
      <stop offset="100%" stop-color="#bba0fb"/>
    </linearGradient>`
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    ${GRAD}
  </defs>
  <!-- قلب + بی‌نهایت — یک مسیر با دو زیرمسیر: قلب توخالی (از نوک، بالا از سمت چپ، فرورفتگی، پایین از سمت راست)
       و بی‌نهایتِ مورب ۴۵° در گوشه‌ی پایین‌راست با فاصله‌ی کوچک از قلب؛ ساختار مطابق آویز مرجع (Logo-idea.jpg).
       هندسه دقیق است (scripts/logo-geometry.mjs): کمان‌های دایره‌ای برای گوش‌ها، بی‌نهایت از دو حلقه‌ی دایره‌ای با گردن‌های G2. -->
  <path d="${heartPath} ${infinityPath}" fill="none" stroke="url(#g)" stroke-width="${P.strokeW}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs>
    ${GRAD}
  </defs>
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#fff5f9"/>
  <rect x="7" y="10" width="50" height="42" rx="13" fill="url(#g)" opacity=".18"/>
  <rect x="7" y="10" width="50" height="42" rx="13" fill="none" stroke="url(#g)" stroke-width="2.4"/>
  <circle cx="15" cy="18" r="1.8" fill="#f767a8"/>
  <circle cx="21" cy="18" r="1.8" fill="#efc478"/>
  <circle cx="27" cy="18" r="1.8" fill="#bba0fb"/>
  <!-- قلب + بی‌نهایت — همان مسیر favicon.svg، کوچک‌شده (×${S}) داخل قاب پنجره؛ ساختار مطابق آویز مرجع -->
  <path d="${framedHeartPath} ${framedInfinityPath}" fill="none" stroke="url(#g)" stroke-width="${P.framed.stroke}" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`

const here = path.dirname(fileURLToPath(import.meta.url))
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(here, '../public/favicon.svg'), faviconSvg)
  fs.writeFileSync(path.join(here, '../public/icons/logo.svg'), logoSvg)
  console.log('✓ public/favicon.svg و public/icons/logo.svg نوشته شدند')
} else {
  const fmt = (pts) => pts.map(([x, y]) => `[${x}, ${y}]`).join(', ')
  console.log('LOGO_HEART_PATH     =', heartPath)
  console.log('LOGO_INFINITY_PATH  =', infinityPath)
  console.log('LOGO_INFINITY_CENTER=', P.infC, ' LOGO_TIP=', P.tip, ' LOGO_RIGHT_END=', rightSide[3].map(f2))
  console.log('FRAMED_HEART_PATH   =', framedHeartPath)
  console.log('FRAMED_INFINITY_PATH=', framedInfinityPath)
  console.log('LOGO_GEM_POINTS     =', fmt(gems))
  console.log('LOGO_CURVE_POINTS   =', fmt(curvePoints))
  console.log('gaps:', {
    tipToLowerLoop: f2(len(sub(P.tip, lowerLoopC)) - P.rho - P.strokeW),
    rightEndToUpperLoop: f2(len(sub(rightSide[3], upperLoopC)) - P.rho - P.strokeW),
  })
}
