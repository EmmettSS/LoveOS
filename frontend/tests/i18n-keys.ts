/**
 * آزمونِ ایستایِ «بهداشتِ ترجمه» — بدونِ jsdom، بدونِ React، زیرِ یک ثانیه.
 *
 * ============================================================================
 * چرا این سوئیت وجود دارد
 * ============================================================================
 * LoveOS دوزبانه است (فارسی/انگلیسی) و سوئیچِ زبان در تنظیمات هست. ولی تا
 * امروز **هیچ آزمونی** کلیدهایِ ترجمه را نمی‌سنجید: برابریِ دو زبان با یک
 * اسکریپتِ دستیِ یک‌بارمصرف بررسی می‌شد و تمام.
 *
 * این خلاء همین امروز یک باگِ واقعی تولید کرد. موتورِ کیفیت
 * (``shared/quality.ts``) یک ماژولِ خالصِ بیرونِ React است و هوکِ ترجمه
 * ندارد، پس دلیل‌هایِ «چرا این لایه؟» را به‌صورتِ **رشته‌ی فارسیِ آماده**
 * در store می‌گذاشت. نتیجه: کاربر زبان را به انگلیسی عوض می‌کرد، کلِ صفحه
 * انگلیسی می‌شد ولی همان یک فهرست فارسی می‌ماند — چون رشته‌ها از قبل یخ
 * زده بودند. اصلاحش این شد که موتور فقط «کلید + آرگومان» بسازد و ترجمه در
 * زمانِ رندر انجام شود.
 *
 * ولی آن اصلاح یک **جفت‌شدگیِ تازه** ساخت: حالا نامِ کلیدها در یک ماژولِ
 * غیرِکامپوننت زندگی می‌کند و اگر کسی کلیدی را اضافه یا عوضِ نام دهد، هیچ
 * چیزی در build نمی‌شکند — کاربر فقط رشته‌ی خامِ
 * ``settings.qualityVetoSaveData`` را روی صفحه می‌بیند. بخشِ ۶ همین سوئیت
 * دقیقاً همان جفت‌شدگی را نگهبانی می‌کند.
 *
 * ============================================================================
 * چرا ایستا و نه رندری
 * ============================================================================
 * یک آزمونِ رندری فقط کلیدهایی را می‌گیرد که در همان مسیرِ رندرشده مصرف
 * شوند. کلیدِ «دلیلِ تنزلِ فریم» فقط وقتی ساخته می‌شود که نگهبانِ فریم واقعاً
 * تنزل بدهد — یعنی روی دستگاهِ واقعی و در شرایطِ کم‌سرعت. با بررسیِ ایستایِ
 * منبع، **همه‌ی** کلیدها یک‌جا و بدونِ نیاز به شبیه‌سازیِ آن شرایط سنجه
 * می‌شوند.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

/* ---------------------------------------------------------------- ریشه --- */

/**
 * ریشه‌ی فرانت را با بالا‌رفتن از محلِ همین فایل پیدا می‌کند.
 *
 * ⚠️ شمارشِ ``dirname`` جواب نمی‌دهد: runner این فایل را به
 * ``tests/.build/`` باندل می‌کند (سه سطح زیرِ ریشه) ولی اگر مستقیم اجرا شود
 * دو سطح است. پس به‌جای شمارش، دنبالِ پوشه‌ای می‌گردیم که **هم** ``src``
 * دارد **هم** ``vite.config.ts``.
 */
function findRoot(file: string): string {
  let cur = dirname(file)
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(cur, 'src')) && existsSync(join(cur, 'vite.config.ts'))) return cur
    const up = join(cur, '..')
    if (up === cur) break
    cur = up
  }
  throw new Error(`ریشه‌ی فرانت‌اند از ${file} پیدا نشد`)
}

const root = findRoot(fileURLToPath(import.meta.url))
const srcDir = join(root, 'src')

/* -------------------------------------------------------------- شمارش --- */

let pass = 0
let fail = 0
const failures: string[] = []

