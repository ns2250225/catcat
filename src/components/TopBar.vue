<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { WEATHER_ICON, WEATHER_LABEL, PERIOD_LABEL, SEASON_LABEL } from '@/game/types'
import { fmtTime } from '@/game/world/clock'
import { YARD_LEVELS } from '@/data/buildings'

const store = useGameStore()
const g = store.game

const info = computed(() => {
  void store.tickV
  void store.version
  const c = g.clock
  return {
    weather: WEATHER_ICON[g.weather],
    weatherLabel: WEATHER_LABEL[g.weather],
    temp: g.temperature,
    time: fmtTime(c.hour, c.minute),
    period: PERIOD_LABEL[c.period],
    day: c.day,
    season: SEASON_LABEL[c.season],
    date: `${c.month}月${c.dayOfMonth}日`,
    special: c.specialDay ? { christmas: '🎄圣诞', halloween: '🎃万圣节', newYear: '🧧新年' }[c.specialDay] : '',
    moon: c.fullMoon && c.isNight ? '🌕' : '',
    warmth: g.yard.warmth,
    hearts: g.s.hearts,
    cats: g.cats.length,
    max: g.maxCats,
    level: YARD_LEVELS[g.s.yardLevel - 1].name,
    gifts: g.s.gifts.length,
  }
})

function zoom() {
  const r = store.renderer
  if (r) r.setZoom(r.zoom > 1 ? 1 : 2)
}

function care() {
  const n = g.careAll()
  store.toast(n ? '猫碗、水碗都满了，猫砂也清理干净啦' : '一切都很好，暂时不需要照料', '🧺')
}
</script>

<template>
  <div class="top">
    <div class="bar px-panel">
      <span class="it" :title="info.weatherLabel">{{ info.weather }} {{ info.temp }}°C</span>
      <span class="it" :title="`第${info.day}天 · ${info.date}`">🕒 {{ info.time }} <small>{{ info.period }}</small></span>
      <span class="it hide-sm">{{ info.season }} · 第{{ info.day }}天 <small>{{ info.special }}{{ info.moon }}</small></span>
      <button class="it warm" title="查看小院属性" @click="store.open('stats')">🏡 <span class="lbl">温暖度 </span><b>{{ info.warmth }}</b></button>
      <span class="it" title="爱心：来自猫咪的信任，可用于扩建与高级设施">💗 {{ info.hearts }}</span>
      <span class="it hide-sm" title="当前猫咪 / 可容纳">🐈 {{ info.cats }}/{{ info.max }}</span>
    </div>
    <button class="care px-btn small" title="补满猫粮与清水，清理猫砂与垃圾" @click="care">🧺 照料</button>
    <button class="px-btn small" title="放大 / 缩小镜头" @click="zoom">🔍</button>
  </div>
</template>

<style scoped>
.top {
  position: absolute;
  top: calc(8px + var(--sat));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  align-items: center;
  z-index: 20;
  max-width: calc(100vw - 16px);
}
.bar {
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 4px 8px;
  font-size: 14px;
  white-space: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
}
.it {
  padding: 0 6px;
  border-right: 2px dotted #c9b08a;
}
.it:last-child {
  border-right: none;
}
.it small {
  color: var(--ink2);
  font-size: 11px;
}
.warm {
  font-family: inherit;
  font-size: 14px;
  background: none;
  border: none;
  border-right: 2px dotted #c9b08a;
  cursor: pointer;
  color: var(--ink);
}
.warm b {
  color: #c2553f;
}
.warm:hover {
  text-decoration: underline;
}
html.portrait .top {
  left: 4px;
  right: 4px;
  transform: none;
  max-width: none;
  gap: 4px;
}
html.portrait .bar {
  flex: 1;
  min-width: 0;
  padding: 4px;
}
html.portrait .it {
  padding: 0 4px;
}
html.portrait .lbl,
html.portrait .it small {
  display: none;
}
html.portrait .care {
  padding: 3px 6px;
}
@media (max-width: 720px), (max-height: 500px) {
  .hide-sm {
    display: none;
  }
  .bar {
    font-size: 12px;
  }
}
</style>
