<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/game'
import { BUILDINGS, BUILDING_MAP, YARD_LEVELS } from '@/data/buildings'
import { ITEMS } from '@/data/items'
import { CATEGORY_LABEL, type BuildingCategory } from '@/game/types'
import { STAT_LABEL } from '@/game/world/yard'

const store = useGameStore()
const g = store.game
const cat = ref<BuildingCategory | 'owned'>('owned')
const cats: (BuildingCategory | 'owned')[] = ['owned', 'food', 'water', 'rest', 'play', 'hygiene', 'shelter', 'plant', 'decor', 'floor']
const previews = new Map<string, string>()
const fmt = (n: number) => (n === Infinity ? '∞' : String(n))

function preview(id: string, skin = 0) {
  const k = id + skin
  if (!previews.has(k)) previews.set(k, store.renderer?.buildingPreview(id, skin, 2) ?? '')
  return previews.get(k)!
}

const list = computed(() => {
  void store.version
  const arr = cat.value === 'owned' ? BUILDINGS.filter((d) => (g.s.warehouse[d.id] ?? 0) > 0) : BUILDINGS.filter((d) => d.category === cat.value)
  return arr.map((d) => ({
    d,
    owned: g.s.warehouse[d.id] ?? 0,
    placed: g.s.buildings.filter((b) => b.defId === d.id).length,
    locked: d.unlockLevel > g.s.yardLevel,
    can: g.canCraft(d.id),
    recipe: Object.entries(d.recipe).map(([k, v]) => ({ id: k, name: ITEMS[k]?.name ?? k, icon: ITEMS[k]?.icon ?? '', need: v, have: g.invCount(k) })),
    stats: Object.entries(d.stats).map(([k, v]) => `${STAT_LABEL[k as keyof typeof STAT_LABEL] ?? k}+${v}`).join(' '),
  }))
})

const sel = computed(() => {
  void store.version
  const b = store.buildSelected
  if (!b || !g.s.buildings.includes(b)) return null
  return { b, d: BUILDING_MAP[b.defId] }
})

const placing = computed(() => {
  void store.version
  return store.renderer?.build.placing ?? null
})

const nextLevel = computed(() => {
  void store.version
  const n = YARD_LEVELS[g.s.yardLevel]
  if (!n) return null
  return {
    n,
    can: g.canUpgradeYard(),
    items: Object.entries(n.cost.items).map(([k, v]) => ({ name: ITEMS[k]?.name ?? k, icon: ITEMS[k]?.icon, need: v, have: g.invCount(k) })),
  }
})

function craft(id: string) {
  if (g.craft(id)) store.bump()
}
function startPlace(id: string) {
  const r = store.renderer
  if (!r) return
  r.build.placing = id
  r.build.flip = false
  r.build.skin = 0
  r.build.selected = null
  store.buildSelected = null
  store.bump()
}
function cancelPlace() {
  const r = store.renderer
  if (r) r.build.placing = null
  store.bump()
}
function flip() {
  const r = store.renderer
  if (r?.build.placing) {
    r.build.flip = !r.build.flip
  } else if (sel.value) g.flipBuilding(sel.value.b)
  store.bump()
}
function skin() {
  if (sel.value && !g.skinBuilding(sel.value.b)) store.toast('这个设施没有其他皮肤', '🎨')
  else if (sel.value) store.renderer?.clearBuildingCache()
  store.bump()
}
function storeIt() {
  if (!sel.value) return
  g.storeBuilding(sel.value.b)
  store.buildSelected = null
  if (store.renderer) store.renderer.build.selected = null
  store.bump()
}
function upgrade() {
  if (g.upgradeYard()) store.bump()
}
</script>

