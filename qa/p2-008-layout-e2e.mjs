// ============================================================================
// 《天梦大陆》TM-P2-008 §14/§15 响应式布局浏览器 E2E 验收（L1-L8）。
//
// 覆盖：
//   L1  ≥1280（1920×1080 / 1600×900 / 1366×768）GamePage 三栏布局：
//        左栏 PlayerSidebar（data-testid="player-column"，含玩家名字）可见、
//        中间场景列（data-testid="main-column"）可见、
//        右栏 quest-column（data-testid="quest-column"）可见（computed display != none 且宽度 > 0）
//   L2  ≥1280 底部移动导航（MobileNav，aria-label="移动端导航"）隐藏、顶部「冒险」按钮（open-adventure-drawer）隐藏
//   L3  1024×768：右栏 quest-column 隐藏、底部 MobileNav 隐藏、顶部「冒险」按钮可见；
//        点击后 Drawer 打开且含 AdventureSidebar 内容（当前目标/任务/线索/日志）
//   L4  390×844：底部 MobileNav 可见（[角色][冒险][背包] 三按钮，mobile-nav-role/adventure/backpack）、
//        右栏 quest-column 隐藏、顶部「冒险」按钮隐藏
//   L5  390×844：点 [冒险]（mobile-nav-adventure）→ Drawer 打开含 AdventureSidebar；
//        关闭后点 [背包]（mobile-nav-backpack）→ Drawer（BackpackPanel）打开含背包物品
//   L6  ≥1280 GamePage 页面级无滚动（.game-page scrollHeight <= clientHeight + 1；内部列表可滚不算）
//   L7  全程无 Production ID leak（body 不含 quest_/clue_/enemy_/encounter_/location_/item_/skill_/companion_/mount_）
//   L8  全程无 JS exception（pageerror 收集）
//
// fixture：天龙城北门 + 《北门失联》in_progress（flags 少量）+ 铁剑/治疗药水；
//   GameState 字段完整（player/inventory/equipment/quests/world/companions/relationships/party/
//   ownedMountIds/equippedMountId）。V6 存档直接注入 localStorage。
//
// 代码模式：puppeteer-core + 自备 dev server（spawn vite，端口 5239，--strictPort）；
//   每个 viewport page.setViewport 后 reload 再进（视口切换后 CSS 才稳定）；
//   可见性判定在 page.evaluate 内用 getComputedStyle().display !== 'none' && getBoundingClientRect().width > 0。
//
// 运行前提：无（脚本自备本地 dev server）。
// 运行：node qa/p2-008-layout-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_008_LAYOUT_E2E_PORT || 5239)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-008-layout-'))
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

/** 当前视口下 GamePage 关键元素可见性（getComputedStyle 实时 + bounding rect 宽度） */
const layoutInfo = () =>
  page.evaluate(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return null
      const cs = getComputedStyle(el)
      const rect = el.getBoundingClientRect()
      return { display: cs.display, w: rect.width, text: el.textContent ?? '' }
    }
    return {
      main: vis('[data-testid="main-column"]'),
      left: vis('[data-testid="player-column"]'),
      quest: vis('[data-testid="quest-column"]'),
      mobileNav: vis('[aria-label="移动端导航"]'),
      advBtn: vis('[data-testid="open-adventure-drawer"]'),
      navBtns: {
        role: !!document.querySelector('[data-testid="mobile-nav-role"]'),
        adventure: !!document.querySelector('[data-testid="mobile-nav-adventure"]'),
        backpack: !!document.querySelector('[data-testid="mobile-nav-backpack"]'),
      },
    }
  })

/** 可见性判定：computed display != none 且 bounding rect 宽度 > 0 */
const isVisible = (info) => !!info && info.display !== 'none' && info.w > 0

/** L6 outer 滚动检查（.game-page） */
const outerScroll = async () =>
  page.evaluate(() => {
    const el = document.querySelector('.game-page')
    return el ? { sh: el.scrollHeight, ch: el.clientHeight } : null
  })

/** 「冒险」Drawer（role=dialog aria-label=冒险）内含 AdventureSidebar（quest-column）内容 */
const adventureDrawerInfo = () =>
  page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"][aria-label="冒险"]')
    if (!dlg) return null
    const qc = dlg.querySelector('[data-testid="quest-column"]')
    const text = dlg.textContent ?? ''
    return {
      hasQuestColumn: !!qc,
      hasObjective: text.includes('当前目标'),
      hasQuestsTab: text.includes('任务'),
      hasCluesTab: text.includes('线索'),
      hasLogTab: text.includes('日志'),
    }
  })

/** 移动端 [背包] → BackpackPanel 内容 */
const backpackInfo = () =>
  page.evaluate(() => {
    const panel = document.querySelector('[data-testid="backpack-panel"]')
    if (!panel) return null
    return {
      hasIronSword: !!panel.querySelector('[data-testid="backpack-item-iron_sword"]'),
      hasPotion: !!panel.querySelector('[data-testid="backpack-item-healing_potion"]'),
    }
  })

/** 关闭最上层 Drawer（aria-label="关闭"） */
const closeTopDialog = async () => {
  await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]')
    const btn = dlg && dlg.querySelector('button[aria-label="关闭"]')
    if (btn) btn.click()
  })
  await sleep(SLEEP)
}

/** TM-P2-008 §14/§15 布局验收 fixture：北门 + 《北门失联》in_progress */
function fixture() {
  return {
    player: {
      id: 'player-layout', name: '布局验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
    ],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: { north_gate_trail_checked: true } },
    ],
    world: {
      currentLocationId: 'tianlong_north_gate', flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: {},
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
    ownedMountIds: [], equippedMountId: null,
  }
}

