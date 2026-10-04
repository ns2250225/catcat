// 设施像素绘制：全部用 Canvas 2D fillRect 以原生分辨率绘制，作为最近邻纹理放大使用。
// 风格：暖色低饱和像素风，1px 深色描边（填充色的暗化版本），2-3 阶明暗，左上光源。
import type { Season } from '../types'

export const TILE = 16
export const HEADROOM = 40 // footprint 上方额外的像素高度（树、塔、雨棚、灯等）

export interface ArtOpts {
  season: Season
  frame: number // 0..3 动画帧
  night: boolean
  fill?: number // 0..1 食物/水量，-1 表示不适用
  dirt?: number // 0..1 猫砂脏污度
}

// ====================================================================
// 颜色工具
// ====================================================================

type RGB = [number, number, number]
const rgbCache = new Map<string, RGB>()
function toRgb(hex: string): RGB {
  const hit = rgbCache.get(hex)
  if (hit) return hit
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('')
  const n = parseInt(h.slice(0, 6), 16) || 0
  const c: RGB = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  rgbCache.set(hex, c)
  return c
}
function toHex(r: number, g: number, b: number): string {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + f(r) + f(g) + f(b)
}
const mixCache = new Map<string, string>()
function mix(a: string, b: string, t: number): string {
  const key = a + b + t.toFixed(3)
  const hit = mixCache.get(key)
  if (hit) return hit
  const A = toRgb(a), B = toRgb(b)
  const out = toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
  mixCache.set(key, out)
  return out
}
const DARK = '#24161c' // 暗化目标：深紫褐，而非纯黑
const LIGHT = '#fff8e8' // 提亮目标：暖白

/** amt -1..1：负数变暗（偏暖紫褐），正数提亮（偏暖白） */
export function shade(hex: string, amt: number): string {
  if (amt === 0) return hex
  return amt < 0 ? mix(hex, DARK, Math.min(1, -amt)) : mix(hex, LIGHT, Math.min(1, amt))
}

interface Tones { ol: string; dk: string; lo: string; mid: string; hi: string; hl: string }
const toneCache = new Map<string, Tones>()
function tones(c: string): Tones {
  const hit = toneCache.get(c)
  if (hit) return hit
  const t: Tones = {
    ol: shade(c, -0.55),
    dk: shade(c, -0.32),
    lo: shade(c, -0.16),
    mid: c,
    hi: shade(c, 0.22),
    hl: shade(c, 0.45),
  }
  toneCache.set(c, t)
  return t
}
/** 调色板 [ol, dk, mid, hi, hl] */
function pal(c: string): string[] {
  const t = tones(c)
  return [t.ol, t.dk, t.mid, t.hi, t.hl]
}

function hash(x: number, y: number, s = 0): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// 常用固定色
const WOOD = '#9a6d47'
const IRON = '#4a4650'
const STONE = '#a09a8e'
const SOIL = '#6e4e34'
const WATER = '#5fa8d6'
const SNOW = '#eef3f8'
const SNOW_HI = '#ffffff'
const SNOW_LO = '#c9d6e3'
const SHADOW = 'rgba(40,26,22,0.24)'
const KIB = ['#c08048', '#985c2e', '#dca46a', '#6e4220']
const LEAF = '#5f9a4e'
const FLOWER_COLS = ['#f2a6c4', '#f6e38a', '#ffffff', '#c9a6f0', '#f28a6a']

// ====================================================================
// Draw 辅助对象
// ====================================================================

class Draw {
  readonly W: number
  readonly H: number
  readonly FY: number // footprint 顶部 y
  readonly cx: number
  readonly season: Season
  readonly frame: number
  readonly night: boolean
  readonly fill: number
  readonly dirt: number
  private cur = ''

  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly w: number,
    readonly h: number,
    readonly c1: string,
    readonly c2: string,
    readonly o: ArtOpts,
  ) {
    this.W = w * TILE
    this.H = h * TILE + HEADROOM
    this.FY = HEADROOM
    this.cx = this.W / 2
    this.season = o.season
    this.frame = ((o.frame | 0) % 4 + 4) % 4
    this.night = !!o.night
    this.fill = o.fill == null ? -1 : o.fill
    this.dirt = o.dirt == null ? 0 : o.dirt
  }

  get winter() { return this.season === 'winter' }

  px(x: number, y: number, w: number, h: number, c: string) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h)
    if (w <= 0 || h <= 0) return
    if (c !== this.cur) { this.ctx.fillStyle = c; this.cur = c }
    this.ctx.fillRect(x, y, w, h)
  }
  p(x: number, y: number, c: string) { this.px(x, y, 1, 1, c) }
  rect(x: number, y: number, w: number, h: number, c: string) { this.px(x, y, w, h, c) }

  /** 逐像素着色区域（同色横向合并） */
  paint(x0: number, y0: number, x1: number, y1: number, f: (x: number, y: number) => string | null) {
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.ceil(x1); y1 = Math.ceil(y1)
    for (let y = y0; y < y1; y++) {
      let rs = 0, rc: string | null = null
      for (let x = x0; x <= x1; x++) {
        const c = x < x1 ? f(x, y) : null
        if (c !== rc) {
          if (rc) this.px(rs, y, x - rs, 1, rc)
          rs = x; rc = c
        }
      }
    }
  }

  /** 描边矩形 */
  orect(x: number, y: number, w: number, h: number, c: string, ol?: string) {
    this.px(x, y, w, h, ol ?? tones(c).ol)
    this.px(x + 1, y + 1, w - 2, h - 2, c)
  }
  /** 描边 + 左上高光 + 右下阴影的面板 */
  panel(x: number, y: number, w: number, h: number, c: string, ol?: string) {
    const t = tones(c)
    this.orect(x, y, w, h, c, ol)
    if (w > 3 && h > 3) {
      this.px(x + 1, y + h - 2, w - 2, 1, t.lo)
      this.px(x + w - 2, y + 1, 1, h - 2, t.lo)
      this.px(x + 1, y + 1, w - 2, 1, t.hi)
      this.px(x + 1, y + 1, 1, h - 3, t.hi)
    }
  }

  /** 实心椭圆（按行） */
  ell(cx: number, cy: number, rx: number, ry: number, c: string) {
    this.paintEll(cx, cy, rx, ry, () => c)
  }
  paintEll(cx: number, cy: number, rx: number, ry: number, f: (x: number, y: number) => string | null) {
    if (rx <= 0 || ry <= 0) return
    for (let py = Math.floor(cy - ry); py <= Math.ceil(cy + ry); py++) {
      const dy = (py + 0.5 - cy) / ry
      if (dy < -1 || dy > 1) continue
      const hw = rx * Math.sqrt(1 - dy * dy)
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
      if (x1 <= x0) continue
      let rs = x0, rc: string | null = null
      for (let x = x0; x <= x1; x++) {
        const c = x < x1 ? f(x, py) : null
        if (c !== rc) {
          if (rc) this.px(rs, py, x - rs, 1, rc)
          rs = x; rc = c
        }
      }
    }
  }
  /** 描边椭圆 */
  oell(cx: number, cy: number, rx: number, ry: number, c: string, ol?: string) {
    this.ell(cx, cy, rx, ry, ol ?? tones(c).ol)
    this.ell(cx, cy, rx - 1, ry - 1, c)
  }
  /** 带明暗的球体/团块 */
  blob(cx: number, cy: number, rx: number, ry: number, c: string, outline: string | boolean = true, tex = 0, seed = 0) {
    const t = tones(c)
    const ol = outline === true ? t.ol : outline === false ? null : outline
    const inside = (x: number, y: number) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      return dx * dx + dy * dy <= 1
    }
    this.paint(cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1, (x, y) => {
      if (!inside(x, y)) return null
      if (ol && (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1))) return ol
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      const l = -dx * 0.55 - dy * 0.8 + (tex ? (hash(x, y, seed) - 0.5) * tex : 0)
      return l > 0.75 ? t.hl : l > 0.3 ? t.hi : l < -0.45 ? t.lo : t.mid
    })
  }

  linePts(x0: number, y0: number, x1: number, y1: number): [number, number][] {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1)
    const pts: [number, number][] = []
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    for (let i = 0; i < 400; i++) {
      pts.push([x0, y0])
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
    return pts
  }
  line(x0: number, y0: number, x1: number, y1: number, c: string, t = 1) {
    for (const [x, y] of this.linePts(x0, y0, x1, y1)) this.px(x, y, t, t, c)
  }

  /** 地面投影 */
  shadow(cx: number, cy: number, rx: number, ry: number) { this.ell(cx, cy, rx, ry, SHADOW) }

  /** 沿顶边铺雪：topAt(x) 返回该列表面 y，NaN 跳过 */
  snowCap(x0: number, x1: number, topAt: (x: number) => number, seed = 5) {
    for (let x = Math.floor(x0); x < x1; x++) {
      const t = Math.round(topAt(x))
      if (Number.isNaN(t)) continue
      this.px(x, t - 1, 1, 2, SNOW)
      if (hash(x, 1, seed) > 0.45) this.p(x, t - 2, SNOW_HI)
      else this.p(x, t - 1, SNOW_HI)
      if (hash(x, 2, seed) > 0.8) this.p(x, t + 1, SNOW_LO)
    }
  }
  /** 在椭圆团块顶部盖雪 */
  snowTop(cx: number, cy: number, rx: number, ry: number, frac = 0.45, seed = 9) {
    const lim = cy - ry + ry * 2 * frac
    this.paint(cx - rx, cy - ry - 1, cx + rx, lim + 2, (x, y) => {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy > 1) return null
      const edge = lim + (hash(x, 0, seed) - 0.5) * 3
      if (y > edge) return null
      return y > edge - 1 ? SNOW_LO : hash(x, y, seed) > 0.85 ? SNOW_LO : SNOW
    })
  }

  /** 碗内的猫粮 */
  food(cx: number, cy: number, rx: number, ry: number, fill: number, seed = 3) {
    if (!(fill > 0)) return
    const f = Math.min(1, fill)
    const s = 0.45 + 0.55 * Math.sqrt(f)
    const frx = rx * s, fry = Math.max(0.8, ry * s)
    const fcy = cy + (1 - s) * ry * 0.5
    this.paintEll(cx, fcy, frx, fry, (x, y) => {
      const h = hash(x, y, seed)
      return h < 0.28 ? KIB[3] : h < 0.6 ? KIB[1] : h < 0.88 ? KIB[0] : KIB[2]
    })
    const m = f > 0.85 ? 3 : f > 0.6 ? 2 : f > 0.3 ? 1 : 0
    const top = Math.round(fcy - fry)
    for (let k = 1; k <= m; k++) {
      const hw = frx * (1 - k / (m + 1.3))
      const y = top - k + 1
      for (let x = Math.round(cx - hw); x < Math.round(cx + hw); x++) {
        const h = hash(x, y, seed + 7)
        this.p(x, y, k === m ? (h < 0.5 ? KIB[2] : KIB[0]) : h < 0.35 ? KIB[1] : h < 0.8 ? KIB[0] : KIB[2])
      }
    }
  }
  /** 容器内的水面 */
  water(cx: number, cy: number, rx: number, ry: number, fill: number, wc = WATER) {
    if (!(fill > 0)) return
    const f = Math.min(1, fill)
    const s = 0.55 + 0.45 * f
    const sx = rx * s, sy = Math.max(0.8, ry * s)
    const wy = cy + (1 - f) * ry * 0.45
    const t = tones(wc)
    this.ell(cx, wy, sx, sy, t.lo)
    this.ell(cx - 0.4, wy - 0.3, sx - 1, Math.max(0.6, sy - 0.6), wc)
    const hx = Math.round(cx - sx * 0.45) + (this.frame === 2 ? 1 : 0)
    const hy = Math.round(wy - sy * 0.35)
    this.p(hx, hy, t.hl)
    if (sx > 4) this.p(hx + 2, hy, t.hi)
    if (sx > 7) this.px(Math.round(cx + sx * 0.2) - (this.frame % 2), Math.round(wy + sy * 0.2), 2, 1, t.hi)
  }
  /** 猫砂结块 */
  clumps(x0: number, y0: number, w: number, h: number, seed = 11) {
    const d = this.dirt
    if (d < 0.2) return
    const n = Math.round(d * 7)
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.floor(hash(i, 1, seed) * Math.max(1, w - 2))
      const y = y0 + Math.floor(hash(i, 2, seed) * Math.max(1, h - 1))
      this.px(x, y, 2, 1, '#8a6a4a')
      this.px(x, y + 1, 2, 1, '#55402e')
      if (hash(i, 3, seed) > 0.5) this.p(x + 2, y + 1, '#6e5038')
    }
    if (d > 0.7) {
      // 臭气小波纹
      const sx = x0 + Math.floor(w / 2) - 2
      const st = '#a8ad86'
      const f = this.frame % 2
      this.p(sx, y0 - 3 - f, st); this.p(sx + 1, y0 - 4 - f, st); this.p(sx, y0 - 5 - f, st)
      this.p(sx + 4, y0 - 2 - f, st); this.p(sx + 5, y0 - 3 - f, st); this.p(sx + 4, y0 - 4 - f, st)
    }
  }
  flower(x: number, y: number, c: string, center = '#f2c94a') {
    const t = tones(c)
    this.p(x, y - 1, c); this.p(x - 1, y, c); this.p(x + 1, y, t.lo); this.p(x, y + 1, t.lo)
    this.p(x, y, center)
  }
}

type Circ = [number, number, number, number]

/** 树冠：多个椭圆合成，先整体描边再分别着色，像素级抖动边缘 */
function canopy(d: Draw, circles: Circ[], p: string[], seed = 1, p2?: string[]) {
  const insideAny = (x: number, y: number, grow: number) => {
    for (const [cx, cy, rx, ry] of circles) {
      const dx = (x + 0.5 - cx) / (rx + grow), dy = (y + 0.5 - cy) / (ry + grow)
      if (dx * dx + dy * dy <= 1 - 0.22 * hash(x, y, seed)) return true
    }
    return false
  }
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9
  for (const [cx, cy, rx, ry] of circles) {
    x0 = Math.min(x0, cx - rx - 2); x1 = Math.max(x1, cx + rx + 2)
    y0 = Math.min(y0, cy - ry - 2); y1 = Math.max(y1, cy + ry + 2)
  }
  d.paint(x0, y0, x1, y1, (x, y) => {
    if (!insideAny(x, y, 0)) return insideAny(x, y, 1) ? p[0] : null
    // 取最后一个包含该点的圆来计算明暗（形成叶团层次）
    let l = -1
    for (const [cx, cy, rx, ry] of circles) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) l = -dx * 0.45 - dy * 0.85
    }
    l += (hash(x >> 1, y >> 1, seed + 3) - 0.5) * 0.6 + (hash(x, y, seed + 4) - 0.5) * 0.25
    const P = p2 && hash(Math.floor((x + (y % 2)) / 3), Math.floor(y / 3), seed + 9) > 0.58 ? p2 : p
    return l > 0.7 ? P[4] : l > 0.2 ? P[3] : l > -0.45 ? P[2] : P[1]
  })
}

function leafPalette(d: Draw, kind: 'tree' | 'maple' | 'sakura'): { a: string[]; b?: string[] } | null {
  const s = d.season
  if (s === 'winter') return null
  if (kind === 'tree') {
    if (s === 'spring') return { a: pal(mix(d.c1, '#a8d860', 0.4)) }
    if (s === 'summer') return { a: pal(d.c1) }
    return { a: pal('#d9a040'), b: pal('#c8632e') }
  }
  if (kind === 'maple') {
    if (s === 'spring') return { a: pal('#8fc260'), b: pal(mix('#8fc260', d.c1, 0.35)) }
    if (s === 'summer') return { a: pal('#4f8a4a') }
    return { a: pal(d.c1), b: pal(mix(d.c1, '#e8b040', 0.45)) }
  }
  // sakura
  if (s === 'spring') return { a: pal(d.c1) }
  if (s === 'summer') return { a: pal('#5f9a4e') }
  return { a: pal('#d48a4a'), b: pal('#e0b050') }
}

/** 冬天的枯枝（带雪） */
function bareBranches(d: Draw, segs: number[][], c: string) {
  const t = tones(c)
  for (const [x0, y0, x1, y1, th] of segs) {
    for (const [x, y] of d.linePts(x0, y0, x1, y1)) {
      d.px(x, y, th || 1, th || 1, t.mid)
      d.p(x + (th || 1), y, t.ol)
    }
  }
  for (const [x0, y0, x1, y1] of segs) {
    for (const [x, y] of d.linePts(x0, y0, x1, y1)) if (hash(x, y, 77) > 0.45) d.p(x, y - 1, SNOW)
  }
}

function trunk(d: Draw, x: number, top: number, bottom: number, w: number, c: string) {
  const t = tones(c)
  d.px(x - 1, top, w + 2, bottom - top, t.ol)
  d.px(x, top, w, bottom - top - 1, t.mid)
  d.px(x, top, 1, bottom - top - 1, t.hi)
  d.px(x + w - 2, top, 2, bottom - top - 1, t.lo)
  // 根部
  d.px(x - 3, bottom - 3, w + 6, 3, t.ol)
  d.px(x - 2, bottom - 3, w + 4, 2, t.mid)
  d.px(x - 2, bottom - 3, 2, 1, t.hi)
  d.px(x + w, bottom - 3, 2, 2, t.lo)
  for (let y = top + 2; y < bottom - 3; y += 3) {
    const bx = x + 1 + Math.floor(hash(x, y, 5) * Math.max(1, w - 2))
    d.px(bx, y, 1, 2, t.dk)
  }
}

function groundLeaves(d: Draw, cx: number, cy: number, rx: number, cols: string[], n = 8, seed = 31) {
  for (let i = 0; i < n; i++) {
    const a = hash(i, 0, seed) * Math.PI * 2, r = 0.4 + hash(i, 1, seed) * 0.6
    const x = Math.round(cx + Math.cos(a) * rx * r), y = Math.round(cy + Math.sin(a) * rx * r * 0.3)
    const c = cols[i % cols.length]
    d.px(x, y, 2, 1, c)
  }
}

function branchSegs(out: number[][], x: number, y: number, ang: number, len: number, depth: number, th: number, seed: number) {
  const x2 = x + Math.cos(ang) * len, y2 = y - Math.sin(ang) * len
  out.push([Math.round(x), Math.round(y), Math.round(x2), Math.round(y2), th])
  if (depth <= 0) return
  const sp = 0.4 + hash(depth, Math.round(x2 * 3), seed) * 0.35
  branchSegs(out, x2, y2, ang + sp, len * 0.7, depth - 1, Math.max(1, th - 1), seed + 1)
  branchSegs(out, x2, y2, ang - sp * 0.85, len * 0.66, depth - 1, Math.max(1, th - 1), seed + 2)
}

function drawTree(d: Draw, kind: 'tree' | 'maple' | 'sakura') {
  const W = d.W, H = d.H, cx = W / 2
  const bark = d.c2
  d.shadow(cx, H - 5, W * 0.42, 3.5)
  const lp = leafPalette(d, kind)
  const tw = Math.max(4, Math.round(W / 6))
  const tx = Math.round(cx - tw / 2)
  if (!lp) {
    const top = H - 30
    trunk(d, tx, top, H - 4, tw, bark)
    const segs: number[][] = []
    const wide = kind === 'sakura' ? 1.25 : 1
    branchSegs(segs, cx - 1, top + 2, Math.PI / 2 + 0.55 * wide, 11, 2, 2, kind === 'maple' ? 3 : 1)
    branchSegs(segs, cx + 1, top + 1, Math.PI / 2 - 0.5 * wide, 12, 2, 2, kind === 'maple' ? 5 : 2)
    branchSegs(segs, cx, top, Math.PI / 2 + 0.05, 13, 2, 2, 7)
    bareBranches(d, segs, bark)
    // 地面积雪
    d.ell(cx - 6, H - 3, 6, 1.6, SNOW)
    d.ell(cx + 7, H - 5, 4, 1.2, SNOW)
    return
  }
  trunk(d, tx, H - 34, H - 4, tw, bark)
  // 枝杈从树冠下伸出
  const bt = tones(bark)
  d.line(cx - 1, H - 30, cx - 6, H - 35, bt.mid, 2)
  d.line(cx + 1, H - 31, cx + 6, H - 36, bt.mid, 2)
  const circles: Circ[] =
    kind === 'sakura'
      ? [[cx, 25, W * 0.47, 12], [cx - W * 0.29, 34, W * 0.2, 6.5], [cx + W * 0.29, 33, W * 0.2, 6.5], [cx - 2, 15, W * 0.31, 8]]
      : kind === 'maple'
        ? [[cx, 27, W * 0.42, 13], [cx - W * 0.26, 37, W * 0.2, 7], [cx + W * 0.26, 37, W * 0.2, 7], [cx, 14, W * 0.29, 10], [cx + 3, 6, W * 0.15, 5]]
        : [[cx, 26, W * 0.46, 15], [cx - W * 0.28, 38, W * 0.24, 7.5], [cx + W * 0.28, 38, W * 0.24, 7.5], [cx - 1, 13, W * 0.31, 9.5]]
  canopy(d, circles, lp.a, kind === 'maple' ? 4 : kind === 'sakura' ? 7 : 1, lp.b)
  // 季节细节
  if (kind === 'sakura' && d.season === 'spring') {
    for (let i = 0; i < 22; i++) {
      const x = Math.round(cx + (hash(i, 3, 41) - 0.5) * W * 0.85), y = Math.round(6 + hash(i, 4, 41) * 30)
      d.p(x, y, hash(i, 5, 41) > 0.5 ? '#fff0f4' : shade(d.c1, 0.35))
    }
    groundLeaves(d, cx, H - 5, W * 0.45, ['#f6c6d4', '#fbe0e8'], 10)
  } else if (kind === 'tree' && d.season === 'spring') {
    for (let i = 0; i < 9; i++) {
      const x = Math.round(cx + (hash(i, 3, 42) - 0.5) * W * 0.75), y = Math.round(8 + hash(i, 4, 42) * 26)
      d.p(x, y, '#fbeff0'); d.p(x, y + 1, '#f2c0cc')
    }
  } else if (kind === 'tree' && d.season === 'summer') {
    for (let i = 0; i < 4; i++) {
      const x = Math.round(cx + (hash(i, 3, 43) - 0.5) * W * 0.6), y = Math.round(16 + hash(i, 4, 43) * 16)
      d.p(x, y, '#d9503a'); d.p(x + 1, y - 1, '#3f6a32')
    }
  } else if (d.season === 'autumn') {
    groundLeaves(d, cx, H - 5, W * 0.45, kind === 'maple' ? [d.c1, shade(d.c1, -0.2), '#e8a040'] : ['#d9a040', '#c8632e', '#e8c060'], 12)
  } else if (kind === 'maple' && d.season === 'summer') {
    // 夏天叶尖一点点红
    for (let i = 0; i < 5; i++) {
      const x = Math.round(cx + (hash(i, 3, 44) - 0.5) * W * 0.7), y = Math.round(6 + hash(i, 4, 44) * 14)
      d.p(x, y, shade(d.c1, 0.1))
    }
  }
}

// ====================================================================
// 通用构件
// ====================================================================

