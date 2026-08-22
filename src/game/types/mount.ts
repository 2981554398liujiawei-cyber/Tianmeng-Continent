import type { ItemRarity } from '../content/items'

/** 坐骑五维加成（P2-007 §18.2；只有参与加成的维才出现） */
export interface AttributeBonuses {
  str?: number
  con?: number
  agi?: number
  mnd?: number
  lck?: number
}

/**
 * 坐骑定义（P2-007 §18.1/§18.2）。
 * 坐骑不是战斗单位：无 HP、无 turn、不被敌人选为目标；是「角色属性增益 + 探索能力 + 长期收集身份」。
 */
export interface MountDefinition {
  id: string
  name: string
  description: string
  /** 装备后对角色五维的加成（P2-007 §20：Combat derived stats 使用 effective values） */
  attributeBonuses: AttributeBonuses
  /** 探索标签（P2-007 §21：hasTravelTag 检索；fast_travel / pursuit / flight / thunder_path） */
  travelTags?: string[]
  rarity?: ItemRarity
  /** 获取提示（P2-007 §18.4：非当前可获取坐骑的 registry + UI hint） */
  acquisitionHint?: string
}
