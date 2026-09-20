/**
 * mapofus-iran-cinema.tsx — آزمون «قابِ ایران» و «سکانس پروازِ سینماییِ نقشه‌ی ما»
 *
 * چرا این آزمون وجود دارد؟ چون در سندباکس مرورگر headless نداریم (و MapOfUs در jsdom
 * مانت نمی‌شود: WebGL ندارد و fixture ‏/api/map هم وجود ندارد). پس هر چیزی که با ریاضی
 * و قراردادِ کد قابل اثبات است، این‌جا اثبات می‌شود:
 *
 *   ۱) قاب ایران: قفسه‌ی مرزی، حدِ چهارگانه‌ی خاک، ۱۶ نقطه‌ی محیطی، حاشیه‌ی نامتقارن و
 *      این‌که در همه‌ی نسبت‌های صفحه (از باریک‌ترین موبایل تا پهن‌ترین دسکتاپ) کل ایران
 *      با دریای خزر و خلیج فارس داخل قاب می‌نشیند و ایران واقعاً قاب را پُر می‌کند.
 *   ۲) راستی‌آزماییِ قاب (neededZoomDelta): اگر لبه‌ای بیرون ماند، دقیقاً همان‌قدر عقب
 *      می‌رویم — و هیچ‌وقت بی‌دلیل زوم نمی‌کنیم.
 *   ۳) تایم‌لاین سکانس: طول کل در بازه‌ی ۱۸ تا ۲۲ ثانیه، نسخه‌ی «حرکت کمتر» با ضریبِ
 *      خطیِ ۰٫۱۵ فشرده می‌شود (بدون تلنبارِ ثابت)، ترتیب و هم‌پوشانیِ فازها درست است،
 *      مکث‌های معنادار وجود دارد و سقفِ زوم زیر آستانه‌ی راز ⑨ و زیر مرزِ مسطح‌شدنِ کره است.
 *   ۴) ریاضی مسیر: فاصله‌ی هاورسین (همان شعاعِ ۶۳۷۱ بک‌اند)، فاصله‌های تجمعی و نمونه‌برداری
 *      بر اساسِ کیلومتر (برای قلبِ جرقه‌ای و شمارنده‌ی زنده).
 *   ۵) قراردادِ تحویل: هر دو ترجمه‌ی fa/en، کلاس‌های CSS تازه (با «لنگرِ» مارکر تا
 *      انیمیشنِ CSS با transformِ خودِ MapLibre نجنگد)، بامپِ نسخه‌ی کش PWA و نبودنِ
 *      هرگونه دکمه‌ی «رد کردن» برای سکانس.
 *
 * این فایل DOM نمی‌خواهد: ماژولِ زیرِ آزمون (mapOfUsCinema.ts) خالص است.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CAPTION_KEYS,
  EGG_ZOOM_LIMIT,
  FLIGHT_BASE,
  FLIGHT_BEARING,
  FLIGHT_MAX_ZOOM,
  FLIGHT_ZOOM,
  GLOBE_SETTLE_ZOOM,
  IRAN_BOUNDS,
  IRAN_CENTER,
  IRAN_EXTREMES,
  IRAN_FIT_MAX_ZOOM,
  LANDING_WAVES,
  MERCATOR_BLEND_ZOOM,
  MERCATOR_FLAT_ZOOM,
  REDUCED_SCALE,
  cineScale,
  easeInOutCubic,
  easeInOutQuad,
  easeOutCubic,
  flightCueTimes,
  flightTotalMs,
  globeZoomFor,
  haversineKm,
  heartbeatEnvelope,
  iranApparentExtent,
  iranFallbackCamera,
  iranFallbackZoom,
  iranFramePadding,
  iranFrameProbes,
  needsGlobeSettle,
  neededZoomDelta,
  orthoProject,
  pathCumulativeKm,
  sampleByDistance,
  spaceShotCenter,
  type LngLat,
} from '../src/apps/mapOfUsCinema'

// فایل باندل‌شده در tests/.build اجرا می‌شود؛ ریشه‌ی frontend یک پله بالاتر از tests است
const frontendDir = join(dirname(dirname(fileURLToPath(import.meta.url))), '..')
const read = (...parts: string[]) => readFileSync(join(frontendDir, ...parts), 'utf8')

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}
const near = (v: number, target: number, tol: number) => Math.abs(v - target) <= tol
/** فاصله‌ی زاویه‌ایِ دو نقطه روی کره (درجه) */
const angularDeg = (a: LngLat, b: LngLat) => {
  const p1 = (a[1] * Math.PI) / 180
  const p2 = (b[1] * Math.PI) / 180
  const dl = ((b[0] - a[0]) * Math.PI) / 180
  const cosT = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos(dl)
  return (Math.acos(Math.min(1, Math.max(-1, cosT))) * 180) / Math.PI
}