/** 碗：by=碗底 y，rx=半宽 */
function bowlShape(d: Draw, cx: number, by: number, rx: number, c: string, deco: string, content: 'food' | 'water' | 'none', fill = d.fill, wc = WATER) {
  const t = tones(c)
  cx = Math.round(cx); rx = Math.round(rx)
  const top = by - 8
  // [半宽, 开口内半宽(-1 无)]
  const rows: [number, number][] = [[rx - 3, -1], [rx - 1, rx - 3], [rx, rx - 2], [rx, rx - 3], [rx, -1], [rx, -1], [rx - 1, -1], [rx - 2, -1], [rx - 3, -1]]
  const interior: [number, number, number][] = [] // y, x0, x1
  rows.forEach(([hw, inn], i) => {
    const y = top + i, x0 = cx - hw, x1 = cx + hw
    if (i === 0 || i === rows.length - 1) { d.px(x0, y, x1 - x0, 1, t.ol); return }
    if (i <= 3) {
      d.px(x0, y, x1 - x0, 1, t.hi)
      if (inn > 0) {
        d.px(cx - inn, y, inn * 2, 1, i === 1 ? shade(t.dk, -0.25) : t.dk)
        interior.push([y, cx - inn, cx + inn])
      }
      if (i === 3) { d.p(cx - inn - 1, y, t.hl) }
    } else if (i === 4) {
      d.px(x0, y, x1 - x0, 1, t.hi)
      d.px(x0 + 1, y, hw - 1, 1, t.hl)
    } else {
      d.px(x0, y, x1 - x0, 1, t.mid)
      d.px(x0 + 1, y, 2, 1, t.hi)
      d.px(x1 - 4, y, 3, 1, t.lo)
      if (i === 5 || i === 7) d.px(x0 + 1, y, x1 - x0 - 2, 1, i === 7 ? t.lo : t.mid)
      if (i === 6) for (let x = x0 + 2; x < x1 - 2; x += 2) d.p(x, y, deco)
    }
    d.p(x0, y, t.ol); d.p(x1 - 1, y, t.ol)
  })
  if (!(fill > 0) || content === 'none') return
  const f = Math.min(1, fill)
  if (content === 'food') {
    for (const [y, x0, x1] of interior) for (let x = x0; x < x1; x++) {
      if (hash(x, y, 31) > f * 1.25) continue
      const h = hash(x, y, 3)
      d.p(x, y, h < 0.25 ? KIB[3] : h < 0.6 ? KIB[1] : h < 0.88 ? KIB[0] : KIB[2])
    }
    const mound = f > 0.75 ? 2 : f > 0.45 ? 1 : 0
    for (let k = 0; k < mound; k++) {
      const hw = rx - 4 - k * 2, y = top - k
      for (let x = cx - hw; x < cx + hw; x++) {
        const h = hash(x, y, 7)
        d.p(x, y, k === mound - 1 ? (h < 0.5 ? KIB[2] : KIB[0]) : h < 0.4 ? KIB[1] : KIB[0])
      }
    }
  } else {
    const wt = tones(wc)
    const rowsW = f < 0.4 ? interior.slice(2) : f < 0.75 ? interior.slice(1) : interior
    rowsW.forEach(([y, x0, x1], i) => {
      d.px(x0, y, x1 - x0, 1, i === 0 && rowsW.length === 3 ? wt.lo : wc)
    })
    const [hy, hx0] = rowsW[0]
    d.p(hx0 + 1 + (d.frame === 2 ? 1 : 0), hy + (rowsW.length > 1 ? 1 : 0), wt.hl)
    if (rx > 5) d.p(hx0 + 3, hy + (rowsW.length > 1 ? 1 : 0), wt.hi)
  }
}

/** 3/4 视角盒子：顶面 + 正面 */
function block(d: Draw, x: number, y: number, w: number, topH: number, frontH: number, top: string, front: string) {
  const tt = tones(top), tf = tones(front)
  d.px(x, y, w, topH + frontH, tf.ol)
  d.px(x + 1, y + 1, w - 2, topH - 1, top)
  d.px(x + 1, y + 1, w - 2, 1, tt.hi)
  d.px(x + 1, y + topH, w - 2, frontH - 1, front)
  d.px(x + 1, y + topH, w - 2, 1, tf.hi)
  d.px(x + w - 3, y + topH + 1, 2, frontH - 2, tf.lo)
  d.px(x + 1, y + topH + frontH - 2, w - 2, 1, tf.lo)
}

/** 竖直圆柱（3/4 视角）：顶椭圆 + 柱身 */
function cylinder(d: Draw, cx: number, topY: number, botY: number, rx: number, c: string, topC?: string) {
  const t = tones(c)
  const ry = Math.max(1.5, rx * 0.38)
  d.ell(cx, botY, rx, ry, t.ol)
  d.px(cx - rx, topY, rx * 2, botY - topY, t.ol)
  d.ell(cx, botY - 1, rx - 1, ry - 0.5, t.mid)
  d.px(cx - rx + 1, topY, rx * 2 - 2, botY - topY - 1, t.mid)
  d.px(cx - rx + 1, topY, Math.max(1, Math.round(rx * 0.5)), botY - topY, t.hi)
  d.px(cx + rx - 1 - Math.max(1, Math.round(rx * 0.5)), topY, Math.max(1, Math.round(rx * 0.5)), botY - topY, t.lo)
  d.ell(cx, topY, rx, ry, t.ol)
  d.ell(cx, topY, rx - 1, ry - 0.8, topC ?? t.hi)
}

/** 木柱 */
function post(d: Draw, x: number, top: number, bottom: number, w: number, c: string) {
  const t = tones(c)
  d.px(x, top, w, bottom - top, t.ol)
  if (w > 2) {
    d.px(x + 1, top + 1, w - 2, bottom - top - 2, t.mid)
    d.px(x + 1, top + 1, 1, bottom - top - 2, t.hi)
  } else {
    d.px(x, top, 1, bottom - top, t.mid)
  }
}

function sisal(d: Draw, x: number, top: number, bottom: number, w: number, c: string) {
  const t = tones(c)
  d.px(x, top, w, bottom - top, t.ol)
  for (let y = top; y < bottom; y++) {
    const col = (y & 1) === 0 ? t.mid : t.lo
    d.px(x + 1, y, w - 2, 1, col)
    d.p(x + 1, y, (y & 1) === 0 ? t.hi : t.mid)
  }
}

/** 小盆栽的盆 */
function pot(d: Draw, cx: number, by: number, rx: number, h: number, c: string) {
  const t = tones(c)
  const top = by - h
  for (let y = top; y <= by; y++) {
    const fr = (y - top) / h
    const hw = rx - fr * 1.6
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
    d.px(x0, y, x1 - x0, 1, y === by ? t.ol : t.mid)
    if (y !== by) {
      d.p(x0, y, t.ol); d.p(x1 - 1, y, t.ol)
      d.p(x0 + 1, y, t.hi)
      d.px(x1 - 3, y, 2, 1, t.lo)
    }
  }
  // 盆沿
  d.orect(Math.round(cx - rx - 1), top - 1, Math.round(rx * 2 + 2), 3, t.hi, t.ol)
  d.px(Math.round(cx - rx), top - 1 + 1, Math.round(rx * 2), 1, t.hi)
  d.ell(cx, top - 0.5, rx - 0.5, 0.8, SOIL)
}

function grassBlades(d: Draw, x0: number, x1: number, by: number, hmax: number, c: string, seed = 1, density = 1) {
  const t = tones(c)
  for (let x = x0; x < x1; x++) {
    if (hash(x, 0, seed) > density) continue
    const h = Math.round(hmax * (0.5 + hash(x, 1, seed) * 0.5))
    const lean = hash(x, 2, seed) > 0.5 ? 1 : 0
    for (let k = 0; k < h; k++) {
      const xx = x + (k > h * 0.6 ? lean : 0)
      d.p(xx, by - k, k > h * 0.7 ? t.hi : k < 2 ? t.dk : (x & 1 ? t.mid : t.lo))
    }
  }
}

function roofTopAtTri(apexX: number, apexY: number, x0: number, y0: number, x1: number) {
  return (x: number) => {
    if (x < x0 || x >= x1) return NaN
    const xx = x + 0.5
    if (xx <= apexX) return apexY + ((apexX - xx) / (apexX - x0)) * (y0 - apexY)
    return apexY + ((xx - apexX) / (x1 - apexX)) * (y0 - apexY)
  }
}

/** 山墙屋顶：三角形 */
function gableRoof(d: Draw, apexX: number, apexY: number, x0: number, x1: number, eaveY: number, c: string, thick = 3, trim?: string, wall?: { c: string; x0: number; x1: number; to: number }) {
  const t = tones(c)
  const top = roofTopAtTri(apexX, apexY, x0, eaveY, x1)
  const slope = (eaveY - apexY) / Math.max(1, apexX - x0)
  const vt = Math.max(thick, Math.round(thick * Math.sqrt(1 + slope * slope)))
  const wt = wall ? tones(wall.c) : null
  d.paint(x0, apexY - 1, x1, Math.max(eaveY + vt + 1, wall ? wall.to + 1 : 0), (x, y) => {
    const ty = Math.round(top(x))
    if (Number.isNaN(ty) || y < ty) return null
    const bottom = ty + vt
    if (y > bottom) {
      if (!wall || !wt || x < wall.x0 || x >= wall.x1 || y > wall.to) return null
      if (x === wall.x0 || x === wall.x1 - 1) return wt.ol
      if (y === bottom + 1) return wt.dk
      return (x - wall.x0) % 3 === 0 ? wt.lo : x < wall.x0 + 2 ? wt.hi : wt.mid
    }
    if (y === ty || y === bottom || x === x0 || x === x1 - 1) return t.ol
    if (trim && y === bottom - 1) return trim
    const left = x + 0.5 < apexX
    if (y === ty + 1) return left ? t.hl : t.hi
    return left ? t.hi : t.mid
  })
  return top
}

// ====================================================================
// 各设施绘制
// ====================================================================

type ArtFn = (d: Draw) => void

