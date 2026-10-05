<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { BUILDING_MAP } from '@/data/buildings'

const store = useGameStore()
const g = store.game

/** 当前移动的设施名（移动中点击别的设施可切换目标） */
const name = computed(() => {
  void store.version
  const r = store.renderer
  if (!r || !store.moveMode) return ''
  const b = g.s.buildings.find((x) => x.uid === r.build.selected)
  return b ? (BUILDING_MAP[b.defId]?.name ?? '') : ''
})
</script>

<template>
  <div v-if="name" class="move-bar px-panel">
    <span>正在移动 <b>{{ name }}</b><span class="muted">　拖到新位置，点空地结束</span></span>
    <button class="px-btn small" @click="store.endMove()">完成</button>
  </div>
</template>

<style scoped>
.move-bar {
  position: absolute;
  top: calc(64px + var(--sat));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  z-index: 24;
  font-size: 13px;
  animation: pop 0.2s ease-out;
}
@keyframes pop {
  from {
    transform: translateX(-50%) scale(0.85);
    opacity: 0;
  }
}
</style>
