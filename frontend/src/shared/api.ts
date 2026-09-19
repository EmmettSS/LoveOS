/**
 * api.ts — لایه‌ی ارتباط با بک‌اند
 * همه‌ی مسیرها نسبی‌اند (/api/...) تا از پشت هر دامنه‌ای کار کند.
 */

const TOKEN_KEY = 'loveos_token'

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY) || '',
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

/** آدرس فایل‌های رسانه با توکن (برای پخش مستقیم در <audio>) */
export function mediaUrl(path?: string | null): string {
  if (!path) return ''
  if (path.startsWith('http')) return path
  return path
}

export class ApiRequestError extends Error {
  readonly status: number
  readonly payload: unknown

  constructor(status: number, message: string, payload: unknown = null) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.payload = payload
  }
}

type Options = {
  method?: string
  body?: unknown
  formData?: FormData
  signal?: AbortSignal
  /**
   * مهلت درخواست به میلی‌ثانیه (پیش‌فرض ۱۵ ثانیه). صفر یعنی بدون مهلت.
   * بدون این مهلت، یک fetch که هیچ‌وقت settle نشود اپ را برای همیشه در
   * حالت لودینگ/سفید نگه می‌دارد؛ با مهلت، همه‌ی اپ‌ها به حالت خطای
   * قابل‌دیدن (با دکمه‌ی تلاش دوباره) می‌روند.
   */
  timeoutMs?: number
}

/** مهلت پیش‌فرض همه‌ی درخواست‌ها — در تست‌ها با __LOVEOS_API_TIMEOUT_MS کوتاه می‌شود. */
const DEFAULT_TIMEOUT_MS = 15_000

function defaultTimeoutMs(): number {
  const override = (globalThis as { __LOVEOS_API_TIMEOUT_MS?: unknown }).__LOVEOS_API_TIMEOUT_MS
  return typeof override === 'number' && override >= 0 ? override : DEFAULT_TIMEOUT_MS
}

export async function api<T = any>(path: string, opts: Options = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = tokenStore.get()
  if (token) headers.Authorization = `Token ${token}`

  let body: BodyInit | undefined
  if (opts.formData) {
    body = opts.formData
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(opts.body)
  }

  // ترکیب سیگنال بیرونی (لغو از طرف کامپوننت) با مهلت داخلی: هر کدام که
  // زودتر بیاید fetch را قطع می‌کند، ولی فقط مهلتِ داخلی خطای «طول کشید»
  // می‌دهد تا لغوهای عادی (مثل unmount) رفتار قبلی‌شان را حفظ کنند.
  const controller = new AbortController()
  const outer = opts.signal
  const onOuterAbort = () => controller.abort()
  if (outer) {
    if (outer.aborted) controller.abort()
    else outer.addEventListener('abort', onOuterAbort, { once: true })
  }
  const timeout = opts.timeoutMs ?? defaultTimeoutMs()
  let timedOut = false
  let timer: ReturnType<typeof setTimeout> | undefined
  if (timeout > 0) {
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, timeout)
  }

  try {
    const res = await fetch(`/api${path}`, {
      method: opts.method || (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: controller.signal,
    })

    if (res.status === 401) {
      tokenStore.clear()
      window.dispatchEvent(new CustomEvent('loveos:locked'))
      throw new Error('locked')
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      let payload: unknown = null
      let message = text || `HTTP ${res.status}`
      try {
        payload = text ? JSON.parse(text) : null
        if (payload && typeof payload === 'object') {
          const candidate = payload as { message?: unknown; detail?: unknown }
          message = String(candidate.message || candidate.detail || message)
        }
      } catch {
        // پاسخ‌های غیر JSON (مثلاً خطای reverse proxy) همان متن خام را نگه می‌دارند.
      }
      throw new ApiRequestError(res.status, message, payload)
    }
    if (res.status === 204) return undefined as T
    const contentType = res.headers?.get?.('content-type') || 'application/json'
    if (!contentType.includes('application/json')) return undefined as T
    return (await res.json()) as T
  } catch (e) {
    // فقط وقتی خودِ مهلت باعث لغو شده خطای روشن می‌دهیم؛ لغوهای بیرونی
    // (unmount، درخواست تازه‌تر) همان AbortError قبلی می‌مانند.
    if (timedOut) throw new ApiRequestError(0, 'اتصال به سرور طول کشید', null)
    throw e
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    outer?.removeEventListener('abort', onOuterAbort)
  }
}

export const get = <T = any>(p: string, opts: Options = {}) => api<T>(p, opts)
export const post = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'POST', body })
export const patch = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'PATCH', body })
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' })
// آپلود فایل (ویس/آهنگ/عکس) روی خطِ کُند ذاتاً طول می‌کشد؛ مهلتش جداست تا بی‌دلیل قطع نشود.
export const upload = <T = any>(p: string, fd: FormData) => api<T>(p, { method: 'POST', formData: fd, timeoutMs: 120_000 })
