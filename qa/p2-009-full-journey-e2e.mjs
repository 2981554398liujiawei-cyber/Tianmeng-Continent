// ============================================================================
// 《天梦大陆》TM-P2-009 §9/§31 北线完整旅程浏览器 E2E 验收（FJ1-FJ6）。
//
// 覆盖：北门失联 → 北郊追踪 → 断旗余声 三段北线剧情无缝衔接 + 窄前置门控。
//   FJ1  北门失联提交后，马科发布《北郊追踪》行动块（北郊 available）
//   FJ2  北郊未 completed 时，《断旗余声》发布块不出现（窄前置链 §31）
//   FJ3  北郊 completed 后，《断旗余声》发布块出现（马科发布）
//   FJ4  完整旅程三段全部打通（北门失联→北郊追踪→断旗余声→提交→P2-010 正式试炼入口）
//   FJ5  全程无 Production ID leak（quest_/clue_/enemy_/encounter_/location_/item_/skill_/companion_/mount_）
//   FJ6  全程无 JS exception
//
// 运行前提：无（脚本自备本地 dev server 5243）。
// 运行：node qa/p2-009-full-journey-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_009_FULL_JOURNEY_E2E_PORT || 5243)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-009-journey-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL
  ? null
  : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: profile,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 900 })
const jsErrors = []
page.on('pageerror', (err) => jsErrors.push(String(err)))

async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')
const mainColText = () => page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')

async function enterLocalModeIfNeeded() {
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式'))
    if (!button) return false
    button.click()
    return true
  })
  if (clicked) await sleep(SLEEP)
}

async function clickButton(label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(text))
    if (!button || button.disabled) return false
    button.click()
    return true
  }, label)
  if (clicked) await sleep(SLEEP)
  return clicked
}

async function clickTestId(testId) {
  const clicked = await page.evaluate((id) => {
    const button = document.querySelector(`[data-testid="${id}"]`)
    if (!button || button.disabled) return false
    button.click()
    return true
  }, testId)
  if (clicked) await sleep(SLEEP)
  return clicked
}

/** 在点击前覆盖 Math.random（保证检定确定性），点击后恢复 */
async function clickWithRoll(testId, value) {
  await page.evaluate((id, v) => {
    window.__savedRandom = Math.random
    Math.random = () => v
    document.querySelector(`[data-testid="${id}"]`)?.click()
    Math.random = window.__savedRandom
  }, testId, value)
  await sleep(SLEEP)
}

const leakedPrefixes = async () => {
  const text = await bodyText()
  return ID_PREFIXES.filter((p) => text.includes(p))
}

/**
 * 完整旅程 fixture：武馆 + 北门失联 completable（可提交）+ 北郊追踪 available（未接）。
 * 三段任务链前置均为真，供 UI 顺序推进。
 */
function fFullJourney() {
  return {
    player: {
      id: 'player-p2-009-journey', name: '北线全程验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_north_gate_missing_patrol', status: 'completable', stage: 0, flags: {} },
      { questId: 'quest_north_outskirts', status: 'available', stage: 0, flags: {} },
    ],
    world: {
      currentLocationId: 'tianlong_martial_hall', flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: {},
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
    ownedMountIds: [], equippedMountId: null,
  }
}

/** 窄前置 fixture：武馆 + 北门失联 completed + 北郊 NOT completed（断旗余声发布块应不出现） */
function fNarrowGate() {
  return {
    player: {
      id: 'player-p2-009-gate', name: '窄前置验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_north_gate_missing_patrol', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_north_outskirts', status: 'in_progress', stage: 0, flags: { north_outskirts_trail_tracked: true } },
    ],
    world: {
      currentLocationId: 'tianlong_martial_hall', flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: {},
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
    ownedMountIds: [], equippedMountId: null,
  }
}

async function loadAndEnterLocal(save) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate((s) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s }))
  }, save)
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await clickButton('继续游戏')
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 })
  await sleep(400)
}

