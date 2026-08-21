import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5224
const APP_URL = `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-probe-'))
const dev = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768 })
for (let i = 0; i < 40; i++) { try { await fetch(APP_URL); break } catch { await sleep(250) } }
const fixture = () => ({
  player: { id: 'p', name: '战斗UI验收', gender: 'male', level: 2, profession: 'knight',
    attributes: { str: 8, con: 14, agi: 18, mnd: 8, lck: 10 }, hp: 26, maxHp: 26, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
    learnedSkillIds: ['knight_power_strike'] },
  inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }, { itemId: 'traveler_cloth_armor', quantity: 1 }],
  equipment: { weapon: 'iron_sword', armor: 'traveler_cloth_armor', accessory: null },
  quests: [
    { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
    { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
    { questId: 'quest_grassland_wolf', status: 'in_progress', stage: 0, flags: {} }],
  world: { currentLocationId: 'qingshi_village', flags: {}, completedEvents: [], npcStates: {}, restCount: 0 },
  companions: {}, relationships: {}, party: { activeCompanionIds: [] } })
const enterLocal = async () => {
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式')); if (b) { b.click(); return true } return false })
  if (clicked) await sleep(400)
}
await page.goto(APP_URL, { waitUntil: 'networkidle0' })
await enterLocal()
await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 5, savedAt: new Date().toISOString(), gameState: s })) }, fixture())
await page.reload({ waitUntil: 'networkidle0' })
await enterLocal()
const clickBtn = async (t) => { await page.evaluate((label) => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(label)); if (b && !b.disabled) b.click() }, t); await sleep(400) }
await clickBtn('继续游戏')
await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
await clickBtn('村外草原'); await sleep(400)
await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(300)
const dump = async (label) => {
  const info = await page.evaluate(() => {
    const el = document.scrollingElement
    const footer = document.querySelector('.combat-page footer')
    const fr = footer?.getBoundingClientRect()
    const main = document.querySelector('.combat-main')
    const mr = main?.getBoundingClientRect()
    return { vh: innerHeight, scrollH: el?.scrollHeight, clientH: el?.clientHeight, scrollY: window.scrollY,
      footerTop: Math.round(fr?.top ?? -1), footerBottom: Math.round(fr?.bottom ?? -1), mainTop: Math.round(mr?.top ?? -1), mainBottom: Math.round(mr?.bottom ?? -1),
      phase: document.body.textContent.includes('战斗胜利') ? 'victory' : document.body.textContent.includes('战斗失败') ? 'defeat' : 'active' }
  })
  console.log(label, JSON.stringify(info))
}
await dump('initial')
for (let i = 0; i < 3; i++) { await clickBtn('普通攻击'); await dump(`after${i + 1}`) }
await browser.close(); dev.kill(); await rm(profile, { recursive: true, force: true })
