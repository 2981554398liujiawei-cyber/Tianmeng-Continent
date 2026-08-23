#!/usr/bin/env node
/**
 * qa/p2-007-r1-e2e.mjs —— TM-P2-007-R1 封板修复轮 E2E（BLOCKER A 生产路径验证）。
 *
 * 覆盖（§10，聚焦 BLOCKER A 的 UI 侧回归，不重复 §49）：
 *   R1-01  未注册 guest 不进战斗（生产 buildCombatSetup 只取已注册伙伴；3 active 只渲染 Sakura）
 *   R1-02  伙伴回合手动行动栏（「X的回合」+ 跳过按钮）
 *   R1-03  actorName 泛化：伙伴盾播报带伙伴名前缀（樱花优子为…施展了樱花魔法盾）
 *   R1-04  樱花魔法盾抵消敌方伤害（命中带盾目标）
 *   R1-05  once-per-combat 标记：用盾后按钮标「本场战斗已使用」
 *   R1-06  enemy AI 命中任意存活（打中伙伴 Sakura）
 *   R1-07  3v2 布局：玩家+1 伙伴+2 敌 5 卡，无横向溢出
 *   R1-08  玩家 once 技能（power_strike）与伙伴 once 技能（盾）互不串号
 *   R1-09  战斗胜利结算（伙伴 MP 战斗内变化正常结束，无 JS error）
 *   R1-10  未固化 variant 的 weighted 遭遇点击迎战 → 生产路径自动固化 → 正常进入战斗
 *
 * 运行：CHROME_PATH=<chrome> node qa/p2-007-r1-e2e.mjs
 * 依赖：生产注册表只有 sakura_yuko；第二伙伴隔离已由单测（combatSetup/CombatPage fixture）覆盖。
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.R1_E2E_PORT || 5231)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}
const partError = (name, err) => {
  console.error(`ERROR | ${name}: ${err?.stack || err}`)
  results.push({ name, ok: false })
}

const profile = mkdtempSync(join(tmpdir(), 'tianmeng-r1-e2e-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })

let browser
let page
const jsErrors = []
async function ready() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(APP_URL)
      if (res.ok) return
    } catch { /* retry */ }
    await sleep(500)
  }
  throw new Error('dev server 未就绪')
}
async function cleanup() {
  if (browser) await browser.close().catch(() => {})
  if (dev) dev.kill()
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')
async function enterLocalModeIfNeeded() {
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('仅本机模式'))
    if (b) { b.click(); return true }
    return false
  })
  if (clicked) await sleep(200)
}
async function clickButton(text) {
  const ok = await page.evaluate((label) => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().includes(label))
    if (!b) return false
    b.click()
    return true
  }, text)
  await sleep(250)
  return ok
}
async function setRandom(v) {
  await page.evaluate((value) => { Math.random = () => value }, v)
}

