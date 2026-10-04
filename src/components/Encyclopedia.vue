<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from './Modal.vue'
import { useGameStore } from '@/stores/game'
import { CATS } from '@/data/cats'
import { PERSONALITY_LABEL, FOOD_LABEL, PERIOD_LABEL, WEATHER_LABEL, SEASON_LABEL, type CatDef, type SpecialCondition } from '@/game/types'
import { FAM_LABEL, famLevel } from '@/game/constants'
import { facilityLabel } from '@/utils/labels'
import { COMBO_COUNT } from '@/game/cats/catGen'
import { fmtGameStamp } from '@/game/world/clock'

const store = useGameStore()
const g = store.game
const filter = ref<'all' | 'found' | 'missing' | 'rare'>('all')
const focus = ref<number | null>(store.dexFocus)
store.dexFocus = null
const imgCache = new Map<string, string>()

function img(c: CatDef, sil: boolean) {
  const k = c.id + (sil ? 's' : '')
  if (!imgCache.has(k)) imgCache.set(k, store.renderer?.catPreview(c.appearance, 'sit', 3, sil) ?? '')
  return imgCache.get(k)!
}

function persText(c: CatDef) {
  return c.personalities.map((x) => PERSONALITY_LABEL[x]).join(' / ')
}
function foodText(c: CatDef) {
  return c.favoriteFoods.map((x) => FOOD_LABEL[x]).join('、')
}

const HINT: Record<SpecialCondition, string> = {
  rainNight: '据说它只在深夜的大雨中出现。',
  firstSnow: '每年第一场雪落下时……',
  rainbow: '雨停之后，天边挂起彩虹的时候。',
  fullMoon: '满月的夜晚，月光最亮的时候。',
  dawnFog: '清晨起雾的时候，雾里好像有什么。',
  springWind: '春天刮大风的日子。',
  autumn: '落叶纷飞的秋天。',
  christmas: '冬天某个特别的节日。',
  halloween: '南瓜灯亮起的那几天。',
  newYear: '新年到来的时候。',
  fishPond: '小院里有鱼池的话……',
  garden: '花园植物多起来的时候。',
  woodcraft: '小院里木制设施很多的时候。',
  collector: '收集到 50 种不同的小东西之后。',
  maxYard: '小院达到最高等级之后。',
  traveler: '极少极少的时候，会有一位远方的客人。',
  day30: '小院运营满 30 天之后。',
  friends50: '和 50 只猫成为朋友之后。',
  dex100: '图鉴记录满 100 只猫之后。',
  master: '当你几乎认识了所有的猫……',
}

const list = computed(() => {
  void store.version
  return CATS.filter((c) => {
    const d = g.s.cats[c.id]?.discovered
    if (filter.value === 'found') return d
    if (filter.value === 'missing') return !d
    if (filter.value === 'rare') return c.id > 100
    return true
  }).map((c) => {
    const r = g.s.cats[c.id]
    const lvl = r ? famLevel(r.familiarity) : 0
    return { c, found: !!r?.discovered, lvl, known: !!r?.discovered && (lvl >= 1 || r.familiarity > 0) }
  })
})

const count = computed(() => {
  void store.version
  return g.computed('discovered')
})

const detail = computed(() => {
  void store.version
  if (focus.value === null) return null
  const c = CATS.find((x) => x.id === focus.value)
  if (!c) return null
  const r = g.s.cats[c.id]
  const found = !!r?.discovered
  const lvl = r ? famLevel(r.familiarity) : 0
  const times = c.times ? c.times.map((t) => PERIOD_LABEL[t]).join('、') : '任何时间'
  const weather = c.weatherOnly ? c.weatherOnly.map((w) => WEATHER_LABEL[w]).join('、') : c.weatherBonus ? `喜欢${Object.keys(c.weatherBonus).map((w) => WEATHER_LABEL[w as keyof typeof WEATHER_LABEL]).join('、')}` : '任何天气'
  const seasons = c.seasons ? c.seasons.map((s) => SEASON_LABEL[s]).join('、') : ''
  return { c, r, found, lvl, times, weather, seasons, hint: c.special ? HINT[c.special] : '' }
})
</script>

