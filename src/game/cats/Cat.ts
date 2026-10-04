import type { CatAppearance, CatDef, CatNeeds, CatState, FoodType, Personality, PlacedBuilding } from '../types'
import type { CatPose } from '../render/catArt'
import type { Game } from '../core/Game'
import type { DialogueContext } from '@/data/dialogue'
import { chance, clamp, pick, pickWeighted, rand, randRange } from '../core/rng'
import { bAnchor, def, inRect, tileToPx, walkRect } from '../world/yard'
import { isRainy } from '../world/weather'
import { usePoint, HEADROOM } from '../render/buildingArt'
import { TILE } from '../constants'
import type { GeneratedCat } from './catGen'

let UID = 1

/** 猫咪会“钻进去”的容器类设施（显示时裁剪下半身） */
export const CONTAINER_ARTS = new Set(['box', 'woodHouse', 'doghouse', 'basket', 'plushBed', 'tunnel', 'pipe', 'boxMaze', 'bush', 'bambooGrove', 'treeHole', 'kotatsu', 'tire', 'treeHouse'])

export interface Bubble {
  text: string
  t: number
  dur: number
}

type Option = { w: number; run: () => boolean }

/** 一只在小院里活动的猫 */
export class Cat {
  uid = UID++
  id: number
  def?: CatDef
  gen?: GeneratedCat
  name: string
  appearance: CatAppearance
  personalities: Personality[]
  favoriteFoods: FoodType[]
  favoriteFacilities: string[]

  x = 0
  y = 0
  z = 0 // 离地高度（px）
  vz = 0
  facing: 1 | -1 = 1
  state: CatState = 'ENTER'
  stateT = 0
  stateDur = 0
  moving = false
  tx = 0
  ty = 0
  tz = 0
  speed = 18
  onArrive: (() => void) | null = null
  target: PlacedBuilding | null = null
  slot = 0
  needs: CatNeeds
  stay: number
  age = 0
  pose: CatPose = 'stand'
  animT = Math.random() * 10
  bubble: Bubble | null = null
  emote: { e: string; t: number } | null = null
  /** 被容器遮挡时，从底部隐藏的像素行数（0 = 不裁剪） */
  crop = 0
  alpha = 1
  ate = false
  leaving = false
  gone = false
  scripted = false
  talkCd = randRange(4, 12)
  pets = 0
  petCd = 0
  visitFirst = false
  restPose: CatPose = 'sit'
  sheltered = false
  idleChatT = randRange(15, 35)
  socialWith: Cat | null = null

  constructor(opts: { id: number; def?: CatDef; gen?: GeneratedCat }) {
    this.id = opts.id
    this.def = opts.def
    this.gen = opts.gen
    const src = opts.def ?? opts.gen!
    this.name = src.name
    this.appearance = src.appearance
    this.personalities = src.personalities
    this.favoriteFoods = src.favoriteFoods
    this.favoriteFacilities = opts.def?.favoriteFacilities ?? []
    const has = (p: Personality) => this.personalities.includes(p)
    this.needs = {
      hunger: randRange(35, 90),
      thirst: randRange(20, 70),
      fatigue: randRange(10, 60),
      boredom: randRange(20, 60),
      dirty: randRange(0, 30),
      social: has('social') || has('clingy') ? randRange(50, 80) : randRange(0, 40),
      safety: has('timid') || has('shy') ? randRange(25, 50) : randRange(55, 85),
    }
    this.stay = randRange(60, 150) * (has('lazy') ? 1.3 : 1) * (has('lively') ? 0.85 : 1)
    this.speed = 16 + (has('lively') ? 6 : 0) - (has('lazy') ? 4 : 0) + randRange(-2, 2)
    if (this.appearance.body === 'tiny' || this.appearance.body === 'kitten') this.speed -= 2
  }

  has(p: Personality) {
    return this.personalities.includes(p)
  }
  get isFixed() {
    return !!this.def
  }

  // ================= 移动与状态 =================

