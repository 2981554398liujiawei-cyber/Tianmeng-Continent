import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5234
const APP_URL = `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-probe-'))
const dev = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
  const logs = []
  page.on('console', (msg) => logs.push(msg.text()))
await page.setViewport({ width: 1366, height: 768 })
for (let i = 0; i < 40; i++) { try { await fetch(APP_URL); break } catch { await sleep(250) } }
const fixture = () => ({
  version: 5, savedAt: new Date().toISOString(),
  gameState: {
    player: { id: 'p', name: '调试', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 12, con: 14, agi: 10, mnd: 8, lck: 10 }, hp: 26, maxHp: 26, mp: 7, maxMp: 7, gold: 100, adventureXp: 150,
      learnedSkillIds: ['knight_power_strike'] },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }, { itemId: 'traveler_cloth_armor', quantity: 1 }],
    equipment: { weapon: 'iron_sword', armor: 'traveler_cloth_armor', accessory: null },
    quests: [
      { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_grassland_wolf', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0, flags: { rabbit_lair_rechecked: true } }],
    world: { currentLocationId: 'rabbit_lair', flags: { rabbit_lair_unlocked: true, rabbit_path_examined: true, rabbit_path_reported: true }, completedEvents: [], npcStates: {}, restCount: 0 },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] } } })
const enterLocal = async () => { const c = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式')); if (b) { b.click(); return true } return false }); if (c) await sleep(400) }
await page.goto(APP_URL, { waitUntil: 'networkidle0' }); await enterLocal()
await page.evaluate((s) => localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(s)), fixture())
await page.reload({ waitUntil: 'networkidle0' }); await enterLocal()
const clickBtn = async (t) => { await page.evaluate((label) => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(label)); if (b && !b.disabled) b.click() }, t); await sleep(500) }
await clickBtn('继续游戏')
await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 }); await sleep(300)
const body0 = await page.evaluate(() => document.body.innerText)
console.log('场景含嘟嘟兔:', body0.includes('嘟嘟兔'), '迎战:', body0.includes('迎战'))
await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(600)
const state = async (lbl) => {
  const info = await page.evaluate(() => ({
    hp: (document.body.textContent.match(/生命\s*(\d+)\s*\/\s*(\d+)/) || [])[1],
    mp: (document.body.textContent.match(/灵力\s*(\d+)\s*\/\s*(\d+)/) || [])[1],
    ehp: (document.body.textContent.match(/HP\s*(\d+)\s*\/\s*(\d+)/) || [])[1],
    btns: [...document.querySelectorAll('button')].map((b) => `${b.textContent.trim()}|${b.disabled ? 'D' : 'E'}`).slice(0, 6),
    feed: [...document.querySelector('[data-testid="combat-summary-feed"]')?.querySelectorAll('p') ?? []].map((p) => p.textContent?.trim()).join('|'),
  }))
  console.log(lbl, JSON.stringify(info))
}
await state('S0')
await page.evaluate(() => { window.__origRandom = Math.random.bind(Math); Math.random = () => 0.99 })
await page.evaluate(() => { const s = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能')); if (s && !s.disabled) s.click() })
await sleep(250); await state('S1a')
await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('骑士重击')); if (x && !x.disabled) x.click() })
await sleep(150); await state('S1b2')
await sleep(250); await state('S1b')
await sleep(300); await state('S1c')
await page.evaluate(() => { Math.random = window.__origRandom })
console.log('CONSOLE:', JSON.stringify(logs))
await browser.close(); dev.kill(); await rm(profile, { recursive: true, force: true })