const ARTS: Record<string, ArtFn> = {
  // ---------------- 食物 ----------------
  bowl(d) {
    d.shadow(d.cx, d.H - 3, 7.5, 2)
    bowlShape(d, 8, d.H - 3, 7, d.c1, d.c2, 'food')
  },
  doubleBowl(d) {
    const H = d.H, W = d.W
    d.shadow(W / 2, H - 3, W / 2 - 1, 2.5)
    const wood = d.c2
    block(d, 1, H - 13, W - 2, 6, 5, shade(wood, 0.1), wood)
    bowlShape(d, 8, H - 5, 7, d.c1, shade(d.c1, 0.35), 'food', d.fill)
    bowlShape(d, W - 8, H - 5, 7, d.c1, shade(d.c1, 0.35), 'food', d.fill > 0 ? Math.min(1, d.fill * 1.1 - 0.1) : d.fill)
  },
  feeder(d) {
    const W = d.W, H = d.H, cx = W / 2
    const t1 = tones(d.c1)
    d.shadow(cx, H - 3, W / 2 - 1, 2.5)
    // 底座 + 出粮口托盘
    block(d, 1, H - 14, W - 2, 4, 11, t1.hi, d.c1)
    const trays = d.w >= 2 ? [8, W - 8] : [cx]
    for (const tx of trays) {
      d.ell(tx, H - 7, 5, 2, t1.ol)
      d.ell(tx, H - 7.3, 4, 1.2, t1.dk)
      d.food(tx, H - 7.3, 4, 1.2, d.fill, 5 + tx)
    }
    // 储粮仓（透明）
    const hw = d.w >= 2 ? 8 : 5
    const hx = Math.round(cx - hw), hy = H - 36, hh = 24
    d.px(hx, hy, hw * 2, hh, t1.ol)
    d.px(hx + 1, hy + 1, hw * 2 - 2, hh - 2, '#cfe6ee')
    const lvl = d.fill > 0 ? Math.round((hh - 3) * Math.min(1, d.fill)) : 0
    if (lvl > 0) {
      d.paint(hx + 1, hy + hh - 1 - lvl, hx + hw * 2 - 1, hy + hh - 1, (x, y) => {
        const h = hash(x, y, 9)
        return h < 0.3 ? KIB[1] : h < 0.8 ? KIB[0] : KIB[2]
      })
    }
    d.px(hx + 2, hy + 2, 1, hh - 6, 'rgba(255,255,255,0.75)')
    d.px(hx + hw * 2 - 3, hy + 2, 1, hh - 4, 'rgba(120,150,170,0.35)')
    // 盖子
    d.orect(hx - 1, hy - 3, hw * 2 + 2, 4, d.c2)
    d.px(hx, hy - 2, hw * 2, 1, shade(d.c2, 0.3))
    d.orect(cx - 2, hy - 5, 4, 3, d.c2)
    // 指示灯
    d.p(W - 4, H - 9, d.fill > 0.2 ? '#7fd17a' : '#e8604a')
  },
  fishRack(d) {
    const W = d.W, H = d.H
    const wood = d.c1
    d.shadow(W / 2, H - 4, 7, 2)
    post(d, 1, 22, H - 4, 3, wood)
    post(d, W - 4, 22, H - 4, 3, wood)
    for (const by of [24, 44]) d.orect(0, by, W, 3, shade(wood, 0.1))
    d.orect(1, H - 14, W - 2, 2, shade(wood, -0.1))
    const cap = 6
    const n = d.fill < 0 ? 4 : Math.round(clamp01(d.fill) * cap)
    const slots = [[4, 27], [8, 27], [12, 27], [4, 47], [8, 47], [12, 47]]
    const ft = tones(d.c2)
    for (let i = 0; i < slots.length; i++) {
      const [x, y] = slots[i]
      d.p(x, y, '#d8d0c0')
      if (i >= n) continue
      const sy = y + 1 + (i % 2)
      // 头朝下挂着的小鱼干：尾叉 + 身体 + 头
      d.p(x - 1, sy, ft.mid); d.p(x + 1, sy, ft.lo)
      d.p(x, sy + 1, ft.ol)
      d.px(x - 1, sy + 2, 3, 6, ft.mid)
      d.px(x - 1, sy + 2, 1, 6, ft.hi)
      d.px(x + 1, sy + 2, 1, 6, ft.lo)
      d.p(x - 1, sy + 2, ft.ol); d.p(x + 1, sy + 2, ft.ol)
      d.p(x, sy + 8, ft.dk)
      d.p(x, sy + 6, '#2a2026') // 眼睛
      d.p(x, sy + 3, ft.dk) // 鳍
    }
  },
  cannedTable(d) {
    const W = d.W, H = d.H
    const wood = d.c1, tw = tones(wood)
    d.shadow(W / 2, H - 3, W / 2 - 2, 2.5)
    // 腿
    post(d, 3, H - 12, H - 2, 3, shade(wood, -0.1))
    post(d, W - 6, H - 12, H - 2, 3, shade(wood, -0.1))
    post(d, 6, H - 14, H - 6, 2, shade(wood, -0.3))
    post(d, W - 8, H - 14, H - 6, 2, shade(wood, -0.3))
    // 桌面
    block(d, 1, H - 20, W - 2, 6, 3, tw.hi, wood)
    d.px(2, H - 17, W - 4, 1, tw.mid)
    // 罐头
    const n = d.fill < 0 ? 3 : d.fill <= 0 ? 0 : Math.max(1, Math.round(d.fill * 3))
    const pos = [7, 16, 25]
    const ct = tones(d.c2)
    for (let i = 0; i < 3; i++) {
      const x = pos[i], y = H - 22
      if (i < n) {
        d.px(x - 3, y - 3, 7, 6, ct.ol)
        d.px(x - 2, y - 2, 5, 4, ct.mid)
        d.px(x - 2, y, 5, 2, i === 1 ? '#d96a5a' : '#6f9fd8') // 标签
        d.p(x - 2, y, shade(i === 1 ? '#d96a5a' : '#6f9fd8', 0.3))
        d.px(x - 2, y - 3, 5, 1, ct.ol)
        d.px(x - 2, y - 3, 5, 1, '#e8a0a0') // 罐头肉
        d.p(x - 1, y - 3, '#f2c0b8')
        d.px(x - 3, y - 4, 7, 1, ct.ol)
        d.px(x - 2, y - 4, 5, 1, '#e09090')
      } else {
        d.ell(x + 0.5, y + 0.5, 3.5, 1.5, '#e8e1d3')
        d.ell(x + 0.5, y + 0.5, 2, 0.7, '#c9c0b0')
      }
    }
  },
  jar(d) {
    const cx = d.cx, H = d.H
    d.shadow(cx, H - 3, 6, 2)
    const top = H - 20, bot = H - 3
    const glass = d.c1, gt = tones(glass)
    d.px(cx - 5, top, 10, bot - top, gt.ol)
    d.px(cx - 4, top + 1, 8, bot - top - 2, glass)
    d.px(cx - 6, top + 2, 12, bot - top - 4, gt.ol)
    d.px(cx - 5, top + 2, 10, bot - top - 4, glass)
    const inner = bot - top - 4
    const lvl = d.fill > 0 ? Math.round(inner * Math.min(1, d.fill)) : 0
    if (lvl > 0) {
      d.paint(cx - 5, bot - 2 - lvl, cx + 5, bot - 2, (x, y) => {
        const h = hash(x >> 1, y >> 1, 4)
        const k = hash(x, y, 6)
        return k < 0.2 ? shade(d.c2, -0.3) : h < 0.5 ? d.c2 : h < 0.8 ? '#e8c890' : shade(d.c2, 0.25)
      })
    }
    d.px(cx - 4, top + 3, 1, inner - 2, 'rgba(255,255,255,0.8)')
    d.p(cx - 3, top + 3, 'rgba(255,255,255,0.7)')
    // 盖子
    d.orect(cx - 5, top - 4, 10, 5, '#c9925a')
    d.px(cx - 4, top - 3, 8, 1, '#e0b07a')
    d.orect(cx - 2, top - 6, 4, 3, '#c9925a')
    // 标签
    d.orect(cx - 3, bot - 9, 6, 4, '#f6eedc')
    d.p(cx - 1, bot - 8, '#d96a5a'); d.p(cx, bot - 8, '#d96a5a')
  },
  trough(d) {
    const W = d.W, H = d.H
    const st = tones(d.c1)
    d.shadow(W / 2, H - 3, W / 2 - 1, 2.5)
    block(d, 1, H - 15, W - 2, 6, 9, st.hi, d.c1)
    // 凹槽
    d.orect(4, H - 13, W - 8, 4, d.c2, st.ol)
    d.px(5, H - 12, W - 10, 1, shade(d.c2, -0.25))
    // 石纹
    for (let i = 0; i < 20; i++) {
      const x = 2 + Math.floor(hash(i, 1, 12) * (W - 4)), y = H - 8 + Math.floor(hash(i, 2, 12) * 5)
      d.p(x, y, hash(i, 3, 12) > 0.5 ? st.lo : st.hi)
    }
    d.px(W / 3, H - 8, 1, 3, st.dk); d.px(W * 0.7, H - 7, 1, 2, st.dk)
    // 食物
    if (d.fill > 0) {
      const f = Math.min(1, d.fill)
      const len = Math.round((W - 10) * (0.35 + 0.65 * f))
      const x0 = Math.round(W / 2 - len / 2)
      d.paint(x0, H - 13, x0 + len, H - 10, (x, y) => {
        const h = hash(x, y, 14)
        return h < 0.3 ? KIB[1] : h < 0.8 ? KIB[0] : KIB[2]
      })
      if (f > 0.5) {
        for (let k = 0; k < 4; k++) {
          const mx = x0 + 3 + Math.floor(hash(k, 1, 15) * (len - 6))
          d.px(mx, H - 14, 3, 1, KIB[0]); d.p(mx + 1, H - 14, KIB[2])
          d.p(mx + 2, H - 14, KIB[1])
        }
      }
      if (f > 0.4) { d.px(x0 + 4, H - 12, 4, 1, '#d4a060'); d.p(x0 + 3, H - 12, '#b07040') } // 小鱼干
    }
  },

  // ---------------- 饮水 ----------------
  waterBowl(d) {
    d.shadow(d.cx, d.H - 3, 7.5, 2)
    bowlShape(d, 8, d.H - 3, 7, d.c1, d.c2, 'water')
  },
  basin(d) {
    const W = d.W, H = d.H, cx = W / 2
    const t = tones(d.c1)
    d.shadow(cx, H - 3, W / 2 - 1, 2.5)
    const rx = W / 2 - 2
    const top = H - 10
    for (let y = top; y <= H - 3; y++) {
      const fr = (y - top) / 7
      const hw = rx - fr * 3
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
      d.px(x0, y, x1 - x0, 1, y === H - 3 ? t.ol : t.mid)
      if (y !== H - 3) {
        d.p(x0, y, t.ol); d.p(x1 - 1, y, t.ol)
        d.px(x0 + 1, y, 4, 1, t.hi); d.px(x1 - 5, y, 4, 1, t.lo)
      }
    }
    d.px(cx - rx + 3, top + 4, rx * 2 - 6, 1, d.c2)
    d.ell(cx, top, rx, 3.5, t.ol)
    d.ell(cx, top, rx - 1, 2.6, t.hi)
    d.ell(cx, top - 0.4, rx - 2.5, 2, t.dk)
    d.water(cx, top - 0.4, rx - 2.5, 2, d.fill)
  },
  dispenser(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 7, 2)
    // 机身
    d.px(cx - 6, H - 13, 12, 11, t.ol)
    d.px(cx - 7, H - 12, 14, 9, t.ol)
    d.px(cx - 6, H - 12, 12, 9, t.mid)
    d.px(cx - 6, H - 12, 3, 8, t.hi)
    d.px(cx + 3, H - 12, 3, 9, t.lo)
    // 水位窗
    d.orect(cx - 3, H - 10, 6, 6, '#3a4a58', t.dk)
    const lvl = d.fill > 0 ? Math.max(1, Math.round(4 * Math.min(1, d.fill))) : 0
    d.px(cx - 2, H - 5 - lvl, 4, lvl, d.c2)
    if (lvl > 0) d.p(cx - 2, H - 5 - lvl, shade(d.c2, 0.5))
    // 顶部水盘
    d.ell(cx, H - 14, 7, 2.6, t.ol)
    d.ell(cx, H - 14, 6, 1.8, t.hi)
    d.ell(cx, H - 14.3, 5, 1.2, t.dk)
    d.water(cx, H - 14.3, 5, 1.2, d.fill > 0 ? 1 : 0, d.c2)
    // 出水口 + 咕噜泡
    d.orect(cx - 1, H - 18, 3, 4, t.hi)
    if (d.fill > 0) {
      const wt = tones(d.c2)
      const f = d.frame
      d.p(cx, H - 19 - (f % 2), wt.hi)
      d.px(cx - 1, H - 19, 3, 1, wt.mid)
      const by = H - 20 - f * 2
      if (f < 3) { d.p(cx + 2, by, wt.hl); d.p(cx - 2, by + 2, wt.hi) }
      if (f === 1 || f === 2) d.p(cx + 3, H - 15, wt.hl)
    }
    d.p(cx + 5, H - 5, '#7fd17a')
  },
  fountain(d) {
    const W = d.W, H = d.H, cx = W / 2
    const t = tones(d.c1)
    const wc = d.c2, wt = tones(wc)
    d.shadow(cx, H - 4, W / 2 - 1, 3)
    // 下层水池
    const rx = W / 2 - 1, top = H - 16, bot = H - 5
    for (let y = top; y <= bot; y++) {
      const fr = (y - top) / (bot - top)
      const hw = rx - fr * 2
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
      d.px(x0, y, x1 - x0, 1, y === bot ? t.ol : t.mid)
      if (y !== bot) {
        d.p(x0, y, t.ol); d.p(x1 - 1, y, t.ol)
        d.px(x0 + 1, y, 4, 1, t.hi); d.px(x1 - 6, y, 5, 1, t.lo)
      }
    }
    for (let x = 3; x < W - 3; x += 5) d.px(x, top + 6, 1, bot - top - 7, t.lo) // 石块缝
    d.ell(cx, top, rx, 5, t.ol)
    d.ell(cx, top, rx - 1, 4, t.hi)
    d.ell(cx, top - 0.5, rx - 3, 3, t.dk)
    d.water(cx, top - 0.5, rx - 3, 3, d.fill, wc)
    // 立柱
    const pT = top - 18
    d.px(cx - 3, pT, 6, 18, t.ol)
    d.px(cx - 2, pT, 4, 17, t.mid)
    d.px(cx - 2, pT, 1, 17, t.hi)
    d.px(cx + 1, pT, 1, 17, t.lo)
    // 上层小碗
    const ut = pT
    d.ell(cx, ut + 3, 7, 2.2, t.ol)
    d.px(cx - 6, ut, 12, 3, t.mid)
    d.ell(cx, ut, 8, 2.6, t.ol)
    d.ell(cx, ut, 7, 1.8, t.hi)
    d.ell(cx, ut - 0.3, 5.5, 1.2, d.fill > 0 ? wc : t.dk)
    if (d.fill > 0) {
      // 喷泉水柱 + 水滴
      const f = d.frame
      d.px(cx - 1, ut - 10, 2, 10, wt.hi)
      d.p(cx, ut - 10, wt.hl); d.p(cx - 1, ut - 11, wt.hl)
      const drops: [number, number][] = [[-3, -9], [3, -9], [-5, -6], [5, -6], [-6, -3], [6, -3], [-7, 0], [7, 0]]
      for (let i = 0; i < drops.length; i++) {
        if ((i + f) % 3 === 0) continue
        const [dx, dy] = drops[i]
        d.p(cx + dx + (dx < 0 ? 0 : -1), ut + dy, (i + f) % 2 ? wt.hi : wt.hl)
      }
      // 溢流到下层
      for (let k = 0; k < 3; k++) {
        const yy = ut + 3 + ((k * 4 + f * 2) % 12)
        d.p(cx - 8, yy, wt.hi); d.p(cx + 7, yy + 2 > top - 2 ? top - 2 : yy + 2, wt.hi)
      }
      // 池中涟漪
      const rr = 3 + f
      d.p(cx - rr - 2, top - 1, wt.hl); d.p(cx + rr + 1, top - 1, wt.hl)
    }
    if (d.winter) d.snowCap(cx - rx + 2, cx + rx - 2, (x) => (x % 5 === 0 ? NaN : top - Math.round(4 * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / rx) ** 2)))))
  },
  barrel(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 7, 2)
    const top = H - 19, bot = H - 3
    // 桶身（中部略鼓）
    for (let y = top; y <= bot; y++) {
      const fr = (y - top) / (bot - top)
      const hw = 6 + Math.sin(fr * Math.PI) * 1.2
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
      d.px(x0, y, x1 - x0, 1, y === bot ? t.ol : t.mid)
      if (y !== bot) {
        d.p(x0, y, t.ol); d.p(x1 - 1, y, t.ol)
        d.p(x0 + 1, y, t.hi); d.p(x0 + 2, y, t.hi)
        d.px(x1 - 3, y, 2, 1, t.lo)
        d.p(cx - 1, y, t.lo); d.p(cx + 2, y, t.lo) // 木板缝
      }
    }
    const hoop = tones(d.c2)
    for (const hy of [top + 3, bot - 4]) {
      d.px(cx - 7, hy, 14, 2, hoop.ol)
      d.px(cx - 6, hy, 12, 1, hoop.hi)
    }
    d.ell(cx, top, 6.5, 2.5, t.ol)
    d.ell(cx, top, 5.5, 1.7, t.hi)
    d.ell(cx, top - 0.3, 4.5, 1.2, t.dk)
    d.water(cx, top - 0.3, 4.5, 1.2, d.fill)
  },
  bambooSpout(d) {
    const W = d.W, H = d.H
    const bt = tones(d.c1)
    d.shadow(W / 2, H - 3, W / 2 - 1, 2.5)
    // 右侧石水钵
    const st = tones(STONE)
    const bx = W - 10
    d.blob(bx, H - 7, 8, 5, STONE, true, 0.3, 3)
    d.ell(bx, H - 9, 5.5, 2, st.ol)
    d.ell(bx, H - 9.2, 4.5, 1.3, st.dk)
    d.water(bx, H - 9.2, 4.5, 1.3, d.fill)
    // 竹架
    const node = d.c2
    post(d, 5, H - 26, H - 4, 3, d.c1)
    post(d, 9, H - 22, H - 4, 3, d.c1)
    d.p(6, H - 16, node); d.p(10, H - 14, node)
    // 斜竹筒
    const pts = d.linePts(3, H - 24, bx - 3, H - 18)
    for (const [x, y] of pts) {
      d.px(x, y - 1, 1, 4, bt.ol)
      d.p(x, y, bt.hi); d.p(x, y + 1, bt.mid)
    }
    d.px(bx - 4, H - 19, 1, 3, bt.dk) // 竹口
    d.p(12, H - 22, node); d.p(13, H - 22, node)
    // 水流
    if (d.fill >= 0) {
      const wt = tones(WATER)
      for (let k = 0; k < 4; k++) {
        const y = H - 17 + ((k * 2 + d.frame) % 7)
        if (y < H - 10) d.p(bx - 3 + (y > H - 13 ? 1 : 0), y, (k + d.frame) % 2 ? wt.hi : wt.hl)
      }
      d.p(bx - 4 - (d.frame % 2), H - 10, wt.hl)
    }
    // 小石子
    d.blob(3, H - 4, 2.5, 1.5, '#8a8478', true)
    d.blob(16, H - 3, 2, 1.2, '#a3a39b', true)
  },
  birdbath(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 5, 1.6)
    // 底座 + 柱
    d.orect(cx - 4, H - 6, 8, 3, d.c1)
    d.px(cx - 3, H - 5, 6, 1, t.hi)
    d.px(cx - 2, H - 22, 4, 17, t.ol)
    d.px(cx - 1, H - 22, 2, 16, t.mid)
    d.p(cx - 1, H - 18, t.hi); d.p(cx - 1, H - 14, t.hi)
    // 盆
    const by = H - 21
    d.ell(cx, by + 1, 6, 2, t.ol)
    d.ell(cx, by - 1, 7.5, 2.6, t.ol)
    d.ell(cx, by - 1, 6.5, 1.8, t.hi)
    d.ell(cx, by - 1.3, 5.5, 1.2, t.dk)
    d.water(cx, by - 1.3, 5.5, 1.2, d.fill, d.c2)
    // 偶尔来的小鸟
    if (d.frame === 1 || d.frame === 2) {
      const bx = cx + 5, byy = by - 5
      d.px(bx - 1, byy, 4, 3, '#5a4a40')
      d.px(bx, byy, 2, 2, '#a07858')
      d.p(bx + 2, byy, '#e8b050')
      d.p(bx + 1, byy - 1, '#a07858'); d.p(bx + 1, byy - 1, '#5a4a40')
      d.p(bx + 1, byy - 1, '#a07858')
    }
  },

  // ---------------- 休息 ----------------
  box(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    const inner = d.c2 === '#8d6a3f' ? t.dk : d.c2
    d.shadow(cx, H - 2, 8, 2)
    // 后盖板（立起，看到内侧）
    d.px(3, H - 22, 10, 5, t.ol)
    d.px(4, H - 21, 8, 4, t.lo)
    d.px(4, H - 21, 8, 1, t.mid)
    // 内部
    d.px(2, H - 18, 12, 7, t.ol)
    d.px(3, H - 17, 10, 6, inner)
    d.px(3, H - 17, 10, 1, shade(inner, -0.3))
    if (d.c2 !== '#8d6a3f') { d.p(5, H - 14, shade(d.c2, 0.3)); d.p(9, H - 13, shade(d.c2, 0.3)); d.px(6, H - 13, 3, 1, shade(d.c2, -0.15)) }
    // 左右翻开的盖子（斜向外）
    const f = tones(shade(d.c1, 0.1))
    for (let i = 0; i < 4; i++) {
      d.px(1 - (i >> 1), H - 18 - i, 3, 1, i === 3 ? f.ol : f.hi)
      d.p(0 - (i >> 1), H - 18 - i, f.ol)
      d.px(12 + (i >> 1), H - 18 - i, 3, 1, i === 3 ? f.ol : f.mid)
      d.p(15 + (i >> 1), H - 18 - i, f.ol)
    }
    // 正面
    d.px(1, H - 12, 14, 10, t.ol)
    d.px(2, H - 12, 12, 9, t.mid)
    d.px(2, H - 12, 12, 1, t.hi)
    d.px(11, H - 11, 3, 8, t.lo)
    d.px(2, H - 4, 12, 1, t.lo)
    // 胶带 + 标签
    d.px(7, H - 12, 2, 9, shade(d.c1, 0.28))
    d.px(3, H - 8, 3, 2, shade(d.c1, -0.25))
    d.p(4, H - 8, shade(d.c1, 0.15))
    d.px(1, H - 12, 14, 1, t.ol)
  },
  mat(d) {
    const W = d.W, H = d.H, FY = d.FY
    const t = tones(d.c1), t2 = tones(d.c2)
    const x0 = 1, y0 = FY + 3, w = W - 2, h = d.h * TILE - 5
    d.orect(x0, y0, w, h, d.c1, t.dk)
    d.paint(x0 + 1, y0 + 1, x0 + w - 1, y0 + h - 1, (x, y) => {
      const k = ((x >> 1) + (y >> 1)) & 1
      const r = (x + y) % 4 === 0 ? t2.mid : null
      return r ?? (k ? t.mid : t.hi)
    })
    d.px(x0 + 1, y0 + h - 2, w - 2, 1, t.lo)
    // 流苏
    for (let y = y0 + 1; y < y0 + h - 1; y += 2) { d.p(x0 - 1 < 0 ? 0 : x0 - 1, y, t2.mid); d.p(x0 + w, y, t2.mid) }
  },
  blanket(d) {
    const W = d.W, H = d.H, FY = d.FY
    const t = tones(d.c1)
    const t2 = tones(d.c2)
    const y0 = FY + 3, h = d.h * TILE - 5
    d.paint(0, y0 - 2, W, y0 + h + 1, (x, y) => {
      const wav = Math.round(Math.sin(x * 0.5) * 0.8)
      const top = y0 + wav + (x < 3 || x > W - 4 ? 1 : 0)
      const bot = y0 + h + (hash(x >> 2, 0, 3) > 0.6 ? 1 : 0)
      if (y < top || y > bot || x < 1 || x > W - 2) return null
      if (y === top || y === bot || x === 1 || x === W - 2) return t.ol
      const check = (((x - 1) >> 2) + ((y - y0) >> 2)) & 1
      const line = (x - 1) % 4 === 0 || (y - y0) % 4 === 0
      let c = check ? t.mid : t.lo
      if (line) c = t2.mid
      if (y === top + 1) c = check ? t.hi : t2.hi
      return c
    })
    // 折痕
    d.line(6, y0 + 3, 10, y0 + 6, t.dk)
    d.line(W - 10, y0 + 2, W - 7, y0 + 8, t.dk)
    // 翻折的一角
    d.px(W - 7, y0 + h - 4, 5, 4, t2.ol)
    d.px(W - 6, y0 + h - 3, 3, 2, t2.mid)
    d.p(W - 6, y0 + h - 3, t2.hl)
  },
  woodHouse(d) {
    const W = d.W, H = d.H, cx = W / 2
    const t = tones(d.c1)
    d.shadow(cx, H - 2, 8, 2)
    // 墙
    d.px(1, H - 16, 14, 14, t.ol)
    d.px(2, H - 16, 12, 13, t.mid)
    for (let x = 4; x < 14; x += 3) d.px(x, H - 15, 1, 12, t.lo)
    d.px(2, H - 16, 1, 13, t.hi)
    d.px(2, H - 4, 12, 1, t.lo)
    // 圆拱门
    d.px(5, H - 10, 6, 8, t.ol)
    d.px(6, H - 11, 4, 1, t.ol)
    d.px(6, H - 10, 4, 7, '#2e2026')
    d.p(6, H - 10, '#46323a')
    // 小牌子
    d.p(cx, H - 13, shade(d.c2, 0.4))
    // 屋顶
    const top = gableRoof(d, cx, H - 27, 0, 16, H - 17, d.c2, 3, undefined, { c: d.c1, x0: 1, x1: 15, to: H - 16 })
    if (d.winter) d.snowCap(0, 16, top)
    // 小烟囱
  },
  plushBed(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx, H - 3, 8, 2.4)
    d.blob(cx, H - 8, 7.5, 5, d.c1, true, 0.5, 2)
    // 内垫
    d.ell(cx, H - 10, 5, 2.6, t.dk)
    d.ell(cx, H - 9.5, 4.5, 2, d.c2)
    d.ell(cx - 0.8, H - 10, 3, 1.1, t2.hl)
    // 前沿高光
    d.px(cx - 5, H - 6, 3, 1, t.hl)
    d.px(cx - 6, H - 5, 2, 1, t.hi)
    // 绒毛点
    for (let i = 0; i < 6; i++) d.p(3 + Math.floor(hash(i, 1, 21) * 10), H - 6 + Math.floor(hash(i, 2, 21) * 3), t.hi)
  },
  hammock(d) {
    const W = d.W, H = d.H
    const wood = d.c1, wt = tones(wood)
    d.shadow(W / 2, H - 3, W / 2 - 1, 2)
    // 底座横木
    d.orect(1, H - 5, W - 2, 3, shade(wood, -0.1))
    // 两侧支架
    post(d, 2, H - 24, H - 4, 3, wood)
    post(d, W - 5, H - 24, H - 4, 3, wood)
    d.line(5, H - 5, 3, H - 12, wt.lo); d.line(W - 6, H - 5, W - 4, H - 12, wt.lo)
    d.orect(1, H - 25, 5, 2, shade(wood, 0.15))
    d.orect(W - 6, H - 25, 5, 2, shade(wood, 0.15))
    // 布兜（下垂曲线）
    const ft = tones(d.c2)
    d.paint(4, H - 24, W - 4, H - 8, (x, y) => {
      const u = (x + 0.5 - W / 2) / (W / 2 - 4)
      const sag = (1 - u * u)
      const top = H - 22 + sag * 4
      const bot = H - 20 + sag * 9
      if (y < Math.round(top) || y > Math.round(bot)) return null
      if (y === Math.round(top) || y === Math.round(bot)) return ft.ol
      if (y === Math.round(top) + 1) return ft.hl
      return (x >> 2) & 1 ? ft.mid : ft.hi
    })
    // 绳子
    d.line(5, H - 23, 7, H - 21, '#6b5440'); d.line(W - 6, H - 23, W - 8, H - 21, '#6b5440')
  },
  treeHole(d) {
    const W = d.W, H = d.H, cx = W / 2
    const t = tones(d.c1)
    d.shadow(cx, H - 4, W / 2 - 1, 3.5)
    const top = H - 36, bot = H - 5
    // 树干（有根）
    d.paint(0, top, W, bot + 1, (x, y) => {
      const fr = (y - top) / (bot - top)
      const flare = fr > 0.75 ? (fr - 0.75) * 4 * 3 : 0
      const hw = 11 + flare + (hash(0, y >> 2, 6) - 0.5) * 1.2
      const dx = x + 0.5 - cx
      if (Math.abs(dx) > hw) return null
      if (Math.abs(dx) > hw - 1 || y === bot) return t.ol
      const bark = (x * 7 + (y >> 2)) % 5 === 0 ? d.c2 : null
      if (dx < -hw + 4) return bark ?? t.hi
      if (dx > hw - 5) return bark ? t.dk : t.lo
      return bark ?? t.mid
    })
    // 截面年轮
    const ct = tones(shade(d.c1, 0.45))
    d.ell(cx, top, 11.5, 3.6, t.ol)
    d.ell(cx, top, 10.5, 2.8, ct.mid)
    d.ell(cx, top, 7, 1.8, ct.lo)
    d.ell(cx, top, 5.5, 1.2, ct.mid)
    d.ell(cx, top, 2, 0.6, ct.lo)
    // 树洞
    const hy = H - 16
    d.ell(cx, hy, 6.5, 7.5, t.ol)
    d.ell(cx, hy + 0.5, 5.5, 6.8, '#2a1c18')
    d.ell(cx + 1, hy + 2, 4, 4.5, '#1e1414')
    d.px(cx - 6, hy - 6, 3, 1, t.hl); d.p(cx - 6, hy - 5, t.hi)
    d.px(cx - 4, H - 9, 8, 1, shade(d.c1, -0.2))
    // 季节点缀
    const s = d.season
    if (s === 'winter') {
      d.snowCap(cx - 11, cx + 11, (x) => top - Math.round(3 * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / 11.5) ** 2))) + 1)
      d.ell(cx - 9, H - 4, 5, 1.4, SNOW); d.ell(cx + 10, H - 5, 4, 1.2, SNOW)
    } else {
      // 苔藓
      const moss = s === 'autumn' ? '#8a8a3a' : '#6aa84a'
      for (let i = 0; i < 8; i++) d.p(cx - 10 + Math.floor(hash(i, 1, 33) * 4), top + 4 + Math.floor(hash(i, 2, 33) * 18), moss)
      // 新芽
      if (s === 'spring' || s === 'summer') {
        const lc = s === 'spring' ? '#9fd65a' : '#5f9a4e'
        d.px(cx + 5, top - 6, 1, 5, '#4f7a3a')
        d.px(cx + 3, top - 7, 2, 2, lc); d.px(cx + 6, top - 6, 2, 2, lc)
        d.p(cx + 3, top - 7, shade(lc, 0.3))
        if (s === 'spring') d.p(cx + 5, top - 7, '#f2a6c4')
      } else {
        // 蘑菇 + 落叶
        d.px(cx + 8, H - 9, 4, 2, '#c8503a'); d.p(cx + 9, H - 9, '#f2e6d0'); d.px(cx + 9, H - 7, 2, 2, '#efe3c9')
        d.px(cx + 11, H - 7, 3, 1, '#c8503a'); d.p(cx + 12, H - 6, '#efe3c9')
        groundLeaves(d, cx, H - 4, W / 2, ['#d9a040', '#c8632e'], 8)
      }
    }
  },
  roofNest(d) {
    const W = d.W, H = d.H
    const wood = d.c1
    d.shadow(W / 2, H - 4, 7, 2)
    // 支柱
    post(d, 1, H - 40, H - 3, 3, wood)
    post(d, W - 4, H - 40, H - 3, 3, wood)
    post(d, 4, H - 40, H - 14, 2, shade(wood, -0.3))
    post(d, W - 6, H - 40, H - 14, 2, shade(wood, -0.3))
    // 梯子横档
    for (let y = H - 34; y < H - 4; y += 5) d.orect(4, y, 8, 2, shade(wood, 0.1))
    // 平台
    const py = H - 44
    block(d, 0, py, W, 5, 3, shade(wood, 0.25), wood)
    // 窝垫
    d.blob(W / 2, py + 1, 6, 2.8, '#e7d6a9', true, 0.3, 4)
    d.ell(W / 2, py, 3.5, 1.2, shade('#e7d6a9', -0.18))
    // 小屋顶
    const rt = tones(d.c2)
    post(d, 1, py - 16, py, 2, shade(wood, -0.15))
    post(d, W - 3, py - 16, py, 2, shade(wood, -0.15))
    const top = gableRoof(d, W / 2, py - 26, 0, W, py - 16, d.c2, 3, rt.lo)
    if (d.winter) d.snowCap(0, W, top)
  },
  heater(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 7, 2)
    // 脚
    d.px(cx - 6, H - 5, 2, 3, t.ol); d.px(cx + 4, H - 5, 2, 3, t.ol)
    // 炉身
    d.px(cx - 6, H - 22, 12, 18, t.ol)
    d.px(cx - 5, H - 21, 10, 16, t.mid)
    d.px(cx - 5, H - 21, 2, 16, t.hi)
    d.px(cx + 3, H - 21, 2, 16, t.lo)
    d.px(cx - 7, H - 23, 14, 3, t.ol)
    d.px(cx - 6, H - 22, 12, 1, t.hl)
    // 烟囱
    d.px(cx - 2, H - 34, 4, 11, t.ol)
    d.px(cx - 1, H - 34, 2, 11, t.hi)
    d.px(cx - 3, H - 35, 6, 2, t.ol)
    // 炉窗 + 火焰
    d.px(cx - 4, H - 16, 8, 8, t.ol)
    const f = d.frame
    const fl = tones(d.c2)
    d.px(cx - 3, H - 15, 6, 6, '#3a1a14')
    d.px(cx - 3, H - 11, 6, 2, fl.dk)
    const hs = [[2, 4, 3, 2], [3, 2, 4, 3], [2, 3, 4, 2], [4, 3, 2, 3]][f]
    for (let i = 0; i < 4; i++) {
      const x = cx - 3 + i + (i > 1 ? 1 : 0)
      if (i > 3) continue
      d.px(x, H - 9 - hs[i], 1, hs[i], fl.mid)
      d.p(x, H - 9 - hs[i], fl.hi)
    }
    d.px(cx - 1, H - 11, 2, 2, '#ffe6a0')
    // 热气
    const sy = H - 38 - (f % 2)
    d.p(cx - 1 + (f >> 1), sy, 'rgba(240,230,220,0.6)'); d.p(cx + (f >> 1), sy - 2, 'rgba(240,230,220,0.45)')
  },
  kotatsu(d) {
    const W = d.W, H = d.H
    const qt = tones(d.c1)
    d.shadow(W / 2, H - 4, W / 2 - 1, 3)
    // 被子（梯形下垂，有褶）
    const qTop = H - 27
    d.paint(0, qTop, W, H - 3, (x, y) => {
      const fr = (y - qTop) / 22
      const hw = W / 2 - 3 + fr * 2.6
      const dx = x + 0.5 - W / 2
      const bot = H - 5 + (Math.sin(x * 0.9) > 0.3 ? 1 : 0)
      if (y > bot || Math.abs(dx) > hw) return null
      if (y === bot || Math.abs(dx) > hw - 1) return qt.ol
      if (y < qTop + 2) return qt.lo
      if (x % 6 === 3 && y > qTop + 4) return qt.lo
      if (x % 6 === 4 && y > qTop + 4) return qt.hi
      return dx < -hw + 4 ? qt.hi : dx > hw - 5 ? qt.lo : qt.mid
    })
    // 被面花纹
    for (let i = 0; i < 5; i++) {
      const x = 5 + i * 5, y = H - 15 + (i % 2) * 4
      const c = shade(d.c1, 0.4)
      d.p(x, y, c); d.p(x + 1, y, c); d.p(x, y + 1, c); d.p(x + 1, y + 1, shade(d.c1, 0.2))
    }
    // 桌面
    const wt = tones(d.c2)
    d.px(1, H - 32, W - 2, 7, wt.ol)
    d.px(2, H - 31, W - 4, 3, wt.hi)
    d.px(2, H - 31, W - 4, 1, wt.hl)
    d.px(2, H - 28, W - 4, 2, wt.mid)
    d.px(2, H - 27, W - 4, 1, wt.lo)
    // 橘子 + 茶杯
    d.blob(9, H - 31, 2.6, 2.2, '#f0a040', true)
    d.p(9, H - 33, '#5f9a4e')
    d.blob(13, H - 30.5, 2.4, 2, '#e89838', true)
    d.orect(W - 10, H - 34, 5, 5, '#e8e1d3')
    d.px(W - 9, H - 33, 3, 1, '#7a9a5a')
    // 下面暗暗的入口
    d.px(W / 2 - 5, H - 10, 10, 5, qt.ol)
    d.px(W / 2 - 4, H - 9, 8, 4, '#2e1e22')
    d.px(W / 2 - 4, H - 9, 8, 1, '#5a2e28')
    d.p(W / 2 + 2, H - 7, '#ff9a5a') // 里面的暖光
  },
  basket(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 7.5, 2)
    const top = H - 12, bot = H - 3
    for (let y = top; y <= bot; y++) {
      const fr = (y - top) / (bot - top)
      const hw = 7 - fr * 1.6
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
      for (let x = x0; x < x1; x++) {
        let c = ((x + (y >> 1)) & 1) ? t.mid : t.hi
        if ((y - top) % 3 === 0) c = t.lo
        if (x > cx + hw - 3) c = (c === t.hi ? t.mid : t.lo)
        if (x === x0 || x === x1 - 1 || y === bot) c = t.ol
        d.p(x, y, c)
      }
    }
    // 篮口
    d.ell(cx, top, 7.5, 2.8, t.ol)
    d.paintEll(cx, top, 6.5, 2, (x) => ((x & 1) ? t.hi : t.hl))
    d.ell(cx, top - 0.3, 5, 1.3, d.c2)
    d.ell(cx, top - 0.6, 3.5, 0.8, shade(d.c2, 0.25))
    // 小毯子垂边
    d.px(cx + 2, top + 1, 3, 3, '#e8d8b8'); d.p(cx + 4, top + 3, '#c8b898')
  },
  sofa(d) {
    const W = d.W, H = d.H
    const t = tones(d.c1)
    d.shadow(W / 2, H - 3, W / 2 - 1, 2.5)
    // 椅背
    d.px(3, H - 26, W - 6, 13, t.ol)
    d.px(4, H - 25, W - 8, 12, t.lo)
    d.px(4, H - 25, W - 8, 2, t.mid)
    d.px(4, H - 25, W - 8, 1, t.hi)
    for (let x = 4 + Math.floor((W - 8) / 3); x < W - 6; x += Math.floor((W - 8) / 3)) d.px(x, H - 23, 1, 9, t.dk)
    // 坐垫
    const n = 3, cw = Math.floor((W - 12) / n)
    for (let i = 0; i < n; i++) {
      const x = 6 + i * cw
      d.px(x, H - 15, cw, 6, t.ol)
      d.px(x + 1, H - 14, cw - 2, 4, t.mid)
      d.px(x + 1, H - 14, cw - 2, 1, t.hl)
      d.px(x + 1, H - 13, 2, 3, t.hi)
    }
    // 前裙
    d.px(3, H - 10, W - 6, 6, shade(d.c2, -0.4))
    d.px(4, H - 9, W - 8, 4, d.c2)
    d.px(4, H - 9, W - 8, 1, shade(d.c2, 0.15))
    // 扶手
    for (const ax of [0, W - 7]) {
      d.px(ax, H - 20, 7, 16, t.ol)
      d.px(ax + 1, H - 19, 5, 14, t.mid)
      d.px(ax + 1, H - 19, 5, 2, t.hi)
      d.px(ax + 1, H - 19, 1, 14, t.hi)
      d.px(ax + 5, H - 17, 1, 12, t.lo)
    }
    // 抓痕
    for (const [x, y] of [[2, H - 14], [3, H - 13], [W - 5, H - 15], [W - 4, H - 13]]) d.px(x, y, 1, 3, t.hl)
    d.px(W / 2 - 4, H - 8, 1, 2, shade(d.c2, 0.4)); d.px(W / 2 - 2, H - 8, 1, 2, shade(d.c2, 0.4))
    // 腿
    d.px(2, H - 4, 2, 2, '#3a2a22'); d.px(W - 4, H - 4, 2, 2, '#3a2a22')
  },
  cushion(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx, H - 3, 7, 2)
    d.paint(1, H - 14, 15, H - 2, (x, y) => {
      const dx = (x + 0.5 - cx) / 7, dy = (y + 0.5 - (H - 8)) / 5.5
      const r = Math.pow(Math.abs(dx), 3) + Math.pow(Math.abs(dy), 3)
      if (r > 1) return null
      const rIn = Math.pow(Math.abs((x + 0.5 - cx) / 6), 3) + Math.pow(Math.abs((y + 0.5 - (H - 8)) / 4.5), 3)
      if (rIn > 1) return t.ol
      const l = -dx * 0.5 - dy * 0.8
      return l > 0.45 ? t.hl : l > 0.05 ? t.hi : l < -0.5 ? t.lo : t.mid
    })
    // 纽扣 + 缝线
    d.px(cx - 1, H - 9, 2, 2, t2.mid)
    d.p(cx - 1, H - 9, t2.hl)
    d.p(cx - 4, H - 8, t.lo); d.p(cx + 3, H - 8, t.lo); d.p(cx, H - 12, t.lo); d.p(cx, H - 5, t.lo)
    // 四角流苏
    d.p(1, H - 13, t2.mid); d.p(14, H - 13, t2.mid); d.p(1, H - 4, t2.mid); d.p(14, H - 4, t2.mid)
  },
  tire(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx, H - 3, 8, 2)
    // 侧面胎纹
    d.ell(cx, H - 6, 7.5, 3.4, t.ol)
    d.px(cx - 7.5, H - 10, 15, 4, t.ol)
    d.ell(cx, H - 6.5, 6.5, 2.5, t.mid)
    d.px(cx - 6.5, H - 9, 13, 3, t.mid)
    for (let x = 2; x < 14; x += 2) d.px(x, H - 8, 1, 3, t.dk)
    // 顶面（胎壁）
    d.ell(cx, H - 10, 7.5, 3.6, t.ol)
    d.ell(cx, H - 10.2, 6.5, 2.7, mix(d.c2, '#9a948c', 0.25))
    d.paintEll(cx, H - 10.2, 6.5, 2.7, (x, y) => (y < H - 11 && x < cx ? t2.hi : y > H - 10 && x > cx ? t2.lo : null))
    // 中空
    d.ell(cx, H - 10, 3.5, 1.5, '#141010')
    d.px(cx - 2, H - 11, 4, 1, '#100c0c')
    d.px(cx - 2, H - 9, 4, 1, shade(d.c2, -0.35))
    d.p(cx - 5, H - 12, t2.hl); d.p(cx - 4, H - 12, t2.hl)
  },
  treeHouse(d) {
    const W = d.W, H = d.H, cx = W / 2
    const lp = leafPalette(d, 'tree')
    const leaves = d.season === 'summer' ? pal(d.c2) : lp ? lp.a : null
    d.shadow(cx, H - 4, W / 2 - 2, 4)
    // 树冠（屋后）
    if (leaves) canopy(d, [[cx, 16, 22, 14], [cx - 15, 26, 9, 9], [cx + 15, 26, 9, 9], [cx, 6, 14, 7]], leaves, 6, d.season === 'autumn' && lp ? lp.b : undefined)
    else bareBranches(d, [[cx, 30, cx - 18, 6, 2], [cx, 30, cx + 18, 4, 2], [cx - 1, 30, cx - 2, 0, 2], [cx - 10, 18, cx - 22, 14, 1], [cx + 9, 16, cx + 22, 18, 1]], d.c1)
    // 树干
    trunk(d, cx - 5, 24, H - 4, 10, d.c1)
    // 斜撑
    const wt = tones('#a77b4f')
    d.line(cx - 4, H - 28, cx - 18, H - 36, tones(d.c1).ol, 2)
    d.line(cx + 4, H - 28, cx + 18, H - 36, tones(d.c1).ol, 2)
    // 平台
    const py = H - 38
    block(d, 2, py, W - 4, 4, 3, wt.hi, '#a77b4f')
    for (let x = 6; x < W - 4; x += 5) d.p(x, py + 2, wt.lo)
    // 栏杆
    for (let x = 3; x < W - 3; x += 4) { d.px(x, py - 4, 1, 4, wt.ol) }
    d.px(2, py - 5, 8, 1, wt.ol); d.px(W - 10, py - 5, 8, 1, wt.ol)
    // 小屋
    const hx = 12, hw = W - 24, hy = py - 17
    d.px(hx, hy, hw, 18, wt.ol)
    d.px(hx + 1, hy + 1, hw - 2, 16, wt.mid)
    for (let y = hy + 3; y < py; y += 3) d.px(hx + 1, y, hw - 2, 1, wt.lo)
    d.px(hx + 1, hy + 1, 1, 16, wt.hi)
    // 门 + 窗
    d.px(cx - 3, py - 10, 6, 11, wt.ol)
    d.px(cx - 2, py - 9, 4, 10, '#2e2026')
    d.p(cx - 2, py - 9, '#46323a')
    const wc = d.night ? '#ffd27a' : '#bfe0ee'
    d.orect(hx + 3, hy + 4, 5, 5, wc, wt.ol); d.p(hx + 5, hy + 4, wt.ol); d.px(hx + 3, hy + 6, 5, 1, wt.ol)
    d.orect(hx + hw - 8, hy + 4, 5, 5, wc, wt.ol); d.p(hx + hw - 6, hy + 4, wt.ol); d.px(hx + hw - 8, hy + 6, 5, 1, wt.ol)
    // 屋顶
    const top = gableRoof(d, cx, hy - 13, hx - 4, hx + hw + 4, hy + 1, '#b5533f', 3, undefined, { c: '#a77b4f', x0: hx, x1: hx + hw, to: hy + 1 })
    if (d.winter) { d.snowCap(hx - 4, hx + hw + 4, top); d.snowCap(2, W - 2, (x) => (x > hx - 1 && x < hx + hw ? NaN : py + 1)) }
    // 梯子
    const lx = W - 10
    for (const x of [lx, lx + 5]) d.px(x, py + 6, 1, H - 6 - py - 6, '#6b4a30')
    for (let y = py + 9; y < H - 6; y += 4) d.px(lx, y, 6, 1, '#7a5a3a')
    // 秋天落叶 / 春天花
    if (d.season === 'autumn') groundLeaves(d, cx, H - 5, W / 2 - 2, ['#d9a040', '#c8632e', '#e8c060'], 12)
    if (d.season === 'spring' && leaves) for (let i = 0; i < 10; i++) d.p(Math.round(cx + (hash(i, 1, 50) - 0.5) * 40), Math.round(4 + hash(i, 2, 50) * 22), '#fbeff0')
  },

  // ---------------- 玩耍 ----------------
  yarnBall(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx - 1, H - 3, 6, 1.8)
    // 拖出的线
    const tail: [number, number][] = [[cx + 4, H - 4], [cx + 5, H - 3], [cx + 6, H - 3], [cx + 7, H - 4], [cx + 7, H - 5]]
    for (const [x, y] of tail) d.p(x, y, t.mid)
    d.blob(cx - 1, H - 8, 5.5, 5, d.c1, true)
    // 缠绕线
    for (const [a, b] of [[-4, -3], [-3, 1], [-1, -4]]) {
      d.line(cx - 1 + a, H - 8 + b, cx - 1 + a + 6, H - 8 + b + 3, t2.mid)
    }
    d.line(cx - 5, H - 7, cx + 2, H - 12, t.dk)
    d.p(cx - 3, H - 11, t.hl); d.p(cx - 4, H - 10, t2.hl)
  },
  teaser(d) {
    const cx = d.cx, H = d.H
    const st = tones(d.c1)
    d.shadow(cx - 3, H - 3, 3, 1.2)
    // 底座（插在土里）
    d.ell(cx - 3, H - 3, 3, 1.3, SOIL)
    // 弯曲的杆
    const pts: [number, number][] = []
    for (let i = 0; i <= 24; i++) {
      const tt = i / 24
      pts.push([Math.round(cx - 3 + tt * tt * 9), Math.round(H - 4 - tt * 32)])
    }
    for (const [x, y] of pts) { d.p(x, y, st.mid); d.p(x + 1, y, st.ol) }
    const [ex, ey] = pts[pts.length - 1]
    // 摆动的线 + 羽毛
    const sway = [0, 1, 2, 1][d.frame]
    const fx = ex + sway - 1, fy = ey + 12
    d.line(ex, ey, fx, fy, '#d8d0c0')
    const ft = tones(d.c2)
    d.px(fx - 1, fy, 3, 6, ft.ol)
    d.px(fx, fy + 1, 1, 5, ft.mid)
    d.p(fx - 1, fy + 2, ft.hi); d.p(fx + 1, fy + 3, ft.hi); d.p(fx - 2, fy + 4, ft.mid); d.p(fx + 2, fy + 5, ft.mid)
    d.p(fx, fy + 6, '#f2e6c0'); d.p(fx, fy, '#f2c94a')
  },
  scratchBoard(d) {
    const W = d.W, H = d.H
    const t = tones(d.c1)
    d.shadow(d.cx, H - 3, 8, 2)
    // 侧面楔形
    d.paint(0, H - 16, W, H - 2, (x, y) => {
      const top = H - 4 - Math.round((x / (W - 1)) * 10)
      if (x < 1 || x > W - 2 || y < top || y > H - 3) return null
      if (y === top || y === H - 3 || x === 1 || x === W - 2) return t.ol
      if (y === top + 1) return t.hl
      // 瓦楞纹
      return (x + y) % 2 === 0 ? d.c2 : t.mid
    })
    // 侧板
    d.px(1, H - 7, W - 2, 4, t.ol)
    d.px(2, H - 6, W - 4, 2, t.lo)
    d.px(3, H - 6, 4, 1, t.hi)
    // 猫薄荷碎屑
    d.p(6, H - 10, '#7fbf6a'); d.p(9, H - 12, '#7fbf6a')
  },
  scratchPost(d) {
    const cx = d.cx, H = d.H
    const bt = tones(d.c2)
    d.shadow(cx, H - 3, 7.5, 2)
    // 底座
    block(d, 1, H - 9, 14, 4, 3, bt.hi, d.c2)
    // 柱子
    sisal(d, cx - 3, H - 34, H - 7, 6, d.c1)
    // 顶台
    d.ell(cx, H - 35, 5.5, 2.4, bt.ol)
    d.ell(cx, H - 35.5, 4.5, 1.6, bt.hi)
    d.px(cx - 5, H - 35, 11, 2, bt.ol)
    d.px(cx - 4, H - 35, 9, 1, bt.mid)
    // 挂球
    d.p(cx + 4, H - 33, '#d8d0c0'); d.p(cx + 4, H - 32, '#d8d0c0'); d.p(cx + 4, H - 31, '#d8d0c0')
    d.blob(cx + 4, H - 28, 2, 2, '#e65b7a', true)
    // 抓痕
    d.p(cx - 1, H - 20, shade(d.c1, 0.5)); d.p(cx, H - 18, shade(d.c1, 0.5)); d.p(cx - 1, H - 16, shade(d.c1, 0.5))
  },
  mouseToy(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx, H - 3, 5, 1.5)
    // 尾巴
    d.line(cx + 4, H - 5, cx + 6, H - 3, '#8a6a5a'); d.p(cx + 7, H - 3, '#8a6a5a'); d.p(cx + 7, H - 4, '#8a6a5a')
    // 身体（水滴形）
    d.blob(cx + 0.5, H - 6, 4.5, 3, d.c1, true)
    d.blob(cx - 3, H - 6.5, 2.5, 2.2, d.c1, true)
    // 耳朵
    d.px(cx - 3, H - 10, 2, 2, t.ol); d.p(cx - 3, H - 9, t2.mid)
    d.px(cx - 1, H - 10, 2, 2, t.ol); d.p(cx - 1, H - 9, t2.mid)
    d.p(cx - 6, H - 6, t2.mid) // 鼻子
    d.p(cx - 4, H - 7, '#2a2026') // 眼睛
    d.p(cx - 1, H - 8, t.hl)
  },
  paperBall(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx, H - 3, 5, 1.5)
    d.paint(cx - 6, H - 13, cx + 6, H - 2, (x, y) => {
      const dx = (x + 0.5 - cx) / 5, dy = (y + 0.5 - (H - 7.5)) / 4.6
      const r = dx * dx + dy * dy + (hash(x, y, 8) - 0.5) * 0.35
      if (r > 1) return null
      if (r > 0.72) return t2.ol
      const crease = hash(x >> 1, y, 9) > 0.78 || (x + y) % 5 === 0
      if (crease) return t2.mid
      return -dx - dy > 0.4 ? t.hl : -dx - dy < -0.6 ? t2.hi : t.mid
    })
    d.line(cx - 3, H - 9, cx + 1, H - 6, t2.lo)
    d.line(cx + 1, H - 11, cx + 3, H - 7, t2.lo)
    d.p(cx - 2, H - 11, '#7a90b0'); d.p(cx - 1, H - 11, '#7a90b0') // 字迹
  },
  boxMaze(d) {
    const W = d.W, H = d.H
    const t = tones(d.c1)
    d.shadow(W / 2, H - 2, W / 2 - 1, 2)
    const boxes: [number, number, number][] = [[1, 16, 14], [15, 20, 20], [33, 14, 12]] // x, w, height
    for (const [x, w, bh] of boxes) {
      const y = H - 2 - bh
      block(d, x, y, w, 4, bh - 4, t.hi, d.c1)
      d.px(x + 1, y + 1, w - 2, 1, shade(d.c1, 0.35))
      // 胶带
      d.px(x + Math.floor(w / 2) - 1, y + 1, 2, 3, shade(d.c1, 0.3))
      d.px(x + Math.floor(w / 2) - 1, y + 4, 2, bh - 5, shade(d.c1, 0.15))
    }
    // 圆洞
    const hole = (hx: number, hy: number, r: number) => {
      d.ell(hx, hy, r + 0.8, r + 0.8, t.ol)
      d.ell(hx, hy, r, r, '#2e2024')
      d.p(Math.round(hx - r + 1), Math.round(hy - r + 1), '#4a3830')
    }
    hole(8, H - 6, 3.2)
    hole(25, H - 8, 4)
    hole(39, H - 6, 2.6)
    // 侧窗口
    d.px(19, H - 17, 3, 2, '#2e2024')
    // 猫爪印
    d.p(42, H - 11, t.dk); d.p(43, H - 12, t.dk); d.p(41, H - 12, t.dk)
  },
  tunnel(d) {
    const W = d.W, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(W / 2, H - 2, W / 2 - 1, 2)
    // 管身
    const cy = H - 8.5, ry = 6.5
    d.paint(4, cy - ry - 1, W - 2, cy + ry + 1, (x, y) => {
      const dy = (y + 0.5 - cy) / ry
      if (Math.abs(dy) > 1) return null
      const rib = (x - 4) % 5 === 0
      const sag = x > W / 2 + 2 ? 1 : 0
      if (Math.abs(dy) > 0.82 - sag * 0.1) return t.ol
      if (rib) return t2.mid
      return dy < -0.45 ? t.hi : dy > 0.4 ? t.lo : t.mid
    })
    // 尾端
    d.ell(W - 3, cy, 2, ry, t.ol)
    d.ell(W - 3.5, cy, 1, ry - 1, t.lo)
    // 入口
    d.ell(5, cy, 4, ry + 0.5, t2.ol)
    d.ell(5, cy, 3, ry - 0.5, t2.mid)
    d.ell(5.5, cy + 0.5, 2, ry - 1.6, '#1e1a26')
    d.px(3, cy - 4, 1, 3, t2.hi)
    // 挂球
    d.p(14, cy + ry, '#d8d0c0')
    d.blob(14, cy + ry + 2, 1.6, 1.6, '#f2c94a', true)
  },
  pipe(d) {
    const W = d.W, H = d.H
    const t = tones(d.c1)
    d.shadow(W / 2, H - 2, W / 2 - 1, 2)
    const cy = H - 9.5, ry = 7.5
    // 管身
    d.paint(6, cy - ry, W - 1, cy + ry + 1, (x, y) => {
      const dy = (y + 0.5 - cy) / ry
      if (Math.abs(dy) > 1) return null
      if (Math.abs(dy) > 0.87 || x === W - 2) return t.ol
      const sp = hash(x, y, 13)
      const base = dy < -0.4 ? t.hi : dy > 0.45 ? t.lo : t.mid
      return sp > 0.9 ? t.lo : sp < 0.06 ? t.hl : base
    })
    d.px(W - 6, cy - ry + 2, 1, ry * 2 - 3, t.lo) // 接缝
    // 管口
    d.ell(7, cy, 5, ry, t.ol)
    d.ell(7, cy, 4, ry - 1, t.hi)
    d.ell(7.5, cy + 0.3, 2.6, ry - 2.4, '#2a2428')
    d.ell(8, cy + 1, 1.6, ry - 4, '#1a1418')
    d.p(4, cy - 3, t.hl); d.p(4, cy - 2, t.hl)
    // 杂草
    grassBlades(d, W - 6, W - 1, H - 2, 4, '#7a9a4a', 3, 0.6)
    if (d.winter) d.snowCap(9, W - 2, () => cy - ry + 1)
  },
  catTree(d) {
    const W = d.W, H = d.H, cx = W / 2
    const bt = tones(d.c2), ct = tones(d.c1)
    d.shadow(cx, H - 3, 8, 2)
    block(d, 0, H - 9, W, 4, 4, ct.hi, d.c1) // 底座（地毯面）
    sisal(d, cx - 2, H - 50, H - 7, 5, shade(d.c1, -0.08))
    // 中层平台
    block(d, 1, H - 26, 14, 3, 3, ct.hi, d.c1)
    // 顶层小窝
    const ty = H - 52
    d.ell(cx, ty + 2, 7.5, 3.4, ct.ol)
    d.px(cx - 7, ty - 2, 14, 5, ct.ol)
    d.px(cx - 6, ty - 1, 12, 4, ct.mid)
    d.px(cx - 6, ty - 1, 3, 4, ct.hi)
    d.ell(cx, ty - 2, 7.5, 2.4, ct.ol)
    d.ell(cx, ty - 2, 6.5, 1.6, ct.hi)
    d.ell(cx, ty - 2.2, 5, 1.1, ct.dk)
    // 挂球
    d.px(14, H - 23, 1, 4, '#d8d0c0')
    d.blob(14, H - 17, 2, 2, '#e65b7a', true)
    d.px(1, H - 9, 3, 1, bt.mid)
  },
  bigCatTree(d) {
    const W = d.W, H = d.H
    const ct = tones(d.c1)
    const rope = shade(d.c1, -0.12)
    d.shadow(W / 2, H - 3, W / 2 - 1, 2.5)
    block(d, 0, H - 10, W, 5, 4, ct.hi, d.c1)
    sisal(d, 5, H - 70, H - 8, 5, rope)
    sisal(d, W - 10, H - 46, H - 8, 5, rope)
    // 小屋立方
    const bx = 14, by = H - 26
    block(d, bx, by, 16, 4, 12, ct.hi, d.c1)
    d.ell(bx + 8, by + 10, 3.5, 3.5, ct.ol); d.ell(bx + 8, by + 10.5, 2.6, 2.8, '#2e2024')
    // 吊床（两柱之间）
    const ht = tones('#e7d6a9')
    d.paint(9, H - 42, W - 10, H - 32, (x, y) => {
      const u = (x + 0.5 - (W / 2)) / ((W - 20) / 2)
      const sag = 1 - u * u
      const top = H - 41 + sag * 3, bot = H - 39 + sag * 6
      if (y < Math.round(top) || y > Math.round(bot)) return null
      if (y === Math.round(top) || y === Math.round(bot)) return ht.ol
      return y === Math.round(top) + 1 ? ht.hl : ht.mid
    })
    // 平台
    block(d, W - 15, H - 50, 15, 3, 3, ct.hi, d.c1)
    block(d, 0, H - 58, 15, 3, 3, ct.hi, d.c1)
    // 顶层大圆台
    const ty = H - 74
    d.ell(9, ty + 3, 9, 3.5, ct.ol)
    d.px(0, ty, 18, 4, ct.ol)
    d.px(1, ty + 1, 16, 3, ct.mid)
    d.px(1, ty + 1, 4, 3, ct.hi)
    d.ell(9, ty, 9, 2.8, ct.ol)
    d.ell(9, ty, 8, 2, ct.hi)
    d.ell(9, ty - 0.2, 6, 1.2, ct.lo)
    // 挂球
    d.px(W - 3, H - 47, 1, 4, '#d8d0c0')
    d.blob(W - 3, H - 41, 2, 2, '#f2c94a', true)
    d.px(2, H - 55, 1, 5, '#d8d0c0')
    d.blob(2, H - 48, 1.8, 1.8, '#e65b7a', true)
  },
  swing(d) {
    const W = d.W, H = d.H
    const wood = d.c1, wt = tones(wood)
    d.shadow(W / 2, H - 4, W / 2 - 1, 2.5)
    // A 字架
    for (const [xa, xb] of [[1, 4], [W - 2, W - 5]]) {
      d.line(xa, H - 4, xb, H - 50, wt.ol, 2)
      d.line(xa + (xa < 5 ? 5 : -5), H - 4, xb, H - 50, wt.ol, 2)
      d.line(xa + (xa < 5 ? 0 : 0), H - 5, xb, H - 49, wt.mid, 1)
    }
    // 横梁
    d.orect(0, H - 53, W, 4, shade(wood, 0.1))
    d.px(1, H - 52, W - 2, 1, wt.hl)
    // 绳 + 座板
    const sw = 0
    const st = tones(d.c2)
    const sy = H - 16
    d.line(9, H - 49, 9 + sw, sy, '#c8b898')
    d.line(W - 10, H - 49, W - 10 + sw, sy, '#c8b898')
    block(d, 6 + sw, sy, W - 12, 3, 2, st.hi, d.c2)
  },
  turntable(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 7.5, 2)
    // 底盘侧面
    d.ell(cx, H - 6, 7.5, 3, t.ol)
    d.px(cx - 7, H - 10, 15, 4, t.ol)
    d.ell(cx, H - 6.5, 6.5, 2.2, t.lo)
    d.px(cx - 6, H - 9, 13, 3, t.mid)
    // 顶面
    d.ell(cx, H - 10, 7.5, 3.4, t.ol)
    d.ell(cx, H - 10.2, 6.5, 2.6, t.hi)
    // 轨道
    d.ell(cx, H - 10, 5, 1.9, shade(d.c1, -0.25))
    d.ell(cx, H - 10, 3.5, 1, t.hi)
    // 中心
    d.ell(cx, H - 10.5, 2, 1, '#f2c94a'); d.p(cx - 1, H - 11, '#fff2b8')
    // 小球沿轨道转
    const a = (d.frame / 4) * Math.PI * 2 + 0.6
    const bx = Math.round(cx + Math.cos(a) * 4.2 - 1), by = Math.round(H - 10 + Math.sin(a) * 1.5 - 1)
    const bt = tones(d.c2)
    d.px(bx, by, 2, 2, bt.mid); d.p(bx, by, bt.hl)
    d.p(bx + 1, by + 1, bt.ol)
  },
  butterflyGarden(d) {
    const W = d.W, H = d.H, FY = d.FY
    const s = d.season
    const g = s === 'autumn' ? mix(d.c1, '#b8a050', 0.45) : s === 'spring' ? mix(d.c1, '#a8d860', 0.3) : d.c1
    const gt = tones(g)
    // 土地 + 草
    d.ell(W / 2, FY + 18, W / 2 - 1, 13, tones(SOIL).ol)
    d.ell(W / 2, FY + 18, W / 2 - 2, 12, s === 'winter' ? SNOW : gt.dk)
    if (s === 'winter') {
      d.paintEll(W / 2, FY + 18, W / 2 - 2, 12, (x, y) => (hash(x, y, 4) > 0.9 ? SNOW_LO : null))
      for (let i = 0; i < 14; i++) {
        const x = 4 + Math.floor(hash(i, 1, 61) * (W - 8)), y = FY + 10 + Math.floor(hash(i, 2, 61) * 16)
        d.px(x, y - 4, 1, 5, '#8a7a5a'); d.p(x - 1, y - 4, '#a08a60')
      }
      return
    }
    // 草丛团
    for (let i = 0; i < 9; i++) {
      const x = 5 + (i % 5) * ((W - 10) / 4) + (hash(i, 0, 60) - 0.5) * 4, y = FY + 12 + Math.floor(i / 5) * 10 + hash(i, 1, 60) * 4
      d.blob(x, y, 5, 3.5, g, gt.ol, 0.5, i)
    }
    // 花
    const cols = s === 'autumn' ? ['#e8a040', '#f2d24a', '#c8603a'] : [d.c2, '#f6e38a', '#ffffff', '#c9a6f0', d.c2]
    const nF = s === 'autumn' ? 10 : 22
    for (let i = 0; i < nF; i++) {
      const x = 3 + Math.floor(hash(i, 3, 62) * (W - 6)), y = FY + 6 + Math.floor(hash(i, 4, 62) * 22)
      d.px(x, y + 1, 1, 3, gt.lo)
      d.flower(x, y, cols[i % cols.length])
    }
    // 高花
    for (const x of [8, W - 10]) {
      d.px(x, FY - 4, 1, 12, gt.lo); d.p(x + 1, FY + 2, gt.mid)
      d.flower(x, FY - 5, cols[0], '#c8603a')
    }
    // 蝴蝶
    const bc = ['#f6e38a', '#ffffff', '#f2a6c4']
    for (let i = 0; i < 3; i++) {
      const a = d.frame * 0.9 + i * 2.3
      const bx = Math.round(W / 2 + Math.cos(a) * (W / 2 - 8) + (i - 1) * 4)
      const by = Math.round(FY - 8 + Math.sin(a * 1.7) * 5 - i * 3)
      const open = (d.frame + i) % 2 === 0
      const c = bc[i % 3], ct = tones(c)
      d.p(bx, by, '#3a2a2a'); d.p(bx, by + 1, '#3a2a2a')
      if (open) { d.px(bx - 2, by - 1, 2, 2, c); d.px(bx + 1, by - 1, 2, 2, c); d.p(bx - 2, by + 1, ct.lo); d.p(bx + 2, by + 1, ct.lo) }
      else { d.px(bx - 1, by - 2, 1, 2, c); d.px(bx + 1, by - 2, 1, 2, c) }
    }
  },
  fishPond(d) {
    const W = d.W, H = d.H, FY = d.FY
    const cx = W / 2, cy = FY + 17
    const rx = W / 2 - 2, ry = 13
    const wc = d.c1, wt = tones(wc)
    // 石岸
    d.ell(cx, cy + 1, rx + 1, ry + 1, tones(d.c2).ol)
    d.ell(cx, cy, rx, ry, shade(d.c2, -0.2))
    // 水
    d.ell(cx, cy, rx - 3, ry - 3, wt.ol)
    d.ell(cx, cy + 0.5, rx - 4, ry - 4, wt.lo)
    d.ell(cx, cy + 1.5, rx - 7, ry - 6, wt.dk)
    d.paintEll(cx, cy, rx - 4, ry - 4, (x, y) => (y < cy - ry + 6 ? wc : null))
    // 鱼
    const fishC = ['#e8783a', '#f2f0e6', '#e8a040']
    for (let i = 0; i < 3; i++) {
      const a = (d.frame / 4) * Math.PI * 2 * (i === 1 ? -1 : 1) + i * 2.1
      const fx = Math.round(cx + Math.cos(a) * (rx - 10) * (0.6 + i * 0.15))
      const fy = Math.round(cy + Math.sin(a) * (ry - 8) * 0.8 + 1)
      const dir = (i === 1 ? 1 : -1) * Math.sin(a) > 0 ? 1 : -1
      const c = fishC[i]
      d.px(fx - 2, fy, 4, 2, c)
      d.p(fx - 2 * dir + (dir > 0 ? -1 : 2), fy, shade(c, -0.2)); d.p(fx - 2 * dir + (dir > 0 ? -1 : 2), fy + 1, shade(c, -0.2))
      d.p(fx + (dir > 0 ? 1 : -2), fy, '#2a2026')
      if (i === 1) d.p(fx, fy, '#e8603a')
    }
    // 睡莲
    const lily = d.winter ? null : '#6aa84a'
    if (lily) {
      for (const [lx, ly, r] of [[cx - 10, cy - 4, 3], [cx + 9, cy + 4, 3.5], [cx + 13, cy - 5, 2.2]] as [number, number, number][]) {
        d.ell(lx, ly, r, r * 0.6, tones(lily).ol)
        d.ell(lx, ly - 0.2, r - 0.8, r * 0.6 - 0.6, lily)
        d.p(Math.round(lx + 1), Math.round(ly), wt.lo)
      }
      if (d.season === 'summer' || d.season === 'spring') { d.p(cx + 9, cy + 3, '#f6c6d4'); d.p(cx + 10, cy + 3, '#f2a6c4'); d.p(cx + 9, cy + 2, '#fff0f4') }
    }
    // 水面高光
    const f = d.frame
    d.px(cx - 12 + f, cy - 7, 3, 1, wt.hl); d.px(cx + 4 - f, cy - 6, 2, 1, wt.hi); d.px(cx - 4, cy + 6, 2, 1, wt.hi)
    if (d.winter) d.paintEll(cx, cy, rx - 4, ry - 4, (x, y) => (hash(x >> 2, y >> 1, 3) > 0.35 ? 'rgba(232,242,250,0.6)' : null))
    // 石块
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2
      const sx = cx + Math.cos(a) * (rx - 1.5), sy = cy + Math.sin(a) * (ry - 1.5)
      const sc = mix(d.c2, i % 3 === 0 ? '#c8c0b0' : i % 3 === 1 ? '#7a7a72' : d.c2, 0.4)
      d.blob(sx, sy, 3.2 + hash(i, 1, 70) * 1.2, 2.2 + hash(i, 2, 70) * 0.6, sc, true)
      if (d.winter && Math.sin(a) < 0.3) d.px(Math.round(sx - 1), Math.round(sy - 2), 3, 1, SNOW)
    }
  },
  ballPit(d) {
    const W = d.W, H = d.H, cx = W / 2
    const t = tones(d.c1)
    d.shadow(cx, H - 3, W / 2 - 1, 2.5)
    const rx = W / 2 - 2, top = H - 12
    for (let y = top; y <= H - 3; y++) {
      const hw = rx - ((y - top) / 9) * 2
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
      d.px(x0, y, x1 - x0, 1, y === H - 3 ? t.ol : t.mid)
      if (y !== H - 3) { d.p(x0, y, t.ol); d.p(x1 - 1, y, t.ol); d.px(x0 + 1, y, 3, 1, t.hi); d.px(x1 - 4, y, 3, 1, t.lo) }
    }
    d.ell(cx, top, rx, 3.6, t.ol)
    d.ell(cx, top, rx - 1, 2.8, t.dk)
    // 乒乓球
    const cols = [d.c2, d.c2, '#f2a040', d.c2, '#f2e6a0']
    let k = 0
    for (let row = 0; row < 3; row++) {
      for (let x = 4 + (row % 2) * 2; x < W - 5; x += 4) {
        const y = top - 3 + row * 2 + Math.round(hash(x, row, 5) * 1)
        const c = cols[(k++ * 7) % cols.length], bt = tones(c)
        d.px(x, y, 3, 3, bt.ol); d.p(x + 1, y + 1, bt.mid)
        d.px(x + 1, y, 1, 1, bt.mid); d.px(x, y + 1, 1, 1, bt.mid); d.p(x, y, bt.hl === bt.mid ? bt.hi : bt.ol)
        d.p(x + 1, y, bt.hl)
      }
    }
    d.ell(cx, top + 0.6, rx - 0.5, 1, t.ol)
    d.px(cx - rx + 2, top + 1, rx * 2 - 4, 1, t.hl)
    // 掉出来一个
    d.px(W - 5, H - 4, 3, 3, tones(d.c2).ol); d.p(W - 4, H - 3, d.c2); d.p(W - 4, H - 4, '#ffffff')
  },
  mobile(d) {
    const cx = d.cx, H = d.H
    const wt = tones(d.c1)
    d.shadow(cx - 4, H - 3, 4, 1.4)
    // 立杆 + 横臂
    d.orect(cx - 8, H - 5, 7, 3, d.c1)
    d.px(cx - 6, H - 40, 2, 36, wt.ol); d.px(cx - 6, H - 40, 1, 35, wt.mid)
    d.px(cx - 6, H - 41, 14, 2, wt.ol); d.px(cx - 5, H - 41, 12, 1, wt.hi)
    // 挂件
    const ft = tones(d.c2)
    const sw = [0, 1, 0, -1][d.frame]
    const hangs: [number, number][] = [[cx - 2, 12], [cx + 2, 18], [cx + 6, 10]]
    hangs.forEach(([hx, len], i) => {
      const s = i % 2 ? -sw : sw
      const ex = hx + s, ey = H - 39 + len
      d.line(hx, H - 39, ex, ey, '#c8b898')
      d.px(ex - 1, ey, 3, 5, ft.ol)
      d.px(ex, ey + 1, 1, 4, ft.mid)
      d.p(ex - 1, ey + 2, ft.hi); d.p(ex + 1, ey + 3, i === 1 ? '#e65b7a' : '#9fd0e8')
      d.p(ex, ey + 5, ft.lo)
    })
    d.p(cx + 2, H - 22, '#f2c94a') // 小铃
  },
  laser(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    // 红点
    const spots: [number, number][] = [[3, H - 4], [12, H - 3], [13, H - 8], [5, H - 9]]
    const [lx, ly] = spots[d.frame]
    const rt = tones(d.c2)
    d.px(lx - 1, ly, 3, 1, 'rgba(255,80,80,0.45)'); d.px(lx, ly - 1, 1, 3, 'rgba(255,80,80,0.45)')
    d.p(lx, ly, rt.hl)
    // 机身（小圆塔）
    d.shadow(cx, H - 6, 4, 1.4)
    d.px(cx - 4, H - 14, 8, 8, t.ol)
    d.px(cx - 3, H - 13, 6, 6, t.mid)
    d.px(cx - 3, H - 13, 2, 6, t.hi)
    d.ell(cx, H - 14, 4, 2, t.ol)
    d.ell(cx, H - 14.3, 3, 1.1, t.hi)
    // 镜头
    d.px(cx - 1, H - 11, 3, 3, '#1e1a20')
    d.p(cx, H - 10, d.c2)
    d.p(cx - 3, H - 8, d.frame % 2 ? '#7fd17a' : '#3f6a3a')
  },
  wallWalk(d) {
    const W = d.W, H = d.H
    const wt = tones(d.c1), st = tones(d.c2)
    d.shadow(W / 2, H - 3, W / 2 - 1, 2)
    // 支柱
    for (let x = 2; x < W; x += 20) {
      post(d, x, H - 26, H - 3, 3, d.c2)
      d.line(x + 3, H - 12, x + 9, H - 22, st.mid, 1)
    }
    post(d, W - 5, H - 26, H - 3, 3, d.c2)
    // 木板通道
    const py = H - 30
    d.px(0, py, W, 8, wt.ol)
    for (let x = 1; x < W - 1; x += 6) {
      d.px(x, py + 1, 5, 4, wt.mid)
      d.px(x, py + 1, 5, 1, wt.hl)
      d.p(x + 4, py + 3, wt.lo)
      if (hash(x, 0, 81) > 0.5) d.p(x + 1, py + 3, wt.lo)
    }
    d.px(1, py + 5, W - 2, 2, st.mid)
    d.px(1, py + 5, W - 2, 1, st.hi)
    if (d.winter) d.snowCap(1, W - 1, () => py + 1)
  },
  platform(d) {
    const W = d.W, H = d.H
    const wt = tones(d.c1), st = tones(d.c2)
    d.shadow(W / 2, H - 4, W / 2 - 1, 3)
    const py = H - 38
    // 后柱
    post(d, 6, py + 6, H - 24, 3, shade(d.c2, -0.2))
    post(d, W - 9, py + 6, H - 24, 3, shade(d.c2, -0.2))
    // 前柱
    post(d, 1, py + 8, H - 3, 4, d.c2)
    post(d, W - 5, py + 8, H - 3, 4, d.c2)
    // 斜撑
    d.line(5, py + 14, 10, py + 9, st.ol, 1); d.line(W - 6, py + 14, W - 11, py + 9, st.ol, 1)
    // 平台
    d.px(0, py - 4, W, 13, wt.ol)
    d.px(1, py - 3, W - 2, 8, wt.mid)
    for (let y = py - 3; y < py + 5; y += 2) d.px(1, y, W - 2, 1, (y - py) % 4 === 1 ? wt.hi : wt.mid)
    for (let i = 0; i < 6; i++) d.p(2 + Math.floor(hash(i, 1, 82) * (W - 4)), py - 2 + Math.floor(hash(i, 2, 82) * 6), wt.lo)
    d.px(1, py - 3, W - 2, 1, wt.hl)
    d.px(1, py + 5, W - 2, 3, st.mid)
    d.px(1, py + 5, W - 2, 1, st.hi)
    // 后栏杆
    for (let x = 2; x < W - 2; x += 7) d.px(x, py - 10, 2, 7, st.ol)
    d.px(1, py - 11, W - 2, 2, st.ol); d.px(2, py - 11, W - 4, 1, st.hi)
    // 梯子
    const lx = W - 18
    d.px(lx, py + 8, 1, H - 4 - py - 8, st.ol); d.px(lx + 6, py + 8, 1, H - 4 - py - 8, st.ol)
    for (let y = py + 11; y < H - 4; y += 4) d.px(lx, y, 7, 1, st.hi)
    if (d.winter) d.snowCap(1, W - 1, () => py - 2)
  },
  sandbox(d) {
    const W = d.W, H = d.H, FY = d.FY
    const ft = tones(d.c2), sd = tones(d.c1)
    d.orect(0, FY + 1, W, d.h * TILE - 2, ft.mid, ft.ol)
    d.px(1, FY + 2, W - 2, 1, ft.hi)
    d.px(2, FY + 4, W - 4, d.h * TILE - 7, ft.ol)
    d.paint(3, FY + 5, W - 3, H - 4, (x, y) => {
      const h = hash(x, y, 17)
      if (h > 0.92) return sd.lo
      if (h < 0.06) return sd.hl
      return sd.mid
    })
    // 沙堆
    d.blob(10, H - 13, 5, 3, d.c1, sd.lo, 0.3, 2)
    d.px(8, H - 15, 3, 1, sd.hl)
    // 小铲子
    d.px(W - 10, H - 18, 4, 3, '#d9603a'); d.p(W - 10, H - 18, '#f28a6a')
    d.line(W - 7, H - 16, W - 5, H - 12, '#a77b4f')
    // 爪印
    d.p(W - 12, H - 8, sd.lo); d.p(W - 14, H - 9, sd.lo); d.p(W - 13, H - 10, sd.lo)
  },

  // ---------------- 卫生 ----------------
  litter(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 2, 8, 2)
    block(d, 0, H - 13, 16, 7, 5, t.hi, d.c1)
    // 内部猫砂
    const st = tones(d.c2)
    d.px(2, H - 12, 12, 5, t.dk)
    d.paint(2, H - 11, 14, H - 7, (x, y) => (hash(x, y, 20) > 0.85 ? st.lo : hash(x, y, 21) > 0.9 ? st.hl : st.mid))
    d.clumps(3, H - 11, 10, 3)
    d.px(0, H - 13, 16, 1, t.ol)
    // 小铲子
    d.px(12, H - 5, 3, 2, '#e8e8e0'); d.p(15, H - 6, '#e8e8e0')
  },
  litterCovered(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx, H - 2, 8, 2)
    // 底盘
    block(d, 0, H - 11, 16, 4, 5, t2.hi, d.c2)
    d.paint(1, H - 10, 15, H - 7, (x, y) => (hash(x, y, 22) > 0.75 ? '#c8bea8' : '#a89e88'))
    d.clumps(2, H - 10, 12, 2)
    // 罩子
    const inside = (x: number, y: number) => {
      if (x < 1 || x > 14 || y > H - 11) return false
      if (y >= H - 20) return true
      const dx = (x + 0.5 - cx) / 7, dy = (y + 0.5 - (H - 20)) / 6
      return dx * dx + dy * dy <= 1
    }
    d.paint(1, H - 27, 15, H - 10, (x, y) => {
      if (!inside(x, y)) return null
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) return t.ol
      const l = -(x + 0.5 - cx) / 7 * 0.7 - (y < H - 20 ? (y + 0.5 - (H - 20)) / 6 : 0) * 0.6
      return l > 0.5 ? t.hl : l > 0.15 ? t.hi : l < -0.45 ? t.lo : t.mid
    })
    d.px(1, H - 12, 14, 1, t.lo)
    // 门洞（拱形）
    d.px(cx - 4, H - 19, 8, 8, t.ol)
    d.px(cx - 3, H - 20, 6, 1, t.ol)
    d.px(cx - 3, H - 19, 6, 8, '#2e2a2c')
    d.px(cx - 3, H - 19, 6, 1, '#46403e')
    d.px(cx - 4, H - 11, 8, 1, t2.mid)
    // 透气孔 + 提手
    d.px(cx - 2, H - 24, 1, 1, t.dk); d.px(cx, H - 24, 1, 1, t.dk); d.px(cx + 2, H - 24, 1, 1, t.dk)
    d.px(cx - 3, H - 28, 6, 2, t.ol); d.px(cx - 2, H - 28, 4, 1, t2.mid)
  },
  litterAuto(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 2, 8, 2)
    // 球形主体
    d.blob(cx, H - 16, 7.5, 9, d.c1, true)
    // 底座 + 抽屉
    d.px(0, H - 10, 16, 8, t.ol)
    d.px(1, H - 9, 14, 6, t.mid)
    d.px(1, H - 9, 14, 1, t.hi)
    d.px(12, H - 8, 3, 5, t.lo)
    d.px(2, H - 7, 9, 3, '#5a5660')
    d.paint(3, H - 7, 10, H - 5, (x, y) => (hash(x, y, 23) > 0.6 ? '#c8bea8' : '#a89e88'))
    d.clumps(3, H - 7, 7, 1)
    // 入口
    d.ell(cx, H - 16, 4.5, 4.5, t.ol)
    d.ell(cx, H - 15.5, 3.5, 3.8, '#2e2a30')
    d.px(cx - 3, H - 13, 6, 1, '#4a4650')
    // 灯带 + 状态灯
    const ok = d.dirt < 0.5
    d.px(cx - 4, H - 24, 8, 1, d.c2)
    d.p(cx - 3, H - 24, shade(d.c2, 0.5))
    d.p(13, H - 6, ok ? '#7fd17a' : (d.frame % 2 ? '#f2a040' : '#c86a2a'))
    d.px(cx - 6, H - 20, 1, 4, t.hl)
  },
  trashCan(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx, H - 3, 7, 2)
    const top = H - 20
    for (let y = top; y <= H - 3; y++) {
      const hw = 5.5 - ((y - top) / 17) * 1
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
      d.px(x0, y, x1 - x0, 1, y === H - 3 ? t.ol : t.mid)
      if (y !== H - 3) {
        d.p(x0, y, t.ol); d.p(x1 - 1, y, t.ol); d.p(x0 + 1, y, t.hi); d.p(x0 + 2, y, t.hi); d.px(x1 - 3, y, 2, 1, t.lo)
        if (y > top + 3) { d.p(cx - 2, y, t.lo); d.p(cx + 1, y, t.lo) }
      }
    }
    // 鱼骨标志
    d.px(cx - 3, H - 11, 6, 1, '#efeae0'); d.p(cx - 2, H - 12, '#efeae0'); d.p(cx - 2, H - 10, '#efeae0'); d.p(cx, H - 12, '#efeae0'); d.p(cx, H - 10, '#efeae0'); d.p(cx + 3, H - 12, '#efeae0'); d.p(cx + 3, H - 10, '#efeae0')
    // 盖子
    d.ell(cx, top, 7, 2.6, t2.ol)
    d.ell(cx, top - 0.5, 6, 1.8, t2.mid)
    d.px(cx - 5, top - 1, 4, 1, t2.hi)
    d.px(cx - 2, top - 4, 4, 2, t2.ol); d.px(cx - 1, top - 4, 2, 1, t2.hi)
  },
  robot(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 7.5, 2)
    d.ell(cx, H - 6, 7.5, 3.2, t.ol)
    d.px(cx - 7, H - 9, 15, 3, t.ol)
    d.ell(cx, H - 6.5, 6.5, 2.4, t.lo)
    d.px(cx - 6, H - 9, 13, 2, t.mid)
    d.ell(cx, H - 9, 7.5, 3.4, t.ol)
    d.ell(cx, H - 9.3, 6.5, 2.6, t.mid)
    d.paintEll(cx, H - 9.3, 6.5, 2.6, (x, y) => (x < cx - 1 && y < H - 10 ? t.hi : null))
    d.ell(cx, H - 9.5, 3, 1.2, t.dk)
    // 指示灯
    const lit = d.frame !== 3
    d.px(cx - 1, H - 10, 2, 1, lit ? d.c2 : shade(d.c2, -0.4))
    if (lit) d.p(cx - 1, H - 10, shade(d.c2, 0.5))
    // 前保险杠
    d.px(cx - 5, H - 6, 10, 1, shade(d.c1, 0.3))
    // 侧刷
    const br = d.frame % 2
    d.p(cx - 7, H - 5 + br, '#d8d0c0'); d.p(cx - 8, H - 4 - br, '#d8d0c0')
  },
  broom(d) {
    const cx = d.cx, H = d.H
    const wt = tones(d.c1), bt = tones(d.c2)
    d.shadow(cx, H - 3, 7, 1.8)
    // 架子
    d.orect(1, H - 6, 14, 3, d.c1)
    post(d, 2, H - 26, H - 4, 2, d.c1)
    post(d, 12, H - 26, H - 4, 2, d.c1)
    d.orect(1, H - 27, 14, 2, shade(d.c1, 0.1))
    // 扫帚（斜靠）
    d.line(4, H - 34, 8, H - 13, wt.ol, 2); d.line(4, H - 34, 8, H - 13, wt.hi)
    d.paint(4, H - 14, 13, H - 4, (x, y) => {
      const hw = 1.5 + (y - (H - 14)) * 0.35
      const c = 8.5
      if (Math.abs(x + 0.5 - c) > hw) return null
      if (Math.abs(x + 0.5 - c) > hw - 1 || y === H - 5) return bt.ol
      return (x & 1) ? bt.mid : bt.hi
    })
    d.px(6, H - 13, 5, 1, '#b5533f')
    // 簸箕
    d.px(10, H - 11, 5, 6, '#4a4650'); d.px(11, H - 10, 3, 4, '#7a9a8a'); d.p(11, H - 10, '#a0c0b0')
    d.px(12, H - 15, 1, 4, '#4a4650')
  },
  brush(d) {
    const cx = d.cx, H = d.H
    const wt = tones(d.c1), bt = tones(d.c2)
    d.shadow(cx, H - 3, 7, 1.8)
    // L 形墙角刷：底板 + 立板 + 拱形刷
    block(d, 1, H - 8, 14, 3, 3, wt.hi, d.c1)
    d.px(1, H - 22, 4, 15, wt.ol); d.px(2, H - 21, 2, 13, wt.mid); d.p(2, H - 21, wt.hi)
    d.px(11, H - 22, 4, 15, wt.ol); d.px(12, H - 21, 2, 13, wt.mid)
    // 刷毛
    for (let y = H - 20; y < H - 8; y++) { d.px(5, y, 2, 1, (y & 1) ? bt.mid : bt.hi); d.px(9, y, 2, 1, (y & 1) ? bt.lo : bt.mid) }
    // 拱刷
    d.paint(3, H - 26, 13, H - 20, (x, y) => {
      const dx = (x + 0.5 - cx) / 5, dy = (y + 0.5 - (H - 20)) / 5
      const r = dx * dx + dy * dy
      if (r > 1 || r < 0.45) return null
      if (r > 0.82) return wt.ol
      return r < 0.6 ? bt.hi : wt.mid
    })
    // 掉落的毛
    d.p(cx, H - 6, '#f2e6c0'); d.p(cx + 1, H - 6, '#d9a060')
  },

  // ---------------- 遮蔽 ----------------
  awning(d) {
    const W = d.W, H = d.H
    const t1 = tones(d.c1), t2 = tones(d.c2)
    const pc = '#5b5560'
    d.shadow(W / 2, H - 14, W / 2 - 1, 10)
    // 后柱（较细较暗）
    post(d, 4, 20, H - 28, 2, shade(pc, -0.2))
    post(d, W - 6, 20, H - 28, 2, shade(pc, -0.2))
    // 前柱
    post(d, 1, 34, H - 3, 3, pc)
    post(d, W - 4, 34, H - 3, 3, pc)
    d.px(0, H - 4, 5, 2, shade(pc, -0.3)); d.px(W - 5, H - 4, 5, 2, shade(pc, -0.3))
    // 顶棚（斜面）
    const y0 = 8, y1 = 30
    d.px(0, y0, W, y1 - y0 + 1, t1.ol)
    d.paint(1, y0 + 1, W - 1, y1, (x, y) => {
      const base = tones(Math.floor((x - 1) / 4) % 2 === 0 ? d.c1 : d.c2)
      const fr = (y - y0) / (y1 - y0)
      if (y === y0 + 1) return base.hl
      if ((x - 1) % 4 === 3) return base.lo
      return fr < 0.25 ? base.hi : fr > 0.75 ? base.lo : base.mid
    })
    // 前沿垂边（波浪）
    for (let x = 0; x < W; x++) {
      const seg = (x % 4)
      const stripe = Math.floor(x / 4) % 2 === 0
      const base = tones(stripe ? d.c1 : d.c2)
      const len = seg === 0 || seg === 3 ? 2 : 4
      d.px(x, y1 + 1, 1, len, base.mid)
      d.p(x, y1 + len + 1, base.ol)
      d.p(x, y1, t1.ol)
    }
    void t2
    if (d.winter) d.snowCap(1, W - 1, () => y0 + 2)
  },
  umbrella(d) {
    const W = d.W, H = d.H, cx = W / 2
    d.shadow(cx, H - 14, W / 2 - 1, 9)
    // 底座 + 杆
    d.blob(cx, H - 5, 5, 2.4, '#6a6470', true)
    d.px(cx - 1, 6, 2, H - 10, '#3a3236')
    d.p(cx - 1, 20, '#7a6a60')
    // 伞面
    const top = 3, base = 24
    d.paint(0, top, W, base + 4, (x, y) => {
      const fr = (y - top) / (base - top)
      if (fr < 0) return null
      const hw = fr > 1 ? W / 2 : Math.max(1.5, Math.sqrt(fr) * (W / 2))
      const dx = x + 0.5 - cx
      if (Math.abs(dx) > hw) return null
      const u = dx / (W / 2)
      const panel = Math.floor((u + 1) * 3)
      // 扇边波浪
      const pu = ((u + 1) * 3) % 1
      const scal = base + Math.round(Math.sin(pu * Math.PI) * 3)
      if (y > scal) return null
      const c = panel % 2 === 0 ? d.c1 : d.c2
      const t = tones(c)
      if (y === scal || Math.abs(dx) > hw - 1) return t.ol
      if (y === top) return t.ol
      const l = -u * 0.6 - fr * 0.5 + 0.3
      return l > 0.5 ? t.hl : l > 0.1 ? t.hi : l < -0.4 ? t.lo : t.mid
    })
    d.px(cx - 1, top - 2, 2, 3, '#3a3236')
    if (d.winter) d.snowCap(2, W - 2, (x) => {
      const dx = Math.abs(x + 0.5 - cx) / (W / 2)
      if (dx > 0.85) return NaN
      return top + 1 + Math.round(dx * dx * (base - top))
    })
  },
  pavilion(d) {
    const W = d.W, H = d.H, cx = W / 2
    const pc = d.c1
    const rt = tones(d.c2)
    d.shadow(cx, H - 20, W / 2 - 1, 14)
    // 石基角
    // 后柱
    post(d, 7, 30, H - 40, 3, shade(pc, -0.25))
    post(d, W - 10, 30, H - 40, 3, shade(pc, -0.25))
    // 前柱
    post(d, 2, 34, H - 4, 4, pc)
    post(d, W - 6, 34, H - 4, 4, pc)
    d.orect(1, H - 5, 6, 3, STONE); d.orect(W - 7, H - 5, 6, 3, STONE)
    // 横梁 + 挂落
    d.orect(1, 32, W - 2, 4, shade(pc, 0.05))
    for (let x = 6; x < W - 6; x += 3) d.p(x, 36, tones(pc).ol)
    d.px(6, 37, W - 12, 1, tones(pc).ol)
    // 屋顶：飞檐
    const ridgeY = 4, eaveY = 30
    const topAt = (x: number) => {
      const u = Math.abs(x + 0.5 - cx) / (W / 2)
      if (u > 1) return NaN
      if (u < 0.3) return ridgeY + 2
      const k = (u - 0.3) / 0.7
      return ridgeY + 2 + Math.pow(k, 0.7) * (eaveY - ridgeY - 8)
    }
    const botAt = (x: number) => {
      const u = Math.abs(x + 0.5 - cx) / (W / 2)
      return eaveY - Math.max(0, (u - 0.8) / 0.2) * 6
    }
    d.paint(0, ridgeY, W, eaveY + 2, (x, y) => {
      const tY = Math.round(topAt(x)), bY = Math.round(botAt(x))
      if (Number.isNaN(tY) || y < tY || y > bY) return null
      if (y === tY || y === bY || x === 0 || x === W - 1) return rt.ol
      if (y === bY - 1) return shade(d.c1, 0.1) // 檐口
      const tile = (x % 3 === 0)
      const fr = (y - tY) / Math.max(1, bY - tY)
      if (tile) return rt.dk
      return fr < 0.2 ? rt.hi : fr > 0.7 ? rt.lo : rt.mid
    })
    // 屋脊
    d.orect(cx - W * 0.17, ridgeY, W * 0.34, 4, rt.dk)
    d.px(cx - W * 0.17 + 1, ridgeY + 1, W * 0.34 - 2, 1, rt.hi)
    d.px(cx - W * 0.17 - 2, ridgeY - 2, 3, 3, rt.ol); d.px(cx + W * 0.17 - 1, ridgeY - 2, 3, 3, rt.ol)
    d.px(cx - 1, ridgeY - 3, 2, 3, '#d9a040')
    if (d.winter) d.snowCap(1, W - 1, (x) => topAt(x) + 1)
  },
  eaves(d) {
    const W = d.W, H = d.H
    const t = tones(d.c1)
    d.shadow(W / 2, H - 8, W / 2 - 1, 6)
    // 支柱
    post(d, 2, 26, H - 3, 3, d.c2)
    post(d, W - 5, 26, H - 3, 3, d.c2)
    // 后墙边（靠墙的一条）
    d.px(0, 2, W, 6, tones('#c9bca4').ol)
    d.px(1, 3, W - 2, 4, '#c9bca4')
    d.px(1, 3, W - 2, 1, '#ddd2bc')
    // 瓦面
    const y0 = 8, y1 = 26
    d.px(0, y0, W, y1 - y0, t.ol)
    d.paint(1, y0 + 1, W - 1, y1, (x, y) => {
      if ((y - y0) % 4 === 0) return t.lo
      const xr = (x + (Math.floor((y - y0) / 4) % 2) * 2) % 4
      return xr === 0 ? t.dk : xr === 1 ? t.hi : t.mid
    })
    // 瓦当
    for (let x = 1; x < W - 2; x += 4) {
      d.px(x, y1, 3, 3, t.ol)
      d.p(x + 1, y1 + 1, shade(d.c1, 0.25))
    }
    if (d.winter) d.snowCap(1, W - 1, () => y0 + 1)
  },
  doghouse(d) {
    const W = d.W, H = d.H, cx = W / 2
    const t = tones(d.c1)
    d.shadow(cx, H - 4, W / 2 - 1, 3)
    // 墙
    const wy = H - 30
    d.px(2, wy, W - 4, H - 4 - wy, t.ol)
    d.px(3, wy, W - 6, H - 5 - wy, t.mid)
    for (let x = 6; x < W - 3; x += 4) d.px(x, wy, 1, H - 5 - wy, t.lo)
    d.px(3, wy, 2, H - 5 - wy, t.hi)
    d.px(3, H - 6, W - 6, 1, t.lo)
    // 拱门
    const dt = tones(d.c2)
    d.px(cx - 7, H - 22, 14, 18, dt.ol)
    d.px(cx - 6, H - 23, 12, 1, dt.ol)
    d.px(cx - 6, H - 22, 12, 17, dt.mid)
    d.px(cx - 5, H - 21, 10, 16, '#2a1e22')
    d.px(cx - 5, H - 21, 10, 1, '#44302e')
    // 屋顶
    const top = gableRoof(d, cx, H - 52, 0, W, H - 32, shade(d.c1, -0.4), 4, d.c2, { c: d.c1, x0: 2, x1: W - 2, to: wy })
    // 名牌（爪印）
    d.orect(cx - 4, H - 28, 8, 5, d.c2)
    d.p(cx - 2, H - 27, '#6b4a30'); d.p(cx, H - 27, '#6b4a30'); d.p(cx + 2, H - 27, '#6b4a30'); d.px(cx - 1, H - 26, 3, 1, '#6b4a30')
    // 骨头碗
    d.px(W - 6, H - 4, 4, 2, '#d8dde3')
    if (d.winter) d.snowCap(0, W, top)
  },

  // ---------------- 植物 ----------------
  tree(d) { drawTree(d, 'tree') },
  sakura(d) { drawTree(d, 'sakura') },
  maple(d) { drawTree(d, 'maple') },
  flowerPot(d) {
    const cx = d.cx, H = d.H
    d.shadow(cx, H - 3, 5.5, 1.6)
    // 叶 + 花
    const lt = tones(LEAF)
    d.px(cx, H - 22, 1, 12, lt.lo)
    d.line(cx - 4, H - 18, cx, H - 12, lt.lo)
    d.line(cx + 4, H - 20, cx + 1, H - 13, lt.lo)
    d.blob(cx - 4, H - 13, 2.6, 1.6, LEAF, lt.ol)
    d.blob(cx + 4, H - 14, 2.6, 1.6, LEAF, lt.ol)
    const fc = d.c2
    const ft = tones(fc)
    for (const [fx, fy] of [[cx - 4, H - 19], [cx + 4, H - 21], [cx, H - 24]]) {
      d.blob(fx, fy, 2.6, 2.4, fc, ft.ol)
      d.p(fx, fy, '#c8603a'); d.p(fx - 1, fy - 1, ft.hl)
    }
    pot(d, cx, H - 3, 5, 7, d.c1)
  },
  catGrass(d) {
    const cx = d.cx, H = d.H
    d.shadow(cx, H - 3, 6, 1.6)
    grassBlades(d, 3, 13, H - 11, 11, d.c1, 4, 0.95)
    grassBlades(d, 4, 12, H - 11, 7, shade(d.c1, -0.1), 8, 0.7)
    pot(d, cx, H - 3, 6, 7, d.c2)
  },
  bush(d) {
    const cx = d.cx, H = d.H
    const s = d.season
    let c = d.c1
    if (s === 'spring') c = mix(d.c1, '#8fc860', 0.35)
    else if (s === 'autumn') c = mix(d.c1, '#b89040', 0.5)
    else if (s === 'winter') c = shade(mix(d.c1, '#4a6a5a', 0.3), -0.1)
    d.shadow(cx, H - 3, 8, 2)
    canopy(d, [[cx, H - 9, 7, 6], [cx - 4, H - 6, 4, 3.5], [cx + 4, H - 6, 4, 3.5], [cx - 1, H - 13, 4.5, 3.5]], pal(c), 12)
    if (s === 'spring') for (let i = 0; i < 6; i++) d.flower(3 + Math.floor(hash(i, 1, 90) * 10), H - 15 + Math.floor(hash(i, 2, 90) * 9), i % 2 ? '#ffffff' : '#f2a6c4')
    if (s === 'summer') for (let i = 0; i < 4; i++) { const x = 3 + Math.floor(hash(i, 1, 91) * 10), y = H - 13 + Math.floor(hash(i, 2, 91) * 7); d.p(x, y, '#7a5aa8'); d.p(x + 1, y, '#5a3a88') }
    if (s === 'autumn') for (let i = 0; i < 5; i++) d.p(3 + Math.floor(hash(i, 1, 92) * 10), H - 15 + Math.floor(hash(i, 2, 92) * 10), i % 2 ? '#d9603a' : '#e8b040')
    if (s === 'winter') d.snowTop(cx, H - 10, 7.5, 6.5, 0.5)
  },
  sunflower(d) {
    const cx = d.cx, H = d.H
    const st = tones(d.c2)
    d.shadow(cx, H - 3, 4, 1.4)
    const droop = d.season === 'autumn' || d.season === 'winter'
    // 茎
    d.px(cx, H - 34, 1, 31, st.ol); d.px(cx - 1, H - 34, 1, 31, st.mid)
    d.blob(cx - 4, H - 14, 3.5, 1.8, d.c2, st.ol)
    d.blob(cx + 4, H - 20, 3.5, 1.8, d.c2, st.ol)
    // 花盘
    const hx = droop ? cx + 2 : cx, hy = droop ? H - 33 : H - 38
    const pc = d.season === 'winter' ? '#a08050' : d.season === 'autumn' ? mix(d.c1, '#c8803a', 0.4) : d.c1
    const pt = tones(pc)
    d.paint(hx - 7, hy - 7, hx + 7, hy + 7, (x, y) => {
      const dx = x + 0.5 - hx, dy = (y + 0.5 - hy) * (droop ? 1.3 : 1)
      const r = Math.sqrt(dx * dx + dy * dy)
      const a = Math.atan2(dy, dx)
      const petal = 5 + Math.cos(a * 8) * 1.4
      if (r > petal) return null
      if (r > petal - 1) return pt.ol
      if (r < 2.8) return r < 2 ? '#6b4428' : '#4a2e1c'
      return -dx - dy > 2 ? pt.hl : -dx - dy > -1 ? pt.hi : pt.mid
    })
    d.p(hx - 1, hy - 1, '#8a5a34')
    if (d.winter) d.px(hx - 3, hy - 4, 6, 1, SNOW)
  },
  flowerBed(d) {
    const W = d.W, H = d.H
    const bt = tones(d.c1)
    const s = d.season
    d.shadow(W / 2, H - 2, W / 2 - 1, 2)
    // 土
    d.px(2, H - 12, W - 4, 6, SOIL)
    d.px(2, H - 12, W - 4, 1, shade(SOIL, -0.3))
    if (s === 'winter') {
      d.px(2, H - 13, W - 4, 4, SNOW); d.px(2, H - 9, W - 4, 1, SNOW_LO)
      for (let x = 5; x < W - 4; x += 5) { d.px(x, H - 17, 1, 4, '#8a7a5a'); d.p(x + 1, H - 18, '#a08a60') }
    } else {
      // 叶丛
      const g = s === 'autumn' ? '#7a8a40' : s === 'spring' ? '#7fbf5a' : LEAF
      for (let x = 4; x < W - 3; x += 5) d.blob(x, H - 12, 3.4, 2.6, g, true, 0.3, x)
      // 花
      const cols = s === 'autumn' ? ['#e8a040', '#f2d24a', '#c8603a'] : [d.c2, '#f6e38a', '#ffffff', d.c2, '#c9a6f0']
      let i = 0
      for (let x = 3; x < W - 3; x += 3) {
        const y = H - 16 + Math.round(hash(x, 1, 93) * 3)
        if (s === 'spring' && i % 3 === 2) { i++; continue }
        d.px(x, y + 1, 1, 3, shade(g, -0.2))
        d.flower(x, y, cols[i++ % cols.length])
      }
    }
    // 砖边
    d.px(0, H - 8, W, 6, bt.ol)
    for (let x = 1; x < W - 1; x += 5) {
      d.px(x, H - 7, 4, 2, bt.mid); d.px(x, H - 7, 4, 1, bt.hi)
      d.px(x + 2 > W - 2 ? x : x - 2 < 1 ? 1 : x - 2, H - 4, 4, 2, bt.lo)
    }
    d.px(1, H - 5, W - 2, 1, bt.ol)
    for (let x = 3; x < W - 1; x += 5) d.px(x, H - 4, 4, 2, bt.mid)
    d.px(1, H - 8, W - 2, 1, s === 'winter' ? SNOW : bt.hl)
  },
  bambooGrove(d) {
    const W = d.W, H = d.H
    const bt = tones(d.c1)
    d.shadow(W / 2, H - 4, 7.5, 2)
    const stalks: [number, number, number][] = [[3, 2, 0], [8, 0, 1], [12, 8, 2], [6, 14, 3]]
    for (const [x, top, s] of stalks) {
      const c = s === 3 ? shade(d.c1, -0.15) : d.c1
      const t = tones(c)
      d.px(x - 1, top, 4, H - 4 - top, t.ol)
      d.px(x, top, 2, H - 4 - top, t.mid)
      d.px(x, top, 1, H - 4 - top, t.hi)
      for (let y = top + 6 + s * 2; y < H - 5; y += 9) { d.px(x - 1, y, 4, 1, t.ol); d.p(x, y + 1, t.hl) }
    }
    // 竹叶
    const lc = d.season === 'autumn' ? mix(d.c2, '#a8a040', 0.4) : d.season === 'spring' ? shade(d.c2, 0.15) : d.c2
    const lt = tones(lc)
    const leafAt = (x: number, y: number, dir: number) => {
      for (let k = 0; k < 5; k++) d.p(x + k * dir, y + (k > 2 ? 1 : 0), k === 0 ? lt.ol : k < 3 ? lt.mid : lt.hi)
      d.p(x + dir, y + 1, lt.lo)
    }
    for (let i = 0; i < 14; i++) {
      const sx = stalks[i % 4][0], y = stalks[i % 4][1] + 2 + Math.floor(hash(i, 1, 94) * 34)
      const dir = i % 2 ? 1 : -1
      leafAt(sx + (dir > 0 ? 2 : -1), y, dir)
      if (d.winter && i % 2 === 0) d.px(sx + (dir > 0 ? 3 : -4), y - 1, 3, 1, SNOW)
    }
    // 竹笋
    if (d.season === 'spring') { d.px(13, H - 8, 3, 4, '#a08050'); d.p(14, H - 9, '#c8a870') }
    if (d.winter) for (const [x, top] of stalks) d.px(x - 1, top - 1, 4, 1, SNOW)
  },
  veggie(d) {
    const W = d.W, H = d.H, FY = d.FY
    const st = tones(d.c1)
    const s = d.season
    // 土地
    d.orect(0, FY + 1, W, d.h * TILE - 2, d.c1, st.ol)
    for (let r = 0; r < 4; r++) {
      const y = FY + 4 + r * 7
      d.px(2, y, W - 4, 3, st.hi)
      d.px(2, y + 3, W - 4, 1, st.dk)
      d.paint(2, y, W - 2, y + 3, (x, yy) => (hash(x, yy, 95) > 0.85 ? st.lo : null))
    }
    if (s === 'winter') {
      d.paint(1, FY + 2, W - 1, H - 2, (x, y) => ((y - FY - 4) % 7 === 3 ? (hash(x >> 2, y, 96) > 0.4 ? SNOW_LO : null) : hash(x >> 1, y, 96) > 0.08 ? (hash(x, y, 97) > 0.93 ? SNOW_LO : SNOW) : null))
      for (const [x, y] of [[8, FY + 10], [22, FY + 24]]) { d.blob(x, y, 3, 2, '#7a9a6a', true); d.px(x - 2, y - 2, 4, 1, SNOW) }
      return
    }
    const lc = d.c2, lt = tones(lc)
    for (let r = 0; r < 4; r++) {
      const y = FY + 5 + r * 7
      for (let x = 5; x < W - 3; x += 7) {
        const kind = (r + (x >> 3)) % 3
        if (s === 'spring') {
          d.p(x, y, lt.hi); d.p(x - 1, y - 1, lt.mid); d.p(x + 1, y - 1, lt.hl)
          continue
        }
        if (kind === 0) {
          // 生菜
          d.blob(x, y, 3, 2.4, s === 'autumn' ? mix(lc, '#b8a040', 0.3) : '#8fc860', true, 0.4, x + r)
          d.p(x, y - 1, '#c8e8a0')
        } else if (kind === 1) {
          // 番茄 / 南瓜
          d.px(x, y - 6, 1, 6, lt.lo); d.px(x - 2, y - 4, 2, 1, lt.mid); d.px(x + 1, y - 5, 2, 1, lt.mid)
          if (s === 'summer') { d.px(x - 2, y - 3, 2, 2, '#d9463a'); d.p(x - 2, y - 3, '#f28a6a'); d.px(x + 1, y - 2, 2, 2, '#d9463a') }
          else { d.blob(x, y, 2.6, 2, '#e3803a', true); d.p(x, y - 2, lt.mid) }
        } else {
          // 萝卜叶
          d.p(x, y - 3, lt.hi); d.p(x - 1, y - 2, lt.mid); d.p(x + 1, y - 2, lt.mid); d.p(x, y - 1, lt.lo)
          d.p(x, y, '#e8a0a0')
        }
      }
    }
  },
  pumpkin(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 7.5, 2)
    const cy = H - 8.5
    d.paint(0, cy - 7, 16, H - 2, (x, y) => {
      const dx = (x + 0.5 - cx) / 7.2, dy = (y + 0.5 - cy) / 5.6
      if (dx * dx + dy * dy > 1) return null
      const ix = (x + 0.5 - cx) / 6.2, iy = (y + 0.5 - cy) / 4.6
      if (ix * ix + iy * iy > 1) return t.ol
      const rib = Math.abs((x + 0.5 - cx) % 4.5)
      const l = -dx * 0.6 - dy * 0.7
      if (rib < 0.6 || rib > 4) return t.lo
      return l > 0.5 ? t.hl : l > 0.1 ? t.hi : l < -0.4 ? t.lo : t.mid
    })
    // 蒂 + 叶
    const st = tones(d.c2)
    d.px(cx - 1, cy - 8, 2, 3, st.ol); d.p(cx - 1, cy - 8, st.mid); d.p(cx - 1, cy - 7, st.hi)
    d.blob(cx + 3, cy - 6, 2.6, 1.5, d.c2, st.ol)
    d.p(cx - 3, cy - 7, st.mid); d.p(cx - 4, cy - 8, st.mid)
    if (d.winter) d.snowTop(cx, cy, 7.2, 5.6, 0.25)
  },
  lavender(d) {
    const cx = d.cx, H = d.H
    const lt = tones(d.c2), ft = tones(d.c1)
    d.shadow(cx, H - 3, 6.5, 1.8)
    // 基部叶丛
    d.blob(cx, H - 5, 6, 2.6, d.c2, lt.ol, 0.4, 3)
    const s = d.season
    const stems = [[3, 14], [5, 18], [7, 21], [8, 17], [10, 20], [12, 15], [13, 12]]
    for (const [x, h] of stems) {
      d.px(x, H - 5 - h + 5, 1, h - 5, lt.lo)
      if (s === 'winter') { d.p(x, H - 5 - h + 5, '#a09080'); continue }
      const fc = s === 'autumn' ? mix(d.c1, '#a09080', 0.45) : d.c1
      const fT = tones(fc)
      for (let k = 0; k < 6; k++) {
        const y = H - 5 - h + k
        d.p(x + (k % 2 ? 1 : 0) - (k % 2 ? 1 : 0), y, k % 2 ? fT.hi : fT.mid)
        if (k % 2 === 0) d.p(x + 1, y, fT.lo)
      }
      d.p(x, H - 5 - h, fT.hl)
    }
    void ft
    if (s === 'winter') d.snowTop(cx, H - 5, 6, 2.6, 0.6)
    if (s === 'summer' && d.frame % 2 === 0) { d.p(cx + 5, H - 24, '#f2d24a'); d.p(cx + 6, H - 24, '#3a2a2a') } // 小蜜蜂
  },

  // ---------------- 装饰 ----------------
  lamp(d) {
    const cx = d.cx, H = d.H
    const pt = tones(d.c1)
    d.shadow(cx, H - 3, 4, 1.4)
    d.orect(cx - 3, H - 6, 6, 4, d.c1)
    d.px(cx - 1, H - 34, 3, 29, pt.ol)
    d.px(cx, H - 34, 1, 28, pt.hi)
    // 灯头
    const ly = H - 46
    const lit = d.night
    const g = d.c2, gt = tones(g)
    const fl = lit ? [0, 1, 0, 2][d.frame] : 0
    d.px(cx - 4, ly - 2, 8, 3, pt.ol); d.px(cx - 3, ly - 3, 6, 1, pt.ol); d.px(cx - 1, ly - 5, 2, 2, pt.ol)
    d.px(cx - 3, ly - 1, 6, 1, pt.mid)
    d.px(cx - 4, ly + 1, 8, 9, pt.ol)
    if (lit) {
      d.px(cx - 3, ly + 1, 6, 8, fl === 2 ? gt.hi : gt.mid)
      d.px(cx - 2, ly + 2, 4, 5, gt.hl)
      d.px(cx - 1, ly + 3, 2, 3, fl === 1 ? '#ffffff' : '#fffbe8')
    } else {
      d.px(cx - 3, ly + 1, 6, 8, '#d8dcd8')
      d.px(cx - 3, ly + 1, 2, 7, '#eef0ec')
      d.px(cx + 1, ly + 3, 2, 6, '#b8bcb8')
      d.px(cx - 1, ly + 5, 2, 3, mix(g, '#b8b0a0', 0.6))
    }
    d.px(cx, ly + 1, 1, 8, pt.ol)
    d.px(cx - 4, ly + 9, 8, 2, pt.ol)
    d.px(cx - 2, ly + 11, 4, 1, pt.ol)
    if (d.winter) d.px(cx - 4, ly - 3, 8, 1, SNOW)
  },
  stoneLantern(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 6.5, 1.8)
    // 基座
    d.orect(cx - 6, H - 6, 12, 4, d.c1)
    d.px(cx - 5, H - 5, 10, 1, t.hi)
    // 柱
    d.px(cx - 3, H - 16, 6, 11, t.ol)
    d.px(cx - 2, H - 16, 4, 10, t.mid)
    d.px(cx - 2, H - 16, 1, 10, t.hi)
    // 中台
    d.orect(cx - 5, H - 19, 10, 3, d.c1)
    // 火袋
    d.px(cx - 4, H - 27, 8, 8, t.ol)
    d.px(cx - 3, H - 26, 6, 6, t.mid)
    const lit = d.night
    const gt = tones(d.c2)
    d.px(cx - 2, H - 25, 4, 4, lit ? ([gt.mid, gt.hi, gt.mid, gt.hl][d.frame]) : '#3a3438')
    if (lit) d.px(cx - 1, H - 24, 2, 2, '#fffbe8')
    // 笠
    d.px(cx - 7, H - 30, 14, 3, t.ol)
    d.px(cx - 6, H - 29, 12, 1, t.hi)
    d.px(cx - 5, H - 32, 10, 3, t.ol)
    d.px(cx - 4, H - 31, 8, 1, t.hl)
    d.px(cx - 8, H - 28, 2, 2, t.ol); d.px(cx + 6, H - 28, 2, 2, t.ol) // 翘角
    // 宝珠
    d.blob(cx, H - 34, 2, 2, d.c1, true)
    // 苔藓
    d.p(cx - 5, H - 4, '#7a9a5a'); d.p(cx + 4, H - 5, '#7a9a5a'); d.p(cx - 6, H - 29, '#7a9a5a')
    if (d.winter) { d.px(cx - 6, H - 31, 12, 1, SNOW); d.px(cx - 4, H - 33, 8, 1, SNOW) }
  },
  bench(d) {
    const W = d.W, H = d.H
    const wt = tones(d.c1), it = tones(d.c2)
    d.shadow(W / 2, H - 3, W / 2 - 1, 2)
    // 铁腿/扶手
    for (const x of [2, W - 5]) {
      d.px(x, H - 26, 3, 23, it.ol)
      d.px(x + 1, H - 25, 1, 21, it.mid)
      d.px(x - 1, H - 15, 5, 2, it.ol)
    }
    // 靠背
    for (const y of [H - 26, H - 21]) {
      d.px(1, y, W - 2, 4, wt.ol)
      d.px(2, y + 1, W - 4, 2, wt.mid)
      d.px(2, y + 1, W - 4, 1, wt.hi)
    }
    // 座板（顶面）
    d.px(0, H - 14, W, 6, wt.ol)
    d.px(1, H - 13, W - 2, 2, wt.hi)
    d.px(1, H - 11, W - 2, 2, wt.mid)
    d.px(1, H - 11, W - 2, 1, wt.lo)
    d.px(1, H - 13, W - 2, 1, wt.hl)
    for (let x = 7; x < W - 3; x += 9) d.p(x, H - 12, wt.lo)
    if (d.winter) d.snowCap(1, W - 1, () => H - 13)
  },
  mailbox(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 4, 1.4)
    post(d, cx - 1, H - 20, H - 3, 3, WOOD)
    // 箱体（圆顶）
    d.px(cx - 6, H - 26, 12, 8, t.ol)
    d.px(cx - 5, H - 28, 10, 2, t.ol)
    d.px(cx - 5, H - 26, 10, 7, t.mid)
    d.px(cx - 4, H - 27, 8, 1, t.hi)
    d.px(cx - 5, H - 26, 2, 7, t.hi)
    d.px(cx + 3, H - 26, 2, 7, t.lo)
    // 投信口 + 字条
    d.px(cx - 3, H - 24, 6, 1, t.ol)
    d.px(cx - 2, H - 25, 4, 1, '#f6eedc')
    d.px(cx - 3, H - 21, 6, 1, d.c2)
    // 小红旗
    d.px(cx + 6, H - 27, 1, 6, '#3a3236')
    d.px(cx + 6, H - 29, 3, 3, '#d9463a'); d.p(cx + 6, H - 29, '#f28a6a')
    if (d.winter) d.px(cx - 5, H - 29, 10, 1, SNOW)
  },
  windChime(d) {
    const cx = d.cx, H = d.H
    const wt = tones(d.c1)
    d.shadow(cx - 4, H - 3, 3, 1.2)
    // 挂架
    d.orect(cx - 7, H - 5, 5, 3, d.c1)
    d.px(cx - 6, H - 40, 2, 36, wt.ol); d.px(cx - 6, H - 40, 1, 35, wt.mid)
    d.px(cx - 6, H - 41, 11, 2, wt.ol)
    d.px(cx + 3, H - 40, 1, 3, '#6b5440')
    // 玻璃铃
    const gt = tones(d.c2)
    const bx = cx + 3, by = H - 37
    d.px(bx - 3, by, 7, 6, gt.ol)
    d.px(bx - 2, by - 1, 5, 1, gt.ol)
    d.px(bx - 2, by, 5, 5, gt.mid)
    d.px(bx - 2, by, 1, 4, gt.hl)
    d.p(bx + 1, by + 2, '#d9463a'); d.p(bx, by + 3, '#d9463a') // 金鱼花纹
    // 摆动的短册
    const sw = [0, 1, 0, -1][d.frame]
    d.line(bx, by + 5, bx + sw, by + 10, '#c8b898')
    d.px(bx - 1 + sw, by + 10, 3, 7, tones('#f2e6c0').ol)
    d.px(bx + sw, by + 11, 1, 5, '#f6eedc')
    d.p(bx + sw, by + 12, '#6f9fd8')
    // 铃舌
    d.p(bx + (d.frame === 1 ? 1 : d.frame === 3 ? -1 : 0), by + 5, '#d9a040')
  },
  fence(d) {
    const W = d.W, H = d.H
    const pt = tones(d.c1), rt = tones(d.c2)
    d.shadow(W / 2, H - 3, W / 2, 1.6)
    // 横档（后）
    for (const y of [H - 15, H - 8]) { d.px(0, y, W, 3, rt.ol); d.px(0, y + 1, W, 1, rt.mid) }
    // 尖头木条
    for (let x = 1; x < W; x += 5) {
      const top = H - 20
      d.px(x, top, 4, H - 3 - top, pt.ol)
      d.px(x + 1, top - 1, 2, 1, pt.ol)
      d.px(x + 1, top, 2, H - 4 - top, pt.mid)
      d.p(x + 1, top, pt.hl); d.px(x + 1, top + 1, 1, H - 6 - top, pt.hi)
      d.p(x + 2, H - 5, pt.lo)
      if (d.winter) { d.px(x, top - 2, 4, 2, SNOW); d.p(x + 1, top - 3, SNOW_HI) }
    }
  },
  crate(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), t2 = tones(d.c2)
    d.shadow(cx, H - 2, 8, 2)
    // 顶面
    d.px(0, H - 18, 16, 16, t2.ol)
    d.px(1, H - 17, 14, 4, t.hi)
    d.px(1, H - 15, 14, 1, t.mid)
    d.px(1, H - 17, 14, 1, t.hl)
    // 正面板
    d.px(1, H - 13, 14, 10, t.mid)
    d.px(1, H - 9, 14, 1, t.lo)
    d.px(1, H - 13, 14, 1, t.lo)
    // 框 + 斜撑
    d.px(1, H - 13, 2, 10, t2.mid); d.px(13, H - 13, 2, 10, t2.mid)
    d.px(1, H - 13, 1, 10, t2.hi)
    d.line(3, H - 4, 12, H - 12, t2.mid)
    d.line(4, H - 4, 13, H - 12, t2.ol)
    d.px(1, H - 4, 14, 1, t2.mid)
    // 钉
    d.p(2, H - 12, '#c8c8c0'); d.p(13, H - 12, '#c8c8c0'); d.p(2, H - 5, '#c8c8c0'); d.p(13, H - 5, '#c8c8c0')
    if (d.winter) d.snowCap(1, 15, () => H - 16)
  },
  bucket(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1)
    d.shadow(cx, H - 3, 7, 2)
    // 倒扣的桶：上窄下宽
    const top = H - 16
    for (let y = top; y <= H - 3; y++) {
      const hw = 4.8 + ((y - top) / 13) * 2
      const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw)
      d.px(x0, y, x1 - x0, 1, y === H - 3 ? t.ol : t.mid)
      if (y !== H - 3) { d.p(x0, y, t.ol); d.p(x1 - 1, y, t.ol); d.px(x0 + 1, y, 2, 1, t.hi); d.px(x1 - 3, y, 2, 1, t.lo) }
    }
    for (const y of [top + 4, H - 6]) d.px(cx - 6, y, 12, 1, d.c2)
    d.ell(cx, H - 4, 7, 1.4, t.ol)
    d.px(cx - 6, H - 5, 12, 1, t.lo)
    // 桶底（朝上）
    d.ell(cx, top, 5, 2, t.ol)
    d.ell(cx, top - 0.2, 4, 1.2, t.hi)
    d.p(cx - 2, top - 1, t.hl)
    // 锈斑
    d.p(cx + 3, H - 9, '#a8704a'); d.p(cx + 2, H - 8, '#8a5a3a'); d.p(cx - 3, top + 7, '#a8704a')
    // 提手
    d.line(cx + 6, top + 4, cx + 7, H - 8, t.dk)
    if (d.winter) d.ell(cx, top - 1, 4, 1.2, SNOW)
  },
  snowman(d) {
    const cx = d.cx, H = d.H
    d.shadow(cx, H - 3, 6.5, 1.8)
    d.blob(cx, H - 8, 6, 5, d.c1, '#a8b4c8')
    d.blob(cx, H - 17, 4.5, 4, d.c1, '#a8b4c8')
    // 帽子
    d.px(cx - 4, H - 22, 8, 2, '#2e2a30'); d.px(cx - 3, H - 26, 6, 4, '#2e2a30'); d.px(cx - 3, H - 23, 6, 1, '#b5533f')
    d.p(cx - 2, H - 25, '#4a4650')
    // 眼 + 胡萝卜鼻
    d.p(cx - 2, H - 18, '#2a2026'); d.p(cx + 1, H - 18, '#2a2026')
    d.px(cx, H - 16, 3, 1, '#f08a3a'); d.p(cx, H - 16, '#d9603a')
    // 围巾
    const st = tones(d.c2)
    d.px(cx - 4, H - 13, 8, 2, st.mid); d.px(cx - 4, H - 13, 8, 1, st.hi)
    d.px(cx + 2, H - 12, 2, 4, st.mid); d.p(cx + 3, H - 9, st.lo)
    // 纽扣 + 树枝手
    d.p(cx, H - 9, '#2a2026'); d.p(cx, H - 6, '#2a2026')
    d.line(cx - 5, H - 11, cx - 8, H - 15, '#6b4a30'); d.p(cx - 8, H - 16, '#6b4a30')
    d.line(cx + 5, H - 11, cx + 7, H - 14, '#6b4a30')
  },
  gnome(d) {
    const cx = d.cx, H = d.H
    const ht = tones(d.c1), bt = tones(d.c2)
    d.shadow(cx, H - 3, 5, 1.6)
    // 靴子
    d.px(cx - 4, H - 5, 3, 2, '#4a3226'); d.px(cx + 1, H - 5, 3, 2, '#4a3226')
    // 身体
    d.blob(cx, H - 9, 4.5, 4.5, d.c2, bt.ol)
    d.px(cx - 4, H - 8, 8, 1, '#6b4a30') // 腰带
    d.p(cx, H - 8, '#f2c94a')
    // 胡子
    d.paint(cx - 4, H - 16, cx + 4, H - 8, (x, y) => {
      const dx = Math.abs(x + 0.5 - cx), dy = y - (H - 16)
      if (dx > 4 - dy * 0.35) return null
      return dx > 3 - dy * 0.35 ? '#c8c0b4' : (x + y) % 3 === 0 ? '#e8e2d8' : '#f6f2ea'
    })
    // 脸
    d.px(cx - 3, H - 17, 6, 2, '#f0c0a0')
    d.px(cx - 1, H - 16, 2, 2, '#e8907a') // 鼻子
    d.p(cx - 2, H - 17, '#2a2026'); d.p(cx + 1, H - 17, '#2a2026')
    // 尖帽
    d.paint(cx - 5, H - 32, cx + 5, H - 17, (x, y) => {
      const fr = (y - (H - 31)) / 13
      const hw = 0.5 + fr * 4.5
      const dx = x + 0.5 - cx - (1 - fr) * 2
      if (Math.abs(dx) > hw || fr < 0) return null
      if (Math.abs(dx) > hw - 1 || y === H - 18) return ht.ol
      return dx < -hw * 0.3 ? ht.hi : dx > hw * 0.4 ? ht.lo : ht.mid
    })
    if (d.winter) d.px(cx - 4, H - 19, 8, 1, SNOW)
  },
  luckyCat(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), rt = tones(d.c2)
    d.shadow(cx, H - 3, 6, 1.8)
    // 底座
    d.orect(cx - 6, H - 6, 12, 4, d.c2)
    d.px(cx - 5, H - 5, 10, 1, rt.hi)
    // 身体
    d.blob(cx, H - 10, 5, 4.6, d.c1, t.ol)
    // 头
    d.blob(cx, H - 18, 5, 4, d.c1, t.ol)
    // 耳朵
    d.px(cx - 5, H - 24, 3, 3, t.ol); d.p(cx - 4, H - 23, rt.hi); d.p(cx - 4, H - 22, d.c1)
    d.px(cx + 2, H - 24, 3, 3, t.ol); d.p(cx + 3, H - 23, rt.hi); d.p(cx + 3, H - 22, d.c1)
    // 脸
    d.p(cx - 2, H - 18, '#2a2026'); d.p(cx + 2, H - 18, '#2a2026')
    d.p(cx - 3, H - 19, '#2a2026'); d.p(cx + 3, H - 19, '#2a2026')
    d.p(cx, H - 17, '#e8907a')
    d.p(cx - 4, H - 17, '#f2b0b0'); d.p(cx + 4, H - 17, '#f2b0b0')
    // 项圈 + 金铃
    d.px(cx - 4, H - 14, 8, 1, d.c2)
    d.px(cx - 1, H - 13, 2, 2, '#f2c94a'); d.p(cx - 1, H - 13, '#fff2a8')
    // 金币
    d.blob(cx + 2, H - 9, 2.2, 2.6, '#f2c94a', '#a07820')
    // 招手（动画）
    const up = d.frame % 2 === 0
    const px0 = cx - 7
    if (up) { d.px(px0, H - 24, 3, 7, t.ol); d.px(px0 + 1, H - 23, 1, 5, d.c1); d.p(px0 + 1, H - 23, t.hl) }
    else { d.px(px0, H - 21, 3, 5, t.ol); d.px(px0 + 1, H - 20, 1, 3, d.c1) }
    d.p(cx - 5, H - 11, t.lo)
  },
  sign(d) {
    const cx = d.cx, H = d.H
    const bt = tones(d.c2)
    d.shadow(cx, H - 3, 3, 1.2)
    post(d, cx - 1, H - 20, H - 3, 3, d.c1)
    d.px(cx - 7, H - 28, 14, 10, tones(d.c1).ol)
    d.px(cx - 6, H - 27, 12, 8, d.c2)
    d.px(cx - 6, H - 27, 12, 1, bt.hl)
    d.px(cx - 6, H - 20, 12, 1, bt.lo)
    // 爪印
    const pc = '#8a5a3a'
    d.px(cx - 1, H - 23, 3, 2, pc)
    d.p(cx - 2, H - 25, pc); d.p(cx, H - 26, pc); d.p(cx + 2, H - 25, pc)
    d.p(cx - 4, H - 22, pc); d.p(cx + 4, H - 22, pc) // 箭头样的点缀
    d.p(cx - 5, H - 25, '#c8503a')
    if (d.winter) d.px(cx - 7, H - 29, 14, 1, SNOW)
  },
  steppingStone(d) {
    const FY = d.FY
    const t = tones(d.c1)
    const stone = (x: number, y: number, rx: number, ry: number, s: number) => {
      d.ell(x, y + 1, rx, ry, tones(d.c2).ol)
      d.paintEll(x, y, rx, ry, (px, py) => {
        const h = hash(px, py, s)
        const dx = px + 0.5 - x, dy = py + 0.5 - y
        if (dx * dx / (rx * rx) + dy * dy / (ry * ry) > 0.65 && dy > 0) return d.c2
        return h > 0.9 ? t.lo : h < 0.08 ? t.hl : dy < -ry * 0.3 ? t.hi : t.mid
      })
    }
    stone(5, FY + 5, 4.5, 3, 1)
    stone(11, FY + 11, 4.5, 3, 2)
    if (d.winter) { d.px(3, FY + 3, 3, 1, SNOW); d.px(10, FY + 9, 3, 1, SNOW) }
  },
  stringLights(d) {
    const W = d.W, H = d.H
    const wt = tones(d.c1)
    // 两端木柱
    post(d, 0, 10, H - 3, 3, WOOD)
    post(d, W - 3, 10, H - 3, 3, WOOD)
    d.shadow(1.5, H - 3, 2.5, 1); d.shadow(W - 1.5, H - 3, 2.5, 1)
    // 下垂电线
    const yAt = (x: number) => 12 + Math.sin((x / (W - 1)) * Math.PI) * 9
    for (let x = 2; x < W - 2; x++) d.p(x, Math.round(yAt(x)), wt.mid)
    // 灯泡
    const cols = [d.c2, '#f2a6c4', '#9fd0e8', '#b8e08a', d.c2]
    let i = 0
    for (let x = 5; x < W - 4; x += 5, i++) {
      const y = Math.round(yAt(x)) + 1
      const c = cols[i % cols.length]
      const ct = tones(c)
      d.p(x, y, wt.ol)
      if (d.night) {
        const on = (i + d.frame) % 3 !== 0
        d.px(x - 1, y + 1, 3, 3, on ? ct.hi : ct.mid)
        d.p(x, y + 2, on ? '#ffffff' : ct.hl)
      } else {
        d.px(x - 1, y + 1, 3, 3, ct.ol)
        d.p(x, y + 2, mix(c, '#c8c0b0', 0.4))
        d.p(x - 0, y + 1, mix(c, '#e8e0d0', 0.3))
      }
    }
    if (d.winter) { d.px(0, 9, 3, 1, SNOW); d.px(W - 3, 9, 3, 1, SNOW) }
  },
  telescope(d) {
    const cx = d.cx, H = d.H
    const lt = tones(d.c2)
    d.shadow(cx, H - 3, 6, 1.6)
    // 三脚架
    d.line(cx, H - 16, cx - 6, H - 3, lt.ol)
    d.line(cx, H - 16, cx + 6, H - 3, lt.ol)
    d.line(cx, H - 16, cx + 1, H - 4, lt.mid)
    // 镜筒（斜向右上）
    const tt = tones(d.c1)
    const pts = d.linePts(cx - 6, H - 13, cx + 6, H - 25)
    pts.forEach(([x, y], k) => {
      const r = k < 3 ? 1 : 2
      d.px(x - r, y - r, r * 2 + 1, r * 2 + 1, tt.ol)
    })
    pts.forEach(([x, y], k) => {
      const r = k < 3 ? 0 : 1
      d.px(x - r, y - r, r * 2 + 1, r + 1, tt.hi)
      d.px(x - r, y + 1, r * 2 + 1, r, tt.mid)
    })
    d.px(cx + 5, H - 28, 4, 4, tt.ol); d.px(cx + 6, H - 27, 2, 2, '#9fd0e8')
    d.p(cx + 6, H - 27, '#ffffff')
    d.px(cx - 1, H - 20, 3, 2, lt.mid)
    if (d.night) d.p(cx + 9, H - 34, '#fff2a8')
  },
  musicBox(d) {
    const cx = d.cx, H = d.H
    const t = tones(d.c1), g = tones(d.c2)
    d.shadow(cx, H - 3, 7, 1.8)
    // 盒身
    block(d, 1, H - 12, 14, 4, 6, t.hi, d.c1)
    d.px(1, H - 9, 14, 1, g.mid)
    d.px(2, H - 7, 12, 1, g.lo)
    d.p(cx, H - 6, g.hl)
    // 打开的盖子
    d.px(1, H - 20, 14, 8, t.ol)
    d.px(2, H - 19, 12, 6, t.lo)
    d.px(3, H - 18, 10, 4, '#d96a7a')
    d.px(3, H - 18, 10, 1, '#f2a0a8')
    // 旋转的小人
    const f = d.frame
    const dx = [0, 1, 0, -1][f]
    d.px(cx - 1, H - 15, 2, 4, '#f6eedc')
    d.px(cx - 2 + (f % 2), H - 13, 4 - (f % 2) * 2, 1, '#f2a6c4')
    d.p(cx - 1 + (dx > 0 ? 1 : 0), H - 16, '#f0c0a0')
    d.px(cx - 2, H - 12, 4, 1, g.mid)
    // 音符
    const ny = H - 26 - f
    const nx = cx + 3 + (f % 2)
    d.px(nx, ny, 1, 4, '#5a4a68'); d.px(nx - 2, ny + 3, 2, 2, '#5a4a68'); d.p(nx + 1, ny, '#5a4a68')
    if (f >= 2) { d.px(cx - 5, ny + 3, 1, 3, '#5a4a68'); d.px(cx - 6, ny + 5, 2, 1, '#5a4a68') }
  },
  photoWall(d) {
    const W = d.W, H = d.H
    const ft = tones(d.c1)
    d.shadow(W / 2, H - 3, W / 2 - 3, 1.8)
    // 支脚
    post(d, 4, H - 20, H - 2, 2, d.c1)
    post(d, W - 6, H - 20, H - 2, 2, d.c1)
    // 板
    d.px(1, H - 38, W - 2, 22, ft.ol)
    d.px(2, H - 37, W - 4, 20, ft.mid)
    d.px(3, H - 36, W - 6, 18, '#c8a878') // 软木
    d.paint(3, H - 36, W - 3, H - 18, (x, y) => (hash(x, y, 99) > 0.85 ? '#b08a5a' : null))
    // 照片
    const cats = ['#e3a35a', '#3a3438', '#f4f0e6', '#9a9a9a', '#c8803a']
    const spots: [number, number][] = [[5, H - 35], [13, H - 33], [21, H - 35], [8, H - 26], [18, H - 26]]
    spots.forEach(([x, y], i) => {
      d.px(x, y, 7, 7, '#7a6a5a')
      d.px(x, y, 6, 6, d.c2)
      d.px(x + 1, y + 1, 4, 3, '#9fc8d8')
      // 小猫剪影
      const c = cats[i % cats.length]
      d.px(x + 2, y + 2, 3, 2, c); d.p(x + 2, y + 1, c); d.p(x + 4, y + 1, c)
      d.p(x + 3, y + 5, i % 2 ? '#d96a5a' : '#6f9fd8')
      d.p(x + 2, y - 1 + 1, '#d9463a') // 图钉
    })
  },
  starLamp(d) {
    const cx = d.cx, H = d.H
    const pt = tones(d.c1)
    d.shadow(cx, H - 3, 4, 1.4)
    d.orect(cx - 3, H - 6, 6, 4, d.c1)
    d.px(cx - 1, H - 31, 2, 26, pt.ol)
    d.p(cx - 1, H - 22, pt.hi)
    d.px(cx - 2, H - 31, 4, 2, pt.ol)
    // 星星（极坐标五角星）
    const sx = cx, sy = H - 37.5
    const lit = d.night
    const gt = tones(d.c2)
    const R = 6.8, r = 3
    const inside = (x: number, y: number) => {
      const dx = x + 0.5 - sx, dy = y + 0.5 - sy
      const a = Math.atan2(dy, dx) + Math.PI / 2
      const seg = (2 * Math.PI) / 5
      const u = (((a % seg) + seg) % seg) / seg
      const m = Math.abs(u - 0.5) * 2
      const rb = r + (R - r) * Math.pow(m, 1.6)
      return Math.sqrt(dx * dx + dy * dy) <= rb
    }
    const ol = lit ? gt.lo : shade(d.c2, -0.5)
    d.paint(sx - 8, sy - 8, sx + 8, sy + 8, (x, y) => {
      if (!inside(x, y)) return null
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) return ol
      const l = -(x + 0.5 - sx) * 0.5 - (y + 0.5 - sy) * 0.7
      if (lit) return l > 1.2 ? '#ffffff' : l > -1 ? gt.hl : gt.hi
      return l > 1.2 ? gt.mid : l > -1 ? shade(d.c2, -0.12) : shade(d.c2, -0.28)
    })
    if (lit) {
      d.px(sx - 1, sy - 1, 2, 2, '#ffffff')
      const sp: [number, number][] = [[-7, -6], [6, -7], [-7, 4], [7, 3]]
      const [ax, ay] = sp[d.frame]
      d.p(sx + ax, sy + ay, '#fffbe0')
      d.p(sx + ax - 1, sy + ay, gt.hi); d.p(sx + ax + 1, sy + ay, gt.hi)
      d.p(sx + sp[(d.frame + 2) % 4][0], sy + sp[(d.frame + 2) % 4][1], gt.hi)
    }
  },

  // ---------------- 地面 ----------------
  floorWood(d) {
    const W = d.W, FY = d.FY, Ht = d.h * TILE
    const t = tones(d.c1), t2 = tones(d.c2)
    for (let r = 0; r < Ht / 4; r++) {
      const y = FY + r * 4
      d.px(0, y, W, 4, t.mid)
      d.px(0, y, W, 1, t.hi)
      d.px(0, y + 3, W, 1, t2.dk)
      // 接缝错位
      const off = (r % 2) * 8 + 4
      for (let x = off; x < W; x += 16) { d.px(x, y, 1, 3, t2.dk); d.p(x + 1, y, t.hl) }
      // 木纹
      for (let x = 0; x < W; x++) if (hash(x, r, 100) > 0.86) d.px(x, y + 1 + (x % 2), 2, 1, t.lo)
      d.p((off + 2) % W, y + 1, t2.mid)
    }
  },
  floorStone(d) {
    const W = d.W, FY = d.FY, Ht = d.h * TILE
    const t = tones(d.c1)
    const g = shade(d.c2, -0.15)
    d.px(0, FY, W, Ht, g)
    // 每格 2x2 不规则石板
    for (let ty = 0; ty < d.h; ty++) for (let tx = 0; tx < d.w; tx++) {
      const ox = tx * 16, oy = FY + ty * 16
      const slabs = [[0, 0, 9, 7], [9, 0, 7, 9], [0, 7, 7, 9], [7, 9, 9, 7], [7, 7, 2, 2]]
      slabs.forEach(([x, y, w, h], i) => {
        if (w < 3) { d.px(ox + x, oy + y, w, h, t.lo); return }
        const c = i % 2 ? t.mid : shade(d.c1, 0.06)
        d.px(ox + x + 1, oy + y + 1, w - 1, h - 1, c)
        d.px(ox + x + 1, oy + y + 1, w - 1, 1, t.hi)
        d.px(ox + x + 1, oy + y + 1, 1, h - 1, t.hi)
        d.px(ox + x + 2, oy + y + h - 1, w - 2, 1, t.lo)
        if (hash(tx, ty, i) > 0.5) d.p(ox + x + 3, oy + y + 3, t.lo)
      })
    }
  },
  floorTile(d) {
    const W = d.W, FY = d.FY, Ht = d.h * TILE
    const t = tones(d.c1), p = tones(d.c2)
    for (let ty = 0; ty < d.h * 2; ty++) for (let tx = 0; tx < d.w * 2; tx++) {
      const ox = tx * 8, oy = FY + ty * 8
      d.px(ox, oy, 8, 8, t.mid)
      d.px(ox, oy, 8, 1, t.hi)
      d.px(ox, oy, 1, 8, t.hi)
      d.px(ox + 7, oy, 1, 8, t.lo)
      d.px(ox, oy + 7, 8, 1, t.lo)
      // 四瓣花纹
      d.p(ox + 3, oy + 2, p.mid); d.p(ox + 4, oy + 2, p.mid)
      d.p(ox + 2, oy + 3, p.mid); d.p(ox + 5, oy + 3, p.mid)
      d.p(ox + 2, oy + 4, p.mid); d.p(ox + 5, oy + 4, p.mid)
      d.p(ox + 3, oy + 5, p.mid); d.p(ox + 4, oy + 5, p.mid)
      d.px(ox + 3, oy + 3, 2, 2, (tx + ty) % 2 ? '#e8b05a' : p.hi)
      d.p(ox, oy, p.lo)
    }
    void W; void Ht
  },
  rug(d) {
    const W = d.W, FY = d.FY, Ht = d.h * TILE
    const cx = W / 2, cy = FY + Ht / 2
    const rx = W / 2 - 1.5, ry = Ht / 2 - 2
    const t = tones(d.c1), t2 = tones(d.c2)
    // 流苏
    d.paintEll(cx, cy, rx + 1, ry + 1, (x, y) => ((x + y) % 2 ? t2.lo : null))
    d.ell(cx, cy, rx, ry, t.ol)
    d.ell(cx, cy, rx - 1, ry - 1, t.mid)
    d.ell(cx, cy, rx - 3, ry - 3, t2.mid)
    d.ell(cx, cy, rx - 4, ry - 4, t.mid)
    d.paintEll(cx, cy, rx - 4, ry - 4, (x, y) => (((x + y) % 4 === 0) ? t.lo : null))
    d.ell(cx, cy, rx - 8, ry - 8, t2.hi)
    d.ell(cx, cy, rx - 9, ry - 9, t.hi)
    d.ell(cx, cy, 2, 2, t2.mid)
    // 绒毛高光
    d.px(cx - rx + 4, cy - 4, 2, 1, t.hi); d.px(cx - 4, cy - ry + 2, 3, 1, t.hi)
  },
  gravel(d) {
    const W = d.W, FY = d.FY, Ht = d.h * TILE
    const t = tones(d.c1), t2 = tones(d.c2)
    d.px(0, FY, W, Ht, t.mid)
    d.paint(0, FY, W, FY + Ht, (x, y) => {
      const h = hash(x, y, 101)
      const c = hash(x >> 1, y >> 1, 102)
      if (c > 0.78) return h > 0.5 ? t.hl : t.hi
      if (c < 0.2) return h > 0.5 ? t2.mid : t2.lo
      if (h > 0.93) return '#d8c8b0'
      return null
    })
  },
  lawn(d) {
    const W = d.W, FY = d.FY, Ht = d.h * TILE
    const s = d.season
    const base = s === 'spring' ? mix(d.c1, '#9fd06a', 0.3) : s === 'autumn' ? mix(d.c1, '#c9b45a', 0.45) : s === 'winter' ? SNOW : d.c1
    const t = tones(base)
    const blade = s === 'winter' ? '#8a9a7a' : s === 'autumn' ? mix(d.c2, '#b8a04a', 0.45) : d.c2
    const bt = tones(blade)
    d.px(0, FY, W, Ht, t.mid)
    d.paint(0, FY, W, FY + Ht, (x, y) => {
      const h = hash(x, y, 103)
      if (s === 'winter') return h > 0.9 ? SNOW_LO : h < 0.04 ? bt.mid : null
      if (h > 0.82) return bt.mid
      if (h > 0.76) return t.hi
      if (h < 0.06) return bt.dk
      return null
    })
    // 草丛小簇
    if (s !== 'winter') {
      for (let i = 0; i < d.w * d.h * 3; i++) {
        const x = Math.floor(hash(i, 1, 104) * (W - 2)) + 1, y = FY + 2 + Math.floor(hash(i, 2, 104) * (Ht - 3))
        d.p(x, y, bt.hi); d.p(x - 1, y + 1, bt.mid); d.p(x + 1, y + 1, bt.mid)
      }
    }
    if (s === 'spring') for (let i = 0; i < d.w * d.h; i++) d.flower(3 + Math.floor(hash(i, 3, 105) * (W - 6)), FY + 3 + Math.floor(hash(i, 4, 105) * (Ht - 6)), i % 2 ? '#ffffff' : '#f6e38a')
    if (s === 'autumn') for (let i = 0; i < d.w * d.h * 2; i++) d.px(Math.floor(hash(i, 3, 106) * (W - 2)), FY + Math.floor(hash(i, 4, 106) * (Ht - 1)), 2, 1, i % 2 ? '#d9803a' : '#c8503a')
  },
}

