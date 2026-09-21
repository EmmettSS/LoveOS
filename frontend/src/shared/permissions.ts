/**
 * permissions.ts — مجوزها، حالت تمام‌صفحه و «حالت اپ» (PWA)
 *
 * چرا این ماژول هست؟
 *   مرورگرِ موبایل هیچ‌وقت خودش پنجره‌ی اجازه را باز نمی‌کند؛ هر مجوز باید با
 *   یک *لمسِ واقعیِ کاربر* خواسته شود. پس یک جای واحد لازم بود که:
 *     ۱) وضعیتِ فعلیِ همه‌ی مجوزها را بدونِ باز کردنِ هیچ پنجره‌ای بگوید،
 *     ۲) با یک لمس آن‌ها را بگیرد،
 *     ۳) تصمیم بگیرد «آیا باید صفحه‌ی آماده‌سازی را نشان بدهیم؟»
 *
 * قاعده‌ی «هر بار کم بود» (انتخابِ صاحبِ پروژه):
 *   • اگر مجوزی در حالتِ ``prompt`` باشد (یعنی می‌توانیم بپرسیم) → صفحه‌ی
 *     آماده‌سازی قبل از ورود به دسکتاپ نشان داده می‌شود.
 *   • «بعداً» فقط تا پایانِ همین باز بودنِ اپ آرام می‌کند؛ ورودِ بعدی اگر
 *     مجوزی کم باشد دوباره می‌پرسد («هر بار کم بود» — نه یک‌بار برای همیشه).
 *   • مجوزهایی که کاربر برای همیشه رد کرده (``denied``) پرسیدنی نیستند؛
 *     فقط در تنظیمات با راهنمای روشن‌کردن نشان داده می‌شوند.
 *   • اگر چیزی برای پرسیدن نباشد، صفحه‌ی آماده‌سازی اصلاً نمی‌آید.
 */
import { digits } from './format'

export type PermissionKey =
  | 'fullscreen'
  | 'notifications'
  | 'location'
  | 'microphone'
  | 'camera'
  | 'vibration'
  | 'storage'

export type PermissionState =
  | 'granted'
  | 'prompt'
  | 'denied'
  | 'unsupported'
  | 'unknown'
  /** به انتخابِ خودِ کاربر لازم نیست (مثلاً تمام‌صفحه را خاموش کرده) */
  | 'skipped'

export type PermissionMap = Record<PermissionKey, PermissionState>

/** ترتیبِ پیشنهادیِ گرفتنِ مجوزها (تجربه‌ی کاربری: از کم‌مزاحمت به پررنگ) */
export const PERMISSION_ORDER: PermissionKey[] = [
  'fullscreen',
  'notifications',
  'location',
  'vibration',
  'microphone',
  'camera',
  'storage',
]

/** ایموجیِ هر مجوز برای کارتِ صفحه‌ی آماده‌سازی */
export const PERMISSION_EMOJI: Record<PermissionKey, string> = {
  fullscreen: '🖥️',
  notifications: '🔔',
  location: '📍',
  microphone: '🎙️',
  camera: '📷',
  vibration: '📳',
  storage: '🧷',
}

const ASKED_PREFIX = 'loveos_perm_asked_'
const SETUP_SEEN_KEY = 'loveos_setup_seen_v1'
const FULLSCREEN_DONE_KEY = 'loveos_fullscreen_done'
const AUTO_FULLSCREEN_KEY = 'loveos_auto_fullscreen'

/**
 * «بعداً» فقط تا پایانِ همین باز بودنِ اپ آرام می‌کند (sessionStorage). پس هر
 * بارِ تازه‌ای که LoveOS باز شود، اگر مجوزی کم باشد صفحه‌ی آماده‌سازی برمی‌گردد
 * — همان «هر بار کم بود» که خواسته شد. رفرشِ همین صفحه ورودِ تازه حساب نمی‌شود.
 */
let skippedThisSession = false
const SETUP_SKIP_SESSION_KEY = 'loveos_setup_skip_session'
const SETUP_SKIP_KEY = 'loveos_setup_skip_at'

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage
  } catch {
    return null
  }
}

function readFlag(key: string): boolean {
  return store()?.getItem(key) === '1'
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) store()?.setItem(key, '1')
    else store()?.removeItem(key)
  } catch {
    /* حافظه‌ی پر/حالتِ خصوصی — بی‌خیال */
  }
}

export function markPermissionAsked(key: PermissionKey): void {
  writeFlag(`${ASKED_PREFIX}${key}`, true)
}

export function wasPermissionAsked(key: PermissionKey): boolean {
  return readFlag(`${ASKED_PREFIX}${key}`)
}

