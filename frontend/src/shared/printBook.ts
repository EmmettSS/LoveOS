/**
 * printBook.ts — چاپ حرفه‌ای کتاب به PDF (مقاس A4، مناسب چاپ و صحافی)
 *
 * چرا html2canvas + jsPDF؟ چون متن فارسی را خودِ مرورگر (با فونت و شکل‌های
 * صحیح حروف) رندر می‌کند و ما هر صفحه را با کیفیت بالا عکس‌برداری و در PDF
 * می‌گذاریم؛ بنابراین هیچ مشکل «شکسته شدن حروف» یا «فونت غلط» پیش نمی‌آید.
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
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'

import { digits, formatDate } from './format'

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
const SAFETY = 14 // حاشیه‌ی امن برای اختلاف رندر canvas و DOM

const INK = '#433527'
const MUTED = '#9b8265'
const ACCENT = '#d96a9e'
const HAIRLINE = '#e6d8c3'
const PAPER = '#fffdf9'

const BODY_FONT = 16.5
const BODY_LH = 2.15

/* --------------------------------------------------------- مدل صفحات ---- */
type Block =
  | { kind: 'chapterHead'; num: number; title: string }
  | { kind: 'text'; text: string }
  | { kind: 'notes'; notes: PrintNote[] }
  | { kind: 'image'; src: string }
  | { kind: 'empty'; text: string }
  | { kind: 'endMark' }
  | { kind: 'tocRow'; title: string; page: number }

interface BuiltPage {
  kind: 'cover' | 'toc' | 'content'
  chapterTitle: string
  pageNum: number
  blocks: Block[]
  el?: HTMLElement
}

/* ------------------------------------------------------------- اندازه‌گیری -- */
let measurer: HTMLDivElement | null = null

function getMeasurer(): HTMLDivElement {
  if (measurer && document.body.contains(measurer)) return measurer
  const el = document.createElement('div')
  el.style.cssText = `
    position: fixed; top: 0; left: -12000px; width: ${CONTENT_W}px;
    visibility: hidden; pointer-events: none; box-sizing: border-box;
    font-family: inherit; background: transparent;
  `
  document.body.appendChild(el)
  measurer = el
  return el
}

/** ارتفاع یک HTML با فونت/فاصله‌ی مشخص را می‌سنجد */
function measureHtml(html: string, fontSize = BODY_FONT, lineHeight = BODY_LH): number {
  const el = getMeasurer()
  el.innerHTML = html
  el.style.fontSize = `${fontSize}px`
  el.style.lineHeight = `${lineHeight}`
  return Math.ceil(el.offsetHeight || 0)
}

/** ارتفاع یک متن با سبک بدنه */
function measureText(text: string): number {
  return measureHtml(escapeHtml(text))
}

/** متن را به تکه‌هایی می‌شکند که هر کدام در یک صفحه (maxH) جا می‌گیرند */
function splitTextToPieces(text: string, maxH: number): string[] {
  if (measureText(text) <= maxH) return [text]
  const pieces: string[] = []
  let rest = text
  let guard = 0
  while (rest.length > 0 && guard < 50) {
    guard += 1
    if (measureText(rest) <= maxH) {
      pieces.push(rest)
      break
    }
    // بزرگ‌ترین پیشوندی که در maxH جا می‌شود (جست‌وجوی دودویی)
    let lo = 1
    let hi = rest.length
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2)
      if (measureText(rest.slice(0, mid)) <= maxH) lo = mid
      else hi = mid - 1
    }
    // به آخر کلمه‌ی کامل عقب می‌رویم تا وسط کلمه نبنزند
    const space = rest.lastIndexOf(' ', lo)
    const cut = space >= lo * 0.35 ? space + 1 : lo
    pieces.push(rest.slice(0, cut))
    rest = rest.slice(cut).replace(/^\s+/, '')
  }
  if (rest.length > 0) pieces.push(rest)
  return pieces
}

/* ------------------------------------------------------------- تصاویر ----- */
function loadImageEl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`تصویر بارگذاری نشد: ${src}`))
    img.src = src
  })
}

function imageHeightFor(natW: number, natH: number): number {
  if (!natW || !natH) return 220
  const h = (CONTENT_W * natH) / natW
  return Math.max(60, Math.min(h, Math.floor(CONTENT_H * 0.62)))
}

/* --------------------------------------------------------- ساخت صفحات ---- */
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

function placeBlock(ctx: FlowCtx, block: Block, h: number, gap: number): void {
  const need = h + (ctx.used > 0 ? gap : 0)
  if (ctx.used > 0 && need > CONTENT_H - SAFETY) startPage(ctx, ctx.current.chapterTitle)
  ctx.current.blocks.push(block)
  ctx.used += h + (ctx.current.blocks.length > 1 ? gap : 0)
}

