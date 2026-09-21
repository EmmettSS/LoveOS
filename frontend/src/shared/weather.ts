/**
 * weather.ts — آب‌وهوای زنده، مستقیم از مرورگرِ خودمان (Client-Side)
 *
 * چرا سمت کلاینت؟ چون هاست اشتراکی پروژه به‌خاطر فایروال داخلی هیچ دسترسی
 * خروجی به وب‌سرویس‌های بیرونی ندارد؛ پس درخواست به Open-Meteo از سرور
 * همیشه «نامعلوم» برمی‌گشت. اما مرورگر کاربر آزاد است و Open-Meteo هم CORS
 * را باز گذاشته، پس داده در کسری از ثانیه مستقیم می‌رسد.
 *
 * قواعد این ماژول:
 *   • «منبع یگانه»ی آب‌وهوا در فرانت است؛ نه اپ هواشناسی و نه ویجت دسکتاپ
 *     نباید خودشان fetch بزنند یا کد هواشناسی را تفسیر کنند.
 *   • کشِ ۱۵ دقیقه‌ای در sessionStorage: تازه‌سازی‌های پشت‌سرهم پنجره‌ها
 *     (و جابه‌جایی بین دسکتاپ و اپ) هیچ درخواست تازه‌ای نمی‌سازد.
 *   • اگر شبکه قطع بود، آخرین داده‌ی محفوظِ همان نشست نمایش داده می‌شود
 *     (با علامت «از حافظه») تا کارت‌ها هیچ‌وقت خالی نمانند.
 *   • هیچ‌وقت throw نمی‌کند: همیشه یک شیء کامل با مقدارهای null برمی‌گرداند
 *     تا رابط کاربری بدون خطا رندر شود.
 */
import { isFa } from './format'
import { deviceTimezone } from './geo'
import type { Config, LiveLocation } from './store'

/* ------------------------------------------------------------ ثابت‌ها --- */
const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'
const CACHE_PREFIX = 'loveos_weather_v1'
/** ۱۵ دقیقه — در این بازه، پاسخ از حافظه‌ی نشست خوانده می‌شود */
export const CACHE_TTL_MS = 15 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000
const FORECAST_DAYS = 5

/** مقادیر پیش‌فرض وقتی تنظیمات پنل یا موقعیت زنده در دسترس نیست */
export const DEFAULT_DADDY = { city: 'تهران', lat: 35.6892, lng: 51.389, tz: 'Asia/Tehran' }
export const DEFAULT_DAUGHTER = { city: 'استانبول', lat: 41.0082, lng: 28.9784, tz: 'Europe/Istanbul' }

/* --------------------------------------------------------- کدهای WMO --- */
export type WeatherIcon = 'sun' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm'

interface CodeInfo {
  fa: string
  en: string
  icon: WeatherIcon
}

/** کدهای هواشناسی WMO Open-Meteo → عنوان فارسی/انگلیسی + آیکن LoveOS */
const WMO: Record<number, CodeInfo> = {
  0: { fa: 'آفتابی', en: 'Clear sky', icon: 'sun' },
  1: { fa: 'کمی ابری', en: 'Mainly clear', icon: 'sun' },
  2: { fa: 'نیمه‌ابری', en: 'Partly cloudy', icon: 'cloud' },
  3: { fa: 'ابری', en: 'Overcast', icon: 'cloud' },
  45: { fa: 'مه', en: 'Fog', icon: 'fog' },
  48: { fa: 'مه‌ی یخی', en: 'Freezing fog', icon: 'fog' },
  51: { fa: 'نم‌نم باران', en: 'Light drizzle', icon: 'rain' },
  53: { fa: 'باران خفیف', en: 'Drizzle', icon: 'rain' },
  55: { fa: 'باران', en: 'Dense drizzle', icon: 'rain' },
  56: { fa: 'باران یخین', en: 'Light freezing rain', icon: 'rain' },
  57: { fa: 'باران یخین شدید', en: 'Freezing rain', icon: 'rain' },
  61: { fa: 'باران سبک', en: 'Slight rain', icon: 'rain' },
  63: { fa: 'باران', en: 'Rain', icon: 'rain' },
  65: { fa: 'باران شدید', en: 'Heavy rain', icon: 'rain' },
  66: { fa: 'باران یخین', en: 'Light freezing rain', icon: 'rain' },
  67: { fa: 'باران یخین شدید', en: 'Freezing rain', icon: 'rain' },
  71: { fa: 'برف سبک', en: 'Slight snow', icon: 'snow' },
  73: { fa: 'برف', en: 'Snow', icon: 'snow' },
  75: { fa: 'برف سنگین', en: 'Heavy snow', icon: 'snow' },
  77: { fa: 'دانه‌های برف', en: 'Snow grains', icon: 'snow' },
  80: { fa: 'رگبار', en: 'Rain showers', icon: 'rain' },
  81: { fa: 'رگبار', en: 'Rain showers', icon: 'rain' },
  82: { fa: 'رگبار شدید', en: 'Violent rain showers', icon: 'rain' },
  85: { fa: 'رگبار برف', en: 'Snow showers', icon: 'snow' },
  86: { fa: 'رگبار برف سنگین', en: 'Heavy snow showers', icon: 'snow' },
  95: { fa: 'رعد و برق', en: 'Thunderstorm', icon: 'storm' },
  96: { fa: 'رعد و برق با تگرگ', en: 'Thunderstorm with hail', icon: 'storm' },
  99: { fa: 'رعد و برق شدید', en: 'Severe thunderstorm', icon: 'storm' },
}

