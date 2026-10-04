<script setup lang="ts">
import { computed, ref } from 'vue'
import Modal from './Modal.vue'
import { useGameStore } from '@/stores/game'
import { ACHIEVEMENTS } from '@/data/achievements'

const store = useGameStore()
const g = store.game
const show = ref<'all' | 'done' | 'todo'>('all')
const list = computed(() => {
  void store.version
  void store.tickV
  return ACHIEVEMENTS.map((a) => {
    const done = !!g.s.achievements[a.id]
    return { a, done, prog: g.achievementProgress(a) }
  }).filter((x) => (show.value === 'done' ? x.done : show.value === 'todo' ? !x.done : true))
})
const doneCount = computed(() => {
  void store.version
  return Object.keys(g.s.achievements).length
})
</script>

<template>
  <Modal title="🏆 成就" width="680px" @close="store.open('achievements')">
    <template #head><span class="muted">{{ doneCount }} / {{ ACHIEVEMENTS.length }}</span></template>
    <div class="tabs">
      <button :class="{ on: show === 'all' }" @click="show = 'all'">全部</button>
      <button :class="{ on: show === 'done' }" @click="show = 'done'">已达成</button>
      <button :class="{ on: show === 'todo' }" @click="show = 'todo'">未达成</button>
    </div>
    <div class="box">
      <div v-for="x in list" :key="x.a.id" class="ach" :class="{ done: x.done }">
        <span class="ic">{{ x.done || !x.a.hidden ? x.a.icon : '❔' }}</span>
        <div class="info">
          <b>{{ x.done || !x.a.hidden ? x.a.name : '隐藏成就' }}</b>
          <div class="muted">{{ x.done || !x.a.hidden ? x.a.desc : '？？？' }}</div>
          <div v-if="!x.done && !x.a.hidden && x.a.value > 1" class="bar"><div :style="{ width: (x.prog / x.a.value) * 100 + '%' }"></div><span>{{ x.prog }}/{{ x.a.value }}</span></div>
        </div>
        <span class="rw">{{ x.done ? '✔' : '' }} 💗{{ x.a.reward }}</span>
      </div>
    </div>
  </Modal>
</template>

<style scoped>
.box {
  background: #fff8ec;
  border: 2px solid var(--line);
  padding: 6px 10px;
}
.ach {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
  border-bottom: 2px dotted #e0cba6;
  font-size: 13px;
  opacity: 0.7;
}
.ach.done {
  opacity: 1;
}
.ic {
  font-size: 22px;
  width: 30px;
  text-align: center;
}
.info {
  flex: 1;
}
.rw {
  color: #c2553f;
  white-space: nowrap;
}
.bar {
  position: relative;
  height: 10px;
  border: 1px solid var(--line);
  background: #fff;
  margin-top: 3px;
  max-width: 260px;
}
.bar div {
  height: 100%;
  background: var(--gold);
}
.bar span {
  position: absolute;
  right: 4px;
  top: -3px;
  font-size: 10px;
}
</style>
