/**
 * three-hygiene.ts — آزمونِ «بهداشتِ سه‌بعدی» (ایستا، روی متنِ منبع)
 *
 * --------------------------------------------------------------------------
 * چرا یک سوئیتِ ایستا و نه رندرِ کامپوننت‌ها
 * --------------------------------------------------------------------------
 * بیشترِ باگ‌های این فاز **رندری نبودند**؛ یعنی jsdom آن‌ها را هرگز نمی‌دید
 * چون یا فقط در مرورگرِ واقعی ظاهر می‌شوند (سافاری preserve-3d را تخت
 * می‌کند) یا فقط موقعِ build (چانکِ three.js به precache سرِ کار می‌رود) یا
 * فقط روی دستگاهِ واقعی (frame drops). سوئیتِ ``depth-tiers`` رفتارِ رندر را
 * می‌سنجد؛ این سوئیت **قاعده‌های منبع** را.
 *
 * هر بررسیِ این‌جا یک باگِ **واقعیِ رخ‌داده** در همین فاز است، نه یک قاعده‌ی
 * حدسی. شماره‌ی هر بخش به آن باگ اشاره می‌کند.
 *
 * ⚠️ این فایل عمداً jsdom و React وارد نمی‌کند: فقط متنِ منبع می‌خواند.
 *    پس سریع است (زیرِ یک ثانیه) و هیچ نشتیِ رویدادی ندارد که احتیاج به
 *    ``process.exit`` پیدا کند — ولی برای هم‌شکلی با بقیه‌ی سوئیت‌ها در
 *    پایان همان ``process.exit`` را دارد.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * ریشه‌ی فرانت‌اند.
 *
 * ⚠️ عمداً با شمارشِ ``dirname`` پیدا نمی‌شود: این فایل توسط ``run.mjs``
 *    با esbuild به ``tests/.build/three-hygiene.mjs`` باندل می‌شود، پس
 *    ``import.meta.url`` سه سطح پایین‌تر از ریشه است — و اگر مستقیم هم
 *    اجرا شود فقط دو سطح. نسخه‌ی اولِ این فایل همان اشتباه را کرد و
 *    ``tests/src/apps`` را می‌گشت.
 *
 *    راهِ مقاوم: از جایِ خودِ فایل بالا برو تا پوشه‌ای را پیدا کنی که هم
 *    ``src`` دارد هم ``vite.config.ts``.
 */
function findRoot(from: string): string {
  let dir = dirname(from)
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'src')) && existsSync(join(dir, 'vite.config.ts'))) return dir
    const up = dirname(dir)
    if (up === dir) break
    dir = up
  }
  throw new Error(`ریشه‌ی فرانت‌اند از ${from} پیدا نشد`)
}

const root = findRoot(fileURLToPath(import.meta.url))
const srcDir = join(root, 'src')

let pass = 0
let fail = 0
const failures: string[] = []

function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass++
    console.log(`  ✅ ${name}`)
  } else {
    fail++
    failures.push(detail ? `${name} — ${detail}` : name)
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** همه‌ی فایل‌های .tsx/.ts یک پوشه، بازگشتی */
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(e.name)) out.push(p)
  }
  return out
}

/**
 * کامنت‌ها را با فاصله جایگزین می‌کند ولی **شماره‌ی خط‌ها را نگه می‌دارد**.
 *
 * ⚠️ چرا لازم است: نسخه‌ی اولِ این سوئیت شش شکست گزارش کرد که **هر شش
 *    تا** مثبتِ کاذب بودند — متنِ خودِ کامنت‌ها با الگوها匹配 می‌شد. مثلاً
 *    در Vault.tsx کامنتی هست که توضیح می‌دهد چرا
 *    ``useQualityTier() !== 'lite' && useMotionAllowed()`` **غلط** است؛
 *    آزمون همان کامنت را به‌عنوانِ کدِ گناهکار گرفت. در CSS هم کامنتِ
 *    «``will-change`` عمداً ندارد» و «به ``:has()`` نرفتیم» باعثِ شکست شد.
 *
 *    یعنی آزمونِ بهداشت، خودش نیاز به بهداشت داشت. حذفِ کامنت با حفظِ
 *    شماره‌ی خط این را حل می‌کند: گزارش‌ها هنوز به خطِ درستِ **کد**
 *    اشاره می‌کنند.
 *
 *    رشته‌ها عمداً دست‌نخورده می‌مانند تا الگوها داخلِ رشته هم جست‌وجو
 *    نشوند (مثلاً ``'useFoo('`` در یک رشته).
 */
