// TM-P2-010 responsive layout E2E: skill tree, trial/training panel and combat ActionBar.
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_010_LAYOUT_PORT || 5272)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-010-layout-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const results = []
const check = (name, ok, extra = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`) }
const requireState = (ok, message) => { if (!ok) throw new Error(`Required state missing: ${message}`) }

function fixture() {
  return {
    player: { id: 'layout-hero', name: '布局验收员', gender: 'male', level: 3, profession: 'knight', attributes: { str: 14, con: 14, agi: 18, mnd: 10, lck: 10 }, hp: 26, maxHp: 26, mp: 10, maxMp: 10, gold: 80, adventureXp: 250, learnedSkillIds: ['knight_power_strike', 'knight_oath_guard'] },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }], equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [{ questId: 'quest_tianlong_martial_trial', status: 'in_progress', stage: 1, flags: { route_knight: true, trial_registered: true, trial_observation_done: true } }],
    world: { currentLocationId: 'tianlong_martial_trial_ground', flags: { martial_trial_invited: true }, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] }, ownedMountIds: [], equippedMountId: null,
  }
}
async function ready() { for (let i = 0; i < 80; i += 1) { try { await fetch(APP_URL); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function enterLocal() { const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (!b) return false; b.click(); return true }); if (clicked) await sleep(250) }
async function load() {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' }); await enterLocal()
  await page.evaluate((save) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: save })) }, fixture())
  await page.reload({ waitUntil: 'networkidle0' }); await enterLocal()
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('继续游戏')); if (!b || b.disabled) return false; b.click(); return true })
  requireState(ok, 'continue')
  await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 }); await sleep(350)
}
async function enterCombat() {
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('迎战')); if (!b) return false; b.click(); return true })
  requireState(ok, 'trial encounter')
  await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 }); await sleep(300)
}
let browser
let page
try {
  await ready(); browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] }); page = await browser.newPage()
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1600, height: 900 }, { width: 1366, height: 768 }, { width: 1024, height: 768 }, { width: 390, height: 844 }]) {
    await page.setViewport(viewport); await load()
    const layout = await page.evaluate(() => ({ width: window.innerWidth, docWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }))
    check(`${viewport.width}: no horizontal overflow`, layout.docWidth <= viewport.width + 1 && layout.bodyWidth <= viewport.width + 1, JSON.stringify(layout))
    if (viewport.width < 768) {
      const openedRole = await page.evaluate(() => { const button = document.querySelector('[data-testid="mobile-nav-role"]'); if (!button) return false; button.click(); return true })
      requireState(openedRole, `${viewport.width} role drawer`)
      await page.waitForSelector('[role="dialog"][aria-label="角色"]', { timeout: 3000 })
    }
    const skillButton = await page.evaluate(() => {
      const button = [...document.querySelectorAll('[data-testid="open-skill-progression"]')].find((candidate) => candidate.getBoundingClientRect().width > 0)
      if (!button) return false
      button.click()
      return true
    })
    requireState(skillButton, `${viewport.width} skill entry`)
    await page.waitForSelector('[data-testid="skill-tree"]', { timeout: 3000 })
    const skillLayout = await page.evaluate(() => {
      const tree = [...document.querySelectorAll('[data-testid="skill-tree"]')].find((candidate) => candidate.getBoundingClientRect().width > 0)
      return { docWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth, treeWidth: tree?.getBoundingClientRect().width ?? 0 }
    })
    check(`${viewport.width}: skill tree no overflow`, skillLayout.docWidth <= viewport.width + 1 && skillLayout.bodyWidth <= viewport.width + 1 && skillLayout.treeWidth > 0 && skillLayout.treeWidth <= viewport.width, JSON.stringify(skillLayout))
    if (viewport.width < 768) await page.keyboard.press('Escape')
    const trialPanel = await page.$('[data-testid="martial-trial-ground-panel"]')
    check(`${viewport.width}: trial ground panel visible`, Boolean(trialPanel))
    await enterCombat()
    const actionBar = await page.$('[data-testid="combat-action-tray"]'); requireState(Boolean(actionBar), `${viewport.width} ActionBar`)
    const y0 = await page.$eval('[data-testid="combat-action-tray"]', (el) => el.getBoundingClientRect().top)
    const tray = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim().startsWith('技能')); if (!b) return false; b.click(); return true })
    requireState(tray, `${viewport.width} skill tray toggle`); await page.waitForSelector('[data-testid="combat-skill-tray"]', { timeout: 3000 })
    const y1 = await page.$eval('[data-testid="combat-action-tray"]', (el) => el.getBoundingClientRect().top)
    check(`${viewport.width}: ActionBar fixed while skill tray opens`, Math.abs(y1 - y0) <= 1, `${y0} -> ${y1}`)
    const final = await page.evaluate(() => ({ docWidth: document.documentElement.scrollWidth, bodyWidth: document.body.scrollWidth }))
    check(`${viewport.width}: combat no horizontal overflow`, final.docWidth <= viewport.width + 1 && final.bodyWidth <= viewport.width + 1, JSON.stringify(final))
  }
} catch (error) { check('Layout E2E script execution', false, error?.stack || String(error)) } finally { try { await browser?.close() } catch {}; try { dev?.kill() } catch {}; try { await rm(profile, { recursive: true, force: true }) } catch {} }
const failed = results.filter((result) => !result.ok).length
console.log(`===== P2-010 Layout E2E: ${results.length - failed}/${results.length} =====`)
process.exit(failed ? 1 : 0)
