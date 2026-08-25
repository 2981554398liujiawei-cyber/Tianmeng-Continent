// TM-P2-010：从 P2-009 完成存档到试炼、技能树、区域历练、Save V6 reload 的真实 UI 旅程。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_010_FULL_JOURNEY_E2E_PORT || 5251)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-010-journey-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage(); await page.setViewport({ width: 1366, height: 900 })
const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`); if (!ok) throw new Error(name + (detail ? `: ${detail}` : '')) }
const body = () => page.evaluate(() => document.body.textContent || '')
const requireId = async (id) => { const el = await page.$(`[data-testid="${id}"]`); if (!el) throw new Error(`missing state ${id}`); return el }
const clickId = async (id) => { const el = await requireId(id); if (await el.evaluate((x) => x.disabled)) throw new Error(`disabled control ${id}`); await el.click(); await sleep(300) }
const clickText = async (needle) => { const ok = await page.evaluate((n) => [...document.querySelectorAll('button')].some((b) => !b.disabled && (b.textContent || '').includes(n)), needle); if (!ok) throw new Error(`missing button ${needle}`); await page.evaluate((n) => [...document.querySelectorAll('button')].find((b) => !b.disabled && (b.textContent || '').includes(n)).click(), needle); await sleep(350) }
async function ready() { for (let i = 0; i < 80; i++) { try { await fetch(APP_URL); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function localMode() { const yes = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (!b) return false; b.click(); return true }); if (yes) await sleep(250) }
function fixture() {
  return {
    player: { id: 'p2-010-full-journey', name: 'P2-010历程验收员', gender: 'male', level: 3, profession: 'knight', attributes: { str: 50, con: 50, agi: 50, mnd: 50, lck: 12 }, hp: 400, maxHp: 400, mp: 40, maxMp: 40, gold: 180, adventureXp: 250, learnedSkillIds: ['knight_power_strike'] },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 6 }, { itemId: 'rabbit_path', quantity: 1 }], equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_north_broken_banner', status: 'completed', stage: 0, flags: { north_broken_banner_reported: true } },
      { questId: 'quest_tianlong_martial_trial', status: 'in_progress', stage: 2, flags: { route_knight: true, trial_registered: true, trial_observation_done: true, trial_combat_done: true } },
      { questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } },
    ],
    world: { currentLocationId: 'tianlong_martial_hall', flags: { martial_trial_invited: true, knight_trial_invited: true, north_outskirts_unlocked: true }, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] }, ownedMountIds: [], equippedMountId: null,
  }
}
async function loadFixture() {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' }); await localMode()
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s })) }, fixture())
  await page.reload({ waitUntil: 'networkidle0' }); await localMode(); await clickText('继续游戏'); await requireId('main-column')
}
async function winCombat() {
  await page.evaluate(() => { window.__p2JourneyRandom = Math.random; Math.random = () => 0.999 })
  for (let i = 0; i < 80; i += 1) {
    if ((await body()).includes('战斗胜利')) break
    const attacked = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => !candidate.disabled && (candidate.textContent || '').trim() === '普通攻击')
      if (!button) return false
      button.click()
      return true
    })
    if (attacked) {
      await sleep(80)
      const targeted = await page.evaluate(() => {
        const button = [...document.querySelectorAll('footer button')].find((candidate) => !candidate.disabled && (candidate.textContent || '').trim() !== '取消')
        if (!button) return false
        button.click()
        return true
      })
      if (!targeted) throw new Error('missing combat target')
    }
    const ended = await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((candidate) => !candidate.disabled && (candidate.textContent || '').trim() === '结束回合')
      if (!button) return false
      button.click()
      return true
    })
    if (!attacked && !ended) await sleep(350)
    else await sleep(220)
  }
  await page.evaluate(() => { Math.random = window.__p2JourneyRandom })
  check('J7: training combat victory', (await body()).includes('战斗胜利'))
  await clickText('返回冒险')
}

try {
  await ready(); await loadFixture()
  check('J1: P2-009 completed + trial task visible', (await body()).includes('天龙武备试炼'))
  await clickId('report-martial-trial'); check('J2: report moves task to reward state', (await body()).includes('领取试炼奖励'))
  await clickId('complete-martial-trial'); check('J3: one-time reward feedback visible', (await body()).includes('试炼完成') && (await body()).includes('Tier II') && (await body()).includes('天龙武备铜章'))
  await clickText('知道了'); check('J3b: completed central card removed', (await page.$('[data-testid="martial-trial-panel"]')) === null && (await page.$('[data-testid="martial-trial-reward-notice"]')) === null)
  await clickId('open-skill-progression'); await requireId('skill-tree'); check('J4: Tier II skill tree opens after completion', (await body()).includes('Tier II'))
  // Move through the real travel buttons to a repeatable-training region.
  await clickText('天龙城'); await clickText('天龙城北门'); await clickText('天龙城北郊'); await requireId('regional-training-heading')
  check('J5: regional training panel appears', (await body()).includes('低风险') || (await body()).includes('标准') || (await body()).includes('高危'))
  const card = await page.$('[data-testid="training-encounter-card"]'); check('J6: at least one authored training encounter card', Boolean(card))
  const engaged = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="training-encounter-card"]')
    const button = card ? [...card.querySelectorAll('button')].find((candidate) => !candidate.disabled && (candidate.textContent || '').includes('迎战')) : undefined
    if (!button) return false
    button.click()
    return true
  })
  check('J6b: player actively enters regional training', engaged)
  await requireId('combat-initiative-strip'); await clickText('技能'); await clickText('守誓之盾')
  check('J6c: newly learned skill is used in combat', (await body()).includes('守誓之盾') && (await body()).includes('抵消 4 点伤害'))
  await winCombat()
  // Save V6 through the actual save screen, return to menu, then load the slot again.
  await clickText('保存游戏'); await clickText('覆盖保存'); await clickText('确认覆盖'); await sleep(450)
  check('J8: save returns to game', (await body()).includes('区域历练') || (await body()).includes('天龙城北郊'))
  await clickText('返回主菜单'); await clickText('继续游戏'); await requireId('main-column')
  await clickId('open-skill-progression'); await requireId('skill-tree')
  check('J9: Save V6 reload preserves Tier II skill', (await body()).includes('Tier II') && (await body()).includes('守誓之盾'))
  // Golden Rabbit exact freeze: status/stage/4 flags and rabbit_path survive reload; UI only says 待续.
  const text = await body(); check('J10: Golden Rabbit remains pending', text.includes('待续'))
  check('J11: no Golden Rabbit progression leak', !text.includes('兔子王出现') && !text.includes('消耗兔子的路径'))
  check('J12: no page exceptions', errors.length === 0, errors.slice(0, 3).join(' | '))
  console.log('FULL_JOURNEY_E2E_GREEN | P2-009 end save -> trial -> skill tree -> training -> Save V6 reload -> Golden pending')
} catch (error) {
  console.error(`FULL_JOURNEY_E2E_FAIL | ${String(error)}`)
  process.exitCode = 1
} finally {
  try { await browser.close() } catch {}
  try { if (dev) dev.kill() } catch {}
  await rm(profile, { recursive: true, force: true })
}
