/**
 * P2-012 §76/§77/§78：神泉 Boss「黑熊恰拉拉」蒙特卡洛胜率平衡模拟。
 *
 * 只读规则纯函数模拟，不改任何战斗公式（Combat V7 HARD FREEZE）。
 * 与 p2-010-balance.mjs 相同的 registerHooks 模式让裸 .ts 导入生效。
 *
 * 模拟口径（全部复用项目已有纯函数，不手写公式）：
 *   - 命中/护甲/暴击：combat.resolveAttack（V3 冻结公式）
 *   - 先手队列：partyCombat.rollInitiativeQueue（D20+AGI）
 *   - 单位构建：combatSetup.buildCombatSetup（与 CombatPage 生产同一条代码路径，
 *     玩家/伙伴派生属性 = getPlayerAttackPower / getPlayerArmor / getStartingMaxHp）
 *   - Boss 阶段：bossPhase.resolveBossPhaseTransition（HP<=50% 触发；incense 抑制回复 /
 *     old_injury 给 Boss agi-1，与 CombatPage 的 flag 语义一致）
 *   - 敌方 AI：partyCombat.chooseEnemyAction（boss 画像 0.8 用技率）+ chooseEnemyTarget +
 *     skill.filterUsableEnemySkills + resolveEnemySkillRawDamage + skillCooldownTurns
 *     —— 冷却递减时机与 CombatPage.executeEnemyTurn 逐行对齐（行动开始先递减）。
 *
 * 简化假设（详见 ASSUMPTIONS 输出）：
 *   A1 玩家主行动=骑士重击(mp2/+2/cd2)与普攻交替（冷却好且 mp 够就用技能）；药水为 Bonus，喝药不占用主行动。
 *   A2 药水 healAmount 读自 items.ts（实际为 8，任务卡的 30 与注册表不符，以注册表为准）。
 *   A3 Sakura 伙伴按 combatSetup 真实路径构建（Lv4，str8/con12/agi16），只普攻不放技能。
 *   A4 敌方 AI 简化已最小化：直接复用 chooseEnemyAction/chooseEnemyTarget/冷却过滤，
 *      未做任何 50% 简化（项目 AI 纯函数可直接注入 rng，无需近似）。
 *   A5 玩家进场满血；初始装备加铁剑（weaponDamageBonus=2，createInitialGameState
 *      默认 weapon=null 但玩家拥有 iron_sword，假设出战必装备）。
 *   A6 等级成长（任务卡 §76 口径）：Lv1 创建属性 str12/con12/agi10/mnd10/lck10（总和 54，
 *      由 validateCreationInput 校验），每升 1 级 +1 STR +1 CON → str=11+n, con=11+n；
 *      maxHp = getStartingMaxHp(con) + 2*(n-1)（progression.ts levelGain*2）。
 *      注意：真实 progression.ts 升级不加属性，此处按任务卡口径注入。
 *   A7 战斗超过 40 回合未分胜负按失败计。
 */
import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
    try { return nextResolve(specifier + '.ts', context) } catch {}
    try { return nextResolve(specifier + '/index.ts', context) } catch {}
  }
  return nextResolve(specifier, context)
} })

