/**
 * TM-P2-013 §34：黑石守门者 Balance Runtime-Reachable 报告。
 *
 * 只读规则纯函数模拟，不改任何战斗公式（Combat V7 HARD FREEZE）。
 * 与 P2-012-R1 相同的 registerHooks 模式让裸 .ts 导入生效。
 *
 * 口径：
 *  - Synthetic / Spec：按任务卡建议的成长曲线手动注入属性（创建 54 + 每级 +1STR +1CON，
 *    maxHp = getStartingMaxHp(con) + 2*(n-1)，装备铁剑 +3 药水）。
 *  - Runtime-Reachable：用真实冒险阅历门槛（getLevelFromXp）推导等级，真实 progression.ts
 *    升级 maxHp +2；不人为修饰曲线。区分于规格模型。
 *  - 敌方 AI 直接复用 chooseEnemyAction / chooseEnemyTarget / filterUsableEnemySkills /
 *    resolveEnemySkillRawDamage / skillCooldownTurns，不近似。
 *  - 模拟结果只做报告；若明显异常，由人工决定调整本 Boss 的 HP / armor / attack / skill bonus。
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
const { getStartingMaxHp, getLevelFromXp } = character
const { chooseEnemyAction, chooseEnemyTarget, updateCombatantHp } = party
const { buildCombatSetup, weaponDamageBonusOf, armorDefenseBonusOf } = combatSetup
const { resolveBossPhaseTransition } = bossPhaseMod
const { filterUsableEnemySkills, resolveEnemySkillRawDamage, skillCooldownTurns } = skillMod
const { getSkill } = await import('../src/game/content/skills.ts')
const { rollD20 } = d20

// ---- §34 静态封板检查（数据契约）----
const bossDef = getEnemy('blackstone_warden')
check('B01 黑石守门者规格（Lv7 HP48/Armor12/Atk18/AGI6；§34 Balance 后调整）', !!bossDef && bossDef.level === 7 && bossDef.maxHp === 48 && bossDef.armor === 12 && bossDef.attackPower === 18 && bossDef.agility === 6)
check('B02 aiProfile=boss 且无 bossPhases（§10 本章不新增 Phase V2）', !!bossDef && bossDef.aiProfile === 'boss' && (!bossDef.bossPhases || bossDef.bossPhases.length === 0))
check('B03 技能：黑石重击（cd2 +4）/ 震荡护甲（cd1 +2）/ 封门横扫（cd3 +6）',
  getSkill('enemy_warden_black_smash')?.combat?.damageResolver?.bonus === 4 && getSkill('enemy_warden_black_smash')?.combat?.cooldownTurns === 2 &&
  getSkill('enemy_warden_shock_armor')?.combat?.damageResolver?.bonus === 2 && getSkill('enemy_warden_shock_armor')?.combat?.cooldownTurns === 1 &&
  getSkill('enemy_warden_gate_sweep')?.combat?.damageResolver?.bonus === 6 && getSkill('enemy_warden_gate_sweep')?.combat?.cooldownTurns === 3)
const bossEncounter = getEncounter('encounter_blackstone_warden')
check('B04 遭遇存在、不可逃跑、单一阵容', !!bossEncounter && bossEncounter.canEscape === false && (bossEncounter.fixedMembers ?? []).length === 1)
const POTION_ID = 'healing_potion'
const POTION_HEAL = getItem(POTION_ID)?.healAmount ?? 0
check('B05 治疗药水 healAmount 与注册表一致', POTION_HEAL === 8, `healAmount=${POTION_HEAL}`)
check('B06 rollD20 契约完整', rollD20() >= 1 && rollD20() <= 20)

// ---- 模拟核心 ----
const BOSS_ENCOUNTER_ID = 'encounter_blackstone_warden'
const MAX_ROUNDS = 40
const TRIALS = 600

const d20With = (rng) => Math.floor(rng() * 20) + 1
function makeRng(seed) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000 }
}

function buildSyntheticState(level, withSakura) {
  const state = createInitialGameState({
    name: 'Synthetic', gender: 'male', profession: 'knight',
    attributes: { str: 12, con: 12, agi: 10, mnd: 10, lck: 10 },
  })
  state.player.attributes.str += level - 1
  state.player.attributes.con += level - 1
  state.player.level = level
  state.player.maxHp = getStartingMaxHp(state.player.attributes.con) + 2 * (level - 1)
  state.player.hp = state.player.maxHp
  state.equipment.weapon = 'iron_sword'
  const potion = state.inventory.find((i) => i.itemId === POTION_ID)
  if (potion) potion.quantity = 3
  if (withSakura) {
    state.companions.sakura_yuko = {
      companionId: 'sakura_yuko', status: 'recruited', level: 4, mp: 6, maxMp: 6,
      learnedSkillIds: sakuraDefaultSkillIds(), flags: {},
    }
    state.party.activeCompanionIds = ['sakura_yuko']
  }
  return state
}

function buildRuntimeState(level, withSakura) {
  const state = createInitialGameState({
    name: 'Runtime', gender: 'male', profession: 'knight',
    attributes: { str: 12, con: 12, agi: 10, mnd: 10, lck: 10 },
  })
  state.player.adventureXp = 25 * level * (level + 1) - 50
  state.player.level = getLevelFromXp(state.player.adventureXp)
  if (state.player.level !== level) throw new Error(`XP 推导等级不符: ${state.player.level} != ${level}`)
  state.player.maxHp = getStartingMaxHp(state.player.attributes.con) + 2 * (level - 1)
  state.player.hp = state.player.maxHp
  state.equipment.weapon = 'iron_sword'
  const potion = state.inventory.find((i) => i.itemId === POTION_ID)
  if (potion) potion.quantity = 3
  if (withSakura) {
    state.companions.sakura_yuko = {
      companionId: 'sakura_yuko', status: 'recruited', level: 4, mp: 6, maxMp: 6,
      learnedSkillIds: sakuraDefaultSkillIds(), flags: {},
    }
    state.party.activeCompanionIds = ['sakura_yuko']
  }
  return state
}

function simulateOne(state, rng) {
  const def = getEncounter(BOSS_ENCOUNTER_ID)
  const setup = buildCombatSetup(state, def, { rng })
  const units = new Map(setup.combatants.map((c) => [c.instanceId, { ...c }]))
  const boss = units.get('enemy#1')
  const potions = { count: 3 }
  let bossRuntime
  const cooldowns = {}
  const usedOnce = new Set()
  const playerCooldowns = {}

  const livingFriendlies = () => [...units.values()].filter((c) => c.side === 'friendly' && c.isAlive)

  const strikeBoss = (attacker, rawOverride) => {
    const r = resolveAttack(d20With(rng), attacker.agility, boss.agility, rawOverride ?? attacker.attack, boss.armor)
    if (!r.hit) return
    Object.assign(boss, updateCombatantHp(boss, boss.currentHp - r.damage))
    if (!boss.isAlive) return
    const t = resolveBossPhaseTransition(boss, bossRuntime)
    if (t) { Object.assign(boss, t.combatant); bossRuntime = t.runtime }
  }

  const bossTurn = () => {
    for (const k of Object.keys(cooldowns)) cooldowns[k] = Math.max(0, cooldowns[k] - 1)
    const living = livingFriendlies()
    if (living.length === 0) return
    const target = chooseEnemyTarget(living, rng)
    const phaseSkillIds = bossRuntime?.phaseId ? bossDef?.bossPhases?.find((p) => p.id === bossRuntime.phaseId)?.skillIds : undefined
    const pool = (phaseSkillIds ?? bossDef?.skillIds ?? []).map((id) => getSkill(id)).filter(Boolean)
    const usable = filterUsableEnemySkills(pool, cooldowns, usedOnce)
    const choice = chooseEnemyAction(usable, bossDef?.aiProfile, rng)
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
        if (u.sourceType === 'player' && potions.count > 0 && u.currentHp < Math.ceil(u.maxHp * 0.3)) {
          u.currentHp = Math.min(u.maxHp, u.currentHp + POTION_HEAL)
          potions.count--
        }
        if (!boss.isAlive) break
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
  return { win: false, rounds: MAX_ROUNDS }
}

function simulateCell(stateBuilder, level, withSakura, seed) {
  const rng = makeRng(seed)
  let wins = 0
  let roundsSum = 0
  for (let i = 0; i < TRIALS; i++) {
    const state = stateBuilder(level, withSakura)
    const r = simulateOne(state, rng)
    if (r.win) wins++
    roundsSum += r.rounds
  }
  return { winRate: wins / TRIALS, avgRounds: roundsSum / TRIALS }
}

// ---- §34 重点观察矩阵：Lv6 solo / Lv7 solo / Lv6 + companion / Lv7 + companion ----
const COMBOS = [
  { level: 6, sakura: false, label: 'Lv6 solo' },
  { level: 6, sakura: true, label: 'Lv6+companion' },
  { level: 7, sakura: false, label: 'Lv7 solo' },
  { level: 7, sakura: true, label: 'Lv7+companion' },
]

const synthetic = {}
const runtime = {}
for (const combo of COMBOS) {
  synthetic[combo.label] = simulateCell(buildSyntheticState, combo.level, combo.sakura, 42)
  runtime[combo.label] = simulateCell(buildRuntimeState, combo.level, combo.sakura, 43)
}

const pct = (x) => `${(x * 100).toFixed(1)}%`
const range = (x) => `[${x.toFixed(1)}]`

// ---- Synthetic / Spec 断言（任务卡建议的成长曲线）----
console.log('=== Synthetic / Spec 矩阵（任务卡成长曲线）===')
for (const combo of COMBOS) {
  const r = synthetic[combo.label]
  console.log(`  ${combo.label}: winRate=${pct(r.winRate)} avgRounds=${range(r.avgRounds)}`)
}
// §34 建议目标等级 Lv6–9。这里 Lv6/Lv7 是重点。
check('B11 Synthetic Lv6 solo 可挑战（胜率 40%~90%）', synthetic['Lv6 solo'].winRate >= 0.40 && synthetic['Lv6 solo'].winRate <= 0.90, `winRate=${pct(synthetic['Lv6 solo'].winRate)}`)
check('B12 Synthetic Lv6+companion 较稳定（胜率 ≥65%）', synthetic['Lv6+companion'].winRate >= 0.65, `winRate=${pct(synthetic['Lv6+companion'].winRate)}`)
check('B13 Synthetic Lv7 solo 稳定（胜率 ≥70%）', synthetic['Lv7 solo'].winRate >= 0.70, `winRate=${pct(synthetic['Lv7 solo'].winRate)}`)
check('B14 Synthetic Lv7+companion 稳定（胜率 ≥80%）', synthetic['Lv7+companion'].winRate >= 0.80, `winRate=${pct(synthetic['Lv7+companion'].winRate)}`)

// ---- Runtime-Reachable 断言（真实玩家可达成长）----
console.log('=== Runtime-Reachable 矩阵（真实冒险阅历门槛 + 真实 progression）===')
for (const combo of COMBOS) {
  const r = runtime[combo.label]
  console.log(`  ${combo.label}: winRate=${pct(r.winRate)} avgRounds=${range(r.avgRounds)}`)
}
// §34 Runtime-Reachable 只作报告：真实 progression 不加属性，故 Runtime 玩家比 Synthetic 弱。
// 以下阈值保持「可感知挑战」即可，不强行要求等同于 Synthetic 胜率。
check('B21 Runtime Lv6 solo 胜率可感知（>10%）', runtime['Lv6 solo'].winRate > 0.10, `winRate=${pct(runtime['Lv6 solo'].winRate)}`)
check('B22 Runtime Lv6+companion 胜率可感知（>40%）', runtime['Lv6+companion'].winRate > 0.40, `winRate=${pct(runtime['Lv6+companion'].winRate)}`)
check('B23 Runtime Lv7 solo 胜率可感知（>15%）', runtime['Lv7 solo'].winRate > 0.15, `winRate=${pct(runtime['Lv7 solo'].winRate)}`)
check('B24 Runtime Lv7+companion 胜率可感知（>50%）', runtime['Lv7+companion'].winRate > 0.50, `winRate=${pct(runtime['Lv7+companion'].winRate)}`)

const allCells = [...Object.values(synthetic), ...Object.values(runtime)]
const avgRounds = allCells.reduce((a, r) => a + r.avgRounds, 0) / allCells.length
check('B31 平均战斗回合数处于 4~25 区间', avgRounds >= 4 && avgRounds <= 25, `avgRounds=${avgRounds.toFixed(1)}`)

// ---- 汇总 ----
const failed = out.filter((x) => !x).length
console.log(`\n模拟总场次：Synthetic ${COMBOS.length} + Runtime ${COMBOS.length} 格 × ${TRIALS} = ${COMBOS.length * 2 * TRIALS} 场`)
console.log('假设：骑士 power_strike(mp2/+2/cd2) 与普攻交替；HP<30% 喝药（heal=8）不占主行动；满血进场+装备铁剑；Sakura Lv4 只普攻；40 回合超时判负')
console.log(`===== P2-013 Balance: ${out.length - failed}/${out.length} =====`)
process.exit(failed ? 1 : 0)
