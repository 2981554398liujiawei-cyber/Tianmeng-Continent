/**
 * 敌人掉落表注册（Loot V2 / TM-P2-007 §5）。
 * 三类条目：guaranteed（必掉）/ random（按概率，受幸运影响）/ lucky（幸运检定）。
 * 剧情关键道具（rabbit_path / kuidong_necklace 等）绝不进入本表——
 * 剧情道具无论 LCK 多少都必须由剧情结算正常获得（resolveCombatVictory 负责）。
 * 材料按任务卡 §5.6 八种通用材料分配：同类敌人复用材料；Boss 更高概率 / 额外 lucky 档。
 */
import type { DropTable } from '../types/loot'

export const DROP_TABLES: Record<string, DropTable> = {
  forest_boar: { id: 'forest_boar', guaranteed: [{ itemId: 'wolf_meat', quantity: [1, 1] }], random: [{ itemId: 'wild_boar_hide', quantity: [1, 1], baseChance: 0.35 }] },
  venom_bee_swarm: { id: 'venom_bee_swarm', guaranteed: [{ itemId: 'venom_bee_stinger', quantity: [1, 1] }] },
  forest_black_bear: { id: 'forest_black_bear', guaranteed: [{ itemId: 'wolf_meat', quantity: [1, 2] }] },
  black_bear_qialala: { id: 'black_bear_qialala', guaranteed: [{ itemId: 'wolf_meat', quantity: [1, 2] }] },
  // 野兽类：复用兽肉/鼠尾/狼牙；嘟嘟兔（Boss）更高概率 + 低 DC lucky
  corrupted_rabbit: {
    id: 'corrupted_rabbit',
    guaranteed: [{ itemId: 'wolf_meat', quantity: [1, 1] }],
    random: [{ itemId: 'wolf_meat', quantity: [1, 1], baseChance: 0.4 }],
  },
  corrupted_rat: {
    id: 'corrupted_rat',
    guaranteed: [{ itemId: 'rat_tail', quantity: [1, 1] }],
    random: [{ itemId: 'wolf_meat', quantity: [1, 1], baseChance: 0.3 }],
  },
  corrupted_wolf: {
    id: 'corrupted_wolf',
    guaranteed: [{ itemId: 'wolf_meat', quantity: [1, 1] }],
    random: [{ itemId: 'wolf_meat', quantity: [1, 2], baseChance: 0.4 }],
  },
  dudu_rabbit: {
    id: 'dudu_rabbit',
    guaranteed: [{ itemId: 'wolf_meat', quantity: [1, 2] }],
    random: [{ itemId: 'wolf_meat', quantity: [1, 2], baseChance: 0.6 }],
    lucky: [{ itemId: 'wolf_meat', quantity: [1, 1], dc: 10 }],
  },
  // 亡灵类：复用破损骨片/残破布片/暗影粉尘/灵性碎片；骷髅队长（Boss）更高概率 + lucky
  skeleton_soldier: {
    id: 'skeleton_soldier',
    guaranteed: [{ itemId: 'broken_bone_shard', quantity: [1, 1] }],
    random: [{ itemId: 'broken_bone_shard', quantity: [1, 1], baseChance: 0.4 }],
  },
  skeleton_captain: {
    id: 'skeleton_captain',
    guaranteed: [{ itemId: 'broken_bone_shard', quantity: [1, 2] }],
    random: [{ itemId: 'broken_bone_shard', quantity: [1, 2], baseChance: 0.6 }],
    lucky: [{ itemId: 'tattered_cloth', quantity: [1, 1], dc: 10 }],
  },
  tower_zombie: {
    id: 'tower_zombie',
    guaranteed: [{ itemId: 'broken_bone_shard', quantity: [1, 1] }],
    random: [{ itemId: 'tattered_cloth', quantity: [1, 1], baseChance: 0.3 }],
  },
  black_mage: {
    id: 'black_mage',
    guaranteed: [{ itemId: 'tattered_cloth', quantity: [1, 1] }],
    random: [{ itemId: 'shadow_dust', quantity: [1, 1], baseChance: 0.3 }],
  },
  skeleton_warrior: {
    id: 'skeleton_warrior',
    guaranteed: [{ itemId: 'broken_bone_shard', quantity: [1, 2] }],
    random: [{ itemId: 'tattered_cloth', quantity: [1, 1], baseChance: 0.4 }],
    lucky: [{ itemId: 'shadow_dust', quantity: [1, 1], dc: 12 }],
  },
  skeleton_witch: {
    id: 'skeleton_witch',
    guaranteed: [{ itemId: 'spirit_shard', quantity: [1, 1] }],
    random: [{ itemId: 'shadow_dust', quantity: [1, 1], baseChance: 0.4 }],
    lucky: [{ itemId: 'spirit_shard', quantity: [1, 1], dc: 12 }],
  },
  // TM-P2-003 C → Loot V2 迁移（§5.5）：狼牙 guaranteed、狼皮 random、lucky 追加狼牙（DC 12）
  black_mane_wolf: {
    id: 'black_mane_wolf',
    guaranteed: [{ itemId: 'black_fang', quantity: [1, 1] }],
    random: [{ itemId: 'black_mane_pelt', quantity: [1, 1], baseChance: 0.5 }],
    lucky: [{ itemId: 'black_fang', quantity: [1, 1], dc: 12 }],
  },
  // TM-P2-008 §25：荒原野狼——狼牙 guaranteed、狼皮 random、lucky 追加兽肉（DC 12）
  wild_wolf: {
    id: 'wild_wolf',
    guaranteed: [{ itemId: 'wolf_fang', quantity: [1, 1] }],
    random: [{ itemId: 'wolf_pelt', quantity: [1, 1], baseChance: 0.35 }],
    lucky: [{ itemId: 'wolf_meat', quantity: [1, 1], dc: 12 }],
  },
  // 残灾之影（剧情契约战）：掉落暗影/灵性材料，不涉及任务关键物
  sakura_calamity_fragment: {
    id: 'sakura_calamity_fragment',
    guaranteed: [{ itemId: 'shadow_dust', quantity: [1, 2] }],
    random: [{ itemId: 'spirit_shard', quantity: [1, 1], baseChance: 0.4 }],
    lucky: [{ itemId: 'spirit_shard', quantity: [1, 1], dc: 12 }],
  },
  // TM-P2-009-R1 §11.4：洞穴蝙蝠（野兽类低弱怪；复用鼠尾/兽肉材料）
  cave_bat: {
    id: 'cave_bat',
    guaranteed: [{ itemId: 'rat_tail', quantity: [1, 1] }],
    random: [{ itemId: 'wolf_meat', quantity: [1, 1], baseChance: 0.3 }],
  },
  // TM-P2-009-R1 §11.4：荒原野猪（北郊非狼系野兽；兽肉 + 兽皮）
  wild_boar: {
    id: 'wild_boar',
    guaranteed: [{ itemId: 'wolf_meat', quantity: [1, 2] }],
    random: [{ itemId: 'wolf_pelt', quantity: [1, 1], baseChance: 0.35 }],
  },
}

/** 查询掉落表；无表返回 undefined */
export function getDropTable(enemyId: string): DropTable | undefined {
  return DROP_TABLES[enemyId]
}

/** 兼容别名（TM-P2-003 C 旧导出名；如测试引用旧名仍可用） */
export const getLootTable = getDropTable