const UNKNOWN_CODE: CodeInfo = { fa: 'نامعلوم', en: 'Unknown', icon: 'cloud' }

/** عنوان و آیکن یک کد WMO (کد ناشناخته → «نامعلوم»/ابر) */
export function weatherCodeInfo(code: number, fa = isFa()): { code: number; label: string; icon: WeatherIcon } {
  const info = WMO[code] || UNKNOWN_CODE
  return { code, label: fa ? info.fa : info.en, icon: info.icon }
}

/** کد و آیکن مناسب برای رنگ آسمان (خانواده‌ی آیکن‌های LoveOS) */
export function weatherIconOf(code: number): WeatherIcon {
  return (WMO[code] || UNKNOWN_CODE).icon
}

/* --------------------------------------------------------- جهت باد --- */
const WIND_FA = ['شمالی', 'شمال‌شرقی', 'شرقی', 'جنوب‌شرقی', 'جنوبی', 'جنوب‌غربی', 'غربی', 'شمال‌غربی']
const WIND_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

/** درجه‌ی باد → «جنوب‌غربی» و مانند آن (۸ جهت، مثل قطب‌نما) */
export function windDirection(deg: number | null, fa = isFa()): string {
  if (deg == null || !Number.isFinite(deg)) return '—'
  const i = Math.round((((deg % 360) + 360) % 360) / 45) % 8
  return fa ? WIND_FA[i] : WIND_EN[i]
}

/* ----------------------------------------------------------- انواع --- */
export interface ForecastDay {
  date: string | null
  t_max: number | null
  t_min: number | null
  precip_prob: number | null
  code: number
  label: string
  icon: WeatherIcon
}

export interface LiveWeather {
  ok: boolean
  city: string
  temp: number | null
  feels_like: number | null
  humidity: number | null
  wind: number | null
  wind_deg: number | null
  wind_dir: string
  pressure: number | null
  cloud_cover: number | null
  uv: number | null
  is_day: boolean
  code: number
  label: string
  icon: WeatherIcon
  sunrise: string | null
  sunset: string | null
  forecast: ForecastDay[]
  /** آیا این داده از موقعیت زنده‌ی دستگاهِ دخترم آمده؟ */
  is_live: boolean
  /** زمان آخرین دریافت موفق از Open-Meteo (ISO) */
  updated_at: string | null
  /** از کشِ ۱۵ دقیقه‌ای خوانده شده؟ */
  cached: boolean
  /** اگر شبکه خطا داد، متن خطا — داده‌ی محفوظ جای آن نشان داده می‌شود */
  error?: string
}

/** یک شهر برای پرسیدن هوا: مختصات + منطقه‌ی زمانی + اینکه زنده است یا نه */
export interface WeatherTarget {
  city: string
  lat: number
  lng: number
  tz: string
  is_live: boolean
}

export interface WeatherPair {
  daddy: LiveWeather
  daughter: LiveWeather
}

/* -------------------------------------------------------- ابزارک‌ها --- */
function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

function arrayAt(arr: unknown, i: number): unknown {
  return Array.isArray(arr) ? arr[i] : undefined
}

function coord(v: unknown, fallback: number): number {
  const n = num(v)
  return n == null ? fallback : n
}

