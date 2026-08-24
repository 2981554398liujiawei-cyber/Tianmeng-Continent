// TM-P2-010：真实 UI 试炼验收（T1-T24）。
// 自启 strictPort Vite + 临时 Chrome profile；fixture 使用 Save V6，不绕过页面 action。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_010_TRIAL_E2E_PORT || 5250)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-010-trial-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 900 })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`); if (!ok) throw new Error(name + (detail ? `: ${detail}` : '')) }
const body = () => page.evaluate(() => document.body.textContent || '')
const requireTestId = async (id) => { const el = await page.$(`[data-testid="${id}"]`); if (!el) throw new Error(`Required state missing: ${id}`); return el }
const clickTestId = async (id) => { const el = await requireTestId(id); const disabled = await el.evaluate((e) => e.disabled); if (disabled) throw new Error(`Required control disabled: ${id}`); await el.click(); await sleep(250) }
const requireButton = async (label) => {
  const ok = await page.evaluate((needle) => [...document.querySelectorAll('button')].some((b) => !b.disabled && (b.textContent || '').includes(needle)), label)
  if (!ok) throw new Error(`Required button missing or disabled: ${label}`)
}
const clickButton = async (label) => { await requireButton(label); await page.evaluate((needle) => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes(needle)); b.click() }, label); await sleep(300) }
const waitButton = async (label, timeout = 5000) => { const until = Date.now() + timeout; while (Date.now() < until) { if (await page.evaluate((needle) => [...document.querySelectorAll('button')].some((b) => !b.disabled && (b.textContent || '').includes(needle)), label)) return; await sleep(120) } throw new Error(`Timed out waiting for button: ${label}`) }
const clickWithRoll = async (id, value) => { await requireTestId(id); await page.evaluate(([needle, v]) => { const old = Math.random; Math.random = () => v; document.querySelector(`[data-testid="${needle}"]`).click(); Math.random = old }, [id, value]); await sleep(300) }
async function ready() { for (let i = 0; i < 80; i++) { try { await fetch(APP_URL); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function localMode() { const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (!b) return false; b.click(); return true }); if (clicked) await sleep(250) }

function fixture(profession) {
  return {
    player: { id: `p2-010-${profession}`, name: `${profession}试炼验收`, gender: 'male', level: 3, profession, attributes: { str: 50, con: 50, agi: 50, mnd: 50, lck: 12 }, hp: 400, maxHp: 400, mp: 40, maxMp: 40, gold: 100, adventureXp: 250, learnedSkillIds: profession === 'warrior' ? ['warrior_suppress_strike'] : profession === 'knight' ? ['knight_power_strike'] : profession === 'ranger' ? ['ranger_swift_strike'] : ['mage_spell'] },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 8 }], equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [{ questId: 'quest_north_broken_banner', status: 'completed', stage: 0, flags: { north_broken_banner_reported: true } }],
    world: { currentLocationId: 'tianlong_martial_hall', flags: { martial_trial_invited: true, knight_trial_invited: true }, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] }, ownedMountIds: [], equippedMountId: null,
  }
}
async function loadFixture(state) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' }); await localMode()
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s })) }, state)
  await page.reload({ waitUntil: 'networkidle0' }); await localMode(); await clickButton('继续游戏'); await requireTestId('main-column')
}
async function winCombat() {
  // Deterministic high rolls reduce environmental flake, while all actions still travel through CombatPage.
  await page.evaluate(() => { window.__p2OldRandom = Math.random; Math.random = () => 0.999 })
  for (let i = 0; i < 180; i++) {
    const text = await body(); if (text.includes('战斗胜利')) break
    const attacked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').trim() === '普通攻击'); if (!b) return false; b.click(); return true })
    if (attacked) {
      await sleep(80)
      const targeted = await page.evaluate(() => {
        const button = [...document.querySelectorAll('footer button')].find((candidate) => !candidate.disabled && (candidate.textContent || '').trim() !== '取消')
        if (!button) return false
        button.click()
        return true
      })
      if (!targeted) throw new Error('Required combat target button missing')
      await sleep(90)
    }
    const ended = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').trim() === '结束回合'); if (!b) return false; b.click(); return true })
    if (!attacked && !ended) await sleep(500); else await sleep(450)
  }
  await page.evaluate(() => { Math.random = window.__p2OldRandom })
  check('T17/T18: CombatPage victory state reached', (await body()).includes('战斗胜利'))
  await clickButton('返回冒险')
}

try {
  await ready()
  for (const profession of ['warrior', 'knight', 'ranger', 'mage']) {
    await loadFixture(fixture(profession))
    check(`T1/T2 ${profession}: P2-009 completed fixture and invitation visible`, (await body()).includes('天龙武备试炼'))
    await clickTestId('accept-martial-trial'); check(`T3 ${profession}: accept`, (await body()).includes('完成武馆报到'))
    await clickTestId('register-martial-trial'); await clickButton('天龙武备场'); await requireTestId('martial-trial-ground-panel')
    check(`T4/T5 ${profession}: trial ground unlocked`, (await body()).includes('天龙武备场'))
    const primary = { warrior: 'str', knight: 'con', ranger: 'agi', mage: 'mnd' }[profession]
    await clickWithRoll(`trial-observe-${primary}`, 0.99); await requireTestId('start-profession-trial'); check(`T6/T7 ${profession}: observation success state`, (await body()).includes('获得有利准备'))
    // Reload fixture and repeat with a failing observation to prove fail-forward, then continue through real combat.
    await loadFixture(fixture(profession)); await clickTestId('accept-martial-trial'); await clickTestId('register-martial-trial'); await clickButton('天龙武备场')
    await clickWithRoll(`trial-observe-${primary}`, 0.01); // low random is a D20=1 failure for every route
    await requireTestId('start-profession-trial'); check(`T8 ${profession}: observation failure still progresses`, (await body()).includes('仍会继续'))
    await clickTestId('start-profession-trial'); await requireTestId('combat-initiative-strip'); await requireTestId('combat-enemy-panel')
    check(`T9-T12 ${profession}: preview, roster, initiative and combat entered`, (await page.$$('[data-testid="combat-enemy-unit"]')).length <= 3)
    await waitButton('技能'); await clickButton('技能'); await requireTestId('combat-skill-tray'); check(`T13 ${profession}: skill tray`, true)
    await waitButton('背包'); await clickButton('背包'); await requireTestId('combat-item-tray'); check(`T14 ${profession}: bonus item tray`, true)
    await waitButton('结束回合'); await clickButton('结束回合'); check(`T15 ${profession}: End Turn action reachable`, true)
    await winCombat()
    await clickButton('武馆'); await clickTestId('report-martial-trial'); check(`T19-T21 ${profession}: report/completable`, (await body()).includes('领取试炼奖励'))
    await clickTestId('complete-martial-trial'); const completed = await body(); check(`T22-T24 ${profession}: reward and hook`, completed.includes('试炼已完成') && completed.includes('神泉之水'))
    // Re-render must not expose a second reward action.
    check(`T24 ${profession}: reward once`, (await page.$('[data-testid="complete-martial-trial"]')) === null)
  }
  check('T-FINAL: no page exceptions', errors.length === 0, errors.slice(0, 3).join(' | '))
  console.log(`TRIAL_E2E_GREEN | ${results.filter(Boolean).length}/${results.length}`)
} catch (error) {
  console.error(`TRIAL_E2E_FAIL | ${String(error)}`)
  process.exitCode = 1
} finally {
  try { await browser.close() } catch {}
  try { if (dev) dev.kill() } catch {}
  await rm(profile, { recursive: true, force: true })
}
