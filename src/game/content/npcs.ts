/**
 * NPC 定义（TM-P0-002）：NPC 是什么人（静态资料）。
 * 与 NpcState（NPC 当前状态/关系值）严格分离。
 */
export interface NpcDefinition {
  id: string
  name: string
  /** 身份/职务 */
  role: string
  /** 常驻地点 ID */
  locationId: string
  /** 简短人物介绍（1–2 句） */
  summary: string
}

export const NPCS: Record<string, NpcDefinition> = {
  village_elder: {
    id: 'village_elder',
    name: '村长',
    role: '青石村村长',
    locationId: 'qingshi_village',
    summary: '年迈而沉稳的老人，看着村外异动的野兽忧心忡忡。',
  },
  blacksmith: {
    id: 'blacksmith',
    name: '铁匠',
    role: '铁匠',
    locationId: 'qingshi_village',
    summary: '打铁三十年的壮汉，手艺扎实，嗓门更大。',
  },
  apothecary: {
    id: 'apothecary',
    name: '药师',
    role: '药师',
    locationId: 'qingshi_village',
    summary: '熟悉草药的温和女子，最近常为被野兽咬伤的村民配药。',
  },
}
