/**
 * qa/p2-006-balance.mjs —— TM-P2-006 数值平衡 Monte Carlo 模拟器（seeded、确定性、可复现）。
 *
 * 运行方式（Node 22.15+ / 23.6+ 均可；本仓库 Node 24 已验证）：
 *   node qa/p2-006-balance.mjs
 * 可选参数：
 *   --n 10000        每 pairing 模拟次数（默认 10000，任务卡下限）
 *   --seed 20250206  全局 PRNG 种子（默认 20250206；每个 pairing 用 独立派生种子）
 *   --potion         启用玩家药水策略（默认关闭：药水为配置项）
 *
 * 技术要点：
 *  - src 为 TypeScript + ESM：本脚本顶部用 node:module 的 registerHooks 注册 resolve hook，
 *    把省略扩展名的相对导入补成 .ts（combat.ts 内部 `import './d20'` 依赖此 hook），
 *    并通过动态 import 加载正式纯函数模块（Node 24 默认启用 type stripping）。
 *  - 禁止自写简化公式：命中/护甲/先手/玩家一击结算全部调用 src/game/rules/combat.ts
 *    的 resolveAttack / resolveInitiative / resolvePlayerStrike / getCombatPhaseAfterEnemyAttack；
 *    技能 rawDamage 调用 src/game/rules/skill.ts 的 resolveSkillRawDamage（与 CombatPage 正式入口一致）。
 *  - 骰面由 mulberry32 seeded PRNG 生成（1–20），绝不调用随机函数 rollD20。
 *
 * 战斗编排（与 src/pages/CombatPage.tsx 正式流程一致）：
 *  先手 resolveInitiative（敌人先手则先攻击一次）→ 玩家回合（技能优先于普攻；药水可选）
 *  → resolvePlayerStrike（击杀即胜利）→ 压制技能命中/暴击取消反击（CombatPage 258 行语义）
 *  → 敌人反击 resolveAttack → getCombatPhaseAfterEnemyAttack 判 defeat → 循环至一方 HP<=0。
 *
 * 输出：
 *  - 控制台：Before 胜率矩阵 + 强制用例 + 装备对照 + 期望伤害；显著异常标记。
 *  - 文件：qa/P2_006_BALANCE_REPORT.md（Before 表）。
 *  - 退出码：0 = 无显著异常；1 = 存在显著异常（判定标准见报告）。
 */
import { registerHooks } from 'node:module'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  mulberry32,
  d20From,
  PROFESSION_IDS,
  DEFAULT_SKILL_IDS,
  BUILDS,
  EQUIPMENT_PLAN,
  REPRESENTATIVE_ENEMIES,
  derivePlayer,
  deriveEnemy,
  expectedDamagePerStrike,
} from './balance-utils.mjs'

