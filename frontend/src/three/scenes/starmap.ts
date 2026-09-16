/**
 * starmap.ts — صحنه‌ی «آسمانِ ستاره‌ها» در لایه‌ی کهکشان
 *
 * یک کره‌ی آسمانیِ واقعی: ستاره‌ها در عمقِ سه‌بعدی پخش شده‌اند، صورت‌های
 * فلکی روی یک کمانِ ملایم روبه‌روی دوربین نشسته‌اند، آسمان آرام می‌چرخد و با
 * کشیدنِ انگشت/موس می‌توان چرخاندش. با انتخابِ هر صورتِ فلکی، دوربین به
 * سمتش **پرواز** می‌کند.
 *
 * --------------------------------------------------------------------------
 * ⚠️ جهتِ محورِ y — یک تفاوتِ حیاتی با نسخه‌ی SVG
 * --------------------------------------------------------------------------
 * بک‌اند مختصات را با «y رو به بالا» (دستگاهِ ریاضی) ذخیره می‌کند. three.js هم
 * دقیقاً همین دستگاه را دارد، پس این‌جا **هیچ** برگرداندنی لازم نیست.
 * ولی بومِ SVG مبدأش گوشه‌ی بالا-چپ است و Starmap.tsx مجبور است با
 * ``toCanvasY(y) = 1 - y`` برگرداندش. اگر این‌جا هم همان تبدیل را می‌زدم،
 * قلب واژگون می‌شد و نوکش رو به بالا دیده می‌شد — یک باگِ بی‌صدا که فقط با
 * نگاه‌کردن به شکلِ قلب کشف می‌شود.
 *
 * --------------------------------------------------------------------------
 * چرا OrbitControls و EffectComposer استفاده نشده
 * --------------------------------------------------------------------------
 * • OrbitControls از ``three/examples/jsm`` می‌آید و بایتِ اضافه دارد، در
 *   حالی که کلِ چیزی که لازم داریم یک درگِ تک‌محوره با اینرسی است (~۲۵ خط).
 * • Bloom/EffectComposer روی موبایل بسیار گران است (چند pass کاملِ
 *   frame-buffer). درخشش را به‌جایش با **sprite های additive** می‌سازیم که
 *   یک pass است و عملاً رایگان — و روی گوشی پایدارتر.
 */
import * as THREE from 'three'

import type { SceneApi, SceneFactoryInput } from '../useThreeScene'


/* ---------------------------------- شکل‌های procedural ♥ و ♾️ --- */

/** نقاطِ منحنیِ قلبِ کلاسیک در [0,1]² (y رو به بالا) */
export function heartStars(count = 28): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2
    // منحنی پارامتری قلب
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    pts.push([0.5 + x / 36, 0.48 + y / 36])
  }
  return pts
}

/** نقاطِ lemniscate (∞) در [0,1]² */
export function infinityStars(count = 36): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < count; i += 1) {
    const t = (i / count) * Math.PI * 2
    const s = 1 + Math.sin(t) ** 2
    const x = Math.cos(t) / s
    const y = (Math.sin(t) * Math.cos(t)) / s
    pts.push([0.5 + x * 0.42, 0.5 + y * 0.42])
  }
  return pts
}

/** عمقِ z پایدار از روی ایندکس ستاره (حروف دوبعدی DB → حجم) */
export function starDepth(index: number, letterIndex = 0): number {
  return Math.sin(index * 2.3 + letterIndex) * 0.16
}


export interface StarmapShape {
  id: number
  letter: string
  kind: string
  stars: [number, number][]
  /** آیا روشن است (انتخاب‌شده یا «کلِ اسم») */
  lit: boolean
}

export interface StarmapSceneHandle extends SceneApi {
  /** به صحنه بگو کدام صورتِ فلکی انتخاب شده تا دوربین به سمتش برود */
  focus: (id: number | null) => void
}

/* ------------------------------------------------------- بافتِ درخشش --- */

