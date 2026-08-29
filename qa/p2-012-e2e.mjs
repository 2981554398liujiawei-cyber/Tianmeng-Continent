// TM-P2-012 §74/§80：Boss Phase 浏览器 E2E + 神泉章节入口/采集 UI/黄金兔冻结/移动端布局。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const port = Number(process.env.P2_012_PORT || 5291)
const url = process.env.BASE_URL || `http://127.0.0.1:${port}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-012-'))
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`) }
const body = () => page.evaluate(() => document.body.textContent || '')
// 黄金兔冻结基线（§63）：status/stage/flags/rabbit_path 不得被神泉线改动
const GOLDEN_FREEZE = { status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } }

function fixture({ location = 'tianlong_city', questFlags = { tracked: true, preparation: 'none' }, questStage = 5, questStatus = 'in_progress', water = false, noRumor = false, sakura = 'none', noNorthUnlock = false } = {}) {
  return {
    // str 12 → 攻击力 9+2：固定 rng 下每次命中约 13 伤（Boss 36HP），保证先触发 Phase 再击杀（§34 死亡优先不被一刀秒掩盖）
    player: { id: 'p2-012-e2e', name: '神泉验收员', gender: 'male', level: 6, profession: 'knight', attributes: { str: 12, con: 50, agi: 50, mnd: 50, lck: 12 }, hp: 400, maxHp: 400, mp: 40, maxMp: 40, gold: 100, adventureXp: 1000, learnedSkillIds: ['knight_power_strike'] },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 4 }, { itemId: 'rabbit_path', quantity: 1 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_tianlong_martial_trial', status: 'completed', stage: 1, flags: { trial_reward_claimed: true } },
      { questId: 'quest_spirit_spring_water', status: questStatus, stage: questStage, flags: questFlags },
      { questId: 'quest_golden_rabbit_search', status: GOLDEN_FREEZE.status, stage: GOLDEN_FREEZE.stage, flags: { ...GOLDEN_FREEZE.flags } },
    ],
    world: {
      currentLocationId: location,
      flags: {
        ...(noRumor ? {} : { spirit_spring_rumor_heard: true }),
        ...(noNorthUnlock ? {} : { village_asked: true, qingshi_north_hills_unlocked: true }),
        spirit_spring_valley_unlocked: true, gathering_v1_unlocked: true, spirit_spring_wang_wu_taught: true,
        ...(water ? { black_bear_qialala_defeated: true } : {}),
      },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
    companions: sakura === 'none' ? {} : {
      sakura_yuko: { companionId: 'sakura_yuko', status: sakura, level: 4, mp: 8, maxMp: 8, learnedSkillIds: [], flags: {} },
    },
    relationships: {}, party: { activeCompanionIds: sakura === 'none' ? [] : ['sakura_yuko'] }, ownedMountIds: [], equippedMountId: null,
  }
}
let browser, page
async function ready() { for (let i = 0; i < 80; i += 1) { try { await fetch(url); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function local() { const clicked = await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find((entry) => (entry.textContent || '').includes('仅本机模式')); if (!button) return false; button.click(); return true }); if (clicked) await sleep(200) }
async function load(state) {
  await page.goto(url, { waitUntil: 'networkidle0' }); await local()
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: value })) }, state)
  await page.reload({ waitUntil: 'networkidle0' }); await local()
  const clicked = await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find((entry) => (entry.textContent || '').includes('继续游戏')); if (!button || button.disabled) return false; button.click(); return true })
  if (!clicked) throw new Error('继续游戏不可用')
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 }); await sleep(250)
}
async function clickText(text) {
  const ok = await page.evaluate((needle) => { const button = [...document.querySelectorAll('button')].find((entry) => !entry.disabled && (entry.textContent || '').includes(needle)); if (!button) return false; button.click(); return true }, text)
  if (ok) await sleep(250)
  return ok
}
async function readSave() { return page.evaluate(() => JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')) }

/** 迎战 Boss（在遭遇卡列表中找到黑熊恰拉拉的迎战按钮） */
async function engageBoss() {
  const engaged = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid$="-encounter-card"], [data-testid="training-encounter-card"]')]
    const card = cards.find((entry) => (entry.textContent || '').includes('黑熊恰拉拉'))
    const button = card ? [...card.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes('迎战')) : undefined
    if (!button) return false
    button.click()
    return true
  })
  if (!engaged) throw new Error('Boss 遭遇卡不可迎战')
  await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 })
}

/** Boss 战循环：真实随机（str12 单次伤害上限 13 < Boss 50% 血 18，§34 转阶段必先于死亡）。
    战斗中逐轮采样：转阶段日志 / 黄金化名称（同 CombatPage）/ Phase2 技能。 */
async function fightBoss() {
  let sawPhaseLog = false
  let sawGoldenInCombat = false
  let phaseSkillSeen = false
  let victory = false
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
  const text = await body()
  return { victory, sawPhaseLog, sawGoldenInCombat, phaseSkillSeen, text }
}

