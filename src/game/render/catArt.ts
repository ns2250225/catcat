// Procedural pixel-art cats. Every frame is rasterised into a tiny part/uv grid,
// coloured by pattern + shading, outlined, then detailed (eyes, nose, mouth) and
// flushed to the canvas with run-length fillRect calls.
import type { CatAppearance, FurColor, EyeColor, BodyType } from '../types'

export const CAT_W = 28
export const CAT_H = 24

export type CatPose =
  | 'stand' | 'walk0' | 'walk1' | 'walk2' | 'walk3' | 'run0' | 'run1'
  | 'sit' | 'sitBlink' | 'sitLook' | 'loaf' | 'sleep0' | 'sleep1'
  | 'sleepBelly' | 'eat0' | 'eat1' | 'groom0' | 'groom1'
  | 'pounce0' | 'pounce1' | 'scratch0' | 'scratch1' | 'hiss'
  | 'stretch' | 'jump' | 'meow'

export const CAT_POSES: CatPose[] = [
  'stand', 'walk0', 'walk1', 'walk2', 'walk3', 'run0', 'run1',
  'sit', 'sitBlink', 'sitLook', 'loaf', 'sleep0', 'sleep1',
  'sleepBelly', 'eat0', 'eat1', 'groom0', 'groom1',
  'pounce0', 'pounce1', 'scratch0', 'scratch1', 'hiss',
  'stretch', 'jump', 'meow',
]

export const FUR_HEX: Record<FurColor, [base: string, shadow: string, light: string]> = {
  orange: ['#e3a15f', '#c47c45', '#f3c28d'],
  black: ['#2f2b33', '#221f26', '#48424e'],
  white: ['#f4efe6', '#ddd3c4', '#fffcf6'],
  gray: ['#9d9a9f', '#7f7c84', '#bcb9bd'],
  cream: ['#ecd4aa', '#d3b68a', '#f8e7c8'],
  brown: ['#8f6548', '#724d36', '#aa8160'],
  chocolate: ['#6c4b3b', '#53392c', '#87624e'],
  lilac: ['#c4b4be', '#a897a3', '#d9ccd4'],
  blue: ['#8a93a4', '#6e7789', '#a5adbc'],
  golden: ['#e1b964', '#c39b4a', '#f0d18c'],
  darkGray: ['#605d64', '#4b484f', '#78757c'],
  redBrown: ['#a75b3f', '#874630', '#c1775b'],
  silver: ['#cacdd1', '#abb1b7', '#e3e5e7'],
  caramel: ['#ca905b', '#aa7446', '#deac7c'],
}

export const EYE_HEX: Record<EyeColor, string> = {
  yellow: '#e9d35c',
  green: '#8dc66c',
  blue: '#80b7e6',
  amber: '#e2a242',
  copper: '#c97b3c',
  hazel: '#aaa253',
  gold: '#f1c443',
  gray: '#aab2b6',
}

// ---------------------------------------------------------------- colours

const INK = '#231b22'
const PUPIL = '#2a2228'
const GLINT = '#ffffff'
const PINK = '#eba3a7'
const NOSE_HEX = { pink: '#e8939b', black: '#3a3036', brown: '#8a5a48' } as const

function rgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function hex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return '#' + c(r) + c(g) + c(b)
}
function mix(a: string, b: string, t: number): string {
  const A = rgb(a), B = rgb(b)
  return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t)
}
function lum(h: string): number {
  const [r, g, b] = rgb(h)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

const FUR_KEYS = Object.keys(FUR_HEX) as FurColor[]
const T_BASE = 0, T_SHADOW = 1, T_LIGHT = 2, T_LINE = 3, T_STRIPE = 4, T_STRIPE2 = 5, T_OUT = 6
/** per fur: base, shadow, light, line, stripe, stripe2, outline */
const PAL: string[][] = FUR_KEYS.map((k) => {
  const [b, s, l] = FUR_HEX[k]
  return [b, s, l, mix(s, INK, 0.38), mix(s, INK, 0.2), mix(s, INK, 0.42), mix(s, INK, 0.64)]
})
const FUR_LUM: number[] = FUR_KEYS.map((k) => lum(FUR_HEX[k][0]))
const fidx = (f: FurColor) => FUR_KEYS.indexOf(f)

// ---------------------------------------------------------------- grid state

const W = CAT_W
const H = CAT_H
const G = CAT_H - 2 // ground row (feet bottom)
const N = W * H

const BODY = 1, HEAD = 2, EARF = 3, EARN = 4, TAIL = 5, LEGF = 6, LEGN = 7

const part = new Uint8Array(N)
const zb = new Uint8Array(N)
const U = new Float32Array(N)
const V = new Float32Array(N)
const LX = new Float32Array(N)
const LY = new Float32Array(N)
const furOf = new Uint8Array(N)
const tone = new Uint8Array(N)
const col: (string | null)[] = new Array<string | null>(N).fill(null)
const sepF: boolean[] = [false]
let zi = 0

interface Frame { cx: number; cy: number; c: number; s: number; rx: number; ry: number; flip: boolean }
let main: Frame | null = null

type EyeStyle = 'open' | 'closed' | 'up' | 'wide'
type MouthStyle = 'smile' | 'open' | 'hiss' | 'tongue' | 'none'
interface HeadInfo {
  hx: number; hy: number; hrx: number; hry: number
  fx: number; ey: number; hyR: number
  eyes: EyeStyle; mouth: MouthStyle
  earN: number; earF: number
}
let HI: HeadInfo | null = null

function reset() {
  part.fill(0)
  zb.fill(0)
  col.fill(null)
  zi = 0
  sepF.length = 1
  main = null
  HI = null
}

function put(i: number, p: number, u: number, v: number, lx: number, ly: number) {
  part[i] = p
  zb[i] = zi
  U[i] = u
  V[i] = v
  LX[i] = lx
  LY[i] = ly
}

function newShape(sep: boolean) {
  zi++
  sepF[zi] = sep
}

/** filled (optionally rotated / super-) ellipse. u along the rotated x axis, v across (+ = belly side). */
function ell(p: number, cx: number, cy: number, rx: number, ry: number, ang = 0, flip = false, sep = false, ex = 2) {
  newShape(sep)
  const a = (ang * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a)
  if (p === BODY && !main) main = { cx, cy, c, s, rx, ry, flip }
  const R = Math.max(rx, ry) + 1
  const x0 = Math.max(1, Math.floor(cx - R)), x1 = Math.min(W - 2, Math.ceil(cx + R))
  const y0 = Math.max(1, Math.floor(cy - R)), y1 = Math.min(G, Math.ceil(cy + R))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy
      const lx = dx * c + dy * s, ly = -dx * s + dy * c
      const nu = lx / rx, nv = ly / ry
      const d = ex === 2 ? nu * nu + nv * nv : Math.pow(Math.abs(nu), ex) + Math.pow(Math.abs(nv), ex)
      if (d <= 1) put(y * W + x, p, nu, flip ? -nv : nv, lx, flip ? -ly : ly)
    }
  }
}

