/**
 * miniPdf.ts — نوشتن فایل PDF بدون هیچ وابستگیِ بیرونی
 *
 * چرا این‌جا؟ چون خروجیِ کتاب قبلاً به jsPDF + html2canvas بند بود و اگر آن
 * پکیج‌ها نصب نبودند (node_modules قدیمی)، خودِ Vite موقع resolve کردنِ
 * `import { jsPDF } from 'jspdf'` خطا می‌داد و **کل اپ دفتر نویسندگی** از کار
 * می‌افتاد. این ماژول صفر وابستگی است: صفحه‌ها به‌صورت عکس JPEG (که مرورگر
 * خودش با canvas.toBlob می‌سازد) داخل یک PDF استاندارد A4 بسته‌بندی می‌شوند.
 *
 * ساختار خروجی: PDF 1.4 — برای هر صفحه یک آبجکت Page، یک Content stream و
 * یک XObject تصویری با فیلتر DCTDecode (همان بایت‌های JPEG).
 */

/** نقطه‌های A4 در واحد point (۱ point = ۱/۷۲ اینچ) */
export const A4_WIDTH_PT = 595.28
export const A4_HEIGHT_PT = 841.89

export interface PdfImagePage {
  /** بایت‌های JPEG (بدون base64) */
  jpeg: Uint8Array
  /** عرض تصویر به پیکسل — فقط برای metadata لازم است */
  width: number
  /** ارتفاع تصویر به پیکسل */
  height: number
}

/* ------------------------------------------------------------ ابزار بایت -- */
const enc = (s: string): Uint8Array => {
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i += 1) out[i] = s.charCodeAt(i) & 0xff
  return out
}

class ByteWriter {
  private chunks: Uint8Array[] = []
  private _length = 0

  get length(): number {
    return this._length
  }

  write(data: Uint8Array | string): void {
    const buf = typeof data === 'string' ? enc(data) : data
    this.chunks.push(buf)
    this._length += buf.length
  }

  toUint8Array(): Uint8Array {
    const out = new Uint8Array(this._length)
    let at = 0
    for (const c of this.chunks) {
      out.set(c, at)
      at += c.length
    }
    return out
  }
}

/** رشته‌ی PDF: لاتین به‌صورت literal و بقیه (فارسی) به‌صورت UTF-16BE هگز */
function pdfString(value: string): string {
  let ascii = true
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) > 126 || value.charCodeAt(i) < 32) {
      ascii = false
      break
    }
  }
  if (ascii) return `(${value.replace(/([\\()])/g, '\\$1')})`
  let hex = 'FEFF'
  for (let i = 0; i < value.length; i += 1) hex += value.charCodeAt(i).toString(16).padStart(4, '0')
  return `<${hex}>`
}

/** base64 (یا data URL) → بایت */
export function base64ToBytes(input: string): Uint8Array {
  const b64 = input.slice(input.indexOf(',') + 1).replace(/\s+/g, '')
  if (typeof atob === 'function') {
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
    return out
  }
  // محیط Node (فقط برای آزمون‌ها) — بدون تایپِ node
  const nodeBuffer = (globalThis as unknown as { Buffer?: { from(s: string, enc: string): Uint8Array } }).Buffer
  if (!nodeBuffer) throw new Error('پشتیبانی base64 در این محیط وجود ندارد')
  const buf = nodeBuffer.from(b64, 'base64')
  return new Uint8Array(buf)
}

/** Blob (خروجی canvas.toBlob) → بایت */
export async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === 'function') {
    const buf = await blob.arrayBuffer()
    return new Uint8Array(buf)
  }
  // مرورگرهای قدیمی‌تر که arrayBuffer ندارند
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(new Uint8Array(fr.result as ArrayBuffer))
    fr.onerror = () => reject(new Error('خواندن بایت‌های تصویر ناموفق بود'))
    fr.readAsArrayBuffer(blob)
  })
}

/* ------------------------------------------------------------- ساخت PDF -- */
export interface BuildPdfOptions {
  title?: string
  author?: string
  /** اندازه‌ی صفحه؛ پیش‌فرض A4 پرتره */
  width?: number
  height?: number
}

