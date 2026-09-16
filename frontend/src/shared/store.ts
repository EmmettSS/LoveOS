/**
 * store.ts — وضعیت سراسری LoveOS (Zustand)
 * مراحل سیستم: boot → lock → desktop
 *
 * نکته‌های مهم درباره‌ی پنجره‌ها:
 *  • مختصات هر پنجره فقط یک بار در لحظه‌ی باز شدن تعیین می‌شود (شیب آبشاری slide)
 *    و هیچ‌وقت با فوکوس/کلیک عوض نمی‌شود؛ وگرنه پنجره از زیر انگشت کاربر می‌پرد
 *    و دکمه‌های بستن/مینیمایز کلیک نمی‌خورند.
 *  • z فقط ترتیب لایه‌ها را می‌گوید و روی wrapper پنجره اعمال می‌شود.
 *  • اگر پنجره‌ای از قبل بالاترین لایه باشد، دوباره به بالا برده نمی‌شود.
 */
import { create } from 'zustand'
import { get as apiGet, post, tokenStore } from './api'
import {
  clearDowngradeMemory,
  createFpsWatchdog,
  lowerTier,
  measureFpsCached,
  normalizeChoice,
  probeCapability,
  resolveTier,
  writeDowngradeMemory,
  type CapabilityReport,
  type QualityChoice,
  type QualityTier,
} from './quality'

export type Phase = 'boot' | 'lock' | 'desktop'
export type Theme = 'auto' | 'day' | 'night'

export interface Config {
  daughter_name: string
  daughter_nickname: string
  daddy_name: string
  days_together: number
  next_meeting: string | null
  next_meeting_delta: { days: number; hours: number } | null
  boot_greeting: string
  wrong_pass_message: string
  lock_help_message: string
  security_question: string
  language: 'fa' | 'en'
  theme: Theme
  sound_enabled: boolean
  font_scale: number
  /** لایه‌ی کیفیتِ سه‌بعدی: auto یعنی خودِ دستگاه تصمیم می‌گیرد */
  ui_quality?: QualityChoice
  logo: string | null
  boot_background: string | null
  lock_background: string | null
  desktop_background_day: string | null
  desktop_background_night: string | null
  is_birthday: boolean
  is_anniversary: boolean
  has_passcode: boolean
  today_message?: string
  about_text?: string
  daddy_city?: string
  daughter_city?: string
  allow_daughter_music_upload?: boolean
  vault_open?: boolean
  birthday?: string | null
  anniversary?: string | null
  /** موقعیت زنده‌ی دخترم (اگر دستگاهش اجازه داده باشد) */
  live_location?: LiveLocation | null
}

export interface LiveLocation {
  lat: number
  lng: number
  accuracy: number | null
  city: string
  timezone: string
  source: 'device' | 'config'
  captured_at: string
  is_live: boolean
}

export interface WindowState {
  id: string
  app: string
  z: number
  minimized: boolean
  props?: Record<string, unknown>
  /** مختصات پیکسلی پنجره‌ی دسکتاپ، نسبت به گوشه‌ی بالا-چپ ناحیه‌ی دسکتاپ */
  x?: number
  y?: number
  /** اندازه‌ی دستی پنجره (اگر کاربر تغییر داده باشد) */
  w?: number
  h?: number
}

const APP_ORDER_KEY = 'loveos_app_order_v1'

function readAppOrder(): string[] | null {
  try {
    const raw = localStorage.getItem(APP_ORDER_KEY)
    if (!raw) return null
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr.filter((x) => typeof x === 'string') : null
  } catch {
    return null
  }
}

interface OSState {
  phase: Phase
  config: Config | null
  unreadCount: number
  windows: WindowState[]
  topZ: number
  startMenuOpen: boolean
  notificationsOpen: boolean
  commandOpen: boolean
  eggOverlay: null | { title: string; message: string; attachment?: string | null; kind?: string }
  toast: null | { text: string; tone?: 'love' | 'info' }
  nightOverride: boolean | null
  /** ترتیب سفارشی آیکن‌های دسکتاپ (درگ‌اند‌دراپ) */
  appOrder: string[] | null
  setAppOrder: (order: string[]) => void
  resetAppOrder: () => void

