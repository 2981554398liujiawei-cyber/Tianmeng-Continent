// TM-P2-009-R2 formal visual evidence. Every screenshot has a fail-fast precondition.
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_009_R1_SCREENSHOT_PORT || 5265)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const OUT_DIR = fileURLToPath(new URL('./screenshots/p2-009-r1/', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const requireState = (ok, message) => { if (!ok) throw new Error(`Required precondition failed: ${message}`) }

function combatFixture({ variant = 'broken_patrol_b', xp = 250 } = {}) {
  return {
    player: {
      id: 'p2-009-r2', name: '雅各布', gender: 'male', level: 3, profession: 'knight',
      attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 18, maxHp: 22, mp: 8, maxMp: 8, gold: 50, adventureXp: xp,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [],
    world: {
      currentLocationId: 'black_stone_tower_floor2', flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: variant ? { encounter_broken_patrol: variant } : {},
    },
    companions: {
      sakura_yuko: {
        companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 6, maxMp: 6,
        learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'], flags: {},
      },
    },
    relationships: {}, party: { activeCompanionIds: ['sakura_yuko'] },
    ownedMountIds: [], equippedMountId: null,
  }
}

function goldenRabbitFixture() {
  const state = combatFixture({ variant: 'broken_patrol_a', xp: 250 })
  return {
    ...state,
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'rabbit_path', quantity: 1 }],
    quests: [{
      questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0,
      flags: {
        asked_blacksmith: true, asked_apothecary: true,
        village_inquiry_reported: true, rabbit_lair_rechecked: true,
      },
    }],
    world: { ...state.world, currentLocationId: 'tianlong_martial_hall' },
  }
}

let browser
let page
let dev
let profile

async function waitForApp() {
  for (let i = 0; i < 80; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error(`Vite did not become ready: ${APP_URL}`)
}

async function enterLocalModeIfPresent() {
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((entry) => (entry.textContent || '').includes('仅本机模式'))
    if (!button || button.disabled) return false
    button.click()
    return true
  })
  if (clicked) await sleep(350)
}

async function requireButton(label) {
  const clicked = await page.evaluate((needle) => {
    const button = [...document.querySelectorAll('button')]
      .find((entry) => (entry.textContent || '').trim().includes(needle))
    if (!button || button.disabled) return false
    button.click()
    return true
  }, label)
  requireState(clicked, `enabled button: ${label}`)
  await sleep(400)
}

async function requireEncounterButton(encounterName) {
  const clicked = await page.evaluate((name) => {
    const button = [...document.querySelectorAll('button')].find((entry) => {
      if (!(entry.textContent || '').includes('迎战') || entry.disabled) return false
      let node = entry
      let context = ''
      for (let i = 0; i < 5 && node; i += 1) { context += node.textContent || ''; node = node.parentElement }
      return context.includes(name)
    })
    if (!button) return false
    button.click()
    return true
  }, encounterName)
  requireState(clicked, `encounter button: ${encounterName}`)
  await sleep(500)
}

async function loadSave(state) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfPresent()
  await page.evaluate((save) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({
      version: 6, savedAt: new Date().toISOString(), gameState: save,
    }))
  }, state)
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfPresent()
  await requireButton('继续游戏')
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 })
  await sleep(350)
}

async function enterCombat(state = combatFixture()) {
  await loadSave(state)
  await page.evaluate(() => {
    // buildCombatSetup orders player, companion, then enemies: make the player
    // current while keeping the companion ready in the same friendly block.
    window.__screenshotRng = [0.99, 0, 0, 0]
    Math.random = () => window.__screenshotRng.shift() ?? 0.5
  })
  await requireEncounterButton('残破巡逻队')
  await page.waitForSelector('[data-testid="combat-enemy-panel"]', { timeout: 8000 })
  await sleep(600)
}

