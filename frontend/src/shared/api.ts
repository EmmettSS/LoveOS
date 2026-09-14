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

type Options = {
  method?: string
  body?: unknown
  formData?: FormData
  signal?: AbortSignal
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

  const res = await fetch(`/api${path}`, {
    method: opts.method || (body ? 'POST' : 'GET'),
    headers,
    body,
    signal: opts.signal,
  })

  if (res.status === 401) {
    tokenStore.clear()
    window.dispatchEvent(new CustomEvent('loveos:locked'))
    throw new Error('locked')
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const get = <T = any>(p: string, opts: Options = {}) => api<T>(p, opts)
export const post = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'POST', body })
export const patch = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'PATCH', body })
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' })
export const upload = <T = any>(p: string, fd: FormData) => api<T>(p, { method: 'POST', formData: fd })
