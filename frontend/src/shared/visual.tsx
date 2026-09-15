import { motion } from 'framer-motion'
import { useRef } from 'react'

import { useVisualMode, type VisualMode } from './visualMode'

/** پس‌زمینه‌ی مشترک LoveOS؛ فقط چند لایه‌ی سبک CSS و بدون حلقه‌ی رندر دائمی. */
export function LoveAtmosphere({ variant = 'desktop' }: { variant?: 'desktop' | 'app' | 'heart' | 'garden' }) {
  const { mode } = useVisualMode()
  const calm = mode === 'calm'
  return (
    <div className={`loveos-atmosphere loveos-atmosphere-${variant}`} data-depth-mode={mode} aria-hidden>
      <span className="loveos-atmosphere-orb loveos-atmosphere-orb-a" />
      <span className="loveos-atmosphere-orb loveos-atmosphere-orb-b" />
      {!calm && <span className="loveos-atmosphere-star loveos-atmosphere-star-a">✦</span>}
      {!calm && <span className="loveos-atmosphere-star loveos-atmosphere-star-b">✧</span>}
      {variant === 'desktop' && !calm && <span className="loveos-atmosphere-ribbon" />}
    </div>
  )
}

/**
 * کارت با tilt بسیار محدود. محاسبه با CSS variable انجام می‌شود تا حرکت موس
 * باعث رندر مجدد React نشود. روی لمس فقط عمق ثابت و سایه باقی می‌ماند.
 */
export function DepthCard({
  children,
  className = '',
  style,
  accent,
  interactive = true,
}: {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  accent?: string
  interactive?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const onMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactive || event.pointerType !== 'mouse' || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5
    const y = (event.clientY - rect.top) / rect.height - 0.5
    ref.current.style.setProperty('--depth-rotate-x', `${(-y * 5).toFixed(2)}deg`)
    ref.current.style.setProperty('--depth-rotate-y', `${(x * 6).toFixed(2)}deg`)
  }
  const reset = () => {
    ref.current?.style.setProperty('--depth-rotate-x', '0deg')
    ref.current?.style.setProperty('--depth-rotate-y', '0deg')
  }
  return (
    <div
      ref={ref}
      className={`loveos-depth-card ${interactive ? 'loveos-depth-card-interactive' : ''} ${className}`}
      style={{ ...style, ...(accent ? { '--depth-accent': accent } as React.CSSProperties : {}) }}
      onPointerMove={onMove}
      onPointerLeave={reset}
    >
      {children}
    </div>
  )
}

export function SceneFrame({
  children,
  className = '',
  accent = 'var(--os-accent)',
  label,
  variant = 'soft',
}: {
  children: React.ReactNode
  className?: string
  accent?: string
  label?: string
  variant?: 'soft' | 'cosmic' | 'garden' | 'heart' | 'map'
}) {
  const { mode } = useVisualMode()
  return (
    <div
      className={`loveos-scene loveos-scene-${variant} loveos-scene-${mode} ${className}`}
      style={{ '--scene-accent': accent } as React.CSSProperties}
    >
      <LoveAtmosphere variant={variant === 'garden' ? 'garden' : variant === 'heart' ? 'heart' : 'app'} />
      <div className="loveos-scene-grid" aria-hidden />
      {label && <span className="loveos-scene-label">{label}</span>}
      <div className="loveos-scene-content">{children}</div>
    </div>
  )
}

const APP_VISUALS: Record<string, { kind: string; glyph: string }> = {
  map: { kind: 'orbit', glyph: '⌁' },
  voice: { kind: 'heart', glyph: '◖' },
  music: { kind: 'playful', glyph: '♪' },
  memories: { kind: 'heart', glyph: '✦' },
  whisper: { kind: 'heart', glyph: '…' },
  countdown: { kind: 'orbit', glyph: '◌' },
  weather: { kind: 'sky', glyph: '☼' },
  heartbeat: { kind: 'heart', glyph: '♥' },
  garden: { kind: 'nature', glyph: '✿' },
  starmap: { kind: 'cosmic', glyph: '✧' },
  chat: { kind: 'heart', glyph: '♡' },
  mood: { kind: 'playful', glyph: '☻' },
  quiz: { kind: 'cosmic', glyph: '?' },
  plans: { kind: 'orbit', glyph: '◇' },
  cinema: { kind: 'cosmic', glyph: '✦' },
  vault: { kind: 'vault', glyph: '▣' },
  terminal: { kind: 'terminal', glyph: '>_' },
  achievements: { kind: 'trophy', glyph: '★' },
  puzzle: { kind: 'cosmic', glyph: '⌘' },
  hug: { kind: 'heart', glyph: '♡' },
  cycle: { kind: 'nature', glyph: '◒' },
  library: { kind: 'paper', glyph: '▤' },
  tutorial: { kind: 'paper', glyph: '?' },
  call: { kind: 'orbit', glyph: '◌' },
  gifts: { kind: 'heart', glyph: '✧' },
  reading: { kind: 'paper', glyph: '⌁' },
  dreamhome: { kind: 'nature', glyph: '⌂' },
  language: { kind: 'playful', glyph: '文' },
  settings: { kind: 'tools', glyph: '⚙' },
  about: { kind: 'heart', glyph: '♥' },
}

/** هویت محیطی هر اپ؛ سبک است و اجازه می‌دهد هر ۳۰ اپ جهان بصری خودش را داشته باشد. */
export function AppVisualBackdrop({ app, accent }: { app: string; accent: string }) {
  const visual = APP_VISUALS[app] || { kind: 'soft', glyph: '✦' }
  const { mode } = useVisualMode()
  return (
    <div
      className={`loveos-app-backdrop loveos-app-backdrop-${visual.kind}`}
      data-app={app}
      data-visual-mode={mode}
      style={{ '--backdrop-accent': accent } as React.CSSProperties}
      aria-hidden
    >
      <span className="loveos-backdrop-glyph">{visual.glyph}</span>
      <span className="loveos-backdrop-orbit loveos-backdrop-orbit-a" />
      <span className="loveos-backdrop-orbit loveos-backdrop-orbit-b" />
      <span className="loveos-backdrop-glow" />
    </div>
  )
}

export function VisualModeBadge({ mode }: { mode?: VisualMode }) {
  const visual = useVisualMode()
  const current = mode || visual.mode
  return <span className={`loveos-mode-dot loveos-mode-dot-${current}`} aria-hidden />
}

export function FloatingMotion({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const { mode } = useVisualMode()
  if (mode === 'calm') return <>{children}</>
  return (
    <motion.div
      className={className}
      animate={{ y: [0, -5, 0], rotateZ: [0, 0.5, 0] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}
