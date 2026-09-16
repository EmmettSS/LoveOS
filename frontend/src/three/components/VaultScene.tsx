import { useCallback, useEffect, useRef } from 'react'

import { createVaultScene, type VaultSceneHandle } from '../scenes/vault'
import type { SceneFactoryInput } from '../useThreeScene'
import { ThreeCanvas } from './ThreeCanvas'

interface Props {
  open: boolean
  shakeToken?: number
  fallback: React.ReactNode
}

export default function VaultSceneView({ open, shakeToken = 0, fallback }: Props) {
  const handleRef = useRef<VaultSceneHandle | null>(null)

  useEffect(() => {
    handleRef.current?.setOpen(open ? 1 : 0)
  }, [open])

  useEffect(() => {
    if (shakeToken > 0) handleRef.current?.shake()
  }, [shakeToken])

  const factory = useCallback((input: SceneFactoryInput) => {
    const api = createVaultScene(input)
    handleRef.current = api
    api.setOpen(open ? 1 : 0)
    return api
  }, [open])

  return (
    <ThreeCanvas factory={factory} className="mx-auto h-48 w-full max-w-sm" fallback={fallback} deps={[]} />
  )
}
