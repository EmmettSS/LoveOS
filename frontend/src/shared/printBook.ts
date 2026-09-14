/**
 * printBook.ts — چاپ حرفه‌ای کتاب به PDF (A4، مناسب چاپ و صحافی)
 *
 * ✦ بدون هیچ وابستگی بیرونی ✦
 * قبلاً این فایل به `jspdf` و `html2canvas` بند بود؛ اگر آن پکیج‌ها نصب
 * نبودند، خودِ Vite موقع resolve کردنِ import خطا می‌داد و کل اپ دفتر
 * نویسندگی بالا نمی‌آمد. حالا:
 *   ۱) متن و تصویر هر صفحه با Canvas خودِ مرورگر رندر می‌شود (فارسی با شکل
 *      درست حروف، چون همان موتور متنِ مرورگر استفاده می‌شود).
 *   ۲) عکس هر صفحه با canvas.toBlob به JPEG تبدیل می‌شود.
 *   ۳) JPEGها با miniPdf (نویسنده‌ی PDF داخلی خودمان) در یک فایل A4 بسته‌بندی
 *      می‌شوند و دانلود می‌گیرند.
 *
 * خروجی:
 *   • صفحه‌ی ۱: جلد کتاب (عکس جلدِ ثبت‌شده یا جلد طراحی‌شده)
 *   • فهرست با شماره‌ی صفحه‌ی هر فصل
 *   • هر فصل از صفحه‌ی تازه شروع می‌شود
 *   • هدر هر صفحه: نام کتاب (یک طرف) + نام فصل (طرف دیگر)
 *   • پاورقی: شماره‌ی صفحه در وسط
 *
 * استفاده: await exportBookPdf(book, (cur, total) => setProgress(...))
 */
import { digits, formatDate, isFa } from './format'
import { blobToBytes, buildPdf, downloadPdf } from './miniPdf'
import type { PdfImagePage } from './miniPdf'

/* --------------------------------------------------------- تایپ‌های ورودی -- */
export interface PrintNote { author: string; text: string; color: string }
export interface PrintParagraph { text: string; author: string; is_draft: boolean; notes: PrintNote[] }
export interface PrintPage { image: string | null; paragraphs: PrintParagraph[] }
export interface PrintChapter { title: string; is_published: boolean; pages: PrintPage[] }
export interface PrintBook { title: string; subtitle: string; cover: string | null; chapters: PrintChapter[] }

/* ------------------------------------------------------- هندسه‌ی صفحه (A4) -- */
const PAGE_W = 794
const PAGE_H = 1123
const MARGIN_X = 60
const HEADER_H = 84
const FOOTER_H = 54
const CONTENT_W = PAGE_W - MARGIN_X * 2
const CONTENT_TOP = HEADER_H + 16
const CONTENT_H = PAGE_H - CONTENT_TOP - FOOTER_H - 14
const SAFETY = 14 // حاشیه‌ی امن برای اختلاف اندازه‌گیری و رندر

const INK = '#433527'
const MUTED = '#9b8265'
const ACCENT = '#d96a9e'
const HAIRLINE = '#e6d8c3'
const PAPER = '#fffdf9'

const BODY_FONT = 16.5
const BODY_LH = 2.15
const NOTE_FONT = 13.5
const NOTE_LH = 1.9

/** کیفیت/بزرگ‌نمایی رندر: ۲ یعنی حدود ۱۵۰dpi برای چاپ */
const RENDER_SCALE = 2
const JPEG_QUALITY = 0.92

const FONT_STACK = '"Vazirmatn", "Segoe UI", Tahoma, system-ui, sans-serif'
const font = (size: number, weight = 400) => `${weight} ${size}px ${FONT_STACK}`

