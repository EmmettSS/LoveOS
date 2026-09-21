/**
 * DateField — کادر انتخاب تاریخِ LoveOS
 *
 * در حالت فارسی: تقویم کامل شمسی (ماه/سال شمسی، هفته از جمعه)
 * در حالت انگلیسی: همان ورودی بومی مرورگر (میلادی)
 *
 * مقدار همیشه به‌صورت ISO میلادی (YYYY-MM-DD) جابه‌جا می‌شود تا بک‌اند
 * بدون تغییر کار کند؛ فقط «نمایش» برای دخترم شمسی است.
 */
import * as jalaali from 'jalaali-js'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  JALALI_MONTHS,
  WEEKDAYS_FA_SHORT,
  digits,
  isFa,
  jalaliMonthGrid,
  jalaliToIso,
  jalaliToday,
} from './format'

export function DateField({
  value,
  onChange,
  placeholder,
  className = '',
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  className?: string
}) {
  if (!isFa()) {
    return (
      <input
        type="date"
        className={`os-input ${className}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  }
  return <JalaliDateButton value={value} onChange={onChange} placeholder={placeholder} className={className} />
}

function JalaliDateButton({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  className?: string
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)

  // ماه/سال نمایش: از تاریخ انتخاب‌شده، وگرنه امروز
  const sel = value ? new Date(`${value}T12:00:00`) : null
  const [view, setView] = useState(() => (sel && !Number.isNaN(sel.getTime()) ? jalaali.toJalaali(sel) : jalaliToday()))
  const [yearOpen, setYearOpen] = useState(false)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const jSel = sel && !Number.isNaN(sel.getTime()) ? jalaali.toJalaali(sel) : null
  const yearOptions: number[] = []
  for (let y = view.jy + 3; y >= view.jy - 30; y -= 1) yearOptions.push(y)

  const move = (dir: number) => {
    setYearOpen(false)
    setView((v) => {
      let jm = v.jm + dir
      let jy = v.jy
      if (jm < 1) { jm = 12; jy -= 1 }
      if (jm > 12) { jm = 1; jy += 1 }
      return { jy, jm, jd: 1 }
    })
  }

  const label = jSel
    ? `${digits(jSel.jd)} ${JALALI_MONTHS[jSel.jm - 1]} ${digits(jSel.jy)}`
    : (placeholder || 'تاریخ را انتخاب کن')

  const grid = jalaliMonthGrid(view.jy, view.jm)
  const isSel = (jd: number) => jSel !== null && jSel.jy === view.jy && jSel.jm === view.jm && jSel.jd === jd

  return (
    <div ref={box} className={`relative ${className}`} style={{ zIndex: open ? 80 : undefined }}>
      <button
        type="button"
        className="os-input flex items-center justify-between gap-2 text-start"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={jSel ? '' : 'os-muted'}>{label}</span>
        <span className="text-base" style={{ color: 'var(--os-accent)' }}>📅</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="os-card absolute z-[80] mt-1 w-[290px] max-w-[86vw] p-3 shadow-2xl"
            style={{ insetInlineStart: 0, maxHeight: 'min(420px, 70vh)', overflowY: 'auto' }}
          >
            {/* نوار ماه و سال */}
            <div className="mb-2 flex items-center justify-between gap-1">
              <button type="button" className="os-chip !text-[10px]" onClick={() => move(-1)}>
                ← ماه قبل
              </button>
              <div className="flex items-center gap-1">
                <span className="os-title text-sm">{JALALI_MONTHS[view.jm - 1]}</span>
                <button
                  type="button"
                  className="os-title text-sm underline underline-offset-2"
                  style={{ color: 'var(--os-accent)' }}
                  onClick={() => setYearOpen((v) => !v)}
                >
                  {digits(view.jy)}
                </button>
              </div>
              <button type="button" className="os-chip !text-[10px]" onClick={() => move(1)}>
                ماه بعد →
              </button>
            </div>

            {yearOpen && (
              <div className="mb-2 grid max-h-32 grid-cols-4 gap-1 overflow-y-auto">
                {yearOptions.map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`os-chip !px-1 ${view.jy === y ? 'os-chip-active' : ''}`}
                    onClick={() => { setYearOpen(false); setView((v) => ({ ...v, jy: y })) }}
                  >
                    {digits(y)}
                  </button>
                ))}
              </div>
            )}

            {/* هدر روزها — هفته از جمعه */}
            <div className="grid grid-cols-7 gap-1">
              {WEEKDAYS_FA_SHORT.map((d, i) => (
                <span key={i} className="py-1 text-center text-[10px] os-muted">
                  {d}
                </span>
              ))}
              {grid.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={!c.inMonth}
                  onClick={() => {
                    onChange(jalaliToIso(view.jy, view.jm, c.jd))
                    setOpen(false)
                  }}
                  className="flex h-8 items-center justify-center rounded-lg text-xs transition active:scale-90"
                  style={{
                    background: c.isToday ? 'var(--os-accent-soft)' : isSel(c.jd) ? 'var(--os-accent)' : 'transparent',
                    color: !c.inMonth
                      ? 'var(--os-border)'
                      : isSel(c.jd)
                        ? '#fff'
                        : c.isToday
                          ? 'var(--os-accent)'
                          : 'inherit',
                    fontWeight: c.isToday || isSel(c.jd) ? 700 : 400,
                    opacity: c.inMonth ? 1 : 0.45,
                  }}
                >
                  {digits(c.jd)}
                </button>
              ))}
            </div>

            <div className="mt-2 flex justify-between border-t pt-2" style={{ borderColor: 'var(--os-border)' }}>
              <button
                type="button"
                className="os-chip !text-[10px]"
                onClick={() => { setView(jalaliToday()); setYearOpen(false) }}
              >
                {t('os.today')}
              </button>
              <button type="button" className="os-chip !text-[10px]" onClick={() => setOpen(false)}>
                {t('os.cancel')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
