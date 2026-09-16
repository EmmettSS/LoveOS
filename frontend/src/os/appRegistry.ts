/**
 * appRegistry.ts — فهرست اپ‌های LoveOS
 * desktop=false یعنی آیکن روی دسکتاپ ندارد (مثل یادآورهای مهربان).
 */
import type { ComponentType } from 'react'
import { lazy } from 'react'

import type { IconName } from '../shared/Icon'

export interface AppDef {
  key: string
  icon: IconName
  titleKey: string
  color: string
  desktop: boolean
  component: ComponentType<any>
  helpKey?: string
  /** محتوای اپ تا لبه‌ی پنجره پر می‌شود (بدون padding) — برای صحنه‌های سه‌بعدی */
  immersive?: boolean
}

export const APPS: AppDef[] = [
  { key: 'map', icon: 'map', titleKey: 'apps.map', color: '#7dd3fc', desktop: true, helpKey: 'map', component: lazy(() => import('../apps/MapOfUs')) },
  { key: 'voice', icon: 'voice', titleKey: 'apps.voice', color: '#f9a8d4', desktop: true, helpKey: 'voice', component: lazy(() => import('../apps/VoiceVault')) },
  { key: 'music', icon: 'music', titleKey: 'apps.music', color: '#c4b5fd', desktop: true, component: lazy(() => import('../apps/Music')) },
  { key: 'memories', icon: 'memories', titleKey: 'apps.memories', color: '#fcd34d', desktop: true, component: lazy(() => import('../apps/Memories')) },
  { key: 'whisper', icon: 'whisper', titleKey: 'apps.whisper', color: '#fda4af', desktop: true, component: lazy(() => import('../apps/Whisper')) },
  { key: 'countdown', icon: 'countdown', titleKey: 'apps.countdown', color: '#a5b4fc', desktop: true, component: lazy(() => import('../apps/Countdown')) },
  { key: 'weather', icon: 'weather', titleKey: 'apps.weather', color: '#93c5fd', desktop: true, component: lazy(() => import('../apps/Weather')) },
  { key: 'heartbeat', icon: 'heartbeat', titleKey: 'apps.heartbeat', color: '#fb7185', desktop: true, immersive: true, component: lazy(() => import('../apps/Heartbeat')) },
  { key: 'garden', icon: 'garden', titleKey: 'apps.garden', color: '#86efac', desktop: true, immersive: true, component: lazy(() => import('../apps/Garden')) },
  { key: 'starmap', icon: 'starmap', titleKey: 'apps.starmap', color: '#818cf8', desktop: true, immersive: true, component: lazy(() => import('../apps/Starmap')) },
  { key: 'chat', icon: 'chat', titleKey: 'apps.chat', color: '#f0abfc', desktop: true, helpKey: 'chat', component: lazy(() => import('../apps/Chat')) },
  { key: 'mood', icon: 'mood', titleKey: 'apps.mood', color: '#fbbf24', desktop: true, immersive: true, component: lazy(() => import('../apps/Mood')) },
  { key: 'quiz', icon: 'quiz', titleKey: 'apps.quiz', color: '#67e8f9', desktop: true, component: lazy(() => import('../apps/Quiz')) },
  { key: 'plans', icon: 'plans', titleKey: 'apps.plans', color: '#5eead4', desktop: true, component: lazy(() => import('../apps/FuturePlans')) },
  { key: 'cinema', icon: 'cinema', titleKey: 'apps.cinema', color: '#d8b4fe', desktop: true, component: lazy(() => import('../apps/Cinema')) },
  { key: 'vault', icon: 'vault', titleKey: 'apps.vault', color: '#94a3b8', desktop: true, immersive: true, component: lazy(() => import('../apps/Vault')) },
  { key: 'terminal', icon: 'terminal', titleKey: 'apps.terminal', color: '#4ade80', desktop: true, helpKey: 'terminal', component: lazy(() => import('../apps/Terminal')) },
  { key: 'achievements', icon: 'achievements', titleKey: 'apps.achievements', color: '#fcd34d', desktop: true, component: lazy(() => import('../apps/Achievements')) },
  { key: 'puzzle', icon: 'puzzle', titleKey: 'apps.puzzle', color: '#f472b6', desktop: true, component: lazy(() => import('../apps/Puzzle')) },
  { key: 'hug', icon: 'hug', titleKey: 'apps.hug', color: '#fdba74', desktop: true, immersive: true, component: lazy(() => import('../apps/Hug')) },
  { key: 'cycle', icon: 'cycle', titleKey: 'apps.cycle', color: '#f9a8d4', desktop: true, helpKey: 'cycle', component: lazy(() => import('../apps/CycleCare')) },
  { key: 'library', icon: 'library', titleKey: 'apps.library', color: '#fca5a5', desktop: true, helpKey: 'library', component: lazy(() => import('../apps/Library')) },
  { key: 'tutorial', icon: 'tutorial', titleKey: 'apps.tutorial', color: '#a7f3d0', desktop: true, component: lazy(() => import('../apps/Tutorial')) },
  { key: 'call', icon: 'call', titleKey: 'apps.call', color: '#7dd3fc', desktop: true, helpKey: 'call', component: lazy(() => import('../apps/CallSync')) },
  { key: 'gifts', icon: 'gift', titleKey: 'apps.gifts', color: '#fda4af', desktop: true, helpKey: 'gifts', component: lazy(() => import('../apps/GiftBook')) },
  { key: 'reading', icon: 'reading', titleKey: 'apps.reading', color: '#5eead4', desktop: true, helpKey: 'reading', component: lazy(() => import('../apps/ReadTogether')) },
  { key: 'dreamhome', icon: 'dreamhome', titleKey: 'apps.dreamhome', color: '#86efac', desktop: true, helpKey: 'dreamhome', component: lazy(() => import('../apps/DreamHome')) },
  { key: 'language', icon: 'language', titleKey: 'apps.language', color: '#c4b5fd', desktop: true, helpKey: 'language', component: lazy(() => import('../apps/LanguageBridge')) },
  { key: 'settings', icon: 'settings', titleKey: 'apps.settingsApp', color: '#cbd5e1', desktop: true, component: lazy(() => import('../apps/Settings')) },
  { key: 'about', icon: 'about', titleKey: 'apps.about', color: '#fbcfe8', desktop: false, component: lazy(() => import('../apps/About')) },
]

