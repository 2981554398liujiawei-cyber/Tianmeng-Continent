// TM-P2-010 Skills E2E: four profession Tier-II skills, locked state, combat use and reload.
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_010_SKILLS_PORT || 5271)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-010-skills-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const results = []
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`) }
const requireState = (ok, message) => { if (!ok) throw new Error(`Required state missing: ${message}`) }
const ID_RE = /(?:quest_|clue_|enemy_|encounter_|location_|item_|skill_|companion_|mount_|event_|trial_)[a-z0-9_]+/i

const tier2 = {
  warrior: { id: 'warrior_breaking_slash', name: '破阵重斩', mp: 2, mode: 'enemy' },
  knight: { id: 'knight_oath_guard', name: '守誓之盾', mp: 2, mode: 'self' },
  ranger: { id: 'ranger_windstep_strike', name: '风行一击', mp: 1, mode: 'enemy' },
  mage: { id: 'mage_flame_lance', name: '炎矢', mp: 3, mode: 'enemy' },
}

function fixture(profession, unlocked) {
  const skill = tier2[profession]
  return {
    player: { id: `skills-${profession}`, name: '技能验收员', gender: 'male', level: 3, profession,
      attributes: { str: 16, con: 16, agi: 18, mnd: 16, lck: 12 }, hp: 30, maxHp: 30, mp: 12, maxMp: 12,
      gold: 100, adventureXp: 250, learnedSkillIds: unlocked ? [skill.id] : [] },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null }, quests: [],
    world: { currentLocationId: 'black_stone_tower_floor2', flags: {}, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: { encounter_broken_patrol: 'broken_patrol_a' } },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] }, ownedMountIds: [], equippedMountId: null,
  }
}

let browser
let page
async function ready() { for (let i = 0; i < 80; i += 1) { try { await fetch(APP_URL); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function localMode() {
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (!b) return false; b.click(); return true })
  if (clicked) await sleep(300)
}
async function load(save) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' }); await localMode()
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: value })) }, save)
  await page.reload({ waitUntil: 'networkidle0' }); await localMode()
  const cont = await page.$('button')
  requireState(Boolean(cont), 'main menu')
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('继续游戏')); if (!b || b.disabled) return false; b.click(); return true })
  requireState(ok, 'continue button')
  await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
  await sleep(350)
}
async function openSkill() {
  const ok = await page.evaluate(() => { const b = document.querySelector('[data-testid="open-skill-progression"]'); if (!b) return false; b.click(); return true })
  requireState(ok, 'skill progression entry')
  await page.waitForSelector('[data-testid="skill-tree"]', { timeout: 3000 })
}
async function enterCombat() {
  await page.evaluate(() => { Math.random = () => 0.99 })
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('迎战')); if (!b) return false; b.click(); return true })
  requireState(ok, 'training encounter')
  await page.waitForSelector('[data-testid="combat-enemy-panel"]', { timeout: 8000 })
  await sleep(300)
}
async function useSkill(skill) {
  const tray = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith('技能')); if (!b) return false; b.click(); return true })
  requireState(tray, 'skill tray')
  const skillButton = await page.evaluate((name) => Boolean([...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes(name) && !(x.textContent || '').includes('技能'))), skill.name)
  requireState(skillButton, `${skill.name} in tray`)
  await page.evaluate((name) => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes(name)); b.click() }, skill.name)
  if (skill.mode === 'enemy') {
    await sleep(120)
    const target = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '骷髅战士'); if (!b) return false; b.click(); return true })
    requireState(target, 'enemy target picker')
  }
  await sleep(450)
}

try {
  await ready()
  browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
  page = await browser.newPage(); await page.setViewport({ width: 1366, height: 900 })
  for (const profession of Object.keys(tier2)) {
    const skill = tier2[profession]
    await load(fixture(profession, true)); await openSkill()
    const tree = await page.$('[data-testid="skill-tree"]')
    const text = await page.evaluate((el) => el?.textContent || '', tree)
    check(`${profession}: Tier II unlocked`, text.includes(skill.name) && text.includes('已掌握'))
    check(`${profession}: skill tree has no raw IDs`, !ID_RE.test(text), text.match(ID_RE)?.[0] ?? '')
    await enterCombat(); await useSkill(skill)
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith('技能')); if (b && !(b.textContent || '').includes('▴')) b.click() })
    await sleep(100)
    const combat = await page.evaluate(() => document.body.textContent || '')
    check(`${profession}: combat log contains skill name`, combat.includes(skill.name))
    check(`${profession}: Action consumed after skill`, combat.includes('本回合行动已用完') || skill.id === 'knight_oath_guard')
    await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith('技能')); if (b) b.click() })
    await sleep(120)
    const disabled = await page.evaluate((name) => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes(name) && !(x.textContent || '').includes('技能')); return b ? b.disabled : false }, skill.name)
    const skillButtonCount = await page.evaluate((name) => [...document.querySelectorAll('button')].filter((x) => (x.textContent || '').includes(name)).length, skill.name)
    const unavailableText = await page.evaluate(() => document.body.textContent || '')
    check(`${profession}: cooldown/once skill unavailable immediately`, disabled || skillButtonCount === 0 || unavailableText.includes('本回合行动已用完') || unavailableText.includes('本场战斗已使用'))
    const saved = await page.evaluate(() => localStorage.getItem('tianmeng_continent_save_slot_slot1'))
    check(`${profession}: save preserves learned Tier II skill`, saved?.includes(skill.id) === true)
    await load(fixture(profession, false)); await openSkill()
    const lockedText = await page.$eval('[data-testid="skill-tree"]', (el) => el.textContent || '')
    check(`${profession}: locked Tier II is not marked learned`, lockedText.includes('未解锁') && !lockedText.includes(`${skill.name}已掌握`))
  }
} catch (error) {
  const diagnostic = page ? await page.evaluate(() => (document.body.textContent || '').slice(0, 500)).catch(() => '') : ''
  check('Skills E2E script execution', false, `${error?.stack || String(error)} | body=${diagnostic}`)
} finally {
  try { await browser?.close() } catch {}
  try { dev?.kill() } catch {}
  try { await rm(profile, { recursive: true, force: true }) } catch {}
}
const failed = results.filter((result) => !result.ok).length
console.log(`===== P2-010 Skills E2E: ${results.length - failed}/${results.length} =====`)
process.exit(failed ? 1 : 0)
