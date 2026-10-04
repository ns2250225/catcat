<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { BUILDING_MAP } from '@/data/buildings'
import { FOOD_LABEL, CATEGORY_LABEL, type FoodType } from '@/game/types'
import { STAT_LABEL } from '@/game/world/yard'

const store = useGameStore()
const g = store.game

const info = computed(() => {
  void store.version
  void store.tickV
  const m = store.buildingMenu
  if (!m) return null
  const b = g.s.buildings.find((x) => x.uid === m.b.uid)
  if (!b) return null
  const d = BUILDING_MAP[b.defId]
  const occ = g.occupants(b).map((c) => c.name)
  return {
    b,
    d,
    occ,
    stats: Object.entries(d.stats).map(([k, v]) => `${STAT_LABEL[k as keyof typeof STAT_LABEL] ?? k}+${v}`).join('  '),
    x: Math.min(window.innerWidth - 250, Math.max(8, m.x - 110)),
    y: Math.min(window.innerHeight - 260, Math.max(56, m.y - 40)),
  }
})

function fill(t: FoodType) {
  const i = info.value
  if (!i) return
  if (t !== 'kibble' && (g.s.foodStock[t] ?? 0) <= 0) {
    store.toast(`${FOOD_LABEL[t]}没有库存了，去仓库用爱心换一些吧`, '🐟')
    return
  }
  if (!g.fillFood(i.b, t)) store.toast('已经是满的啦', '🥣')
  else store.buildingMenu = null
}
function water() {
  const i = info.value
  if (i && !g.fillWater(i.b)) store.toast('水已经满了', '💧')
  else store.buildingMenu = null
}
function clean() {
  const i = info.value
  if (i && !g.cleanLitter(i.b)) store.toast('已经很干净了', '✨')
  else store.buildingMenu = null
}
</script>

<template>
  <div v-if="info" class="menu px-panel" :style="{ left: info.x + 'px', top: info.y + 'px' }">
    <div class="hd">
      <b>{{ info.d.name }}</b>
      <span class="muted">{{ CATEGORY_LABEL[info.d.category] }}</span>
      <button class="px-btn small x" @click="store.buildingMenu = null">✕</button>
    </div>
    <div class="muted desc">{{ info.d.desc }}</div>
    <div v-if="info.stats" class="muted">{{ info.stats }}</div>

    <template v-if="info.d.foodCap">
      <div class="meter">
        🍚 {{ FOOD_LABEL[info.b.foodType] }} {{ info.b.food }}/{{ info.d.foodCap }}
        <div class="bar"><div :style="{ width: (info.b.food / info.d.foodCap) * 100 + '%' }"></div></div>
      </div>
      <div class="acts">
        <button v-for="f in info.d.foods" :key="f" class="px-btn small" @click="fill(f)">
          倒{{ FOOD_LABEL[f] }}<template v-if="f !== 'kibble'"> ({{ g.s.foodStock[f] ?? 0 }})</template>
        </button>
      </div>
      <div v-if="info.d.autoFill" class="muted">会自动补充猫粮</div>
    </template>

    <template v-if="info.d.waterCap">
      <div class="meter">
        💧 清水 {{ info.b.water }}/{{ info.d.waterCap }}
        <div class="bar blue"><div :style="{ width: (info.b.water / info.d.waterCap) * 100 + '%' }"></div></div>
      </div>
      <div class="acts"><button class="px-btn small" @click="water">加满清水</button></div>
    </template>

    <template v-if="info.d.dirtCap">
      <div class="meter">
        🧹 脏污 {{ info.b.dirt }}/{{ info.d.dirtCap }}
        <div class="bar brown"><div :style="{ width: (info.b.dirt / info.d.dirtCap) * 100 + '%' }"></div></div>
      </div>
      <div class="acts"><button class="px-btn small" @click="clean">清理猫砂</button></div>
    </template>

    <div class="muted occ">
      {{ info.occ.length ? `正在使用：${info.occ.join('、')}` : `可同时容纳 ${info.d.capacity} 只猫` }}
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: absolute;
  width: 240px;
  padding: 10px 12px;
  z-index: 26;
  font-size: 13px;
}
html.portrait .menu {
  left: 6px !important;
  right: 6px;
  width: auto;
  top: calc(var(--canvas-bottom) + 6px) !important;
}
.hd {
  display: flex;
  gap: 6px;
  align-items: center;
}
.x {
  margin-left: auto;
}
.desc {
  margin: 4px 0;
}
.meter {
  margin-top: 8px;
}
.bar {
  height: 7px;
  border: 1px solid var(--line);
  background: #fff;
  margin-top: 3px;
}
.bar div {
  height: 100%;
  background: #d9a05a;
}
.bar.blue div {
  background: #5fa8d9;
}
.bar.brown div {
  background: #8a6a48;
}
.acts {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.occ {
  margin-top: 8px;
}
</style>