type Pt = [x: number, y: number, r: number]

/** thick poly-line with per-point radius. u = 0..1 along, v = signed side, lx = distance along. */
function limb(p: number, pts: Pt[], sep = false, paw = false) {
  newShape(sep)
  const n = pts.length
  const cum: number[] = [0]
  let minX = 99, maxX = -99, minY = 99, maxY = -99
  for (let k = 0; k < n; k++) {
    const [x, y, r] = pts[k]
    minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r)
    minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r)
    if (k > 0) cum.push(cum[k - 1] + Math.hypot(x - pts[k - 1][0], y - pts[k - 1][1]))
  }
  const total = Math.max(0.001, cum[n - 1])
  const x0 = Math.max(1, Math.floor(minX)), x1 = Math.min(W - 2, Math.ceil(maxX))
  const y0 = Math.max(1, Math.floor(minY)), y1 = Math.min(G, Math.ceil(maxY))
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5
      let best = 1e9, along = 0, side = 0, rr = 1
      for (let k = 0; k < Math.max(1, n - 1); k++) {
        const a = pts[k], b = pts[Math.min(k + 1, n - 1)]
        const vx = b[0] - a[0], vy = b[1] - a[1]
        const L2 = vx * vx + vy * vy
        let t = L2 > 0 ? ((px - a[0]) * vx + (py - a[1]) * vy) / L2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const qx = a[0] + vx * t, qy = a[1] + vy * t
        const d = Math.hypot(px - qx, py - qy)
        const r = a[2] + (b[2] - a[2]) * t
        if (d - r < best) {
          best = d - r
          along = cum[k] + Math.sqrt(L2) * t
          side = (vx * (py - a[1]) - vy * (px - a[0])) >= 0 ? d : -d
          rr = r
        }
      }
      if (best <= 1e-6) put(y * W + x, p, paw ? 1 : along / total, side / Math.max(0.3, rr), along, side)
    }
  }
}

function tri(p: number, ax: number, ay: number, bx: number, by: number, cx: number, cy: number) {
  newShape(false)
  const x0 = Math.max(1, Math.floor(Math.min(ax, bx, cx))), x1 = Math.min(W - 2, Math.ceil(Math.max(ax, bx, cx)))
  const y0 = Math.max(1, Math.floor(Math.min(ay, by, cy))), y1 = Math.min(G, Math.ceil(Math.max(ay, by, cy)))
  const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
  if (Math.abs(area) < 1e-6) return zi
  const sg = area > 0 ? 1 : -1
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5
      const w0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * sg
      const w1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * sg
      const w2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * sg
      if (w0 >= -0.05 && w1 >= -0.05 && w2 >= -0.05) put(y * W + x, p, 0, 0, px - cx, py - cy)
    }
  }
  return zi
}

function bodyPt(u: number, v: number): [number, number] {
  const f = main
  if (!f) return [W / 2, G - 4]
  const lx = u * f.rx, ly = (f.flip ? -v : v) * f.ry
  return [f.cx + lx * f.c - ly * f.s, f.cy + lx * f.s + ly * f.c]
}

// ---------------------------------------------------------------- hashing / noise

function hash3(x: number, y: number, z: number): number {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}
function noise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y)
  const fx = x - ix, fy = y - iy
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy)
  const a = hash3(ix, iy, seed), b = hash3(ix + 1, iy, seed)
  const c = hash3(ix, iy + 1, seed), d = hash3(ix + 1, iy + 1, seed)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}
function strHash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
const mod = (n: number, m: number) => ((n % m) + m) % m

// ---------------------------------------------------------------- sizes

interface Size {
  s: number; brx: number; bry: number; leg: number; lw: number
  hrx: number; hry: number; earH: number; earW: number; tail: number; tr: number
}
const SIZES: Record<BodyType, Size> = {
  tiny: { s: 0.62, brx: 3.9, bry: 2.5, leg: 2.4, lw: 1, hrx: 3.7, hry: 3.3, earH: 2.2, earW: 2.7, tail: 6, tr: 0.85 },
  kitten: { s: 0.72, brx: 4.4, bry: 2.8, leg: 2.8, lw: 1, hrx: 4.0, hry: 3.6, earH: 2.5, earW: 3.0, tail: 6.5, tr: 0.9 },
  slim: { s: 0.98, brx: 6.1, bry: 3.0, leg: 4.4, lw: 1, hrx: 4.3, hry: 3.8, earH: 3.2, earW: 3.2, tail: 10, tr: 0.8 },
  normal: { s: 1, brx: 6.0, bry: 3.6, leg: 4.0, lw: 1, hrx: 5.0, hry: 4.4, earH: 3.0, earW: 3.5, tail: 9, tr: 1 },
  chubby: { s: 1.05, brx: 7.0, bry: 4.6, leg: 3.2, lw: 1, hrx: 4.9, hry: 4.3, earH: 2.8, earW: 3.6, tail: 8.5, tr: 1.1 },
  big: { s: 1.18, brx: 7.4, bry: 4.4, leg: 4.6, lw: 1.1, hrx: 5.3, hry: 4.7, earH: 3.4, earW: 4.0, tail: 10, tr: 1.2 },
  tall: { s: 1.05, brx: 6.0, bry: 3.4, leg: 6.0, lw: 1, hrx: 4.5, hry: 4.0, earH: 3.2, earW: 3.4, tail: 10, tr: 1 },
}

// ---------------------------------------------------------------- per-cat context

let A: CatAppearance = { base: 'gray', pattern: 'solid', eyes: 'yellow', body: 'normal', tail: 'normal', ears: 'normal', fur: 'short' }
let S: Size = SIZES.normal
let seed = 1
let fB = 0, fS = 0, fVan = 0, fC1 = 0, fC2 = 0, fW = 0, fBlack = 0, fDarkMark = 0, fLightMark = 0, fBolt = 0, fP = 0, fPt = 0

function isLightFur(f: FurColor) { return f === 'white' || f === 'cream' || f === 'silver' }
function isDarkFur(f: FurColor) { return f === 'black' || f === 'darkGray' || f === 'chocolate' || f === 'brown' }

function setup(a: CatAppearance) {
  A = a
  S = SIZES[a.body] ?? SIZES.normal
  seed = strHash([a.base, a.secondary ?? '', a.pattern, a.eyes, a.eyes2 ?? '', a.body, a.tail, a.ears, a.fur].join('|')) & 0xffff
  const B = a.base
  fB = fidx(B)
  fW = fidx('white')
  fBlack = fidx('black')
  const sec: FurColor = a.secondary ?? (B === 'black' ? 'orange' : B === 'white' ? 'gray' : 'black')
  fS = fidx(sec)
  fDarkMark = fidx(a.secondary ?? (isDarkFur(B) ? 'white' : 'black'))
  fLightMark = fidx(a.secondary ?? (isLightFur(B) ? 'caramel' : 'white'))
  fBolt = fidx(a.secondary ?? (B === 'golden' || B === 'orange' || B === 'cream' || B === 'caramel' ? 'white' : 'golden'))
  fVan = B === 'white' ? fidx(a.secondary ?? 'orange') : fB
  const c1: FurColor = B === 'white' ? (a.secondary && a.secondary !== 'black' ? a.secondary : 'orange') : B
  let c2: FurColor = a.secondary && a.secondary !== c1 ? a.secondary : 'black'
  if (c2 === c1) c2 = 'gray'
  fC1 = fidx(c1)
  fC2 = fidx(c2)
  fP = fidx(isLightFur(B) ? B : 'cream')
  fPt = fidx(a.secondary ?? (isLightFur(B) ? 'brown' : B))
  if (fPt === fP) fPt = fidx('brown')
}

