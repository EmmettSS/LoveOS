/**
 * geo.ts — موقعیت جغرافیایی زنده‌ی دخترم
 *
 * چرا لازم است؟ چون دخترم جابجا می‌شود؛ ممکن است در استانبول باشد، در سفر
 * باشد یا برگشته باشد. «شهر ثبت‌شده در پنل بابا» فقط یک پیش‌فرض است، نه
 * واقعیت امروز او. این ماژول موقعیت واقعی دستگاهش را می‌گیرد، شهر و منطقه‌ی
 * زمانی همان نقطه را در می‌آورد، برای سرور می‌فرستد و برای استفاده‌ی بعدی
 * (وقتی دسترسی موقتاً قطع است) کش می‌کند.
 *
 * اصل کلی: هیچ‌وقت بدون اجازه‌ی صریح، موقعیت گرفته نمی‌شود؛ و اگر اجازه
 * داده نشد، همه‌چیز با آرامش به مقدار پنل بابا برمی‌گردد.
 */
import { get, post } from './api'
import type { LiveLocation } from './store'

const CACHE_KEY = 'loveos_live_location'
const LAST_ASK_KEY = 'loveos_geo_last_ask'
const CITY_LOOKUP_KEY = 'loveos_geo_city_lookup'
const MAX_AGE_MS = 30 * 60 * 1000 // نیم ساعت: بعد از آن یک تازه‌سازی خودکار می‌کند
const MIN_MOVE_KM = 2 // جابجایی کمتر از این مقدار ارزش به‌روزرسانی ندارد

export interface Coords {
  lat: number
  lng: number
  accuracy: number | null
}

/* ------------------------------------------------------------------ کش --- */
export function readCachedLocation(): LiveLocation | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    return raw ? (JSON.parse(raw) as LiveLocation) : null
  } catch {
    return null
  }
}

function writeCachedLocation(loc: LiveLocation): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(loc))
  } catch {
    /* ignore */
  }
}

export function clearCachedLocation(): void {
  localStorage.removeItem(CACHE_KEY)
}

/* ------------------------------------------------------- اطلاعات دستگاه -- */
/** منطقه‌ی زمانی دستگاه (مثلاً Asia/Istanbul) — دقیق‌تر از شهر ذخیره‌شده */
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

function distanceKm(a: Coords, b: Coords): number {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const la1 = (a.lat * Math.PI) / 180
  const la2 = (b.lat * Math.PI) / 180
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** آیا جابجایی آن‌قدر هست که ارزش ثبت داشته باشد؟ */
export function hasMovedEnough(prev: Coords | null, next: Coords): boolean {
  if (!prev) return true
  return distanceKm(prev, next) >= MIN_MOVE_KM
}

/* --------------------------------------------------------- گرفتن موقعیت -- */
export function geoSupported(): boolean {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator
}

/** وضعیت اجازه‌ی دسترسی به موقعیت (بدون باز کردن هیچ پنجره‌ای) */
export async function geoPermissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    if (!navigator.permissions?.query) return 'unknown'
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
    return status.state as 'granted' | 'denied' | 'prompt'
  } catch {
    return 'unknown'
  }
}

/** گرفتن موقعیت فعلی با تنظیمات دقیق و زمان‌محدودیت (فقط با اجازه‌ی کاربر) */
export function getCurrentPosition(timeout = 12_000): Promise<Coords | null> {
  if (!geoSupported()) return Promise.resolve(null)
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: Number(pos.coords.latitude.toFixed(5)),
          lng: Number(pos.coords.longitude.toFixed(5)),
          accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 5 * 60 * 1000 },
    )
  })
}

/**
 * «موقعیت دائم/دقیق» را با گرم‌کردن GPS می‌گیرد؛ اگر دقت بهتری به‌دست آمد،
 * همان را برمی‌گرداند. برای موبایل مفید است چون اولین قرائت معمولاً دقت پایینی دارد.
 */
export function getPrecisePosition(): Promise<Coords | null> {
  if (!geoSupported()) return Promise.resolve(null)
  return new Promise((resolve) => {
    let best: Coords | null = null
    const finish = () => {
      clearTimeout(timer)
      try {
        if (watchId != null) navigator.geolocation.clearWatch(watchId)
      } catch {
        /* ignore */
      }
      resolve(best)
    }
    let watchId: number | null = null
    const timer = window.setTimeout(finish, 9_000)
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          const c: Coords = {
            lat: Number(pos.coords.latitude.toFixed(5)),
            lng: Number(pos.coords.longitude.toFixed(5)),
            accuracy: pos.coords.accuracy ? Math.round(pos.coords.accuracy) : null,
          }
          if (!best || (c.accuracy ?? 9999) < (best.accuracy ?? 9999)) best = c
          if ((best.accuracy ?? 9999) <= 40) finish()
        },
        () => finish(),
        { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
      )
    } catch {
      finish()
    }
  })
}