function stripComments(text: string, lineComments = true): string {
  let out = ''
  let i = 0
  const n = text.length
  let inStr: string | null = null
  while (i < n) {
    const c = text[i]
    const c2 = text.slice(i, i + 2)
    if (inStr) {
      if (c === '\\') { out += text.slice(i, i + 2); i += 2; continue }
      out += c
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; out += c; i++; continue }
    // ⚠️ ``//`` فقط در JS/TS کامنت است. در CSS نیست — و اگر این شرط را
    //    روی CSS هم اعمال می‌کردیم، یک ``url(https://…)`` بقیه‌ی خط را
    //    پاک می‌کرد و آزمون روی متنِ ناقص قضاوت می‌کرد.
    if (lineComments && c2 === '//') { while (i < n && text[i] !== '\n') { out += ' '; i++ } continue }
    if (c2 === '/*') {
      out += '  '; i += 2
      while (i < n && text.slice(i, i + 2) !== '*/') { out += text[i] === '\n' ? '\n' : ' '; i++ }
      out += '  '; i += 2
      continue
    }
    out += c
    i++
  }
  return out
}

const appFiles = walk(join(srcDir, 'apps'))
const osFiles = walk(join(srcDir, 'os'))
const allFiles = [...appFiles, ...osFiles, ...walk(join(srcDir, 'shared')), ...walk(join(srcDir, 'three'))]
/** متنِ منبع با کامنت‌های حذف‌شده (شماره‌ی خط‌ها حفظ می‌شود) */
const read = (p: string) => stripComments(readFileSync(p, 'utf8'), !p.endsWith('.css'))
const rel = (p: string) => relative(root, p)

/* ==========================================================================
   بخشِ ۱ — Rules-of-Hooks
   --------------------------------------------------------------------------
   این دسته **دو بار** در همین فاز رخ داد و هر دو بار oxlint گرفتشان، ولی
   oxlint در CIِ ما فقط به‌صورتِ دستی اجرا می‌شود. پس این‌جا هم قفل می‌شود
   تا اگر روزی oxlint از قلم افتاد، آزمون بگیردش.

   باگِ (الف): ``useQualityTier() !== 'lite' && useMotionAllowed()``
              چون ``&&`` کوتاه می‌کند، هوکِ دوم همیشه صدا زده نمی‌شد.
   باگِ (ب):  هوک‌ها **زیرِ** یک ``return`` زودهنگام بودند.
   ========================================================================== */
console.log('\n  ── بخشِ ۱: Rules-of-Hooks ──')

