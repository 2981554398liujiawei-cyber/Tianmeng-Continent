import type { RelationshipProfile } from '../types/relationship'

/**
 * 关系档案注册表（TM-P2-004 第 19 节）。
 * 与 NpcState.relationship（普通 NPC 态度）严格分离；红颜系统专用。
 */
export const RELATIONSHIP_PROFILES: Record<string, RelationshipProfile> = {
  sakura_yuko: {
    npcId: 'sakura_yuko',
    romanceable: true,
    adult: true,
    // TM-P2-004 第 19 节 Values：严禁 likes_obedience / likes_being_owned
    values: ['dignity', 'responsibility', 'restraint', 'promise', 'divine_duty', 'respect'],
    likedGiftTags: ['sweet', 'refined'],
    favoriteItemIds: [],
  },
}

/** 查询关系档案；未知 npcId 返回 undefined */
export function getRelationshipProfile(npcId: string): RelationshipProfile | undefined {
  return RELATIONSHIP_PROFILES[npcId]
}

/** 是否为可攻略角色（红颜录条目判定；TM-P2-004 第 73 节） */
export function isRomanceableNpc(npcId: string): boolean {
  return getRelationshipProfile(npcId)?.romanceable === true
}