// ---------------------------------------------------------------- body-part builders

const legXr = (x: number) => (S.lw > 1.05 ? Math.floor(x) + 0.5 : Math.round(x))

function leg(far: boolean, hx: number, hy: number, fx: number, fy: number, sep = false, mid?: [number, number]) {
  const pts: Pt[] = [[legXr(hx), hy, S.lw]]
  if (mid) pts.push([mid[0], mid[1], S.lw])
  pts.push([legXr(fx), fy + 0.5, S.lw])
  limb(far ? LEGF : LEGN, pts, sep)
}

function tail(x0: number, y0: number, ang: number, curl: number, opt: { len?: number; puff?: boolean; sep?: boolean } = {}) {
  let len = S.tail * (opt.len ?? 1)
  let r = S.tr
  const t = A.tail
  if (t === 'long') len *= 1.3
  else if (t === 'short') len *= 0.5
  else if (t === 'thin') { len *= 1.1; r = 0.55 }
  else if (t === 'fluffy') r *= 1.45
  else if (t === 'bobbed') { len = 2.2 * S.s; r = S.tr * 1.6 }
  if (A.fur === 'long') r += t === 'thin' ? 0.25 : 0.45
  if (opt.puff) r = r * 1.3 + 0.45
  const n = Math.max(2, Math.round(len))
  const pts: Pt[] = []
  let x = x0, y = y0, an = ang
  const kinkAt = Math.round(n * 0.62)
  for (let k = 0; k <= n; k++) {
    const tt = k / n
    let rr = r
    if (t === 'fluffy' || opt.puff) rr = r * (0.72 + 0.45 * Math.sin(Math.PI * Math.min(1, 0.15 + tt)))
    else if (t !== 'bobbed' && tt > 0.8) rr = r * 0.85
    pts.push([x, y, rr])
    if (t === 'kinked' && k === kinkAt) an += 80
    an += curl
    x += Math.cos((an * Math.PI) / 180)
    y += Math.sin((an * Math.PI) / 180)
  }
  limb(TAIL, pts, opt.sep ?? false)
}

interface HeadOpt { eyes?: EyeStyle; mouth?: MouthStyle; tilt?: number; earScale?: number; ruff?: boolean }

function head(hx: number, hy: number, o: HeadOpt = {}) {
  const { hrx, hry } = S
  let eh = S.earH * (o.earScale ?? 1)
  let ew = S.earW
  const et = A.ears
  if (et === 'big') { eh *= 1.35; ew *= 1.15 }
  else if (et === 'small') { eh *= 0.65; ew *= 0.85 }
  else if (et === 'curled') eh *= 0.85
  const tilt = o.tilt ?? 0
  const lift = tilt < -20 ? eh * 0.4 : eh
  hy = Math.max(hy, hry + lift + 1.3)
  hx = Math.min(hx, W - 1.6 - hrx)
  hx = Math.max(hx, hrx + 1)

  if (o.ruff !== false && A.fur === 'long') ell(BODY, hx - 0.2 * hrx, hy + hry * 0.8, hrx * 0.62, hry * 0.5)

  const EX = 2.4
  const topY = (dx: number) => -hry * Math.pow(Math.max(0, 1 - Math.pow(Math.min(1, Math.abs(dx / hrx)), EX)), 1 / EX)
  const ear = (p: number, c: number, lean: number) => {
    const hw = ew / 2
    const b1x = c - hw, b2x = c + hw
    const b1y = topY(b1x) + 1.1, b2y = topY(b2x) + 1.1
    let tx = c + lean, ty = topY(c) - eh + 0.4
    if (et === 'curled') tx -= 1.5 * S.s
    const bcx = (b1x + b2x) / 2, bcy = (b1y + b2y) / 2
    const ta = (tilt * Math.PI) / 180, ca = Math.cos(ta), sa = Math.sin(ta)
    const rot = (x: number, y: number): [number, number] => {
      const dx = x - bcx, dy = y - bcy
      return [hx + bcx + dx * ca - dy * sa, hy + bcy + dx * sa + dy * ca]
    }
    const p1 = rot(b1x, b1y), p2 = rot(b2x, b2y), pt = rot(tx, ty)
    return tri(p, p1[0], p1[1], p2[0], p2[1], pt[0], pt[1])
  }
  const earF = ear(EARF, -0.42 * hrx, -0.5)
  ell(HEAD, hx, hy, hrx, hry, 0, false, true, EX)
  if (A.fur === 'long') ell(HEAD, hx - 0.3 * hrx, hy + 0.42 * hry, hrx * 0.72, hry * 0.56)
  const earN = ear(EARN, 0.55 * hrx, 0.6)
  if (et === 'notched') {
    let top = 99
    for (let i = 0; i < N; i++) if (zb[i] === earN && part[i] === EARN) top = Math.min(top, (i / W) | 0)
    for (let i = 0; i < N; i++) {
      if (zb[i] === earN && part[i] === EARN && ((i / W) | 0) === top) { part[i] = 0; zb[i] = 0 }
    }
  }
  const fx = Math.round(hx + Math.min(0.33 * hrx, hrx - 2.9))
  const hyR = Math.round(hy)
  const eyes = o.eyes ?? 'open'
  HI = { hx, hy, hrx, hry, fx, hyR, ey: hyR - 1 - (eyes === 'up' ? 1 : 0), eyes, mouth: o.mouth ?? 'smile', earN, earF }
}

// ---------------------------------------------------------------- poses

