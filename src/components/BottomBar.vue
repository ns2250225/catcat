<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore, type Panel } from '@/stores/game'
import { CATS } from '@/data/cats'

const store = useGameStore()
const g = store.game
const discovered = computed(() => {
  void store.version
  return g.computed('discovered')
})
const items: { p: Panel; icon: string; label: string }[] = [
  { p: 'dex', icon: '📖', label: '图鉴' },
  { p: 'inventory', icon: '🎒', label: '仓库' },
  { p: 'build', icon: '🔨', label: '建造' },
  { p: 'log', icon: '🐾', label: '来访记录' },
  { p: 'achievements', icon: '🏆', label: '成就' },
  { p: 'settings', icon: '⚙️', label: '设置' },
]
</script>

<template>
  <div class="bottom px-panel">
    <button v-for="it in items" :key="it.p" class="nav" :class="{ on: store.panel === it.p }" @click="store.open(it.p)">
      <span class="ic">{{ it.icon }}</span>
      <span class="lb">{{ it.label }}<template v-if="it.p === 'dex'"> {{ discovered }}/{{ CATS.length }}</template></span>
    </button>
  </div>
</template>

<style scoped>
.bottom {
  position: absolute;
  bottom: calc(8px + var(--sab));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 2px;
  padding: 3px;
  z-index: 20;
}
.nav {
  font-family: inherit;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  padding: 5px 10px;
  border: 2px solid transparent;
  background: none;
  cursor: pointer;
  color: var(--ink);
  border-radius: 3px;
}
.nav:hover {
  background: #fff4dc;
}
.nav.on {
  background: #fff4dc;
  border-color: var(--line);
}
.ic {
  font-size: 18px;
}
@media (max-width: 720px), (max-height: 500px) {
  .lb {
    display: none;
  }
  .nav {
    padding: 6px 9px;
  }
}
</style>
