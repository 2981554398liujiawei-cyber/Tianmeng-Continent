// TM-P2-010 A-P visual evidence. Every frame has a required UI state check.
import puppeteer from 'puppeteer-core'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_010_SCREENSHOT_PORT || 5273)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const OUT = fileURLToPath(new URL('./screenshots/p2-010/', import.meta.url))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-010-shots-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const requireState = (ok, message) => { if (!ok) throw new Error(`Required precondition failed: ${message}`) }
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`) }

const base = ({ location = 'tianlong_martial_hall', profession = 'knight', learned = ['knight_power_strike'], questFlags = {}, quests = [], companions = {}, party = [] } = {}) => ({
  player: { id: 'p2-010-shot', name: '视觉验收员', gender: 'male', level: 3, profession, attributes: { str: 14, con: 14, agi: 18, mnd: 14, lck: 12 }, hp: 28, maxHp: 28, mp: 12, maxMp: 12, gold: 90, adventureXp: 250, learnedSkillIds: learned },
  inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }], equipment: { weapon: 'iron_sword', armor: null, accessory: null }, quests,
  world: { currentLocationId: location, flags: { martial_trial_invited: true }, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} }, companions, relationships: {}, party: { activeCompanionIds: party }, ownedMountIds: [], equippedMountId: null,
})
const trialQuest = (flags = {}, status = 'in_progress') => ({ questId: 'quest_tianlong_martial_trial', status, stage: 1, flags: { route_knight: true, trial_registered: true, ...flags } })
const combatQuest = [{ questId: 'quest_wangcai_trouble', status: 'in_progress', stage: 0, flags: {} }]
const screenshots = []
let browser
let page
async function ready() { for (let i = 0; i < 80; i += 1) { try { await fetch(APP_URL); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function localMode() { const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (!b) return false; b.click(); return true }); if (clicked) await sleep(250) }
async function load(save) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' }); await localMode()
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: value })) }, save)
  await page.reload({ waitUntil: 'networkidle0' }); await localMode()
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('继续游戏')); if (!b || b.disabled) return false; b.click(); return true })
  requireState(ok, 'continue game'); await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 }); await sleep(350)
}
async function shot(name, predicate, width = 1920, height = 1080) {
  await page.setViewport({ width, height }); await sleep(120)
  const state = await predicate()
  requireState(state, `${name} state`)
  const path = join(OUT, `${name}.png`)
  await page.screenshot({ path, type: 'png', captureBeyondViewport: false })
  const info = await stat(path); requireState(info.size > 1000, `${name} non-empty PNG`)
  screenshots.push(path); check(`截图 ${name}`, true, `bytes=${info.size}`)
}
async function shotTrainingRisk(name, riskLabel) {
  const cards = await page.$$('[data-testid="training-encounter-card"]')
  let selected
  for (const card of cards) {
    if ((await card.evaluate((element) => element.textContent || '')).includes(riskLabel)) { selected = card; break }
  }
  requireState(Boolean(selected), `${name} ${riskLabel} card`)
  await selected.evaluate((element) => element.scrollIntoView({ block: 'center' }))
  const path = join(OUT, `${name}.png`)
  await selected.screenshot({ path, type: 'png' })
  const info = await stat(path); requireState(info.size > 1000, `${name} non-empty PNG`)
  screenshots.push(path); check(`截图 ${name}`, true, `bytes=${info.size}`)
}
async function enterCombat() {
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('迎战')); if (!b) return false; b.click(); return true })
  requireState(ok, '迎战 button'); await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 }); await sleep(350)
}
async function openSkillTree() {
  if ((await page.viewport()).width < 768) {
    const opened = await page.evaluate(() => { const button = document.querySelector('[data-testid="mobile-nav-role"]'); if (!button) return false; button.click(); return true })
    requireState(opened, 'mobile role drawer')
    await page.waitForSelector('[role="dialog"][aria-label="角色"]', { timeout: 3000 })
  }
  const ok = await page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-testid="open-skill-progression"]')].find((candidate) => candidate.getBoundingClientRect().width > 0)
    if (!button) return false
    button.click()
    return true
  })
  requireState(ok, 'skill entry')
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="skill-tree"]')].some((candidate) => candidate.getBoundingClientRect().width > 0), { timeout: 3000 })
}

try {
  await rm(OUT, { recursive: true, force: true }); await mkdir(OUT, { recursive: true }); await ready()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] }); page = await browser.newPage()
  await load(base());
  await shot('A_trial_intro_1920', () => page.$('[data-testid="martial-trial-panel"]').then(Boolean))
  await load(base({ location: 'tianlong_martial_trial_ground', quests: [trialQuest()] }));
  await shot('B_trial_ground', () => page.$('[data-testid="martial-trial-ground-panel"]').then(Boolean))
  for (const [profession, name] of [['warrior', 'C_warrior_trial'], ['knight', 'D_knight_trial'], ['ranger', 'E_ranger_trial'], ['mage', 'F_mage_trial']]) {
    await load(base({ location: 'tianlong_martial_trial_ground', profession, learned: [({ warrior: 'warrior_breaking_slash', knight: 'knight_oath_guard', ranger: 'ranger_windstep_strike', mage: 'mage_flame_lance' })[profession]], quests: [{ ...trialQuest(), flags: { [`route_${profession}`]: true, trial_registered: true, trial_observation_done: true } }] }))
    await shot(name, () => page.$('[data-testid="martial-trial-ground-panel"]').then(Boolean).then(async (ok) => ok && (await page.evaluate((text) => (document.body.textContent || '').includes(text), profession === 'warrior' ? '武备场' : '天龙武备场'))))
  }
  await load(base({ learned: ['knight_power_strike'], quests: [] })); await openSkillTree()
  await shot('G_skill_tree_locked', () => page.$('[data-testid="skill-tree"]').then(Boolean).then(async (ok) => ok && (await page.evaluate(() => (document.body.textContent || '').includes('未解锁')))))
  await load(base({ learned: ['knight_power_strike', 'knight_oath_guard'], quests: [trialQuest({ trial_observation_done: true })] })); await openSkillTree()
  await shot('H_skill_tree_unlocked', () => page.$('[data-testid="skill-tree"]').then(Boolean).then(async (ok) => ok && (await page.evaluate(() => (document.body.textContent || '').includes('已掌握')))))
  await load(base({ location: 'black_stone_tower_floor2', learned: ['knight_power_strike', 'knight_oath_guard'], quests: combatQuest })); await enterCombat()
  await shot('I_new_skill_combat', () => page.$('[data-testid="combat-action-tray"]').then(Boolean).then(async (ok) => ok && (await page.evaluate(() => (document.body.textContent || '').includes('结束回合')))))
  await load(base({ location: 'tianlong_martial_trial_ground', quests: [trialQuest({ trial_observation_done: true })] }));
  await shot('J_training_panel', () => page.$('[data-testid="regional-training-heading"]').then(Boolean))
  await load(base({ location: 'tianlong_north_outskirts' }))
  await shotTrainingRisk('K_low_risk', '低风险')
  await shotTrainingRisk('L_high_risk', '高危')
  await load(base({ location: 'black_stone_tower_floor2', quests: combatQuest }));
  await shot('M_variant_preview', async () => (await page.$('[data-testid="training-encounter-card"]')) !== null && (await page.evaluate(() => (document.body.textContent || '').includes('可能遭遇'))))
  const sakura = { sakura_yuko: { companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 6, maxMp: 6, learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield'], flags: {} } }
  await load(base({ location: 'tianlong_martial_trial_ground', quests: [trialQuest({ trial_observation_done: true })], companions: sakura, party: ['sakura_yuko'] }))
  await shot('N_sakura_trial', () => page.$('[data-testid="sakura-trial-banter"]').then(Boolean))
  await load(base({ location: 'black_stone_tower_floor2', quests: combatQuest })); await enterCombat()
  await shot('O_combat_390', async () => { const width = await page.evaluate(() => document.documentElement.scrollWidth); return width <= 390 && (await page.$('[data-testid="combat-action-tray"]')) !== null }, 390, 844)
  await load(base({ learned: ['knight_power_strike', 'knight_oath_guard'], quests: [trialQuest({ trial_observation_done: true })] })); await openSkillTree()
  await shot('P_skill_tree_390', async () => {
    const layout = await page.evaluate(() => {
      const tree = [...document.querySelectorAll('[data-testid="skill-tree"]')].find((candidate) => candidate.getBoundingClientRect().width > 0)
      return { width: document.documentElement.scrollWidth, treeWidth: tree?.getBoundingClientRect().width ?? 0 }
    })
    return layout.width <= 390 && layout.treeWidth > 0 && layout.treeWidth <= 390
  }, 390, 844)
} catch (error) {
  check('Screenshots script execution', false, error?.stack || String(error))
} finally {
  try { await browser?.close() } catch {}
  try { dev?.kill() } catch {}
  try { await rm(profile, { recursive: true, force: true }) } catch {}
}
const failed = results.filter((result) => !result.ok).length
console.log(`===== P2-010 Screenshots: ${results.length - failed}/${results.length}; output=${screenshots.length} =====`)
process.exit(failed ? 1 : 0)
