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
  /** کیفیت سه‌بعدی: auto | lite | balanced | dream */
  ui_quality?: 'auto' | 'lite' | 'balanced' | 'dream'
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
