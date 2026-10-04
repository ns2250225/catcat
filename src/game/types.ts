// ============ 基础枚举 ============

export type Personality =
  | 'timid' // 胆小
  | 'lively' // 活泼
  | 'aloof' // 高冷
  | 'greedy' // 贪吃
  | 'clingy' // 粘人
  | 'naughty' // 调皮
  | 'lazy' // 慵懒
  | 'curious' // 好奇
  | 'clean' // 爱干净
  | 'shy' // 社恐
  | 'social' // 社牛
  | 'fighter' // 爱打架
  | 'gentle' // 温柔
  | 'tsundere' // 傲娇
  | 'kittenLover' // 喜欢小猫
  | 'loner' // 喜欢独处
  | 'nocturnal' // 夜猫子
  | 'rainLover' // 雨天爱好者
  | 'boxLover' // 箱子狂热者
  | 'foodie' // 吃货

export const PERSONALITY_LABEL: Record<Personality, string> = {
  timid: '胆小', lively: '活泼', aloof: '高冷', greedy: '贪吃', clingy: '粘人',
  naughty: '调皮', lazy: '慵懒', curious: '好奇', clean: '爱干净', shy: '社恐',
  social: '社牛', fighter: '爱打架', gentle: '温柔', tsundere: '傲娇', kittenLover: '喜欢小猫',
  loner: '喜欢独处', nocturnal: '夜猫子', rainLover: '雨天爱好者', boxLover: '箱子狂热者', foodie: '吃货',
}
export const PERSONALITIES = Object.keys(PERSONALITY_LABEL) as Personality[]

export type WeatherType =
  | 'sunny' | 'cloudy' | 'overcast' | 'lightRain' | 'heavyRain' | 'storm' | 'fog' | 'windy' | 'snow' | 'rainbow'

export const WEATHER_LABEL: Record<WeatherType, string> = {
  sunny: '晴天', cloudy: '多云', overcast: '阴天', lightRain: '小雨', heavyRain: '大雨',
  storm: '雷雨', fog: '雾', windy: '大风', snow: '雪', rainbow: '雨后彩虹',
}
export const WEATHER_ICON: Record<WeatherType, string> = {
  sunny: '☀️', cloudy: '🌤', overcast: '☁️', lightRain: '🌦', heavyRain: '🌧', storm: '⛈',
  fog: '🌫', windy: '🍃', snow: '❄️', rainbow: '🌈',
}
export const RAINY: WeatherType[] = ['lightRain', 'heavyRain', 'storm']