/**
 * چند صفحه‌ی JPEG را به یک فایل PDF تبدیل می‌کند.
 * هر تصویر تمام صفحه را پر می‌کند (کشیده نمی‌شود اگر نسبتش برابر باشد).
 */
export function buildPdf(pages: PdfImagePage[], options: BuildPdfOptions = {}): Uint8Array {
  if (pages.length === 0) throw new Error('هیچ صفحه‌ای برای ساخت PDF نیست')
  const pageW = options.width ?? A4_WIDTH_PT
  const pageH = options.height ?? A4_HEIGHT_PT

  const out = new ByteWriter()
  const offsets: number[] = [] // آفست آبجکت n در offsets[n - 1]

  const beginObject = (num: number) => {
    offsets[num - 1] = out.length
    out.write(`${num} 0 obj\n`)
  }
  const endObject = () => out.write('endobj\n')

  out.write('%PDF-1.4\n')
  // کامنت باینری تا برنامه‌ها بفهمند فایل بایتِ خام دارد
  out.write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))

  const pageCount = pages.length
  const catalogNum = 1
  const pagesNum = 2
  const infoNum = 3
  // شماره‌ی آبجکت‌ها: هر صفحه سه آبجکت دارد (Page، Contents، Image)
  const firstPageObj = 4
  const pageObjNum = (i: number) => firstPageObj + i * 3
  const contentObjNum = (i: number) => pageObjNum(i) + 1
  const imageObjNum = (i: number) => pageObjNum(i) + 2
  const totalObjects = firstPageObj + pageCount * 3 - 1

  beginObject(catalogNum)
  out.write(`<< /Type /Catalog /Pages ${pagesNum} 0 R >>\n`)
  endObject()

  beginObject(pagesNum)
  out.write(
    `<< /Type /Pages /Count ${pageCount} /Kids [${pages.map((_, i) => `${pageObjNum(i)} 0 R`).join(' ')}] >>\n`,
  )
  endObject()

  const now = new Date()
  const pdfDate = `D:${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}Z`
  beginObject(infoNum)
  out.write(
    `<< /Title ${pdfString(options.title || 'LoveOS')} /Author ${pdfString(options.author || 'LoveOS')} /Producer (LoveOS miniPdf) /CreationDate (${pdfDate}) >>\n`,
  )
  endObject()

  for (let i = 0; i < pageCount; i += 1) {
    const page = pages[i]
    const content = `q\n${pageW.toFixed(2)} 0 0 ${pageH.toFixed(2)} 0 0 cm\n/Im${i} Do\nQ\n`
    const contentBytes = enc(content)

    beginObject(pageObjNum(i))
    out.write(
      `<< /Type /Page /Parent ${pagesNum} 0 R /MediaBox [0 0 ${pageW.toFixed(2)} ${pageH.toFixed(2)}] ` +
        `/Resources << /XObject << /Im${i} ${imageObjNum(i)} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
        `/Contents ${contentObjNum(i)} 0 R >>\n`,
    )
    endObject()

    beginObject(contentObjNum(i))
    out.write(`<< /Length ${contentBytes.length} >>\nstream\n`)
    out.write(contentBytes)
    out.write('endstream\n')
    endObject()

    beginObject(imageObjNum(i))
    out.write(
      `<< /Type /XObject /Subtype /Image /Width ${Math.max(1, page.width | 0)} /Height ${Math.max(1, page.height | 0)} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
    )
    out.write(page.jpeg)
    out.write('\nendstream\n')
    endObject()
  }

  // ------------------------------------------------------------------ xref
  const xrefOffset = out.length
  out.write(`xref\n0 ${totalObjects + 1}\n`)
  out.write('0000000000 65535 f \n')
  for (let n = 1; n <= totalObjects; n += 1) {
    const off = offsets[n - 1] ?? 0
    out.write(`${String(off).padStart(10, '0')} 00000 n \n`)
  }
  out.write(`trailer\n<< /Size ${totalObjects + 1} /Root ${catalogNum} 0 R /Info ${infoNum} 0 R >>\n`)
  out.write(`startxref\n${xrefOffset}\n%%EOF\n`)

  return out.toUint8Array()
}

/** دانلود مستقیم در مرورگر */
export function downloadPdf(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // کمی صبر می‌کنیم تا دانلود شروع شود، بعد لینک را آزاد می‌کنیم
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}
