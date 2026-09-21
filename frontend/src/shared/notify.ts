/**
 * notify.ts — اعلانِ واقعیِ گوشی (نه فقط مرکزِ اعلانِ داخلِ LoveOS)
 *
 * چرا لازم است؟
 *   «اجازه‌ی اعلان» تا وقتی کسی از آن استفاده نکند هیچ اثری ندارد. این ماژول
 *   همان یک قدمِ آخر است: وقتی خبرِ تازه‌ای برای دخترم می‌رسد و اپ در
 *   پس‌زمینه است، اعلان را روی خودِ گوشی نشان می‌دهد.
 *
 * نکته‌ی مهم (مرورگرها):
 *   • روی اندروید، ``new Notification()`` خطا می‌دهد؛ اعلان باید از دلِ
 *     سرویس‌ورکر بیاید: ``ServiceWorkerRegistration.showNotification``.
 *   • پس اول سراغِ سرویس‌ورکر می‌رویم و اگر نبود (مثلاً حالتِ توسعه که PWA ثبت
 *     نمی‌شود) با احتیاط ``new Notification`` را امتحان می‌کنیم.
 *   • هیچ‌وقت استثنا پرت نمی‌کند؛ اعلان «خوبی» است، نه بخشِ حیاتی.
 */

/** آیا کاربر اجازه‌ی اعلان داده؟ (بدونِ پرسیدن — فقط خواندن) */
export function systemNotificationsAllowed(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) return false
  try {
    return Notification.permission === 'granted'
  } catch {
    return false
  }
}

interface NotificationExtras {
  body?: string
  tag?: string
  /** آپِ مقصد وقتی روی اعلان ضربه زده شد */
  app?: string
}

/**
 * یک اعلانِ واقعیِ گوشی نشان می‌دهد. خروجی: true اگر واقعاً نشان داده شد.
 */
export async function showSystemNotification(
  title: string,
  { body = '', tag, app }: NotificationExtras = {},
): Promise<boolean> {
  if (!systemNotificationsAllowed()) return false
  const icon = '/icons/app-192.png'
  const options: NotificationOptions = {
    body,
    icon,
    badge: icon,
    tag: tag || 'loveos',
    dir: 'rtl',
    lang: 'fa',
    data: { app: app || '', url: app ? `/?app=${encodeURIComponent(app)}` : '/' },
  }

  // ۱) راهِ درست: اعلان از سرویس‌ورکر (اندروید فقط همین را قبول می‌کند)
  try {
    const serviceWorker = navigator.serviceWorker
    if (serviceWorker) {
      const registration =
        (await serviceWorker.getRegistration()) ??
        (await Promise.race([
          serviceWorker.ready,
          new Promise<undefined>((resolve) => window.setTimeout(() => resolve(undefined), 3000)),
        ]))
      if (registration?.showNotification) {
        await registration.showNotification(title, options)
        return true
      }
    }
  } catch {
    /* می‌رویم سراغ راهِ دوم */
  }

  // ۲) پناهگاه: Notification مستقیم (دسکتاپ و برخی مرورگرهای اندرویدی)
  try {
    const notification = new Notification(title, options)
    notification.onclick = () => {
      try {
        window.focus()
        if (app) window.location.hash = `#${app}`
        notification.close()
      } catch {
        /* ignore */
      }
    }
    return true
  } catch {
    return false
  }
}
