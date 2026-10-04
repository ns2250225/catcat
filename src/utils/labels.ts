import { BUILDING_MAP } from '@/data/buildings'
import type { CatState } from '@/game/types'

export const TAG_LABEL: Record<string, string> = {
  box: '纸箱', bed: '猫窝', blanket: '毛毯', warm: '温暖的地方', high: '高处', tower: '猫爬架', hide: '能躲起来的地方',
  wood: '木制设施', plant: '植物', flower: '花', fish: '鱼', pond: '鱼池', flowing: '流动的水', water: '水',
  toy: '玩具', yarn: '毛线', scratch: '猫抓板', tunnel: '隧道', roof: '屋檐下', sun: '晒太阳的地方', swing: '秋千',
  hammock: '吊床', tree: '树', butterfly: '蝴蝶', feeder: '喂食器', canned: '罐头', litter: '干净的猫砂盆',
  fountain: '喷泉', catgrass: '猫草', quiet: '安静的角落', soft: '柔软的东西',
}

export function facilityLabel(key: string) {
  return BUILDING_MAP[key]?.name ?? TAG_LABEL[key] ?? key
}

export const STATE_LABEL: Record<CatState, string> = {
  ENTER: '刚刚到来', WANDER: '四处闲逛', EAT: '正在吃饭', DRINK: '正在喝水', SLEEP: '正在睡觉', PLAY: '正在玩耍',
  GROOM: '正在舔毛', WATCH: '正在观察', SOCIAL: '在和别的猫交流', HIDE: '躲起来了', REST: '在发呆', LEAVE: '准备离开',
  TOILET: '在上厕所', SUNBATHE: '正在晒太阳', SCRATCH: '正在磨爪子', PERCH: '待在高处', FLEE: '炸毛了', SCRIPT: '在做一件奇怪的事',
}
