import { EVENT_LINES } from '@/data/dialogue'
import type { Game } from '../core/Game'
import type { Cat } from '../cats/Cat'
import type { CatPose } from '../render/catArt'
import { chance, pick, randRange } from '../core/rng'
import { bAnchor, def } from '../world/yard'
import { isRainy } from '../world/weather'

export interface EventDef {
  id: string
  name: string
  /** 需要的猫数量 */
  cats: number
  /** 权重（0 = 不满足条件） */
  weight: (g: Game, cs: Cat[]) => number
  cooldown: number
  /** 脚本 */
  run: (ctx: EventCtx) => Promise<void>
  /** 选择参与猫的过滤条件 */
  filter?: (g: Game, c: Cat) => boolean
}

export type FxType =
  | 'butterfly' | 'bird' | 'leaf' | 'petal' | 'firefly' | 'shootingStar' | 'fishJump' | 'heart' | 'dust'
  | 'puddle' | 'footprints' | 'sparkle' | 'note' | 'zzz' | 'sweat' | 'fish' | 'sock' | 'bug' | 'cicada' | 'breath'

export interface Fx {
  type: FxType
  x: number
  y: number
  dur: number
  data?: any
}

export class EventCtx {
  /** 事件结束（或超时）后置为 true，残留的脚本会在下一个 await 处中止 */
  dead = false
  constructor(public g: Game, public cats: Cat[], public id: string) {}
  private check() {
    if (this.dead) throw new Error('event aborted')
  }
  get a() {
    return this.cats[0]
  }
  get b() {
    return this.cats[1]
  }
  async wait(s: number) {
    this.check()
    await this.g.wait(s)
    this.check()
  }
  async walk(c: Cat, x: number, y: number, run = false) {
    this.check()
    await Promise.race([this.g.walkTo(c, x, y, run), this.g.wait(25)])
    this.check()
  }
  /** 播放事件台词 */
  line(c: Cat, idx?: number) {
    const pool = EVENT_LINES[this.id] ?? []
    if (!pool.length) return
    this.g.talkRaw(c, idx !== undefined ? pool[idx % pool.length] : pick(pool), true)
  }
  say(c: Cat, text: string) {
    this.g.talkRaw(c, text, true)
  }
  pose(c: Cat, state: Cat['state'], pose: CatPose) {
    c.state = state
    c.restPose = pose
    c.stateT = 0
  }
  fx(type: FxType, x: number, y: number, dur = 3, data?: any) {
    this.g.bus.emit('fx', { type, x, y, dur, data } as Fx)
  }
  face(c: Cat, other: Cat | number) {
    const x = typeof other === 'number' ? other : other.x
    c.facing = x >= c.x ? 1 : -1
  }
  log(text: string) {
    this.g.addLog(text, 'event')
  }
  sfx(n: string, o?: any) {
    this.g.bus.emit('sfx', n, o)
  }
  /** 额外拉入一只猫 */
  recruit(filter?: (c: Cat) => boolean): Cat | null {
    const c = this.g.events.freeCats().find((x) => !this.cats.includes(x) && (!filter || filter(x)))
    if (!c) return null
    this.g.events.grab(c)
    this.cats.push(c)
    return c
  }
}

const day = (g: Game) => !g.clock.isNight
const night = (g: Game) => g.clock.isNight
const has = (g: Game, key: string) => g.hasFacility(key)
const rel = (g: Game, cs: Cat[]) => (cs.length >= 2 ? g.relation(cs[0], cs[1]) : 0)
const center = (g: Game) => ({ x: g.walk.x + g.walk.w / 2, y: g.walk.y + g.walk.h * 0.55 })
const near = (c: Cat, dx: number, dy = 0) => ({ x: c.x + dx, y: c.y + dy })