/* ------------------------------------------------------------ حالت اپ --- */
/** آیا در حالت نصب‌شده (بدون نوارِ مرورگر) اجرا می‌شویم؟ */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = Boolean((window.navigator as { standalone?: boolean }).standalone)
  if (iosStandalone) return true
  try {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      window.matchMedia?.('(display-mode: fullscreen)').matches ||
      window.matchMedia?.('(display-mode: minimal-ui)').matches
    )
  } catch {
    return false
  }
}

export function inIframe(): boolean {
  try {
    return typeof window !== 'undefined' && window.self !== window.top
  } catch {
    return true
  }
}

/* --------------------------------------------------------- تمام‌صفحه ---- */
export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  const enabled = (document as Document & { fullscreenEnabled?: boolean }).fullscreenEnabled
    ?? (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled
  return Boolean(element.requestFullscreen || element.webkitRequestFullscreen) && enabled !== false
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as Document & { webkitFullscreenElement?: Element | null }
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement)
}

/** خواستنِ تمام‌صفحه — فقط وقتی مرورگر اجازه بدهد؛ هیچ‌وقت خطا پرت نمی‌کند. */
export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) return true
  if (!fullscreenSupported()) return false
  const element = document.documentElement as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void> | void
  }
  try {
    if (element.requestFullscreen) await element.requestFullscreen({ navigationUI: 'hide' })
    else await element.webkitRequestFullscreen?.()
    writeFlag(FULLSCREEN_DONE_KEY, true)
    return isFullscreen()
  } catch {
    // iOS Safari روی آیفون از Fullscreen API پشتیبانی نمی‌کند، سندباکس هم در
    // آی‌فریم مجاز نیست — هر دو حالت باید بی‌صدا رد شوند.
    return false
  }
}

export async function exitFullscreen(): Promise<void> {
  if (!isFullscreen()) return
  const doc = document as Document & { webkitExitFullscreen?: () => Promise<void> | void }
  try {
    if (doc.exitFullscreen) await doc.exitFullscreen()
    else await doc.webkitExitFullscreen?.()
  } catch {
    /* ignore */
  }
}

export function onFullscreenChange(handler: () => void): () => void {
  document.addEventListener('fullscreenchange', handler)
  document.addEventListener('webkitfullscreenchange', handler as EventListener)
  return () => {
    document.removeEventListener('fullscreenchange', handler)
    document.removeEventListener('webkitfullscreenchange', handler as EventListener)
  }
}

export function autoFullscreenEnabled(): boolean {
  try {
    return store()?.getItem(AUTO_FULLSCREEN_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setAutoFullscreen(enabled: boolean): void {
  try {
    store()?.setItem(AUTO_FULLSCREEN_KEY, enabled ? 'on' : 'off')
  } catch {
    /* ignore */
  }
  // با خاموش‌کردنِ خودکار، پرچمِ «قبلاً گرفته شد» هم پاک می‌شود تا اگر دوباره
  // روشنش کرد، صفحه‌ی آماده‌سازی یک بار دیگر یادش بیندازد.
  if (!enabled) writeFlag(FULLSCREEN_DONE_KEY, false)
}

/**
 * اگر لازم است، تمام‌صفحه را می‌خواهد. باید داخلِ یک لمسِ کاربر صدا زده شود.
 * خروجی: true اگر تمام‌صفحه شد.
 */
export async function autoFullscreen(): Promise<boolean> {
  if (isStandalone() || !autoFullscreenEnabled() || !fullscreenSupported()) return false
  if (isFullscreen()) return true
  return enterFullscreen()
}

/* -------------------------------------------------- نصب روی صفحه‌ی خانه -- */
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice?: Promise<unknown> }

let installEvent: InstallPromptEvent | null = null
type InstallListener = (available: boolean) => void
const installListeners = new Set<InstallListener>()

function emitInstall(): void {
  const available = Boolean(installEvent)
  installListeners.forEach((listener) => {
    try {
      listener(available)
    } catch {
      /* ignore */
    }
  })
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    installEvent = event as InstallPromptEvent
    emitInstall()
  })
  window.addEventListener('appinstalled', () => {
    installEvent = null
    emitInstall()
  })
}

/** آیا مرورگر همین حالا می‌تواند دکمه‌ی «نصب» را نشان بدهد؟ */
export function installAvailable(): boolean {
  return Boolean(installEvent)
}

/** آیا کاربر iOS است؟ (برای راهنمای «افزودن به صفحه‌ی خانه») */
export function isIosLike(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const ios = /iPad|iPhone|iPod/.test(ua)
  const iPadOs = navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1
  return ios || iPadOs
}

