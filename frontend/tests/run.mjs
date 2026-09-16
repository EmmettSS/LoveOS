/**
 * run.mjs — اجراکننده‌ی آزمون‌های رابط کاربری
 *
 * این آزمون‌ها بدون مرورگر اجرا می‌شوند: هر فایل `.tsx` کنار همین اسکریپت با esbuild
 * باندل می‌شود، بعد داخل jsdom (که خودِ پروژه دارد) به‌عنوان یک برنامه‌ی Node اجرا می‌شود.
 *
 *   node tests/run.mjs                 # هر دو آزمون
 *   node tests/run.mjs apps-render     # فقط یکی
 *
 * چرا این‌جا و نه جای دیگر؟ چون این‌ها «آزمون رفتار» هستند: مدیر پنجره، تنظیمات
 * (زبان/تم) و رندر همه‌ی اپ‌های تازه با پاسخ‌های واقعی بک‌اند.
 */
import { build } from 'esbuild'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '.build')

const ALL = {
  'boot-sequence': join(here, 'boot-sequence.tsx'),
  'window-manager-settings': join(here, 'window-manager-settings.tsx'),
  'apps-render': join(here, 'apps-render.tsx'),
  'puzzle-win': join(here, 'puzzle-win.tsx'),
  'pdf-book': join(here, 'pdf-book.tsx'),
  'desktop-drag': join(here, 'desktop-drag.tsx'),
  'viewport-fit': join(here, 'viewport-fit.tsx'),
  'depth-tiers': join(here, 'depth-tiers.tsx'),
  // آزمونِ ایستایِ «بهداشتِ سه‌بعدی»: قاعده‌هایی که jsdom هرگز نمی‌بیندشان
  // (چانک‌بندیِ build، تله‌های سافاری، Rules-of-Hooks، جفت‌شدنِ
  // initial/animate در framer). jsdom و React وارد نمی‌کند.
  'three-hygiene': join(here, 'three-hygiene.ts'),
}

const only = process.argv.slice(2)
const selected = Object.entries(ALL).filter(([name]) => only.length === 0 || only.includes(name))

if (selected.length === 0) {
  console.error(`آزمون ناشناخته. گزینه‌ها: ${Object.keys(ALL).join(', ')}`)
  process.exit(2)
}

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

let failed = 0
for (const [name, entry] of selected) {
  if (!existsSync(entry)) {
    console.error(`❌ فایل آزمون پیدا نشد: ${entry}`)
    failed += 1
    continue
  }
  const outfile = join(outDir, `${name}.mjs`)
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    jsx: 'automatic',
    logLevel: 'error',
    // jsdom یک پکیج Node است و باید در زمان اجرا از node_modules خوانده شود
    // (باندل‌کردنش با requireهای پویا می‌شکند)
    external: ['jsdom'],
    // دارایی‌های تصویری/استایل در این آزمون‌ها لازم نیستند
    loader: { '.png': 'text', '.jpg': 'text', '.css': 'empty' },
  })

  console.log(`\n=== ${name} ===`)
  const run = spawnSync(process.execPath, [outfile], { stdio: 'inherit', cwd: resolve(here, '..') })
  if (run.status !== 0) failed += 1
}

console.log(failed === 0 ? '\n🎉 همه‌ی آزمون‌های رابط کاربری پاس شدند' : `\n❌ ${failed} آزمون ناموفق`)
process.exit(failed === 0 ? 0 : 1)
