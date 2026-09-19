/**
 * SkyCanvas.tsx — پس‌زمینه‌ی سینمایی آسمان ستاره‌ها (یک canvas سبک)
 *
 * لایه‌ها (از زیر به رو):
 *   ۱) گرادیان پایه‌ی شب
 *   ۲) لایه‌ی دور (یک‌بار رندر می‌شود): راه شیری، سحابی‌های بنفش/صورتی، صدها ستاره‌ی ریز
 *   ۳) ستاره‌های نزدیک: چشمک نامنظم، رنگ‌های سرد/گرم، ستاره‌های درخشان با تلألؤ صلیبی
 *   ۴) لایه‌ی ثابت (یک‌بار رندر): وینیت، مِه افق، هلال ماه
 *   ۵) شهاب‌ها: هر چند ثانیه یکی با دنباله‌ی محوشونده
 *
 * لایه‌های ۲ و ۳ خیلی آرام دور «قطب» آسمان می‌چرخند (تایم‌لپس) و با موس
 * پارالاکس می‌گیرند (لایه‌ی نزدیک بیشتر → حس عمق). حلقه‌ی رندر وقتی تب پنهان
 * است می‌ایستد و با prefers-reduced-motion فقط یک فریم ثابت رسم می‌شود.
 *
 * صورت‌های فلکی (اسم) این‌جا نیستند — آن‌ها روی SVG جدا و تعاملی هستند.
 */
import { useEffect, useRef, type MutableRefObject } from 'react'

export interface Parallax {
  x: number
  y: number
}

interface Props {
  width: number
  height: number
  /** هدف پارالاکس در بازه‌ی −۱..۱؛ با ref تا هر حرکت موس رندرِ React نسازد */
  parallax?: MutableRefObject<Parallax>
  /** هر فریم با مقدار نرم‌شده‌ی پارالاکس صدا زده می‌شود (برای لایه‌ی SVG) */
  onFrame?: (px: number, py: number) => void
  reducedMotion?: boolean
}

const TAU = Math.PI * 2
/** یک دور کامل آسمان در ۴۰ دقیقه — به چشم «حرکت آرام» می‌آید، نه چرخش */
const ROTATION_SPEED = TAU / 2400
const COLORS = ['#ffffff', '#cfdcff', '#fff1d0', '#ffd2b0']
/** بذر ثابت: آسمانِ هر شب همان آسمان است */
const SEED = 1397

/** مولد عدد تصادفی قطعی (mulberry32) */
function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** تقریب توزیع نرمال (مجموع سه یکنواخت) */
const gauss = (r: () => number) => (r() + r() + r() - 1.5) / 1.5

interface Star {
  x: number
  y: number
  r: number
  base: number
  amp: number
  speed: number
  phase: number
  c: number
  bright: boolean
}

interface Meteor {
  x: number
  y: number
  dx: number
  dy: number
  speed: number
  len: number
  life: number
  age: number
  width: number
}

function pickColor(r: () => number) {
  const v = r()
  if (v < 0.55) return 0
  if (v < 0.8) return 1
  if (v < 0.95) return 2
  return 3
}

/** اسپرایت هاله‌ی نرم (برای ستاره‌های درخشان و سر شهاب) */
function makeGlowSprite(): HTMLCanvasElement | null {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')
  if (!ctx) return null
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  return c
}