function trimmed(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

/** ساعت «05:41» از هر شکلی که سرور می‌دهد («2026-09-21T05:41» یا «05:41») */
export function clockTime(value: string | null | undefined): string {
  if (!value) return '—'
  const m = /(\d{1,2}:\d{2})/.exec(value)
  return m ? m[1] : '—'
}

/* ------------------------------------------------- اینترنت/دستگاه --- */
function storageAvailable(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage !== null
  } catch {
    return false
  }
}

function cacheKey(lat: number, lng: number, tz: string): string {
  return `${CACHE_PREFIX}:${lat.toFixed(3)},${lng.toFixed(3)}:${tz || 'auto'}`
}

/** قطعه‌ی خامِ پاسخ Open-Meteo که کش می‌کنیم (تا ترجمه همیشه تازه باشد) */
interface CacheEntry {
  at: number
  current: Record<string, unknown>
  daily: Record<string, unknown>
}

function readCache(key: string): CacheEntry | null {
  if (!storageAvailable()) return null
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry
    if (!parsed || typeof parsed.at !== 'number' || !parsed.current || !parsed.daily) return null
    return parsed
  } catch {
    return null
  }
}

function writeCache(key: string, entry: CacheEntry): void {
  if (!storageAvailable()) return
  try {
    sessionStorage.setItem(key, JSON.stringify(entry))
  } catch {
    /* حافظه‌ی نشست پر است — فقط برای این بار از شبکه می‌خوانیم */
  }
}

/** آدرس رسمی Open-Meteo (بدون کلید، با CORS باز) */
export function forecastUrl(lat: number, lng: number, tz: string): string {
  return (
    `${ENDPOINT}?latitude=${lat}&longitude=${lng}` +
    '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,' +
    'wind_speed_10m,wind_direction_10m,pressure_msl,cloud_cover,is_day,uv_index' +
    '&daily=sunrise,sunset,temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code' +
    `&timezone=${encodeURIComponent(tz)}&forecast_days=${FORECAST_DAYS}`
  )
}

async function getJson(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Record<string, unknown>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data: unknown = await res.json()
    if (!data || typeof data !== 'object') throw new Error('bad payload')
    return data as Record<string, unknown>
  } finally {
    clearTimeout(timer)
  }
}

/* -------------------------------------------------------- نرمال‌سازی --- */
function buildForecast(daily: Record<string, unknown>, fa: boolean): ForecastDay[] {
  const dates = daily.time
  const count = Array.isArray(dates) ? Math.min(FORECAST_DAYS, dates.length) : 0
  const days: ForecastDay[] = []
  for (let i = 0; i < count; i += 1) {
    const code = num(arrayAt(daily.weather_code, i))
    const codeNum = code == null ? -1 : code
    const info = weatherCodeInfo(codeNum, fa)
    days.push({
      date: str(arrayAt(dates, i)),
      t_max: num(arrayAt(daily.temperature_2m_max, i)),
      t_min: num(arrayAt(daily.temperature_2m_min, i)),
      precip_prob: num(arrayAt(daily.precipitation_probability_max, i)),
      code: codeNum,
      label: info.label,
      icon: info.icon,
    })
  }
  return days
}

function normalize(
  city: string,
  current: Record<string, unknown>,
  daily: Record<string, unknown>,
  isLive: boolean,
  meta: { cached: boolean; updatedAt: number | null; error?: string },
): LiveWeather {
  const fa = isFa()
  const codeNum = num(current.weather_code)
  const info = weatherCodeInfo(codeNum == null ? -1 : codeNum, fa)
  const deg = num(current.wind_direction_10m)
  const isDayRaw = current.is_day
  return {
    ok: true,
    city,
    temp: num(current.temperature_2m),
    feels_like: num(current.apparent_temperature),
    humidity: num(current.relative_humidity_2m),
    wind: num(current.wind_speed_10m),
    wind_deg: deg,
    wind_dir: windDirection(deg, fa),
    pressure: num(current.pressure_msl),
    cloud_cover: num(current.cloud_cover),
    uv: num(current.uv_index),
    is_day: isDayRaw == null ? true : Number(isDayRaw) !== 0,
    code: codeNum == null ? -1 : codeNum,
    label: info.label,
    icon: info.icon,
    sunrise: str(arrayAt(daily.sunrise, 0)),
    sunset: str(arrayAt(daily.sunset, 0)),
    forecast: buildForecast(daily, fa),
    is_live: isLive,
    updated_at: meta.updatedAt ? new Date(meta.updatedAt).toISOString() : null,
    cached: meta.cached,
    error: meta.error,
  }
}

