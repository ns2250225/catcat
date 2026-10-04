import type { ItemDef } from '@/game/types'
import { CATS } from './cats'

/** 猫咪带来的小东西（同时也是建造材料） */
export const MATERIALS: ItemDef[] = [
  // 普通
  { id: 'bottlecap', name: '瓶盖', icon: '🔘', quality: 0, desc: '一枚有点生锈的汽水瓶盖。猫咪似乎很喜欢拨弄它。' },
  { id: 'twig', name: '树枝', icon: '🌿', quality: 0, desc: '一根弯弯的小树枝，还带着一片叶子。' },
  { id: 'paper', name: '纸片', icon: '📄', quality: 0, desc: '被咬过边角的纸片。' },
  { id: 'leaf', name: '落叶', icon: '🍂', quality: 0, desc: '一片干燥的叶子，踩上去会沙沙响。' },
  { id: 'stone', name: '石头', icon: '🪨', quality: 0, desc: '圆滚滚的小石头。' },
  { id: 'feather', name: '羽毛', icon: '🪶', quality: 0, desc: '不知道是哪只小鸟掉的羽毛。' },
  { id: 'plastic', name: '塑料片', icon: '🧩', quality: 0, desc: '一小片彩色塑料。' },
  { id: 'string', name: '细绳', icon: '🧵', quality: 0, desc: '一截细细的绳子，适合捆东西。' },
  { id: 'fishbone', name: '鱼骨头', icon: '🦴', quality: 0, desc: '啃得很干净的鱼骨头。' },
  { id: 'cardboard', name: '硬纸板', icon: '📦', quality: 0, desc: '从纸箱上撕下来的一块。' },
  { id: 'wrapper', name: '糖纸', icon: '🍬', quality: 0, desc: '亮晶晶的糖纸，在阳光下会反光。' },
  { id: 'pinecone', name: '松果', icon: '🌰', quality: 0, desc: '一颗小小的松果。' },
  { id: 'nail', name: '钉子', icon: '📌', quality: 0, desc: '一颗弯掉的钉子。小心别扎到。' },
  { id: 'grass', name: '干草', icon: '🌾', quality: 0, desc: '一小把晒干的草。' },
  { id: 'rubber', name: '橡皮筋', icon: '⭕', quality: 0, desc: '一根橡皮筋，弹一下猫咪就会扑过来。' },
  { id: 'cork', name: '软木塞', icon: '🟤', quality: 0, desc: '从某个瓶子上掉下来的软木塞。' },
  // 少见
  { id: 'sock', name: '袜子', icon: '🧦', quality: 1, desc: '一只袜子。另一只在哪里，没人知道。' },
  { id: 'yarn', name: '毛线', icon: '🧶', quality: 1, desc: '一团缠在一起的毛线。' },
  { id: 'button', name: '纽扣', icon: '🔵', quality: 1, desc: '一颗有四个孔的纽扣。' },
  { id: 'shell', name: '贝壳', icon: '🐚', quality: 1, desc: '贝壳……这附近明明没有海。' },
  { id: 'wood', name: '木板', icon: '🪵', quality: 1, desc: '一块还算结实的小木板。' },
  { id: 'cloth', name: '布料', icon: '🧣', quality: 1, desc: '一块柔软的旧布料。' },
  { id: 'iron', name: '铁片', icon: '🔩', quality: 1, desc: '薄薄的铁片，敲起来叮叮响。' },
  { id: 'marble', name: '玻璃珠', icon: '🔮', quality: 1, desc: '透明的玻璃珠，里面有一道彩色的花纹。' },
  { id: 'ribbon', name: '缎带', icon: '🎀', quality: 1, desc: '一截粉色缎带。' },
  { id: 'cotton', name: '棉花', icon: '☁️', quality: 1, desc: '一团蓬松的棉花。' },
  { id: 'bamboo', name: '竹片', icon: '🎋', quality: 1, desc: '削得很平整的竹片。' },
  { id: 'seed', name: '花种子', icon: '🌱', quality: 1, desc: '几粒不知名的花种子。' },
  { id: 'clay', name: '陶土', icon: '🟫', quality: 1, desc: '一团还湿润的陶土。' },
  { id: 'wire', name: '铁丝', icon: '➰', quality: 1, desc: '一段弯弯绕绕的铁丝。' },
  { id: 'pencil', name: '铅笔头', icon: '✏️', quality: 1, desc: '短短的铅笔头。' },
  { id: 'hairclip', name: '发夹', icon: '📎', quality: 1, desc: '一枚小发夹，上面有一朵小花。' },
  // 稀有
  { id: 'bell', name: '小铃铛', icon: '🔔', quality: 2, desc: '一摇就叮当响的小铃铛。' },
  { id: 'toypart', name: '玩具零件', icon: '⚙️', quality: 2, desc: '某个玩具上掉下来的齿轮。' },
  { id: 'key', name: '小钥匙', icon: '🗝️', quality: 2, desc: '一把小钥匙。它能打开什么呢？' },
  { id: 'glass', name: '彩色玻璃', icon: '💠', quality: 2, desc: '被磨圆的海玻璃。' },
  { id: 'spring', name: '弹簧', icon: '🌀', quality: 2, desc: '弹性很好的小弹簧。' },
  { id: 'lens', name: '旧镜片', icon: '🔍', quality: 2, desc: '从眼镜上掉下来的镜片。' },
  { id: 'battery', name: '旧电池', icon: '🔋', quality: 2, desc: '还剩一点点电。' },
  { id: 'copper', name: '铜线', icon: '🪢', quality: 2, desc: '亮闪闪的铜线。' },
  { id: 'velvet', name: '天鹅绒', icon: '🟥', quality: 2, desc: '一小块暗红色天鹅绒，非常柔软。' },
  { id: 'brick', name: '红砖', icon: '🧱', quality: 2, desc: '一块完整的红砖。猫咪是怎么搬来的？' },
  { id: 'photo', name: '旧照片', icon: '🖼️', quality: 2, desc: '一张褪色的照片，上面是一条小巷。' },
  { id: 'stamp', name: '邮票', icon: '📮', quality: 2, desc: '一枚很久以前的邮票。' },
  { id: 'catnip', name: '猫薄荷', icon: '🍃', quality: 2, desc: '新鲜的猫薄荷。闻一下就飘飘然。' },
  { id: 'gear', name: '黄铜齿轮', icon: '🔧', quality: 2, desc: '从旧钟表里掉出来的小齿轮。' },
  // 珍贵
  { id: 'coin', name: '幸运硬币', icon: '🪙', quality: 3, desc: '一枚闪闪发光的硬币。据说能带来好运。' },
  { id: 'pearl', name: '珍珠', icon: '⚪', quality: 3, desc: '一颗圆润的小珍珠。' },
  { id: 'starstone', name: '星星石', icon: '⭐', quality: 3, desc: '夜里会微微发光的石头。' },
  { id: 'musicbox', name: '八音盒零件', icon: '🎵', quality: 3, desc: '轻轻拨动会响起一个音符。' },
  { id: 'silkthread', name: '金丝线', icon: '🪡', quality: 3, desc: '金色的丝线，非常珍贵。' },
  { id: 'amber', name: '琥珀', icon: '🟠', quality: 3, desc: '里面封着一片小小的叶子。' },
  { id: 'clover', name: '四叶草', icon: '🍀', quality: 3, desc: '真的是四片叶子！' },
  { id: 'crystal', name: '水晶碎片', icon: '💎', quality: 3, desc: '透明的水晶，折射出彩虹。' },
  { id: 'letter', name: '没寄出的信', icon: '✉️', quality: 3, desc: '信封上写着“给某只猫”。' },
  { id: 'medal', name: '旧奖章', icon: '🎖️', quality: 3, desc: '不知道是谁的荣誉。' },
  { id: 'moonsand', name: '月光沙', icon: '🌙', quality: 3, desc: '在月光下会变成淡蓝色的沙子。' },
  { id: 'snowflake', name: '不化的雪花', icon: '❄️', quality: 3, desc: '一片永远不会融化的雪花挂坠。' },
  { id: 'rainbowscale', name: '彩虹鳞片', icon: '🌈', quality: 3, desc: '某条鱼的鳞片，闪着七彩的光。' },
  { id: 'compass', name: '小罗盘', icon: '🧭', quality: 3, desc: '指针总是指向小院的方向。' },
]

for (const m of MATERIALS) m.material = true

export const TREASURES: ItemDef[] = CATS.map((c) => ({
  id: c.treasure.id,
  name: c.treasure.name,
  icon: '✨',
  quality: 4 as const,
  desc: c.treasure.desc,
  treasureOf: c.id,
}))

export const ITEMS: Record<string, ItemDef> = {}
for (const it of [...MATERIALS, ...TREASURES]) ITEMS[it.id] = it

export const MATERIALS_BY_QUALITY: ItemDef[][] = [0, 1, 2, 3].map((q) => MATERIALS.filter((m) => m.quality === q))

export function itemName(id: string) {
  return ITEMS[id]?.name ?? id
}