/** لایه‌ی دور: راه شیری + سحابی + ستاره‌های ریز، در مربعی به ضلع 2R دور قطب */
function makeFarLayer(R: number, dpr: number, r: () => number): HTMLCanvasElement | null {
  const S = 2 * R
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(S * dpr))
  c.height = c.width
  const ctx = c.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  // نوار راه شیری: ده‌ها لکه‌ی نرم در امتداد یک خط مایل
  const theta = -0.6
  const ux = Math.cos(theta)
  const uy = Math.sin(theta)
  ctx.globalCompositeOperation = 'lighter'
  for (let i = 0; i < 70; i++) {
    const t = (r() * 2 - 1) * 1.1
    const off = gauss(r) * 0.09 * S
    const x = R + t * R * ux - off * uy
    const y = R + t * R * uy + off * ux
    const rad = S * (0.04 + r() * 0.1)
    const warm = r() < 0.35
    const a = 0.02 + r() * 0.034
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, warm ? `rgba(255,224,240,${a})` : `rgba(196,206,255,${a})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }

  // سحابی‌ها: چند لکه‌ی بزرگ و کم‌رنگ بنفش/صورتی/فیروزه‌ای
  const nebulae: [number, number, number][] = [
    [124, 92, 255],
    [255, 111, 174],
    [76, 201, 240],
    [168, 85, 247],
  ]
  for (let i = 0; i < nebulae.length; i++) {
    const [cr, cg, cb] = nebulae[i]
    const ang = r() * TAU
    const dist = R * (0.25 + r() * 0.6)
    const x = R + Math.cos(ang) * dist
    const y = R + Math.sin(ang) * dist
    const rad = S * (0.1 + r() * 0.12)
    const a = 0.06 + r() * 0.045
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`)
    g.addColorStop(0.55, `rgba(${cr},${cg},${cb},${a * 0.35})`)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2)
  }
  ctx.globalCompositeOperation = 'source-over'

  // ستاره‌های ریزِ پراکنده + ستاره‌های متراکمِ راه شیری
  const scattered = Math.min(1400, Math.round((Math.PI * R * R) / 1100))
  const drawTiny = (x: number, y: number) => {
    const rad = 0.35 + r() * 0.6
    ctx.globalAlpha = 0.25 + r() * 0.6
    ctx.fillStyle = COLORS[pickColor(r)]
    ctx.beginPath()
    ctx.arc(x, y, rad, 0, TAU)
    ctx.fill()
  }
  for (let i = 0; i < scattered; i++) {
    const rho = R * Math.sqrt(r())
    const phi = r() * TAU
    drawTiny(R + rho * Math.cos(phi), R + rho * Math.sin(phi))
  }
  for (let i = 0; i < 380; i++) {
    const t = (r() * 2 - 1) * 1.1
    const off = gauss(r) * 0.07 * S
    drawTiny(R + t * R * ux - off * uy, R + t * R * uy + off * ux)
  }
  ctx.globalAlpha = 1
  return c
}

/** لایه‌ی ثابت روی همه‌چیز: وینیت سینمایی، مِه بنفش افق و هلال ماه */
function makeOverlay(w: number, h: number, dpr: number): HTMLCanvasElement | null {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * dpr))
  c.height = Math.max(1, Math.round(h * dpr))
  const o = c.getContext('2d')
  if (!o) return null
  o.setTransform(dpr, 0, 0, dpr, 0, 0)

  // مِه افق
  const haze = o.createLinearGradient(0, h * 0.7, 0, h)
  haze.addColorStop(0, 'rgba(120,80,190,0)')
  haze.addColorStop(0.65, 'rgba(120,80,190,.13)')
  haze.addColorStop(1, 'rgba(200,110,200,.24)')
  o.fillStyle = haze
  o.fillRect(0, h * 0.7, w, h * 0.3)

  // هلال ماه، پایین‌سمت‌چپ (کنار ردیف نمادها همیشه خالی است)
  const mr = Math.max(12, Math.min(34, Math.min(w, h) * 0.045))
  const mx = w * 0.11
  const my = h * 0.68
  const glow = o.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 5)
  glow.addColorStop(0, 'rgba(255,236,190,.32)')
  glow.addColorStop(0.3, 'rgba(255,236,190,.1)')
  glow.addColorStop(1, 'rgba(255,236,190,0)')
  o.fillStyle = glow
  o.fillRect(mx - mr * 5, my - mr * 5, mr * 10, mr * 10)
  // نور زمین‌تاب: کل قرص خیلی کم‌رنگ
  o.globalAlpha = 0.09
  o.fillStyle = '#f7efd8'
  o.beginPath()
  o.arc(mx, my, mr, 0, TAU)
  o.fill()
  o.globalAlpha = 1
  // خودِ هلال: قرص منهای دایره‌ی سایه
  o.save()
  o.beginPath()
  o.arc(mx, my, mr, 0, TAU)
  o.clip()
  o.fillStyle = '#f7efd8'
  o.beginPath()
  o.rect(mx - mr - 1, my - mr - 1, mr * 2 + 2, mr * 2 + 2)
  o.arc(mx + mr * 0.45, my - mr * 0.15, mr * 0.92, 0, TAU)
  o.fill('evenodd')
  o.restore()

  // وینیت بیضوی
  o.save()
  o.translate(w / 2, h * 0.46)
  o.scale(1, h / w)
  const vig = o.createRadialGradient(0, 0, w * 0.3, 0, 0, w * 0.78)
  vig.addColorStop(0, 'rgba(3,5,16,0)')
  vig.addColorStop(1, 'rgba(3,5,16,.62)')
  o.fillStyle = vig
  o.fillRect(-w, -w, w * 2, w * 2)
  o.restore()
  return c
}