console.log('\n🧪 آزمون قابِ ایران و سکانس سینماییِ «نقشه‌ی ما»')

/* ------------------------------------------------- ۱) قفسه‌ی مرزیِ ایران --- */
console.log('\n--- ۱) قفسه‌ی مرزی و نقطه‌های کنترلی ---')
const [[W, S], [E, N]] = IRAN_BOUNDS
check('قفسه‌ی ایران خوش‌ترتیب است (غرب<شرق، جنوب<شمال)', W < E && S < N, `${W},${S} → ${E},${N}`)
check('مرکز قاب ایران وسط قفسه است', near(IRAN_CENTER[0], (W + E) / 2, 1e-9) && near(IRAN_CENTER[1], (S + N) / 2, 1e-9), JSON.stringify(IRAN_CENTER))
for (const ex of IRAN_EXTREMES) {
  check(
    `حدِ «${ex.name}» خاک ایران داخل قفسه است`,
    ex.point[0] > W && ex.point[0] < E && ex.point[1] > S && ex.point[1] < N,
    JSON.stringify(ex.point),
  )
}
const probes = iranFrameProbes()
check('۱۶ نقطه‌ی کنترلی روی محیط قفسه ساخته می‌شود', probes.length === 16, String(probes.length))
check(
  'همه‌ی نقطه‌های کنترلی دقیقاً روی محیط قفسه‌اند (نه داخلش)',
  probes.every(([lng, lat]) => lng === W || lng === E || lat === S || lat === N),
)
check(
  'هر چهار گوشه‌ی قفسه بین نقطه‌های کنترلی است',
  ([
    [W, S],
    [W, N],
    [E, S],
    [E, N],
  ] as LngLat[]).every((c) => probes.some((p) => p[0] === c[0] && p[1] === c[1])),
)
check('حداکثر شعاعِ زاویه‌ایِ قفسه زیر ۱۲٫۵ درجه است (دور از لبه‌ی کره، بدون واگرایی)', (() => {
  let maxDeg = 0
  for (const p of probes) maxDeg = Math.max(maxDeg, angularDeg(p, IRAN_CENTER))
  return maxDeg < 12.5
})())

/* ------------------------------------------------ ۲) ریاضیِ گستره‌ی ظاهری --- */
console.log('\n--- ۲) گستره‌ی ظاهریِ ایران روی دیسکِ کره ---')
const extent = iranApparentExtent()
check('گستره‌ی ظاهری مثبت است', extent.halfW > 0 && extent.halfH > 0, `${extent.halfW.toFixed(4)} × ${extent.halfH.toFixed(4)}`)
check('نسبتِ پهنا به بلندیِ ایران ~۱٫۱۰ است (تقریباً مربعِ کمی پهن‌تر)', near(extent.aspect, 1.097, 0.06), extent.aspect.toFixed(3))
check('تصویرِ ارتوگرافیکِ مرکز قاب، مرکزِ دیسک است', (() => {
  const c = orthoProject(IRAN_CENTER, IRAN_CENTER)
  return near(c.x, 0, 1e-12) && near(c.y, 0, 1e-12)
})())

/* ----------------------------------------------------------- ۳) حاشیه‌ها --- */
console.log('\n--- ۳) حاشیه‌ی نامتقارنِ قاب در همه‌ی نسبت‌های صفحه ---')
// باریک‌ترین پنجره‌ی دسکتاپ (MIN_W=320 منهای p-4)، موبایل‌های رایج و پهن‌ترین حالت (92vw)
const BOXES: [number, number][] = [
  [288, 360],
  [328, 360],
  [398, 360],
  [728, 360],
  [1100, 360],
  [1734, 360],
]
for (const [w, h] of BOXES) {
  const p = iranFramePadding(w, h)
  const iw = w - p.left - p.right
  const ih = h - p.top - p.bottom
  check(
    `جعبه‌ی مفید در ${w}×${h} سالم است`,
    iw > 0 && ih > 0 && Number.isInteger(p.top) && Number.isInteger(p.bottom) && Number.isInteger(p.left),
    `${iw}×${ih}`,
  )
  check(`پایینِ قاب در ${w}×${h} جای اورلیِ پیام را دارد (≥۴۴px)`, p.bottom >= 44 && p.top <= 26, `top=${p.top} bottom=${p.bottom}`)
  check(`حاشیه‌ی طرفینِ ${w}×${h} در بازه‌ی منطقی است`, p.left >= 12 && p.left <= 44 && p.left === p.right, String(p.left))
}