function buildPose(pose: CatPose) {
  const s = S.s
  const X = W / 2
  const off = Math.max(1, Math.round(1.5 * s))

  const standLike = (k: number, eat: number) => {
    const cx = X - 1 * s - (S.brx - 6) * 0.35
    const cy = G + 1 - S.leg - S.bry
    const frontX = cx + S.brx - 2.2 * s, backX = cx - S.brx + 2.4 * s
    const hip = cy + S.bry * 0.15
    const sway = k < 0 ? 0 : [0, 4, 0, -4][k]
    if (eat >= 0) tail(cx - S.brx + 1.2 * s, cy - S.bry * 0.35, 235, 6)
    else tail(cx - S.brx + 1.2 * s, cy - S.bry * 0.35, 205 + sway, 9)
    const legs: [boolean, boolean, number][] = [[true, true, Math.PI], [true, false, 0], [false, true, 0], [false, false, Math.PI]]
    for (const [far, front, ph0] of legs) {
      const bx = front ? frontX : backX
      let dx = 0, lift = 0
      if (k >= 0) {
        const ph = ph0 + (k * Math.PI) / 2
        dx = 1.6 * s * Math.cos(ph)
        lift = Math.sin(ph) < -0.5 ? Math.max(1, Math.round(1.2 * s)) : 0
      } else if (far) dx = front ? off : -off
      if (eat >= 0 && front) dx += 0.8 * s
      leg(far, bx + (k >= 0 ? dx * 0.3 : dx), hip, bx + dx, G - lift)
    }
    ell(BODY, cx, cy, S.brx, S.bry)
    if (eat >= 0) {
      const hx = cx + S.brx + S.hrx * 0.3
      const hy = G + 1 - S.hry * 0.95 + eat * 0.8 * s
      limb(BODY, [[cx + S.brx * 0.55, cy - S.bry * 0.25, S.bry * 0.8], [hx - S.hrx * 0.4, hy - S.hry * 0.3, S.hry * 0.6]])
      head(hx, hy, { eyes: eat ? 'closed' : 'open', mouth: 'none', ruff: false })
    } else {
      head(cx + S.brx - 0.3 * s, cy - S.bry - S.hry * 0.3)
    }
  }

  const run = (k: number) => {
    const bx = S.brx * 1.12, by = S.bry * 0.88
    const cx = X - 1.5 * s - (S.brx - 6) * 0.3
    const cy = G + 1 - S.leg * 0.8 - by - (k === 0 ? 1.2 * s : 0)
    const frontX = cx + bx - 2.4 * s, backX = cx - bx + 2.6 * s, hip = cy + by * 0.2
    tail(cx - bx + 1 * s, cy - by * 0.3, k === 0 ? 190 : 178, k === 0 ? -2 : 3)
    if (k === 0) {
      leg(true, frontX + 1 * s, hip, frontX + 3.8 * s, G - 1.5 * s)
      leg(true, backX - 1 * s, hip, backX - 3.6 * s, G - 1.5 * s)
      leg(false, frontX, hip, frontX + 3.2 * s, G - 0.6 * s)
      leg(false, backX, hip, backX - 3.2 * s, G - 0.4 * s)
    } else {
      leg(true, frontX, hip, frontX - 0.8 * s, G - 1)
      leg(true, backX, hip, backX + 1.2 * s, G - 1)
      leg(false, frontX, hip, frontX - 2 * s, G)
      leg(false, backX, hip, backX + 2.4 * s, G)
    }
    ell(BODY, cx, cy, bx, by, k === 0 ? -3 : 3)
    head(cx + bx + 0.2 * s, cy - by - S.hry * 0.05, { tilt: -12 })
  }

  const sitLike = (o: HeadOpt & { groom?: number }) => {
    const vx = S.bry * 1.6, hz = S.brx * 0.66
    const cx = X - 1.5 * s - (S.brx - 6) * 0.2
    const cy = G + 1 - vx
    const legX = cx + hz * 0.55
    tail(cx - S.brx * 0.75, G + 0.5 - S.tr * 0.6, 180, 15, { len: 0.85 })
    leg(true, legX + off, cy - vx * 0.2, legX + off, G)
    ell(BODY, cx, cy, vx, hz, -78)
    ell(BODY, cx - 1.6 * s, G + 1 - S.bry * 0.85, S.brx * 0.58, S.bry * 0.85, 0, false, true)
    limb(LEGN, [[cx - 2.4 * s, G + 0.2, S.lw * 0.95], [cx + 0.4 * s, G + 0.2, S.lw * 0.95]], false, true)
    let hy = cy - vx - S.hry * 0.45
    const hx = cx + 1.2 * s
    if (o.groom === undefined) {
      leg(false, legX, cy - vx * 0.3, legX, G, true)
      head(hx, hy, o)
    } else {
      hy += (0.6 + o.groom * 0.6) * s
      head(hx, hy, o)
      const h = HI as HeadInfo
      const px = h.hx + h.hrx * 0.72, py = h.hy + h.hry * 0.55 - o.groom * 0.8 * s
      limb(LEGN, [[legXr(legX), cy - 1.5 * s, S.lw], [legX + 1.6 * s, cy + 0.8 * s, S.lw], [px, py, S.lw * 1.05]], true)
    }
  }

  switch (pose) {
    case 'stand': standLike(-1, -1); break
    case 'walk0': standLike(0, -1); break
    case 'walk1': standLike(1, -1); break
    case 'walk2': standLike(2, -1); break
    case 'walk3': standLike(3, -1); break
    case 'eat0': standLike(-1, 0); break
    case 'eat1': standLike(-1, 1); break
    case 'run0': run(0); break
    case 'run1': run(1); break
    case 'sit': sitLike({}); break
    case 'sitBlink': sitLike({ eyes: 'closed' }); break
    case 'sitLook': sitLike({ eyes: 'up', mouth: 'smile' }); break
    case 'meow': sitLike({ mouth: 'open' }); break
    case 'groom0': sitLike({ eyes: 'closed', mouth: 'none', groom: 0 }); break
    case 'groom1': sitLike({ eyes: 'closed', mouth: 'tongue', groom: 1 }); break

    case 'loaf': {
      const rx = S.brx * 1.08, ry = S.bry * 1.1
      const cx = X - 1 * s - (S.brx - 6) * 0.3, cy = G + 1 - ry * 0.95
      ell(BODY, cx, cy, rx, ry)
      tail(cx - rx + 1.2 * s, G + 0.5 - S.tr * 0.5, 0, -1, { len: 0.85, sep: true })
      limb(LEGN, [[cx + rx - 3 * s, G + 0.3, S.lw * 0.9], [cx + rx - 1.2 * s, G + 0.3, S.lw * 0.9]], true, true)
      head(cx + rx - 1.2 * s, cy - ry * 0.75 - S.hry * 0.3, { eyes: 'open', ruff: false })
      break
    }

    case 'sleep0':
    case 'sleep1': {
      const b = pose === 'sleep1' ? 1 : 0
      const rx = S.brx * 1.12 + b * 0.3, ry = S.bry * 1.2 + b * 0.45
      const cx = X - 0.5 * s - (S.brx - 6) * 0.2, cy = G + 1 - ry
      ell(BODY, cx, cy, rx, ry)
      head(cx + rx - S.hrx * 0.75, G + 1 - S.hry * 1.05, { eyes: 'closed', mouth: 'none', earScale: 0.85, tilt: -8, ruff: false })
      tail(cx - rx * 0.75, G + 0.5 - S.tr * 0.5, 0, -2.5, { len: 1.0, sep: true })
      break
    }

    case 'sleepBelly': {
      const rx = S.brx * 1.05, ry = S.bry * 0.95
      const cx = X - 2.5 * s - (S.brx - 6) * 0.3, cy = G + 1 - ry
      tail(cx - rx + 1, cy + ry * 0.3, 190, 10)
      const top = cy - ry
      limb(LEGF, [[cx + rx * 0.45 + 1.4 * s, top + 1.5, S.lw], [cx + rx * 0.55 + 1.6 * s, top - 1.6 * s, S.lw], [cx + rx * 0.55 + 2.8 * s, top - 1.4 * s, S.lw]])
      limb(LEGF, [[cx - rx * 0.45 - 1.2 * s, top + 1.5, S.lw], [cx - rx * 0.5 - 1.6 * s, top - 1.8 * s, S.lw]])
      ell(BODY, cx, cy, rx, ry, 0, true)
      limb(LEGN, [[cx + rx * 0.45, top + 1.2, S.lw], [cx + rx * 0.5, top - 2.4 * s, S.lw], [cx + rx * 0.5 + 1.3 * s, top - 2.4 * s, S.lw]], true)
      limb(LEGN, [[cx - rx * 0.4, top + 1.2, S.lw], [cx - rx * 0.45, top - 2.6 * s, S.lw], [cx - rx * 0.45 - 1 * s, top - 3 * s, S.lw]], true)
      head(cx + rx + S.hrx * 0.4, G + 1 - S.hry, { eyes: 'closed', mouth: 'smile', tilt: 12, ruff: false })
      break
    }

    case 'pounce0': {
      const bx = S.brx * 1.05, by = S.bry * 0.92
      const cx = X - 1.5 * s - (S.brx - 6) * 0.3
      const cy = G + 1 - by - S.leg * 0.35
      const frontX = cx + bx - 2.4 * s, backX = cx - bx + 2.6 * s
      tail(cx - bx + 1 * s, cy - by * 0.2, 178, 4, { len: 1 })
      leg(true, backX - off, cy, backX - off - 0.5 * s, G, false, [backX + 1.2 * s - off, G - 1.2 * s])
      leg(true, frontX + off, cy, frontX + off + 2.2 * s, G)
      ell(BODY, cx, cy, bx, by, 6)
      leg(false, backX, cy + 0.5, backX - 0.5 * s, G, true, [backX + 1.4 * s, G - 1.2 * s])
      leg(false, frontX, cy + 0.5, frontX + 2.5 * s, G, true)
      head(cx + bx + 0.3 * s, cy - by * 0.3 - S.hry * 0.45, { eyes: 'wide', mouth: 'none', tilt: 8, ruff: false })
      break
    }

    case 'pounce1': {
      const bx = S.brx * 1.15, by = S.bry * 0.85
      const cx = X - 1 * s - (S.brx - 6) * 0.3
      const cy = G + 1 - S.leg - by - 1.5 * s
      ell(BODY, cx, cy, bx, by, -18)
      const fsh = bodyPt(0.6, 0.35), hip = bodyPt(-0.6, 0.35), rear = bodyPt(-0.95, -0.1)
      main = null
      zi = 0
      part.fill(0); zb.fill(0)
      tail(rear[0], rear[1], 168, 2)
      leg(true, hip[0] - off, hip[1], hip[0] - 4.2 * s, G)
      leg(true, fsh[0] + off * 0.5, fsh[1], fsh[0] + 4.2 * s, fsh[1] - 1.5 * s)
      ell(BODY, cx, cy, bx, by, -18)
      leg(false, hip[0], hip[1], hip[0] - 3.6 * s, G - 0.3)
      leg(false, fsh[0], fsh[1], fsh[0] + 4 * s, fsh[1] - 2.8 * s, true)
      const hp = bodyPt(1.0, -0.35)
      head(hp[0] + 0.3 * s, hp[1] - S.hry * 0.25, { eyes: 'wide', mouth: 'none', tilt: -10, ruff: false })
      break
    }

    case 'scratch0':
    case 'scratch1': {
      const k = pose === 'scratch1' ? 1 : 0
      const rx = S.brx * 0.95, ry = S.bry * 0.95
      const cx = X - 1.2 * s, cy = G + 1 - S.leg * 0.5 - rx * 0.88
      ell(BODY, cx, cy, rx, ry, -64)
      const sh = bodyPt(0.72, 0.3), rear = bodyPt(-0.8, -0.2), hp = bodyPt(1.0, -0.15)
      main = null
      zi = 0
      part.fill(0); zb.fill(0)
      tail(rear[0] - 0.5, G - 0.5, 180, 11, { len: 0.9 })
      const hx = hp[0] - 0.9 * s, hy = hp[1] - S.hry * 0.4
      const pawX = Math.min(W - 2.5, hx + S.hrx + 1.2 * s)
      leg(true, X - 1.5 * s + off, G - 2 * s, X - 0.5 * s + off, G)
      leg(true, sh[0] + 0.5, sh[1] + 0.5, pawX + 0.5, hy - S.hry * 0.3 + (k ? -1.5 : 1) * s)
      ell(BODY, cx, cy, rx, ry, -64)
      ell(BODY, X - 3 * s, G + 1 - S.bry * 0.85, S.brx * 0.5, S.bry * 0.85, 0, false, true)
      limb(LEGN, [[X - 2.6 * s, G + 0.2, S.lw], [X + 0.6 * s, G + 0.2, S.lw]], false, true)
      head(hx, hy, { eyes: k ? 'closed' : 'open', mouth: k ? 'open' : 'smile', tilt: -6, ruff: false })
      leg(false, sh[0], sh[1], pawX, hy - S.hry * 0.3 + (k ? 1 : -1.5) * s, true)
      break
    }

    case 'hiss': {
      const bx = S.brx * 0.95, by = S.bry
      const cx = X - 1.5 * s - (S.brx - 6) * 0.3
      const cy = G + 1 - S.leg * 1.25 - by
      const frontX = cx + bx - 2.2 * s, backX = cx - bx + 2.4 * s, hip = cy + by * 0.2
      tail(cx - bx + 1.2 * s, cy - by * 0.5, 255, 5, { puff: true })
      leg(true, frontX + off, hip, frontX + off + 0.6 * s, G)
      leg(true, backX - off, hip, backX - off - 0.6 * s, G)
      leg(false, frontX, hip, frontX + 0.4 * s, G)
      leg(false, backX, hip, backX - 0.4 * s, G)
      ell(BODY, cx, cy, bx, by)
      ell(BODY, cx - 0.6 * s, cy - by * 0.6, bx * 0.62, by * 0.9)
      head(cx + bx + 0.4 * s, cy - S.hry * 0.25, { eyes: 'wide', mouth: 'hiss', tilt: -55, earScale: 0.8, ruff: false })
      break
    }

    case 'stretch': {
      const rx = S.brx * 1.12, ry = S.bry * 0.85
      const cx = X - 2 * s - (S.brx - 6) * 0.3
      const cy = G + 1 - S.leg * 0.95 - ry * 0.6
      ell(BODY, cx, cy, rx, ry, 18)
      const chest = bodyPt(0.75, 0.45), butt = bodyPt(-0.95, -0.4), hip = bodyPt(-0.55, 0.2)
      main = null
      zi = 0
      part.fill(0); zb.fill(0)
      tail(butt[0] + 0.5, butt[1] + 0.5, 245, 6)
      leg(true, hip[0] - off, hip[1], hip[0] - off, G)
      leg(true, chest[0], chest[1], chest[0] + 5 * s + off * 0.5, G, false, [chest[0] + 1.5 * s, G - 0.2])
      ell(BODY, cx, cy, rx, ry, 18)
      leg(false, hip[0], hip[1], hip[0] + 0.3 * s, G)
      leg(false, chest[0] - 0.5, chest[1], chest[0] + 4.8 * s, G, true, [chest[0] + 1.2 * s, G - 0.2])
      head(chest[0] + 1.6 * s, G + 1 - S.hry * 1.15, { eyes: 'closed', mouth: 'open', ruff: false })
      break
    }

    case 'jump': {
      const rx = S.brx * 1.05, ry = S.bry * 0.9
      const cx = X - 0.8 * s - (S.brx - 6) * 0.3
      const cy = G + 1 - S.leg - ry - 3.2 * s
      ell(BODY, cx, cy, rx, ry, -32)
      const fsh = bodyPt(0.65, 0.45), hip = bodyPt(-0.6, 0.45), rear = bodyPt(-0.98, 0)
      main = null
      zi = 0
      part.fill(0); zb.fill(0)
      tail(rear[0], rear[1], 140, 4)
      leg(true, hip[0] - off * 0.5, hip[1], hip[0] - 2.6 * s, hip[1] + 4.2 * s)
      leg(true, fsh[0] + off * 0.5, fsh[1], fsh[0] + 3.6 * s, fsh[1] - 1.2 * s)
      ell(BODY, cx, cy, rx, ry, -32)
      leg(false, hip[0], hip[1], hip[0] - 1.8 * s, hip[1] + 4.6 * s)
      leg(false, fsh[0], fsh[1], fsh[0] + 3.2 * s, fsh[1] - 2.4 * s, true)
      const hp = bodyPt(1.0, -0.4)
      head(hp[0] + 0.4 * s, hp[1] - S.hry * 0.35, { eyes: 'wide', mouth: 'smile', ruff: false })
      break
    }
  }
}

