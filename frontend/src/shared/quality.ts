/**
 * quality.ts — موتورِ لایه‌ی کیفیتِ سه‌بعدی
 *
 * سه لایه داریم و یک حالتِ «خودکار»:
 *
 *   lite     🌙 مهتاب    — عمقِ CSS (سایه‌های لایه‌ای، rim-light). بدونِ
 *                          transform سه‌بعدی و بدونِ WebGL. روی گوشیِ ضعیف حتی
 *                          از پوسته‌ی قبلی سریع‌تر است چون blur کمتر می‌شود.
 *   balanced 💎 بلور     — عمقِ CSS سه‌بعدیِ واقعی: preserve-3d، پارالاکس،
 *                          برجسته‌سازیِ لایه‌ای، تیلت با مکان‌نما. بدونِ WebGL.
 *   dream    🌌 کهکشان   — همه‌ی بالا + صحنه‌های WebGL واقعی (three.js).
 *
 *   auto     ✨ خودکار   — موتور با سنجه‌ی توان دستگاه یکی از سه بالا را
 *                          برمی‌گزیند و در حینِ کار هم اصلاحش می‌کند.
 *
 * ---------------------------------------------------------------------------
 * چرا این فایل وجود دارد (و چرا یک if ساده نیست)
 * ---------------------------------------------------------------------------
 * LoveOS موبایل-اول است و روی گوشیِ دخترم اجرا می‌شود، نه روی لپ‌تاپِ بابا.
 * یک افکتِ WebGL که روی M1 روان است می‌تواند روی یک گوشیِ میان‌رده به ۱۲
 * فریم برسد — و آن‌وقت به‌جای «ذوق و حیرت»، «کندی و اعصاب» تحویل می‌دهیم.
 *
 * پس این موتور سه کار می‌کند:
 *   ۱) سنجه‌ی **ایستا**ی توان (WebGL، هسته، حافظه، شبکه، DPR)
 *   ۲) سنجشِ **پویا**ی فریم در لحظه‌ی بوت (چون هیچ سنجه‌ی ایستایی جایِ
 *      «واقعاً چند فریم می‌دهد» را نمی‌گیرد)
 *   ۳) واچ‌داگِ **جاری** که اگر لایه‌ی انتخابی در عمل سنگین بود، بی‌صدا
 *      تنزل می‌دهد و تصمیمش را به خاطر می‌سپارد
 *
 * ---------------------------------------------------------------------------
 * دو نکته‌ی طراحی که عمداً این‌طورند
 * ---------------------------------------------------------------------------
 * • **حقِ وتو مقدم بر امتیاز است.** prefers-reduced-motion، نبودنِ WebGL،
 *   رندررِ نرم‌افزاری و saveData هرکدام به‌تنهایی و بدونِ توجه به امتیاز،
 *   سقف را پایین می‌کشند. یک گوشیِ پرچمدار که کاربرش reduced-motion خواسته
 *   باید مهتاب بگیرد، نه کهکشان.
 *
 * • **تصمیم قابلِ توضیح است.** ``reasons`` را برمی‌گردانیم تا صفحه‌ی تنظیمات
 *   بتواند بنویسد «دستگاهِ تو: بلور — چون ۵۴ فریم». انتخابِ دستیِ کور
 *   (بدونِ دانستنِ توانِ دستگاه) همان چیزی است که باعث می‌شود کاربر قوی‌ترین
 *   گزینه را بزند و بعد فکر کند اپ خراب است.
 */

export type QualityTier = 'lite' | 'balanced' | 'dream'
export type QualityChoice = 'auto' | QualityTier

/** ترتیبِ لایه‌ها برای مقایسه‌ی «دستِ کم این لایه» */
export const TIER_ORDER: QualityTier[] = ['lite', 'balanced', 'dream']

export interface CapabilityReport {
  /** ۰ = WebGL در دسترس نیست، ۱ = WebGL1، ۲ = WebGL2 */
  webgl: 0 | 1 | 2
  /** رشته‌ی رندررِ GPU (برای تشخیصِ نرم‌افزاری بودن و Mali) */
  renderer: string
  /** رندررِ نرم‌افزاری (SwiftShader/llvmpipe) → GPU واقعی در کار نیست */
  softwareRenderer: boolean
  /**
   * GPU از خانواده‌ی Mali.
   *
   * چرا جدا ردیابی می‌شود: maplibre یک باگِ شناخته‌شده‌ی دقتِ عرضِ جغرافیایی
   * در projection کره‌ای روی Mali دارد (در زومِ ~۱۱ و عرضِ ~۳۰°N). تهران
   * ۳۵٫۷°N و استانبول ۴۱°N نزدیکِ همان نوارند. پس نقشه با دیدنِ این
   * پرچم، کره را خاموش می‌کند و به نقشه‌ی کج‌شده برمی‌گردد — بدونِ این‌که
   * کلِ لایه‌ی کیفیت تنزل پیدا کند.
   */
  mali: boolean
  maxTextureSize: number
  /** تعداد هسته‌های منطقی CPU */
  cores: number
  /** گیگابایت حافظه؛ در اکثرِ مرورگرها غیرِ Chrome در دسترس نیست (null) */
  memoryGB: number | null
  dpr: number
  /** دستگاه لمسی است (گوشی/تبلت) */
  touch: boolean
  /** صفحه‌ی کوچک → گوشی، نه تبلت/لپ‌تاپ */
  smallScreen: boolean
  /** کاربر «صرفه‌جویی در داده» را روشن کرده */
  saveData: boolean
  effectiveType: string
  /** کاربر «کاهش حرکت» را در سطحِ سیستم خواسته */
  reducedMotion: boolean
  ios: boolean
  android: boolean
  /** محیطِ تست (jsdom) — هیچ WebGL و هیچ چیدمانِ واقعی‌ای وجود ندارد */
  isTestEnv: boolean
}