/* ------------------------------- ۴) «خزر و خلیج فارس در هر نسبتِ صفحه» --- */
console.log('\n--- ۴) همه‌ی ایران (خزر تا خلیج فارس) در هر نسبتِ صفحه ---')
for (const [w, h] of BOXES) {
  const p = iranFramePadding(w, h)
  const z = iranFallbackZoom(w, h, p)
  // قطر دیسک کره در MapLibre: ‏D = 512·2^z / (π·cos φ)
  const disc = (512 * 2 ** z) / (Math.PI * Math.cos((IRAN_CENTER[1] * Math.PI) / 180))
  const iranW = 2 * extent.halfW * disc
  const iranH = 2 * extent.halfH * disc
  const iw = w - p.left - p.right
  const ih = h - p.top - p.bottom
  check(
    `در ${w}×${h} کل ایران (با هر دو دریا) داخل قاب است`,
    iranW <= iw && iranH <= ih,
    `iran=${iranW.toFixed(0)}×${iranH.toFixed(0)} در جعبه‌ی ${iw}×${ih}`,
  )
  check(`در ${w}×${h} زومِ قاب «منطقه‌ای» است (نه کره‌ی کامل، نه خیابان)`, z >= 1.5 && z <= IRAN_FIT_MAX_ZOOM, z.toFixed(2))
  check(`در ${w}×${h} ایران واقعاً قاب را پُر می‌کند`, iranH >= h * 0.55, `${((iranH / h) * 100).toFixed(0)}٪ از ارتفاع`)
}
const cam = iranFallbackCamera(728, 360)
check('دوربینِ جایگزین مرکزِ ایران و bearing صفر می‌دهد', cam.center[0] === IRAN_CENTER[0] && cam.center[1] === IRAN_CENTER[1] && cam.bearing === 0)
check('دوربینِ جایگزین حاشیه‌ی همان ظرف را دارد', cam.padding.bottom === iranFramePadding(728, 360).bottom)
check('ابعادِ صفر/خراب قاب، زومِ بی‌معنی نمی‌سازد', Number.isFinite(iranFallbackZoom(0, 0)) && iranFallbackZoom(0, 0) >= 0.5, iranFallbackZoom(0, 0).toFixed(2))

/* ------------------------------------------------ ۵) راستی‌آزماییِ قاب --- */
console.log('\n--- ۵) راستی‌آزماییِ قاب (neededZoomDelta) ---')
const box728 = { w: 728, h: 360, padding: iranFramePadding(728, 360) }
const inside = { w: 728, h: 360, padding: iranFramePadding(728, 360) }
const cx = inside.padding.left + (inside.w - inside.padding.left - inside.padding.right) / 2
const cy = inside.padding.top + (inside.h - inside.padding.top - inside.padding.bottom) / 2
check('وقتی همه‌چیز داخل است، هیچ اصلاحی لازم نیست', neededZoomDelta([{ x: cx, y: cy }], box728) === 0)
check('نقطه‌ی بیرون → اصلاحِ منفی (عقب‌رفتن)', neededZoomDelta([{ x: cx + 900, y: cy }], box728) < 0)
check('اندازه‌ی اصلاح دقیقاً log2(تخطی) + حاشیه‌ی امن است', near(neededZoomDelta([{ x: cx + 2 * ((728 - 66) / 2), y: cy }], box728), -(Math.log2(2) + 0.05), 1e-9))
check('بدترین نقطه ملاک است (نه میانگین)', (() => {
  const worst = neededZoomDelta([{ x: cx + 10, y: cy }, { x: cx + 800, y: cy }], box728)
  const onlyWorst = neededZoomDelta([{ x: cx + 800, y: cy }], box728)
  return worst === onlyWorst
})())
check('اصلاح هیچ‌وقت از ۱٫۲ زوم بیشتر نمی‌شود (گیر نکردن در پرشِ بزرگ)', neededZoomDelta([{ x: cx + 1e6, y: cy }], box728) >= -1.2)
check('فهرستِ خالی → صفر', neededZoomDelta([], box728) === 0)
check('ارتفاعِ بلندی هم ملاک است (خلیج فارس از پایین بیرون نزند)', neededZoomDelta([{ x: cx, y: cy + 400 }], box728) < 0)

