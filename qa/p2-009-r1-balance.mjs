// ============================================================================
// qa/p2-009-r1-balance.mjs —— TM-P2-009-R1 引擎级 Balance / 规则回归（纯 node）。
//
// 覆盖 08_验收矩阵（引擎层，浏览器 E2E 的补充）：
//   A5-A7  wild_wolf first-kill 判定只认战斗击败标记（steppe_wolf_pack_defeated /
//         waystation_wolf_pack_combat）；非战斗绕开（neutralized）不消耗；malformed flags 安全降级
//   B1/B5  Initiative 公式仍 D20+AGI；平手 tie-break friendly 先
//   C5     残破巡逻队变体绝无 2 骷髅 + 1 黑法师 假三人组
//   G1-G4  敌人技能：黑法师 skillIds 注册合法 / 原始伤害公式 / chooseEnemyAction 边界 / 冷却+once 过滤
//   H1-H6  Encounter Diversity V1：7 个新 repeatable 遭遇注册合法 + 低额重复 XP /
//         SINGLE_ENEMY_ENCOUNTERS 映射 / 未固化多候选 preview / 固化 locked / 权重和 100 / ≤3 敌人
//
// 运行：node qa/p2-009-r1-balance.mjs
// ============================================================================
import { registerHooks } from 'node:module'

// ---- TS 扩展名 resolve hook（必须在任何 .ts 动态 import 之前注册）----
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
      try {
        return nextResolve(specifier + '.ts', context)
      } catch {
        /* continue */
      }
      try {
        return nextResolve(specifier + '/index.ts', context)
      } catch {
        /* continue */
      }
    }
    return nextResolve(specifier, context)
  },
})

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const xp = await import('../src/game/rules/combatXp.ts')
const pc = await import('../src/game/rules/partyCombat.ts')
const encRule = await import('../src/game/rules/encounter.ts')
const skillRule = await import('../src/game/rules/skill.ts')
const encContent = await import('../src/game/content/encounters.ts')
const enemyContent = await import('../src/game/content/enemies.ts')
const skillContent = await import('../src/game/content/skills.ts')

const { SINGLE_ENEMY_ENCOUNTERS, getEncounter, allEncounterMembers, totalEncounterMemberCount, ENCOUNTERS } = encContent
const { ENEMIES } = enemyContent
const { getSkill } = skillContent

/** 最小 GameState（isFirstKillPending / resolveEncounterVictoryXp / encounterRosterPreview 所需最小字段） */
const mkGs = (flags = {}, quests = [], inventory = [], encounterVariants = {}) => ({
  player: {}, world: { flags, encounterVariants }, quests, inventory,
})

// =====================================================================
// Part A：wild_wolf first-kill 判定（A5-A7）
// =====================================================================
check(
  'A5: 空 flags → wild_wolf first-kill 待授予',
  xp.isFirstKillPending(mkGs({}), 'wild_wolf') === true,
)
check(
  'A5: 荒原狼群 defeated → 不消耗（不再给 first-kill）',
  xp.isFirstKillPending(mkGs({ steppe_wolf_pack_defeated: true }), 'wild_wolf') === false,
)
check(
  'A5: 驿站狼群 combat → 不消耗',
  xp.isFirstKillPending(mkGs({ waystation_wolf_pack_combat: true }), 'wild_wolf') === false,
)
// A7 核心：非战斗绕开（MND/LCK/Sakura/Mount 安抚引走）只写 neutralized → 不消耗 first-kill
check(
  'A7: 驿站狼群 neutralized（非战斗绕开）→ 仍待首次击败（不消耗）',
  xp.isFirstKillPending(mkGs({ waystation_wolf_pack_neutralized: true }), 'wild_wolf') === true,
)
check(
  'A7: malformed flag（非 boolean）→ 安全降级为已击败（不误授 XP）',
  xp.isFirstKillPending(mkGs({ steppe_wolf_pack_defeated: 'yes' }), 'wild_wolf') === false &&
    xp.isFirstKillPending(mkGs({ waystation_wolf_pack_combat: 1 }), 'wild_wolf') === false,
)
check(
  'A5: FIRST_KILL_FLAG_ENEMIES 含 cave_bat / wild_boar',
  xp.FIRST_KILL_FLAG_ENEMIES.has('cave_bat') && xp.FIRST_KILL_FLAG_ENEMIES.has('wild_boar'),
)
// combatXp 解耦：首次击败 → first-kill 总和；重复 → repeatable 低额；非 repeatable → 0
const caveBatDef = getEncounter('encounter_cave_bat')
const caveBatMembers = allEncounterMembers(caveBatDef) // 真实阵容：cave_bat ×1
check(
  'A5: 首次击败洞穴蝙蝠 → 给 first-kill XP（8）',
  xp.resolveEncounterVictoryXp(mkGs({}), caveBatDef, caveBatMembers) === 8,
)
check(
  'A5: 洞穴蝙蝠已首次击败 → 只给 repeatable 低额 4',
  xp.resolveEncounterVictoryXp(mkGs({ cave_bat_first_kill: true }), caveBatDef, caveBatMembers) === 4,
)
check(
  'A5: 非 repeatable 遭遇重复胜利 → 0 XP（黑法师已击败标记在 quest_wangcai_trouble）',
  xp.resolveEncounterVictoryXp(
    mkGs({}, [{ questId: 'quest_wangcai_trouble', flags: { floor2_black_mage_defeated: true } }]),
    getEncounter('encounter_black_mage'),
    [{ enemyId: 'black_mage' }],
  ) === 0,
)

