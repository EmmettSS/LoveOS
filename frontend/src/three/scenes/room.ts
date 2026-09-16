/**
 * room.ts — صحنه‌ی «ماکتِ خونه‌ی رویایی» در لایه‌ی کهکشان
 *
 * همان نقشه‌ی دوبعدیِ تبِ «نقشه» را به یک **ماکتِ سه‌بعدی** تبدیل می‌کند:
 * هر اتاق یک حجمِ شیشه‌ای با رنگِ خودش و لبه‌های روشن می‌گیرد، طبقه‌ی بالا
 * واقعاً بالایِ همکف می‌نشیند و حیاط کم‌ارتفاع است. با کشیدنِ انگشت می‌چرخد
 * و وقتی رهایش کنی آرام به چرخشِ خودش برمی‌گردد. با یک ضربه روی هر اتاق،
 * اسمش نشان داده می‌شود.
 *
 * --------------------------------------------------------------------------
 * چرا این صحنه **بازسازی‌شدنی** است ولی ستاره‌ها نه
 * --------------------------------------------------------------------------
 * آسمانِ ستاره‌ها یک هندسه‌ی ثابت دارد و فقط «روشن/خاموش» عوض می‌شود، پس
 * آن‌جا صحنه یک بار ساخته می‌شود و تغییرات از راهِ ref می‌روند. اینجا ولی
 * کاربر اتاق **اضافه، حذف و جابه‌جا** می‌کند — یعنی هندسه واقعاً عوض
 * می‌شود. پس یک «امضا» از فهرستِ اتاق‌ها ساخته می‌شود و فقط وقتی امضا عوض
 * شد meshها از نو ساخته می‌شوند. بدونِ این مقایسه، هر فریم یک بار
 * BoxGeometry تازه ساخته می‌شد که هم لگ است هم نشتیِ حافظه‌ی GPU.
 *
 * --------------------------------------------------------------------------
 * ⚠️ جهتِ y در نقشه
 * --------------------------------------------------------------------------
 * در نقشه‌ی دوبعدی، ``y`` همان ``top`` است یعنی **رو به پایین**. در فضایِ
 * سه‌بعدیِ three، محورِ ro-به-دوربین ``+z`` است. پس ``y`` مستقیماً به ``+z``
 * نگاشت می‌شود و نقشه **آینه نمی‌شود**. اگر اینجا ``-z`` می‌گذاشتیم، اتاقِ
 * آشپزخانه در ماکت آن‌طرفِ خانه دیده می‌شد نسبت به نقشه — یک باگِ بی‌صدا
 * که فقط با مقایسه‌ی چشمی کشف می‌شود.
 *
 * هزینه: به ازای هر اتاق دو draw call (حجم + لبه‌ها). با شش اتاق = ۱۲.
 */
import * as THREE from 'three'

import type { SceneApi, SceneFactoryInput } from '../useThreeScene'

export interface RoomBox {
  id: number
  name: string
  /** ۰ تا ۱۰۰ — همان دستگاهِ درصدیِ نقشه‌ی دوبعدی */
  x: number
  y: number
  w: number
  h: number
  color: string
  floor: string
}

export interface RoomSceneHandle extends SceneApi {
  /** ضربه روی کدام اتاق بود؟ ``null`` یعنی هیچ‌کدام */
  pick(clientX: number, clientY: number): RoomBox | null
}

/** ضریبِ تبدیلِ «درصدِ نقشه» به «واحدِ جهان» */
const S = 0.3
/** ارتفاعِ دیوارِ یک طبقه‌ی معمولی */
const WALL_H = 4.2

/** ارتفاع و ترازِ عمودی بر اساسِ طبقه — حیاط عمداً کم‌ارتفاع است */
function floorSpec(floor: string): { level: number; height: number } {
  if (floor === 'first') return { level: 1, height: WALL_H }
  if (floor === 'yard') return { level: 0, height: WALL_H * 0.28 }
  return { level: 0, height: WALL_H }
}

/** رنگِ hex/نام‌دار را به THREE.Color؛ اگر نشد، صورتیِ پیش‌فرضِ LoveOS */
function toColor(c: string): THREE.Color {
  try {
    return new THREE.Color(c || '#f9a8d4')
  } catch {
    return new THREE.Color('#f9a8d4')
  }
}