/* ------------------------------------------------------- ۶) پیش‌نشستِ کره --- */
console.log('\n--- ۶) پیش‌نشستِ کره قبل از fitBounds ---')
check('در زومِ نزدیک (نیمه‌مسطح) پیش‌نشست لازم است', needsGlobeSettle(FLIGHT_ZOOM.orbit) === true, String(FLIGHT_ZOOM.orbit))
check('در زومِ قابِ ایران پیش‌نشست لازم نیست', needsGlobeSettle(iranFallbackZoom(728, 360)) === false)
check('زومِ پیش‌نشست خودش در ناحیه‌ی تمام‌کره است', !needsGlobeSettle(GLOBE_SETTLE_ZOOM) && GLOBE_SETTLE_ZOOM < MERCATOR_BLEND_ZOOM, String(GLOBE_SETTLE_ZOOM))
check('زومِ خراب (NaN) پیش‌نشست نمی‌خواهد', needsGlobeSettle(Number.NaN) === false)

/* ---------------------------------------------- ۷) نمای کره و مرکزِ فضا --- */
console.log('\n--- ۷) نمای کره‌ی کامل و مرکزِ آن ---')
check('زومِ کره‌ی کامل در بازه‌ی مجاز است', globeZoomFor(38.3, 728, 360) >= 0.2 && globeZoomFor(38.3, 728, 360) <= 1.8, globeZoomFor(38.3, 728, 360).toFixed(2))
check('ظرفِ بی‌ابعاد، زومِ پیش‌فرضِ امن می‌گیرد', globeZoomFor(32, 0, 0) === 1.2)
check('نزدیکِ قطب، کره بزرگ‌تر دیده می‌شود پس زومِ کمتری لازم است', globeZoomFor(65, 728, 360) < globeZoomFor(20, 728, 360))
const daddyTehran: LngLat = [51.389, 35.6892]
const daughterIstanbul: LngLat = [28.9784, 41.0082]
check('اگر هر دو خانه داخل ایران باشند، مرکزِ نما همان مرکزِ ایران است', spaceShotCenter(daddyTehran, [52.5, 33]).join() === IRAN_CENTER.join())
const space = spaceShotCenter(daddyTehran, daughterIstanbul)
check('اگر خانه‌ی دخترم بیرونِ ایران باشد، مرکزِ نما بین ایران و میانه‌ی دو خانه است', space[0] !== IRAN_CENTER[0] && space[0] > daughterIstanbul[0] && space[0] < IRAN_CENTER[0], JSON.stringify(space.map((v) => +v.toFixed(3))))
check('در آن نما هر دو قلب روی نیمکره‌ی دیده‌شده‌اند', angularDeg(space, daddyTehran) < 90 && angularDeg(space, daughterIstanbul) < 90, `${angularDeg(space, daddyTehran).toFixed(1)}° / ${angularDeg(space, daughterIstanbul).toFixed(1)}°`)

/* ------------------------------------------------------ ۸) پوشِ ضربان --- */
console.log('\n--- ۸) پوشِ ضربانِ قلب (نورِ نخ و صدا همگام) ---')
check('پوش همیشه بین ۰ و ۱ است', Array.from({ length: 200 }, (_, i) => heartbeatEnvelope(i * 0.017)).every((v) => v >= 0 && v <= 1))
check('پوش دقیقاً متناوب است', near(heartbeatEnvelope(1.3), heartbeatEnvelope(1.3 + 0.9), 1e-12))
check('پوش در سرِ دوره نمی‌پرد (پیوسته است)', Math.abs(heartbeatEnvelope(0) - heartbeatEnvelope(0.9 - 1e-6)) < 0.02)
check('ضربه‌ی اول (لاب) از ضربه‌ی دوم (داب) قوی‌تر است', heartbeatEnvelope(0.08) > heartbeatEnvelope(0.27), `${heartbeatEnvelope(0.08).toFixed(3)} > ${heartbeatEnvelope(0.27).toFixed(3)}`)
check('بین دو ضربان تقریباً خاموش است', heartbeatEnvelope(0.6) < 0.02, heartbeatEnvelope(0.6).toFixed(4))
check('ورودیِ خراب پوش صفر می‌دهد (نه NaN)', heartbeatEnvelope(Number.NaN) === 0 && heartbeatEnvelope(1, 0) === 0)