/**
 * hex (مثل ff88bb) + شفافیت ۰..۱ → rgba(...)
 * بعضی موتورهای canvas هگز ۸ رقمی (ff88bb1c) را نمی‌فهمند؛ rgba امن‌تر است.
 */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const r = parseInt(full.slice(0, 2), 16) || 0
  const g = parseInt(full.slice(2, 4), 16) || 0
  const b = parseInt(full.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/* ------------------------------------------------------------- مدل صفحات -- */
type Block =
  | { kind: 'chapterHead'; num: number; title: string; height: number }
  | { kind: 'text'; lines: string[]; height: number }
  | { kind: 'notes'; notes: PrintNote[]; lines: string[][]; height: number }
  | { kind: 'image'; src: string; height: number }
  | { kind: 'empty'; text: string; height: number }
  | { kind: 'endMark'; height: number }
  | { kind: 'tocRow'; title: string; page: number }

interface BuiltPage {
  kind: 'cover' | 'toc' | 'content'
  chapterTitle: string
  pageNum: number
  blocks: Block[]
}

export interface ImageSize { w: number; h: number }
/** تابع اندازه‌گیری متن — در آزمون‌ها با یک نسخه‌ی ساختگی جایگزین می‌شود */
export type MeasureFn = (text: string, fontSpec: string) => number

/* ------------------------------------------------------------- شکستن متن -- */
/**
 * متن را خط‌به‌خط می‌شکند (کلمه‌به‌کلمه؛ کلمه‌ی خیلی بلند حرف‌به‌حرف).
 * `measure` عرضِ یک رشته را با فونتِ داده‌شده برمی‌گرداند.
 */
export function wrapLines(text: string, maxWidth: number, measure: MeasureFn, fontSpec: string): string[] {
  const out: string[] = []

  /** کلمه‌ای که به‌تنهایی از عرض صفحه بلندتر است — حرف‌به‌حرف می‌شکنیم */
  const breakLongWord = (word: string): string => {
    let piece = ''
    for (const ch of word) {
      if (piece.length > 0 && measure(piece + ch, fontSpec) > maxWidth) {
        out.push(piece)
        piece = ch
      } else {
        piece += ch
      }
    }
    return piece
  }

  for (const hard of text.split('\n')) {
    const words = hard.split(/\s+/).filter((x) => x.length > 0)
    if (words.length === 0) {
      out.push('')
      continue
    }
    let line = ''
    for (const word of words) {
      // خطِ جاری دیگر جا ندارد؟ اول ببندیمش
      if (line.length > 0 && measure(`${line} ${word}`, fontSpec) > maxWidth) {
        out.push(line)
        line = ''
      }
      if (measure(word, fontSpec) > maxWidth) {
        line = breakLongWord(word)
      } else {
        line = line.length === 0 ? word : `${line} ${word}`
      }
    }
    if (line.length > 0) out.push(line)
  }
  return out.length > 0 ? out : ['']
}

/* ----------------------------------------------------------- ساخت صفحات -- */
function chapterHeadHeight(title: string, measure: MeasureFn): number {
  const lines = wrapLines(title, CONTENT_W - 40, measure, font(30, 800))
  return 26 + 20 + lines.length * 46 + 16 + 26
}

function imageSizeFor(size: ImageSize | null): number {
  if (!size || !size.w || !size.h) return 220
  const h = (CONTENT_W * size.h) / size.w
  return Math.max(60, Math.min(h, Math.floor(CONTENT_H * 0.62)))
}

interface FlowCtx {
  pages: BuiltPage[]
  current: BuiltPage
  used: number
  nextNum: number
}

function startPage(ctx: FlowCtx, chapterTitle: string): void {
  const isFirst = ctx.pages.length === 0 && ctx.current.blocks.length === 0
  if (!isFirst) ctx.pages.push(ctx.current)
  ctx.nextNum += 1
  ctx.current = { kind: 'content', chapterTitle, pageNum: ctx.nextNum, blocks: [] }
  ctx.used = 0
}

/** بلوک‌هایی که داخل صفحه‌ی محتوا جا می‌گیرند (tocRow فقط در صفحه‌ی فهرست است) */
type ContentBlock = Exclude<Block, { kind: 'tocRow' }>

function placeBlock(ctx: FlowCtx, block: ContentBlock, gap: number): void {
  const need = block.height + (ctx.used > 0 ? gap : 0)
  if (ctx.used > 0 && need > CONTENT_H - SAFETY) startPage(ctx, ctx.current.chapterTitle)
  ctx.current.blocks.push(block)
  ctx.used += block.height + (ctx.current.blocks.length > 1 ? gap : 0)
}

/**
 * همه‌ی صفحات کتاب را می‌سازد (جلد + فهرست + صفحات محتوا با جریان درست).
 * `images` اندازه‌ی طبیعی عکس‌ها را دارد تا ارتفاعشان درست حساب شود.
 */
export function buildPages(
  book: PrintBook,
  measure: MeasureFn,
  images: Map<string, ImageSize> = new Map(),
): { pages: BuiltPage[]; chapterStart: number[] } {
  const hasContent = book.chapters.some((c) =>
    c.pages.some((p) => p.image || p.paragraphs.some((x) => x.text.trim() || x.notes.length)),
  )

  const ctx: FlowCtx = {
    pages: [],
    current: { kind: 'content', chapterTitle: '', pageNum: 0, blocks: [] },
    used: 0,
    nextNum: 0,
  }

  if (!hasContent) {
    placeBlock(ctx, { kind: 'empty', text: 'هنوز فصلی نوشته نشده است', height: 40 }, 0)
  }

  const chapterStart: number[] = []
  let chapterIdx = 0
  for (const ch of book.chapters) {
    chapterIdx += 1
    startPage(ctx, ch.title)
    chapterStart.push(ctx.current.pageNum)
    placeBlock(ctx, { kind: 'chapterHead', num: chapterIdx, title: ch.title, height: chapterHeadHeight(ch.title, measure) }, 0)

    for (const pg of ch.pages) {
      if (pg.image) {
        const size = images.get(pg.image)
        // عکسی که اندازه‌اش معلوم نیست یعنی بارگذاری نشده → چاپش نمی‌کنیم
        if (size) placeBlock(ctx, { kind: 'image', src: pg.image, height: imageSizeFor(size) + 10 }, 20)
      }
      for (const par of pg.paragraphs) {
        const text = par.text.trim()
        if (text) {
          const bodyFont = font(BODY_FONT, 400)
          const lineH = BODY_FONT * BODY_LH
          // هر تکه باید در یک صفحه جا شود؛ اگر بلندتر بود، خط‌به‌خط تقسیم می‌شود
          let lines = wrapLines(text, CONTENT_W, measure, bodyFont)
          const maxLinesPerPage = Math.max(1, Math.floor((CONTENT_H - SAFETY) / lineH))
          while (lines.length > 0) {
            const piece = lines.slice(0, maxLinesPerPage)
            lines = lines.slice(maxLinesPerPage)
            placeBlock(ctx, { kind: 'text', lines: piece, height: piece.length * lineH + 8 }, 20)
          }
        }
        for (const n of par.notes) {
          const noteLines = wrapLines(n.text, CONTENT_W - 46, measure, font(NOTE_FONT, 400))
          placeBlock(
            ctx,
            { kind: 'notes', notes: [n], lines: [noteLines], height: noteLines.length * NOTE_FONT * NOTE_LH + 26 },
            12,
          )
        }
      }
    }
  }

  placeBlock(ctx, { kind: 'endMark', height: 60 }, 30)
  ctx.pages.push(ctx.current)
  if (ctx.nextNum === 0) ctx.current.pageNum = 1 // کتاب خالی: همان یک صفحه

  const cover: BuiltPage = { kind: 'cover', chapterTitle: '', pageNum: 0, blocks: [] }
  const pages: BuiltPage[] = [cover]
  if (book.chapters.length > 0) {
    pages.push({
      kind: 'toc',
      chapterTitle: '',
      pageNum: 0,
      blocks: book.chapters.map((c, i) => ({ kind: 'tocRow', title: c.title, page: chapterStart[i] })),
    })
  }
  pages.push(...ctx.pages)
  return { pages, chapterStart }
}

/* ------------------------------------------------------------- رندر صفحه -- */
type Ctx = CanvasRenderingContext2D

function paintPaper(ctx: Ctx): void {
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = PAPER
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()
}

function drawLinesRight(ctx: Ctx, lines: string[], rightX: number, top: number, lineH: number, fontSpec: string): number {
  ctx.font = fontSpec
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  lines.forEach((line, i) => {
    if (line.length > 0) ctx.fillText(line, rightX, top + lineH * i + lineH / 2)
  })
  return top + lineH * lines.length
}

function hairline(ctx: Ctx, y: number, x1 = MARGIN_X, x2 = PAGE_W - MARGIN_X, color = HAIRLINE, width = 1.4): void {
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  ctx.moveTo(x1, y)
  ctx.lineTo(x2, y)
  ctx.stroke()
  ctx.restore()
}

function drawRoundedImage(ctx: Ctx, img: CanvasImageSource, x: number, y: number, w: number, h: number, r: number): void {
  ctx.save()
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.drawImage(img, x, y, w, h)
  ctx.restore()
}

function drawHeader(ctx: Ctx, book: PrintBook, page: BuiltPage): void {
  ctx.font = font(11.5, 500)
  ctx.fillStyle = MUTED
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'right'
  ctx.fillText(book.title, PAGE_W - MARGIN_X, 56)
  ctx.textAlign = 'left'
  ctx.fillText(page.chapterTitle, MARGIN_X, 56)
  hairline(ctx, HEADER_H - 14)
}

function drawFooter(ctx: Ctx, page: BuiltPage, isFa: boolean): void {
  ctx.font = font(11.5, 500)
  ctx.fillStyle = MUTED
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(isFa ? digits(page.pageNum) : String(page.pageNum), PAGE_W / 2, PAGE_H - 30)
}

function drawCover(ctx: Ctx, book: PrintBook, dateLabel: string, coverImg: HTMLImageElement | null): void {
  // پس‌زمینه
  const grad = ctx.createLinearGradient(0, 0, PAGE_W * 0.4, PAGE_H)
  grad.addColorStop(0, '#ffe3ef')
  grad.addColorStop(0.48, '#efe3ff')
  grad.addColorStop(1, '#fff4e4')
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
  ctx.restore()

  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const cx = PAGE_W / 2
  const centerY = PAGE_H / 2

  if (coverImg) {
    // عکس جلد: کل صفحه را پر می‌کند (object-fit: cover)
    const scale = Math.max(PAGE_W / coverImg.width, PAGE_H / coverImg.height)
    const dw = coverImg.width * scale
    const dh = coverImg.height * scale
    ctx.save()
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(coverImg, (ctx.canvas.width - dw * RENDER_SCALE) / 2, (ctx.canvas.height - dh * RENDER_SCALE) / 2, dw * RENDER_SCALE, dh * RENDER_SCALE)
    const overlay = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height)
    overlay.addColorStop(0, 'rgba(45,20,40,.16)')
    overlay.addColorStop(0.55, 'rgba(45,20,40,.34)')
    overlay.addColorStop(1, 'rgba(45,20,40,.66)')
    ctx.fillStyle = overlay
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
    ctx.restore()

    ctx.fillStyle = '#ffd3e4'
    ctx.font = font(26)
    ctx.fillText('❤', cx, centerY - 120)
    ctx.fillStyle = '#ffffff'
    ctx.font = font(44, 800)
    wrapLines(book.title, PAGE_W - 160, (s) => ctx.measureText(s).width || s.length * 20, font(44, 800)).forEach((l, i) =>
      ctx.fillText(l, cx, centerY - 56 + i * 62),
    )
    ctx.fillStyle = '#ffe9f2'
    ctx.font = font(18)
    ctx.fillText(book.subtitle, cx, centerY + 40)
    hairline(ctx, centerY + 78, cx - 63, cx + 63, 'rgba(255,255,255,.65)', 2)
    ctx.font = font(13.5)
    ctx.fillText(`${dateLabel}  •  LoveOS`, cx, centerY + 108)
    return
  }

  // جلد بدون عکس
  ctx.save()
  ctx.globalAlpha = 0.09
  ctx.fillStyle = ACCENT
  ctx.font = font(300)
  ctx.fillText('❤', cx, centerY)
  ctx.restore()

  ctx.fillStyle = ACCENT
  ctx.font = font(30)
  ctx.fillText('❤', cx, centerY - 150)
  ctx.fillStyle = '#5b3a52'
  ctx.font = font(46, 800)
  wrapLines(book.title, PAGE_W - 170, (s) => ctx.measureText(s).width || s.length * 20, font(46, 800)).forEach((l, i) =>
    ctx.fillText(l, cx, centerY - 80 + i * 66),
  )
  ctx.fillStyle = '#7d5a72'
  ctx.font = font(18)
  ctx.fillText(book.subtitle, cx, centerY + 40)
  hairline(ctx, centerY + 78, cx - 63, cx + 63, 'rgba(217,106,158,.6)', 2)
  ctx.fillStyle = '#8a6a82'
  ctx.font = font(13.5)
  ctx.fillText(`${dateLabel}  •  LoveOS`, cx, centerY + 108)
}

