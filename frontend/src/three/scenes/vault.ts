/**
 * vault.ts — صندوقچه‌ی سه‌بعدی با درِ لولایی
 */
import * as THREE from 'three'

import type { SceneApi, SceneFactoryInput } from '../useThreeScene'

export interface VaultSceneHandle extends SceneApi {
  /** 0 قفل، 1 باز */
  setOpen(amount: number): void
  /** لرزش رمز اشتباه */
  shake(): void
}

/** زاویه‌ی در بر اساس میزان باز بودن (رادیان، منفی = باز به بالا) */
export function lidAngle(open: number): number {
  const t = Math.max(0, Math.min(1, open))
  // ease out
  const e = 1 - (1 - t) ** 3
  return -e * (Math.PI * 0.72)
}

export function createVaultScene(input: SceneFactoryInput): VaultSceneHandle {
  const { scene, camera, renderer, tier } = input

  scene.add(new THREE.AmbientLight(0xffe8d0, 0.55))
  const key = new THREE.DirectionalLight(0xfff0d8, 1.15)
  key.position.set(4, 8, 5)
  if (tier === 'dream') {
    key.castShadow = true
    renderer.shadowMap.enabled = true
  }
  scene.add(key)
  const fill = new THREE.PointLight(0xffc090, 0.5, 12)
  fill.position.set(-2, 2, 3)
  scene.add(fill)

  const wood = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.75, metalness: 0.05 })
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x5c3a1a, roughness: 0.8, metalness: 0.05 })
  const metal = new THREE.MeshStandardMaterial({ color: 0xc4a35a, roughness: 0.35, metalness: 0.7 })

  const body = new THREE.Group()
  const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 1.5), wood)
  box.position.y = 0.6
  box.castShadow = true
  body.add(box)
  // کف داخل
  const inner = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 1.2), woodDark)
  inner.position.y = 0.2
  body.add(inner)

  // در با لولا روی لبه‌ی عقب بالا
  const lidPivot = new THREE.Group()
  lidPivot.position.set(0, 1.2, -0.75)
  const lid = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 1.5), wood)
  lid.position.set(0, 0, 0.75)
  lid.castShadow = true
  lidPivot.add(lid)
  // نوار فلزی
  const band = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.08, 0.2), metal)
  band.position.set(0, 0.08, 0.75)
  lidPivot.add(band)
  body.add(lidPivot)

  // قفل
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.15), metal)
  lock.position.set(0, 0.7, 0.78)
  body.add(lock)

  scene.add(body)

  // اشیای داخل (نمایشی)
  const itemsGroup = new THREE.Group()
  itemsGroup.position.y = 0.35
  const colors = [0xf9a8d4, 0x93c5fd, 0xfde68a, 0xc4b5fd]
  for (let i = 0; i < 4; i += 1) {
    const it = new THREE.Mesh(
      new THREE.BoxGeometry(0.45, 0.12, 0.55),
      new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.5 }),
    )
    it.position.set(-0.7 + i * 0.48, 0.05, 0)
    it.visible = false
    itemsGroup.add(it)
  }
  body.add(itemsGroup)

  camera.position.set(0, 2.2, 4.2)
  camera.lookAt(0, 0.7, 0)

  let open = 0
  let targetOpen = 0
  let shakeT = 0
  let yaw = 0.25

  elDrag(renderer.domElement)

  let dragging = false
  let lastX = 0
  function elDrag(el: HTMLCanvasElement) {
    el.style.touchAction = 'none'
    el.addEventListener('pointerdown', (e) => {
      dragging = true
      lastX = e.clientX
      el.setPointerCapture?.(e.pointerId)
    })
    el.addEventListener('pointermove', (e) => {
      if (!dragging) return
      yaw -= (e.clientX - lastX) * 0.005
      lastX = e.clientX
    })
    el.addEventListener('pointerup', () => {
      dragging = false
    })
  }

  return {
    setOpen(v) {
      targetOpen = Math.max(0, Math.min(1, v))
    },
    shake() {
      shakeT = 0.45
    },
    update(dt) {
      open += (targetOpen - open) * Math.min(1, dt * 3.2)
      lidPivot.rotation.x = lidAngle(open)
      for (const c of itemsGroup.children) {
        ;(c as THREE.Mesh).visible = open > 0.55
      }
      fill.intensity = 0.35 + open * 0.9

      if (shakeT > 0) {
        shakeT -= dt
        body.rotation.z = Math.sin(shakeT * 40) * 0.08 * (shakeT / 0.45)
      } else {
        body.rotation.z *= 0.8
      }

      body.rotation.y = yaw
      const r = 4.4
      camera.position.set(Math.sin(yaw * 0.3) * r * 0.3, 2.2, r)
      camera.lookAt(0, 0.7, 0)
    },
    dispose() {
      body.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
    },
  }
}