/** آستانه‌های امتیاز برای انتخابِ خودکار */
const DREAM_MIN_SCORE = 8
const BALANCED_MIN_SCORE = 4

/** آستانه‌های فریم */
const FPS_DREAM = 50 // دستِ‌کم این قدر فریم لازم است تا کهکشان مجاز باشد
const FPS_BALANCED = 34 // کمتر از این → مهتاب
const FPS_PANIC = 22 // تنزلِ فوریِ واچ‌داگ

/**
 * کلیدِ حافظه‌ی «آخرین تنزلِ خودکار».
 *
 * چرا لازم است: اگر واچ‌داگ در نشستِ قبل کهکشان را به بلور تنزل داد، نباید
 * نشستِ بعد دوباره با کهکشان شروع کند و همان کندی را تکرار کند. این کلید
 * باعث می‌شود اشتباهِ گذشته تکرار نشود — و چون در localStorage است، از
 * انتخابِ سرور هم مستقل می‌ماند (کیفیت خاصِ هر دستگاه است، نه هر کاربر).
 */
const DOWNGRADE_KEY = 'loveos_quality_downgrade_v1'

/* ---------------------------------------------------------------- محیط --- */

function isTestEnv(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return true
  const ua = navigator.userAgent || ''
  // jsdom خودش را در User-Agent لو می‌دهد؛ Node هم که window ندارد.
  return /jsdom|node\.js/i.test(ua) || typeof (window as any).__loveos_test__ === 'boolean'
}

/* ------------------------------------------------------- سنجه‌ی WebGL --- */

interface WebglProbe {
  webgl: 0 | 1 | 2
  renderer: string
  softwareRenderer: boolean
  mali: boolean
  maxTextureSize: number
}

let cachedWebgl: WebglProbe | null = null

/**
 * یک context موقت می‌سازد، اطلاعاتش را می‌خواند و **فوراً آزادش می‌کند**.
 *
 * نکته‌ی حیاتی: context را از دست می‌دهیم (``forceContextLoss`` + پاک‌کردن
 * مرجع). اگر این کار را نکنیم، هر بارِ صدا زدن یک slot از سهمیه‌ی محدودِ
 * context مرورگر را می‌سوزاند — و iOS Safari در ~۸ تا context قدیمی‌ترین را
 * می‌کشد، که یعنی صحنه‌ی سه‌بعدیِ واقعیِ اپ سفید می‌شود.
 */
function probeWebgl(): WebglProbe {
  if (cachedWebgl) return cachedWebgl
  const fallback: WebglProbe = { webgl: 0, renderer: '', softwareRenderer: true, mali: false, maxTextureSize: 0 }
  if (isTestEnv() || typeof document === 'undefined') {
    cachedWebgl = fallback
    return fallback
  }

  let canvas: HTMLCanvasElement | null = null
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null
  let version: 0 | 1 | 2 = 0
  try {
    canvas = document.createElement('canvas')
    // ترتیب مهم است: اول WebGL2 را می‌خواهیم، بعد WebGL1.
    const gl2 = canvas.getContext('webgl2') as WebGL2RenderingContext | null
    if (gl2) {
      gl = gl2
      version = 2
    } else {
      const gl1 = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
      if (gl1) {
        gl = gl1
        version = 1
      }
    }
  } catch {
    gl = null
    version = 0
  }

  if (!gl || version === 0) {
    cachedWebgl = fallback
    return fallback
  }

  let renderer = ''
  let maxTextureSize = 0
  try {
    // WEBGL_debug_renderer_info تنها راهِ فهمیدنِ مدلِ واقعیِ GPU است؛
    // اگر نبود (که در برخی مرورگرها به‌دلیلِ حریمِ خصوصی حذف شده) خالی می‌ماند
    // و ما هم به آن تکیه نمی‌کنیم، فقط از آن «کمک» می‌گیریم.
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    if (dbg) renderer = String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '')
    if (!renderer) renderer = String(gl.getParameter(gl.RENDERER) || '')
    maxTextureSize = Number(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0)
  } catch {
    /* بعضی driverها این پرسش‌ها را پس می‌زنند؛ بی‌خیال */
  } finally {
    // آزادسازیِ قطعی — چه موفق شدیم چه نه
    try {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      /* ignore */
    }
    canvas = null
    gl = null
  }

  const low = renderer.toLowerCase()
  cachedWebgl = {
    webgl: version,
    renderer,
    // SwiftShader = رندرِ نرم‌افزاریِ Chrome؛ llvmpipe = Mesa نرم‌افزاری؛
    // Microsoft Basic Render Driver = ویندوز بدونِ GPU. هیچ‌کدام برای سه‌بعدی
    // واقعی قابلِ استفاده نیستند.
    softwareRenderer: /swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(low),
    mali: /mali/i.test(low),
    maxTextureSize,
  }
  return cachedWebgl
}

