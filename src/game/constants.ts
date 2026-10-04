export const VIEW_W = 480
export const VIEW_H = 270
export const TILE = 16
export const GRID_W = 28
export const GRID_H = 12
export const OX = 16
export const OY = 70

export const FAM_THRESHOLDS = [0, 6, 30, 80, 180, 350]
export const FAM_LABEL = ['陌生', '见过', '熟悉', '朋友', '老朋友', '这里就是家']

export function famLevel(points: number) {
  let l = 0
  for (let i = 0; i < FAM_THRESHOLDS.length; i++) if (points >= FAM_THRESHOLDS[i]) l = i
  return l
}

export const RANDOM_CAT_BASE = 100000