function ok(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    pass += 1
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`)
  } else {
    fail += 1
    failures.push(detail ? `${name} — ${detail}` : name)
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** بازگشتی همه‌ی کلیدها را به شکلِ نقطه‌دار تخت می‌کند: ``settings.quality`` */
function flatten(obj: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const key = `${prefix}${k}`
    if (Array.isArray(v)) {
      // آرایه‌ها **محتوا** هستند نه ساختارِ کلید. ``boot.lines`` در فارسی ۵
      // عنصر دارد و در انگلیسی ۷، و این تفاوت **عمدی** است — متنِ بوت به هر
      // زبان جدا نوشته شده. اگر آرایه را مثلِ شیء باز می‌کردیم، برابریِ دو
      // زبان به‌دروغ شکست می‌خورد (``boot.lines.5.label`` فقط در انگلیسی).
      // پس آرایه یک برگ است و ساختارِ عنصرهایش جداگانه در بخشِ ۷ سنجه
      // می‌شود. ``Boot.tsx`` این را با ``returnObjects: true`` می‌خواند.
      out[key] = `[array:${v.length}]`
    } else if (v !== null && typeof v === 'object') {
      Object.assign(out, flatten(v, `${key}.`))
    } else {
      out[key] = String(v)
    }
  }
  return out
}

/**
 * کامنت‌ها را با فاصله جایگزین می‌کند و **شماره‌ی خط‌ها را نگه می‌دارد**.
 *
 * ⚠️ ماشینِ حالت آگاه از رشته است: ``//`` داخلِ ``'https://…'`` کامنت نیست.
 * این درس را از ``three-hygiene`` آورده‌ایم، جایی که نسخه‌ی اول شش مثبتِ
 * کاذب داد چون متنِ خودِ کامنت‌ها با الگوها می‌خواند.
 */
function stripComments(src: string): string {
  const out: string[] = []
  let i = 0
  let quote: string | null = null
  const n = src.length
  while (i < n) {
    const c = src[i]
    if (quote) {
      out.push(c)
      if (c === '\\') {
        out.push(i + 1 < n ? src[i + 1] : '')
        i += 2
        continue
      }
      if (c === quote) quote = null
      i += 1
      continue
    }
    if (c === '"' || c === "'" || c === '`') {
      quote = c
      out.push(c)
      i += 1
      continue
    }
    if (c === '/' && src[i + 1] === '/') {
      while (i < n && src[i] !== '\n') i += 1
      out.push(' ')
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i + 1 < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1
      i += 2
      out.push(' ')
      continue
    }
    out.push(c)
    i += 1
  }
  return out.join('')
}

const read = (p: string) => stripComments(readFileSync(p, 'utf8'))
const rel = (p: string) => relative(root, p)

function walk(dir: string, out: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name)
    if (ent.isDirectory()) walk(p, out)
    else if (ent.name.endsWith('.ts') || ent.name.endsWith('.tsx')) out.push(p)
  }
  return out
}

/* ================================================================= بخشِ ۱ */
console.log('\n  ── بخشِ ۱: برابریِ دو زبان ──')

const FA_PATH = join(root, 'public/locales/fa/translation.json')
const EN_PATH = join(root, 'public/locales/en/translation.json')
ok('هر دو فایلِ ترجمه وجود دارند', existsSync(FA_PATH) && existsSync(EN_PATH))

const faRaw = JSON.parse(readFileSync(FA_PATH, 'utf8')) as Record<string, any>
const enRaw = JSON.parse(readFileSync(EN_PATH, 'utf8')) as Record<string, any>
const fa = flatten(faRaw)
const en = flatten(enRaw)
const faKeys = new Set(Object.keys(fa))
const enKeys = new Set(Object.keys(en))

const onlyFa = [...faKeys].filter((k) => !enKeys.has(k))
const onlyEn = [...enKeys].filter((k) => !faKeys.has(k))
ok('هیچ کلیدی فقط در فارسی نیست', onlyFa.length === 0, onlyFa.slice(0, 6).join('، '))
ok('هیچ کلیدی فقط در انگلیسی نیست', onlyEn.length === 0, onlyEn.slice(0, 6).join('، '))
ok('دو زبان هم‌اندازه‌اند', faKeys.size === enKeys.size, `fa=${faKeys.size} en=${enKeys.size}`)

/* ================================================================= بخشِ ۲ */
console.log('\n  ── بخشِ ۲: مقدارها ──')

const emptyFa = Object.entries(fa).filter(([, v]) => !v.trim()).map(([k]) => k)
const emptyEn = Object.entries(en).filter(([, v]) => !v.trim()).map(([k]) => k)
ok('هیچ مقدارِ خالی در فارسی نیست', emptyFa.length === 0, emptyFa.slice(0, 6).join('، '))
ok('هیچ مقدارِ خالی در انگلیسی نیست', emptyEn.length === 0, emptyEn.slice(0, 6).join('، '))

