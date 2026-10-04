import { Application, Container, Graphics, Rectangle, Sprite, Text, Texture, TextureSource } from 'pixi.js'
import type { Game } from '../core/Game'
import type { Cat } from '../cats/Cat'
import type { PlacedBuilding } from '../types'
import { BUILDING_MAP } from '@/data/buildings'
import { GRID_H, GRID_W, OX, OY, TILE, VIEW_H, VIEW_W } from '../constants'
import { drawBuilding, artFrames, HEADROOM } from './buildingArt'
import { drawCat, CAT_H, CAT_W, headTop, type CatPose } from './catArt'
import { drawBackground, drawSky, drawSnowCover, mix } from './scenery'
import { bAnchor, canPlace, def, isFloorLayer, pxToTile, tileToPx, yardRect } from '../world/yard'
import { isRainy } from '../world/weather'
import { hash } from '../core/rng'
import type { Fx } from '../events/events'

TextureSource.defaultOptions.scaleMode = 'nearest'

export interface BuildState {
  active: boolean
  placing: string | null // 正在放置的设施 id
  flip: boolean
  skin: number
  selected: number | null // 选中的设施 uid
  dragging: number | null
  hover: { x: number; y: number } | null
}

interface FxInst extends Fx {
  t: number
  g: Graphics
  seed: number
}

/** 竖屏布局：画布上方顶栏高度、下方保留给底栏与动态区的高度（CSS 像素） */
export const PORTRAIT_TOP = 52
export const PORTRAIT_BOTTOM = 190

let safeProbe: HTMLDivElement | null = null
/** 读取刘海屏安全区（CSS env 变量需借助元素才能得到像素值） */
function safeArea() {
  if (!safeProbe) {
    safeProbe = document.createElement('div')
    safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)'
    document.body.appendChild(safeProbe)
  }
  const cs = getComputedStyle(safeProbe)
  return { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 }
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** 像素风渲染器 */
export class Renderer {
  app = new Application()
  scale = 1
  dpr = 1
  /** 镜头放大倍数（1 或 2），放大时聚焦小院 */
  zoom = 1
  camX = 0
  camY = 0
  /** 竖屏模式：画布宽度等于屏幕宽度，可左右拖动 */
  portrait = false
  private camDirty = true
  private pan: { active: boolean; camX: number; camY: number } = { active: false, camX: 0, camY: 0 }
  world = new Container()
  skySprite!: Sprite
  skyCanvas = canvas(VIEW_W, 60)
  skyTex!: Texture
  bgSprite!: Sprite
  snowSprite!: Sprite
  groundFx = new Container() // 阳光斑、水坑、脚印
  floorLayer = new Container()
  objLayer = new Container()
  fxLayer = new Container()
  weatherLayer = new Container()
  nightOverlay = new Graphics()
  lightLayer = new Container()
  flash = new Graphics()
  buildLayer = new Graphics()
  ghost = new Sprite()
  ui = new Container() // 屏幕坐标（未缩放）
  private texCache = new Map<string, Texture>()
  private bSprites = new Map<number, Sprite>()
  private cSprites = new Map<number, { s: Sprite; shadow: Graphics }>()
  private giftSprites: Sprite[] = []
  private trashSprites: Sprite[] = []
  private bubbles = new Map<number, { c: Container; bg: Graphics; t: Text; text: string }>()
  private emotes = new Map<number, Text>()
  private nameTag!: Text
  private rain: Graphics = new Graphics()
  private drops: { x: number; y: number; v: number; l: number }[] = []
  private flakes: { x: number; y: number; v: number; s: number }[] = []
  private fog = new Graphics()
  private fxs: FxInst[] = []
  private sunG = new Graphics()
  private flyG = new Graphics()
  private lightG = new Graphics()
  private time = 0
  private skyT = 0
  private bgKey = ''
  private snowAlpha = 0
  private hoverCat: Cat | null = null
  private pointer = { x: 0, y: 0, down: false, moved: false, sx: 0, sy: 0 }
  private meeting = false
  build: BuildState = { active: false, placing: null, flip: false, skin: 0, selected: null, dragging: null, hover: null }
  onCatClick?: (c: Cat) => void
  onBuildingClick?: (b: PlacedBuilding, sx: number, sy: number) => void
  onBuildSelect?: (b: PlacedBuilding | null) => void
  onPlaced?: (ok: boolean) => void
  onEmptyClick?: () => void

  constructor(private g: Game) {}