/** 50+ 动态事件 */
export const EVENTS: EventDef[] = [
  {
    id: 'steal_fish', name: '猫咪偷鱼', cats: 1, cooldown: 240,
    weight: (g) => (g.s.buildings.some((b) => b.foodType === 'fish' && b.food > 0) ? 4 : 0),
    filter: (_g, c) => c.has('naughty') || c.has('greedy') || c.has('foodie') || c.id === 63 || chance(0.3),
    async run(e) {
      const { g, a } = e
      const b = g.s.buildings.find((x) => x.foodType === 'fish' && x.food > 0)
      if (!b) return
      const p = bAnchor(b)
      await e.walk(a, p.x - 8, p.y - 2)
      e.pose(a, 'EAT', 'eat0')
      await e.wait(1.2)
      if (b.food > 0) b.food--
      g.stat('fishStolen')
      e.fx('fish', a.x, a.y - 10, 4, { follow: a.uid })
      e.log(`鱼干 -1……${a.name}叼着鱼干逃跑了！`)
      g.toast('鱼干 -1', '🐟')
      e.line(a)
      a.runMode = true
      await e.walk(a, g.walk.x + (a.x > center(g).x ? g.walk.w : 0), a.y + randRange(-20, 20), true)
      a.needs.hunger = 0
      a.ate = true
      await e.wait(1)
    },
  },
  {
    id: 'box_standoff', name: '两猫抢纸箱', cats: 2, cooldown: 300,
    weight: (g) => (g.s.buildings.some((b) => def(b).tags.includes('box') && g.freeSlot(b) >= 0) ? 4 : 0),
    async run(e) {
      const { g, a, b } = e
      const box = g.s.buildings.find((x) => def(x).tags.includes('box') && g.freeSlot(x) >= 0)
      if (!box) return
      const p = bAnchor(box)
      await Promise.all([e.walk(a, p.x - 14, p.y - 2), e.walk(b, p.x + 14, p.y - 2)])
      e.face(a, b)
      e.face(b, a)
      e.pose(a, 'WATCH', 'sit')
      e.pose(b, 'WATCH', 'sit')
      await e.wait(2.5)
      e.say(a, '……')
      await e.wait(1.6)
      e.say(b, '……')
      await e.wait(2.5)
      const loser = chance(0.5) ? a : b
      const winner = loser === a ? b : a
      e.log(`${a.name}和${b.name}同时看上了一个纸箱，对视了几秒后，${loser.name}默默离开了`)
      e.line(loser)
      await e.walk(loser, loser.x + (loser === a ? -40 : 40), loser.y + randRange(-10, 10))
      await e.walk(winner, p.x, p.y + 0.5)
      winner.z = 6
      winner.crop = 6
      e.pose(winner, 'SLEEP', 'loaf')
      await e.wait(6)
      winner.z = 0
      winner.crop = 0
    },
  },
  {
    id: 'gift_center', name: '猫咪送礼', cats: 1, cooldown: 400,
    weight: (g, cs) => (cs[0] && g.famLevelOf(cs[0]) >= 2 ? 3 : 0),
    filter: (g, c) => g.famLevelOf(c) >= 2,
    async run(e) {
      const { g, a } = e
      const c = center(g)
      await e.walk(a, c.x, c.y + 10)
      a.facing = 1
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(1.2)
      const item = pick(['sock', 'leaf', 'bottlecap', 'feather', 'button', 'marble', 'pinecone', 'ribbon'])
      g.dropGift(a.x + 8, a.y + 2, [item], a)
      e.line(a)
      e.log(`${a.name}走到院子中央，放下了一件东西`)
      await e.wait(3)
    },
  },
  {
    id: 'cat_meeting', name: '猫咪大会', cats: 1, cooldown: 3600,
    weight: (g) => (g.clock.period === 'lateNight' && g.cats.length >= 3 && g.s.yardLevel >= 2 ? 0.25 : 0),
    async run(e) {
      const { g } = e
      const c = center(g)
      // 召集十几只猫
      const extra = Math.min(14, 6 + g.s.yardLevel * 2)
      for (let i = 0; i < extra; i++) {
        const n = g.spawnVisitor()
        if (!n) break
        g.events.grab(n)
        e.cats.push(n)
      }
      for (const c0 of g.events.freeCats()) {
        g.events.grab(c0)
        e.cats.push(c0)
      }
      const r = 26 + e.cats.length * 1.5
      await Promise.all(
        e.cats.map((cat, i) => {
          const ang = (i / e.cats.length) * Math.PI * 2
          return e.walk(cat, c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r * 0.45)
        }),
      )
      for (const cat of e.cats) {
        e.face(cat, c.x)
        e.pose(cat, 'WATCH', 'sit')
      }
      e.log('深夜，十几只猫突然聚在院子中央，围成一个圈，似乎正在开会……')
      g.bus.emit('meeting', true)
      for (let i = 0; i < 4; i++) {
        await e.wait(2.2)
        e.line(pick(e.cats))
      }
      await e.wait(2)
      // 突然散开
      for (const cat of e.cats) {
        cat.showEmote('!', 1)
        cat.runMode = true
      }
      g.bus.emit('meeting', false)
      await Promise.all(e.cats.map((cat) => e.walk(cat, cat.x + (cat.x - c.x) * 3, cat.y + (cat.y - c.y) * 3, true)))
      for (const cat of e.cats) if (chance(0.6)) cat.stay = Math.min(cat.stay, randRange(1, 6))
    },
  },
  {
    id: 'butterfly_chase', name: '追蝴蝶', cats: 1, cooldown: 120,
    weight: (g) => (day(g) && !isRainy(g.weather) && g.clock.season !== 'winter' ? (has(g, 'butterfly') ? 6 : 2) : 0),
    async run(e) {
      const { g, a } = e
      const p = near(a, randRange(-40, 40), randRange(-20, 20))
      e.fx('butterfly', p.x, p.y - 14, 9)
      e.log(`${a.name}在追一只蝴蝶`)
      for (let i = 0; i < 4; i++) {
        await e.walk(a, p.x + randRange(-30, 30), p.y + randRange(-14, 14), true)
        e.pose(a, 'PLAY', 'pounce1')
        await e.wait(0.6)
      }
      e.line(a)
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(2)
      void g
    },
  },
  {
    id: 'bird_watch', name: '墙头小鸟', cats: 1, cooldown: 150,
    weight: (g) => (day(g) && !isRainy(g.weather) ? 4 : 0),
    async run(e) {
      const { g, a } = e
      const x = a.x + randRange(-30, 30)
      e.fx('bird', x, g.walk.y - 22, 7)
      await e.walk(a, x + randRange(-8, 8), g.walk.y + 6)
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(2)
      e.line(a)
      e.sfx('chatter')
      await e.wait(3.5)
      e.pose(a, 'PLAY', 'pounce1')
      e.log(`${a.name}盯着墙头的小鸟看了好久，小鸟飞走了`)
      await e.wait(1.5)
    },
  },
  {
    id: 'groom_each_other', name: '互相舔毛', cats: 2, cooldown: 60,
    weight: (g, cs) => (rel(g, cs) > 35 ? 5 : 0),
    async run(e) {
      const { g, a, b } = e
      await e.walk(a, b.x - 11, b.y)
      e.face(a, b)
      e.face(b, a)
      e.pose(a, 'GROOM', 'groom0')
      e.pose(b, 'GROOM', 'loaf')
      a.state = 'GROOM'
      b.state = 'SOCIAL'
      e.fx('heart', (a.x + b.x) / 2, a.y - 18, 2)
      e.line(chance(0.5) ? a : b)
      await e.wait(6)
      g.changeRelation(a, b, 3)
      g.stat('groomTogether')
      e.log(`${a.name}和${b.name}互相舔毛`)
    },
  },
  {
    id: 'sleep_together', name: '一起睡觉', cats: 2, cooldown: 180,
    weight: (g, cs) => (rel(g, cs) > 25 ? 3 + (g.clock.isNight ? 3 : 0) : 0),
    async run(e) {
      const { g, a, b } = e
      const bed = g.s.buildings.find((x) => def(x).action === 'sleep' && def(x).capacity >= 2 && g.freeSlot(x) >= 0 && !def(x).perchHeight)
      const p = bed ? { x: bAnchor(bed).x, y: bAnchor(bed).y - 6 } : near(a, 0, 0)
      await Promise.all([e.walk(a, p.x - 6, p.y), e.walk(b, p.x + 6, p.y)])
      e.face(a, b)
      e.face(b, a)
      e.pose(a, 'SLEEP', 'sleep0')
      e.pose(b, 'SLEEP', 'sleep0')
      e.fx('zzz', p.x, p.y - 16, 8)
      e.line(a)
      e.log(`${a.name}和${b.name}挤在一起睡着了`)
      g.stat('sleepTogether')
      await e.wait(18)
      g.changeRelation(a, b, 2)
    },
  },
  {
    id: 'sunbathe_line', name: '并排晒太阳', cats: 2, cooldown: 200,
    weight: (g) => (g.sunSpots.length && g.cats.length >= 3 ? 4 : 0),
    async run(e) {
      const { g } = e
      e.recruit()
      const s = pick(g.sunSpots)
      await Promise.all(e.cats.map((c, i) => e.walk(c, s.x - 14 + i * 12, s.y)))
      for (const c of e.cats) e.pose(c, 'SUNBATHE', chance(0.5) ? 'loaf' : 'sleepBelly')
      e.line(e.cats[0])
      e.log(`${e.cats.map((c) => c.name).join('、')}并排躺着晒太阳`)
      g.stat('sunbathes', e.cats.length)
      await e.wait(14)
    },
  },
  {
    id: 'hiss_fight', name: '哈气', cats: 2, cooldown: 90,
    weight: (g, cs) => (rel(g, cs) < -20 ? 4 : 0),
    async run(e) {
      const { g, a, b } = e
      await e.walk(a, b.x - 16, b.y)
      e.face(a, b)
      e.face(b, a)
      e.pose(a, 'FLEE', 'hiss')
      e.pose(b, 'FLEE', 'hiss')
      e.sfx('hiss')
      a.showEmote('💢', 2)
      b.showEmote('💢', 2)
      e.line(a)
      await e.wait(2.5)
      e.line(b)
      await e.wait(1.5)
      await e.walk(b, b.x + 40, b.y + randRange(-14, 14))
      g.changeRelation(a, b, -3)
      e.log(`${a.name}对着${b.name}哈气`)
    },
  },
  {
    id: 'real_fight', name: '打架', cats: 2, cooldown: 400,
    weight: (g, cs) => (rel(g, cs) < -45 && (cs[0]?.has('fighter') || cs[1]?.has('fighter')) ? 2 : 0),
    async run(e) {
      const { g, a, b } = e
      await e.walk(a, b.x - 12, b.y)
      e.face(a, b)
      e.face(b, a)
      e.pose(a, 'FLEE', 'hiss')
      e.pose(b, 'FLEE', 'hiss')
      e.sfx('hiss')
      await e.wait(1.2)
      e.fx('dust', (a.x + b.x) / 2, a.y - 6, 2.5)
      e.sfx('fight')
      a.alpha = 0
      b.alpha = 0
      await e.wait(2.5)
      a.alpha = 1
      b.alpha = 1
      e.line(a)
      g.stat('fights')
      g.changeRelation(a, b, -6)
      e.log(`${a.name}和${b.name}打了一架，毛都炸起来了`)
      a.runMode = true
      b.runMode = true
      await Promise.all([e.walk(a, a.x - 50, a.y, true), e.walk(b, b.x + 50, b.y, true)])
    },
  },
  {
    id: 'zoomies', name: '跑酷', cats: 1, cooldown: 120,
    weight: (_g, cs) => (cs[0] && (cs[0].has('lively') || cs[0].id === 62) ? 5 : 1),
    async run(e) {
      const { g, a } = e
      e.log(`${a.name}突然在院子里狂奔起来`)
      e.line(a)
      for (let i = 0; i < 5; i++) await e.walk(a, randRange(g.walk.x, g.walk.x + g.walk.w), randRange(g.walk.y, g.walk.y + g.walk.h), true)
      e.pose(a, 'REST', 'loaf')
      await e.wait(1.5)
    },
  },
  {
    id: 'chase_tail', name: '追尾巴', cats: 1, cooldown: 120,
    weight: (_g, cs) => (cs[0] && (cs[0].has('naughty') || cs[0].appearance.body === 'kitten' || cs[0].id === 26) ? 5 : 1.5),
    async run(e) {
      const { a } = e
      e.pose(a, 'PLAY', 'pounce0')
      for (let i = 0; i < 10; i++) {
        a.facing = a.facing === 1 ? -1 : 1
        await e.wait(0.3)
      }
      e.line(a)
      e.log(`${a.name}在原地追自己的尾巴转圈圈`)
      e.pose(a, 'REST', 'sit')
      await e.wait(1.5)
    },
  },
  {
    id: 'kitten_follow', name: '跟屁虫', cats: 2, cooldown: 200,
    weight: (_g, cs) => (cs.length >= 2 && (cs[0].appearance.body === 'kitten' || cs[1].appearance.body === 'kitten' || cs[0].has('clingy')) ? 4 : 0.5),
    async run(e) {
      const { g, a, b } = e
      for (let i = 0; i < 4; i++) {
        const x = randRange(g.walk.x, g.walk.x + g.walk.w)
        const y = randRange(g.walk.y, g.walk.y + g.walk.h)
        void e.walk(b, x, y)
        await e.wait(0.6)
        await e.walk(a, x - 12 * b.facing, y)
      }
      e.line(a)
      e.log(`${a.name}一直跟在${b.name}后面`)
      await e.wait(1)
    },
  },
  {
    id: 'knock_over', name: '打翻水碗', cats: 1, cooldown: 400,
    weight: (g) => (g.s.buildings.some((b) => def(b).action === 'drink' && b.water > 2 && !def(b).autoFill) ? 2 : 0),
    filter: (_g, c) => c.has('naughty') || c.has('curious') || chance(0.2),
    async run(e) {
      const { g, a } = e
      const b = g.s.buildings.find((x) => def(x).action === 'drink' && x.water > 2 && !def(x).autoFill)
      if (!b) return
      const p = bAnchor(b)
      await e.walk(a, p.x - 9, p.y - 2)
      a.facing = 1
      e.pose(a, 'PLAY', 'pounce1')
      await e.wait(0.8)
      b.water = 0
      e.fx('puddle', p.x, p.y + 2, 30)
      e.sfx('water')
      a.showEmote('!', 1.5)
      e.line(a)
      e.log(`${a.name}一爪子打翻了水碗……水碗空了`)
      await e.walk(a, a.x - 30, a.y, true)
      g.changed()
    },
  },
  {
    id: 'rain_watch', name: '看雨', cats: 1, cooldown: 150,
    weight: (g) => (isRainy(g.weather) && g.shelters.length ? 5 : 0),
    async run(e) {
      const { g, a } = e
      const r = pick(g.shelters)
      await e.walk(a, r.x + r.w / 2 + randRange(-r.w / 3, r.w / 3), r.y + r.h - 4)
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(2)
      e.line(a)
      e.log(`${a.name}坐在雨棚边，静静地看雨`)
      await e.wait(10)
    },
  },
  {
    id: 'snow_paw', name: '踩雪', cats: 1, cooldown: 150,
    weight: (g) => (g.weather === 'snow' ? 6 : 0),
    async run(e) {
      const { a } = e
      e.pose(a, 'PLAY', 'pounce0')
      await e.wait(1)
      e.line(a)
      for (let i = 0; i < 3; i++) {
        e.fx('footprints', a.x, a.y, 40)
        await e.walk(a, a.x + randRange(-25, 25), a.y + randRange(-10, 10))
      }
      a.showEmote('❄', 1.5)
      e.log(`${a.name}小心翼翼地踩了踩雪，又把爪子缩了回来`)
      await e.wait(1)
    },
  },
  {
    id: 'leaf_chase', name: '追落叶', cats: 1, cooldown: 120,
    weight: (g) => (g.clock.season === 'autumn' ? 6 : 0),
    async run(e) {
      const { a } = e
      e.fx('leaf', a.x - 60, a.y - 30, 6)
      await e.wait(1)
      await e.walk(a, a.x + 30, a.y + randRange(-10, 10), true)
      e.pose(a, 'PLAY', 'pounce1')
      e.line(a)
      e.log(`一片落叶飘过，${a.name}扑了上去`)
      await e.wait(2)
    },
  },
  {
    id: 'sakura_petal', name: '樱花瓣', cats: 1, cooldown: 120,
    weight: (g) => (g.clock.season === 'spring' && !isRainy(g.weather) ? (has(g, 'sakura') ? 6 : 2) : 0),
    async run(e) {
      const { a } = e
      e.fx('petal', a.x, a.y - 40, 6)
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(2)
      e.line(a)
      e.log(`花瓣落在了${a.name}的鼻子上`)
      await e.wait(3)
    },
  },
  {
    id: 'cicada', name: '蝉鸣', cats: 1, cooldown: 200,
    weight: (g) => (g.clock.season === 'summer' && day(g) ? (has(g, 'tree') ? 5 : 2) : 0),
    async run(e) {
      const { g, a } = e
      const t = g.s.buildings.find((b) => def(b).tags.includes('tree'))
      const p = t ? bAnchor(t) : { x: a.x, y: g.walk.y + 4 }
      e.fx('cicada', p.x, p.y - 30, 8)
      e.sfx('cicada')
      await e.walk(a, p.x + randRange(-10, 10), p.y + 2)
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(2)
      e.line(a)
      e.log(`${a.name}仰着头，盯着树上叫个不停的蝉`)
      await e.wait(4)
    },
  },
  {
    id: 'firefly', name: '萤火虫', cats: 1, cooldown: 200,
    weight: (g) => (g.clock.season === 'summer' && night(g) && !isRainy(g.weather) ? 6 : 0),
    async run(e) {
      const { a } = e
      e.fx('firefly', a.x, a.y - 16, 12)
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(2)
      e.line(a)
      e.log(`院子里飞来几只萤火虫，${a.name}看得出神`)
      await e.wait(2)
      e.pose(a, 'PLAY', 'pounce1')
      await e.wait(3)
    },
  },
  {
    id: 'shooting_star', name: '流星', cats: 1, cooldown: 600,
    weight: (g) => (night(g) && (g.weather === 'sunny' || g.weather === 'cloudy') ? 1.5 : 0),
    async run(e) {
      const { a } = e
      e.pose(a, 'WATCH', 'sitLook')
      e.fx('shootingStar', 100 + Math.random() * 280, 10, 2)
      await e.wait(1.5)
      e.line(a)
      e.log(`一颗流星划过夜空，${a.name}抬头看见了`)
      await e.wait(4)
    },
  },
  {
    id: 'moon_gaze', name: '赏月', cats: 1, cooldown: 400,
    weight: (g) => (g.clock.fullMoon && night(g) && !isRainy(g.weather) ? 5 : 0),
    async run(e) {
      const { a } = e
      e.pose(a, 'WATCH', 'sitLook')
      e.line(a)
      e.log(`满月下，${a.name}安静地坐着看月亮`)
      await e.wait(10)
    },
  },
  {
    id: 'rainbow_look', name: '看彩虹', cats: 1, cooldown: 300,
    weight: (g) => (g.weather === 'rainbow' ? 8 : 0),
    async run(e) {
      const { a } = e
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(1.5)
      e.line(a)
      e.log(`${a.name}看着天边的彩虹`)
      await e.wait(6)
    },
  },
  {
    id: 'sneeze', name: '打喷嚏', cats: 1, cooldown: 120,
    weight: (g) => (g.temperature < 12 || g.weather === 'windy' ? 3 : 1),
    async run(e) {
      const { a } = e
      e.pose(a, 'REST', 'sit')
      await e.wait(0.8)
      e.sfx('sneeze', { pitch: 1 })
      a.showEmote('💦', 1)
      e.line(a)
      e.log(`${a.name}打了个小喷嚏`)
      await e.wait(2)
    },
  },
  {
    id: 'hairball', name: '吐毛球', cats: 1, cooldown: 400,
    weight: (g) => (has(g, 'catgrass') ? 0.5 : 1.5),
    async run(e) {
      const { g, a } = e
      e.pose(a, 'EAT', 'eat0')
      await e.wait(2)
      e.line(a)
      g.addTrash(a.x + 6, a.y)
      e.log(`${a.name}吐了个毛球……需要打扫一下`)
      await e.wait(1.5)
    },
  },
  {
    id: 'yawn_chain', name: '连锁哈欠', cats: 2, cooldown: 200,
    weight: (g) => (g.cats.length >= 3 ? 3 : 0),
    async run(e) {
      e.recruit()
      for (const c of e.cats) {
        e.pose(c, 'REST', 'meow')
        await e.wait(1.1)
        e.pose(c, 'REST', 'sit')
      }
      e.line(e.cats[e.cats.length - 1])
      e.log(`${e.a.name}打了个哈欠，${e.cats.slice(1).map((c) => c.name).join('、')}也跟着打了哈欠`)
      await e.wait(2)
    },
  },
  {
    id: 'stretch', name: '伸懒腰', cats: 1, cooldown: 80,
    weight: () => 2,
    async run(e) {
      const { a } = e
      e.pose(a, 'REST', 'stretch')
      await e.wait(2.2)
      e.line(a)
      e.pose(a, 'REST', 'sit')
      await e.wait(1)
    },
  },
  {
    id: 'loaf_contest', name: '猫猫面包大赛', cats: 2, cooldown: 300,
    weight: (g) => (g.cats.length >= 3 ? 2 : 0),
    async run(e) {
      e.recruit()
      e.recruit()
      const c = { x: e.a.x, y: e.a.y }
      await Promise.all(e.cats.map((cat, i) => e.walk(cat, c.x - 16 + i * 14, c.y)))
      for (const cat of e.cats) e.pose(cat, 'REST', 'loaf')
      e.line(e.a)
      e.log(`${e.cats.map((x) => x.name).join('、')}排成一排，变成了一排面包`)
      await e.wait(10)
    },
  },
  {
    id: 'belly_up', name: '翻肚皮', cats: 1, cooldown: 200,
    weight: (g, cs) => (cs[0] && g.famLevelOf(cs[0]) >= 3 ? 4 : 0.5),
    async run(e) {
      const { a } = e
      e.pose(a, 'SUNBATHE', 'sleepBelly')
      a.showEmote('♥', 2)
      e.line(a)
      e.log(`${a.name}翻过身，露出了肚皮`)
      await e.wait(8)
    },
  },
  {
    id: 'slow_blink', name: '慢眨眼', cats: 1, cooldown: 300,
    weight: (g, cs) => (cs[0] && g.famLevelOf(cs[0]) >= 2 ? 3 : 0),
    async run(e) {
      const { g, a } = e
      e.pose(a, 'WATCH', 'sit')
      a.facing = 1
      await e.wait(1)
      e.pose(a, 'WATCH', 'sitBlink')
      await e.wait(1.2)
      e.pose(a, 'WATCH', 'sit')
      e.line(a)
      g.addFam(a, 4)
      e.log(`${a.name}看着你，慢慢地眨了眨眼——这是猫咪表达信任的方式`)
      await e.wait(2)
    },
  },
  {
    id: 'meow_concert', name: '夜半合唱', cats: 2, cooldown: 500,
    weight: (g) => (night(g) && g.cats.length >= 3 ? 2 : 0),
    async run(e) {
      e.recruit()
      for (let i = 0; i < 6; i++) {
        const c = e.cats[i % e.cats.length]
        e.pose(c, 'WATCH', 'meow')
        e.fx('note', c.x, c.y - 20, 1.5)
        e.sfx('meow', { pitch: 0.8 + i * 0.1 })
        await e.wait(0.9)
      }
      e.line(e.a)
      e.log(`夜里，${e.cats.map((x) => x.name).join('、')}开始了一场喵喵合唱`)
      await e.wait(2)
    },
  },
  {
    id: 'mouse_hunt', name: '狩猎练习', cats: 1, cooldown: 150,
    weight: (g) => (has(g, 'mouse_toy') ? 5 : 1),
    async run(e) {
      const { g, a } = e
      const t = g.s.buildings.find((b) => b.defId === 'mouse_toy')
      const p = t ? bAnchor(t) : near(a, 30)
      await e.walk(a, p.x - 24, p.y - 2)
      a.facing = 1
      e.pose(a, 'PLAY', 'pounce0')
      await e.wait(2.5)
      await e.walk(a, p.x - 4, p.y - 2, true)
      e.pose(a, 'PLAY', 'pounce1')
      e.line(a)
      e.log(`${a.name}压低身子，扭了扭屁股，扑向了小老鼠玩具`)
      await e.wait(2)
    },
  },
  {
    id: 'hide_seek', name: '躲猫猫', cats: 2, cooldown: 250,
    weight: (g) => (g.s.buildings.some((b) => def(b).tags.includes('hide')) ? 3 : 0),
    async run(e) {
      const { g, a, b } = e
      const h = g.s.buildings.find((x) => def(x).tags.includes('hide') && g.freeSlot(x) >= 0)
      if (!h) return
      const p = bAnchor(h)
      await e.walk(a, p.x, p.y + 0.5, true)
      a.z = 5
      a.crop = 8
      e.pose(a, 'HIDE', 'loaf')
      await e.walk(b, p.x + 26, p.y)
      e.face(b, a)
      e.pose(b, 'WATCH', 'sit')
      b.showEmote('?', 2)
      await e.wait(3)
      a.crop = 0
      a.z = 0
      e.pose(a, 'PLAY', 'pounce1')
      e.line(a)
      b.showEmote('!', 1.5)
      e.log(`${a.name}躲起来，突然跳出来吓了${b.name}一跳`)
      await e.wait(2)
    },
  },
  {
    id: 'door_guard', name: '看门', cats: 1, cooldown: 300,
    weight: (_g, cs) => (cs[0] && (cs[0].id === 64 || cs[0].has('fighter')) ? 4 : 0.6),
    async run(e) {
      const { g, a } = e
      await e.walk(a, g.door.x, g.walk.y + g.walk.h - 2)
      e.pose(a, 'WATCH', 'sit')
      e.line(a)
      e.log(`${a.name}端坐在门口，像个门卫`)
      await e.wait(15)
    },
  },
  {
    id: 'tower_king', name: '猫爬架之王', cats: 2, cooldown: 250,
    weight: (g) => (g.s.buildings.some((b) => def(b).tags.includes('tower')) ? 3 : 0),
    async run(e) {
      const { g, a, b } = e
      const t = g.s.buildings.find((x) => def(x).tags.includes('tower'))
      if (!t) return
      const p = bAnchor(t)
      const h = def(t).perchHeight ?? 14
      await e.walk(a, p.x, p.y + 0.5)
      a.tz = h
      a.z = h
      e.pose(a, 'PERCH', 'loaf')
      await e.walk(b, p.x + 18, p.y + 2)
      e.face(b, a)
      e.pose(b, 'WATCH', 'sitLook')
      e.line(a)
      e.log(`${a.name}占领了猫爬架最高层，${b.name}只能在下面仰望`)
      await e.wait(8)
      a.tz = 0
    },
  },
  {
    id: 'share_food', name: '分享食物', cats: 2, cooldown: 200,
    weight: (g, cs) => (g.hasFood() && rel(g, cs) > 10 && (cs[0]?.has('gentle') || cs[1]?.has('gentle')) ? 4 : 0),
    async run(e) {
      const { g, a, b } = e
      const bowl = g.s.buildings.find((x) => (def(x).foodCap ?? 0) > 0 && x.food > 0)
      if (!bowl) return
      const p = bAnchor(bowl)
      await Promise.all([e.walk(a, p.x - 9, p.y - 2), e.walk(b, p.x + 10, p.y - 2)])
      e.face(a, b)
      e.face(b, a)
      e.pose(a, 'WATCH', 'sit')
      e.pose(b, 'EAT', 'eat0')
      e.line(a)
      await e.wait(6)
      if (bowl.food > 0) bowl.food--
      b.needs.hunger = 0
      g.changeRelation(a, b, 4)
      e.log(`${a.name}让${b.name}先吃`)
    },
  },
  {
    id: 'food_queue', name: '排队吃饭', cats: 2, cooldown: 300,
    weight: (g) => (g.hasFood() && g.cats.length >= 3 ? 3 : 0),
    async run(e) {
      const { g } = e
      e.recruit()
      const bowl = g.s.buildings.find((x) => (def(x).foodCap ?? 0) > 0 && x.food > 0)
      if (!bowl) return
      const p = bAnchor(bowl)
      await Promise.all(e.cats.map((c, i) => e.walk(c, p.x - 9 - i * 13, p.y - 2)))
      for (const c of e.cats) {
        c.facing = 1
        e.pose(c, 'WATCH', 'sit')
      }
      e.line(e.cats[e.cats.length - 1])
      e.log(`${e.cats.map((c) => c.name).join('、')}在猫碗前排起了队`)
      for (const c of e.cats) {
        e.pose(c, 'EAT', 'eat0')
        await e.wait(3)
        if (bowl.food > 0) {
          bowl.food--
          c.needs.hunger = 0
          c.ate = true
        }
        e.pose(c, 'REST', 'sit')
        await e.walk(c, c.x - 20, c.y + randRange(5, 15))
      }
      g.changed()
    },
  },
  {
    id: 'thunder_scare', name: '雷声', cats: 1, cooldown: 120,
    weight: (g) => (g.weather === 'storm' ? 6 : 0),
    async run(e) {
      const { g, a } = e
      g.thunderFlash = 1
      e.sfx('thunder')
      for (const c of g.cats) c.showEmote('!', 1)
      e.pose(a, 'FLEE', 'hiss')
      e.line(a)
      await e.wait(1)
      e.log(`轰隆一声雷响，${a.name}吓得毛都炸了`)
      g.events.release(a)
      a.interrupt(g)
      if (!a.goHide(g, true)) a.seekShelter(g)
      e.cats = []
    },
  },
  {
    id: 'fog_ghost', name: '雾中来客', cats: 1, cooldown: 400,
    weight: (g) => (g.weather === 'fog' ? 4 : 0),
    async run(e) {
      const { a } = e
      a.alpha = 0.2
      e.pose(a, 'WATCH', 'sit')
      for (let i = 0; i < 10; i++) {
        a.alpha = Math.min(1, a.alpha + 0.08)
        await e.wait(0.3)
      }
      a.alpha = 1
      e.line(a)
      e.log(`雾里慢慢浮现出${a.name}的身影`)
      await e.wait(3)
    },
  },
  {
    id: 'wind_tumble', name: '大风', cats: 1, cooldown: 150,
    weight: (g) => (g.weather === 'windy' ? 6 : 0),
    async run(e) {
      const { a } = e
      e.fx('leaf', a.x - 80, a.y - 20, 5)
      e.fx('leaf', a.x - 100, a.y - 10, 5)
      e.pose(a, 'FLEE', 'hiss')
      e.line(a)
      e.log(`一阵大风吹过，${a.name}的毛被吹得乱七八糟`)
      await e.wait(2)
      e.pose(a, 'GROOM', 'groom0')
      await e.wait(3)
    },
  },
  {
    id: 'puddle_jump', name: '跳水坑', cats: 1, cooldown: 200,
    weight: (g) => (g.s.weather.prev && isRainy(g.s.weather.prev) && !isRainy(g.weather) ? 5 : 0),
    async run(e) {
      const { a } = e
      const p = near(a, 20, 4)
      e.fx('puddle', p.x, p.y, 25)
      await e.walk(a, p.x - 14, p.y - 2)
      a.facing = 1
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(1.5)
      e.pose(a, 'PLAY', 'pounce1')
      await e.walk(a, p.x + 16, p.y - 2, true)
      e.line(a)
      e.log(`${a.name}小心地跳过了一个水坑`)
      await e.wait(1)
    },
  },
  {
    id: 'night_patrol', name: '夜间巡逻', cats: 1, cooldown: 200,
    weight: (g, cs) => (night(g) && cs[0]?.has('nocturnal') ? 6 : night(g) ? 1 : 0),
    async run(e) {
      const { g, a } = e
      const y = g.walk.y + 2
      await e.walk(a, g.walk.x + 4, y)
      a.tz = 0
      e.line(a)
      e.log(`${a.name}沿着墙根巡视了一圈`)
      await e.walk(a, g.walk.x + g.walk.w - 4, y)
      e.pose(a, 'WATCH', 'sitLook')
      await e.wait(2)
    },
  },
  {
    id: 'dawn_chorus', name: '清晨鸟鸣', cats: 1, cooldown: 400,
    weight: (g) => (g.clock.period === 'dawn' && !isRainy(g.weather) ? 4 : 0),
    async run(e) {
      const { g, a } = e
      e.fx('bird', a.x - 20, g.walk.y - 22, 6)
      e.fx('bird', a.x + 30, g.walk.y - 24, 6)
      e.sfx('birds')
      e.pose(a, 'WATCH', 'sitLook')
      e.line(a)
      e.log(`清晨，墙头传来鸟叫，${a.name}竖起了耳朵`)
      await e.wait(6)
    },
  },
  {
    id: 'box_sit_fits', name: '我能挤进去', cats: 1, cooldown: 300,
    weight: (g, cs) => (cs[0] && (cs[0].appearance.body === 'chubby' || cs[0].appearance.body === 'big') && g.s.buildings.some((b) => def(b).tags.includes('box')) ? 4 : 0),
    async run(e) {
      const { g, a } = e
      const box = g.s.buildings.find((x) => def(x).tags.includes('box') && g.freeSlot(x) >= 0)
      if (!box) return
      const p = bAnchor(box)
      await e.walk(a, p.x, p.y + 0.5)
      a.z = 5
      a.crop = 4
      e.pose(a, 'SLEEP', 'loaf')
      e.line(a)
      e.log(`${a.name}硬是把自己塞进了一个明显太小的纸箱`)
      await e.wait(10)
      a.crop = 0
      a.z = 0
    },
  },
  {
    id: 'tail_wrap', name: '尾巴缠绕', cats: 2, cooldown: 250,
    weight: (g, cs) => (rel(g, cs) > 50 ? 4 : 0),
    async run(e) {
      const { g, a, b } = e
      await e.walk(a, b.x - 9, b.y)
      a.facing = 1
      b.facing = 1
      e.pose(a, 'WATCH', 'sit')
      e.pose(b, 'WATCH', 'sit')
      e.fx('heart', (a.x + b.x) / 2, a.y - 20, 2)
      e.line(a)
      g.changeRelation(a, b, 3)
      e.log(`${a.name}和${b.name}并排坐着，尾巴缠在了一起`)
      await e.wait(10)
    },
  },
  {
    id: 'head_bump', name: '碰碰头', cats: 2, cooldown: 150,
    weight: (g, cs) => (rel(g, cs) > 20 ? 4 : 0),
    async run(e) {
      const { g, a, b } = e
      await e.walk(a, b.x - 10, b.y)
      e.face(a, b)
      e.face(b, a)
      e.pose(a, 'SOCIAL', 'stand')
      e.pose(b, 'SOCIAL', 'stand')
      e.fx('heart', (a.x + b.x) / 2, a.y - 18, 1.5)
      e.line(a)
      g.changeRelation(a, b, 2)
      e.log(`${a.name}和${b.name}碰了碰脑袋`)
      await e.wait(3)
    },
  },
  {
    id: 'lost_sock', name: '袜子的袜子', cats: 1, cooldown: 600,
    weight: (_g, cs) => (cs[0]?.id === 22 ? 8 : 0.4),
    async run(e) {
      const { g, a } = e
      const c = center(g)
      e.fx('sock', a.x, a.y - 8, 4, { follow: a.uid })
      await e.walk(a, c.x, c.y)
      e.pose(a, 'WATCH', 'sit')
      g.dropGift(a.x + 8, a.y, ['sock'], a)
      e.line(a)
      e.log(`${a.name}叼来了一只袜子，放在了院子中央`)
      await e.wait(3)
    },
  },
  {
    id: 'treasure_show', name: '炫耀宝物', cats: 1, cooldown: 600,
    weight: (g, cs) => (cs[0] && g.s.cats[cs[0].id]?.treasureGiven ? 2 : 0),
    filter: (g, c) => !!g.s.cats[c.id]?.treasureGiven,
    async run(e) {
      const { a } = e
      e.pose(a, 'WATCH', 'sitLook')
      e.fx('sparkle', a.x, a.y - 16, 3)
      e.line(a)
      e.log(`${a.name}好像在想念它送你的那件宝物`)
      await e.wait(5)
    },
  },
  {
    id: 'new_friend_intro', name: '带朋友来', cats: 1, cooldown: 900,
    weight: (g, cs) => (cs[0] && g.famLevelOf(cs[0]) >= 3 && g.cats.length < g.maxCats ? 2 : 0),
    filter: (g, c) => g.famLevelOf(c) >= 3,
    async run(e) {
      const { g, a } = e
      await e.walk(a, g.door.x, g.walk.y + g.walk.h - 4)
      e.pose(a, 'WATCH', 'sit')
      const n = g.spawnVisitor()
      if (!n) return
      e.line(a)
      e.log(`${a.name}带来了${n.name}`)
      await e.wait(4)
    },
  },
  {
    id: 'sleep_talk', name: '说梦话', cats: 1, cooldown: 300,
    weight: (g) => (g.cats.some((c) => c.state === 'SLEEP' && !c.scripted) ? 3 : 0),
    filter: (_g, c) => c.state === 'SLEEP',
    async run(e) {
      const { a } = e
      const pose = a.restPose
      e.pose(a, 'SLEEP', pose === 'sleepBelly' ? 'sleepBelly' : 'sleep0')
      e.fx('zzz', a.x, a.y - 14, 4)
      e.line(a)
      e.log(`${a.name}在睡梦中嘟囔了一句`)
      await e.wait(6)
    },
  },
  {
    id: 'fish_pond_stare', name: '盯鱼', cats: 1, cooldown: 200,
    weight: (g) => (has(g, 'pond') ? 6 : 0),
    async run(e) {
      const { g, a } = e
      const pond = g.s.buildings.find((b) => def(b).tags.includes('pond'))
      if (!pond) return
      const p = bAnchor(pond)
      await e.walk(a, p.x + randRange(-14, 14), p.y + 1)
      a.facing = chance(0.5) ? 1 : -1
      e.pose(a, 'WATCH', 'loaf')
      await e.wait(3)
      e.fx('fishJump', p.x, p.y - 14, 1.5)
      e.sfx('splash')
      a.showEmote('!', 1.2)
      e.pose(a, 'PLAY', 'pounce1')
      e.line(a)
      e.log(`池子里的小鱼跳了一下，${a.name}吓了一跳`)
      await e.wait(2)
    },
  },
  {
    id: 'snow_footprints', name: '雪地脚印', cats: 1, cooldown: 300,
    weight: (g) => (g.weather === 'snow' ? 4 : 0),
    async run(e) {
      const { g, a } = e
      for (let i = 0; i < 6; i++) {
        e.fx('footprints', a.x, a.y, 50)
        await e.walk(a, a.x + 14, a.y + Math.sin(i) * 6)
      }
      e.line(a)
      e.log(`雪地上留下了${a.name}的一串小脚印`)
      void g
    },
  },
  {
    id: 'warm_huddle', name: '取暖', cats: 2, cooldown: 300,
    weight: (g) => (g.temperature < 8 && has(g, 'warm') ? 6 : 0),
    async run(e) {
      const { g } = e
      e.recruit()
      const h = g.s.buildings.find((b) => def(b).tags.includes('warm'))
      if (!h) return
      const p = bAnchor(h)
      await Promise.all(e.cats.map((c, i) => e.walk(c, p.x - 14 + i * 12, p.y + 3)))
      for (const c of e.cats) {
        e.face(c, p.x)
        e.pose(c, 'SLEEP', 'loaf')
      }
      e.line(e.a)
      e.log(`${e.cats.map((c) => c.name).join('、')}挤在暖炉旁取暖`)
      await e.wait(14)
    },
  },
  {
    id: 'traveler_story', name: '旅行者的故事', cats: 2, cooldown: 400,
    weight: (_g, cs) => (cs.some((c) => c.id === 116) ? 8 : 0),
    filter: (_g, c) => true,
    async run(e) {
      const { g } = e
      let t = e.cats.find((c) => c.id === 116)
      const other = e.cats.find((c) => c.id !== 116)
      if (!t || !other) return
      await e.walk(other, t.x + 14, t.y)
      e.face(other, t)
      e.face(t, other)
      e.pose(t, 'SOCIAL', 'sit')
      e.pose(other, 'SOCIAL', 'sit')
      for (let i = 0; i < 3; i++) {
        e.line(t, i)
        await e.wait(3)
      }
      other.showEmote('!', 1.5)
      e.log(`旅行者给${other.name}讲了一个很远很远的地方的故事`)
      void g
    },
  },
  {
    id: 'bug_catch', name: '抓虫子', cats: 1, cooldown: 150,
    weight: (g) => (g.clock.season === 'summer' || g.clock.season === 'spring' ? 3 : 0.5),
    async run(e) {
      const { a } = e
      e.fx('bug', a.x + 16, a.y - 2, 4)
      e.pose(a, 'PLAY', 'pounce0')
      await e.wait(1.5)
      e.pose(a, 'PLAY', 'pounce1')
      await e.walk(a, a.x + 14, a.y, true)
      e.line(a)
      e.log(`${a.name}扑向一只小虫子……没扑到`)
      await e.wait(1)
    },
  },
  {
    id: 'grass_eat', name: '啃猫草', cats: 1, cooldown: 300,
    weight: (g) => (has(g, 'catgrass') ? 3 : 0),
    async run(e) {
      const { g, a } = e
      const b = g.s.buildings.find((x) => def(x).tags.includes('catgrass'))
      if (b && Math.hypot(bAnchor(b).x - a.x, bAnchor(b).y - a.y) > 20) {
        const p = bAnchor(b)
        await e.walk(a, p.x - 8, p.y - 2)
      }
      e.pose(a, 'EAT', 'eat0')
      await e.wait(3)
      e.line(a)
      e.log(`${a.name}认真地啃了几口猫草`)
      a.needs.dirty = 0
      await e.wait(1)
    },
  },
]

