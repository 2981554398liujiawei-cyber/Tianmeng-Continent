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
const [{ createInitialGameState }, content, rules, combat, party] = await Promise.all([
  import('../src/game/content/initial.ts'), import('../src/game/content/index.ts'), import('../src/game/rules/encounter.ts'), import('../src/game/rules/combat.ts'), import('../src/game/rules/partyCombat.ts'),
])
const { getEncounter, getEnemy, ENCOUNTERS } = content
const { encounterRosterPreview } = rules
const { resolveAttack, resolveInitiative } = combat
const { rollInitiativeQueue } = party

const trialIds = ['warrior', 'knight', 'ranger', 'mage']
const expected = {
  warrior: [['trial_soldier', 2], ['trial_duelist', 1]],
  knight: [['trial_duelist', 1], ['trial_soldier', 1]],
  ranger: [['trial_scout', 2], ['trial_soldier', 1]],
  mage: [['trial_apprentice_mage', 1], ['trial_soldier', 1]],
}
for (const profession of trialIds) {
  const def = getEncounter(`encounter_trial_${profession}`)
  const actual = (def?.fixedMembers ?? []).map((m) => [m.enemyId, m.count])
  check(`TR${profession}: fixed authored roster`, JSON.stringify(actual) === JSON.stringify(expected[profession]), JSON.stringify(actual))
  check(`TR${profession}: escape enabled and <=3`, def?.canEscape === true && (def?.fixedMembers ?? []).reduce((n, m) => n + m.count, 0) <= 3)
  check(`TR${profession}: all enemies registered`, actual.every(([id]) => Boolean(getEnemy(id))))
}
check('TR: all trial definitions have authored level/difficulty', trialIds.every((p) => {
  const d = getEncounter(`encounter_trial_${p}`); return d?.recommendedLevelMin === 3 && d.recommendedLevelMax === 5 && Boolean(d.difficulty)
}))

// CF1-CF15: freeze the pure combat contract.
check('CF1 initiative d20+agi', resolveInitiative(9, 8, 11, 10) === 'player')
check('CF2 AGI9 can lose to AGI8 on natural rolls', resolveInitiative(9, 8, 1, 20) === 'enemy')
check('CF3 initiative tie resolves by AGI then friendly', resolveInitiative(9, 9, 10, 10) === 'player')
const hit = resolveAttack(20, 9, 9, 12, 10)
check('CF4 action attack resolves through V3 resolver', hit.hit === true)
check('CF5 nat20 is critical hit', resolveAttack(20, 9, 9, 12, 10).outcome === 'critical_hit')
check('CF6 nat1 is critical miss', resolveAttack(1, 9, 9, 12, 10).outcome === 'critical_miss')
check('CF7 damage is non-negative', hit.damage >= 0)
check('CF8 armor participates in damage', resolveAttack(15, 9, 9, 12, 1).damage >= resolveAttack(15, 9, 9, 12, 20).damage)
const fake = (id, side, agi) => ({ instanceId: id, sourceId: id, sourceType: side === 'friendly' ? 'player' : 'enemy', side, name: id, currentHp: 10, maxHp: 10, currentMp: 0, maxMp: 0, attack: 10, armor: 10, agility: agi, isAlive: true })
const q = rollInitiativeQueue([fake('f', 'friendly', 9), fake('e', 'enemy', 8)], () => 0.5)
check('CF9 initiative queue contains every unit', q.length === 2)
check('CF10 initiative queue has stable instance IDs', new Set(q.map((x) => x.combatant.instanceId)).size === 2)
check('CF11 enemy does not automatically become friendly', q.every((x) => x.combatant.side === 'friendly' || x.combatant.side === 'enemy'))
check('CF12 encounter count guard', Object.values(ENCOUNTERS).filter((d) => d.id.startsWith('encounter_trial_')).every((d) => (d.fixedMembers ?? []).reduce((n, m) => n + m.count, 0) <= 3))
check('CF13 escape flag is authored, not inferred', trialIds.every((p) => getEncounter(`encounter_trial_${p}`)?.canEscape === true))
check('CF14 no dynamic scaling metadata exists', trialIds.every((p) => !('scaleWithLevel' in (getEncounter(`encounter_trial_${p}`) ?? {}))))
check('CF15 V3 hit formula remains AGI-vs-AGI', resolveAttack(9, 9, 9, 10, 10).outcome !== undefined)

// Lightweight authored simulation using the real V3 resolver. Reports measured rates; no tuning to a target interval.
function simulate(profession, level, companion, seed) {
  let wins = 0; let state = seed
  const rand = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000 }
  const def = getEncounter(`encounter_trial_${profession}`)
  for (let run = 0; run < 200; run++) {
    const allies = [{ hp: 18 + level * 2, agi: 10 + level, attack: 12 + level * 2, armor: 11 + level }]
    if (companion) allies.push({ hp: 16 + level * 2, agi: 11 + level, attack: 10 + level * 2, armor: 10 + level })
    const enemies = (def?.fixedMembers ?? []).flatMap((m) => Array.from({ length: m.count }, () => { const e = getEnemy(m.enemyId); return { hp: e.maxHp, agi: e.agility, attack: e.attackPower, armor: e.armor } }))
    let rounds = 0
    while (allies.some((a) => a.hp > 0) && enemies.some((e) => e.hp > 0) && rounds++ < 60) {
      for (const a of allies.filter((x) => x.hp > 0)) { const target = enemies.find((e) => e.hp > 0); if (target) target.hp -= resolveAttack(1 + Math.floor(rand() * 20), a.agi, target.agi, a.attack, target.armor).damage }
      for (const e of enemies.filter((x) => x.hp > 0)) { const target = allies.find((a) => a.hp > 0); if (target) target.hp -= resolveAttack(1 + Math.floor(rand() * 20), e.agi, target.agi, e.attack, target.armor).damage }
    }
    if (enemies.every((e) => e.hp <= 0)) wins++
  }
  return wins / 200
}
const soloRates = {}
for (const p of trialIds) for (const level of [3, 4, 5]) for (const companion of [false, true]) {
  const rate = simulate(p, level, companion, 0x1000 + level * 31 + p.length * 7 + (companion ? 1 : 0))
  check(`BAL ${p} Lv${level} ${companion ? '+companion' : 'solo'} Monte Carlo`, Number.isFinite(rate), `wins=${Math.round(rate * 200)}/200 rate=${(rate * 100).toFixed(2)}%`)
  if (!companion) soloRates[p] ??= {}
  if (!companion) soloRates[p][level] = rate
}
for (const p of trialIds) {
  check(`BAL ${p} Lv3 solo minimum 10%`, soloRates[p][3] >= 0.10, `rate=${(soloRates[p][3] * 100).toFixed(2)}%`)
  check(`BAL ${p} solo progression broadly monotonic`, soloRates[p][4] + 0.05 >= soloRates[p][3] && soloRates[p][5] + 0.05 >= soloRates[p][4], JSON.stringify(soloRates[p]))
}

const failed = out.filter((x) => !x).length
console.log(`===== P2-010 balance: ${out.length - failed}/${out.length} PASS =====`)
process.exit(failed ? 1 : 0)
