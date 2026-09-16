/**
 * hug.ts — صحنه‌ی آغوش سه‌بعدی
 * حالت idle: قلب‌های شناور؛ burst هنگام ارسال؛ embrace هنگام باز کردن.
 */
import * as THREE from 'three'

import type { SceneApi, SceneFactoryInput } from '../useThreeScene'

export type HugMode = 'idle' | 'burst' | 'embrace'

export interface HugSceneHandle extends SceneApi {
  trigger(mode: HugMode): void
}

export function createHugScene(input: SceneFactoryInput): HugSceneHandle {
  const { scene, camera, tier } = input

  scene.add(new THREE.AmbientLight(0xffe0f0, 0.65))
  const glow = new THREE.PointLight(0xff8ab8, 1.2, 18)
  glow.position.set(0, 1, 3)
  scene.add(glow)

  const N = tier === 'dream' ? 36 : 20
  const geo = new THREE.BufferGeometry()
  const pos = new Float32Array(N * 3)
  const base = new Float32Array(N * 3)
  for (let i = 0; i < N; i += 1) {
    const a = (i / N) * Math.PI * 2
    const r = 1.2 + (i % 5) * 0.35
    base[i * 3] = Math.cos(a) * r
    base[i * 3 + 1] = (i % 7) * 0.25 - 0.8
    base[i * 3 + 2] = Math.sin(a) * r * 0.6
    pos[i * 3] = base[i * 3]
    pos[i * 3 + 1] = base[i * 3 + 1]
    pos[i * 3 + 2] = base[i * 3 + 2]
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color: 0xff9ecb,
    size: 0.22,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
  })
  const points = new THREE.Points(geo, mat)
  scene.add(points)

  // دو «بازو»/هاله برای embrace
  const armL = new THREE.Mesh(
    new THREE.TorusGeometry(1.6, 0.18, 10, 48, Math.PI),
    new THREE.MeshStandardMaterial({
      color: 0xffb3d4,
      transparent: true,
      opacity: 0,
      roughness: 0.5,
      emissive: 0xff6aa8,
      emissiveIntensity: 0.3,
    }),
  )
  armL.rotation.z = Math.PI / 2
  armL.position.set(-0.2, 0, 0)
  const armR = armL.clone()
  armR.rotation.z = -Math.PI / 2
  armR.position.set(0.2, 0, 0)
  scene.add(armL, armR)

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 24, 24),
    new THREE.MeshStandardMaterial({
      color: 0xf767a8,
      emissive: 0xd6467f,
      emissiveIntensity: 0.4,
      roughness: 0.4,
    }),
  )
  scene.add(core)

  camera.position.set(0, 0.4, 6)
  camera.lookAt(0, 0, 0)

  let mode: HugMode = 'idle'
  let modeT = 0

  return {
    trigger(m) {
      mode = m
      modeT = 0
    },
    update(dt, elapsed) {
      modeT += dt
      glow.intensity = 1.1 + Math.sin(elapsed * 2) * 0.2

      if (mode === 'idle') {
        for (let i = 0; i < N; i += 1) {
          pos[i * 3] = base[i * 3] + Math.sin(elapsed * 0.8 + i) * 0.15
          pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(elapsed * 0.6 + i * 0.4) * 0.35
          pos[i * 3 + 2] = base[i * 3 + 2]
        }
        core.scale.setScalar(1 + Math.sin(elapsed * 1.5) * 0.06)
        ;(armL.material as THREE.MeshStandardMaterial).opacity = 0
        ;(armR.material as THREE.MeshStandardMaterial).opacity = 0
      } else if (mode === 'burst') {
        const t = Math.min(1, modeT / 1.1)
        for (let i = 0; i < N; i += 1) {
          const a = (i / N) * Math.PI * 2
          const r = 0.3 + t * (2.8 + (i % 4) * 0.4)
          pos[i * 3] = Math.cos(a) * r
          pos[i * 3 + 1] = Math.sin(a * 2) * r * 0.4
          pos[i * 3 + 2] = Math.sin(a) * r
        }
        core.scale.setScalar(1.2 + t * 0.5)
        mat.opacity = 1 - t * 0.7
        glow.intensity = 2.5 * (1 - t * 0.5)
        if (t >= 1) {
          mode = 'idle'
          mat.opacity = 0.85
        }
      } else if (mode === 'embrace') {
        const t = Math.min(1, modeT / 1.6)
        const open = t < 0.5 ? t * 2 : 1 - (t - 0.5) * 0.3
        ;(armL.material as THREE.MeshStandardMaterial).opacity = open * 0.85
        ;(armR.material as THREE.MeshStandardMaterial).opacity = open * 0.85
        armL.rotation.y = -0.4 + t * 0.9
        armR.rotation.y = 0.4 - t * 0.9
        core.scale.setScalar(1.15 + Math.sin(t * Math.PI) * 0.35)
        for (let i = 0; i < N; i += 1) {
          const a = (i / N) * Math.PI * 2
          const r = 1.8 - t * 1.1
          pos[i * 3] = Math.cos(a + elapsed) * r
          pos[i * 3 + 1] = Math.sin(elapsed + i) * 0.5
          pos[i * 3 + 2] = Math.sin(a) * r * 0.5
        }
        if (t >= 1) {
          mode = 'idle'
          ;(armL.material as THREE.MeshStandardMaterial).opacity = 0
          ;(armR.material as THREE.MeshStandardMaterial).opacity = 0
        }
      }
      geo.attributes.position.needsUpdate = true
      core.rotation.y += dt * 0.4
    },
    dispose() {
      geo.dispose()
      mat.dispose()
      core.geometry.dispose()
      ;(core.material as THREE.Material).dispose()
      armL.geometry.dispose()
      ;(armL.material as THREE.Material).dispose()
      armR.geometry.dispose()
      ;(armR.material as THREE.Material).dispose()
    },
  }
}
