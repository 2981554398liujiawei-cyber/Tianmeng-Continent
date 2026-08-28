// TM-P2-012 §90：12 张验收截图（Fail-Fast——任一步骤断言失败立即抛错，不产出残缺集合）。
// A 青石村神泉入口 B 王五 C 猎人的旧路 D Gathering E 青石北坡 F 神泉山谷
// G 恰拉拉 Phase1 H 恰拉拉 Phase2 I Boss 战斗日志 J 金刚巨盾 K 完成反馈 L 390移动端
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_012_SHOT_PORT || 5294)
const APP_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}/`
const OUT_DIR = fileURLToPath(new URL('./screenshots/p2-012/', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-012-shot-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await mkdir(OUT_DIR, { recursive: true })

const GOLDEN_FREEZE = { status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } }
function fixture({ location = 'tianlong_city', quests = [], flags = {}, inventory = [], viewport = { width: 1366, height: 900 } } = {}) {
  return {
    player: { id: 'p2-012-shot', name: '神泉旅人', gender: 'male', level: 6, profession: 'knight', attributes: { str: 12, con: 50, agi: 50, mnd: 50, lck: 12 }, hp: 400, maxHp: 400, mp: 40, maxMp: 40, gold: 100, adventureXp: 1000, learnedSkillIds: ['knight_power_strike'] },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 4 }, { itemId: 'rabbit_path', quantity: 1 }, ...inventory],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_tianlong_martial_trial', status: 'completed', stage: 1, flags: { trial_reward_claimed: true } },
      { questId: 'quest_golden_rabbit_search', status: GOLDEN_FREEZE.status, stage: GOLDEN_FREEZE.stage, flags: { ...GOLDEN_FREEZE.flags } },
      ...quests,
    ],
    world: { currentLocationId: location, flags: { gathering_v1_unlocked: true, spirit_spring_wang_wu_taught: true, spirit_spring_valley_unlocked: true, ...flags }, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] }, ownedMountIds: [], equippedMountId: null,
  }
}
async function load(state, viewport = { width: 1366, height: 900 }) {
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
async function engageBoss() {
  const engaged = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid$="-encounter-card"], [data-testid="training-encounter-card"]')]
    const card = cards.find((entry) => (entry.textContent || '').includes('黑熊恰拉拉'))
    const button = card ? [...card.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes('迎战')) : undefined
    if (!button) return false
    button.click(); return true
  })
  if (!engaged) throw new Error('Boss 遭遇卡不可迎战')
  await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 }); await sleep(300)
}
const springQuest = (status, stage, flags = {}) => ({ questId: 'quest_spirit_spring_water', status, stage, flags })

try {
  await ready()

  // A 青石村神泉入口
  await load(fixture({ location: 'qingshi_village', quests: [springQuest('available', 1, { village_asked: false })], flags: { spirit_spring_rumor_heard: true, qingshi_north_hills_unlocked: true } }))
  await assertBody('青石村旧闻'); await shot('A-qingshi-village-rumor.png')

  // B 王五 / C 猎人的旧路（向王五学习采集按钮 = 旧路开启入口）/ E 青石北坡（三层威胁）
  await load(fixture({ location: 'qingshi_north_hills', quests: [springQuest('available', 1, { village_asked: true })] }))
  await assertBody('北坡旧猎路'); await shot('B-wang-wu.png')
  await assertBody('向王五学习采集'); await shot('C-hunter-old-path.png')
  await assertBody('山林黑熊'); await shot('E-qingshi-north-hills.png')

  // D Gathering（采集反馈 toast）
  await load(fixture({ location: 'qingshi_north_hills', quests: [springQuest('in_progress', 2, { wang_wu_met: true })] }))
  await clickText('止血草'); await assertBody('获得：止血草'); await shot('D-gathering.png')

  // F 神泉山谷
  await load(fixture({ location: 'spirit_spring_valley', quests: [springQuest('in_progress', 4, { tracked: true, tracking_method: 'mnd', tracking_success: true })] }))
  await assertBody('神泉山谷'); await assertBody('黑熊恰拉拉'); await shot('F-spirit-spring-valley.png')

  // G/H/I Boss 战：Phase1 → 黄金化 → 战斗日志
  await load(fixture({ location: 'spirit_spring_valley', quests: [springQuest('in_progress', 5, { tracked: true, preparation: 'none' })] }))
  await engageBoss()
  await assertBody('黑熊恰拉拉'); await shot('G-boss-phase1.png')
  let phaseShot = false
  for (let i = 0; i < 200; i += 1) {
    const text = await page.evaluate(() => document.body.textContent || '')
    if (text.includes('战斗胜利')) break
    if (!phaseShot && text.includes('金色光芒') && text.includes('黄金战熊·恰拉拉')) {
      await shot('H-boss-phase2.png'); await shot('I-boss-combat-log.png'); phaseShot = true
    }
    const attacked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').trim() === '普通攻击'); if (!b) return false; b.click(); return true })
    if (attacked) {
      await sleep(120)
      await page.evaluate(() => { const b = [...document.querySelectorAll('footer button')].find((x) => !x.disabled && (x.textContent || '').trim() !== '取消'); if (b) b.click() })
      await sleep(200)
    }
    const ended = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').trim() === '结束回合'); if (!b) return false; b.click(); return true })
    if (!attacked && !ended) await sleep(300)
    else await sleep(180)
  }
  if (!phaseShot) throw new Error('Boss 未在战斗中进入 Phase 2')
  await assertBody('战斗胜利')

  // J 金刚巨盾（移动端背包 Drawer；Boss 首杀专属装备）
  await load(fixture({ location: 'spirit_spring_valley', quests: [springQuest('in_progress', 6, { tracked: true, preparation: 'none', qialala_defeated: true })], flags: { black_bear_qialala_defeated: true }, inventory: [{ itemId: 'king_kong_giant_shield', quantity: 1 }] }, { width: 390, height: 844 }))
  await clickText('背包'); await assertBody('金刚巨盾')
  // 打开物品详情后再截图（显示需求差距 Tooltip 文案）
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('金刚巨盾')); if (b) b.click() }); await sleep(350)
  await assertBody('需要STR 15')
  await shot('J-king-kong-shield.png')

  // K 完成反馈（北坡向王五提交 → 任务完成通知）
  await load(fixture({ location: 'qingshi_north_hills', quests: [springQuest('completable', 8, { tracked: true, preparation: 'none', water_collected: true, reported: true })] }))
  await clickText('提交任务'); await assertBody('任务完成'); await assertBody('金币 +60'); await shot('K-completion.png')

  // L 390 移动端（青石村神泉入口）
  await load(fixture({ location: 'qingshi_village', quests: [springQuest('available', 1, { village_asked: false })], flags: { spirit_spring_rumor_heard: true, qingshi_north_hills_unlocked: true } }), { width: 390, height: 844 })
  await assertBody('青石村旧闻'); await shot('L-mobile-390.png')

  console.log('===== P2-012 screenshots: 12 captured =====')
} catch (error) {
  console.error(`SCREENSHOTS_FAIL | ${String(error)}`)
  process.exitCode = 1
} finally {
  try { await browser.close() } catch {}
  try { if (dev) dev.kill() } catch {}
  await rm(profile, { recursive: true, force: true })
}
