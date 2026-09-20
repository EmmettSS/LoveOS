/**
 * notify-sw.js — قطعه‌ی سرویس‌ورکرِ LoveOS برای اعلان‌های گوشی
 *
 * vite-plugin-pwa این فایل را داخلِ سرویس‌ورکرِ ساخته‌شده import می‌کند
 * (workbox.importScripts در vite.config.ts). کارش یک چیز است: وقتی روی اعلانِ
 * گوشی ضربه زده شد، LoveOS را بیاورد جلو — و اگر باز بود، همان پنجره را
 * فوکوس کند (نه اینکه چند نسخه باز شود).
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const url = data.url || '/'

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if ('focus' in client) {
          try {
            if ('navigate' in client && url !== '/') await client.navigate(url)
          } catch {
            /* بی‌خیال — فوکوس مهم‌تر است */
          }
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    })(),
  )
})