/* ------------------------------------------------------- سنجه‌ی کامل --- */

let cachedReport: CapabilityReport | null = null

/**
 * سنجه‌ی **ایستا**ی توان دستگاه. نتیجه کش می‌شود چون هیچ‌کدام از این
 * مقادیر در طولِ یک نشست عوض نمی‌شوند (و ساختنِ context WebGL گران است).
 *
 * ``recompute`` فقط برای تست لازم است.
 */
export function probeCapability(recompute = false): CapabilityReport {
  if (cachedReport && !recompute) return cachedReport

  const testEnv = isTestEnv()
  const g = probeWebgl()
  const nav = typeof navigator !== 'undefined' ? navigator : null
  const conn = (nav as any)?.connection as
    | { saveData?: boolean; effectiveType?: string }
    | undefined

  const ua = nav?.userAgent || ''
  const ios = /iphone|ipad|ipod/i.test(ua) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints || 0) > 1)
  const android = /android/i.test(ua)

  const mqReduced =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false

  const cores = nav?.hardwareConcurrency ?? 0
  const memoryGB = typeof (nav as any)?.deviceMemory === 'number' ? (nav as any).deviceMemory : null
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const touch =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)').matches || (nav?.maxTouchPoints || 0) > 0
      : false
  const smallScreen =
    typeof window !== 'undefined' ? Math.min(window.screen?.width || 0, window.screen?.height || 0) < 760 : false

  const report: CapabilityReport = {
    webgl: g.webgl,
    renderer: g.renderer,
    softwareRenderer: g.softwareRenderer,
    mali: g.mali,
    maxTextureSize: g.maxTextureSize,
    cores,
    memoryGB,
    dpr,
    touch,
    smallScreen,
    saveData: Boolean(conn?.saveData),
    effectiveType: conn?.effectiveType || '',
    reducedMotion: mqReduced || testEnv,
    ios,
    android,
    isTestEnv: testEnv,
  }
  cachedReport = report
  return report
}

/* ------------------------------------------------------- سنجشِ فریم --- */

/**
 * فریم‌برثانیه‌ی واقعی را در یک بازه‌ی کوتاه اندازه می‌گیرد.
 *
 * چرا این لازم است: ``hardwareConcurrency`` می‌گوید «هشت هسته داری» ولی
 * نمی‌گوید «GPU ات چقدر سریع کامپوزیت می‌کند». هیچ جایگزینی برای شمردنِ
 * واقعِ فریم‌ها وجود ندارد.
 *
 * چگونه بی‌ضرر می‌ماند:
 *   • فقط یک حلقه‌ی ``requestAnimationFrame`` خالی — هیچ کاری روی DOM نمی‌کند،
 *     پس خودش باعثِ کندی نمی‌شود.
 *   • اگر rAF موجود نبود (jsdom بدونِ pretendToBeVisual) عددِ خنثی برمی‌گرداند
 *     و **هرگز** آویزان نمی‌شود — تایم‌اوتِ سخت دارد.
 *   • نخستین فریم دور ریخته می‌شود چون فاصله‌ی «شروع تا اولین rAF» معنادار
 *     نیست و معمولاً خیلی بزرگ است.
 *
 * @returns میانگینِ FPS؛ اگر اندازه‌گیری ممکن نبود ``null``.
 */
export function measureFps(sampleMs = 650, hardTimeoutMs = 2500): Promise<number | null> {
  if (isTestEnv()) return Promise.resolve(null)
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    let frames = 0
    let startedAt = 0
    let settled = false

    const finish = (value: number | null) => {
      if (settled) return
      settled = true
      window.clearTimeout(guard)
      resolve(value)
    }

    // تایم‌اوتِ سخت: اگر مرورگر rAF را متوقف کرد (تبِ پس‌زمینه، دستگاهِ خیلی
    // کند، یا هر دلیلِ دیگر) نباید promise تا ابد باز بماند و لایه‌ی کیفیت
    // هرگز تعیین نشود.
    const guard = window.setTimeout(() => finish(null), hardTimeoutMs)

    const tick = (now: number) => {
      if (settled) return
      if (startedAt === 0) {
        startedAt = now
        window.requestAnimationFrame(tick)
        return
      }
      frames += 1
      const elapsed = now - startedAt
      if (elapsed >= sampleMs) {
        // محافظت در برابر تقسیم بر صفر و فریمِ غیرمعقول
        const fps = elapsed > 0 ? Math.round((frames * 1000) / elapsed) : 0
        finish(fps > 0 && fps <= 240 ? fps : null)
        return
      }
      window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
  })
}