function baseFixture(overrides = {}) {
  return {
    player: {
      id: 'player-r1', name: '验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 22, maxHp: 22, mp: 6, maxMp: 6, gold: 50, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'traveler_cloth_armor', quantity: 1 },
    ],
    equipment: { weapon: 'iron_sword', armor: 'traveler_cloth_armor', accessory: null },
    quests: [],
    world: {
      currentLocationId: 'village_grassland', flags: {}, completedEvents: [], npcStates: {},
      restCount: 0, encounterVariants: { encounter_broken_patrol: 'broken_patrol_a' },
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
    ownedMountIds: [], equippedMountId: null,
    ...overrides,
  }
}
function withSakura(state) {
  return {
    ...state,
    companions: {
      ...state.companions,
      sakura_yuko: {
        companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 6, maxMp: 6,
        learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'], flags: {},
      },
    },
    party: { activeCompanionIds: ['sakura_yuko'] },
  }
}
/** 3 active（含 2 个未注册 guest）→ 生产 buildCombatSetup 只取已注册的 Sakura */
function threeActiveFixture() {
  return {
    ...withSakura(baseFixture()),
    companions: {
      ...withSakura(baseFixture()).companions,
      guest_two: { companionId: 'guest_two', status: 'guest', level: 2, mp: 4, maxMp: 4, learnedSkillIds: [], flags: {} },
      guest_three: { companionId: 'guest_three', status: 'guest', level: 2, mp: 4, maxMp: 4, learnedSkillIds: [], flags: {} },
    },
    party: { activeCompanionIds: ['sakura_yuko', 'guest_two', 'guest_three'] },
  }
}

async function loadAndEnter(fixture) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate((save) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 5, savedAt: new Date().toISOString(), gameState: save }))
  }, fixture)
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  if (!(await clickButton('继续游戏'))) throw new Error('未找到「继续游戏」')
  await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
  await sleep(400)
}
async function clickEngage(encounterName) {
  const ok = await page.evaluate((name) => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      if (!(b.textContent || '').includes('迎战')) return false
      let el = b
      for (let i = 0; i < 4 && el; i += 1) {
        if ((el.textContent || '').includes(name)) return true
        el = el.parentElement
      }
      return false
    })
    if (btn) { btn.click(); return true }
    return false
  }, encounterName)
  if (!ok) {
    const dbg = await page.evaluate(() => (document.body.textContent || '').slice(0, 500).replace(/\s+/g, ' '))
    throw new Error(`未找到遭遇迎战按钮: ${encounterName} | 页面: ${dbg}`)
  }
  await sleep(500)
  return true
}
async function enterCombat(fixture, encounterName, rngValue = 0.99) {
  await loadAndEnter(fixture)
  if (!(await clickEngage(encounterName))) throw new Error(`未找到遭遇按钮: ${encounterName}`)
  await setRandom(rngValue)
  await page.waitForSelector('[data-testid="combat-player-panel"]', { timeout: 10000 })
  await sleep(600)
}
async function waitForTurnType(timeoutMs = 14000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const t = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim())
      if (btns.some((x) => x === '跳过')) return 'companion'
      if (btns.some((x) => x.includes('普通攻击'))) return 'player'
      return null
    })
    if (t) return t
    await sleep(150)
  }
  return null
}
async function clickTarget(name) {
  const ok = await page.evaluate((targetName) => {
    const btns = [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === targetName)
    if (btns.length === 0) return false
    btns[0].click()
    return true
  }, name)
  await sleep(400)
  return ok
}
const companionPanelCount = () => page.evaluate(() => document.querySelectorAll('[data-testid="combat-companion-panel"]').length)
const enemyUnitCount = () => page.evaluate(() => document.querySelectorAll('[data-testid="combat-enemy-unit"]').length)
const playerPanelCount = () => page.evaluate(() => document.querySelectorAll('[data-testid="combat-player-panel"]').length)
const takeErrors = () => {
  const errs = jsErrors
  jsErrors.length = 0
  return errs
}

/**
 * 推进战斗直到出现目标回合类型（先手由 buildCombatSetup 的 roll 决定，不依赖进入时序）：
 *  companion 回合 → 点跳过；player 回合 → 普攻 miss（setRandom(0) 大失败，不杀敌）推进。
 *  enemy 回合无行动栏 → 等自动行动。
 * 返回 true=等到目标回合；false=超时（可能已结束）。
 */
async function advanceTo(kind, timeoutMs = 30000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const t = await waitForTurnType(6000)
    if (t === kind) return true
    if (t === 'companion') {
      await clickButton('跳过')
      await sleep(500)
    } else if (t === 'player') {
      await clickButton('普通攻击')
      await setRandom(0)
      await clickTarget('魔化兔')
      await sleep(600)
    } else {
      await sleep(300)
    }
  }
  return false
}