// اگر یک رشته‌ی انگلیسی عیناً در فارسی هم باشد، یا کلید ترجمه نشده مانده
// یا عمداً لاتین است (مثلِ «WebGL 2»). پس این **هشدارِ شمارشی** است نه شکست:
// فقط کلیدهایی را می‌گیریم که حروفِ فارسی ندارند و بلند هم هستند.
const LONG = 18
/**
 * رشته‌هایی که **عمداً** در دو زبان یکی‌اند. این فهرست باید کوچک بماند و
 * هر عضویش دلیل داشته باشد، وگرنه تبدیل می‌شود به سطلِ زباله‌ای که
 * ترجمه‌هایِ جامانده را پنهان می‌کند.
 */
const INTENTIONALLY_IDENTICAL = new Set([
  // promptِ واقعیِ ``sudo`` در یونیکس است. ترجمه‌اش یعنی ترمینال درباره‌ی
  // سیستم دروغ بگوید — بامزه‌ی ماجرا دقیقاً این است که عینِ خودِ sudo باشد.
  'terminal.sudoPrompt',
])
const untranslated = Object.keys(fa).filter(
  (k) =>
    fa[k] === en[k] &&
    fa[k].length >= LONG &&
    !/[^\x00-\x7F]/.test(fa[k]) &&
    !INTENTIONALLY_IDENTICAL.has(k),
)
ok('رشته‌ی بلندِ لاتینِ یکسان در دو زبان = ترجمه‌ی جامانده نیست', untranslated.length === 0,
  untranslated.slice(0, 5).map((k) => `${k}: «${fa[k]}»`).join(' | '))

/* ================================================================= بخشِ ۳ */
console.log('\n  ── بخشِ ۳: جای‌نماهایِ درون‌یابی ──')

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_]+)\s*(?:,[^}]*)?\}\}/g
const placeholders = (s: string) => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]).sort()

const phMismatch = [...faKeys]
  .filter((k) => enKeys.has(k))
  .filter((k) => placeholders(fa[k]).join('|') !== placeholders(en[k]).join('|'))
ok('جای‌نماهایِ {{…}} در دو زبان یکی است', phMismatch.length === 0,
  phMismatch.slice(0, 5).map((k) => `${k}: fa={${placeholders(fa[k])}} en={${placeholders(en[k])}}`).join(' | '))

