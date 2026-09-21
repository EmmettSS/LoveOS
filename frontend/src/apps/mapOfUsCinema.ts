/**
 * mapOfUsCinema.ts — ریاضیِ قابِ ایران + تایم‌لاین سینماییِ پرواز (بدون React، بدون DOM)
 *
 * چرا این فایل جداست؟
 *  ۱) در سندباکس مرورگر headless نداریم؛ پس درستیِ «قاب ایران» (این‌که دریای خزر و
 *     خلیج فارس در هر نسبت صفحه‌ای کامل دیده شوند) و درستیِ «تایم‌لاین پرواز» باید با
 *     ریاضیِ خالص و آزمونِ jsdom اثبات شود، نه با چشم.
 *  ۲) یک منبع یگانه برای همه‌ی عددهای سکانس: هم کامپوننت از این جدول زمان‌بندی می‌خواند
 *     و هم آزمون؛ پس زمان‌بندی و کد هیچ‌وقت از هم وا نمی‌افتند.
 *
 * نکته‌ی مهم درباره‌ی پروجکشن (MapLibre 6.9):
 *   `projection: { type: 'globe' }` درواقع این عبارت است:
 *     ['interpolate', ['linear'], ['zoom'], 11, 'vertical-perspective', 12, 'mercator']
 *   یعنی تا زوم ۱۱ کره‌ی واقعی است، بین ۱۱ و ۱۲ نرم به نقشه‌ی مسطح می‌رسد و از ۱۲ به بعد
 *   مسطح است. به همین دلیل سقف زومِ سکانس پرواز زیر ۱۱.۶ نگه داشته شده: هم نمای کره
 *   حفظ می‌شود و هم از آستانه‌ی راز ⑨ (زوم ۱۳) خیلی دور می‌ماند.
 */

export type LngLat = [number, number]

