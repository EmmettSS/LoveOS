/**
 * useFitScale.ts — «هیچ‌وقت سرریز نکن»
 *
 * صفحه‌های تمام‌صفحه‌ی سیستم (بوت و قفل) باید همیشه دقیقاً اندازه‌ی صفحه‌ی
 * دستگاه باشند: نه اسکرولی، نه لبه‌ی خالی. اما در گوشی‌های کوچک، پنجره‌ی
 * کم‌ارتفاع یا وقتی کاربر «اندازه‌ی فونت» را بزرگ کرده، محتوا از صفحه بلندتر
 * می‌شود. این هوک ارتفاع طبیعی محتوا را می‌سنجد و اگر بیشتر از کادر بود،
 * کوچک‌ترین مقیاسِ لازم را برمی‌گرداند تا همه‌چیز داخل کادر جا شود.
 *
 * نکته‌ی فنی: `offsetHeight` هیچ‌وقت تحت تأثیر `transform` نیست، پس اندازه‌گیری
 * در حالت مقیاس‌خورده هم همان ارتفاع واقعی را می‌دهد و حلقه‌ی بازخوردی
 * (measure → scale → measure → …) ساخته نمی‌شود.
 */
import { useEffect, useRef, useState } from 'react'

/** کفِ مقیاس: از این کوچک‌تر یعنی صفحه واقعاً برای این محتوا جا ندارد. */
const MIN_SCALE = 0.35

export function useFitScale<T extends HTMLElement>(gap = 8) {
  const ref = useRef<T | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return

    let frame = 0
    // در محیط‌های آزمایشی (jsdom) ممکن است rAF نباشد؛ با تایمر جایگزین می‌شود.
    const nextFrame = (fn: () => void) =>
      typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : window.setTimeout(fn, 16)
    const cancelFrame = (id: number) =>
      typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame(id) : window.clearTimeout(id)

    const measure = () => {
      frame = 0
      const cs = getComputedStyle(box)
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)
      const avail = box.clientHeight - pad
      const needed = el.offsetHeight
      if (avail <= 0 || needed <= 0) return
      const next = Math.min(1, (avail - gap) / needed)
      setScale(next < 0.995 ? Math.max(MIN_SCALE, Math.floor(next * 1000) / 1000) : 1)
    }
    const schedule = () => {
      if (!frame) frame = nextFrame(measure)
    }

    schedule()
    window.addEventListener('resize', schedule)
    window.addEventListener('orientationchange', schedule)
    // هم کادر (چرخش گوشی/resize) و هم خودِ محتوا (مثلاً پیام خطای رمز یا کارت
    // «کمک از بابا» که بعداً اضافه می‌شود) رصد می‌شوند.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    ro?.observe(box)
    ro?.observe(el)
    // فونت وزیرمتن کمی دیرتر می‌رسد و ارتفاع متن را جابه‌جا می‌کند
    const late = window.setTimeout(schedule, 700)

    return () => {
      if (frame) cancelFrame(frame)
      window.clearTimeout(late)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('orientationchange', schedule)
      ro?.disconnect()
    }
  }, [gap])

  return { ref, scale }
}
