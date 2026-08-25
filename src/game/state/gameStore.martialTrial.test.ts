import { afterEach, describe, expect, it } from 'vitest'
import { MARTIAL_TRIAL_QUEST_ID, useGameStore } from './gameStore'

describe('TM-P2-010 martial trial store flow', () => {
  afterEach(() => useGameStore.setState({ gameState: null }))

  it('accepts a compatible invitation, records one profession route, and fail-forwards observation', () => {
    const store = useGameStore.getState()
    store.newGame()
    store.setCurrentLocation('tianlong_martial_hall')
    store.setFlag('martial_trial_invited', true)

    expect(store.acceptMartialTrial()).toBe(true)
    expect(store.registerMartialTrial()).toBe(true)
    expect(store.travelToLocation('tianlong_martial_trial_ground')).toBe(true)
    const result = store.resolveMartialTrialObservation('con', 1)
    expect(result).toMatchObject({ ok: true, success: false, progressed: true })

    const quest = useGameStore.getState().gameState?.quests.find((q) => q.questId === MARTIAL_TRIAL_QUEST_ID)
    expect(quest?.flags.route_knight).toBe(true)
    expect(quest?.flags.trial_observation_done).toBe(true)
  })

  it('accepts the legacy knight invitation without deleting it', () => {
    const store = useGameStore.getState()
    store.newGame()
    store.setCurrentLocation('tianlong_martial_hall')
    store.setFlag('knight_trial_invited', true)
    expect(store.acceptMartialTrial()).toBe(true)
    expect(useGameStore.getState().gameState?.world.flags.knight_trial_invited).toBe(true)
  })

  it('restores 2 MP on a successful observation and grants the registered reward exactly once', () => {
    const store = useGameStore.getState()
    store.newGame()
    store.setCurrentLocation('tianlong_martial_hall')
    store.setFlag('martial_trial_invited', true)
    expect(store.acceptMartialTrial()).toBe(true)
    expect(store.registerMartialTrial()).toBe(true)
    expect(store.travelToLocation('tianlong_martial_trial_ground')).toBe(true)

    const beforeObservation = useGameStore.getState().gameState!
    useGameStore.setState({ gameState: { ...beforeObservation, player: { ...beforeObservation.player, mp: 0 } } })
    expect(useGameStore.getState().resolveMartialTrialObservation('con', 20)).toMatchObject({ ok: true, success: true })
    expect(useGameStore.getState().gameState?.player.mp).toBe(2)

    const beforeTrialVictory = useGameStore.getState().gameState!
    const beforeTrialVictoryGold = beforeTrialVictory.player.gold
    const beforeTrialVictoryXp = beforeTrialVictory.player.adventureXp
    const beforeTrialVictoryInventory = beforeTrialVictory.inventory
    expect(useGameStore.getState().resolveEncounterVictory('encounter_trial_knight')).not.toBeNull()
    const afterTrialVictory = useGameStore.getState().gameState!
    expect(afterTrialVictory.player.gold).toBe(beforeTrialVictoryGold)
    expect(afterTrialVictory.player.adventureXp).toBe(beforeTrialVictoryXp)
    expect(afterTrialVictory.inventory).toEqual(beforeTrialVictoryInventory)
    expect(useGameStore.getState().gameState?.quests.find((quest) => quest.questId === MARTIAL_TRIAL_QUEST_ID)?.flags.trial_combat_done).toBe(true)
    const afterFirstVictory = useGameStore.getState().gameState!
    expect(useGameStore.getState().startEncounter('encounter_trial_knight')).toBe(false)
    expect(useGameStore.getState().resolveEncounterVictory('encounter_trial_knight')).toBeNull()
    const afterRepeatedVictory = useGameStore.getState().gameState!
    expect(afterRepeatedVictory.player.gold).toBe(afterFirstVictory.player.gold)
    expect(afterRepeatedVictory.player.adventureXp).toBe(afterFirstVictory.player.adventureXp)
    expect(afterRepeatedVictory.inventory).toEqual(afterFirstVictory.inventory)
    expect(useGameStore.getState().travelToLocation('tianlong_martial_hall')).toBe(true)
    expect(useGameStore.getState().reportMartialTrial()).toBe(true)
    const beforeGold = useGameStore.getState().gameState!.player.gold
    const beforeXp = useGameStore.getState().gameState!.player.adventureXp
    expect(useGameStore.getState().completeMartialTrial()).toBe(true)
    expect(useGameStore.getState().completeMartialTrial()).toBe(false)
    const completed = useGameStore.getState().gameState!
    expect(completed.player.gold).toBe(beforeGold + 50)
    expect(completed.player.adventureXp).toBe(beforeXp + 120)
    expect(completed.player.learnedSkillIds.filter((id) => id === 'knight_oath_guard')).toHaveLength(1)
    expect(completed.inventory.find((entry) => entry.itemId === 'tianlong_martial_medal')?.quantity).toBe(1)
    expect(completed.quests.find((quest) => quest.questId === MARTIAL_TRIAL_QUEST_ID)?.flags.trial_reward_claimed).toBe(true)
  })
})
