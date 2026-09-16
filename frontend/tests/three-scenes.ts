/**
 * three-scenes.ts — آزمون منطقِ خالصِ صحنه‌های سه‌بعدی (بدون WebGL)
 *
 * سازنده‌های geometry/موقعیت از رندرر جدا شده‌اند تا در jsdom پاس شوند.
 */
import { flowerStage, stemHeight } from '../src/three/scenes/garden'
import { beatScale } from '../src/three/scenes/heartbeat'
import { heartStars, infinityStars, starDepth } from '../src/three/scenes/starmap'
import { lidAngle } from '../src/three/scenes/vault'
import { moodColor, MOOD_COLORS } from '../src/three/scenes/mood'
import {
  atLeast,
  normalizeChoice,
  probeCapability,
  resolveTier,
  TIER_ORDER,
  lowerTier,
} from '../src/shared/quality'

// buildStarmapShapes is in component — re-test helpers only; import component helper via duplicate
// Actually buildStarmapShapes is in StarmapSky.tsx — test heart/infinity here

let failed = 0
const check = (label: string, cond: boolean, extra = '') => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!cond) failed += 1
}

console.log('\n=== three-scenes (pure logic) ===')

/* ---------------- starmap shapes ---------------- */
const heart = heartStars(28)
check('heartStars count', heart.length === 28)
check('heartStars in unit box', heart.every(([x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1))
const inf = infinityStars(36)
check('infinityStars count', inf.length === 36)
check('infinity closed-ish', Math.hypot(inf[0][0] - inf[inf.length - 1][0], inf[0][1] - inf[inf.length - 1][1]) < 0.35)
check('starDepth finite', Number.isFinite(starDepth(3, 1)))

/* ---------------- garden stage ---------------- */
check('stage 0', flowerStage(0) === 0)
check('stage 1', flowerStage(1) === 1)
check('stage 5 water', flowerStage(5) === 3)
check('stage cap 5', flowerStage(99) === 5)
check('stem grows', stemHeight(5) > stemHeight(1))

/* ---------------- heartbeat dual phase ---------------- */
const s0 = beatScale(0.5) // mid-cycle rest
const sPeak = beatScale(0.06)
check('beat rest near 1', Math.abs(s0.y - 1) < 0.08)
check('beat systole larger', sPeak.y > s0.y)

/* ---------------- vault lid ---------------- */
check('lid closed 0', lidAngle(0) === 0)
check('lid open negative', lidAngle(1) < -1)
check('lid monotonic', lidAngle(0.5) > lidAngle(1) && lidAngle(0.5) < lidAngle(0))

/* ---------------- mood colors ---------------- */
check('happy color', moodColor('happy') === MOOD_COLORS.happy)
check('unknown → custom', moodColor('xyz') === MOOD_COLORS.custom)

/* ---------------- quality layer ---------------- */
const report = probeCapability(true)
check('test env detected or no webgl', report.isTestEnv || report.webgl === 0)
const auto = resolveTier('auto', report, null)
check('auto in test → lite', auto.tier === 'lite')
check('normalize junk → auto', normalizeChoice('nope') === 'auto')
check('normalize dream', normalizeChoice('dream') === 'dream')
check('atLeast dream>=balanced', atLeast('dream', 'balanced'))
check('lowerTier dream', lowerTier('dream') === 'balanced')
check('tier order length 3', TIER_ORDER.length === 3)

/* manual capped by veto */
const manual = resolveTier('dream', report, null)
check('manual dream capped in test', manual.tier === 'lite')

/* egg trigger strings preserved in app source (static) */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
const root = join(process.cwd(), 'src', 'apps')
const starmapSrc = readFileSync(join(root, 'Starmap.tsx'), 'utf8')
const gardenSrc = readFileSync(join(root, 'Garden.tsx'), 'utf8')
check('egg star_double_click', starmapSrc.includes('star_double_click'))
check('egg garden_5_water', gardenSrc.includes('garden_5_water'))

console.log(failed === 0 ? '\n🎉 three-scenes OK' : `\n❌ ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