<template>
  <!-- 放置中：隐藏主面板，只保留一条悬浮工具条，避免挡住小院 -->
  <div v-if="placing" class="placing-bar px-panel">
    <img class="pixel" :src="preview(placing)" />
    <div>
      <div>正在放置：<b>{{ BUILDING_MAP[placing].name }}</b><span class="muted">（剩余 {{ g.s.warehouse[placing] ?? 0 }}）</span></div>
      <div class="muted">在小院里点击放置，右键可退出</div>
      <div class="acts">
        <button class="px-btn small" @click="flip">↔ 旋转</button>
        <button class="px-btn small" @click="cancelPlace">取消</button>
      </div>
    </div>
  </div>

  <div v-else class="build px-panel">
    <div class="head">
      <span class="px-title">🔨 建造</span>
      <span class="muted">💗{{ g.s.hearts }}</span>
      <button class="px-btn small" style="margin-left: auto" @click="store.open('build')">完成</button>
    </div>

    <div v-if="sel" class="placing">
      <img class="pixel" :src="preview(sel.d.id, sel.b.skin)" />
      <div>
        已选中：<b>{{ sel.d.name }}</b>
        <div class="muted">拖动可以移动位置</div>
        <div class="acts">
          <button class="px-btn small" @click="flip">↔ 旋转</button>
          <button class="px-btn small" :disabled="(sel.d.skins?.length ?? 0) < 2" @click="skin">🎨 皮肤</button>
          <button class="px-btn small" @click="storeIt">📦 收回仓库</button>
        </div>
      </div>
    </div>
    <div v-else class="muted hint">点击小院里的设施可以选中、拖动、旋转或收回。</div>

    <div v-if="nextLevel" class="upgrade">
      <div>
        <b>扩建：{{ nextLevel.n.name }}</b> <span class="muted">（{{ nextLevel.n.w }}×{{ nextLevel.n.h }}，最多 {{ nextLevel.n.maxCats }} 只猫）</span>
      </div>
      <div class="muted">{{ nextLevel.n.desc }}</div>
      <div class="recipe">
        <span :class="{ lack: !g.s.settings.godMode && g.s.hearts < nextLevel.n.cost.hearts }">💗{{ g.s.hearts }}/{{ nextLevel.n.cost.hearts }}</span>
        <span v-for="it in nextLevel.items" :key="it.name" :class="{ lack: it.have < it.need }">{{ it.icon }}{{ it.name }} {{ fmt(it.have) }}/{{ it.need }}</span>
      </div>
      <button class="px-btn small green" :disabled="!nextLevel.can" @click="upgrade">🏡 扩建小院</button>
    </div>
    <div v-else class="upgrade muted">小院已经是最高等级「流浪猫之家」了。</div>

    <div class="tabs">
      <button v-for="c in cats" :key="c" :class="{ on: cat === c }" @click="cat = c">{{ c === 'owned' ? '仓库中' : CATEGORY_LABEL[c] }}</button>
    </div>
    <div class="list scroll">
      <div v-if="!list.length" class="muted empty">{{ cat === 'owned' ? '仓库里没有未放置的设施。去其他分类制作吧！' : '这里什么都没有' }}</div>
      <div v-for="it in list" :key="it.d.id" class="item" :class="{ locked: it.locked }">
        <div class="pv"><img class="pixel" :src="preview(it.d.id)" /></div>
        <div class="info">
          <div>
            <b>{{ it.d.name }}</b>
            <span class="muted"> {{ it.d.w }}×{{ it.d.h }}</span>
            <span v-if="it.placed" class="muted"> · 已放置{{ it.placed }}</span>
          </div>
          <div class="muted">{{ it.d.desc }}</div>
          <div class="muted">{{ it.stats }}</div>
          <div v-if="it.locked" class="lack">需要小院等级 {{ it.d.unlockLevel }}</div>
          <div v-else class="recipe">
            <span v-for="r in it.recipe" :key="r.id" :class="{ lack: r.have < r.need }" :title="r.name">{{ r.icon }}{{ r.name }} {{ fmt(r.have) }}/{{ r.need }}</span>
            <span v-if="it.d.hearts" :class="{ lack: !g.s.settings.godMode && g.s.hearts < it.d.hearts }">💗{{ it.d.hearts }}</span>
          </div>
        </div>
        <div class="ops">
          <button v-if="!it.locked" class="px-btn small" :disabled="!it.can" @click="craft(it.d.id)">制作</button>
          <button class="px-btn small primary" :disabled="it.owned <= 0" @click="startPlace(it.d.id)">放置 {{ it.owned ? '×' + it.owned : '' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.build {
  position: absolute;
  right: 8px;
  top: 52px;
  bottom: calc(62px + var(--sab));
  width: 360px;
  display: flex;
  flex-direction: column;
  padding: 10px;
  z-index: 24;
  font-size: 12px;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.placing-bar {
  position: absolute;
  top: calc(64px + var(--sat));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  z-index: 24;
  font-size: 12px;
}
.placing-bar img {
  max-width: 56px;
  max-height: 56px;
}
.placing {
  display: flex;
  gap: 8px;
  align-items: center;
  background: #fff8ec;
  border: 2px dashed #c9b08a;
  padding: 6px;
  margin-bottom: 6px;
}
.placing img {
  max-width: 64px;
  max-height: 64px;
}
.hint {
  margin-bottom: 6px;
}
.acts {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}
.upgrade {
  background: #eef6e2;
  border: 2px solid #9fbf7a;
  padding: 6px;
  margin-bottom: 6px;
  border-radius: 3px;
}
.upgrade .px-btn {
  margin-top: 4px;
}
.list {
  flex: 1;
  min-height: 0;
  border: 2px solid var(--line);
  background: #fff8ec;
  padding: 4px;
}
.item {
  display: flex;
  gap: 6px;
  padding: 6px 4px;
  border-bottom: 2px dotted #e0cba6;
  align-items: center;
}
.item.locked {
  opacity: 0.55;
}
.pv {
  width: 56px;
  min-width: 56px;
  height: 56px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  overflow: hidden;
}
.pv img {
  max-width: 56px;
  max-height: 56px;
}
.info {
  flex: 1;
  line-height: 1.45;
}
.recipe {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
}
.lack {
  color: #c2453a;
}
.ops {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.empty {
  padding: 16px;
  text-align: center;
}
html.portrait .build {
  left: 6px;
  right: 6px;
  width: auto;
  top: calc(var(--canvas-bottom) + 4px);
  bottom: calc(62px + var(--sab));
  height: auto;
  overflow-y: auto;
}
html.portrait .list {
  min-height: 220px;
}
html.portrait .hint,
html.portrait .upgrade > .muted {
  display: none;
}
@media (max-width: 720px) {
  .build {
    left: 6px;
    right: 6px;
    width: auto;
    top: auto;
    height: 52vh;
  }
}
</style>
