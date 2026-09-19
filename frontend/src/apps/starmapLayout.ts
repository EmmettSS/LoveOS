/**
 * starmapLayout.ts — ریاضیِ چیدمان آسمان ستاره‌ها (بدون React، قابل تست)
 *
 * چیدمان دو ردیفی: حروف اسم در ردیف اول، نمادها (❤ ♾ …) در ردیف دوم و کمی
 * بزرگ‌تر (نقطه‌ی تأکید). همه‌چیز از روی ابعاد واقعی کادر حساب می‌شود تا از
 * موبایلِ افقی تا دسکتاپ، بزرگ‌ترین اندازه‌ای که جا می‌شود انتخاب شود؛ بدون
 * اعوجاج شکل‌ها و بدون هم‌پوشانی با متن راهنما (بالا) و چیپ‌ها/نوار پیام (پایین).
 *
 * چرا جدا از Starmap.tsx؟ تا هم Fast Refresh آن فایل سالم بماند و هم بتوان
 * ریاضی چیدمان را بدون مرورگر آزمود.
 */

/** نسبت بزرگ‌نمایی ردیف نمادها نسبت به حروف */
export const SYMBOL_SCALE = 1.3
/** ارتفاع نوار برچسب زیر هر صورت فلکی (کسری از ضلع مربع) */
const LABEL_BAND = 0.26
/** فاصله‌ی دو ردیف (کسری از ضلع مربع حروف) */
const ROW_GAP = 0.12
/** فاصله‌ی افقی بین حروف: هر مربع حداکثر این کسر از چینه‌اش را می‌گیرد */
const CELL_OF_PITCH = 0.88
const MIN_CELL = 28
const MAX_CELL = 260
const SIDE_MARGIN = 8

/** آستانه‌ی «موبایل» — همان آستانه‌ی مدیر پنجره (Window.tsx) تا رفتار یکدست باشد */
export const MOBILE_MAX_WIDTH = 900

/** نماد است (نه حرف و نه رقم) → به ردیف دوم می‌رود */
export const isSymbol = (letter: string): boolean => !/[\p{L}\p{N}]/u.test(letter || '')

/**
 * تقسیم صورت‌های فلکی به ردیف‌ها: [حروف، نمادها]. اگر یکی از دو دسته خالی
 * باشد فقط یک ردیف برمی‌گردد (آسمانی که فقط حرف دارد یا فقط نماد).
 */
export function splitRows<T extends { letter: string }>(items: T[]): T[][] {
  const letters = items.filter((i) => !isSymbol(i.letter))
  const symbols = items.filter((i) => isSymbol(i.letter))
  const rows = [letters, symbols].filter((r) => r.length > 0)
  return rows.length > 0 ? rows : [items]
}

export interface SkyLayoutInput {
  /** ابعاد کادر آسمان (px) */
  w: number
  h: number
  /** تعداد آیتم‌های هر ردیف، مثلاً [6, 2] */
  rows: number[]
  /** ردیفِ نمادها کدام است (بزرگ‌تر رسم می‌شود)؛ -1 یعنی هیچ‌کدام */
  symbolRow?: number
  /** چیدمان راست‌به‌چپ (اولین آیتم سمت راست) */
  rtl?: boolean
  /** فضای رزرو بالا (متن راهنما) و پایین (چیپ‌ها / نوار پیام) */
  padTop?: number
  padBottom?: number
}

export interface SkySlot {
  /** مرکز مربع صورت فلکی */
  cx: number
  cy: number
  /** ضلع مربع */
  cell: number
  /** فاصله‌ی مرکز تا مرکز آیتم‌های همین ردیف */
  pitch: number
  /** شعاع ستاره‌ها */
  dot: number
  /** خط پایه‌ی برچسب و اندازه‌ی قلمش */
  labelY: number
  fontSize: number
  /** شعاع ناحیه‌ی لمسی نامرئی (با همسایه هم‌پوشانی ندارد) */
  tapR: number
  row: number
  col: number
}

