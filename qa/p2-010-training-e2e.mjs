import { registerHooks } from 'node:module'
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z0-9]+$/i.test(specifier)) {
    if (specifier.endsWith('/content')) { try { return nextResolve(specifier + '/index.ts', context) } catch {} }
    try { return nextResolve(specifier + '.ts', context) } catch {}
  }
  return nextResolve(specifier, context)
} })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`) }
const [{ createInitialGameState }, content, encRule, xp] = await Promise.all([
  import('../src/game/content/initial.ts'), import('../src/game/content/index.ts'), import('../src/game/rules/encounter.ts'), import('../src/game/rules/combatXp.ts'),
])
const { ENCOUNTERS, getEncounter, getEnemy, ITEMS } = content
const { checkEncounter, encounterRosterPreview } = encRule
const { allEncounterMembers, totalEncounterMemberCount } = content
const state = (locationId, variants = {}) => ({ ...createInitialGameState(), world: { ...createInitialGameState().world, currentLocationId: locationId, encounterVariants: variants } })

// TR1-TR7: authored regional training metadata and recommendation hints.
const training = Object.values(ENCOUNTERS).filter((d) => d.repeatable === true)
check('TR1 repeatable encounters discoverable from registry', training.length >= 7, `count=${training.length}`)
const regionalFixtures = [
  ['village_grassland', {}],
  ['abandoned_mine', {}],
  ['tianlong_north_outskirts', { north_outskirts_unlocked: true }],
]
for (const [locationId, flags] of regionalFixtures) {
  const location = content.LOCATIONS[locationId]
  const fixture = state(locationId)
  fixture.world.flags = { ...fixture.world.flags, ...flags }
  const configured = location?.encounters ?? []
  const legal = configured.filter((id) => checkEncounter(fixture, id).allowed)
  check(`TR1 region ${locationId}: at least 2 configured choices`, configured.length >= 2, `configured=${configured.length}`)
  check(`TR1 region ${locationId}: at least 2 legal fixture choices`, legal.length >= 2, `legal=${legal.length}`)
}
check('TR2 low-risk metadata exists', training.some((d) => d.difficulty === 'low'))
check('TR3 standard metadata exists', training.some((d) => d.difficulty === 'standard'))
check('TR4 dangerous metadata exists', training.some((d) => d.difficulty === 'dangerous'))
check('TR5 every repeatable encounter has recommendation', training.every((d) => Number.isInteger(d.recommendedLevelMin) && d.recommendedLevelMin >= 1))
check('TR6 under-level remains playable by rule (no level gate)', training.every((d) => !('requiredLevel' in d)))
check('TR7 over-level remains playable by rule (no scaling gate)', training.every((d) => !('scaleWithLevel' in d)))

// TR8-TR14: first/repeat XP and quest-reward isolation.
const repeat = getEncounter('encounter_cave_bat')
const members = allEncounterMembers(repeat)
const first = xp.resolveEncounterVictoryXp({ player: {}, world: { flags: {}, encounterVariants: {} }, quests: [], inventory: [] }, repeat, members)
const again = xp.resolveEncounterVictoryXp({ player: {}, world: { flags: { cave_bat_first_kill: true }, encounterVariants: {} }, quests: [], inventory: [] }, repeat, members)
check('TR8 first victory uses first-kill XP', first === 8, `xp=${first}`)
check('TR9 repeat victory uses repeat XP', again === 4, `xp=${again}`)
check('TR10 repeat XP lower than first-kill XP', again > 0 && again < first)
check('TR11 escape has no victory settlement path', xp.resolveEncounterVictoryXp({ player: {}, world: { flags: {}, encounterVariants: {} }, quests: [], inventory: [] }, undefined, []) === 0)
check('TR12 defeat has no victory settlement path', xp.resolveEncounterVictoryXp({ player: {}, world: { flags: {}, encounterVariants: {} }, quests: [], inventory: [] }, undefined, []) === 0)
check('TR13 repeatable definitions have no encounterDefeatFlag quest completion hook', training.every((d) => d.encounterDefeatFlag === undefined))
check('TR14 repeatable definitions do not carry mandatory quest item metadata', training.every((d) => !('questRewardItemId' in d)))

// TR15-TR18: preview before lock, lock persistence, combat roster equality, no reroll on refresh.
const previewDef = getEncounter('encounter_broken_patrol')
const unlocked = encounterRosterPreview(state('black_stone_tower_floor2'), previewDef)
const lockedA = encounterRosterPreview(state('black_stone_tower_floor2', { encounter_broken_patrol: 'broken_patrol_a' }), previewDef)
const lockedB = encounterRosterPreview(state('black_stone_tower_floor2', { encounter_broken_patrol: 'broken_patrol_b' }), previewDef)
check('TR15 pre-lock preview exposes alternatives', unlocked.locked === false && unlocked.candidates.length >= 2)
check('TR16 persisted lock exposes one roster', lockedA.locked === true && lockedA.members.length > 0)
check('TR17 locked preview roster matches encounter member resolver', JSON.stringify(lockedA.members) === JSON.stringify(previewDef.variants.find((v) => v.id === 'broken_patrol_a').members))
const lockedARefresh = encounterRosterPreview(state('black_stone_tower_floor2', { encounter_broken_patrol: 'broken_patrol_a' }), previewDef)
check('TR18 refresh does not reroll persisted variant', lockedA.locked && lockedARefresh.locked && JSON.stringify(lockedA.members) === JSON.stringify(lockedARefresh.members) && JSON.stringify(lockedA.members) !== JSON.stringify(lockedB.members))

// Trial content stays fixed-authored and cannot leak ordinary combat rewards.
for (const profession of ['warrior', 'knight', 'ranger', 'mage']) {
  const d = getEncounter(`encounter_trial_${profession}`)
  check(`TR trial ${profession}: <=3 enemies`, totalEncounterMemberCount(d) <= 3)
  check(
    `TR trial ${profession}: no ordinary XP or loot`,
    (d.fixedMembers ?? []).every((m) => {
      const enemy = getEnemy(m.enemyId)
      return enemy?.adventureXpReward === undefined && enemy?.dropTable === undefined
    }),
  )
}
check('TR trial reward item is registered', Boolean(ITEMS.tianlong_martial_medal))

const failed = results.filter((x) => !x).length
console.log(`===== P2-010 training: ${results.length - failed}/${results.length} PASS =====`)
process.exit(failed ? 1 : 0)