// ---------------------------------------------------------------- fluff (long / curly / puffed fur)

const snap = new Uint8Array(N)
function fluff(prob: number, topOnly: boolean, vMax: number) {
  snap.set(part)
  for (let y = 1; y < G; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x
      if (snap[i]) continue
      const cands = topOnly ? [i + W] : [i + W, i - 1, i + 1]
      for (let d = 0; d < cands.length; d++) {
        const n = cands[d]
        const p = snap[n]
        if (p !== BODY && p !== TAIL && !(p === HEAD && d > 0 && V[n] > 0.1)) continue
        if (p === BODY && V[n] > vMax) continue
        if (hash3(Math.round(LX[n] * 1.3) + d * 31, Math.round(LY[n]), seed + p * 7) < prob) {
          part[i] = p; zb[i] = zb[n]; U[i] = U[n]; V[i] = V[n]; LX[i] = LX[n]; LY[i] = LY[n]
          break
        }
      }
    }
  }
}

// ---------------------------------------------------------------- patterns

const STR1 = 1 << 5, STR2 = 2 << 5

function stamp(rows: string[], ax: number, ay: number, x: number, y: number): boolean {
  const ry = y - ay, rx = x - ax
  if (ry < 0 || ry >= rows.length || rx < 0 || rx >= rows[0].length) return false
  return rows[ry][rx] === 'X'
}
function stampAt(rows: string[], p: [number, number], x: number, y: number): boolean {
  return stamp(rows, Math.round(p[0] - rows[0].length / 2), Math.round(p[1] - rows.length / 2), x, y)
}
const HEART = ['.X.X.', 'XXXXX', '.XXX.', '..X..']
const HEART_S = ['X.X', 'XXX', '.X.']
const CLOUD = ['..XX..', '.XXXXX', 'XXXXXX']
const CLOUD_S = ['.X.', 'XXX']
const STAR = ['.X.', 'XXX', 'X.X']
const MOON = ['.XX', 'X..', '.XX']
const BOLT = ['..X', '.X.', 'XXX', '.X.', 'X..']

