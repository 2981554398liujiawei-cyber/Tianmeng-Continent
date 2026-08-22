/**
 * qa/p2-007-balance.mjs —— TM-P2-007 §53 Balance Regression Monte Carlo 模拟器（seeded、确定性、可复现）。
 *
 * 运行方式（Node 22.15+ / 23.6+ 均可；本仓库 Node 24 已验证）：
 *   node qa/p2-007-balance.mjs
 * 可选参数：
 *   --n 5000         每 pairing 模拟次数（默认 5000）
 *   --seed 20260701  全局 PRNG 种子（默认 20260701；每个 pairing 用独立派生种子）
 *
 * Scenario（任务卡 §53）：
 *   A. Lv2 LUCK-heavy solo vs Lv5 骷髅战士×1（跨级 3；No Mount vs Fire Steed 对照，坐骑不得拉过 90%）
 *   B. Lv2 LUCK-heavy + Sakura vs 2×Lv2 腐化狼（2v2 同级团队遭遇；No Mount vs Fire Steed）
 *   C. 3 friendly vs 3 enemy：Lv3 combat + Sakura + dummy vs 3×Lv3 骷髅士兵（3v3 同级团队遭遇）
 *   D. Fire Steed vs No Mount 收益可感知性（Δpp 汇总）
 *
 * 引擎：直接调用 src/game/rules/partyCombat.ts 正式纯函数（buildFriendlyCombatant /
 *   buildEnemyInstances / buildEnemyCombatant / rollInitiativeQueue / nextAliveTurnIndex /
 *   didTurnLoop / chooseEnemyTarget / updateCombatantHp / isEncounterWon / isEncounterLost），
 *   攻击结算调用 src/game/rules/combat.ts 的 resolveAttack。
 *
 * 简化假设（与 P2-006 一致并在报告中声明）：
 *   - 伙伴 Sakura 只使用花刃（sakura_petalslash）单体伤害；魔法盾/轻舞为支持技，模拟从略。
 *   - 伙伴 HP 按 P2-007 正式语义：战斗内按 con 派生满血进入，无等级成长（CombatPage 语义）。
 *   - 战士压制猛击/轻舞的「取消反击」在回合制先手队列中影响较小，为确定性模拟从略。
 *   - 敌人无技能（注册表全部普通攻击）。
 */
import { registerHooks } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  mulberry32,
  d20From,
  PROFESSION_IDS,
  BUILDS,
  EQUIPMENT_PLAN,
  DEFAULT_SKILL_IDS,
} from './balance-utils.mjs'

// ---- TS 扩展名 resolve hook（必须在任何 .ts 动态 import 之前注册）----
// 同步版本（Node 24 registerHooks 同步 resolve 已验证）：依次尝试补 .ts → 补 /index.ts
// （目录导入如 '../content'）→ 原样。nextResolve 同步返回结果或同步抛错。
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context)
      } catch {
        /* 继续尝试下一个候选 */
      }
      try {
        return nextResolve(specifier + '/index.ts', context)
      } catch {
        /* 继续尝试下一个候选 */
      }
    }
    return nextResolve(specifier, context)
  },
})

