// TM-P2-007 §54（Layout）+ §55（Production ID Leak）浏览器 E2E 验收。
//
// §54：五分辨率 1920×1080 / 1600×900 / 1366×768 / 1024×768 / 390×844；
//   >=1280 时 GamePage/CombatPage 的 outer（.game-page/.combat-page）满足
//   scrollHeight <= clientHeight + 1；Backpack / Mount 内部可滚（overflow-y-auto 元素存在）。
// §55：生产 UI 文本（body.textContent）禁止出现 quest_/enemy_/encounter_/location_/
//   item_/skill_/companion_/mount_ 前缀的 ID。覆盖主要 UI 状态：主菜单 / 游戏页 /
//   背包面板 / 马厩面板 / CombatPage / 战斗胜利面板。
//
// fixture：天龙城北门 + 《北门失联》in_progress + 黑鬃魔狼遭遇（与 §48 一致）；
// Math.random=0.99 时玩家先手暴击一击击杀，战斗全程确定。V5 存档经 loadSlot 迁移 V6。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.LAYOUT_E2E_PORT || 5231)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']

const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-007-layout-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL
  ? null
  : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: profile,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
const jsErrors = []
page.on('pageerror', (err) => jsErrors.push(String(err)))

async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')

async function enterLocalModeIfNeeded() {
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式'))
    if (!button) return false
    button.click()
    return true
  })
  if (clicked) await sleep(350)
}

async function clickButton(label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(text))
    if (!button || button.disabled) return false
    button.click()
    return true
  }, label)
  if (clicked) await sleep(350)
  return clicked
}

async function clickWhenFound(label, timeout = 4000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await clickButton(label)) return true
    await sleep(150)
  }
  return false
}

/** §55：body 文本中泄露的前缀列表（空 = 无泄露） */
const leakedPrefixes = async () => {
  const text = await bodyText()
  return ID_PREFIXES.filter((p) => text.includes(p))
}

/** outer 滚动检查（>=1280）：.game-page / .combat-page */
const outerScroll = async (cls) =>
  page.evaluate((c) => {
    const el = document.querySelector(c)
    return el ? { sh: el.scrollHeight, ch: el.clientHeight } : null
  }, cls)

function fixture() {
  return {
    player: {
      id: 'player-layout', name: '布局验收员', gender: 'male', level: 3, profession: 'knight',
      attributes: { str: 18, con: 14, agi: 14, mnd: 8, lck: 10 },
      hp: 24, maxHp: 24, mp: 6, maxMp: 6, gold: 120, adventureXp: 260,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'iron_ore', quantity: 1 },
      { itemId: 'test_artifact', quantity: 1 },
      { itemId: 'refined_iron_sword', quantity: 1 },
      { itemId: 'chainmail_armor', quantity: 1 },
    ],
    equipment: { weapon: 'refined_iron_sword', armor: 'traveler_cloth_armor', accessory: null },
    quests: [
      { questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: { north_gate_trail_checked: true } },
    ],
    world: {
      currentLocationId: 'tianlong_north_gate',
      flags: {},
      completedEvents: [],
      npcStates: {},
      restCount: 0,
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
  }
}

/** 主菜单 → 注入 V5 fixture → 继续游戏进入 GamePage */
async function loadAndEnter() {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate((save) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 5, savedAt: new Date().toISOString(), gameState: save }))
  }, fixture())
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await clickButton('继续游戏')
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 })
  await sleep(400)
}

const SIZES = [
  { w: 1920, h: 1080 },
  { w: 1600, h: 900 },
  { w: 1366, h: 768 },
  { w: 1024, h: 768 },
  { w: 390, h: 844 },
]
const DEBUG_SIZE = process.env.DEBUG_SIZE
const sizes = DEBUG_SIZE ? SIZES.filter((s) => `${s.w}×${s.h}` === DEBUG_SIZE) : SIZES

