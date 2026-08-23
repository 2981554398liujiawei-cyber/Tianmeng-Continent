#!/usr/bin/env node
/**
 * qa/p2-007-r2-public-smoke.mjs —— TM-P2-007-R2 公网生产 smoke（§29）。
 *
 * 真实浏览 PUBLIC_GAME_URL（GitHub Pages 生产页面），验证核心玩法 UI 全部可达：
 *   S01 云存档 UI（云存档口令页 + 存档将同步到云端）
 *   S02 Main Menu（新游戏 / 继续游戏 / 读取存档）
 *   S03 创建角色（姓名输入 + 职业选择）
 *   S04 GamePage（青石村 + 保存游戏/返回主菜单系统栏）
 *   S05 本地存档（保存游戏 → 本地已保存）
 *   S06 Backpack UI（open-backpack → 背包面板 tabs）
 *   S07 Mount UI（open-mount-stable-entry → 马厩面板）
 *   S08 返回主菜单
 *   S09 读档（继续游戏 → 进度保持）
 *   S10 Encounter + CombatPage（迎战 → 战斗页玩家/伙伴/敌面板）
 *   S11 全程无 fatal JS exception
 *
 * Part B（S10）用真实已注册伙伴 Sakura 的合法本地档（p2-007-r1 fixture 模式，
 *   不注入任何假伙伴进生产；3v3 能力已由 source SHA + 单测/qa:p2-007-r1 证明）。
 *
 * 运行：PUBLIC_GAME_URL=https://... node qa/p2-007-r2-public-smoke.mjs
 * 约束：passphrase 强随机生成，绝不打印。
 */
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PUBLIC_GAME_URL = (process.env.PUBLIC_GAME_URL || '').trim()
if (!PUBLIC_GAME_URL) {
  console.error('PUBLIC SMOKE BLOCKED: PUBLIC_GAME_URL is missing')
  process.exit(1)
}

const randomPass = () => `SMOKE-${randomBytes(14).toString('base64url')}`
const PASS = randomPass()

function findChromeExecutable() {
  const configured = process.env.CHROME_PATH?.trim()
  const windowsCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  ]
  const linuxCandidates = [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome', '/snap/bin/chromium',
  ]
  const macCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  const platformCandidates = process.platform === 'win32' ? windowsCandidates : process.platform === 'darwin' ? macCandidates : linuxCandidates
  const candidates = [configured, ...platformCandidates].filter((value) => typeof value === 'string' && value.length > 0)
  const found = candidates.find((candidate) => existsSync(candidate))
  if (found) return found
  throw new Error(`未找到 Chrome/Chromium（平台: ${process.platform}），请设置 CHROME_PATH。已检查: ${candidates.join(', ') || '(无)'}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`)
}

let browser
const clickByText = async (page, text) => {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes(t))
    if (!btn) return false
    btn.click()
    return true
  }, text)
  if (!ok) throw new Error('未找到按钮: ' + text)
  await sleep(450)
}
const bodyText = (page) => page.evaluate(() => document.body.textContent || '')
const typePassphrase = async (page, pass) => {
  await page.type('#cloud-passphrase', pass, { delay: 5 })
  await clickByText(page, '进入天梦大陆')
  await sleep(900)
}
const readLocationName = (page) =>
  page.evaluate(() => {
    const section = document.querySelector('[data-current-location-id]')
    if (!section) return null
    const nameEl = section.querySelector('h2')
    return nameEl ? nameEl.textContent.trim() : null
  })
const createQuickKnight = async (page, name) => {
  await page.focus('input[placeholder="输入角色姓名"]')
  await page.type('input[placeholder="输入角色姓名"]', name)
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('骑士'))
    if (label) label.click()
  })
  await sleep(200)
  await page.evaluate(() => {
    const clickAttr = (label, times) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label)
      if (!btn) throw new Error('未找到按钮: ' + label)
      for (let i = 0; i < times; i++) btn.click()
    }
    clickAttr('提高力量', 6)
    clickAttr('提高体质', 4)
    clickAttr('提高敏捷', 2)
    clickAttr('提高幸运', 2)
  })
  await sleep(200)
  await clickByText(page, '确认进入天梦大陆')
  await sleep(600)
}
const saveToSlot1 = async (page) => {
  await clickByText(page, '保存游戏')
  await sleep(350)
  const b = await bodyText(page)
  if (b.includes('确认覆盖')) await clickByText(page, '确认覆盖')
  else if (b.includes('覆盖保存')) {
    await clickByText(page, '覆盖保存')
    await sleep(350)
    await clickByText(page, '确认覆盖')
  } else await clickByText(page, '保存到此槽')
  await sleep(600)
}