async function shot(name) {
  const path = join(OUT_DIR, `${name}.png`)
  await page.screenshot({ path, type: 'png', captureBeyondViewport: false })
  const info = await stat(path)
  requireState(info.size > 1000, `${name} screenshot is non-empty`)
  console.log(`PASS | ${name} | bytes=${info.size}`)
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')

try {
  // This directory is the explicitly authorized stale-evidence replacement target.
  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })
  profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-009-r2-'))
  if (!process.env.BASE_URL) {
    const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
    dev = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  }
  await waitForApp()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
  page = await browser.newPage()
  await page.setViewport({ width: 1920, height: 1080 })

  await enterCombat()
  requireState(await page.$('[data-testid="combat-player-panel"]'), 'A CombatPage entered')
  requireState(await page.$('[data-testid="combat-enemy-panel"]'), 'A enemy panel exists')
  await shot('A_combat_1920')

  const friendlyCount = await page.$$eval('[data-testid="combat-player-panel"], [data-testid="combat-companion-panel"]', (nodes) => nodes.length)
  const enemyCount = await page.$$eval('[data-testid="combat-enemy-unit"]', (nodes) => nodes.length)
  requireState(friendlyCount >= 2 && enemyCount >= 2, `B friendly=${friendlyCount}, enemy=${enemyCount}`)
  await shot('B_multi_units')

  const initiativeCount = await page.$$eval('[data-testid="combat-initiative-strip"] .tabular-nums', (nodes) => nodes.length)
  requireState(initiativeCount >= 3, `C initiative units=${initiativeCount}`)
  await shot('C_initiative_strip')

  const cardRows = await page.$eval('[data-testid="combat-player-panel"]', (node) =>
    [...node.querySelectorAll(':scope > p')].map((entry) => (entry.textContent || '').trim()))
  requireState(
    cardRows.length >= 3 && cardRows[1].includes('生命') && cardRows[1].includes('灵力') &&
      cardRows[2].includes('攻击') && cardRows[2].includes('护甲') && cardRows[2].includes('敏捷'),
    `D three-row unit card: ${cardRows.join(' | ')}`,
  )
  await shot('D_unit_card_rows')

  await requireButton('技能')
  const skillTrayText = await page.$eval('[data-testid="combat-skill-tray"]', (node) => node.textContent || '')
  requireState(skillTrayText.trim().length > 0, `E skill tray: ${skillTrayText}`)
  await shot('E_skill_tray_open')

  await requireButton('技能')
  await requireButton('背包')
  const itemTrayText = await page.$eval('[data-testid="combat-item-tray"]', (node) => node.textContent || '')
  requireState(itemTrayText.includes('治疗药水'), `F legal combat item: ${itemTrayText}`)
  await shot('F_item_tray_open')

  await requireButton('背包')
  const actionBarY = () => page.evaluate(() => {
    const button = [...document.querySelectorAll('.combat-page footer button')]
      .find((entry) => (entry.textContent || '').includes('普通攻击'))
    return button ? button.getBoundingClientRect().y : null
  })
  const actionBarYClosed = await actionBarY()
  requireState(Number.isFinite(actionBarYClosed), 'G1 ActionBar visible')
  await shot('G1_actionbar_tray_closed')
  await requireButton('技能')
  const actionBarYOpen = await actionBarY()
  requireState(Math.abs(actionBarYOpen - actionBarYClosed) <= 1, `G2 ActionBar Y ${actionBarYClosed} -> ${actionBarYOpen}`)
  await shot('G2_actionbar_tray_expanded')

  await requireButton('技能')
  await requireButton('普通攻击')
  await requireButton('骷髅战士')
  const detailLogText = await page.$eval('[data-testid="combat-detail-log"]', (node) => node.textContent || '')
  requireState(/D20|先行动/.test(detailLogText) && /攻击|伤害/.test(detailLogText), `H detail log: ${detailLogText.slice(0, 180)}`)
  await shot('H_detail_log')

  const switchableCount = await page.$$eval(
    '[data-testid="combat-player-panel"][role="button"], [data-testid="combat-companion-panel"][role="button"]',
    (nodes) => nodes.length,
  )
  requireState(friendlyCount >= 2 && switchableCount >= 1, `I ready friendly=${friendlyCount}, switchable=${switchableCount}`)
  await shot('I_friendly_switch')

  await page.evaluate(() => { Math.random = () => 0.5 })
  for (let i = 0; i < 8; i += 1) {
    const log = await page.$eval('[data-testid="combat-detail-log"]', (node) => node.textContent || '')
    if (log.includes('黑火球')) break
    const acted = await page.evaluate(() => {
      const button = [...document.querySelectorAll('.combat-page footer button')].find((entry) => {
        const text = (entry.textContent || '').trim()
        return !entry.disabled && (text.includes('结束回合') || text === '跳过')
      })
      if (!button) return false
      button.click()
      return true
    })
    await sleep(acted ? 650 : 500)
  }
  const enemySkillLog = await page.$eval('[data-testid="combat-detail-log"]', (node) => node.textContent || '')
  requireState(enemySkillLog.includes('黑火球'), `J enemy skill log: ${enemySkillLog.slice(-220)}`)
  await shot('J_enemy_skill_blackfire')

  await loadSave(combatFixture({ variant: null }))
  const unlockedText = await bodyText()
  requireState(unlockedText.includes('可能遭遇') && unlockedText.includes('骷髅战士×2') && unlockedText.includes('骷髅战士+黑法师'), 'K unlocked weighted preview has both candidates')
  await shot('K_variant_preview_unlocked')

  await loadSave(combatFixture({ variant: 'broken_patrol_a' }))
  const lockedText = await bodyText()
  requireState(lockedText.includes('本次遭遇：骷髅战士×2') && !lockedText.includes('骷髅战士+黑法师'), 'L locked roster is explicit')
  await shot('L_variant_preview_locked')

  await loadSave(goldenRabbitFixture())
  const goldenText = await bodyText()
  requireState(goldenText.includes('现阶段线索已收集 · 待续'), 'M Golden Rabbit pending copy')
  await shot('M_golden_rabbit_pending')

  const xp = await page.$eval('[data-testid="adventure-xp-bar"]', (node) => {
    const fill = node.querySelector('div[style*="width"]')
    return { text: node.textContent || '', width: fill ? parseFloat(fill.style.width) : null }
  })
  requireState(xp.text.includes('250 / 450') && xp.width !== null && Math.abs(xp.width - 55.56) <= 1, `N XP ${JSON.stringify(xp)}`)
  await shot('N_xp_bar_250_450')

  await page.setViewport({ width: 390, height: 844 })
  await enterCombat()
  const mobile = await page.evaluate(() => ({
    scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
    clientWidth: document.scrollingElement?.clientWidth ?? 0,
    actionEnabled: [...document.querySelectorAll('.combat-page footer button')]
      .some((button) => !button.disabled && (button.textContent || '').includes('普通攻击')),
  }))
  requireState(mobile.scrollWidth <= mobile.clientWidth + 1, `O horizontal overflow ${JSON.stringify(mobile)}`)
  requireState(mobile.actionEnabled, 'O ActionBar normal attack is operable')
  await shot('O_combat_390')

  const names = (await readdir(OUT_DIR)).sort()
  requireState(names.length === 16, `formal evidence file count=${names.length}`)
  console.log('===== TM-P2-009-R2 screenshots: 16/16 PASS =====')
} catch (error) {
  console.error(`FAIL-FAST | ${error?.stack || error}`)
  process.exitCode = 1
} finally {
  try { await browser?.close() } catch {}
  try { dev?.kill() } catch {}
  try { if (profile) await rm(profile, { recursive: true, force: true }) } catch {}
}