/** همه‌ی صفحات کتاب را می‌سازد (جلد + فهرست + صفحات محتوا با جریان درست) */
async function buildPages(book: PrintBook): Promise<BuiltPage[]> {
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
    placeBlock(ctx, { kind: 'empty', text: 'هنوز فصلی نوشته نشده است' }, 40, 0)
  }

  const chapterStartPage: number[] = []
  let chapterIdx = 0
  for (const ch of book.chapters) {
    chapterIdx += 1
    startPage(ctx, ch.title)
    chapterStartPage.push(ctx.current.pageNum)
    placeBlock(ctx, { kind: 'chapterHead', num: chapterIdx, title: ch.title }, 150, 0)

    for (const pg of ch.pages) {
      if (pg.image) {
        try {
          const img = await loadImageEl(pg.image)
          placeBlock(ctx, { kind: 'image', src: pg.image }, imageHeightFor(img.naturalWidth, img.naturalHeight) + 10, 20)
        } catch {
          /* تصویر دست‌نیافتنی — از چاپ حذف می‌شود */
        }
      }
      for (const par of pg.paragraphs) {
        const text = par.text.trim()
        if (text) {
          const pieces = splitTextToPieces(text, CONTENT_H - SAFETY)
          for (const piece of pieces) {
            placeBlock(ctx, { kind: 'text', text: piece }, measureText(piece) + 8, 20)
          }
        }
        if (par.notes.length > 0) {
          const notesHtml = par.notes
            .map((n) => `<div style="margin-top:10px;padding:9px 14px">${escapeHtml(n.text)}</div>`)
            .join('')
          placeBlock(ctx, { kind: 'notes', notes: par.notes }, measureHtml(notesHtml, 13.5, 1.9) + 26, 20)
        }
      }
    }
  }

  // نشان پایانِ کتاب
  placeBlock(ctx, { kind: 'endMark' }, 60, 30)
  ctx.pages.push(ctx.current)
  if (ctx.nextNum === 0) ctx.current.pageNum = 1 // کتاب خالی: همان یک صفحه

  // صفحه‌ی جلد و فهرست
  const cover: BuiltPage = { kind: 'cover', chapterTitle: '', pageNum: 0, blocks: [] }
  const result: BuiltPage[] = [cover]
  if (book.chapters.length > 0) {
    result.push({
      kind: 'toc',
      chapterTitle: '',
      pageNum: 0,
      blocks: book.chapters.map((c, i) => ({ kind: 'tocRow', title: c.title, page: chapterStartPage[i] })),
    })
  }
  result.push(...ctx.pages)
  return result
}

/* --------------------------------------------------------- رندر DOM ---- */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderBlock(el: HTMLElement, b: Block, isFa: boolean): void {
  const div = document.createElement('div')
  switch (b.kind) {
    case 'chapterHead': {
      div.style.cssText = 'margin-bottom:26px'
      const num = document.createElement('p')
      num.textContent = isFa ? `فصل ${digits(b.num)}` : `Chapter ${b.num}`
      num.style.cssText = `margin:0 0 6px;font-size:14px;letter-spacing:1px;color:${ACCENT};font-weight:700`
      const title = document.createElement('h2')
      title.textContent = b.title
      title.style.cssText = `margin:0;font-size:30px;font-weight:800;color:${INK};line-height:1.5`
      const line = document.createElement('div')
      line.style.cssText = `margin-top:16px;display:flex;align-items:center;gap:10px;color:${ACCENT}`
      line.innerHTML = `<span style="flex:1;height:1.5px;background:${HAIRLINE};border-radius:2px"></span><span style="font-size:15px">❤</span><span style="flex:1;height:1.5px;background:${HAIRLINE};border-radius:2px"></span>`
      div.append(num, title, line)
      break
    }
    case 'text': {
      const p = document.createElement('p')
      p.textContent = b.text
      p.style.cssText = `margin:0;font-size:${BODY_FONT}px;line-height:${BODY_LH};color:${INK};white-space:pre-line;text-align:right`
      div.appendChild(p)
      break
    }
    case 'notes': {
      div.style.cssText = 'margin-top:2px'
      b.notes.forEach((n, i) => {
        const nd = document.createElement('div')
        nd.textContent = n.text
        nd.style.cssText = `margin-top:${i === 0 ? 0 : 8}px;padding:9px 14px;font-size:13.5px;line-height:1.9;color:#6b5872;background:${n.color}1c;border-right:3px solid ${n.color};border-radius:10px;white-space:pre-line`
        div.appendChild(nd)
      })
      break
    }
    case 'image': {
      const img = document.createElement('img')
      img.src = b.src
      img.alt = ''
      img.style.cssText = 'width:100%;height:auto;border-radius:12px;display:block'
      div.appendChild(img)
      break
    }
    case 'empty': {
      const p = document.createElement('p')
      p.textContent = b.text
      p.style.cssText = `margin:0 auto;text-align:center;color:${MUTED};font-size:16px;line-height:2`
      div.appendChild(p)
      break
    }
    case 'endMark': {
      const p = document.createElement('p')
      p.textContent = '— ❤ —'
      p.style.cssText = `margin:0;text-align:center;color:${ACCENT};font-size:15px;letter-spacing:2px`
      div.appendChild(p)
      break
    }
    case 'tocRow':
      // در صفحه‌ی فهرست با renderToc رندر می‌شود، نه اینجا
      return
  }
  el.appendChild(div)
}