export function createRoomScene(
  input: SceneFactoryInput,
  getRooms: () => RoomBox[],
): RoomSceneHandle {
  const { scene, camera, renderer, tier } = input
  const el = renderer.domElement

  /* ------------------------------------------------------------ نورها --- */
  scene.add(new THREE.AmbientLight(0xd8ccff, 0.75))
  const sun = new THREE.DirectionalLight(0xfff2df, 1.35)
  sun.position.set(16, 26, 12)
  scene.add(sun)
  // نورِ پرکننده‌ی سرد از سمتِ مخالف تا ضلعِ سایه‌دار سیاهِ مطلق نشود
  const fill = new THREE.DirectionalLight(0x86b6ff, 0.4)
  fill.position.set(-14, 10, -16)
  scene.add(fill)

  /* --------------------------------------------------------------- زمین --- */
  const groundGeo = new THREE.PlaneGeometry(96, 96)
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x1d2a44, roughness: 0.96, metalness: 0 })
  const ground = new THREE.Mesh(groundGeo, groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.06
  scene.add(ground)

  // شبکه‌ی راهنما: همان نقشه‌ی شطرنجیِ نسخه‌ی دوبعدی، تا ماکت با نقشه
  // قابلِ مقایسه بماند.
  const grid = new THREE.GridHelper(30, 10, 0x6f7fb5, 0x3a4470)
  ;(grid.material as THREE.Material).transparent = true
  ;(grid.material as THREE.Material).opacity = 0.28
  grid.position.y = 0.01
  scene.add(grid)

  /* ------------------------------------------------------------ اتاق‌ها --- */
  const roomsGroup = new THREE.Group()
  scene.add(roomsGroup)

  let builtSignature = ''
  // برای raycast: فقط حجم‌های اتاق، نه زمین و نه شبکه
  const pickables: THREE.Mesh[] = []
  let roomMap = new Map<number, RoomBox>()

  const clearRooms = () => {
    for (const child of [...roomsGroup.children]) {
      const mesh = child as THREE.Mesh | THREE.LineSegments
      mesh.geometry?.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) for (const m of mat) m.dispose()
      else mat?.dispose()
      roomsGroup.remove(child)
    }
    pickables.length = 0
  }

  const build = (rooms: RoomBox[]) => {
    clearRooms()
    roomMap = new Map(rooms.map((r) => [r.id, r]))

    for (const r of rooms) {
      const { level, height } = floorSpec(r.floor)
      const w = Math.max(0.6, r.w * S)
      const d = Math.max(0.6, r.h * S)
      // مرکزِ اتاق در دستگاهِ جهان. ``y`` نقشه مستقیماً به ``+z`` می‌رود
      // (توضیحِ جهت در سرآیندِ فایل).
      const cx = (r.x + r.w / 2 - 50) * S
      const cz = (r.y + r.h / 2 - 50) * S
      const baseY = level * WALL_H
      const col = toColor(r.color)

      // کفِ اتاق — رنگِ اشباع‌تر، چون کف جایی است که نور مستقیم می‌گیرد
      const slabGeo = new THREE.BoxGeometry(w, 0.24, d)
      const slabMat = new THREE.MeshStandardMaterial({
        color: col.clone().multiplyScalar(0.62),
        roughness: 0.88,
        metalness: 0.04,
      })
      const slab = new THREE.Mesh(slabGeo, slabMat)
      slab.position.set(cx, baseY + 0.12, cz)
      slab.userData.roomId = r.id
      roomsGroup.add(slab)
      pickables.push(slab)

      // حجمِ شیشه‌ایِ اتاق. نیمه‌شفاف عمداً است: ماکتِ واقعی هم همین‌طور
      // است، وگرنه اتاقِ جلویی اتاقِ پشتی را کامل می‌پوشاند.
      const bodyGeo = new THREE.BoxGeometry(w, height, d)
      const bodyMat = new THREE.MeshStandardMaterial({
        color: col,
        roughness: 0.42,
        metalness: 0.08,
        transparent: true,
        opacity: 0.34,
        // ⚠️ ``depthWrite: false`` روی حجمِ شفاف لازم است: با depthWrite،
        //    وجهِ عقبیِ جعبه عمق می‌نوشت و وجهِ جلویی را حذف می‌کرد، پس
        //    اتاق‌ها یک‌ورقه و توخالیِ بد دیده می‌شدند.
        depthWrite: false,
      })
      const body = new THREE.Mesh(bodyGeo, bodyMat)
      body.position.set(cx, baseY + 0.24 + height / 2, cz)
      body.userData.roomId = r.id
      body.renderOrder = 2
      roomsGroup.add(body)
      pickables.push(body)

      // لبه‌های روشن = خواناییِ ماکت. بدونِ این، حجمِ شفاف در زمینه‌ی
      // تیره گم می‌شود.
      const edges = new THREE.EdgesGeometry(bodyGeo)
      const lineMat = new THREE.LineBasicMaterial({
        color: col.clone().lerp(new THREE.Color('#ffffff'), 0.55),
        transparent: true,
        opacity: 0.92,
      })
      const lines = new THREE.LineSegments(edges, lineMat)
      lines.position.copy(body.position)
      lines.renderOrder = 3
      roomsGroup.add(lines)
    }
  }

  const signatureOf = (rooms: RoomBox[]) =>
    rooms
      .map((r) => `${r.id}:${r.name}:${r.x}:${r.y}:${r.w}:${r.h}:${r.color}:${r.floor}`)
      .join('|')

  // ساختِ اولیه
  const initial = getRooms()
  builtSignature = signatureOf(initial)
  build(initial)

  /* ------------------------------------------------------------ دوربین --- */
  const camTarget = new THREE.Vector3(0, 2.4, 0)
  const radius = tier === 'dream' ? 34 : 38
  let yaw = 0.62
  let pitch = 0.66
  let targetYaw = yaw
  let targetPitch = pitch
  let dragging = false
  let lastX = 0
  let lastY = 0
  let moved = 0
  let idleSpin = true

  const applyCamera = () => {
    // pitch محدود است تا دوربین زیرِ زمین نرود یا کاملاً عمودی نشود
    const p = Math.max(0.16, Math.min(1.32, pitch))
    const r = radius
    camera.position.set(
      camTarget.x + r * Math.cos(p) * Math.sin(yaw),
      camTarget.y + r * Math.sin(p),
      camTarget.z + r * Math.cos(p) * Math.cos(yaw),
    )
    camera.lookAt(camTarget)
  }
  camera.fov = 44
  camera.near = 0.5
  camera.far = 260
  camera.updateProjectionMatrix()
  applyCamera()

  const onDown = (e: PointerEvent) => {
    dragging = true
    moved = 0
    idleSpin = false
    lastX = e.clientX
    lastY = e.clientY
    el.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    moved += Math.abs(dx) + Math.abs(dy)
    targetYaw -= dx * 0.007
    targetPitch += dy * 0.005
  }
  const onUp = () => {
    dragging = false
    // اگر تقریباً حرکت نکرد، یک «ضربه» بوده نه درگ → چرخشِ خودکار ادامه
    if (moved < 6) idleSpin = true
  }

  // ⚠️ ``pan-y`` و نه ``none``: این canvas داخلِ یک تبِ اسکرول‌شدنی است و
  //    گرفتنِ کاملِ لمس یعنی کاربر دیگر نمی‌تواند در خونه‌ی رویایی اسکرول
  //    کند (scroll-jacking).
  el.style.touchAction = 'pan-y'
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  return {
    update(dt) {
      // فقط وقتی امضایِ داده عوض شده ماکت را از نو می‌سازیم (توضیحِ سرآیند)
      const rooms = getRooms()
      const sig = signatureOf(rooms)
      if (sig !== builtSignature) {
        builtSignature = sig
        build(rooms)
      }

      if (idleSpin && !dragging) targetYaw += dt * 0.13
      const k = Math.min(1, dt * 5.5)
      yaw += (targetYaw - yaw) * k
      pitch += (targetPitch - pitch) * k
      applyCamera()
    },

    pick(clientX, clientY) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return null
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1
      // NDC در three با y رو-به-بالا است، پس clientY باید برگردد
      ndc.y = -(((clientY - r.top) / r.height) * 2 - 1)
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObjects(pickables, false)
      for (const hit of hits) {
        const id = hit.object.userData?.roomId
        if (typeof id === 'number' && roomMap.has(id)) return roomMap.get(id) ?? null
      }
      return null
    },

    dispose() {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      clearRooms()
      roomMap = new Map()
    },
  }
}