/**
 * یک بافتِ دایره‌ی نرم با canvas می‌سازد (بدونِ فایلِ بیرونی).
 *
 * چرا لازم است: ``PointsMaterial`` بدونِ map یک مربعِ تخت رندر می‌کند. با
 * یک بافتِ شعاعیِ نرم و ``AdditiveBlending`` هر نقطه به یک ستاره‌ی درخشان
 * تبدیل می‌شود. ساختنش یک بار و ۶۴×۶۴ پیکسل است → عملاً رایگان.
 */
function makeGlowTexture(): THREE.Texture {
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.22, 'rgba(255,246,214,0.92)')
    g.addColorStop(0.5, 'rgba(255,214,150,0.34)')
    g.addColorStop(1, 'rgba(255,214,150,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, size, size)
  }
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

/* --------------------------------------------------------- رنگ‌ها --- */
const COL_STAR_FAR = 0xbfd0ff
const COL_LINE_IDLE = 0x8a97d6
const COL_LINE_LIT = 0xffd98a
const COL_STAR_LIT = 0xffe9a8
const COL_SHAPE_LIT = 0xff9ecb

/** فاصله‌ی هر صورتِ فلکی روی کمان */
const SPACING = 6.4
/** انحنا: صورت‌های کناری کمی عقب‌تر می‌نشینند تا کمان بسازند */
const ARC_DEPTH = 2.6
/** اندازه‌ی جعبه‌ی هر حرف */
const CELL = 3.4
/** شکل‌ها (♥ و ∞) بزرگ‌ترند چون «قهرمانِ» صحنه‌اند */
const SHAPE_SCALE = 1.55

