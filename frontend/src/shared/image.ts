/**
 * image.ts — کوچک‌سازی تصویر سمت کاربر قبل از آپلود
 * تا آپلود‌ها سبک و سریع بمانند و سرور زیر بار فایل‌های عظیم نرود.
 */

export interface ResizedImage {
  blob: Blob
  preview: string
}

/** تصویر را به‌طور متناسب کوچک می‌کند (عرض بیشینه maxW) و JPEG برمی‌گرداند */
export async function resizeImage(file: File, maxW = 1280, quality = 0.82): Promise<ResizedImage> {
  const url = URL.createObjectURL(file)
  try {
    const img = await loadImage(url)
    const scale = Math.min(1, maxW / img.naturalWidth)
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no canvas')
    ctx.drawImage(img, 0, 0, w, h)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality)
    })
    return { blob, preview: URL.createObjectURL(blob) }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load failed'))
    img.src = src
  })
}

/** فایل JPEG از Blob — با اسم مناسب برای آپلود */
export function blobToUploadFile(blob: Blob, baseName: string): File {
  const name = `${baseName.replace(/\.[a-z0-9]+$/i, '') || 'loveos'}.jpg`
  return new File([blob], name, { type: 'image/jpeg' })
}
