<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'

const store = useGameStore()
const g = store.game
const step = computed(() => {
  void store.version
  return g.s.tutorialStep
})
const text = computed(() => {
  switch (step.value) {
    case 0:
      return store.panel === 'build'
        ? '在「仓库中」找到旧猫碗，点「放置」，再点小院里的空地把它放下。'
        : '“院子外面好像有什么声音……” 点击下方的 🔨 建造，放下一只旧猫碗吧。'
    case 1:
      return store.panel === 'build' ? '放好了！点「完成」退出建造，然后点击猫碗，倒入猫粮。' : '点击小院里的猫碗，倒入猫粮。'
    case 2:
      return '安静地等一会儿……'
    case 3:
      return g.s.gifts.length ? '它留下了什么东西……点击地上的 🎁 打开看看。' : '……'
    default:
      return ''
  }
})
const done = computed(() => step.value >= 4)
const showFinal = computed(() => {
  void store.version
  return step.value === 4 && !g.s.stats.tutorialFinalSeen
})
function closeFinal() {
  g.s.stats.tutorialFinalSeen = 1
  store.bump()
}
</script>

<template>
  <div v-if="!done && text" class="tut px-panel">
    <span>{{ text }}</span>
    <button class="px-btn small" @click="g.skipTutorial()">跳过引导</button>
  </div>
  <div v-if="showFinal" class="tut px-panel final">
    <span>“也许可以用这些小东西，把院子变得更舒服。”<br /><small class="muted">放下水碗和纸箱，用猫咪带来的材料制作新设施吧。猫咪会越来越多的。</small></span>
    <button class="px-btn small primary" @click="closeFinal">好</button>
  </div>
</template>

<style scoped>
.tut {
  position: absolute;
  left: 50%;
  bottom: calc(66px + var(--sab));
  transform: translateX(-50%);
  padding: 8px 14px;
  z-index: 22;
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 14px;
  max-width: calc(100vw - 24px);
  animation: bob 2s ease-in-out infinite;
}
html.portrait .tut {
  left: 8px;
  right: 8px;
  transform: none;
  animation: none;
  justify-content: space-between;
}
@media (max-height: 500px) {
  .tut {
    bottom: calc(62px + var(--sab));
    font-size: 12px;
    padding: 5px 10px;
  }
}
@keyframes bob {
  50% {
    transform: translateX(-50%) translateY(-3px);
  }
}
</style>
