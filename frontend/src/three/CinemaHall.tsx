/**
 * CinemaHall.tsx — سالنِ سینمایِ سه‌بعدی (فقط لایه‌ی کهکشان)
 *
 * دقیقاً همان الگویِ ``StarmapSky.tsx`` و به همان دلیل‌ها:
 *
 * • این فایل **جدا** است و با ``lazy()`` بارگذاری می‌شود تا ``three`` واردِ
 *   چانکِ خودِ اپِ سینما نشود. چون ``manualChunks`` در ``vite.config.ts``
 *   فقط ``node_modules/three`` را در چانکِ مشترکِ ``loveos-3d`` می‌گذارد،
 *   این ماژول یک چانکِ lazyِ چند‌کیلوبایتیِ خودش را می‌گیرد و three را از
 *   همان چانکِ مشترک می‌خواند — یعنی سینما و ستاره‌ها و اتاقِ رویایی هر سه
 *   **یک بار** three.js را دانلود می‌کنند.
 *
 * • ``posterUrl`` در ``ref`` نگه داشته می‌شود نه در ``deps``. اگر صحنه با هر
 *   تغییرِ پوستر از نو ساخته می‌شد، هر انتخابِ فیلم یعنی ساختِ دوباره‌ی
 *   کلِ سالن (۴۲ صندلی + مخروطِ نور + ۳۰۰ ذره) — لگِ آشکار. حالا صحنه یک
 *   بار ساخته می‌شود و پوسترِ تازه فقط یک بارگیریِ بافت است.
 *
 * • اگر صحنه به هر دلیلی ساخته نشد (لایه، سقفِ context، نبودِ WebGL، از
 *   دست‌رفتنِ context) ``onFallback`` صدا زده می‌شود و والد **سالنِ
 *   CSS-سه‌بعدی** را نشان می‌دهد. هیچ حالتی نباید به یک canvasِ سیاهِ خالی
 *   ختم شود.
 */
import { useRef, useState } from 'react'

import { createCinemaScene } from './scenes/cinema'
import { useThreeScene } from './useThreeScene'

export interface CinemaHallProps {
  /** آدرسِ پوسترِ فیلمِ جاری؛ ``null`` یعنی پرده فقط گرادیانِ نورانی دارد */
  posterUrl: string | null
  /** اگر صحنه ساخته نشد، والد باید سالنِ CSS را نشان دهد */
  onFallback?: () => void
  className?: string
}

export default function CinemaHall({ posterUrl, onFallback, className = '' }: CinemaHallProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const posterRef = useRef(posterUrl)
  posterRef.current = posterUrl
  const fallbackRef = useRef(onFallback)
  fallbackRef.current = onFallback

  useThreeScene(
    canvasRef,
    {
      factory: (input) => createCinemaScene(input, () => ({ posterUrl: posterRef.current })),
      onUnavailable: (reason) => {
        // «لایه» و «سقفِ context» حالت‌های انتظارپذیرند، ولی هر چهار دلیل
        // باید به fallback برگردند.
        void reason
        setUnavailable(true)
        fallbackRef.current?.()
      },
      maxPixelRatio: 2,
    },
    // deps عمداً خالی: صحنه یک بار ساخته می‌شود و تا پایانِ عمرِ
    // کامپوننت زنده می‌ماند؛ مقدارِ تازه از راهِ ref می‌رسد.
    [],
  )

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: unavailable ? 'none' : 'block', width: '100%', height: '100%' }}
      aria-hidden
    />
  )
}