// =====================================================================
// Part B：Initiative 公式 + tie-break（B1/B5）
// =====================================================================
const mkCombatant = (id, agility, side) => ({
  instanceId: id, side, sourceType: side === 'friendly' ? 'player' : 'enemy', sourceId: id,
  name: id, currentHp: 10, maxHp: 10, currentMp: 0, maxMp: 0, attack: 5, armor: 5, agility, isAlive: true,
})
{
  const turns = pc.rollInitiativeQueue([mkCombatant('p', 9, 'friendly')], () => 0.4)
  check('B1: Initiative = D20 + AGI（9 + 9 = 18）', turns[0].initiative === 18 && turns[0].roll === 9, JSON.stringify({ ini: turns[0].initiative, roll: turns[0].roll }))
}
{
  const seq = [0.0, 0.99]
  const turns = pc.rollInitiativeQueue([mkCombatant('p', 9, 'friendly'), mkCombatant('e', 8, 'enemy')], () => seq.shift() ?? 0.99)
  check('B1: 高骰可反超（28 > 10）', turns[0].combatant.sourceId === 'e' && turns[0].initiative === 28, JSON.stringify(turns.map((t) => t.initiative)))
}
{
  const turns = pc.rollInitiativeQueue(
    [mkCombatant('f1', 8, 'friendly'), mkCombatant('f2', 8, 'friendly'), mkCombatant('e1', 8, 'enemy'), mkCombatant('e2', 8, 'enemy')],
    () => 0.99,
  )
  check('B5: 平手 tie-break friendly 先', turns.map((t) => t.combatant.sourceId).join(',') === 'f1,f2,e1,e2')
}

// =====================================================================
// Part C：残破巡逻队阵容（C5）
// =====================================================================
{
  const def = getEncounter('encounter_broken_patrol')
  const variants = def?.variants ?? []
  const counts = variants.map((v) => v.members.reduce((s, m) => s + m.count, 0))
  const hasTrio = variants.some(
    (v) =>
      v.members.filter((m) => m.enemyId === 'skeleton_warrior').reduce((s, m) => s + m.count, 0) === 2 &&
      v.members.some((m) => m.enemyId === 'black_mage'),
  )
  check('C5: broken_patrol 任意变体 ≤2 敌人，绝无 2+1 假三人组', counts.every((c) => c <= 2) && !hasTrio, `counts=${JSON.stringify(counts)}`)
}