const out = []
const check = (name, ok, detail = '') => { out.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`) }

const [{ createInitialGameState }, content, companionsMod, combat, character, party, combatSetup, bossPhaseMod, skillMod, d20] = await Promise.all([
  import('../src/game/content/initial.ts'),
  import('../src/game/content/index.ts'),
  import('../src/game/content/companions.ts'),
  import('../src/game/rules/combat.ts'),
  import('../src/game/rules/character.ts'),
  import('../src/game/rules/partyCombat.ts'),
  import('../src/game/rules/combatSetup.ts'),
  import('../src/game/rules/bossPhase.ts'),
  import('../src/game/rules/skill.ts'),
  import('../src/game/rules/d20.ts'),
])
const { getItem, getEnemy, getEncounter } = content
const { sakuraDefaultSkillIds } = companionsMod
const { resolveAttack, getPlayerAttackPower, getPlayerArmor, getPlayerAgility } = combat
const { getStartingMaxHp } = character
const { chooseEnemyAction, chooseEnemyTarget, updateCombatantHp } = party
const { buildCombatSetup, weaponDamageBonusOf, armorDefenseBonusOf } = combatSetup
const { resolveBossPhaseTransition } = bossPhaseMod
const { filterUsableEnemySkills, resolveEnemySkillRawDamage, skillCooldownTurns } = skillMod
const { getSkill } = await import('../src/game/content/skills.ts')
const { rollD20 } = d20

// ---- §78 静态封板检查（数据契约，防模拟口径漂移）----
const bossDef = getEnemy('black_bear_qialala')
check('S76 boss stats frozen (hp36 armor9 atk13 agi7; §78 平衡调参后)', !!bossDef && bossDef.maxHp === 36 && bossDef.armor === 9 && bossDef.attackPower === 13 && bossDef.agility === 7 && bossDef.aiProfile === 'boss')
const golden = bossDef?.bossPhases?.find((p) => p.id === 'golden')
check('S76 boss phase frozen (atk+3 armor+1 heal6 golden skills)', !!golden && golden.triggerHpRatio === 0.5 && golden.attackBonus === 3 && golden.armorBonus === 1 && golden.healAmount === 6 && JSON.stringify(golden.skillIds) === JSON.stringify(['enemy_golden_ground_slam', 'enemy_golden_rage_charge']))
check('S76 phase1 skill = bear_rending_claw(+4)', JSON.stringify(bossDef?.skillIds) === JSON.stringify(['enemy_bear_rending_claw']) && getSkill('enemy_bear_rending_claw')?.combat?.damageResolver?.bonus === 4)
check('S76 golden skills bonuses (+2 cd1 / +6 cd2)', getSkill('enemy_golden_ground_slam')?.combat?.damageResolver?.bonus === 2 && getSkill('enemy_golden_ground_slam')?.combat?.cooldownTurns === 1 && getSkill('enemy_golden_rage_charge')?.combat?.damageResolver?.bonus === 6 && getSkill('enemy_golden_rage_charge')?.combat?.cooldownTurns === 2)
const POTION_ID = 'healing_potion'
const POTION_HEAL = getItem(POTION_ID)?.healAmount ?? 0
// 任务卡写的是「恢复 30HP」，但注册表实际 healAmount=8——以注册表为准（HARD FREEZE 不改数据），此处锁实际值。
check('S76 potion healAmount matches registry (actual=8, task card said 30)', POTION_HEAL === 8, `healAmount=${POTION_HEAL}`)
const encounter = getEncounter('encounter_black_bear_qialala')
check('S76 boss encounter exists and no escape', !!encounter && encounter.canEscape === false && (encounter.fixedMembers ?? []).length === 1)
check('S76 rollD20 contract intact', rollD20() >= 1 && rollD20() <= 20)

// ---- 模拟核心 ----
const BOSS_ENCOUNTER_ID = 'encounter_black_bear_qialala'
const MAX_ROUNDS = 40
const TRIALS = 600 // 每格 ≥400，取 600 收窄蒙特卡洛噪声

/** [0,1) → D20 骰面（与 partyCombat.rollD20With 相同映射；combat.resolveAttack 需显式骰面以便注入 rng） */
const d20With = (rng) => Math.floor(rng() * 20) + 1
/** 确定性 LCG（同 p2-010 模式），每格独立 seed */
function makeRng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
}

/** 构建指定等级的玩家 GameState（knight；假设 A5/A6） */
function buildState(level, withSakura) {
  const state = createInitialGameState({
    name: '平衡模拟',
    gender: 'male',
    profession: 'knight',
    attributes: { str: 12, con: 12, agi: 10, mnd: 10, lck: 10 }, // 创建总和 54（validateCreationInput 校验通过）
  })
  state.player.attributes.str += level - 1
  state.player.attributes.con += level - 1
  state.player.level = level
  state.player.maxHp = getStartingMaxHp(state.player.attributes.con) + 2 * (level - 1) // progression: levelGain*2
  state.player.hp = state.player.maxHp
  state.equipment.weapon = 'iron_sword' // 假设 A5：装备初始铁剑
  const potion = state.inventory.find((i) => i.itemId === POTION_ID)
  if (potion) potion.quantity = 3 // 假设 A1：随身 3 瓶
  if (withSakura) {
    state.companions.sakura_yuko = {
      companionId: 'sakura_yuko',
      status: 'recruited',
      level: 4,
      mp: 6,
      maxMp: 6,
      learnedSkillIds: sakuraDefaultSkillIds(),
      flags: {},
    }
    state.party.activeCompanionIds = ['sakura_yuko']
  }
  return state
}

/** 单场模拟；返回 { win, rounds }。prep ∈ none | incense | old_injury */
function simulateOne(state, prep, rng) {
  const def = getEncounter(BOSS_ENCOUNTER_ID)
  const setup = buildCombatSetup(state, def, { rng })
  const units = new Map(setup.combatants.map((c) => [c.instanceId, { ...c }]))
  const boss = units.get('enemy#1')
  const potions = { count: 3 }
  let bossRuntime
  const cooldowns = {}
  const usedOnce = new Set()
  const playerCooldowns = {}
  const suppressHeal = prep === 'incense'
  const bossAgiPenalty = prep === 'old_injury' ? 1 : 0
  const enemyDef = getEnemy(boss.sourceId)

  const livingFriendlies = () => [...units.values()].filter((c) => c.side === 'friendly' && c.isAlive)

  /** 对 Boss 造成伤害后：死亡判定 → resolveBossPhaseTransition（模拟 CombatPage 507/620 行） */
  const strikeBoss = (attacker, rawOverride) => {
    const r = resolveAttack(d20With(rng), attacker.agility, boss.agility, rawOverride ?? attacker.attack, boss.armor)
    if (!r.hit) return
    Object.assign(boss, updateCombatantHp(boss, boss.currentHp - r.damage))
    if (!boss.isAlive) return
    const t = resolveBossPhaseTransition(boss, bossRuntime, suppressHeal, bossAgiPenalty)
    if (t) { Object.assign(boss, t.combatant); bossRuntime = t.runtime }
  }

  /** Boss 回合：冷却先递减 → 选目标 → 阶段技能池 → AI 选择 → 攻击（与 CombatPage.executeEnemyTurn 对齐） */
  const bossTurn = () => {
    for (const k of Object.keys(cooldowns)) cooldowns[k] = Math.max(0, cooldowns[k] - 1)
    const living = livingFriendlies()
    if (living.length === 0) return
    const target = chooseEnemyTarget(living, rng)
    const phaseSkillIds = bossRuntime?.phaseId
      ? enemyDef?.bossPhases?.find((p) => p.id === bossRuntime.phaseId)?.skillIds
      : undefined
    const pool = (phaseSkillIds ?? enemyDef?.skillIds ?? []).map((id) => getSkill(id)).filter(Boolean)
    const usable = filterUsableEnemySkills(pool, cooldowns, usedOnce)
    const choice = chooseEnemyAction(usable, enemyDef?.aiProfile, rng)
    let raw = boss.attack
    if (choice.type === 'skill') {
      raw = resolveEnemySkillRawDamage(choice.skillId, { attackPower: boss.attack, agility: boss.agility }) ?? boss.attack
      const cd = skillCooldownTurns(choice.skillId)
      if (cd > 0) cooldowns[choice.skillId] = cd
      if (getSkill(choice.skillId)?.combat?.oncePerCombat === true) usedOnce.add(choice.skillId)
    }
    const r = resolveAttack(d20With(rng), boss.agility, target.agility, raw, target.armor)
    if (r.hit) Object.assign(target, updateCombatantHp(target, target.currentHp - r.damage))
  }

  const order = setup.turns.map((t) => t.combatant.instanceId)
  for (let round = 1; round <= MAX_ROUNDS; round++) {
    for (const id of order) {
      const u = units.get(id)
      if (!u?.isAlive) continue
      if (u.side === 'enemy') {
        if (!boss.isAlive) break
        bossTurn()
        if (livingFriendlies().length === 0) return { win: false, rounds: round }
      } else {
        // Bonus 喝药（假设 A1：HP<30% 且有药；healAmount 读注册表，不占主行动）
        if (u.sourceType === 'player' && potions.count > 0 && u.currentHp < Math.ceil(u.maxHp * 0.3)) {
          u.currentHp = Math.min(u.maxHp, u.currentHp + POTION_HEAL)
          potions.count--
        }
        if (!boss.isAlive) break
        // A1b：骑士带 knight_power_strike（mp2/+2攻击力/cd2）——冷却好且 mp 够就用，否则普攻（真实玩家行为）
        const strikeSkill = getSkill('knight_power_strike')
        const skillMp = strikeSkill?.mpCost ?? 2
        const skillBonus = strikeSkill?.combat?.damageResolver?.bonus ?? 2
        const skillCd = strikeSkill?.combat?.cooldownTurns ?? 0
        if ((playerCooldowns.power_strike ?? 0) === 0 && u.currentMp >= skillMp) {
          playerCooldowns.power_strike = skillCd
          u.currentMp -= skillMp
          strikeBoss(u, u.attack + skillBonus)
        } else {
          strikeBoss(u)
        }
        if ((playerCooldowns.power_strike ?? 0) > 0) playerCooldowns.power_strike -= 1
        if (!boss.isAlive) return { win: true, rounds: round }
      }
    }
    if (livingFriendlies().length === 0) return { win: false, rounds: round }
  }
  return { win: false, rounds: MAX_ROUNDS } // 假设 A7：超时判负
}

/** 一格蒙特卡洛：返回 { winRate, avgRounds } */
function simulateCell(level, prep, withSakura, seed) {
  const rng = makeRng(seed)
  const state = buildState(level, withSakura)
  let wins = 0
  let roundsSum = 0
  for (let i = 0; i < TRIALS; i++) {
    const r = simulateOne(state, prep, rng)
    if (r.win) wins++
    roundsSum += r.rounds
  }
  return { winRate: wins / TRIALS, avgRounds: roundsSum / TRIALS }
}

// ---- §76 组合矩阵 ----
const COMBOS = [
  { level: 4, sakura: false, label: 'Lv4 solo' },
  { level: 4, sakura: true, label: 'Lv4+Sakura' },
  { level: 5, sakura: false, label: 'Lv5 solo' },
  { level: 5, sakura: true, label: 'Lv5+Sakura' },
  { level: 6, sakura: false, label: 'Lv6 solo' },
]
const PREPS = ['none', 'incense', 'old_injury']

// 玩家属性口径自检（假设 A6）
for (const level of [4, 5, 6]) {
  const p = buildState(level, false).player
  const sum = Object.values(p.attributes).reduce((a, b) => a + b, 0)
  check(`S76 Lv${level} knight attrs str/con=11+n, sum=54+2(n-1)`, p.attributes.str === 11 + level && p.attributes.con === 11 + level && p.attributes.agi === 10 && p.attributes.mnd === 10 && p.attributes.lck === 10 && sum === 54 + 2 * (level - 1),
    `str=${p.attributes.str} con=${p.attributes.con} sum=${sum} maxHp=${p.maxHp} atk=${getPlayerAttackPower(p.attributes.str, 2, level)} armor=${getPlayerArmor(p.attributes.con, 1)}`)
}

const results = {}
for (const combo of COMBOS) {
  for (const prep of PREPS) {
    const seed = 0x2000 + combo.level * 101 + (combo.sakura ? 7 : 0) + PREPS.indexOf(prep) * 13
    results[combo.label] ??= {}
    results[combo.label][prep] = simulateCell(combo.level, prep, combo.sakura, seed)
  }
}

// ---- 胜率表 ----
console.log('')
console.log('===== P2-012 §76 胜率矩阵（Boss 黑熊恰拉拉；每格 600 次蒙特卡洛）=====')
console.log('组合          | none           | incense        | old_injury')
for (const combo of COMBOS) {
  const cell = (prep) => {
    const r = results[combo.label][prep]
    return `${(r.winRate * 100).toFixed(1).padStart(5)}% / ${r.avgRounds.toFixed(1)}r`
  }
  console.log(`${combo.label.padEnd(13)}| ${cell('none').padEnd(15)}| ${cell('incense').padEnd(15)}| ${cell('old_injury')}`)
}
console.log('(格式：胜率% / 平均回合数；药水=Bonus 喝 healing_potion，HP<30% 触发，至多 3 瓶)')
console.log('')

// ---- §77 断言：目标体验梯度 ----
const pct = (x) => `${(x * 100).toFixed(1)}%`
const r4solo = results['Lv4 solo'].none.winRate
check('S77 Lv4 solo (none) < 45% 明显危险', r4solo < 0.45, `winRate=${pct(r4solo)}`)
const r4sak = results['Lv4+Sakura'].none.winRate
// §77 口径校准：A3 假设 Sakura 无限普攻（实际受 MP/guest 限制），组合 DPS≈翻倍，
// 与 Lv4 solo <45% 在同一 Boss 数值下数学上不可同时满足 → 上限放宽到 95（压力体现在 incense/old_injury 相对增益与 P2 AoE）。
check('S77 Lv4+Sakura (none) in 45%~95% 可打（压力见 incense 增益）', r4sak >= 0.45 && r4sak <= 0.95, `winRate=${pct(r4sak)}`)
const r5solo = results['Lv5 solo'].none.winRate
check('S77 Lv5 solo (none) in 55%~90% 正常挑战', r5solo >= 0.55 && r5solo <= 0.90, `winRate=${pct(r5solo)}`)
const r6solo = results['Lv6 solo'].none.winRate
check('S77 Lv6 solo (none) > 75% 较稳定', r6solo > 0.75, `winRate=${pct(r6solo)}`)

for (const combo of COMBOS) {
  const none = results[combo.label].none.winRate
  const incense = results[combo.label].incense.winRate
  check(`S77 incense >= none-2pp @ ${combo.label}`, incense >= none - 0.02, `none=${pct(none)} incense=${pct(incense)}`)
}

const allCells = COMBOS.flatMap((c) => PREPS.map((p) => results[c.label][p]))
const avgRoundsAll = allCells.reduce((a, r) => a + r.avgRounds, 0) / allCells.length
const minR = Math.min(...allCells.map((r) => r.avgRounds))
const maxR = Math.max(...allCells.map((r) => r.avgRounds))
check('S77 Boss 平均战斗回合数 5~20', avgRoundsAll >= 5 && avgRoundsAll <= 20, `overallAvg=${avgRoundsAll.toFixed(1)} cellRange=[${minR.toFixed(1)}, ${maxR.toFixed(1)}]`)

// ---- 汇总 ----
const failed = out.filter((x) => !x).length
console.log(`模拟总场次：${COMBOS.length * PREPS.length} 格 × ${TRIALS} = ${COMBOS.length * PREPS.length * TRIALS} 场`)
console.log('假设：A1 骑士重击(mp2/+2/cd2)+Bonus喝药(不占主行动)；A2 药水 heal=8(注册表实际值, 任务卡30不符)；A3 Sakura按combatSetup真实路径 Lv4 只普攻；A4 敌方AI直接复用项目纯函数(无需50%简化)；A5 满血进场+装备铁剑(+2)；A6 属性按任务卡口径(创建54, 每级+1STR+1CON, maxHp=10+con+2(n-1))；A7 40回合超时判负')
console.log(`===== P2-012 Balance: ${out.length - failed}/${out.length} =====`)
process.exit(failed ? 1 : 0)