export function onInstallAvailability(listener: InstallListener): () => void {
  installListeners.add(listener)
  listener(Boolean(installEvent))
  return () => installListeners.delete(listener)
}

export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false
  try {
    await installEvent.prompt()
    installEvent = null
    emitInstall()
    return true
  } catch {
    return false
  }
}

/* ----------------------------------------------------- خواندنِ وضعیت ---- */
function permissionApiAvailable(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.permissions?.query)
}

async function queryPermission(name: PermissionName): Promise<PermissionState | null> {
  if (!permissionApiAvailable()) return null
  try {
    const status = await navigator.permissions!.query({ name })
    return status.state as PermissionState
  } catch {
    // بعضی مرورگرها (سافاریِ قدیمی) فقط چند نام را می‌شناسند
    return null
  }
}

function mediaSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  const media = navigator.mediaDevices as MediaDevices | undefined
  return Boolean(media?.getUserMedia)
}

async function stateOf(key: PermissionKey): Promise<PermissionState> {
  switch (key) {
    case 'fullscreen': {
      if (isStandalone() || isFullscreen()) return 'granted'
      if (!fullscreenSupported()) return 'unsupported'
      if (!autoFullscreenEnabled()) return 'skipped'
      if (readFlag(FULLSCREEN_DONE_KEY)) return 'granted'
      // یک بار خواسته شده و مرورگر/سیستم اجازه نداده → دیگر به‌روی کاربر
      // نمی‌افتیم (در تنظیمات دکمه‌اش هست).
      return wasPermissionAsked('fullscreen') ? 'denied' : 'prompt'
    }
    case 'notifications': {
      if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
      const viaApi = await queryPermission('notifications' as PermissionName)
      if (viaApi) return viaApi
      const current = Notification.permission
      return current === 'default' ? 'unknown' : (current as PermissionState)
    }
    case 'location': {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return 'unsupported'
      return (await queryPermission('geolocation' as PermissionName)) ?? 'unknown'
    }
    case 'microphone': {
      if (!mediaSupported()) return 'unsupported'
      return (await queryPermission('microphone' as PermissionName)) ?? 'unknown'
    }
    case 'camera': {
      if (!mediaSupported()) return 'unsupported'
      return (await queryPermission('camera' as PermissionName)) ?? 'unknown'
    }
    case 'vibration':
      return typeof navigator !== 'undefined' && 'vibrate' in navigator ? 'granted' : 'unsupported'
    case 'storage': {
      const storageManager = (navigator as Navigator & { storage?: StorageManager }).storage
      if (!storageManager?.persist) return 'unsupported'
      try {
        if (await storageManager.persisted()) return 'granted'
      } catch {
        /* ignore */
      }
      // ``persist()`` روی بعضی مرورگرها بدونِ نصب/تعامل «false» می‌دهد. اگر
      // یک بار پرسیده باشیم و جواب نه بوده، همان «رد‌شده» حساب می‌شود تا هر
      // بار ورود دوباره اذیت نشویم.
      return wasPermissionAsked('storage') ? 'denied' : 'prompt'
    }
    default:
      return 'unknown'
  }
}

export async function permissionStates(): Promise<PermissionMap> {
  const entries = await Promise.all(
    PERMISSION_ORDER.map(async (key) => [key, await stateOf(key)] as const),
  )
  return Object.fromEntries(entries) as PermissionMap
}

/* ----------------------------------------------------- گرفتنِ مجوز ------ */
async function requestMedia(kind: 'audio' | 'video'): Promise<PermissionState> {
  if (!mediaSupported()) return 'unsupported'
  try {
    const stream = await navigator.mediaDevices.getUserMedia(
      kind === 'audio' ? { audio: true } : { video: true },
    )
    stream.getTracks().forEach((track) => track.stop())
    return 'granted'
  } catch (error) {
    const name = (error as { name?: string })?.name
    if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'unsupported'
    if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied'
    return 'prompt'
  }
}

/**
 * یک مجوز را با لمسِ کاربر می‌گیرد. همیشه یکی از حالت‌ها را برمی‌گرداند و
 * هیچ‌وقت استثنا پرت نمی‌کند (چون وسطِ رابط کاربری اجرا می‌شود).
 */
