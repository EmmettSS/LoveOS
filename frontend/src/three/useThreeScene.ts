/**
 * useThreeScene.ts — مدیرِ چرخه‌ی حیاتِ صحنه‌های WebGL
 *
 * این هوک تنها جایی است که در کلِ LoveOS یک ``WebGLRenderer`` ساخته می‌شود.
 * عمداً همه‌ی صحنه‌ها از همین یک نقطه رد می‌شوند، چون سه مشکلِ WebGL در
 * مرورگر هست که اگر هر صحنه جداگانه حلشان کند، قطعاً یک‌جا فراموش می‌شود:
 *
 * --------------------------------------------------------------------------
 * ۱) سهمیه‌ی محدودِ context
 * --------------------------------------------------------------------------
 * مرورگرها تعدادِ contextِ WebGL زنده را محدود می‌کنند (Chrome ~۱۶،
 * **iOS Safari بسیار سخت‌گیرتر، حدود ۸**) و وقتی از سقف رد شود،
 * **قدیمی‌ترین** context را بی‌صدا می‌کُشند. روی دسکتاپِ LoveOS چند پنجره
 * هم‌زمان باز می‌مانند: ستاره‌ها + ضربان + بغل + باغچه + نقشه. اگر هرکدام
 * rendererِ خودشان را داشته باشند و درست آزاد نشوند، نقشه (که maplibre هم
 * یک context دارد) ناگهان سفید می‌شود و کاربر هیچ سرنخی ندارد چرا.
 *
 * راه‌حل: یک **سقفِ سراسریِ نرم** (``MAX_LIVE_SCENES``). اگر سقف پر باشد،
 * صحنه‌ی تازه اصلاً ساخته نمی‌شود و اپ به نسخه‌ی CSS-سه‌بعدیِ لایه‌ی «بلور»
 * می‌افتد — یعنی تنزلِ باوقار به‌جایِ صفحه‌ی سفید.
 *
 * --------------------------------------------------------------------------
 * ۲) نشتیِ حافظه‌ی GPU
 * --------------------------------------------------------------------------
 * ``renderer.dispose()`` به‌تنهایی کافی نیست. هر geometry، material و
 * texture باید جداگانه آزاد شود وگرنه حافظه‌ی GPU در طولِ نشست تلنبار
 * می‌شود (باز/بستنِ مکررِ یک اپ = هر بار یک نشتی). این‌جا پیمایشِ کامل
 * scene انجام می‌شود.
 *
 * --------------------------------------------------------------------------
 * ۳) حلقه‌ی rAF در تبِ پنهان
 * --------------------------------------------------------------------------
 * اگر تب پنهان شود و حلقه ادامه یابد، باتری و CPU بی‌دلیل مصرف می‌شود.
 * و اگر پنجره‌ی اپ minimize شود هم همین‌طور.
 */
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

import { atLeast, normalizeChoice, probeCapability, resolveTier } from '../shared/quality'
import type { QualityTier } from '../shared/quality'
import { getStoredSettings } from '../shared/prefs'

/** سقفِ سراسریِ صحنه‌های WebGL زنده. عدد عمداً کوچک است (توضیح بالا). */
export const MAX_LIVE_SCENES = 2

let liveScenes = 0

/** برای اشکال‌زدایی/تست: چند صحنه الان زنده است؟ */
export function liveSceneCount(): number {
  return liveScenes
}

export interface SceneApi {
  /** هر فریم صدا زده می‌شود؛ ``dt`` بر حسبِ ثانیه است */
  update: (dt: number, elapsed: number) => void
  /** هنگامِ تغییرِ اندازه */
  resize?: (w: number, h: number) => void
  /** آزادسازیِ منابعِ اختصاصیِ خودِ صحنه (قبل از dispose سراسری صدا زده می‌شود) */
  dispose?: () => void
}

export interface SceneFactoryInput {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  width: number
  height: number
  /** لایه‌ی کیفیت؛ صحنه می‌تواند بر اساسِ آن تعدادِ ذره‌ها را کم و زیاد کند */
  tier: QualityTier
  /** سقفِ نسبتِ پیکسلِ مجاز (از قبل بر اساسِ لایه و DPR محدود شده) */
  pixelRatio: number
}

