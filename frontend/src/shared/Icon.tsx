/**
 * Icon.tsx — کیت آیکن دست‌ساز LoveOS
 * همه‌ی آیکن‌ها با خط گرد و نرم، یک زبان بصری واحد. بدون کتابخانه‌ی خارجی.
 */
import { useId } from 'react'
import type { CSSProperties, ReactElement } from 'react'

import { BODY_PATH, HEART_PATH, MARK_SPARKLES, MARK_STROKE, MARK_VIEW } from './loveosMark'

export type IconName =
  | 'map' | 'voice' | 'music' | 'memories' | 'whisper' | 'countdown' | 'weather'
  | 'heartbeat' | 'garden' | 'starmap' | 'chat' | 'mood' | 'quiz' | 'plans'
  | 'cinema' | 'vault' | 'terminal' | 'achievements' | 'settings' | 'tutorial'
  | 'puzzle' | 'hug' | 'cycle' | 'library' | 'about' | 'bell' | 'grid' | 'close'
  | 'minus' | 'heart' | 'logout' | 'play' | 'pause' | 'plus' | 'check' | 'search'
  | 'sun' | 'moon' | 'cloud' | 'rain' | 'snow' | 'star' | 'pill' | 'upload' | 'trash'
  | 'back' | 'lock' | 'key' | 'flower' | 'book' | 'pen'
  // --- آیکن‌های کاربردی
  | 'forward' | 'retry' | 'calendar' | 'clock' | 'mic' | 'stop' | 'pin' | 'sparkle'
  | 'quote' | 'chart' | 'camera' | 'sliders' | 'tag' | 'link' | 'globe' | 'users' | 'video'
  // --- ۶ اپ جدید (تم کودکانه)
  | 'call' | 'gift' | 'reading' | 'dreamhome' | 'language' | 'findheart'

interface Props {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
  strokeWidth?: number
}