  moveTo(x: number, y: number, then: (() => void) | null, run = false, z = 0) {
    this.tx = x
    this.ty = y
    this.tz = z
    this.moving = true
    this.onArrive = then
    this.runMode = run
    if (Math.abs(x - this.x) > 1) this.facing = x > this.x ? 1 : -1
  }
  runMode = false

  setState(st: CatState, dur: number) {
    this.state = st
    this.stateT = 0
    this.stateDur = dur
  }

  clearTarget(g: Game) {
    if (this.target) g.release(this)
    this.target = null
    this.crop = 0
  }

  say(g: Game, ctx: DialogueContext | string, force = false) {
    g.talk(this, ctx, force)
  }

  showEmote(e: string, t = 2) {
    this.emote = { e, t }
  }

  update(dt: number, g: Game) {
    this.animT += dt
    this.age += dt
    if (this.bubble) {
      this.bubble.t += dt
      if (this.bubble.t > this.bubble.dur) this.bubble = null
    }
    if (this.emote) {
      this.emote.t -= dt
      if (this.emote.t <= 0) this.emote = null
    }
    if (this.talkCd > 0) this.talkCd -= dt
    if (this.petCd > 0) this.petCd -= dt

    // 需求变化
    const n = this.needs
    const sleeping = this.state === 'SLEEP' || this.state === 'SUNBATHE'
    n.hunger = clamp(n.hunger + dt * 0.12, 0, 100)
    n.thirst = clamp(n.thirst + dt * 0.14, 0, 100)
    n.fatigue = clamp(n.fatigue + (sleeping ? -dt * 1.6 : dt * (g.clock.isNight && !this.has('nocturnal') ? 0.2 : 0.11)), 0, 100)
    n.boredom = clamp(n.boredom + (this.state === 'PLAY' ? -dt * 4 : dt * 0.16), 0, 100)
    n.social = clamp(n.social + dt * (this.has('social') || this.has('clingy') ? 0.12 : 0.05), 0, 100)
    if (this.state === 'HIDE') n.safety = clamp(n.safety + dt * 2.5, 0, 100)
    else n.safety = clamp(n.safety + dt * (g.yard.safety > 40 ? 0.15 : -0.02), 0, 100)

    this.sheltered = this.z > 12 && this.target ? def(this.target).tags.includes('roof') || def(this.target).tags.includes('hide') : g.isSheltered(this.x, this.y)
    if (this.crop > 0) this.sheltered = true

    if (this.scripted) {
      this.updateMove(dt, g)
      this.updatePose(g)
      return
    }

    // 停留时间
    if (!this.leaving) {
      this.stay -= dt * (g.yard.warmth > 60 ? 0.8 : 1)
      if (this.stay <= 0) this.startLeave(g)
    }

    // 下雨没地方躲
    if (!this.leaving && isRainy(g.weather) && !this.sheltered && !this.has('rainLover') && this.state !== 'ENTER') {
      this.rainT += dt
      if (this.rainT > (g.weather === 'lightRain' ? 14 : 6) && !this.moving) {
        this.rainT = 0
        this.seekShelter(g)
      }
    } else this.rainT = 0

    // 打雷吓跑
    if (g.thunderFlash > 0.9 && !this.leaving && (this.has('timid') || this.has('shy')) && this.state !== 'HIDE' && chance(0.03)) {
      this.showEmote('!', 1.5)
      this.interrupt(g)
      if (!this.goHide(g, true)) this.startLeave(g, true)
    }

    this.updateMove(dt, g)

    if (!this.moving) {
      this.stateT += dt
      this.tickState(dt, g)
      if (this.stateDur > 0 && this.stateT >= this.stateDur) this.finishState(g)
    }

    // 闲聊
    this.idleChatT -= dt
    if (this.idleChatT <= 0) {
      this.idleChatT = randRange(18, 40) * (this.has('social') ? 0.6 : 1) * (this.has('aloof') || this.has('shy') ? 1.6 : 1)
      if (!this.moving && this.state !== 'SLEEP') this.say(g, g.ambientContext(this))
      else if (this.state === 'SLEEP' && chance(0.15)) this.say(g, 'sleeping')
    }

    this.updatePose(g)
  }
  rainT = 0

