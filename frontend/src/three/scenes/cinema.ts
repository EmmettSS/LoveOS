/**
 * cinema.ts — صحنه‌ی «سالنِ سینمای ما» در لایه‌ی کهکشان
 *
 * یک سالنِ کوچک: پرده، سه ردیف صندلیِ مخملی، مخروطِ نورِ پروژکتور و غبارِ
 * شناور در همان نور. با کشیدنِ انگشت/موس کمی می‌چرخد و وقتی رهایش کنی
 * آرام به حالتِ «نفس‌کشیدن» برمی‌گردد.
 *
 * --------------------------------------------------------------------------
 * چرا پرده با MeshBasicMaterial است و نه Standard
 * --------------------------------------------------------------------------
 * پرده‌ی سینما در واقعیت **منبعِ نور** است نه سطحِ نورگیر. اگر material
 * نورگیر می‌گذاشتیم، روشنایی‌اش به چراغ‌های صحنه وابسته می‌شد و برای
 * «درخشان دیده‌شدن» باید intensity چراغ‌ها را بالا می‌بردیم که خودش کلِ
 * صندلی‌ها را می‌شست. Basic یعنی رنگِ خالصِ بافت، مستقل از نور — دقیقاً
 * همان چیزی که یک پرده‌ی روشن می‌خواهد.
 *
 * --------------------------------------------------------------------------
 * ⚠️ پوسترِ عمودی روی پرده‌ی افقی
 * --------------------------------------------------------------------------
 * پوسترهای سینما ۲:۳ عمودی‌اند (``h-24 w-16`` در خودِ اپ) و پرده ۱۶:۹
 * افقی. اگر بافت را بی‌محاسبات روی پرده می‌کشیدیم، چهره‌ها کشیده و
 * دفرمه می‌شدند. پس ``fitTexture`` همان کاری را می‌کند که
 * ``object-fit: contain`` در CSS می‌کند: با ``repeat`` و ``offset`` تصویر را
 * در بزرگ‌ترین مستطیلِ هم‌نسبتِ ممکن جا می‌دهد و بقیه‌ی پرده تیره می‌ماند
 * (letterbox) — مثلِ یک سینمایِ واقعی که تریلرِ عمودی پخش می‌کند.
 *
 * --------------------------------------------------------------------------
 * هزینه
 * --------------------------------------------------------------------------
 * همه‌ی صندلی‌ها یک ``InstancedMesh`` هستند، پس ۴۲ صندلی = **یک** draw call.
 * غبار یک ``Points`` است = یک draw call. جمعِ صحنه حدودِ ۸ draw call و
 * کمتر از ۴ هزار مثلث — روی گوشیِ سه-چهار ساله عملاً رایگان است.
 */
import * as THREE from 'three'

import type { SceneApi, SceneFactoryInput } from '../useThreeScene'

export interface CinemaSceneProps {
  /** آدرسِ پوسترِ فیلمِ جاری؛ ``null`` یعنی پرده فقط با گرادیانِ نورانی است */
  posterUrl: string | null
}

/** نسبتِ پرده (۱۶:۹) — در یک جا چون هم geometry و هم fitTexture لازمش دارند */
const SCREEN_W = 17
const SCREEN_H = (SCREEN_W * 9) / 16

const ROWS = 3
const SEATS_PER_ROW = 7

/**
 * بافتِ یک تصویر را طوری تنظیم می‌کند که **بدونِ کشیدگی** داخلِ یک مستطیلِ
 * هدف جا بگیرد (همان ``object-fit: contain``).
 *
 * @param texAspect   نسبتِ خودِ تصویر (عرض/ارتفاع)
 * @param boxAspect   نسبتِ جعبه‌ی مقصد
 */
