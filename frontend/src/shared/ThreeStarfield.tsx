import { useEffect, useRef, useState } from 'react'

import { useVisualMode } from './visualMode'

/**
 * Starfield سبک و تنبل‌بارگذاری‌شده. اگر WebGL، context یا دستگاه آماده نبود،
 * هیچ canvasی ساخته نمی‌شود و Starmap به غبار SVG خود برمی‌گردد.
 */
export function ThreeStarfield() {
  const { mode } = useVisualMode()
  const host = useRef<HTMLDivElement | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (mode !== 'full' || failed || !host.current) return
    let disposed = false
    let frame = 0
    let cleanupVisibility: (() => void) | null = null
    let cleanupIntersection: (() => void) | null = null
    const mount = host.current

    void import('three').then((THREE) => {
      if (disposed || !mount) return
      try {
        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 60)
        camera.position.z = 9
        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.45))
        renderer.setClearColor(0x000000, 0)
        renderer.domElement.setAttribute('aria-hidden', 'true')
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        renderer.domElement.style.display = 'block'
        mount.appendChild(renderer.domElement)

        const count = 220
        const positions = new Float32Array(count * 3)
        const colors = new Float32Array(count * 3)
        for (let i = 0; i < count; i += 1) {
          const radius = 2.5 + Math.random() * 8
          const angle = Math.random() * Math.PI * 2
          const height = (Math.random() - 0.5) * 8
          positions[i * 3] = Math.cos(angle) * radius
          positions[i * 3 + 1] = Math.sin(angle) * radius * 0.62 + height * 0.18
          positions[i * 3 + 2] = (Math.random() - 0.5) * 9
          const warmth = Math.random()
          colors[i * 3] = 0.72 + warmth * 0.28
          colors[i * 3 + 1] = 0.68 + warmth * 0.28
          colors[i * 3 + 2] = 0.88 + warmth * 0.12
        }

        const geometry = new THREE.BufferGeometry()
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        const material = new THREE.PointsMaterial({
          size: 0.075,
          sizeAttenuation: true,
          transparent: true,
          opacity: 0.88,
          vertexColors: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
        const stars = new THREE.Points(geometry, material)
        scene.add(stars)

        const resize = () => {
          const width = Math.max(1, mount.clientWidth)
          const height = Math.max(1, mount.clientHeight)
          camera.aspect = width / height
          camera.updateProjectionMatrix()
          renderer.setSize(width, height, false)
        }
        resize()
        const observer = new ResizeObserver(resize)
        observer.observe(mount)

        let visible = true
        const render = () => {
          if (disposed) return
          if (visible && document.visibilityState === 'visible') {
            stars.rotation.y += 0.00065
            stars.rotation.x = Math.sin(performance.now() * 0.00016) * 0.035
            renderer.render(scene, camera)
          }
          frame = window.requestAnimationFrame(render)
        }
        frame = window.requestAnimationFrame(render)

        const onVisibility = () => { visible = document.visibilityState === 'visible' }
        document.addEventListener('visibilitychange', onVisibility)
        cleanupVisibility = () => document.removeEventListener('visibilitychange', onVisibility)

        const intersection = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting) })
        intersection.observe(mount)
        cleanupIntersection = () => intersection.disconnect()

        const cleanup = () => {
          window.cancelAnimationFrame(frame)
          observer.disconnect()
          cleanupVisibility?.()
          cleanupIntersection?.()
          geometry.dispose()
          material.dispose()
          renderer.dispose()
          renderer.domElement.remove()
        }
        ;(mount as HTMLDivElement & { __loveosCleanup?: () => void }).__loveosCleanup = cleanup
      } catch {
        if (!disposed) setFailed(true)
      }
    }).catch(() => {
      if (!disposed) setFailed(true)
    })

    return () => {
      disposed = true
      window.cancelAnimationFrame(frame)
      cleanupVisibility?.()
      cleanupIntersection?.()
      const element = mount as HTMLDivElement & { __loveosCleanup?: () => void }
      element.__loveosCleanup?.()
      if (element) delete element.__loveosCleanup
    }
  }, [failed, mode])

  if (mode !== 'full' || failed) return null
  return <div ref={host} className="loveos-three-starfield" aria-hidden />
}