export const appByKey = (key: string) => APPS.find((a) => a.key === key)

/**
 * چیدمان پیش‌فرض دسکتاپ — «طبق جذابیت»:
 * اول اپ‌های احساسی و تعاملی (بغل، نقشه، صدا، ضربان…)، بعد بازی‌ها و
 * برنامه‌ریزی‌ها، بعد ابزارها؛ و اپ‌های عمومی (آموزش، تنظیمات) آخرِ همه.
 * دخترم می‌تواند این ترتیب را با درگ‌اند‌دراپ عوض کند (localStorage).
 */
export const DEFAULT_APP_ORDER: string[] = [
  'hug', 'map', 'voice', 'heartbeat', 'whisper', 'memories', 'music', 'garden',
  'starmap', 'countdown', 'call', 'plans', 'cinema', 'reading', 'dreamhome',
  'language', 'puzzle', 'quiz', 'mood', 'chat', 'gifts', 'cycle', 'weather',
  'achievements', 'vault', 'terminal', 'library', 'tutorial', 'settings',
]

/**
 * ترتیب مؤثر اپ‌های دسکتاپ: اگر کاربر ترتیب خودش را ذخیره کرده، آن (به‌همراه
 * اپ‌های تازه‌ی اضافه‌شده بعداً) برمی‌گردد؛ وگرنه ترتیب پیش‌فرض.
 */
export function effectiveAppOrder(saved: string[] | null): string[] {
  const all = APPS.map((a) => a.key)
  const known = Array.from(new Set((saved || []).filter((k) => all.includes(k))))
  // بدون ترتیب ذخیره‌شده (یا ترتیبی که همه‌ی آیتم‌هایش قدیمی شده) → پیش‌فرض
  if (known.length === 0) return DEFAULT_APP_ORDER.filter((k) => all.includes(k))
  // اپ‌های تازه‌ی اضافه‌شده بعد از ذخیره‌کردن، به انتها می‌پیوندند
  const missing = all.filter((k) => !known.includes(k))
  return [...known, ...missing]
}