function renderHeader(page: BuiltPage, book: PrintBook): void {
  const header = document.createElement('div')
  header.style.cssText = `position:absolute;top:34px;left:${MARGIN_X}px;right:${MARGIN_X}px;display:flex;justify-content:space-between;align-items:baseline;font-size:11.5px;color:${MUTED}`
  const bookName = document.createElement('span')
  bookName.textContent = book.title
  const chapter = document.createElement('span')
  chapter.textContent = page.chapterTitle
  header.append(bookName, chapter)
  const line = document.createElement('div')
  line.style.cssText = `position:absolute;top:${HEADER_H - 14}px;left:${MARGIN_X}px;right:${MARGIN_X}px;height:1px;background:${HAIRLINE}`
  page.el!.append(header, line)
}

function renderFooter(page: BuiltPage, isFa: boolean): void {
  const f = document.createElement('div')
  f.style.cssText = 'position:absolute;bottom:26px;left:0;right:0;text-align:center;font-size:11.5px;color:#9b8265'
  f.textContent = isFa ? digits(page.pageNum) : String(page.pageNum)
  page.el!.appendChild(f)
}

function renderToc(page: BuiltPage, book: PrintBook, isFa: boolean): void {
  void book
  const content = document.createElement('div')
  content.style.cssText = `position:absolute;top:${CONTENT_TOP + 10}px;left:${MARGIN_X}px;right:${MARGIN_X}px;bottom:${FOOTER_H}px`
  const h = document.createElement('h2')
  h.textContent = 'فهرست'
  h.style.cssText = `margin:0 0 34px;font-size:26px;font-weight:800;color:${INK}`
  content.appendChild(h)
  const rows = page.blocks.filter((b) => b.kind === 'tocRow') as { kind: 'tocRow'; title: string; page: number }[]
  rows.forEach((row, i) => {
    const r = document.createElement('div')
    r.style.cssText = `display:flex;align-items:baseline;gap:8px;margin-bottom:${i === rows.length - 1 ? 0 : 22}px`
    const t = document.createElement('span')
    t.textContent = row.title
    t.style.cssText = 'font-size:16px;color:#433527;font-weight:600'
    const dots = document.createElement('span')
    dots.style.cssText = `flex:1;border-bottom:2px dotted ${HAIRLINE};transform:translateY(-4px)`
    const n = document.createElement('span')
    n.textContent = isFa ? digits(row.page) : String(row.page)
    n.style.cssText = 'font-size:14px;color:#9b8265;font-weight:700'
    r.append(t, dots, n)
    content.appendChild(r)
  })
  page.el!.appendChild(content)
}