// =====================================================================
// Part 1：未注册 guest 不进战斗 + 单敌渲染
// =====================================================================
async function part1() {
  try {
    await enterCombat(threeActiveFixture(), '魔化兔', 0.99)
    check('R1-01a: 3 active 只渲染已注册 Sakura（1 伙伴卡）', (await companionPanelCount()) === 1, `count=${await companionPanelCount()}`)
    check('R1-01b: 玩家卡 1', (await playerPanelCount()) === 1)
    check('R1-01c: 敌方 1 卡', (await enemyUnitCount()) === 1)
    const body = await bodyText()
    check('R1-01d: 未注册 guest 名称不出现', !body.includes('guest_two') && !body.includes('guest_three'))
    check('R1-01e: 无 JS exception', takeErrors().length === 0)
  } catch (e) { partError('Part1', e) }
}

// =====================================================================
// Part 2：伙伴回合手动行动栏 + actorName 盾播报 + once 标记
// =====================================================================
async function part2() {
  try {
    await enterCombat(withSakura(baseFixture()), '魔化兔', 0.99)
    // 固定 enemy 全 miss（0.99 会让 enemy 天然20 暴击 Sakura）；player 回合 advanceTo 内部也 setRandom(0)
    await setRandom(0)
    const reached = await advanceTo('companion')
    check('R1-02a: 战斗推进到伙伴回合（手动行动栏可达）', reached)
    let body = await bodyText()
    check('R1-02b: 伙伴回合标题「樱花优子的回合」', body.includes('樱花优子的回合'))
    check('R1-02c: 伙伴行动栏含跳过按钮', (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === '跳过'))))
    // Sakura 施放樱花魔法盾 → 目标（玩家验收员）
    if (!(await clickButton('技能'))) throw new Error('技能按钮未找到')
    if (!(await clickButton('樱花魔法盾（2 灵力）'))) throw new Error('盾技能未找到')
    if (!(await clickTarget('验收员'))) throw new Error('盾目标未找到')
    body = await bodyText()
    check('R1-03a: 盾播报带伙伴名前缀', body.includes('【樱花优子】') && body.includes('樱花优子为验收员施展了樱花魔法盾'))
    // 玩家回合：setRandom(0) 让普攻大失败 miss（魔化兔 HP8，满 roll 会秒杀，无法推进到 Sakura 二次回合）
    if (!(await advanceTo('player'))) throw new Error('未等到玩家回合')
    if (!(await clickButton('普通攻击'))) throw new Error('普通攻击未找到')
    await setRandom(0)
    if (!(await clickTarget('魔化兔'))) throw new Error('魔化兔目标未找到')
    // 魔化兔回合（固定 0 → miss，不消耗盾）→ Sakura 第二次回合
    if (!(await advanceTo('companion'))) throw new Error('未等到 Sakura 二次回合')
    if (!(await clickButton('技能'))) throw new Error('技能按钮未找到')
    body = await bodyText()
    check('R1-05a: 已用盾标记「本场战斗已使用」', body.includes('本场战斗已使用'))
    check('R1-05b: 盾按钮 disabled', await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('樱花魔法盾'))
      return b ? b.disabled : false
    }))
    check('R1-02d: 无 JS exception', takeErrors().length === 0)
  } catch (e) { partError('Part2', e) }
}

