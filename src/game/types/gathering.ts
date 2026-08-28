export type GatheringCategory = 'herb' | 'natural' | 'creature'

export interface GatheringResultItem {
  itemId: string
  quantity: number
}

/** 轻量 authored 采集节点；完成状态只写入 world.flags，不引入刷新或职业系统。 */
export interface GatheringDefinition {
  id: string
  name: string
  locationId: string
  category: GatheringCategory
  resultItems: GatheringResultItem[]
  description: string
  once?: boolean
  prerequisiteFlag?: string
}
