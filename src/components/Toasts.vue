<script setup lang="ts">
import { useGameStore } from '@/stores/game'
const store = useGameStore()
</script>

<template>
  <div class="toasts">
    <transition-group name="fade">
      <div v-for="t in store.toasts" :key="t.id" class="toast px-panel">{{ t.icon }} {{ t.text }}</div>
    </transition-group>
  </div>
</template>

<style scoped>
.toasts {
  position: absolute;
  left: 12px;
  top: 56px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  z-index: 60;
  pointer-events: none;
  max-width: 60vw;
}
.toast {
  padding: 6px 12px;
  font-size: 13px;
}
html.portrait .toasts {
  max-width: calc(100vw - 24px);
}
html.portrait .toast {
  font-size: 12px;
  padding: 4px 8px;
}
html.portrait .toast:nth-last-child(n + 4) {
  display: none;
}
</style>