/** 主菜单 → 仅本机 → 注入 V6 fixture → reload → 仅本机 → 继续游戏 → GamePage */
async function loadAndEnter(save) {
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

const SIZES = [
  { w: 1920, h: 1080 },
  { w: 1600, h: 900 },
  { w: 1366, h: 768 },
  { w: 1024, h: 768 },
  { w: 390, h: 844 },
]
const DEBUG_SIZE = process.env.DEBUG_SIZE
const sizes = DEBUG_SIZE ? SIZES.filter((s) => `${s.w}×${s.h}` === DEBUG_SIZE) : SIZES

try {
  await ready()

  for (const { w, h } of sizes) {
    await page.setViewport({ width: w, height: h })
    const tag = `${w}×${h}`
    const desktop = w >= 1280

    await loadAndEnter(fixture())
    const info = await layoutInfo()

    // ---- L7：全程无 Production ID leak ----
    const leak = await leakedPrefixes()
    check(`L7 [${tag}] 无 Production ID leak`, leak.length === 0, leak.join(','))

    if (desktop) {
      // ---- L1：三栏布局 ----
      check(`L1 [${tag}] 左栏 PlayerSidebar 可见`, isVisible(info.left))
      check(`L1 [${tag}] 左栏含玩家名字「布局验收员」`, isVisible(info.left) && info.left.text.includes('布局验收员'))
      check(`L1 [${tag}] 中间场景列可见`, isVisible(info.main))
      check(`L1 [${tag}] 右栏 quest-column 可见`, isVisible(info.quest), info.quest ? `${info.quest.display}/${Math.round(info.quest.w)}px` : 'missing')
      // ---- L2：≥1280 底部移动导航与顶部「冒险」按钮隐藏 ----
      check(`L2 [${tag}] 底部 MobileNav 隐藏`, !isVisible(info.mobileNav))
      check(`L2 [${tag}] 顶部「冒险」按钮隐藏`, !isVisible(info.advBtn))
      // ---- L6：页面级无滚动（内部列表可滚不算） ----
      const gs = await outerScroll()
      check(`L6 [${tag}] GamePage outer 无滚动`, !!gs && gs.sh <= gs.ch + 1, JSON.stringify(gs))
    } else if (w === 1024) {
      // ---- L3：1024 中屏（768–1279）----
      check(`L3 [1024×768] 右栏 quest-column 隐藏`, !isVisible(info.quest), info.quest ? `${info.quest.display}/${Math.round(info.quest.w)}px` : 'missing')
      check(`L3 [1024×768] 底部 MobileNav 隐藏`, !isVisible(info.mobileNav))
      check(`L3 [1024×768] 顶部「冒险」按钮可见`, isVisible(info.advBtn), info.advBtn ? `${info.advBtn.display}/${Math.round(info.advBtn.w)}px` : 'missing')
      const opened = await clickTestId('open-adventure-drawer')
      const drawer = await adventureDrawerInfo()
      check(`L3 [1024×768] 点击「冒险」Drawer 打开且含 AdventureSidebar`, opened && !!drawer && drawer.hasQuestColumn)
      check(`L3 [1024×768] Drawer 含当前目标/任务/线索/日志`, !!drawer && drawer.hasObjective && drawer.hasQuestsTab && drawer.hasCluesTab && drawer.hasLogTab, JSON.stringify(drawer))
      await closeTopDialog()
      const dlgClosed = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="冒险"]') === null)
      check(`L3 [1024×768] 关闭后 Drawer 消失`, dlgClosed)
    } else if (w === 390) {
      // ---- L4：390 移动端（<768）----
      check(`L4 [390×844] 底部 MobileNav 可见`, isVisible(info.mobileNav), info.mobileNav ? `${info.mobileNav.display}/${Math.round(info.mobileNav.w)}px` : 'missing')
      check(`L4 [390×844] MobileNav 含[角色][冒险][背包]三按钮`, info.navBtns.role && info.navBtns.adventure && info.navBtns.backpack, JSON.stringify(info.navBtns))
      check(`L4 [390×844] 右栏 quest-column 隐藏`, !isVisible(info.quest), info.quest ? `${info.quest.display}/${Math.round(info.quest.w)}px` : 'missing')
      check(`L4 [390×844] 顶部「冒险」按钮隐藏`, !isVisible(info.advBtn))
      // ---- L5：[冒险] → Drawer 含 AdventureSidebar ----
      const advOpened = await clickTestId('mobile-nav-adventure')
      const advDrawer = await adventureDrawerInfo()
      check(`L5 [390×844] [冒险] Drawer 打开含 AdventureSidebar`, advOpened && !!advDrawer && advDrawer.hasQuestColumn)
      check(`L5 [390×844] Drawer 含当前目标/任务/线索/日志`, !!advDrawer && advDrawer.hasObjective && advDrawer.hasQuestsTab && advDrawer.hasCluesTab && advDrawer.hasLogTab, JSON.stringify(advDrawer))
      await closeTopDialog()
      // ---- L5：[背包] → BackpackPanel 含背包物品 ----
      const bpOpened = await clickTestId('mobile-nav-backpack')
      const bp = await backpackInfo()
      check(`L5 [390×844] [背包] BackpackPanel 打开`, bpOpened && !!bp)
      check(`L5 [390×844] BackpackPanel 含背包物品（铁剑/治疗药水）`, !!bp && bp.hasIronSword && bp.hasPotion, JSON.stringify(bp))
      await page.evaluate(() => { document.querySelector('button[aria-label="关闭背包"]')?.click() })
      await sleep(SLEEP)
    }
  }

  check('L8: 全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '))
} catch (error) {
  check('TM-P2-008 Layout E2E 脚本执行无异常', false, String(error))
} finally {
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
  try { if (dev) dev.kill() } catch { /* 已退出 */ }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-008 §14/§15 Layout E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
