import { useCallback, useRef } from 'react'

import { createGardenScene, type GardenFlower, type GardenSceneHandle } from '../scenes/garden'
import type { SceneFactoryInput } from '../useThreeScene'
import { ThreeCanvas } from './ThreeCanvas'

interface Props {
  flowers: GardenFlower[]
  onWater: (id: number) => void
  fallback: React.ReactNode
  waterRequest?: number | null
}

export default function GardenSceneView({ flowers, onWater, fallback, waterRequest }: Props) {
  const flowersRef = useRef(flowers)
  flowersRef.current = flowers
  const handleRef = useRef<GardenSceneHandle | null>(null)
  const lastWater = useRef<number | null>(null)

  if (waterRequest != null && waterRequest !== lastWater.current) {
    lastWater.current = waterRequest
    handleRef.current?.water(waterRequest)
  }

  const factory = useCallback((input: SceneFactoryInput) => {
    const api = createGardenScene(input, () => flowersRef.current)
    handleRef.current = api
    const el = input.renderer.domElement
    const onClick = (e: PointerEvent) => {
      const id = api.pick(e.clientX, e.clientY)
      if (id != null) onWater(id)
    }
    el.addEventListener('click', onClick)
    const prev = api.dispose
    api.dispose = () => {
      el.removeEventListener('click', onClick)
      prev?.()
    }
    return api
  }, [onWater])

  return (
    <ThreeCanvas factory={factory} className="absolute inset-0 h-full w-full" fallback={fallback} deps={[flowers.length]} />
  )
}