/**
 * نسخه‌ی کش‌شده‌ی ``measureFps``.
 *
 * چرا کش: سنجشِ فریم ~۶۵۰ms طول می‌کشد و یک حلقه‌ی rAF راه می‌اندازد.
 * ``config`` در طولِ نشست چند بار عوض می‌شود (بوت، ورود، هر ذخیره‌ی تنظیمات)
 * و اگر هر بار دوباره بسنجیم، هم بوت کند می‌شود و هم اندازه‌گیری‌های بعدی
 * زیرِ بارِ خودِ اپ انجام می‌شوند که عددِ غلطِ پایین می‌دهند.
 *
 * ``force=true`` فقط وقتی لازم است که کاربر دستی از یک لایه‌ی ثابت به
 * «خودکار» برگردد و بخواهد تصمیمِ تازه بگیریم.
 */
let cachedFps: Promise<number | null> | null = null

export function measureFpsCached(sampleMs = 650, force = false): Promise<number | null> {
  if (!cachedFps || force) cachedFps = measureFps(sampleMs)
  return cachedFps
}

/* --------------------------------------------------- حلِ لایه‌ی کیفیت --- */

export interface QualityDecision {
  tier: QualityTier
  /** چرا این لایه انتخاب شد — برای نمایش در تنظیمات */
  reasons: string[]
  score: number
  fps: number | null
}

/**
 * امتیازِ ایستا را از روی سنجه‌ی توان محاسبه می‌کند.
 *
 * وزن‌ها طوری تنظیم شده‌اند که یک گوشیِ جدیدِ میان‌رده/پرچمدار به کهکشان
 * برسد، یک گوشیِ قدیمی به بلور، و یک دستگاهِ واقعاً ضعیف به مهتاب.
 */
function staticScore(r: CapabilityReport): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0

  if (r.cores >= 8) {
    score += 2
    reasons.push(`${r.cores} هسته`)
  } else if (r.cores >= 6) {
    score += 1.5
    reasons.push(`${r.cores} هسته`)
  } else if (r.cores >= 4) {
    score += 1
    reasons.push(`${r.cores} هسته`)
  } else if (r.cores > 0) {
    reasons.push(`فقط ${r.cores} هسته`)
  }

  if (r.memoryGB != null) {
    if (r.memoryGB >= 8) {
      score += 2
      reasons.push(`${r.memoryGB}GB حافظه`)
    } else if (r.memoryGB >= 4) {
      score += 1.5
      reasons.push(`${r.memoryGB}GB حافظه`)
    } else {
      score += 0.5
      reasons.push(`${r.memoryGB}GB حافظه`)
    }
  } else {
    // مرورگر حافظه را گزارش نمی‌کند (Safari/Firefox). نه جایزه می‌دهیم نه
    // جریمه: ناآگاهی نباید به معنایِ «ضعیف» فرض‌شدن باشد.
    score += 0.5
  }

  if (r.webgl === 2) {
    score += 2
    reasons.push('WebGL2')
  } else if (r.webgl === 1) {
    score += 1
    reasons.push('فقط WebGL1')
  }

  if (r.maxTextureSize >= 8192) score += 1
  else if (r.maxTextureSize >= 4096) score += 0.5

  // دسکتاپ دستِ بازتری دارد (خنک‌کاری بهتر، نمایشگر بزرگ‌تر ولی DPR پایین‌تر)
  if (!r.touch) {
    score += 1.5
    reasons.push('دسکتاپ')
  }

  // DPR بالا یعنی پیکسلِ خیلی بیشتر برای پرکردن. روی گوشی‌های dpr=3 هزینه‌ی
  // رندرِ WebGL تقریباً ۲٫۲۵ برابرِ dpr=2 است. جریمه‌ی ملایم، نه سنگین.
  if (r.dpr > 3) {
    score -= 0.5
    reasons.push('چگالیِ پیکسلِ خیلی بالا')
  } else if (r.dpr <= 2) {
    score += 0.5
  }

  const et = r.effectiveType
  if (et === '4g') {
    score += 1
  } else if (et === '3g') {
    score -= 1
    reasons.push('شبکه‌ی ۳G')
  } else if (et === '2g' || et === 'slow-2g') {
    score -= 2
    reasons.push('شبکه‌ی بسیار کند')
  }

  return { score, reasons }
}

/**
 * سقفِ مجاز را از روی **وتوها** تعیین می‌کند.
 *
 * این‌ها مقدم بر امتیازند: هیچ امتیازی نمی‌تواند از این سقف عبور کند.
 */
