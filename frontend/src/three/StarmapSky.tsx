/**
 * StarmapSky.tsx — آسمانِ سه‌بعدیِ «ستاره‌ها» (فقط لایه‌ی کهکشان)
 *
 * ⚠️ چرا این یک فایلِ **جدا** است و با ``lazy()`` بارگذاری می‌شود
 * --------------------------------------------------------------------------
 * اگر ``three`` را مستقیم بالای خودِ ``Starmap.tsx`` import می‌کردم،
 * ۱۳۵KB (gzip) واردِ چانکِ Starmap می‌شد — و چون Starmap خودش lazy است،
 * آن ۱۳۵KB **هر بار** که اپ باز می‌شد دانلود می‌شد، حتی برای کاربری که
 * لایه‌اش مهتاب است و اصلاً WebGL نمی‌بیند.
 *
 * با جداکردنِ صحنه به این ماژول و ``lazy()`` کردنش، three.js در یک چانکِ
 * مستقل می‌نشیند که **فقط** وقتی لایه واقعاً کهکشان باشد درخواست می‌شود.
 * باندلِ مهتاب و بلور یک بایت هم بزرگ‌تر نمی‌شود.
 *
 * --------------------------------------------------------------------------
 * ⚠️ چرا شکل‌ها در ``ref`` نگه داشته می‌شوند و نه در ``deps``
 * --------------------------------------------------------------------------
 * حلقه‌ی رندر باید همیشه تازه‌ترین وضعیتِ «روشن/خاموش» را ببیند، ولی اگر
 * صحنه را با هر تغییرِ state از نو می‌ساختیم، هر ضربه روی یک ستاره یعنی
 * ساختِ دوباره‌ی ۱۵۰۰ نقطه و چند geometry — یعنی لگِ آشکار. پس صحنه یک بار
 * ساخته می‌شود و هر فریم شکل‌ها را از یک ``ref`` می‌خواند (``getShapes``).
 */
import { useEffect, useRef, useState } from 'react'

import type { StarmapShape, StarmapSceneHandle } from './scenes/starmap'
import { createStarmapScene } from './scenes/starmap'
import { useThreeScene } from './useThreeScene'

export interface StarmapSkyProps {
  shapes: StarmapShape[]
  /** شناسه‌ی صورتِ فلکیِ انتخاب‌شده تا دوربین به سمتش پرواز کند */
  focusId: number | null
  /** اگر صحنه به هر دلیلی ساخته نشد، والد باید fallbackِ بلور را نشان دهد */
  onFallback?: () => void
  className?: string
}

export default function StarmapSky({ shapes, focusId, onFallback, className = '' }: StarmapSkyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<StarmapSceneHandle | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  // refهای تازه تا حلقه‌ی رندر بدونِ ساختِ دوباره‌ی صحنه به‌روز بماند
  const shapesRef = useRef(shapes)
  shapesRef.current = shapes
  const focusRef = useRef(focusId)
  focusRef.current = focusId
  const fallbackRef = useRef(onFallback)
  fallbackRef.current = onFallback

  useThreeScene(
    canvasRef,
    {
      factory: (input) => {
        const api = createStarmapScene(input, () => shapesRef.current.map((s) => ({ ...s, lit: s.lit })))
        handleRef.current = api
        return api
      },
      onUnavailable: (reason) => {
        // دلایلِ «لایه» و «سقف» انتظار‌پذیرند؛ ولی هر چهار حالت باید به
        // fallback برگردند وگرنه کاربر یک canvas خالیِ سیاه می‌بیند.
        void reason
        setUnavailable(true)
        fallbackRef.current?.()
      },
      maxPixelRatio: 2,
    },
    // deps عمداً خالی است: صحنه باید یک بار ساخته شود و تا پایانِ عمرِ
    // کامپوننت زنده بماند. هر مقدارِ تازه از راهِ refها می‌رسد.
    [],
  )

  // وقتی «صورتِ فلکیِ انتخاب‌شده» عوض می‌شود، فقط به صحنه می‌گوییم کجا برود
  useEffect(() => {
    handleRef.current?.focus(focusId)
  }, [focusId, shapes.length])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      // اگر صحنه ساخته نشد، canvas خالی نماند: والد fallback را نشان می‌دهد
      // و این پنهان می‌شود.
      style={{ display: unavailable ? 'none' : 'block', width: '100%', height: '100%' }}
      aria-hidden
    />
  )
}
