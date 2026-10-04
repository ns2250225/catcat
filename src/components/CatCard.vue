<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/game'
import { PERSONALITY_LABEL, FOOD_LABEL } from '@/game/types'
import { FAM_LABEL } from '@/game/constants'
import { STATE_LABEL, facilityLabel } from '@/utils/labels'

const store = useGameStore()
const g = store.game
const petMsg = ref('')

const info = computed(() => {
  void store.tickV
  void store.version
  const c = store.selectedCat
  if (!c) return null
  if (c.gone) {
    store.selectedCat = null
    return null
  }
  const rec = c.isFixed ? g.s.cats[c.id] : undefined
  const lvl = c.isFixed ? g.famLevelOf(c) : 0
  const known = !c.isFixed || (rec?.familiarity ?? 0) >= 6 || lvl >= 1
  return {
    c,
    img: store.renderer?.catPreview(c.appearance, c.pose, 5),
    name: known ? c.name : '？？？',
    no: c.isFixed ? 'No.' + String(c.id).padStart(3, '0') : '路过的流浪猫',
    look: c.def?.look ?? '',
    lvl,
    famLabel: c.isFixed ? FAM_LABEL[lvl] : '陌生',
    visits: rec?.visits ?? 1,
    pers: lvl >= 2 || !c.isFixed ? c.personalities.map((p) => PERSONALITY_LABEL[p]).join(' / ') : '？？？（再熟悉一点才知道）',
    likes:
      lvl >= 3
        ? [...c.favoriteFoods.map((f) => FOOD_LABEL[f]), ...c.favoriteFacilities.map(facilityLabel)].join('、')
        : c.isFixed
          ? '？？？（成为朋友后知道）'
          : c.favoriteFoods.map((f) => FOOD_LABEL[f]).join('、'),
    state: STATE_LABEL[c.state] ?? '',
    line: c.bubble?.text ?? '',
    needs: [
      ['饱腹', 100 - c.needs.hunger],
      ['口渴', 100 - c.needs.thirst],
      ['精力', 100 - c.needs.fatigue],
      ['心情', 100 - c.needs.boredom],
      ['安全感', c.needs.safety],
    ] as [string, number][],
    canDex: c.isFixed && rec?.discovered,
  }
})

function pet() {
  const c = store.selectedCat
  if (!c) return
  const r = g.petCat(c)
  petMsg.value = r === 'ok' ? `${c.name}舒服地眯起了眼睛` : r === 'cooldown' ? '让它歇一会儿吧' : '它好像还不太习惯被摸……'
  setTimeout(() => (petMsg.value = ''), 2500)
  store.bump()
}

function openDex() {
  if (!store.selectedCat) return
  store.dexFocus = store.selectedCat.id
  store.selectedCat = null
  store.panel = 'dex'
}
</script>

<template>
  <div v-if="info" class="card px-panel">
    <button class="px-btn small x" @click="store.selectedCat = null">✕</button>
    <div class="pic">
      <img class="pixel" :src="info.img" :style="{ transform: `scaleX(${info.c.facing})` }" />
    </div>
    <div class="no muted">{{ info.no }} <span v-if="info.look">· {{ info.look }}</span></div>
    <div class="px-title">{{ info.name }}</div>
    <div class="row"><b>性格：</b>{{ info.pers }}</div>
    <div class="row">
      <b>熟悉度：</b>
      <span class="hearts">
        <span v-for="i in 5" :key="i">{{ i <= info.lvl ? '♥' : '♡' }}</span>
      </span>
      <span class="muted"> {{ info.famLabel }}</span>
    </div>
    <div class="row"><b>来访次数：</b>{{ info.visits }}</div>
    <div class="row"><b>喜欢：</b>{{ info.likes }}</div>
    <div class="row muted">此刻：{{ info.state }}</div>
    <div class="needs">
      <div v-for="[k, v] in info.needs" :key="k" class="need">
        <span>{{ k }}</span>
        <div class="bar"><div :style="{ width: Math.max(0, Math.min(100, v)) + '%' }"></div></div>
      </div>
    </div>
    <div v-if="info.line" class="line">“{{ info.line }}”</div>
    <div v-if="petMsg" class="muted pet">{{ petMsg }}</div>
    <div class="btns">
      <button class="px-btn primary" @click="pet">🖐 摸摸</button>
      <button v-if="info.canDex" class="px-btn" @click="openDex">📖 图鉴</button>
    </div>
  </div>
</template>

<style scoped>
.card {
  position: absolute;
  right: 12px;
  top: 56px;
  width: 270px;
  padding: 12px 14px;
  z-index: 25;
  font-size: 13px;
  max-height: calc(100vh - 120px);
  overflow-y: auto;
}
.x {
  position: absolute;
  right: 8px;
  top: 8px;
}
.pic {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: repeating-linear-gradient(45deg, #efe0c0 0 6px, #f4e8cd 6px 12px);
  border: 2px solid var(--line);
  border-radius: 3px;
  margin-bottom: 6px;
}
.row {
  margin: 4px 0;
  line-height: 1.5;
}
.hearts {
  color: #e05a7a;
  letter-spacing: 2px;
}
.needs {
  margin: 6px 0;
}
.need {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  margin: 2px 0;
}
.need span {
  width: 40px;
}
.bar {
  flex: 1;
  height: 6px;
  border: 1px solid var(--line);
  background: #fff;
}
.bar div {
  height: 100%;
  background: var(--accent2);
}
.line {
  margin: 8px 0;
  padding: 6px 8px;
  background: #fff8ec;
  border: 2px dashed #c9b08a;
}
.pet {
  margin: 4px 0;
}
.btns {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
@media (max-width: 720px) {
  .card {
    right: 6px;
    left: 6px;
    width: auto;
    top: auto;
    bottom: calc(64px + var(--sab));
  }
}
html.portrait .card {
  left: 6px;
  right: 6px;
  width: auto;
  top: calc(var(--canvas-bottom) + 6px);
  bottom: calc(64px + var(--sab));
  max-height: none;
}
html.portrait .pic {
  height: 80px;
}
html.portrait .pic img {
  height: 72px;
}
</style>
