/**
 * mood.ts — فضای احساسی سه‌بعدی (ذرات + رنگ محیطی)
 */
import * as THREE from 'three'

import type { SceneApi, SceneFactoryInput } from '../useThreeScene'

/** پالت هر حال */
export const MOOD_COLORS: Record<string, number> = {
  happy: 0xffd56a,
  missing: 0xb794f6,
  tired: 0x90cdf4,
  sad: 0x63b3ed,
  excited: 0xfc8181,
  sleepy: 0xa0aec0,
  custom: 0xf687b3,
}

export function moodColor(mood: string): number {
  return MOOD_COLORS[mood] ?? MOOD_COLORS.custom
}

export interface MoodSceneHandle extends SceneApi {
  setMood(mood: string | null): void
}

export function createMoodScene(input: SceneFactoryInput): MoodSceneHandle {
  const { scene, camera, tier } = input

  const amb = new THREE.AmbientLight(0xffe8f4, 0.5)
  scene.add(amb)
  const pt = new THREE.PointLight(0xf767a8, 1.1, 14)
  pt.position.set(0, 2, 3)
  scene.add(pt)

  const N = tier === 'dream' ? 80 : 40
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(N * 3)
  const seed = new Float32Array(N)
  for (let i = 0; i < N; i += 1) {
    seed[i] = Math.random() * Math.PI * 2
    pos[i * 3] = (Math.random() - 0.5) * 6
    pos[i * 3 + 1] = (Math.random() - 0.5) * 4
    pos[i * 3 + 2] = (Math.random() - 0.5) * 4
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xf9a8d4,
    size: 0.1,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })
  const pts = new THREE.Points(geo, mat)
  scene.add(pts)

  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0xf767a8,
      emissive: 0xd6467f,
      emissiveIntensity: 0.35,
      roughness: 0.45,
      transparent: true,
      opacity: 0.9,
    }),
  )
  scene.add(orb)

  camera.position.set(0, 0.5, 5)
  camera.lookAt(0, 0, 0)

  let current = 0xf767a8
  let target = 0xf767a8
  const tmp = new THREE.Color()
  const tmp2 = new THREE.Color()

  return {
    setMood(mood) {
      target = mood ? moodColor(mood) : 0xf767a8
    },
    update(dt, elapsed) {
      tmp.setHex(current)
      tmp2.setHex(target)
      tmp.lerp(tmp2, Math.min(1, dt * 2.2))
      current = tmp.getHex()
      mat.color.copy(tmp)
      ;(orb.material as THREE.MeshStandardMaterial).color.copy(tmp)
      ;(orb.material as THREE.MeshStandardMaterial).emissive.copy(tmp).multiplyScalar(0.5)
      pt.color.copy(tmp)

      const breath = 1 + Math.sin(elapsed * 1.2) * 0.06
      orb.scale.setScalar(breath)

      for (let i = 0; i < N; i += 1) {
        const a = seed[i] + elapsed * 0.25
        const r = 1.2 + (i % 5) * 0.35
        pos[i * 3] = Math.cos(a) * r + Math.sin(elapsed * 0.5 + i) * 0.2
        pos[i * 3 + 1] = Math.sin(elapsed * 0.7 + seed[i]) * 1.4
        pos[i * 3 + 2] = Math.sin(a) * r * 0.7
      }
      geo.attributes.position.needsUpdate = true
      orb.rotation.y += dt * 0.25
    },
    dispose() {
      geo.dispose()
      mat.dispose()
      orb.geometry.dispose()
      ;(orb.material as THREE.Material).dispose()
    },
  }
}
