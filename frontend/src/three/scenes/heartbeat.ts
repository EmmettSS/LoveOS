/**
 * heartbeat.ts — قلب سه‌بعدی با تپش دوفازی (سیستول/دیاستول)
 */
import * as THREE from 'three'

import type { SceneApi, SceneFactoryInput } from '../useThreeScene'

export interface HeartbeatSceneHandle extends SceneApi {
  setBpm(bpm: number): void
  setHolding(v: boolean): void
}

/** فاز تپش ۰..۱ → ضریب scale (دو قله مثل قلب واقعی) */
export function beatScale(phase: number): { x: number; y: number; z: number } {
  // phase در یک دوره: دو انقباض
  const p = phase % 1
  let s = 1
  if (p < 0.12) s = 1 + Math.sin((p / 0.12) * Math.PI) * 0.18 // سیستول اول
  else if (p < 0.28) s = 1 + Math.sin(((p - 0.14) / 0.14) * Math.PI) * 0.1 // دیاستول کوچک
  else if (p < 0.4) s = 1 - Math.sin(((p - 0.28) / 0.12) * Math.PI) * 0.04
  return { x: s * 0.98, y: s * 1.05, z: s }
}

/** هندسه‌ی قلب low-poly از lathe تقریبی */
function makeHeartGeometry(): THREE.BufferGeometry {
  // ساخت از ادغام دو کره + مخروط (stylized)
  const shape = new THREE.Shape()
  for (let i = 0; i <= 64; i += 1) {
    const t = (i / 64) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    if (i === 0) shape.moveTo(x * 0.045, y * 0.045)
    else shape.lineTo(x * 0.045, y * 0.045)
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.7,
    bevelEnabled: true,
    bevelThickness: 0.18,
    bevelSize: 0.14,
    bevelSegments: 3,
    curveSegments: 12,
  })
  geo.center()
  geo.rotateX(Math.PI) // نوک پایین
  return geo
}

export function createHeartbeatScene(input: SceneFactoryInput): HeartbeatSceneHandle {
  const { scene, camera, tier } = input

  scene.add(new THREE.AmbientLight(0xffd0e8, 0.55))
  const key = new THREE.PointLight(0xff6aa8, 1.4, 20)
  key.position.set(2, 3, 4)
  scene.add(key)
  const rim = new THREE.PointLight(0xffc0e0, 0.6, 16)
  rim.position.set(-3, 1, -2)
  scene.add(rim)

  const geo = makeHeartGeometry()
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf767a8,
    roughness: 0.35,
    metalness: 0.08,
    emissive: 0x4a1028,
    emissiveIntensity: 0.25,
  })
  const heart = new THREE.Mesh(geo, mat)
  scene.add(heart)

  // حلقه‌های منتشرشونده
  const rings: THREE.Mesh[] = []
  for (let i = 0; i < (tier === 'dream' ? 3 : 2); i += 1) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.25, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff9ecb,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    ring.rotation.x = -0.3
    scene.add(ring)
    rings.push(ring)
  }

  // ذرات
  const PN = tier === 'dream' ? 40 : 18
  const pGeo = new THREE.BufferGeometry()
  const pPos = new Float32Array(PN * 3)
  const pPhase = new Float32Array(PN)
  for (let i = 0; i < PN; i += 1) {
    pPhase[i] = Math.random()
    pPos[i * 3] = 0
    pPos[i * 3 + 1] = 0
    pPos[i * 3 + 2] = 0
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3))
  const pMat = new THREE.PointsMaterial({
    color: 0xffb3d4,
    size: 0.08,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  })
  const particles = new THREE.Points(pGeo, pMat)
  scene.add(particles)

  camera.position.set(0, 0.3, 5.2)
  camera.lookAt(0, 0, 0)

  let bpm = 72
  let holding = false
  let phase = 0
  let ringIdx = 0
  let lastBeat = 0

  return {
    setBpm(v) {
      bpm = Math.max(40, Math.min(160, v))
    },
    setHolding(v) {
      holding = v
    },
    update(dt, elapsed) {
      phase += dt * (bpm / 60)
      const sc = beatScale(phase)
      const boost = holding ? 1.08 : 1
      heart.scale.set(sc.x * boost, sc.y * boost, sc.z * boost)
      heart.rotation.y = Math.sin(elapsed * 0.4) * 0.12
      mat.emissiveIntensity = 0.2 + (sc.y - 1) * 2.5

      // هر ضربان یک حلقه
      const beatN = Math.floor(phase)
      if (beatN !== lastBeat) {
        lastBeat = beatN
        const ring = rings[ringIdx % rings.length]
        ringIdx += 1
        ring.scale.setScalar(0.6)
        ;(ring.material as THREE.MeshBasicMaterial).opacity = 0.55
      }
      for (const ring of rings) {
        const op = (ring.material as THREE.MeshBasicMaterial).opacity
        if (op > 0.01) {
          ring.scale.multiplyScalar(1 + dt * 1.8)
          ;(ring.material as THREE.MeshBasicMaterial).opacity = op * (1 - dt * 1.6)
        }
      }

      for (let i = 0; i < PN; i += 1) {
        const t = (elapsed * 0.35 + pPhase[i]) % 1
        const a = pPhase[i] * Math.PI * 2
        const r = 0.4 + t * 1.8
        pPos[i * 3] = Math.cos(a + elapsed) * r
        pPos[i * 3 + 1] = (t - 0.3) * 2.2
        pPos[i * 3 + 2] = Math.sin(a + elapsed) * r
      }
      pGeo.attributes.position.needsUpdate = true
      key.intensity = 1.2 + (sc.y - 1) * 4
    },
    dispose() {
      geo.dispose()
      mat.dispose()
      pGeo.dispose()
      pMat.dispose()
      for (const r of rings) {
        r.geometry.dispose()
        ;(r.material as THREE.Material).dispose()
      }
    },
  }
}
