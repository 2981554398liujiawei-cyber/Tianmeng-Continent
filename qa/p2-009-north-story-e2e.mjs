// ============================================================================
// 《天梦大陆》TM-P2-009 §9-19 北线剧情《断旗余声》全流程浏览器 E2E 验收（NS1-NS14）。
//
// 覆盖：
//   NS1  北郊 completed 后，武馆马科发布《断旗余声》行动块（北郊驿站的传闻）+ 接受按钮
//   NS2  接受任务 → in_progress（右栏当前目标《断旗余声》）+ toast
//   NS3  Stage A 武馆「听马科说明驿站情况」→ make_briefed + 解锁旧驿站 + toast 任务更新
//   NS4  北郊场景出现「北郊旧驿站」travel 按钮 → 进入北郊旧驿站
//   NS5  Stage B「搜索驿站」→ searched + 线索断裂队旗 + Stage C 出现
//   NS6  Stage C 多解按钮条件（combat/MND/LCK 显示；无 Sakura/坐骑时隐藏）
//   NS7  MND 检定失败可重试（§13 不软阻断）
//   NS8  MND 检定成功 → 推进 Stage D（搜救按钮出现）
//   NS9  Stage D 搜救幸存者 → 事件 north_survivor_rescued（日志仅用户文案）+ 线索黑篷车辙
//   NS10 Stage E 向沈拓了解详情 → 线索魔化诱饵
//   NS11 Stage F 武馆向马科汇报 → 可提交
//   NS12 提交任务 → completed + 50 金 + 120 XP + P2-010 正式试炼入口（兑现原 §17 预告）
//   NS13 战斗解联动：驿站狼群 neutralized 后 barrier-combat 变「战斗已完成，进入后院」→ 推进 + 线索魔化诱饵
//   NS14 全程无 Production ID leak + 无 JS exception
//
// 分支场景（独立 fixture）：
//   - 场景 2（combat 解）：旧驿站 + searched + neutralized → 验证战斗完成后屏障可破
//   - 场景 3（Sakura 路线，TM-P2-009-R1 §2.1）：barrier-sakura → 找到安全路线，真正解决屏障 + 线索魔化诱饵
//   - 场景 4（Mount 路线，TM-P2-009-R1 §2.1）：barrier-mount → 骑马引开狼群，真正解决屏障 + 线索黑篷车辙
//   - 场景 5（LCK 解）：barrier-lck 成功 → 线索黑篷车辙 + 推进
//   - 场景 6（驿站狼群遭遇卡）：未 neutralized → 遭遇卡展示成员构成
//
// 运行前提：无（脚本自备本地 dev server 5242）。
// 运行：node qa/p2-009-north-story-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_009_NORTH_STORY_E2E_PORT || 5242)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-009-north-'))
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
const sidebarText = () => page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')

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

const toastText = async () => page.evaluate(() => document.querySelector('[role="status"]')?.textContent?.trim() ?? null)

/** 切到右栏线索 Tab（角标计数触发已读），返回线索 Tab 内全部文本 */
async function openCluesTabAndText() {
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const tab = qc && [...qc.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim().startsWith('线索'))
    if (tab) tab.click()
  })
  await sleep(300)
  return sidebarText()
}

/** 切回右栏任务 Tab */
async function clickTabBack() {
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const tab = qc && [...qc.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim().startsWith('任务'))
    if (tab) tab.click()
  })
  await sleep(300)
}

/** 基础玩家（Lv2 骑士，MND8/LCK10） */
function basePlayer() {
  return {
    id: 'player-p2-009-north', name: '断旗余声验收员', gender: 'male', level: 2, profession: 'knight',
    attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
    hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
    learnedSkillIds: ['knight_power_strike'],
  }
}

/**
 * 主线 fixture：武馆 + 《北郊追踪》completed + 《断旗余声》未发现（马科发布块可接）。
 */
