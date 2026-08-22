import type { MountDefinition } from '../types/mount'

/**
 * 坐骑内容注册表（P2-007 §18.4）。
 * 本阶段只允许火焰驹正式可获得（马厩 80 金）；其余三匹只做 registry + UI hint，不提前白送。
 */

/** 火焰驹（唯一可获取坐骑） */
export const FIRE_STALLION_ID = 'fire_stallion'
/** 赤兔驹 */
export const CHI_TU_ID = 'chi_tu'
/** 天云狂风马 */
export const TIANYUN_STORM_HORSE_ID = 'tianyun_storm_horse'
/** 紫焰雷翼马 */
export const PURPLE_FLAME_THUNDER_ID = 'purple_flame_thunder'

export const MOUNTS: Record<string, MountDefinition> = {
  [FIRE_STALLION_ID]: {
    id: FIRE_STALLION_ID,
    name: '火焰驹',
    description: '毛色赤红如火的骏马，四蹄踏地隐隐生温，是民间常见的好马。',
    attributeBonuses: { str: 1, agi: 1 },
    travelTags: ['fast_travel'],
    rarity: 'common',
    acquisitionHint: '可在天龙城马厩用 80 金购得。',
  },
  [CHI_TU_ID]: {
    id: CHI_TU_ID,
    name: '赤兔驹',
    description: '通体赤红的良驹，奔行如电，善于追踪。',
    attributeBonuses: { agi: 2 },
    travelTags: ['fast_travel', 'pursuit'],
    rarity: 'rare',
    acquisitionHint: '尚未开放获取。',
  },
  [TIANYUN_STORM_HORSE_ID]: {
    id: TIANYUN_STORM_HORSE_ID,
    name: '天云狂风马',
    description: '踏云而来的神驹，蹄下生风，可短暂御空而行。',
    attributeBonuses: { agi: 2, mnd: 1 },
    travelTags: ['fast_travel', 'flight'],
    rarity: 'epic',
    acquisitionHint: '尚未开放获取。',
  },
  [PURPLE_FLAME_THUNDER_ID]: {
    id: PURPLE_FLAME_THUNDER_ID,
    name: '紫焰雷翼马',
    description: '浑身缠绕紫焰雷光的传奇坐骑，可踏雷而行。',
    attributeBonuses: { str: 1, agi: 2, lck: 1 },
    travelTags: ['fast_travel', 'flight', 'thunder_path'],
    rarity: 'legendary',
    acquisitionHint: '尚未开放获取。',
  },
}

/** 坐骑购买价格（金；P2-007 §19 火焰驹 80 金；未登记价格 = 不可购买/locked） */
export const MOUNT_PRICES: Record<string, number> = {
  [FIRE_STALLION_ID]: 80,
}

export function getMount(id: string): MountDefinition | undefined {
  return MOUNTS[id]
}
