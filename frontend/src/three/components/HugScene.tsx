import { useCallback, useEffect, useRef } from 'react'

import { createHugScene, type HugMode, type HugSceneHandle } from '../scenes/hug'
import type { SceneFactoryInput } from '../useThreeScene'
import { ThreeCanvas } from './ThreeCanvas'

interface Props {
  mode: HugMode
  modeToken: number
  fallback: React.ReactNode
}

export default function HugSceneView({ mode, modeToken, fallback }: Props) {
  const handleRef = useRef<HugSceneHandle | null>(null)

  useEffect(() => {
    if (modeToken > 0) handleRef.current?.trigger(mode)
  }, [mode, modeToken])

  const factory = useCallback((input: SceneFactoryInput) => {
    const api = createHugScene(input)
    handleRef.current = api
    return api
  }, [])

  return (
    <ThreeCanvas factory={factory} className="absolute inset-0 h-full w-full" fallback={fallback} deps={[]} />
  )
}