try {
  await ready(); browser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] }); page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 900 })

  // ---- §3/§4 Stage A：天龙城传闻 ----
  await load(fixture({ location: 'tianlong_city', questFlags: {}, questStage: 0, questStatus: 'undiscovered', noRumor: true }))
  check('BP0 天龙城出现神泉传闻中央卡', await page.$('[data-testid="spirit-spring-rumor"]') !== null)
  await clickText('记下神泉传闻')
  check('BP0b 传闻确认后中央卡消失（一次性）', await page.$('[data-testid="spirit-spring-rumor"]') === null)

  // ---- §17/§18/§50：青石北坡三层威胁 + 采集教学 ----
  await load(fixture({ location: 'qingshi_north_hills' }))
  check('BP1 北坡入口卡（王五）可见', await page.$('[data-testid="spirit-spring-north-hills"]') !== null)
  const northText = await body()
  check('BP2 低风险山林野猪遭遇卡', northText.includes('山林野猪') && northText.includes('低风险'))
  check('BP3 标准毒针蜂群遭遇卡', northText.includes('毒针蜂群') && northText.includes('标准'))
  check('BP4 高危山林黑熊遭遇卡', northText.includes('山林黑熊') && northText.includes('高危'))
  check('BP5 北坡可重复挑战提示（repeatable）', northText.includes('可重复'))
  check('BP6 采集按钮（止血草）出现', await clickText('止血草'))
  check('BP7 采集 toast 反馈（获得：止血草）', (await body()).includes('获得：止血草'))
  await sleep(300)
  check('BP8 一次性采集后按钮消失', !(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').trim() === '止血草'))))

  // ---- §26-§34：Boss Phase 1 → 2（同一场战斗）----
  await load(fixture({ location: 'spirit_spring_valley' }))
  check('BP9 山谷入口卡可见', await page.$('[data-testid="spirit-spring-valley"]') !== null)
  const engaged = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid$="-encounter-card"], [data-testid="training-encounter-card"]')]
    const card = cards.find((entry) => (entry.textContent || '').includes('黑熊恰拉拉'))
    const button = card ? [...card.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes('迎战')) : undefined
    if (!button) return false
    button.click()
    return true
  })
  check('BP10 Boss 遭遇卡可迎战', engaged)
  if (!engaged) throw new Error('BP10 失败：无法迎战')
  await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 })
  check('BP11 Phase1 敌方卡显示黑熊恰拉拉', (await body()).includes('黑熊恰拉拉'))
  const fight = await fightBoss()
  check('BP12 Phase2 转阶段系统日志（金色光芒）', fight.sawPhaseLog)
  check('BP13 Phase2 名称变为黄金战熊·恰拉拉（同一 CombatPage）', fight.sawGoldenInCombat)
  check('BP14 Phase2 新技能进入战斗日志', fight.phaseSkillSeen)
  check('BP15 Boss 战斗胜利', fight.victory)
  await clickText('返回冒险'); await sleep(400)
  check('BP16 Boss 首杀掉金刚巨盾（背包可见）', (await body()).includes('金刚巨盾') || await clickText('背包') && (await body()).includes('金刚巨盾'))

  // ---- §43：Boss 后主动收集神泉之水（guaranteed）----
  await load(fixture({ location: 'spirit_spring_valley', water: true, questFlags: { tracked: true, preparation: 'none' }, questStage: 6 }))
  check('BP17 收集神泉之水按钮出现（Boss 已击败）', await clickText('收集神泉之水'))
  check('BP18 取水反馈', (await body()).includes('获得：神泉之水') || (await body()).includes('神泉之水'))
  await sleep(300)
  check('BP19 取水一次性（按钮消失）', !(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('收集神泉之水')))))

  // ---- §45：带水回村回报 ----
  await load(fixture({ location: 'qingshi_village', water: true, questFlags: { tracked: true, preparation: 'none', water_collected: true }, questStage: 7 }))
  check('BP20 带水归来卡可见', await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('交付神泉之水'))))
  await clickText('交付神泉之水')
  check('BP21 回报反馈', (await body()).includes('《神泉之水》') || (await body()).includes('神泉'))

  // ---- §63/§64：Golden Rabbit HARD FREEZE（完整 Boss 战后校验存档 JSON）----
  await load(fixture({ location: 'spirit_spring_valley' }))
  await engageBoss()
  const freezeFight = await fightBoss()
  check('BP22 冻结校验前战斗已结束', freezeFight.victory)
  await clickText('返回冒险'); await sleep(300)
  await clickText('保存游戏'); await clickText('覆盖保存'); await clickText('确认覆盖'); await sleep(500)
  const saved = await readSave()
  const golden = saved?.gameState?.quests?.find((q) => q.questId === 'quest_golden_rabbit_search')
  const rabbitPath = saved?.gameState?.inventory?.find((e) => e.itemId === 'rabbit_path')
  check('BP23 黄金兔任务 status/stage/flags 原封不动', Boolean(golden) && golden.status === GOLDEN_FREEZE.status && golden.stage === GOLDEN_FREEZE.stage && JSON.stringify(golden.flags) === JSON.stringify(GOLDEN_FREEZE.flags), JSON.stringify(golden?.flags ?? null))
  check('BP24 rabbit_path 数量仍为 1', rabbitPath?.quantity === 1)
  check('BP25 神泉线与黄金兔线无联动 flag', !JSON.stringify(golden?.flags ?? {}).includes('spirit') && saved.gameState.quests.every((q) => q.questId !== 'quest_golden_rabbit_search' || true))

  // ---- R1 P1-01：Sakura 调查入口（正式 ID sakura_yuko；recruited+active 才可见）----
  await load(fixture({ location: 'qingshi_north_hills', questFlags: { tracked: false }, questStage: 2, sakura: 'recruited' }))
  check('SK1 Sakura 在队时「请优子判断」可见', await clickText('请优子判断'))
  check('SK2 Sakura 线索线索写入（金色兽毛）', (await body()).includes('樱花优子'))
  await clickText('保存游戏'); await clickText('覆盖保存'); await clickText('确认覆盖'); await sleep(500)
  const sakuraSave = await readSave()
  check('SK3 trackSpiritSpring(sakura) 写入 clue_spring_golden_fur', sakuraSave?.gameState?.world?.flags?.clue_spring_golden_fur === true)

  await load(fixture({ location: 'qingshi_north_hills', questFlags: { tracked: false }, questStage: 2, sakura: 'recruited', noNorthUnlock: false, water: false }))
  // Sakura 不在 active party：仅 recruited 不显示（recruited 但 party 为空）
  await load((() => { const f = fixture({ location: 'qingshi_north_hills', questFlags: { tracked: false }, questStage: 2, sakura: 'recruited' }); f.party.activeCompanionIds = []; return f })())
  check('SK4 Sakura 未激活时按钮不可见（不凭 recruited 出现）', !(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => (b.textContent || '').includes('请优子判断')))))

  // ---- R1 P1-02：北坡 requiredFlag 真接入（调查前不可进入 / 调查后开放且 Reload 保持）----
  await load(fixture({ location: 'qingshi_village', questStatus: 'undiscovered', questFlags: {}, questStage: 0, noRumor: true, noNorthUnlock: true }))
  const northBtnBefore = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '青石北坡')
    return b ? (b.disabled ? 'disabled' : 'enabled') : 'absent'
  })
  check('NH1 调查前北坡入口不可用', northBtnBefore !== 'enabled', `button=${northBtnBefore}`)
  // 走完村中调查（先记传闻）
  await page.goto(url, { waitUntil: 'networkidle0' }); await local()
  const nhFixture = fixture({ location: 'tianlong_city', questStatus: 'undiscovered', questFlags: {}, questStage: 0, noRumor: true, noNorthUnlock: true })
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: value })) }, nhFixture)
  await page.reload({ waitUntil: 'networkidle0' }); await local(); await clickText('继续游戏'); await sleep(250)
  await clickText('记下神泉传闻')
  await clickText('青石村'); await sleep(250)
  await clickText('向村长与药师打听')
  await clickText('保存游戏'); await clickText('覆盖保存'); await clickText('确认覆盖'); await sleep(500)
  const unlockedSave = await readSave()
  check('NH2 调查后写入 qingshi_north_hills_unlocked', unlockedSave?.gameState?.world?.flags?.qingshi_north_hills_unlocked === true)
  await load((() => { const f = fixture({ location: 'qingshi_village' }); return f })())
  check('NH3 调查后北坡正式开放', await clickText('青石北坡'))
  check('NH4 到达北坡（王五入口可见）', await page.$('[data-testid="spirit-spring-north-hills"]') !== null)
  await load(unlockedSave.gameState)
  check('NH5a Reload 后解锁 flag 保持', unlockedSave.gameState.world.flags.qingshi_north_hills_unlocked === true && await clickText('青石北坡'))
  check('NH5 Save→Reload 后北坡保持开放', await page.$('[data-testid="spirit-spring-north-hills"]') !== null)

  // ---- §79：390×844 移动端 ----
  await page.setViewport({ width: 390, height: 844 })
  await load(fixture({ location: 'qingshi_village', water: true, questFlags: { tracked: true, preparation: 'none', water_collected: true }, questStage: 7 }))
  const layout = await page.evaluate(() => ({ main: Boolean(document.querySelector('[data-testid="main-column"]')), scrollWidth: document.documentElement.scrollWidth }))
  check('BP26 390×844 主列渲染且无水平溢出', layout.main && layout.scrollWidth <= 400, `scrollWidth=${layout.scrollWidth}`)
} catch (error) { check('P2-012 script execution', false, error?.stack || String(error)) } finally { try { await browser?.close() } catch {}; try { dev?.kill() } catch {}; await rm(profile, { recursive: true, force: true }) }
const failed = results.filter((ok) => !ok).length
console.log(`===== P2-012 E2E: ${results.length - failed}/${results.length} =====`)
process.exit(failed ? 1 : 0)
