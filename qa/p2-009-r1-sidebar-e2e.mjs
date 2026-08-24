// ============================================================================
// qa/p2-009-r1-sidebar-e2e.mjs —— TM-P2-009-R1 右栏侧栏浏览器 E2E。
//
// 覆盖 08_验收矩阵：
//   I1-I4 Golden Rabbit 待续 UI（四调查完成 → 「待续」/ 当前目标不选它 / 存档 HARD FREEZE / 旧提示删除）
//   J1-J4 冒险阅历条（Lv3 XP250 → 55.6% / XP450 → 100% / 满级「上限」/ 无「距离 Lv」文本）
//
// 运行：node qa/p2-009-r1-sidebar-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_009_R1_SIDEBAR_PORT || 5252)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-009-r1-sidebar-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL
  ? null
  : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })

let browser
let page
let jsErrors = []

async function ready() {
  for (let i = 0; i < 80; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')
const questColumnText = () => page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')

async function enterLocalModeIfNeeded() {
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('仅本机模式'))
    if (!b) return false
    b.click()
    return true
  })
  if (clicked) await sleep(SLEEP)
}

async function clickButton(label) {
  const clicked = await page.evaluate((text) => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().includes(text))
    if (!b || b.disabled) return false
    b.click()
    return true
  }, label)
  if (clicked) await sleep(SLEEP)
  return clicked
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
  await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
  await sleep(400)
}

const readSaveGameState = () =>
  page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    if (!raw) return null
    try { return JSON.parse(raw).gameState } catch { return null }
  })

const xpBarText = () => page.evaluate(() => document.querySelector('[data-testid="adventure-xp-bar"]')?.textContent ?? '')
const xpFillWidth = () =>
  page.evaluate(() => {
    const bar = document.querySelector('[data-testid="adventure-xp-bar"]')
    const fill = bar?.querySelector('div[style*="width"]')
    return fill ? parseFloat(fill.style.width) : null
  })
/** 当前目标 section（quest-column 第一个 section：gold 边框卡片） */
const currentObjectiveText = () =>
  page.evaluate(() => {
    const col = document.querySelector('[data-testid="quest-column"]')
    const section = col?.querySelector('section')
    return section?.textContent ?? ''
  })

// ---------- fixtures ----------
function playerBase(level, adventureXp) {
  return {
    id: 'player-r1-sidebar', name: '侧栏验收员', gender: 'male', level, profession: 'knight',
    attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
    hp: 22, maxHp: 22, mp: 6, maxMp: 6, gold: 50, adventureXp,
    learnedSkillIds: ['knight_power_strike'],
  }
}

/** Golden Rabbit HARD FREEZE 冻结存档：四调查完成 + in_progress + stage 0 + rabbit_path ×1 */
function goldenCompleteFixture(level = 3, adventureXp = 250) {
  return {
    player: playerBase(level, adventureXp),
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'rabbit_path', quantity: 1 }, // Golden Rabbit 冻结：兔子的路径 ×1
    ],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      {
        questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0,
        flags: {
          asked_blacksmith: true, asked_apothecary: true,
          village_inquiry_reported: true, rabbit_lair_rechecked: true,
        },
      },
    ],
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
}

// =====================================================================
try {
  await ready()
  browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, userDataDir: profile,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 900 })
  page.on('pageerror', (e) => jsErrors.push(`pageerror: ${String(e)}`))
  page.on('console', (m) => {
    if (m.type() === 'error') {
      if (/Failed to load resource/.test(m.text())) return
      jsErrors.push(`console: ${m.text()}`)
    }
  })

  // ==================== Part G：Golden Rabbit 待续（I1-I4） ====================
  const golden = goldenCompleteFixture(3, 250)
  await loadAndEnterLocal(golden)
  const questText = await questColumnText()

  check('I1: 任务 Tab 显示「追寻黄金兔子王」进行中', questText.includes('追寻黄金兔子王'))
  check('I1: 状态标签「待续」', questText.includes('待续'))
  check('I1: 待续文案「现阶段线索已收集 · 待续」', questText.includes('现阶段线索已收集 · 待续'))
  check('I1: 无旧进度提示「还有一步没做」', !questText.includes('还有一步没做'))

  const objText = await currentObjectiveText()
  check('I2: 当前目标不选 Golden Rabbit（仅显示暂无）', objText.includes('当前目标') && !objText.includes('追寻黄金兔子王') && objText.includes('暂无当前目标'), objText.replace(/\s+/g, ' ').slice(0, 80))

  const gs = await readSaveGameState()
  const qg = gs?.quests?.find((q) => q.questId === 'quest_golden_rabbit_search')
  check('I3: 存档仍 in_progress / stage 0', qg?.status === 'in_progress' && qg?.stage === 0)
  check(
    'I3: 存档四 flags 保持',
    qg?.flags?.asked_blacksmith === true && qg?.flags?.asked_apothecary === true &&
      qg?.flags?.village_inquiry_reported === true && qg?.flags?.rabbit_lair_rechecked === true,
  )
  check('I3: 存档 rabbit_path ×1 保持', gs?.inventory?.some((e) => e.itemId === 'rabbit_path' && e.quantity === 1) === true)
  check('I4: 渲染后内部状态零修改（HARD FREEZE）', qg?.status === 'in_progress' && qg?.stage === 0)

  // ==================== Part XP：冒险阅历条（J1-J4） ====================
  // J1：Lv3 XP250 → 55.6%（同一 golden fixture 已是该组合）
  const xpText1 = await xpBarText()
  const fill1 = await xpFillWidth()
  check('J1: Lv3 XP250 显示「250 / 450」', xpText1.includes('冒险阅历') && xpText1.includes('250 / 450'), xpText1.replace(/\s+/g, ' '))
  check('J1: 填充约 55.6%', fill1 !== null && Math.abs(fill1 - 55.6) <= 1, `fill=${fill1}%`)
  check('J1: 无「距离 Lv」文本', !xpText1.includes('距离 Lv'))

  // J2：Lv3 XP450 → 100%
  await loadAndEnterLocal(goldenCompleteFixture(3, 450))
  const xpText2 = await xpBarText()
  const fill2 = await xpFillWidth()
  check('J2: Lv3 XP450 显示「450 / 450」', xpText2.includes('450 / 450'))
  check('J2: 填充 100%', fill2 !== null && Math.abs(fill2 - 100) <= 0.5, `fill=${fill2}%`)

  // J3/J4：满级 Lv15 XP5950 → 「上限」+ 100% + 无虚构 Lv16
  await loadAndEnterLocal(goldenCompleteFixture(15, 5950))
  const xpText3 = await xpBarText()
  const fill3 = await xpFillWidth()
  check('J3: 满级显示「上限」+ 等级已达到当前上限', xpText3.includes('上限') && xpText3.includes('等级已达到当前上限'))
  check('J3: 满级填充 100%', fill3 === 100, `fill=${fill3}%`)
  check('J4: 满级无虚构 Lv16 / 无「距离 Lv」', !xpText3.includes('Lv.16') && !xpText3.includes('距离 Lv'))

  check('全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '))
} catch (error) {
  check('R1 sidebar E2E 脚本执行无异常', false, String(error))
} finally {
  try { await browser?.close() } catch {}
  try { dev?.kill() } catch {}
  try { await rm(profile, { recursive: true, force: true }) } catch {}
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-009-R1 Sidebar E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
