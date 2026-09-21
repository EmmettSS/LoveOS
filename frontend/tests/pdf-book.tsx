/**
 * pdf-book.tsx — آزمون خروجی PDF دفتر نویسندگی
 *
 * این آزمون دقیقاً همان مسیری را می‌رود که اپ موقع «دانلود PDF» می‌رود:
 * exportBookPdf → صفحه‌بندی → رندر روی canvas → JPEG → miniPdf.
 * چون jsdom بوم نقاشی ندارد، یک context ساختگی می‌سازیم که همه‌ی دستورهای
 * رسم را ثبت می‌کند؛ بعد خودِ فایل PDF را بایت‌به‌بایت اعتبارسنجی می‌کنیم.
 *
 * چرا این آزمون لازم است؟ چون قبلاً خروجی کتاب به پکیج jspdf بند بود و اگر
 * نصب نبود، کل اپ دفتر نویسندگی با خطای Vite از کار می‌افتاد.
 */
import { JSDOM } from 'jsdom'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dom = new JSDOM('<!doctype html><html lang="fa" dir="rtl"><body></body></html>', { url: 'http://localhost:5173/' })
const w: any = dom.window
const g = globalThis as any
g.window = w
g.document = w.document
Object.defineProperty(g, 'navigator', { value: w.navigator, configurable: true })
for (const k of ['HTMLElement', 'Element', 'Node', 'Event', 'Blob', 'File', 'FormData']) g[k] = w[k]
g.localStorage = w.localStorage
g.atob = (s: string) => Buffer.from(s, 'base64').toString('binary')
g.URL.createObjectURL = () => 'blob:fake-pdf'
g.URL.revokeObjectURL = () => undefined

const localesDir = join(dirname(dirname(fileURLToPath(import.meta.url))), '..', 'public', 'locales')
g.fetch = async (url: string) => {
  const path = String(url)
  if (path.includes('/locales/')) {
    const lang = path.split('/locales/')[1].split('/')[0]
    try {
      const data = JSON.parse(readFileSync(join(localesDir, lang, 'translation.json'), 'utf8'))
      return { ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) }
    } catch {
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' }
    }
  }
  return { ok: true, status: 200, json: async () => ({}), text: async () => '' }
}

let failCount = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failCount += 1
}

/* ------------------------------------------------ context ساختگی canvas -- */
interface Call { op: string; args: unknown[] }
const calls: Call[] = []
const texts: string[] = []

function fakeContext(canvas: any) {
  const state: Record<string, unknown> = { font: '10px sans-serif' }
  const ctx: any = {
    canvas,
    direction: 'ltr',
    measureText: (s: string) => ({ width: String(s).length * 7.4 }),
    setTransform: () => undefined,
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    clip: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    rect: () => undefined,
    roundRect: () => undefined,
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    fillRect: () => undefined,
    strokeRect: () => undefined,
    drawImage: (...a: unknown[]) => calls.push({ op: 'drawImage', args: a }),
    fillText: (s: string, ...rest: unknown[]) => {
      texts.push(String(s))
      calls.push({ op: 'fillText', args: [s, ...rest] })
    },
  }
  for (const key of ['font', 'fillStyle', 'strokeStyle', 'textAlign', 'textBaseline', 'lineWidth', 'globalAlpha', 'direction']) {
    Object.defineProperty(ctx, key, {
      get: () => state[key],
      set: (v) => {
        state[key] = v
      },
    })
  }
  return ctx
}

// یک JPEG حداقلیِ معتبر (۱×۱ سفید) تا فیلتر DCTDecode معنادار بماند
const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='

w.HTMLCanvasElement.prototype.getContext = function () {
  return fakeContext(this)
} as any
w.HTMLCanvasElement.prototype.toBlob = function (cb: any) {
  const bytes = new Uint8Array(Buffer.from(TINY_JPEG_B64, 'base64'))
  const blob: any = new w.Blob([bytes], { type: 'image/jpeg' })
  // jsdom پیاده‌سازی arrayBuffer ندارد؛ مثل مرورگر واقعی اضافه‌اش می‌کنیم
  blob.arrayBuffer = async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  cb(blob)
} as any

// بارگذاری عکس در jsdom واقعی نیست؛ یک Image ساختگی با ابعاد ثابت
class FakeImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  crossOrigin = ''
  naturalWidth = 800
  naturalHeight = 600
  width = 800
  height = 600
  set src(_v: string) {
    setTimeout(() => this.onload?.(), 0)
  }
  get src() {
    return ''
  }
}
g.Image = FakeImage
w.Image = FakeImage as any