export interface Padding {
  top: number
  right: number
  bottom: number
  left: number
}
export interface ScreenBox {
  w: number
  h: number
  padding: Padding
}
export interface ScreenPoint {
  x: number
  y: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const rad = (deg: number) => (deg * Math.PI) / 180

/* ------------------------------------------------------------- قابِ ایران --- */

/**
 * قاب خواسته‌شده‌ی کاربر: «کل نقشه ایران از دریای خزر تا خلیج فارس».
 * [غرب، جنوب] و [شرق، شمال] — با حاشیه‌ی امن نسبت به حدِ واقعی خاک:
 *   غربی‌ترین نقطه‌ی ایران ~۴۴.۰۳، شرقی‌ترین ~۶۳.۳۳، شمالی‌ترین ~۳۹.۷۸، جنوبی‌ترین ~۲۵.۰۶
 * حاشیه‌ی شمالی (تا ۴۰.۲) آبِ دریای خزر را هم داخل قاب می‌آورد و حاشیه‌ی جنوبی (تا ۲۴.۵)
 * آبِ خلیج فارس و دریای عمان را؛ یعنی هر دو دریا به‌صورت «پهنه‌ی آب» دیده می‌شوند نه یک خط.
 */
export const IRAN_BOUNDS: [LngLat, LngLat] = [
  [44.0, 24.5],
  [63.8, 40.2],
]

/** مرکز قاب ایران (برای دوربینِ جایگزین و پیش‌نشستِ کره) */
export const IRAN_CENTER: LngLat = [
  (IRAN_BOUNDS[0][0] + IRAN_BOUNDS[1][0]) / 2,
  (IRAN_BOUNDS[0][1] + IRAN_BOUNDS[1][1]) / 2,
]

/** سقف زومِ قاب ایران — بالاتر از این یعنی دیگر «تمام ایران» در قاب نیست */
export const IRAN_FIT_MAX_ZOOM = 4.6

/**
 * حاشیه‌ی امنِ دوربینِ جایگزین: تصویرِ «پرسپکتیوِ عمودی» MapLibre کمی بزرگ‌تر از
 * تقریبِ ارتوگرافیکِ ماست (دوربین نزدیک‌تر است) و لبه‌های قفسه هم کمی کمانی می‌شوند؛
 * پس کمی بازتر از مقدارِ محاسبه‌شده می‌نشینیم تا هیچ‌وقت گوشه‌ای بیرون نماند.
 */
export const IRAN_FIT_SAFETY = 0.2

/** آستانه‌ی راز ⑨ (زوم ≥ ۱۳ نزدیک شهر بابا) — سکانس هیچ‌وقت به آن نمی‌رسد */
export const EGG_ZOOM_LIMIT = 13

/** از این زوم به بالا کره شروع به مسطح‌شدن می‌کند (transition در MapLibre: ۱۱ → ۱۲) */
export const MERCATOR_BLEND_ZOOM = 11

/** از این زوم به بالا نما کاملاً مسطح است (پایانِ transition) */
export const MERCATOR_FLAT_ZOOM = 12

/** زومِ «پیش‌نشست»: قبل از fitBounds از نمای نزدیک، اول این‌جا می‌رویم تا محاسبه‌ی
 *  قاب با پروجکشنِ تمام‌کره انجام شود (نه با حالتِ مسطح‌شده‌ی زوم بالا) */
export const GLOBE_SETTLE_ZOOM = 4.2

/** زومِ بسته‌ی هر خانه در سکانس — زیر ۱۱.۶، یعنی هم نمای کره می‌ماند هم خیلی زیر ۱۳ */
export const FLIGHT_ZOOM = {
  /** شیرجه به خانه‌ی بابا / پرواز روی کمان */
  approach: 11.2,
  /** مدارِ نزدیک هر خانه با مکث */
  orbit: 11.6,
} as const

/** بیشینه‌ی زومی که سکانس پرواز استفاده می‌کند (در آزمون با EGG_ZOOM_LIMIT مقایسه می‌شود) */
export const FLIGHT_MAX_ZOOM = Math.max(...Object.values(FLIGHT_ZOOM))

/** bearingِ مدار دور هر خانه (درجه) — چرخش آرام دوربین برای حس «نگاه کردن به خانه» */
export const FLIGHT_BEARING = { daddy: 46, daughter: 112 } as const

/** چهار حدِ خاک ایران؛ همه باید داخل IRAN_BOUNDS باشند (در آزمون می‌سنجیم) */
export const IRAN_EXTREMES: { name: string; point: LngLat }[] = [
  { name: 'west', point: [44.03, 35.7] }, // مرز عراق، نزدیک پنج‌وین
  { name: 'east', point: [63.33, 31.0] }, // سیستان، مرز پاکستان
  { name: 'north', point: [48.9, 39.72] }, // دشت مغان / ساحل شمالی خزر
  { name: 'south', point: [61.4, 25.06] }, // چابهار / دریای عمان
]

/**
 * ۱۶ نقطه روی «محیط» قفسه‌ی ایران (گوشه‌ها، میانه‌ها و یک‌چهارم‌ها).
 * MapLibre خودش فقط ۴ گوشه + ۴ میانه را برای fitBounds می‌سنجد؛ ما محیط را کامل‌تر
 * نمونه می‌گیریم تا اگر لبه‌ها کمی از قاب بیرون زدند، با neededZoomDelta اصلاح شود.
 */
export function iranFrameProbes(): LngLat[] {
  const [[w, s], [e, n]] = IRAN_BOUNDS
  const lngs = [w, w + (e - w) * 0.25, (w + e) / 2, w + (e - w) * 0.75, e]
  const lats = [s, s + (n - s) * 0.25, (s + n) / 2, s + (n - s) * 0.75, n]
  const pts: LngLat[] = []
  for (const lng of lngs) {
    pts.push([lng, s])
    pts.push([lng, n])
  }
  for (const lat of lats.slice(1, -1)) {
    pts.push([w, lat])
    pts.push([e, lat])
  }
  return pts
}

/** تصویرِ ارتوگرافیکِ یک نقطه روی دیسکِ کره (واحد: شعاعِ کره) نسبت به مرکزِ قاب */
export function orthoProject(point: LngLat, center: LngLat): ScreenPoint {
  const [lng, lat] = point
  const [lng0, lat0] = center
  const la = rad(lat)
  const lo = rad(lng)
  const la0 = rad(lat0)
  const lo0 = rad(lng0)
  return {
    x: Math.cos(la) * Math.sin(lo - lo0),
    y: Math.cos(la0) * Math.sin(la) - Math.sin(la0) * Math.cos(la) * Math.cos(lo - lo0),
  }
}

/**
 * گستره‌ی ظاهریِ قاب ایران روی دیسک کره، به کسری از «شعاع» دیسک.
 * قطر دیسک در MapLibre برابر است با D = 512·2^z / (π·cos φ).
 */
export function iranApparentExtent(probes: LngLat[] = iranFrameProbes()): { halfW: number; halfH: number; aspect: number } {
  let halfW = 0
  let halfH = 0
  for (const p of probes) {
    const { x, y } = orthoProject(p, IRAN_CENTER)
    halfW = Math.max(halfW, Math.abs(x))
    halfH = Math.max(halfH, Math.abs(y))
  }
  return { halfW, halfH, aspect: halfH > 0 ? halfW / halfH : 1 }
}

/**
 * حاشیه‌ی نامتقارنِ قاب ایران.
 * پایین بیشتر است چون اورلیِ «پیام پایانی بابا» و کنترلِ attribution آن‌جا می‌نشینند؛
 * اگر پایین را مثل بالا بگیریم، ساحل خلیج فارس زیر اورلی پنهان می‌شود.
 * طرفین با عرض ظرف مقیاس می‌شوند تا در موبایلِ باریک قاب له نشود و در دسکتاپِ پهن
 * ایران وسطِ تصویر بماند.
 */
export function iranFramePadding(w: number, h: number): Padding {
  const top = clamp(Math.round(h * 0.06), 14, 26)
  const bottom = clamp(Math.round(h * 0.155), 44, 64)
  const side = clamp(Math.round(w * 0.045), 12, 44)
  return { top, right: side, bottom, left: side }
}

/**
 * زومِ دوربینِ جایگزین برای قاب ایران (وقتی fitBounds جواب نداد).
 * از تقریبِ ارتوگرافیک می‌آید: ایران 2·halfW·D عرض و 2·halfH·D ارتفاع می‌گیرد، پس
 *   D ≤ min(innerW / (2·halfW), innerH / (2·halfH))
 * و بعد D = 512·2^z / (π·cos φ) را معکوس می‌کنیم.
 */
export function iranFallbackZoom(w: number, h: number, padding: Padding = iranFramePadding(w, h)): number {
  const { halfW, halfH } = iranApparentExtent()
  const innerW = Math.max(1, w - padding.left - padding.right)
  const innerH = Math.max(1, h - padding.top - padding.bottom)
  const disc = Math.min(innerW / (2 * halfW), innerH / (2 * halfH))
  const z = Math.log2((disc * Math.PI * Math.cos(rad(IRAN_CENTER[1]))) / 512)
  return clamp(z - IRAN_FIT_SAFETY, 0.5, IRAN_FIT_MAX_ZOOM)
}

/** دوربینِ جایگزینِ کاملِ قاب ایران (مرکز + زوم + حاشیه) */
export function iranFallbackCamera(w: number, h: number) {
  return { center: IRAN_CENTER, zoom: iranFallbackZoom(w, h), bearing: 0, padding: iranFramePadding(w, h) }
}

/**
 * راستی‌آزماییِ قاب: اگر نقطه‌ای از محیط ایران بیرونِ جعبه‌ی مفید (ظرف منهای حاشیه) باشد،
 * berapa مقدارِ زومی که باید «کم» شود برمی‌گردیم (عدد منفی = عقب‌رفتن).
 * چون فاصله‌های صفحه‌ای با 2^zoom نسبت مستقیم دارند، ضریبِ لازم = log2(بزرگ‌ترین تخطی).
 * اگر همه داخل بودند → صفر (هیچ اصلاحی لازم نیست).
 */
export function neededZoomDelta(points: ScreenPoint[], box: ScreenBox, safety = 0.05): number {
  if (points.length === 0) return 0
  const p = box.padding
  const innerW = Math.max(1, box.w - p.left - p.right)
  const innerH = Math.max(1, box.h - p.top - p.bottom)
  const cx = p.left + innerW / 2
  const cy = p.top + innerH / 2
  let worst = 1
  for (const pt of points) {
    const sx = Math.abs(pt.x - cx) / (innerW / 2)
    const sy = Math.abs(pt.y - cy) / (innerH / 2)
    worst = Math.max(worst, sx, sy)
  }
  if (worst <= 1) return 0
  return -Math.min(1.2, Math.log2(worst) + safety)
}

/**
 * برای محاسبه‌ی درستِ قاب ایران، پروجکشن باید «تمام‌کره» باشد. در زومِ نزدیک (≥ ۶)
 * MapLibre کم‌کم به مسطح می‌رسد و fitBounds از روی همان حالتِ مسطح محاسبه می‌کند؛
 * پس اول یک پیش‌نشستِ کوتاه به کره لازم است.
 */
export function needsGlobeSettle(zoom: number, threshold = 6): boolean {
  return Number.isFinite(zoom) && zoom > threshold
}

/**
 * زومی که «کره‌ی کامل» را در این ابعادِ ظرف نشان می‌دهد (نمای فضای بیرون کره).
 * قطر کره در MapLibre برابر است با ‏512·2^z / (π·cos φ)؛ معکوسش می‌کنیم تا کره با
 * حاشیه‌ی مناسب در کوچک‌ترین بُعدِ ظرف بنشیند. نزدیک قطب‌ها کره بزرگ‌تر دیده می‌شود.
 */
export function globeZoomFor(lat: number, width: number, height: number): number {
  const size = Math.min(width, height)
  if (!size || size <= 0) return 1.2
  const diameter = size * 0.76
  const zoom = Math.log2((diameter * Math.PI * Math.cos(rad(lat))) / 512)
  return Math.max(0.2, Math.min(1.8, zoom))
}

/**
 * مرکزِ «نمای کره»: اگر هر دو خانه داخل ایران باشند، همان مرکز ایران (زومِ خالص، بدون
 * چرخش اضافه). اگر یکی بیرون باشد (پیش‌فرض: دخترم در استانبول) وسطِ دو خانه و مرکزِ
 * ایران را میانگین می‌گیریم تا هم کره‌ی کامل دیده شود هم هر دو قلب روی دیسک باشند.
 */
export function spaceShotCenter(daddy: LngLat, daughter: LngLat): LngLat {
  const inside = (p: LngLat) =>
    p[0] >= IRAN_BOUNDS[0][0] && p[0] <= IRAN_BOUNDS[1][0] && p[1] >= IRAN_BOUNDS[0][1] && p[1] <= IRAN_BOUNDS[1][1]
  if (inside(daddy) && inside(daughter)) return IRAN_CENTER
  const mid: LngLat = [(daddy[0] + daughter[0]) / 2, (daddy[1] + daughter[1]) / 2]
  return [(mid[0] + IRAN_CENTER[0]) / 2, (mid[1] + IRAN_CENTER[1]) / 2]
}

/* ----------------------------------------------------------------- easing --- */

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3
export const easeOutQuint = (t: number) => 1 - (1 - t) ** 5

/**
 * پوشِ «لاب-داب» ضربان قلب: دو ضربه در هر دوره، اولی قوی‌تر و دومی نرم‌تر.
 * هم پالسِ درخششِ نخ از این می‌آید و هم زمانِ پخشِ صدای playHeartbeat.
 * گوسی‌ها روی سه دوره‌ی همسایه ارزیابی می‌شوند تا پوش در سرِ دوره «نپرد»
 * (پیوسته و دقیقاً متناوب بماند).
 */
export function heartbeatEnvelope(tSeconds: number, period = 0.9): number {
  if (!Number.isFinite(tSeconds) || period <= 0) return 0
  const x = (((tSeconds % period) + period) % period) / period
  const thump = (center: number, width: number) => {
    let best = 0
    for (const shift of [-1, 0, 1]) {
      best = Math.max(best, Math.exp(-((x - center + shift) ** 2) / (2 * width * width)))
    }
    return best
  }
  return Math.max(thump(0.08, 0.06), 0.6 * thump(0.27, 0.08))
}

/* ------------------------------------------------------- ریاضیِ مسیرِ پرواز --- */

/** فاصله‌ی واقعیِ دو نقطه روی زمین (کیلومتر) — همان شعاعِ ۶۳۷۱ که بک‌اند استفاده می‌کند */
export function haversineKm(a: LngLat, b: LngLat): number {
  const r = 6371
  const p1 = rad(a[1])
  const p2 = rad(b[1])
  const dp = rad(b[1] - a[1])
  const dl = rad(b[0] - a[0])
  const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2
  return 2 * r * Math.asin(Math.min(1, Math.max(0, Math.sqrt(h))))
}

/** فاصله‌ی تجمعیِ یک مسیر (برای پیمایش بر اساسِ «کیلومتر» به‌جای شماره‌ی نقطه) */
export function pathCumulativeKm(path: LngLat[]): number[] {
  const cum: number[] = [0]
  for (let i = 1; i < path.length; i += 1) {
    cum.push(cum[i - 1] + haversineKm(path[i - 1], path[i]))
  }
  return cum
}

/** نقطه‌ی مسیر در فاصله‌ی d کیلومتری از آغاز (جست‌وجوی دودویی روی فاصله‌های تجمعی) */
export function sampleByDistance(path: LngLat[], cum: number[], d: number): LngLat {
  if (path.length === 0) return [0, 0]
  if (path.length === 1 || cum.length !== path.length) return path[0]
  const total = cum[cum.length - 1]
  const target = clamp(d, 0, total)
  let lo = 0
  let hi = cum.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (cum[mid] <= target) lo = mid
    else hi = mid
  }
  const seg = cum[hi] - cum[lo]
  const f = seg > 0 ? (target - cum[lo]) / seg : 0
  return [path[lo][0] + (path[hi][0] - path[lo][0]) * f, path[lo][1] + (path[hi][1] - path[lo][1]) * f]
}

