/** 玩家对 NPC 的五维关系值 */
export interface NpcRelationship {
  trust: number
  affection: number
  respect: number
  fear: number
  resentment: number
  /** 恋爱相关角色可额外拥有 */
  romanceInterest?: boolean
}

export interface NpcState {
  npcId: string
  alive: boolean
  locationId: string
  relationship: NpcRelationship
}
