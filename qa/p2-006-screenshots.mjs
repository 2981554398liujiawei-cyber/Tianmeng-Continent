// TM-P2-006 视觉验收截图采集：qa/screenshots/p2-006/（A–O）
// 自启 Vite（strictPort），fixture 预置存档（localStorage + 仅本机模式 + 继续游戏）。
// 分辨率：A–J 1920×1080；K–L 1366×768；M–O 390×844。
// 注意：截图仅供人工视觉验收（AUTOMATED LAYOUT 断言在 game-ui/combat-ui e2e 中），
// 不注入状态、不修改云架构；失败即非零退出。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.PORT || 5228)
const APP_URL = `http://localhost:${PORT}/`
const OUT_DIR = fileURLToPath(new URL('./screenshots/p2-006/', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const passes = []
const fails = []
const check = (name, ok, extra = '') => {
  ;(ok ? passes : fails).push(name)
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

function fixture() {
  return {
    version: 5,
    savedAt: new Date().toISOString(),
    gameState: {
      player: {
        id: 'player-screenshot', name: '视觉验收', gender: 'male', level: 2, profession: 'knight',
        attributes: { str: 12, con: 14, agi: 10, mnd: 8, lck: 10 },
        hp: 26, maxHp: 26, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
        learnedSkillIds: ['knight_power_strike'],
      },
      inventory: [
        { itemId: 'iron_sword', quantity: 1 },
        { itemId: 'healing_potion', quantity: 2 },
        { itemId: 'traveler_cloth_armor', quantity: 1 },
        { itemId: 'rabbit_path', quantity: 1 },
      ],
      equipment: { weapon: 'iron_sword', armor: 'traveler_cloth_armor', accessory: null },
      quests: [
        { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
        { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
        { questId: 'quest_grassland_wolf', status: 'in_progress', stage: 0, flags: {} },
        { questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true }, },
      ],
      world: {
        currentLocationId: 'qingshi_village',
        flags: { rabbit_path_examined: true, rabbit_path_reported: true },
        completedEvents: [],
        npcStates: {},
        restCount: 0,
      },
      companions: {},
      relationships: {},
      party: { activeCompanionIds: [] },
    },
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const profile = await mkdtemp(join(tmpdir(), 'tianmeng-shot-'))
  const dev = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
  const page = await browser.newPage()
  try {
    for (let i = 0; i < 40; i += 1) {
      try { await fetch(APP_URL); break } catch { await sleep(250) }
    }

    const enterLocal = async () => {
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式'))
        if (b) { b.click(); return true }
        return false
      })
      if (clicked) await sleep(400)
    }

    const shot = async (name) => {
      const path = join(OUT_DIR, `${name}.png`)
      await page.screenshot({ path, type: 'png', captureBeyondViewport: false })
      const { length } = await import('node:fs/promises').then((fs) => fs.stat(path))
      check(`截图 ${name}`, length > 1000, `bytes=${length}`)
    }

    const clickBtn = async (label) => {
      await page.evaluate((t) => {
        const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(t))
        if (b && !b.disabled) b.click()
      }, label)
      await sleep(450)
    }

    // ===== A–J：1920×1080 =====
    await page.setViewport({ width: 1920, height: 1080 })
    await page.goto(APP_URL, { waitUntil: 'networkidle0' })
    await sleep(400)
    await shot('A_main_menu')

    await clickBtn('新游戏')
    await page.type('input', '截图骑士')
    await page.evaluate(() => { const l = [...document.querySelectorAll('label')].find((el) => el.textContent.includes('骑士')); if (l) l.click() })
    await sleep(200)
    await clickBtn('使用职业推荐配点')
    await shot('B_character_create')

    await page.evaluate(() => { localStorage.clear() })
    await page.evaluate((s) => localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(s)), fixture())
    await page.reload({ waitUntil: 'networkidle0' })
    await enterLocal()
    await clickBtn('继续游戏')
    await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
    await sleep(500)
    await shot('C_qingshi_village_3col')

    // D：右栏任务中心（展开「已完成」Accordion 观察折叠样式；附近委托默认展开）
    await page.evaluate(() => {
      const col = document.querySelector('[data-testid="quest-column"]')
      const btn = [...col.querySelectorAll('button')].find((b) => b.textContent.includes('已完成'))
      if (btn) btn.click()
    })
    await sleep(400)
    await shot('D_quest_sidebar')

    // E：NPC 交互面板（与铁匠交谈）
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('交谈') && el.textContent?.includes('铁匠'))
      if (b) b.click()
    })
    await sleep(400)
    await shot('E_npc_interaction')

    // F：MerchantPanel（购买装备）
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('购买装备'))
      if (b) b.click()
    })
    await page.waitForSelector('[data-testid="merchant-panel"]', { timeout: 5000 })
    await sleep(300)
    await shot('F_merchant_panel')
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('关闭'))
      if (b) b.click()
    })
    await sleep(300)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('离开'))
      if (b) b.click()
    })
    await sleep(300)

    // G–J：战斗页（村外草原 → 迎战 → 各状态）
    await clickBtn('村外草原')
    await sleep(400)
    await clickBtn('迎战')
    await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 })
    await sleep(500)
    await shot('G_combat_initial')

    // H：多回合后（2 次普通攻击；日志按回合分组）
    await page.evaluate(() => { Math.random = () => 0.99 })
    for (let i = 0; i < 2; i += 1) {
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('普通攻击'))
        if (b && !b.disabled) b.click()
      })
      await sleep(450)
    }
    await shot('H_combat_rounds')

    // I：技能 tray 展开
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能'))
      if (b && !b.disabled) b.click()
    })
    await sleep(350)
    await shot('I_combat_skill_tray')
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能'))
      if (b) b.click()
    })
    await sleep(250)

    // J：胜利结算面板（技能击杀 → 胜利面板 XP/掉落）
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('骑士重击'))
      if (b && !b.disabled) b.click()
    })
    await sleep(600)
    const victory = await page.evaluate(() => document.body.textContent.includes('战斗胜利'))
    check('战斗胜利面板出现（J 前置）', victory)
    await shot('J_combat_victory')

    // ===== K–L：1366×768 =====
    await page.setViewport({ width: 1366, height: 768 })
    await sleep(300)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('返回冒险'))
      if (b) b.click()
    })
    await sleep(400)
    await clickBtn('青石村')
    await sleep(400)
    await shot('K_qingshi_1366')
    await clickBtn('村外草原')
    await sleep(300)
    await clickBtn('迎战')
    await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 })
    await sleep(400)
    await shot('L_combat_1366')

    // ===== M–O：390×844 =====
    await page.setViewport({ width: 390, height: 844 })
    await sleep(300)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('返回冒险'))
      if (b) b.click()
    })
    await sleep(400)
    await clickBtn('青石村')
    await sleep(400)
    await shot('M_qingshi_390')

    // N：390 任务区（右栏切到任务视图或截图含任务中心）
    await shot('N_quest_390')

    await clickBtn('村外草原')
    await sleep(300)
    await clickBtn('迎战')
    await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 })
    await sleep(400)
    await shot('O_combat_390')
  } finally {
    await browser.close()
    dev.kill()
    await rm(profile, { recursive: true, force: true })
  }

  console.log(`\n===== TM-P2-006 截图采集结果：${passes.length} 通过 / ${fails.length} 失败 =====`)
  if (fails.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
