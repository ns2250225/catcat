<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useGameStore } from '@/stores/game'
import { game } from '@/game/core/Game'
import { Renderer } from '@/game/render/Renderer'
import { audio } from '@/game/audio/audio'
import type { AchievementDef } from '@/data/achievements'
import type { CatDef } from '@/game/types'
import TopBar from '@/components/TopBar.vue'
import BottomBar from '@/components/BottomBar.vue'
import CatCard from '@/components/CatCard.vue'
import BuildingMenu from '@/components/BuildingMenu.vue'
import BuildPanel from '@/components/BuildPanel.vue'
import Encyclopedia from '@/components/Encyclopedia.vue'
import Inventory from '@/components/Inventory.vue'
import VisitLog from '@/components/VisitLog.vue'
import Achievements from '@/components/Achievements.vue'
import Settings from '@/components/Settings.vue'
import YardStatsPanel from '@/components/YardStatsPanel.vue'
import Toasts from '@/components/Toasts.vue'
import Tutorial from '@/components/Tutorial.vue'
import OfflineReport from '@/components/OfflineReport.vue'
import GiftPopup from '@/components/GiftPopup.vue'
import StartScreen from '@/components/StartScreen.vue'
import LiveFeed from '@/components/LiveFeed.vue'

const store = useGameStore()
const host = ref<HTMLDivElement>()
const loading = ref(true)
const gift = ref<{ items: string[]; fromName: string } | null>(null)
const newCat = ref<CatDef | null>(null)
const portrait = ref(false)
const updOrient = () => (portrait.value = window.innerHeight > window.innerWidth * 1.1)
updOrient()
window.addEventListener('resize', updOrient)

onMounted(async () => {
  await game.init()
  const r = new Renderer(game)
  await r.init(host.value!)
  store.setRenderer(r)
  game.paused = true

  r.onCatClick = (c) => {
    store.buildingMenu = null
    store.selectedCat = c
    store.panel = 'none'
    audio.sfx('click')
  }
  r.onBuildingClick = (b, x, y) => {
    store.selectedCat = null
    store.buildingMenu = { b, x, y }
    audio.sfx('click')
  }
  r.onEmptyClick = () => {
    store.selectedCat = null
    store.buildingMenu = null
  }
  r.onBuildSelect = (b) => {
    store.buildSelected = b
    store.bump()
  }
  r.onPlaced = () => store.bump()

  game.bus.on('change', () => store.bump())
  game.bus.on('tick', () => store.tickV++)
  game.bus.on('log', () => store.bump())
  game.bus.on('tutorial', () => store.bump())
  game.bus.on('sfx', (n: string, o: any) => audio.sfx(n, o))
  game.bus.on('toast', (t: { text: string; icon: string }) => store.toast(t.text, t.icon))
  game.bus.on('achievement', (a: AchievementDef) => store.toast(`成就达成「${a.name}」 +${a.reward}♥`, a.icon))
  game.bus.on('newCat', (d: CatDef) => {
    newCat.value = d
    setTimeout(() => (newCat.value = null), 4200)
  })
  game.bus.on('giftOpened', (g: { items: string[]; fromName: string }) => (gift.value = g))
  game.bus.on('yardUpgrade', () => r.recenter())
  loading.value = false

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) game.save()
  })
  window.addEventListener('beforeunload', () => game.save())
})

function start() {
  audio.unlock()
  audio.setVolumes(game.s.settings)
  store.started = true
  game.paused = false
  // 回来时补上离线时间：实时模式需要对齐时钟
  if (game.s.settings.timeMode === 'real') game.alignRealTime()
}

watch(
  () => store.panel,
  (p) => {
    const r = store.renderer
    if (!r) return
    r.build.active = p === 'build'
    if (p !== 'build') {
      r.build.placing = null
      r.build.selected = null
      r.build.dragging = null
      store.buildSelected = null
    }
    if (p === 'dex') game.stat('dexOpened')
  },
)
</script>

<template>
  <div class="root">
    <div ref="host" class="host"></div>
    <template v-if="store.started">
      <TopBar />
      <LiveFeed v-if="portrait && store.panel !== 'build' && !store.selectedCat && !store.buildingMenu" />
      <BottomBar />
      <CatCard v-if="store.selectedCat" />
      <BuildingMenu v-if="store.buildingMenu" />
      <BuildPanel v-if="store.panel === 'build'" />
      <Encyclopedia v-if="store.panel === 'dex'" />
      <Inventory v-if="store.panel === 'inventory'" />
      <VisitLog v-if="store.panel === 'log'" />
      <Achievements v-if="store.panel === 'achievements'" />
      <Settings v-if="store.panel === 'settings'" />
      <YardStatsPanel v-if="store.panel === 'stats'" />
      <Tutorial />
      <GiftPopup v-if="gift" :gift="gift" @close="gift = null" />
      <OfflineReport v-if="store.version >= 0 && game.offlineReport" @close="(game.offlineReport = null), store.bump()" />
      <transition name="fade">
        <div v-if="newCat" class="newcat px-panel">
          <div class="muted">图鉴解锁</div>
          <img class="pixel" :src="store.renderer?.catPreview(newCat.appearance, 'sit', 3)" />
          <div class="px-title">No.{{ String(newCat.id).padStart(3, '0') }} {{ newCat.name }}</div>
        </div>
      </transition>
    </template>
    <Toasts />
    <StartScreen v-if="!store.started" :loading="loading" @start="start" />
  </div>
</template>

<style scoped>
.root {
  position: fixed;
  inset: 0;
  overflow: hidden;
}
.host {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
@media (orientation: portrait) {
  .host {
    align-items: flex-start;
    padding-top: calc(52px + var(--sat));
  }
}
.newcat {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  padding: 10px 18px;
  text-align: center;
  z-index: 40;
  pointer-events: none;
}
.newcat img {
  display: block;
  margin: 4px auto;
}
</style>