/** وقتی نه شبکه هست و نه چیزی کش شده — کارت‌ها خالی ولی بدون خطا می‌مانند */
function unavailable(city: string, isLive: boolean, error: string): LiveWeather {
  const info = weatherCodeInfo(-1)
  return {
    ok: false,
    city,
    temp: null,
    feels_like: null,
    humidity: null,
    wind: null,
    wind_deg: null,
    wind_dir: '—',
    pressure: null,
    cloud_cover: null,
    uv: null,
    is_day: true,
    code: -1,
    label: info.label,
    icon: info.icon,
    sunrise: null,
    sunset: null,
    forecast: [],
    is_live: isLive,
    updated_at: null,
    cached: false,
    error,
  }
}

/* ------------------------------------------------------- تابع اصلی --- */
/**
 * آب‌وهوای زنده‌ی یک شهر، مستقیم از مرورگر کاربر.
 *
 *   ۱) اگر در ۱۵ دقیقه‌ی اخیر همین مختصات گرفته شده → از sessionStorage
 *   ۲) وگرنه fetch به Open-Meteo (با مهلت ۱۰ ثانیه)
 *   ۳) اگر شبکه خطا داد و کشی بود → همان کش قدیمی (با علامت `cached`)
 *   ۴) اگر هیچ‌کدام → داده‌ی خالی با `ok: false` (بدون throw)
 */
export async function fetchLiveWeather(
  city: string,
  lat: number,
  lng: number,
  tz: string,
  is_live = false,
): Promise<LiveWeather> {
  const zone = trimmed(tz) || deviceTimezone() || DEFAULT_DADDY.tz
  const key = cacheKey(lat, lng, zone)
  const cached = readCache(key)
  const now = Date.now()

  if (cached && now - cached.at < CACHE_TTL_MS) {
    return normalize(city, cached.current, cached.daily, is_live, { cached: true, updatedAt: cached.at })
  }

  try {
    const data = await getJson(forecastUrl(lat, lng, zone))
    const current = (data.current || {}) as Record<string, unknown>
    const daily = (data.daily || {}) as Record<string, unknown>
    if (current.temperature_2m == null && current.weather_code == null) throw new Error('empty forecast')
    writeCache(key, { at: now, current, daily })
    return normalize(city, current, daily, is_live, { cached: false, updatedAt: now })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (cached) {
      // شبکه قطع است ولی داده‌ی این نشست را داریم → با آرامش همان را نشان بده
      return normalize(city, cached.current, cached.daily, is_live, {
        cached: true,
        updatedAt: cached.at,
        error: message,
      })
    }
    return unavailable(city, is_live, message)
  }
}

/* --------------------------------------- مقصدهای بابا و دخترم --- */
/**
 * از پیکربندی کاربر مختصاتِ هر دو طرف را در می‌آورد:
 * بابا از تنظیمات پنل، دخترم اول از موقعیت زنده‌ی دستگاهش و بعد از پنل.
 */
export function weatherTargets(config: Config | null | undefined): { daddy: WeatherTarget; daughter: WeatherTarget } {
  const live = config?.live_location as LiveLocation | null | undefined
  const liveLat = num(live?.lat)
  const liveLng = num(live?.lng)
  const liveUsable = Boolean(live?.is_live) && liveLat != null && liveLng != null && !(liveLat === 0 && liveLng === 0)

  return {
    daddy: {
      city: trimmed(config?.daddy_city) || DEFAULT_DADDY.city,
      lat: coord(config?.daddy_lat, DEFAULT_DADDY.lat),
      lng: coord(config?.daddy_lng, DEFAULT_DADDY.lng),
      tz: trimmed(config?.daddy_timezone) || DEFAULT_DADDY.tz,
      is_live: false,
    },
    daughter: liveUsable
      ? {
          city: trimmed(live?.city) || trimmed(config?.daughter_city) || DEFAULT_DAUGHTER.city,
          lat: liveLat as number,
          lng: liveLng as number,
          tz: trimmed(live?.timezone) || deviceTimezone() || DEFAULT_DAUGHTER.tz,
          is_live: true,
        }
      : {
          city: trimmed(config?.daughter_city) || DEFAULT_DAUGHTER.city,
          lat: coord(config?.daughter_lat, DEFAULT_DAUGHTER.lat),
          lng: coord(config?.daughter_lng, DEFAULT_DAUGHTER.lng),
          tz: trimmed(config?.daughter_timezone) || DEFAULT_DAUGHTER.tz,
          is_live: Boolean(config?.daughter_is_live),
        },
  }
}