  private updateMove(dt: number, g: Game) {
    // 垂直（跳跃）
    if (Math.abs(this.z - this.tz) > 0.5 && !this.moving) {
      this.z += (this.tz - this.z) * Math.min(1, dt * 8)
    }
    if (!this.moving) return
    const dx = this.tx - this.x
    const dy = this.ty - this.y
    const d = Math.hypot(dx, dy)
    const sp = (this.runMode ? this.speed * 2.2 : this.speed) * (this.has('lively') && chance(0.002) ? 1.5 : 1)
    const step = sp * dt
    // 起跳到高处 / 跳下
    if (d < 10 && Math.abs(this.z - this.tz) > 2) {
      this.z += (this.tz - this.z) * Math.min(1, dt * 10)
    } else if (d > 10 && this.z > 0.5 && this.tz === 0) {
      this.z = Math.max(0, this.z - dt * 60)
    }
    if (d <= step) {
      this.x = this.tx
      this.y = this.ty
      this.z = this.tz
      this.moving = false
      const cb = this.onArrive
      this.onArrive = null
      cb?.()
    } else {
      this.x += (dx / d) * step
      this.y += (dy / d) * step
      if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1
    }
    void g
  }

  private updatePose(g: Game) {
    const f = Math.floor(this.animT * (this.runMode ? 10 : 6))
    if (this.moving) {
      if (this.z > 2 && Math.abs(this.z - this.tz) > 2) this.pose = 'jump'
      else if (this.runMode) this.pose = f % 2 ? 'run0' : 'run1'
      else this.pose = (['walk0', 'walk1', 'walk2', 'walk3'] as const)[f % 4]
      return
    }
    const slow = Math.floor(this.animT * 2)
    switch (this.state) {
      case 'EAT':
      case 'DRINK':
        this.pose = slow % 2 ? 'eat0' : 'eat1'
        break
      case 'SLEEP':
        this.pose = this.restPose === 'sleepBelly' ? 'sleepBelly' : Math.floor(this.animT / 1.4) % 2 ? 'sleep0' : 'sleep1'
        break
      case 'SUNBATHE':
        this.pose = this.restPose
        break
      case 'GROOM':
        this.pose = slow % 2 ? 'groom0' : 'groom1'
        break
      case 'PLAY':
        this.pose = Math.floor(this.animT * 3) % 3 === 0 ? 'pounce1' : 'pounce0'
        break
      case 'SCRATCH':
        this.pose = Math.floor(this.animT * 4) % 2 ? 'scratch0' : 'scratch1'
        break
      case 'TOILET':
        this.pose = 'sit'
        break
      case 'HIDE':
        this.pose = 'loaf'
        break
      case 'WATCH':
        this.pose = this.restPose === 'sitLook' ? 'sitLook' : 'sit'
        break
      case 'SOCIAL':
        this.pose = this.restPose
        break
      case 'FLEE':
        this.pose = 'hiss'
        break
      case 'ENTER':
      case 'LEAVE':
        this.pose = 'stand'
        break
      default: {
        // REST / WANDER / PERCH：坐着偶尔眨眼
        const blink = this.animT % 4 < 0.18
        if (this.restPose === 'sit' && blink) this.pose = 'sitBlink'
        else if (this.bubble && this.restPose === 'sit') this.pose = 'meow'
        else this.pose = this.restPose
      }
    }
    void g
  }

  // ================= 进入 / 离开 =================

