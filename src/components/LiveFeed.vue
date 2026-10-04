<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { fmtGameStamp } from '@/game/world/clock'
import { STATE_LABEL } from '@/utils/labels'
import type { Cat } from '@/game/cats/Cat'

/** 竖屏时显示在画布下方：小院里的猫与最新动态 */
const store = useGameStore()
const g = store.game

const cats = computed(() => {
  void store.tickV
  void store.version
  return g.cats
    .filter((c) => !c.leaving)
    .map((c) => ({
      c,
      name: !c.isFixed || (g.s.cats[c.id]?.familiarity ?? 0) > 0 ? c.name : '？？？',
      state: STATE_LABEL[c.state],
      img: store.renderer?.catPreview(c.appearance, 'sit', 1),
    }))
})
const logs = computed(() => {
  void store.version
  return g.s.log.slice(-8).reverse()
})
const gifts = computed(() => {
  void store.tickV
  return g.s.gifts.length
})

function pick(c: Cat) {
  store.renderer?.focus(c.x, c.y)
  store.buildingMenu = null
  store.selectedCat = c
}
function home() {
  const moved = store.renderer?.recenter()
  if (!moved) store.toast('已经在小院中央啦，左右拖动画面可以看看周围', '🎯')
}
function openGifts() {
  // 依次打开地上的礼物
  if (g.s.gifts.length) {
    const gf = g.s.gifts[g.s.gifts.length - 1]
    store.renderer?.focus(gf.x, gf.y)
    g.openGift(g.s.gifts.length - 1)
  }
}
</script>

<template>
  <div class="feed px-panel">
    <div class="row-h">
      <b>院子里的猫 {{ cats.length }}/{{ g.maxCats }}</b>
      <button v-if="gifts" class="px-btn small" @click="openGifts">🎁 收礼物 ×{{ gifts }}</button>
      <button class="px-btn small" @click="home">🎯 回到小院</button>
    </div>
    <div class="cats">
      <div v-if="!cats.length" class="muted">还没有猫来……准备好食物，耐心等等。</div>
      <button v-for="it in cats" :key="it.c.uid" class="chip" @click="pick(it.c)">
        <img class="pixel" :src="it.img" />
        <span>
          <b>{{ it.name }}</b>
          <small>{{ it.state }}</small>
        </span>
      </button>
    </div>
    <div class="logs scroll">
      <div v-for="(l, i) in logs" :key="i" class="log" :class="l.kind">
        <span class="t">{{ fmtGameStamp(l.t) }}</span>{{ l.text }}
      </div>
    </div>
    <div class="muted hint">左右拖动画面可以看到整个小院</div>
  </div>
</template>

<style scoped>
.feed {
  position: absolute;
  left: 6px;
  right: 6px;
  top: calc(var(--canvas-bottom, 60vh) + 6px);
  bottom: calc(64px + var(--sab));
  z-index: 15;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  min-height: 0;
}
.row-h {
  display: flex;
  gap: 6px;
  align-items: center;
}
.row-h b {
  margin-right: auto;
}
.cats {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
  flex-shrink: 0;
}
.chip {
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 2px;
  border: 2px solid var(--line);
  border-radius: 3px;
  background: #fff8ec;
  color: var(--ink);
  cursor: pointer;
  white-space: nowrap;
}
.chip img {
  width: 28px;
  height: 24px;
}
.chip span {
  display: flex;
  flex-direction: column;
  text-align: left;
  line-height: 1.2;
}
.chip small {
  color: var(--ink2);
  font-size: 10px;
}
.logs {
  flex: 1;
  min-height: 0;
  background: #fff8ec;
  border: 2px dashed #c9b08a;
  padding: 4px 8px;
}
.log {
  line-height: 1.6;
}
.t {
  color: var(--ink2);
  margin-right: 6px;
}
.log.new {
  color: #b0582a;
  font-weight: bold;
}
.log.gift {
  color: #8a6a1a;
}
.log.event {
  color: #4a6a8a;
}
.hint {
  text-align: center;
  font-size: 11px;
}
</style>