// ---- TS 扩展名 resolve hook（必须在任何 .ts 动态 import 之前注册）----
registerHooks({
  resolve(specifier, context, nextResolve) {
    // 相对路径且无扩展名 → 尝试补 .ts（combat.ts 内部 `from './d20'` 依赖）
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context)
      } catch {
        /* 补扩展名失败则按原样解析 */
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
const N = Number(argVal('--n', 10000))
const BASE_SEED = Number(argVal('--seed', 20250206)) >>> 0
const USE_POTION = argv.includes('--potion')
const PHASE = argv.includes('--phase') ? argv[argv.indexOf('--phase') + 1] : 'after'
if (!['before', 'after'].includes(PHASE)) {
  console.error('参数 --phase 必须为 before 或 after')
  process.exit(2)
}
if (!Number.isInteger(N) || N < 1) {
  console.error('参数 --n 必须为正整数')
  process.exit(2)
}

// ---- 动态加载正式纯函数模块（registerHooks 之后）----
const rules = await import('../src/game/rules/combat.ts')
const skillRules = await import('../src/game/rules/skill.ts')
const charRules = await import('../src/game/rules/character.ts')
const { ENEMIES } = await import('../src/game/content/enemies.ts')

/**
 * Before 表（调参前）敌人 attackPower 硬编码快照（TM-P2-006 审计 §8.1 的调参前数值）。
 * 当前 enemies.ts 已写入 After 数值，--phase before 必须用此表还原调参前数据，
 * 否则「Before 报告」会错误地使用 After 数据（审计 §5：Before 应检出 48 个显著异常，退出码 1）。
 */
const BEFORE_ENEMY_ATTACK = {
  corrupted_rabbit: 2,
  corrupted_rat: 2,
  corrupted_wolf: 3,
  dudu_rabbit: 4,
  skeleton_soldier: 3,
  skeleton_captain: 4,
  tower_zombie: 4,
  black_mage: 4,
  skeleton_warrior: 4,
  skeleton_witch: 5,
  black_mane_wolf: 3,
  sakura_calamity_fragment: 3,
}

/** 按阶段取敌人定义：before 阶段覆盖 attackPower 为调参前快照，after 阶段直接用注册表 */
function enemyFor(id) {
  const def = ENEMIES[id]
  if (!def) return undefined
  if (PHASE === 'before' && BEFORE_ENEMY_ATTACK[id] !== undefined) {
    return { ...def, attackPower: BEFORE_ENEMY_ATTACK[id] }
  }
  return def
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPORT_PATH = join(__dirname, 'P2_006_BALANCE_REPORT.md')

// ---- 显著异常判定标准（写入报告）----
// 同级（玩家等级 == 敌人等级）：胜率 < 55% → 玩家同级打不过（成长曲线断裂）；> 95% → 同级无压力。
// 跨级（玩家等级 < 敌人等级）且等级差 >= 2：胜率 > 90% → 低等级碾压高等级（平衡倒挂）。
// 高级打低级（玩家等级 > 敌人等级）：胜率 < 60% → 高级被低级反杀。
function flagFor(pair, winRate) {
  const { playerLevel, enemyLevel } = pair
  if (playerLevel === enemyLevel) {
    if (winRate < 55) return 'FLAG_WEAK(同级<55%)'
    if (winRate > 95) return 'FLAG_TRIVIAL(同级>95%)'
  } else if (playerLevel < enemyLevel) {
    if (enemyLevel - playerLevel >= 2 && winRate > 90) return 'FLAG_OVERPOWER(跨级>90%)'
  } else if (winRate < 60) {
    return 'FLAG_BAD(高级<60%)'
  }
  return null
}

// ---- 单场战斗模拟（正式编排；确定性：所有随机来自传入 rng）----
function simulateBattle(player, enemy, rng, opts) {
  const useSkill = opts.useSkill !== false
  const usePotion = opts.usePotion === true
  const potionThreshold = opts.potionThreshold ?? 0.4
  let pHp = player.hp
  let eHp = enemy.hp
  let mp = player.mp
  let usedOnceSkill = false
  let potionsLeft = 2 // 初始治疗药水 ×2（任务卡初始装备）
  let rounds = 0
  let playerActions = 0
  let potionsUsed = 0

  // 先手（V3：双方 D20+AGI；平局 AGI 高者先；仍同则玩家先）
  const winner = rules.resolveInitiative(player.agi, enemy.agi, d20From(rng), d20From(rng))
  if (winner === 'enemy') {
    // 敌人先手：先攻击一次（CombatPage 148–159 行语义）
    const first = rules.resolveAttack(d20From(rng), enemy.agi, player.agi, enemy.attack, player.armor)
    if (first.hit && first.damage > 0) pHp = Math.max(0, pHp - first.damage)
    if (pHp === 0) {
      return { victory: false, rounds, playerActions, playerHpLeft: 0, enemyHpLeft: eHp, potionsUsed }
    }
  }

  while (pHp > 0 && eHp > 0) {
    rounds += 1
    // 药水策略（配置项，默认关闭）：HP <= 阈值且有药水 → 用药替代本回合攻击
    if (usePotion && potionsLeft > 0 && pHp <= Math.ceil(player.hp * potionThreshold)) {
      pHp = Math.min(player.hp, pHp + 8) // healing_potion healAmount=8
      potionsLeft -= 1
      potionsUsed += 1
    } else {
      // 玩家行动：最优技能（MP 足够且未被每场一次限制）优先于普攻
      let action = 'basic'
      let raw = player.attack
      const skillUsable =
        useSkill && mp >= player.skillMpCost && (!player.skillOncePerCombat || !usedOnceSkill)
      if (skillUsable) {
        raw = player.skillRawDamage
        mp -= player.skillMpCost
        usedOnceSkill = true
        action = 'skill'
      }
      playerActions += 1
      const atk = rules.resolveAttack(d20From(rng), player.agi, enemy.agi, raw, enemy.armor)
      const strike = rules.resolvePlayerStrike(eHp, atk)
      eHp = strike.enemyHp
      if (strike.phase === 'victory') {
        return { victory: true, rounds, playerActions, playerHpLeft: pHp, enemyHpLeft: 0, potionsUsed }
      }
      // 压制技能：正常命中/暴击取消本次反击（CombatPage 258–262 行语义）；擦伤不压制
      const suppressed =
        action === 'skill' && player.skillSuppressOnFullHit && (atk.outcome === 'hit' || atk.outcome === 'critical_hit')
      if (suppressed) continue
    }
    // 敌人反击
    const eAtk = rules.resolveAttack(d20From(rng), enemy.agi, player.agi, enemy.attack, player.armor)
    if (eAtk.hit && eAtk.damage > 0) pHp = Math.max(0, pHp - eAtk.damage)
    if (pHp === 0) {
      return { victory: false, rounds, playerActions, playerHpLeft: 0, enemyHpLeft: eHp, potionsUsed }
    }
  }
  // 循环终止时一方 HP<=0（理论不会走到：击杀路径已提前 return）
  return { victory: eHp <= 0, rounds, playerActions, playerHpLeft: pHp, enemyHpLeft: eHp, potionsUsed }
}

// ---- 单个 pairing 的 Monte Carlo 统计 ----
function runPairing(seed, player, enemy, opts) {
  const rng = mulberry32(seed)
  let wins = 0
  let losses = 0
  let roundsSum = 0
  let roundsAllSum = 0
  let winHpSum = 0
  let lossEnemyHpSum = 0
  for (let i = 0; i < N; i += 1) {
    const r = simulateBattle(player, enemy, rng, opts)
    roundsAllSum += r.rounds
    if (r.victory) {
      wins += 1
      roundsSum += r.rounds
      winHpSum += r.playerHpLeft
    } else {
      losses += 1
      lossEnemyHpSum += r.enemyHpLeft
    }
  }
  const winRate = (wins / N) * 100
  const lossRate = (losses / N) * 100
  return {
    winRate,
    lossRate,
    avgRounds: wins > 0 ? roundsSum / wins : 0,
    avgRoundsAll: roundsAllSum / N,
    avgWinHpLeft: wins > 0 ? winHpSum / wins : 0,
    avgLossEnemyHpLeft: losses > 0 ? lossEnemyHpSum / losses : 0,
  }
}

const START = EQUIPMENT_PLAN.starter
const pairLabel = (prof, level, kind, equipKey) =>
  `${prof} Lv${level}${kind !== 'combat' ? `(${kind})` : ''}${equipKey === 'buyable' ? '[可购防具]' : ''}`

// ---- 期望伤害辅助（对代表敌人的普攻/技能期望；遍历全部骰面 = 解析期望，非抽样）----
function expectedTable() {
  const rows = []
  for (const prof of PROFESSION_IDS) {
    for (const level of [1, 3, 5]) {
      const player = derivePlayer(rules, charRules, skillRules, prof, BUILDS[prof].combat, level, START)
      for (const rep of REPRESENTATIVE_ENEMIES) {
        const enemy = deriveEnemy(enemyFor(rep.id))
        const basic = expectedDamagePerStrike(rules, player.agi, enemy.agi, player.attack, enemy.armor)
        const skill = expectedDamagePerStrike(rules, player.agi, enemy.agi, player.skillRawDamage, enemy.armor)
        const enemyHit = expectedDamagePerStrike(rules, enemy.agi, player.agi, enemy.attack, player.armor)
        rows.push({
          prof,
          level,
          enemy: enemy.name,
          basic: basic.toFixed(2),
          skill: skill.toFixed(2),
          enemyHit: enemyHit.toFixed(2),
          strikes: Math.ceil(enemy.hp / (skill > basic ? skill : basic)),
        })
      }
    }
  }
  return rows
}

// ---- 主流程 ----
console.log(`TM-P2-006 数值平衡 Monte Carlo 模拟器（${PHASE} 表）`)
console.log(`运行环境: Node ${process.version} | 每 pairing 模拟 ${N} 次 | 种子 ${BASE_SEED} | 药水策略: ${USE_POTION ? '启用' : '关闭'}`)
console.log('='.repeat(100))

// 1) 主矩阵：四职业 × Lv1–5（战斗向 build，初始装备）vs 5 个代表敌人
const matrix = []
let seedCounter = 0
for (const prof of PROFESSION_IDS) {
  for (let level = 1; level <= 5; level += 1) {
    for (const rep of REPRESENTATIVE_ENEMIES) {
      const player = derivePlayer(rules, charRules, skillRules, prof, BUILDS[prof].combat, level, START)
      const enemy = deriveEnemy(enemyFor(rep.id))
      const stats = runPairing((BASE_SEED + seedCounter++) >>> 0, player, enemy, { usePotion: USE_POTION })
      const flag = flagFor({ playerLevel: level, enemyLevel: enemy.level }, stats.winRate)
      matrix.push({ prof, level, enemy: enemy.name, enemyLevel: enemy.level, ...stats, flag })
    }
  }
}

// 2) 强制用例：四职业 LUCK-heavy build Lv2 vs Lv5 skeleton_warrior（重点验证不碾压）
const forcedCases = []
for (const prof of PROFESSION_IDS) {
  const player = derivePlayer(rules, charRules, skillRules, prof, BUILDS[prof].luck, 2, START)
  const enemy = deriveEnemy(enemyFor('skeleton_warrior'))
  const stats = runPairing((BASE_SEED + seedCounter++) >>> 0, player, enemy, { usePotion: USE_POTION })
  const flag = flagFor({ playerLevel: 2, enemyLevel: 5 }, stats.winRate)
  forcedCases.push({ prof, ...stats, flag })
}

// 3) 装备对照：四职业 combat build，Lv3 vs skeleton_soldier、Lv5 vs skeleton_warrior（可购防具 vs 初始）
const equipCompare = []
for (const prof of PROFESSION_IDS) {
  for (const [level, enemyId] of [[3, 'skeleton_soldier'], [5, 'skeleton_warrior']]) {
    const pStarter = derivePlayer(rules, charRules, skillRules, prof, BUILDS[prof].combat, level, START)
    const pBuyable = derivePlayer(rules, charRules, skillRules, prof, BUILDS[prof].combat, level, EQUIPMENT_PLAN.buyable[prof])
    const enemy = deriveEnemy(enemyFor(enemyId))
    const s1 = runPairing((BASE_SEED + seedCounter++) >>> 0, pStarter, enemy, { usePotion: USE_POTION })
    const s2 = runPairing((BASE_SEED + seedCounter++) >>> 0, pBuyable, enemy, { usePotion: USE_POTION })
    equipCompare.push({
      prof,
      level,
      enemy: enemy.name,
      starter: s1.winRate,
      buyable: s2.winRate,
      delta: (s2.winRate - s1.winRate).toFixed(1),
      starterArmor: pStarter.armor,
      buyableArmor: pBuyable.armor,
    })
  }
}

// ---- 输出主矩阵到控制台 ----
console.log(`\n【${PHASE === 'before' ? 'Before' : 'After'} 胜率矩阵】四职业 × Lv1–5（战斗向 build，初始装备）vs 代表敌人（胜率% | 平均回合 | 胜均剩余HP）`)
for (const row of matrix) {
  const mark = row.flag ? `  <<< ${row.flag}` : ''
  console.log(
    `${row.prof.padEnd(7)} Lv${row.level} vs ${row.enemy.padEnd(6)}(Lv${row.enemyLevel})  ` +
      `胜率 ${row.winRate.toFixed(1).padStart(6)}%  回合 ${row.avgRounds.toFixed(1).padStart(4)}  ` +
      `胜余HP ${row.avgWinHpLeft.toFixed(1).padStart(5)}${mark}`,
  )
}

console.log('\n【强制用例】Lv2 LUCK-heavy build vs Lv5 骷髅战士（验证不碾压）')
for (const row of forcedCases) {
  const mark = row.flag ? `  <<< ${row.flag}` : ''
  console.log(
    `${row.prof.padEnd(7)} LUCK Lv2 vs 骷髅战士 胜率 ${row.winRate.toFixed(1).padStart(6)}%  回合 ${row.avgRounds.toFixed(1)}  胜余HP ${row.avgWinHpLeft.toFixed(1)}${mark}`,
  )
}

console.log('\n【装备对照】可购防具 vs 初始装备（胜率%）')
for (const row of equipCompare) {
  console.log(
    `${row.prof.padEnd(7)} Lv${row.level} vs ${row.enemy.padEnd(6)}  初始(甲${row.starterArmor}) ${row.starter.toFixed(1)}%  →  可购(甲${row.buyableArmor}) ${row.buyable.toFixed(1)}%   Δ${row.delta}pp`,
  )
}

// ---- 期望伤害表（审计辅助）----
const expected = expectedTable()
console.log('\n【期望伤害（解析期望：遍历 1–20 骰面 × resolveAttack）】技能 vs 普攻 vs 敌人每击（战斗向 build）')
for (const row of expected) {
  console.log(
    `${row.prof.padEnd(7)} Lv${row.level} vs ${row.enemy.padEnd(6)}  普攻 ${row.basic.padStart(5)}  技能 ${row.skill.padStart(5)}  敌人每击 ${row.enemyHit.padStart(5)}  期望击杀 ${row.strikes} 击`,
  )
}

// ---- 异常汇总与退出码 ----
const flagged = [
  ...matrix.filter((r) => r.flag).map((r) => `${pairLabel(r.prof, r.level, 'combat', 'starter')} vs ${r.enemy}(Lv${r.enemyLevel}): 胜率 ${r.winRate.toFixed(1)}% — ${r.flag}`),
  ...forcedCases.filter((r) => r.flag).map((r) => `${r.prof} LUCK Lv2 vs 骷髅战士: 胜率 ${r.winRate.toFixed(1)}% — ${r.flag}`),
]
console.log('\n' + '='.repeat(100))
const phaseTitle = PHASE === 'before' ? 'Before 表（调参前）' : 'After 表（调参后）'
if (flagged.length > 0) {
  console.log(`发现 ${flagged.length} 个显著异常（${phaseTitle}）：`)
  for (const f of flagged) console.log(`  - ${f}`)
} else {
  console.log(`未发现显著异常（${phaseTitle}：同级胜率 55%–95%、跨级 ≤90%、高级 ≥60%）。`)
}
console.log(`退出码：${flagged.length > 0 ? 1 : 0}（非 0 = 存在显著异常）`)

// ---- 写入报告文件 ----
const now = new Date().toISOString()
const REPORT_PATH_PHASED = join(__dirname, PHASE === 'before' ? 'P2_006_BALANCE_REPORT_BEFORE.md' : 'P2_006_BALANCE_REPORT_AFTER.md')
const lines = []
lines.push(`# P2-006 数值平衡审计报告（${phaseTitle}）`)
lines.push('')
lines.push(`> 生成时间：${now} ｜ Node ${process.version} ｜ 每 pairing 模拟 **${N}** 次 ｜ 种子 **${BASE_SEED}** ｜ 药水策略：${USE_POTION ? '启用' : '关闭（默认）'}`)
lines.push('> 全部结算调用 `src/game/rules/combat.ts` / `src/game/rules/skill.ts` 正式纯函数；骰面由 mulberry32 seeded PRNG 生成，可复现。')
lines.push('')
lines.push('## 0. 显著异常判定标准')
lines.push('')
lines.push('| 场景 | 判定 | 含义 |')
lines.push('| --- | --- | --- |')
lines.push('| 同级（玩家等级 == 敌人等级） | 胜率 < 55% | FLAG_WEAK：同级打不过，成长曲线断裂 |')
lines.push('| 同级 | 胜率 > 95% | FLAG_TRIVIAL：同级无压力，敌人存在感过低 |')
lines.push('| 跨级（玩家等级 < 敌人等级，差 ≥ 2） | 胜率 > 90% | FLAG_OVERPOWER：低等级碾压高等级（平衡倒挂） |')
lines.push('| 高级打低级（玩家等级 > 敌人等级） | 胜率 < 60% | FLAG_BAD：高级被低级反杀 |')
lines.push('| 任一命中 | 退出码 = 1 | 需主代理调数值 |')
lines.push('')
lines.push(`## 1. ${phaseTitle}胜率矩阵（四职业 × Lv1–5 战斗向 build，初始装备）`)
lines.push('')
lines.push('| 职业 | 玩家等级 | 敌人 | 敌人等级 | 胜率% | 失败率% | 平均回合(胜) | 平均回合(全) | 胜均剩余HP | 异常 |')
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const r of matrix) {
  lines.push(
    `| ${r.prof} | ${r.level} | ${r.enemy} | ${r.enemyLevel} | ${r.winRate.toFixed(1)} | ${r.lossRate.toFixed(1)} | ${r.avgRounds.toFixed(1)} | ${r.avgRoundsAll.toFixed(1)} | ${r.avgWinHpLeft.toFixed(1)} | ${r.flag ?? '—'} |`,
  )
}
lines.push('')
lines.push(`## 2. 强制用例：Lv2 LUCK-heavy build vs Lv5 骷髅战士（验证不能高胜率碾压）`)
lines.push('')
lines.push('| 职业 | build 属性(STR/CON/AGI/MND/LCK) | 胜率% | 失败率% | 平均回合(胜) | 胜均剩余HP | 异常 |')
lines.push('| --- | --- | --- | --- | --- | --- | --- |')
for (const prof of PROFESSION_IDS) {
  const a = BUILDS[prof].luck
  const row = forcedCases.find((r) => r.prof === prof)
  lines.push(
    `| ${prof} | ${a.str}/${a.con}/${a.agi}/${a.mnd}/${a.lck} | ${row.winRate.toFixed(1)} | ${row.lossRate.toFixed(1)} | ${row.avgRounds.toFixed(1)} | ${row.avgWinHpLeft.toFixed(1)} | ${row.flag ?? '—'} |`,
  )
}
lines.push('')
lines.push('## 3. 装备对照（可购防具 vs 初始装备，战斗向 build）')
lines.push('')
lines.push('| 职业 | 玩家等级 | 敌人 | 初始(甲)胜率% | 可购(甲)胜率% | Δpp |')
lines.push('| --- | --- | --- | --- | --- | --- |')
for (const r of equipCompare) {
  lines.push(
    `| ${r.prof} | ${r.level} | ${r.enemy} | ${r.starter.toFixed(1)} (甲${r.starterArmor}) | ${r.buyable.toFixed(1)} (甲${r.buyableArmor}) | ${r.delta} |`,
  )
}
lines.push('')
lines.push('## 4. 期望伤害（解析期望：遍历骰面 1–20 × resolveAttack；战斗向 build，初始装备）')
lines.push('')
lines.push('| 职业 | 等级 | 敌人 | 普攻期望 | 技能期望 | 敌人每击期望 | 期望击杀 |')
lines.push('| --- | --- | --- | --- | --- | --- | --- |')
for (const r of expected) {
  lines.push(`| ${r.prof} | ${r.level} | ${r.enemy} | ${r.basic} | ${r.skill} | ${r.enemyHit} | ${r.strikes} 击 |`)
}
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
lines.push('- 玩家行动策略：每回合优先使用职业技能（MP 足够且未被「每场一次」限制），MP 耗尽后普攻；游侠迅捷突袭 MP0、每场一次，首回合使用。')
lines.push('- 战士压制猛击按 CombatPage 正式语义实现：技能正常命中/暴击时取消本次敌人反击（擦伤不压制）。')
lines.push('- 药水为配置项，默认不使用；`--potion` 启用（HP ≤ 40% 且余药 > 0 时用药替代攻击，每场最多 2 瓶，每瓶恢复 8）。')
lines.push('- 等级成长按 `progression.ts`：升级 +2 maxHp / +1 maxMp；攻击/护甲/敏捷按 `combat.ts` V3 正式公式。')
lines.push('- 技能 rawDamage 用 `resolveSkillRawDamage`（含法师法术的等级加成 `+floor((level-1)/2)`，与正式结算一致）。')
lines.push('- 先手、命中、护甲、暴击/大失败、擦伤全部走 `resolveAttack` / `resolveInitiative` / `resolvePlayerStrike` 正式纯函数。')
lines.push('- 未模拟伙伴（樱花优子）助战与任务外增益；敌人无技能（注册表全部普通攻击）。')

writeFileSync(REPORT_PATH_PHASED, lines.join('\n') + '\n', 'utf8')
console.log(`\n报告已写入：${REPORT_PATH_PHASED}`)

process.exit(flagged.length > 0 ? 1 : 0)