  enter(g: Game) {
    const wr = walkRect(g.s.yardLevel)
    const fromWall = chance(0.45)
    if (fromWall) {
      // 从墙头跳下来
      this.x = randRange(wr.x + 10, wr.x + wr.w - 10)
      this.y = wr.y - 2
      this.z = 26
      this.tz = 0
      this.facing = chance(0.5) ? 1 : -1
      this.setState('ENTER', 0)
      this.moveTo(this.x + randRange(-12, 12), wr.y + randRange(8, 22), () => this.afterEnter(g), false, 0)
    } else {
      const d = g.door
      this.x = d.x + randRange(-6, 6)
      this.y = d.y
      this.setState('ENTER', 0)
      this.moveTo(d.x + randRange(-30, 30), wr.y + wr.h - randRange(6, 30), () => this.afterEnter(g))
    }
  }

  private afterEnter(g: Game) {
    // 观察
    this.restPose = 'sit'
    this.setState('WATCH', randRange(1.2, 3))
    if (this.visitFirst) this.say(g, 'firstVisit', true)
    else if (chance(0.55)) this.say(g, g.famLevelOf(this) >= 2 ? 'returnVisit' : 'arrive')
  }

  startLeave(g: Game, run = false) {
    if (this.leaving) return
    this.leaving = true
    this.clearTarget(g)
    this.z = this.z > 2 ? this.z : 0
    this.tz = 0
    if (chance(0.4)) this.say(g, 'leave')
    g.onCatLeaving(this)
    const wr = walkRect(g.s.yardLevel)
    this.setState('LEAVE', 0)
    if (chance(0.5)) {
      const d = g.door
      this.moveTo(d.x + randRange(-6, 6), wr.y + wr.h, () => {
        this.moveTo(d.x, d.y + 10, () => (this.gone = true), run)
      }, run)
    } else {
      const x = randRange(wr.x + 10, wr.x + wr.w - 10)
      this.moveTo(x, wr.y + 2, () => {
        // 跳上墙离开
        this.moveTo(x + randRange(-4, 4), wr.y - 4, () => {
          this.gone = true
        }, run, 30)
      }, run)
    }
  }

  // ================= 决策 =================

  interrupt(g: Game) {
    this.clearTarget(g)
    this.moving = false
    this.onArrive = null
    this.tz = 0
    this.setState('WANDER', 0.01)
  }

  finishState(g: Game) {
    const st = this.state
    const b = this.target
    if (st === 'EAT' && b) g.catAte(this, b)
    if (st === 'DRINK' && b) g.catDrank(this, b)
    if (st === 'TOILET' && b) g.catUsedLitter(this, b)
    if (st === 'SLEEP') {
      g.addFam(this, 2)
      if (chance(0.2)) this.say(g, 'waking')
    }
    if (st === 'PLAY' || st === 'SCRATCH') g.stat('playSessions')
    if (st === 'SOCIAL' && this.socialWith) this.socialWith = null
    if (st === 'GROOM') this.needs.dirty = Math.max(0, this.needs.dirty - 30)
    this.clearTarget(g)
    if (this.leaving) return
    // 从高处跳下
    if (this.z > 1) {
      this.tz = 0
    }
    this.think(g)
  }

