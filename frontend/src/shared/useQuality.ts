/**
 * useQuality — لایه‌ی کیفیت مؤثر برای صحنه‌های سه‌بعدی
 */
import { useEffect, useState } from 'react'

import {
  measureFpsCached,
  normalizeChoice,
  probeCapability,
  resolveTier,
  type QualityChoice,
  type QualityDecision,
  type QualityTier,
} from './quality'
import { getStoredSettings } from './prefs'
import { useOS } from './store'

let bootDecision: QualityDecision | null = null

export function getEffectiveTier(): QualityTier {
  return bootDecision?.tier ?? 'balanced'
}

export function useQuality(): QualityDecision {
  const config = useOS((s) => s.config)
  const [decision, setDecision] = useState<QualityDecision>(
    () =>
      bootDecision ??
      resolveTier(
        normalizeChoice(config?.ui_quality ?? getStoredSettings().ui_quality ?? 'auto'),
        probeCapability(),
        null,
      ),
  )

  useEffect(() => {
    const choice = normalizeChoice(config?.ui_quality ?? getStoredSettings().ui_quality ?? 'auto') as QualityChoice
    let cancelled = false
    void (async () => {
      const fps = await measureFpsCached()
      if (cancelled) return
      const d = resolveTier(choice, probeCapability(), fps)
      bootDecision = d
      setDecision(d)
    })()
    return () => {
      cancelled = true
    }
  }, [config?.ui_quality])

  return decision
}
