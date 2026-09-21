/**
 * format.ts — تاریخ جلالی، ارقام فارسی، فاصله و زمان
 *
 * قانون طلایی LoveOS: در حالت فارسی همه‌ی تاریخ‌ها شمسی و همه‌ی اعداد فارسی‌اند.
 * این ماژول منبع یگانه‌ی همین قواعد است؛ هیچ اپی نباید خودش تاریخ/عدد بسازد.
 */
import * as jalaali from 'jalaali-js'
import i18n from './i18n'

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]
const WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']
const WEEKDAYS_FA_SHORT = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش']
const WEEKDAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const isFa = () => i18n.language === 'fa'

/** تبدیل ارقام لاتین به فارسی (فقط در حالت fa) */
export function digits(value: string | number): string {
  const s = String(value)
  if (!isFa()) return s
  return s.replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

/** «YYYY-MM-DD» به‌عنوان ساعت ۱۲ ظهر محلی پارس می‌شود تا در هر منطقه‌ی زمانی روز درست بماند */
function parseDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null
  const d = typeof input === 'string' ? (input.length === 10 ? new Date(`${input}T12:00:00`) : new Date(input)) : input
  return Number.isNaN(d.getTime()) ? null : d
}

/** تاریخ کامل: در fa جلالی، در en میلادی */
export function formatDate(input: string | Date | null | undefined): string {
  const d = parseDate(input)
  if (!d) return ''
  if (!isFa()) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const { jy, jm, jd } = jalaali.toJalaali(d)
  return digits(`${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`)
}

export function formatDateShort(input: string | Date | null | undefined): string {
  const d = parseDate(input)
  if (!d) return ''
  if (!isFa()) return d.toLocaleDateString('en-GB')
  const { jy, jm, jd } = jalaali.toJalaali(d)
  return digits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`)
}

export function weekdayName(d: Date): string {
  if (!isFa()) return d.toLocaleDateString('en-GB', { weekday: 'long' })
  return WEEKDAYS_FA[d.getDay()]
}

/** نام روز هفته از عدد (۰=یکشنبه) — بدون وابستگی به Locale مرورگر */
export function weekdayNameByIndex(i: number): string {
  return isFa() ? WEEKDAYS_FA[i] : WEEKDAYS_EN[i]
}

export function formatTime(d: Date = new Date()): string {
  const s = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return digits(s)
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return digits(`${m}:${String(s).padStart(2, '0')}`)
}

/* ------------------------------------------------------------- جلالی ---- */

/** امروز به‌صورت شمسی */
export function jalaliToday(): { jy: number; jm: number; jd: number } {
  return jalaali.toJalaali(new Date())
}

/** تعداد روزهای ماه شمسی */
export function jalaliMonthLength(jy: number, jm: number): number {
  try {
    return jalaali.jalaaliMonthLength(jy, jm)
  } catch {
    return jm <= 6 ? 31 : jm <= 11 ? 30 : 29
  }
}

/** روز هفته‌ی یک تاریخ شمسی (۰=یکشنبه) — از طریق تبدیل به میلادی */
export function jalaliWeekday(jy: number, jm: number, jd: number): number {
  try {
    const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd)
    return new Date(gy, gm - 1, gd).getDay()
  } catch {
    return 0
  }
}

/** تاریخ شمسی → تاریخ میلادی (ISO بدون ساعت) */
export function jalaliToIso(jy: number, jm: number, jd: number): string {
  try {
    const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd)
    return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`
  } catch {
    return ''
  }
}

export interface JalaliCell {
  jd: number
  inMonth: boolean
  /** تاریخ میلادیِ معادل (برای مقایسه با داده‌های سرور) */
  date: Date
  isToday: boolean
}

/**
 * شبکه‌ی ۶×۷ یک ماه شمسی — مثل تقویم ایرانی از جمعه شروع می‌شود.
 * اولین سلول‌ها روزهای آخر ماه قبل و آخرین‌ها روزهای اول ماه بعدند.
 */
export function jalaliMonthGrid(jy: number, jm: number, today = new Date()): JalaliCell[] {
  const len = jalaliMonthLength(jy, jm)
  const firstWeekday = jalaliWeekday(jy, jm, 1) // ۰=یکشنبه
  // در تقویم ایرانی هفته از جمعه (۶) شروع می‌شود؛ تعداد روزهای قبل از اول ماه:
  const lead = (firstWeekday - 6 + 7) % 7
  const cells: JalaliCell[] = []
  const todayStr = today.toDateString()
  for (let i = 0; i < 42; i += 1) {
    const offset = i - lead
    const jd = offset + 1
    let date: Date
    if (offset >= 0 && offset < len) {
      date = jalaliToDate(jy, jm, jd)
      cells.push({ jd, inMonth: true, date, isToday: date.toDateString() === todayStr })
    } else if (offset < 0) {
      const prevJm = jm === 1 ? 12 : jm - 1
      const prevJy = jm === 1 ? jy - 1 : jy
      const prevLen = jalaliMonthLength(prevJy, prevJm)
      date = jalaliToDate(prevJy, prevJm, prevLen + offset + 1)
      cells.push({ jd: prevLen + offset + 1, inMonth: false, date, isToday: false })
    } else {
      const nextJm = jm === 12 ? 1 : jm + 1
      const nextJy = jm === 12 ? jy + 1 : jy
      date = jalaliToDate(nextJy, nextJm, offset - len + 1)
      cells.push({ jd: offset - len + 1, inMonth: false, date, isToday: false })
    }
  }
  return cells
}

export function jalaliToDate(jy: number, jm: number, jd: number): Date {
  try {
    const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd)
    return new Date(gy, gm - 1, gd)
  } catch {
    return today0()
  }
}

export function today0(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

/** برچسب کوتاه ماه از کلید میلادی «YYYY-MM» — در fa: «خرداد ۱۴۰۴» */
export function monthKeyLabel(key: string): string {
  const [y, m] = key.split('-').map((x) => Number(x))
  if (!y || !m) return key
  const first = new Date(y, m - 1, 1)
  if (!isFa()) return first.toLocaleDateString('en-GB', { month: 'short' })
  const { jy, jm } = jalaali.toJalaali(first)
  return `${JALALI_MONTHS[jm - 1]} ${digits(jy % 100)}`
}

/** برچسب سال شمسی از یک تاریخ */
export function jalaliYearLabel(input: string | Date): string {
  const d = parseDate(input)
  if (!d) return ''
  const { jy } = jalaali.toJalaali(d)
  return digits(jy)
}

export { JALALI_MONTHS, WEEKDAYS_FA_SHORT }