  think(g: Game) {
    if (this.leaving) return
    const n = this.needs
    const opts: Option[] = []
    const add = (w: number, run: () => boolean) => w > 0 && opts.push({ w, run })
    const rainy = isRainy(g.weather)
    const cold = g.temperature < 6
    const night = g.clock.isNight

    if (rainy && !this.sheltered && !this.has('rainLover')) add(60, () => this.seekShelter(g))
    add(n.hunger > 45 ? (n.hunger - 30) * (this.has('greedy') || this.has('foodie') ? 1.6 : 1) : 0, () => this.goEat(g))
    add(n.thirst > 50 ? n.thirst - 35 : 0, () => this.goDrink(g))
    add(n.fatigue > 45 ? (n.fatigue - 30) * (this.has('lazy') ? 1.7 : 1) * (night && !this.has('nocturnal') ? 1.5 : 1) * (cold ? 1.3 : 1) : 0, () => this.goSleep(g))
    add(n.boredom > 35 ? (n.boredom - 20) * (this.has('lively') || this.has('naughty') ? 1.5 : 1) * (this.has('lazy') ? 0.5 : 1) : 0, () => this.goPlay(g))
    add(n.dirty > 55 ? n.dirty - 40 : 0, () => this.goToilet(g))
    add(n.safety < 35 ? (50 - n.safety) * 1.5 : 0, () => this.goHide(g))
    add(this.has('boxLover') ? 18 : 0, () => this.goBox(g))
    add(n.social > 50 ? (n.social - 30) * (this.has('loner') || this.has('shy') ? 0.3 : 1) : 0, () => this.goSocial(g))
    add(8 + n.dirty * 0.2, () => this.goGroom(g))
    add(g.sunSpots.length ? (this.has('lazy') ? 30 : 14) * (cold ? 1.5 : 1) : 0, () => this.goSun(g))
    add(this.prefersHigh() ? 20 : 6, () => this.goPerch(g))
    add(8 + (this.has('curious') ? 12 : 0), () => this.goWatch(g))
    add(12 + (this.has('curious') ? 8 : 0) + (this.has('lively') ? 8 : 0), () => this.goWander(g))
    add(10 + (this.has('lazy') ? 10 : 0), () => this.goRest(g))
    if (rainy && this.has('rainLover')) add(25, () => this.goWatchRain(g))

    // 尝试最多 4 次
    for (let i = 0; i < 4 && opts.length; i++) {
      const o = pickWeighted(opts, (x) => x.w)!
      if (o.run()) return
      opts.splice(opts.indexOf(o), 1)
    }
    this.goRest(g)
  }

  prefersHigh() {
    return this.favoriteFacilities.includes('high') || this.has('aloof') || this.has('curious') || this.favoriteFacilities.includes('roof')
  }

  /** 设施偏好分数 */
  pref(b: PlacedBuilding, g: Game) {
    const d = def(b)
    let s = 1
    if (this.favoriteFacilities.includes(d.id)) s += 3
    for (const t of d.tags) if (this.favoriteFacilities.includes(t)) s += 1.5
    if (this.has('boxLover') && d.tags.includes('box')) s += 6
    if (this.has('lazy') && d.tags.includes('soft')) s += 1
    if ((this.has('timid') || this.has('shy')) && d.tags.includes('hide')) s += 1.5
    if (g.temperature < 8 && d.tags.includes('warm')) s += 3
    if (this.prefersHigh() && d.tags.includes('high')) s += 1.2
    if (this.has('clean') && d.dirtCap && b.dirt / d.dirtCap > 0.5) s *= 0.2
    const a = bAnchor(b)
    const dist = Math.hypot(a.x - this.x, a.y - this.y)
    return s / (1 + dist / 160)
  }

  private chooseBuilding(g: Game, filter: (b: PlacedBuilding) => boolean, score?: (b: PlacedBuilding) => number) {
    const list = g.s.buildings.filter((b) => filter(b) && g.freeSlot(b) >= 0)
    if (!list.length) return null
    return pickWeighted(list, (b) => (score ? score(b) : this.pref(b, g))) ?? null
  }

  /** 走到设施的使用点 */
  private goUse(g: Game, b: PlacedBuilding, then: () => void) {
    const slot = g.reserve(b, this)
    if (slot < 0) return false
    this.target = b
    this.slot = slot
    const d = def(b)
    const p = tileToPx(b.x, b.y)
    const up = usePoint(d.art, d.w, d.h, slot)
    // usePoint 以画布为坐标（含 headroom）
    const fx = b.flip ? d.w * TILE - up.x : up.x
    const x = p.x + fx
    const groundY = p.y + d.h * TILE
    const visualY = p.y + up.y - HEADROOM
    let y = Math.max(visualY, p.y + 2)
    let z = 0
    if (d.perchHeight || CONTAINER_ARTS.has(d.art) || d.tags.includes('box')) {
      // 站在高处或钻进容器：逻辑位置放在设施前方（保证绘制顺序），视觉上抬高
      y = groundY + 0.5
      z = Math.max(0, groundY - visualY)
    }
    this.moveTo(x, y, () => {
      this.facing = chance(0.5) ? 1 : -1
      then()
    }, false, z)
    return true
  }