export interface SkyLayout {
  /** slots[row][col] — به همان ترتیب ورودی (نه ترتیب بصری) */
  slots: SkySlot[][]
  /** ضلع مربع حروف (ردیف اول) — مبنای بقیه‌ی اندازه‌ها */
  cell: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** فضای پیش‌فرض بالا/پایین، متناسب با ارتفاع (روی صفحه‌های کوتاه کمتر) */
export function defaultPads(h: number): { padTop: number; padBottom: number } {
  return { padTop: clamp(h * 0.1, 36, 60), padBottom: clamp(h * 0.12, 40, 72) }
}

/**
 * چیدمان کامل: بزرگ‌ترین ضلعی که هم در پهنا (بدون هم‌پوشانی حروف) و هم در
 * ارتفاع (هر دو ردیف + برچسب‌ها + فاصله) جا شود؛ کل بلوک وسط‌چین می‌شود.
 */
export function layoutSky(input: SkyLayoutInput): SkyLayout {
  const { w, h, rows, rtl = false } = input
  const symbolRow = input.symbolRow ?? -1
  const pads = defaultPads(h)
  const padTop = input.padTop ?? pads.padTop
  const padBottom = input.padBottom ?? pads.padBottom
  if (!(w > 0) || !(h > 0) || rows.length === 0) return { slots: rows.map(() => []), cell: 0 }

  const scales = rows.map((_, ri) => (ri === symbolRow && rows.length > 1 ? SYMBOL_SCALE : 1))
  const innerW = Math.max(1, w - 2 * SIDE_MARGIN)
  const availH = Math.max(1, h - padTop - padBottom)

  // محدودیت پهنا: در هر ردیف، مربعِ (مقیاس‌خورده) از سهم افقی‌اش بزرگ‌تر نشود
  const widthLimit = Math.min(...rows.map((n, ri) => ((innerW / Math.max(1, n)) * CELL_OF_PITCH) / scales[ri]))
  // محدودیت ارتفاع: مجموع ردیف‌ها (مربع + نوار برچسب) و فاصله‌ها
  const sumScale = scales.reduce((a, b) => a + b, 0)
  const heightFactor = (1 + LABEL_BAND) * sumScale + ROW_GAP * (rows.length - 1)
  const heightLimit = availH / heightFactor

  const cell = clamp(Math.min(widthLimit, heightLimit), MIN_CELL, MAX_CELL)
  const gap = ROW_GAP * cell
  const block = scales.reduce((acc, s) => acc + s * cell * (1 + LABEL_BAND), 0) + gap * (rows.length - 1)
  let y = padTop + (availH - block) / 2

  const slots = rows.map((n, ri) => {
    const rowCell = cell * scales[ri]
    const cy = y + rowCell / 2
    y += rowCell * (1 + LABEL_BAND) + gap
    // حروف بیش از حد از هم دور نشوند: چینه حداکثر ۱.۳ برابر مربع (نمادها ۱.۵)
    const pitch = Math.min(innerW / Math.max(1, n), rowCell * (ri === symbolRow ? 1.5 : 1.3))
    const x0 = w / 2 - (pitch * n) / 2
    const dot = clamp(rowCell * 0.036, 1.8, 4.8)
    return Array.from({ length: n }, (_, col) => {
      const visual = rtl ? n - 1 - col : col
      return {
        cx: x0 + pitch * (visual + 0.5),
        cy,
        cell: rowCell,
        pitch,
        dot,
        // کمی پایین‌تر از ستاره‌ی پایینی تا هاله‌ی حرفِ روشن رویش نیفتد
        labelY: cy + rowCell / 2 + Math.max(18, rowCell * 0.17),
        fontSize: clamp(rowCell * 0.15, 11, 22),
        tapR: Math.min(rowCell / 2 + 14, pitch / 2),
        row: ri,
        col,
      }
    })
  })

  return { slots, cell }
}

/**
 * جهت نمایش در موبایل: اگر صفحه عمودی است، آسمان ۹۰ درجه می‌چرخد تا کاربر
 * گوشی را افقی بگیرد؛ اگر مرورگر خودش افقی شده (چرخش خودکار روشن) دیگر
 * نمی‌چرخانیم، وگرنه دو بار می‌چرخد و وارونه می‌شود.
 */
export function resolveSkyMode(viewportW: number, viewportH: number): { mobile: boolean; rotated: boolean } {
  const mobile = viewportW < MOBILE_MAX_WIDTH
  return { mobile, rotated: mobile && viewportH > viewportW }
}
