/**
 * StarmapSky — پوسته‌ی React برای آسمانِ سه‌بعدی
 */
import { useCallback, useMemo, useRef } from 'react'

import { createStarmapScene, heartStars, infinityStars, type StarmapShape } from '../scenes/starmap'
import type { SceneFactoryInput } from '../useThreeScene'
import { ThreeCanvas } from './ThreeCanvas'

export interface StarmapItem {
  id: number
  letter: string
  order: number
  message: string
  stars: [number, number][]
}

interface Props {
  items: StarmapItem[]
  activeId: number | null
  allLit: boolean
  onSelect: (id: number) => void
  onDoubleStar: (id: number) => void
  fallback: React.ReactNode
}

const SHAPE_HEART = -10
const SHAPE_INF = -11

export function buildStarmapShapes(
  items: StarmapItem[],
  activeId: number | null,
  allLit: boolean,
): StarmapShape[] {
  const letters: StarmapShape[] = items.map((c) => ({
    id: c.id,
    letter: c.letter,
    kind: 'letter',
    stars: c.stars || [],
    lit: allLit || activeId === c.id,
  }))
  const shapes: StarmapShape[] = [
    ...letters,
    {
      id: SHAPE_INF,
      letter: '∞',
      kind: 'shape',
      stars: infinityStars(36),
      lit: allLit || activeId === SHAPE_INF,
    },
    {
      id: SHAPE_HEART,
      letter: '♥',
      kind: 'shape',
      stars: heartStars(28),
      lit: allLit || activeId === SHAPE_HEART,
    },
  ]
  return shapes
}

export { SHAPE_HEART, SHAPE_INF }

export default function StarmapSky({ items, activeId, allLit, onSelect, onDoubleStar, fallback }: Props) {
  const shapesRef = useRef<StarmapShape[]>([])
  const lastTap = useRef<{ id: number; at: number } | null>(null)
  const handleRef = useRef<ReturnType<typeof createStarmapScene> | null>(null)

  shapesRef.current = buildStarmapShapes(items, activeId, allLit)

  const factory = useCallback((input: SceneFactoryInput) => {
    const api = createStarmapScene(input, () => shapesRef.current)
    handleRef.current = api
    // pick با double-tap روی canvas
    const el = input.renderer.domElement
    const onClick = (e: PointerEvent) => {
      // نزدیک‌ترین صورت فلکی بر اساس موقعیت نسبی x
      const rect = el.getBoundingClientRect()
      const nx = (e.clientX - rect.left) / Math.max(1, rect.width)
      const shapes = shapesRef.current
      if (!shapes.length) return
      // بر اساس فاصله تا مرکز هر slot
      let best = shapes[0]
      let bestD = 1
      shapes.forEach((s, i) => {
        const cx = (i + 0.5) / shapes.length
        const d = Math.abs(cx - nx)
        if (d < bestD) {
          bestD = d
          best = s
        }
      })
      if (bestD > 0.22) return
      const now = Date.now()
      if (lastTap.current && lastTap.current.id === best.id && now - lastTap.current.at < 420) {
        lastTap.current = null
        onDoubleStar(best.id)
        return
      }
      lastTap.current = { id: best.id, at: now }
      onSelect(best.id)
      api.focus(best.id)
    }
    el.addEventListener('click', onClick)
    const prevDispose = api.dispose
    api.dispose = () => {
      el.removeEventListener('click', onClick)
      prevDispose?.()
    }
    return api
  }, [onSelect, onDoubleStar])

  useMemo(() => {
    handleRef.current?.focus(activeId)
  }, [activeId])

  return (
    <ThreeCanvas
      factory={factory}
      className="absolute inset-0 h-full w-full"
      fallback={fallback}
      deps={[items.length]}
    />
  )
}