  goEat(g: Game) {
    const b = this.chooseBuilding(
      g,
      (b) => def(b).action === 'eat' && ((def(b).foodCap ?? 0) === 0 || b.food > 0),
      (b) => {
        let s = this.pref(b, g)
        if ((def(b).foodCap ?? 0) > 0 && this.favoriteFoods.includes(b.foodType)) s *= 2.5
        if ((def(b).foodCap ?? 0) === 0) s *= 0.25
        return s
      },
    )
    if (!b) {
      // 没吃的：走到空碗前抱怨
      const empty = g.s.buildings.find((x) => def(x).action === 'eat' && (def(x).foodCap ?? 0) > 0)
      if (empty) {
        const a = bAnchor(empty)
        this.moveTo(a.x + randRange(-8, 8), a.y - 2, () => {
          this.restPose = 'sitLook'
          this.setState('WATCH', randRange(2, 4))
          this.say(g, 'foodEmpty', true)
          this.stay -= 25
        })
        return true
      }
      if (this.needs.hunger > 70 && chance(0.4)) {
        this.say(g, 'hungry')
        this.stay -= 30
      }
      return false
    }
    return this.goUse(g, b, () => {
      if ((def(b).foodCap ?? 0) > 0 && b.food <= 0) {
        this.say(g, 'foodEmpty', true)
        this.clearTarget(g)
        this.setState('REST', 2)
        return
      }
      this.setState('EAT', randRange(7, 13))
      if (chance(0.35)) {
        const fav = this.favoriteFoods.includes(b.foodType)
        this.say(g, fav ? 'eatingFav' : b.foodType === 'fish' ? 'eatingFish' : b.foodType === 'canned' ? 'eatingCanned' : 'eating')
      }
    })
  }

  goDrink(g: Game) {
    const b = this.chooseBuilding(
      g,
      (b) => def(b).action === 'drink' && b.water > 0,
      (b) => this.pref(b, g) * (def(b).tags.includes('flowing') && this.favoriteFacilities.includes('flowing') ? 3 : 1),
    )
    if (!b) {
      if (this.needs.thirst > 70 && chance(0.5)) this.say(g, g.s.buildings.some((x) => def(x).action === 'drink') ? 'waterEmpty' : 'thirsty')
      return false
    }
    return this.goUse(g, b, () => {
      this.setState('DRINK', randRange(4, 7))
      if (chance(0.25)) this.say(g, def(b).tags.includes('flowing') ? 'drinkingFlowing' : 'drinking')
    })
  }

  goSleep(g: Game) {
    const b = this.chooseBuilding(g, (b) => {
      const d = def(b)
      return d.action === 'sleep' || (d.action === 'hide' && d.tags.includes('hide'))
    })
    if (!b) {
      // 就地睡
      const spot = g.sunSpots.length && chance(0.6) ? pick(g.sunSpots) : null
      if (spot) return this.goSun(g)
      this.wanderPoint(g, () => {
        this.restPose = 'sleep0'
        this.setState('SLEEP', randRange(20, 45))
      })
      return true
    }
    return this.goUse(g, b, () => {
      const d = def(b)
      if (d.tags.includes('box') || CONTAINER_ARTS.has(d.art)) this.crop = d.art === 'plushBed' || d.art === 'basket' ? 4 : 6
      this.restPose = this.has('lazy') && g.famLevelOf(this) >= 3 && chance(0.3) && !this.crop ? 'sleepBelly' : 'sleep0'
      this.setState('SLEEP', randRange(25, 60) * (this.has('lazy') ? 1.4 : 1))
      if (chance(0.25)) this.say(g, d.tags.includes('box') ? 'box' : d.tags.includes('warm') && g.temperature < 10 ? 'heater' : 'sleepy')
      g.stat('sleepCount')
    })
  }