// ====================================================================
// 导出
// ====================================================================

function fallback(d: Draw) { ARTS.crate(d) }

export function drawBuilding(ctx: CanvasRenderingContext2D, art: string, w: number, h: number, c1: string, c2: string, opts: ArtOpts): void {
  const d = new Draw(ctx, w, h, c1, c2, opts)
  const fn = ARTS[art] ?? fallback
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, d.W, d.H)
  ctx.clip()
  fn(d)
  ctx.restore()
}

const ANIM: Record<string, number> = {
  fountain: 4, dispenser: 4, lamp: 4, stoneLantern: 4, starLamp: 4, fishPond: 4, mobile: 4, stringLights: 4,
  laser: 4, turntable: 4, heater: 4, butterflyGarden: 4, windChime: 4, bambooSpout: 4, teaser: 4, musicBox: 4,
  luckyCat: 4, robot: 4, birdbath: 4, litterAuto: 2, lavender: 2,
}
export function artFrames(art: string): number {
  return ANIM[art] ?? 1
}

/** 地面/扁平类 */
const FLAT = new Set(['floorWood', 'floorStone', 'floorTile', 'gravel', 'lawn', 'rug', 'mat', 'steppingStone', 'sandbox', 'veggie', 'blanket', 'butterflyGarden', 'fishPond'])