const P: Record<IconName, ReactElement> = {
  heart: <path d="M12 20s-7-4.6-7-9.4A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7 2.6C19 15.4 12 20 12 20Z" />,
  map: (
    <>
      <path d="M3 6.5 9 4l6 2.5L21 4v13.5L15 20l-6-2.5L3 20Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </>
  ),
  voice: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="16" r="2" />
    </>
  ),
  memories: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="4" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="m4 17 4.5-4 3.5 3 3-2.5L20 17" />
    </>
  ),
  whisper: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="3" />
      <path d="m3.6 7 8.4 6 8.4-6" />
    </>
  ),
  countdown: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4.5l3 1.6M9 2h6" />
    </>
  ),
  weather: (
    <>
      <circle cx="8.5" cy="9" r="3.2" />
      <path d="M17 19H8a4 4 0 0 1 0-8 5 5 0 0 1 9.4 1.6A3.2 3.2 0 0 1 17 19Z" />
    </>
  ),
  heartbeat: (
    <>
      <path d="M3 12h3.5L9 7l3 10 2.5-5H21" />
    </>
  ),
  garden: (
    <>
      <circle cx="12" cy="7.5" r="2.4" />
      <path d="M12 10v10M12 14c-2.5 0-4-1.5-4-3.5M12 16c2.5 0 4-1.5 4-3.5" />
      <path d="M5 20h14" />
    </>
  ),
  starmap: (
    <>
      <path d="m12 3 2 5 5 .6-3.7 3.5 1 5.2L12 15l-4.3 2.3 1-5.2L5 8.6 10 8Z" />
      <circle cx="19" cy="19" r="1" />
      <circle cx="4.5" cy="18" r="1" />
    </>
  ),
  chat: (
    <>
      <path d="M20 15.5a3 3 0 0 1-3 3H9l-5 3V6.5a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3Z" />
      <path d="M8.5 10h7M8.5 13.2h4.5" />
    </>
  ),
  mood: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 10.2h.01M15 10.2h.01M8.6 14.4a4.4 4.4 0 0 0 6.8 0" />
    </>
  ),
  quiz: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.4M12 16.6h.01" />
    </>
  ),
  plans: (
    <>
      <path d="M5 4.5h14v15l-7-3.2-7 3.2Z" />
      <path d="m9.2 10.3 1.9 1.9 3.7-3.7" />
    </>
  ),
  cinema: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="3" />
      <path d="m3.5 9.5 17-3M8 6.6 6.4 9.8M13 5.8l-1.6 3.2M18 5l-1.6 3.2" />
    </>
  ),
  vault: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 8.6V6.2M12 17.8v-2.4M15.4 12h2.4M6.2 12h2.4" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="3" />
      <path d="m7.5 10 2.5 2-2.5 2M13 14h3.5" />
    </>
  ),
  achievements: (
    <>
      <circle cx="12" cy="9.5" r="5" />
      <path d="m8.6 13.6-1.3 6.4 4.7-2.4 4.7 2.4-1.3-6.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 13H3a2 2 0 1 1 0-4h.2A1.6 1.6 0 0 0 4.3 6.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 2.3V2a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.3 1.2Z" />
    </>
  ),
  tutorial: (
    <>
      <path d="M4 5.5A2 2 0 0 1 6 3.5h5v16H6a2 2 0 0 0-2 2Z" />
      <path d="M20 5.5a2 2 0 0 0-2-2h-5v16h5a2 2 0 0 1 2 2Z" />
    </>
  ),
  puzzle: (
    <>
      <path d="M10 4h4v2.2a1.8 1.8 0 1 0 3.6 0V4H20v4h-2.2a1.8 1.8 0 1 0 0 3.6H20V20h-4.4v-2.2a1.8 1.8 0 1 0-3.6 0V20H4v-4.4h2.2a1.8 1.8 0 1 0 0-3.6H4V8h6Z" />
    </>
  ),
  hug: (
    <>
      <path d="M12 20s-6.4-4.1-6.4-8.5A3.7 3.7 0 0 1 12 8.7a3.7 3.7 0 0 1 6.4 2.8C18.4 15.9 12 20 12 20Z" />
      <path d="M4.5 9.5c-1.2-.9-1.5-2.2-.7-3.2M19.5 9.5c1.2-.9 1.5-2.2.7-3.2" />
    </>
  ),
  cycle: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.5v5l3 1.6" />
      <path d="M17.8 5.4 20 4.4l-.4 2.4" />
    </>
  ),
  library: (
    <>
      <path d="M4 5.2A1.7 1.7 0 0 1 5.7 3.5H10v17H5.7A1.7 1.7 0 0 0 4 22.2Z" />
      <path d="M20 5.2a1.7 1.7 0 0 0-1.7-1.7H14v17h4.3a1.7 1.7 0 0 1 1.7 1.7Z" />
      <path d="M12 4v16" />
    </>
  ),
  about: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" />
      <path d="M10.3 19a2 2 0 0 0 3.4 0" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="2" />
      <rect x="14" y="4" width="6" height="6" rx="2" />
      <rect x="4" y="14" width="6" height="6" rx="2" />
      <rect x="14" y="14" width="6" height="6" rx="2" />
    </>
  ),
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  minus: <path d="M6 12h12" />,
  logout: (
    <>
      <path d="M14 4.5H7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
      <path d="m17 8.5 3.5 3.5L17 15.5M20 12h-9" />
    </>
  ),
  play: <path d="M8 5.5v13l10-6.5Z" />,
  pause: <path d="M9 5.5v13M15 5.5v13" />,
  plus: <path d="M12 6v12M6 12h12" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  cloud: <path d="M17.5 19H8a4.2 4.2 0 0 1 .4-8.4 5.4 5.4 0 0 1 10.2 1.8A3.4 3.4 0 0 1 17.5 19Z" />,
  rain: (
    <>
      <path d="M17 15.5H8a4 4 0 0 1 .4-8 5.2 5.2 0 0 1 9.8 1.7A3.2 3.2 0 0 1 17 15.5Z" />
      <path d="M9 18.5 8.2 21M13 18.5 12.2 21M17 18.5 16.2 21" />
    </>
  ),
  snow: (
    <>
      <path d="M17 14.5H8a4 4 0 0 1 .4-8 5.2 5.2 0 0 1 9.8 1.7A3.2 3.2 0 0 1 17 14.5Z" />
      <path d="M9 18h.01M13 19.5h.01M16.5 18h.01" />
    </>
  ),
  star: <path d="m12 4 2.3 5.1 5.7.6-4.2 3.9 1.1 5.4L12 16.3 7.1 19l1.1-5.4L4 9.7l5.7-.6Z" />,
  pill: (
    <>
      <rect x="3.5" y="9" width="17" height="6.5" rx="3.25" transform="rotate(-40 12 12)" />
      <path d="M9.4 8.2 15 14" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5M8 8.5 12 4.5l4 4" />
      <path d="M4.5 15v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M10 7V5h4v2M6.5 7l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12" />
    </>
  ),
  back: <path d="M14 6.5 8.5 12l5.5 5.5" />,
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10" rx="3" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="3.5" />
      <path d="M11.5 12H20l-1.5 2M16.5 12v2.5" />
    </>
  ),
  flower: (
    <>
      <circle cx="12" cy="9" r="2" />
      <path d="M12 7c0-2 1-3 2.5-3S17 5.2 17 7s-1.5 2.4-3 2M12 7c0-2-1-3-2.5-3S7 5.2 7 7s1.5 2.4 3 2M12 11v9" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h9a3 3 0 0 1 3 3v12H8a3 3 0 0 0-3 3Z" />
      <path d="M17 7.5h2v12" />
    </>
  ),
  pen: (
    <>
      <path d="M16.5 4.5 19.5 7.5 9 18l-4 1 1-4Z" />
      <path d="m14.5 6.5 3 3" />
    </>
  ),

  // ------------------------------------------------- آیکن‌های کاربردی ----
  forward: <path d="M10 6.5 15.5 12 10 17.5" />,
  retry: (
    <>
      <path d="M20 12a8 8 0 1 1-2.4-5.7" />
      <path d="M20.6 4.4V10h-5.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M3.5 10.2h17M8 3.4v4.2M16 3.4v4.2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.6V12l3 1.9" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  stop: <rect x="7" y="7" width="10" height="10" rx="2.4" />,
  pin: (
    <>
      <path d="M12 21s5.6-5.7 5.6-10.3A5.6 5.6 0 0 0 6.4 10.7C6.4 15.3 12 21 12 21Z" />
      <circle cx="12" cy="10.6" r="1.9" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 3.8l1.5 4.2 4.2 1.5-4.2 1.5L11 15.2 9.5 11 5.3 9.5 9.5 8Z" />
      <path d="M18 15.2l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7Z" />
    </>
  ),
  quote: (
    <>
      <path d="M7.4 15.2c0-3.2 1.5-5.4 4.3-6.6M14.6 15.2c0-3.2 1.5-5.4 4.3-6.6" />
      <circle cx="6.3" cy="16.6" r="1.5" />
      <circle cx="13.5" cy="16.6" r="1.5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19.6h16" />
      <path d="M7.2 19.6v-6.2M12 19.6V8.4M16.8 19.6v-9.2" />
    </>
  ),
  camera: (
    <>
      <path d="M4.6 8.6h2.2L8.3 6.2h7.4l1.5 2.4h2.2a1.6 1.6 0 0 1 1.6 1.6v7.4a1.6 1.6 0 0 1-1.6 1.6H4.6A1.6 1.6 0 0 1 3 17.6v-7.4a1.6 1.6 0 0 1 1.6-1.6Z" />
      <circle cx="12" cy="13.4" r="3.1" />
    </>
  ),
  sliders: <path d="M4.5 7.6h15M7.6 12h9M10.6 16.4h3" />,
  tag: (
    <>
      <path d="M12.6 3.5 20.5 11.4a2 2 0 0 1 0 2.8l-6.3 6.3a2 2 0 0 1-2.8 0L3.5 12.6V3.5Z" />
      <circle cx="8.2" cy="8.2" r="1.4" />
    </>
  ),
  link: (
    <>
      <path d="M9.6 14.4 14.4 9.6" />
      <path d="M11.2 7.4 12.8 5.8a3.5 3.5 0 0 1 5 5l-1.6 1.6" />
      <path d="M12.8 16.6 11.2 18.2a3.5 3.5 0 0 1-5-5l1.6-1.6" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.7 2.6 14.3 0 17M12 3.5c-2.6 2.7-2.6 14.3 0 17" />
    </>
  ),
  users: (
    <>
      <circle cx="9.6" cy="8.8" r="3" />
      <path d="M4 19.2c0-3 2.5-5.2 5.6-5.2s5.6 2.2 5.6 5.2" />
      <path d="M16.2 7a3 3 0 0 1 0 5.6M17.2 14.6c2 .5 3.4 2.2 3.4 4.6" />
    </>
  ),
  video: (
    <>
      <rect x="3.4" y="6.4" width="12.2" height="11.2" rx="3" />
      <path d="m15.6 12 5-3.1v6.2Z" />
    </>
  ),

  // --------------------------------------------- ۶ اپ جدید: تم کودکانه ---
  call: (
    <>
      <path d="M6.4 3.4h2.9l1.6 4-2 1.4a11.2 11.2 0 0 0 5.6 5.6l1.4-2 4 1.6v2.9a2 2 0 0 1-2.2 2A15.6 15.6 0 0 1 4.4 5.6a2 2 0 0 1 2-2.2Z" />
      <path d="M15.4 10.2s-2-1.4-2-2.8a1.25 1.25 0 0 1 2-0.8 1.25 1.25 0 0 1 2 .8c0 1.4-2 2.8-2 2.8Z" />
    </>
  ),
  gift: (
    <>
      <rect x="3.4" y="8.8" width="17.2" height="11.4" rx="2.6" />
      <path d="M3.4 12.6h17.2M12 8.8v11.4" />
      <path d="M12 8.8S10.9 4.4 8.7 4.4a2.05 2.05 0 0 0 0 4.1M12 8.8s1.1-4.4 3.3-4.4a2.05 2.05 0 0 1 0 4.1" />
      <path d="M12 17.4s-1.8-1.2-1.8-2.5a1.15 1.15 0 0 1 1.8-.7 1.15 1.15 0 0 1 1.8.7c0 1.3-1.8 2.5-1.8 2.5Z" />
    </>
  ),
  reading: (
    <>
      <path d="M12 6.6C10.5 5.1 8.6 4.4 6 4.4a1.7 1.7 0 0 0-1.7 1.7v10.3A1.7 1.7 0 0 0 6 18.1c2.6 0 4.5.6 6 2.1 1.5-1.5 3.4-2.1 6-2.1a1.7 1.7 0 0 0 1.7-1.7V6.1A1.7 1.7 0 0 0 18 4.4c-2.6 0-4.5.7-6 2.2Z" />
      <path d="M12 6.6v13.6" />
      <path d="M12 12.6s-1.7-1.1-1.7-2.4a1.1 1.1 0 0 1 1.7-.6 1.1 1.1 0 0 1 1.7.6c0 1.3-1.7 2.4-1.7 2.4Z" />
    </>
  ),
  dreamhome: (
    <>
      <path d="M4 11.4 12 4.2l8 7.2" />
      <path d="M6.2 10.4V19a1.6 1.6 0 0 0 1.6 1.6h8.4A1.6 1.6 0 0 0 17.8 19v-8.6" />
      <path d="M17.4 8.4s-2.1-1.4-2.1-2.9a1.3 1.3 0 0 1 2.1-.7 1.3 1.3 0 0 1 2.1.7c0 1.5-2.1 2.9-2.1 2.9Z" />
    </>
  ),
  language: (
    <>
      <path d="M9.6 15.6H6A2.6 2.6 0 0 1 3.4 13V7A2.6 2.6 0 0 1 6 4.4h6A2.6 2.6 0 0 1 14.6 7v1.1" />
      <path d="M13.6 9.1H18a2.6 2.6 0 0 1 2.6 2.6v5.6A2.6 2.6 0 0 1 18 19.9h-1.1l-2.7 2.5v-2.5h-.6A2.6 2.6 0 0 1 11 17.3v-5.6A2.6 2.6 0 0 1 13.6 9.1Z" />
      <path d="M15.8 14.9s-1.7-1.1-1.7-2.4a1.1 1.1 0 0 1 1.7-.6 1.1 1.1 0 0 1 1.7.6c0 1.3-1.7 2.4-1.7 2.4Z" />
    </>
  ),
  findheart: (
    <>
      <circle cx="11" cy="11" r="6.6" />
      <path d="m16.1 16.1 4.2 4.2" />
      <path d="M11 13.4s-1.9-1.2-1.9-2.6a1.2 1.2 0 0 1 1.9-.7 1.2 1.2 0 0 1 1.9.7c0 1.4-1.9 2.6-1.9 2.6Z" />
    </>
  ),
}