<template>
  <Modal title="📖 猫咪图鉴" width="860px" height="86vh" @close="store.open('dex')">
    <template #head>
      <span class="muted">发现：{{ count }} / {{ CATS.length }}</span>
    </template>
    <div v-if="!detail">
      <div class="tabs">
        <button :class="{ on: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button :class="{ on: filter === 'found' }" @click="filter = 'found'">已发现</button>
        <button :class="{ on: filter === 'missing' }" @click="filter = 'missing'">未发现</button>
        <button :class="{ on: filter === 'rare' }" @click="filter = 'rare'">稀有</button>
      </div>
      <div class="grid">
        <button v-for="it in list" :key="it.c.id" class="cell" :class="{ found: it.found }" @click="focus = it.c.id">
          <img class="pixel" :src="img(it.c, !it.found)" />
          <div class="no">{{ String(it.c.id).padStart(3, '0') }}</div>
          <div class="nm">{{ it.known ? it.c.name : '？？？' }}</div>
          <div v-if="it.found" class="fam">{{ '♥'.repeat(it.lvl) }}</div>
        </button>
      </div>
      <div class="muted foot">
        此外，小院还接待过 <b>{{ g.s.randomSeen }}</b> 只叫不出名字的流浪猫 —— 它们由毛色、花纹、眼睛、体型、尾巴、耳朵随机组合而成，共有约
        {{ COMBO_COUNT.toLocaleString() }} 种可能的样子。
      </div>
    </div>

    <div v-else class="detail">
      <button class="px-btn small" @click="focus = null">← 返回列表</button>
      <div class="dwrap">
        <div class="left">
          <div class="big">
            <img class="pixel" :src="store.renderer?.catPreview(detail.c.appearance, detail.found ? 'sit' : 'sit', 6, !detail.found)" />
          </div>
          <div class="poses" v-if="detail.found && detail.lvl >= 2">
            <img v-for="p in ['loaf', 'sleep0', 'walk1', 'groom0']" :key="p" class="pixel" :src="store.renderer?.catPreview(detail.c.appearance, p as any, 2)" />
          </div>
        </div>
        <div class="right">
          <div class="muted">No.{{ String(detail.c.id).padStart(3, '0') }}</div>
          <div class="px-title">{{ detail.found && (detail.r!.familiarity > 0) ? detail.c.name : '？？？' }}</div>
          <template v-if="detail.found">
            <table>
              <tbody>
                <tr><th>外观</th><td>{{ detail.c.look }}</td></tr>
                <tr><th>性别</th><td>{{ detail.c.gender === 'M' ? '♂ 男孩子' : '♀ 女孩子' }}</td></tr>
                <tr><th>熟悉度</th><td><span class="hearts">{{ '♥'.repeat(detail.lvl) }}{{ '♡'.repeat(5 - detail.lvl) }}</span> {{ FAM_LABEL[detail.lvl] }}</td></tr>
                <tr><th>来访次数</th><td>{{ detail.r!.visits }} 次（初次见面：第 {{ Math.floor(detail.r!.firstSeen / 1440) + 1 }} 天 {{ fmtGameStamp(detail.r!.firstSeen) }}）</td></tr>
                <tr><th>性格</th><td>{{ detail.lvl >= 2 ? persText(detail.c) : '？？？（熟悉后解锁）' }}</td></tr>
                <tr><th>出现时间</th><td>{{ detail.lvl >= 2 ? detail.times : '？？？' }}</td></tr>
                <tr><th>出现天气</th><td>{{ detail.lvl >= 2 ? detail.weather + (detail.seasons ? ` · ${detail.seasons}季` : '') : '？？？' }}</td></tr>
                <tr><th>喜欢的食物</th><td>{{ detail.lvl >= 3 ? foodText(detail.c) : '？？？（成为朋友后解锁）' }}</td></tr>
                <tr><th>喜欢的设施</th><td>{{ detail.lvl >= 3 ? detail.c.favoriteFacilities.map(facilityLabel).join('、') : '？？？（成为朋友后解锁）' }}</td></tr>
                <tr>
                  <th>专属宝物</th>
                  <td>
                    <template v-if="detail.r!.treasureGiven">✨ <b>{{ detail.c.treasure.name }}</b><div class="muted">{{ detail.c.treasure.desc }}</div></template>
                    <template v-else>？？？（成为老朋友后，它也许会送你）</template>
                  </td>
                </tr>
              </tbody>
            </table>
            <div class="story">
              <b>猫咪故事</b>
              <p v-if="detail.lvl >= 4">{{ detail.c.story }}</p>
              <p v-else class="muted">成为「老朋友」之后，你会知道它的故事。</p>
            </div>
            <div v-if="detail.lvl >= 3" class="story">
              <b>它说过的话</b>
              <p v-for="l in detail.c.lines.slice(0, Math.min(detail.c.lines.length, detail.lvl + 1))" :key="l" class="quote">“{{ l }}”</p>
            </div>
          </template>
          <template v-else>
            <p class="muted">还没有见过这只猫。</p>
            <p v-if="detail.hint" class="hint">🔍 {{ detail.hint }}</p>
            <p v-else class="muted">改善小院的环境，也许它某天就会来。</p>
          </template>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
  gap: 6px;
  padding: 8px;
  background: #fff8ec;
  border: 2px solid var(--line);
}
.cell {
  font-family: inherit;
  background: #efe3c8;
  border: 2px solid #c9b08a;
  border-radius: 3px;
  padding: 4px 2px;
  cursor: pointer;
  color: var(--ink);
  font-size: 12px;
}
.cell.found {
  background: #fffaf0;
  border-color: var(--line);
}
.cell:hover {
  transform: translateY(-1px);
}
.cell img {
  width: 84px;
  height: 72px;
}
.no {
  font-size: 10px;
  color: var(--ink2);
}
.nm {
  font-weight: bold;
}
.fam {
  color: #e05a7a;
  font-size: 10px;
  height: 12px;
}
.foot {
  margin-top: 8px;
  line-height: 1.6;
}
.dwrap {
  display: flex;
  gap: 16px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.left {
  width: 200px;
}
.big {
  background: repeating-linear-gradient(45deg, #efe0c0 0 8px, #f4e8cd 8px 16px);
  border: 2px solid var(--line);
  display: flex;
  justify-content: center;
  padding: 8px;
}
.big img {
  width: 168px;
}
.poses {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
}
.right {
  flex: 1;
  min-width: 260px;
  font-size: 13px;
}
table {
  border-collapse: collapse;
  margin-top: 8px;
  width: 100%;
}
th {
  text-align: left;
  width: 86px;
  color: var(--ink2);
  font-weight: normal;
  vertical-align: top;
  padding: 3px 0;
}
td {
  padding: 3px 0;
}
.hearts {
  color: #e05a7a;
}
.story {
  margin-top: 10px;
  background: #fff8ec;
  border: 2px dashed #c9b08a;
  padding: 8px 10px;
  line-height: 1.7;
}
.story p {
  margin: 4px 0;
}
.quote {
  color: var(--ink2);
}
.hint {
  background: #fff8ec;
  border: 2px dashed #c9b08a;
  padding: 8px;
}
</style>