export async function requestPermission(key: PermissionKey): Promise<PermissionState> {
  markPermissionAsked(key)
  let state: PermissionState = 'unknown'
  switch (key) {
    case 'fullscreen': {
      const ok = await enterFullscreen()
      state = ok ? 'granted' : fullscreenSupported() ? 'denied' : 'unsupported'
      break
    }
    case 'notifications': {
      if (typeof window === 'undefined' || !('Notification' in window)) {
        state = 'unsupported'
        break
      }
      try {
        const result = await Notification.requestPermission()
        state = result as PermissionState
      } catch {
        state = 'denied'
      }
      break
    }
    case 'location': {
      if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
        state = 'unsupported'
        break
      }
      state = await new Promise<PermissionState>((resolve) => {
        let settled = false
        const done = (value: PermissionState) => {
          if (!settled) {
            settled = true
            resolve(value)
          }
        }
        window.setTimeout(() => done('unknown'), 15_000)
        navigator.geolocation.getCurrentPosition(
          () => done('granted'),
          (error) => done(error?.code === 1 ? 'denied' : 'unknown'),
          { enableHighAccuracy: false, timeout: 14_000, maximumAge: 5 * 60 * 1000 },
        )
      })
      break
    }
    case 'microphone':
      state = await requestMedia('audio')
      break
    case 'camera':
      state = await requestMedia('video')
      break
    case 'vibration': {
      const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator
      state = supported ? 'granted' : 'unsupported'
      if (supported) {
        try {
          navigator.vibrate(40)
        } catch {
          /* ignore */
        }
      }
      break
    }
    case 'storage': {
      const storageManager = (navigator as Navigator & { storage?: StorageManager }).storage
      if (!storageManager?.persist) {
        state = 'unsupported'
        break
      }
      try {
        state = (await storageManager.persist()) ? 'granted' : 'denied'
      } catch {
        state = 'unknown'
      }
      break
    }
    default:
      state = 'unknown'
  }
  return state
}

/* --------------------------------------------------------- تصمیم‌ها ----- */
/** آیا این مجوز ارزشِ پرسیدن دارد؟ (یعنی می‌توانیم پنجره‌اش را باز کنیم) */
export function shouldAsk(key: PermissionKey, state: PermissionState): boolean {
  if (state === 'prompt') return true
  if (state === 'unknown') return !wasPermissionAsked(key)
  return false
}

/** آیا صفحه‌ی آماده‌سازی باید نشان داده شود؟ */
export function setupNeeded(states: PermissionMap): boolean {
  if (!readFlag(SETUP_SEEN_KEY)) return true
  return PERMISSION_ORDER.some((key) => shouldAsk(key, states[key]))
}

export function markSetupSeen(): void {
  writeFlag(SETUP_SEEN_KEY, true)
}

export function markSetupSkipped(): void {
  // منبعِ حقیقت sessionStorage است (پایانِ نشست = پرسشِ دوباره)؛ متغیرِ
  // ماژول فقط پناهگاه است برای مرورگرهایی که sessionStorage ندارند.
  const session = sessionStore()
  if (!session) {
    skippedThisSession = true
  } else {
    try {
      session.setItem(SETUP_SKIP_SESSION_KEY, '1')
    } catch {
      skippedThisSession = true
    }
  }
  try {
    // زمانِ آخرین «بعداً» (فقط برای نمایش/دیباگ در تنظیمات)
    store()?.setItem(SETUP_SKIP_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

/** آیا در همین نشست، «بعداً» زده شده؟ (ورودِ بعدی = پرسشِ دوباره) */
export function skipQuietNow(): boolean {
  const session = sessionStore()
  if (!session) return skippedThisSession
  try {
    return session.getItem(SETUP_SKIP_SESSION_KEY) === '1'
  } catch {
    return skippedThisSession
  }
}

/** آخرین باری که «بعداً» زده شده (برای نشان دادن در تنظیمات) */
export function lastSkippedAt(): number {
  try {
    return Number(store()?.getItem(SETUP_SKIP_KEY) || 0)
  } catch {
    return 0
  }
}

/** پاک‌کردنِ «بعداً» تا همین حالا هم صفحه‌ی آماده‌سازی بیاید */
export function clearSetupSkip(): void {
  skippedThisSession = false
  try {
    sessionStore()?.removeItem(SETUP_SKIP_SESSION_KEY)
    store()?.removeItem(SETUP_SKIP_KEY)
  } catch {
    /* ignore */
  }
}

/** متنِ کوتاهِ وضعیت برای چیپ‌های تنظیمات (با تابعِ ترجمه تزریق‌شده). */
export function permissionStateLabel(
  state: PermissionState,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const map: Record<PermissionState, string> = {
    granted: 'setup.state.granted',
    prompt: 'setup.state.prompt',
    denied: 'setup.state.denied',
    unsupported: 'setup.state.unsupported',
    unknown: 'setup.state.unknown',
    skipped: 'setup.state.skipped',
  }
  return t(map[state] || 'setup.state.unknown')
}

/** شماره‌ی قدم برای نمایشِ «۳ از ۷» (ارقامِ فارسی) */
export function stepText(current: number, total: number): string {
  return `${digits(current)} / ${digits(total)}`
}
