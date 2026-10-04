import type { BodyType, CatAppearance, EarType, EyeColor, FurColor, FurLength, Pattern, Personality, TailType, FoodType } from '../types'
import { PERSONALITIES } from '../types'
import { seeded } from '../core/rng'

/** 随机流浪猫组合（14 毛色 × 18 花纹 × 8 眼睛 × 6 体型 × 8 尾巴 × 4 耳朵 × 3 毛长） */
export const GEN_COLORS: FurColor[] = ['orange', 'black', 'white', 'gray', 'cream', 'brown', 'chocolate', 'lilac', 'blue', 'golden', 'darkGray', 'redBrown', 'silver', 'caramel']
export const GEN_PATTERNS: Pattern[] = ['solid', 'tabby', 'mackerel', 'bicolor', 'tuxedo', 'van', 'calico', 'tortie', 'spots', 'pointed', 'socks', 'mask', 'chest', 'scarf', 'eyepatch', 'halfFace', 'cloud', 'mustache']
export const GEN_EYES: EyeColor[] = ['yellow', 'green', 'blue', 'amber', 'copper', 'hazel', 'gold', 'gray']
export const GEN_BODIES: BodyType[] = ['kitten', 'slim', 'normal', 'normal', 'chubby', 'big', 'tall']
export const GEN_TAILS: TailType[] = ['normal', 'long', 'short', 'bobbed', 'fluffy', 'ringed', 'kinked', 'thin']
export const GEN_EARS: EarType[] = ['normal', 'normal', 'big', 'small', 'notched']
export const GEN_FUR: FurLength[] = ['short', 'short', 'short', 'long', 'curly']

export const COMBO_COUNT =
  GEN_COLORS.length * GEN_PATTERNS.length * GEN_EYES.length * 6 * GEN_TAILS.length * 4 * 3

const COLOR_WORD: Record<FurColor, string> = {
  orange: '橘', black: '黑', white: '白', gray: '灰', cream: '奶油', brown: '棕', chocolate: '巧克力',
  lilac: '丁香', blue: '蓝灰', golden: '金', darkGray: '深灰', redBrown: '红棕', silver: '银', caramel: '焦糖',
}
const PATTERN_WORD: Partial<Record<Pattern, string>> = {
  tabby: '虎斑', mackerel: '狸花', bicolor: '白', tuxedo: '奶牛', van: '白花', calico: '三花', tortie: '玳瑁',
  spots: '花点', pointed: '重点色', socks: '踏雪', mask: '面罩', chest: '白胸', scarf: '围脖', eyepatch: '独眼罩',
  halfFace: '阴阳脸', cloud: '云纹', mustache: '小胡子',
}
const BODY_WORD: Partial<Record<BodyType, string>> = { kitten: '小', chubby: '胖', big: '大', slim: '瘦', tall: '长腿' }
const PREFIX = ['路过的', '陌生的', '流浪的', '附近的', '迷路的', '好奇的', '安静的', '匆忙的', '湿漉漉的', '神秘的']

export interface GeneratedCat {
  seed: number
  name: string
  appearance: CatAppearance
  personalities: Personality[]
  favoriteFoods: FoodType[]
}

export function generateCat(seed: number): GeneratedCat {
  const r = seeded(seed)
  const p = <T,>(a: readonly T[]) => a[Math.floor(r() * a.length)]
  const base = p(GEN_COLORS)
  let secondary = p(GEN_COLORS)
  if (secondary === base) secondary = base === 'black' ? 'orange' : 'black'
  const pattern = p(GEN_PATTERNS)
  const ap: CatAppearance = {
    base: pattern === 'calico' ? 'orange' : base,
    secondary: pattern === 'calico' ? 'black' : secondary,
    pattern,
    eyes: p(GEN_EYES),
    eyes2: r() < 0.03 ? p(GEN_EYES) : undefined,
    body: p(GEN_BODIES),
    tail: p(GEN_TAILS),
    ears: p(GEN_EARS),
    fur: p(GEN_FUR),
    nose: p(['pink', 'pink', 'black', 'brown'] as const),
  }
  const pers: Personality[] = [p(PERSONALITIES)]
  if (r() < 0.5) {
    const second = p(PERSONALITIES)
    if (second !== pers[0]) pers.push(second)
  }
  const color = pattern === 'calico' || pattern === 'tortie' ? '' : COLOR_WORD[ap.base]
  const pw = PATTERN_WORD[pattern] ?? ''
  const body = BODY_WORD[ap.body] ?? ''
  const name = `${p(PREFIX)}${body}${color}${pw}猫`
  const foods: FoodType[] = [p(['kibble', 'fish', 'canned', 'treat'] as const)]
  return { seed, name, appearance: ap, personalities: pers, favoriteFoods: foods }
}