// ---- Part B fixture：真实已注册伙伴 Sakura + 村外草原（有魔化兔遭遇）----
function sakuraGrasslandFixture() {
  return {
    player: {
      id: 'player-smoke', name: '公网烟测骑士', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 22, maxHp: 22, mp: 6, maxMp: 6, gold: 50, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [],
    world: { currentLocationId: 'village_grassland', flags: {}, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} },
    companions: {
      sakura_yuko: {
        companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 6, maxMp: 6,
        learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'], flags: {},
      },
    },
    relationships: {},
    party: { activeCompanionIds: ['sakura_yuko'] },
    ownedMountIds: [], equippedMountId: null,
  }
}

// ---- Part C fixture：天龙城（马厩入口仅在天龙城显示，TM-P2-007 §19）----
function tianlongCityFixture() {
  const base = sakuraGrasslandFixture()
  return {
    ...base,
    player: { ...base.player, gold: 5000 },
    world: { ...base.world, currentLocationId: 'tianlong_city' },
  }
}

try {
  const profileDir = mkdtempSync(join(tmpdir(), 'p2-007-r2-public-'))
  browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: true,
    userDataDir: profileDir,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1366,768'],
  })

  // ============ Part A：真实创建流程 ============
  const ctxA = await browser.createBrowserContext()
  const pageA = await ctxA.newPage()
  await pageA.setViewport({ width: 1366, height: 768 })
  const jsErrors = []
  pageA.on('pageerror', (e) => jsErrors.push(String(e)))
  await pageA.goto(PUBLIC_GAME_URL, { waitUntil: 'networkidle0' })
  await sleep(600)
  let body = await bodyText(pageA)
  check('S01: 云存档 UI 可见（云存档口令页）', body.includes('云存档口令') && body.includes('进入天梦大陆') && body.includes('存档将同步到云端'))

  await typePassphrase(pageA, PASS)
  body = await bodyText(pageA)
  check('S02: Main Menu（新游戏/继续游戏/读取存档）', body.includes('新游戏') && body.includes('继续游戏') && body.includes('读取存档'))

  await clickByText(pageA, '新游戏')
  await sleep(400)
  const createUi = await pageA.evaluate(() => Boolean(document.querySelector('input[placeholder="输入角色姓名"]')) && [...document.querySelectorAll('label')].some((l) => (l.textContent || '').includes('骑士')))
  check('S03: 创建角色 UI（姓名输入 + 职业选择）', createUi)
  await createQuickKnight(pageA, '公网烟测骑士')
  body = await bodyText(pageA)
  check('S04: GamePage（青石村 + 系统栏保存/返回主菜单）', (await readLocationName(pageA)) === '青石村' && body.includes('保存游戏') && body.includes('返回主菜单'))

  await saveToSlot1(pageA)
  const slot1Saved = await pageA.evaluate(() => Boolean(localStorage.getItem('tianmeng_continent_save_slot_slot1')))
  body = await bodyText(pageA)
  check('S05: 本地存档成功（slot1 已写入 localStorage）', slot1Saved, body.includes('云：已同步') ? '云已同步' : '(同步状态)')

  // Backpack UI
  await pageA.click('[data-testid="open-backpack"]')
  await sleep(600)
  const backpackVisible = await pageA.evaluate(() => Boolean(document.querySelector('[data-testid="backpack-panel"]')) && [...document.querySelectorAll('[data-testid^="backpack-tab-"]')].length > 0)
  check('S06: Backpack UI（背包面板 + tabs）', backpackVisible)
  await pageA.evaluate(() => document.querySelector('[data-testid="backpack-panel"] [aria-label="关闭背包"]')?.click())
  await sleep(400)

  await clickByText(pageA, '返回主菜单')
  await sleep(500)
  body = await bodyText(pageA)
  check('S08: 返回主菜单', body.includes('新游戏') && body.includes('继续游戏'))
  await clickByText(pageA, '继续游戏')
  await sleep(600)
  check('S09: 读档 → 进度保持（青石村）', (await readLocationName(pageA)) === '青石村')
  await ctxA.close()

  // ============ Part B：Encounter + CombatPage（真实已注册伙伴 Sakura） ============
  const ctxB = await browser.createBrowserContext()
  const pageB = await ctxB.newPage()
  await pageB.setViewport({ width: 1366, height: 768 })
  pageB.on('pageerror', (e) => jsErrors.push(String(e)))
  await pageB.goto(PUBLIC_GAME_URL, { waitUntil: 'networkidle0' })
  await pageB.evaluate((fixture) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 5, savedAt: new Date().toISOString(), gameState: fixture }))
  }, sakuraGrasslandFixture())
  await pageB.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  await typePassphrase(pageB, randomPass())
  body = await bodyText(pageB)
  if (body.includes('使用本机存档创建云存档')) {
    await clickByText(pageB, '使用本机存档创建云存档')
    await sleep(700)
  }
  await clickByText(pageB, '继续游戏')
  await sleep(700)
  body = await bodyText(pageB)
  check('S10a: Part B 进入 GamePage（村外草原）', (await readLocationName(pageB)) === '村外草原')

  // 迎战魔化兔 → CombatPage
  const engage = await pageB.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      if (!(b.textContent || '').includes('迎战')) return false
      let el = b
      for (let i = 0; i < 4 && el; i += 1) {
        if ((el.textContent || '').includes('魔化兔')) return true
        el = el.parentElement
      }
      return false
    })
    if (btn) { btn.click(); return true }
    return false
  })
  if (!engage) throw new Error('未找到魔化兔迎战按钮（Part B 战斗可达验证失败）')
  await pageB.waitForSelector('[data-testid="combat-player-panel"]', { timeout: 10000 })
  await sleep(600)
  body = await bodyText(pageB)
  check('S10b: CombatPage（玩家面板 + 行动按钮）', Boolean(await pageB.$('[data-testid="combat-player-panel"]')) && body.includes('普通攻击'))
  check('S10c: 战斗渲染真实伙伴 Sakura（玩家+伙伴 3v 构成）', Boolean(await pageB.$('[data-testid="combat-companion-panel"]')) && body.includes('樱花优子'))
  await ctxB.close()

  // ============ Part C：Mount UI（马厩入口仅在天龙城显示，TM-P2-007 §19） ============
  const ctxC = await browser.createBrowserContext()
  const pageC = await ctxC.newPage()
  await pageC.setViewport({ width: 1366, height: 768 })
  pageC.on('pageerror', (e) => jsErrors.push(String(e)))
  await pageC.goto(PUBLIC_GAME_URL, { waitUntil: 'networkidle0' })
  await pageC.evaluate((fixture) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 5, savedAt: new Date().toISOString(), gameState: fixture }))
  }, tianlongCityFixture())
  await pageC.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  await typePassphrase(pageC, randomPass())
  body = await bodyText(pageC)
  if (body.includes('使用本机存档创建云存档')) {
    await clickByText(pageC, '使用本机存档创建云存档')
    await sleep(700)
  }
  await clickByText(pageC, '继续游戏')
  await sleep(700)
  check('S07a: Part C 进入 GamePage（天龙城）', (await readLocationName(pageC)) === '天龙城')
  await pageC.click('[data-testid="open-mount-stable-entry"]')
  await sleep(600)
  const mountVisible = await pageC.evaluate(() => {
    const panel = document.querySelector('[data-testid="mount-panel"]')
    const entries = document.querySelectorAll('[data-testid^="mount-entry-"]')
    return Boolean(panel) && entries.length > 0
  })
  check('S07: Mount UI（天龙城马厩面板 + 坐骑列表可达）', mountVisible)
  await pageC.evaluate(() => document.querySelector('[aria-label="关闭马厩"]')?.click())
  await sleep(400)
  await ctxC.close()

  check('S11: 全程无 fatal JS exception', jsErrors.length === 0, jsErrors.length > 0 ? jsErrors.join(' | ') : '')

  await browser.close()
  rmSync(profileDir, { recursive: true, force: true })
} catch (err) {
  check('PUBLIC SMOKE: 脚本执行无异常', false, String(err))
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== P2-007-R2 公网生产 smoke =====`)
console.log(`TOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}`)
if (failed.length) {
  for (const f of results.filter((r) => !r.ok)) console.log(`  FAIL: ${f.name}`)
}
process.exit(failed.length > 0 ? 1 : 0)