function stripeCode(): number { return A.secondary ? fS : fB | STR1 }
function mackCode(): number { return A.secondary ? fS | STR1 : fB | STR2 }

function inChest(x: number, y: number): boolean {
  const c = bodyPt(0.8, 0.15)
  const dx = (x + 0.5 - c[0]) / (2.1 * S.s), dy = (y + 0.5 - c[1]) / (2.8 * S.s)
  return dx * dx + dy * dy <= 1
}

function patCode(i: number, x: number, y: number): number {
  const p = part[i]
  const pat = A.pattern
  const u = U[i], v = V[i], lx = LX[i], ly = LY[i]
  const h = HI
  if (p === BODY) {
    switch (pat) {
      case 'tabby': {
        const sx = lx - ly * 0.35
        return v < 0.4 && mod(sx, 4) < 1.6 ? stripeCode() : fB
      }
      case 'mackerel': {
        const sx = lx - ly * 0.3
        return v < 0.62 && mod(sx, 3) < 1 ? mackCode() : fB
      }
      case 'bicolor': return v > 0.3 || inChest(x, y) ? fW : fB
      case 'tuxedo': return v > 0.55 || inChest(x, y) ? fW : fB
      case 'van': case 'panda': return fW
      case 'calico': {
        if (v > 0.38 || inChest(x, y)) return fW
        const n = noise(lx / 3.4 + 11, ly / 3 + 3, seed)
        return n > 0.56 ? fC1 : n < 0.34 ? fC2 : fW
      }
      case 'tortie': {
        const n = noise(lx / 2.4 + 5, ly / 2.2 + 9, seed)
        return n < 0.44 ? fS : fB
      }
      case 'spots': {
        const ix = Math.floor(lx + 40), iy = Math.floor(ly + 40)
        const cx = Math.floor(ix / 3), cy = Math.floor(iy / 3)
        const ox = Math.floor(hash3(cx, cy, seed) * 3), oy = Math.floor(hash3(cx, cy, seed + 1) * 3)
        return v < 0.5 && ix - cx * 3 === ox && iy - cy * 3 === oy ? (A.secondary ? fS : fB | STR2) : fB
      }
      case 'pointed': return fP
      case 'heart':
        return stampAt(S.s < 0.8 ? HEART_S : HEART, bodyPt(-0.15, -0.4), x, y) ? fLightMark : fB
      case 'cloud': {
        if (stampAt(S.s < 0.8 ? CLOUD_S : CLOUD, bodyPt(-0.35, -0.3), x, y)) return fW
        if (S.s >= 0.8 && stampAt(CLOUD_S, bodyPt(0.45, 0.15), x, y)) return fW
        return fB
      }
      case 'scarf': {
        if (!h) return fB
        const dx = x + 0.5 - (h.hx - 0.1 * h.hrx), dy = y + 0.5 - (h.hy + h.hry * 0.85)
        return dx * dx + dy * dy <= (h.hrx * 0.82) * (h.hrx * 0.82) ? fW : fB
      }
      case 'chest': return inChest(x, y) ? fW : fB
      default: return fB
    }
  }
  if (p === HEAD && h) {
    const dxF = x - h.fx, dyF = y - h.hyR
    const muzzle = dyF >= 1 && dyF <= 3 && Math.abs(dxF) <= 2 && !(Math.abs(dxF) === 2 && dyF === 3)
    const blaze = dxF === 0 && dyF >= -3 && dyF <= 0
    const chin = v > 0.72
    switch (pat) {
      case 'tabby':
      case 'mackerel': {
        const st = pat === 'tabby' ? stripeCode() : mackCode()
        if (dyF <= -2 && (dxF === -1 || dxF === 1 || dxF === -3)) return st
        if (dyF === 1 && (dxF === -4 || dxF === -5)) return st
        return fB
      }
      case 'bicolor': return muzzle || chin || (blaze && dyF >= -2) ? fW : fB
      case 'tuxedo': return muzzle || chin || blaze ? fW : fB
      case 'van': return dyF <= -1 && dxF !== 0 && !muzzle ? fVan : fW
      case 'calico':
        if (muzzle || chin || blaze || dyF > 0) return fW
        return dxF < 0 ? fC1 : fC2
      case 'tortie': {
        if (blaze && dyF > -3) return dxF === 0 ? fB : fS
        const n = noise(lx / 2.2 + 21, ly / 2.2 + 1, seed)
        return n < 0.42 ? fS : fB
      }
      case 'spots': return dyF === -3 && (dxF === -2 || dxF === 1) ? (A.secondary ? fS : fB | STR2) : fB
      case 'pointed': {
        const ex = (x + 0.5 - (h.fx + 0.5)) / 2.9, ey = (y + 0.5 - (h.hyR + 0.8)) / 2.7
        return ex * ex + ey * ey <= 1 ? fPt : fP
      }
      case 'mask': return dyF >= -2 && dyF <= 0 && u > -0.55 ? fDarkMark : fB
      case 'star': return stamp(STAR, h.fx - 1, h.hyR - 4, x, y) ? fLightMark : fB
      case 'moon': return stamp(MOON, h.fx - 1, h.hyR - 4, x, y) ? fLightMark : fB
      case 'lightning': return stamp(BOLT, h.fx - 1, h.hyR - 5, x, y) ? fBolt : fB
      case 'halfFace': return dxF >= 1 ? fDarkMark : fB
      case 'eyepatch': {
        const dx = x + 0.5 - (h.fx + 2), dy = y + 0.5 - h.hyR
        return dx * dx + dy * dy <= 5.3 ? fDarkMark : fB
      }
      case 'mustache': {
        if (dyF === 2 && dxF >= -2 && dxF <= 2 && dxF !== 0) return fDarkMark
        if (dyF === 1 && (dxF === -3 || dxF === 3)) return fDarkMark
        return fB
      }
      case 'panda': {
        for (const ecx of [h.fx - 1, h.fx + 2]) {
          const dx = (x + 0.5 - ecx) / 1.9, dy = (y + 0.5 - h.hyR) / 1.75
          if (dx * dx + dy * dy <= 1) return fidx(A.secondary ?? 'black')
        }
        return fW
      }
      case 'scarf': return chin ? fW : fB
      case 'chest': return dyF >= 2 && Math.abs(dxF) <= 1 ? fW : fB
      default: return fB
    }
  }
  if (p === EARF || p === EARN) {
    switch (pat) {
      case 'van': return fVan
      case 'tuxedo': return fB
      case 'pointed': return fPt
      case 'panda': return fidx(A.secondary ?? 'black')
      case 'calico': return p === EARF ? fC1 : fC2
      case 'halfFace': return p === EARN ? fDarkMark : fB
      case 'tortie': return p === EARF ? fS : fB
      default: return fB
    }
  }
  if (p === TAIL) {
    const ring = lx > 1 && mod(Math.floor(lx / 2), 2) === 1
    switch (pat) {
      case 'tabby': if (ring || u > 0.86) return stripeCode(); break
      case 'mackerel': if (lx > 1 && mod(Math.floor(lx / 1.5), 2) === 1) return mackCode(); break
      case 'calico': return noise(lx / 3 + 4, 2, seed) > 0.5 ? fC1 : fC2
      case 'tortie': return noise(lx / 2.4 + 2, ly / 2 + 7, seed) < 0.44 ? fS : fB
      case 'pointed': return u > 0.22 ? fPt : fP
      case 'panda': return fW
      case 'ringtail': if (ring || u > 0.88) return fDarkMark; break
      case 'van': return lx > 1 && mod(Math.floor(lx / 2), 2) === 1 ? fVan | STR1 : fVan
      default: break
    }
    if (A.tail === 'ringed' && ring) return A.secondary ? fS : fB | STR2
    return fB
  }
  if (p === LEGF || p === LEGN) {
    const t = u
    switch (pat) {
      case 'bicolor': return t > 0.55 ? fW : fB
      case 'tuxedo': return t > 0.68 ? fW : fB
      case 'socks': return t > 0.62 ? fW : fB
      case 'van': case 'calico': return fW
      case 'panda': return fidx(A.secondary ?? 'black')
      case 'pointed': return t > 0.45 ? fPt : fP
      case 'tabby': case 'mackerel':
        return t < 0.62 && t > 0.1 && mod(Math.floor(lx), 2) === 1 ? (pat === 'tabby' ? stripeCode() : mackCode()) : fB
      case 'tortie': return noise(lx / 2 + 13, ly + 3, seed) < 0.42 ? fS : fB
      default: return fB
    }
  }
  return fB
}

