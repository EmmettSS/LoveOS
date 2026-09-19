/**
 * starmapStars.ts — پاک‌سازی داده‌ی ستاره‌های آسمان
 *
 * ردیف‌های قدیمی دیتابیس ممکن است stars غیرمعمول داشته باشند (رشته، آرایه‌ی
 * تخت، null، NaN، …). این تابع خالص فقط جفت‌های [x, y] با هر دو عددِ متناهی
 * را نگه می‌دارد تا یک ردیف خراب نتواند آسمان را خالی یا سفید کند.
 * (جدا از Starmap.tsx تا Fast Refresh آن فایل نشکند.)
 */
export function sanitizeStars(stars: unknown): [number, number][] {
  if (!Array.isArray(stars)) return []
  const out: [number, number][] = []
  for (const p of stars) {
    if (!Array.isArray(p) || p.length !== 2) continue
    const [x, y] = p as [unknown, unknown]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.push([x as number, y as number])
  }
  return out
}