// Blob ساخته‌شده برای دانلود را نگه می‌داریم تا بتوانیم بایت‌هایش را ببینیم
let lastParts: Uint8Array[] = []
class RecordingBlob extends w.Blob {
  constructor(parts: any[], opts?: any) {
    super(parts, opts)
    lastParts = (parts || []).map((p: any) => (p instanceof Uint8Array ? p : new Uint8Array(0)))
  }
}
g.Blob = RecordingBlob

let downloaded: { name: string; bytes: Uint8Array } | null = null
let lastHref = ''
Object.defineProperty(w.HTMLAnchorElement.prototype, 'href', {
  set(v: string) {
    lastHref = String(v)
  },
  get() {
    return lastHref
  },
})
w.HTMLAnchorElement.prototype.click = function () {
  const total = lastParts.reduce((n, p) => n + p.length, 0)
  const bytes = new Uint8Array(total)
  let at = 0
  for (const p of lastParts) {
    bytes.set(p, at)
    at += p.length
  }
  downloaded = { name: this.download || '', bytes }
}

/* ------------------------------------------------------------ آزمون‌ها ---- */
// زبان اپ: مثل حالت واقعی فارسی (رقم‌ها و تاریخ شمسی)
const i18nModule = await import('../src/shared/i18n')
await i18nModule.i18nReady
await i18nModule.default.changeLanguage('fa')

const { buildPdf, base64ToBytes, A4_WIDTH_PT, A4_HEIGHT_PT } = await import('../src/shared/miniPdf')
const { buildPages, wrapLines, exportBookPdf } = await import('../src/shared/printBook')

console.log('\n🧪 آزمون خروجی PDF دفتر نویسندگی')

console.log('\n--- ۱) wrapLines ---')
{
  const measure = (s: string) => s.length * 10
  const lines = wrapLines('aaa bbb ccc ddd', 75, measure, 'x')
  check('خط‌ها بر اساس عرض شکسته می‌شوند', lines.length === 2 && lines[0] === 'aaa bbb' && lines[1] === 'ccc ddd', JSON.stringify(lines))
  check('خطِ آخر سرریز نمی‌کند', wrapLines('aaa bbb ccc ddd', 75, measure, 'x').every((l) => measure(l, 'x') <= 75))
  check('کلمه‌ی خیلی بلند حرف‌به‌حرف می‌شکند', wrapLines('aaaaaaaa', 30, measure, 'x').length === 3)
  check('خط خالی حفظ می‌شود', wrapLines('a\n\nb', 100, measure, 'x').length === 3)
}

console.log('\n--- ۲) صفحه‌بندی کتاب ---')
{
  const measure = (s: string) => s.length * 7
  const longText = Array.from({ length: 90 }, (_, i) => `بند شماره‌ی ${i + 1} از فصل اول کتاب ما`).join(' ')
  const book = {
    title: 'کتاب دل',
    subtitle: 'برای دخترم',
    cover: null,
    chapters: [
      { title: 'فصل یکم', is_published: true, pages: [{ image: null, paragraphs: [{ text: longText, author: 'daddy', is_draft: false, notes: [] }] }] },
      { title: 'فصل دوم', is_published: true, pages: [{ image: null, paragraphs: [{ text: 'متن کوتاه فصل دوم', author: 'daddy', is_draft: false, notes: [{ author: 'daughter', text: 'یادداشت من', color: 'ff88bb' }] }] }] },
    ],
  }
  const { pages } = buildPages(book, measure)
  check('صفحه‌ی اول جلد است', pages[0].kind === 'cover')
  check('صفحه‌ی دوم فهرست است', pages[1].kind === 'toc')
  check('فهرست، شماره‌ی صفحه‌ی هر فصل را دارد', pages[1].blocks.length === 2 && pages[1].blocks.every((b) => b.kind === 'tocRow'))
  const content = pages.slice(2)
  check('متن بلند به چند صفحه تقسیم شد', content.length >= 2, `content=${content.length}`)
  check('هر فصل از صفحه‌ی تازه شروع شد', content.filter((p) => p.blocks.some((b) => b.kind === 'chapterHead')).length === 2)
  check('شماره‌ی صفحه‌ها پیوسته است', content.every((p, i) => p.pageNum === i + 1))
  const tocRows = pages[1].blocks as { kind: 'tocRow'; title: string; page: number }[]
  check('شماره‌ی فهرست با صفحه‌ی واقعی فصل می‌خواند', tocRows[0].page === content[0].pageNum && tocRows[1].page === content.find((p) => p.blocks.some((b) => b.kind === 'chapterHead' && (b as any).num === 2))?.pageNum)
}

