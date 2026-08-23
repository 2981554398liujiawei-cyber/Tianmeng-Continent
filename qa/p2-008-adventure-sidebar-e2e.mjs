// ============================================================================
// 《天梦大陆》TM-P2-008 §5/§33-35 右栏冒险面板 V2（AdventureSidebar）浏览器 E2E 验收（AS1-12）。
//
// 覆盖：
//   AS1  顶部「当前目标」区块存在并展示当前任务目标（fixture 放 in_progress 任务验证）
//   AS2  三个 Tab 存在（任务 / 线索 / 日志）
//   AS3  任务 Tab 分组展示（进行中 / 可提交 / 已完成）
//   AS4  线索 Tab 展示已发现线索卡（标题 + 描述 + 来源 + 分类 tag）
//   AS5  无线索时线索 Tab 空态（「尚未发现任何线索」）
//   AS6  日志 Tab 存在 Activity Feed（最近记录 + 已完成任务条目）
//   AS7  北门失联未 completed 时，附近委托不含《北郊追踪》（窄前置过滤）
//   AS8  已发现线索含「兔子的路径」（world.flags.clue_rabbit_path）
//   AS9  全程无 Production ID leak（quest_/clue_/enemy_/encounter_/location_/item_/skill_/companion_/mount_）
//   AS10 当前目标在任务完成后更新（《北郊追踪》可提交 → 提交 → 当前目标切至《北门失联》）
//   AS11 切换 Tab 不报 JS 错误
//   AS12 可提交任务在右栏显示「提交任务」按钮
//
// 运行前提：无（脚本自备本地 dev server 5237）。
// 运行：node qa/p2-008-adventure-sidebar-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.SIDEBAR_E2E_PORT || 5237)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-008-sidebar-'))
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

/** 在右栏 quest-column 内按 Tab 标签切换（任务 / 线索 / 日志） */
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

const leakedPrefixes = async () => {
  const text = await bodyText()
  return ID_PREFIXES.filter((p) => text.includes(p))
}

/**
 * AS fixture。
 *  - mixed：武馆 + 北郊追踪 completable（可提交）+ 北门失联 in_progress + 村外异动 completed + 线索 clue_rabbit_path。
 *    覆盖 AS2/AS3/AS4/AS6/AS8/AS10/AS12。
 *  - minimal：武馆 + 仅北门失联 in_progress（未 completed）+ 无线索。
 *    覆盖 AS1（当前目标=北门失联）/AS5（空态）/AS7（附近委托前置过滤）。
 */