function drawToc(ctx: Ctx, page: BuiltPage, isFa: boolean): void {
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = INK
  ctx.font = font(26, 800)
  ctx.fillText('فهرست', PAGE_W - MARGIN_X, CONTENT_TOP + 34)

  const rows = page.blocks.filter((b) => b.kind === 'tocRow') as { kind: 'tocRow'; title: string; page: number }[]
  let y = CONTENT_TOP + 96
  rows.forEach((row, i) => {
    const title = row.title.length > 46 ? `${row.title.slice(0, 45)}…` : row.title
    ctx.font = font(16, 600)
    ctx.fillStyle = INK
    ctx.textAlign = 'right'
    const titleW = ctx.measureText(title).width
    ctx.fillText(title, PAGE_W - MARGIN_X, y)
    const numLabel = isFa ? digits(row.page) : String(row.page)
    ctx.font = font(14, 700)
    ctx.fillStyle = MUTED
    ctx.textAlign = 'left'
    const numW = ctx.measureText(numLabel).width
    ctx.fillText(numLabel, MARGIN_X, y)
    hairline(ctx, y - 5, MARGIN_X + numW + 12, PAGE_W - MARGIN_X - titleW - 12, HAIRLINE, 1.2)
    if (i < rows.length - 1) y += 40
  })
}

