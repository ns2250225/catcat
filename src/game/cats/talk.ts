import { ENDINGS, LINES, MIDDLES, OPENERS, PERSONALITY_LINES, type DialogueContext, type MiddleKey } from '@/data/dialogue'
import type { Game } from '../core/Game'
import type { Cat } from './Cat'
import { chance, pick } from '../core/rng'
import { def } from '../world/yard'
import { isRainy } from '../world/weather'

/** 适合使用“开头 + 事件 + 性格结尾”组合句的情境 */
const COMPOSABLE = new Set<string>([
  'idle', 'rainSheltered', 'box', 'sunbathing', 'perching', 'eating', 'eatingFav', 'sleepy', 'heater', 'watching',
  'warmthHigh', 'snow', 'cold', 'fog', 'windy', 'sunny', 'cloudy', 'overcast', 'lightRain', 'heavyRain',
  'dawn', 'morning', 'noon', 'afternoon', 'dusk', 'night', 'lateNight', 'spring', 'summer', 'autumn', 'winter', 'tower', 'fishPond', 'drinking',
])
/** 适合插入猫咪专属台词的情境 */
const PERSONAL = new Set<string>(['idle', 'arrive', 'returnVisit', 'watching', 'perching', 'sunbathing', 'fam2', 'fam3', 'fam4', 'fam5', 'petted', 'social'])

function middleKey(g: Game, cat: Cat): MiddleKey {
  const b = cat.target
  if (b) {
    const d = def(b)
    if (d.tags.includes('box')) return 'box'
    if (d.tags.includes('warm')) return 'heater'
    if (d.tags.includes('blanket')) return 'blanket'
    if (d.tags.includes('pond')) return 'pond'
    if (d.tags.includes('flowing') || d.tags.includes('fountain')) return 'fountain'
    if (d.action === 'drink') return 'water'
    if (d.action === 'eat') return b.foodType === 'fish' ? 'fish' : b.foodType === 'canned' ? 'canned' : 'food'
    if (d.action === 'toilet') return 'litter'
    if (d.tags.includes('high')) return 'tower'
    if (d.tags.includes('flower')) return 'flower'
    if (d.tags.includes('tree')) return 'tree'
    if (d.action === 'play' || d.action === 'scratch') return 'toy'
    if (d.action === 'sleep') return 'bed'
  }
  if (cat.state === 'SUNBATHE') return 'sun'
  if (cat.sheltered && isRainy(g.weather)) return 'shelter'
  if (g.cats.length >= Math.max(4, g.maxCats * 0.8)) return 'crowd'
  if (g.cats.length === 1) return 'quiet'
  const friend = g.cats.find((c) => c !== cat && Math.hypot(c.x - cat.x, c.y - cat.y) < 40 && g.relation(cat, c) > 30)
  if (friend) return 'friend'
  if (!g.hasFood()) return 'empty'
  if (cat.y < g.walk.y + 12) return 'wall'
  return pick(['sun', 'quiet', 'food', 'tree'] as MiddleKey[]).toString() as MiddleKey
}

function opener(g: Game): string {
  const w = g.weather
  const notable = w !== 'sunny' && w !== 'cloudy'
  if (notable && chance(0.7)) return pick(OPENERS.weather[w])
  if (chance(0.5)) return pick(OPENERS.period[g.clock.period])
  if (chance(0.5)) return pick(OPENERS.weather[w])
  return pick(OPENERS.season[g.clock.season])
}

function compose(g: Game, cat: Cat): string {
  const mk = middleKey(g, cat)
  const mids = MIDDLES[mk] ?? MIDDLES.quiet
  const ends = ENDINGS[pick(cat.personalities)] ?? ENDINGS.gentle
  let end = pick(ends)
  if (!/^[，。！？…~、]/.test(end)) end = '，' + end
  let mid = pick(mids)
  return `${opener(g)}。${mid}${end}`
}

export function pickLine(g: Game, cat: Cat, ctx: DialogueContext): string {
  // 专属台词
  if (cat.def && PERSONAL.has(ctx) && cat.def.lines.length && chance(0.3)) return pick(cat.def.lines)
  // 性格台词
  for (const p of cat.personalities) {
    const pl = PERSONALITY_LINES[p]?.[ctx]
    if (pl && pl.length && chance(0.45)) return pick(pl)
  }
  // 组合句
  if (COMPOSABLE.has(ctx) && chance(0.3)) return compose(g, cat)
  const pool = LINES[ctx] ?? LINES.idle
  return pick(pool.length ? pool : LINES.idle)
}