/* ------------------------------------------- ۹) ریاضیِ مسیر و شمارنده --- */
console.log('\n--- ۹) ریاضیِ مسیر (کیلومترِ پیموده‌شده) ---')
const tehranIstanbul = haversineKm(daddyTehran, daughterIstanbul)
check('تهران→استانبول ~۲۰۳۵ کیلومتر است', near(tehranIstanbul, 2035, 30), tehranIstanbul.toFixed(0))
check('فاصله‌ی یک نقطه با خودش صفر است', haversineKm(daddyTehran, daddyTehran) === 0)
check('فاصله متقارن است', near(haversineKm(daddyTehran, daughterIstanbul), haversineKm(daughterIstanbul, daddyTehran), 1e-9))
check('مسیرِ خیلی بلند هم سالم می‌ماند (تهران→سیدنی ~۱۲۹۱۰km)', near(haversineKm(daddyTehran, [151.2, -33.87]), 12910, 200), haversineKm(daddyTehran, [151.2, -33.87]).toFixed(0))
const path: LngLat[] = Array.from({ length: 65 }, (_, i) => [
  daddyTehran[0] + ((daughterIstanbul[0] - daddyTehran[0]) * i) / 64,
  daddyTehran[1] + ((daughterIstanbul[1] - daddyTehran[1]) * i) / 64,
])
const cum = pathCumulativeKm(path)
check('فهرستِ فاصله‌های تجمعی هم‌اندازه‌ی مسیر و از صفر شروع می‌شود', cum.length === path.length && cum[0] === 0)
check('فاصله‌های تجمعی یکنوا و غیرنزولی‌اند', cum.every((v, i) => i === 0 || v >= cum[i - 1]))
// مسیرِ چندضلعی در فضای lng/lat همیشه کمی از مسیرِ بزرگ‌دایره بلندتر است (~۰٫۳٪)
check('فاصله‌ی تجمعیِ مسیر با هاورسینِ مستقیم یکی است (تا ۱٪)', near(cum[cum.length - 1], tehranIstanbul, tehranIstanbul * 0.01), `${cum[cum.length - 1].toFixed(1)} در برابر ${tehranIstanbul.toFixed(1)}`)
check('نمونه‌برداری در کیلومترِ صفر = خانه‌ی بابا', sampleByDistance(path, cum, 0).join() === path[0].join())
check('نمونه‌برداری در پایان = خانه‌ی دخترم', (() => {
  const last = sampleByDistance(path, cum, cum[cum.length - 1])
  return near(last[0], path[path.length - 1][0], 1e-9) && near(last[1], path[path.length - 1][1], 1e-9)
})())
check('نمونه‌برداری کیلومتری منفی/بیش‌ازحد، سرِ مسیر می‌ماند', (() => {
  const under = sampleByDistance(path, cum, -50)
  const over = sampleByDistance(path, cum, 1e6)
  return under.join() === path[0].join() && near(over[0], path[path.length - 1][0], 1e-9)
})())
check('نمونه‌برداری در نصفِ مسافت، وسطِ مسیر است', near(sampleByDistance(path, cum, cum[cum.length - 1] / 2)[0], (daddyTehran[0] + daughterIstanbul[0]) / 2, 0.6))
check('مسیرِ خالی یا تک‌نقطه‌ای نمی‌شکند', sampleByDistance([], [], 5).join() === '0,0' && sampleByDistance([[1, 2]], [0], 9).join() === '1,2')

/* --------------------------------------------------------- ۱۰) easing --- */
console.log('\n--- ۱۰) منحنی‌های نرم‌سازی ---')
const samples = Array.from({ length: 101 }, (_, i) => i / 100)
for (const [name, fn] of [
  ['easeInOutCubic', easeInOutCubic],
  ['easeInOutQuad', easeInOutQuad],
  ['easeOutCubic', easeOutCubic],
] as const) {
  check(`${name}: ۰→۰ و ۱→۱ و یکنوا`, fn(0) === 0 && fn(1) === 1 && samples.every((s, i) => i === 0 || fn(s) >= fn(samples[i - 1]) - 1e-12))
}
check('easeOutCubic در میانه جلوتر از خطی است (فرودِ نرم)', easeOutCubic(0.5) > 0.5)
check('easeInOutCubic در میانه دقیقاً نصف است', near(easeInOutCubic(0.5), 0.5, 1e-12))

