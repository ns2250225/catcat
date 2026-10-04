<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from './Modal.vue'
import { useGameStore } from '@/stores/game'
import { fmtGameStamp } from '@/game/world/clock'

const store = useGameStore()
const g = store.game
const kind = ref<'all' | 'cat' | 'gift' | 'event'>('all')

const groups = computed(() => {
  void store.version
  const out: { day: number; items: { t: number; text: string; kind?: string }[] }[] = []
  const filtered = g.s.log.filter((l) => {
    if (kind.value === 'cat') return l.kind === 'arrive' || l.kind === 'leave' || l.kind === 'new' || l.kind === 'eat' || l.kind === 'social'
    if (kind.value === 'gift') return l.kind === 'gift'
    if (kind.value === 'event') return l.kind === 'event' || l.kind === 'social'
    return true
  })
  for (let i = filtered.length - 1; i >= 0; i--) {
    const l = filtered[i]
    const day = Math.floor(l.t / 1440) + 1
    let grp = out[out.length - 1]
    if (!grp || grp.day !== day) {
      grp = { day, items: [] }
      out.push(grp)
    }
    grp.items.push(l)
  }
  return out
})
const today = computed(() => {
  void store.version
  return g.clock.day
})
</script>

<template>
  <Modal title="🐾 来访记录" width="560px" @close="store.open('log')">
    <div class="tabs">
      <button :class="{ on: kind === 'all' }" @click="kind = 'all'">全部</button>
      <button :class="{ on: kind === 'cat' }" @click="kind = 'cat'">猫咪</button>
      <button :class="{ on: kind === 'gift' }" @click="kind = 'gift'">礼物</button>
      <button :class="{ on: kind === 'event' }" @click="kind = 'event'">小故事</button>
    </div>
    <div class="box">
      <div v-if="!groups.length" class="muted empty">还没有记录。</div>
      <div v-for="grp in groups" :key="grp.day" class="grp">
        <div class="day">{{ grp.day === today ? '今天' : grp.day === today - 1 ? '昨天' : `第 ${grp.day} 天` }}</div>
        <div v-for="(l, i) in grp.items" :key="i" class="row" :class="l.kind">
          <span class="t">{{ fmtGameStamp(l.t) }}</span>
          <span>{{ l.text }}</span>
        </div>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.box {
  background: #fff8ec;
  border: 2px solid var(--line);
  padding: 8px 12px;
  font-size: 13px;
}
.day {
  font-weight: bold;
  margin: 8px 0 4px;
  color: #8a4a3a;
}
.row {
  display: flex;
  gap: 10px;
  padding: 2px 0;
  line-height: 1.5;
}
.t {
  color: var(--ink2);
  font-variant-numeric: tabular-nums;
  min-width: 42px;
}
.row.new {
  color: #b0582a;
  font-weight: bold;
}
.row.gift {
  color: #8a6a1a;
}
.row.event {
  color: #4a6a8a;
}
.row.system {
  color: var(--ink2);
}
.empty {
  padding: 30px;
  text-align: center;
}
</style>