const HOOK_CALL = /\buse[A-Z][A-Za-z0-9]*\s*\(/
const SHORT_CIRCUIT_HOOK = /use[A-Z][A-Za-z0-9]*\([^()]*\)\s*(?:!==|===|&&|\|\|)\s*[^()\n]*&&\s*use[A-Z][A-Za-z0-9]*\(/

let shortCircuitHits = 0
let hookAfterReturnHits: string[] = []

for (const f of allFiles) {
  const text = read(f)
  const lines = text.split('\n')

  // (الف) کوتاه‌شدنِ دو هوک با &&
  lines.forEach((ln, i) => {
    if (SHORT_CIRCUIT_HOOK.test(ln)) {
      shortCircuitHits++
      hookAfterReturnHits.push(`${rel(f)}:${i + 1} دو هوک با && کوتاه شده‌اند`)
    }
  })

  // (ب) هوک زیرِ returnِ زودهنگام. فایل را به بلوک‌های کامپوننت تقسیم
  //     می‌کنیم: هر خطی که در ستونِ صفر با function/const/export شروع شود
  //     مرزِ بلوک است. این‌طور هوکِ کامپوننتِ دومِ همان فایل به‌اشتباه به
  //     کامپوننتِ اول نسبت داده نمی‌شود.
  let blockStart = -1
  let blockName = ''
  const blocks: Array<{ name: string; start: number; end: number }> = []
  lines.forEach((ln, i) => {
    if (/^(export\s+)?(default\s+)?function\s+[A-Za-z]/.test(ln) || /^(export\s+)?const\s+[A-Z][A-Za-z0-9]*\s*[:=]/.test(ln)) {
      if (blockStart >= 0) blocks.push({ name: blockName, start: blockStart, end: i })
      blockStart = i
      blockName = ln.trim().slice(0, 44)
    }
  })
  if (blockStart >= 0) blocks.push({ name: blockName, start: blockStart, end: lines.length })

  for (const b of blocks) {
    let firstEarlyReturn = -1
    for (let i = b.start; i < b.end; i++) {
      // ``return`` در سطحِ بدنه‌ی کامپوننت (تورفتگیِ ۲ فاصله) و به‌شکلِ
      // ``if (...) return``. تورفتگیِ بیشتر یعنی داخلِ callback است و
      // عمداً نادیده گرفته می‌شود.
      if (/^ {2}if \(.*\) return[ (<]/.test(lines[i])) {
        firstEarlyReturn = i
        break
      }
    }
    if (firstEarlyReturn < 0) continue
    for (let i = firstEarlyReturn + 1; i < b.end; i++) {
      if (/^ {2}(const|let)\s+.*=\s*use[A-Z]/.test(lines[i]) || /^ {2}use[A-Z][A-Za-z0-9]*\s*\(/.test(lines[i])) {
        hookAfterReturnHits.push(`${rel(f)}:${i + 1} هوک زیرِ returnِ زودهنگامِ خطِ ${firstEarlyReturn + 1} (${b.name})`)
      }
    }
  }
}

ok('هیچ‌جا دو هوک با && کوتاه نشده‌اند', shortCircuitHits === 0, `${shortCircuitHits} مورد`)
ok('هیچ هوکی زیرِ returnِ زودهنگام نیست', hookAfterReturnHits.length === 0, hookAfterReturnHits.join(' | '))

/* ==========================================================================
   بخشِ ۲ — تله‌ی «دو منبعِ transform»
   --------------------------------------------------------------------------
   باگِ (پ): در EggOverlay مقدارِ ``rotateX`` فقط در ``initial`` بود و
   ``animate`` نداشتش. framer مقدارِ ذکرنشده را **نگه می‌دارد**، پس عنصر
   برای همیشه کج می‌ماند. باگِ بی‌صدایی که فقط با نگاه‌کردن کشف می‌شد.

   باگِ (ت): ``animation-fill-mode: both`` روی ``.os-depth-list`` مقدارِ کلیدِ
   پایانی را برای همیشه روی عنصر می‌گذاشت و چون انیمیشنِ CSS در آبشار بر
   ``transform`` درون‌خطی می‌بَرَد، تیلتِ همان بچه بی‌صدا خورده می‌شد.
   ========================================================================== */
console.log('\n  ── بخشِ ۲: تله‌های transform ──')

const KEYS_3D = ['rotateX', 'rotateY', 'rotateZ', 'z']
const parityHits: string[] = []

for (const f of allFiles) {
  const text = read(f)
  // هر ``initial={{ ... }}`` را با ``animate={{ ... }}``ِ بعد از آن جفت کن
  const re = /initial=\{\{([^}]*)\}\}([\s\S]{0,260}?)animate=\{\{([^}]*)\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const initKeys = (m[1].match(/(\w+)\s*:/g) || []).map((k) => k.replace(':', '').trim())
    const animKeys = (m[3].match(/(\w+)\s*:/g) || []).map((k) => k.replace(':', '').trim())
    for (const k of KEYS_3D) {
      if (initKeys.includes(k) && !animKeys.includes(k)) {
        const line = text.slice(0, m.index).split('\n').length
        parityHits.push(`${rel(f)}:${line} «${k}» در initial هست ولی در animate نیست`)
      }
    }
  }
}
ok('هر کلیدِ سه‌بعدیِ initial در animate هم بسته می‌شود', parityHits.length === 0, parityHits.join(' | '))

const cssText = read(join(srcDir, 'styles/index.css'))
const depthListRule = /\.os-depth-list\s*>\s*\*\s*\{[^}]*\}/.exec(cssText)?.[0] ?? ''
ok('.os-depth-list از fill-mode «backwards» استفاده می‌کند نه «both»', /\bbackwards\b/.test(depthListRule) && !/\bboth\b/.test(depthListRule), depthListRule.slice(0, 80))

/* ==========================================================================
   بخشِ ۳ — بهداشتِ باندل و PWA
   --------------------------------------------------------------------------
   باگِ (ث): نسخه‌ی اولِ ``manualChunks`` عبارتِ ``/src/three/`` را هم در
   چانکِ ``loveos-3d`` می‌گذاشت. rollup در پاسخ ``shared/quality.ts`` را به
   آن چانک **مهاجرت** داد و چون باندلِ اصلی هم به آن نیاز دارد،
   ``index.js`` یک ``import`` ایستا از loveos-3d گرفت → کاربرِ مهتاب هم
   ۱۳۲KB gzip three.js را در شروع دانلود می‌کرد.

   باگِ (ج): ``CinemaHall-*.js`` بی‌صدا به precache رفت (۸۳ → ۸۵ ورودی).
   ========================================================================== */
console.log('\n  ── بخشِ ۳: باندل و PWA ──')

const viteText = read(join(root, 'vite.config.ts'))
const manualChunksBody = /manualChunks\(id\)\s*\{([\s\S]*?)\n        \}/.exec(viteText)?.[1] ?? ''
ok('manualChunks فقط three را گروه می‌کند، نه src/three را', !manualChunksBody.includes('/src/three/'), manualChunksBody.trim().slice(0, 90))
ok('manualChunks خودِ node_modules/three را برمی‌دارد', manualChunksBody.includes('node_modules/three/'))

// هر پوسته‌ی صحنه‌ی lazy باید از precache مستثنا باشد
const threeDir = join(srcDir, 'three')
const sceneWrappers = readdirSync(threeDir).filter((n) => n.endsWith('.tsx'))
const missingIgnores: string[] = []
for (const n of sceneWrappers) {
  const base = n.replace(/\.tsx$/, '')
  if (!viteText.includes(`**/${base}-*.js`)) missingIgnores.push(base)
}
ok('همه‌ی پوسته‌های صحنه در globIgnores هستند', missingIgnores.length === 0, `مفقود: ${missingIgnores.join(', ')}`)

const missingRuntime: string[] = []
for (const n of sceneWrappers) {
  const base = n.replace(/\.tsx$/, '')
  const re = new RegExp(`urlPattern:[^\\n]*${base}`)
  if (!re.test(viteText)) missingRuntime.push(base)
}
ok('همه‌ی پوسته‌های صحنه در urlPatternِ CacheFirst هستند', missingRuntime.length === 0, `مفقود: ${missingRuntime.join(', ')}`)

// هیچ ماژولِ غیرِ three نباید مستقیم three را import کند
const badThreeImports = allFiles.filter((f) => !f.includes(`${join(srcDir, 'three')}`) && /from ['"]three['"]/.test(read(f)))
ok('هیچ ماژولِ بیرونِ src/three مستقیم three وارد نمی‌کند', badThreeImports.length === 0, badThreeImports.map(rel).join(', '))

// هر صحنه باید lazy باشد، نه importِ ایستا
const staticSceneImports: string[] = []
for (const n of sceneWrappers) {
  const base = n.replace(/\.tsx$/, '')
  for (const f of [...appFiles, ...osFiles]) {
    const t = read(f)
    if (new RegExp(`^import\\s+${base}\\s+from`, 'm').test(t)) staticSceneImports.push(`${rel(f)} → ${base}`)
  }
}
ok('هیچ صحنه‌ی WebGL ایستا import نمی‌شود (همه lazy)', staticSceneImports.length === 0, staticSceneImports.join(', '))

/* ==========================================================================
   بخشِ ۴ — سازگاریِ CSS با گوشیِ هدف (iOS 15)
   --------------------------------------------------------------------------
   قانون‌های مستندشده: ``color-mix()`` نیاز به سافاری ۱۶٫۲ دارد،
   ``:has()`` و ``@container`` هم همین‌طور. و ``will-change: transform`` روی
   ``.os-depth`` یک لایه‌ی GPU **دائمی** می‌سازد که عمداً حذف شده بود.
   ========================================================================== */
console.log('\n  ── بخشِ ۴: سازگاریِ CSS ──')

const countOf = (re: RegExp) => (cssText.match(re) || []).length
ok('color-mix() در CSS نیست (سافاری ۱۶٫۲+)', countOf(/color-mix\(/g) === 0, `${countOf(/color-mix\(/g)} مورد`)
ok(':has() در CSS نیست', countOf(/:has\(/g) === 0, `${countOf(/:has\(/g)} مورد`)
ok('@container در CSS نیست', countOf(/@container/g) === 0, `${countOf(/@container/g)} مورد`)

const osDepthRule = /\.os-depth\s*\{[^}]*\}/.exec(cssText)?.[0] ?? ''
ok('.os-depth «will-change: transform» ندارد', !/will-change/.test(osDepthRule))
ok('backdrop-filter با پیشوندِ -webkit- هم آمده', /-webkit-backdrop-filter/.test(cssText))

// همه‌ی مقدارهای سه‌بعدی باید در --q3d ضرب شده باشند، وگرنه در مهتاب
// هم فعال می‌مانند و کلِ مدلِ «مهتاب = صفر» می‌شکند.
const tiltRule = /\.os-tilt-card,[\s\S]{0,90}?\{([^}]*)\}/.exec(cssText)?.[1] ?? ''
ok('تیلتِ کارت‌ها در --q3d ضرب شده', tiltRule.includes('--q3d'))
const depthListKf = /@keyframes loveos-depth-in\s*\{[\s\S]*?\n\}/.exec(cssText)?.[0] ?? ''
ok('ورودِ پلکانیِ فهرست در --q3d ضرب شده', depthListKf.includes('--q3d'))

/* ==========================================================================
   بخشِ ۵ — قاعده‌های سختِ پروژه
   --------------------------------------------------------------------------
   باگِ (چ): اگر ``.os-crt`` روی خودِ ظرفِ اسکرولِ ترمینال می‌نشست،
   ``::after`` (بازتابِ شیشه) با هر اسکرول جابه‌جا می‌شد و شیشه روی متن
   می‌لغزید.
   ========================================================================== */
console.log('\n  ── بخشِ ۵: قاعده‌های سخت ──')

const crtHits: string[] = []
for (const f of allFiles) {
  const lines = read(f).split('\n')
  lines.forEach((ln, i) => {
    if (/os-crt\b/.test(ln) && /overflow-y-auto|overflow-auto|overflow-y-scroll/.test(ln)) {
      crtHits.push(`${rel(f)}:${i + 1}`)
    }
  })
}
ok('.os-crt هیچ‌جا روی ظرفِ اسکرول نیست', crtHits.length === 0, crtHits.join(', '))

// نقشه‌ی ویرایش‌پذیرِ خونه‌ی رویایی باید touchAction: 'none' داشته باشد
// (قاعده‌ی سختِ پروژه: دست‌نزدن به touchAction). بدونِ آن، کشیدنِ اتاق
// روی گوشی به‌جایِ جابه‌جاییِ اتاق صفحه را اسکرول می‌کند.
const dreamText = read(join(srcDir, 'apps/DreamHome.tsx'))
ok("نقشه‌ی ویرایش‌پذیرِ خونه هنوز touchAction: 'none' دارد", /touchAction: 'none'/.test(dreamText))
ok('نقشه و ماکت دو حالتِ جدا هستند (view state)', /view === 'model'/.test(dreamText) && /view === 'plan'|setView\('plan'\)/.test(dreamText))

// سقفِ صحنه‌های زنده نباید بی‌صدا بالا رفته باشد
const useThree = read(join(srcDir, 'three/useThreeScene.ts'))
const cap = /MAX_LIVE_SCENES = (\d+)/.exec(useThree)?.[1]
ok('سقفِ صحنه‌های زنده هنوز ۲ است', cap === '2', `مقدارِ فعلی: ${cap}`)
ok('dispose شاملِ forceContextLoss است', /forceContextLoss/.test(useThree))

// هر صحنه باید onFallback/onUnavailable داشته باشد تا تنزل باوقار باشد
for (const n of sceneWrappers) {
  const t = read(join(threeDir, n))
  ok(`${n} مسیرِ تنزل (onUnavailable) دارد`, /onUnavailable/.test(t))
}

/* ---------------------------------------------------------------- نتیجه --- */
console.log(`\n  جمع: ${pass} پاس · ${fail} شکست`)
if (fail > 0) {
  console.log('\n  شکست‌ها:')
  for (const f of failures) console.log(`    • ${f}`)
}
console.log(fail === 0 ? '\n🎉 آزمونِ بهداشتِ سه‌بعدی پاس شد\n' : '\n❌ آزمونِ بهداشتِ سه‌بعدی شکست خورد\n')

// برای هم‌شکلی با بقیه‌ی سوئیت‌ها. این فایل حلقه‌ی بی‌پایان ندارد، ولی
// اگر روزی importِ React/framer به آن اضافه شد، بدونِ این خط پروسه آویزان
// می‌ماند (درسِ گرفته‌شده از depth-tiers).
process.exit(fail === 0 ? 0 : 1)
