import { useCallback, useEffect, useRef } from 'react'

import { createHeartbeatScene, type HeartbeatSceneHandle } from '../scenes/heartbeat'
import type { SceneFactoryInput } from '../useThreeScene'
import { ThreeCanvas } from './ThreeCanvas'

interface Props {
  bpm: number
  holding: boolean
  fallback: React.ReactNode
}

export default function HeartbeatSceneView({ bpm, holding, fallback }: Props) {
  const handleRef = useRef<HeartbeatSceneHandle | null>(null)

  useEffect(() => {
    handleRef.current?.setBpm(bpm)
  }, [bpm])
  useEffect(() => {
    handleRef.current?.setHolding(holding)
  }, [holding])

  const factory = useCallback((input: SceneFactoryInput) => {
    const api = createHeartbeatScene(input)
    handleRef.current = api
    api.setBpm(bpm)
    api.setHolding(holding)
    return api
  }, [])

  return (
    <ThreeCanvas factory={factory} className="mx-auto h-56 w-full max-w-xs" fallback={fallback} deps={[]} />
  )
}