// ---- 解析 CLI 参数 ----
const argv = process.argv.slice(2)
const argVal = (name, fallback) => {
  const i = argv.indexOf(name)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const N = Number(argVal('--n', 5000))
const BASE_SEED = Number(argVal('--seed', 20260701)) >>> 0
if (!Number.isInteger(N) || N < 1) {
  console.error('参数 --n 必须为正整数')
  process.exit(2)
}

// ---- 动态加载正式纯函数模块（registerHooks 之后）----
const rules = await import('../src/game/rules/combat.ts')
const skillRules = await import('../src/game/rules/skill.ts')
const charRules = await import('../src/game/rules/character.ts')
const pcRules = await import('../src/game/rules/partyCombat.ts')

const START = EQUIPMENT_PLAN.starter
/** 火焰驹五维加成（P2-007 §18.2：str+1 / agi+1） */
const FIRE_STALLION_BONUS = { str: 1, agi: 1 }
const NO_MOUNT = null

/** Sakura 伙伴 plan（CombatPage buildCombatSetup 语义：con12/agi16/str8/mnd16，HP 无等级成长，Lv3） */
function sakuraPlan() {
  const con = 12
  const agi = 16
  const str = 8
  const mnd = 16
  const hp = charRules.getStartingMaxHp(con)
  const mp = 6
  const attack = rules.getPlayerAttackPower(str, 0, 3)
  const armor = rules.getPlayerArmor(con, 0)
  const agility = rules.getPlayerAgility(agi)
  const skillRawDamage = skillRules.resolveSkillRawDamage('sakura_petalslash', {
    str,
    agi,
    mnd,
    weaponDamageBonus: 0,
    level: 3,
  })
  const info = skillRules.getSkillExecutionInfo('sakura_petalslash')
  return {
    id: 'sakura',
    kind: 'companion',
    name: '樱花优子',
    hp,
    mp,
    attack,
    armor,
    agi: agility,
    skillId: 'sakura_petalslash',
    skillRawDamage: skillRawDamage ?? attack,
    skillMpCost: info?.mpCost ?? 1,
    skillOnce: false,
  }
}

/** 测试伙伴 plan（§53 占位第二伙伴：基础属性、无技能、普攻） */
function dummyCompanionPlan() {
  const con = 10
  const agi = 10
  const str = 10
  const mnd = 8
  const hp = charRules.getStartingMaxHp(con)
  const mp = charRules.getStartingMaxMp(mnd)
  return {
    id: 'dummy',
    kind: 'companion',
    name: '测试伙伴',
    hp,
    mp,
    attack: rules.getPlayerAttackPower(str, 0, 1),
    armor: rules.getPlayerArmor(con, 0),
    agi: rules.getPlayerAgility(agi),
    skillId: null,
    skillRawDamage: null,
    skillMpCost: 0,
    skillOnce: false,
  }
}

/**
 * 玩家 plan（§20：战斗派生用「装备坐骑后的有效五维」；Mount bonus 先加进五维再派生）。
 */
function playerPlan(prof, buildKey, level, mountBonus, equip = START) {
  const base = BUILDS[prof][buildKey]
  const attrs = {
    str: base.str + (mountBonus?.str ?? 0),
    con: base.con,
    agi: base.agi + (mountBonus?.agi ?? 0),
    mnd: base.mnd,
    lck: base.lck,
  }
  const hp = charRules.getStartingMaxHp(attrs.con) + 2 * (level - 1)
  const mp = charRules.getStartingMaxMp(attrs.mnd) + (level - 1)
  const attack = rules.getPlayerAttackPower(attrs.str, equip.weaponBonus ?? 0, level)
  const armor = rules.getPlayerArmor(attrs.con, equip.armorBonus ?? 0)
  const agi = rules.getPlayerAgility(attrs.agi)
  const skillId = DEFAULT_SKILL_IDS[prof]
  const skillRawDamage = skillRules.resolveSkillRawDamage(skillId, {
    str: attrs.str,
    agi: attrs.agi,
    mnd: attrs.mnd,
    weaponDamageBonus: equip.weaponBonus ?? 0,
    level,
  })
  const info = skillRules.getSkillExecutionInfo(skillId)
  return {
    id: 'player',
    kind: 'player',
    name: prof,
    hp,
    mp,
    attack,
    armor,
    agi,
    skillId,
    skillRawDamage: skillRawDamage ?? attack,
    skillMpCost: info?.mpCost ?? 0,
    skillOnce: info?.oncePerCombat === true,
  }
}

/**
 * 3v3 回合制战斗模拟（先手队列正式语义，全部随机来自 rng；确定性）。
 * friendlyPlans：我方单位 plan 数组（1–3）；members：敌方成员 [{enemyId, count}]。
 */
function simulatePartyCombat(friendlyPlans, members, rng) {
  const friendly = friendlyPlans.map((plan) =>
    pcRules.buildFriendlyCombatant({
      instanceId: plan.id,
      sourceType: plan.kind,
      sourceId: plan.id,
      name: plan.name,
      currentHp: plan.hp,
      maxHp: plan.hp,
      currentMp: plan.mp,
      maxMp: plan.mp,
      attack: plan.attack,
      armor: plan.armor,
      agility: plan.agi,
    }),
  )
  const enemyInstances = pcRules.buildEnemyInstances(members)
  const enemies = enemyInstances.map(pcRules.buildEnemyCombatant)
  const combatants = [...friendly, ...enemies]
  const turns = pcRules.rollInitiativeQueue(combatants, rng)
  const mp = new Map(combatants.map((c) => [c.instanceId, c.currentMp]))
  const usedOnce = new Set()
  let idx = 0
  let rounds = 1
  const guard = 600 // 防御死循环（3v3 理论收敛远小于此）

  for (let i = 0; i < guard; i += 1) {
    if (pcRules.isEncounterWon(combatants)) return { victory: true, rounds }
    if (pcRules.isEncounterLost(combatants)) return { victory: false, rounds }
    const actor = turns[idx].combatant
    if (actor.side === 'friendly') {
      const livingEnemies = combatants.filter((c) => c.side === 'enemy' && c.isAlive)
      if (livingEnemies.length === 0) return { victory: true, rounds }
      // 我方选目标：随机存活敌方
      const target = livingEnemies[Math.floor(rng() * livingEnemies.length)]
      const plan = friendlyPlans.find((p) => p.id === actor.instanceId)
      let raw = plan.attack
      let cost = 0
      if (
        plan.skillId &&
        mp.get(actor.instanceId) >= plan.skillMpCost &&
        (!plan.skillOnce || !usedOnce.has(actor.instanceId))
      ) {
        raw = plan.skillRawDamage
        cost = plan.skillMpCost
        usedOnce.add(actor.instanceId)
      }
      const atk = rules.resolveAttack(d20From(rng), actor.agility, target.agility, raw, target.armor)
      if (atk.damage > 0) {
        const next = pcRules.updateCombatantHp(target, target.currentHp - atk.damage)
        target.currentHp = next.currentHp
        target.isAlive = next.isAlive
      }
      mp.set(actor.instanceId, mp.get(actor.instanceId) - cost)
    } else {
      // 敌方行动（AI V1：随机存活我方目标）
      const livingFriendly = combatants.filter((c) => c.side === 'friendly' && c.isAlive)
      if (livingFriendly.length === 0) return { victory: false, rounds }
      const target = pcRules.chooseEnemyTarget(livingFriendly, rng)
      const atk = rules.resolveAttack(d20From(rng), actor.agility, target.agility, actor.attack, target.armor)
      if (atk.damage > 0) {
        const next = pcRules.updateCombatantHp(target, target.currentHp - atk.damage)
        target.currentHp = next.currentHp
        target.isAlive = next.isAlive
      }
    }
    const nextIdx = pcRules.nextAliveTurnIndex(turns, idx)
    if (pcRules.didTurnLoop(idx, nextIdx)) rounds += 1
    idx = nextIdx
  }
  // 超时兜底：按当前 HP 判定
  return { victory: pcRules.isEncounterWon(combatants), rounds }
}

/** 单 pairing Monte Carlo 统计 */
function runPairing(seed, friendlyPlans, members) {
  const rng = mulberry32(seed)
  let wins = 0
  let losses = 0
  let roundsSum = 0
  for (let i = 0; i < N; i += 1) {
    const r = simulatePartyCombat(friendlyPlans, members, rng)
    if (r.victory) {
      wins += 1
      roundsSum += r.rounds
    } else {
      losses += 1
    }
  }
  return {
    winRate: (wins / N) * 100,
    lossRate: (losses / N) * 100,
    avgRounds: wins > 0 ? roundsSum / wins : 0,
  }
}

/**
 * 等量遭遇（friendlyCount === enemyCount）严格判定：
 *   单挑沿用 P2-006 阈值（同级 <55% WEAK / >95% TRIVIAL）；团队遭遇五五开为设计预期且
 *   second dummy 为占位弱伙伴，同级困难下限放宽到 <45%。
 * 跨级等量（差>=2）>90% OVERPOWER；高级等量 <60% BAD。
 * 人数不等场景不严格判定（低/高胜率均为数量预期）。
 * @param {number} playerLevel
 * @param {number} enemyLevel
 * @param {number} winRate
 * @param {number} friendlyCount
 * @param {number} enemyCount
 */
function flagEqual(playerLevel, enemyLevel, winRate, friendlyCount) {
  const weakLine = friendlyCount > 1 ? 45 : 55
  if (playerLevel === enemyLevel) {
    if (winRate < weakLine) return `FLAG_WEAK(同级等量<${weakLine}%)`
    if (winRate > 95) return 'FLAG_TRIVIAL(同级等量>95%)'
  } else if (playerLevel < enemyLevel) {
    if (enemyLevel - playerLevel >= 2 && winRate > 90) return 'FLAG_OVERPOWER(跨级等量>90%)'
  } else if (winRate < 60) {
    return 'FLAG_BAD(高级等量<60%)'
  }
  return null
}

/** 结果收集器 */
const results = { a: [], b: [], c: [], d: [] }
let seedCounter = 0
const nextSeed = () => (BASE_SEED + seedCounter++) >>> 0

// ---- Scenario A：Lv2 LUCK-heavy solo vs Lv5 骷髅战士×1（跨级 3；坐骑不得拉过 90%）----
for (const prof of PROFESSION_IDS) {
  const members = [{ enemyId: 'skeleton_warrior', count: 1 }]
  const sNo = runPairing(nextSeed(), [playerPlan(prof, 'luck', 2, NO_MOUNT)], members)
  const sMount = runPairing(nextSeed(), [playerPlan(prof, 'luck', 2, FIRE_STALLION_BONUS)], members)
  results.a.push({
    prof,
    noMount: sNo.winRate,
    fireSteed: sMount.winRate,
    delta: sMount.winRate - sNo.winRate,
    flag: sMount.winRate > 90 ? 'FLAG_OVERPOWER(Lv2 vs Lv5 坐骑后>90%)' : null,
  })
}

// ---- Scenario B：Lv2 LUCK-heavy + Sakura vs 2×Lv2 腐化狼（2v2 同级团队遭遇）----
for (const prof of PROFESSION_IDS) {
  const members = [{ enemyId: 'corrupted_wolf', count: 2 }]
  const sNo = runPairing(nextSeed(), [playerPlan(prof, 'luck', 2, NO_MOUNT), sakuraPlan()], members)
  const sMount = runPairing(nextSeed(), [playerPlan(prof, 'luck', 2, FIRE_STALLION_BONUS), sakuraPlan()], members)
  results.b.push({
    prof,
    noMount: sNo.winRate,
    fireSteed: sMount.winRate,
    delta: sMount.winRate - sNo.winRate,
    flag: flagEqual(2, 2, sMount.winRate, 2),
  })
}

// ---- Scenario C：3 friendly vs 3 enemy（Lv3 combat + Sakura + dummy vs 3×Lv3 骷髅士兵）----
for (const prof of PROFESSION_IDS) {
  const members = [{ enemyId: 'skeleton_soldier', count: 3 }]
  const plans = [playerPlan(prof, 'combat', 3, NO_MOUNT), sakuraPlan(), dummyCompanionPlan()]
  const s = runPairing(nextSeed(), plans, members)
  results.c.push({
    prof,
    winRate: s.winRate,
    lossRate: s.lossRate,
    avgRounds: s.avgRounds,
    flag: flagEqual(3, 3, s.winRate, 3),
  })
}

// ---- Scenario D：Fire Steed vs No Mount 收益可感知性（Lv3 combat：Player alone vs 1 敌 / Player+Sakura vs 2 敌）----
for (const prof of PROFESSION_IDS) {
  for (const [caseKey, members, plansFn] of [
    ['Player vs 1敌', [{ enemyId: 'skeleton_soldier', count: 1 }], (bonus) => [playerPlan(prof, 'combat', 3, bonus)]],
    ['Player+Sakura vs 2敌', [{ enemyId: 'skeleton_soldier', count: 2 }], (bonus) => [playerPlan(prof, 'combat', 3, bonus), sakuraPlan()]],
  ]) {
    const sNo = runPairing(nextSeed(), plansFn(NO_MOUNT), members)
    const sMount = runPairing(nextSeed(), plansFn(FIRE_STALLION_BONUS), members)
    results.d.push({
      prof,
      caseKey,
      noMount: sNo.winRate,
      fireSteed: sMount.winRate,
      delta: sMount.winRate - sNo.winRate,
    })
  }
}

// ---- 控制台输出 ----
console.log(`TM-P2-007 §53 Balance Regression（Party Combat V5 3v3）`)
console.log(`运行环境: Node ${process.version} | 每 pairing 模拟 ${N} 次 | 种子 ${BASE_SEED}`)
console.log('='.repeat(100))

console.log('\n【Scenario A】Lv2 LUCK-heavy solo vs Lv5 骷髅战士×1（跨级 3；坐骑不得拉过 90%）')
for (const r of results.a) {
  const mark = r.flag ? `  <<< ${r.flag}` : ''
  console.log(`  ${r.prof.padEnd(7)}  无坐骑 ${r.noMount.toFixed(1).padStart(6)}%  →  火焰驹 ${r.fireSteed.toFixed(1).padStart(6)}%   Δ${r.delta.toFixed(1)}pp${mark}`)
}

console.log('\n【Scenario B】Lv2 LUCK-heavy + Sakura vs 2×Lv2 腐化狼（2v2 同级团队遭遇）')
for (const r of results.b) {
  const mark = r.flag ? `  <<< ${r.flag}` : ''
  console.log(`  ${r.prof.padEnd(7)}  无坐骑 ${r.noMount.toFixed(1).padStart(6)}%  →  火焰驹 ${r.fireSteed.toFixed(1).padStart(6)}%   Δ${r.delta.toFixed(1)}pp${mark}`)
}

console.log('\n【Scenario C】3 friendly vs 3 enemy（Lv3 combat + Sakura + dummy vs 3×Lv3 骷髅士兵）')
for (const r of results.c) {
  const mark = r.flag ? `  <<< ${r.flag}` : ''
  console.log(`  ${r.prof.padEnd(7)}  胜率 ${r.winRate.toFixed(1).padStart(6)}%  失败率 ${r.lossRate.toFixed(1).padStart(6)}%  回合 ${r.avgRounds.toFixed(1).padStart(4)}${mark}`)
}

console.log('\n【Scenario D】Fire Steed vs No Mount 收益可感知性（Lv3 combat build）')
for (const r of results.d) {
  console.log(`  ${r.prof.padEnd(7)} ${r.caseKey.padEnd(18)}  无坐骑 ${r.noMount.toFixed(1).padStart(6)}%  →  火焰驹 ${r.fireSteed.toFixed(1).padStart(6)}%   Δ${r.delta.toFixed(1)}pp`)
}
const deltaAll = results.d.map((r) => r.delta)
const avgDelta = deltaAll.reduce((n, x) => n + x, 0) / deltaAll.length
// 饱和场景（无坐骑胜率 <20% 或 >80%）下 Δ≈0 是统计预期（胜负已定），只审查有区分度场景（20%–80%）
const unsatDeltas = results.d.filter((r) => r.noMount >= 20 && r.noMount <= 80).map((r) => r.delta)
const minUnsat = unsatDeltas.length > 0 ? Math.min(...unsatDeltas) : null
const perceptible = minUnsat === null ? true : minUnsat > 0
console.log(
  `  火焰驹平均收益 Δ${avgDelta.toFixed(1)}pp（有区分度场景最小 Δ${minUnsat === null ? 'N/A' : minUnsat.toFixed(1)}pp）→ 坐骑收益${perceptible ? '可感知（有区分度场景全部 > 0）' : '在有区分度场景出现 ≤0，需审查'}`,
)

// ---- 异常汇总与退出码 ----
const flagged = [
  ...results.a.filter((r) => r.flag).map((r) => `A: ${r.prof} 火焰驹 Lv2 vs Lv5 胜率 ${r.fireSteed.toFixed(1)}% — ${r.flag}`),
  ...results.b.filter((r) => r.flag).map((r) => `B: ${r.prof} 火焰驹 2v2 胜率 ${r.fireSteed.toFixed(1)}% — ${r.flag}`),
  ...results.c.filter((r) => r.flag).map((r) => `C: ${r.prof} 3v3 胜率 ${r.winRate.toFixed(1)}% — ${r.flag}`),
]
console.log('\n' + '='.repeat(100))
if (flagged.length > 0) {
  console.log(`发现 ${flagged.length} 个显著异常：`)
  for (const f of flagged) console.log(`  - ${f}`)
} else {
  console.log('未发现显著异常。')
}
console.log(`退出码：${flagged.length > 0 ? 1 : 0}（非 0 = 存在显著异常）`)

// ---- 写入报告文件 ----
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORT_PATH = join(__dirname, 'P2_007_BALANCE_REPORT.md')
const now = new Date().toISOString()
const lines = []
lines.push('# TM-P2-007 §53 Balance Regression 报告（Party Combat V5 3v3）')
lines.push('')
lines.push(`> 生成时间：${now} ｜ Node ${process.version} ｜ 每 pairing 模拟 **${N}** 次 ｜ 种子 **${BASE_SEED}**`)
lines.push('> 全部结算调用 `src/game/rules/partyCombat.ts` + `src/game/rules/combat.ts` 正式纯函数；骰面由 mulberry32 seeded PRNG 生成，可复现。')
lines.push('')
lines.push('## 0. 显著异常判定标准')
lines.push('')
lines.push('只对「等量遭遇」（我方人数 = 敌人数）严格判定；人数不等场景低/高胜率均为数量预期，不判定。')
lines.push('')
lines.push('| 场景 | 判定 | 含义 |')
lines.push('| --- | --- | --- |')
lines.push('| 同级单挑 | 胜率 < 55% | FLAG_WEAK：同级 1v1 打不过（P2-006 阈值沿用） |')
lines.push('| 同级团队遭遇 | 胜率 < 45% | FLAG_WEAK：同级等量团队遭遇打不过（五五开为设计预期，second dummy 为占位弱伙伴） |')
lines.push('| 同级等量 | 胜率 > 95% | FLAG_TRIVIAL：同级等量无压力 |')
lines.push('| 跨级等量（玩家 < 敌人，差 ≥ 2） | 胜率 > 90% | FLAG_OVERPOWER：低等级碾压高等级（平衡倒挂） |')
lines.push('| 高级等量 | 胜率 < 60% | FLAG_BAD：高级反而被同级反杀 |')
lines.push('')
lines.push(`## 1. Scenario A：Lv2 LUCK-heavy solo vs Lv5 骷髅战士×1（跨级 3）`)
lines.push('')
lines.push('| 职业 | 无坐骑胜率% | 火焰驹胜率% | Δpp | 异常 |')
lines.push('| --- | --- | --- | --- | --- |')
for (const r of results.a) {
  lines.push(`| ${r.prof} | ${r.noMount.toFixed(1)} | ${r.fireSteed.toFixed(1)} | ${r.delta.toFixed(1)} | ${r.flag ?? '—'} |`)
}
lines.push('')
lines.push(`## 2. Scenario B：Lv2 LUCK-heavy + Sakura vs 2×Lv2 腐化狼（2v2 同级）`)
lines.push('')
lines.push('| 职业 | 无坐骑胜率% | 火焰驹胜率% | Δpp | 异常 |')
lines.push('| --- | --- | --- | --- | --- |')
for (const r of results.b) {
  lines.push(`| ${r.prof} | ${r.noMount.toFixed(1)} | ${r.fireSteed.toFixed(1)} | ${r.delta.toFixed(1)} | ${r.flag ?? '—'} |`)
}
lines.push('')
lines.push(`## 3. Scenario C：3 friendly vs 3 enemy（Lv3 combat + Sakura + dummy vs 3×Lv3 骷髅士兵）`)
lines.push('')
lines.push('| 职业 | 胜率% | 失败率% | 平均回合(胜) | 异常 |')
lines.push('| --- | --- | --- | --- | --- |')
for (const r of results.c) {
  lines.push(`| ${r.prof} | ${r.winRate.toFixed(1)} | ${r.lossRate.toFixed(1)} | ${r.avgRounds.toFixed(1)} | ${r.flag ?? '—'} |`)
}
lines.push('')
lines.push('> 关键验证点：3v3 同级团队遭遇应在合理区间（约 45%–75%）。')
lines.push('')
lines.push(`## 4. Scenario D：Fire Steed vs No Mount 收益可感知性（Lv3 combat build）`)
lines.push('')
lines.push('| 职业 | 对手 | 无坐骑胜率% | 火焰驹胜率% | Δpp |')
lines.push('| --- | --- | --- | --- | --- |')
for (const r of results.d) {
  lines.push(`| ${r.prof} | ${r.caseKey} | ${r.noMount.toFixed(1)} | ${r.fireSteed.toFixed(1)} | ${r.delta.toFixed(1)} |`)
}
lines.push('')
lines.push(`> 火焰驹平均收益 Δ${avgDelta.toFixed(1)}pp（有区分度场景最小 Δ${minUnsat === null ? 'N/A' : minUnsat.toFixed(1)}pp）→ ${perceptible ? '可感知且不造成倒挂' : '有区分度场景存在 ≤0'}。饱和场景（无坐骑胜率 <20% 或 >80%）Δ≈0 为统计预期，不计入判定。`)
lines.push('')
lines.push('## 5. 显著异常汇总')
lines.push('')
if (flagged.length > 0) {
  for (const f of flagged) lines.push(`- ${f}`)
} else {
  lines.push('未发现显著异常。')
}
lines.push('')
lines.push('## 6. 方法说明与简化假设')
lines.push('')
lines.push('- Lv2 LUCK-heavy / Lv3 combat build、初始装备（铁剑 +2 / 旅行布衣 +1）；升级成长按 progression（+2 HP/+1 MP）。')
lines.push('- 玩家每回合优先职业技能（MP 足够且未被每场一次限制）；伙伴 Sakura 只使用花刃（sakura_petalslash，MP1 单体伤害）；测试伙伴普攻。')
lines.push('- 我方/敌方行动按 partyCombat 先手队列回合制：D20+AGI 降序 → 敏捷 → friendly → 稳定序；死亡单位跳过；环状推进（didTurnLoop 计回合）。')
lines.push('- 敌方 AI V1：chooseEnemyTarget 随机存活我方目标。')
lines.push('- 命中/护甲/暴击/大失败/擦伤全部走 resolveAttack 正式纯函数。')
lines.push('- Sakura 魔法盾 / 樱花轻舞、战士压制猛击取消反击为支持技/单敌效应，3v3 确定性模拟从略；敌人无技能。')
lines.push('- 坐骑加成按 P2-007 §20：先叠加有效五维再派生战斗数值（与 CombatPage / PlayerSidebar 一致）。')
lines.push('- 3v3 的 second dummy companion 为任务卡 §53 占位伙伴（基础属性、无技能），不代表最终第二伙伴数值。')

writeFileSync(REPORT_PATH, lines.join('\n') + '\n', 'utf8')
console.log(`\n报告已写入：${REPORT_PATH}`)

process.exit(flagged.length > 0 ? 1 : 0)
