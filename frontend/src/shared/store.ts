/**
 * store.ts — وضعیت سراسری LoveOS (Zustand)
 * مراحل سیستم: boot → lock → desktop
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
}

export interface WindowState {
  id: string
  app: string
  z: number
  minimized: boolean
  props?: Record<string, unknown>
}

interface OSState {
  phase: Phase
  config: Config | null
  unreadCount: number
  windows: WindowState[]
  topZ: number
  startMenuOpen: boolean
  notificationsOpen: boolean
  eggOverlay: null | { title: string; message: string; attachment?: string | null; kind?: string }
  toast: null | { text: string; tone?: 'love' | 'info' }
  nightOverride: boolean | null

  bootstrap: () => Promise<void>
  setPhase: (p: Phase) => void
  setConfig: (c: Config) => void
  unlock: (token: string) => Promise<void>
  logout: () => Promise<void>
  openApp: (app: string, props?: Record<string, unknown>) => void
  closeApp: (id: string) => void
  focusApp: (id: string) => void
  minimizeApp: (id: string, v: boolean) => void
  toggleStartMenu: (v?: boolean) => void
  toggleNotifications: (v?: boolean) => void
  setUnread: (n: number) => void
  showEgg: (e: OSState['eggOverlay']) => void
  showToast: (text: string, tone?: 'love' | 'info') => void
}

let windowSeq = 0

export const useOS = create<OSState>((set, get) => ({
  phase: 'boot',
  config: null,
  unreadCount: 0,
  windows: [],
  topZ: 10,
  startMenuOpen: false,
  notificationsOpen: false,
  eggOverlay: null,
  toast: null,
  nightOverride: null,

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

  setPhase: (p) => set({ phase: p }),
  setConfig: (c) => set({ config: c }),

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
    set({ phase: 'lock', windows: [], startMenuOpen: false, notificationsOpen: false })
  },

  openApp: (app, props) => {
    const existing = get().windows.find((w) => w.app === app)
    if (existing) {
      get().focusApp(existing.id)
      set((s) => ({
        windows: s.windows.map((w) => (w.id === existing.id ? { ...w, minimized: false, props: props ?? w.props } : w)),
        startMenuOpen: false,
      }))
      return
    }
    const z = get().topZ + 1
    windowSeq += 1
    set((s) => ({
      windows: [...s.windows, { id: `w${windowSeq}`, app, z, minimized: false, props }],
      topZ: z,
      startMenuOpen: false,
    }))
  },

  closeApp: (id) => set((s) => ({ windows: s.windows.filter((w) => w.id !== id) })),

  focusApp: (id) => {
    const z = get().topZ + 1
    set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, z, minimized: false } : w)), topZ: z }))
  },

  minimizeApp: (id, v) => set((s) => ({ windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: v } : w)) })),

  toggleStartMenu: (v) => set((s) => ({ startMenuOpen: v ?? !s.startMenuOpen, notificationsOpen: false })),
  toggleNotifications: (v) => set((s) => ({ notificationsOpen: v ?? !s.notificationsOpen, startMenuOpen: false })),
  setUnread: (n) => set({ unreadCount: n }),
  showEgg: (e) => set({ eggOverlay: e }),
  showToast: (text, tone = 'info') => {
    set({ toast: { text, tone } })
    setTimeout(() => set({ toast: null }), 3200)
  },
}))