function drawContent(ctx: Ctx, page: BuiltPage, isFa: boolean, loaded: Map<string, HTMLImageElement>): void {
  let y = CONTENT_TOP
  const rightX = PAGE_W - MARGIN_X

  for (const b of page.blocks) {
    switch (b.kind) {
      case 'chapterHead': {
        ctx.textAlign = 'right'
        ctx.textBaseline = 'alphabetic'
        ctx.fillStyle = ACCENT
        ctx.font = font(14, 700)
        ctx.fillText(isFa ? `فصل ${digits(b.num)}` : `Chapter ${b.num}`, rightX, y + 16)
        ctx.fillStyle = INK
        ctx.font = font(30, 800)
        const titleLines = wrapLines(b.title, CONTENT_W - 40, (s) => ctx.measureText(s).width || s.length * 16, font(30, 800))
        titleLines.forEach((line, i) => ctx.fillText(line, rightX, y + 62 + i * 46))
        const lineY = y + 62 + (titleLines.length - 1) * 46 + 24
        hairline(ctx, lineY, MARGIN_X + 30, PAGE_W / 2 - 18)
        hairline(ctx, lineY, PAGE_W / 2 + 18, rightX - 30)
        ctx.fillStyle = ACCENT
        ctx.font = font(15)
        ctx.textAlign = 'center'
        ctx.fillText('❤', PAGE_W / 2, lineY + 5)
        y += b.height
        break
      }
      case 'text': {
        ctx.fillStyle = INK
        y = drawLinesRight(ctx, b.lines, rightX, y, BODY_FONT * BODY_LH, font(BODY_FONT, 400))
        y += 8
        break
      }
      case 'notes': {
        b.notes.forEach((n, idx) => {
          const lines = b.lines[idx] || []
          const boxH = lines.length * NOTE_FONT * NOTE_LH + 18
          ctx.save()
          ctx.fillStyle = withAlpha(n.color, 0.11)
          if (typeof ctx.roundRect === 'function') {
            ctx.beginPath()
            ctx.roundRect(MARGIN_X, y, CONTENT_W, boxH, 10)
            ctx.fill()
          } else {
            ctx.fillRect(MARGIN_X, y, CONTENT_W, boxH)
          }
          ctx.fillStyle = n.color
          ctx.fillRect(rightX - 3, y, 3, boxH)
          ctx.restore()
          ctx.fillStyle = '#6b5872'
          drawLinesRight(ctx, lines, rightX - 14, y + 9, NOTE_FONT * NOTE_LH, font(NOTE_FONT, 400))
          y += boxH + 8
        })
        break
      }
      case 'image': {
        const img = loaded.get(b.src)
        if (img) {
          const h = b.height - 10
          drawRoundedImage(ctx, img, MARGIN_X, y, CONTENT_W, h, 12)
        }
        y += b.height
        break
      }
      case 'empty': {
        ctx.fillStyle = MUTED
        ctx.font = font(16)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(b.text, PAGE_W / 2, y + 24)
        y += b.height
        break
      }
      case 'endMark': {
        ctx.fillStyle = ACCENT
        ctx.font = font(15)
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('— ❤ —', PAGE_W / 2, y + 30)
        y += b.height
        break
      }
      case 'tocRow':
        break
    }
  }
}

