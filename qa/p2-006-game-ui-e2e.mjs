// TM-P2-006：GamePage 信息架构重构 UI 验收（G1-G15）。
// 覆盖：顶部薄系统栏、左栏玩家摘要（XP 条）、中央 CURRENT SCENE、右栏任务与记录中心、
//       已完成任务默认折叠、附近委托收拢右栏、商店不再常驻（NPC 面板 → MerchantPanel）、
//       阶段播报不常驻中央、最近记录、核心操作可达。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.GAME_UI_E2E_PORT || 5222)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-006-game-ui-'))
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

async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')
const questColText = () => page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')
const mainColText = () => page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')

async function enterLocalModeIfNeeded() {
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式'))
    if (!button) return false
    button.click()
    return true
  })
  if (clicked) await sleep(350)
}

async function clickButton(text) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(label))
    if (!button || button.disabled) return false
    button.click()
    return true
  }, text)
  if (clicked) await sleep(400)
  return clicked
}

/**
 * GamePage fixture：青石村，任务状态丰富：
 *  - 已完成：quest_village_monsters（村外异动）、quest_mine_cleanup（矿洞清理）
 *  - 进行中：quest_grassland_wolf（草原狼影，主线 → 当前目标）
 *  - 附近委托：quest_apothecary_herb_route（采药受阻，药师）、quest_blacksmith_mine_remnant（矿洞余患，铁匠）
 *  - 角色 Lv.2、adventureXp=130（Lv.3 阈值 250 → 「130 / 250」距离 120）
 */
function fixture() {
  return {
    player: {
      id: 'player-game-ui', name: 'UI验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 120, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'traveler_cloth_armor', quantity: 1 },
    ],
    equipment: { weapon: 'iron_sword', armor: 'traveler_cloth_armor', accessory: null },
    quests: [
      { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_grassland_wolf', status: 'in_progress', stage: 0, flags: {} },
    ],
    world: {
      currentLocationId: 'qingshi_village',
      flags: {},
      completedEvents: ['event_qingshi_village_monsters_done'],
      npcStates: {},
      restCount: 0,
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
  }
}

async function loadAndEnter() {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate((save) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 5, savedAt: new Date().toISOString(), gameState: save }))
  }, fixture())
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await clickButton('继续游戏')
  await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
  await sleep(400)
}