try {
  await ready()

  for (const { w, h } of sizes) {
    await page.setViewport({ width: w, height: h })
    const tag = `${w}×${h}`
    const desktop = w >= 1280

    // ---- 主菜单 ----
    await page.goto(APP_URL, { waitUntil: 'networkidle0' })
    await enterLocalModeIfNeeded()
    let leak = await leakedPrefixes()
    check(`§55 [${tag}] 主菜单无 ID 泄露`, leak.length === 0, leak.join(','))

    // ---- GamePage ----
    await loadAndEnter()
    leak = await leakedPrefixes()
    check(`§55 [${tag}] 游戏页无 ID 泄露`, leak.length === 0, leak.join(','))
    if (desktop) {
      const gs = await outerScroll('.game-page')
      check(`§54 [${tag}] GamePage outer 无滚动`, !!gs && gs.sh <= gs.ch + 1, JSON.stringify(gs))
    }

    // ---- BackpackPanel ----
    await page.evaluate(() => { document.querySelector('[data-testid="open-backpack"]')?.click() })
    await page.waitForSelector('[data-testid="backpack-panel"]', { timeout: 5000 })
    await sleep(250)
    leak = await leakedPrefixes()
    check(`§55 [${tag}] 背包面板无 ID 泄露`, leak.length === 0, leak.join(','))
    const bpScroll = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="backpack-panel"]')
      return panel ? panel.querySelector('.overflow-y-auto') !== null : false
    })
    check(`§54 [${tag}] BackpackPanel 内部可滚`, bpScroll)
    if (desktop) {
      const gs2 = await outerScroll('.game-page')
      check(`§54 [${tag}] 背包打开时 GamePage outer 仍无滚动`, !!gs2 && gs2.sh <= gs2.ch + 1, JSON.stringify(gs2))
    }
    await page.evaluate(() => { document.querySelector('[data-testid="backpack-panel"] [aria-label="关闭背包"]')?.click() })
    await sleep(250)

    // ---- MountStablePanel ----
    await page.evaluate(() => { document.querySelector('[data-testid="open-mount-stable"]')?.click() })
    await page.waitForSelector('[data-testid="mount-panel"]', { timeout: 5000 })
    await sleep(250)
    leak = await leakedPrefixes()
    check(`§55 [${tag}] 马厩面板无 ID 泄露`, leak.length === 0, leak.join(','))
    const mpScroll = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="mount-panel"]')
      return panel ? panel.querySelector('.overflow-y-auto') !== null : false
    })
    check(`§54 [${tag}] MountStablePanel 内部可滚`, mpScroll)
    await clickButton('关闭')
    await sleep(250)

    // ---- CombatPage（北门黑鬃魔狼，精制铁剑暴击一击秒杀）----
    await page.evaluate(() => { window.__tmOrigRandom = Math.random; Math.random = () => 0.99 })
    const engaged = await clickWhenFound('迎战', 5000)
    check(`[${tag}] 战斗入口可用`, engaged)
    await page.waitForSelector('.combat-page', { timeout: 8000 })
    await sleep(400)
    leak = await leakedPrefixes()
    check(`§55 [${tag}] CombatPage 无 ID 泄露`, leak.length === 0, leak.join(','))
    if (desktop) {
      const cs = await outerScroll('.combat-page')
      check(`§54 [${tag}] CombatPage outer 无滚动`, !!cs && cs.sh <= cs.ch + 1, JSON.stringify(cs))
    }

    // ---- 胜利面板（Math.random=0.99 全 20 暴击，最多 3 回合保险）----
    let victory = false
    for (let round = 0; round < 3 && !victory; round += 1) {
      await clickWhenFound('普通攻击', 4000)
      await clickWhenFound('黑鬃魔狼', 4000)
      await sleep(500)
      if (
        await page.evaluate(() =>
          [...document.querySelectorAll('button')].some((el) => (el.textContent || '').includes('返回冒险')),
        )
      ) {
        victory = true
      }
    }
    check(`[${tag}] 战斗胜利`, victory)
    leak = await leakedPrefixes()
    check(`§55 [${tag}] 战斗胜利面板无 ID 泄露`, leak.length === 0, leak.join(','))

    // ---- 返回冒险，为下一分辨率复位 ----
    const backClicked = victory && (await clickWhenFound('返回冒险', 4000))
    let backOk = false
    for (let i = 0; i < 40; i += 1) {
      if (await page.evaluate(() => !!document.querySelector('[data-testid="main-column"]'))) {
        backOk = true
        break
      }
      await sleep(200)
    }
    check(`[${tag}] 战斗胜利后返回冒险`, backClicked && backOk)
    if (!(backClicked && backOk)) {
      const dbg = await page.evaluate(() => ({
        combat: !!document.querySelector('.combat-page'),
        bodyTail: (document.body.textContent || '').slice(-400),
      }))
      console.log(`DEBUG [${tag}] backClicked=${backClicked} backOk=${backOk}`, JSON.stringify(dbg), `jsErrors=${JSON.stringify(jsErrors)}`)
    }
    // 恢复真实随机（已在 GamePage，后续遭遇/提示不再被锁定）
    await page.evaluate(() => { Math.random = window.__tmOrigRandom })
    await sleep(300)
  }

  check('全程无 JS exception', jsErrors.length === 0, jsErrors.length > 0 ? jsErrors.join(' | ') : '')
} catch (error) {
  check('Layout/IDLeak E2E 脚本执行无异常', false, String(error))
} finally {
  await browser.close()
  if (dev) dev.kill()
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-007 §54/§55 Layout + ID Leak E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
