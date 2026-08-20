/**
 * 关系系统类型（TM-P2-004 第 13 节）。
 * 独立于 NpcState.relationship（普通 NPC 态度），红颜系统专用。
 * 核心数值只有 affection（好感）与 trust（信任），绝对禁止 lust/desire/sex/obedience/submission。
 */
export type RelationshipStage = 'stranger' | 'acquaintance' | 'trusted' | 'close' | 'romance' | 'committed'

/** 关系持久状态（TM-P2-004 第 13 节） */
export interface RelationshipState {
  npcId: string
  /** 好感 0..100（delta 后 clamp） */
  affection: number
  /** 信任 0..100（delta 后 clamp） */
  trust: number
  stage: RelationshipStage
  /** 个人任务阶段（0 = 未开始；本卡契约后 = 1，表示 S1《落樱越界》完成；不是恋爱门槛） */
  personalQuestStage: number
  flags: Record<string, boolean | number | string>
}

/** 关系静态档案（TM-P2-004 第 19 节） */
export interface RelationshipProfile {
  npcId: string
  romanceable: boolean
  adult: boolean
  values: string[]
  likedGiftTags: string[]
  favoriteItemIds: string[]
}

/** 关系变化来源（必须明确；TM-P2-004 第 20 节） */
export type RelationshipChangeSource =
  | 'sakura_offer_help'
  | 'sakura_ask_context'
  | 'sakura_pet_joke'
  | 'sakura_profession_warrior'
  | 'sakura_profession_knight'
  | 'sakura_profession_ranger'
  | 'sakura_profession_mage'
  | 'sakura_mnd_success'
  | 'sakura_luck_rescue'
  | 'sakura_contract_accept'
  | 'sakura_contract_joke'
  | 'sakura_first_rest_respect'
  | 'sakura_first_rest_joke'
  | 'sakura_first_rest_pragmatic'
  | 'sakura_talk_common'
  | 'sakura_banter'
  | 'gift'
  | 'test'

/** 关系变化请求（applyRelationshipChange 输入） */
export interface RelationshipChangeRequest {
  npcId: string
  affection?: number
  trust?: number
  source: RelationshipChangeSource
}
