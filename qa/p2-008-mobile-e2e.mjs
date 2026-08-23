// ============================================================================
// 《天梦大陆》TM-P2-008 §14 移动端底部导航浏览器 E2E 验收（MOB1-6）。
//
// 覆盖：
//   MOB1 390×844 视口下底部固定导航可见（[角色][冒险][背包]，data-testid=mobile-nav-*）
//   MOB2 <768 时顶部「冒险」按钮（open-adventure-drawer）隐藏（computed display none）
//   MOB3 点 [角色] → Drawer 打开含角色信息（PlayerSidebar：玩家名字 / 等级）
//   MOB4 点 [冒险] → Drawer 打开含 AdventureSidebar（quest-column：当前目标 / 任务 / 线索 / 日志）
//   MOB5 点 [背包] → Drawer 打开含背包物品（治疗药水 / 旅行布衣）
//   MOB6 全程无 Production ID leak + 无 JS 异常
//
// 运行前提：无（脚本自备本地 dev server 5238）。
// 运行：node qa/p2-008-mobile-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.MOBILE_E2E_PORT || 5238)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-008-mobile-'))
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
await page.setViewport({ width: 390, height: 844 })
const jsErrors = []
page.on('pageerror', (err) => jsErrors.push(String(err)))

async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')

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

const leakedPrefixes = async () => {
  const text = await bodyText()
  return ID_PREFIXES.filter((p) => text.includes(p))
}

/** MOB fixture：天龙城 + Lv2 骑士 + 背包（治疗药水/旅行布衣）+ 一个 in_progress 任务（冒险抽屉有当前目标） */
function fixture() {
  return {
    player: {
      id: 'player-mobile-e2e', name: '移动验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'traveler_cloth_armor', quantity: 1 },
    ],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [{ questId: 'quest_village_monsters', status: 'in_progress', stage: 0, flags: {} }],
    world: {
      currentLocationId: 'tianlong_city', flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: {},
    },
    companions: {},
    relationships: {},
    party: { activeCompanionIds: [] },
    ownedMountIds: [],
    equippedMountId: null,
  }
}

async function loadAndEnterLocal() {
  const save = fixture()
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

/** 读当前打开的 dialog（Drawer / 背包面板）文本 */
const dialogText = () => page.evaluate(() => {
  const d = [...document.querySelectorAll('[role="dialog"]')].pop()
  return d ? d.textContent || '' : ''
})

try {
  await ready()

  // ==================== 进入 GamePage（390×844） ====================
  await loadAndEnterLocal()

  // ---- MOB1：底部固定导航可见 ----
  const navVisible = await page.evaluate(() => {
    const ids = ['mobile-nav-role', 'mobile-nav-adventure', 'mobile-nav-backpack']
    const out = {}
    for (const id of ids) {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) { out[id] = 'MISSING'; continue }
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      out[id] = `${cs.display}/${cs.visibility}/${Math.round(rect.width)}x${Math.round(rect.height)}/${Math.round(rect.bottom)}`
    }
    return out
  })
  check('MOB1: 底部导航 [角色] 按钮可见', navVisible['mobile-nav-role'] && !navVisible['mobile-nav-role'].startsWith('MISSING') && !navVisible['mobile-nav-role'].startsWith('none'), navVisible['mobile-nav-role'])
  check('MOB1: 底部导航 [冒险] 按钮可见', navVisible['mobile-nav-adventure'] && !navVisible['mobile-nav-adventure'].startsWith('MISSING') && !navVisible['mobile-nav-adventure'].startsWith('none'), navVisible['mobile-nav-adventure'])
  check('MOB1: 底部导航 [背包] 按钮可见', navVisible['mobile-nav-backpack'] && !navVisible['mobile-nav-backpack'].startsWith('MISSING') && !navVisible['mobile-nav-backpack'].startsWith('none'), navVisible['mobile-nav-backpack'])
  check('MOB1: 导航贴底（bottom 在视口高度 844 附近）', Object.values(navVisible).every((v) => {
    const n = Number(v.split('/')[3])
    return Number.isFinite(n) && n >= 820 && n <= 844
  }), Object.values(navVisible).join(' | '))

  // ---- MOB2：<768 时顶部「冒险」按钮隐藏 ----
  const drawerBtnDisplay = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="open-adventure-drawer"]')
    if (!el) return 'MISSING'
    return getComputedStyle(el).display
  })
  check('MOB2: <768 时顶部「冒险」按钮（open-adventure-drawer）隐藏（display none）', drawerBtnDisplay === 'none', `display=${drawerBtnDisplay}`)

  // ---- MOB3：点 [角色] → Drawer 含角色信息 ----
  await clickTestId('mobile-nav-role')
  const roleDialog = await dialogText()
  check('MOB3: [角色] Drawer 打开且含玩家名字', roleDialog.includes('移动验收员'), '')
  check('MOB3: [角色] Drawer 含玩家等级（Lv.2）', roleDialog.includes('Lv.2'))
  check('MOB3: [角色] Drawer 含职业（骑士）', roleDialog.includes('骑士'))
  await clickButton('关闭')

  // ---- MOB4：点 [冒险] → Drawer 含 AdventureSidebar（quest-column 内容）----
  await clickTestId('mobile-nav-adventure')
  const advDialog = await dialogText()
  check('MOB4: [冒险] Drawer 打开且含「当前目标」区块', advDialog.includes('当前目标'))
  check('MOB4: [冒险] Drawer 含当前任务目标《村外异动》', advDialog.includes('村外异动'))
  check('MOB4: [冒险] Drawer 含任务 Tab', advDialog.includes('任务'))
  check('MOB4: [冒险] Drawer 含线索 Tab', advDialog.includes('线索'))
  check('MOB4: [冒险] Drawer 含日志 Tab', advDialog.includes('日志'))
  await clickButton('关闭')

  // ---- MOB5：点 [背包] → Drawer 含背包物品 ----
  await clickTestId('mobile-nav-backpack')
  const packText = await page.evaluate(() => document.querySelector('[data-testid="backpack-panel"]')?.textContent || '')
  check('MOB5: [背包] Drawer 打开（backpack-panel 存在）', packText.length > 0, '')
  check('MOB5: 背包含「治疗药水」', packText.includes('治疗药水'))
  check('MOB5: 背包含「旅行布衣」', packText.includes('旅行布衣'))
  check('MOB5: 背包含「铁剑」', packText.includes('铁剑'))
  await clickButton('关闭')

  // ---- MOB6：全程无 Production ID leak + 无 JS 异常 ----
  const leaked = await leakedPrefixes()
  check('MOB6: 全程无 Production ID leak', leaked.length === 0, leaked.join(','))
  check('MOB6: 全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('Mobile E2E 脚本执行无异常', false, String(error))
} finally {
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
  try { if (dev) dev.kill() } catch { /* 已退出 */ }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-008 §14 移动端底部导航 E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