function hardCeiling(r: CapabilityReport): { ceiling: QualityTier; why: string[] } {
  const why: string[] = []
  let ceiling: QualityTier = 'dream'

  if (r.isTestEnv) {
    // محیطِ تست هیچ WebGL و هیچ چیدمانِ واقعی ندارد. اگر این‌جا مهتاب
    // ندهیم، three.js داخلِ jsdom استثنا پرتاب می‌کند و تست‌ها می‌شکنند.
    return { ceiling: 'lite', why: ['محیطِ آزمون'] }
  }
  if (r.reducedMotion) {
    why.push('«کاهش حرکت» در سیستم روشن است')
    ceiling = 'lite'
  }
  if (r.webgl === 0 || r.softwareRenderer) {
    why.push(r.webgl === 0 ? 'WebGL در دسترس نیست' : 'رندرِ نرم‌افزاری (GPU واقعی نیست)')
    ceiling = 'lite'
  }
  if (r.saveData) {
    // کاربر صریحاً خواسته داده کمتر مصرف شود. chunk سه‌بعدی ۱۳۵KB است؛
    // احترام به این خواسته مقدم بر زیبایی است.
    why.push('«صرفه‌جویی در داده» روشن است')
    if (TIER_ORDER.indexOf(ceiling) > TIER_ORDER.indexOf('balanced')) ceiling = 'balanced'
  }
  return { ceiling, why }
}

/** امتیازِ فریم را به امتیازِ کل اضافه می‌کند و وتوی فریم را اعمال می‌کند. */
function applyFps(score: number, fps: number | null, reasons: string[]): { score: number; ceiling: QualityTier } {
  if (fps == null) return { score, ceiling: 'dream' }
  reasons.push(`${fps} فریم بر ثانیه`)
  if (fps >= FPS_DREAM) return { score: score + 2, ceiling: 'dream' }
  if (fps >= FPS_BALANCED) return { score: score + 1, ceiling: 'balanced' }
  if (fps >= FPS_PANIC) return { score, ceiling: 'balanced' }
  return { score: score - 3, ceiling: 'lite' }
}

/**
 * لایه‌ی مؤثر را تعیین می‌کند.
 *
 * @param choice   انتخابِ کاربر (auto یا یکی از سه لایه)
 * @param report   سنجه‌ی توان
 * @param fps      فریمِ اندازه‌گیری‌شده (اختیاری)
 */
export function resolveTier(
  choice: QualityChoice,
  report: CapabilityReport = probeCapability(),
  fps: number | null = null,
): QualityDecision {
  const { ceiling, why } = hardCeiling(report)

  // انتخابِ دستیِ کاربر محترم است، ولی هرگز از سقفِ وتو بالاتر نمی‌رود.
  // این مهم است: اگر دخترم دستِ «کهکشان» را بزند ولی دستگاهش WebGL نداشته
  // باشد، اپ باید کار کند نه این‌که سفید شود.
  if (choice !== 'auto') {
    const wanted = choice
    const tier = clampToCeiling(wanted, ceiling)
    const reasons = [...why]
    if (tier !== wanted) reasons.push(`«${wanted}» خواستی ولی دستگاه بیشتر از «${tier}» نمی‌تواند`)
    else reasons.push('انتخابِ دستیِ خودت')
    return { tier, reasons, score: 0, fps }
  }

  const base = staticScore(report)
  const withFps = applyFps(base.score, fps, base.reasons)
  const reasons = [...why, ...base.reasons]
  let score = withFps.score

  // تنزلِ به‌یادمانده‌ی نشستِ قبل: اگر قبلاً فهمیدیم کهکشان روی این دستگاه
  // سنگین است، این نشست را یک پله پایین‌تر شروع می‌کنیم تا همان کندی تکرار
  // نشود. فقط یک پله، نه بیشتر — وگرنه یک گیرِ موقتیِ لحظه‌ای برای همیشه
  // کیفیت را نابود می‌کند.
  const remembered = readDowngradeMemory()
  if (remembered) {
    score -= 4
    reasons.push(`دفعه‌ی قبل ${remembered} سنگین بود`)
  }

  let tier: QualityTier = score >= DREAM_MIN_SCORE ? 'dream' : score >= BALANCED_MIN_SCORE ? 'balanced' : 'lite'
  tier = clampToCeiling(tier, ceiling)

  return { tier, reasons, score: Math.round(score * 10) / 10, fps }
}

/** لایه را به سقفِ مجاز محدود می‌کند. */
function clampToCeiling(tier: QualityTier, ceiling: QualityTier): QualityTier {
  return TIER_ORDER.indexOf(tier) > TIER_ORDER.indexOf(ceiling) ? ceiling : tier
}