function fixture(kind = 'mixed') {
  const base = {
    player: {
      id: 'player-sidebar-e2e', name: '冒险面板验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [],
    world: {
      currentLocationId: 'tianlong_martial_hall', flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: {},
    },
    companions: {},
    relationships: {},
    party: { activeCompanionIds: [] },
    ownedMountIds: [],
    equippedMountId: null,
  }
  if (kind === 'mixed') {
    base.quests = [
      { questId: 'quest_north_outskirts', status: 'completable', stage: 0, flags: {} },
      { questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: {} },
      { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
    ]
    base.world.flags = { clue_rabbit_path: true }
  } else {
    base.quests = [{ questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: {} }]
    base.world.flags = {}
  }
  return base
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

  // ==================== 场景 A（mixed）：Tab/分组/线索卡/日志/提交按钮 + 当前目标更新 ====================
  await loadAndEnterLocal(fixture('mixed'))
  section = 1

  // ---- AS2：三个 Tab ----
  const tabs = await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    if (!qc) return []
    return [...qc.querySelectorAll('[role="tab"]')].map((b) => b.textContent?.trim())
  })
  check('AS2: 右栏存在三个 Tab（任务/线索/日志）', tabs.length >= 3 && tabs.some((t) => t.startsWith('任务')) && tabs.some((t) => t.startsWith('线索')) && tabs.some((t) => t.startsWith('日志')), tabs.join(','))

  // ---- AS3：任务 Tab 分组 ----
  let side = await sidebarText()
  check('AS3: 任务 Tab 展示「进行中（1）」分组', side.includes('进行中（1）'))
  check('AS3: 任务 Tab 展示「可提交（1）」分组', side.includes('可提交（1）'))
  check('AS3: 任务 Tab 展示「已完成（1）」分组', side.includes('已完成（1）'))
  check('AS3: 进行中分组含《北门失联》', side.includes('北门失联'))

  // ---- AS12：可提交任务显示「提交任务」按钮（马科在武馆，canSubmit）----
  check('AS12: 可提交任务在右栏显示「提交任务」按钮', side.includes('提交任务'))
  check('AS12: 可提交分组展示奖励（40 金币）', side.includes('40') && side.includes('金币'))

  const leakedA0 = await leakedPrefixes()
  check('AS9: 全程无 Production ID leak（场景 A · 任务 Tab）', leakedA0.length === 0, leakedA0.join(','))

  // ---- AS4 / AS8：线索 Tab ----
  const jsBeforeTabs = jsErrors.length
  await clickTab('线索')
  side = await sidebarText()
  check('AS8: 已发现线索含「兔子的路径」', side.includes('兔子的路径'))
  // TM-P2-009 §4 线索卡默认折叠：先点「展开」才能断言描述/来源（展开后分类 tag 仍在）
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const cardEl = qc && [...qc.querySelectorAll('li')].find((li) => li.textContent?.includes('兔子的路径'))
    const btn = cardEl && [...cardEl.querySelectorAll('button')].find((b) => b.textContent?.trim() === '展开')
    if (btn) btn.click()
  })
  await sleep(300)
  side = await sidebarText()
  check('AS4: 线索卡含描述（指向黄金兔子王所在之地）', side.includes('指向黄金兔子王所在之地'))
  check('AS4: 线索卡含来源「来源：兔王巢穴」', side.includes('来源：兔王巢穴'))
  check('AS4: 线索卡含分类 tag「地图」', side.includes('地图'))

  // ---- AS6：日志 Tab（Activity Feed）----
  await clickTab('日志')
  side = await sidebarText()
  check('AS6: 日志 Tab 存在 Activity Feed（最近记录）', side.includes('最近记录'))
  check('AS6: Activity Feed 含已完成任务条目《村外异动》已完成', side.includes('《村外异动》已完成'))
  check('AS6: Activity Feed 含成长条目（达到 Lv.2）', side.includes('达到 Lv.2'))

  // ---- AS11：切 Tab 无 JS 错误 ----
  await clickTab('任务')
  await clickTab('线索')
  await clickTab('日志')
  await clickTab('任务')
  const leakedTabs = await leakedPrefixes()
  check('AS11: 切换 Tab 无 JS 错误', jsErrors.length === jsBeforeTabs, jsErrors.slice(jsBeforeTabs).join(' | '))
  check('AS9: 全程无 Production ID leak（切 Tab 后）', leakedTabs.length === 0, leakedTabs.join(','))

  // ---- AS10：当前目标在任务完成后更新（提交《北郊追踪》→ 当前目标切至《北门失联》）----
  side = await sidebarText()
  check('AS10: 提交前当前目标为《北郊追踪》（返回武馆向马科汇报北郊的发现）', side.includes('《北郊追踪》') && side.includes('返回武馆向马科汇报北郊的发现'))
  await clickButton('提交任务')
  side = await sidebarText()
  check('AS10: 提交后当前目标更新为《北门失联》（调查天龙城北门外巡逻队留下的痕迹）', side.includes('《北门失联》') && side.includes('调查天龙城北门外巡逻队留下的痕迹'))
  check('AS10: 提交后可提交分组消失（已完成分组更新为 2）', side.includes('已完成（2）') && !side.includes('可提交（1）'))
  const leakedA1 = await leakedPrefixes()
  check('AS9: 全程无 Production ID leak（提交后）', leakedA1.length === 0, leakedA1.join(','))

  // ==================== 场景 B（minimal）：当前目标（in_progress）/ 无线索空态 / 附近委托前置 ====================
  await loadAndEnterLocal(fixture('minimal'))
  section = 2

  // ---- AS1：顶部当前目标 ----
  side = await sidebarText()
  check('AS1: 顶部存在「当前目标」区块', side.includes('当前目标'))
  check('AS1: 当前目标展示 in_progress 任务《北门失联》', side.includes('《北门失联》'))
  check('AS1: 当前目标描述为调查北门外巡逻队痕迹', side.includes('调查天龙城北门外巡逻队留下的痕迹'))
  check('AS1: 当前目标含地点提示（天龙城北门）', side.includes('地点提示：天龙城北门'))

  // ---- AS7：北门失联未 completed → 附近委托不含《北郊追踪》----
  check('AS7: 附近委托区块存在', side.includes('附近委托'))
  check('AS7: 附近委托仍展示其它可接委托《商人王财的麻烦》', side.includes('商人王财的麻烦'))
  check('AS7: 北门失联未 completed 时附近委托不含《北郊追踪》', !side.includes('北郊追踪'))

  // ---- AS5：无线索空态 ----
  await clickTab('线索')
  side = await sidebarText()
  check('AS5: 无线索时线索 Tab 空态（尚未发现任何线索）', side.includes('尚未发现任何线索'))
  const leakedB = await leakedPrefixes()
  check('AS9: 全程无 Production ID leak（场景 B）', leakedB.length === 0, leakedB.join(','))

  check('AS: 全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('AdventureSidebar E2E 脚本执行无异常', false, String(error))
} finally {
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
  try { if (dev) dev.kill() } catch { /* 已退出 */ }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-008 §5/§33-35 AdventureSidebar E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
