/** 物品类型：武器/防具/饰品/消耗品/任务物品 */
export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest'

export interface ItemDefinition {
  id: string
  name: string
  type: ItemType
  description: string
  /** 基础价值（金币） */
  value: number
}

/** V1 最小物品目录（仅当前需要的内容） */
export const ITEMS: Record<string, ItemDefinition> = {
  iron_sword: {
    id: 'iron_sword',
    name: '铁剑',
    type: 'weapon',
    description: '村镇铁匠铺打造的寻常铁剑，虽不锋利，胜在可靠。',
    value: 30,
  },
  healing_potion: {
    id: 'healing_potion',
    name: '治疗药水',
    type: 'consumable',
    description: '装在小陶瓶中的淡红药水，饮下可恢复少量生命。',
    value: 10,
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
    description: '记录着兔群迁徙路线的手绘草图，边角微微卷曲，隐约沾着草汁。',
    value: 0,
  },
}

export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS[id]
}