/**
 * آیا projection کره‌ایِ نقشه روی این دستگاه امن و مجاز است؟
 *
 * این یک تابعِ **خالص** است و عمداً در ماژولِ مشترک نشسته، نه داخلِ
 * MapOfUs: چون مهم‌ترین تصمیمِ پرریسکِ کلِ فیچرِ کره است و باید بتوان
 * بدونِ بالا‌آوردنِ maplibre و WebGL آزمودش.
 *
 * سه شرط:
 *
 * ۱) لایه‌ی «کهکشان». کره یک projection سه‌بعدیِ کامل است و هزینه‌ی GPU
 *    دارد؛ روی لایه‌های سبک‌تر عمداً خاموش است.
 * ۲) **نه روی GPU از خانواده‌ی Mali.** maplibre یک باگِ شناخته‌شده‌ی دقتِ
 *    عرضِ جغرافیایی در projection کره‌ای دارد (issue #7419: زومِ ~۱۱ و
 *    عرضِ ~۳۰٫۹°N). شهرهای ما — تهران ۳۵٫۷°N و استانبول ۴۱°N — هر دو
 *    نزدیکِ همان نوارند، پس روی Mali نقطه‌ها جابه‌جا دیده می‌شدند. یک خطایِ
 *    بی‌صدا که فقط با نگاهِ دقیق به جایِ شهر کشف می‌شود و کاربر فکر می‌کند
 *    بابا جایِ دیگری است. Mali روی گوشی‌های میان‌رده بسیار رایج است، پس
 *    این گارد عملی است نه نظری.
 * ۳) WebGL واقعی و غیرِنرم‌افزاری. با رندررِ نرم‌افزاری (SwiftShader) کره
 *    آن‌قدر کند می‌شود که عملاً غیرِقابلِ استفاده است.
 *
 * ⚠️ این گارد **فقط کره را** خاموش می‌کند، نه کلِ لایه‌ی کیفیت را. نقشه‌ی
 *    مسطح کاملاً سالم می‌ماند و بقیه‌ی افکت‌های سه‌بعدی سرِ جایشان‌اند.
 */
export function canUseGlobe(tier: QualityTier, report: CapabilityReport = probeCapability()): boolean {
  return tier === 'dream' && !report.mali && report.webgl > 0 && !report.softwareRenderer
}

/** یک پله پایین‌تر (و اگر پایین‌تر نبود، همان) */
export function lowerTier(tier: QualityTier): QualityTier {
  const i = TIER_ORDER.indexOf(tier)
  return i <= 0 ? 'lite' : TIER_ORDER[i - 1]
}

/* ------------------------------------------- حافظه‌ی تنزلِ خودکار --- */

function readDowngradeMemory(): QualityTier | null {
  try {
    const raw = localStorage.getItem(DOWNGRADE_KEY)
    return raw === 'balanced' || raw === 'dream' || raw === 'lite' ? raw : null
  } catch {
    return null
  }
}

/**
 * لایه‌ای را که در عمل سنگین بود به خاطر می‌سپارد.
 *
 * نشستِ بعد با یک امتیازِ منفی شروع می‌کند تا همان کندی تکرار نشود. کلید
 * عمداً فقط این‌جا تعریف شده تا در دو فایل تکرار نشود و روزی از هم واگرا
 * نشوند.
 */
export function writeDowngradeMemory(tier: QualityTier): void {
  try {
    localStorage.setItem(DOWNGRADE_KEY, tier)
  } catch {
    /* حافظه پر است یا حالتِ خصوصی — تصمیم فقط برای همین نشست می‌ماند */
  }
}

/** پاک‌کردنِ حافظه‌ی تنزل (وقتی کاربر دستی لایه را انتخاب می‌کند) */
export function clearDowngradeMemory(): void {
  try {
    localStorage.removeItem(DOWNGRADE_KEY)
  } catch {
    /* ignore */
  }
}

/* --------------------------------------------------- کمک‌های مصرف‌کننده --- */

/**
 * «آیا لایه‌ی فعلی دستِ‌کم این لایه است؟»
 *
 * این تابع را به‌جای ``tier === 'dream'`` استفاده کن تا مقایسه‌ها
 * ترتیبی بمانند و با افزودنِ لایه‌ی تازه در آینده نشکنند.
 */
export function atLeast(current: QualityTier, min: QualityTier): boolean {
  return TIER_ORDER.indexOf(current) >= TIER_ORDER.indexOf(min)
}

/** مقدارِ معتبرِ ``ui_quality`` از سرور/localStorage؛ هر چیزِ دیگری → auto */
export function normalizeChoice(raw: unknown): QualityChoice {
  return raw === 'lite' || raw === 'balanced' || raw === 'dream' || raw === 'auto' ? raw : 'auto'
}

/* ------------------------------------------------------- واچ‌داگِ FPS --- */

export interface WatchdogOptions {
  /** اگر میانه‌ی فریم از این کمتر بود، یک پله تنزل بده */
  threshold?: number
  /** هر چند میلی‌ثانیه یک بار تصمیم بگیر */
  windowMs?: number
  /** چند پنجره‌ی متوالی باید بد باشند تا تنزل دهیم (محافظ در برابر گیرِ لحظه‌ای) */
  strikes?: number
  /** فراخوانِ تنزل */
  onDowngrade: (from: QualityTier, to: QualityTier, fps: number) => void
  /** فراخوانِ گزارشِ دوره‌ای (برای نمایش در تنظیمات) */
  onSample?: (fps: number) => void
}

