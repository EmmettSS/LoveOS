import { useCallback, useRef } from 'react'

import { createRoomScene, type RoomBox, type RoomSceneHandle } from '../scenes/room'
import type { SceneFactoryInput } from '../useThreeScene'
import { ThreeCanvas } from './ThreeCanvas'

interface Props {
  rooms: RoomBox[]
  onSelect: (room: RoomBox) => void
  fallback: React.ReactNode
}

export default function DreamHomeMap3D({ rooms, onSelect, fallback }: Props) {
  const roomsRef = useRef(rooms)
  roomsRef.current = rooms
  const handleRef = useRef<RoomSceneHandle | null>(null)

  const factory = useCallback((input: SceneFactoryInput) => {
    const api = createRoomScene(input, () => roomsRef.current)
    handleRef.current = api
    const el = input.renderer.domElement
    let downX = 0
    let downY = 0
    let moved = 0
    const onDown = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
      moved = 0
    }
    const onMove = (e: PointerEvent) => {
      moved += Math.abs(e.clientX - downX) + Math.abs(e.clientY - downY)
    }
    const onUp = (e: PointerEvent) => {
      if (moved < 8) {
        const hit = api.pick(e.clientX, e.clientY)
        if (hit) onSelect(hit)
      }
    }
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    const prev = api.dispose
    api.dispose = () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      prev?.()
    }
    return api
  }, [onSelect])

  return (
    <ThreeCanvas
      factory={factory}
      className="h-full w-full rounded-2xl"
      style={{ minHeight: 280 }}
      fallback={fallback}
      deps={[rooms.map((r) => r.id).join(',')]}
    />
  )
}
