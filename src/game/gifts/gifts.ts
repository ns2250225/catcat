import { ITEMS, MATERIALS_BY_QUALITY } from '@/data/items'
import type { Game } from '../core/Game'
import type { Cat } from '../cats/Cat'
import { chance, pick, pickWeighted } from '../core/rng'

/** 常用建造材料掉落权重更高 */
export const DROP_WEIGHT: Record<string, number> = {
  wood: 5, cloth: 4, nail: 4, paper: 4, cardboard: 4, string: 4, plastic: 4, stone: 4, twig: 3, grass: 3, leaf: 3,
  iron: 4, clay: 4, seed: 4, yarn: 3, cotton: 3, wire: 2, bamboo: 2, brick: 4, toypart: 3, battery: 2, copper: 3,
  glass: 3, spring: 2, bell: 2, coin: 3, crystal: 2, letter: 2, starstone: 2,
}

/** 掉落礼物的概率 */
export function giftChance(g: Game, cat: Cat) {
  const lvl = cat.isFixed ? g.famLevelOf(cat) : 0
  return Math.min(0.95, 0.5 + g.yard.warmth * 0.003 + lvl * 0.05 + (cat.ate ? 0.12 : 0))
}

/** 生成礼物内容 */
export function rollGift(g: Game, cat: Cat): { items: string[]; treasure: boolean } {
  const rec = cat.isFixed ? g.s.cats[cat.id] : undefined
  const lvl = cat.isFixed ? g.famLevelOf(cat) : 0
  // 专属宝物：老朋友以上才可能赠送
  if (cat.def && rec && lvl >= 4 && !rec.treasureGiven && chance(0.22)) {
    return { items: [cat.def.treasure.id], treasure: true }
  }
  const n = 2 + (chance(0.35) ? 1 : 0) + (chance(0.1 * lvl) ? 1 : 0) + (g.yard.warmth > 60 && chance(0.3) ? 1 : 0)
  const items: string[] = []
  const w = g.yard.warmth / 50
  for (let i = 0; i < n; i++) {
    const bias = cat.def?.giftBias
    if (bias && bias.length && chance(0.35)) {
      const id = pick(bias)
      if (ITEMS[id]) {
        items.push(id)
        continue
      }
    }
    const q =
      pickWeighted([0, 1, 2, 3], (q) =>
        [70, 22 * (1 + w * 0.5), 6 * (1 + w) * (1 + lvl * 0.3), 1.4 * (1 + w) * (1 + lvl * 0.4) * (cat.def ? 1 + cat.def.rarity * 0.5 : 1)][q],
      ) ?? 0
    items.push(pickWeighted(MATERIALS_BY_QUALITY[q], (m) => DROP_WEIGHT[m.id] ?? 1)!.id)
  }
  return { items, treasure: false }
}