/**
 * واچ‌داگِ جاریِ فریم.
 *
 * چرا فقط در لایه‌ی کهکشان فعال می‌شود:
 *   خودِ حلقه‌ی rAF هزینه دارد (هر فریم یک بیدارشدنِ JS). در لایه‌های
 *   مهتاب و بلور که WebGL در کار نیست، چیزی برای تنزل دادن وجود ندارد و
 *   پرداختنِ این هزینه بی‌دلیل است.
 *
 * چرا «چند ضربه» لازم است:
 *   یک گیرِ لحظه‌ای (مثلاً همان لحظه‌ای که chunk سه‌بعدی lazy لود می‌شود)
 *   فریم را موقتاً به ۱۰ می‌اندازد. اگر با یک نمونه تنزل بدهیم، تقریباً
 *   همیشه بی‌دلیل تنزل می‌دهیم. پس باید چند پنجره‌ی **متوالی** بد باشند.
 *
 * چرا وقتی تب پنهان است متوقف می‌شود:
 *   مرورگر rAF را در تبِ پس‌زمینه throttling می‌کند (گاهی تا ۱ فریم بر
 *   ثانیه). اگر آن را بشماریم، تنزلِ کاذب می‌دهیم.
 */
export function createFpsWatchdog(opts: WatchdogOptions): { stop: () => void } {
  const threshold = opts.threshold ?? FPS_BALANCED
  const windowMs = opts.windowMs ?? 2200
  const strikesNeeded = opts.strikes ?? 2

  if (isTestEnv() || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return { stop: () => undefined }
  }

  const samples: number[] = []
  let frames = 0
  let windowStart = 0
  let strikes = 0
  let stopped = false
  let rafId = 0

  const onVisibility = () => {
    // با پنهان‌شدنِ تب، شمارش را صفر می‌کنیم تا throttle مرورگر را نشماریم
    if (document.hidden) {
      frames = 0
      windowStart = 0
      samples.length = 0
    }
  }
  document.addEventListener('visibilitychange', onVisibility)

  const tick = (now: number) => {
    if (stopped) return
    if (document.hidden) {
      rafId = window.requestAnimationFrame(tick)
      return
    }
    if (windowStart === 0) {
      windowStart = now
      rafId = window.requestAnimationFrame(tick)
      return
    }
    frames += 1
    const elapsed = now - windowStart
    if (elapsed >= windowMs) {
      const fps = Math.round((frames * 1000) / elapsed)
      frames = 0
      windowStart = now
      if (fps > 0 && fps <= 240) {
        samples.push(fps)
        if (samples.length > 12) samples.shift()
        opts.onSample?.(fps)
        if (fps < threshold) {
          strikes += 1
          if (strikes >= strikesNeeded) {
            stopped = true
            window.cancelAnimationFrame(rafId)
            document.removeEventListener('visibilitychange', onVisibility)
            const median = [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)] ?? fps
            opts.onDowngrade('dream', 'balanced', median)
            return
          }
        } else {
          strikes = 0
        }
      }
    }
    rafId = window.requestAnimationFrame(tick)
  }

  rafId = window.requestAnimationFrame(tick)

  return {
    stop: () => {
      stopped = true
      window.cancelAnimationFrame(rafId)
      document.removeEventListener('visibilitychange', onVisibility)
    },
  }
}

/* ---------------------------------------------- پارالاکسِ مکان‌نما --- */

/**
 * تیلتِ مکان‌نما-محور.
 *
 * چرا ژیروسکوپ نه:
 *   از iOS 13 به بعد ``DeviceMotionEvent.requestPermission()`` لازم است و
 *   حتماً باید داخلِ یک user gesture صدا زده شود — یعنی یک پنجره‌ی اجازه‌ی
 *   اضافه برای یک افکتِ تزئینی، که خیلی‌ها هم ردش می‌کنند. مکان‌نما روی
 *   **همه‌ی** دستگاه‌ها بدونِ اجازه کار می‌کند، پس ما از آن استفاده می‌کنیم
 *   و ژیروسکوپ را فقط روی Android و فقط به‌عنوانِ تقویتِ اختیاری می‌گیریم.
 *
 * @param el        عنصری که ``--tilt-x`` / ``--tilt-y`` رویش ست می‌شود
 * @param maxDeg    بیشترین زاویه‌ی تیلت (کوچک نگهش دار؛ متن نباید کج شود)
 * @returns         تابعِ جداکردنِ listener
 */