function drawPage(
  ctx: Ctx,
  page: BuiltPage,
  book: PrintBook,
  isFa: boolean,
  dateLabel: string,
  loaded: Map<string, HTMLImageElement>,
): void {
  paintPaper(ctx)
  ctx.save()
  ctx.setTransform(RENDER_SCALE, 0, 0, RENDER_SCALE, 0, 0)
  if ('direction' in ctx) ctx.direction = 'rtl'
  ctx.textBaseline = 'alphabetic'

  if (page.kind === 'cover') {
    drawCover(ctx, book, dateLabel, book.cover ? loaded.get(book.cover) || null : null)
  } else if (page.kind === 'toc') {
    drawToc(ctx, page, isFa)
  } else {
    drawHeader(ctx, book, page)
    drawContent(ctx, page, isFa, loaded)
    drawFooter(ctx, page, isFa)
  }
  ctx.restore()
}

/* ---------------------------------------------------------------- ابزارها -- */
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`تصویر بارگذاری نشد: ${src}`))
    img.src = src
  })
}

async function ensureFonts(): Promise<void> {
  const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts
  if (!fonts) return
  try {
    await Promise.all([
      fonts.load(font(BODY_FONT, 400)),
      fonts.load(font(30, 800)),
      fonts.load(font(14, 700)),
      fonts.ready,
    ])
  } catch {
    /* اگر فونت وب نبود، با فونت سیستمی ادامه می‌دهیم */
  }
}

