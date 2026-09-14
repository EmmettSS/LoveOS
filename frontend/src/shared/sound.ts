/**
 * sound.ts — صداهای سیستم با WebAudio (بدون فایل، بدون کپی‌رایت)
 * ملودی بوت، کلیک، ضربان قلب، شکوفه، نوت‌های نرم.
 */
let ctx: AudioContext | null = null
let enabled = true

export function setSoundEnabled(v: boolean) {
  enabled = v
}
export function isSoundEnabled() {
  return enabled
}

function audio(): AudioContext | null {
  if (!enabled) return null
  if (!ctx) {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctor) return null
    ctx = new Ctor()
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

interface ToneOptions {
  freq: number
  duration?: number
  type?: OscillatorType
  gain?: number
  delay?: number
  glideTo?: number
}

export function tone({ freq, duration = 0.3, type = 'sine', gain = 0.12, delay = 0, glideTo }: ToneOptions) {
  const ac = audio()
  if (!ac) return
  const start = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, start)
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration)
  g.gain.setValueAtTime(0.0001, start)
  g.gain.exponentialRampToValueAtTime(gain, start + 0.04)
  g.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(g).connect(ac.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** ملودی نرم بوت — پنج نت صعودی پنتاتونیک */
export function playBootMelody() {
  const notes = [523.25, 587.33, 659.25, 783.99, 880.0]
  notes.forEach((f, i) => tone({ freq: f, duration: 0.55, type: 'sine', gain: 0.09, delay: i * 0.24 }))
  tone({ freq: 1046.5, duration: 1.2, type: 'triangle', gain: 0.06, delay: 1.25 })
}

export function playClick() {
  tone({ freq: 660, duration: 0.07, type: 'triangle', gain: 0.05 })
}

export function playOpen() {
  tone({ freq: 520, duration: 0.16, type: 'sine', gain: 0.06 })
  tone({ freq: 780, duration: 0.2, type: 'sine', gain: 0.05, delay: 0.07 })
}

export function playSuccess() {
  ;[523.25, 659.25, 783.99].forEach((f, i) => tone({ freq: f, duration: 0.3, gain: 0.08, delay: i * 0.12 }))
}

export function playError() {
  tone({ freq: 220, duration: 0.28, type: 'sawtooth', gain: 0.05, glideTo: 150 })
}

/** ضربان قلب: دو ضربه‌ی کم‌فرکانس (لاب-داب) */
export function playHeartbeat(times = 3) {
  for (let i = 0; i < times; i += 1) {
    const base = i * 0.9
    tone({ freq: 62, duration: 0.16, type: 'sine', gain: 0.22, delay: base })
    tone({ freq: 48, duration: 0.22, type: 'sine', gain: 0.18, delay: base + 0.22 })
  }
}

export function playBloom() {
  ;[784, 988, 1175].forEach((f, i) => tone({ freq: f, duration: 0.45, type: 'sine', gain: 0.06, delay: i * 0.08 }))
}

export function playPaper() {
  const ac = audio()
  if (!ac) return
  const buffer = ac.createBuffer(1, ac.sampleRate * 0.28, ac.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2.4) * 0.28
  }
  const src = ac.createBufferSource()
  const filter = ac.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 1800
  src.buffer = buffer
  src.connect(filter).connect(ac.destination)
  src.start()
}

export function playTypeTick() {
  tone({ freq: 1200 + Math.random() * 300, duration: 0.03, type: 'square', gain: 0.02 })
}

/** ویبره‌ی دستگاه (اپ بغل و اعلان‌های مهم) */
export function vibrate(pattern: number | number[]) {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      /* دستگاه پشتیبانی نمی‌کند */
    }
  }
}