export function attachPointerTilt(
  el: HTMLElement,
  opts: { maxDeg?: number; disabled?: () => boolean } = {},
): () => void {
  const maxDeg = opts.maxDeg ?? 6
  const disabled = opts.disabled ?? (() => false)

  const onMove = (e: PointerEvent) => {
    if (disabled()) return
    // فقط مکان‌نمای موس. روی لمس، ``pointermove`` هنگامِ **اسکرول‌کردنِ**
    // صفحه هم شلیک می‌شود و اگر گوش بدهیم هر کارت موقعِ اسکرول کج می‌شود —
    // یعنی یک رابطِ دریازده‌ی حالتِ تهوع. عمقِ لمسی کارِ gyroTilt است.
    if (e.pointerType !== 'mouse') return
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    // نرمال‌سازی به ‎-1..1 نسبت به مرکزِ عنصر
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1
    // نکته‌ی RTL: rotateY فیزیکی است و با dir خودکار آینه نمی‌شود. چون ما
    // «نور از سمتِ آغاز» را می‌خواهیم، در RTL علامتِ X را برعکس می‌کنیم تا
    // جهتِ برجستگی با جهتِ خواندن یکی بماند.
    const rtl = document.documentElement.dir === 'rtl'
    el.style.setProperty('--tilt-x', `${(rtl ? nx : -nx) * maxDeg}deg`)
    el.style.setProperty('--tilt-y', `${-ny * maxDeg}deg`)
    // نور هم با تیلت می‌چرخد تا سطح واقعاً «برجسته» به نظر برسد
    el.style.setProperty('--light-x', `${50 + nx * 22}%`)
    el.style.setProperty('--light-y', `${38 + ny * 18}%`)
  }

  const onLeave = () => {
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
    el.style.removeProperty('--light-x')
    el.style.removeProperty('--light-y')
  }

  el.addEventListener('pointermove', onMove, { passive: true })
  el.addEventListener('pointerleave', onLeave, { passive: true })
  return () => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerleave', onLeave)
    onLeave()
  }
}

/* ------------------------------------------------ تیلتِ ژیروسکوپی --- */

/**
 * تیلت با حرکتِ خودِ دستگاه — برای گوشی، چون موس در کار نیست.
 *
 * ⚠️ چرا روی iOS **هرگز** فعال نمی‌شود:
 *   از iOS 13 به بعد ``DeviceMotionEvent.requestPermission()`` لازم است و
 *   حتماً باید داخلِ یک user gesture صدا زده شود. یعنی یک پنجره‌ی اجازه‌ی
 *   اضافه برای یک افکتِ **تزئینی** — که خیلی‌ها هم ردش می‌کنند و آن‌وقت
 *   تجربه‌ی دو کاربرِ iOS و Android از یک اپ، بی‌دلیل متفاوت می‌شود.
 *   پس روی iOS عمق از راهِ دیگری می‌آید (پارالاکسِ اسکرول، انیمیشنِ ورود،
 *   و اثرِ فیزیکیِ لمس) و هیچ پنجره‌ی اجازه‌ای نمایش داده نمی‌شود.
 *
 * چرا «کالیبراسیونِ نخستین نمونه»:
 *   گوشی ممکن است کج توی دست باشد یا روی میز. اگر زاویه‌ی خام را مستقیم
 *   استفاده کنیم، کارت از همان اول کج می‌ایستد. پس نخستین نمونه را
 *   «صفر» فرض می‌کنیم و بقیه نسبت به آن سنجیده می‌شوند.
 *
 * @returns تابعِ جداکردنِ listener، یا ``null`` اگر فعال نشد.
 */
export function attachGyroTilt(
  el: HTMLElement,
  opts: { maxDeg?: number; disabled?: () => boolean } = {},
): (() => void) | null {
  const maxDeg = opts.maxDeg ?? 4
  const disabled = opts.disabled ?? (() => false)

  if (typeof window === 'undefined' || isTestEnv()) return null
  const report = probeCapability()
  // iOS → هرگز (توضیح بالا). دستگاهِ غیرلمسی هم → بی‌فایده، موس کافی است.
  if (report.ios || report.reducedMotion || !report.touch) return null
  if (typeof window.DeviceOrientationEvent !== 'function') return null

  let baseGamma: number | null = null
  let baseBeta: number | null = null
  let rafPending = false
  let lastGamma = 0
  let lastBeta = 0

  const paint = () => {
    rafPending = false
    if (disabled()) return
    // دامنه را به ‎-1..1 محدود می‌کنیم تا یک چرخشِ شدید، کارت را وارونه نکند
    const nx = clamp(lastGamma / 22, -1, 1)
    const ny = clamp(lastBeta / 22, -1, 1)
    const rtl = document.documentElement.dir === 'rtl'
    el.style.setProperty('--tilt-x', `${(rtl ? nx : -nx) * maxDeg}deg`)
    el.style.setProperty('--tilt-y', `${ny * maxDeg}deg`)
    el.style.setProperty('--light-x', `${50 + nx * 18}%`)
    el.style.setProperty('--light-y', `${40 + ny * 14}%`)
  }

  const onOrient = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return
    if (baseGamma == null || baseBeta == null) {
      baseGamma = e.gamma
      baseBeta = e.beta
    }
    // نسبت به حالتِ اولیه‌ی دستِ کاربر
    let g = e.gamma - baseGamma
    let b = e.beta - baseBeta
    // پرشِ ناگهانی (تکانِ دست) باید نرم شود وگرنه کارت «می‌لرزد»
    lastGamma += (clamp(g, -30, 30) - lastGamma) * 0.18
    lastBeta += (clamp(b, -30, 30) - lastBeta) * 0.18
    if (!rafPending) {
      rafPending = true
      window.requestAnimationFrame(paint)
    }
  }

  window.addEventListener('deviceorientation', onOrient, { passive: true })
  return () => {
    window.removeEventListener('deviceorientation', onOrient)
    el.style.setProperty('--tilt-x', '0deg')
    el.style.setProperty('--tilt-y', '0deg')
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