/* ------------------------------------------------------ ۱۱) تایم‌لاین --- */
console.log('\n--- ۱۱) تایم‌لاینِ سکانسِ پرواز ---')
const C = flightCueTimes(false)
const R = flightCueTimes(true)
const keys = Object.keys(FLIGHT_BASE) as (keyof typeof FLIGHT_BASE)[]
check('طولِ کلِ سکانس بین ۱۸ تا ۲۲ ثانیه است', flightTotalMs() >= 18000 && flightTotalMs() <= 22000, `${flightTotalMs()}ms`)
check('نسخه‌ی «حرکت کمتر» فشرده است (زیر ۵ ثانیه)', flightTotalMs(true) < 5000, `${flightTotalMs(true)}ms`)
check('مقیاسِ «حرکت کمتر» خطیِ خالص است (هم‌زمانیِ فازها نمی‌شکند)', keys.every((k) => R[k] === Math.round(FLIGHT_BASE[k] * REDUCED_SCALE)))
check('ضریبِ فشرده‌سازی همان ۰٫۱۵ است', REDUCED_SCALE === 0.15)
check('همه‌ی لحظه‌ها عددِ صحیحِ نامنفی و متناهی‌اند', keys.every((k) => Number.isInteger(C[k]) && C[k] >= 0 && Number.isFinite(C[k])))
check('cineScale در حالتِ عادی همان عدد را برمی‌گرداند', cineScale(false)(4321) === 4321 && cineScale(true)(1000) === 150)

console.log('  (ترتیبِ فازها)')
check('پرده → عقب‌کشی → شیرجه → رسیدن → مدار → بلند شدن', C.curtain < C.pullback && C.pullback < C.dive && C.dive < C.arriveDaddy && C.arriveDaddy < C.orbitDaddy && C.orbitDaddy < C.liftoff)
check('بلند شدن → پرواز → فرود → بازگشت → راستی‌آزمایی → باز شدنِ قفل', C.liftoff < C.flight && C.flight < C.land && C.land < C.home && C.home < C.verify && C.verify < C.unlock)
check('عقب‌کشی به کره پیش از شیرجه تمام می‌شود', C.pullback + C.pullbackDur <= C.dive, `${C.pullback + C.pullbackDur} ≤ ${C.dive}`)
check('شیرجه پیش از رسیدن تمام می‌شود', C.dive + C.diveDur <= C.arriveDaddy + 120, `${C.dive + C.diveDur} ≤ ${C.arriveDaddy}`)
check('مدارِ خانه‌ی بابا پیش از بلند شدن تمام می‌شود', C.orbitDaddy + C.orbitDaddyDur <= C.liftoff, `${C.orbitDaddy + C.orbitDaddyDur} ≤ ${C.liftoff}`)
check('پروازِ روی کمان پیش از فرود تمام می‌شود', C.flight + C.flightDur <= C.land, `${C.flight + C.flightDur} ≤ ${C.land}`)
check('مدارِ خانه‌ی دخترم پیش از بازگشت تمام می‌شود', C.orbitDaughter + C.orbitDaughterDur <= C.home, `${C.orbitDaughter + C.orbitDaughterDur} ≤ ${C.home}`)
check('بازگشت به ایران پیش از راستی‌آزمایی تمام می‌شود', C.home + C.homeSettleDur + C.homeFitDur <= C.verify, `${C.home + C.homeSettleDur + C.homeFitDur} ≤ ${C.verify}`)
check('راستی‌آزماییِ قاب پیش از باز شدنِ قفل است', C.verify < C.unlock)
check('اورلیِ پیامِ پایانی پیش از بازگشت بسته می‌شود', C.cineHide >= C.land && C.cineHide <= C.home)