/** هر دو شهر با هم — برای هر جایی که به جفتِ بابا و دخترم نیاز دارد */
export async function fetchWeatherPair(config: Config | null | undefined): Promise<WeatherPair> {
  const { daddy, daughter } = weatherTargets(config)
  const [d, g] = await Promise.all([
    fetchLiveWeather(daddy.city, daddy.lat, daddy.lng, daddy.tz, daddy.is_live),
    fetchLiveWeather(daughter.city, daughter.lat, daughter.lng, daughter.tz, daughter.is_live),
  ])
  return { daddy: d, daughter: g }
}

/* -------------------------------------------------- پیام عاشقانه --- */
/** اختلاف دمای دو شهر (درجه‌ی گردشده) — null اگر یکی‌شان معلوم نباشد */
export function tempDiff(daddy: LiveWeather, daughter: LiveWeather): number | null {
  if (daddy.temp == null || daughter.temp == null) return null
  return Math.abs(Math.round(daddy.temp) - Math.round(daughter.temp))
}

/**
 * پیامِ ما بر اساس اختلاف دمای زنده‌ی دو شهر.
 * (همان دو پیامِ سرور، به‌علاوه‌ی پله‌های میان‌راه تا همیشه حرفی برای گفتن باشد)
 */
export function temperatureMessage(daddy: LiveWeather, daughter: LiveWeather): string {
  const diff = tempDiff(daddy, daughter)
  if (diff == null) return ''
  const fa = isFa()
  if (diff <= 2) {
    return fa ? 'امروز هوای جفتمون یه شکله؛ انگار کنار همیم ☁️❤' : 'Our weather matches today — feels like we are together ☁️❤'
  }
  if (diff <= 6) {
    return fa ? 'هوای شهرمون نزدیکه… دلِ من که همیشه پیشِ توئه ❤' : 'Our cities feel almost the same… my heart is always with you ❤'
  }
  if (diff <= 9) {
    return fa ? 'هوای من و تو یه‌کم فرق داره، ولی بهارِ من همیشه تو هستی 🌸' : 'Our weather differs a little, but you are always my spring 🌸'
  }
  return fa ? 'هوامون خیلی فرق داره، ولی دلمون یکیه ❤' : 'Our weather is far apart, but our hearts are one ❤'
}

/**
 * جمله‌ی دل‌سوزانه بر اساس هوای خودِ دخترم (باران/برف/رعد/مه).
 * جدا از پیامِ اختلاف دما نگه داشته شده تا هر دو با هم دیده شوند.
 */
export function careNote(daughter: LiveWeather): string {
  const fa = isFa()
  const code = daughter.code
  if (code >= 95) return fa ? 'حواست به رعد و برق باشه، موبایلت رو بزن شارژ ⛈❤' : 'Thunderstorms there — keep your phone charged ⛈❤'
  if (daughter.icon === 'snow' || (code >= 71 && code <= 86)) {
    return fa ? 'برف میاد؛ خودت رو گرم نگه دار، بغلم همیشه برات بازه ❄️❤' : 'Snow there — stay warm, my arms are always open ❄️❤'
  }
  if (daughter.icon === 'rain' || (code >= 51 && code <= 67)) {
    return fa ? 'اونجا بارونه؛ چتر یادت نره، من هوات رو دارم ☔❤' : 'It is raining there — take an umbrella, I am looking after you ☔❤'
  }
  if (daughter.icon === 'fog') return fa ? 'اونجا مه گرفته؛ آروم برو و حواست به خودت باشه 🌫❤' : 'It is foggy there — walk slowly and take care 🌫❤'
  if (daughter.uv != null && daughter.uv >= 8) return fa ? 'آفتاب تنده؛ کرم ضدآفتاب و آب یادت نره ☀️❤' : 'The sun is strong — sunscreen and water ☀️❤'
  if (daughter.temp != null && daughter.temp >= 33) return fa ? 'هوا خیلی گرمه؛ آب زیاد بخور دخترم 🍉❤' : 'It is very hot — drink plenty of water 🍉❤'
  if (daughter.temp != null && daughter.temp <= 3) return fa ? 'هوا سرده؛ شال‌گردنت رو یادت نره 🧣❤' : 'It is cold — do not forget your scarf 🧣❤'
  return ''
}
