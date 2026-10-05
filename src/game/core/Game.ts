import { BUILDING_MAP, FOOD_PRICE, YARD_LEVELS } from '@/data/buildings'
import { CATS } from '@/data/cats'
import { ITEMS, itemName } from '@/data/items'
import { ACHIEVEMENTS, type AchievementDef } from '@/data/achievements'
import { PAIR_LINES, type DialogueContext } from '@/data/dialogue'
import type { CatDef, CatRecord, FoodType, LogEntry, PlacedBuilding, SaveData, WeatherType } from '../types'
import { RAINY, WEATHER_LABEL } from '../types'
import { Bus } from './bus'
import { chance, clamp, hash, pick, randInt, randRange } from './rng'
import { computeClock, realMinuteOfDay, TIME_SPEED, type Clock } from '../world/clock'
import { isRainy, nextWeather, temperatureOf } from '../world/weather'
import {
  bAnchor, canPlace, computeYardStats, def, doorPos, inRect, shelterRects, sunSpots, walkRect,
  yardRect, type Rect, type YardStats,
} from '../world/yard'
import { FAM_LABEL, famLevel, RANDOM_CAT_BASE } from '../constants'
import { Cat } from '../cats/Cat'
import { generateCat } from '../cats/catGen'
import { pickLine } from '../cats/talk'
import { chooseVisitor, nextRandomSeed } from '../cats/spawner'
import { giftChance, rollGift } from '../gifts/gifts'
import { defaultSave, loadSave, writeSave } from '../save/save'
import { EventSystem } from '../events/events'
import { audio } from '../audio/audio'

export interface GroundGift {
  x: number
  y: number
  items: string[]
  from: number
  fromName: string
}

export interface OfflineReport {
  seconds: number
  visits: number
  gifts: number
  food: number
  water: number
  newCats: string[]
  hearts: number
}

type Timer = { t: number; fn: () => void }

export class Game {
  s: SaveData = defaultSave()
  bus = new Bus()
  clock: Clock = computeClock(this.s.gameMinutes, false)
  cats: Cat[] = []
  yard: YardStats = computeYardStats(this.s, 'sunny', 0)
  temperature = 20
  firstSnowActive = false
  sunSpots: { x: number; y: number; r: number }[] = []
  shelters: Rect[] = []
  walk: Rect = walkRect(1)
  door = doorPos()
  maxCats = 2
  ready = false
  paused = false
  buildMode = false
  thunderFlash = 0
  events = new EventSystem(this)
  /** 设施占用：uid -> 槽位数组 */
  private slots = new Map<number, (Cat | null)[]>()
  private timers: Timer[] = []
  private spawnT = 6
  private statT = 0
  private achT = 0
  private saveT = 0
  private autoT = 0
  private lastDay = 0
  private lastPeriod = ''
  private distinctCache = { items: -1, buildings: -1 }
  offlineReport: OfflineReport | null = null

  get weather(): WeatherType {
    return this.s.weather.type
  }

  /** 上帝模式：所有素材无限 */
  get godMode(): boolean {
    return this.s.settings.godMode
  }

  /** 材料持有数（上帝模式下视为无限） */
  invCount(id: string): number {
    return this.godMode ? Infinity : (this.s.inventory[id] ?? 0)
  }

  // ================= 初始化 =================

  async init() {
    const saved = await loadSave()
    if (saved) this.s = saved
    if (this.s.settings.timeMode === 'real') this.alignRealTime()
    this.refreshWorld()
    this.lastDay = this.clock.day
    this.lastPeriod = this.clock.period
    // 离线模拟
    const offSec = (Date.now() - this.s.lastActive) / 1000
    if (saved && offSec > 120 && this.s.tutorialStep >= 4) this.simulateOffline(offSec)
    this.refreshWorld()
    // 新手引导中途刷新页面的恢复
    if (this.s.tutorialStep === 2) this.after(5, () => this.tutorialFirstCat())
    if (this.s.tutorialStep === 3 && !this.s.gifts.length) {
      const a = this.walk
      this.s.gifts.push({ x: a.x + a.w / 2, y: a.y + a.h - 10, items: ['bottlecap'], from: 1, fromName: '橘子' })
    }
    this.ready = true
    this.changed()
  }

  /** 重置游戏 */
  reset(data?: SaveData) {
    for (const c of this.cats) this.release(c)
    this.cats = []
    this.slots.clear()
    this.timers = []
    this.s = data ?? defaultSave()
    if (this.s.settings.timeMode === 'real') this.alignRealTime()
    this.refreshWorld()
    this.lastDay = this.clock.day
    this.changed()
    this.save()
  }

  alignRealTime() {
    const day = Math.floor(this.s.gameMinutes / 1440)
    this.s.gameMinutes = day * 1440 + realMinuteOfDay()
  }

  refreshWorld() {
    this.clock = computeClock(this.s.gameMinutes, this.s.settings.realSeason)
    this.walk = walkRect(this.s.yardLevel)
    this.shelters = shelterRects(this.s)
    this.sunSpots = sunSpots(this.s, this.clock.day, this.clock.hourF, this.weather)
    this.temperature = temperatureOf(this.clock.season, this.clock.hourF, this.weather)
    this.recomputeStats()
  }

  recomputeStats() {
    this.yard = computeYardStats(this.s, this.weather, this.relationScore())
    const L = YARD_LEVELS[this.s.yardLevel - 1]
    this.maxCats = Math.max(2, Math.round(L.maxCats * (0.5 + (0.5 * this.yard.warmth) / 100)))
    this.statMax('warmthMax', this.yard.warmth)
  }

  relationScore() {
    let sc = 8
    for (const id in this.s.cats) {
      const l = famLevel(this.s.cats[id].familiarity)
      if (l >= 2) sc += l * 2.5
    }
    return sc
  }

  changed() {
    this.bus.emit('change')
  }

  // ================= 主循环 =================