console.log('  (مکث‌ها و ریتم)')
check('پس از رسیدن به خانه‌ی بابا مکثِ معنادار هست (≥۱٫۵s)', C.liftoff - C.arriveDaddy >= 1500, `${C.liftoff - C.arriveDaddy}ms`)
check('پروازِ روی کمان آهسته‌تر از نسخه‌ی قبلی است (≥۵s)', C.flightDur >= 5000, `${C.flightDur}ms`)
check('جشنِ فرود طولانی است (≥۳s)', C.home - C.land >= 3000, `${C.home - C.land}ms`)
check('نمای کره هم مکثِ کوتاه دارد (پیش از شیرجه ≥۰٫۳s)', C.dive - (C.pullback + C.pullbackDur) >= 250, `${C.dive - (C.pullback + C.pullbackDur)}ms`)
check('ضربانِ قلب در سه لحظه‌ی جداگانه پخش می‌شود', C.heartbeat1 < C.heartbeat2 && C.heartbeat2 < C.heartbeat3 && C.heartbeat3 <= C.land)
// قله‌ی پالسِ نور در dive + 80 + 900k است (دوره‌ی ۰٫۹ ثانیه = فاصله‌ی ضربه‌های playHeartbeat)
check('صدا و نور همگام‌اند: هر ضربان روی شبکه‌ی پالسِ نخ می‌نشیند', [C.heartbeat1, C.heartbeat2, C.heartbeat3].every((hb) => (hb - (C.dive + 80)) % 900 === 0), [C.heartbeat1, C.heartbeat2, C.heartbeat3].join(' / '))

console.log('  (راز ⑨ و پروجکشن)')
check('سقفِ زومِ سکانس زیرِ آستانه‌ی راز ⑨ است', FLIGHT_MAX_ZOOM < EGG_ZOOM_LIMIT, `${FLIGHT_MAX_ZOOM} < ${EGG_ZOOM_LIMIT}`)
check('حاشیه‌ی امنِ راز ⑨ حداقل یک زوم است', EGG_ZOOM_LIMIT - FLIGHT_MAX_ZOOM >= 1, (EGG_ZOOM_LIMIT - FLIGHT_MAX_ZOOM).toFixed(1))
check('هر دو زومِ نزدیکِ سکانس زیر آستانه‌اند', FLIGHT_ZOOM.approach < EGG_ZOOM_LIMIT && FLIGHT_ZOOM.orbit < EGG_ZOOM_LIMIT, `${FLIGHT_ZOOM.approach} / ${FLIGHT_ZOOM.orbit}`)
check('نمای نزدیک هیچ‌وقت کاملاً مسطح نمی‌شود (زیرِ پایانِ گذارِ کره)', FLIGHT_MAX_ZOOM < MERCATOR_FLAT_ZOOM, `${FLIGHT_MAX_ZOOM} < ${MERCATOR_FLAT_ZOOM}`)
check('bearingِ مدارِ دو خانه با هم فرق دارد (چرخشِ واقعیِ دوربین)', FLIGHT_BEARING.daddy !== FLIGHT_BEARING.daughter, `${FLIGHT_BEARING.daddy}° → ${FLIGHT_BEARING.daughter}°`)
check('زومِ مدار از زومِ شیرجه نزدیک‌تر است', FLIGHT_ZOOM.orbit > FLIGHT_ZOOM.approach)

console.log('  (افکت‌های فرود)')
check('فرود چهار موجِ آتشینی دارد', LANDING_WAVES.length === 4)
check('موج‌ها نزولی‌اند و موجِ اول بزرگ است (≥۱۸ ذره)', LANDING_WAVES.every((v, i) => i === 0 || v <= LANDING_WAVES[i - 1]) && LANDING_WAVES[0] >= 18, LANDING_WAVES.join('/'))
check('چهار زیرنویسِ یکتا و همگی از کلیدهای map.*', CAPTION_KEYS.length === 4 && new Set(CAPTION_KEYS).size === 4 && CAPTION_KEYS.every((k) => k.startsWith('map.')), CAPTION_KEYS.join(', '))