// =====================================================================
// Part G：敌人技能（G1-G4）
// =====================================================================
{
  // G1：黑法师 skillIds 注册合法
  const bm = ENEMIES.black_mage
  const skillIds = bm?.skillIds ?? []
  const allKnown = skillIds.every((id) => Boolean(getSkill(id)))
  check('G1: 黑法师 skillIds 全部注册（enemy_dark_bolt/enemy_black_fire）', allKnown, JSON.stringify(skillIds))

  // G2：原始伤害公式（magic_spell = 6 + bonus）
  const darkBolt = skillRule.resolveEnemySkillRawDamage('enemy_dark_bolt', { attackPower: 14, agility: 8 })
  const blackFire = skillRule.resolveEnemySkillRawDamage('enemy_black_fire', { attackPower: 14, agility: 8 })
  check('G2: 暗影箭 raw = 6+10 = 16', darkBolt === 16, `raw=${darkBolt}`)
  check('G2: 黑火球 raw = 6+12 = 18', blackFire === 18, `raw=${blackFire}`)

  // G3：chooseEnemyAction 边界
  const skills = skillIds.map((id) => getSkill(id))
  check('G3: 无可用技能 → 恒普攻', pc.chooseEnemyAction([], 'caster', () => 0.01).type === 'attack')
  check('G3: v >= rate → 普攻（caster 0.9 ≥ 0.85）', pc.chooseEnemyAction(skills, 'caster', () => 0.9).type === 'attack')
  const c1 = pc.chooseEnemyAction(skills, 'caster', () => 0.5)
  check('G3: v < rate → 施法，并按比例归一选技能（0.5/0.85*2 → 黑火球）', c1.type === 'skill' && c1.skillId === 'enemy_black_fire', JSON.stringify(c1))
  // 单技能 aggressive：0.5/0.7*1 → index 0（归一公式对单技能稳定取首项）
  const c2 = pc.chooseEnemyAction([skills[0]], 'aggressive', () => 0.5)
  check('G3: 单技能 aggressive 0.5 < 0.7 → 技能 index 0', c2.type === 'skill' && c2.skillId === 'enemy_dark_bolt', JSON.stringify(c2))
  // 双技能 aggressive：0.5/0.7*2 → index 1（归一公式不偏向前几项）
  const c3 = pc.chooseEnemyAction(skills, 'aggressive', () => 0.5)
  check('G3: 双技能 aggressive 0.5 < 0.7 → index 1（黑火球）', c3.type === 'skill' && c3.skillId === 'enemy_black_fire', JSON.stringify(c3))
  let threw = false
  try { pc.chooseEnemyAction(skills, 'caster', () => 1.0) } catch { threw = true }
  check('G3: 非法 rng（>=1）→ RangeError', threw === true)

  // G4：冷却 + once 过滤
  const fresh = skillRule.filterUsableEnemySkills(skills, {}, new Set())
  check('G4: 无冷却无 once → 全可用', fresh.length === 2)
  const cooled = skillRule.filterUsableEnemySkills(skills, { enemy_black_fire: 1 }, new Set())
  check('G4: 黑火球冷却中 → 只剩暗影箭', cooled.length === 1 && cooled[0].id === 'enemy_dark_bolt')
  // once 过滤用带 oncePerCombat 标记的构造技能验证（content 敌人技能均无 once，纯逻辑层测试）
  const onceSkill = { id: 'enemy_once_test', name: '一次性技能', description: '', mpCost: 0, combat: { oncePerCombat: true } }
  const onceFresh = skillRule.filterUsableEnemySkills([onceSkill], {}, new Set())
  const onceUsed = skillRule.filterUsableEnemySkills([onceSkill], {}, new Set(['enemy_once_test']))
  check('G4: once 技能未用 → 可用', onceFresh.length === 1)
  check('G4: once 技能已用 → 被过滤', onceUsed.length === 0)
  check('G4: skillCooldownTurns(黑火球) = 2', skillRule.skillCooldownTurns('enemy_black_fire') === 2)
}