let section = 0
try {
  await ready()

  // ==================== 场景 1：窄前置门控（FJ2）+ 完整旅程（FJ1/FJ3/FJ4） ====================
  await loadAndEnterLocal(fFullJourney())
  section = 1

  // ---- FJ1：北门失联提交 → 北郊追踪发布块出现 ----
  let main = await mainColText()
  check('FJ1: 武馆存在「提交任务」按钮（北门失联 completable）', (await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim())
    return btns.some((t) => t === '提交任务')
  })) === true)
  await clickButton('提交任务')
  await sleep(500)
  check('FJ1: 提交后出现《北郊追踪》接受按钮（accept-north-outskirts）', (await page.$('[data-testid="accept-north-outskirts"]')) !== null)

  // ---- FJ2：此时北郊尚未 completed，断旗余声发布块不应出现 ----
  check('FJ2: 北郊未 completed 时断旗余声发布块不出现', (await page.$('[data-testid="accept-north-broken-banner"]')) === null)

  // ---- 接北郊追踪 → 完成全部 Stage（武馆→北门 Stage A 追踪→北郊搜索→调查→北门回报→武馆提交）----
  // 注：track-north-trail（Stage A）只在北门场景渲染，北郊按钮需先解锁（north_outskirts_unlocked）。
  await clickTestId('accept-north-outskirts')
  await clickButton('天龙城')
  await clickButton('天龙城北门')
  await clickTestId('track-north-trail')
  await clickButton('天龙城北郊')
  await clickTestId('search-north-ambush')
  await clickWithRoll('investigate-mnd', 0.99)
  await clickButton('天龙城北门')
  await clickTestId('report-north-outskirts')
  await clickButton('天龙城')
  await clickButton('武馆')
  await clickButton('提交任务')
  await sleep(500)
  const afterNorth = await bodyText()
  check('FJ1: 北郊追踪提交完成（冒险阅历 +100）', afterNorth.includes('冒险阅历 +100'), afterNorth.match(/任务完成[\s\S]{0,60}/)?.[0] ?? '')

  // ---- FJ3：北郊 completed 后断旗余声发布块出现 ----
  check('FJ3: 北郊 completed 后《断旗余声》接受按钮出现', (await page.$('[data-testid="accept-north-broken-banner"]')) !== null)

  // ---- FJ4：断旗余声全链路（接→简报→旧驿站→搜索→解屏障→搜救→问沈拓→回报→提交→试炼预告）----
  await clickTestId('accept-north-broken-banner')
  await clickTestId('brief-north-broken-banner')
  await clickButton('天龙城')
  await clickButton('天龙城北门')
  await clickButton('天龙城北郊')
  await clickButton('北郊旧驿站')
  main = await mainColText()
  check('FJ4: 进入北郊旧驿站场景', main.includes('北郊旧驿站'))
  await clickTestId('search-waystation')
  await clickWithRoll('barrier-mnd', 0.99)
  check('FJ4: 屏障解除推进搜救（rescue-survivor 出现）', (await page.$('[data-testid="rescue-survivor"]')) !== null)
  await clickTestId('rescue-survivor')
  await clickTestId('debrief-survivor')
  await clickButton('天龙城北郊')
  await clickButton('天龙城北门')
  await clickButton('天龙城')
  await clickButton('武馆')
  await clickTestId('report-north-broken-banner')
  await clickButton('提交任务')
  await sleep(500)
  const afterBanner = await bodyText()
  check('FJ4: 断旗余声提交完成（冒险阅历 +120）', afterBanner.includes('冒险阅历 +120'), afterBanner.match(/任务完成[\s\S]{0,60}/)?.[0] ?? '')
  main = await mainColText()
  check('FJ4: P2-010 正式试炼入口兑现原 §17 预告', main.includes('天龙武备试炼') && main.includes('接受试炼') && !main.includes('试炼内容尚待展开'))

  const leakedJourney = await leakedPrefixes()
  check('FJ5: 全程无 Production ID leak', leakedJourney.length === 0, leakedJourney.join(','))
  check('FJ6: 全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '))

  // ==================== 场景 2：窄前置独立复核（北郊 in_progress 时断旗余声不可见） ====================
  await loadAndEnterLocal(fNarrowGate())
  section = 2
  main = await mainColText()
  check('FJ2b: 北郊 in_progress（非 completed）时断旗余声发布块不出现', (await page.$('[data-testid="accept-north-broken-banner"]')) === null)
  const leakedGate = await leakedPrefixes()
  check('FJ5b: 全程无 Production ID leak（窄前置场景）', leakedGate.length === 0, leakedGate.join(','))
} catch (error) {
  check('Full Journey E2E 脚本执行无异常', false, String(error))
} finally {
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
  try { if (dev) dev.kill() } catch { /* 已退出 */ }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-009 §9/§31 北线完整旅程 E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
