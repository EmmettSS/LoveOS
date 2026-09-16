/**
 * garden.ts — صحنه‌ی باغچه‌ی سه‌بعدی
 *
 * زمین + چند گل procedural بر اساس stage(water_count) + آب‌پاش که کج می‌شود
 * و ذرات آب می‌ریزد. منطق خالص و قابل‌تست در jsdom (بدون WebGL).
 */
import * as THREE from 'three'

import type { SceneApi, SceneFactoryInput } from '../useThreeScene'

export interface GardenFlower {
  id: number
  name: string
  color: string
  emoji: string
  water_count: number
}

export interface GardenSceneHandle extends SceneApi {
  /** آب‌دادن به گل؛ انیمیشن آب‌پاش + ذرات */
  water(flowerId: number): void
  pick(clientX: number, clientY: number): number | null
}

/** رشد گل در ۵ مرحله — همان فرمول Garden.tsx */
export function flowerStage(n: number): number {
  return Math.min(5, Math.floor(n / 2) + (n > 0 ? 1 : 0))
}

/** ارتفاع ساقه بر اساس مرحله */
export function stemHeight(stage: number): number {
  return 0.4 + stage * 0.35
}

function toColor(c: string): THREE.Color {
  try {
    return new THREE.Color(c || '#f9a8d4')
  } catch {
    return new THREE.Color('#f9a8d4')
  }
}

