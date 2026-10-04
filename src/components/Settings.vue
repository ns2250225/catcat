<script setup lang="ts">
import { ref } from 'vue'
import Modal from './Modal.vue'
import { useGameStore } from '@/stores/game'
import { audio } from '@/game/audio/audio'
import { TIME_MODE_LABEL } from '@/game/world/clock'
import { exportSaveFile, parseSaveFile, clearSave } from '@/game/save/save'
import type { Settings } from '@/game/types'

const store = useGameStore()
const g = store.game
const s = ref<Settings>({ ...g.s.settings })
const file = ref<HTMLInputElement>()
const confirmReset = ref(false)

function apply() {
  const prevMode = g.s.settings.timeMode
  const prevSeason = g.s.settings.realSeason
  const prevGod = g.s.settings.godMode
  g.s.settings = { ...s.value }
  audio.setVolumes(g.s.settings)
  if (s.value.timeMode === 'real' && prevMode !== 'real') g.alignRealTime()
  if (prevSeason !== s.value.realSeason || prevMode !== s.value.timeMode) g.refreshWorld()
  if (prevGod !== s.value.godMode)
    store.toast(s.value.godMode ? '上帝模式已开启：所有素材无限' : '上帝模式已关闭', s.value.godMode ? '♾️' : '🐾')
  store.renderer?.resize()
  g.save()
  store.bump()
}

function doExport() {
  g.s.lastActive = Date.now()
  exportSaveFile(g.s)
  store.toast('存档已导出：cat-yard-save.json', '💾')
}
function pickFile() {
  file.value?.click()
}
async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (!f) return
  try {
    const data = parseSaveFile(await f.text())
    g.reset(data)
    s.value = { ...g.s.settings }
    store.renderer?.resize()
    store.toast('存档导入成功', '💾')
  } catch (err: any) {
    store.toast('导入失败：' + (err?.message ?? err), '⚠️')
  }
  ;(e.target as HTMLInputElement).value = ''
}
async function doReset() {
  await clearSave()
  g.reset()
  s.value = { ...g.s.settings }
  confirmReset.value = false
  store.open('settings')
  store.toast('小院回到了最初的样子', '🌱')
}
</script>

<template>
  <Modal title="⚙ 设置" width="520px" @close="store.open('settings')">
    <div class="sec">
      <div class="h">声音</div>
      <label class="row"><span>背景音乐</span><input v-model="s.bgmOn" type="checkbox" @change="apply" /><span class="muted">关闭后只听环境音</span></label>
      <label class="row"><span>音乐音量</span><input v-model.number="s.bgm" type="range" min="0" max="1" step="0.05" @input="apply" /></label>
      <label class="row"><span>环境音</span><input v-model.number="s.ambient" type="range" min="0" max="1" step="0.05" @input="apply" /><span class="muted">雨声、虫鸣、呼噜声</span></label>
      <label class="row"><span>音效</span><input v-model.number="s.sfx" type="range" min="0" max="1" step="0.05" @input="apply" /></label>
    </div>
    <div class="sec">
      <div class="h">时间与季节</div>
      <label class="row">
        <span>时间流速</span>
        <select v-model="s.timeMode" @change="apply">
          <option v-for="(l, k) in TIME_MODE_LABEL" :key="k" :value="k">{{ l }}</option>
        </select>
      </label>
      <label class="row"><span>现实日期同步</span><input v-model="s.realSeason" type="checkbox" @change="apply" /><span class="muted">四季、节日与月相跟随现实日期</span></label>
    </div>
    <div class="sec">
      <div class="h">显示</div>
      <label class="row"><span>猫咪对话气泡</span><input v-model="s.bubbles" type="checkbox" @change="apply" /></label>
      <label class="row"><span>始终显示格子</span><input v-model="s.showGrid" type="checkbox" @change="apply" /></label>
      <label class="row">
        <span>像素缩放</span>
        <select v-model="s.pixelScale" @change="apply">
          <option value="auto">自动（整数倍，像素最清晰）</option>
          <option value="fill">填满屏幕</option>
          <option :value="1">1×</option>
          <option :value="2">2×</option>
          <option :value="3">3×</option>
          <option :value="4">4×</option>
        </select>
      </label>
    </div>
    <div class="sec">
      <div class="h">游戏</div>
      <label class="row"><span>上帝模式</span><input v-model="s.godMode" type="checkbox" @change="apply" /><span class="muted">所有素材无限：制作、扩建与倒食物不再消耗材料</span></label>
    </div>
    <div class="sec">
      <div class="h">存档</div>
      <div class="muted">存档自动保存在浏览器（IndexedDB）中。清理浏览器数据前，建议导出备份。</div>
      <div class="btns">
        <button class="px-btn" @click="doExport">💾 导出存档</button>
        <button class="px-btn" @click="pickFile">📂 导入存档</button>
        <input ref="file" type="file" accept=".json,application/json" hidden @change="onFile" />
        <button v-if="!confirmReset" class="px-btn" @click="confirmReset = true">🗑 重新开始</button>
        <button v-else class="px-btn primary" @click="doReset">确定清空所有进度？</button>
      </div>
    </div>
    <div class="muted about">《流浪猫小院》Stray Cat Yard · 玩家不是猫咪的主人，只是给这些没有家的猫，准备一个它们愿意回来的地方。</div>
  </Modal>
</template>

<style scoped>
.sec {
  background: #fff8ec;
  border: 2px solid var(--line);
  padding: 8px 12px;
  margin-bottom: 8px;
}
.h {
  font-weight: bold;
  margin-bottom: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 0;
  font-size: 13px;
}
.row > span:first-child {
  width: 96px;
}
select {
  font-family: inherit;
  padding: 2px 4px;
  border: 2px solid var(--line);
  background: #fffdf6;
}
.btns {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 8px;
}
.about {
  text-align: center;
  margin-top: 6px;
}
</style>
