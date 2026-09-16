import { useCallback, useEffect, useRef } from 'react'

import { createMoodScene, type MoodSceneHandle } from '../scenes/mood'
import type { SceneFactoryInput } from '../useThreeScene'
import { ThreeCanvas } from './ThreeCanvas'

interface Props {
  mood: string | null
  fallback: React.ReactNode
}

export default function MoodSceneView({ mood, fallback }: Props) {
  const handleRef = useRef<MoodSceneHandle | null>(null)

  useEffect(() => {
    handleRef.current?.setMood(mood)
  }, [mood])

  const factory = useCallback((input: SceneFactoryInput) => {
    const api = createMoodScene(input)
    handleRef.current = api
    api.setMood(mood)
    return api
  }, [])

  return (
    <ThreeCanvas factory={factory} className="absolute inset-0 h-full w-full opacity-90" fallback={fallback} deps={[]} />
  )
}