  /* ------------------------------------------- لایه‌ی کیفیتِ سه‌بعدی --- */
  /** انتخابِ کاربر: auto یا یکی از سه لایه */
  uiQualityChoice: QualityChoice
  /** لایه‌ی **مؤثر** (پس از سنجه‌ی توان و وتوها) — این همان چیزی است که UI می‌خواند */
  uiQuality: QualityTier
  /** سنجه‌ی توان دستگاه (برای نمایشِ «چرا این لایه») */
  qualityReport: CapabilityReport | null
  /** دلیل‌های انسانیِ تصمیم */
  qualityReasons: string[]
  /** آخرین فریمِ اندازه‌گیری‌شده */
  qualityFps: number | null
  /** آیا اندازه‌گیری/تنزل خودکار اتفاق افتاده (برای پیامِ ملایم) */
  qualityAutoDowngraded: boolean
  /** سنجه‌ی توان + سنجش فریم + تعیین لایه + شروع واچ‌داگ */
  initQuality: (choice?: QualityChoice, force?: boolean) => Promise<void>
  /** کاربر لایه را دستی عوض کرد */
  setQualityChoice: (choice: QualityChoice) => Promise<void>
  /** واچ‌داگ فهمید لایه در عمل سنگین است → یک پله پایین‌تر */
  downgradeQuality: (fps: number) => void

  bootstrap: () => Promise<void>
  setPhase: (p: Phase) => void
  setConfig: (c: Config) => void
  patchConfig: (partial: Partial<Config>) => void
  unlock: (token: string) => Promise<void>
  logout: () => Promise<void>
  openApp: (app: string, props?: Record<string, unknown>) => void
  closeApp: (id: string) => void
  closeAppByKey: (app: string) => void
  focusApp: (id: string) => void
  minimizeApp: (id: string, v: boolean) => void
  toggleStartMenu: (v?: boolean) => void
  toggleNotifications: (v?: boolean) => void
  toggleCommand: (v?: boolean) => void
  setUnread: (n: number) => void
  showEgg: (e: OSState['eggOverlay']) => void
  showToast: (text: string, tone?: 'love' | 'info') => void
  saveWindowGeometry: (id: string, geom: { x?: number; y?: number; w?: number; h?: number }) => void
}

let windowSeq = 0

/** آخرین موقعیت/اندازه‌ی هر اپ؛ تا پنجره دوباره همان‌جا که بود باز شود. */
const geometryMemory: Record<string, { x?: number; y?: number; w?: number; h?: number }> = {}

const CASCADE_STEP_X = 26
const CASCADE_STEP_Y = 22
const CASCADE_SLOTS = 5

/* -------------------------------------------------- لایه‌ی کیفیتِ UI --- */

/**
 * لایه‌ی مؤثر را روی ``<html>`` می‌نویسد.
 *
 * چرا روی html و نه روی یک context ری‌اکت:
 *   چون عمده‌ی کارِ لایه‌ها در **CSS** انجام می‌شود (``html[data-quality=...]``).
 *   این‌طور ۳۰ اپ بدونِ این‌که حتی یک خط کدشان عوض شود، لایه‌ی درست را
 *   می‌گیرند — همان الگویی که ``data-theme`` برای روز/شب استفاده می‌کند.
 *   ری‌اکت فقط جاهایی که واقعاً شاخه‌ی منطقی لازم است (مثلاً «صحنه‌ی WebGL
 *   بسازم یا نه») از store می‌خواند.
 */
function applyQualityAttr(tier: QualityTier): void {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  if (el.dataset.quality === tier) return // رندرِ بیهوده‌ی CSS جلوگیری شود
  el.dataset.quality = tier
}

