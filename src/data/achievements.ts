// 成就系统（PRD §38）
// 解锁条件：stat[key] >= value

export interface AchievementDef {
  id: string
  name: string
  desc: string // 解锁方式（隐藏成就在 UI 中显示为 '？？？'）
  icon: string // 一个 emoji
  hidden?: boolean
  reward: number // 爱心奖励 5..100
  key: string // 统计键
  value: number // stat[key] >= value 时解锁
}

function a(
  id: string,
  name: string,
  icon: string,
  desc: string,
  key: string,
  value: number,
  reward: number,
  hidden?: boolean,
): AchievementDef {
  const def: AchievementDef = { id, name, desc, icon, reward, key, value }
  if (hidden) def.hidden = true
  return def
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ───────── 来访 ─────────
  a('visit_1', '第一位客人', '🐾', '第一只猫来到小院', 'visits', 1, 5),
  a('visit_10', '有猫路过', '🚪', '累计迎来 10 次猫咪来访', 'visits', 10, 10),
  a('visit_50', '小有名气', '📣', '累计迎来 50 次猫咪来访', 'visits', 50, 15),
  a('visit_200', '街角网红', '🌟', '累计迎来 200 次猫咪来访', 'visits', 200, 25),
  a('visit_500', '猫来猫往', '🔁', '累计迎来 500 次猫咪来访', 'visits', 500, 40),
  a('visit_1000', '门槛被踏平了', '🏚️', '累计迎来 1000 次猫咪来访', 'visits', 1000, 60),
  a('visit_3000', '全城猫都知道', '🗺️', '累计迎来 3000 次猫咪来访', 'visits', 3000, 100),
  a('random_10', '生面孔', '❔', '迎来 10 次陌生街猫的来访', 'randomVisits', 10, 10),
  a('random_100', '来者都是客', '🫖', '迎来 100 次陌生街猫的来访', 'randomVisits', 100, 35),

  // ───────── 同时在场 ─────────
  a('crowd_5', '小聚会', '🎈', '小院里同时有 5 只猫', 'maxSimultaneous', 5, 10),
  a('crowd_10', '热闹起来了', '🎉', '小院里同时有 10 只猫', 'maxSimultaneous', 10, 25),
  a('crowd_20', '猫满为患', '😹', '小院里同时有 20 只猫', 'maxSimultaneous', 20, 60),
  a('eat_5', '猫猫饭堂', '🍚', '同时有 5 只猫在吃饭', 'maxEating', 5, 20),
  a('eat_10', '开席了', '🥢', '同时有 10 只猫在吃饭', 'maxEating', 10, 45),
  a('sleep_5', '午睡专区', '💤', '同时有 5 只猫在睡觉', 'maxSleeping', 5, 20),
  a('sleep_10', '集体冬眠', '🛌', '同时有 10 只猫在睡觉', 'maxSleeping', 10, 45),

  // ───────── 图鉴 ─────────
  a('dex_1', '第一页', '📖', '在图鉴里记下第一只猫', 'discovered', 1, 5),
  a('dex_5', '眼熟的毛团', '🔍', '发现 5 种猫', 'discovered', 5, 10),
  a('dex_10', '猫猫观察员', '🧐', '发现 10 种猫', 'discovered', 10, 15),
  a('dex_20', '街猫通讯录', '📒', '发现 20 种猫', 'discovered', 20, 20),
  a('dex_40', '记性真好', '🧠', '发现 40 种猫', 'discovered', 40, 30),
  a('dex_60', '半本图鉴', '📚', '发现 60 种猫', 'discovered', 60, 40),
  a('dex_80', '猫口普查员', '📋', '发现 80 种猫', 'discovered', 80, 55),
  a('dex_100', '百猫图', '🖼️', '发现 100 种猫', 'discovered', 100, 80),
  a('dex_120', '一只都不能少', '👑', '发现全部 120 种猫', 'discovered', 120, 100),
  a('rare_1', '稀客', '💎', '发现第一只稀有猫', 'rareDiscovered', 1, 20),
  a('rare_10', '传说收集者', '🔮', '发现 10 只稀有猫', 'rareDiscovered', 10, 60),
  a('rare_20', '传说都是真的', '🌌', '发现全部 20 只稀有猫', 'rareDiscovered', 20, 100),
  a('dex_open_20', '翻到卷边', '📑', '打开图鉴 20 次', 'dexOpened', 20, 5),

  // ───────── 熟悉度 ─────────
  a('friend_1', '交到朋友了', '🤝', '与 1 只猫成为朋友', 'friends', 1, 10),
  a('friend_10', '朋友遍地', '🫶', '与 10 只猫成为朋友', 'friends', 10, 25),
  a('friend_50', '社交达人', '🎊', '与 50 只猫成为朋友', 'friends', 50, 60),
  a('oldfriend_1', '老朋友', '🧓', '和一只猫成为老朋友', 'oldFriends', 1, 30),
  a('oldfriend_10', '老相识们', '📸', '与 10 只猫成为老朋友', 'oldFriends', 10, 60),
  a('home_1', '这里就是家', '🏡', '有一只猫把小院当成了家', 'homeCats', 1, 40),
  a('home_10', '一大家子', '👨‍👩‍👧‍👦', '有 10 只猫把小院当成了家', 'homeCats', 10, 80),
  a('home_30', '流浪到此为止', '🕯️', '有 30 只猫把小院当成了家', 'homeCats', 30, 100),

  // ───────── 互动 ─────────
  a('pet_1', '可以摸吗', '✋', '第一次摸猫', 'petCount', 1, 5),
  a('pet_100', '撸猫熟练工', '🤲', '累计摸猫 100 次', 'petCount', 100, 20),
  a('pet_1000', '金手指', '🫳', '累计摸猫 1000 次，猫都排队了', 'petCount', 1000, 60),
  a('refill_10', '添饭小二', '🥄', '亲手添饭加水 10 次', 'refills', 10, 10),
  a('refill_100', '食堂阿姨', '👩‍🍳', '亲手添饭加水 100 次', 'refills', 100, 30),
  a('clean_10', '铲屎官上岗', '🧹', '清理 10 次猫砂或垃圾', 'cleanings', 10, 10),
  a('clean_100', '金牌铲屎官', '🏅', '清理 100 次猫砂或垃圾', 'cleanings', 100, 35),
  a('food_100', '一百碗饭', '🍙', '猫咪们累计吃掉 100 份食物', 'foodServed', 100, 15),
  a('food_1000', '饭桶联盟', '🍲', '猫咪们累计吃掉 1000 份食物', 'foodServed', 1000, 45),
  a('water_100', '解渴站', '💧', '猫咪们累计喝掉 100 份水', 'waterServed', 100, 15),
  a('talk_100', '叽叽喳喳', '💬', '猫咪们冒出 100 个说话气泡', 'catsTalked', 100, 15),
  a('talk_1000', '喵言喵语', '🗨️', '猫咪们冒出 1000 个说话气泡', 'catsTalked', 1000, 40),
  a('play_50', '玩疯了', '🧶', '猫咪们玩玩具 50 次', 'playSessions', 50, 20),
  a('sun_50', '光合作用', '☀️', '猫咪们晒太阳 50 次', 'sunbathes', 50, 15),

  // ───────── 猫猫社交 ─────────
  a('social_20', '猫际交往', '🐱', '猫咪之间聊天 20 次', 'social', 20, 15),
  a('groom_10', '你舔舔我', '👅', '看到猫咪互相舔毛 10 次', 'groomTogether', 10, 20),
  a('sleep_tog_10', '贴贴睡', '🫂', '看到猫咪挤在一起睡觉 10 次', 'sleepTogether', 10, 20),
  a('fight_1', '不打不相识', '💢', '第一次看见猫咪打架', 'fights', 1, 5),
  a('fight_20', '小院武林', '🥋', '看见猫咪打架 20 次', 'fights', 20, 20),
  a('hide_20', '我不在这里', '🫣', '猫咪躲起来 20 次', 'hideCount', 20, 15),
  a('steal_1', '鱼呢？', '🐟', '第一次有鱼被偷', 'fishStolen', 1, 10),
  a('steal_20', '惯犯', '🕵️', '鱼被偷了 20 次，凶手就在猫群中', 'fishStolen', 20, 30),

  // ───────── 礼物与收集 ─────────
  a('gift_1', '谢谢你的瓶盖', '🎁', '第一次收到猫咪的礼物', 'giftsOpened', 1, 5),
  a('gift_50', '礼尚往来', '💝', '收到 50 份礼物', 'giftsOpened', 50, 25),
  a('gift_300', '收礼收到手软', '🎀', '收到 300 份礼物', 'giftsOpened', 300, 60),
  a('gift_pile', '礼物堆成山', '⛰️', '地上同时躺着 10 份没拆的礼物', 'giftsOnGround', 10, 20),
  a('items_100', '捡来的都是宝', '🎒', '累计获得 100 个物品', 'itemsCollected', 100, 15),
  a('items_1000', '仓库告急', '📦', '累计获得 1000 个物品', 'itemsCollected', 1000, 50),
  a('distinct_20', '杂货铺', '🧺', '获得 20 种不同的物品', 'distinctItems', 20, 25),
  a('distinct_50', '小小博物馆', '🏛️', '获得 50 种不同的物品', 'distinctItems', 50, 60),
  a('treasure_1', '猫咪宝物', '💍', '第一次收到猫咪宝物', 'treasures', 1, 20),
  a('treasure_10', '宝物猎人', '🗝️', '收到 10 件猫咪宝物', 'treasures', 10, 60),
  a('bottlecap_100', '收破烂专家', '🧢', '收集 100 个瓶盖', 'item_bottlecap', 100, 40),
  a('sock_10', '另一只在哪', '🧦', '收到 10 只袜子，没有一双是配对的', 'item_sock', 10, 15),
  a('leaf_50', '秋天的信', '🍂', '收到 50 片树叶', 'item_leaf', 50, 15),
  a('feather_20', '鸟：我的毛呢', '🪶', '收到 20 根羽毛', 'item_feather', 20, 15),
  a('fishbone_30', '吃干抹净', '🦴', '收到 30 根鱼骨头', 'item_fishbone', 30, 15),
  a('coin_10', '猫咪理财', '🪙', '收到 10 枚硬币', 'item_coin', 10, 25),
  a('letter_1', '一封没有署名的信', '✉️', '收到一封信', 'item_letter', 1, 30, true),
  a('starstone_1', '星星掉下来了', '🌠', '收到一颗星星石', 'item_starstone', 1, 40, true),
  a('rainbowscale_1', '彩虹的鳞片', '🌈', '收到一片彩虹鳞', 'item_rainbowscale', 1, 50, true),
  a('photo_1', '是谁拍的', '📷', '收到一张旧照片', 'item_photo', 1, 25),

  // ───────── 建造 ─────────
  a('craft_1', '巧手', '🔨', '第一次制作物品', 'crafted', 1, 5),
  a('craft_50', '手工大师', '🛠️', '制作 50 次物品', 'crafted', 50, 35),
  a('build_1', '动工啦', '🏗️', '建造第一个设施', 'built', 1, 5),
  a('build_20', '包工头', '👷', '建造 20 个设施', 'built', 20, 20),
  a('build_100', '基建狂魔', '🏙️', '建造 100 个设施', 'built', 100, 60),
  a('placed_30', '满满当当', '🏘️', '小院里同时摆着 30 个设施', 'buildingsPlaced', 30, 35),
  a('distinct_b_15', '样样都有', '🧩', '摆放过 15 种不同的设施', 'distinctBuildings', 15, 25),
  a('distinct_b_40', '小院设计师', '📐', '摆放过 40 种不同的设施', 'distinctBuildings', 40, 60),
  a('demolish_10', '推倒重来', '🧨', '拆除 10 个设施', 'demolished', 10, 10),
  a('move_20', '风水先生', '🧭', '挪动设施 20 次', 'moves', 20, 10),
  a('skin_5', '换个心情', '🎨', '更换外观 5 次', 'skinChanges', 5, 10),
  a('awning', '下雨也不怕', '⛱️', '建造大型雨棚', 'built_big_awning', 1, 25),
  a('box', '纸箱永不过时', '📦', '建造一个纸箱猫窝', 'built_cardboard_box', 1, 5),
  a('box_10', '纸箱帝国', '🗃️', '建造 10 个纸箱猫窝', 'built_cardboard_box', 10, 20),
  a('pond', '池塘边的守望', '🎣', '建造鱼池', 'built_fish_pond', 1, 25),
  a('cattree', '猫界摩天楼', '🗼', '建造大猫爬架', 'built_cat_tree_big', 1, 30),
  a('feeder', '再也不怕饿', '⚙️', '建造自动喂食器', 'built_auto_feeder', 1, 25),
  a('kotatsu', '一旦进去就出不来', '🍊', '建造暖桌', 'built_kotatsu', 1, 30),
  a('cabin', '有屋顶的家', '🛖', '建造猫咪小屋', 'built_cat_cabin', 1, 30),
  a('pavilion', '亭亭玉立', '⛩️', '建造凉亭', 'built_pavilion', 1, 35),
  a('fountain', '活水', '⛲', '建造小喷泉', 'built_small_fountain', 1, 25),
  a('litter_auto', '科技改变铲屎', '🤖', '建造自动猫砂盆', 'built_litter_auto', 1, 30),
  a('sakura', '樱花树下', '🌸', '种下一棵樱花树', 'built_sakura', 1, 30),
  a('golden_bowl', '吃饭要有仪式感', '🏆', '建造金饭碗', 'built_golden_bowl', 1, 50),
  a('snowman', '第一百零一只猫', '⛄', '堆一个雪人', 'built_snowman', 1, 15),

  // ───────── 小院等级与温暖度 ─────────
  a('level_2', '温暖角落', '🧡', '小院升到 Lv.2', 'yardLevel', 2, 15),
  a('level_3', '猫咪庭院', '🌿', '小院升到 Lv.3', 'yardLevel', 3, 30),
  a('level_4', '猫猫乐园', '🎡', '小院升到 Lv.4', 'yardLevel', 4, 50),
  a('level_5', '猫咪天堂', '🏰', '小院满级', 'yardLevel', 5, 100),
  a('warmth_60', '暖洋洋', '🔥', '小院温暖度达到 60', 'warmthMax', 60, 20),
  a('warmth_100', '比被窝还暖', '♨️', '小院温暖度达到 100', 'warmthMax', 100, 50),
  a('hearts_1000', '爱心满满', '❤️', '累计获得 1000 爱心', 'heartsEarned', 1000, 20),
  a('hearts_10000', '爱心银行', '💖', '累计获得 10000 爱心', 'heartsEarned', 10000, 60),

  // ───────── 日子与时间 ─────────
  a('day_3', '三天打鱼', '📅', '经营小院 3 天', 'daysPlayed', 3, 10),
  a('day_7', '一周了呢', '🗓️', '经营小院 7 天', 'daysPlayed', 7, 20),
  a('day_30', '满月酒', '🎂', '经营小院 30 天', 'daysPlayed', 30, 50),
  a('day_100', '百日纪念', '🎖️', '经营小院 100 天', 'daysPlayed', 100, 100),
  a('offline_10', '你不在的时候', '📮', '离开后回来 10 次，猫咪都替你看着家', 'offlineReturns', 10, 15),
  a('night_100', '百猫夜行', '🌙', '累计 100 只猫在夜间来访', 'nightVisits', 100, 40),
  a('dawn_20', '早起的猫儿有饭吃', '🌅', '清晨迎来 20 次来访', 'dawnVisits', 20, 20),

  // ───────── 天气与四季 ─────────
  a('rain_20', '雨中来客', '☔', '雨天迎来 20 次来访', 'rainVisits', 20, 20),
  a('snow_20', '踏雪寻院', '❄️', '雪天迎来 20 次来访', 'snowVisits', 20, 25),
  a('storm_1', '雷声大雨点也大', '⛈️', '经历一场暴风雨', 'weather_storm', 1, 15),
  a('fog_5', '雾里看猫', '🌫️', '经历 5 次大雾天', 'weather_fog', 5, 15),
  a('windy_5', '吹乱了毛', '🌬️', '经历 5 次大风天', 'weather_windy', 5, 15),
  a('weathers_all', '天气预报员', '🌦️', '见过 8 种不同的天气', 'weathersSeen', 8, 40),
  a('rainbow_1', '雨过天晴', '🌈', '看见彩虹', 'rainbowSeen', 1, 25),
  a('first_snow', '初雪', '🌨️', '看见第一场雪', 'firstSnowSeen', 1, 25),
  a('full_moon', '月亮好圆', '🌕', '在小院里看见满月', 'fullMoonSeen', 1, 25),
  a('seasons_4', '四季轮回', '🍃', '经历春夏秋冬四个季节', 'seasonsSeen', 4, 60),
  a('holiday_3', '过节啦', '🧧', '在小院里过 3 个节日', 'specialDays', 3, 40),

  // ───────── 事件 ─────────
  a('events_10', '小院日常', '🎬', '目击 10 次小院事件', 'eventsSeen', 10, 10),
  a('events_100', '小院纪录片', '🎥', '目击 100 次小院事件', 'eventsSeen', 100, 40),
  a('ev_steal_fish', '鱼不翼而飞', '🐠', '目击猫咪偷鱼', 'event_steal_fish', 1, 10),
  a('ev_box_standoff', '纸箱争夺战', '🥊', '目击两猫抢纸箱', 'event_box_standoff', 1, 10),
  a('ev_box_fits', '只要我坐得下', '📥', '目击猫咪硬挤进小纸箱', 'event_box_sit_fits', 1, 10),
  a('ev_butterfly', '捉不到的春天', '🦋', '目击猫咪追蝴蝶', 'event_butterfly_chase', 1, 10),
  a('ev_zoomies', '半夜跑酷', '💨', '目击猫咪突然疯跑', 'event_zoomies', 1, 10),
  a('ev_knock_over', '它是故意的', '🫖', '目击猫咪把东西推下去', 'event_knock_over', 1, 10),
  a('ev_loaf', '面包大赛', '🍞', '目击猫咪们比赛揣手', 'event_loaf_contest', 1, 15),
  a('ev_meow_concert', '喵喵音乐会', '🎶', '目击猫咪们集体开嗓', 'event_meow_concert', 1, 20),
  a('ev_yawn', '哈欠会传染', '🥱', '目击猫咪连环打哈欠', 'event_yawn_chain', 1, 10),
  a('ev_slow_blink', '我也爱你', '😌', '收到猫咪的慢眨眼', 'event_slow_blink', 3, 15),
  a('ev_shooting_star', '快许愿', '☄️', '和猫咪一起看见流星', 'event_shooting_star', 1, 30),
  a('ev_firefly', '萤火虫之夜', '✨', '目击猫咪扑萤火虫', 'event_firefly', 1, 20),
  a('ev_thunder', '不怕不怕', '⚡', '目击猫咪被雷声吓到', 'event_thunder_scare', 1, 10),
  a('ev_warm_huddle', '抱团取暖', '🧣', '目击猫咪们挤在一起取暖', 'event_warm_huddle', 3, 20),
  a('ev_traveler', '远方的故事', '🧳', '听旅行的猫讲故事', 'event_traveler_story', 1, 40),

  // ───────── 名猫 ─────────
  a('cat_orange', '橘子来了', '🍊', '发现橘子', 'cat_1', 1, 5),
  a('cat_orange_home', '橘猫定律', '🍖', '橘子把小院当成了家', 'fam_1', 5, 30),
  a('cat_box', '箱箱的箱子', '📦', '发现箱箱，它会爱上你的纸箱', 'cat_21', 1, 10),
  a('cat_box_home', '箱子即是家', '🏠', '箱箱把小院当成了家', 'fam_21', 5, 30),
  a('cat_sock', '袜子从哪来的', '🧦', '发现袜子', 'cat_22', 1, 10),
  a('cat_tuantuan', '团团圆圆', '🍡', '发现团团', 'cat_27', 1, 10),
  a('cat_thief', '嫌疑猫', '🦹', '发现偷偷', 'cat_63', 1, 15),
  a('cat_king_orange', '大王驾到', '🦁', '发现大王', 'cat_94', 1, 20),
  a('cat_rainnight', '雨夜', '🌧️', '在深夜大雨中遇见雨夜', 'cat_101', 1, 50, true),
  a('cat_moonlight', '月光', '🌝', '在满月夜遇见月光', 'cat_104', 1, 50, true),
  a('cat_captain', '老船长靠岸', '⚓', '遇见老船长', 'cat_111', 1, 40, true),
  a('cat_grandma', '老奶奶来串门', '👵', '遇见老奶奶', 'cat_117', 1, 50, true),
  a('cat_traveler', '旅行者', '🎒', '遇见神出鬼没的旅行者', 'cat_116', 1, 80, true),
  a('cat_nameless', '无名', '🌑', '遇见无名', 'cat_119', 1, 80, true),
  a('cat_master', '小院之主', '🗝️', '遇见小院之主', 'cat_120', 1, 100, true),

  // ───────── 隐藏彩蛋 ─────────
  a('ev_cat_meeting', '「你什么都没看见」', '🕶️', '撞见一场神秘的猫咪大会', 'event_cat_meeting', 1, 60, true),
  a('ev_lost_sock', '袜子失踪案', '🔦', '目击猫咪叼走一只袜子', 'event_lost_sock', 1, 20, true),
  a('ev_sleep_talk', '梦话', '😴', '听见猫咪说梦话', 'event_sleep_talk', 1, 20, true),
  a('ev_fog_ghost', '雾里有个影子', '👻', '在大雾中看见猫的影子', 'event_fog_ghost', 1, 25, true),
  a('ev_dawn_chorus', '晨间合唱团', '🐓', '在清晨听见猫咪们的晨间合唱', 'event_dawn_chorus', 1, 25, true),
]
