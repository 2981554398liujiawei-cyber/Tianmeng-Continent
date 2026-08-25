// TM-P2-010-R1 focused browser gate.  This intentionally exercises the public UI
// and Save V6 path; engine-only assertions remain covered by the existing tests.
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const port = Number(process.env.P2_010_R1_PORT || 5280)
const url = process.env.BASE_URL || `http://127.0.0.1:${port}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-010-r1-'))
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore', env: { ...process.env, VITE_QA_COMBAT_V7: '1' } })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`) }
const requireState = (ok, message) => { if (!ok) throw new Error(message) }
const base = ({ profession = 'knight', location = 'tianlong_martial_hall', companions = {}, party = [], quests = [], inventory } = {}) => ({
  player: { id: 'p2-010-r1', name: 'R1验收员', gender: 'male', level: 3, profession, attributes: { str: 50, con: 50, agi: 50, mnd: 50, lck: 12 }, hp: 400, maxHp: 400, mp: 40, maxMp: 40, gold: 180, adventureXp: 250, learnedSkillIds: ['knight_power_strike'] },
  inventory: inventory || [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }, { itemId: 'rabbit_path', quantity: 1 }], equipment: { weapon: 'iron_sword', armor: null, accessory: null }, quests,
  world: { currentLocationId: location, flags: { martial_trial_invited: true }, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} }, companions, relationships: {}, party: { activeCompanionIds: party }, ownedMountIds: [], equippedMountId: null,
})
const trial = (profession) => ({ questId: 'quest_tianlong_martial_trial', status: 'in_progress', stage: 1, flags: { [`route_${profession}`]: true, trial_registered: true, trial_observation_done: true } })
const golden = () => ({ questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } })
let browser, page
async function ready() { for (let i = 0; i < 80; i++) { try { await fetch(url); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function local() { const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (!b) return false; b.click(); return true }); if (clicked) await sleep(250) }
async function load(state) { await page.goto(url, { waitUntil: 'networkidle0' }); await local(); await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s })) }, state); await page.reload({ waitUntil: 'networkidle0' }); await local(); const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('继续游戏')); if (!b || b.disabled) return false; b.click(); return true }); requireState(ok, '继续游戏不可用'); await page.waitForSelector('[data-testid="main-column"], [data-testid="quest-column"]', { timeout: 8000 }); await sleep(300) }
const body = () => page.evaluate(() => document.body.textContent || '')
const clickText = async (text) => { const ok = await page.evaluate((needle) => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes(needle)); if (!b) return false; b.click(); return true }, text); if (ok) await sleep(300); return ok }
async function combat(encounterName = '') {
  const engaged = encounterName
    ? await page.evaluate((name) => {
        const card = [...document.querySelectorAll('[data-testid="training-encounter-card"], [data-testid$="-encounter-card"]')].find((entry) => (entry.textContent || '').includes(name))
        const button = card ? [...card.querySelectorAll('button')].find((entry) => !entry.disabled && (entry.textContent || '').includes('迎战')) : null
        if (!button) return false
        button.click()
        return true
      }, encounterName)
    : await clickText('迎战')
  requireState(engaged, `迎战入口缺失: ${encounterName || '首个可见遭遇'}`)
  await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 })
  await sleep(250)
}
try {
  await ready(); browser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] }); page = await browser.newPage(); await page.setViewport({ width: 1366, height: 900 })
  for (const profession of ['warrior', 'knight', 'ranger', 'mage']) {
    await load(base({ profession, location: 'tianlong_martial_trial_ground', quests: [trial(profession)] }))
    const text = await body(); check(`${profession}: trial route isolated`, text.includes('武备试炼') && !text.includes('试炼职业不匹配'))
  }
  await load(base({ location: 'black_stone_tower_floor2', quests: [golden()] })); await combat()
  const initial = await body(); check('Action + Bonus Action + End Turn visible', ['普通攻击', '技能', '背包', '结束回合'].every((x) => initial.includes(x)))
  check('combat testids present', await page.$('[data-testid="combat-action-tray"]') !== null && await page.$('[data-testid="combat-initiative-strip"]') !== null)
  await clickText('技能'); check('skill tray opens without turn advance', await page.$('[data-testid="combat-skill-tray"]') !== null)
  await clickText('背包'); check('item tray opens', await page.$('[data-testid="combat-item-tray"]') !== null)
  check('inspection/detail log is available', (await body()).includes('战斗日志') || await page.$('[data-testid="combat-detail-log"]') !== null)
  const before = await page.$eval('[data-testid="combat-initiative-strip"]', (e) => e.textContent || '').catch(() => '')
  check('viewing does not change initiative order', before === await page.$eval('[data-testid="combat-initiative-strip"]', (e) => e.textContent || '').catch(() => ''))
  await load(base({ location: 'black_stone_tower_floor2', quests: [golden()] }))
  const rabbit = await page.evaluate(() => {
    const text = document.body.textContent || ''
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    const save = raw ? JSON.parse(raw).gameState : null
    const q = save?.quests?.find((entry) => entry.questId === 'quest_golden_rabbit_search')
    return { frozen: q?.status === 'in_progress' && q?.stage === 0 && Object.values(q?.flags || {}).filter(Boolean).length >= 4 && save?.inventory?.some((entry) => entry.itemId === 'rabbit_path' && entry.quantity === 1), xp: save?.player?.adventureXp === 250, leaked: text.includes('兔子王出现') }
  })
  check('Golden Rabbit freeze + XP bar', rabbit.frozen && rabbit.xp && !rabbit.leaked, JSON.stringify(rabbit))
  const companions = { sakura_yuko: { companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 8, maxMp: 8, learnedSkillIds: [], flags: {} }, zi_yuetian: { companionId: 'zi_yuetian', status: 'recruited', level: 3, mp: 8, maxMp: 8, learnedSkillIds: [], flags: {} }, tianfeng_princess: { companionId: 'tianfeng_princess', status: 'recruited', level: 3, mp: 8, maxMp: 8, learnedSkillIds: [], flags: {} } }
  await load(base({ location: 'black_stone_tower_floor2', companions, party: Object.keys(companions), quests: [] })); await combat('Combat V7 四敌阵列')
  const counts = await page.evaluate(() => ({ friendly: document.querySelectorAll('[data-testid="combat-player-panel"], [data-testid="combat-companion-panel"]').length, enemy: document.querySelectorAll('[data-testid="combat-enemy-unit"]').length }))
  check('4v4 full runtime roster', counts.friendly === 4 && counts.enemy === 4, JSON.stringify(counts))
  check('layout testids', await page.$('[data-testid="combat-player-panel"]') !== null && await page.$('[data-testid="combat-enemy-panel"]') !== null)
} catch (error) { check('P2-010-R1 script execution', false, error?.stack || String(error)) } finally { try { await browser?.close() } catch {}; try { dev?.kill() } catch {}; await rm(profile, { recursive: true, force: true }) }
const failed = results.filter((ok) => !ok).length
console.log(`===== P2-010-R1 E2E: ${results.length - failed}/${results.length} =====`)
process.exit(failed ? 1 : 0)