/**
 * تا «لحظه‌ی آرامِ» مرورگر صبر می‌کند.
 *
 * ``requestIdleCallback`` دقیقاً همان چیزی است که لازم داریم (صبر تا وقتی
 * کارِ فوریِ رندر تمام شود) ولی در Safari وجود ندارد؛ پس یک fallback زمانی
 * داریم. تایم‌اوتِ ``requestIdleCallback`` هم می‌گذاریم تا اگر مرورگر هیچ‌وقت
 * بیکار نشد، برای همیشه منتظر نمانیم و سنجشِ فریم هرگز انجام نشود.
 */
function nextIdleMoment(maxWaitMs = 1200): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve()
      return
    }
    const ric = (window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }).requestIdleCallback
    if (typeof ric === 'function') {
      ric(() => resolve(), { timeout: maxWaitMs })
      return
    }
    window.setTimeout(resolve, maxWaitMs)
  })
}

/**
 * واچ‌داگِ فریم را متناسب با لایه‌ی فعلی (باز)راه‌اندازی می‌کند.
 *
 * فقط در کهکشان فعال است: در مهتاب و بلور هیچ WebGL‌ای در کار نیست، پس چیزی
 * برای تنزل دادن وجود ندارد و خودِ حلقه‌ی rAF هزینه‌ی بی‌دلیل است.
 */
let watchdog: { stop: () => void } | null = null

function restartWatchdog(tier: QualityTier): void {
  watchdog?.stop()
  watchdog = null
  if (tier !== 'dream') return
  if (typeof window === 'undefined') return
  watchdog = createFpsWatchdog({
    onSample: (fps) => {
      // فقط عدد را تازه می‌کنیم؛ لایه را دست نمی‌زنیم
      useOS.setState((s) => (s.qualityFps === fps ? s : { qualityFps: fps }))
    },
    onDowngrade: (_from, _to, fps) => {
      useOS.getState().downgradeQuality(fps)
    },
  })
}