export function fitTexture(tex: THREE.Texture, texAspect: number, boxAspect: number): void {
  if (!Number.isFinite(texAspect) || texAspect <= 0) return
  if (Math.abs(texAspect - boxAspect) < 0.001) {
    tex.repeat.set(1, 1)
    tex.offset.set(0, 0)
    return
  }
  if (texAspect > boxAspect) {
    // تصویر پهن‌تر از جعبه است → ارتفاع کامل، از عرض بریده می‌شود
    const k = boxAspect / texAspect
    tex.repeat.set(k, 1)
    tex.offset.set((1 - k) / 2, 0)
  } else {
    // تصویر بلندتر از جعبه است → عرض کامل، از ارتفاع بریده می‌شود
    const k = texAspect / boxAspect
    tex.repeat.set(1, k)
    tex.offset.set(0, (1 - k) / 2)
  }
}

/** گرادیانِ نرمِ آبی-صورتی برای وقتی پوستر در کار نیست (یا بارگذاری نشد) */
function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 144
  const g = c.getContext('2d')
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, c.height)
    grad.addColorStop(0, '#2a2350')
    grad.addColorStop(0.55, '#5b3a72')
    grad.addColorStop(1, '#1a1430')
    g.fillStyle = grad
    g.fillRect(0, 0, c.width, c.height)
    // یک هاله‌ی روشنِ مرکزی تا «روشن بودنِ» پرده خوانده شود
    const halo = g.createRadialGradient(c.width / 2, c.height * 0.45, 8, c.width / 2, c.height * 0.45, c.width * 0.6)
    halo.addColorStop(0, 'rgba(255,225,240,0.55)')
    halo.addColorStop(1, 'rgba(255,225,240,0)')
    g.fillStyle = halo
    g.fillRect(0, 0, c.width, c.height)
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export function createCinemaScene(
  input: SceneFactoryInput,
  getProps: () => CinemaSceneProps,
): SceneApi {
  // ``width``/``height`` عمداً گرفته نمی‌شوند: نسبتِ دوربین و اندازه‌ی
  // رندر را خودِ ``useThreeScene`` مدیریت می‌کند و این صحنه به پیکسلِ
  // مطلق کاری ندارد (همه‌چیز در واحدِ «عرضِ صندلی» است).
  const { scene, camera, renderer, tier } = input
  const el = renderer.domElement

  scene.fog = new THREE.Fog(0x0b0716, 26, 78)

  /* ------------------------------------------------------------ چراغ‌ها --- */
  scene.add(new THREE.AmbientLight(0x8f7fc0, 0.55))
  // نورِ اصلی از سمتِ پرده می‌آید: در سینمایِ واقعی تنها منبعِ نور همین است
  const screenLight = new THREE.DirectionalLight(0xffe6f4, 1.25)
  screenLight.position.set(0, 9, -18)
  scene.add(screenLight)
  // یک نورِ کمکیِ سرد از بالا-عقب تا صندلی‌ها کاملاً سیاه نشوند
  const fillLight = new THREE.DirectionalLight(0x7aa8ff, 0.42)
  fillLight.position.set(0, 20, 22)
  scene.add(fillLight)

  /* -------------------------------------------------------------- پرده --- */
  const screenMat = new THREE.MeshBasicMaterial({ toneMapped: false })
  screenMat.map = makeGlowTexture()
  const screenGeo = new THREE.PlaneGeometry(SCREEN_W, SCREEN_H)
  const screen = new THREE.Mesh(screenGeo, screenMat)
  screen.position.set(0, SCREEN_H / 2 + 2.4, -24)
  scene.add(screen)

  // قابِ سیاهِ دورِ پرده — بدونِ آن پرده «برچسبِ چسبیده به هوا» دیده می‌شود
  const frameGeo = new THREE.PlaneGeometry(SCREEN_W + 2.4, SCREEN_H + 2.4)
  const frameMat = new THREE.MeshBasicMaterial({ color: 0x07050e })
  const frame = new THREE.Mesh(frameGeo, frameMat)
  frame.position.set(0, screen.position.y, screen.position.z - 0.15)
  scene.add(frame)

  // هاله‌ی نورانیِ پشتِ پرده (نشتِ نور به دیوار) — یک صفحه‌ی بزرگ‌تر با
  // additive blending. بدونِ این، صحنه «تخت» و بی‌اتمسفر می‌شود.
  const haloGeo = new THREE.PlaneGeometry(SCREEN_W * 2.1, SCREEN_H * 2.3)
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xff9ed4,
    transparent: true,
    opacity: 0.16,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  halo.position.set(0, screen.position.y, screen.position.z - 0.3)
  scene.add(halo)

  /* --------------------------------------------------------------- کف --- */
  const floorGeo = new THREE.PlaneGeometry(120, 120)
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x17102a, roughness: 0.92, metalness: 0.04 })
  const floor = new THREE.Mesh(floorGeo, floorMat)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = 0
  scene.add(floor)

  /* ---------------------------------------------------------- صندلی‌ها --- */
  // یک InstancedMesh برای همه‌ی نشیمن‌ها و یکی برای همه‌ی پشتی‌ها.
  // ⚠️ چرا دو mesh و نه یکی: نشیمن و پشتی ابعاد و جای متفاوتی دارند و با
  //    یک geometry واحد یا باید کشیده می‌شدند (دفرمه) یا ۴۲ geometry
  //    جدا ساخته می‌شد (۴۲ draw call).
  const cushionGeo = new THREE.BoxGeometry(2.3, 0.7, 2.1)
  const backGeo = new THREE.BoxGeometry(2.3, 2.5, 0.6)
  // ⚠️ سادگیِ عمدی: هر دو material **یکسان** نگه داشته شده‌اند تا اگر یکی
  //    از بین رفت، dispose سراسریِ useThreeScene هر دو را پاک کند.
  const velvet = new THREE.MeshStandardMaterial({ color: 0x8e2450, roughness: 0.78, metalness: 0.06 })
  const cushions = new THREE.InstancedMesh(cushionGeo, velvet, ROWS * SEATS_PER_ROW)
  const backs = new THREE.InstancedMesh(backGeo, velvet, ROWS * SEATS_PER_ROW)

  const dummy = new THREE.Object3D()
  let idx = 0
  for (let r = 0; r < ROWS; r++) {
    // هر ردیف هم عقب‌تر است هم کمی بالاتر (کفِ شیب‌دارِ سالنِ واقعی)
    const z = 2 + r * 6.2
    const y = 0.55 + r * 0.55
    for (let s = 0; s < SEATS_PER_ROW; s++) {
      const x = (s - (SEATS_PER_ROW - 1) / 2) * 2.9
      dummy.position.set(x, y, z)
      // صندلی‌های کناری کمی به سمتِ مرکزِ پرده می‌چرخند، مثلِ سالنِ واقعی
      dummy.rotation.set(0, -x * 0.035, 0)
      dummy.updateMatrix()
      cushions.setMatrixAt(idx, dummy.matrix)
      dummy.position.set(x, y + 1.55, z + 0.85)
      dummy.updateMatrix()
      backs.setMatrixAt(idx, dummy.matrix)
      idx++
    }
  }
  cushions.instanceMatrix.needsUpdate = true
  backs.instanceMatrix.needsUpdate = true
  scene.add(cushions, backs)

  /* ------------------------------------------- مخروطِ نورِ پروژکتور --- */
  const beamLen = 46
  const beamGeo = new THREE.ConeGeometry(5.6, beamLen, 26, 1, true)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff0d0,
    transparent: true,
    opacity: 0.055,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  })
  const beam = new THREE.Mesh(beamGeo, beamMat)
  // مخروط به‌طورِ پیش‌فرض نوکش رو به بالا (‎+y) است؛ باید نوکش به پرده باشد
  const beamFrom = new THREE.Vector3(0, 15.5, 24)
  const beamTo = new THREE.Vector3(0, screen.position.y, screen.position.z)
  beam.position.copy(beamFrom).lerp(beamTo, 0.5)
  // ``lookAt`` برای یک Object3D معمولی محورِ ‎+Z را به سمتِ هدف می‌چرخاند
  // (برای دوربین برعکس است). محورِ مخروط در هندسه‌ی three همیشه ‎+Y است و
  // **نوکش** در ‎+y/2 نشسته. پس باید ‎+Y را روی ‎-Z بیندازیم تا نوکِ
  // مخروط سمتِ پروژکتور بماند و قاعده‌ی پهن سمتِ پرده — یعنی
  // ``rotateX(-90°)``. با ``+90°`` مخروط وارونه می‌شد و نور از پرده به
  // سمتِ تماشاچی واگرا می‌شد.
  beam.lookAt(beamTo)
  beam.rotateX(-Math.PI / 2)
  scene.add(beam)

  /* ------------------------------------------------------- غبارِ معلق --- */
  const moteCount = tier === 'dream' ? 300 : 150
  const moteGeo = new THREE.BufferGeometry()
  const motePos = new Float32Array(moteCount * 3)
  const moteSpeed = new Float32Array(moteCount)
  for (let i = 0; i < moteCount; i++) {
    // فقط داخلِ حجمِ مخروطِ نور: غبارِ بیرون از نور دیده نمی‌شود، پس
    // ساختنشان هزینه‌ی بی‌فایده است.
    const t = Math.random()
    const radius = 0.4 + t * 5.2
    const a = Math.random() * Math.PI * 2
    const p = new THREE.Vector3().copy(beamFrom).lerp(beamTo, t)
    motePos[i * 3] = p.x + Math.cos(a) * radius
    motePos[i * 3 + 1] = p.y + Math.sin(a) * radius * 0.55
    motePos[i * 3 + 2] = p.z + (Math.random() - 0.5) * radius
    moteSpeed[i] = 0.15 + Math.random() * 0.45
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3))
  const moteMat = new THREE.PointsMaterial({
    color: 0xfff2d8,
    size: 0.13,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
  const motes = new THREE.Points(moteGeo, moteMat)
  scene.add(motes)

  /* ------------------------------------------------------------ دوربین --- */
  const camHome = new THREE.Vector3(0, 9.4, 30)
  const lookHome = new THREE.Vector3(0, 7.2, -14)
  camera.position.copy(camHome)
  camera.fov = 46
  camera.near = 0.5
  camera.far = 220
  camera.updateProjectionMatrix()
  camera.lookAt(lookHome)

  /* --------------------------------------------- چرخشِ دستی (drag) --- */
  // ⚠️ عمداً OrbitControls نیست: آن کتابخانه یک listenerِ سراسری و یک
  //    حلقه‌ی damping جدا اضافه می‌کند و برای «کمی تکان خوردن» زیاد است.
  let dragX = 0
  let dragY = 0
  let targetX = 0
  let targetY = 0
  let dragging = false
  let lastX = 0
  let lastY = 0

  const onDown = (e: PointerEvent) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    el.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    // ⚠️ عمداً از ``movementX`` استفاده **نشد**: روی pointerِ لمسی در بعضی
    //    مرورگرها صفر یا تعریف‌نشده است. تفاوتِ clientX بین دو رویداد روی
    //    همه‌ی دستگاه‌ها یکسان کار می‌کند.
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    targetX = Math.max(-1, Math.min(1, targetX + dx / (r.width * 0.6)))
    targetY = Math.max(-1, Math.min(1, targetY + dy / (r.height * 0.6)))
  }
  const onUp = () => {
    dragging = false
  }
  // ``touch-action: pan-y`` عمداً ``none`` نیست: این canvas داخلِ یک اپِ
  // اسکرول‌شدنی نشسته و اگر لمس را کامل می‌گرفت، کاربر دیگر نمی‌توانست در
  // سینما اسکرول کند (scroll-jacking). با ``pan-y`` اسکرولِ عمودی به صفحه
  // می‌رسد و فقط کشیدنِ افقی صحنه را می‌چرخاند.
  el.style.touchAction = 'pan-y'
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)

  /* ------------------------------------------------ بارگذاریِ پوستر --- */
  let currentPoster: string | null = null
  let baseTex: THREE.Texture | null = screenMat.map
  let posterTex: THREE.Texture | null = null
  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')

  const applyPoster = (url: string | null) => {
    currentPoster = url
    if (!url) {
      if (posterTex) {
        posterTex.dispose()
        posterTex = null
      }
      screenMat.map = baseTex
      screenMat.needsUpdate = true
      return
    }
    loader.load(
      url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace
        const img = tex.image as { width?: number; height?: number } | undefined
        const aspect = img?.width && img?.height ? img.width / img.height : 2 / 3
        fitTexture(tex, aspect, SCREEN_W / SCREEN_H)
        posterTex?.dispose()
        posterTex = tex
        screenMat.map = tex
        screenMat.needsUpdate = true
      },
      undefined,
      () => {
        // پوستر بارگذاری نشد (CORS، ۴۰۴، ...) → پرده با همان گرادیانِ
        // نورانی می‌ماند. **هرگز** صحنه خراب یا سیاه نمی‌شود.
        currentPoster = url
      },
    )
  }

  return {
    update(dt, elapsed) {
      // پوستر را فقط وقتی عوض شده از نو بارگذاری می‌کنیم (مقایسه‌ی رشته،
      // عملاً رایگان) تا هر فریم یک درخواستِ شبکه نرود.
      const want = getProps().posterUrl
      if (want !== currentPoster) applyPoster(want)

      // نرم‌شدنِ چرخش: بدونِ این، رهاکردنِ drag یک پرشِ ناگهانی داشت
      dragX += (targetX - dragX) * Math.min(1, dt * 6)
      dragY += (targetY - dragY) * Math.min(1, dt * 6)
      if (!dragging) {
        targetX *= 1 - Math.min(1, dt * 0.9)
        targetY *= 1 - Math.min(1, dt * 0.9)
      }

      // «نفس‌کشیدن» آرامِ دوربین — حتی وقتی کاربر هیچ کاری نمی‌کند صحنه
      // زنده می‌ماند، ولی آن‌قدر آرام که حواس را پرت نکند.
      const breathe = Math.sin(elapsed * 0.28) * 0.55
      camera.position.x = camHome.x + dragX * 5.2 + Math.sin(elapsed * 0.17) * 0.5
      camera.position.y = camHome.y + -dragY * 2.4 + breathe * 0.35
      camera.position.z = camHome.z + breathe
      camera.lookAt(lookHome.x + dragX * 2.6, lookHome.y - dragY * 1.4, lookHome.z)

      // پرده کمی «سوسو» می‌کند، مثلِ نورِ واقعیِ پروژکتور
      const flick = 1 + Math.sin(elapsed * 7.3) * 0.012 + Math.sin(elapsed * 2.1) * 0.02
      haloMat.opacity = 0.16 * flick
      screenLight.intensity = 1.25 * flick

      // غبار آرام بالا می‌رود و وقتی از سرِ مخروط بیرون زد از پایین برمی‌گردد
      const arr = moteGeo.attributes.position.array as Float32Array
      for (let i = 0; i < moteCount; i++) {
        arr[i * 3 + 1] += moteSpeed[i] * dt * 0.55
        arr[i * 3] += Math.sin(elapsed * 0.6 + i) * dt * 0.06
        if (arr[i * 3 + 1] > beamFrom.y + 2) {
          arr[i * 3 + 1] = beamTo.y - 1
        }
      }
      moteGeo.attributes.position.needsUpdate = true

    },

    dispose() {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      // بافت‌ها را **خودمان** آزاد می‌کنیم: پیمایشِ scene.traverse در
      // useThreeScene فقط materialها را می‌بیند و ``map`` فعلی را آزاد
      // می‌کند، ولی اگر پوستر عوض شده باشد بافتِ قبلی دیگر به material وصل
      // نیست و تنها از همین‌جا قابلِ آزادسازی است.
      posterTex?.dispose()
      baseTex?.dispose()
      screenMat.map = null
    },
  }
}