export function createStarmapScene(
  input: SceneFactoryInput,
  getShapes: () => StarmapShape[],
): StarmapSceneHandle {
  const { scene, camera, renderer } = input

  camera.position.set(0, 0.6, 22)
  camera.lookAt(0, 0, 0)

  /* ------------------------------------------------------ آسمانِ زمینه --- */
  // تعداد بر اساسِ توانِ دستگاه: هر نقطه یک vertex است و ۱۶۰۰ تا روی گوشیِ
  // جدید روان است، ولی بی‌دلیل زیادش کردن فقط باتری می‌خورد.
  const FAR_COUNT = 1500
  const farGeo = new THREE.BufferGeometry()
  const farPos = new Float32Array(FAR_COUNT * 3)
  const farCol = new Float32Array(FAR_COUNT * 3)
  const farSize = new Float32Array(FAR_COUNT)
  const tmpColor = new THREE.Color()
  for (let i = 0; i < FAR_COUNT; i += 1) {
    // توزیعِ یکنواخت روی کره (نه تجمع در قطب‌ها)
    const u = Math.random()
    const v = Math.random()
    const theta = 2 * Math.PI * u
    const phi = Math.acos(2 * v - 1)
    const r = 70 + Math.random() * 40
    farPos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
    farPos[i * 3 + 1] = r * Math.cos(phi)
    farPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    // کمی تنوعِ رنگی تا آسمان «زنده» باشد
    tmpColor.setHex(COL_STAR_FAR)
    const warm = Math.random()
    if (warm > 0.82) tmpColor.setHex(0xffe0b0)
    else if (warm > 0.66) tmpColor.setHex(0xd8c8ff)
    farCol[i * 3] = tmpColor.r
    farCol[i * 3 + 1] = tmpColor.g
    farCol[i * 3 + 2] = tmpColor.b
    farSize[i] = 0.5 + Math.random() * 1.6
  }
  farGeo.setAttribute('position', new THREE.BufferAttribute(farPos, 3))
  farGeo.setAttribute('color', new THREE.BufferAttribute(farCol, 3))
  farGeo.setAttribute('aSize', new THREE.BufferAttribute(farSize, 1))

  const glowTex = makeGlowTexture()
  const farMat = new THREE.PointsMaterial({
    size: 1.5,
    map: glowTex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    opacity: 0.85,
  })
  const farStars = new THREE.Points(farGeo, farMat)
  scene.add(farStars)

  /* -------------------------------------------------------- سحابیِ نرم --- */
  // سه sprite بزرگ و بسیار کم‌رنگ که به آسمان «عمقِ اتمسفری» می‌دهند.
  // ارزان‌تر از یک shaderِ تمام‌صفحه و روی موبایل پایدارتر.
  const nebulaColors = [0x6a4fa8, 0x2f4a9c, 0xa8446f]
  const nebulas = nebulaColors.map((hex, i) => {
    const m = new THREE.SpriteMaterial({
      map: glowTex,
      color: hex,
      transparent: true,
      opacity: 0.16,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    const s = new THREE.Sprite(m)
    const angle = (i / nebulaColors.length) * Math.PI * 2
    s.position.set(Math.cos(angle) * 46, Math.sin(angle * 1.3) * 18, -40 + Math.sin(angle) * 20)
    s.scale.setScalar(58 + i * 12)
    scene.add(s)
    return s
  })

  /* ------------------------------------------------ نورِ ملایمِ صحنه --- */
  // صورت‌های فلکی از Points/Line ساخته شده‌اند و به نور نیاز ندارند، ولی
  // یک نورِ محیطیِ کم‌رنگ به عمقِ بصریِ کلی کمک می‌کند و هزینه‌اش ناچیز است.
  scene.add(new THREE.AmbientLight(0xffffff, 0.35))

  /* ------------------------------------------- گروه‌های صورتِ فلکی --- */
  const skyGroup = new THREE.Group()
  scene.add(skyGroup)

  interface ConstellationNode {
    id: number
    group: THREE.Group
    points: THREE.Points
    pointsMat: THREE.PointsMaterial
    line: THREE.Line
    lineMat: THREE.LineBasicMaterial
    basePos: THREE.Vector3
    isShape: boolean
    lit: boolean
  }

  let nodes: ConstellationNode[] = []
  let builtKey = ''
  let focusId: number | null = null
  let focusTarget: THREE.Vector3 | null = null
  let cameraBase = new THREE.Vector3(0, 0.6, 22)

  /** صورت‌های فلکی را (دوباره) می‌سازد. فقط وقتی که فهرست عوض شده باشد. */
  function build(shapes: StarmapShape[]) {
    // پاک‌سازیِ کاملِ قبلی‌ها (بدونِ این، هر بار حافظه‌ی GPU نشت می‌کند)
    for (const n of nodes) {
      // geometry مشترکِ points/line فقط یک بار آزاد می‌شود
      n.points.geometry.dispose()
      n.pointsMat.dispose()
      n.lineMat.dispose()
      skyGroup.remove(n.group)
    }
    nodes = []
    if (shapes.length === 0) return

    // حرف‌ها و شکل‌ها جدا شمرده می‌شوند تا شکل‌ها در انتهای کمان و بزرگ‌تر
    // بنشینند — همان تفکیکی که در نسخه‌ی دو‌بعدی هم هست.
    const letters = shapes.filter((s) => s.kind !== 'shape')
    const shapeList = shapes.filter((s) => s.kind === 'shape')
    const ordered = [...letters, ...shapeList]
    const mid = (ordered.length - 1) / 2

    ordered.forEach((shape, i) => {
      const isShape = shape.kind === 'shape'
      const pts = shape.stars || []
      if (pts.length === 0) return

      // نرمال‌سازی به جعبه‌ی واحد، بعد مقیاس.
      // ⚠️ y را **برنمی‌گردانیم** (توضیحِ بالای فایل).
      const scale = isShape ? CELL * SHAPE_SCALE : CELL
      const positions = new Float32Array(pts.length * 3)
      for (let k = 0; k < pts.length; k += 1) {
        positions[k * 3] = (pts[k][0] - 0.5) * scale
        positions[k * 3 + 1] = (pts[k][1] - 0.5) * scale
        // کمی عمقِ تصادفیِ پایدار به هر ستاره تا صورتِ فلکی «تخت» نباشد
        positions[k * 3 + 2] = Math.sin(k * 2.3 + i) * 0.16
      }
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      const pointsMat = new THREE.PointsMaterial({
        size: isShape ? 0.42 : 0.34,
        map: glowTex,
        color: shape.lit ? (isShape ? COL_SHAPE_LIT : COL_STAR_LIT) : 0xffffff,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      })
      const points = new THREE.Points(geo, pointsMat)

      const lineMat = new THREE.LineBasicMaterial({
        color: shape.lit ? (isShape ? COL_SHAPE_LIT : COL_LINE_LIT) : COL_LINE_IDLE,
        transparent: true,
        opacity: shape.lit ? 0.95 : 0.34,
      })
      const line = new THREE.Line(geo, lineMat)

      const group = new THREE.Group()
      group.add(line)
      group.add(points)

      const offset = i - mid
      const basePos = new THREE.Vector3(
        offset * SPACING,
        isShape ? -0.35 : 0.15,
        // کمان: هرچه از مرکز دورتر، عقب‌تر
        -Math.abs(offset) * ARC_DEPTH * 0.34,
      )
      group.position.copy(basePos)
      group.userData.id = shape.id
      // کمی چرخشِ رو به دوربین تا کمان طبیعی‌تر خوانده شود
      group.rotation.y = -offset * 0.085
      skyGroup.add(group)

      nodes.push({
        id: shape.id,
        group,
        points,
        pointsMat,
        line,
        lineMat,
        basePos,
        isShape,
        lit: shape.lit,
      })
    })
  }

  /** رنگ/شفافیت را با وضعیتِ «روشن» همگام می‌کند — بدونِ ساختِ دوباره‌ی هندسه */
  function syncLit(shapes: StarmapShape[]) {
    shapes.forEach((shape) => {
      const node = nodes.find((n) => n.id === shape.id)
      if (!node || node.lit === shape.lit) return
      node.lit = shape.lit
      node.pointsMat.color.setHex(shape.lit ? (node.isShape ? COL_SHAPE_LIT : COL_STAR_LIT) : 0xffffff)
      node.lineMat.color.setHex(shape.lit ? (node.isShape ? COL_SHAPE_LIT : COL_LINE_LIT) : COL_LINE_IDLE)
      node.lineMat.opacity = shape.lit ? 0.95 : 0.34
      node.pointsMat.needsUpdate = true
      node.lineMat.needsUpdate = true
    })
  }

  /* ------------------------------------------------------- درگ و اینرسی --- */
  let dragging = false
  let lastX = 0
  let velocity = 0
  let yaw = 0

  const el = renderer.domElement
  const onDown = (e: PointerEvent) => {
    dragging = true
    lastX = e.clientX
    velocity = 0
    el.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - lastX
    lastX = e.clientX
    // حساسیت نسبت به پهنای صحنه، تا روی گوشی و دسکتاپ یکسان حس شود
    const w = Math.max(1, el.clientWidth)
    const delta = (dx / w) * 2.1
    yaw -= delta
    velocity = -delta
  }
  const onUp = (e: PointerEvent) => {
    dragging = false
    el.releasePointerCapture?.(e.pointerId)
  }
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
  // تا درگِ صحنه باعثِ اسکرولِ خودِ اپ نشود
  el.style.touchAction = 'none'

  /* --------------------------------------------------------- چرخه‌ی فریم --- */
  const worldPos = new THREE.Vector3()

  const api: StarmapSceneHandle = {
    focus: (id) => {
      focusId = id
      if (id == null) {
        focusTarget = null
        return
      }
      const node = nodes.find((n) => n.id === id)
      if (!node) {
        focusTarget = null
        return
      }
      // موقعیتِ **جهانی** گروه را می‌گیریم چون skyGroup می‌چرخد؛ اگر
      // موقعیتِ محلی را هدف می‌گرفتیم، دوربین به جایِ خالیِ آسمان می‌رفت.
      node.group.getWorldPosition(worldPos)
      focusTarget = worldPos.clone()
    },

    update: (dt, elapsed) => {
      const shapes = getShapes()
      const key = shapes.map((s) => `${s.id}:${(s.stars || []).length}`).join('|')
      if (key !== builtKey) {
        builtKey = key
        build(shapes)
        // focus باید بعد از ساختِ دوباره تازه شود: گروه‌های قبلی دور ریخته
        // شده‌اند و هدفِ دوربین به یک شیءِ مرده اشاره می‌کرد.
        if (focusId != null) api.focus(focusId)
      } else {
        syncLit(shapes)
      }

      // چرخشِ خودکارِ بسیار آرام + اینرسیِ درگ
      if (!dragging) {
        yaw += velocity
        velocity *= 0.92 // اصطکاک
        if (Math.abs(velocity) < 0.00005) velocity = 0
        yaw += dt * 0.018
      }
      skyGroup.rotation.y = yaw
      skyGroup.rotation.x = Math.sin(elapsed * 0.11) * 0.035
      farStars.rotation.y = yaw * 0.28 // پارالاکس: ستاره‌های دور آهسته‌تر
      farStars.rotation.x = Math.sin(elapsed * 0.07) * 0.02

      // سوسوی ملایمِ ستاره‌های زمینه
      farMat.opacity = 0.78 + Math.sin(elapsed * 0.7) * 0.09

      // تپشِ صورتِ فلکیِ روشن
      for (const n of nodes) {
        if (!n.lit) {
          n.pointsMat.size = n.isShape ? 0.42 : 0.34
          continue
        }
        const pulse = 1 + Math.sin(elapsed * 2.2) * 0.16
        n.pointsMat.size = (n.isShape ? 0.42 : 0.34) * pulse
        n.group.position.y = n.basePos.y + Math.sin(elapsed * 1.3) * 0.07
      }

      for (const s of nebulas) {
        const mat = s.material as THREE.SpriteMaterial
        mat.opacity = 0.13 + Math.sin(elapsed * 0.35 + s.position.x * 0.05) * 0.045
      }

      // پروازِ دوربین به سمتِ صورتِ فلکیِ انتخاب‌شده
      if (focusTarget) {
        const target = new THREE.Vector3(focusTarget.x * 0.45, focusTarget.y + 0.4, focusTarget.z * 0.3 + 12.5)
        camera.position.lerp(target, Math.min(1, dt * 2.6))
        camera.lookAt(focusTarget.x * 0.5, focusTarget.y, focusTarget.z * 0.4)
      } else {
        camera.position.lerp(cameraBase, Math.min(1, dt * 2.0))
        camera.lookAt(0, 0, 0)
      }
    },

    resize: (w, h) => {
      // روی صفحه‌های باریکِ گوشی، کمانِ صورت‌های فلکی جا نمی‌شود؛ پس دوربین
      // را عقب‌تر می‌بریم تا همه دیده شوند. این کار «زوم» نیست،
      // «قاب‌بندیِ دوباره» است.
      const aspect = w / Math.max(1, h)
      const pull = aspect < 0.85 ? 12 : aspect < 1.2 ? 6 : 0
      cameraBase = new THREE.Vector3(0, 0.6, 22 + pull)
    },

    dispose: () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      for (const n of nodes) {
        // points و line به **یک** BufferGeometry مشترک اشاره می‌کنند؛ یک بار
        // آزادش می‌کنیم.
        n.points.geometry.dispose()
        n.pointsMat.dispose()
        n.lineMat.dispose()
      }
      nodes = []
      farGeo.dispose()
      farMat.dispose()
      for (const s of nebulas) {
        ;(s.material as THREE.SpriteMaterial).dispose()
      }
      glowTex.dispose()
    },
  }

  // resize در SceneApi اختیاری است؛ بدونِ ?. این‌جا خطایِ تایپ می‌داد
  api.resize?.(input.width, input.height)
  return api
}
