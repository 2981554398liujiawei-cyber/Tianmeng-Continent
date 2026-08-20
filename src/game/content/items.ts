/** 物品类型：武器/防具/饰品/消耗品/任务物品/材料（TM-P0-020 新增 material） */
export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest' | 'material'

export interface ItemDefinition {
  id: string
  name: string
  type: ItemType
  description: string
  /** 基础价值（金币） */
  value: number
  /** 使用后恢复的生命值（仅 consumable 可使用，TM-P0-010） */
  healAmount?: number
  /** 装备后普通攻击伤害加成（仅 weapon 可使用，TM-P0-013） */
  weaponDamageBonus?: number
  /** 装备后护甲加成（仅 armor 可使用，TM-P2-002 A；当前内容暂无护甲物品，接口预留） */
  armorDefenseBonus?: number
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
  healing_potion: {
    id: 'healing_potion',
    name: '治疗药水',
    type: 'consumable',
    description: '装在小陶瓶中的淡红药水，饮下可恢复少量生命。',
    value: 10,
    healAmount: 8,
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
}

export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS[id]
}
