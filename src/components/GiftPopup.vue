<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { ITEMS } from '@/data/items'
import { QUALITY_COLOR, QUALITY_LABEL } from '@/game/types'

const props = defineProps<{ gift: { items: string[]; fromName: string } }>()
const emit = defineEmits<{ close: [] }>()
const items = computed(() => props.gift.items.map((id) => ITEMS[id]).filter(Boolean))
const treasure = computed(() => items.value.some((i) => i.quality === 4))
onMounted(() => setTimeout(() => emit('close'), treasure.value ? 6000 : 2600))
</script>

<template>
  <div class="gift px-panel" :class="{ treasure }" @click="emit('close')">
    <div class="muted">🎁 {{ gift.fromName }}留下的礼物</div>
    <div v-for="(it, i) in items" :key="i" class="it">
      <span class="ic">{{ it.icon }}</span>
      <b>{{ it.name }}</b> ×1
      <span class="q" :style="{ color: QUALITY_COLOR[it.quality] }">【{{ QUALITY_LABEL[it.quality] }}】</span>
      <div v-if="treasure" class="muted desc">{{ it.desc }}</div>
    </div>
  </div>
</template>

<style scoped>
.gift {
  position: absolute;
  left: 50%;
  bottom: 70px;
  transform: translateX(-50%);
  padding: 10px 16px;
  z-index: 45;
  cursor: pointer;
  font-size: 14px;
  min-width: 220px;
  animation: pop 0.25s ease-out;
}
.gift.treasure {
  border-color: #c99a2a;
  box-shadow: 0 0 0 3px #ffe08a, 0 0 24px #ffd24a;
}
.it {
  margin-top: 4px;
}
.ic {
  font-size: 20px;
}
.q {
  font-size: 12px;
}
.desc {
  max-width: 300px;
}
@keyframes pop {
  from {
    transform: translateX(-50%) scale(0.7);
    opacity: 0;
  }
}
</style>
