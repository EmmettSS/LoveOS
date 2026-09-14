/**
 * format.ts — تاریخ جلالی، ارقام فارسی، فاصله و زمان
 */
import * as jalaali from 'jalaali-js'
import i18n from './i18n'

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']
const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]
const WEEKDAYS_FA = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه']

export const isFa = () => i18n.language === 'fa'

/** تبدیل ارقام لاتین به فارسی (فقط در حالت fa) */
export function digits(value: string | number): string {
  const s = String(value)
  if (!isFa()) return s
  return s.replace(/\d/g, (d) => FA_DIGITS[Number(d)])
}

/** تاریخ کامل: در fa جلالی، در en میلادی */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  if (!isFa()) {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  const { jy, jm, jd } = jalaali.toJalaali(d)
  return digits(`${jd} ${JALALI_MONTHS[jm - 1]} ${jy}`)
}

export function formatDateShort(input: string | Date | null | undefined): string {
  if (!input) return ''
  const d = typeof input === 'string' ? new Date(input) : input
  if (!isFa()) return d.toLocaleDateString('en-GB')
  const { jy, jm, jd } = jalaali.toJalaali(d)
  return digits(`${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`)
}

export function weekdayName(d: Date): string {
  if (!isFa()) return d.toLocaleDateString('en-GB', { weekday: 'long' })
  return WEEKDAYS_FA[d.getDay()]
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

export { JALALI_MONTHS }
