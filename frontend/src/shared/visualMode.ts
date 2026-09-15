/**
 * visualMode.ts — کنترل تجربه‌ی عمق و انیمیشن LoveOS
 *
 * حالت پیش‌فرض «تطبیقی» است: روی دسکتاپ مناسب، عمق بیشتری نشان می‌دهیم؛
 * روی موبایل و دستگاه‌های محدود، Soft 3D فعال می‌ماند. هیچ‌وقت برای متن و
 * کنترل‌های اصلی به WebGL وابسته نیستیم و Calm 2D همیشه در دسترس است.
 */
import { useEffect, useState } from 'react'

export type VisualPreference = 'adaptive' | 'full' | 'soft' | 'calm'
export type VisualMode = 'full' | 'soft' | 'calm'

const KEY = 'loveos_visual_mode_v1'
const EVENT = 'loveos:visual-mode'
let cachedWebGLSupport: boolean | null = null

function readPreference(): VisualPreference {
  try {
    const value = localStorage.getItem(KEY)
    if (value === 'full' || value === 'soft' || value === 'calm' || value === 'adaptive') return value
  } catch {
    /* storage may be disabled */
  }
  return 'adaptive'
}

export function getVisualPreference(): VisualPreference {
  return readPreference()
}

export function setVisualPreference(value: VisualPreference): void {
  try {
    localStorage.setItem(KEY, value)
  } catch {
    /* visual settings still work for this render */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }))
}

export function supportsWebGL(): boolean {
  if (cachedWebGLSupport !== null) return cachedWebGLSupport
  if (typeof document === 'undefined') return false
  // jsdom intentionally has no canvas implementation; avoid noisy warnings in
  // the headless UI suite and use the same safe fallback as an old browser.
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
    cachedWebGLSupport = false
    return cachedWebGLSupport
  }
  try {
    const canvas = document.createElement('canvas')
    cachedWebGLSupport = Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    cachedWebGLSupport = false
  }
  return cachedWebGLSupport
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

function isCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true
}

function resolveMode(preference: VisualPreference): VisualMode {
  if (prefersReducedMotion() || preference === 'calm') return 'calm'
  if (preference === 'soft') return 'soft'
  if (preference === 'full') return supportsWebGL() ? 'full' : 'soft'

  // حالت adaptive: موبایل و لپ‌تاپ‌های لمسی نرم‌تر؛ دسکتاپ مناسب عمق کامل‌تر.
  if (!supportsWebGL()) return 'soft'
  return isCoarsePointer() ? 'soft' : 'full'
}

export function useVisualMode(): {
  preference: VisualPreference
  mode: VisualMode
  canUseWebGL: boolean
  reducedMotion: boolean
  setPreference: (value: VisualPreference) => void
} {
  const [preference, setPreferenceState] = useState<VisualPreference>(() => readPreference())
  const [capability, setCapability] = useState(() => ({
    canUseWebGL: typeof document !== 'undefined' ? supportsWebGL() : false,
    reducedMotion: prefersReducedMotion(),
  }))

  useEffect(() => {
    const onMode = (event: Event) => {
      const value = (event as CustomEvent<VisualPreference>).detail
      if (value) setPreferenceState(value)
    }
    const onCapability = () => {
      setCapability({ canUseWebGL: supportsWebGL(), reducedMotion: prefersReducedMotion() })
    }
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    window.addEventListener(EVENT, onMode)
    window.addEventListener('resize', onCapability)
    media?.addEventListener?.('change', onCapability)
    return () => {
      window.removeEventListener(EVENT, onMode)
      window.removeEventListener('resize', onCapability)
      media?.removeEventListener?.('change', onCapability)
    }
  }, [])

  const mode = resolveMode(preference)

  useEffect(() => {
    document.documentElement.dataset.visualMode = mode
    document.documentElement.dataset.visualPreference = preference
  }, [mode, preference])

  return {
    preference,
    mode,
    canUseWebGL: capability.canUseWebGL,
    reducedMotion: capability.reducedMotion,
    setPreference: setVisualPreference,
  }
}