function makeCanvas(): { canvas: HTMLCanvasElement; ctx: Ctx } {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_W * RENDER_SCALE
  canvas.height = PAGE_H * RENDER_SCALE
  const ctx = canvas.getContext('2d') as Ctx | null
  if (!ctx) throw new Error('canvas-2d-unavailable')
  return { canvas, ctx }
}

function canvasJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('toBlob-failed'))
          return
        }
        void blobToBytes(blob).then(resolve, reject)
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/* --------------------------------------------------------------- خروجی ---- */
/**
 * ساخت و دانلود PDF کامل کتاب — بدون نیاز به هیچ پکیج بیرونی.
 * onProgress(cur, total) بعد از رندر هر صفحه صدا می‌شود.
 */
export async function exportBookPdf(
  book: PrintBook,
  onProgress?: (cur: number, total: number) => void,
): Promise<void> {
  // هم‌راستا با بقیه‌ی اپ: ارقام/تاریخ از format.ts و زبان از i18n می‌آید
  const fa = isFa()
  const dateLabel = formatDate(new Date())

  await ensureFonts()

  // ۱) بارگذاری عکس‌ها (جلد + عکس فصل‌ها)؛ هرکدام که نشد، بی‌صدا حذف می‌شود
  const srcs = new Set<string>()
  if (book.cover) srcs.add(book.cover)
  for (const ch of book.chapters) for (const pg of ch.pages) if (pg.image) srcs.add(pg.image)
  const loaded = new Map<string, HTMLImageElement>()
  await Promise.all(
    Array.from(srcs).map(async (src) => {
      try {
        loaded.set(src, await loadImageEl(src))
      } catch {
        /* عکس دست‌نیافتنی — بدون آن چاپ می‌کنیم */
      }
    }),
  )
  const sizes = new Map<string, ImageSize>()
  for (const [src, img] of loaded) sizes.set(src, { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height })

  // ۲) صفحه‌بندی با اندازه‌گیری واقعی متن روی canvas
  const { canvas, ctx } = makeCanvas()
  const measure: MeasureFn = (text, fontSpec) => {
    ctx.font = fontSpec
    return ctx.measureText(text).width
  }
  const { pages } = buildPages(book, measure, sizes)

  // ۳) رندر هر صفحه و تبدیل به JPEG
  const pdfPages: PdfImagePage[] = []
  for (let i = 0; i < pages.length; i += 1) {
    drawPage(ctx, pages[i], book, fa, dateLabel, loaded)
    pdfPages.push({ jpeg: await canvasJpeg(canvas), width: canvas.width, height: canvas.height })
    onProgress?.(i + 1, pages.length)
  }

  // ۴) ساخت فایل و دانلود
  const bytes = buildPdf(pdfPages, { title: book.title || 'LoveOS', author: 'LoveOS' })
  const safeName = (book.title || 'book').replace(/[\\/:*?"<>|]/g, '_').trim() || 'book'
  downloadPdf(bytes, `${safeName}.pdf`)
}
