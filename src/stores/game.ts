import { defineStore } from 'pinia'
import { markRaw, ref, shallowRef } from 'vue'
import { game } from '@/game/core/Game'
import type { Renderer } from '@/game/render/Renderer'
import type { Cat } from '@/game/cats/Cat'
import type { PlacedBuilding } from '@/game/types'

export type Panel = 'none' | 'dex' | 'inventory' | 'build' | 'log' | 'achievements' | 'settings' | 'stats'

/**
 * UI 状态。游戏数据本身保存在非响应式的 game.s 中，
 * 通过 version 计数器驱动界面刷新，避免每帧深度响应式开销。
 */
export const useGameStore = defineStore('game', () => {
  const version = ref(0)
  const tickV = ref(0)
  const panel = ref<Panel>('none')
  const renderer = shallowRef<Renderer | null>(null)
  const selectedCat = shallowRef<Cat | null>(null)
  const buildingMenu = shallowRef<{ b: PlacedBuilding; x: number; y: number } | null>(null)
  const buildSelected = shallowRef<PlacedBuilding | null>(null)
  const dexFocus = ref<number | null>(null)
  const started = ref(false)
  const toasts = ref<{ id: number; text: string; icon: string }[]>([])
  let tid = 1

  function bump() {
    version.value++
  }
  function toast(text: string, icon = '🐾') {
    const id = tid++
    toasts.value.push({ id, text, icon })
    if (toasts.value.length > 5) toasts.value.shift()
    setTimeout(() => (toasts.value = toasts.value.filter((t) => t.id !== id)), 3200)
  }
  function open(p: Panel) {
    panel.value = panel.value === p ? 'none' : p
    selectedCat.value = null
    buildingMenu.value = null
  }
  function setRenderer(r: Renderer) {
    renderer.value = markRaw(r)
  }

  return { version, tickV, panel, renderer, selectedCat, buildingMenu, buildSelected, dexFocus, started, toasts, bump, toast, open, setRenderer, game: markRaw(game) }
})