export const useOS = create<OSState>((set, get) => ({
  phase: 'boot',
  config: null,
  unreadCount: 0,
  windows: [],
  topZ: 10,
  startMenuOpen: false,
  notificationsOpen: false,
  commandOpen: false,
  eggOverlay: null,
  toast: null,
  nightOverride: null,
  appOrder: readAppOrder(),

  setAppOrder: (order) => {
    try {
      localStorage.setItem(APP_ORDER_KEY, JSON.stringify(order))
    } catch {
      /* حافظه‌ی دستگاه پر است — فقط در حافظه‌ی نشست می‌ماند */
    }
    set({ appOrder: order })
  },

  resetAppOrder: () => {
    try {
      localStorage.removeItem(APP_ORDER_KEY)
    } catch {
      /* ignore */
    }
    set({ appOrder: null })
  },

  /* ---------------------------------------------- لایه‌ی کیفیتِ سه‌بعدی --- */

  uiQualityChoice: 'auto',
  uiQuality: 'lite',
  qualityReport: null,
  qualityReasons: [],
  qualityFps: null,
  qualityAutoDowngraded: false,

  initQuality: async (choice, force = false) => {
    const cfgChoice = normalizeChoice(choice ?? get().config?.ui_quality ?? 'auto')
    const report = probeCapability()

    // سنجه‌ی فریم فقط وقتی به دردِ تصمیم می‌خورد که حالتِ «خودکار» باشد و
    // وتویی لایه را از قبل به مهتاب نرسانده باشد. در غیرِ این صورت سنجش
    // یعنی ۶۵۰ms اتلافِ وقتِ خالص.
    const needsFps =
      cfgChoice === 'auto' &&
      !report.isTestEnv &&
      !report.reducedMotion &&
      report.webgl > 0 &&
      !report.softwareRenderer

    /* --- مرحله‌ی ۱: بی‌درنگ و بدونِ انتظار، با امتیازِ ایستا --- */
    // چرا بی‌درنگ: صفحه‌ی بوت و قفل هم سه‌بعدی رندر می‌شوند و باید همین حالا
    // بدانند روی کدام لایه‌اند. اگر منتظرِ سنجشِ فریم بمانیم، اول مهتاب
    // رندر می‌شود و بعد پوسته عوض می‌شود → «فلشِ تغییرِ پوسته».
    const initial = resolveTier(cfgChoice, report, null)
    applyQualityAttr(initial.tier)
    set({
      uiQualityChoice: cfgChoice,
      uiQuality: initial.tier,
      qualityReport: report,
      qualityReasons: initial.reasons,
      qualityFps: null,
    })
    restartWatchdog(initial.tier)

    if (!needsFps) return

    /* --- مرحله‌ی ۲: سنجشِ فریم، ولی نه همین لحظه --- */
    // چرا با تأخیرِ «آرام»: اگر فریم را حینِ انیمیشنِ سنگینِ بوت بشماریم،
    // عددِ غلطِ **پایین** می‌گیریم و لایه را بی‌دلیل تنزل می‌دهیم. پس صبر
    // می‌کنیم تا مرورگر بیکار شود (requestIdleCallback) و اگر نبود، یک
    // تأخیرِ ساده تا پایانِ بوت.
    await nextIdleMoment()

    // ممکن است در این فاصله کاربر دستی لایه عوض کرده باشد → تصمیمِ ما
    // دیگر معتبر نیست و باید دور ریخته شود.
    if (get().uiQualityChoice !== cfgChoice) return

    const fps = await measureFpsCached(650, force)
    if (fps == null) return // اندازه‌گیری ممکن نبود؛ همان لایه‌ی ایستا می‌ماند
    if (get().uiQualityChoice !== cfgChoice) return

    const refined = resolveTier(cfgChoice, report, fps)
    applyQualityAttr(refined.tier)
    set({
      uiQuality: refined.tier,
      qualityReasons: refined.reasons,
      qualityFps: refined.fps,
    })
    restartWatchdog(refined.tier)
  },

  setQualityChoice: async (choice) => {
    const next = normalizeChoice(choice)
    // انتخابِ دستیِ کاربر باید «حافظه‌ی تنزلِ خودکار» را پاک کند؛ وگرنه
    // امتیازِ منفیِ به‌یادمانده باعث می‌شود حالتِ auto فردا دوباره پایین بیاید
    // در حالی که کاربر همین حالا صریحاً چیزِ دیگری خواسته است.
    clearDowngradeMemory()
    set({ uiQualityChoice: next, qualityAutoDowngraded: false })
    // force=true چون کاربر صریحاً خواسته تصمیمِ تازه گرفته شود؛ نباید از
    // کشِ سنجشِ فریمِ همان اولِ نشست استفاده کنیم.
    await get().initQuality(next, true)
  },

  downgradeQuality: (fps) => {
    const current = get().uiQuality
    const next = lowerTier(current)
    if (next === current) return // به مهتاب رسیده‌ایم؛ پایین‌تر نداریم
    // لایه‌ای که در عمل سنگین بود را به خاطر می‌سپاریم تا نشستِ بعد با
    // کهکشان شروع نکند و همان کندی را تکرار نکند.
    writeDowngradeMemory(current)
    applyQualityAttr(next)
    set({
      uiQuality: next,
      qualityFps: fps,
      qualityAutoDowngraded: true,
      qualityReasons: [...get().qualityReasons, `در عمل ${fps} فریم بود → به ${next} تنزل داد`],
    })
    restartWatchdog(next)
  },

  bootstrap: async () => {
    const data = await apiGet<{ config: Config; unlocked: boolean }>('/boot')
    set({ config: data.config })
    if (data.unlocked && tokenStore.get()) {
      try {
        const me = await apiGet<Config>('/me')
        set({ config: me })
      } catch {
        /* ignore */
      }
    }
  },

  setPhase: (p) => {
    const patch: Partial<OSState> = { phase: p }
    if (p !== 'desktop') {
      patch.windows = []
      patch.startMenuOpen = false
      patch.notificationsOpen = false
      patch.commandOpen = false
    }
    set(patch as OSState)
  },

  setConfig: (c) => set({ config: c }),

  /** به‌روزرسانی خوش‌بینانه‌ی بخشی از پیکربندی (برای تنظیمات محلی دستگاه) */
  patchConfig: (partial) => set((s) => ({ config: s.config ? { ...s.config, ...partial } : s.config })),

  unlock: async (token) => {
    tokenStore.set(token)
    const me = await apiGet<Config>('/me')
    set({ config: me, phase: 'desktop' })
  },

  logout: async () => {
    try {
      await post('/auth/logout')
    } catch {
      /* ignore */
    }
    tokenStore.clear()
    set({ phase: 'lock', windows: [], startMenuOpen: false, notificationsOpen: false, commandOpen: false })
  },

  openApp: (app, props) => {
    const existing = get().windows.find((w) => w.app === app)
    if (existing) {
      // پنجره‌ی باز: از مینیمایز درش بیار، جلو بیار و اگر props تازه آمد جایگزین کن
      const top = Math.max(...get().windows.filter((w) => !w.minimized).map((w) => w.z), 0)
      const needsRaise = existing.z < top || existing.minimized
      set((s) => ({
        windows: s.windows.map((w) =>
          w.id === existing.id
            ? {
                ...w,
                minimized: false,
                props: props ? { ...(w.props || {}), ...props } : w.props,
                z: needsRaise ? s.topZ + 1 : w.z,
              }
            : w,
        ),
        topZ: needsRaise ? s.topZ + 1 : s.topZ,
        startMenuOpen: false,
      }))
      return
    }

    windowSeq += 1
    const id = `w${windowSeq}`
    const slot = (windowSeq - 1) % CASCADE_SLOTS
    const remembered = geometryMemory[app]
    const z = get().topZ + 1
    set((s) => ({
      windows: [
        ...s.windows,
        {
          id,
          app,
          z,
          minimized: false,
          props,
          x: remembered?.x ?? 12 + slot * CASCADE_STEP_X,
          y: remembered?.y ?? 8 + slot * CASCADE_STEP_Y,
          w: remembered?.w,
          h: remembered?.h,
        },
      ],
      topZ: z,
      startMenuOpen: false,
    }))
  },

  closeApp: (id) => {
    const win = get().windows.find((w) => w.id === id)
    if (win && (win.x != null || win.y != null)) {
      geometryMemory[win.app] = { x: win.x, y: win.y, w: win.w, h: win.h }
    }
    set((s) => ({ windows: s.windows.filter((w) => w.id !== id) }))
  },

  closeAppByKey: (app) => {
    const targets = get().windows.filter((w) => w.app === app)
    targets.forEach((w) => get().closeApp(w.id))
  },

  focusApp: (id) => {
    const { windows, topZ } = get()
    const win = windows.find((w) => w.id === id)
    if (!win) return
    const visibleZ = windows.filter((w) => !w.minimized).map((w) => w.z)
    const isTop = visibleZ.length === 0 || win.z >= Math.max(...visibleZ)
    if (isTop && !win.minimized) return // همین حالا جلوترین و باز است → هیچ تغییر رندر/چیدمانی نده
    const z = topZ + 1
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)), topZ: z }))
  },

  minimizeApp: (id, v) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: v } : w)) })),

  toggleStartMenu: (v) => set((s) => ({ startMenuOpen: v ?? !s.startMenuOpen, notificationsOpen: false, commandOpen: false })),
  toggleNotifications: (v) => set((s) => ({ notificationsOpen: v ?? !s.notificationsOpen, startMenuOpen: false, commandOpen: false })),
  toggleCommand: (v) => set((s) => ({ commandOpen: v ?? !s.commandOpen, startMenuOpen: false, notificationsOpen: false })),
  setUnread: (n) => set({ unreadCount: n }),
  showEgg: (e) => set({ eggOverlay: e }),
  showToast: (text, tone = 'info') => {
    set({ toast: { text, tone } })
    window.setTimeout(() => set({ toast: null }), 3200)
  },

  saveWindowGeometry: (id, geom) => {
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, ...geom } : w)) }))
  },
}))