// ---------------------------------------------------------------- render

function render(pose: CatPose) {
  reset()
  buildPose(pose)
  if (A.fur === 'long') fluff(0.42, false, 0.2)
  else if (A.fur === 'curly') fluff(0.28, false, 0.1)
  if (pose === 'hiss') fluff(0.6, true, -0.2)

  // colour + tone
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      const p = part[i]
      if (!p) continue
      const code = patCode(i, x, y)
      const fi = code & 31, flag = code >> 5
      furOf[i] = fi
      let t = T_BASE
      if (flag === 1) t = T_STRIPE
      else if (flag === 2) t = T_STRIPE2
      else {
        const up = y > 0 ? part[i - W] : 0
        const dn = y < H - 1 ? part[i + W] : 0
        if (p === LEGF || p === EARF) t = T_SHADOW
        else if (p === BODY || p === HEAD || p === TAIL) {
          if (dn === 0 || ((dn === LEGF || dn === LEGN) && p === BODY)) t = T_SHADOW
          else if (up === 0) t = T_LIGHT
        }
        if (A.fur === 'curly' && t === T_BASE && (p === BODY || p === TAIL)) {
          const ix = Math.floor(LX[i] + 40), iy = Math.floor(LY[i] + 40)
          if ((iy & 1) === 0 && mod(ix + ((iy >> 1) & 1) * 2, 4) === 0) t = T_SHADOW
          else if ((iy & 1) === 0 && mod(ix + ((iy >> 1) & 1) * 2, 4) === 1) t = T_LIGHT
        }
        if (A.fur === 'long' && t === T_BASE && p === BODY && V[i] > 0.35) {
          const ix = Math.floor(LX[i] + 40)
          if (mod(ix, 3) === 0) t = T_SHADOW
        }
      }
      // occlusion line under "separated" shapes
      const z = zb[i]
      const nb = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1]
      for (const q of nb) {
        if (q >= 0 && part[q] && zb[q] > z && sepF[zb[q]] && !(part[q] === part[i] && part[i] !== BODY)) { t = T_LINE; break }
      }
      tone[i] = t
      col[i] = PAL[fi][t]
    }
  }

  // ear interiors
  if (HI) {
    for (let i = 0; i < N; i++) {
      const p = part[i]
      if (p !== EARN && p !== EARF) continue
      const x = i % W
      if (x === 0 || x === W - 1 || i < W) continue
      if (part[i - 1] === p && part[i + 1] === p && part[i - W] === p) {
        col[i] = mix(PAL[furOf[i]][p === EARN ? T_BASE : T_SHADOW], PINK, p === EARN ? 0.55 : 0.35)
      }
    }
  }

  // outline
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x
      if (part[i]) continue
      let n = -1
      if (y < H - 1 && part[i + W]) n = i + W
      else if (x > 0 && part[i - 1]) n = i - 1
      else if (x < W - 1 && part[i + 1]) n = i + 1
      else if (y > 0 && part[i - W]) n = i - W
      if (n >= 0) col[i] = PAL[furOf[n]][T_OUT]
    }
  }

  if (HI) face(HI)
}