console.log('\n--- ۳) miniPdf: ساختار فایل ---')
{
  const jpeg = base64ToBytes(TINY_JPEG_B64)
  const bytes = buildPdf(
    [
      { jpeg, width: 4, height: 4 },
      { jpeg, width: 4, height: 4 },
    ],
    { title: 'کتاب دل' },
  )
  const asText = Buffer.from(bytes).toString('latin1')
  check('با %PDF-1.4 شروع می‌شود', asText.startsWith('%PDF-1.4'))
  check('با %%EOF تمام می‌شود', asText.trimEnd().endsWith('%%EOF'))
  check('دو صفحه دارد', /\/Type \/Pages \/Count 2 /.test(asText))
  check('عکس‌ها با DCTDecode جاسازی شدند', (asText.match(/\/Filter \/DCTDecode/g) || []).length === 2)
  check('اندازه‌ی صفحه A4 است', asText.includes(`/MediaBox [0 0 ${A4_WIDTH_PT.toFixed(2)} ${A4_HEIGHT_PT.toFixed(2)}]`))
  check('عنوان فارسی به UTF-16BE نوشته شد', asText.includes('<FEFF'))

  // اعتبارسنجی xref: هر آفست باید دقیقاً روی «N 0 obj» بنشیند
  const startxref = Number(asText.slice(asText.lastIndexOf('startxref') + 10).trim())
  const xrefBlock = asText.slice(startxref)
  const entries = xrefBlock.split('\n').slice(2).filter((l) => / \d{5} n $/.test(l))
  let okOffsets = entries.length > 0
  entries.forEach((line, i) => {
    const off = Number(line.slice(0, 10))
    if (!asText.slice(off).startsWith(`${i + 1} 0 obj`)) okOffsets = false
  })
  check('آفست‌های xref درست‌اند', okOffsets, `${entries.length} آبجکت`)
  const size = Number(/\/Size (\d+)/.exec(asText)![1])
  check('/Size با تعداد آبجکت‌ها می‌خواند', size === entries.length + 1, `size=${size} entries=${entries.length}`)
}

console.log('\n--- ۴) مسیر کامل exportBookPdf ---')
{
  const progress: string[] = []
  const book = {
    title: 'کتاب دل',
    subtitle: 'برای دخترم',
    cover: null,
    chapters: [
      {
        title: 'فصل یکم',
        is_published: true,
        pages: [
          {
            image: '/media/pic.jpg',
            paragraphs: [{ text: 'سلام دخترم، این اولین بند کتاب ماست.', author: 'daddy', is_draft: false, notes: [{ author: 'daughter', text: 'یادداشت دختر', color: 'ff88bb' }] }],
          },
        ],
      },
    ],
  }
  await exportBookPdf(book, (cur, total) => progress.push(`${cur}/${total}`))
  check('دانلود PDF انجام شد', !!downloaded && downloaded.name === 'کتاب دل.pdf', JSON.stringify(downloaded?.name))
  const out = (downloaded as unknown as { bytes: Uint8Array }).bytes
  const asText = Buffer.from(out).toString('latin1')
  check('فایل دانلودشده یک PDF معتبر است', asText.startsWith('%PDF-1.4') && asText.trimEnd().endsWith('%%EOF'), `${out.length} بایت`)
  check('همه‌ی صفحه‌ها در فایل هست', (asText.match(/\/Type \/Page\b/g) || []).length === progress.length, `pages=${(asText.match(/\/Type \/Page\b/g) || []).length}`)
  check('بایت‌های JPEG عیناً داخل فایل‌اند', asText.includes(Buffer.from(TINY_JPEG_B64, 'base64').toString('latin1').slice(0, 40)))
  // نمونه‌ی واقعی فایل برای بررسی دستی (کنار همین باندل ساخته می‌شود)
  writeFileSync(join(dirname(fileURLToPath(import.meta.url)), 'book-sample.pdf'), Buffer.from(out))
  check('onProgress برای هر صفحه صدا شد', progress.length >= 3 && progress[progress.length - 1] === `${progress.length}/${progress.length}`, progress.join(' '))
  check('متن کتاب واقعاً رسم شد', texts.some((t) => t.includes('سلام دخترم')), texts.slice(0, 6).join(' | '))
  check('یادداشت رنگی رسم شد', texts.some((t) => t.includes('یادداشت دختر')))
  check('عکس فصل رسم شد', calls.some((c) => c.op === 'drawImage'))
  check('شماره‌ی صفحه با ارقام فارسی است', texts.some((t) => t === '۱'))
}

console.log(failCount === 0 ? '\n🎉 آزمون PDF پاس شد' : `\n❌ ${failCount} بررسی ناموفق`)
process.exit(failCount === 0 ? 0 : 1)
