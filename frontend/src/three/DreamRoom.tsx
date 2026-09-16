/**
 * DreamRoom.tsx — ماکتِ سه‌بعدیِ «خونه‌ی رویایی» (کهکشان: WebGL، پایین‌تر: CSS)
 *
 * همان الگویِ ``StarmapSky`` و ``CinemaHall``: پوسته‌ی React در یک ماژولِ
 * جدا و ``lazy``، تا ``three`` واردِ چانکِ خودِ اپ نشود و کاربرِ مهتاب هرگز
 * دانلودش نکند.
 *
 * --------------------------------------------------------------------------
 * دو نسخه از یک ماکت
 * --------------------------------------------------------------------------
 * نسخه‌ی WebGL یک ماکتِ واقعی است: حجم‌های شیشه‌ای، لبه‌های روشن، طبقه‌ی
 * بالا واقعاً بالایِ همکف. نسخه‌ی CSS همان نقشه‌ی درصدی را با
 * ``rotateX`` می‌خواباند و به هر اتاق بر اساسِ طبقه‌اش ``translateZ``
 * می‌دهد — یعنی ماکتِ «پلکانی». هر دو از **همان داده‌ی** اتاق می‌خوانند،
 * پس هیچ‌وقت دو حقیقتِ متفاوت روی صفحه نیست.
 *
 * ⚠️ چرا در نسخه‌ی CSS اسمِ اتاق‌ها **داخلِ** نقشه نیست:
 *   نقشه ۵۴ درجه خوابیده و متنِ فارسی زیرِ این زاویه بد خوانده می‌شود.
 *   قانونِ سختِ پروژه «متن هرگز کج نمی‌شود» است، پس اسم به یک
 *   برچسبِ **تخت** زیرِ ماکت منتقل شده. در نسخه‌ی WebGL هم برچسب یک
 *   عنصرِ DOMِ تخت است نه بافتِ سه‌بعدی.
 */
import { useRef, useState } from 'react'

import type { RoomBox, RoomSceneHandle } from './scenes/room'
import { createRoomScene } from './scenes/room'
import { useThreeScene } from './useThreeScene'

/** ترازِ عمودیِ هر طبقه برای نسخه‌ی CSS (همان منطقِ floorSpec در صحنه) */
function levelOf(floor: string): number {
  if (floor === 'first') return 1
  return 0
}
function heightOf(floor: string): number {
  if (floor === 'yard') return 0.28
  return 1
}

export interface DreamRoomProps {
  rooms: RoomBox[]
  /** اگر صحنه‌ی WebGL ساخته نشد، والد می‌تواند بداند (برای پیام/آمار) */
  onFallback?: () => void
  className?: string
}

export default function DreamRoom({ rooms, onFallback, className = '' }: DreamRoomProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const handleRef = useRef<RoomSceneHandle | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [picked, setPicked] = useState<RoomBox | null>(null)

  const roomsRef = useRef(rooms)
  roomsRef.current = rooms
  const fallbackRef = useRef(onFallback)
  fallbackRef.current = onFallback

  useThreeScene(
    canvasRef,
    {
      factory: (input) => {
        const api = createRoomScene(input, () => roomsRef.current)
        handleRef.current = api
        return api
      },
      onUnavailable: (reason) => {
        void reason
        setUnavailable(true)
        fallbackRef.current?.()
      },
      maxPixelRatio: 2,
    },
    // صحنه یک بار ساخته می‌شود؛ تغییرِ اتاق‌ها از راهِ ref می‌رسد و خودِ
    // صحنه با مقایسه‌ی «امضا» ماکت را بازسازی می‌کند.
    [],
  )

  /** ضربه = انتخابِ اتاق. درگ = چرخش. تفکیکشان با آستانه‌ی جابه‌جایی است. */
  const downRef = useRef({ x: 0, y: 0 })
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    downRef.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const dx = Math.abs(e.clientX - downRef.current.x)
    const dy = Math.abs(e.clientY - downRef.current.y)
    // آستانه‌ی ۸ پیکسل: بزرگ‌تر از لرزشِ طبیعیِ انگشت، کوچک‌تر از یک درگِ
    // واقعیِ چرخش.
    if (dx > 8 || dy > 8) return
    const room = handleRef.current?.pick(e.clientX, e.clientY) ?? null
    setPicked(room)
  }

  const shown = picked ?? null

  return (
    <div className={className}>
      {unavailable ? (
        <HouseCSS rooms={rooms} />
      ) : (
        <div className="os-house-clip" style={{ height: 200 }}>
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            style={{ display: 'block', width: '100%', height: '100%' }}
            aria-hidden
          />
          {/* برچسبِ اتاقِ انتخاب‌شده — یک عنصرِ DOMِ **تخت**، نه بافتِ
              سه‌بعدی. متنِ فارسی روی بافتِ WebGL هم فونتِ درست نداشت هم
              کج دیده می‌شد. */}
          {shown && (
            <div className="os-house-tag" role="status">
              <span className="os-house-swatch" style={{ background: shown.color }} aria-hidden />
              <span className="truncate">{shown.name}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * ماکتِ CSS — همان داده، بدونِ WebGL.
 *
 * ⚠️ سه ظرف و نه یکی: بُرش (``overflow``) باید از پرسپکتیو جدا باشد، چون
 *    ``overflow`` غیرِ ``visible`` روی جدِ یک فضایِ ``preserve-3d`` در
 *    سافاری عمق را تخت می‌کند (تله‌ی R-C). اینجا ``.os-house-tilt``
 *    preserve-3d دارد، پس پرسپکتیو باید روی ظرفی باشد که **برش ندارد**.
 */
export function HouseCSS({ rooms }: { rooms: RoomBox[] }) {
  return (
    <div className="os-house-clip">
      <div className="os-house-stage">
        <div className="os-house-tilt" aria-hidden>
          {rooms.map((r) => (
            <span
              key={r.id}
              className="os-house-room"
              style={{
                left: `${r.x}%`,
                top: `${r.y}%`,
                width: `${r.w}%`,
                height: `${r.h}%`,
                background: r.color,
                ['--lvl' as string]: levelOf(r.floor),
                ['--hh' as string]: heightOf(r.floor),
              }}
            />
          ))}
        </div>
      </div>
      <div className="os-house-caption">
        {rooms.length > 0 ? (
          <span className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
            {rooms.slice(0, 6).map((r) => (
              <span key={r.id} className="inline-flex items-center gap-1 text-[11px]">
                <span className="os-house-swatch" style={{ background: r.color }} aria-hidden />
                {r.name}
              </span>
            ))}
          </span>
        ) : null}
      </div>
    </div>
  )
}
