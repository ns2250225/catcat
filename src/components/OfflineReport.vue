<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const emit = defineEmits<{ close: [] }>()
const store = useGameStore()
const r = computed(() => store.game.offlineReport!)
const dur = computed(() => {
  const s = r.value.seconds
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h} 小时 ${m} 分钟` : `${m} 分钟`
})
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="box px-panel">
      <div class="px-title">你离开的 {{ dur }}里……</div>
      <div class="rows">
        <div>🐈 {{ r.visits }} 只猫来过</div>
        <div>🎁 收到 {{ r.gifts }} 份礼物</div>
        <div>🍚 消耗 {{ r.food }} 份食物 · 💧 {{ r.water }} 份清水</div>
        <div>💗 获得 {{ r.hearts }} 颗爱心</div>
      </div>
      <div v-if="r.newCats.length" class="new">
        <div class="muted">新朋友：</div>
        <b v-for="n in r.newCats" :key="n">「{{ n }}」</b>
      </div>
      <div v-if="r.seconds > 12 * 3600" class="muted">（最多记录 12 小时内发生的事）</div>
      <button class="px-btn primary" @click="emit('close')">看看小院</button>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 16, 26, 0.4);
}
.box {
  padding: 18px 26px;
  min-width: 300px;
  text-align: center;
}
.rows {
  margin: 14px 0;
  line-height: 2;
  font-size: 15px;
}
.new {
  margin-bottom: 12px;
  font-size: 15px;
}
</style>