function renderCover(page: BuiltPage, book: PrintBook, dateLabel: string): void {
  const root = document.createElement('div')
  // پس‌زمینه‌ی امن: اگر عکس جلد بارگذاری نشود، جلد خالی نمی‌ماند
  root.style.cssText = 'position:absolute;inset:0;background:linear-gradient(158deg,#ffe3ef 0%,#efe3ff 48%,#fff4e4 100%)'

  const makeTitle = (color: string, size: number): HTMLElement => {
    const h = document.createElement('h1')
    h.textContent = book.title
    h.style.cssText = `margin:0;font-size:${size}px;font-weight:800;line-height:1.45;color:${color};text-shadow:0 2px 20px rgba(0,0,0,.28)`
    return h
  }
  const makeSub = (color: string): HTMLElement => {
    const p = document.createElement('p')
    p.textContent = book.subtitle
    p.style.cssText = `margin:0;font-size:18px;line-height:1.8;color:${color};opacity:.92`
    return p
  }
  const makeLine = (bg: string): HTMLElement => {
    const d = document.createElement('div')
    d.style.cssText = `width:126px;height:2px;background:${bg};border-radius:2px`
    return d
  }
  const makeFoot = (color: string): HTMLElement => {
    const p = document.createElement('p')
    p.textContent = `${dateLabel}  •  LoveOS`
    p.style.cssText = `margin:8px 0 0;font-size:13.5px;color:${color}`
    return p
  }

  if (book.cover) {
    const img = document.createElement('img')
    img.src = book.cover
    img.alt = ''
    img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover'
    const overlay = document.createElement('div')
    overlay.style.cssText = 'position:absolute;inset:0;background:linear-gradient(180deg,rgba(45,20,40,.16) 0%,rgba(45,20,40,.34) 55%,rgba(45,20,40,.66) 100%)'
    const center = document.createElement('div')
    center.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:70px;text-align:center'
    const heart = document.createElement('div')
    heart.textContent = '❤'
    heart.style.cssText = 'font-size:26px;color:#ffd3e4'
    center.append(heart, makeTitle('#ffffff', 44), makeSub('#ffe9f2'), makeLine('rgba(255,255,255,.65)'), makeFoot('#ffe9f2'))
    root.append(img, overlay, center)
  } else {
    const deco = document.createElement('div')
    deco.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:300px;opacity:.09;color:#d96a9e'
    deco.textContent = '❤'
    const center = document.createElement('div')
    center.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:80px;text-align:center'
    const heart = document.createElement('div')
    heart.textContent = '❤'
    heart.style.cssText = 'font-size:30px;color:#d96a9e'
    center.append(heart, makeTitle('#5b3a52', 46), makeSub('#7d5a72'), makeLine('rgba(217,106,158,.6)'), makeFoot('#8a6a82'))
    root.append(deco, center)
  }
  page.el!.appendChild(root)
}

function buildPageElement(p: BuiltPage, book: PrintBook, isFa: boolean, dateLabel: string): HTMLElement {
  const el = document.createElement('div')
  el.style.cssText = `position:relative;width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;background:${PAPER};font-family:inherit;direction:rtl`
  p.el = el
  if (p.kind === 'cover') {
    renderCover(p, book, dateLabel)
  } else if (p.kind === 'toc') {
    renderToc(p, book, isFa)
  } else {
    renderHeader(p, book)
    const content = document.createElement('div')
    content.style.cssText = `position:absolute;top:${CONTENT_TOP}px;left:${MARGIN_X}px;right:${MARGIN_X}px;height:${CONTENT_H}px`
    p.blocks.forEach((b) => renderBlock(content, b, isFa))
    el.appendChild(content)
    renderFooter(p, isFa)
  }
  return el
}

/* --------------------------------------------------------------- خروجی ---- */
/**
 * ساخت و دانلود PDF کامل کتاب.
 * onProgress(cur, total) بعد از رندر هر صفحه صدا می‌شود.
 */
export async function exportBookPdf(
  book: PrintBook,
  onProgress?: (cur: number, total: number) => void,
): Promise<void> {
  const isFa = document.documentElement.dir === 'rtl'
  const dateLabel = formatDate(new Date())

  // ۱) ساخت صفحات (اندازه‌گیری و جریان محتوا)
  const pages = await buildPages(book)

  // ۲) ظرف پنهان برای رندر
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;top:0;left:-12000px;z-index:-1;pointer-events:none'
  document.body.appendChild(host)

  try {
    // ۳) رندر DOM هر صفحه
    pages.forEach((p) => {
      host.appendChild(buildPageElement(p, book, isFa, dateLabel))
    })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    try {
      await (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready
    } catch {
      /* بعضی محیط‌ها fonts ندارند */
    }

    // ۴) عکس‌برداری از هر صفحه و جمع‌آوری در PDF
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })

    for (let i = 0; i < pages.length; i += 1) {
      const el = host.children[i] as HTMLElement
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: PAPER,
        logging: false,
        imageTimeout: 20000,
      })
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95)
      if (i > 0) pdf.addPage()
      pdf.addImage(dataUrl, 'JPEG', 0, 0, 210, 297)
      onProgress?.(i + 1, pages.length)
      canvas.width = 0
      canvas.height = 0
    }

    const safeName = (book.title || 'book').replace(/[\\/:*?"<>|]/g, '_').trim() || 'book'
    pdf.save(`${safeName}.pdf`)
  } finally {
    host.remove()
    if (measurer) measurer.innerHTML = ''
  }
}
