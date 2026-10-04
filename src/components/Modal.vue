<script setup lang="ts">
withDefaults(defineProps<{ title: string; width?: string; height?: string }>(), { width: '760px', height: '80vh' })
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <div class="mask" @click.self="emit('close')">
    <div class="modal px-panel" :style="{ width, maxHeight: height }">
      <div class="head">
        <span class="px-title">{{ title }}</span>
        <slot name="head" />
        <button class="px-btn small close" @click="emit('close')">✕</button>
      </div>
      <div class="body scroll">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.mask {
  position: absolute;
  inset: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 16, 26, 0.35);
}
.modal {
  max-width: calc(100vw - 16px);
  display: flex;
  flex-direction: column;
  padding: 10px 12px 12px;
}
.head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 2px dashed #c9b08a;
  margin-bottom: 8px;
}
.close {
  margin-left: auto;
}
.body {
  flex: 1;
  min-height: 0;
  padding-right: 4px;
}
</style>