export default function SkyCanvas({ width, height, parallax, onFrame, reducedMotion = false }: Props) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  // آخرین نسخه‌ی callback بدون این‌که تغییرش کل صحنه را از نو بسازد
  const onFrameRef = useRef(onFrame)
  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !(width > 0) || !(height > 0)) return
    const ctx = canvas.getContext('2d')
    // محیط‌های بدون canvas (مثل jsdom): گرادیان CSS زیرین کافی است
    if (!ctx) return

    const w = width
    const h = height
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)

    const r = rng(SEED)
    // قطب آسمان: بالای مرکز؛ شعاع لایه‌ی چرخان تا دورترین گوشه
    const pole = { x: w * 0.5, y: h * 0.3 }
    const R = Math.hypot(Math.max(pole.x, w - pole.x), Math.max(pole.y, h - pole.y)) + 12
    const farDpr = Math.min(dpr, 1.5, 2048 / (2 * R))
    const far = makeFarLayer(R, farDpr, r)
    const overlay = makeOverlay(w, h, dpr)
    const glow = makeGlowSprite()

    // ستاره‌های نزدیک (چشمک‌زن) در دستگاه مختصات چرخان دور قطب
    const count = Math.max(80, Math.min(240, Math.round((w * h) / 2400)))
    const stars: Star[] = []
    for (let i = 0; i < count; i++) {
      const rho = R * Math.sqrt(r())
      const phi = r() * TAU
      const bright = r() < 0.11
      stars.push({
        x: rho * Math.cos(phi),
        y: rho * Math.sin(phi),
        r: bright ? 1.8 + r() * 0.8 : 0.7 + r(),
        base: 0.5 + r() * 0.5,
        amp: 0.25 + r() * 0.3,
        speed: 0.6 + r() * 1.8,
        phase: r() * TAU,
        c: pickColor(r),
        bright,
      })
    }
    stars.sort((a, b) => a.c - b.c)

    const baseLin = ctx.createLinearGradient(0, 0, 0, h)
    baseLin.addColorStop(0, '#1b2352')
    baseLin.addColorStop(0.55, '#0c1130')
    baseLin.addColorStop(1, '#05081a')
    const baseRad = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, Math.max(w, h) * 0.8)
    baseRad.addColorStop(0, 'rgba(78,88,180,.35)')
    baseRad.addColorStop(1, 'rgba(78,88,180,0)')

    const meteors: Meteor[] = []
    const rnd = Math.random
    let nextMeteor = 1.5 + rnd() * 3
    const spawnMeteor = () => {
      const toRight = rnd() < 0.5
      const a = Math.PI / 6 + rnd() * (Math.PI / 9)
      const ang = toRight ? a : Math.PI - a
      meteors.push({
        x: w * (0.15 + rnd() * 0.7),
        y: h * (0.04 + rnd() * 0.42),
        dx: Math.cos(ang),
        dy: Math.sin(ang),
        speed: 700 + rnd() * 550,
        len: 130 + rnd() * 170,
        life: 0.6 + rnd() * 0.55,
        age: 0,
        width: 1.6 + rnd() * 1.2,
      })
    }

    let raf = 0
    let last = performance.now()
    let t = 0
    let px = 0
    let py = 0

    const draw = (dt: number) => {
      t += dt
      const target = parallax?.current ?? { x: 0, y: 0 }
      px += (target.x - px) * 0.05
      py += (target.y - py) * 0.05
      onFrameRef.current?.(px, py)

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.globalAlpha = 1
      ctx.fillStyle = baseLin
      ctx.fillRect(0, 0, w, h)
      ctx.fillStyle = baseRad
      ctx.fillRect(0, 0, w, h)

      const angle = reducedMotion ? 0 : t * ROTATION_SPEED

      if (far) {
        ctx.save()
        ctx.translate(pole.x + px * 8, pole.y + py * 8)
        ctx.rotate(angle)
        ctx.drawImage(far, -R, -R, 2 * R, 2 * R)
        ctx.restore()
      }

      ctx.save()
      ctx.translate(pole.x + px * 18, pole.y + py * 18)
      ctx.rotate(angle)
      let lastColor = -1
      for (const s of stars) {
        const k = 0.5 + 0.5 * Math.sin(t * s.speed + s.phase)
        const k2 = 0.5 + 0.5 * Math.sin(t * s.speed * 2.7 + s.phase * 1.9)
        const a = reducedMotion ? s.base : s.base * (1 - s.amp + s.amp * (0.7 * k + 0.3 * k2))
        if (s.c !== lastColor) {
          ctx.fillStyle = COLORS[s.c]
          lastColor = s.c
        }
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.r, 0, TAU)
        ctx.fill()
        if (s.bright) {
          if (glow) {
            const g = s.r * 5
            ctx.globalAlpha = a * 0.45
            ctx.drawImage(glow, s.x - g, s.y - g, g * 2, g * 2)
          }
          // تلألؤ صلیبی در اوج درخشش
          if (k > 0.88) {
            const f = (k - 0.88) / 0.12
            const len = s.r * 4.5 * f
            ctx.globalAlpha = a * 0.85 * f
            ctx.fillRect(s.x - len, s.y - 0.5, len * 2, 1)
            ctx.fillRect(s.x - 0.5, s.y - len, 1, len * 2)
          }
        }
      }
      ctx.restore()
      ctx.globalAlpha = 1

      if (overlay) ctx.drawImage(overlay, 0, 0, w, h)

      // شهاب‌ها
      if (!reducedMotion) {
        nextMeteor -= dt
        if (nextMeteor <= 0) {
          spawnMeteor()
          nextMeteor = 3 + rnd() * 5
        }
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i]
        m.age += dt
        if (m.age >= m.life) {
          meteors.splice(i, 1)
          continue
        }
        const p = m.age / m.life
        const hx = m.x + m.dx * m.speed * m.age
        const hy = m.y + m.dy * m.speed * m.age
        const tail = m.len * Math.min(1, m.age / 0.22)
        const fade = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35
        const tx = hx - m.dx * tail
        const ty = hy - m.dy * tail
        const grad = ctx.createLinearGradient(tx, ty, hx, hy)
        grad.addColorStop(0, 'rgba(255,255,255,0)')
        grad.addColorStop(0.6, `rgba(205,222,255,${0.4 * fade})`)
        grad.addColorStop(1, `rgba(255,255,255,${0.95 * fade})`)
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(hx, hy)
        // هاله‌ی پهن و کم‌رنگ دور دنباله + خودِ دنباله
        ctx.strokeStyle = grad
        ctx.globalAlpha = 0.22
        ctx.lineWidth = m.width * 3.2
        ctx.stroke()
        ctx.globalAlpha = 1
        ctx.lineWidth = m.width
        ctx.stroke()
        if (glow) {
          ctx.globalAlpha = fade
          ctx.drawImage(glow, hx - 10, hy - 10, 20, 20)
          ctx.globalAlpha = 1
        }
      }
    }

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      draw(dt)
      raf = requestAnimationFrame(frame)
    }

    if (reducedMotion) {
      // یک فریم ثابت، بدون حلقه
      draw(0)
      return
    }

    const start = () => {
      if (raf) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const stop = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    }
    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    draw(0)
    if (!document.hidden) start()

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [width, height, reducedMotion, parallax])

  return (
    <canvas
      ref={ref}
      className="absolute inset-0 block"
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}