export type TimePeriod = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night' | 'lateNight'
export const PERIOD_LABEL: Record<TimePeriod, string> = {
  dawn: '清晨', morning: '上午', noon: '中午', afternoon: '下午', dusk: '黄昏', night: '夜晚', lateNight: '深夜',
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export const SEASON_LABEL: Record<Season, string> = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' }

export type FoodType = 'kibble' | 'fish' | 'canned' | 'treat'
export const FOOD_LABEL: Record<FoodType, string> = { kibble: '猫粮', fish: '鱼干', canned: '罐头', treat: '冻干' }

// ============ 外观 ============

export type FurColor =
  | 'orange' | 'black' | 'white' | 'gray' | 'cream' | 'brown' | 'chocolate' | 'lilac'
  | 'blue' | 'golden' | 'darkGray' | 'redBrown' | 'silver' | 'caramel'

export type Pattern =
  | 'solid' // 纯色
  | 'tabby' // 虎斑
  | 'mackerel' // 深色鲭鱼虎斑
  | 'bicolor' // 双色（白肚白爪）
  | 'tuxedo' // 奶牛/燕尾服
  | 'van' // 梵花（白身彩头尾）
  | 'calico' // 三花（白+base+secondary）
  | 'tortie' // 玳瑁（base+secondary 斑驳）
  | 'spots' // 斑点
  | 'pointed' // 重点色（暹罗）
  | 'mask' // 面罩
  | 'heart' // 背部爱心
  | 'star' // 额头星星
  | 'moon' // 月牙纹
  | 'lightning' // 额头闪电
  | 'socks' // 四只白脚
  | 'halfFace' // 半脸
  | 'eyepatch' // 单眼斑
  | 'cloud' // 云朵花纹
  | 'ringtail' // 环纹尾巴
  | 'mustache' // 小胡子
  | 'panda' // 黑眼圈
  | 'scarf' // 脖子白毛
  | 'chest' // 白胸

export type EyeColor = 'yellow' | 'green' | 'blue' | 'amber' | 'copper' | 'hazel' | 'gold' | 'gray'
export type BodyType = 'tiny' | 'kitten' | 'slim' | 'normal' | 'chubby' | 'big' | 'tall'
export type TailType = 'normal' | 'long' | 'short' | 'bobbed' | 'fluffy' | 'ringed' | 'kinked' | 'thin'
export type EarType = 'normal' | 'big' | 'small' | 'notched' | 'curled'
export type FurLength = 'short' | 'long' | 'curly'

export interface CatAppearance {
  base: FurColor
  secondary?: FurColor // 花纹颜色（三花/玳瑁/斑纹等）
  pattern: Pattern
  eyes: EyeColor
  eyes2?: EyeColor // 异瞳
  body: BodyType
  tail: TailType
  ears: EarType
  fur: FurLength
  nose?: 'pink' | 'black' | 'brown'
  oneEye?: boolean // 一只眼有旧伤
  whiskers?: boolean // 长胡须
}

// ============ 猫咪数据 ============

/** 稀有度（内部）：0 常见 1 少见 2 罕见 3 特殊 4 传说 */
export type Rarity = 0 | 1 | 2 | 3 | 4

/**
 * 特殊出现条件 key（由 CatSpawner 解释）
 * rainNight: 深夜+大雨/雷雨; firstSnow: 本冬第一场雪; rainbow: 雨后彩虹; fullMoon: 满月夜晚;
 * springWind: 春季+大风; autumn: 秋季; christmas: 冬季圣诞期间; halloween: 万圣节附近; newYear: 新年期间;
 * fishPond: 拥有鱼池; garden: 植物≥12; woodcraft: 木制设施≥10; collector: 收集50种礼物; maxYard: 小院满级;
 * traveler: 极低概率; day30: 运营30天; friends50: 50只猫成为朋友; dex100: 图鉴100只; master: 主要收集目标;
 * dawnFog: 清晨+雾
 */
export type SpecialCondition =
  | 'rainNight' | 'firstSnow' | 'rainbow' | 'fullMoon' | 'dawnFog' | 'springWind' | 'autumn'
  | 'christmas' | 'halloween' | 'newYear' | 'fishPond' | 'garden' | 'woodcraft' | 'collector'
  | 'maxYard' | 'traveler' | 'day30' | 'friends50' | 'dex100' | 'master'

export interface CatDef {
  id: number
  name: string
  /** 外观简述，例如 “大橘猫” */
  look: string
  gender: 'M' | 'F'
  appearance: CatAppearance
  rarity: Rarity
  personalities: Personality[] // 1~3
  favoriteFoods: FoodType[]
  /** 喜欢的设施：设施 id 或设施 tag（见 BUILDING_TAGS） */
  favoriteFacilities: string[]
  /** 出现时间段，不填 = 任意 */
  times?: TimePeriod[]
  /** 只在这些天气出现，不填 = 任意 */
  weatherOnly?: WeatherType[]
  /** 天气权重加成 */
  weatherBonus?: Partial<Record<WeatherType, number>>
  /** 只在这些季节出现 */
  seasons?: Season[]
  special?: SpecialCondition
  /** 需要的最低小院等级 1~5 */
  minLevel?: number
  /** 需要的最低温暖度 0~100 */
  minWarmth?: number
  /** 基础出现率权重（常见 10，少见 6，罕见 3，特殊 1.5，传说 1） */
  baseRate: number
  /** 偏好的礼物 item id */
  giftBias?: string[]
  treasure: { id: string; name: string; desc: string }
  story: string
  /** 专属台词（任意情境随机使用） */
  lines: string[]
  /** 首次来访台词 */
  firstLine?: string
}

// ============ 物品 ============

export type ItemQuality = 0 | 1 | 2 | 3 | 4 // 普通 少见 稀有 珍贵 猫咪宝物
export const QUALITY_LABEL = ['普通', '少见', '稀有', '珍贵', '猫咪宝物']
export const QUALITY_COLOR = ['#cfc6b8', '#8fd08a', '#6fb6ff', '#d59cff', '#ffcf5a']

export interface ItemDef {
  id: string
  name: string
  icon: string // emoji
  quality: ItemQuality
  desc: string
  material?: boolean
  treasureOf?: number
}

// ============ 设施 ============

export type BuildingCategory = 'food' | 'water' | 'rest' | 'play' | 'hygiene' | 'shelter' | 'plant' | 'decor' | 'floor'
export const CATEGORY_LABEL: Record<BuildingCategory, string> = {
  food: '食物', water: '饮水', rest: '休息', play: '娱乐', hygiene: '卫生',
  shelter: '遮蔽', plant: '植物', decor: '装饰', floor: '地面',
}

export type BuildingAction = 'eat' | 'drink' | 'sleep' | 'play' | 'scratch' | 'toilet' | 'hide' | 'perch' | 'watch' | 'none'

export interface BuildingStats {
  food?: number
  water?: number
  comfort?: number
  fun?: number
  hygiene?: number
  safety?: number
  shelter?: number
  beauty?: number
}

export interface BuildingDef {
  id: string
  name: string
  category: BuildingCategory
  desc: string
  w: number
  h: number
  /** 绘制原型（见 render/buildingArt.ts） */
  art: string
  /** 主色、副色 */
  colors: [string, string]
  skins?: [string, string][]
  tags: string[]
  stats: BuildingStats
  action: BuildingAction
  capacity: number
  foodCap?: number
  waterCap?: number
  /** 接受的食物 */
  foods?: FoodType[]
  autoFill?: boolean
  autoClean?: boolean
  /** 猫砂盆脏污容量 */
  dirtCap?: number
  /** 遮蔽范围（相对 footprint 额外扩展的格数） */
  shelterPad?: number
  /** 是否高处（猫咪站在上面时的高度 px） */
  perchHeight?: number
  recipe: Record<string, number>
  hearts?: number
  unlockLevel: number
  /** 是否可走过（地板/地毯） */
  walkable?: boolean
}

/** 设施 tag 说明 */
export const BUILDING_TAGS = [
  'box', 'bed', 'blanket', 'warm', 'high', 'tower', 'hide', 'wood', 'plant', 'flower', 'fish', 'pond',
  'flowing', 'water', 'toy', 'yarn', 'scratch', 'tunnel', 'roof', 'sun', 'swing', 'hammock', 'tree', 'butterfly',
  'feeder', 'canned', 'litter', 'fountain', 'catgrass', 'quiet', 'soft',
] as const

export interface PlacedBuilding {
  uid: number
  defId: string
  x: number // tile
  y: number // tile
  flip: boolean
  skin: number
  food: number // 当前食物份数
  foodType: FoodType
  water: number
  dirt: number
}

// ============ 运行时状态 ============

export type CatState =
  | 'ENTER' | 'WANDER' | 'EAT' | 'DRINK' | 'SLEEP' | 'PLAY' | 'GROOM' | 'WATCH' | 'SOCIAL'
  | 'HIDE' | 'REST' | 'LEAVE' | 'TOILET' | 'SUNBATHE' | 'SCRATCH' | 'PERCH' | 'FLEE' | 'SCRIPT'

export interface CatNeeds {
  hunger: number
  thirst: number
  fatigue: number
  boredom: number
  dirty: number
  social: number
  safety: number
}

// ============ 存档数据 ============

export interface CatRecord {
  id: number // 图鉴 id；随机猫为 1000+
  discovered: boolean
  firstSeen: number // game minute
  visits: number
  familiarity: number
  treasureGiven: boolean
  lastVisit: number
  petCount: number
  fed: number
  nightVisits: number
  rainVisits: number
}

export interface LogEntry {
  t: number // 游戏总分钟
  text: string
  kind?: 'arrive' | 'leave' | 'gift' | 'event' | 'new' | 'system' | 'social' | 'eat'
}

export interface Settings {
  bgm: number
  ambient: number
  sfx: number
  bgmOn: boolean
  timeMode: 'real' | 'slow' | 'normal' | 'fast'
  realSeason: boolean
  showGrid: boolean
  bubbles: boolean
  pixelScale: 'auto' | 'fill' | number
  godMode: boolean
}

export interface SaveData {
  version: number
  createdAt: number // 真实时间
  lastActive: number // 真实时间
  gameMinutes: number // 游戏总分钟（从第1天0点开始）
  yardLevel: number
  hearts: number
  buildings: PlacedBuilding[]
  nextUid: number
  warehouse: Record<string, number> // 已制作未放置的设施
  inventory: Record<string, number> // 材料与宝物
  foodStock: Record<FoodType, number>
  cats: Record<number, CatRecord>
  relationships: Record<string, number> // "a-b" a<b
  randomSeen: number
  stats: Record<string, number>
  achievements: Record<string, number> // id -> 解锁时间(真实)
  log: LogEntry[]
  weather: { type: WeatherType; until: number; prev: WeatherType }
  seasonFirstSnow: Record<string, boolean>
  tutorialStep: number
  settings: Settings
  gifts: { x: number; y: number; items: string[]; from: number; fromName: string }[]
  litterDirt?: number
  trash: { x: number; y: number }[]
  seenEvents: Record<string, number>
}
