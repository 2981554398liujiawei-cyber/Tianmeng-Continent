/** 物品类型：武器/防具/饰品/消耗品/任务物品/材料/礼物（TM-P2-004 第 65 节新增 gift） */
export type ItemType = 'weapon' | 'armor' | 'accessory' | 'consumable' | 'quest' | 'material' | 'gift'

/** 物品品阶（TM-P2-003 C：最小 rarity；默认 common；本卡不建设装备词条/随机属性） */
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface ItemDefinition {
  id: string
  name: string
  type: ItemType
  description: string
  /** 基础价值（金币） */
  value: number
  /** 品阶（TM-P2-003 C；缺省视为 common） */
  rarity?: ItemRarity
  /** 使用后恢复的生命值（仅 consumable 可使用，TM-P0-010） */
  healAmount?: number
  /** 装备后普通攻击伤害加成（仅 weapon 可使用，TM-P0-013） */
  weaponDamageBonus?: number
  /** 装备后护甲加成（仅 armor 可使用，TM-P2-002 A；当前内容暂无护甲物品，接口预留） */
  armorDefenseBonus?: number
  allowedProfessions?: import('../types/character').ProfessionId[]
  /** 装备门槛（V1：不改变存档，只在装备时校验）。 */
  requirements?: { minLevel?: number; attributes?: Partial<Record<'str' | 'agi' | 'con' | 'mnd' | 'lck', number>> }
  /** 礼物标签（仅 gift 类型可使用；TM-P2-004 第 65 节——赠礼按标签匹配关系档案 likedGiftTags） */
  giftTags?: string[]
  /** TM-P2-009-R1 §6.3：装备后每回合额外行动资源（通用扩展点；缺省无加成）。
   *  actions=额外主行动 / bonusActions=额外附赠行动。仅玩家装备生效（伙伴无装备）。
   *  §6.3 只要求通用实现 + test fixture，本卡不强行新增失衡装备。 */
  combatTurnBonus?: {
    actions?: number
    bonusActions?: number
  }
  /** TM-P2-013 §12/§19：未鉴定标记（静态 authored 属性，不是实例元数据）。
   *  true → 背包显示「未鉴定」、不暴露最终属性、不出现装备按钮；真实形态由鉴定规则确定性解析。 */
  unidentified?: boolean
}