  goPlay(g: Game) {
    const b = this.chooseBuilding(g, (b) => ['play', 'scratch', 'perch', 'watch'].includes(def(b).action))
    if (!b) {
      // 自娱自乐：追尾巴 / 扑空气
      if (chance(0.5)) {
        this.wanderPoint(g, () => {
          this.setState('PLAY', randRange(3, 6))
          if (chance(0.3)) this.say(g, 'bored')
        })
        return true
      }
      return false
    }
    const d = def(b)
    return this.goUse(g, b, () => {
      if (d.action === 'scratch') {
        this.setState('SCRATCH', randRange(4, 8))
        if (chance(0.3)) this.say(g, 'scratching')
        g.sfx('scratch')
      } else if (d.action === 'perch') {
        this.restPose = chance(0.5) ? 'loaf' : 'sit'
        this.setState('PERCH', randRange(12, 30))
        if (chance(0.3)) this.say(g, 'tower')
      } else if (d.action === 'watch') {
        this.restPose = d.tags.includes('pond') ? 'loaf' : 'sitLook'
        this.setState('WATCH', randRange(10, 25))
        if (chance(0.3)) this.say(g, d.tags.includes('pond') ? 'fishPond' : 'watching')
      } else {
        this.setState('PLAY', randRange(6, 14))
        if (d.tags.includes('butterfly') && chance(0.4)) this.say(g, 'butterfly')
        else if (chance(0.3)) this.say(g, 'playing')
      }
    })
  }

  goToilet(g: Game) {
    const b = this.chooseBuilding(g, (b) => def(b).action === 'toilet' && b.dirt < (def(b).dirtCap ?? 10))
    if (!b) {
      const dirty = g.s.buildings.find((x) => def(x).action === 'toilet')
      if (dirty && chance(0.6)) this.say(g, 'litterDirty')
      this.needs.dirty = Math.max(0, this.needs.dirty - 20)
      return false
    }
    return this.goUse(g, b, () => {
      this.setState('TOILET', randRange(3, 5))
      if (chance(0.15)) this.say(g, 'toilet')
    })
  }

  goHide(g: Game, run = false) {
    const b = this.chooseBuilding(g, (b) => def(b).tags.includes('hide'))
    if (!b) return false
    g.stat('hideCount')
    const ok = this.goUse(g, b, () => {
      const d = def(b)
      this.crop = d.art === 'bush' || d.art === 'bambooGrove' ? 9 : d.tags.includes('tunnel') ? 7 : 6
      this.setState('HIDE', randRange(10, 25))
      if (chance(0.3)) this.say(g, 'hiding')
    })
    if (ok && run) this.runMode = true
    return ok
  }

  goBox(g: Game) {
    const b = this.chooseBuilding(g, (b) => def(b).tags.includes('box'))
    if (!b) return false
    return this.goUse(g, b, () => {
      this.crop = 6
      this.restPose = 'loaf'
      this.setState('SLEEP', randRange(20, 50))
      if (chance(0.4)) this.say(g, 'box')
    })
  }

  goSocial(g: Game) {
    const others = g.cats.filter((c) => c !== this && !c.leaving && !c.scripted && !c.moving && c.z < 2 && c.state !== 'SLEEP' && c.state !== 'HIDE' && c.crop === 0)
    if (!others.length) return false
    const o = pickWeighted(others, (c) => (g.relation(this, c) + 120) / (1 + Math.hypot(c.x - this.x, c.y - this.y) / 80))!
    const side = this.x < o.x ? -1 : 1
    const wr = walkRect(g.s.yardLevel)
    this.socialWith = o
    this.moveTo(clamp(o.x + side * 14, wr.x, wr.x + wr.w), o.y + randRange(-2, 2), () => {
      if (o.gone || o.leaving) return this.think(g)
      this.facing = o.x > this.x ? 1 : -1
      g.socialize(this, o)
    })
    this.setState('SOCIAL', 0)
    return true
  }

  goGroom(g: Game) {
    this.setState('GROOM', randRange(4, 8))
    if (chance(0.2)) this.say(g, 'grooming')
    return true
  }

