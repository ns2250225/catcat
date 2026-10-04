import { BUILDING_MAP, YARD_LEVELS } from '@/data/buildings'
import type { BuildingDef, PlacedBuilding, SaveData, WeatherType } from '../types'
import { GRID_H, GRID_W, OX, OY, TILE } from '../constants'
import { clamp, hash } from '../core/rng'
import { isRainy } from './weather'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** 当前等级下可用的格子区域（全局格坐标），底部居中 */
export function yardRect(level: number): Rect {
  const L = YARD_LEVELS[Math.min(level, YARD_LEVELS.length) - 1]
  return { x: Math.floor((GRID_W - L.w) / 2), y: GRID_H - L.h, w: L.w, h: L.h }
}

/** 可走动的像素区域 */
export function walkRect(level: number): Rect {
  const r = yardRect(level)
  return { x: OX + r.x * TILE + 6, y: OY + r.y * TILE + 8, w: r.w * TILE - 12, h: r.h * TILE - 10 }
}

export function tileToPx(tx: number, ty: number) {
  return { x: OX + tx * TILE, y: OY + ty * TILE }
}
export function pxToTile(x: number, y: number) {
  return { x: Math.floor((x - OX) / TILE), y: Math.floor((y - OY) / TILE) }
}

/** 门的位置（底部中央） */
export function doorPos() {
  return { x: OX + (GRID_W / 2) * TILE, y: OY + GRID_H * TILE + 7 }
}

export function def(b: PlacedBuilding): BuildingDef {
  return BUILDING_MAP[b.defId]
}

export function isFloorLayer(d: BuildingDef) {
  return d.category === 'floor'
}

/** 设施占用的矩形（格坐标） */
export function bRect(b: PlacedBuilding): Rect {
  const d = def(b)
  return { x: b.x, y: b.y, w: d.w, h: d.h }
}

export function rectsOverlap(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

export function canPlace(s: SaveData, defId: string, x: number, y: number, ignoreUid?: number): boolean {
  const d = BUILDING_MAP[defId]
  if (!d) return false
  const yr = yardRect(s.yardLevel)
  if (x < yr.x || y < yr.y || x + d.w > yr.x + yr.w || y + d.h > yr.y + yr.h) return false
  const r = { x, y, w: d.w, h: d.h }
  const floor = isFloorLayer(d)
  for (const b of s.buildings) {
    if (b.uid === ignoreUid) continue
    const bd = def(b)
    if (isFloorLayer(bd) !== floor) continue
    if (rectsOverlap(r, bRect(b))) return false
  }
  return true
}

/** 设施底部中心像素位置 */
export function bAnchor(b: PlacedBuilding) {
  const d = def(b)
  const p = tileToPx(b.x, b.y)
  return { x: p.x + (d.w * TILE) / 2, y: p.y + d.h * TILE }
}

/** 遮雨区域（像素） */
export function shelterRects(s: SaveData): Rect[] {
  const out: Rect[] = []
  for (const b of s.buildings) {
    const d = def(b)
    if (!d.tags.includes('roof')) continue
    const pad = d.shelterPad ?? 0
    const p = tileToPx(b.x - pad, b.y - pad)
    out.push({ x: p.x, y: p.y, w: (d.w + pad * 2) * TILE, h: (d.h + pad * 2) * TILE })
  }
  return out
}

export function inRect(x: number, y: number, r: Rect) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
}

/** 阳光区域：白天晴/多云时，随时间移动 */
export function sunSpots(s: SaveData, day: number, hourF: number, weather: WeatherType): { x: number; y: number; r: number }[] {
  if (!(weather === 'sunny' || weather === 'cloudy' || weather === 'rainbow')) return []
  if (hourF < 7 || hourF > 17.5) return []
  const wr = walkRect(s.yardLevel)
  const n = 2 + Math.min(3, s.yardLevel)
  const shift = (hourF - 12) * 6
  const rects = shelterRects(s)
  const out: { x: number; y: number; r: number }[] = []
  for (let i = 0; i < n; i++) {
    const hx = hash(day * 31 + i * 7)
    const hy = hash(day * 17 + i * 13)
    const x = clamp(wr.x + hx * wr.w + shift, wr.x + 10, wr.x + wr.w - 10)
    const y = wr.y + 6 + hy * (wr.h - 12)
    if (rects.some((r) => inRect(x, y, r))) continue
    out.push({ x, y, r: 8 + hash(i + day) * 4 })
  }
  return out
}

// ============ 小院属性与温暖度 ============

export interface YardStats {
  food: number
  water: number
  comfort: number
  fun: number
  hygiene: number
  safety: number
  shelter: number
  relation: number
  beauty: number
  warmth: number
}

export const STAT_LABEL: Record<keyof Omit<YardStats, 'warmth'>, string> = {
  food: '食物', water: '饮水', comfort: '舒适度', fun: '娱乐度', hygiene: '卫生度',
  safety: '安全度', shelter: '天气保护', relation: '猫咪关系', beauty: '美观',
}

const NEED = [60, 90, 140, 200, 280]

export function computeYardStats(s: SaveData, weather: WeatherType, relationScore: number): YardStats {
  const need = NEED[s.yardLevel - 1] ?? 280
  let food = 0, water = 0, comfort = 0, fun = 0, hyg = 0, safety = 0, shelter = 0, beauty = 0
  let dirtPenalty = 0
  for (const b of s.buildings) {
    const d = def(b)
    const st = d.stats
    if (st.food) {
      if (d.foodCap) food += st.food * (b.food > 0 ? 0.5 + (0.5 * b.food) / d.foodCap : 0.08)
      else food += st.food
    }
    if (st.water) {
      if (d.waterCap) water += st.water * (b.water > 0 ? 0.5 + (0.5 * b.water) / d.waterCap : 0.08)
      else water += st.water
    }
    comfort += st.comfort ?? 0
    fun += st.fun ?? 0
    safety += st.safety ?? 0
    shelter += st.shelter ?? 0
    beauty += st.beauty ?? 0
    if (st.hygiene) {
      if (d.dirtCap) {
        const ratio = b.dirt / d.dirtCap
        hyg += st.hygiene * (1 - ratio)
        dirtPenalty += ratio * 22
      } else hyg += st.hygiene
    }
  }
  const n = (v: number) => clamp(Math.round((v * 100) / need), 0, 100)
  const hygiene = clamp(Math.round(45 + (hyg * 100) / need / 1.8 - dirtPenalty - s.trash.length * 4), 0, 100)
  const shelterN = n(shelter * 1.6)
  const weatherScore = isRainy(weather) || weather === 'snow' ? shelterN : 50 + shelterN / 2
  const st: YardStats = {
    food: n(food),
    water: n(water),
    comfort: n(comfort),
    fun: n(fun),
    hygiene,
    safety: n(safety * 1.3),
    shelter: shelterN,
    relation: clamp(Math.round(relationScore), 0, 100),
    beauty: n(beauty),
    warmth: 0,
  }
  const w =
    st.food * 0.18 + st.water * 0.14 + st.comfort * 0.14 + st.fun * 0.12 + st.hygiene * 0.12 +
    st.safety * 0.1 + weatherScore * 0.1 + st.relation * 0.1 + Math.min(5, st.beauty / 12)
  st.warmth = clamp(Math.round(w), 0, 100)
  return st
}