export const EVENT_MAP: Record<string, EventDef> = {}
for (const ev of EVENTS) EVENT_MAP[ev.id] = ev

/** 动态事件系统 */
export class EventSystem {
  t = 15
  running = 0
  cooldowns: Record<string, number> = {}
  constructor(private g: Game) {}

  freeCats() {
    return this.g.cats.filter((c) => !c.scripted && !c.leaving && c.state !== 'ENTER' && c.age > 4)
  }

  grab(c: Cat) {
    c.interrupt(this.g)
    c.scripted = true
    c.crop = 0
  }

  release(c: Cat) {
    if (!c.scripted) return
    c.scripted = false
    c.alpha = 1
    c.runMode = false
    if (c.gone || c.leaving) return
    c.tz = 0
    c.think(this.g)
  }

  update(dt: number) {
    for (const k in this.cooldowns) this.cooldowns[k] -= dt
    this.t -= dt
    if (this.t > 0 || this.running > 1 || this.g.s.tutorialStep < 4) return
    this.t = randRange(14, 30)
    const free = this.freeCats()
    if (!free.length) return
    // 选择事件
    const cands: { ev: EventDef; cats: Cat[]; w: number }[] = []
    for (const ev of EVENTS) {
      if ((this.cooldowns[ev.id] ?? 0) > 0) continue
      const pool = ev.filter ? free.filter((c) => ev.filter!(this.g, c)) : free
      if (pool.length < 1 || free.length < ev.cats) continue
      const first = pick(pool)
      const cats = [first]
      if (ev.cats >= 2) {
        const others = free.filter((c) => c !== first)
        if (!others.length) continue
        cats.push(pick(others))
      }
      const w = ev.weight(this.g, cats)
      if (w > 0) cands.push({ ev, cats, w })
    }
    if (!cands.length) return
    let total = cands.reduce((a, b) => a + b.w, 0)
    let r = Math.random() * total
    for (const c of cands) {
      r -= c.w
      if (r <= 0) {
        this.start(c.ev, c.cats)
        return
      }
    }
  }

  /** 强制触发事件 */
  trigger(id: string, cats: Cat[]) {
    const ev = EVENT_MAP[id]
    if (!ev) return false
    if (cats.some((c) => c.scripted || c.leaving || c.gone)) return false
    this.start(ev, cats)
    return true
  }

  private async start(ev: EventDef, cats: Cat[]) {
    this.cooldowns[ev.id] = ev.cooldown
    this.running++
    for (const c of cats) this.grab(c)
    const ctx = new EventCtx(this.g, cats, ev.id)
    this.g.stat('eventsSeen')
    this.g.stat('event_' + ev.id)
    this.g.s.seenEvents[ev.id] = (this.g.s.seenEvents[ev.id] ?? 0) + 1
    try {
      // 超时保护
      const run = ev.run(ctx).catch((err: any) => {
        if (err?.message !== 'event aborted') console.warn('event error', ev.id, err)
      })
      await Promise.race([run, this.g.wait(60)])
    } catch (err) {
      console.warn('event error', ev.id, err)
    }
    ctx.dead = true
    for (const c of ctx.cats) this.release(c)
    this.running--
    this.g.changed()
  }
}
