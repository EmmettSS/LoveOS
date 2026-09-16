/**
 * ThreeCanvas — پوسته‌ی مشترک canvas برای همه‌ی صحنه‌های WebGL
 */
import { useEffect, useRef, useState } from 'react'

import { atLeast, probeCapability, type QualityTier } from '../../shared/quality'
import { useThreeScene, type SceneApi, type SceneFactoryInput } from '../useThreeScene'

interface Props {
  factory: (input: SceneFactoryInput) => SceneApi | null
  /** حداقل لایه برای WebGL؛ پیش‌فرض dream */
  minTier?: QualityTier
  className?: string
  style?: React.CSSProperties
  /** وقتی WebGL در دسترس نیست */
  fallback?: React.ReactNode
  onReady?: () => void
  deps?: unknown[]
}

export function ThreeCanvas({
  factory,
  minTier = 'dream',
  className,
  style,
  fallback,
  onReady,
  deps = [],
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const tierOk = atLeast(
    // در تست/بدون WebGL همیشه fallback
    probeCapability().webgl > 0 && !probeCapability().isTestEnv ? 'dream' : 'lite',
    minTier,
  )

  useThreeScene(
    canvasRef,
    {
      minTier,
      factory,
      onUnavailable: () => setUnavailable(true),
    },
    deps,
  )

  useEffect(() => {
    if (!unavailable && tierOk) onReady?.()
  }, [unavailable, tierOk, onReady])

  if (unavailable || !tierOk || probeCapability().isTestEnv || probeCapability().webgl === 0) {
    return <>{fallback ?? null}</>
  }

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', ...style }}
      aria-hidden
    />
  )
}
