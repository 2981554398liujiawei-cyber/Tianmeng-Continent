// TM-P2-012 §75：Full Journey——从 P2-011 完成存档出发的真实 UI 全流程：
// 传闻 → 回村 → 王五/旧路 → 首次采集 → 追踪 → 山谷 → 战前准备 → 恰拉拉 Phase1/2 → 胜利 →
// 采集神泉之水 → 回村回报 → 北坡提交 → 完成反馈 → Save → Reload → 一致性 → 黄金兔冻结。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_012_JOURNEY_PORT || 5293)
const APP_URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-012-journey-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage(); await page.setViewport({ width: 1366, height: 900 })
const errors = []; page.on('pageerror', (e) => errors.push(String(e)))
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`); if (!ok) throw new Error(name + (detail ? `: ${detail}` : '')) }
const body = () => page.evaluate(() => document.body.textContent || '')
const requireId = async (id) => { const el = await page.$(`[data-testid="${id}"]`); if (!el) throw new Error(`missing state ${id}`); return el }
const clickText = async (needle) => { const ok = await page.evaluate((n) => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes(n)); if (!b) return false; b.click(); return true }, needle); if (!ok) throw new Error(`missing button ${needle}`); await sleep(300) }
async function ready() { for (let i = 0; i < 80; i++) { try { await fetch(APP_URL); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function localMode() { const yes = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').includes('仅本机模式')); if (!b) return false; b.click(); return true }); if (yes) await sleep(250) }
const GOLDEN_FREEZE = { status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } }
function fixture() {
  return {
    // str 12：Boss 战每次命中上限 13 < 50% 血线（36/2=18），保证 §34 转阶段先于死亡且不会被一刀秒
    player: { id: 'p2-012-journey', name: '神泉旅人', gender: 'male', level: 6, profession: 'knight', attributes: { str: 12, con: 50, agi: 50, mnd: 50, lck: 12 }, hp: 400, maxHp: 400, mp: 40, maxMp: 40, gold: 100, adventureXp: 1000, learnedSkillIds: ['knight_power_strike'] },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 4 }, { itemId: 'rabbit_path', quantity: 1 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_tianlong_martial_trial', status: 'completed', stage: 1, flags: { trial_reward_claimed: true } },
      { questId: 'quest_golden_rabbit_search', status: GOLDEN_FREEZE.status, stage: GOLDEN_FREEZE.stage, flags: { ...GOLDEN_FREEZE.flags } },
    ],
    world: { currentLocationId: 'tianlong_city', flags: {}, completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {} },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] }, ownedMountIds: [], equippedMountId: null,
  }
}
async function loadFixture() {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' }); await localMode()
  await page.evaluate((s) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s })) }, fixture())
  await page.reload({ waitUntil: 'networkidle0' }); await localMode(); await clickText('继续游戏'); await requireId('main-column')
}
async function readSave() { return page.evaluate(() => JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')) }
async function engageBoss() {
  const engaged = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid$="-encounter-card"], [data-testid="training-encounter-card"]')]
    const card = cards.find((entry) => (entry.textContent || '').includes('黑熊恰拉拉'))
    const button = card ? [...card.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes('迎战')) : undefined
    if (!button) return false
    button.click(); return true
  })
  if (!engaged) throw new Error('Boss 遭遇卡不可迎战')
  await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 })
}
async function fightBoss() {
  let sawPhaseLog = false, sawGoldenInCombat = false, phaseSkillSeen = false, victory = false
  for (let i = 0; i < 300; i += 1) {
    const text = await body()
    const inCombat = await page.$('[data-testid="combat-action-tray"]') !== null
    if (text.includes('战斗胜利')) { victory = true; break }
    if (text.includes('金色光芒')) sawPhaseLog = true
    if (inCombat && text.includes('黄金战熊·恰拉拉')) sawGoldenInCombat = true
    if (text.includes('黄金震地') || text.includes('暴怒冲撞')) phaseSkillSeen = true
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
  return { victory, sawPhaseLog, sawGoldenInCombat, phaseSkillSeen }
}

try {
  await ready(); await loadFixture()
  // J1 天龙城传闻（§4 Stage A：马科不直接发任务，玩家从城市传闻得知）
  check('J1 天龙城神泉传闻卡', await page.$('[data-testid="spirit-spring-rumor"]') !== null)
  await clickText('记下神泉传闻')

  // J2 §5：经重新开放的官道返回青石村（§4 修复：双向连接）
  await clickText('青石村'); await requireId('spirit-spring-village')
  check('J2 回青石村且打听卡可见', true)
  await clickText('向村长与药师打听')

  // J3 §6/§7：北坡见王五，学习采集（猎人的旧路随之开启）
  await clickText('青石北坡'); await requireId('spirit-spring-north-hills')
  check('J3 北坡王五入口与三层威胁', (await body()).includes('山林野猪') && (await body()).includes('山林黑熊'))
  await clickText('向王五学习采集')

  // J4 §10/§14：第一次采集（一次性）
  await clickText('止血草')
  check('J4 首次采集反馈', (await body()).includes('获得：止血草'))
  await sleep(300)
  check('J4b 一次性采集节点消失', !(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === '止血草'))))

  // J5 §22：MND 追踪（mnd 50 → DC12 必成；fail-forward 由 store 测试覆盖）
  await clickText('MND 追踪')
  check('J5 追踪成功并解锁山谷', (await body()).includes('山谷'))

  // J6 §19/§20/§51：进入神泉山谷（标准混合遭遇 + Boss）
  await clickText('神泉山谷'); await requireId('spirit-spring-valley')
  const valleyText = await body()
  check('J6 山谷混合遭遇（山谷野兽·标准）', valleyText.includes('山谷野兽') && valleyText.includes('标准'))
  check('J6b 山谷 Boss 遭遇（黑熊恰拉拉·高危）', valleyText.includes('黑熊恰拉拉'))

  // J7 §24：战前准备——直接挑战（§25 不叠满）
  await clickText('直接挑战')

  // J8 §26-§35：Boss Phase1 → 黄金化 → 胜利（同一场战斗）
  await engageBoss()
  const fight = await fightBoss()
  check('J8 Phase1→Phase2 转阶段日志', fight.sawPhaseLog)
  check('J8b 黄金战熊·恰拉拉（同一 CombatPage）', fight.sawGoldenInCombat)
  check('J8c Phase2 技能进入日志', fight.phaseSkillSeen)
  check('J8d Boss 战斗胜利', fight.victory)
  await clickText('返回冒险'); await sleep(400)

  // J9 §36/§43：Boss 后主动采集——神泉之水（guaranteed）+ 熊皮
  await clickText('收集神泉之水')
  check('J9 取得神泉之水', (await body()).includes('获得：收集神泉之水') || (await body()).includes('神泉之水'))
  await clickText('收集熊皮').catch(() => {})
  check('J9b 山谷采集完成（按钮均消失）', !(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => ['收集神泉之水', '收集熊皮'].includes((b.textContent || '').trim())))))

  // J10 §45：带水经北坡回村回报（山谷只连北坡）
  await clickText('青石北坡')
  await clickText('青石村')
  await clickText('交付神泉之水')
  check('J10 回报反馈（可以提交）', (await body()).includes('《神泉之水》可以提交了'))

  // J11 §46/§47：北坡向王五提交 → 完成反馈一次性
  await clickText('青石北坡')
  await clickText('提交任务')
  const noticeText = await body()
  check('J11 完成反馈出现一次（任务完成：《神泉之水》）', noticeText.includes('神泉之水') && noticeText.includes('任务完成'))
  await clickText('知道了')
  check('J11b 确认后完成卡消失（不霸屏）', !(await body()).includes('任务完成：《神泉之水》'))

  // J12 Save V6 → Menu → Reload → 一致性
  await clickText('保存游戏'); await clickText('覆盖保存'); await clickText('确认覆盖'); await sleep(450)
  await clickText('返回主菜单'); await clickText('继续游戏'); await requireId('main-column')
  const saved = await readSave()
  const quest = saved?.gameState?.quests?.find((q) => q.questId === 'quest_spirit_spring_water')
  check('J12 存档中任务 completed', quest?.status === 'completed', `status=${quest?.status}`)
  check('J12b 背包含神泉之水 ×1', saved?.gameState?.inventory?.find((e) => e.itemId === 'spirit_spring_water')?.quantity === 1)
  check('J12c 神泉山谷永久开放（§46）', saved?.gameState?.world?.flags?.spirit_spring_valley_unlocked === true)
  check('J12d 奖励到账（金币≥160 = 100基础+60任务）', (saved?.gameState?.player?.gold ?? 0) >= 160)
  check('J12e 完成卡 reload 后不再出现（§47）', !(await body()).includes('任务完成：《神泉之水》'))

  // J13 §63/§64：Golden Rabbit exact freeze
  const golden = saved?.gameState?.quests?.find((q) => q.questId === 'quest_golden_rabbit_search')
  check('J13 黄金兔 status/stage 冻结', golden?.status === GOLDEN_FREEZE.status && golden?.stage === GOLDEN_FREEZE.stage)
  check('J13b 黄金兔四 flags 冻结', JSON.stringify(golden?.flags) === JSON.stringify(GOLDEN_FREEZE.flags), JSON.stringify(golden?.flags ?? null))
  check('J13c rabbit_path ×1 原封不动', saved?.gameState?.inventory?.find((e) => e.itemId === 'rabbit_path')?.quantity === 1)
  check('J13d 无神泉↔黄金兔联动 flag', !JSON.stringify(golden?.flags ?? {}).includes('spirit'))
  check('J14 无页面异常', errors.length === 0, errors.slice(0, 3).join(' | '))
  console.log('FULL_JOURNEY_E2E_GREEN | P2-011 end save -> rumor -> village -> Wang Wu -> gather -> track -> valley -> prep -> boss P1/P2 -> water -> report -> submit -> save/reload -> Golden freeze')
} catch (error) {
  console.error(`FULL_JOURNEY_E2E_FAIL | ${String(error)}`)
  process.exitCode = 1
} finally {
  try { await browser.close() } catch {}
  try { if (dev) dev.kill() } catch {}
  await rm(profile, { recursive: true, force: true })
}