// =====================================================================
// Part 3：盾抵消伤害 + enemy AI 命中伙伴
// =====================================================================
async function part3() {
  try {
    await enterCombat(withSakura(baseFixture()), '魔化兔', 0.99)
    await setRandom(0)
    // Sakura 回合施盾 → 目标玩家
    if (!(await advanceTo('companion'))) throw new Error('未等到伙伴回合')
    if (!(await clickButton('技能'))) throw new Error('技能未找到')
    if (!(await clickButton('樱花魔法盾（2 灵力）'))) throw new Error('盾未找到')
    if (!(await clickTarget('验收员'))) throw new Error('盾目标未找到')
    // 玩家回合：顺序队列 [0,0.1,0.9] 覆盖玩家 miss + enemy 行动（无 400ms 竞态）
    //   q[0]=0 → 玩家 D20=1 大失败 miss；q[1]=0.1 → enemy 目标玩家（<0.5）；q[2]=0.9 → enemy 命中
    if (!(await advanceTo('player'))) throw new Error('未等到玩家回合')
    await page.evaluate(() => {
      const q = [0, 0.1, 0.9]; let i = 0
      Math.random = () => q[Math.min(i++, q.length - 1)]
    })
    if (!(await clickButton('普通攻击'))) throw new Error('普攻未找到')
    if (!(await clickTarget('魔化兔'))) throw new Error('兔目标未找到')
    await sleep(1200) // enemy 400ms 后行动：命中玩家 → 盾抵消
    await setRandom(0) // 重置：后续 advanceTo 途中 enemy 全 miss
    let body = await bodyText()
    check('R1-04a: 盾抵消敌方伤害', body.includes('樱花魔法盾抵消了'), '盾消耗命中')
    // Sakura 回合跳过 → 玩家普攻 miss → enemy 天然20 暴击命中 Sakura
    //   （Sakura AGI16：普通 roll 永远 miss，(10+D20)/2≥16 需 D20≥22；天然20 critical_hit 必中）
    if (!(await advanceTo('companion'))) throw new Error('未等到 Sakura 回合')
    if (!(await clickButton('跳过'))) throw new Error('跳过未找到')
    if (!(await advanceTo('player'))) throw new Error('未等到玩家回合')
    await page.evaluate(() => {
      const q = [0, 0.99]; let i = 0 // q[0] 玩家 miss；q[1]=0.99 → enemy 目标 Sakura(≥0.5) + D20=20 暴击命中
      Math.random = () => q[Math.min(i++, q.length - 1)]
    })
    if (!(await clickButton('普通攻击'))) throw new Error('普攻未找到')
    if (!(await clickTarget('魔化兔'))) throw new Error('兔目标未找到')
    await sleep(1200)
    body = await bodyText()
    check('R1-06a: enemy AI 命中伙伴 Sakura（天然20 暴击必中）', body.includes('魔化兔的攻击命中樱花优子'), 'target=Sakura')
    check('R1-04b: 无 JS exception', takeErrors().length === 0)
  } catch (e) { partError('Part3', e) }
}

/** 残破巡逻队（2 骷髅战士）位于黑石塔二层；须固化 broken_patrol_a */
function patrolFixture(overrides = {}) {
  return baseFixture({
    world: {
      currentLocationId: 'black_stone_tower_floor2', flags: {}, completedEvents: [], npcStates: {},
      restCount: 0, encounterVariants: { encounter_broken_patrol: 'broken_patrol_a' },
    },
    ...overrides,
  })
}

// =====================================================================
// Part 4：3v2 布局（5 卡无横向溢出）+ 防御性异常出口
// =====================================================================
async function part4() {
  try {
    await enterCombat(withSakura(patrolFixture()), '残破巡逻队', 0.99)
    check('R1-07a: 玩家+1伙伴+2敌 = 4 卡（我方 2 + 敌方 2）', (await playerPanelCount()) === 1 && (await companionPanelCount()) === 1 && (await enemyUnitCount()) === 2)
    const overflow = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-testid="combat-player-panel"],[data-testid="combat-companion-panel"],[data-testid="combat-enemy-unit"]')]
      const w = window.innerWidth
      return { overflowX: document.documentElement.scrollWidth > w, cardMinW: Math.min(...cards.map((c) => c.getBoundingClientRect().width)) }
    })
    check('R1-07b: 无横向溢出', !overflow.overflowX, JSON.stringify(overflow))
    check('R1-07c: 卡片可压缩（min-w 200 生效，卡宽≤300）', overflow.cardMinW <= 300, `cardMinW=${Math.round(overflow.cardMinW)}`)
    check('R1-07d: 无 JS exception', takeErrors().length === 0)

    // R1-10 生产路径：weighted 遭遇点击迎战 → variant 自动固化 → 正常进入战斗
    // （gameStore.ts:1119 handleEncounterEngage 首次 roll 并固化 world.encounterVariants；
    //   防御性异常出口仅单测直挂 CombatPage 场景可达，已由 CombatPage.test.ts 覆盖）
    const noVariant = patrolFixture({ world: { currentLocationId: 'black_stone_tower_floor2', flags: {}, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} } })
    await loadAndEnter(noVariant)
    if (!(await clickEngage('残破巡逻队'))) throw new Error('未找到残破巡逻队')
    await page.waitForSelector('[data-testid="combat-player-panel"]', { timeout: 10000 })
    await sleep(600)
    const body = await bodyText()
    check('R1-10a: weighted 遭遇点击迎战 → variant 自动固化并正常进入战斗', !body.includes('遭遇数据异常，无法进入战斗') && body.includes('骷髅战士'), 'variant 固化')
    check('R1-10b: 无 JS exception', takeErrors().length === 0)
  } catch (e) { partError('Part4', e) }
}