  goSun(g: Game) {
    if (!g.sunSpots.length) return false
    const s = pick(g.sunSpots)
    this.moveTo(s.x + randRange(-4, 4), s.y + randRange(-3, 3), () => {
      this.restPose = chance(0.4) ? 'sleepBelly' : chance(0.5) ? 'loaf' : 'sleep0'
      this.setState('SUNBATHE', randRange(18, 45))
      g.stat('sunbathes')
      if (chance(0.35)) this.say(g, 'sunbathing')
    })
    return true
  }

  goPerch(g: Game) {
    const b = this.chooseBuilding(g, (b) => def(b).action === 'perch' || (!!def(b).perchHeight && def(b).action !== 'sleep'))
    if (!b) return false
    return this.goUse(g, b, () => {
      this.restPose = chance(0.5) ? 'loaf' : 'sit'
      this.setState('PERCH', randRange(12, 30))
      if (chance(0.25)) this.say(g, 'perching')
    })
  }

  goWatch(g: Game) {
    const b = this.chooseBuilding(g, (b) => def(b).action === 'watch')
    if (b && chance(0.6))
      return this.goUse(g, b, () => {
        this.restPose = def(b).tags.includes('pond') ? 'loaf' : 'sitLook'
        this.setState('WATCH', randRange(10, 22))
        if (chance(0.3)) this.say(g, def(b).tags.includes('pond') ? 'fishPond' : 'watching')
      })
    // 坐着看天空 / 发呆
    this.wanderPoint(g, () => {
      this.restPose = 'sitLook'
      this.setState('WATCH', randRange(5, 12))
      if (chance(0.2)) this.say(g, 'watching')
    })
    return true
  }

  goWatchRain(g: Game) {
    this.wanderPoint(g, () => {
      this.restPose = 'sitLook'
      this.setState('WATCH', randRange(10, 20))
      if (chance(0.4)) this.say(g, g.weather === 'heavyRain' ? 'heavyRain' : 'lightRain')
    })
    return true
  }

  goWander(g: Game) {
    this.setState('WANDER', 0)
    this.wanderPoint(g, () => {
      this.restPose = chance(0.5) ? 'sit' : 'stand'
      this.setState('REST', randRange(1, 4))
    })
    return true
  }

  goRest(g: Game) {
    this.restPose = chance(0.5) ? 'loaf' : 'sit'
    this.setState('REST', randRange(4, 10))
    return true
  }

  seekShelter(g: Game) {
    this.clearTarget(g)
    // 优先：遮雨棚区域
    const rects = g.shelters
    if (rects.length) {
      const r = pick(rects)
      const wr = walkRect(g.s.yardLevel)
      const x = clamp(randRange(r.x + 6, r.x + r.w - 6), wr.x, wr.x + wr.w)
      const y = clamp(randRange(r.y + r.h * 0.4, r.y + r.h - 3), wr.y, wr.y + wr.h)
      if (inRect(x, y, r)) {
        this.moveTo(x, y, () => {
          this.restPose = chance(0.5) ? 'loaf' : 'sitLook'
          this.setState('REST', randRange(15, 35))
          if (chance(0.45)) this.say(g, 'rainSheltered')
        }, g.weather !== 'lightRain')
        return true
      }
    }
    if (this.goHide(g, true)) return true
    // 无处可躲：抱怨并提前离开
    if (chance(0.6)) this.say(g, 'rainNoShelter', true)
    this.stay = Math.min(this.stay, randRange(3, 10))
    return false
  }

  wanderPoint(g: Game, then: () => void) {
    const wr = walkRect(g.s.yardLevel)
    let x = this.x + randRange(-90, 90)
    let y = this.y + randRange(-40, 40)
    x = clamp(x, wr.x, wr.x + wr.w)
    y = clamp(y, wr.y, wr.y + wr.h)
    this.moveTo(x, y, then)
  }

  tickState(dt: number, g: Game) {
    if (this.state === 'PLAY' && !this.target && rand() < dt * 0.6) this.facing = this.facing === 1 ? -1 : 1
    void g
  }
}
