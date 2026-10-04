import type { Season, WeatherType } from '../types'
import { GRID_H, GRID_W, OX, OY, TILE, VIEW_H, VIEW_W } from '../constants'
import { hash } from '../core/rng'
import type { Rect } from '../world/yard'

/** 场景绘制：天空、远景屋顶、围墙、草地、锁定区域 */

export function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
export function rgbToHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
}
export function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a)
  const B = hexToRgb(b)
  return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
}

// ================= 天空 =================

interface SkyKey {
  top: string
  bottom: string
}
const SKY: [number, SkyKey][] = [
  [0, { top: '#0d1230', bottom: '#1f2a52' }],
  [4.5, { top: '#141a3f', bottom: '#2b3466' }],
  [5.5, { top: '#3b3f78', bottom: '#e39a8a' }],
  [7, { top: '#6fa7d9', bottom: '#f3d6b0' }],
  [10, { top: '#5d9ee0', bottom: '#bfe1f2' }],
  [15, { top: '#5d9ee0', bottom: '#c9e6f0' }],
  [17.2, { top: '#7a8fd0', bottom: '#f5c48a' }],
  [18.5, { top: '#5a4f8f', bottom: '#f08a5d' }],
  [19.6, { top: '#232a5a', bottom: '#5b4a7a' }],
  [21, { top: '#0f1535', bottom: '#222c58' }],
  [24, { top: '#0d1230', bottom: '#1f2a52' }],
]

export function skyColors(h: number, w: WeatherType): SkyKey {
  let i = 0
  while (i < SKY.length - 1 && SKY[i + 1][0] <= h) i++
  const [h0, k0] = SKY[i]
  const [h1, k1] = SKY[Math.min(i + 1, SKY.length - 1)]
  const t = h1 === h0 ? 0 : (h - h0) / (h1 - h0)
  let top = mix(k0.top, k1.top, t)
  let bottom = mix(k0.bottom, k1.bottom, t)
  const grey = w === 'overcast' || w === 'heavyRain' || w === 'storm' ? 0.6 : w === 'lightRain' || w === 'fog' || w === 'snow' ? 0.45 : w === 'cloudy' ? 0.15 : 0
  if (grey) {
    top = mix(top, '#7c8590', grey * (h > 6 && h < 19 ? 1 : 0.4))
    bottom = mix(bottom, '#a7aeb5', grey * (h > 6 && h < 19 ? 1 : 0.4))
  }
  return { top, bottom }
}

/** 绘制天空（像素条带渐变）到 480x60 画布 */
export function drawSky(ctx: CanvasRenderingContext2D, h: number, w: WeatherType, t: number, opts: { fullMoon: boolean; day: number }) {
  const H = 60
  const { top, bottom } = skyColors(h, w)
  const bands = 12
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = mix(top, bottom, i / (bands - 1))
    ctx.fillRect(0, Math.floor((i * H) / bands), VIEW_W, Math.ceil(H / bands) + 1)
  }
  const night = h >= 19.5 || h < 5.2
  // 星星
  if (night && !(w === 'overcast' || w === 'heavyRain' || w === 'storm' || w === 'lightRain' || w === 'fog' || w === 'snow')) {
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash(i * 3 + 1) * VIEW_W)
      const y = Math.floor(hash(i * 7 + 2) * (H - 14))
      const tw = Math.sin(t * (1 + hash(i) * 3) + i) > 0.2
      ctx.fillStyle = tw ? '#fff8d8' : '#9aa3c8'
      ctx.fillRect(x, y, 1, 1)
    }
  }
  // 太阳 / 月亮：沿弧线移动
  const clear = !(w === 'overcast' || w === 'heavyRain' || w === 'storm')
  if (h >= 5.5 && h <= 19.2) {
    const p = (h - 5.5) / 13.7
    const x = Math.floor(30 + p * 420)
    const y = Math.floor(48 - Math.sin(p * Math.PI) * 38)
    ctx.globalAlpha = clear ? 1 : 0.35
    ctx.fillStyle = h > 17 || h < 7 ? '#ffb46a' : '#fff1b8'
    disc(ctx, x, y, 6)
    ctx.fillStyle = h > 17 || h < 7 ? '#ffd29a' : '#fffbe6'
    disc(ctx, x - 1, y - 1, 3)
    ctx.globalAlpha = 1
  } else {
    const hh = h < 12 ? h + 24 : h
    const p = (hh - 19.2) / 10.3
    const x = Math.floor(30 + p * 420)
    const y = Math.floor(48 - Math.sin(p * Math.PI) * 36)
    ctx.globalAlpha = clear ? 1 : 0.3
    ctx.fillStyle = '#f4efd6'
    disc(ctx, x, y, opts.fullMoon ? 6 : 5)
    if (!opts.fullMoon) {
      // 月牙：用天空色遮挡
      ctx.fillStyle = mix(top, bottom, y / H)
      disc(ctx, x + 3, y - 1, 5)
    } else {
      ctx.fillStyle = '#ddd6b8'
      ctx.fillRect(x - 2, y - 1, 2, 2)
      ctx.fillRect(x + 2, y + 2, 1, 1)
    }
    ctx.globalAlpha = 1
  }
  // 彩虹
  if (w === 'rainbow') {
    const cols = ['#e86a6a', '#f0a45a', '#f2d65a', '#7fcf6a', '#6aa8e8', '#8a7ae0']
    ctx.globalAlpha = 0.55
    for (let i = 0; i < cols.length; i++) {
      ctx.fillStyle = cols[i]
      arc(ctx, 330, 75, 62 - i * 3, 3)
    }
    ctx.globalAlpha = 1
  }
  // 云
  const cloudy = w === 'cloudy' ? 6 : w === 'overcast' || w === 'storm' || w === 'heavyRain' ? 12 : w === 'lightRain' || w === 'snow' ? 9 : w === 'sunny' ? 3 : 5
  const dark = w === 'storm' || w === 'heavyRain' ? 0.55 : w === 'overcast' || w === 'lightRain' ? 0.35 : 0
  const nightDim = night ? 0.6 : h < 7 || h > 17.5 ? 0.25 : 0
  for (let i = 0; i < cloudy; i++) {
    const speed = 2 + hash(i + 50) * 3
    const x = ((hash(i * 11) * (VIEW_W + 80) + t * speed) % (VIEW_W + 80)) - 40
    const y = 6 + hash(i * 5 + 3) * 26
    let c = mix('#ffffff', '#5b6470', dark)
    c = mix(c, '#2a3156', nightDim)
    if (!night && (h < 7.2 || h > 17)) c = mix(c, '#f6b48a', 0.35)
    cloud(ctx, Math.floor(x), Math.floor(y), 10 + Math.floor(hash(i * 13) * 14), c, mix(c, '#000000', 0.12))
  }
}

