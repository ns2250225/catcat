export const rand = Math.random

export function randInt(min: number, max: number) {
  return Math.floor(min + Math.random() * (max - min + 1))
}
export function randRange(min: number, max: number) {
  return min + Math.random() * (max - min)
}
export function chance(p: number) {
  return Math.random() < p
}
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
export function pickWeighted<T>(items: readonly T[], weight: (t: T) => number): T | undefined {
  let total = 0
  const ws = items.map((it) => {
    const w = Math.max(0, weight(it))
    total += w
    return w
  })
  if (total <= 0) return undefined
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= ws[i]
    if (r <= 0) return items[i]
  }
  return items[items.length - 1]
}
export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}
export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v
}
/** 确定性伪随机（mulberry32） */
export function seeded(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function hash(n: number) {
  let x = n | 0
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b)
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296
}
