import { registerHooks } from 'node:module'
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('./') && !/\.[a-z0-9]+$/i.test(specifier)) {
      try { return nextResolve(specifier + '.ts', context) } catch { }
    }
    return nextResolve(specifier, context)
  },
})
const combat = await import('../src/game/rules/combat.ts')
const { ENEMIES } = await import('../src/game/content/enemies.ts')
const enemy = ENEMIES.corrupted_wolf
const player = {
  level: 2, profession: 'knight',
  attributes: { str: 12, con: 16, agi: 10, mnd: 8, lck: 8 },
  hp: 26, maxHp: 26, mp: 7, maxMp: 7,
  learnedSkillIds: ['knight_power_strike'],
}
const atk = combat.getPlayerAttackPower(12, 2, 2)
const armor = combat.getPlayerArmor(16, 1)
const agi = combat.getPlayerAgility(10)
console.log(`player atk=${atk} armor=${armor} agi=${agi} | wolf atk=${enemy.attackPower} agi=${enemy.agility} hp=${enemy.maxHp}`)
let pHp = 26, eHp = enemy.maxHp, rounds = 0, playerFirst = combat.resolveInitiative(agi, enemy.agility, 20, 20) === 'player'
console.log('playerFirst(20vs20):', playerFirst)
const sim = (label, pHp0) => {
  let pHp = pHp0, eHp = enemy.maxHp, r = 0
  for (let i = 0; i < 12 && pHp > 0 && eHp > 0; i++) {
    r++
    const strike = combat.resolveAttack(20, agi, enemy.agility, atk, enemy.armor)
    const res = combat.resolvePlayerStrike(eHp, strike)
    eHp = res.enemyHp
    if (eHp <= 0) break
    const enemyHit = combat.resolveAttack(20, enemy.agility, agi, enemy.attackPower, armor)
    if (enemyHit.hit) pHp -= enemyHit.damage
  }
  return { label, pHp, eHp, r, result: pHp > 0 ? 'VICTORY' : 'DEFEAT' }
}
console.log(JSON.stringify(sim('Lv2满血26 vs 狼', 26)))
console.log(JSON.stringify(sim('Lv2残血10 vs 狼', 10)))
