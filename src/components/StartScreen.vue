<script setup lang="ts">
defineProps<{ loading: boolean }>()
defineEmits<{ start: [] }>()
</script>

<template>
  <div class="start" @click="!loading && $emit('start')">
    <div class="box px-panel">
      <div class="logo">🐈 流浪猫小院</div>
      <div class="en">Stray Cat Yard</div>
      <p class="desc">给那些没有家的猫，准备一个它们愿意回来的地方。</p>
      <button class="px-btn primary big" :disabled="loading">{{ loading ? '小院整理中……' : '推开院门' }}</button>
      <div class="muted tip">单机 · 无需登录 · 存档保存在本地浏览器</div>
    </div>
  </div>
</template>

<style scoped>
.start {
  position: absolute;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 18, 30, 0.55);
  backdrop-filter: blur(2px);
  cursor: pointer;
}
.box {
  padding: 28px 40px;
  text-align: center;
  max-width: 90vw;
}
.logo {
  font-size: 34px;
  font-weight: bold;
  letter-spacing: 4px;
  color: #6b3f2a;
  text-shadow: 2px 2px 0 #f2c48a;
}
.en {
  font-size: 13px;
  letter-spacing: 6px;
  color: var(--ink2);
  margin-top: 4px;
}
.desc {
  margin: 18px 0;
  font-size: 15px;
}
.big {
  font-size: 18px;
  padding: 10px 28px;
}
.tip {
  margin-top: 14px;
}
</style>
