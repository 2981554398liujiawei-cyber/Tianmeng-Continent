// ============================================================================
// 《天梦大陆》TM-P2-009 §4-8 AdventureSidebar 封板修复浏览器 E2E 验收（S1-S8）。
//
// 覆盖（§4-8 遗留问题收口）：
//   S1  线索卡默认折叠：切到线索 Tab 后 description/source 不渲染（仅标题+分类+展开按钮）
//   S2  点「展开」→ description + 来源出现，按钮变「收起」；点「收起」→ 恢复折叠
//   S3  同一时间最多展开 1 条（展开 A 后再展开 B，A 自动收起）
//   S4  UI-only 未读线索：存量线索视为已读（无角标）；新发现线索 → 线索 Tab 数字角标；
//       打开线索 Tab 后已读（角标消失）。seenClueIds 纯 UI state，不进 GameState/Save
//   S5  日志 Tab「最近记录」上限 5 条（>5 时显示「查看全部」按钮）
//   S6  消息中心 Drawer 上限 20 条（25 条村长事件中只渲染 14 条 = 20 − 6 已完成任务）
//   S7  日志内部 ID 不泄露：north_survivor_rescued / knight_trial_invited 只显示用户文案
//       （「你在北郊旧驿站救出了失联巡逻骑士沈拓」「马科认可了你的北线表现」），
//       内部 event id 不出现在 DOM
//   S8  全程无 Production ID leak + 无 JS exception
//
// 运行前提：无（脚本自备本地 dev server 5241）。
// 运行：node qa/p2-009-sidebar-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_009_SIDEBAR_E2E_PORT || 5241)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-009-sidebar-'))
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

/** 右栏线索 Tab 按钮的文本（角标数字拼在其后，如「线索」「线索1」） */
const clueTabText = () =>
  page.evaluate(() => {
    const tl = document.querySelector('[role="tablist"]')
    if (!tl) return null
    const tab = [...tl.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim().startsWith('线索'))
    return tab ? tab.textContent.trim() : null
  })

/** 切换到右栏指定 Tab（任务 / 线索 / 日志） */
async function clickTab(label) {
  const clicked = await page.evaluate((text) => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    if (!qc) return false
    const tab = [...qc.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim().startsWith(text))
    if (!tab || tab.disabled) return false
    tab.click()
    return true
  }, label)
  if (clicked) await sleep(300)
  return clicked
}

/** 查右栏线索 Tab 内 title 含 t 的线索卡（li）文本 */
const clueCardText = (t) =>
  page.evaluate((title) => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    if (!qc) return null
    const cards = [...qc.querySelectorAll('li')]
    const card = cards.find((li) => li.textContent?.includes(title))
    return card ? card.textContent : null
  }, t)

/** 打开消息中心 Drawer 后，其中「你向村长表示」出现次数（用于验证 20 条上限截断） */
const messageCenterElderCount = () =>
  page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="消息中心"]')
    const t = dlg ? dlg.textContent ?? '' : ''
    return (t.match(/你向村长表示/g) || []).length
  })

/**
 * S fixture。
 *  - 旧驿站 + 《断旗余声》in_progress（make_briefed 完成、searched 未完成 → Stage B 可搜索）
 *  - 存量已发现线索 2 条（clue_rabbit_path / clue_north_black_mane）→ 页面加载视为已读
 *  - 已完成任务 6 个 + 活动事件 27 个（north_survivor_rescued / knight_trial_invited / 25×村长事件）
 *    → 活动项 34 条：最近记录只显示 5，消息中心只显示 20（6 已完成任务 + 14 村长事件）
 */