export function usePoint(art: string, w: number, h: number, slot: number): { x: number; y: number } {
  const W = w * TILE, H = h * TILE + HEADROOM, FY = HEADROOM
  const cx = W / 2
  const s = Math.max(0, slot | 0)
  // 横向分散：0, -1, +1, -2, +2 ...
  const k = s === 0 ? 0 : (s % 2 ? -1 : 1) * Math.ceil(s / 2)
  const spread = (step: number, minX = 3, maxX = W - 3) => Math.max(minX, Math.min(maxX, Math.round(cx + k * step)))
  const at = (x: number, y: number) => ({ x: Math.round(x), y: Math.round(y) })
  switch (art) {
    // 吃喝：站在容器前方
    case 'bowl': case 'waterBowl': case 'jar': case 'barrel': case 'dispenser': case 'feeder':
      return at(spread(8), H - 1)
    case 'doubleBowl':
      return at(s % 2 === 0 ? 9 : W - 9, H - 1)
    case 'basin': case 'trough': case 'cannedTable': case 'ballPit':
      return at(spread(9), H - 1)
    case 'fishRack':
      return at(spread(6), H - 1)
    case 'fountain':
      return at(spread(9), H - 2)
    case 'bambooSpout':
      return at(W - 10 + k * 5, H - 1)
    case 'birdbath':
      return at(spread(7), H - 1)
    // 窝/箱子：里面
    case 'box': return at(cx, H - 12)
    case 'basket': return at(cx, H - 12)
    case 'plushBed': return at(spread(3), H - 8)
    case 'tire': return at(cx, H - 10)
    case 'cushion': return at(cx, H - 7)
    case 'woodHouse': return at(cx, H - 3)
    case 'treeHole': return at(cx, H - 9)
    case 'doghouse': return at(spread(5), H - 5)
    case 'kotatsu': return at(spread(7), H - 6)
    case 'sofa': return at(spread(12), H - 13)
    case 'hammock': return at(spread(7), H - 15)
    case 'roofNest': return at(cx, H - 43)
    case 'treeHouse': return at(s % 2 === 0 ? 7 + (s >> 1) * 2 : W - 7 - (s >> 1) * 2, H - 37)
    case 'tunnel': return at(Math.min(W - 4, 5 + s * 7), H - 6)
    case 'pipe': return at(Math.min(W - 4, 8 + s * 7), H - 5)
    case 'boxMaze': return at([8, 25, 39, 16][s % 4], H - 4)
    // 高处
    case 'catTree': return at(cx, s % 2 === 0 ? H - 53 : H - 25)
    case 'bigCatTree': return at([9, W - 7, 7, W / 2 + 6][s % 4], [H - 74, H - 49, H - 57, H - 25][s % 4])
    case 'scratchPost': return at(cx, s === 0 ? H - 35 : H - 3)
    case 'crate': return at(cx, H - 16)
    case 'bucket': return at(cx, H - 17)
    case 'bench': return at(spread(10), H - 12)
    case 'wallWalk': return at(spread(12), H - 29)
    case 'platform': return at(spread(12), H - 36)
    case 'swing': return at(cx, H - 16)
    case 'litterCovered': return at(cx, H - 10)
    case 'litterAuto': return at(cx, H - 10)
    case 'litter': return at(cx, H - 8)
    case 'robot': return at(cx, H - 10)
    case 'turntable': return at(cx + 6 * (s % 2 ? -1 : 1), H - 2)
    case 'scratchBoard': return at(cx, H - 6)
    // 遮蔽：棚下地面
    case 'awning': case 'umbrella': case 'pavilion': case 'eaves':
      return at(spread(Math.max(6, (W - 12) / 4), 6, W - 6), H - 5 - (s % 2) * 6)
    case 'fishPond': return at(spread(10), H - 3)
    case 'butterflyGarden': return at(spread(10), H - 4)
    case 'tree': case 'sakura': case 'maple':
      return at(spread(8), H - 3)
    case 'bambooGrove': return at(cx, H - 2)
  }
  if (FLAT.has(art)) {
    const n = Math.max(1, w * h)
    const i = s % n
    return at((i % w) * TILE + TILE / 2, FY + Math.floor(i / w) * TILE + TILE / 2 + 2)
  }
  return at(spread(8), H - 1)
}
