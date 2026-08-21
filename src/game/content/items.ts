/** 物品类型：武器/防具/饰品/消耗品/任务物品/材料/礼物（TM-P2-004 第 65 节新增 gift） */
export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest' | 'material' | 'gift'

/** 物品品阶（TM-P2-003 C：最小 rarity；默认 common；本卡不建设装备词条/随机属性） */
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface ItemDefinition {
  id: string
  name: string
  type: ItemType
  description: string
  /** 基础价值（金币） */
  value: number
  /** 品阶（TM-P2-003 C；缺省视为 common） */
  rarity?: ItemRarity
  /** 使用后恢复的生命值（仅 consumable 可使用，TM-P0-010） */
  healAmount?: number
  /** 装备后普通攻击伤害加成（仅 weapon 可使用，TM-P0-013） */
  weaponDamageBonus?: number
  /** 装备后护甲加成（仅 armor 可使用，TM-P2-002 A；当前内容暂无护甲物品，接口预留） */
  armorDefenseBonus?: number
  allowedProfessions?: import('../types/character').ProfessionId[]
  /** 礼物标签（仅 gift 类型可使用；TM-P2-004 第 65 节——赠礼按标签匹配关系档案 likedGiftTags） */
  giftTags?: string[]
}

/** V1 最小物品目录（仅当前需要的内容） */
export const ITEMS: Record<string, ItemDefinition> = {
  iron_sword: {
    id: 'iron_sword',
    name: '铁剑',
    type: 'weapon',
    description: '村镇铁匠铺打造的寻常铁剑，虽不锋利，胜在可靠。',
    value: 30,
    weaponDamageBonus: 2,
  },
  traveler_cloth_armor: {
    id: 'traveler_cloth_armor', name: '旅行布衣', type: 'armor', value: 12,
    armorDefenseBonus: 1, description: '常见的厚布旅行服，虽挡不住重击，却多少能减轻擦伤。',
    allowedProfessions: ['warrior', 'knight', 'ranger', 'mage'],
  },
  hardened_leather_armor: {
    id: 'hardened_leather_armor', name: '硬皮甲', type: 'armor', value: 30,
    armorDefenseBonus: 2, description: '经过硬化处理的皮甲，轻便而可靠。',
    allowedProfessions: ['warrior', 'knight', 'ranger'],
  },
  chainmail_armor: {
    id: 'chainmail_armor', name: '锁子甲', type: 'armor', value: 55,
    armorDefenseBonus: 3, description: '环环相扣的金属甲片，能有效抵挡利刃。',
    allowedProfessions: ['warrior', 'knight'],
  },
  arcane_robe: {
    id: 'arcane_robe', name: '灵纹法袍', type: 'armor', value: 40,
    armorDefenseBonus: 2, description: '绣有灵纹的法袍，布料间流转着微弱魔力。',
    allowedProfessions: ['mage'],
  },
  healing_potion: {
    id: 'healing_potion',
    name: '治疗药水',
    type: 'consumable',
    description: '装在小陶瓶中的淡红药水，饮下可恢复少量生命。',
    value: 10,
    healAmount: 8,
  },
  black_fang: {
    id: 'black_fang',
    name: '黑鬃狼牙',
    type: 'material',
    description: '从黑鬃魔狼口中取下的锐利狼牙，边缘泛着不祥的暗光。',
    value: 5,
    rarity: 'common',
  },
  black_mane_pelt: {
    id: 'black_mane_pelt',
    name: '黑鬃狼皮',
    type: 'material',
    description: '罕见的完整黑鬃狼皮，毛色如墨，触感温润，是上好的制甲材料。',
    value: 40,
    rarity: 'uncommon',
  },
  refined_iron_sword: {
    id: 'refined_iron_sword',
    name: '精制铁剑',
    type: 'weapon',
    description: '淬火精锻的铁剑，比寻常铁剑更为锋锐。',
    value: 60,
    rarity: 'uncommon',
    weaponDamageBonus: 3,
  },
  test_artifact: {
    id: 'test_artifact',
    name: '测试遗物',
    type: 'quest',
    description: '用于开发状态页验证背包数据流的任务物品。',
    value: 1,
  },
  rabbit_path: {
    id: 'rabbit_path',
    name: '兔子的路径',
    type: 'quest',
    description: '一份指向黄金兔子王所在之地的藏宝图，上面以景物和路标标记着前往目标地点的路线。',
    value: 0,
  },
  iron_ore: {
    id: 'iron_ore',
    name: '铁矿石',
    type: 'material',
    description: '从废弃矿洞中取得的普通铁矿石，表面带着粗粝的金属光泽。',
    value: 5,
  },
  // TM-P1-029：夔峒项链（任务物品）——王财在黑石塔附近遭遇魔物袭击时遗失，是妻子留下的重要物件；复用现有 ItemDefinition quest 类型，不新建任务物品系统
  kuidong_necklace: {
    id: 'kuidong_necklace',
    name: '夔峒项链',
    type: 'quest',
    description: '王财在黑石塔附近遭遇魔物袭击时遗失的项链，是他妻子留下的重要物件。',
    value: 0,
  },
  // TM-P2-004 第 66 节：第一种真实礼物——天龙桂花糕（gift 类型 + 礼物标签）
  tianlong_osmanthus_cake: {
    id: 'tianlong_osmanthus_cake',
    name: '天龙桂花糕',
    type: 'gift',
    description: '天龙城老字号铺子蒸制的桂花糕，口感细腻，带着桂花的清甜。',
    value: 8,
    giftTags: ['sweet', 'refined', 'local'],
  },
}

export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS[id]
}