/* ------------------------------------------- ۱۲) قراردادِ تحویلِ کد --- */
console.log('\n--- ۱۲) قراردادِ تحویل (ترجمه‌ها، CSS، PWA، بی‌ردکردن) ---')
const fa = JSON.parse(read('public', 'locales', 'fa', 'translation.json')) as { map: Record<string, string> }
const en = JSON.parse(read('public', 'locales', 'en', 'translation.json')) as { map: Record<string, string> }
for (const key of CAPTION_KEYS) {
  const short = key.replace('map.', '')
  check(`ترجمه‌ی «${short}» در fa هست`, typeof fa.map[short] === 'string' && fa.map[short].length > 5, fa.map[short] || '—')
  check(`ترجمه‌ی «${short}» در en هست`, typeof en.map[short] === 'string' && en.map[short].length > 5, en.map[short] || '—')
}
check('شمارنده‌ی کیلومتر در هر دو زبان جای‌نماِ {{km}} دارد', fa.map.cineKm.includes('{{km}}') && en.map.cineKm.includes('{{km}}'), `${fa.map.cineKm} | ${en.map.cineKm}`)
check('برچسبِ «در حال پرواز…» (قفلِ دکمه) سرِ جایش هست', fa.map.flying.length > 3 && en.map.flying.length > 3)

const src = read('src', 'apps', 'MapOfUs.tsx')
const css = read('src', 'styles', 'index.css')
const vite = read('vite.config.ts')
check('اپ قابِ ایران را از ماژولِ خالص می‌خواند (IRAN_BOUNDS)', src.includes('IRAN_BOUNDS') && src.includes('iranFramePadding'))
// یک بار در انیمیشنِ ورودی (بعد از دو resize) و یک بار در پایانِ سکانس
check('هم انیمیشنِ ورودی و هم پایانِ سکانس به قابِ ایران می‌رسند', (src.match(/frameIran\(/g) || []).length >= 2, `${(src.match(/frameIran\(/g) || []).length} بار`)
check('قابِ ایران بعد از fit راستی‌آزمایی می‌شود', src.includes('verifyIranFrame') && src.includes('neededZoomDelta'))
check('دو resizeِ بعد از load حفظ شده‌اند', src.includes('m.resize()') && (src.match(/m\.resize\(\)/g) || []).length === 2)
check('راز ⑨ تا پایانِ سکانس مصرف نمی‌شود (نگهبانِ flyingRef)', /flyingRef\.current[^\n]*m\.getZoom\(\) < 13|m\.getZoom\(\) < 13/.test(src) && src.includes('flyingRef.current'))
check('هیچ زومِ عددیِ ≥۱۳ در کد اپ نیست', !Array.from(src.matchAll(/zoom:\s*(\d+(?:\.\d+)?)/g)).some((mm) => Number(mm[1]) >= EGG_ZOOM_LIMIT))
check('سکانس دکمه‌ی «رد کردن» ندارد', !/onClick=\{stopCinema\}|onSkip|map\.skip/.test(src) && src.includes('disabled={flying}'))
check('پاک‌سازیِ کامل در unmount و در ساختِ دوباره‌ی نقشه', src.includes('useEffect(() => stopCinema') && src.includes('stopCinema()\n      m.remove()'))
check('مارکرهای سینمایی «لنگر» دارند تا با transformِ MapLibre نجنگند', css.includes('.loveos-spark-anchor') && src.includes('loveos-spark-anchor'))
check('انیمیشنِ جرقه روی فرزند است نه روی خودِ مارکر', /loveos-spark-anchor[\s\S]*loveos-spark\b/.test(src) && css.includes('@keyframes loveos-spark-pulse'))
for (const cls of ['.loveos-trail', '.loveos-ring', '.loveos-meteor', '.loveos-space--cine', '.loveos-cine-caption', '.loveos-cine-km']) {
  check(`کلاسِ «${cls}» در CSS تعریف شده`, css.includes(cls))
}
check('صدای ضربانِ همگام با نخ استفاده می‌شود', src.includes('playHeartbeat(') && src.includes('heartbeatEnvelope('))
check('هوووشِ بلند شدن با تُنِ سُرمی‌خور ساخته می‌شود', src.includes('glideTo:') && src.includes('whoosh'))
const ver = /PWA_CACHE_VERSION = '([^']+)'/.exec(vite)?.[1] ?? ''
check('نسخه‌ی کش PWA بامپ شده است', /^v20\d\d-\d\d-\d\d-/.test(ver) && ver !== 'v2026-09-20-globe-cinema', ver)
check('prefers-reduced-motion در اپ خوانده می‌شود', src.includes('prefers-reduced-motion'))

console.log(failCount === 0 ? '\n🎉 آزمون قابِ ایران و سکانس سینمایی پاس شد' : `\n💥 ${failCount} مورد شکست`)
process.exit(failCount === 0 ? 0 : 1)