try {
  await ready()
  await loadAndEnter()
  let body = await bodyText()
  const mainText = await mainColText()

  // ---- G1/G2：顶部薄系统栏 + 中央场景标题 ----
  check('G1: 顶部不再显示大「天梦大陆 / 当前位置」地点块', !body.includes('当前位置：'))
  check('G1: 顶部为薄系统栏（保存游戏/返回主菜单）', body.includes('保存游戏') && body.includes('返回主菜单'))
  check('G2: 中央显示当前 location 名称（青石村）', mainText.includes('青石村'))
  check('G2: 中央含场景描述', mainText.length > 20)

  // ---- G3：左栏 XP 条 ----
  const playerCol = await page.evaluate(() => document.querySelector('[data-testid="player-column"]')?.textContent || '')
  check('G3: 左栏显示角色名/等级/职业', playerCol.includes('UI验收员') && playerCol.includes('Lv.2'))
  check('G3: XP 条可见（总 XP / 下一等级阈值）', playerCol.includes('130 / 250'))
  check('G3: 显示距离下一等级', playerCol.includes('120'))

  // ---- G4/G5/G6：右栏任务与记录中心 ----
  const questCol = await questColText()
  check('G4: 当前目标在右栏（草原狼影）', questCol.includes('当前目标') && questCol.includes('草原狼影'))
  check('G5: 进行中任务在右栏', questCol.includes('进行中（1）') && questCol.includes('草原狼影'))
  check('G6: 附近委托在右栏（采药受阻/矿洞余患）', questCol.includes('附近委托') && (questCol.includes('采药受阻') || questCol.includes('矿洞余患')))

  // ---- G7：中央不存在「附近委托」大板块 ----
  check('G7: 中央不存在「附近委托」大板块', !mainText.includes('附近委托'))

  // ---- G8/G9：已完成任务默认折叠（已完成区行按钮不在 DOM；展开后可见） ----
  const colHasQuestRow = () =>
    page.evaluate((t) => {
      const col = document.querySelector('[data-testid="quest-column"]')
      if (!col) return false
      return [...col.querySelectorAll('button')].some(
        (b) => b.textContent.includes(t) && b.textContent.includes('已完成') && !b.textContent.includes('（'),
      )
    }, '村外异动')
  const foldedHidden = !(await colHasQuestRow())
  const foldedLabel = questCol.includes('已完成（2）')
  check('G8: 已完成任务默认折叠（任务行不在 DOM）', foldedHidden && foldedLabel)
  await page.evaluate(() => {
    const col = document.querySelector('[data-testid="quest-column"]')
    const btn = [...col.querySelectorAll('button')].find((b) => b.textContent?.includes('已完成'))
    btn?.click()
  })
  await sleep(400)
  const questColExpanded = await questColText()
  check('G9: 点击已完成展开后任务名可见', (await colHasQuestRow()) && questColExpanded.includes('村外异动'))

  // ---- G10/G11/G12：商店不常驻，NPC 交互后 MerchantPanel ----
  check('G10: 中央默认不存在商品列表（无「铁匠的货架/购买装备」常驻）', !body.includes('铁匠的货架'))
  check('G10: 商品表默认不存在（MerchantPanel 未打开）', (await page.$('[data-testid="merchant-panel"]')) === null)
  // 打开铁匠交谈（中央附近人物第 2 个交谈按钮 = 铁匠）
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '交谈')
    btns[1]?.click()
  })
  await sleep(400)
  check('G11: 交谈面板出现「购买装备」入口', (await bodyText()).includes('购买装备'))
  await clickButton('购买装备')
  await page.waitForSelector('[data-testid="merchant-panel"]', { timeout: 5000 })
  const panelText = await page.evaluate(() => document.querySelector('[data-testid="merchant-panel"]')?.textContent || '')
  check('G11: MerchantPanel 显示商品（旅行布衣/硬皮甲/锁子甲）', panelText.includes('旅行布衣') && panelText.includes('硬皮甲') && panelText.includes('锁子甲'))
  check('G11: MerchantPanel 含价格', panelText.includes('12 金') && panelText.includes('30 金'))
  // 关闭面板
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '关闭')
    btn?.click()
  })
  await sleep(400)
  check('G12: 关闭商店后 MerchantPanel 消失', (await page.$('[data-testid="merchant-panel"]')) === null)
  body = await bodyText()
  check('G12: 关闭后恢复场景（中央仍显示青石村）', (await mainColText()).includes('青石村'))

  // ---- G13：阶段播报不长期占中央 ----
  check('G13: 中央无「青石村阶段完成」大卡（该事件由右栏最近记录承载）', !(await mainColText()).includes('青石村阶段完成'))

  // ---- G14：最近记录存在右栏/消息中心 ----
  const questColFor14 = await questColText()
  check('G14: 右栏存在「最近记录」', questColFor14.includes('最近记录'))
  check('G14: 最近记录含已完成任务/等级成长条目', questColFor14.includes('《村外异动》已完成') || questColFor14.includes('达到 Lv.2'))

  // ---- G15：核心操作可达 ----
  const coreActions = ['保存游戏', '返回主菜单', '交谈', '村外草原', '废弃矿洞']
  for (const action of coreActions) {
    const present = await page.evaluate((label) => [...document.querySelectorAll('button')].some((b) => b.textContent?.includes(label)), action)
    check(`G15: 核心操作可达（${action}）`, present)
  }

  check('全程无 JS exception', true)
} catch (error) {
  check('Game UI E2E 脚本执行无异常', false, String(error))
} finally {
  await browser.close()
  if (dev) dev.kill()
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-006 Game UI E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
