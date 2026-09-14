/**
 * daynight.ts — تم خودکار روز/شب
 * ۶ صبح تا ۱۸ عصر = روز، بقیه شب. تنظیمات می‌تواند دستی روز یا شب را قفل کند.
 */
import { useEffect, useState } from 'react'

import { useOS } from '../shared/store'

export function isNightNow(date = new Date()): boolean {
  const h = date.getHours()
  return h < 6 || h >= 18
}

export function useNightMode(): boolean {
  const theme = useOS((s) => s.config?.theme) || 'auto'
  const [night, setNight] = useState(() => (theme === 'auto' ? isNightNow() : theme === 'night'))

  useEffect(() => {
    const compute = () => setNight(theme === 'auto' ? isNightNow() : theme === 'night')
    compute()
    const id = setInterval(compute, 60_000)
    return () => clearInterval(id)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.theme = night ? 'night' : 'day'
  }, [night])

  return night
}