function fMain() {
  return {
    player: basePlayer(),
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [{ questId: 'quest_north_outskirts', status: 'completed', stage: 0, flags: {} }],
    world: {
      currentLocationId: 'tianlong_martial_hall',
      // 北郊 completed ⇒ Stage A-D 全走完 ⇒ north_outskirts_unlocked 必为 true（否则北郊旅行按钮 locked）
      flags: { north_outskirts_unlocked: true },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
    ownedMountIds: [], equippedMountId: null,
  }
}

/**
 * 旧驿站 fixture：旧驿站 + 《断旗余声》in_progress + make_briefed/searched 完成 + barrier_resolved 未解。
 * opts: neutralized（狼群已击退）/ sakura（樱华随行）/ mount（装备火焰驹）。
 */
function fWaystation(opts = {}) {
  const { neutralized = false, sakura = false, mount = false } = opts
  return {
    player: basePlayer(),
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      {
        questId: 'quest_north_broken_banner',
        status: 'in_progress',
        stage: 0,
        flags: { north_broken_banner_make_briefed: true, north_waystation_searched: true },
      },
    ],
    world: {
      currentLocationId: 'tianlong_north_abandoned_waystation',
      flags: {
        // 旧驿站连接北郊：玩家必经北郊（north_outskirts_unlocked=true）才可到达，故回程按钮应可点
        north_outskirts_unlocked: true,
        north_waystation_unlocked: true,
        ...(neutralized ? { waystation_wolf_pack_neutralized: true } : {}),
      },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
    companions: sakura
      ? {
          sakura_yuko: {
            companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 6, maxMp: 6,
            learnedSkillIds: ['sakura_petalslash'], flags: {},
          },
        }
      : {},
    relationships: {},
    party: { activeCompanionIds: sakura ? ['sakura_yuko'] : [] },
    ownedMountIds: mount ? ['fire_stallion'] : [],
    equippedMountId: mount ? 'fire_stallion' : null,
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

  // ==================== 场景 1：主线 A-F（NS1-NS12 + NS14） ====================
  await loadAndEnterLocal(fMain())
  section = 1

  // ---- NS1：马科发布块 + 接受按钮 ----
  let main = await mainColText()
  check('NS1: 武馆显示马科发布块「北郊驿站的传闻」', main.includes('北郊驿站的传闻') && main.includes('第三巡逻队最后一次传回消息'))
  check('NS1: 发布块显示「接受任务：断旗余声」按钮', (await page.$('[data-testid="accept-north-broken-banner"]')) !== null)
  const leaked1 = await leakedPrefixes()
  check('NS14a: 全程无 Production ID leak（stage 1）', leaked1.length === 0, leaked1.join(','))

  // ---- NS2：接受任务 ----
  await clickTestId('accept-north-broken-banner')
  let side = await sidebarText()
  check('NS2: 接受后右栏「进行中（1）」含《断旗余声》', side.includes('进行中（1）') && side.includes('断旗余声'))
  check('NS2: 接受后发布块切换当前目标（接受按钮消失）', (await page.$('[data-testid="accept-north-broken-banner"]')) === null)

  // ---- NS3：Stage A 简报 ----
  check('NS3: 武馆出现「听马科说明驿站情况」', (await page.$('[data-testid="brief-north-broken-banner"]')) !== null)
  await clickTestId('brief-north-broken-banner')
  const toast3 = await toastText()
  check('NS3: 简报 toast「任务更新：前往北郊旧驿站」', toast3 !== null && toast3.includes('前往北郊旧驿站'), `toast=${toast3}`)
  check('NS3: 简报后 Stage A 按钮消失', (await page.$('[data-testid="brief-north-broken-banner"]')) === null)

  // ---- NS4：旅行到旧驿站（武馆→天龙城→北门→北郊→旧驿站）----
  await clickButton('天龙城')
  await clickButton('天龙城北门')
  await clickButton('天龙城北郊')
  main = await mainColText()
  check('NS4: 到达北郊场景（天龙城北郊）', main.includes('天龙城北郊'))
  check('NS4: 北郊 travel 区出现「北郊旧驿站」（解锁）', (await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim())
    return btns.includes('北郊旧驿站') && !document.body.textContent.includes('尚未找到进入此地的方法')
  })) === true)
  await clickButton('北郊旧驿站')
  main = await mainColText()
  check('NS4: 进入北郊旧驿站场景', main.includes('北郊旧驿站') && main.includes('半塌的驿站立在官道岔口'))

  // ---- NS5：Stage B 搜索驿站 ----
  check('NS5: 旧驿站出现「搜索驿站」', (await page.$('[data-testid="search-waystation"]')) !== null)
  await clickTestId('search-waystation')
  const toast5 = await toastText()
  check('NS5: 搜索 toast「获得新线索：断裂队旗」', toast5 !== null && toast5.includes('断裂队旗'), `toast=${toast5}`)
  check('NS5: 搜索后 Stage C 出现（barrier-mnd）', (await page.$('[data-testid="barrier-mnd"]')) !== null)
  let clueSide = await openCluesTabAndText()
  check('NS5: 线索录含「断裂队旗」', clueSide.includes('断裂队旗'))
  await clickTabBack()

  // ---- NS6：Stage C 多解按钮条件 ----
  check('NS6: combat 解按钮可见', (await page.$('[data-testid="barrier-combat"]')) !== null)
  check('NS6: MND 检定按钮可见', (await page.$('[data-testid="barrier-mnd"]')) !== null)
  check('NS6: LCK 检定按钮可见', (await page.$('[data-testid="barrier-lck"]')) !== null)
  check('NS6: 无 Sakura 在场时 Sakura 按钮隐藏', (await page.$('[data-testid="barrier-sakura"]')) === null)
  check('NS6: 未装备坐骑时 Mount 按钮隐藏', (await page.$('[data-testid="barrier-mount"]')) === null)

  // ---- NS7：MND 检定失败可重试（roll 0.1 → roll 3 → total < DC 12）----
  await clickWithRoll('barrier-mnd', 0.1)
  main = await mainColText()
  check('NS7: 检定失败提示「狼群没有散开，但你可以再试一次」', main.includes('狼群没有散开，但你可以再试一次'))
  check('NS7: 失败后按钮保留（可重试，不软阻断）', (await page.$('[data-testid="barrier-mnd"]')) !== null)

  // ---- NS8：MND 检定成功（roll 0.99 → roll 20 → total ≥ DC 12）----
  await clickWithRoll('barrier-mnd', 0.99)
  check('NS8: 成功后 Stage C 按钮消失', (await page.$('[data-testid="barrier-mnd"]')) === null)
  check('NS8: 推进 Stage D（搜救按钮出现）', (await page.$('[data-testid="rescue-survivor"]')) !== null)

  // ---- NS9：Stage D 搜救幸存者 ----
  await clickTestId('rescue-survivor')
  const toast9 = await toastText()
  check('NS9: 搜救 toast「你救出了一名幸存的巡逻骑士」', toast9 !== null && toast9.includes('救出了一名幸存的巡逻骑士'), `toast=${toast9}`)
  check('NS9: 推进 Stage E（询问沈拓按钮出现）', (await page.$('[data-testid="debrief-survivor"]')) !== null)
  clueSide = await openCluesTabAndText()
  check('NS9: 搜救后线索录含「黑篷车辙」', clueSide.includes('黑篷车辙'))
  await clickTabBack()

  // ---- NS10：Stage E 向沈拓了解详情 ----
  await clickTestId('debrief-survivor')
  const toast10 = await toastText()
  check('NS10: 询问沈拓 toast「获得新线索：魔化诱饵」', toast10 !== null && toast10.includes('魔化诱饵'), `toast=${toast10}`)
  check('NS10: 推进 Stage F（武馆回报按钮——需回武馆）', (await page.$('[data-testid="report-north-broken-banner"]')) === null)

  // ---- 回武馆（旧驿站→北郊→北门→天龙城→武馆）----
  await clickButton('天龙城北郊')
  await clickButton('天龙城北门')
  await clickButton('天龙城')
  await clickButton('武馆')
  main = await mainColText()
  check('NS11: 回到武馆', main.includes('武馆'))

  // ---- NS11：Stage F 回报马科 ----
  check('NS11: 武馆出现「向马科汇报」', (await page.$('[data-testid="report-north-broken-banner"]')) !== null)
  await clickTestId('report-north-broken-banner')
  side = await sidebarText()
  // 回报后 status→completable；玩家在武馆（马科所在地），右栏可提交区显示「提交任务」按钮
  // （「前往任务发布者处提交」只在不在发布者所在地时显示）。
  check('NS11: 回报后任务进入「可提交（1）」', side.includes('可提交（1）') && side.includes('断旗余声'), side.slice(0, 120))
  check('NS11: 武馆可提交区显示「提交任务」按钮', side.includes('提交任务'))

  // ---- NS12：提交任务 → completed + 50 金 + 120 XP + 正式试炼入口 ----
  await clickButton('提交任务')
  await sleep(500)
  const afterSubmit = await bodyText()
  const noticeSnippet = afterSubmit.match(/任务完成[\s\S]{0,60}/)?.[0] ?? '(未找到任务完成文案)'
  check('NS12: 提交反馈显示任务完成 + 金币 +50', afterSubmit.includes('任务完成') && afterSubmit.includes('金币 +50'), noticeSnippet)
  check('NS12: 冒险阅历 +120', afterSubmit.includes('冒险阅历 +120'))
  main = await mainColText()
  check('NS12: P2-010 正式试炼入口兑现 P2-009 预告', main.includes('天龙武备试炼') && main.includes('接受试炼'))
  check('NS12: 旧「尚待展开」文案已替换为可操作入口', !main.includes('试炼内容尚待展开') && main.includes('武备场会观察'))
  const leaked12 = await leakedPrefixes()
  check('NS14b: 全程无 Production ID leak（stage 12）', leaked12.length === 0, leaked12.join(','))

  // ---- NS9b：搜救事件在日志中以用户文案呈现（§6 ID 隐藏）----
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const tab = qc && [...qc.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim().startsWith('日志'))
    if (tab) tab.click()
  })
  await sleep(300)
  side = await sidebarText()
  check('NS9b: 日志展示「你在北郊旧驿站救出了失联巡逻骑士沈拓」', side.includes('你在北郊旧驿站救出了失联巡逻骑士沈拓'))
  check('NS9b: 日志展示「马科认可了你的北线表现，并准备安排正式骑士试炼」', side.includes('马科认可了你的北线表现'))
  const leakedLog = await leakedPrefixes()
  check('NS9b: 事件内部 id 不出现在 DOM', leakedLog.length === 0 && !(await bodyText()).includes('north_survivor_rescued') && !(await bodyText()).includes('knight_trial_invited'), leakedLog.join(','))

  // ==================== 场景 2：combat 解联动（§13） ====================
  await loadAndEnterLocal(fWaystation({ neutralized: true }))
  section = 2
  check('NS13: 狼群已击退时 barrier-combat 变「战斗已完成，进入后院」', (await page.evaluate(() => {
    const btn = document.querySelector('[data-testid="barrier-combat"]')
    return btn ? btn.textContent.trim() : null
  })) === '战斗已完成，进入后院')
  // Stage C 行动块标题「断旗余声 · 驿站狼群」始终含「驿站狼群」字样，
  // 但独立遭遇卡（「附近威胁」区，checkEncounter 守卫）在 neutralized 后必须消失。
  // 用「含驿站狼群 && 含迎战」精确匹配遭遇卡。
  check('NS13: 遭遇卡「驿站狼群」消失（neutralized 门）', (await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((d) => d.textContent?.includes('驿站狼群') && d.textContent?.includes('迎战'))
    return !card
  })) === true)
  await clickTestId('barrier-combat')
  const toast13 = await toastText()
  check('NS13: combat 解 toast「获得新线索：魔化诱饵」', toast13 !== null && toast13.includes('魔化诱饵'), `toast=${toast13}`)
  check('NS13: combat 解推进 Stage D（搜救按钮出现）', (await page.$('[data-testid="rescue-survivor"]')) !== null)
  const leakedCombat = await leakedPrefixes()
  check('NS13: 全程无 Production ID leak（combat 解）', leakedCombat.length === 0, leakedCombat.join(','))

  // ==================== 场景 3：Sakura 路线（TM-P2-009-R1 §2.1：找到安全路线 → 真正解决屏障） ====================
  await loadAndEnterLocal(fWaystation({ sakura: true }))
  section = 3
  check('NS14c: Sakura 在场时显示「请樱花优子寻找安全路线」', (await page.$('[data-testid="barrier-sakura"]')) !== null)
  await clickTestId('barrier-sakura')
  const toastSakura = await toastText()
  check('NS14c: Sakura 反馈 toast「找到绕过狼群的安全路线」', toastSakura !== null && toastSakura.includes('绕过狼群的安全路线'), `toast=${toastSakura}`)
  check('NS14c: Sakura 路线真正解决（推进 Stage D，搜救按钮出现）', (await page.$('[data-testid="rescue-survivor"]')) !== null)
  clueSide = await openCluesTabAndText()
  check('NS14c: Sakura 路线得线索「魔化诱饵」', clueSide.includes('魔化诱饵'))
  await clickTabBack()
  const leakedSakura = await leakedPrefixes()
  check('NS14c: 全程无 Production ID leak（Sakura 解）', leakedSakura.length === 0, leakedSakura.join(','))

  // ==================== 场景 4：Mount 路线（TM-P2-009-R1 §2.1：骑马引开狼群后从另一侧进入 → 真正解决屏障） ====================
  await loadAndEnterLocal(fWaystation({ mount: true }))
  section = 4
  check('NS14d: 装备坐骑时显示「骑马引开狼群后从另一侧进入」', (await page.$('[data-testid="barrier-mount"]')) !== null)
  await clickTestId('barrier-mount')
  const toastMount = await toastText()
  check('NS14d: Mount 反馈 toast「骑马引开狼群后从另一侧进入」', toastMount !== null && toastMount.includes('骑马引开狼群后从另一侧进入'), `toast=${toastMount}`)
  check('NS14d: Mount 路线真正解决（推进 Stage D，搜救按钮出现）', (await page.$('[data-testid="rescue-survivor"]')) !== null)
  clueSide = await openCluesTabAndText()
  check('NS14d: Mount 路线得线索「黑篷车辙」', clueSide.includes('黑篷车辙'))
  await clickTabBack()
  const leakedMount = await leakedPrefixes()
  check('NS14d: 全程无 Production ID leak（Mount 解）', leakedMount.length === 0, leakedMount.join(','))

  // ==================== 场景 5：LCK 解（独立路径） ====================
  await loadAndEnterLocal(fWaystation())
  section = 5
  await clickWithRoll('barrier-lck', 0.99)
  check('NS14e: LCK 检定成功推进 Stage D', (await page.$('[data-testid="rescue-survivor"]')) !== null)
  clueSide = await openCluesTabAndText()
  check('NS14e: LCK 解得线索「黑篷车辙」', clueSide.includes('黑篷车辙'))
  await clickTabBack()
  const leakedLck = await leakedPrefixes()
  check('NS14e: 全程无 Production ID leak（LCK 解）', leakedLck.length === 0, leakedLck.join(','))

  // ==================== 场景 6：驿站狼群遭遇卡展示（§13 可战遭遇） ====================
  await loadAndEnterLocal(fWaystation())
  section = 6
  main = await mainColText()
  check('NS14f: 旧驿站展示遭遇「驿站狼群」', main.includes('驿站狼群'))
  check('NS14f: 遭遇成员摘要「荒原野狼×2+魔化狼」', main.includes('荒原野狼×2+魔化狼'), (main.match(/附近威胁[\s\S]{0,40}/) || [])[0] ?? '')
  check('NS14f: 遭遇「迎战」按钮存在', (await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((d) => d.textContent?.includes('驿站狼群'))
    return !!card && card.textContent.includes('迎战')
  })) === true)
  const leakedEnc = await leakedPrefixes()
  check('NS14f: 全程无 Production ID leak（遭遇卡）', leakedEnc.length === 0, leakedEnc.join(','))

  check('NS14: 全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('North Story E2E 脚本执行无异常', false, String(error))
} finally {
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
  try { if (dev) dev.kill() } catch { /* 已退出 */ }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-009 §9-19 断旗余声全流程 E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