  tick(dtReal: number) {
    if (!this.ready || this.paused) return
    const dt = Math.min(dtReal, 0.25)
    // 时间推进
    const speed = TIME_SPEED[this.s.settings.timeMode]
    this.s.gameMinutes += dt * speed
    this.clock = computeClock(this.s.gameMinutes, this.s.settings.realSeason)
    if (this.clock.day !== this.lastDay) this.onNewDay()
    if (this.clock.period !== this.lastPeriod) {
      this.lastPeriod = this.clock.period
      this.sunSpots = sunSpots(this.s, this.clock.day, this.clock.hourF, this.weather)
    }
    // 天气
    if (this.s.gameMinutes >= this.s.weather.until) this.changeWeather()
    if (this.weather === 'storm') {
      if (this.thunderFlash <= 0 && chance(dt * 0.06)) {
        this.thunderFlash = 1
        audio.sfx('thunder')
      }
    }
    if (this.thunderFlash > 0) this.thunderFlash = Math.max(0, this.thunderFlash - dt * 1.5)

    // 定时器（脚本）
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i]
      tm.t -= dt
      if (tm.t <= 0) {
        this.timers.splice(i, 1)
        tm.fn()
      }
    }

    // 设施自动化
    this.autoT += dt
    if (this.autoT > 3) {
      this.tickBuildings(this.autoT)
      this.autoT = 0
    }

    // 猫咪
    for (const c of this.cats) c.update(dt, this)
    const gone = this.cats.filter((c) => c.gone)
    if (gone.length) {
      for (const c of gone) this.onCatGone(c)
      this.cats = this.cats.filter((c) => !c.gone)
      this.changed()
    }

    // 来访
    if (this.s.tutorialStep >= 4) {
      this.spawnT -= dt
      if (this.spawnT <= 0) {
        this.spawnT = randRange(4, 10) / (0.6 + this.yard.warmth / 100)
        if (this.cats.length < this.maxCats) this.spawnVisitor()
        // 空位较多时，偶尔结伴而来
        if (this.cats.length < this.maxCats * 0.6 && chance(0.35)) this.after(randRange(1, 3), () => this.cats.length < this.maxCats && this.spawnVisitor())
      }
    }

    this.events.update(dt)

    // 周期性统计
    this.statT += dt
    if (this.statT > 1) {
      this.statT = 0
      this.temperature = temperatureOf(this.clock.season, this.clock.hourF, this.weather)
      this.shelters = shelterRects(this.s)
      this.recomputeStats()
      this.statMax('maxSimultaneous', this.cats.length)
      this.statMax('maxEating', this.cats.filter((c) => c.state === 'EAT' && !c.moving).length)
      this.statMax('maxSleeping', this.cats.filter((c) => (c.state === 'SLEEP' || c.state === 'SUNBATHE') && !c.moving).length)
      this.statMax('giftsOnGround', this.s.gifts.length)
      this.bus.emit('tick')
    }
    this.achT += dt
    if (this.achT > 3) {
      this.achT = 0
      this.checkAchievements()
    }
    this.saveT += dt
    if (this.saveT > 20) {
      this.saveT = 0
      this.save()
    }
    audio.update(this)
  }

  onNewDay() {
    this.lastDay = this.clock.day
    this.stat('daysPlayed')
    this.addLog(`第 ${this.clock.day} 天开始了`, 'system')
    const sk = 'season_' + this.clock.season
    if (!this.s.stats[sk]) {
      this.s.stats[sk] = 1
      this.stat('seasonsSeen')
    }
    if (this.clock.specialDay) this.stat('specialDays')
    if (this.clock.fullMoon) this.stat('fullMoonSeen')
    this.sunSpots = sunSpots(this.s, this.clock.day, this.clock.hourF, this.weather)
  }

  changeWeather() {
    const prev = this.weather
    const { type, duration } = nextWeather(this.clock.season, prev, this.clock.hourF)
    this.setWeather(type, duration)
  }

  setWeather(type: WeatherType, duration: number) {
    const prev = this.weather
    this.s.weather = { type, until: this.s.gameMinutes + duration, prev }
    this.firstSnowActive = false
    if (type === 'snow') {
      const key = `${Math.floor((this.clock.day - 1) / 36)}-${this.clock.season}`
      if (!this.s.seasonFirstSnow[key]) {
        this.s.seasonFirstSnow[key] = true
        this.firstSnowActive = true
        this.stat('firstSnowSeen')
        this.toast('今年的第一场雪落下来了……', '❄️')
      }
    }
    if (type === 'rainbow') this.stat('rainbowSeen')
    const wk = 'weather_' + type
    if (!this.s.stats[wk]) this.s.stats.weathersSeen = (this.s.stats.weathersSeen ?? 0) + 1
    this.stat(wk)
    if (type !== prev) this.addLog(`天气变成了${WEATHER_LABEL[type]}`, 'system')
    this.sunSpots = sunSpots(this.s, this.clock.day, this.clock.hourF, this.weather)
    this.recomputeStats()
    this.bus.emit('weather', type)
    this.changed()
  }

  tickBuildings(dt: number) {
    const rain = isRainy(this.weather)
    let changed = false
    for (const b of this.s.buildings) {
      const d = def(b)
      if (d.autoFill) {
        if (d.foodCap && b.food < d.foodCap && chance(dt / 25)) {
          b.food++
          if (!d.foods?.includes(b.foodType)) b.foodType = 'kibble'
          changed = true
        }
        if (d.waterCap && b.water < d.waterCap && chance(dt / 12)) {
          b.water = Math.min(d.waterCap, b.water + 2)
          changed = true
        }
      }
      if (d.id === 'rain_barrel' && rain && d.waterCap && b.water < d.waterCap) {
        b.water = Math.min(d.waterCap, b.water + 1)
        changed = true
      }
      if (d.autoClean && b.dirt > 0 && chance(dt / 20)) {
        b.dirt--
        changed = true
      }
      if (d.id === 'clean_robot' && this.s.trash.length && chance(dt / 15)) {
        this.s.trash.shift()
        changed = true
      }
    }
    if (changed) this.changed()
  }

  // ================= 定时 / 脚本工具 =================

  after(sec: number, fn: () => void) {
    this.timers.push({ t: sec, fn })
  }
  wait(sec: number) {
    return new Promise<void>((r) => this.after(sec, r))
  }
  walkTo(c: Cat, x: number, y: number, run = false) {
    return new Promise<void>((r) => {
      x = clamp(x, this.walk.x, this.walk.x + this.walk.w)
      y = clamp(y, this.walk.y, this.walk.y + this.walk.h)
      c.moveTo(x, y, () => r(), run)
    })
  }

  // ================= 设施占用 =================

  freeSlot(b: PlacedBuilding) {
    const cap = def(b).capacity
    const arr = this.slots.get(b.uid) ?? []
    for (let i = 0; i < cap; i++) if (!arr[i]) return i
    return -1
  }
  reserve(b: PlacedBuilding, c: Cat) {
    const i = this.freeSlot(b)
    if (i < 0) return -1
    const arr = this.slots.get(b.uid) ?? []
    arr[i] = c
    this.slots.set(b.uid, arr)
    return i
  }
  release(c: Cat) {
    if (!c.target) return
    const arr = this.slots.get(c.target.uid)
    if (arr) for (let i = 0; i < arr.length; i++) if (arr[i] === c) arr[i] = null
  }
  occupants(b: PlacedBuilding) {
    return (this.slots.get(b.uid) ?? []).filter(Boolean) as Cat[]
  }

  isSheltered(x: number, y: number) {
    return this.shelters.some((r) => inRect(x, y, r))
  }

  hasFood() {
    return this.s.buildings.some((b) => (def(b).foodCap ?? 0) > 0 && b.food > 0)
  }
  availableFoods() {
    const set = new Set<FoodType>()
    for (const b of this.s.buildings) if ((def(b).foodCap ?? 0) > 0 && b.food > 0) set.add(b.foodType)
    return set
  }
  hasFacility(key: string) {
    return this.s.buildings.some((b) => b.defId === key || def(b).tags.includes(key))
  }

  // ================= 猫咪 =================

  catDef(id: number): CatDef | undefined {
    return CATS[id - 1]?.id === id ? CATS[id - 1] : CATS.find((c) => c.id === id)
  }

  famLevelById(id: number) {
    const r = this.s.cats[id]
    return r ? famLevel(r.familiarity) : 0
  }
  famLevelOf(c: Cat) {
    return c.isFixed ? this.famLevelById(c.id) : 0
  }

  record(id: number): CatRecord {
    let r = this.s.cats[id]
    if (!r) {
      r = this.s.cats[id] = {
        id, discovered: false, firstSeen: this.s.gameMinutes, visits: 0, familiarity: 0,
        treasureGiven: false, lastVisit: 0, petCount: 0, fed: 0, nightVisits: 0, rainVisits: 0,
      }
    }
    return r
  }

  spawnVisitor(forceId?: number) {
    let cat: Cat
    if (forceId) {
      cat = new Cat({ id: forceId, def: this.catDef(forceId) })
    } else {
      const d = chooseVisitor(this)
      if (d === undefined) return null
      if (d === null) {
        const seed = nextRandomSeed()
        cat = new Cat({ id: RANDOM_CAT_BASE + seed, gen: generateCat(seed) })
      } else cat = new Cat({ id: d.id, def: d })
    }
    this.addCat(cat)
    return cat
  }

  addCat(cat: Cat) {
    this.cats.push(cat)
    this.stat('visits')
    if (this.clock.isNight) this.stat('nightVisits')
    if (this.clock.period === 'dawn') this.stat('dawnVisits')
    if (isRainy(this.weather)) this.stat('rainVisits')
    if (this.weather === 'snow') this.stat('snowVisits')
    if (cat.def) {
      const r = this.record(cat.id)
      r.visits++
      r.lastVisit = this.s.gameMinutes
      if (this.clock.isNight) r.nightVisits++
      if (isRainy(this.weather)) r.rainVisits++
      if (!r.discovered) {
        r.discovered = true
        r.firstSeen = this.s.gameMinutes
        cat.visitFirst = true
        this.s.stats['cat_' + cat.id] = 1
        this.addHearts(5)
        this.addLog(`一只没见过的猫来了……图鉴解锁：「${cat.name}」`, 'new')
        this.bus.emit('newCat', cat.def)
        audio.sfx('unlock')
      } else {
        this.addLog(`${cat.name}来了`, 'arrive')
      }
      this.addFam(cat, 2)
    } else {
      this.stat('randomVisits')
      this.s.randomSeen++
      this.addLog(`${cat.name}来了`, 'arrive')
    }
    cat.enter(this)
    if (chance(0.5)) audio.sfx('meow', { pitch: this.catPitch(cat) })
    this.changed()
  }

  catPitch(c: Cat) {
    const b = c.appearance.body
    return b === 'kitten' || b === 'tiny' ? 1.4 : b === 'big' || b === 'chubby' ? 0.8 : 1 + (hash(c.id) - 0.5) * 0.3
  }

  onCatLeaving(c: Cat) {
    // 离开前留下礼物
    const forced = (c as any).forceGift as string[] | undefined
    if (forced || chance(giftChance(this, c))) {
      const g = forced ? { items: forced, treasure: false } : rollGift(this, c)
      const x = clamp(c.x + randRange(-6, 6), this.walk.x, this.walk.x + this.walk.w)
      const y = clamp(c.y, this.walk.y, this.walk.y + this.walk.h)
      this.dropGift(x, y, g.items, c)
      if (g.treasure && c.def) {
        this.record(c.id).treasureGiven = true
        c.say(this, 'treasureGive', true)
      } else if (chance(0.3)) c.say(this, 'giftGive')
    }
    if (c.def) this.addLog(`${c.name}离开了`, 'leave')
    const hearts = 1 + (c.ate ? 1 : 0)
    this.addHearts(hearts)
    if (c.def) this.addFam(c, 1)
  }

  onCatGone(c: Cat) {
    this.release(c)
    if (c.def) this.record(c.id).lastVisit = this.s.gameMinutes
  }

  dropGift(x: number, y: number, items: string[], c: Cat) {
    this.s.gifts.push({ x, y, items, from: c.id, fromName: c.name })
    if (this.s.gifts.length > 40) {
      const old = this.s.gifts.shift()!
      this.collectItems(old.items, true)
      this.addLog(`地上的礼物太多了，${old.fromName}的礼物被自动收进了仓库`, 'gift')
    }
    this.addLog(`${c.name}留下了一个礼物 🎁`, 'gift')
    this.changed()
  }

  openGift(index: number) {
    const g = this.s.gifts[index]
    if (!g) return null
    this.s.gifts.splice(index, 1)
    this.stat('giftsOpened')
    this.collectItems(g.items)
    audio.sfx('gift')
    this.bus.emit('giftOpened', g)
    if (this.s.tutorialStep === 3) {
      this.s.tutorialStep = 4
      this.bus.emit('tutorial')
    }
    this.changed()
    return g
  }

  /** 一键收取地上所有礼物，返回收取数量 */
  collectAllGifts() {
    const n = this.s.gifts.length
    if (!n) return 0
    // 只有一份时走单个打开的完整流程（弹窗展示内容）
    if (n === 1) return this.openGift(0) ? 1 : 0
    for (const gf of this.s.gifts.splice(0)) {
      this.stat('giftsOpened')
      this.collectItems(gf.items)
    }
    audio.sfx('gift')
    if (this.s.tutorialStep === 3) {
      this.s.tutorialStep = 4
      this.bus.emit('tutorial')
    }
    this.toast(`收下了 ${n} 份礼物，都放进仓库了`, '🎁')
    this.changed()
    return n
  }

  collectItems(items: string[], silent = false) {
    for (const id of items) {
      this.s.inventory[id] = (this.s.inventory[id] ?? 0) + 1
      this.stat('itemsCollected')
      this.stat('item_' + id)
      if (ITEMS[id]?.quality === 4) {
        this.stat('treasures')
        if (!silent) this.toast(`获得猫咪宝物「${itemName(id)}」`, '✨')
      }
    }
    this.distinctCache.items = -1
  }

  addFam(c: Cat, pts: number) {
    if (!c.def) return
    const r = this.record(c.id)
    const before = famLevel(r.familiarity)
    r.familiarity += pts
    const after = famLevel(r.familiarity)
    this.s.stats['fam_' + c.id] = after
    if (after > before) {
      this.addHearts(after * 2)
      this.addLog(`${c.name}和小院的关系变成了「${FAM_LABEL[after]}」`, 'social')
      this.toast(`${c.name}：${FAM_LABEL[after]}`, '💛')
      c.showEmote('♥', 2.5)
      this.after(1.2, () => c.say(this, ('fam' + after) as DialogueContext, true))
    }
  }

  catAte(c: Cat, b: PlacedBuilding) {
    const d = def(b)
    const fav = c.favoriteFoods.includes(b.foodType)
    if ((d.foodCap ?? 0) > 0) {
      if (b.food <= 0) return
      b.food--
      this.stat('foodServed')
      c.needs.hunger = Math.max(0, c.needs.hunger - (b.foodType === 'kibble' ? 50 : 70))
      if (c.def) this.record(c.id).fed++
      this.addFam(c, fav ? 4 : 2)
      c.ate = true
      if (chance(0.25)) this.addLog(`${c.name}吃了一碗${{ kibble: '猫粮', fish: '鱼干', canned: '罐头', treat: '冻干' }[b.foodType]}`, 'eat')
      if ((b.foodType === 'fish' || b.foodType === 'canned') && chance(this.hasFacility('trash_can') ? 0.05 : 0.25)) this.addTrash(c.x, c.y)
    } else {
      c.needs.hunger = Math.max(0, c.needs.hunger - 15)
      c.needs.dirty = Math.max(0, c.needs.dirty - 10)
      if (chance(0.15)) this.events.trigger('grass_eat', [c])
    }
    c.needs.dirty += 25
    audio.sfx('eat')
    this.changed()
  }

  catDrank(c: Cat, b: PlacedBuilding) {
    if (b.water <= 0) return
    b.water--
    c.needs.thirst = Math.max(0, c.needs.thirst - 60)
    c.needs.dirty += 12
    this.stat('waterServed')
    this.addFam(c, 1)
    audio.sfx('drink')
    this.changed()
  }

  catUsedLitter(c: Cat, b: PlacedBuilding) {
    const d = def(b)
    b.dirt = Math.min((d.dirtCap ?? 6), b.dirt + 1)
    c.needs.dirty = 0
    this.changed()
  }

  addTrash(x: number, y: number) {
    if (this.s.trash.length >= 12) return
    this.s.trash.push({ x: x + randRange(-6, 6), y: y + randRange(-2, 4) })
    this.changed()
  }

  pickTrash(i: number) {
    this.s.trash.splice(i, 1)
    this.stat('cleanings')
    if (chance(0.3)) this.collectItems(['fishbone'])
    audio.sfx('click')
    this.changed()
  }

  // ================= 社交与关系 =================

  relKey(a: number, b: number) {
    return a < b ? `${a}-${b}` : `${b}-${a}`
  }
  relation(a: Cat, b: Cat): number {
    const k = this.relKey(a.id, b.id)
    const v = this.s.relationships[k]
    if (v !== undefined) return v
    // 初始关系：由性格与“缘分”决定
    let r = (hash(a.id * 7919 + b.id * 104729 + Math.min(a.id, b.id)) - 0.4) * 60
    const both = (p: string) => a.personalities.includes(p as any) && b.personalities.includes(p as any)
    const any = (p: string) => a.personalities.includes(p as any) || b.personalities.includes(p as any)
    if (both('fighter')) r -= 35
    else if (any('fighter')) r -= 12
    if (any('gentle')) r += 15
    if (any('social')) r += 10
    if (any('loner') || any('aloof')) r -= 8
    if (any('kittenLover') && (a.appearance.body === 'kitten' || b.appearance.body === 'kitten')) r += 25
    // 橘子 × 奶牛：欢喜冤家
    if (k === '1-2') r = -25
    return clamp(Math.round(r), -100, 100)
  }
  changeRelation(a: Cat, b: Cat, d: number) {
    if (!a.isFixed || !b.isFixed) return
    const k = this.relKey(a.id, b.id)
    this.s.relationships[k] = clamp(this.relation(a, b) + d, -100, 100)
  }

  /** 两只猫碰面 */
  socialize(a: Cat, b: Cat) {
    const rel = this.relation(a, b)
    this.stat('social')
    a.needs.social = Math.max(0, a.needs.social - 40)
    b.needs.social = Math.max(0, b.needs.social - 25)
    const busyB = b.moving || b.scripted || b.state === 'SLEEP'
    if (rel > 35 && !busyB && chance(0.45)) {
      // 互相舔毛
      this.events.trigger('groom_each_other', [a, b])
      return
    }
    if (rel < -30 && !busyB && chance(0.5)) {
      this.events.trigger(chance(0.25) && (a.has('fighter') || b.has('fighter')) ? 'real_fight' : 'hiss_fight', [a, b])
      return
    }
    // 对话
    const pool = rel > 20 ? PAIR_LINES.good : rel < -20 ? PAIR_LINES.bad : PAIR_LINES.neutral
    const extra = isRainy(this.weather) ? PAIR_LINES.rain : this.clock.isNight ? PAIR_LINES.night : null
    let pair = pick(extra && chance(0.35) ? extra : pool)
    // 橘子与奶牛的经典对话
    if (this.relKey(a.id, b.id) === '1-2' && chance(0.4)) pair = a.id === 1 ? ['你又来了？', '这里又不是你家。'] : ['你又来了？', '……我天天都来。']
    a.restPose = 'sit'
    a.setState('SOCIAL', 5)
    this.talkRaw(a, pair[0], true)
    if (!busyB) {
      b.facing = a.x > b.x ? 1 : -1
      this.after(1.8, () => !b.gone && this.talkRaw(b, pair[1], true))
    }
    this.changeRelation(a, b, rel > 0 ? 2 : 1)
    if (chance(0.3)) this.addLog(`${a.name}和${b.name}聊了几句`, 'social')
  }

  // ================= 对话 =================

  talk(c: Cat, ctx: DialogueContext | string, force = false) {
    if (!force && (c.talkCd > 0 || !this.s.settings.bubbles)) return
    const speaking = this.cats.filter((x) => x.bubble).length
    if (!force && speaking >= 3) return
    const text = pickLine(this, c, ctx as DialogueContext)
    this.talkRaw(c, text, force)
  }

  talkRaw(c: Cat, text: string, force = false) {
    if (!this.s.settings.bubbles && !force) return
    c.bubble = { text, t: 0, dur: 2.6 + text.length * 0.12 }
    c.talkCd = randRange(8, 16)
    this.stat('catsTalked')
    if (chance(0.5)) audio.sfx('meow', { pitch: this.catPitch(c), soft: true })
    this.bus.emit('talk', c, text)
  }

  ambientContext(c: Cat): DialogueContext {
    const opts: [DialogueContext, number][] = []
    const add = (k: DialogueContext, w: number) => w > 0 && opts.push([k, w])
    const n = c.needs
    if (n.hunger > 70) add(this.hasFood() ? 'hungry' : 'foodEmpty', 6)
    if (n.thirst > 75) add('thirsty', 4)
    if (this.yard.hygiene < 35) add('yardDirty', 5)
    if (this.s.buildings.some((b) => def(b).dirtCap && b.dirt / def(b).dirtCap! > 0.7)) add('litterDirty', 3)
    const w = this.weather
    if (RAINY.includes(w)) add(c.sheltered ? 'rainSheltered' : 'rainNoShelter', 6)
    if (w === 'storm') add('storm', 4)
    if (w === 'heavyRain') add('heavyRain', 3)
    if (w === 'lightRain') add('lightRain', 3)
    if (w === 'snow') add('snow', 5)
    if (w === 'fog') add('fog', 4)
    if (w === 'windy') add('windy', 4)
    if (w === 'rainbow') add('rainbow', 6)
    if (w === 'sunny') add('sunny', 2)
    if (w === 'cloudy') add('cloudy', 1)
    if (w === 'overcast') add('overcast', 2)
    if (this.temperature < 5) add('cold', 4)
    if (this.temperature > 30) add('hot', 4)
    switch (c.state) {
      case 'EAT': add(c.target && c.favoriteFoods.includes(c.target.foodType) ? 'eatingFav' : 'eating', 8); break
      case 'DRINK': add('drinking', 6); break
      case 'PLAY': add('playing', 8); break
      case 'SCRATCH': add('scratching', 6); break
      case 'SUNBATHE': add('sunbathing', 8); break
      case 'PERCH': add('perching', 7); break
      case 'HIDE': add('hiding', 6); break
      case 'GROOM': add('grooming', 5); break
      case 'WATCH': add(c.target && def(c.target).tags.includes('pond') ? 'fishPond' : 'watching', 5); break
    }
    if (c.target && def(c.target).tags.includes('box')) add('box', 6)
    if (c.target && def(c.target).tags.includes('warm') && this.temperature < 12) add('heater', 6)
    if (this.cats.length >= Math.max(5, this.maxCats * 0.8)) add('crowded', 2)
    if (this.cats.length === 1) add('alone', 2)
    if (this.yard.warmth > 75) add('warmthHigh', 2)
    if (this.yard.warmth < 25) add('warmthLow', 2)
    if (n.boredom > 70) add('bored', 3)
    if (n.fatigue > 70) add('sleepy', 3)
    const fl = this.famLevelOf(c)
    if (fl >= 1) add(('fam' + fl) as DialogueContext, 2 + fl)
    add(this.clock.period, 2)
    add(this.clock.season, 1)
    add('idle', 4)
    let total = opts.reduce((a, b) => a + b[1], 0)
    let r = Math.random() * total
    for (const [k, wt] of opts) {
      r -= wt
      if (r <= 0) return k
    }
    return 'idle'
  }

  // ================= 玩家交互 =================

  /** 摸摸猫 */
  petCat(c: Cat): 'ok' | 'reject' | 'cooldown' {
    if (c.petCd > 0 || c.scripted) return 'cooldown'
    const lvl = this.famLevelOf(c)
    let p = 0.35 + lvl * 0.15
    if (c.has('clingy')) p += 0.3
    if (c.has('social')) p += 0.15
    if (c.has('aloof') || c.has('tsundere')) p -= 0.15
    if (c.has('timid') || c.has('shy')) p -= 0.2
    if (!c.isFixed) p = 0.4
    c.petCd = 6
    if (chance(p) && c.pets < 4) {
      c.pets++
      c.showEmote('♥', 2)
      this.stat('petCount')
      if (c.def) {
        this.record(c.id).petCount++
        this.addFam(c, 5)
      }
      audio.sfx('purr')
      c.say(this, 'petted', true)
      return 'ok'
    }
    c.showEmote('💢', 1.5)
    c.say(this, 'pettedDislike', true)
    if (lvl < 2 && (c.has('timid') || c.has('shy'))) {
      audio.sfx('hiss')
      c.interrupt(this)
      c.needs.safety = Math.max(0, c.needs.safety - 30)
      if (!c.goHide(this, true)) c.wanderPoint(this, () => c.goRest(this))
    }
    return 'reject'
  }

  fillFood(b: PlacedBuilding, type: FoodType) {
    const d = def(b)
    if (!d.foodCap || !d.foods?.includes(type)) return false
    const need = b.foodType === type ? d.foodCap - b.food : d.foodCap
    if (need <= 0) return false
    if (type !== 'kibble') {
      if (!this.godMode) {
        const stock = this.s.foodStock[type] ?? 0
        if (stock <= 0) return false
        this.s.foodStock[type] = stock - 1
      }
    }
    b.foodType = type
    b.food = d.foodCap
    this.stat('refills')
    audio.sfx('pour')
    if (this.s.tutorialStep === 1) {
      this.s.tutorialStep = 2
      this.bus.emit('tutorial')
      this.after(10, () => this.tutorialFirstCat())
    }
    this.recomputeStats()
    this.changed()
    return true
  }

  fillWater(b: PlacedBuilding) {
    const d = def(b)
    if (!d.waterCap || b.water >= d.waterCap) return false
    b.water = d.waterCap
    this.stat('refills')
    audio.sfx('water')
    this.recomputeStats()
    this.changed()
    return true
  }

  cleanLitter(b: PlacedBuilding) {
    if (b.dirt <= 0) return false
    b.dirt = 0
    this.stat('cleanings')
    audio.sfx('clean')
    this.recomputeStats()
    this.changed()
    return true
  }

  /** 一键照料：补满猫粮/清水，清理猫砂 */
  careAll() {
    let n = 0
    for (const b of this.s.buildings) {
      const d = def(b)
      if (d.foodCap && b.food < d.foodCap) {
        const t: FoodType = d.foods?.includes(b.foodType) && (b.foodType === 'kibble' || (this.s.foodStock[b.foodType] ?? 0) > 0) ? b.foodType : d.foods?.includes('kibble') ? 'kibble' : (d.foods?.find((f) => (this.s.foodStock[f] ?? 0) > 0) as FoodType)
        if (t && this.fillFood(b, t)) n++
      }
      if (d.waterCap && b.water < d.waterCap && this.fillWater(b)) n++
      if (d.dirtCap && b.dirt > 0 && this.cleanLitter(b)) n++
    }
    while (this.s.trash.length) this.pickTrash(0)
    return n
  }

  buyFood(type: FoodType, count = 1) {
    const price = FOOD_PRICE[type] * count
    if (this.s.hearts < price) return false
    this.s.hearts -= price
    this.s.foodStock[type] = (this.s.foodStock[type] ?? 0) + count
    audio.sfx('click')
    this.changed()
    return true
  }

  // ================= 旧物改造 =================

  /** 改造：消耗若干同品质的其他材料，换取 1 个指定材料 */
  convertCost(target: string) {
    const q = ITEMS[target]?.quality ?? 0
    return [3, 3, 4, 5][q] ?? 99
  }
  convertSources(target: string) {
    const q = ITEMS[target]?.quality
    return Object.entries(this.s.inventory)
      .filter(([id, n]) => id !== target && n > 0 && ITEMS[id]?.material && ITEMS[id].quality === q)
      .sort((a, b) => b[1] - a[1])
  }
  canConvert(target: string) {
    const it = ITEMS[target]
    if (!it?.material) return false
    if (this.godMode) return true
    const have = this.convertSources(target).reduce((a, [, n]) => a + n, 0)
    return have >= this.convertCost(target)
  }
  convert(target: string) {
    if (!this.canConvert(target)) return false
    if (!this.godMode) {
      let need = this.convertCost(target)
      // 优先消耗最多的材料
      while (need > 0) {
        const [id] = this.convertSources(target)[0]
        this.s.inventory[id]--
        need--
      }
    }
    this.s.inventory[target] = (this.s.inventory[target] ?? 0) + 1
    this.stat('item_' + target)
    this.stat('conversions')
    this.distinctCache.items = -1
    audio.sfx('craft')
    this.changed()
    return true
  }

  // ================= 建造 =================

  canCraft(defId: string) {
    const d = BUILDING_MAP[defId]
    if (!d || d.unlockLevel > this.s.yardLevel) return false
    if (this.godMode) return true
    if ((d.hearts ?? 0) > this.s.hearts) return false
    for (const [k, v] of Object.entries(d.recipe)) if ((this.s.inventory[k] ?? 0) < v) return false
    return true
  }

  craft(defId: string) {
    if (!this.canCraft(defId)) return false
    const d = BUILDING_MAP[defId]
    if (!this.godMode) {
      for (const [k, v] of Object.entries(d.recipe)) this.s.inventory[k] -= v
      this.s.hearts -= d.hearts ?? 0
    }
    this.s.warehouse[defId] = (this.s.warehouse[defId] ?? 0) + 1
    this.stat('crafted')
    audio.sfx('craft')
    this.toast(`制作完成：${d.name}`, '🔨')
    this.changed()
    return true
  }

  place(defId: string, x: number, y: number, flip = false, skin = 0) {
    if ((this.s.warehouse[defId] ?? 0) <= 0) return null
    if (!canPlace(this.s, defId, x, y)) return null
    const d = BUILDING_MAP[defId]
    this.s.warehouse[defId]--
    const b: PlacedBuilding = {
      uid: this.s.nextUid++, defId, x, y, flip, skin,
      food: 0, foodType: d.foods?.[0] ?? 'kibble', water: d.waterCap ? Math.ceil(d.waterCap / 2) : 0, dirt: 0,
    }
    this.s.buildings.push(b)
    this.stat('built')
    if (!this.s.stats['built_' + defId]) this.distinctCache.buildings = -1
    this.stat('built_' + defId)
    audio.sfx('place')
    this.refreshWorld()
    if (this.s.tutorialStep === 0 && d.action === 'eat' && d.foodCap) {
      this.s.tutorialStep = 1
      this.bus.emit('tutorial')
    }
    this.changed()
    return b
  }

  moveBuilding(b: PlacedBuilding, x: number, y: number) {
    if (!canPlace(this.s, b.defId, x, y, b.uid)) return false
    this.kickOccupants(b)
    b.x = x
    b.y = y
    this.stat('moves')
    audio.sfx('place')
    this.refreshWorld()
    this.changed()
    return true
  }

  flipBuilding(b: PlacedBuilding) {
    b.flip = !b.flip
    audio.sfx('click')
    this.changed()
  }

  skinBuilding(b: PlacedBuilding) {
    const d = def(b)
    const n = d.skins?.length ?? 1
    if (n <= 1) return false
    b.skin = (b.skin + 1) % n
    this.stat('skinChanges')
    audio.sfx('click')
    this.changed()
    return true
  }

  storeBuilding(b: PlacedBuilding) {
    this.kickOccupants(b)
    this.s.buildings = this.s.buildings.filter((x) => x !== b)
    this.s.warehouse[b.defId] = (this.s.warehouse[b.defId] ?? 0) + 1
    this.slots.delete(b.uid)
    this.stat('demolished')
    audio.sfx('click')
    this.refreshWorld()
    this.changed()
  }

  kickOccupants(b: PlacedBuilding) {
    for (const c of this.cats) {
      if (c.target === b) {
        c.interrupt(this)
        if (!c.scripted) c.think(this)
      }
    }
  }

  canUpgradeYard() {
    const next = YARD_LEVELS[this.s.yardLevel]
    if (!next) return false
    if (this.godMode) return true
    if (this.s.hearts < next.cost.hearts) return false
    for (const [k, v] of Object.entries(next.cost.items)) if ((this.s.inventory[k] ?? 0) < v) return false
    return true
  }

  upgradeYard() {
    if (!this.canUpgradeYard()) return false
    const next = YARD_LEVELS[this.s.yardLevel]
    if (!this.godMode) {
      this.s.hearts -= next.cost.hearts
      for (const [k, v] of Object.entries(next.cost.items)) this.s.inventory[k] -= v
    }
    this.s.yardLevel++
    this.addLog(`小院扩建为「${next.name}」`, 'system')
    this.toast(`小院扩建为「${next.name}」！`, '🏡')
    audio.sfx('unlock')
    this.refreshWorld()
    this.bus.emit('yardUpgrade')
    this.changed()
    return true
  }

  // ================= 新手引导 =================

  async tutorialFirstCat() {
    if (this.s.tutorialStep !== 2) return
    const c = this.spawnVisitor(1)!
    c.scripted = true
    c.stay = 999
    // 慢慢探头 → 走到碗前 → 闻一闻 → 吃
    await this.wait(3.5)
    const bowl = this.s.buildings.find((b) => def(b).action === 'eat' && b.food > 0)
    if (bowl) {
      const a = bAnchor(bowl)
      await this.walkTo(c, a.x - 10, a.y - 3)
      c.facing = 1
      c.restPose = 'sit'
      c.setState('WATCH', 0)
      c.showEmote('?', 1.5)
      await this.wait(1.5)
      c.setState('EAT', 0)
      await this.wait(6)
      if (bowl.food > 0) bowl.food--
      this.stat('foodServed')
      c.ate = true
      this.addFam(c, 3)
    }
    c.setState('REST', 0)
    c.restPose = 'sit'
    this.talkRaw(c, '……还不错。', true)
    await this.wait(3)
    ;(c as any).forceGift = ['bottlecap']
    c.scripted = false
    this.s.tutorialStep = 3
    this.bus.emit('tutorial')
    c.startLeave(this)
  }

  skipTutorial() {
    this.s.tutorialStep = 4
    this.bus.emit('tutorial')
    this.changed()
  }

  // ================= 统计 / 成就 =================

  stat(key: string, n = 1) {
    this.s.stats[key] = (this.s.stats[key] ?? 0) + n
  }
  statMax(key: string, v: number) {
    if ((this.s.stats[key] ?? 0) < v) this.s.stats[key] = v
  }

  computed(key: string): number {
    switch (key) {
      case 'discovered':
        return CATS.reduce((a, c) => a + (this.s.cats[c.id]?.discovered ? 1 : 0), 0)
      case 'rareDiscovered':
        return CATS.reduce((a, c) => a + (c.id > 100 && this.s.cats[c.id]?.discovered ? 1 : 0), 0)
      case 'friends':
      case 'oldFriends':
      case 'homeCats': {
        const min = key === 'friends' ? 3 : key === 'oldFriends' ? 4 : 5
        let n = 0
        for (const id in this.s.cats) if (famLevel(this.s.cats[id].familiarity) >= min) n++
        return n
      }
      case 'yardLevel':
        return this.s.yardLevel
      case 'distinctItems':
        if (this.distinctCache.items < 0)
          this.distinctCache.items = Object.keys(this.s.stats).filter((k) => k.startsWith('item_') && this.s.stats[k] > 0).length
        return this.distinctCache.items
      case 'distinctBuildings':
        if (this.distinctCache.buildings < 0)
          this.distinctCache.buildings = Object.keys(this.s.stats).filter((k) => k.startsWith('built_') && this.s.stats[k] > 0).length
        return this.distinctCache.buildings
      case 'buildingsPlaced':
        return this.s.buildings.length
      case 'warmth':
        return this.yard.warmth
    }
    return this.s.stats[key] ?? 0
  }

  achievementProgress(a: AchievementDef) {
    return Math.min(a.value, this.computed(a.key))
  }

  checkAchievements() {
    for (const a of ACHIEVEMENTS) {
      if (this.s.achievements[a.id]) continue
      if (this.computed(a.key) >= a.value) {
        this.s.achievements[a.id] = Date.now()
        this.addHearts(a.reward)
        this.bus.emit('achievement', a)
        this.addLog(`达成成就「${a.name}」`, 'system')
        audio.sfx('achievement')
      }
    }
  }

  addHearts(n: number) {
    this.s.hearts += n
    this.stat('heartsEarned', n)
  }

  // ================= 日志 / 提示 =================

  addLog(text: string, kind?: LogEntry['kind']) {
    this.s.log.push({ t: Math.floor(this.s.gameMinutes), text, kind })
    if (this.s.log.length > 600) this.s.log.splice(0, this.s.log.length - 600)
    this.bus.emit('log')
  }

  toast(text: string, icon = '🐾') {
    this.bus.emit('toast', { text, icon })
  }

  sfx(name: string) {
    audio.sfx(name)
  }

  // ================= 存档 =================

  async save() {
    this.s.lastActive = Date.now()
    await writeSave(this.s)
  }

  // ================= 离线模拟 =================

  simulateOffline(seconds: number) {
    const capped = Math.min(seconds, 12 * 3600)
    const speed = TIME_SPEED[this.s.settings.timeMode]
    const gameMinTotal = Math.min(capped * speed, 3 * 1440)
    const step = 10 // 每步 10 游戏分钟
    const steps = Math.floor(gameMinTotal / step)
    const rep: OfflineReport = { seconds, visits: 0, gifts: 0, food: 0, water: 0, newCats: [], hearts: 0 }
    const heartsBefore = this.s.hearts
    const realPerStep = capped / Math.max(1, steps)
    for (let i = 0; i < steps; i++) {
      this.s.gameMinutes += step
      this.clock = computeClock(this.s.gameMinutes, this.s.settings.realSeason)
      if (this.clock.day !== this.lastDay) this.onNewDay()
      if (this.s.gameMinutes >= this.s.weather.until) this.changeWeather()
      this.tickBuildings(realPerStep)
      if (i % 6 === 0) this.recomputeStats()
      // 来访概率：无人看守时略低
      // 每真实小时约 1~5 只猫来访（PRD：离开 6 小时约十几只）
      const ratePerHour = (1.2 + (4.5 * this.yard.warmth) / 100) * (0.7 + 0.15 * this.s.yardLevel)
      const p = Math.min(0.95, (ratePerHour * realPerStep) / 3600)
      if (!chance(p)) continue
      const d = chooseVisitor(this)
      if (d === undefined) continue
      let cat: Cat
      if (d === null) {
        const seed = nextRandomSeed()
        cat = new Cat({ id: RANDOM_CAT_BASE + seed, gen: generateCat(seed) })
        this.stat('randomVisits')
        this.s.randomSeen++
      } else {
        cat = new Cat({ id: d.id, def: d })
        const r = this.record(d.id)
        if (!r.discovered) {
          r.discovered = true
          r.firstSeen = this.s.gameMinutes
          this.s.stats['cat_' + d.id] = 1
          this.addHearts(5)
          rep.newCats.push(d.name)
          this.addLog(`一只没见过的猫来了……图鉴解锁：「${d.name}」`, 'new')
        }
        r.visits++
        r.lastVisit = this.s.gameMinutes
        if (this.clock.isNight) r.nightVisits++
        this.addFam(cat, 3)
      }
      rep.visits++
      this.stat('visits')
      if (this.clock.isNight) this.stat('nightVisits')
      if (isRainy(this.weather)) this.stat('rainVisits')
      this.addLog(`${cat.name}来了`, 'arrive')
      // 吃饭
      const bowl = this.s.buildings.find((b) => (def(b).foodCap ?? 0) > 0 && b.food > 0)
      if (bowl) {
        bowl.food--
        rep.food++
        cat.ate = true
        this.stat('foodServed')
        this.addFam(cat, 2)
        if (chance(0.4)) this.addLog(`${cat.name}吃了一碗${{ kibble: '猫粮', fish: '鱼干', canned: '罐头', treat: '冻干' }[bowl.foodType]}`, 'eat')
      }
      const water = this.s.buildings.find((b) => (def(b).waterCap ?? 0) > 0 && b.water > 0)
      if (water && chance(0.6)) {
        water.water--
        rep.water++
        this.stat('waterServed')
      }
      const litter = this.s.buildings.find((b) => def(b).dirtCap && b.dirt < def(b).dirtCap!)
      if (litter && chance(0.4)) litter.dirt++
      this.s.gameMinutes += randInt(1, 6)
      this.addLog(`${cat.name}离开了`, 'leave')
      this.addHearts(1 + (cat.ate ? 1 : 0))
      if (chance(giftChance(this, cat))) {
        const g = rollGift(this, cat)
        if (g.treasure && cat.def) this.record(cat.id).treasureGiven = true
        const wr = this.walk
        this.s.gifts.push({ x: randRange(wr.x + 8, wr.x + wr.w - 8), y: randRange(wr.y + 8, wr.y + wr.h - 4), items: g.items, from: cat.id, fromName: cat.name })
        if (this.s.gifts.length > 40) this.collectItems(this.s.gifts.shift()!.items, true)
        this.addLog(`${cat.name}留下了一个礼物 🎁`, 'gift')
        rep.gifts++
      }
    }
    rep.hearts = this.s.hearts - heartsBefore
    this.stat('offlineReturns')
    if (this.s.settings.timeMode === 'real') this.alignRealTime()
    this.offlineReport = rep
  }
}

export const game = new Game()