// جای‌نمایِ بی‌نام مثلِ {{-}} یا {{0}} در این پروژه استفاده نمی‌شود؛ اگر روزی
// ظاهر شود یعنی یک ترجمه با قالبِ اشتباه نوشته شده.
const weirdPh = [...faKeys].filter((k) => /\{\{\s*[-0-9]/.test(fa[k]))
ok('جای‌نمایِ ناشناس/عددی در فارسی نیست', weirdPh.length === 0, weirdPh.slice(0, 4).join('، '))

/* ================================================================= بخشِ ۴ */
console.log('\n  ── بخشِ ۴: کلیدهایِ مصرف‌شده در کد ──')

const srcFiles = walk(srcDir)
ok('منبع پیدا شد', srcFiles.length > 40, `${srcFiles.length} فایل`)

const LITERAL_T = /(?:\bt|i18n\.t)\(\s*['"]([A-Za-z0-9_.]+)['"]/g
const used = new Set<string>()
for (const f of srcFiles) {
  for (const m of read(f).matchAll(LITERAL_T)) used.add(m[1])
}
const missingFa = [...used].filter((k) => !faKeys.has(k)).sort()
const missingEn = [...used].filter((k) => !enKeys.has(k)).sort()
ok(`هر ${used.size} کلیدِ literalِ مصرف‌شده در فارسی هست`, missingFa.length === 0, missingFa.slice(0, 6).join('، '))
ok(`هر ${used.size} کلیدِ literalِ مصرف‌شده در انگلیسی هست`, missingEn.length === 0, missingEn.slice(0, 6).join('، '))

/* ================================================================= بخشِ ۵ */
console.log('\n  ── بخشِ ۵: عنوانِ اپ‌ها در registry ──')

// ⚠️ این‌ها با ``t('…')`` نوشته **نمی‌شوند**؛ ``titleKey: 'apps.map'`` یک
// داده است و بعداً در Desktop/Dock/Window مصرف می‌شود. پس الگویِ بخشِ ۴
// هرگز نمی‌بیندشان و یک کلیدِ گمشده این‌جا یعنی عنوانِ اپ روی دسکتاپ به
// شکلِ رشته‌ی خامِ «apps.xyz» نشان داده شود.
const registry = read(join(srcDir, 'os/appRegistry.ts'))
const titleKeys = [...registry.matchAll(/titleKey:\s*['"]([A-Za-z0-9_.]+)['"]/g)].map((m) => m[1])
ok('registry دستِ‌کم ۳۰ عنوانِ اپ دارد', titleKeys.length >= 30, `${titleKeys.length} عنوان`)
const badTitles = titleKeys.filter((k) => !faKeys.has(k) || !enKeys.has(k))
ok('عنوانِ هر اپ در هر دو زبان هست', badTitles.length === 0, badTitles.join('، '))
ok('عنوانِ تکراری در registry نیست', new Set(titleKeys).size === titleKeys.length,
  titleKeys.filter((k, i) => titleKeys.indexOf(k) !== i).join('، '))

/* ================================================================= بخشِ ۶ */
console.log('\n  ── بخشِ ۶: خانواده‌هایِ پویایِ موتورِ کیفیت ──')

const quality = read(join(srcDir, 'shared/quality.ts'))

/**
 * عضوهایِ خانواده را از **خودِ منبع** می‌خوانیم، نه هاردکد. اگر روزی لایه‌ی
 * چهارمی به ``TIER_ORDER`` اضافه شود، این آزمون خودبه‌خود کلیدِ ترجمه‌ی
 * همان را هم مطالبه می‌کند.
 */
const tierOrder = [...(/TIER_ORDER[^=]*=\s*\[([^\]]*)\]/.exec(quality)?.[1] ?? '')
  .matchAll(/'([a-z]+)'/g)].map((m) => m[1])
ok('TIER_ORDER از منبع خوانده شد', tierOrder.length === 3, tierOrder.join('، '))

// ``QualityChoice = 'auto' | QualityTier`` — پس «auto» هم عضوِ خانواده‌ی
// نامِ لایه‌هاست و باید ترجمه داشته باشد.
const choices = ['auto', ...tierOrder]
const missingTier = choices.filter((c) => !faKeys.has(`settings.tier_${c}`) || !enKeys.has(`settings.tier_${c}`))
ok(`settings.tier_* برای هر ${choices.length} انتخاب کامل است`, missingTier.length === 0, missingTier.join('، '))

const missingDesc = tierOrder.filter((c) => !faKeys.has(`settings.qualityDesc_${c}`) || !enKeys.has(`settings.qualityDesc_${c}`))
ok(`settings.qualityDesc_* برای هر ${tierOrder.length} لایه کامل است`, missingDesc.length === 0, missingDesc.join('، '))

/**
 * کلیدهایِ **دلیلِ لایه**.
 *
 * موتورِ کیفیت رشته‌ی ترجمه‌شده نمی‌سازد (نمی‌تواند — بیرونِ React است)، پس
 * ``{ key: 'qualityCores', args: { n } }`` می‌سازد و ``Settings.tsx`` آن را
 * با ``t(`settings.${r.key}`)`` ترجمه می‌کند. این یعنی نامِ کلید در یک
 * ماژولِ غیرِکامپوننت زندگی می‌کند و **هیچ تایپ‌چکی آن را نگهبانی نمی‌کند**:
 * کلیدِ اشتباه یا فراموش‌شده باعثِ خطا نمی‌شود، فقط رشته‌ی خام روی صفحه
 * می‌آید. این بررسی همان جفت‌شدگی را می‌بندد.
 */
const engineFiles = ['shared/quality.ts', 'shared/store.ts']
const emitted = new Set<string>()
for (const f of engineFiles) {
  for (const m of read(join(srcDir, f)).matchAll(/\bkey:\s*['"](quality[A-Za-z0-9_]*)['"]/g)) emitted.add(m[1])
}
ok('موتورِ کیفیت دلیلِ ساختاریافته می‌سازد', emitted.size >= 10, `${emitted.size} کلید`)
const missingReason = [...emitted].filter(
  (k) => !faKeys.has(`settings.${k}`) || !enKeys.has(`settings.${k}`),
)
ok(`کلیدِ ترجمه‌ی هر ${emitted.size} دلیلِ موتور در هر دو زبان هست`, missingReason.length === 0,
  missingReason.map((k) => `settings.${k}`).join('، '))

// هیچ دلیلِ **رشته‌ایِ** فارسی نباید از موتور بیرون برود — همان باگی که
// این سوئیت به‌خاطرش ساخته شد. اگر کسی دوباره ``reasons.push('۸ هسته')``
// بنویسد، تایپ‌چک می‌شکند (چون reasons آرایه‌ی شیء است) ولی اگر نوع را هم
// عوض کند این بررسی می‌گیردش.
const persianInEngine = engineFiles.filter((f) => {
  const t = read(join(srcDir, f))
  return /push\(\s*[`'"][^`'"]*[\u0600-\u06FF]/.test(t)
})
ok('موتورِ کیفیت هیچ رشته‌ی فارسیِ آماده بیرون نمی‌دهد', persianInEngine.length === 0,
  persianInEngine.map((f) => rel(join(srcDir, f))).join('، '))

/* ================================================================= بخشِ ۷ */
console.log('\n  ── بخشِ ۷: ساختارِ محتوایِ آرایه‌ای ──')

/**
 * آرایه‌ها از برابریِ کلیدها بیرون‌اند، ولی ساختارشان **قراردادِ کد** است.
 *
 * ``Boot.tsx`` این‌ها را می‌خواند:
 *   • ``acc + l.label.length`` — **بدونِ گارد**. یک عنصرِ بدونِ ``label``
 *     صفحه‌ی بوت را با TypeError می‌ترکاند، یعنی اپ اصلاً بالا نمی‌آید.
 *   • ``{line.status}`` و ``line.tone || 'ok'`` و ``TONE_COLOR[tone]``
 *   • ``line.final ? …`` — نقطه‌ی پایانیِ بوت
 *
 * هیچ‌کدام از این‌ها با تایپ‌چک گرفته نمی‌شوند چون داده از JSON می‌آید.
 */
const TONES = new Set(['ok', 'cyan', 'violet', 'pink', 'amber', 'heart'])

for (const [loc, raw] of [['fa', faRaw], ['en', enRaw]] as const) {
  const lines: unknown = raw?.boot?.lines
  if (!Array.isArray(lines)) {
    ok(`boot.lines در ${loc} آرایه است`, false, `${typeof lines}`)
    continue
  }
  const rows = lines as Array<Record<string, unknown>>
  ok(`boot.lines در ${loc} آرایه است`, true, `${rows.length} خط`)

  const bad = (test: (l: Record<string, unknown>) => boolean) =>
    rows.map((l, i) => ({ l, i })).filter(({ l }) => test(l)).map(({ i }) => `#${i}`)

  const noLabel = bad((l) => typeof l.label !== 'string' || !(l.label as string).trim())
  ok(`هر ${rows.length} خطِ بوتِ ${loc} برچسبِ متنی دارد (بی‌گارد خوانده می‌شود)`,
    noLabel.length === 0, noLabel.join('، '))

  const noStatus = bad((l) => typeof l.status !== 'string' || !(l.status as string).trim())
  ok(`هر ${rows.length} خطِ بوتِ ${loc} وضعیتِ متنی دارد`, noStatus.length === 0, noStatus.join('، '))

  const badTone = bad((l) => l.tone != null && !TONES.has(String(l.tone)))
  ok(`لحنِ هر خطِ بوتِ ${loc} از شش لحنِ شناخته‌شده است`, badTone.length === 0, badTone.join('، '))

  const finals = rows.map((l, i) => (l.final ? i : -1)).filter((i) => i >= 0)
  ok(`بوتِ ${loc} دقیقاً یک نقطه‌ی پایانی دارد و آن آخرین خط است`,
    finals.length === 1 && finals[0] === rows.length - 1, finals.join('، '))
}

/* ---------------------------------------------------------------- نتیجه --- */
console.log(`\n  جمع: ${pass} پاس · ${fail} شکست`)
if (fail > 0) {
  console.log('\n  شکست‌ها:')
  for (const f of failures) console.log(`    • ${f}`)
}
console.log(fail === 0 ? '\n🎉 آزمونِ بهداشتِ ترجمه پاس شد\n' : '\n❌ آزمونِ بهداشتِ ترجمه شکست خورد\n')

// هم‌شکلی با بقیه‌ی سوئیت‌ها. این فایل حلقه‌ی بی‌پایان ندارد، ولی اگر روزی
// React یا i18next به آن اضافه شد، بدونِ این خط پروسه آویزان می‌ماند.
process.exit(fail === 0 ? 0 : 1)
