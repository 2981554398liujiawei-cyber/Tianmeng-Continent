/** 装备槽位：武器 / 防具 / 饰品 */
export type ItemSlot = 'weapon' | 'armor' | 'accessory'

/** 背包条目：物品 ID + 数量 */
export interface InventoryEntry {
  itemId: string
  quantity: number
}

export type Inventory = InventoryEntry[]

/** 当前穿戴的装备（按槽位记录物品 ID，未装备为 null） */
export interface Equipment {
  weapon: string | null
  armor: string | null
  accessory: string | null
}