export interface UseThreeSceneOptions {
  /** فقط در این لایه ساخته شود (پیش‌فرض: dream) */
  minTier?: QualityTier
  /** ساختِ صحنه؛ اگر ``null`` برگرداند، صحنه‌ای ساخته نمی‌شود */
  factory: (input: SceneFactoryInput) => SceneApi | null
  /** به‌جایِ ساختِ صحنه، این fallback رندر/فعال می‌ماند */
  onUnavailable?: (reason: 'tier' | 'budget' | 'no-webgl' | 'context-lost') => void
  /** حداکثر نسبتِ پیکسل؛ در کهکشان ۲ و در غیرِ آن کمتر */
  maxPixelRatio?: number
}

/**
 * سقفِ نسبتِ پیکسل بر اساسِ لایه و DPR دستگاه.
 *
 * چرا محدود کردنِ DPR مهم است: یک گوشیِ dpr=3 با یک canvas تمام‌صفحه یعنی
 * ۹ برابرِ پیکسلِ یک canvas با dpr=1. سه‌برابر‌کردنِ DPR از ۱ به ۲ هزینه‌ی
 * پیکسل را ۴ برابر می‌کند. برای یک آسمانِ ستاره (که عمدتاً نقطه‌های ریزِ
 * درخشان است) تفاوتِ بصریِ dpr=2 و dpr=3 عملاً نامرئی است ولی تفاوتِ
 * پرفورمنس عظیم است.
 */
export function pixelRatioFor(tier: QualityTier, max: number): number {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const cap = tier === 'dream' ? max : 1.5
  return Math.min(dpr, cap)
}

/**
 * یک صحنه‌ی three.js را به یک ``<canvas>`` وصل می‌کند و کامل مدیریتش می‌کند.
 *
 * @returns ``true`` اگر صحنه فعال است، ``false`` اگر به هر دلیلی ساخته نشد.
 *          مصرف‌کننده با این مقدار، fallbackِ لایه‌ی بلور را نشان می‌دهد.
 */
