// TM-P2-013 §31：验收截图 A–N（Fail-Fast——任一步骤断言失败立即抛错，不产出残缺集合）
// A 天龙城任务入口  B 黑石塔四层  C 调查节点  D 职业选项  E 普通遭遇  F 封印室  G Boss
// H 未鉴定遗物  I 鉴定师  J 鉴定结果  K 装备要求  L 完成反馈  M tablet  N mobile landscape
// 六个分辨率冒烟：1920×1080 / 1600×900 / 1366×768 / 1024 landscape / mobile landscape / 390 mobile
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_013_SHOT_PORT || 5296)
const APP_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}/`
const OUT_DIR = fileURLToPath(new URL('./screenshots/p2-013/', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-013-shot-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await mkdir(OUT_DIR, { recursive: true })

const GOLDEN_FREEZE = { status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } }
const SKILLS = { warrior: 'warrior_suppress_strike', knight: 'knight_power_strike', ranger: 'ranger_swift_strike', mage: 'mage_spell' }

/** 黑石余响专项 fixture（截图用；主路径真实性由 qa/p2-013-e2e.mjs 保证） */
function fixture({
  location = 'tianlong_city', level = 7, profession = 'ranger', gold = 100, hp = 300,
  echo = null, flags = {}, inventory = [], viewport = { width: 1366, height: 768 },
} = {}) {
  return {
    player: {
      id: 'p2-013-shot', name: '黑石旅人', gender: 'male', level, profession,
      attributes: { str: 14, con: 14, agi: 16, mnd: 12, lck: 12 },
      hp, maxHp: hp, mp: 40, maxMp: 40, gold, adventureXp: 25 * level * (level + 1) - 50,
      learnedSkillIds: [SKILLS[profession]],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 4 },
      { itemId: 'rabbit_path', quantity: 1 },
      ...inventory,
    ],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_tianlong_martial_trial', status: 'completed', stage: 1, flags: { trial_reward_claimed: true } },
      { questId: 'quest_wangcai_trouble', status: 'completed', stage: 1, flags: { wangcai_briefed: true } },
      { questId: 'quest_spirit_spring_water', status: 'completed', stage: 7, flags: { water_collected: true } },
      { questId: 'quest_golden_rabbit_search', status: GOLDEN_FREEZE.status, stage: GOLDEN_FREEZE.stage, flags: { ...GOLDEN_FREEZE.flags } },
      ...(echo ? [{ questId: 'quest_black_stone_deep_echo', ...echo }] : []),
    ],
    world: {
      currentLocationId: location,
      flags: { black_stone_tower_unlocked: true, black_stone_tower_floor2_unlocked: true, black_stone_tower_floor3_unlocked: true, ...flags },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] }, ownedMountIds: [], equippedMountId: null,
    _viewport: viewport,
  }
}

async function load(state, viewport = { width: 1366, height: 768 }) {
  await page.setViewport(viewport)
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (b) b.click() }); await sleep(200)
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s })) }, state)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (b) b.click() }); await sleep(200)
  const ok = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('继续游戏')); if (!b || b.disabled) return false; b.click(); return true })
  if (!ok) throw new Error('继续游戏不可用')
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 }); await sleep(350)
}
const clickText = async (needle) => { const ok = await page.evaluate((n) => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes(n)); if (!b) return false; b.click(); return true }, needle); if (!ok) throw new Error(`missing button ${needle}`); await sleep(350) }
const assertBody = async (needle) => { const text = await page.evaluate(() => document.body.textContent || ''); if (!text.includes(needle)) throw new Error(`页面缺少关键内容: ${needle}`) }
async function shot(name) { await sleep(250); await page.screenshot({ path: join(OUT_DIR, name), fullPage: false }); console.log(`SHOT | ${name}`) }
async function ready() { for (let i = 0; i < 80; i++) { try { await fetch(APP_URL); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
/** 无横向严重溢出：scrollWidth 不得超过视口宽度 + 8px 容差 */
async function assertNoOverflow(label, width) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
  if (scrollWidth > width + 8) throw new Error(`${label} 横向溢出: scrollWidth=${scrollWidth} > ${width + 8}`)
}

const FLOOR4 = { black_stone_tower_floor4_unlocked: true }
const SEALED = { ...FLOOR4, black_stone_sealed_chamber_unlocked: true }
const echoIn = (stage, extra = {}) => ({ status: 'in_progress', stage, flags: { ...extra } })

try {
  await ready()

  // ---- A 天龙城任务入口（1920×1080）----
  await load(fixture({ location: 'tianlong_city' }), { width: 1920, height: 1080 })
  await assertBody('黑石塔异动'); await assertNoOverflow('A 天龙城任务入口', 1920)
  await shot('A-tianlong-quest-entry.png')

  // ---- B 黑石塔四层（1600×900）----
  await load(fixture({ location: 'black_stone_tower_floor4', echo: echoIn(0), flags: FLOOR4 }), { width: 1600, height: 900 })
  await assertBody('黑石塔四层'); await assertNoOverflow('B 黑石塔四层', 1600)
  await shot('B-floor4.png')

  // ---- C 调查节点（1366×768）----
  await load(fixture({ location: 'black_stone_tower_floor4', echo: echoIn(0), flags: FLOOR4 }), { width: 1366, height: 768 })
  await assertBody('深层调查'); await assertBody('崩裂石门')
  await assertNoOverflow('C 调查节点', 1366)
  await shot('C-investigation-points.png')

  // ---- D 职业选项（游侠 → 敏捷）----
  await load(fixture({ location: 'black_stone_tower_floor4', echo: echoIn(0), flags: FLOOR4, profession: 'ranger' }), { width: 1366, height: 768 })
  await assertBody('读门口的灰尘与足迹'); await assertBody('敏捷')
  await shot('D-profession-option-ranger.png')
  // 战士分支：验证四职业各有本职业选项
  await load(fixture({ location: 'black_stone_tower_floor4', echo: echoIn(0), flags: FLOOR4, profession: 'warrior' }), { width: 1366, height: 768 })
  await assertBody('稳住坍塌的石块'); await assertBody('力量')
  await shot('D2-profession-option-warrior.png')

  // ---- E 普通遭遇（四层 repeatable）----
  await load(fixture({ location: 'black_stone_tower_floor4', echo: echoIn(1, { investigated_broken_gate: true }), flags: FLOOR4 }), { width: 1366, height: 768 })
  await assertBody('黑石守卫'); await assertBody('深层巡逻'); await assertBody('可重复')
  await shot('E-normal-encounters.png')

  // ---- F 封印室 ----
  await load(fixture({ location: 'black_stone_sealed_chamber', echo: echoIn(2), flags: SEALED }), { width: 1366, height: 768 })
  await assertBody('黑石封印室'); await assertBody('黑石守门者')
  await shot('F-sealed-chamber.png')

  // ---- G Boss 战斗 ----
  const engaged = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid$="-encounter-card"]')]
    const card = cards.find((entry) => (entry.textContent || '').includes('黑石守门者'))
    const button = card ? [...card.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes('迎战')) : undefined
    if (!button) return false
    button.click(); return true
  })
  if (!engaged) throw new Error('Boss 遭遇卡不可迎战')
  await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 }); await sleep(400)
  await assertBody('黑石守门者')
  await shot('G-boss-combat.png')
  // 退出战斗（返回地图）
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').trim() === '返回'); if (b) b.click() }); await sleep(400)

  // ---- H 未鉴定遗物（背包）----
  await load(fixture({ location: 'tianlong_city', echo: echoIn(3), flags: { ...SEALED, blackstone_warden_defeated: true }, inventory: [{ itemId: 'unidentified_blackstone_relic', quantity: 1 }] }), { width: 1366, height: 768 })
  await clickText('打开背包'); await assertBody('未鉴定的黑石遗物')
  await shot('H-unidentified-relic.png')
  await page.evaluate(() => { const b = document.querySelector('[data-testid="backpack-item-unidentified_blackstone_relic"]'); if (b) b.click() }); await sleep(350)
  await assertBody('未鉴定'); await assertBody('鉴定后才会显出它真正的形态与属性')
  await shot('H2-unidentified-detail.png')
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '关闭'); if (b) b.click() }); await sleep(300)

  // ---- I 鉴定师 ----
  const appraiser = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '交谈' && (x.parentElement?.textContent || '').includes('遗物鉴定师'))
    if (!b || b.disabled) return false
    b.click(); return true
  })
  if (!appraiser) throw new Error('遗物鉴定师不可交谈')
  await sleep(400)
  await assertBody('旧王朝的封印器件')
  await shot('I-appraiser.png')

  // ---- J 鉴定结果 ----
  await page.evaluate(() => { const b = document.querySelector('[data-testid="identify-relic"]'); if (!b || b.disabled) throw new Error('鉴定按钮不可用'); b.click() })
  await sleep(500)
  await assertBody('鉴定完成')
  await shot('J-identify-result.png')

  // ---- K 装备要求（黑石猎弓：AGI 14 / Lv6）----
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '关闭'); if (b) b.click() }); await sleep(300)
  await clickText('打开背包'); await assertBody('黑石猎弓')
  await page.evaluate(() => { const b = document.querySelector('[data-testid="backpack-item-blackstone_hunter_bow"]'); if (b) b.click() }); await sleep(350)
  await assertBody('需要等级 6'); await assertBody('需要AGI 14')
  await shot('K-equipment-requirement.png')
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '关闭'); if (b) b.click() }); await sleep(300)

  // ---- L 完成反馈（向马科提交）----
  await load(fixture({
    location: 'tianlong_martial_hall', echo: { status: 'completable', stage: 4, flags: { relic_identified: true, reported: true, identified_result: 'blackstone_hunter_bow' } },
    flags: { ...SEALED, blackstone_warden_defeated: true },
    inventory: [{ itemId: 'blackstone_hunter_bow', quantity: 1 }],
  }), { width: 1366, height: 768 })
  await clickText('提交任务'); await sleep(400)
  await assertBody('任务完成'); await assertBody('金币 +70')
  await shot('L-completion.png')

  // ---- M tablet landscape（1024×768）----
  await load(fixture({ location: 'black_stone_tower_floor4', echo: echoIn(0), flags: FLOOR4 }), { width: 1024, height: 768 })
  await assertBody('深层调查'); await assertNoOverflow('M tablet landscape', 1024)
  await shot('M-tablet-landscape-1024.png')

  // ---- N mobile landscape（844×390）----
  await load(fixture({ location: 'black_stone_tower_floor4', echo: echoIn(0), flags: FLOOR4 }), { width: 844, height: 390 })
  await assertBody('深层调查'); await assertNoOverflow('N mobile landscape', 844)
  await shot('N-mobile-landscape-844.png')

  // ---- §31 六分辨率冒烟（无横向严重溢出）----
  const VIEWPORTS = [
    ['1920x1080', { width: 1920, height: 1080 }],
    ['1600x900', { width: 1600, height: 900 }],
    ['1366x768', { width: 1366, height: 768 }],
    ['1024-landscape', { width: 1024, height: 768 }],
    ['mobile-landscape', { width: 844, height: 390 }],
    ['390-mobile', { width: 390, height: 844 }],
  ]
  for (const [label, viewport] of VIEWPORTS) {
    await load(fixture({ location: 'black_stone_tower_floor4', echo: echoIn(0), flags: FLOOR4 }), viewport)
    await assertBody('深层调查')
    await assertNoOverflow(`smoke ${label}`, viewport.width)
    await shot(`smoke-${label}.png`)
  }
  // 390 竖屏：天龙城任务入口 + 鉴定师
  await load(fixture({ location: 'tianlong_city', inventory: [{ itemId: 'unidentified_blackstone_relic', quantity: 1 }], echo: echoIn(3), flags: { ...SEALED, blackstone_warden_defeated: true } }), { width: 390, height: 844 })
  await assertNoOverflow('390 鉴定师', 390)
  await shot('smoke-390-appraiser.png')

  console.log('===== P2-013 screenshots: captured =====')
} catch (error) {
  console.error(`SCREENSHOTS_FAIL | ${String(error)}`)
  process.exitCode = 1
} finally {
  try { await browser.close() } catch {}
  try { if (dev) dev.kill() } catch {}
  await rm(profile, { recursive: true, force: true })
}