  async init(parent: HTMLElement) {
    await this.app.init({ background: '#1b1a24', antialias: false, resolution: 1, autoDensity: false, width: VIEW_W, height: VIEW_H })
    parent.appendChild(this.app.canvas)
    this.app.canvas.style.imageRendering = 'pixelated'
    this.app.stage.addChild(this.world, this.ui)
    this.skyTex = Texture.from(this.skyCanvas)
    this.skySprite = new Sprite(this.skyTex)
    this.bgSprite = new Sprite()
    this.snowSprite = new Sprite()
    this.snowSprite.alpha = 0
    this.objLayer.sortableChildren = true
    this.floorLayer.sortableChildren = true
    this.lightLayer.blendMode = 'add'
    this.world.addChild(
      this.skySprite, this.bgSprite, this.snowSprite, this.floorLayer, this.groundFx, this.sunG, this.objLayer,
      this.flyG, this.fxLayer, this.buildLayer, this.ghost, this.weatherLayer, this.nightOverlay, this.lightLayer, this.flash,
    )
    this.sunG.blendMode = 'add'
    this.lightLayer.addChild(this.lightG)
    this.weatherLayer.addChild(this.rain, this.fog)
    this.ghost.anchor.set(0.5, 1)
    this.ghost.alpha = 0.7
    this.ghost.visible = false
    this.nameTag = new Text({ text: '', style: { fontFamily: 'Zpix, "PingFang SC", "Microsoft YaHei", sans-serif', fontSize: 12, fill: '#fff8e8', stroke: { color: '#2a2230', width: 3 } } })
    this.nameTag.anchor.set(0.5, 1)
    this.nameTag.visible = false
    this.ui.addChild(this.nameTag)
    for (let i = 0; i < 160; i++) this.drops.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, v: 200 + Math.random() * 120, l: 3 + Math.random() * 4 })
    for (let i = 0; i < 120; i++) this.flakes.push({ x: Math.random() * VIEW_W, y: Math.random() * VIEW_H, v: 12 + Math.random() * 20, s: Math.random() < 0.3 ? 2 : 1 })

    this.resize()
    window.addEventListener('resize', () => this.resize())
    this.bindInput()
    this.g.bus.on('fx', (f: Fx) => this.addFx(f))
    this.g.bus.on('meeting', (v: boolean) => (this.meeting = v))
    this.app.ticker.add((tk) => this.frame(tk.deltaMS / 1000))
  }

  resize() {
    const parent = this.app.canvas.parentElement
    if (!parent) return
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    this.dpr = dpr
    const cssW = parent.clientWidth
    const cssH = parent.clientHeight
    const W = cssW * dpr
    const H = cssH * dpr
    const pref = this.g.s.settings.pixelScale
    this.portrait = cssH > cssW * 1.1
    const { top: sat, bottom: sab } = safeArea()
    let s: number
    let cw: number
    let ch: number
    if (this.portrait) {
      // 竖屏：高度留出顶栏、底栏与动态区，宽度至少能看到 200 逻辑像素
      const availH = Math.max(160, cssH - PORTRAIT_TOP - PORTRAIT_BOTTOM - sat - sab) * dpr
      s = Math.min(availH / VIEW_H, W / 200)
      if (s >= 1 && pref !== 'fill') s = Math.floor(s)
      if (typeof pref === 'number' && pref > 0) s = Math.min(s, pref * dpr)
      s = Math.max(0.5, s)
      cw = Math.round(Math.min(W, VIEW_W * s))
      ch = Math.round(VIEW_H * s)
    } else {
      s = Math.min(W / VIEW_W, H / VIEW_H)
      if (s >= 1 && pref !== 'fill') s = Math.floor(s)
      if (typeof pref === 'number' && pref > 0) s = Math.min(s, pref * dpr)
      s = Math.max(0.5, s)
      cw = Math.round(VIEW_W * s)
      ch = Math.round(VIEW_H * s)
    }
    this.scale = s
    this.app.renderer.resize(cw, ch)
    this.app.canvas.style.width = cw / dpr + 'px'
    this.app.canvas.style.height = ch / dpr + 'px'
    document.documentElement.style.setProperty('--canvas-bottom', Math.round((this.portrait ? PORTRAIT_TOP + sat : (cssH - ch / dpr) / 2) + ch / dpr) + 'px')
    document.documentElement.classList.toggle('portrait', this.portrait)
    this.camDirty = true
    this.applyCamera()
    for (const b of this.bubbles.values()) b.text = ''
  }

  setZoom(z: number) {
    this.zoom = z
    this.camDirty = true
    this.applyCamera()
    for (const b of this.bubbles.values()) b.text = ''
  }

  /** 可见区域（逻辑像素） */
  get visW() {
    return this.app.renderer.width / (this.scale * this.zoom)
  }
  get visH() {
    return this.app.renderer.height / (this.scale * this.zoom)
  }
  get canPan() {
    return this.visW < VIEW_W - 0.5 || this.visH < VIEW_H - 0.5
  }

  private camTween: { x: number; y: number } | null = null

  private clampCam(x: number, y: number) {
    const vw = Math.min(VIEW_W, this.visW)
    const vh = Math.min(VIEW_H, this.visH)
    return { x: Math.max(0, Math.min(VIEW_W - vw, x)), y: Math.max(0, Math.min(VIEW_H - vh, y)) }
  }

  /** 镜头平滑移动到目标位置；返回是否需要移动 */
  private glideTo(x: number, y: number) {
    const t = this.clampCam(x, y)
    if (Math.abs(t.x - this.camX) < 1.5 && Math.abs(t.y - this.camY) < 1.5) {
      this.camTween = null
      return false
    }
    this.camTween = t
    return true
  }

  /** 镜头移到某个世界坐标 */
  focus(x: number, y: number) {
    return this.glideTo(x - Math.min(VIEW_W, this.visW) / 2, y - Math.min(VIEW_H, this.visH) * 0.6)
  }

  /** 重新对准小院中央；返回 false 表示已经在中央 */
  recenter() {
    const yr = yardRect(this.g.s.yardLevel)
    const vw = Math.min(VIEW_W, this.visW)
    const vh = Math.min(VIEW_H, this.visH)
    return this.glideTo(OX + (yr.x + yr.w / 2) * TILE - vw / 2, VIEW_H - vh)
  }

  private updateCamTween(dt: number) {
    const t = this.camTween
    if (!t) return
    const k = Math.min(1, dt * 10)
    this.camX += (t.x - this.camX) * k
    this.camY += (t.y - this.camY) * k
    if (Math.abs(t.x - this.camX) < 0.5 && Math.abs(t.y - this.camY) < 0.5) {
      this.camX = t.x
      this.camY = t.y
      this.camTween = null
    }
    this.applyCamera()
  }

  applyCamera() {
    const vw = Math.min(VIEW_W, this.visW)
    const vh = Math.min(VIEW_H, this.visH)
    if (this.camDirty) {
      this.camDirty = false
      const yr = yardRect(this.g.s.yardLevel)
      const cx = OX + (yr.x + yr.w / 2) * TILE
      this.camX = cx - vw / 2
      this.camY = VIEW_H - vh
    }
    this.camX = Math.max(0, Math.min(VIEW_W - vw, this.camX))
    this.camY = Math.max(0, Math.min(VIEW_H - vh, this.camY))
    const S = this.scale * this.zoom
    this.world.scale.set(S)
    // 对齐到整数逻辑像素，保持像素清晰
    this.world.x = -Math.round(this.camX) * S
    this.world.y = -Math.round(this.camY) * S
  }

  /** 世界坐标 → 屏幕（渲染像素） */
  toScreen(x: number, y: number) {
    const S = this.scale * this.zoom
    return { x: (x - Math.round(this.camX)) * S, y: (y - Math.round(this.camY)) * S }
  }

  // ================= 纹理 =================

  private catTex(c: Cat, pose: CatPose, crop: number) {
    const key = `c${c.id}|${pose}`
    let base = this.texCache.get(key)
    if (!base) {
      const cv = canvas(CAT_W, CAT_H)
      drawCat(cv.getContext('2d')!, c.appearance, pose)
      base = Texture.from(cv)
      this.texCache.set(key, base)
    }
    if (crop <= 0) return base
    const ck = key + '|' + crop
    let t = this.texCache.get(ck)
    if (!t) {
      t = new Texture({ source: base.source, frame: new Rectangle(0, 0, CAT_W, Math.max(1, CAT_H - crop)) })
      this.texCache.set(ck, t)
    }
    return t
  }

  private buildingTex(b: { defId: string; skin: number; food?: number; water?: number; dirt?: number }, frame = 0) {
    const d = BUILDING_MAP[b.defId]
    const [c1, c2] = d.skins?.[b.skin] ?? d.colors
    const season = this.g.clock.season
    const night = this.g.clock.isNight
    let fill = -1
    if (d.foodCap) fill = Math.ceil(((b.food ?? 0) / d.foodCap) * 4) / 4
    else if (d.waterCap) fill = Math.ceil(((b.water ?? 0) / d.waterCap) * 4) / 4
    const dirt = d.dirtCap ? Math.ceil(((b.dirt ?? 0) / d.dirtCap) * 3) / 3 : 0
    const key = `b${d.id}|${c1}|${c2}|${season}|${night ? 1 : 0}|${frame}|${fill}|${dirt}`
    let t = this.texCache.get(key)
    if (!t) {
      const cv = canvas(d.w * TILE, d.h * TILE + HEADROOM)
      try {
        drawBuilding(cv.getContext('2d')!, d.art, d.w, d.h, c1, c2, { season, frame, night, fill, dirt })
      } catch (e) {
        console.warn('draw building failed', d.art, e)
      }
      t = Texture.from(cv)
      this.texCache.set(key, t)
    }
    return t
  }

  private simpleTex(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    let t = this.texCache.get(key)
    if (!t) {
      const cv = canvas(w, h)
      draw(cv.getContext('2d')!)
      t = Texture.from(cv)
      this.texCache.set(key, t)
    }
    return t
  }

  private giftTex() {
    return this.simpleTex('gift', 11, 11, (c) => {
      const p = (x: number, y: number, w: number, h: number, col: string) => {
        c.fillStyle = col
        c.fillRect(x, y, w, h)
      }
      p(1, 4, 9, 7, '#6b3f2a')
      p(2, 5, 7, 5, '#d98a5f')
      p(2, 5, 7, 1, '#f0b58a')
      p(5, 4, 1, 7, '#f2d24a')
      p(1, 3, 9, 2, '#6b3f2a')
      p(2, 3, 7, 1, '#e8a070')
      p(3, 0, 2, 3, '#f2d24a')
      p(6, 0, 2, 3, '#f2d24a')
      p(5, 2, 1, 2, '#c9a030')
    })
  }

  private trashTex() {
    return this.simpleTex('trash', 9, 5, (c) => {
      c.fillStyle = '#e6e0d0'
      c.fillRect(1, 2, 6, 1)
      c.fillRect(0, 1, 1, 3)
      c.fillRect(7, 0, 2, 5)
      for (let i = 2; i < 7; i += 2) c.fillRect(i, 1, 1, 3)
      c.fillStyle = '#9a9488'
      c.fillRect(1, 3, 6, 1)
    })
  }

  clearBuildingCache() {
    for (const [k, t] of this.texCache) {
      if (k.startsWith('b')) {
        t.destroy(true)
        this.texCache.delete(k)
      }
    }
  }

  // ================= 每帧 =================

  frame(dt: number) {
    this.g.tick(dt)
    this.time += dt
    const g = this.g
    // 天空
    this.skyT -= dt
    if (this.skyT <= 0) {
      this.skyT = 0.25
      drawSky(this.skyCanvas.getContext('2d')!, g.clock.hourF, g.weather, this.time, { fullMoon: g.clock.fullMoon, day: g.clock.day })
      this.skyTex.source.update()
    }
    // 背景
    const yr = yardRect(g.s.yardLevel)
    const bgKey = `${g.clock.season}|${g.s.yardLevel}`
    if (bgKey !== this.bgKey) {
      this.bgKey = bgKey
      const cv = canvas(VIEW_W, VIEW_H)
      drawBackground(cv.getContext('2d')!, g.clock.season, yr)
      this.bgSprite.texture?.destroy(true)
      this.bgSprite.texture = Texture.from(cv)
      if (!this.snowSprite.texture || this.snowSprite.texture === Texture.EMPTY) {
        const sc = canvas(VIEW_W, VIEW_H)
        drawSnowCover(sc.getContext('2d')!)
        this.snowSprite.texture = Texture.from(sc)
      }
      this.clearBuildingCache()
    }
    // 积雪
    const snowTarget = g.weather === 'snow' ? 0.85 : g.clock.season === 'winter' ? Math.max(0, this.snowAlpha - dt * 0.002) : 0
    this.snowAlpha += (snowTarget - this.snowAlpha) * Math.min(1, dt * (g.weather === 'snow' ? 0.01 : 0.004))
    this.snowSprite.alpha = this.snowAlpha

    this.updateCamTween(dt)
    this.syncBuildings()
    this.syncCats(dt)
    this.syncGifts()
    this.drawSun()
    this.drawFlies()
    this.drawWeather(dt)
    this.drawNight()
    this.updateFx(dt)
    this.drawBuild()
    this.syncBubbles()
  }

  private syncBuildings() {
    const g = this.g
    const seen = new Set<number>()
    const frameIdx = Math.floor(this.time * 4)
    for (const b of g.s.buildings) {
      seen.add(b.uid)
      const d = def(b)
      let sp = this.bSprites.get(b.uid)
      if (!sp) {
        sp = new Sprite()
        sp.anchor.set(0.5, 1)
        this.bSprites.set(b.uid, sp)
      }
      const layer = isFloorLayer(d) ? this.floorLayer : d.walkable ? this.floorLayer : this.objLayer
      if (sp.parent !== layer) layer.addChild(sp)
      const frames = artFrames(d.art)
      sp.texture = this.buildingTex(b, frames > 1 ? frameIdx % frames : 0)
      const p = tileToPx(b.x, b.y)
      sp.x = p.x + (d.w * TILE) / 2
      sp.y = p.y + d.h * TILE
      sp.scale.x = b.flip ? -1 : 1
      sp.zIndex = isFloorLayer(d) ? 0 : sp.y
      const dragging = this.build.dragging === b.uid
      sp.alpha = dragging ? 0.35 : 1
      sp.tint = this.build.active && this.build.selected === b.uid ? 0xfff2b0 : 0xffffff
    }
    for (const [uid, sp] of this.bSprites) {
      if (!seen.has(uid)) {
        sp.destroy()
        this.bSprites.delete(uid)
      }
    }
  }

  private syncCats(dt: number) {
    const g = this.g
    const seen = new Set<number>()
    for (const c of g.cats) {
      seen.add(c.uid)
      let o = this.cSprites.get(c.uid)
      if (!o) {
        const s = new Sprite()
        s.anchor.set(0.5, 1)
        const shadow = new Graphics().ellipse(0, 0, 6, 2).fill({ color: 0x000000, alpha: 0.22 })
        this.objLayer.addChild(shadow, s)
        o = { s, shadow }
        this.cSprites.set(c.uid, o)
      }
      const crop = Math.round(c.crop)
      o.s.texture = this.catTex(c, c.pose, crop)
      o.s.x = Math.round(c.x)
      o.s.y = Math.round(c.y - c.z - 1 - crop)
      o.s.scale.x = c.facing
      o.s.zIndex = c.y + 0.5
      o.s.alpha = c.alpha
      o.s.tint = this.hoverCat === c ? 0xfff6dd : 0xffffff
      o.shadow.visible = crop === 0 && c.alpha > 0.5
      o.shadow.x = Math.round(c.x)
      o.shadow.y = Math.round(c.y - 1 - (c.z > 0 && c.tz > 0 ? 0 : 0))
      o.shadow.zIndex = c.y - 0.2
      o.shadow.alpha = c.z > 4 ? 0.4 : 1
      // 冬天呼出白气
      if (g.temperature <= 3 && c.alpha > 0.5 && c.crop === 0 && Math.random() < dt * 0.25) {
        const head = headTop(c.appearance)
        this.addFx({ type: 'breath', x: c.x + c.facing * 9, y: c.y - c.z - (CAT_H - head) + 6, dur: 1.4, data: { dir: c.facing } })
      }
    }
    for (const [uid, o] of this.cSprites) {
      if (!seen.has(uid)) {
        o.s.destroy()
        o.shadow.destroy()
        this.cSprites.delete(uid)
      }
    }
    void dt
  }

  private syncGifts() {
    const g = this.g
    while (this.giftSprites.length < g.s.gifts.length) {
      const s = new Sprite(this.giftTex())
      s.anchor.set(0.5, 1)
      this.objLayer.addChild(s)
      this.giftSprites.push(s)
    }
    while (this.giftSprites.length > g.s.gifts.length) this.giftSprites.pop()!.destroy()
    g.s.gifts.forEach((gf, i) => {
      const s = this.giftSprites[i]
      s.x = Math.round(gf.x)
      s.y = Math.round(gf.y + Math.sin(this.time * 3 + i) * 1)
      s.zIndex = gf.y
    })
    while (this.trashSprites.length < g.s.trash.length) {
      const s = new Sprite(this.trashTex())
      s.anchor.set(0.5, 1)
      this.floorLayer.addChild(s)
      this.trashSprites.push(s)
    }
    while (this.trashSprites.length > g.s.trash.length) this.trashSprites.pop()!.destroy()
    g.s.trash.forEach((t, i) => {
      const s = this.trashSprites[i]
      s.x = Math.round(t.x)
      s.y = Math.round(t.y)
      s.zIndex = 1
    })
  }

  private drawSun() {
    const g = this.g
    this.sunG.clear()
    const strength = g.clock.daylight * (g.weather === 'sunny' ? 0.09 : 0.05)
    if (strength <= 0.01) return
    for (const s of g.sunSpots) {
      this.sunG.ellipse(Math.round(s.x), Math.round(s.y), s.r * 1.2, s.r * 0.5).fill({ color: 0xfff1b0, alpha: strength })
      this.sunG.ellipse(Math.round(s.x), Math.round(s.y), s.r * 0.8, s.r * 0.32).fill({ color: 0xfff6d0, alpha: strength })
    }
  }

  private drawFlies() {
    const g = this.g
    this.flyG.clear()
    if (g.yard.hygiene >= 40) return
    const spots: { x: number; y: number }[] = [...g.s.trash]
    for (const b of g.s.buildings) if (def(b).dirtCap && b.dirt / def(b).dirtCap! > 0.5) spots.push(bAnchor(b))
    if (!spots.length) {
      const wr = g.walk
      spots.push({ x: wr.x + wr.w / 2, y: wr.y + wr.h / 2 })
    }
    spots.slice(0, 5).forEach((p, i) => {
      for (let k = 0; k < 2; k++) {
        const a = this.time * (5 + k) + i * 2 + k * 3
        const x = Math.round(p.x + Math.cos(a) * 6 + Math.sin(a * 2.3) * 3)
        const y = Math.round(p.y - 10 + Math.sin(a * 1.7) * 4)
        this.flyG.rect(x, y, 1, 1).fill(0x1a1a1a)
        this.flyG.rect(x - 1, y - 1, 1, 1).fill({ color: 0xffffff, alpha: Math.sin(this.time * 40) > 0 ? 0.7 : 0.2 })
      }
    })
  }

  private drawWeather(dt: number) {
    const g = this.g
    const w = g.weather
    const r = this.rain
    r.clear()
    const rainN = w === 'lightRain' ? 60 : w === 'heavyRain' ? 140 : w === 'storm' ? 160 : 0
    const wind = w === 'storm' ? 60 : w === 'windy' ? 40 : 15
    for (let i = 0; i < rainN; i++) {
      const d = this.drops[i]
      d.y += d.v * dt
      d.x += wind * dt
      if (d.y > VIEW_H) {
        d.y = -5
        d.x = Math.random() * (VIEW_W + 40) - 40
        // 溅起的水花
        if (Math.random() < 0.3) this.splash(d.x, OY + Math.random() * (VIEW_H - OY))
      }
      r.rect(Math.round(d.x), Math.round(d.y), 1, Math.round(d.l)).fill({ color: 0xbcd6f0, alpha: 0.55 })
    }
    if (w === 'snow') {
      for (const f of this.flakes) {
        f.y += f.v * dt
        f.x += Math.sin(this.time + f.v) * 8 * dt + 4 * dt
        if (f.y > VIEW_H) {
          f.y = -3
          f.x = Math.random() * VIEW_W
        }
        if (f.x > VIEW_W) f.x = 0
        r.rect(Math.round(f.x), Math.round(f.y), f.s, f.s).fill({ color: 0xffffff, alpha: 0.9 })
      }
    }
    if (w === 'windy') {
      for (let i = 0; i < 6; i++) {
        const x = ((this.time * 120 + i * 97) % (VIEW_W + 60)) - 30
        const y = 60 + ((i * 53) % 190) + Math.sin(this.time * 3 + i) * 6
        r.rect(Math.round(x), Math.round(y), 8 + (i % 3) * 4, 1).fill({ color: 0xffffff, alpha: 0.25 })
        if (i % 2 === 0) r.rect(Math.round(x + 4), Math.round(y - 2), 2, 2).fill({ color: g.clock.season === 'autumn' ? 0xd9803a : 0x7fb562, alpha: 0.9 })
      }
    }
    // 樱花瓣 / 落叶（季节氛围）
    const season = g.clock.season
    if ((season === 'spring' && g.hasFacility('sakura')) || season === 'autumn') {
      const col = season === 'spring' ? 0xf6c6d4 : 0xd98a3a
      for (let i = 0; i < 8; i++) {
        const x = ((this.time * (14 + i) + i * 61) % (VIEW_W + 20)) - 10
        const y = ((this.time * (10 + i * 1.3) + i * 37) % (VIEW_H - 40)) + 40
        r.rect(Math.round(x + Math.sin(this.time * 2 + i) * 4), Math.round(y), 2, 1).fill({ color: col, alpha: 0.9 })
      }
    }
    // 雾
    this.fog.clear()
    if (w === 'fog') {
      for (let i = 0; i < 6; i++) {
        const y = 60 + i * 34
        const x = ((this.time * (6 + i * 2) + i * 70) % (VIEW_W + 200)) - 200
        this.fog.rect(x, y, 260, 22).fill({ color: 0xe8ecef, alpha: 0.18 })
        this.fog.rect(x + 40, y + 6, 180, 12).fill({ color: 0xf4f6f8, alpha: 0.14 })
      }
      this.fog.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xdde3e8, alpha: 0.2 })
    }
    // 闪电
    this.flash.clear()
    if (g.thunderFlash > 0) this.flash.rect(0, 0, VIEW_W, VIEW_H).fill({ color: 0xffffff, alpha: g.thunderFlash * 0.55 })
  }

  private splash(x: number, y: number) {
    if (this.fxs.length > 80) return
    this.addFx({ type: 'sparkle', x, y, dur: 0.25, data: { splash: true } })
  }

  private drawNight() {
    const g = this.g
    const h = g.clock.hourF
    const o = this.nightOverlay
    o.clear()
    const dl = g.clock.daylight
    let color = '#1a2350'
    let alpha = (1 - dl) * 0.55
    if (h >= 16.5 && h < 19.5) {
      color = mix('#ff9a5a', '#1a2350', Math.max(0, (h - 17.5) / 2))
      alpha = Math.max(alpha, 0.12)
    } else if (h >= 5 && h < 7) {
      color = mix('#1a2350', '#ffb08a', (h - 5) / 2)
    }
    if (isRainy(g.weather) || g.weather === 'overcast') alpha += 0.08
    if (this.meeting) alpha += 0.1
    if (alpha > 0.01) o.rect(0, 0, VIEW_W, VIEW_H).fill({ color, alpha: Math.min(0.7, alpha) })
    // 灯光
    const lg = this.lightG
    lg.clear()
    if (dl < 0.6) {
      const k = (0.6 - dl) / 0.6
      for (const b of g.s.buildings) {
        const d = def(b)
        if (!['lamp', 'stoneLantern', 'stringLights', 'starLamp', 'heater', 'kotatsu'].includes(d.art)) continue
        const a = bAnchor(b)
        const flick = 0.9 + Math.sin(this.time * 7 + b.uid) * 0.05
        const isLamp = d.art === 'lamp' || d.art === 'stoneLantern'
        const cy = a.y - (isLamp ? (d.art === 'lamp' ? 34 : 14) : d.art === 'stringLights' ? 22 : 6)
        const col = d.art === 'starLamp' ? 0x9ab8ff : d.art === 'heater' ? 0xff8a3d : 0xffc870
        const r = d.art === 'stringLights' ? 26 : d.art === 'heater' ? 16 : 28
        for (let i = 3; i >= 1; i--) lg.ellipse(a.x, cy + (isLamp ? 14 : 0), r * (i / 3) * (d.w > 1 ? d.w * 0.7 : 1), r * (i / 3) * 0.65).fill({ color: col, alpha: 0.07 * k * flick })
        if (d.art === 'starLamp') {
          for (let s = 0; s < 8; s++) {
            const sx = a.x + Math.cos(s + this.time * 0.2) * 20
            const sy = a.y + Math.sin(s * 1.7) * 8
            lg.rect(Math.round(sx), Math.round(sy), 1, 1).fill({ color: 0xffffff, alpha: 0.6 * k })
          }
        }
      }
      // 窗口暖光与萤火
      lg.rect(OX + (GRID_W / 2) * TILE - 12, OY + GRID_H * TILE - 3, 24, 2).fill({ color: 0xffc870, alpha: 0.12 * k })
    }
  }

  // ================= 特效 =================

  addFx(f: Fx) {
    const gfx = new Graphics()
    this.fxLayer.addChild(gfx)
    const inst: FxInst = { ...f, t: 0, g: gfx, seed: Math.random() * 1000 }
    if (f.type === 'puddle' || f.type === 'footprints') this.groundFx.addChild(gfx)
    this.fxs.push(inst)
  }

  private updateFx(dt: number) {
    for (let i = this.fxs.length - 1; i >= 0; i--) {
      const f = this.fxs[i]
      f.t += dt
      const g = f.g
      g.clear()
      const p = f.t / f.dur
      if (p >= 1) {
        g.destroy()
        this.fxs.splice(i, 1)
        continue
      }
      const fade = p > 0.8 ? (1 - p) / 0.2 : 1
      const t = f.t
      switch (f.type) {
        case 'butterfly': {
          const x = f.x + Math.sin(t * 1.3 + f.seed) * 30 + t * 4
          const y = f.y + Math.sin(t * 2.7) * 8
          const flap = Math.sin(t * 18) > 0
          const col = (f.seed | 0) % 2 ? 0xf6e27a : 0xf2a6c4
          g.rect(Math.round(x), Math.round(y), 1, 2).fill(0x3a2a2a)
          g.rect(Math.round(x) - (flap ? 2 : 1), Math.round(y) - 1, flap ? 2 : 1, 2).fill(col)
          g.rect(Math.round(x) + 1, Math.round(y) - 1, flap ? 2 : 1, 2).fill(col)
          break
        }
        case 'bird': {
          const land = Math.min(1, t / 1.2)
          const leave = p > 0.75 ? (p - 0.75) / 0.25 : 0
          const x = f.x - (1 - land) * 40 + leave * 60
          const y = f.y - (1 - land) * 20 - leave * 40
          const hop = leave === 0 && land === 1 ? (Math.sin(t * 6) > 0.9 ? -1 : 0) : 0
          g.rect(Math.round(x), Math.round(y + hop), 4, 3).fill(0x6b5a4a)
          g.rect(Math.round(x) + 3, Math.round(y - 1 + hop), 2, 2).fill(0x6b5a4a)
          g.rect(Math.round(x) + 5, Math.round(y + hop), 1, 1).fill(0xe0a030)
          g.rect(Math.round(x) + 1, Math.round(y + 1 + hop), 2, 1).fill(0xc9b8a0)
          if (land < 1 || leave > 0) g.rect(Math.round(x) - 1, Math.round(y - 2 + (Math.sin(t * 20) > 0 ? 0 : 3)), 3, 1).fill(0x6b5a4a)
          break
        }
        case 'leaf':
        case 'petal': {
          for (let k = 0; k < 4; k++) {
            const x = f.x + t * 50 + k * 14
            const y = f.y + t * 14 + Math.sin(t * 4 + k) * 6 + k * 3
            g.rect(Math.round(x), Math.round(y), 2, 1).fill({ color: f.type === 'leaf' ? 0xd9803a : 0xf6c6d4, alpha: fade })
          }
          break
        }
        case 'firefly': {
          for (let k = 0; k < 6; k++) {
            const x = f.x + Math.sin(t * 0.7 + k * 2) * 26 + Math.cos(t * 0.4 + k) * 8
            const y = f.y + Math.cos(t * 0.9 + k * 1.3) * 10 - k * 2
            const a = (Math.sin(t * 3 + k) + 1) / 2
            g.rect(Math.round(x), Math.round(y), 1, 1).fill({ color: 0xeaff8a, alpha: a * fade })
            g.circle(x, y, 3).fill({ color: 0xeaff8a, alpha: a * 0.15 * fade })
          }
          break
        }
        case 'shootingStar': {
          const x = f.x + p * 120
          const y = f.y + p * 30
          for (let k = 0; k < 10; k++) g.rect(Math.round(x - k * 3), Math.round(y - k * 0.75), 2, 1).fill({ color: 0xffffff, alpha: (1 - k / 10) * fade })
          break
        }
        case 'fishJump': {
          const y = f.y - Math.sin(p * Math.PI) * 10
          g.rect(Math.round(f.x + p * 8), Math.round(y), 4, 2).fill(0xe8603a)
          g.rect(Math.round(f.x + p * 8) - 1, Math.round(y), 1, 2).fill(0xf08a5a)
          break
        }
        case 'heart': {
          for (let k = 0; k < 2; k++) {
            const x = Math.round(f.x + (k ? 5 : -4) + Math.sin(t * 3 + k) * 2)
            const y = Math.round(f.y - t * 8 - k * 4)
            g.rect(x, y, 2, 1).fill({ color: 0xff6a8a, alpha: fade }).rect(x + 3, y, 2, 1).fill({ color: 0xff6a8a, alpha: fade })
            g.rect(x, y + 1, 5, 1).fill({ color: 0xff6a8a, alpha: fade }).rect(x + 1, y + 2, 3, 1).fill({ color: 0xff6a8a, alpha: fade })
            g.rect(x + 2, y + 3, 1, 1).fill({ color: 0xff6a8a, alpha: fade })
          }
          break
        }
        case 'dust': {
          for (let k = 0; k < 14; k++) {
            const a = k * 0.9 + t * 6
            const r = 6 + Math.sin(t * 9 + k) * 4
            g.circle(f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.6, 4 + (k % 3)).fill({ color: 0xe8dcc8, alpha: 0.85 * fade })
          }
          if (Math.sin(t * 20) > 0.5) g.rect(Math.round(f.x - 3), Math.round(f.y - 10), 1, 4).fill(0xffe070)
          break
        }
        case 'puddle':
          g.ellipse(f.x, f.y, 10, 3).fill({ color: 0x7aa7d0, alpha: 0.5 * fade }).ellipse(f.x - 3, f.y - 1, 3, 1).fill({ color: 0xd6e8f6, alpha: 0.6 * fade })
          break
        case 'footprints':
          g.rect(Math.round(f.x - 2), Math.round(f.y), 1, 1).fill({ color: 0x9aa8b8, alpha: 0.7 * fade }).rect(Math.round(f.x + 2), Math.round(f.y - 1), 1, 1).fill({ color: 0x9aa8b8, alpha: 0.7 * fade })
          break
        case 'sparkle': {
          if (f.data?.splash) {
            g.rect(Math.round(f.x - 1), Math.round(f.y - p * 3), 1, 1).fill({ color: 0xd6e8f6, alpha: 0.8 }).rect(Math.round(f.x + 1), Math.round(f.y - p * 3), 1, 1).fill({ color: 0xd6e8f6, alpha: 0.8 })
          } else {
            for (let k = 0; k < 5; k++) {
              const a = k * 1.25 + t * 2
              g.rect(Math.round(f.x + Math.cos(a) * 8), Math.round(f.y + Math.sin(a) * 5 - t * 4), 1, 1).fill({ color: 0xfff2a0, alpha: fade })
            }
          }
          break
        }
        case 'note':
          g.rect(Math.round(f.x + 2), Math.round(f.y - t * 10), 1, 4).fill({ color: 0xffffff, alpha: fade }).rect(Math.round(f.x), Math.round(f.y + 3 - t * 10), 2, 2).fill({ color: 0xffffff, alpha: fade })
          break
        case 'zzz':
          for (let k = 0; k < 3; k++) {
            const pp = (t * 0.5 + k / 3) % 1
            const x = Math.round(f.x + pp * 8)
            const y = Math.round(f.y - pp * 12)
            g.rect(x, y, 3, 1).fill({ color: 0xffffff, alpha: (1 - pp) * 0.9 }).rect(x + 1, y + 1, 1, 1).fill({ color: 0xffffff, alpha: (1 - pp) * 0.9 }).rect(x, y + 2, 3, 1).fill({ color: 0xffffff, alpha: (1 - pp) * 0.9 })
          }
          break
        case 'fish':
        case 'sock': {
          const c = this.g.cats.find((x) => x.uid === f.data?.follow)
          if (!c) break
          const x = Math.round(c.x + c.facing * 8)
          const y = Math.round(c.y - c.z - 8)
          if (f.type === 'fish') g.rect(x - 2, y, 5, 2).fill(0xd9a05a).rect(x + c.facing * 3, y - 1, 1, 4).fill(0xb8803a)
          else g.rect(x - 1, y, 3, 4).fill(0xe8e0f0).rect(x - 1, y + 3, 4, 2).fill(0xe8e0f0).rect(x - 1, y, 3, 1).fill(0xd96a7a)
          break
        }
        case 'bug': {
          const x = f.x + t * 10 + Math.sin(t * 8) * 3
          const y = f.y - Math.abs(Math.sin(t * 5)) * 6
          g.rect(Math.round(x), Math.round(y), 2, 1).fill(0x3a3a2a)
          break
        }
        case 'cicada':
          g.rect(Math.round(f.x), Math.round(f.y), 2, 3).fill(0x5a4a2a).rect(Math.round(f.x) - 1, Math.round(f.y), 1, 2).fill({ color: 0xcfe0e8, alpha: 0.7 })
          break
        case 'breath': {
          const d = f.data?.dir ?? 1
          const r = 1 + p * 3
          g.circle(f.x + d * p * 6, f.y - p * 4, r).fill({ color: 0xffffff, alpha: 0.45 * (1 - p) })
          break
        }
        case 'sweat':
          g.rect(Math.round(f.x), Math.round(f.y + t * 4), 1, 2).fill({ color: 0x9ad0f0, alpha: fade })
          break
      }
    }
  }

  // ================= 建造模式 =================

  private drawBuild() {
    const g = this.g
    const L = this.buildLayer
    L.clear()
    this.ghost.visible = false
    if (!this.build.active && !g.s.settings.showGrid) return
    const yr = yardRect(g.s.yardLevel)
    const p0 = tileToPx(yr.x, yr.y)
    for (let x = 0; x <= yr.w; x++) L.rect(p0.x + x * TILE, p0.y, 1, yr.h * TILE).fill({ color: 0xffffff, alpha: 0.12 })
    for (let y = 0; y <= yr.h; y++) L.rect(p0.x, p0.y + y * TILE, yr.w * TILE, 1).fill({ color: 0xffffff, alpha: 0.12 })
    if (!this.build.active) return
    // 选中框
    const sel = g.s.buildings.find((b) => b.uid === this.build.selected)
    if (sel && this.build.dragging !== sel.uid) {
      const d = def(sel)
      const p = tileToPx(sel.x, sel.y)
      const blink = Math.sin(this.time * 6) > 0 ? 0.9 : 0.5
      L.rect(p.x, p.y, d.w * TILE, d.h * TILE).stroke({ color: 0xffe28a, width: 1, alpha: blink })
    }
    // 幽灵预览
    const id = this.build.placing ?? (this.build.dragging ? g.s.buildings.find((b) => b.uid === this.build.dragging)?.defId : null)
    const hv = this.build.hover
    if (id && hv) {
      const d = BUILDING_MAP[id]
      const draggingB = this.build.dragging ? g.s.buildings.find((b) => b.uid === this.build.dragging) : null
      const ok = canPlace(g.s, id, hv.x, hv.y, draggingB?.uid)
      const p = tileToPx(hv.x, hv.y)
      L.rect(p.x, p.y, d.w * TILE, d.h * TILE).fill({ color: ok ? 0x8aff8a : 0xff6a6a, alpha: 0.25 })
      this.ghost.texture = this.buildingTex({ defId: id, skin: draggingB?.skin ?? this.build.skin, food: 0, water: 0 })
      this.ghost.x = p.x + (d.w * TILE) / 2
      this.ghost.y = p.y + d.h * TILE
      this.ghost.scale.x = (draggingB ? draggingB.flip : this.build.flip) ? -1 : 1
      this.ghost.tint = ok ? 0xffffff : 0xff8080
      this.ghost.visible = true
    }
  }

  // ================= 气泡 =================

  private syncBubbles() {
    const g = this.g
    const s = this.scale * this.zoom
    const cssScale = this.scale / this.dpr
    const fontCss = Math.max(11, Math.min(17, cssScale * 4.6))
    const font = Math.round(fontCss * this.dpr)
    const seen = new Set<number>()
    for (const c of g.cats) {
      const head = headTop(c.appearance)
      const sp = this.toScreen(c.x, c.y - c.z - (CAT_H - head) - c.crop)
      const hx = sp.x
      const hy = sp.y
      if (c.bubble && c.alpha > 0.3) {
        seen.add(c.uid)
        let b = this.bubbles.get(c.uid)
        if (!b) {
          const cont = new Container()
          const bg = new Graphics()
          const t = new Text({ text: '', style: { fontFamily: 'Zpix, "PingFang SC", "Microsoft YaHei", sans-serif', fontSize: font, fill: '#3a2e2a', wordWrap: true, breakWords: true, wordWrapWidth: font * 11, lineHeight: font * 1.3 } })
          cont.addChild(bg, t)
          this.ui.addChild(cont)
          b = { c: cont, bg, t, text: '' }
          this.bubbles.set(c.uid, b)
        }
        if (b.text !== c.bubble.text || b.t.style.fontSize !== font) {
          b.text = c.bubble.text
          b.t.style.fontSize = font
          b.t.style.wordWrapWidth = font * 11
          b.t.style.lineHeight = font * 1.3
          b.t.text = c.bubble.text
          const pad = Math.round(font * 0.5)
          const w = Math.ceil(b.t.width) + pad * 2
          const h = Math.ceil(b.t.height) + pad * 1.4
          const px = Math.max(2, Math.round(this.dpr * 1.5))
          b.bg.clear()
          // 像素风气泡：阶梯圆角 + 尾巴
          b.bg.rect(px, 0, w - px * 2, h).fill(0x4a3a36)
          b.bg.rect(0, px, w, h - px * 2).fill(0x4a3a36)
          b.bg.rect(px * 2, px, w - px * 4, h - px * 2).fill(0xfff8ec)
          b.bg.rect(px, px * 2, w - px * 2, h - px * 4).fill(0xfff8ec)
          const tx = Math.round(w / 2)
          b.bg.rect(tx - px * 2, h - px, px * 4, px).fill(0xfff8ec)
          b.bg.rect(tx - px * 2, h, px * 3, px).fill(0x4a3a36)
          b.bg.rect(tx - px, h - px, px * 2, px * 2).fill(0xfff8ec)
          b.bg.rect(tx - px, h + px, px * 2, px).fill(0x4a3a36)
          b.t.x = pad
          b.t.y = Math.round(pad * 0.7)
          b.c.pivot.set(Math.round(w / 2), h + px * 2)
        }
        const life = c.bubble.t
        b.c.alpha = life < 0.15 ? life / 0.15 : c.bubble.dur - life < 0.3 ? Math.max(0, (c.bubble.dur - life) / 0.3) : 1
        const bw = b.c.width
        b.c.x = Math.round(Math.max(bw / 2 + 4, Math.min(this.app.renderer.width - bw / 2 - 4, hx)))
        b.c.y = Math.round(Math.max(b.c.height + 4, hy - 2 * s))
      }
      // 表情
      let e = this.emotes.get(c.uid)
      if (c.emote) {
        if (!e) {
          e = new Text({ text: '', style: { fontFamily: 'sans-serif', fontSize: font, fill: '#ffffff', stroke: { color: '#3a2e2a', width: Math.max(2, this.dpr * 2) }, fontWeight: 'bold' } })
          e.anchor.set(0.5, 1)
          this.ui.addChild(e)
          this.emotes.set(c.uid, e)
        }
        e.text = c.emote.e
        e.style.fontSize = font * 1.1
        e.x = Math.round(hx + c.facing * 6 * s)
        e.y = Math.round(hy - (c.bubble ? 0 : 1) * s - Math.sin(this.time * 6) * s)
        e.visible = !c.bubble
      } else if (e) {
        e.destroy()
        this.emotes.delete(c.uid)
      }
    }
    // 避免气泡互相重叠：自下而上依次放置，重叠时向上挪
    const placed: { l: number; r: number; t: number; b: number }[] = []
    const vis = [...this.bubbles.entries()].filter(([uid]) => seen.has(uid)).map(([, b]) => b)
    vis.sort((a, b) => b.c.y - a.c.y)
    for (const b of vis) {
      const w = b.c.width
      const h = b.c.height
      let box = { l: b.c.x - w / 2, r: b.c.x + w / 2, t: b.c.y - h, b: b.c.y }
      for (let iter = 0; iter < 6; iter++) {
        const hit = placed.find((p) => box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t)
        if (!hit) break
        const dy = box.b - hit.t + 2
        box = { ...box, t: box.t - dy, b: box.b - dy }
      }
      b.c.y = Math.round(Math.max(h + 2, box.b))
      placed.push(box)
    }
    for (const [uid, b] of this.bubbles) {
      if (!seen.has(uid)) {
        b.c.destroy({ children: true })
        this.bubbles.delete(uid)
      }
    }
    for (const [uid, e] of this.emotes) if (!g.cats.some((c) => c.uid === uid)) (e.destroy(), this.emotes.delete(uid))
    // 悬停名字
    const hc = this.hoverCat
    if (hc && g.cats.includes(hc) && !hc.bubble && !this.build.active) {
      const known = !hc.isFixed || (g.s.cats[hc.id]?.familiarity ?? 0) >= 1
      this.nameTag.text = known ? hc.name : '？？？'
      this.nameTag.style.fontSize = Math.round(font * 0.9)
      this.nameTag.style.stroke = { color: '#2a2230', width: Math.max(2, this.dpr * 2) }
      const np = this.toScreen(hc.x, hc.y - hc.z - (CAT_H - headTop(hc.appearance)) - hc.crop - 1)
      this.nameTag.x = Math.round(np.x)
      this.nameTag.y = Math.round(np.y)
      this.nameTag.visible = true
    } else this.nameTag.visible = false
  }

  // ================= 输入 =================

  private toWorld(e: PointerEvent) {
    const r = this.app.canvas.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * this.visW + Math.round(this.camX), y: ((e.clientY - r.top) / r.height) * this.visH + Math.round(this.camY) }
  }

  catAt(x: number, y: number): Cat | null {
    let best: Cat | null = null
    for (const c of this.g.cats) {
      if (c.alpha < 0.3) continue
      const top = c.y - c.z - c.crop - 16
      const bottom = c.y - c.z - c.crop + 1
      if (x >= c.x - 10 && x <= c.x + 10 && y >= top && y <= bottom) if (!best || c.y > best.y) best = c
    }
    return best
  }

  buildingAt(x: number, y: number): PlacedBuilding | null {
    let best: PlacedBuilding | null = null
    let bestFloor: PlacedBuilding | null = null
    for (const b of this.g.s.buildings) {
      const d = def(b)
      const p = tileToPx(b.x, b.y)
      const extra = isFloorLayer(d) || d.walkable ? 0 : Math.min(HEADROOM, d.h === 1 ? 6 : 14)
      if (x >= p.x && x < p.x + d.w * TILE && y >= p.y - extra && y < p.y + d.h * TILE) {
        if (isFloorLayer(d)) bestFloor = b
        else if (!best || b.y + d.h > best.y + def(best).h) best = b
      }
    }
    return best ?? bestFloor
  }

  private bindInput() {
    const cv = this.app.canvas
    cv.style.touchAction = 'none'
    cv.addEventListener('pointermove', (e) => {
      const p = this.toWorld(e)
      this.pointer.x = p.x
      this.pointer.y = p.y
      if (this.pointer.down && Math.hypot(e.clientX - this.pointer.sx, e.clientY - this.pointer.sy) > 6) this.pointer.moved = true
      // 拖动画面
      if (this.pan.active && this.pointer.down && this.pointer.moved) {
        const r = this.app.canvas.getBoundingClientRect()
        this.camX = this.pan.camX - ((e.clientX - this.pointer.sx) / r.width) * this.visW
        this.camY = this.pan.camY - ((e.clientY - this.pointer.sy) / r.height) * this.visH
        this.applyCamera()
        cv.style.cursor = 'grabbing'
        return
      }
      if (this.build.active) {
        const id = this.build.placing ?? (this.build.dragging ? this.g.s.buildings.find((b) => b.uid === this.build.dragging)?.defId : null)
        if (id) {
          const d = BUILDING_MAP[id]
          const t = pxToTile(p.x - ((d.w - 1) * TILE) / 2, p.y - ((d.h - 1) * TILE) / 2)
          this.build.hover = t
        } else this.build.hover = pxToTile(p.x, p.y)
        // 拖动已有设施
        if (this.pointer.down && this.pointer.moved && !this.build.dragging && !this.build.placing && this.build.selected) {
          const b = this.buildingAt(this.pointer.x, this.pointer.y)
          if (b && b.uid === this.build.selected) this.build.dragging = b.uid
        }
        cv.style.cursor = this.build.placing || this.build.dragging ? 'grabbing' : this.buildingAt(p.x, p.y) ? 'grab' : 'default'
      } else {
        this.hoverCat = this.catAt(p.x, p.y)
        const hit = this.hoverCat || this.giftIndexAt(p.x, p.y) >= 0 || this.trashIndexAt(p.x, p.y) >= 0 || this.buildingAt(p.x, p.y)
        cv.style.cursor = hit ? 'pointer' : 'default'
      }
    })
    cv.addEventListener('pointerleave', () => {
      this.hoverCat = null
      if (!this.pointer.down) this.build.hover = null
    })
    // 触屏手势被系统打断（来电、系统手势等）时不会触发 pointerup，需要复位拖动状态
    cv.addEventListener('pointercancel', () => {
      this.pointer.down = false
      this.pan.active = false
      this.build.dragging = null
    })
    cv.addEventListener('pointerdown', (e) => {
      const p = this.toWorld(e)
      this.pointer = { x: p.x, y: p.y, down: true, moved: false, sx: e.clientX, sy: e.clientY }
      this.camTween = null
      try {
        cv.setPointerCapture(e.pointerId)
      } catch {
        /* ignore */
      }
      // 可平移时：在空地上按下即可拖动画面（建造模式下按住设施则是拖动设施）
      const onBuilding = this.build.active && (!!this.build.placing || !!this.buildingAt(p.x, p.y))
      this.pan = { active: this.canPan && !onBuilding, camX: this.camX, camY: this.camY }
      if (this.build.active && !this.build.placing) {
        const b = this.buildingAt(p.x, p.y)
        if (b) {
          this.build.selected = b.uid
          this.onBuildSelect?.(b)
        }
        // 触屏也更新 hover
        this.build.hover = pxToTile(p.x, p.y)
      }
    })
    cv.addEventListener('pointerup', (e) => {
      const p = this.toWorld(e)
      this.pointer.down = false
      const panned = this.pan.active && this.pointer.moved
      this.pan.active = false
      if (panned) return
      if (this.build.active) return this.handleBuildUp(p.x, p.y)
      if (this.pointer.moved) return
      this.handleClick(p.x, p.y, e)
    })
    cv.addEventListener('contextmenu', (e) => {
      e.preventDefault()
      if (this.build.placing) {
        this.build.placing = null
        this.onPlaced?.(false)
      }
    })
  }

  private handleBuildUp(x: number, y: number) {
    const g = this.g
    if (this.build.placing) {
      const d = BUILDING_MAP[this.build.placing]
      const t = pxToTile(x - ((d.w - 1) * TILE) / 2, y - ((d.h - 1) * TILE) / 2)
      const b = g.place(this.build.placing, t.x, t.y, this.build.flip, this.build.skin)
      if (b) {
        if ((g.s.warehouse[this.build.placing] ?? 0) <= 0) this.build.placing = null
        this.build.selected = b.uid
        this.onBuildSelect?.(b)
        this.onPlaced?.(true)
      } else g.toast('这里放不下哦', '⚠️')
      return
    }
    if (this.build.dragging) {
      const b = g.s.buildings.find((x) => x.uid === this.build.dragging)
      this.build.dragging = null
      if (b) {
        const d = def(b)
        const t = pxToTile(x - ((d.w - 1) * TILE) / 2, y - ((d.h - 1) * TILE) / 2)
        if (!(t.x === b.x && t.y === b.y) && !g.moveBuilding(b, t.x, t.y)) g.toast('这里放不下哦', '⚠️')
        this.onBuildSelect?.(b)
      }
      return
    }
    const b = this.buildingAt(x, y)
    this.build.selected = b?.uid ?? null
    this.onBuildSelect?.(b)
  }

  giftIndexAt(x: number, y: number) {
    return this.g.s.gifts.findIndex((gf) => Math.abs(gf.x - x) < 8 && y > gf.y - 12 && y < gf.y + 3)
  }
  trashIndexAt(x: number, y: number) {
    return this.g.s.trash.findIndex((t) => Math.abs(t.x - x) < 7 && Math.abs(t.y - 2 - y) < 6)
  }

  private handleClick(x: number, y: number, e: PointerEvent) {
    const g = this.g
    const gi = this.giftIndexAt(x, y)
    if (gi >= 0) {
      const gf = g.s.gifts[gi]
      this.addFx({ type: 'sparkle', x: gf.x, y: gf.y - 6, dur: 0.8 })
      g.openGift(gi)
      return
    }
    const ti = this.trashIndexAt(x, y)
    if (ti >= 0) return g.pickTrash(ti)
    const c = this.catAt(x, y)
    if (c) return this.onCatClick?.(c)
    const b = this.buildingAt(x, y)
    if (b) return this.onBuildingClick?.(b, e.clientX, e.clientY)
    this.onEmptyClick?.()
  }

  /** 生成猫咪预览图（dataURL），用于图鉴等 DOM 界面 */
  catPreview(appearance: Cat['appearance'], pose: CatPose = 'sit', scale = 4, silhouette = false) {
    const cv = canvas(CAT_W, CAT_H)
    const ctx = cv.getContext('2d')!
    drawCat(ctx, appearance, pose)
    if (silhouette) {
      ctx.globalCompositeOperation = 'source-in'
      ctx.fillStyle = '#3a3346'
      ctx.fillRect(0, 0, CAT_W, CAT_H)
    }
    const out = canvas(CAT_W * scale, CAT_H * scale)
    const o = out.getContext('2d')!
    o.imageSmoothingEnabled = false
    o.drawImage(cv, 0, 0, out.width, out.height)
    return out.toDataURL()
  }

  buildingPreview(defId: string, skin = 0, scale = 2) {
    const d = BUILDING_MAP[defId]
    const [c1, c2] = d.skins?.[skin] ?? d.colors
    const cv = canvas(d.w * TILE, d.h * TILE + HEADROOM)
    try {
      drawBuilding(cv.getContext('2d')!, d.art, d.w, d.h, c1, c2, { season: this.g.clock.season, frame: 0, night: false, fill: d.foodCap ? 1 : d.waterCap ? 1 : -1, dirt: 0 })
    } catch {
      /* ignore */
    }
    // 裁掉空白
    const ctx = cv.getContext('2d')!
    const data = ctx.getImageData(0, 0, cv.width, cv.height).data
    let top = cv.height
    for (let y = 0; y < cv.height && top === cv.height; y++)
      for (let x = 0; x < cv.width; x++) if (data[(y * cv.width + x) * 4 + 3] > 0) {
        top = y
        break
      }
    const h = cv.height - Math.min(top, cv.height - 1)
    const out = canvas(cv.width * scale, h * scale)
    const o = out.getContext('2d')!
    o.imageSmoothingEnabled = false
    o.drawImage(cv, 0, cv.height - h, cv.width, h, 0, 0, out.width, out.height)
    return out.toDataURL()
  }
}

export const hashColor = (n: number) => hash(n)
export const GRID = { GRID_W, GRID_H }