/** V1 最小物品目录（仅当前需要的内容） */
export const ITEMS: Record<string, ItemDefinition> = {
  king_kong_giant_shield: {
    id: 'king_kong_giant_shield', name: '金刚巨盾', type: 'armor', value: 120, rarity: 'rare',
    armorDefenseBonus: 4, allowedProfessions: ['warrior', 'knight'],
    requirements: { minLevel: 4, attributes: { str: 15 } },
    description: '恰拉拉守在泉边的巨盾，沉重却能稳住防线。',
  },
  // TM-P2-013 §12：未鉴定黑石遗物（Boss 首胜 guaranteed；不可装备、不暴露最终属性、无随机词条）
  unidentified_blackstone_relic: {
    id: 'unidentified_blackstone_relic', name: '未鉴定的黑石遗物', type: 'quest', value: 0, unidentified: true,
    description: '未鉴定。从黑石封印室取出的旧王朝遗物，天龙城的鉴定师也许能看出它的用途。',
  },
  // TM-P2-013 §17：职业对应鉴定结果（确定性 authored；数值在当前装备曲线内；Requirement 系统覆盖 STR/CON/AGI/MND）
  blackstone_warblade: {
    id: 'blackstone_warblade', name: '黑石战刃', type: 'weapon', value: 140, rarity: 'uncommon',
    weaponDamageBonus: 5, allowedProfessions: ['warrior'],
    requirements: { minLevel: 6, attributes: { str: 14 } },
    description: '鉴定后的黑石战刃，刃口仍残留封印室的寒气，需要足够的力量才能驾驭。',
  },
  blackstone_guard_armor: {
    id: 'blackstone_guard_armor', name: '黑石守卫甲', type: 'armor', value: 140, rarity: 'uncommon',
    armorDefenseBonus: 5, allowedProfessions: ['knight'],
    requirements: { minLevel: 6, attributes: { con: 14 } },
    description: '鉴定后的黑石守卫甲，甲片之间刻着守卫誓词，只有体魄强健者能承受它的重量。',
  },
  blackstone_hunter_bow: {
    id: 'blackstone_hunter_bow', name: '黑石猎弓', type: 'weapon', value: 140, rarity: 'uncommon',
    weaponDamageBonus: 5, allowedProfessions: ['ranger'],
    requirements: { minLevel: 6, attributes: { agi: 14 } },
    description: '鉴定后的黑石猎弓，弓臂由黑石与兽筋合成，只有灵巧的手能拉开它。',
  },
  blackstone_resonance_staff: {
    id: 'blackstone_resonance_staff', name: '黑石共鸣杖', type: 'weapon', value: 140, rarity: 'uncommon',
    weaponDamageBonus: 5, allowedProfessions: ['mage'],
    requirements: { minLevel: 6, attributes: { mnd: 14 } },
    description: '鉴定后的黑石共鸣杖，杖首的黑石仍与深层共鸣，只有专注的头脑能引导它。',
  },
  hemostatic_herb: { id: 'hemostatic_herb', name: '止血草', type: 'material', value: 4, description: '北坡常见的止血药草。' },
  clear_spring_moss: { id: 'clear_spring_moss', name: '清泉苔', type: 'material', value: 8, description: '神泉雾气滋养的青苔。' },
  venom_bee_stinger: { id: 'venom_bee_stinger', name: '蜂针', type: 'material', value: 6, description: '毒针蜂群遗留的锋利蜂针。' },
  wild_boar_hide: { id: 'wild_boar_hide', name: '野猪皮', type: 'material', value: 10, description: '结实的山林野猪皮。' },
  bear_hide: { id: 'bear_hide', name: '熊皮', type: 'material', value: 24, description: '恰拉拉留下的厚实熊皮。' },
  spirit_spring_water: { id: 'spirit_spring_water', name: '神泉之水', type: 'quest', value: 0, description: '水性稳定的神泉之水；本轮不可战斗使用。' },
  iron_sword: {
    id: 'iron_sword',
    name: '铁剑',
    type: 'weapon',
    description: '村镇铁匠铺打造的寻常铁剑，虽不锋利，胜在可靠。',
    value: 30,
    weaponDamageBonus: 2,
  },
  traveler_cloth_armor: {
    id: 'traveler_cloth_armor', name: '旅行布衣', type: 'armor', value: 12,
    armorDefenseBonus: 1, description: '常见的厚布旅行服，虽挡不住重击，却多少能减轻擦伤。',
    allowedProfessions: ['warrior', 'knight', 'ranger', 'mage'],
  },
  hardened_leather_armor: {
    id: 'hardened_leather_armor', name: '硬皮甲', type: 'armor', value: 30,
    armorDefenseBonus: 2, description: '经过硬化处理的皮甲，轻便而可靠。',
    allowedProfessions: ['warrior', 'knight', 'ranger'],
  },
  chainmail_armor: {
    id: 'chainmail_armor', name: '锁子甲', type: 'armor', value: 55,
    armorDefenseBonus: 3, description: '环环相扣的金属甲片，能有效抵挡利刃。',
    allowedProfessions: ['warrior', 'knight'],
  },
  arcane_robe: {
    id: 'arcane_robe', name: '灵纹法袍', type: 'armor', value: 40,
    armorDefenseBonus: 2, description: '绣有灵纹的法袍，布料间流转着微弱魔力。',
    allowedProfessions: ['mage'],
  },
  healing_potion: {
    id: 'healing_potion',
    name: '治疗药水',
    type: 'consumable',
    description: '装在小陶瓶中的淡红药水，饮下可恢复少量生命。',
    value: 10,
    healAmount: 8,
  },
  black_fang: {
    id: 'black_fang',
    name: '黑鬃狼牙',
    type: 'material',
    description: '从黑鬃魔狼口中取下的锐利狼牙，边缘泛着不祥的暗光。',
    value: 5,
    rarity: 'common',
  },
  // TM-P2-008 §25：荒原野狼材料（普通狼牙/狼皮；北郊狼群掉落复用 wolf_meat）
  wolf_fang: {
    id: 'wolf_fang',
    name: '狼牙',
    type: 'material',
    description: '从荒原野狼口中取下的普通狼牙，是常见的制作素材。',
    value: 4,
    rarity: 'common',
  },
  wolf_pelt: {
    id: 'wolf_pelt',
    name: '狼皮',
    type: 'material',
    description: '从荒原野狼身上剥下的完整狼皮，触感粗糙，可用于制甲与交易。',
    value: 15,
    rarity: 'common',
  },
  black_mane_pelt: {
    id: 'black_mane_pelt',
    name: '黑鬃狼皮',
    type: 'material',
    description: '罕见的完整黑鬃狼皮，毛色如墨，触感温润，是上好的制甲材料。',
    value: 40,
    rarity: 'uncommon',
  },
  // TM-P2-007 §5.6：八种通用材料最小集（新增 6 种，狼牙/狼皮复用）
  wolf_meat: {
    id: 'wolf_meat',
    name: '兽肉',
    type: 'material',
    description: '从野兽身上取下的新鲜兽肉，烤熟后是绝佳的旅餐，也可作为制作素材。',
    value: 3,
    rarity: 'common',
  },
  rat_tail: {
    id: 'rat_tail',
    name: '鼠尾',
    type: 'material',
    description: '魔化鼠的细长尾巴，带着微弱的暗气，炼药时偶尔会用到。',
    value: 2,
    rarity: 'common',
  },
  broken_bone_shard: {
    id: 'broken_bone_shard',
    name: '破损骨片',
    type: 'material',
    description: '亡灵身上散落的破损骨片，质地坚硬，是常见的制作素材。',
    value: 3,
    rarity: 'common',
  },
  tattered_cloth: {
    id: 'tattered_cloth',
    name: '残破布片',
    type: 'material',
    description: '从亡者衣物上撕下的残破布片，带着陈旧的魔气。',
    value: 3,
    rarity: 'common',
  },
  shadow_dust: {
    id: 'shadow_dust',
    name: '暗影粉尘',
    type: 'material',
    description: '由暗影与魔气凝结的粉尘，微光中泛着暗紫色，是稀有的施法素材。',
    value: 8,
    rarity: 'uncommon',
  },
  spirit_shard: {
    id: 'spirit_shard',
    name: '灵性碎片',
    type: 'material',
    description: '承载着残余灵性的晶莹碎片，蕴含微弱的魔力波动。',
    value: 10,
    rarity: 'uncommon',
  },
  refined_iron_sword: {
    id: 'refined_iron_sword',
    name: '精制铁剑',
    type: 'weapon',
    description: '淬火精锻的铁剑，比寻常铁剑更为锋锐。',
    value: 60,
    rarity: 'uncommon',
    weaponDamageBonus: 3,
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
    description: '一份指向黄金兔子王所在之地的藏宝图，上面以景物和路标标记着前往目标地点的路线。',
    value: 0,
  },
  iron_ore: {
    id: 'iron_ore',
    name: '铁矿石',
    type: 'material',
    description: '从废弃矿洞中取得的普通铁矿石，表面带着粗粝的金属光泽。',
    value: 5,
  },
  // TM-P1-029：夔峒项链（任务物品）——王财在黑石塔附近遭遇魔物袭击时遗失，是妻子留下的重要物件；复用现有 ItemDefinition quest 类型，不新建任务物品系统
  kuidong_necklace: {
    id: 'kuidong_necklace',
    name: '夔峒项链',
    type: 'quest',
    description: '王财在黑石塔附近遭遇魔物袭击时遗失的项链，是他妻子留下的重要物件。',
    value: 0,
  },
  tianlong_martial_medal: {
    id: 'tianlong_martial_medal',
    name: '天龙武备铜章',
    type: 'quest',
    description: '天龙武备场授予的资格凭证，证明持有者完成了基础武备试炼。',
    value: 0,
  },
  // TM-P2-004 第 66 节：第一种真实礼物——天龙桂花糕（gift 类型 + 礼物标签）
  tianlong_osmanthus_cake: {
    id: 'tianlong_osmanthus_cake',
    name: '天龙桂花糕',
    type: 'gift',
    description: '天龙城老字号铺子蒸制的桂花糕，口感细腻，带着桂花的清甜。',
    value: 8,
    giftTags: ['sweet', 'refined', 'local'],
  },
}

export function getItem(id: string): ItemDefinition | undefined {
  return ITEMS[id]
}