function disc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r - y * y))
    ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1)
  }
}
function arc(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, th: number) {
  for (let x = -r; x <= r; x++) {
    const y = Math.sqrt(Math.max(0, r * r - x * x))
    ctx.fillRect(cx + x, Math.floor(cy - y), 1, th)
  }
}
function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, c: string, shade: string) {
  ctx.fillStyle = shade
  ctx.fillRect(x + 2, y + 5, w, 3)
  ctx.fillStyle = c
  ctx.fillRect(x, y + 3, w + 4, 4)
  ctx.fillRect(x + 3, y + 1, Math.floor(w * 0.5), 3)
  ctx.fillRect(x + Math.floor(w * 0.45), y, Math.floor(w * 0.35), 4)
}

// ================= 地面与背景 =================

const GRASS: Record<Season, [string, string, string]> = {
  spring: ['#7fb562', '#6fa556', '#93c472'],
  summer: ['#5f9e4c', '#548f43', '#71ad59'],
  autumn: ['#a3a656', '#93964b', '#b8b366'],
  winter: ['#8e9a7a', '#7f8b6c', '#a0aa8a'],
}

export function drawBackground(ctx: CanvasRenderingContext2D, season: Season, unlocked: Rect) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H)
  // ---- 远景屋顶 ----
  const roofCols = ['#6b4f4a', '#5a5a6e', '#7a5a45', '#56606a', '#6e5560']
  let x = -10
  let i = 0
  while (x < VIEW_W) {
    const w = 40 + Math.floor(hash(i * 3) * 50)
    const top = 22 + Math.floor(hash(i * 5) * 16)
    const col = roofCols[i % roofCols.length]
    // 墙体
    ctx.fillStyle = mix('#c8b8a0', '#8a8fa0', hash(i * 9))
    ctx.fillRect(x, top + 6, w, 60)
    // 窗户
    ctx.fillStyle = '#4a5468'
    for (let wx = x + 5; wx < x + w - 6; wx += 10) ctx.fillRect(wx, top + 12, 4, 5)
    // 屋顶
    ctx.fillStyle = col
    for (let r = 0; r < 7; r++) ctx.fillRect(x - 3 + r, top + r - 1, w + 6 - r * 2, 1)
    ctx.fillStyle = mix(col, '#000000', 0.25)
    ctx.fillRect(x - 3, top + 6, w + 6, 1)
    if (season === 'winter') {
      ctx.fillStyle = '#eef2f6'
      ctx.fillRect(x - 2, top - 1, w + 4, 2)
    }
    // 晾衣绳 / 天线
    if (hash(i * 17) > 0.6) {
      ctx.fillStyle = '#3a3a44'
      ctx.fillRect(x + Math.floor(w / 2), top - 8, 1, 8)
      ctx.fillRect(x + Math.floor(w / 2) - 3, top - 6, 7, 1)
    }
    x += w + 2
    i++
  }
  // 远处树
  const treeC = { spring: '#5f8f4a', summer: '#3f7a3f', autumn: '#c0703a', winter: '#6a6a62' }[season]
  for (let t = 0; t < 9; t++) {
    const tx = Math.floor(hash(t * 23 + 1) * VIEW_W)
    const tw = 14 + Math.floor(hash(t * 29) * 12)
    ctx.fillStyle = mix(treeC, '#000000', 0.15)
    ctx.fillRect(tx - tw / 2, 34, tw, 18)
    ctx.fillStyle = treeC
    ctx.fillRect(tx - tw / 2 + 2, 30, tw - 4, 16)
    if (season === 'spring' && t % 3 === 0) {
      ctx.fillStyle = '#f2b6c6'
      ctx.fillRect(tx - 3, 32, 6, 5)
    }
  }
  // ---- 围墙 ----
  const wallTop = OY - 20
  ctx.fillStyle = '#a6584a'
  ctx.fillRect(0, wallTop, VIEW_W, 20)
  for (let row = 0; row < 5; row++) {
    const y = wallTop + 2 + row * 4
    const off = row % 2 ? 6 : 0
    for (let bx = -off; bx < VIEW_W; bx += 12) {
      const v = hash(bx * 13 + row * 7)
      ctx.fillStyle = v > 0.7 ? '#b9685a' : v < 0.2 ? '#93493e' : '#a85c4d'
      ctx.fillRect(bx + 1, y, 10, 3)
    }
    ctx.fillStyle = '#7e3f35'
    ctx.fillRect(0, y + 3, VIEW_W, 1)
  }
  // 墙头
  ctx.fillStyle = '#c9c2b5'
  ctx.fillRect(0, wallTop - 3, VIEW_W, 3)
  ctx.fillStyle = '#9b958a'
  ctx.fillRect(0, wallTop, VIEW_W, 1)
  if (season === 'winter') {
    ctx.fillStyle = '#f2f5f8'
    ctx.fillRect(0, wallTop - 4, VIEW_W, 2)
  }
  // 墙根阴影
  ctx.fillStyle = 'rgba(0,0,0,0.18)'
  ctx.fillRect(0, OY - 1, VIEW_W, 3)
  // 爬山虎
  const ivy = { spring: '#6fa556', summer: '#3f7a3f', autumn: '#c2553f', winter: '#7a6a5a' }[season]
  for (let k = 0; k < 14; k++) {
    const vx = Math.floor(hash(k * 41) * VIEW_W)
    const vh = 6 + Math.floor(hash(k * 43) * 14)
    for (let j = 0; j < vh; j++) {
      ctx.fillStyle = j % 3 === 0 ? mix(ivy, '#000000', 0.2) : ivy
      ctx.fillRect(vx + Math.floor(Math.sin(j * 0.9 + k) * 2), wallTop + j, 2, 1)
    }
  }

  // ---- 地面 ----
  const [g0, g1, g2] = GRASS[season]
  ctx.fillStyle = g0
  ctx.fillRect(0, OY, VIEW_W, VIEW_H - OY)
  for (let ty = 0; ty < GRID_H + 1; ty++) {
    for (let tx = 0; tx < GRID_W + 2; tx++) {
      const px = OX - TILE + tx * TILE
      const py = OY + ty * TILE
      for (let k = 0; k < 6; k++) {
        const hx = hash(tx * 131 + ty * 977 + k * 31)
        const hy = hash(tx * 71 + ty * 313 + k * 17)
        ctx.fillStyle = k % 2 ? g1 : g2
        ctx.fillRect(px + Math.floor(hx * 15), py + Math.floor(hy * 15), k % 3 === 0 ? 2 : 1, 1)
      }
      // 小花 / 草叶
      const f = hash(tx * 7 + ty * 19)
      if (f > 0.9 && season !== 'winter') {
        ctx.fillStyle = season === 'autumn' ? '#d9a03a' : f > 0.95 ? '#f4f0e0' : '#f2d24a'
        ctx.fillRect(px + 5 + Math.floor(f * 6), py + 7, 1, 1)
      }
      if (f < 0.12) {
        ctx.fillStyle = mix(g0, '#ffffff', 0.15)
        ctx.fillRect(px + 3, py + 9, 1, 2)
        ctx.fillRect(px + 5, py + 8, 1, 3)
      }
    }
  }

  // ---- 锁定区域：荒草与碎石 ----
  const ux = OX + unlocked.x * TILE
  const uy = OY + unlocked.y * TILE
  const uw = unlocked.w * TILE
  const uh = unlocked.h * TILE
  for (let ty = 0; ty < GRID_H; ty++) {
    for (let tx = -1; tx <= GRID_W; tx++) {
      const inside = tx >= unlocked.x && tx < unlocked.x + unlocked.w && ty >= unlocked.y && ty < unlocked.y + unlocked.h
      if (inside) continue
      const px = OX + tx * TILE
      const py = OY + ty * TILE
      ctx.fillStyle = 'rgba(40,30,20,0.38)'
      ctx.fillRect(px, py, TILE, TILE)
      // 荒草
      const wild = { spring: '#5d8a44', summer: '#4a7a38', autumn: '#9a8a4a', winter: '#7a7a68' }[season]
      for (let k = 0; k < 5; k++) {
        const hx = Math.floor(hash(tx * 53 + ty * 89 + k) * 14)
        const hh = 3 + Math.floor(hash(tx * 3 + ty * 5 + k * 9) * 6)
        ctx.fillStyle = k % 2 ? wild : mix(wild, '#000000', 0.2)
        ctx.fillRect(px + hx, py + 14 - hh, 1, hh)
        ctx.fillRect(px + hx + 1, py + 15 - hh + 2, 1, hh - 2)
      }
      const r = hash(tx * 17 + ty * 23)
      if (r > 0.82) {
        ctx.fillStyle = '#8a857a'
        ctx.fillRect(px + 4, py + 10, 5, 3)
        ctx.fillStyle = '#a8a294'
        ctx.fillRect(px + 5, py + 10, 3, 1)
      } else if (r < 0.06) {
        // 旧木板
        ctx.fillStyle = '#7a5a3a'
        ctx.fillRect(px + 2, py + 11, 10, 2)
      }
    }
  }
  // 小院边界：低矮木栅栏
  if (unlocked.w < GRID_W || unlocked.y > 0) {
    const post = '#8a6a48'
    const rail = '#a5825a'
    // 上边
    if (unlocked.y > 0) {
      ctx.fillStyle = rail
      ctx.fillRect(ux - 2, uy - 6, uw + 4, 2)
      ctx.fillRect(ux - 2, uy - 2, uw + 4, 1)
      for (let fx = ux - 2; fx <= ux + uw + 2; fx += 8) {
        ctx.fillStyle = post
        ctx.fillRect(fx, uy - 9, 2, 9)
      }
    }
    // 左右
    for (const sx of [ux - 3, ux + uw + 1]) {
      ctx.fillStyle = rail
      ctx.fillRect(sx, uy - 6, 2, uh + 6)
      for (let fy = uy - 6; fy < uy + uh; fy += 8) {
        ctx.fillStyle = post
        ctx.fillRect(sx - 1, fy, 4, 3)
      }
    }
  }
  // 底部栅栏与门
  const by = OY + GRID_H * TILE
  ctx.fillStyle = '#7a5a3a'
  ctx.fillRect(0, by, VIEW_W, VIEW_H - by)
  for (let fx = 0; fx < VIEW_W; fx += 6) {
    ctx.fillStyle = hash(fx) > 0.5 ? '#a5825a' : '#987650'
    ctx.fillRect(fx, by - 2, 5, VIEW_H - by + 2)
    ctx.fillStyle = '#c9a36a'
    ctx.fillRect(fx, by - 2, 5, 1)
  }
  // 门（中央）
  const dx = OX + (GRID_W / 2) * TILE - 12
  ctx.fillStyle = '#5b3f28'
  ctx.fillRect(dx, by - 3, 24, VIEW_H - by + 3)
  ctx.fillStyle = '#3c2a1a'
  ctx.fillRect(dx + 2, by - 1, 20, VIEW_H - by + 1)
  ctx.fillStyle = '#c9a36a'
  ctx.fillRect(dx - 1, by - 4, 26, 1)
}

/** 积雪覆盖层 */
export function drawSnowCover(ctx: CanvasRenderingContext2D) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H)
  for (let y = OY; y < VIEW_H; y += 2) {
    for (let x = 0; x < VIEW_W; x += 2) {
      const h = hash(x * 7 + y * 131)
      if (h > 0.25) {
        ctx.fillStyle = h > 0.85 ? '#ffffff' : '#e8eef4'
        ctx.fillRect(x, y, 2, 2)
      }
    }
  }
  ctx.fillStyle = '#f4f7fa'
  ctx.fillRect(0, OY - 24, VIEW_W, 3)
}