export function Icon({ name, size = 22, className = '', style, strokeWidth = 1.7 }: Props) {
  const filled = name === 'play' || name === 'heart' || name === 'star' || name === 'puzzle'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {P[name]}
    </svg>
  )
}

/**
 * لوگوی LoveOS — نشانِ «قلب که خطِ پایین‌راستش روی بدنه به ∞ می‌رسد»
 * (همان نشانِ فاوآیکون و اسپلش؛ هندسه در loveosMark.ts و تولیدش دستِ
 * docs/branding/generate-logo.mjs است). روبانِ گرادیانی + نگین‌های الماس.
 *
 * دو مسیر از یک نقطه (نوکِ پایین) شروع می‌شوند و به هم می‌رسند، پس چشم یک خطِ
 * پیوسته می‌بیند: مسیرِ قلب از نوک تا سمتِ راست، و مسیرِ بدنه که روی خودش ∞ را
 * می‌سازد و برمی‌گردد به نوک — دقیقاً ساختارِ گردنبندِ مرجع.
 */
export function LoveOSLogo({
  size = 64,
  className = '',
  glow,
}: {
  size?: number
  className?: string
  glow?: boolean
}) {
  const stroke = MARK_STROKE
  // شناسه‌ی یکتا: اگر چند لوگو هم‌زمان در صفحه باشند، گرادیان‌ها قاطی نمی‌شوند
  const uid = useId().replace(/:/g, '')
  const gid = `loveos-g-${uid}`
  const bid = `loveos-bg-${uid}`
  const cid = `loveos-clip-${uid}`
  const fid = `loveos-glow-${uid}`
  // درخشش فقط برای لوگوهای بزرگ (سبک ماندنِ صفحه در فهرست‌ها)
  const withGlow = glow ?? size >= 72
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEW} ${MARK_VIEW}`}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffd9ee" />
          <stop offset="26%" stopColor="#ff9ecb" />
          <stop offset="52%" stopColor="#f767a8" />
          <stop offset="78%" stopColor="#d982f0" />
          <stop offset="100%" stopColor="#bba0fb" />
        </linearGradient>
        <linearGradient id={bid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2a1030" />
          <stop offset="55%" stopColor="#160a1e" />
          <stop offset="100%" stopColor="#0b0410" />
        </linearGradient>
        <clipPath id={cid}>
          <rect width={MARK_VIEW} height={MARK_VIEW} rx="112" />
        </clipPath>
        <filter id={fid} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation={stroke * 0.42} result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width={MARK_VIEW} height={MARK_VIEW} rx="112" fill={`url(#${bid})`} />
      <g clipPath={`url(#${cid})`}>
        {withGlow && (
          <g filter={`url(#${fid})`} opacity="0.55">
            <path d={HEART_PATH} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
            <path d={BODY_PATH} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
        <path d={HEART_PATH} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        <path d={BODY_PATH} fill="none" stroke={`url(#${gid})`} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
        {/* رگه‌ی روشنِ وسطِ روبان، همان حسِ براقیِ گردنبند */}
        <path d={HEART_PATH} fill="none" stroke="#fff" strokeOpacity="0.26" strokeWidth={stroke * 0.3} strokeLinecap="round" strokeLinejoin="round" />
        <path d={BODY_PATH} fill="none" stroke="#fff" strokeOpacity="0.24" strokeWidth={stroke * 0.26} strokeLinecap="round" strokeLinejoin="round" />
        {MARK_SPARKLES.map((s) => (
          <g key={`${s.x}-${s.y}`} transform={`translate(${s.x} ${s.y}) rotate(${s.rot})`}>
            <path
              d={`M${-s.r} 0 L0 ${-s.r * 0.36} L${s.r} 0 L0 ${s.r * 0.36} Z`}
              fill="#fff"
              opacity="0.9"
            />
          </g>
        ))}
      </g>
    </svg>
  )
}