// =====================================================================
// Part H：Encounter Diversity V1（H1-H6）
// =====================================================================
{
  const NEW_REPEATABLE = [
    'encounter_grassland_rabbit_pair',
    'encounter_cave_bat',
    'encounter_mine_mixed',
    'encounter_floor1_soldier_pair',
    'encounter_floor3_witch_escort',
    'encounter_north_boar',
    'encounter_north_mane_pack',
  ]

  // H1：7 个新 repeatable 遭遇注册合法 + 低额重复 XP（明显低于首次击败）
  for (const id of NEW_REPEATABLE) {
    const def = getEncounter(id)
    if (!def) { check(`H1: ${id} 已注册`, false); continue }
    const members = allEncounterMembers(def)
    const firstKillSum = members.reduce((sum, m) => sum + (ENEMIES[m.enemyId]?.adventureXpReward ?? 0) * m.count, 0)
    const repeat = def.repeatAdventureXpReward ?? 0
    const ok = def.repeatable === true && Number.isInteger(repeat) && repeat > 0 && repeat < firstKillSum
    check(`H1: ${id} repeatable + 低额重复 XP（${repeat} < 首次 ${firstKillSum}）`, ok)
  }

  // H2：SINGLE_ENEMY_ENCOUNTERS 映射 + 反查（fixedMembers 单敌）
  check('H2: cave_bat → encounter_cave_bat', SINGLE_ENEMY_ENCOUNTERS.cave_bat === 'encounter_cave_bat')
  check('H2: wild_boar → encounter_north_boar', SINGLE_ENEMY_ENCOUNTERS.wild_boar === 'encounter_north_boar')
  check('H2: encounter_cave_bat 反查 singleEnemyId = cave_bat', encRule.singleEnemyIdOf(getEncounter('encounter_cave_bat')) === 'cave_bat')
  check('H2: encounter_north_boar 反查 singleEnemyId = wild_boar', encRule.singleEnemyIdOf(getEncounter('encounter_north_boar')) === 'wild_boar')

  // H3：未固化 → locked=false + 双候选
  const unlocked = encRule.encounterRosterPreview(mkGs({}), getEncounter('encounter_broken_patrol'))
  check('H3: 未固化 preview locked=false + 2 候选', unlocked.locked === false && unlocked.candidates.length === 2, `candidates=${unlocked.candidates.length}`)
  const candTexts = unlocked.candidates.map((m) => encRule.formatEncounterMembers(m))
  check('H3: 候选文案「骷髅战士×2」/「骷髅战士+黑法师」', candTexts.includes('骷髅战士×2') && candTexts.includes('骷髅战士+黑法师'), candTexts.join(' | '))

  // H4：固化后 locked=true + members 匹配（preview == battle；固化值位于 world.encounterVariants，与 store 首次 roll 写入一致）
  const lockedA = encRule.encounterRosterPreview(mkGs({}, [], [], { encounter_broken_patrol: 'broken_patrol_a' }), getEncounter('encounter_broken_patrol'))
  check('H4: 固化 A → locked=true + 骷髅战士×2', lockedA.locked === true && encRule.formatEncounterMembers(lockedA.members) === '骷髅战士×2', encRule.formatEncounterMembers(lockedA.members))
  const lockedB = encRule.encounterRosterPreview(mkGs({}, [], [], { encounter_broken_patrol: 'broken_patrol_b' }), getEncounter('encounter_broken_patrol'))
  check('H4: 固化 B → locked=true + 骷髅战士+黑法师', lockedB.locked === true && encRule.formatEncounterMembers(lockedB.members) === '骷髅战士+黑法师', encRule.formatEncounterMembers(lockedB.members))

  // H5：broken_patrol 变体权重和 = 100；其本身也是 repeatable（可选高威胁练级遭遇）
  const bp = getEncounter('encounter_broken_patrol')
  const weightSum = (bp?.variants ?? []).reduce((s, v) => s + v.weight, 0)
  check('H5: broken_patrol 权重和 = 100', weightSum === 100, `sum=${weightSum}`)
  check(
    'H5: broken_patrol repeatable + 重复 XP 低于首次',
    bp?.repeatable === true && (bp?.repeatAdventureXpReward ?? 0) > 0 &&
      (bp?.repeatAdventureXpReward ?? 0) < allEncounterMembers(bp).reduce((s, m) => s + (ENEMIES[m.enemyId]?.adventureXpReward ?? 0) * m.count, 0),
    `repeat=${bp?.repeatAdventureXpReward}`,
  )

  // H6：所有新遭遇成员 ≤3；repeatable 遭遇不设 encounterDefeatFlag（可反复刷）
  for (const id of NEW_REPEATABLE) {
    const def = getEncounter(id)
    if (!def) continue
    check(`H6: ${id} 成员 ≤3`, totalEncounterMemberCount(def) <= 3, `n=${totalEncounterMemberCount(def)}`)
    check(`H6: ${id} repeatable 不设 encounterDefeatFlag`, def.encounterDefeatFlag === undefined)
  }
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-009-R1 Balance 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