export function createGardenScene(
  input: SceneFactoryInput,
  getFlowers: () => GardenFlower[],
): GardenSceneHandle {
  const { scene, camera, renderer, tier } = input
  const el = renderer.domElement

  scene.add(new THREE.AmbientLight(0xfff5e8, 0.7))
  const sun = new THREE.DirectionalLight(0xffe6b8, tier === 'dream' ? 1.25 : 0.95)
  sun.position.set(8, 14, 6)
  if (tier === 'dream') {
    sun.castShadow = true
    sun.shadow.mapSize.set(512, 512)
    renderer.shadowMap.enabled = true
  }
  scene.add(sun)
  scene.add(new THREE.HemisphereLight(0xb8d4ff, 0x6a8f4a, 0.45))

  // زمین
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 48),
    new THREE.MeshStandardMaterial({ color: 0x4a7c3f, roughness: 0.95, metalness: 0 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const soil = new THREE.Mesh(
    new THREE.CircleGeometry(11, 40),
    new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 1 }),
  )
  soil.rotation.x = -Math.PI / 2
  soil.position.y = 0.02
  scene.add(soil)

  const plants = new THREE.Group()
  scene.add(plants)

  // آب‌پاش procedural
  const can = new THREE.Group()
  const canBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.42, 0.9, 12),
    new THREE.MeshStandardMaterial({ color: 0x5b9bd5, roughness: 0.45, metalness: 0.35 }),
  )
  canBody.position.y = 0.45
  const spout = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.12, 0.7, 8),
    new THREE.MeshStandardMaterial({ color: 0x4a8ac0, roughness: 0.4, metalness: 0.4 }),
  )
  spout.rotation.z = Math.PI / 2.4
  spout.position.set(0.55, 0.85, 0)
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.28, 0.05, 8, 16, Math.PI),
    new THREE.MeshStandardMaterial({ color: 0x3a6a90, roughness: 0.5, metalness: 0.3 }),
  )
  handle.rotation.y = Math.PI / 2
  handle.position.set(-0.15, 0.7, 0)
  can.add(canBody, spout, handle)
  can.position.set(5.5, 0, 3.5)
  scene.add(can)

  // ذرات آب
  const DROP_N = tier === 'dream' ? 48 : 24
  const dropGeo = new THREE.BufferGeometry()
  const dropPos = new Float32Array(DROP_N * 3)
  dropGeo.setAttribute('position', new THREE.BufferAttribute(dropPos, 3))
  const dropMat = new THREE.PointsMaterial({
    color: 0xa8d8ff,
    size: 0.12,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  const drops = new THREE.Points(dropGeo, dropMat)
  scene.add(drops)

  interface PlantNode {
    id: number
    group: THREE.Group
    pot: THREE.Mesh
    stem: THREE.Mesh
    bloom: THREE.Group
    baseX: number
  }

  let nodes: PlantNode[] = []
  let builtKey = ''
  let watering = false
  let waterT = 0
  let waterTarget: THREE.Vector3 | null = null
  let wet = 0

  const clearPlants = () => {
    for (const n of nodes) {
      n.group.traverse((o) => {
        const m = o as THREE.Mesh
        m.geometry?.dispose()
        const mat = m.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
        else mat?.dispose()
      })
      plants.remove(n.group)
    }
    nodes = []
  }

  const build = (flowers: GardenFlower[]) => {
    clearPlants()
    const n = flowers.length || 1
    flowers.forEach((f, i) => {
      const g = new THREE.Group()
      const x = (i - (n - 1) / 2) * 2.6
      g.position.set(x, 0, 0)

      const potMat = new THREE.MeshStandardMaterial({ color: 0xc48a6a, roughness: 0.85 })
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.32, 0.5, 12), potMat)
      pot.position.y = 0.25
      pot.castShadow = true
      g.add(pot)

      const st = flowerStage(f.water_count)
      const h = stemHeight(st)
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.07, h, 6),
        new THREE.MeshStandardMaterial({ color: 0x5fbf63, roughness: 0.8 }),
      )
      stem.position.y = 0.5 + h / 2
      g.add(stem)

      const bloom = new THREE.Group()
      bloom.position.y = 0.5 + h
      const col = toColor(f.color)
      if (st >= 4) {
        for (let p = 0; p < 5; p += 1) {
          const petal = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 8),
            new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 }),
          )
          const a = (p / 5) * Math.PI * 2
          petal.position.set(Math.cos(a) * 0.22, 0.08, Math.sin(a) * 0.22)
          petal.scale.set(1, 0.55, 1)
          bloom.add(petal)
        }
        const center = new THREE.Mesh(
          new THREE.SphereGeometry(0.12, 8, 8),
          new THREE.MeshStandardMaterial({ color: 0xffe08a, roughness: 0.4 }),
        )
        bloom.add(center)
      } else if (st > 0) {
        const bud = new THREE.Mesh(
          new THREE.SphereGeometry(0.12 + st * 0.03, 8, 8),
          new THREE.MeshStandardMaterial({ color: col, roughness: 0.6 }),
        )
        bloom.add(bud)
      }
      if (st >= 2) {
        const leaf = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x7ccb80, roughness: 0.7 }),
        )
        leaf.scale.set(1.4, 0.35, 0.7)
        leaf.position.set(-0.22, -h * 0.35, 0)
        leaf.rotation.z = 0.5
        bloom.add(leaf)
      }
      if (st >= 3) {
        const leaf2 = new THREE.Mesh(
          new THREE.SphereGeometry(0.18, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0x7ccb80, roughness: 0.7 }),
        )
        leaf2.scale.set(1.4, 0.35, 0.7)
        leaf2.position.set(0.22, -h * 0.2, 0)
        leaf2.rotation.z = -0.5
        bloom.add(leaf2)
      }
      g.add(bloom)
      plants.add(g)
      nodes.push({ id: f.id, group: g, pot, stem, bloom, baseX: x })
    })
  }

  let yaw = 0.15
  let targetYaw = 0.15
  let pitch = 0.55
  let targetPitch = 0.55
  let dragging = false
  let lastX = 0
  let lastY = 0

  const applyCam = () => {
    const r = 11
    const p = Math.max(0.25, Math.min(1.1, pitch))
    camera.position.set(Math.sin(yaw) * r * Math.cos(p), 3.5 + Math.sin(p) * 6, Math.cos(yaw) * r * Math.cos(p))
    camera.lookAt(0, 1.2, 0)
  }
  camera.fov = 46
  camera.updateProjectionMatrix()
  applyCam()

  const onDown = (e: PointerEvent) => {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    el.setPointerCapture?.(e.pointerId)
  }
  const onMove = (e: PointerEvent) => {
    if (!dragging) return
    targetYaw -= (e.clientX - lastX) * 0.006
    targetPitch += (e.clientY - lastY) * 0.004
    lastX = e.clientX
    lastY = e.clientY
  }
  const onUp = () => {
    dragging = false
  }
  el.style.touchAction = 'none'
  el.addEventListener('pointerdown', onDown)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)

  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()

  const api: GardenSceneHandle = {
    water(flowerId) {
      const node = nodes.find((n) => n.id === flowerId)
      if (!node) return
      watering = true
      waterT = 0
      waterTarget = node.group.position.clone().add(new THREE.Vector3(0, 1.5, 0))
      can.position.set(node.baseX + 1.4, 0.2, 1.2)
      wet = 1
    },

    pick(clientX, clientY) {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return null
      ndc.x = ((clientX - r.left) / r.width) * 2 - 1
      ndc.y = -(((clientY - r.top) / r.height) * 2 - 1)
      raycaster.setFromCamera(ndc, camera)
      const meshes: THREE.Object3D[] = []
      for (const n of nodes) n.group.traverse((o) => meshes.push(o))
      const hits = raycaster.intersectObjects(meshes, false)
      for (const h of hits) {
        let o: THREE.Object3D | null = h.object
        while (o) {
          const found = nodes.find((n) => n.group === o)
          if (found) return found.id
          o = o.parent
        }
      }
      return null
    },

    update(dt, elapsed) {
      const flowers = getFlowers()
      const key = flowers.map((f) => `${f.id}:${f.water_count}:${f.color}`).join('|')
      if (key !== builtKey) {
        builtKey = key
        build(flowers)
      }

      const k = Math.min(1, dt * 5)
      yaw += (targetYaw - yaw) * k
      pitch += (targetPitch - pitch) * k
      applyCam()

      // باد ملایم
      for (const n of nodes) {
        n.bloom.rotation.z = Math.sin(elapsed * 1.4 + n.baseX) * 0.08
        n.stem.rotation.z = Math.sin(elapsed * 1.4 + n.baseX) * 0.04
      }

      if (watering && waterTarget) {
        waterT += dt
        const lean = Math.min(1, waterT * 2.2)
        can.rotation.z = -lean * 0.85
        dropMat.opacity = lean > 0.3 ? 0.85 : 0
        const origin = new THREE.Vector3()
        spout.getWorldPosition(origin)
        for (let i = 0; i < DROP_N; i += 1) {
          const t = (waterT * 2.5 + i * 0.07) % 1
          dropPos[i * 3] = origin.x + (waterTarget.x - origin.x) * t + Math.sin(i) * 0.15
          dropPos[i * 3 + 1] = origin.y + (waterTarget.y - origin.y) * t - t * t * 2.2
          dropPos[i * 3 + 2] = origin.z + (waterTarget.z - origin.z) * t + Math.cos(i) * 0.1
        }
        dropGeo.attributes.position.needsUpdate = true
        if (waterT > 1.1) {
          watering = false
          can.rotation.z = 0
          dropMat.opacity = 0
        }
      } else {
        can.rotation.z += (0 - can.rotation.z) * Math.min(1, dt * 4)
      }

      if (wet > 0) {
        wet = Math.max(0, wet - dt * 0.35)
        ;(soil.material as THREE.MeshStandardMaterial).color.setRGB(0.32 - wet * 0.08, 0.22 - wet * 0.04, 0.14)
      }
    },

    dispose() {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      clearPlants()
      dropGeo.dispose()
      dropMat.dispose()
    },
  }

  build(getFlowers())
  return api
}