/* ------------------------------------------------------- تایم‌لاینِ سکانس --- */

/**
 * جدول زمانیِ کاملِ سکانس پرواز (میلی‌ثانیه، حالتِ عادی).
 * هر کلیدی که به `Dur` ختم شود «مدت» است، بقیه «لحظه‌ی وقوع».
 * هر دو با یک ضریبِ خطی مقیاس می‌شوند تا در حالتِ حرکتِ کمتر، ترتیب و هم‌زمانی‌ها
 * دقیقاً همان بماند (ثابتِ جمعی نداریم که تلنبار شود و فازها روی هم بیفتند).
 */
export const FLIGHT_BASE = {
  /* فاز ۰ — پرده‌ی سینما و عقب‌کشی به کره‌ی کامل */
  curtain: 0,
  burstCurtain: 140,
  pullback: 280,
  pullbackDur: 2300,
  meteor1: 700,
  halo: 1200,
  meteor2: 1520,
  caption1Hide: 1750,
  twinkleOff: 2700,

  /* فاز ۱ — شیرجه به خانه‌ی بابا، مدار و مکث */
  dive: 2900,
  diveDur: 2600,
  caption2Hide: 5900,
  heartbeat1: 2980,
  daddyWave1: 4200,
  daddyWave2: 4800,
  arriveDaddy: 5500,
  ringDaddy: 5560,
  orbitDaddy: 5620,
  orbitDaddyDur: 1900,
  daddyWave3: 6500,
  holdEnd: 7500,

  /* فاز ۲ — بلند شدن */
  liftoff: 7600,
  caption3Hide: 8900,

  /* فاز ۳ — پرواز روی کمان
   نکته: سه لحظه‌ی ضربانِ صوتی همه روی «شبکه‌ی ضربانِ نور» نشسته‌اند:
   قله‌ی پالسِ نخ در dive + 80 + 900k میلی‌ثانیه است (دوره‌ی ۰٫۹ ثانیه، همان فاصله‌ی
   ضربه‌های playHeartbeat)؛ پس ۲۹۸۰ و ۹۲۸۰ و ۱۳۷۸۰ دقیقاً با تپشِ نور هم‌زمان‌اند. */
  flight: 7900,
  flightDur: 6000,
  heartbeat2: 9280,
  captionMid: 10600,
  captionMidHide: 12100,
  heartbeat3: 13780,
  approach: 13200,

  /* فاز ۴ — فرودِ جشن‌گونه */
  land: 13900,
  orbitDaughter: 14200,
  orbitDaughterDur: 2100,
  landWave2: 14400,
  landWave3: 15050,
  landWave4: 15800,
  counterHide: 16600,
  cineHide: 17200,

  /* فاز ۵ — بازگشت به قاب ایران و باز شدن قفل */
  home: 17300,
  homeSettleDur: 900,
  homeFitDur: 1500,
  verify: 19800,
  unlock: 20400,
} as const

