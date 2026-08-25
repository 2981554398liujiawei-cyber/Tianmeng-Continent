// TM-P2-011 focused browser gate: tooltip, log following, and terminal scene lifecycle.
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const port = Number(process.env.P2_011_PORT || 5281)
const url = process.env.BASE_URL || `http://127.0.0.1:${port}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-011-'))
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`) }
const base = ({ location = 'tianlong_city', flags = {}, quests = [], companions = {}, party = [] } = {}) => ({
  player: { id: 'p2-011', name: '稳定性验收员', gender: 'male', level: 3, profession: 'knight', attributes: { str: 1, con: 99, agi: 99, mnd: 10, lck: 10 }, hp: 1000, maxHp: 1000, mp: 40, maxMp: 40, gold: 180, adventureXp: 250, learnedSkillIds: ['knight_power_strike'] },
  inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }], equipment: { weapon: 'iron_sword', armor: null, accessory: null }, quests,
  world: { currentLocationId: location, flags, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} }, companions, relationships: {}, party: { activeCompanionIds: party }, ownedMountIds: [], equippedMountId: null,
})
let browser, page
async function ready() { for (let i = 0; i < 80; i += 1) { try { await fetch(url); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function local() { const clicked = await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find((entry) => (entry.textContent || '').includes('仅本机模式')); if (!button) return false; button.click(); return true }); if (clicked) await sleep(200) }
async function load(state) {
  await page.goto(url, { waitUntil: 'networkidle0' }); await local()
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: value })) }, state)
  await page.reload({ waitUntil: 'networkidle0' }); await local()
  const clicked = await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find((entry) => (entry.textContent || '').includes('继续游戏')); if (!button || button.disabled) return false; button.click(); return true })
  if (!clicked) throw new Error('继续游戏不可用')
  await page.waitForSelector('[data-testid="main-column"], [data-testid="quest-column"]', { timeout: 8000 }); await sleep(250)
}
async function click(text) { const ok = await page.evaluate((needle) => { const button = [...document.querySelectorAll('button')].find((entry) => !entry.disabled && (entry.textContent || '').includes(needle)); if (!button) return false; button.click(); return true }, text); if (ok) await sleep(100); return ok }

try {
  await ready(); browser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] }); page = await browser.newPage(); await page.setViewport({ width: 1366, height: 900 })

  await load(base({ location: 'village_grassland' })); if (!await click('迎战')) throw new Error('战斗入口缺失')
  await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 }); await click('技能')
  const wrapper = await page.$('[data-testid="combat-skill-tray"] > div')
  const before = await page.$eval('[data-testid="combat-action-tray"]', (element) => element.getBoundingClientRect().toJSON())
  await wrapper.hover(); await page.waitForSelector('[data-testid="combat-skill-tooltip"]')
  const tooltip = await page.$eval('[data-testid="combat-skill-tooltip"]', (element) => ({ text: element.textContent || '', parent: element.parentElement?.tagName, position: getComputedStyle(element).position }))
  const after = await page.$eval('[data-testid="combat-action-tray"]', (element) => element.getBoundingClientRect().toJSON())
  check('UI1/UI3 skill tooltip from registry without layout movement', tooltip.text.includes('骑士重击') && tooltip.text.includes('行动') && tooltip.text.includes('敌方目标') && tooltip.parent === 'BODY' && tooltip.position === 'fixed' && before.y === after.y)
  await click('普通攻击'); await click('魔化兔'); await click('技能')
  const disabledWrapper = await page.$('[data-testid="combat-skill-tray"] > div'); await disabledWrapper.hover()
  check('UI2 disabled skill still exposes tooltip', await page.$('[data-testid="combat-skill-tooltip"]') !== null)

  for (let i = 0; i < 30; i += 1) {
    await click('结束回合')
    await page.waitForFunction(() => (document.body.textContent || '').includes('稳定性验收员的回合'), { timeout: 3000 }).catch(() => undefined)
  }
  const logs = await page.evaluate(() => ['combat-summary-feed', 'combat-detail-log'].map((id) => { const element = document.querySelector(`[data-testid="${id}"]`); return element ? { id, bottom: Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) <= 2, text: element.textContent || '' } : { id, bottom: false, text: '' } }))
  check('UI4/UI5 summary and detail follow newest events', logs.every((entry) => entry.bottom && entry.text.length > 0), JSON.stringify(logs.map(({ id, bottom }) => ({ id, bottom }))))

  const sakuraGuest = { companionId: 'sakura_yuko', status: 'guest', level: 3, mp: 8, maxMp: 8, learnedSkillIds: ['sakura_petalslash'], flags: {} }
  await load(base({ flags: { sakura_calamity_defeated: true, sakura_contract_offered: true }, companions: { sakura_yuko: sakuraGuest }, party: ['sakura_yuko'], quests: [{ questId: 'quest_sakura_boundary', status: 'in_progress', stage: 0, flags: {} }] }))
  await click('可以，但契约必须由你自己决定')
  check('SC1 contract completion feedback appears immediately', (await page.evaluate(() => document.body.textContent || '')).includes('神契已缔结') && (await page.evaluate(() => document.body.textContent || '')).includes('任务完成：《落樱越界》'))
  await click('知道了')
  check('SC2 acknowledgement removes completion card', !(await page.evaluate(() => document.body.textContent || '')).includes('神契已缔结'))

  const sakura = { ...sakuraGuest, status: 'recruited' }
  await load(base({ flags: { sakura_contract_accepted: true }, companions: { sakura_yuko: sakura }, party: ['sakura_yuko'] }))
  check('SC3/SC4 recruited reload hides completion card but keeps companion', !(await page.evaluate(() => document.body.textContent || '')).includes('神契已缔结') && (await page.evaluate(() => document.body.textContent || '')).includes('樱花优子'))

  await load(base({ location: 'tianlong_martial_hall', flags: { martial_trial_invited: true }, quests: [{ questId: 'quest_tianlong_martial_trial', status: 'completed', stage: 1, flags: { trial_reward_claimed: true } }] }))
  check('LC1 completed trial card removed', await page.$('[data-testid="martial-trial-panel"]') === null)
  await load(base({ location: 'tianlong_martial_hall', quests: [{ questId: 'quest_north_gate_missing_patrol', status: 'completed', stage: 0, flags: {} }, { questId: 'quest_north_outskirts', status: 'in_progress', stage: 0, flags: {} }] }))
  check('LC2 old north handoff removed once next quest starts', await page.$('[data-testid="accept-north-outskirts"]') === null)
  await load(base({ flags: { old_trader_talked: true, old_trader_outcome: 'success' } }))
  check('LC3 one-time trader result does not persist', !(await page.evaluate(() => document.body.textContent || '')).includes('路边旧货商'))
  check('LC4 repeatable service remains', (await page.evaluate(() => document.body.textContent || '')).includes('桂花糕铺'))
} catch (error) { check('P2-011 script execution', false, error?.stack || String(error)) } finally { try { await browser?.close() } catch {}; try { dev?.kill() } catch {}; await rm(profile, { recursive: true, force: true }) }
const failed = results.filter((ok) => !ok).length
console.log(`===== P2-011 E2E: ${results.length - failed}/${results.length} =====`)
process.exit(failed ? 1 : 0)