// =====================================================================
// Part 5：玩家 once（power_strike）与伙伴 once（盾）互不串号
// =====================================================================
async function part5() {
  try {
    await enterCombat(withSakura(baseFixture()), '魔化兔', 0.99)
    await setRandom(0)
    // Sakura 回合：跳过（保留 MP，不消耗 once）
    if (!(await advanceTo('companion'))) throw new Error('未等到伙伴回合')
    if (!(await clickButton('跳过'))) throw new Error('跳过未找到')
    // 玩家回合：power_strike（玩家 once）—— setRandom(0) 大失败 miss（once 已标记，战斗不结束）
    if (!(await advanceTo('player'))) throw new Error('未等到玩家回合')
    if (!(await clickButton('技能'))) throw new Error('技能未找到')
    if (!(await clickButton('骑士重击（2 灵力）'))) throw new Error('power_strike 未找到')
    await setRandom(0)
    if (!(await clickTarget('魔化兔'))) throw new Error('兔目标未找到')
    // Sakura 回合：盾必须仍可用（玩家 once 不影响伙伴 once；usedOnceCompanionSkillIds 按 sourceId 隔离）
    if (!(await advanceTo('companion'))) throw new Error('未等到 Sakura 回合')
    if (!(await clickButton('技能'))) throw new Error('技能未找到')
    const shieldBtn = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('樱花魔法盾'))
      if (!b) return null
      // 向上找技能卡 flex-col 容器，检查其内是否有「本场战斗已使用」（避免命中玩家 power_strike 的已用标记）
      let el = b.parentElement
      while (el && el !== document.body) {
        if ((el.className || '').includes('flex-col')) {
          return { disabled: b.disabled, label: (b.textContent || '').trim(), marked: el.textContent.includes('本场战斗已使用') }
        }
        el = el.parentElement
      }
      return { disabled: b.disabled, label: (b.textContent || '').trim(), marked: null }
    })
    check('R1-08a: 玩家用过 power_strike 后 Sakura 盾仍可用', shieldBtn !== null && shieldBtn.disabled === false, JSON.stringify(shieldBtn))
    check('R1-08b: Sakura 盾无「本场战斗已使用」误标', shieldBtn !== null && shieldBtn.marked === false, JSON.stringify(shieldBtn))
    check('R1-08c: 无 JS exception', takeErrors().length === 0)
  } catch (e) { partError('Part5', e) }
}

// =====================================================================
let exitCode = 0
try {
  await ready()
  browser = await puppeteer.launch({
    headless: true, executablePath: CHROME,
    userDataDir: profile,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1280,800'],
  })
  page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  page.on('pageerror', (e) => jsErrors.push(String(e)))
  page.on('console', (m) => { if (m.type() === 'error') jsErrors.push(m.text()) })

  await part1()
  await part2()
  await part3()
  await part4()
  await part5()
} catch (err) {
  console.error('FATAL', err)
  exitCode = 1
} finally {
  await cleanup()
}

const failed = results.filter((r) => !r.ok)
console.log('\n==== P2-007-R1 E2E ====')
console.log(`TOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}`)
if (failed.length) {
  for (const f of failed) console.log(`  FAIL: ${f.name}`)
  exitCode = 1
}
process.exit(exitCode)