function setPx(x: number, y: number, c: string) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  col[y * W + x] = c
}
function headPx(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < W && y < H && part[y * W + x] === HEAD
}
function darkAt(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= W || y >= H) return false
  return FUR_LUM[furOf[y * W + x]] < 0.42
}
function shade(x: number, y: number, c: string, t: number): string {
  const cur = x >= 0 && y >= 0 && x < W && y < H ? col[y * W + x] : null
  return mix(cur ?? c, c, t)
}

function face(h: HeadInfo) {
  const { fx, ey, hyR } = h
  const closedCol = (x: number, y: number) => (darkAt(x, y) ? shade(x, y, '#ffffff', 0.35) : shade(x, y, INK, 0.7))
  const eye = (ex: number, c: string, scar: boolean) => {
    if (h.eyes === 'closed' || scar) {
      setPx(ex, ey + 1, closedCol(ex, ey + 1))
      setPx(ex + 1, ey + 1, closedCol(ex + 1, ey + 1))
      if (scar) {
        setPx(ex + 1, ey - 1, shade(ex + 1, ey - 1, '#a0646a', 0.6))
        setPx(ex, ey + 2, shade(ex, ey + 2, '#a0646a', 0.5))
      }
      return
    }
    if (h.eyes === 'wide') {
      setPx(ex, ey, GLINT); setPx(ex + 1, ey, c)
      setPx(ex, ey + 1, c); setPx(ex + 1, ey + 1, PUPIL)
      return
    }
    setPx(ex, ey, PUPIL); setPx(ex + 1, ey, GLINT)
    setPx(ex, ey + 1, PUPIL); setPx(ex + 1, ey + 1, c)
  }
  const c1 = EYE_HEX[A.eyes] ?? EYE_HEX.yellow
  const c2 = A.eyes2 ? EYE_HEX[A.eyes2] ?? c1 : c1
  eye(fx - 2, c1, !!A.oneEye)
  eye(fx + 1, c2, false)

  // blush
  if (h.eyes !== 'wide') {
    for (const bx of [fx - 2, fx + 2]) if (headPx(bx, hyR + 1)) setPx(bx, hyR + 1, shade(bx, hyR + 1, '#f2989a', 0.32))
  }
  // nose
  const baseLight = !isDarkFur(A.base)
  const nose = A.nose ? NOSE_HEX[A.nose] : baseLight ? NOSE_HEX.pink : '#5a4048'
  setPx(fx, hyR + 1, nose)
  // mouth
  const my = hyR + 2
  const mline = (x: number, y: number) => shade(x, y, darkAt(x, y) ? '#7a6870' : INK, 0.45)
  switch (h.mouth) {
    case 'smile':
      if (A.pattern !== 'mustache') {
        if (headPx(fx - 1, my)) setPx(fx - 1, my, mline(fx - 1, my))
        if (headPx(fx + 1, my)) setPx(fx + 1, my, mline(fx + 1, my))
      }
      break
    case 'open':
      setPx(fx, my, '#6a3038')
      if (headPx(fx, my + 1)) setPx(fx, my + 1, '#e3828c')
      if (headPx(fx - 1, my)) setPx(fx - 1, my, mline(fx - 1, my))
      if (headPx(fx + 1, my)) setPx(fx + 1, my, mline(fx + 1, my))
      break
    case 'hiss':
      setPx(fx - 1, my, '#fbf6ee'); setPx(fx, my, '#5a2a32'); setPx(fx + 1, my, '#fbf6ee')
      if (headPx(fx, my + 1)) setPx(fx, my + 1, '#d9707c')
      break
    case 'tongue':
      setPx(fx + 1, my, '#e3828c')
      break
    default: break
  }
  // whiskers
  if (A.whiskers) {
    for (const [wy, len] of [[hyR + 1, 2], [hyR + 2, 1]] as const) {
      let rx = -1
      for (let x = W - 1; x >= 0; x--) if (headPx(x, wy)) { rx = x; break }
      if (rx < 0) continue
      for (let k = 1; k <= len; k++) {
        const x = rx + k
        if (x < W && !part[wy * W + x]) setPx(x, wy, '#ece6dc')
      }
    }
  }
}

function flush(ctx: CanvasRenderingContext2D) {
  for (let y = 0; y < H; y++) {
    let x = 0
    while (x < W) {
      const c = col[y * W + x]
      if (!c) { x++; continue }
      let x2 = x + 1
      while (x2 < W && col[y * W + x2] === c) x2++
      ctx.fillStyle = c
      ctx.fillRect(x, y, x2 - x, 1)
      x = x2
    }
  }
}

/** Draw a single frame into ctx at (0,0). Canvas is CAT_W x CAT_H. The cat faces RIGHT. */
export function drawCat(ctx: CanvasRenderingContext2D, a: CatAppearance, pose: CatPose): void {
  setup(a)
  render(pose)
  flush(ctx)
}

const headTopCache = new Map<string, number>()
/** Return pixel row of the cat's head top (incl. ears/outline) in the standing pose. */
export function headTop(a: CatAppearance): number {
  const key = a.body + '|' + a.ears + '|' + a.fur
  const hit = headTopCache.get(key)
  if (hit !== undefined) return hit
  setup(a)
  render('stand')
  let top = H
  for (let i = 0; i < N; i++) if (col[i]) { top = Math.floor(i / W); break }
  headTopCache.set(key, top)
  return top
}
