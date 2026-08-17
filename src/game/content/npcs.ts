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
  /** 固定的见面问候语（TM-P0-015，最小单轮对话） */
  greeting: string
}

export const NPCS: Record<string, NpcDefinition> = {
  village_elder: {
    id: 'village_elder',
    name: '村长',
    role: '青石村村长',
    locationId: 'qingshi_village',
    summary: '年迈而沉稳的老人，看着村外异动的野兽忧心忡忡。',
    greeting: '村外的野兽越来越不安分，村里的人都很担心。',
  },
  blacksmith: {
    id: 'blacksmith',
    name: '铁匠',
    role: '铁匠',
    locationId: 'qingshi_village',
    summary: '打铁三十年的壮汉，手艺扎实，嗓门更大。',
    greeting: '出门冒险前把兵器检查仔细，别等到交手时才发现出了毛病。',
  },
  apothecary: {
    id: 'apothecary',
    name: '药师',
    role: '药师',
    locationId: 'qingshi_village',
    summary: '青石村的药师大叔，熟悉采药与炼药，村外魔化野兽的活动给他的采药工作带来了麻烦。',
    greeting: '最近村外采药不太安稳。要是受了伤，我这里还有些治疗药水。',
  },
}