export function useThreeScene(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  opts: UseThreeSceneOptions,
  deps: unknown[] = [],
): void {
  const minTier = opts.minTier ?? 'dream'
  const factoryRef = useRef(opts.factory)
  factoryRef.current = opts.factory
  const onUnavailableRef = useRef(opts.onUnavailable)
  onUnavailableRef.current = opts.onUnavailable

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const report = probeCapability()
    const choice = normalizeChoice(getStoredSettings().ui_quality ?? 'auto')
    const decision = resolveTier(choice, report, null)
    if (report.webgl === 0) {
      onUnavailableRef.current?.('no-webgl')
      return
    }
    if (!atLeast(decision.tier, minTier)) {
      onUnavailableRef.current?.('tier')
      return
    }
    const activeTier: QualityTier = decision.tier
    // سقفِ سراسری پر است → بی‌صدا به fallback برگرد، چون ساختنِ یک context
    // اضافه ممکن است contextِ نقشه را بکُشد.
    if (liveScenes >= MAX_LIVE_SCENES) {
      onUnavailableRef.current?.('budget')
      return
    }

    let renderer: THREE.WebGLRenderer | null = null
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: report.dpr < 2, // در DPR بالا آنتی‌الیاس خودِ پیکسل‌ها کافی است
        alpha: true,
        // ``powerPreference`` روی گوشی‌های دو‌GPU انتخاب می‌کند؛ برای یک صحنه‌ی
        // کوچکِ تزئینی، GPU کم‌مصرف بهتر است (باتری و حرارت).
        powerPreference: 'low-power',
        // depth لازم است چون ستاره‌ها در عمق‌های مختلف‌اند
        depth: true,
        stencil: false,
      })
    } catch {
      onUnavailableRef.current?.('no-webgl')
      return
    }

    liveScenes += 1

    const scene = new THREE.Scene()
    const rect = canvas.getBoundingClientRect()
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 400)
    camera.position.set(0, 0, 26)

    const pixelRatio = pixelRatioFor(activeTier, opts.maxPixelRatio ?? 2)
    renderer.setPixelRatio(pixelRatio)
    renderer.setSize(width, height, false)
    renderer.setClearColor(0x000000, 0)

    let api: SceneApi | null = null
    try {
      api = factoryRef.current({ scene, camera, renderer, width, height, tier: activeTier, pixelRatio })
    } catch {
      api = null
    }
    if (!api) {
      liveScenes -= 1
      disposeRenderer(renderer, scene)
      onUnavailableRef.current?.('no-webgl')
      return
    }

    /* ------------------------------------------------------- حلقه‌ی رندر --- */
    let rafId = 0
    let last = performance.now()
    let startedAt = last
    let running = true
    let lost = false

    const onContextLost = (e: Event) => {
      // مرورگر context را پس گرفته (معمولاً به‌خاطرِ عبور از سقف). باید
      // جلوی رندرِ بعدی را بگیریم وگرنه هزاران خطا در کنسول می‌ریزد.
      e.preventDefault()
      lost = true
      running = false
      window.cancelAnimationFrame(rafId)
      onUnavailableRef.current?.('context-lost')
    }
    const onContextRestored = () => {
      lost = false
      running = true
      last = performance.now()
      rafId = window.requestAnimationFrame(frame)
    }
    canvas.addEventListener('webglcontextlost', onContextLost, false)
    canvas.addEventListener('webglcontextrestored', onContextRestored, false)

    const frame = (now: number) => {
      if (!running) return
      rafId = window.requestAnimationFrame(frame)
      // dt را محدود می‌کنیم: اگر تب چند ثانیه پنهان بوده و برگردد، یک dt
      // بزرگ باعث می‌شود ذره‌ها یک‌دفعه کیلومترها جابه‌جا شوند و صحنه
      // «منفجر» دیده شود.
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const elapsed = (now - startedAt) / 1000
      try {
        api?.update(dt, elapsed)
        renderer?.render(scene, camera)
      } catch {
        // یک خطایِ گذرایِ driver نباید کلِ اپ را بیندازد
        running = false
      }
    }

    const onVisibility = () => {
      if (document.hidden) {
        running = false
        window.cancelAnimationFrame(rafId)
      } else if (!lost) {
        running = true
        last = performance.now()
        rafId = window.requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    /* ---------------------------------------------------- تغییرِ اندازه --- */
    let resizeRaf = 0
    const doResize = () => {
      const r = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(r.width))
      const h = Math.max(1, Math.round(r.height))
      if (!renderer) return
      renderer.setPixelRatio(pixelRatioFor(activeTier, opts.maxPixelRatio ?? 2))
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      api?.resize?.(w, h)
    }
    const observer =
      typeof ResizeObserver === 'function'
        ? new ResizeObserver(() => {
            // تغییرِ اندازه پشتِ سرِ هم می‌آید (درگِ پنجره)؛ بدونِ این
            // همگام‌سازی، هر پیکسلِ درگ یک setSize و یک به‌روزرسانیِ
            // projectionmatrix می‌شد.
            if (resizeRaf) return
            resizeRaf = window.requestAnimationFrame(() => {
              resizeRaf = 0
              doResize()
            })
          })
        : null
    if (observer) observer.observe(canvas)
    else window.addEventListener('resize', doResize)

    if (!document.hidden) rafId = window.requestAnimationFrame(frame)

    /* ------------------------------------------------------- آزادسازی --- */
    return () => {
      running = false
      window.cancelAnimationFrame(rafId)
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf)
      document.removeEventListener('visibilitychange', onVisibility)
      canvas.removeEventListener('webglcontextlost', onContextLost)
      canvas.removeEventListener('webglcontextrestored', onContextRestored)
      if (observer) observer.disconnect()
      else window.removeEventListener('resize', doResize)

      try {
        api?.dispose?.()
      } catch {
        /* ignore */
      }
      liveScenes = Math.max(0, liveScenes - 1)
      disposeRenderer(renderer, scene)
      renderer = null
      api = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minTier, ...deps])
}

/**
 * آزادسازیِ کامل: geometry و material و textureِ همه‌ی اجزای صحنه، بعد خودِ
 * renderer. بدونِ این، هر بار باز/بستنِ یک اپ مقداری حافظه‌ی GPU نشت می‌کند.
 */
function disposeRenderer(renderer: THREE.WebGLRenderer | null, scene: THREE.Scene): void {
  try {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (mesh.geometry) mesh.geometry.dispose()
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(mat)) {
        for (const m of mat) disposeMaterial(m)
      } else if (mat) {
        disposeMaterial(mat)
      }
    })
    scene.clear()
  } catch {
    /* ignore */
  }
  if (!renderer) return
  try {
    renderer.dispose()
    // آزادسازیِ قطعیِ context تا سهمیه‌ی مرورگر فوراً برگردد. این همان
    // چیزی است که جلوی کشته‌شدنِ contextِ نقشه را می‌گیرد.
    renderer.forceContextLoss?.()
  } catch {
    /* ignore */
  }
}

function disposeMaterial(m: THREE.Material): void {
  // textureها را هم آزاد می‌کنیم؛ یک material می‌تواند چند texture داشته
  // باشد و همه‌شان کلید‌های متفاوتی دارند.
  for (const value of Object.values(m)) {
    if (value && value instanceof THREE.Texture) value.dispose()
  }
  m.dispose()
}
