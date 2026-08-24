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
})
