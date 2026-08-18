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
  // TM-P1-024：天龙城第一段 NPC（武馆骑士队长马科 / 商人王财）；本卡不建立 relationship/npcState，所有职业均可正常交流；不建转职/职业导师/技能学习系统
  knight_captain_make: {
    id: 'knight_captain_make',
    name: '马科',
    role: '骑士队长',
    locationId: 'tianlong_martial_hall',
    summary: '负责武馆事务的骑士队长，言谈干练，对城内外发生的异常保持警惕。',
    greeting: '刚到天龙城？这里比村镇复杂得多，出城办事之前最好先弄清楚自己面对的是什么。',
  },
  merchant_wangcai: {
    id: 'merchant_wangcai',
    name: '王财',
    role: '商人',
    locationId: 'tianlong_city',
    summary: '天龙城中的商人，最近似乎遇上了一件让他十分头疼的事情。',
    greeting: '唉……最近实在诸事不顺。',
  },
}