/* ------------------------------------------------------------ شهر و کش --- */
/** از مختصات، اسم شهر را در می‌آورد (سبک و با کش؛ در صورت خطا null) */
export async function lookupCity(lat: number, lng: number): Promise<string | null> {
  if (localStorage.getItem(CITY_LOOKUP_KEY) === 'off') return null
  const key = `loveos_city_${lat.toFixed(2)}_${lng.toFixed(2)}`
  const cached = localStorage.getItem(key)
  if (cached) return cached
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1` +
      `&lat=${lat}&lon=${lng}&accept-language=fa`
    const res = await fetch(url, { headers: { Accept: 'application/json' } })
    if (!res.ok) return null
    const data = await res.json()
    const a = data.address || {}
    const city: string =
      a.city || a.town || a.village || a.county || a.state || data.name || ''
    if (!city) return null
    localStorage.setItem(key, city)
    return city
  } catch {
    return null
  }
}

export function setCityLookupEnabled(on: boolean): void {
  localStorage.setItem(CITY_LOOKUP_KEY, on ? 'on' : 'off')
}

export function isCityLookupEnabled(): boolean {
  return localStorage.getItem(CITY_LOOKUP_KEY) !== 'off'
}

/* ---------------------------------------------- ثبت و همگام‌سازی سرور --- */
/** موقعیت را به سرور می‌سپارد (سرور همان‌جا شهر/منطقه‌ی زمانی را به‌روز می‌کند) */
export async function pushLocation(coords: Coords, city: string | null): Promise<LiveLocation | null> {
  const payload = { lat: coords.lat, lng: coords.lng, accuracy: coords.accuracy, city, timezone: deviceTimezone() }
  const local: LiveLocation = {
    lat: coords.lat,
    lng: coords.lng,
    accuracy: coords.accuracy,
    city: city || '',
    timezone: payload.timezone,
    source: 'device',
    captured_at: new Date().toISOString(),
    is_live: true,
  }
  writeCachedLocation(local)
  try {
    const res = await post<{ ok: boolean; location: LiveLocation }>('/location', payload)
    if (res?.location) {
      writeCachedLocation(res.location)
      return res.location
    }
  } catch {
    /* آفلاین — نسخه‌ی محلی کافی است و بعداً سینک می‌شود */
  }
  return local
}

/** گرفتن موقعیت + شهر + ارسال به سرور. این تابع «دکمه‌ی اجازه» را اجرا می‌کند. */
export async function enableLiveLocation(): Promise<{ ok: boolean; location: LiveLocation }> {
  localStorage.setItem(LAST_ASK_KEY, String(Date.now()))
  const coords = (await getPrecisePosition()) || (await getCurrentPosition())
  if (!coords) {
    return {
      ok: false,
      location: {
        lat: 0, lng: 0, accuracy: null, city: '', timezone: deviceTimezone(),
        source: 'config', captured_at: new Date().toISOString(), is_live: false,
      },
    }
  }
  const city = await lookupCity(coords.lat, coords.lng)
  const saved = await pushLocation(coords, city)
  return { ok: true, location: saved as LiveLocation }
}

/** تازه‌سازی خودکار اگر کش قدیمی است یا دخترم راه افتاده */
export async function refreshLocationIfStale(force = false): Promise<LiveLocation | null> {
  const cached = readCachedLocation()
  // اگر اجازه‌ی موقعیت داده نشده، هیچ‌وقت خودسرانه پنجره‌ی اجازه باز نمی‌کنیم
  if (!force) {
    const state = await geoPermissionState()
    if (state !== 'granted') return cached
  }
  if (!force && cached?.is_live) {
    const age = Date.now() - new Date(cached.captured_at).getTime()
    if (age < MAX_AGE_MS) return cached
  }
  const coords = await getCurrentPosition()
  if (!coords) return cached
  if (!force && cached && !hasMovedEnough({ lat: cached.lat, lng: cached.lng, accuracy: cached.accuracy }, coords)) {
    return cached
  }
  const city = await lookupCity(coords.lat, coords.lng)
  return pushLocation(coords, city)
}

/** آخرین موقعیت مؤثر: اول از سرور، بعد کش محلی (اگر سرور چیزی نداشت) */
export async function fetchEffectiveLocation(): Promise<LiveLocation | null> {
  try {
    const res = await get<{ location: LiveLocation | null }>('/location')
    if (res?.location) {
      writeCachedLocation(res.location)
      return res.location
    }
  } catch {
    /* ignore */
  }
  return readCachedLocation()
}

/** آیا قبلاً اجازه گرفته‌ایم؟ (تا دوباره اذیت نکنیم) */
export function hasAskedBefore(): boolean {
  return Boolean(localStorage.getItem(LAST_ASK_KEY))
}