export type FlightCueKey = keyof typeof FLIGHT_BASE
export type FlightCues = Record<FlightCueKey, number>

/** ضریبِ فشرده‌سازی برای prefers-reduced-motion */
export const REDUCED_SCALE = 0.15

/**
 * مقیاس‌کننده‌ی زمانِ سکانس (الگوی ‏D() قبلی، اما خطیِ خالص).
 * نسخه‌ی قبلی یک ثابتِ ۱۲۰ms هم اضافه می‌کرد که برای هر رویداد تلنبار می‌شد و در حالتِ
 * حرکتِ کمتر فازها را روی هم می‌انداخت؛ ضریبِ خطی هم‌زمانی‌ها را دقیق نگه می‌دارد.
 */
export function cineScale(reduced: boolean): (ms: number) => number {
  return (ms: number) => (reduced ? Math.round(ms * REDUCED_SCALE) : ms)
}

/** لحظه‌ی همه‌ی رویدادهای سکانس (میلی‌ثانیه) برای حالتِ عادی یا حرکتِ کمتر */
export function flightCueTimes(reduced: boolean): FlightCues {
  const D = cineScale(reduced)
  const out = {} as Record<string, number>
  for (const key of Object.keys(FLIGHT_BASE) as FlightCueKey[]) out[key] = D(FLIGHT_BASE[key])
  return out as FlightCues
}

/** طول کل سکانس (میلی‌ثانیه) — در آزمون باید داخل بازه‌ی ۱۸ تا ۲۲ ثانیه باشد */
export function flightTotalMs(reduced = false): number {
  return flightCueTimes(reduced).unlock
}

/** موج‌های فورانِ فرود (تعداد ذره در هر موج) — آتشینیِ قلب و ♾ و ✨ */
export const LANDING_WAVES = [20, 16, 14, 10] as const

/** کلیدهای زیرنویس‌های احساسی، به ترتیبِ پخش در سکانس */
export const CAPTION_KEYS = ['map.cineIran', 'map.cineDaddy', 'map.cineLift', 'map.cineMid'] as const
