<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from './Modal.vue'
import { useGameStore } from '@/stores/game'
import { MATERIALS, TREASURES } from '@/data/items'
import { BUILDING_MAP, FOOD_PRICE } from '@/data/buildings'
import { QUALITY_LABEL, QUALITY_COLOR, FOOD_LABEL, type FoodType } from '@/game/types'

const store = useGameStore()
const g = store.game
const tab = ref<'mat' | 'treasure' | 'facility' | 'food'>('mat')
const hover = ref<string | null>(null)

const mats = computed(() => {
  void store.version
  return MATERIALS.map((m) => ({
    m,
    n: g.invCount(m.id),
    ever: (g.s.stats['item_' + m.id] ?? 0) > 0 || g.s.settings.godMode,
  }))
})
const treasures = computed(() => {
  void store.version
  return TREASURES.map((t) => ({ t, has: (g.s.inventory[t.id] ?? 0) > 0, cat: g.catDef(t.treasureOf!) }))
})
const facilities = computed(() => {
  void store.version
  return Object.entries(g.s.warehouse).filter(([, n]) => n > 0).map(([id, n]) => ({ d: BUILDING_MAP[id], n }))
})
const foods: FoodType[] = ['kibble', 'fish', 'canned', 'treat']
const FOOD_DESC: Record<FoodType, string> = {
  kibble: '最普通的猫粮，管够。',
  fish: '香喷喷的小鱼干，爱吃鱼的猫会被吸引过来。',
  canned: '罐头！挑食的猫也无法拒绝。',
  treat: '冻干零食，稀有的猫似乎特别喜欢。',
}
function buy(f: FoodType, n: number) {
  if (!g.buyFood(f, n)) store.toast('爱心不够', '💗')
}
function convert(id: string) {
  if (g.convert(id)) store.toast(`旧物改造：获得 ${MATERIALS.find((m) => m.id === id)?.name} ×1`, '🛠')
  else store.toast('同品质的其他材料不够', '🛠')
}
const distinct = computed(() => {
  void store.version
  return g.computed('distinctItems')
})
const fmt = (n: number) => (n === Infinity ? '∞' : String(n))
</script>

<template>
  <Modal title="🎒 仓库" width="760px" @close="store.open('inventory')">
    <template #head><span class="muted">收集过 {{ distinct }} 种小东西 · 💗{{ g.s.hearts }}</span></template>
    <div class="tabs">
      <button :class="{ on: tab === 'mat' }" @click="tab = 'mat'">材料</button>
      <button :class="{ on: tab === 'treasure' }" @click="tab = 'treasure'">猫咪宝物</button>
      <button :class="{ on: tab === 'facility' }" @click="tab = 'facility'">设施</button>
      <button :class="{ on: tab === 'food' }" @click="tab = 'food'">食物</button>
    </div>
    <div class="box">
      <div v-if="tab === 'mat'" class="muted conv-tip">把鼠标移到材料上，可以用多余的同品质材料“旧物改造”出需要的那一种。</div>
      <div v-if="tab === 'mat'" class="grid">
        <div v-for="it in mats" :key="it.m.id" class="slot" :class="{ none: !it.ever }" :style="{ borderColor: QUALITY_COLOR[it.m.quality] }" @mouseenter="hover = it.m.id" @mouseleave="hover = null">
          <div class="ic">{{ it.ever ? it.m.icon : '❔' }}</div>
          <div class="nm">{{ it.ever ? it.m.name : '？？？' }}</div>
          <div class="n">×{{ fmt(it.n) }}</div>
          <div v-if="hover === it.m.id" class="tip px-panel">
            <b>{{ it.ever ? it.m.name : '？？？' }}</b> <span :style="{ color: QUALITY_COLOR[it.m.quality] }">【{{ QUALITY_LABEL[it.m.quality] }}】</span>
            <div v-if="it.ever" class="muted">{{ it.m.desc }}</div>
            <button class="px-btn small conv" :disabled="!g.canConvert(it.m.id)" @click.stop="convert(it.m.id)">{{ g.s.settings.godMode ? '🛠 改造 1 个（上帝模式：免费）' : `🛠 改造 1 个（消耗 ${g.convertCost(it.m.id)} 个同品质材料）` }}</button>
          </div>
        </div>
      </div>
      <div v-else-if="tab === 'treasure'" class="tlist">
        <div v-for="it in treasures" :key="it.t.id" class="trow" :class="{ none: !it.has }">
          <span class="ic">{{ it.has ? '✨' : '❔' }}</span>
          <div>
            <b>{{ it.has ? it.t.name : '？？？' }}</b>
            <span class="muted"> —— {{ it.has ? it.cat?.name + '的宝物' : `No.${String(it.t.treasureOf).padStart(3, '0')} 的宝物` }}</span>
            <div v-if="it.has" class="muted">{{ it.t.desc }}</div>
          </div>
        </div>
      </div>
      <div v-else-if="tab === 'facility'">
        <div v-if="!facilities.length" class="muted empty">没有收起来的设施。</div>
        <div v-for="f in facilities" :key="f.d.id" class="frow">
          <img class="pixel" :src="store.renderer?.buildingPreview(f.d.id, 0, 1)" />
          <b>{{ f.d.name }}</b> ×{{ f.n }}
          <span class="muted">{{ f.d.desc }}</span>
        </div>
        <button v-if="facilities.length" class="px-btn small primary" style="margin-top: 8px" @click="store.open('build')">去放置</button>
      </div>
      <div v-else class="foods">
        <div v-for="f in foods" :key="f" class="food">
          <b>{{ FOOD_LABEL[f] }}</b>
          <span class="muted">{{ FOOD_DESC[f] }}</span>
          <span class="stock">库存：{{ f === 'kibble' || g.s.settings.godMode ? '∞' : g.s.foodStock[f] ?? 0 }}</span>
          <template v-if="f !== 'kibble'">
            <button class="px-btn small" :disabled="g.s.hearts < FOOD_PRICE[f]" @click="buy(f, 1)">💗{{ FOOD_PRICE[f] }} 换 1 份</button>
            <button class="px-btn small" :disabled="g.s.hearts < FOOD_PRICE[f] * 5" @click="buy(f, 5)">💗{{ FOOD_PRICE[f] * 5 }} 换 5 份</button>
          </template>
        </div>
        <p class="muted">点击小院里的猫碗即可倒入食物。1 份食物可以装满一个碗。</p>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.box {
  background: #fff8ec;
  border: 2px solid var(--line);
  padding: 8px;
  min-height: 300px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(82px, 1fr));
  gap: 6px;
}
.slot {
  position: relative;
  border: 2px solid;
  border-radius: 3px;
  background: #fffdf6;
  text-align: center;
  padding: 4px;
  font-size: 12px;
}
.slot.none {
  opacity: 0.45;
}
.ic {
  font-size: 22px;
}
.n {
  color: var(--ink2);
}
.tip {
  position: absolute;
  z-index: 5;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  width: 200px;
  padding: 6px 8px;
  text-align: left;
}
.conv {
  margin-top: 6px;
  white-space: normal;
  text-align: left;
}
.conv-tip {
  margin-bottom: 6px;
}
.trow,
.frow {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 5px 2px;
  border-bottom: 2px dotted #e0cba6;
  font-size: 13px;
}
.trow.none {
  opacity: 0.5;
}
.frow img {
  max-height: 40px;
}
.food {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 2px;
  border-bottom: 2px dotted #e0cba6;
  font-size: 13px;
}
.stock {
  margin-left: auto;
}
.empty {
  padding: 30px;
  text-align: center;
}
</style>