function fixture() {
  return {
    player: {
      id: 'player-p2-009-sidebar', name: '面板修复验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_north_broken_banner', status: 'in_progress', stage: 0, flags: { north_broken_banner_make_briefed: true } },
      { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_apothecary_herb_route', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_blacksmith_mine_remnant', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_grassland_wolf', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_north_gate_missing_patrol', status: 'completed', stage: 0, flags: {} },
    ],
    world: {
      currentLocationId: 'tianlong_north_abandoned_waystation',
      flags: { clue_rabbit_path: true, clue_north_black_mane: true },
      completedEvents: [
        'north_survivor_rescued',
        'knight_trial_invited',
        ...Array.from({ length: 25 }, () => 'village_elder_post_quest_response'),
      ],
      npcStates: {}, restCount: 0, encounterVariants: {},
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
  await loadAndEnterLocal(fixture())
  section = 1

  // ==================== S4a：存量线索视为已读 + 搜索驿站获得新线索 → 未读角标 ====================
  const leaked0 = await leakedPrefixes()
  check('S8a: 全程无 Production ID leak（进入场景）', leaked0.length === 0, leaked0.join(','))

  const tabBefore = await clueTabText()
  check('S4: 存量线索视为已读（线索 Tab 无数字角标）', tabBefore === '线索', `tab="${tabBefore}"`)

  // Stage B：搜索驿站 → guaranteed 线索「断裂队旗」→ 新线索未读（角标「线索1」）
  check('S4: 旧驿站处于 Stage B（搜索驿站按钮存在）', (await page.$('[data-testid="search-waystation"]')) !== null)
  await clickTestId('search-waystation')
  const toast4 = await toastText()
  check('S4: 搜索驿站 toast 提示获得线索「断裂队旗」', toast4 !== null && toast4.includes('断裂队旗'), `toast=${toast4}`)
  const tabUnread = await clueTabText()
  check('S4: 新发现线索后线索 Tab 角标变为「线索1」', tabUnread === '线索1', `tab="${tabUnread}"`)

  // Stage C 出现（搜索推进）
  check('S4: 搜索后 Stage C 屏障按钮出现（barrier-mnd）', (await page.$('[data-testid="barrier-mnd"]')) !== null)

  // ==================== S1-S3 + S4b：打开线索 Tab → 已读 + 折叠交互 ====================
  await clickTab('线索')
  const tabOpened = await clueTabText()
  check('S4: 打开线索 Tab 后未读角标消失', tabOpened === '线索', `tab="${tabOpened}"`)

  // S1：默认折叠——description/source 不渲染
  let card = await clueCardText('兔子的路径')
  check('S1: 线索卡默认折叠（「兔子的路径」描述不显示）', card !== null && !card.includes('指向黄金兔子王'), card ? card.replace(/\s+/g, ' ').slice(0, 120) : 'missing')
  let card2 = await clueCardText('断裂队旗')
  check('S1: 线索卡默认折叠（「断裂队旗」描述不显示）', card2 !== null && !card2.includes('一面被撕成两半'), card2 ? card2.replace(/\s+/g, ' ').slice(0, 120) : 'missing')

  // S2：展开 → description + 来源出现，按钮变「收起」
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const cardEl = [...qc.querySelectorAll('li')].find((li) => li.textContent?.includes('兔子的路径'))
    const btn = cardEl && [...cardEl.querySelectorAll('button')].find((b) => b.textContent?.trim() === '展开')
    if (btn) btn.click()
  })
  await sleep(300)
  card = await clueCardText('兔子的路径')
  check('S2: 展开后描述显示（指向黄金兔子王所在之地）', card !== null && card.includes('指向黄金兔子王所在之地'), card ? card.replace(/\s+/g, ' ').slice(0, 120) : 'missing')
  check('S2: 展开后来源显示（来源：兔王巢穴）', card !== null && card.includes('来源：兔王巢穴'))
  check('S2: 展开后按钮变「收起」', card !== null && card.includes('收起'))

  // S3：展开「断裂队旗」→「兔子的路径」自动收起（同时最多展开 1 条）
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const cardEl = [...qc.querySelectorAll('li')].find((li) => li.textContent?.includes('断裂队旗'))
    const btn = cardEl && [...cardEl.querySelectorAll('button')].find((b) => b.textContent?.trim() === '展开')
    if (btn) btn.click()
  })
  await sleep(300)
  card = await clueCardText('兔子的路径')
  card2 = await clueCardText('断裂队旗')
  check('S3: 展开断裂队旗后兔子路径自动收起（同时最多 1 条展开）', card !== null && !card.includes('指向黄金兔子王'))
  check('S3: 断裂队旗展开后显示描述', card2 !== null && card2.includes('一面被撕成两半'), card2 ? card2.replace(/\s+/g, ' ').slice(0, 120) : 'missing')

  // ==================== S4c：回到任务 Tab 再次新增线索 → 角标再次出现 ====================
  await clickTab('任务')
  await clickWithRoll('barrier-mnd', 0.99)
  const tabUnread2 = await clueTabText()
  check('S4: 再次获得新线索（魔化诱饵）后角标再现「线索1」', tabUnread2 === '线索1', `tab="${tabUnread2}"`)

  // ==================== S5：日志 Tab 最近记录 ====================
  await clickTab('日志')
  let side = await sidebarText()
  const recentLiCount = await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    if (!qc) return -1
    const sectionEl = [...qc.querySelectorAll('section')].find((s) => s.textContent?.includes('最近记录'))
    return sectionEl ? sectionEl.querySelectorAll('li').length : -1
  })
  check('S5: 最近记录上限 5 条（活动项 34 条只显示 5）', recentLiCount === 5, `li=${recentLiCount}`)
  check('S5: 超过 5 条时显示「查看全部」按钮', side.includes('查看全部'))

  // ==================== S6-S7：消息中心 Drawer（20 条上限 + 用户文案 + 无内部 ID 泄露） ====================
  // deriveActivityItems 顺序 = [6 已完成任务][north_survivor_rescued][knight_trial_invited][25×村长事件][成长]。
  // 最近记录 slice(0,5) 全为任务（quest 排最前）；沈拓/马科事件文案与截断计数必须在消息中心 Drawer 验证。
  // Drawer slice(0,20) = 6 任务 + north_survivor + knight_trial + 12×村长事件（25 条截断 13 条）→ 村长计数 12。
  await clickButton('查看全部')
  const drawerText = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="消息中心"]')?.textContent ?? '')
  check('S6: 消息中心打开（aria-label=消息中心）', drawerText.length > 0)
  check('S7: 消息中心展示沈拓用户文案（north_survivor_rescued 只显示文案）', drawerText.includes('你在北郊旧驿站救出了失联巡逻骑士沈拓'))
  check('S7: 消息中心展示马科试炼预告用户文案（knight_trial_invited 只显示文案）', drawerText.includes('马科认可了你的北线表现'))
  check('S7: 消息中心含 6 条已完成任务项', (drawerText.match(/《[^》]+》已完成/g) || []).length === 6, `quest 项=${(drawerText.match(/《[^》]+》已完成/g) || []).length}`)
  const elderCount = await messageCenterElderCount()
  check('S6: 消息中心上限 20 条 = 6 任务 + north + knight + 12 村长事件（25 条截断 13 条）', elderCount === 12, `村长事件=${elderCount}`)
  const leakedLog = await leakedPrefixes()
  check('S7: 消息中心内部 event id 不泄露（无 north_survivor_rescued / knight_trial_invited）', leakedLog.length === 0 && !(await bodyText()).includes('north_survivor_rescued') && !(await bodyText()).includes('knight_trial_invited'), leakedLog.join(','))

  check('S8: 全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('AdventureSidebar 封板修复 E2E 脚本执行无异常', false, String(error))
} finally {
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
  try { if (dev) dev.kill() } catch { /* 已退出 */ }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-009 §4-8 AdventureSidebar 封板修复 E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
