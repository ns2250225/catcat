<script setup lang="ts">
import { computed } from 'vue'
import Modal from './Modal.vue'
import { useGameStore } from '@/stores/game'
import { STAT_LABEL } from '@/game/world/yard'
import { YARD_LEVELS } from '@/data/buildings'

const store = useGameStore()
const g = store.game
const TIPS: Record<string, string> = {
  food: '多放几个猫碗，并记得倒满食物',
  water: '水碗、饮水机、喷泉都可以提供清水',
  comfort: '猫窝、毛毯、坐垫让猫咪睡得更舒服',
  fun: '毛线球、猫抓板、猫爬架带来快乐',
  hygiene: '猫砂盆要勤清理，地上的垃圾也要捡',
  safety: '纸箱、灌木、树洞让胆小的猫安心',
  shelter: '雨棚、凉亭、屋檐下可以躲雨',
  relation: '和越多的猫成为朋友，小院越温暖',
  beauty: '植物与装饰让小院更漂亮',
}
const stats = computed(() => {
  void store.tickV
  void store.version
  const y = g.yard
  return (Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[]).map((k) => ({ k, label: STAT_LABEL[k], v: y[k] }))
})
const lv = computed(() => {
  void store.version
  return YARD_LEVELS[g.s.yardLevel - 1]
})
</script>

<template>
  <Modal title="🏡 小院温暖度" width="480px" @close="store.open('stats')">
    <div class="warm">
      <div class="big">{{ g.yard.warmth }}</div>
      <div class="muted">Lv.{{ lv.level }} {{ lv.name }} · 当前可同时容纳 {{ g.maxCats }} / {{ lv.maxCats }} 只猫</div>
      <div class="muted">温暖度越高，猫咪停留越久、来得越多、稀有猫与礼物越容易出现。</div>
    </div>
    <div v-for="s in stats" :key="s.k" class="row">
      <span class="lb">{{ s.label }}</span>
      <div class="bar"><div :style="{ width: s.v + '%', background: s.v < 30 ? '#d9603a' : s.v < 60 ? '#e8b84a' : '#6fa556' }"></div></div>
      <span class="v">{{ s.v }}</span>
      <div class="tip muted">{{ TIPS[s.k] }}</div>
    </div>
  </Modal>
</template>

<style scoped>
.warm {
  text-align: center;
  margin-bottom: 10px;
}
.big {
  font-size: 42px;
  font-weight: bold;
  color: #c2553f;
}
.row {
  display: grid;
  grid-template-columns: 70px 1fr 30px;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  margin: 6px 0;
}
.bar {
  height: 10px;
  border: 2px solid var(--line);
  background: #fff;
}
.bar div {
  height: 100%;
}
.tip {
  grid-column: 2 / 4;
  margin-top: -4px;
}
</style>
