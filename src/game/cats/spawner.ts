import { CATS } from '@/data/cats'
import type { CatDef } from '../types'
import type { Game } from '../core/Game'
import { isRainy } from '../world/weather'
import { def } from '../world/yard'
import { chance, pickWeighted, randInt } from '../core/rng'

/** 特殊出现条件是否满足 */
export function specialMet(g: Game, c: CatDef): boolean {
  const ck = g.clock
  const w = g.weather
  switch (c.special) {
    case undefined:
      return true
    case 'rainNight':
      return ck.period === 'lateNight' && (w === 'heavyRain' || w === 'storm')
    case 'firstSnow':
      return w === 'snow' && g.firstSnowActive
    case 'rainbow':
      return w === 'rainbow'
    case 'fullMoon':
      return ck.fullMoon && (ck.period === 'night' || ck.period === 'lateNight') && !isRainy(w)
    case 'dawnFog':
      return ck.period === 'dawn' && w === 'fog'
    case 'springWind':
      return ck.season === 'spring' && w === 'windy'
    case 'autumn':
      return ck.season === 'autumn'
    case 'christmas':
      return ck.specialDay === 'christmas'
    case 'halloween':
      return ck.specialDay === 'halloween'
    case 'newYear':
      return ck.specialDay === 'newYear'
    case 'fishPond':
      return g.s.buildings.some((b) => b.defId === 'fish_pond')
    case 'garden':
      return g.s.buildings.filter((b) => def(b).category === 'plant').length >= 12
    case 'woodcraft':
      return g.s.buildings.filter((b) => def(b).tags.includes('wood')).length >= 10
    case 'collector':
      return g.computed('distinctItems') >= 50
    case 'maxYard':
      return g.s.yardLevel >= 5
    case 'traveler':
      return true
    case 'day30':
      return g.clock.day >= 30
    case 'friends50':
      return g.computed('friends') >= 50
    case 'dex100':
      return g.computed('discovered') >= 100
    case 'master':
      return g.computed('discovered') >= 119 && g.s.yardLevel >= 5
  }
  return false
}

/** 是否满足基础出现条件（不含概率） */
export function eligible(g: Game, c: CatDef): boolean {
  if (c.times && !c.times.includes(g.clock.period)) return false
  if (c.weatherOnly && !c.weatherOnly.includes(g.weather)) return false
  if (c.seasons && !c.seasons.includes(g.clock.season)) return false
  if (c.minLevel && g.s.yardLevel < c.minLevel) return false
  if (c.minWarmth && g.yard.warmth < c.minWarmth) return false
  return specialMet(g, c)
}

/**
 * VisitScore = 基础出现率 × 食物偏好 × 设施偏好 × 天气 × 时间 × 温暖度 × 隐藏条件
 */
export function visitScore(g: Game, c: CatDef): number {
  if (!eligible(g, c)) return 0
  let s = c.baseRate
  // 食物偏好
  const foods = g.availableFoods()
  if (foods.size === 0) s *= 0.35
  else if (c.favoriteFoods.some((f) => foods.has(f))) s *= 1.6
  // 设施偏好
  let match = 0
  for (const f of c.favoriteFacilities) if (g.hasFacility(f)) match++
  s *= Math.min(2.4, 1 + match * 0.4)
  // 天气
  const wb = c.weatherBonus?.[g.weather]
  if (wb) s *= 1 + wb
  if (c.personalities.includes('rainLover') && isRainy(g.weather)) s *= 2
  if ((c.personalities.includes('timid') || c.personalities.includes('shy')) && g.weather === 'storm') s *= 0.3
  // 时间
  if (c.personalities.includes('nocturnal')) s *= g.clock.isNight ? 2.2 : 0.5
  // 温暖度 & 稀有度
  const w = g.yard.warmth / 100
  s *= 0.4 + w
  if (c.rarity >= 2) s *= Math.pow(Math.max(0.05, w), c.rarity / 2)
  if (c.special === 'traveler') s *= 0.08
  // 熟悉度
  const rec = g.s.cats[c.id]
  if (rec) s *= 1 + g.famLevelById(c.id) * 0.3
  else s *= 1.25
  // 刚离开不久的猫不会马上回来
  if (rec && g.s.gameMinutes - rec.lastVisit < 90) s *= 0.15
  return s
}

/** 选择下一只来访的猫：返回图鉴猫 def 或 null（随机猫） */
export function chooseVisitor(g: Game): CatDef | null | undefined {
  const present = new Set(g.cats.map((c) => c.id))
  const cands = CATS.filter((c) => !present.has(c.id))
  const randomWeight = 9 * (0.5 + g.yard.warmth / 200)
  const scored = cands.map((c) => ({ c, s: visitScore(g, c) })).filter((x) => x.s > 0)
  const total = scored.reduce((a, b) => a + b.s, 0)
  if (chance(randomWeight / (randomWeight + total))) return null
  return pickWeighted(scored, (x) => x.s)?.c
}

export function nextRandomSeed() {
  return randInt(1, 2 ** 30)
}
