// ============================================================================
// 《天梦大陆》TM-P2-008 §16-29/§50/§68 北郊追踪全流程浏览器 E2E 验收（N1-15）。
//
// 覆盖：
//   N1  北门失联 completed 后，北门场景显示马科发布行动块（北门失联 · 调查终结）
//   N2  点击「接受任务：前往北郊继续追查」→ 任务 in_progress（当前目标更新）
//   N3  Stage A 北门「沿着足迹继续追踪」→ trail_tracked + 北郊解锁 + toast 获得线索拖行痕迹
//   N4  北郊连接可点 → 进入天龙城北郊
//   N5  Stage B 北郊「搜索袭击现场」→ ambush_found
//   N6  Stage C 多解按钮（MND/LCK 显示；无 Sakura/坐骑时 Sakura/Mount 隐藏）
//   N7  MND 检定失败可重试（失败提示 + 按钮保留，§29 不软阻断）
//   N8  MND 检定成功 → ambush_investigated + 调查按钮消失
//   N9  LCK 检定成功 → 获得线索巡逻队徽记
//   N10 Sakura 在场分支：插话按钮 + 获得线索黑色鬃毛 + 不自动解决（§22/§68）
//   N11 装备 fast_travel 坐骑分支：沿官道快速搜索 + 获得线索巡逻队徽记 + 不自动解决（§50）
//   N12 Stage D 北门「向马科汇报发现」→ reported + status completable
//   N13 提交任务 → completed + 40 金 + 100 XP（generic reward path §26）
//   N14 北郊附近威胁展示荒原狼群（variants 摘要）；首次胜利后不再出现（defeated 门）
//   N15 全程无 Production ID leak（quest_/clue_/enemy_/encounter_/location_/item_/skill_/companion_/mount_）
//
// 运行前提：无（脚本自备本地 dev server 5235）。
// 运行：node qa/p2-008-north-outskirts-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.NORTH_E2E_PORT || 5235)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-008-north-'))
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
await page.setViewport({ width: 1366, height: 900 })
const jsErrors = []
page.on('pageerror', (err) => jsErrors.push(String(err)))

async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')
const mainColText = () => page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')
const sidebarText = () => page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')

async function enterLocalModeIfNeeded() {
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式'))
    if (!button) return false
    button.click()
    return true
  })
  if (clicked) await sleep(SLEEP)
}

async function clickButton(label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(text))
    if (!button || button.disabled) return false
    button.click()
    return true
  }, label)
  if (clicked) await sleep(SLEEP)
  return clicked
}

async function clickTestId(testId) {
  const clicked = await page.evaluate((id) => {
    const button = document.querySelector(`[data-testid="${id}"]`)
    if (!button || button.disabled) return false
    button.click()
    return true
  }, testId)
  if (clicked) await sleep(SLEEP)
  return clicked
}

/** 在点击前覆盖 Math.random（保证检定确定性），点击后恢复 */
async function clickWithRoll(testId, value) {
  await page.evaluate((id, v) => {
    window.__savedRandom = Math.random
    Math.random = () => v
    document.querySelector(`[data-testid="${id}"]`)?.click()
    Math.random = window.__savedRandom
  }, testId, value)
  await sleep(SLEEP)
}

const leakedPrefixes = async () => {
  const text = await bodyText()
  return ID_PREFIXES.filter((p) => text.includes(p))
}

const toastText = async () => page.evaluate(() => document.querySelector('[role="status"]')?.textContent?.trim() ?? null)

/** 北郊 E2E fixture：北门 + 北门失联 completed + 北郊 available（马科发布块可接） */
function fixture(opts = {}) {
  const { sakura = false, mount = false, northQuestStatus = 'available' } = opts
  return {
    player: {
      id: 'player-north-e2e', name: '北郊验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      { questId: 'quest_north_gate_missing_patrol', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_north_outskirts', status: northQuestStatus, stage: 0, flags: {} },
    ],
    world: {
      currentLocationId: 'tianlong_north_gate', flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: {},
    },
    companions: sakura
      ? {
          sakura_yuko: {
            companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 6, maxMp: 6,
            learnedSkillIds: ['sakura_petalslash'], flags: {},
          },
        }
      : {},
    relationships: {},
    party: { activeCompanionIds: sakura ? ['sakura_yuko'] : [] },
    ownedMountIds: mount ? ['fire_stallion'] : [],
    equippedMountId: mount ? 'fire_stallion' : null,
  }
}

async function loadAndEnterLocal(save) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded(page)
  await page.evaluate((s) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s }))
  }, save)
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded(page)
  await clickButton('继续游戏')
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 })
  await sleep(400)
}

const statOf = (text, label) => {
  const m = text.match(new RegExp(label + '\\s*([0-9]+)'))
  return m ? Number(m[1]) : null
}

let section = 0
try {
  await ready()

  // ==================== 主线：N1-N8 + N12-N13 + N15（北门→北郊→北门→提交） ====================
  await loadAndEnterLocal(fixture())
  section = 1

  // ---- N1：马科发布行动块 + accept 按钮 ----
  let main = await mainColText()
  check('N1: 北门场景显示马科发布块（北门失联 · 调查终结）', main.includes('北门失联 · 调查终结') && main.includes('沿着他们留下的路线继续查'))
  check('N1: 发布块显示「接受任务：前往北郊继续追查」', (await page.$('[data-testid="accept-north-outskirts"]')) !== null)
  const leaked1 = await leakedPrefixes()
  check('N1: 全程无 Production ID leak（stage 1）', leaked1.length === 0, leaked1.join(','))

  // ---- N2：接受任务 ----
  await clickTestId('accept-north-outskirts')
  let side = await sidebarText()
  check('N2: 接受后任务 in_progress（右栏当前目标更新）', side.includes('沿着巡逻队留下的足迹继续追踪'))
  check('N2: 发布块切换为当前目标（不再显示接受按钮）', (await page.$('[data-testid="accept-north-outskirts"]')) === null)

  // ---- N3：Stage A 追踪 ----
  check('N3: 北门出现「沿着足迹继续追踪」（track-north-trail）', (await page.$('[data-testid="track-north-trail"]')) !== null)
  await clickTestId('track-north-trail')
  main = await mainColText()
  check('N3: 追踪后按钮消失（Stage A 完成）', (await page.$('[data-testid="track-north-trail"]')) === null)
  check('N3: 北郊连接变为可点（解锁）', (await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim())
    return btns.includes('天龙城北郊') && !document.body.textContent.includes('尚未找到进入此地的方法')
  })) === true)
  const toast3 = await toastText()
  check('N3: toast 提示获得线索「拖行痕迹」', toast3 !== null && toast3.includes('拖行痕迹'), `toast=${toast3}`)

  // ---- N4：进入北郊 ----
  await clickButton('天龙城北郊')
  main = await mainColText()
  check('N4: 进入天龙城北郊场景', main.includes('天龙城北郊') && main.includes('荒草与碎石的官道'))

  // ---- N5：Stage B 搜索 ----
  check('N5: 北郊出现「搜索袭击现场」', (await page.$('[data-testid="search-north-ambush"]')) !== null)
  await clickTestId('search-north-ambush')
  check('N5: 搜索后进入 Stage C（调查按钮出现）', (await page.$('[data-testid="investigate-mnd"]')) !== null)

  // ---- N6：Stage C 按钮条件 ----
  check('N6: MND 检定按钮可见', (await page.$('[data-testid="investigate-mnd"]')) !== null)
  check('N6: LCK 检定按钮可见', (await page.$('[data-testid="investigate-lck"]')) !== null)
  check('N6: 无 Sakura 在场时 Sakura 按钮隐藏', (await page.$('[data-testid="investigate-sakura"]')) === null)
  check('N6: 未装备坐骑时 Mount 按钮隐藏', (await page.$('[data-testid="investigate-mount"]')) === null)

  // ---- N7：MND 检定失败可重试（roll 3 → total 2 < DC 12）----
  await clickWithRoll('investigate-mnd', 0.1)
  main = await mainColText()
  check('N7: 检定失败提示「再试一次」', main.includes('你没有找到足够的线索'))
  check('N7: 失败后按钮保留（可重试，不软阻断）', (await page.$('[data-testid="investigate-mnd"]')) !== null)

  // ---- N8：MND 检定成功（roll 20 → total 19 ≥ DC 12）----
  await clickWithRoll('investigate-mnd', 0.99)
  check('N8: 成功后调查按钮消失', (await page.$('[data-testid="investigate-mnd"]')) === null)
  check('N8: LCK 按钮同步消失', (await page.$('[data-testid="investigate-lck"]')) === null)

  // ---- N12：回北门 Stage D 汇报 ----
  await clickButton('天龙城北门')
  main = await mainColText()
  check('N12: 北门出现「向马科汇报发现」', (await page.$('[data-testid="report-north-outskirts"]')) !== null)
  await clickTestId('report-north-outskirts')
  side = await sidebarText()
  check('N12: 汇报后任务进入「可提交」', side.includes('可提交') && side.includes('前往任务发布者处提交'))

  // ---- N13：travel 武馆（马科 giver 所在地）→ 提交任务 → completed + 40 金 + 100 XP ----
  // 提交按钮仅在马科所在地（武馆）显示（TaskActivitySidebar canSubmit = giver.locationId === 当前地点）
  await clickButton('天龙城')
  await clickButton('武馆')
  const submitBtnInfo = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes('提交'))
    return btns.map((b) => ({ text: b.textContent.trim(), disabled: b.disabled }))
  })
  await clickButton('提交任务')
  await sleep(500)
  const qcAfter = await page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent ?? '')
  const afterSubmit = await bodyText()
  const noticeSnippet = afterSubmit.match(/任务完成[\s\S]{0,50}/)?.[0] ?? '(未找到任务完成文案)'
  check('N13: 提交前存在「提交任务」按钮（武馆）', submitBtnInfo.some((b) => b.text.includes('提交任务')), JSON.stringify(submitBtnInfo))
  check('N13: 提交反馈显示任务完成 + 金币 +40', afterSubmit.includes('任务完成') && afterSubmit.includes('金币 +40'), noticeSnippet)
  check('N13: 冒险阅历 +100', afterSubmit.includes('冒险阅历 +100'))
  check('N13: 提交后可提交区消失', !qcAfter.includes('可提交（1）'), qcAfter.slice(-80).replace(/\s+/g, ' '))

  // ---- N14：北郊遭遇展示（主线完成后回到北郊看荒原狼群；武馆→城→北门→北郊）----
  await clickButton('天龙城')
  await clickButton('天龙城北门')
  await clickButton('天龙城北郊')
  main = await mainColText()
  check('N14: 北郊展示附近威胁「荒原狼群」', main.includes('荒原狼群'))
  check('N14: 荒原狼群 variants 摘要（×2 或 黑鬃魔狼+荒原野狼 或 ×3）', main.includes('荒原野狼×2') && main.includes('黑鬃魔狼+荒原野狼') && main.includes('荒原野狼×3'))
  check('N14: 荒原狼群「迎战」按钮存在', (await page.evaluate(() => {
    const card = [...document.querySelectorAll('div')].find((d) => d.textContent?.includes('荒原狼群'))
    return !!card && card.textContent.includes('迎战')
  })) === true)
  check('N14: 北郊同时展示单敌「落单野狼 · Lv.2」', main.includes('落单野狼') && main.includes('Lv.2'))
  const leaked2 = await leakedPrefixes()
  check('N14: 全程无 Production ID leak（stage 2）', leaked2.length === 0, leaked2.join(','))

  // ==================== N9：LCK 检定分支（独立 fixture） ====================
  await loadAndEnterLocal(fixture())
  await clickTestId('accept-north-outskirts')
  await clickTestId('track-north-trail')
  await clickButton('天龙城北郊')
  await clickTestId('search-north-ambush')
  await clickWithRoll('investigate-lck', 0.99)
  const leakedLck = await leakedPrefixes()
  check('N9: LCK 检定成功推进（调查按钮消失）', (await page.$('[data-testid="investigate-lck"]')) === null)
  // 右栏线索 Tab 展示「巡逻队徽记」（LCK 线索）
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const tab = qc && [...qc.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('线索'))
    if (tab) tab.click()
  })
  await sleep(300)
  side = await sidebarText()
  check('N9: 右栏线索录包含「巡逻队徽记」', side.includes('巡逻队徽记'), leakedLck.join(',') || '')
  check('N9: 全程无 Production ID leak（LCK 分支）', leakedLck.length === 0, leakedLck.join(','))

  // ==================== N10：Sakura 插话分支（独立 fixture，§22/§68） ====================
  await loadAndEnterLocal(fixture({ sakura: true }))
  await clickTestId('accept-north-outskirts')
  await clickTestId('track-north-trail')
  await clickButton('天龙城北郊')
  await clickTestId('search-north-ambush')
  check('N10: Sakura 在场时显示「请樱花优子观察」', (await page.$('[data-testid="investigate-sakura"]')) !== null)
  await clickTestId('investigate-sakura')
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const tab = qc && [...qc.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('线索'))
    if (tab) tab.click()
  })
  await sleep(300)
  side = await sidebarText()
  check('N10: Sakura 额外线索「黑色鬃毛」进入线索录', side.includes('黑色鬃毛'))
  check('N10: Sakura 观察不自动解决（调查按钮仍保留）', (await page.$('[data-testid="investigate-mnd"]')) !== null)
  const leakedSak = await leakedPrefixes()
  check('N10: 全程无 Production ID leak（Sakura 分支）', leakedSak.length === 0, leakedSak.join(','))

  // ==================== N11：Mount 快速搜索分支（独立 fixture，§50） ====================
  await loadAndEnterLocal(fixture({ mount: true }))
  await clickTestId('accept-north-outskirts')
  await clickTestId('track-north-trail')
  await clickButton('天龙城北郊')
  await clickTestId('search-north-ambush')
  check('N11: 装备坐骑时显示「沿官道快速搜索（坐骑）」', (await page.$('[data-testid="investigate-mount"]')) !== null)
  await clickTestId('investigate-mount')
  await page.evaluate(() => {
    const qc = document.querySelector('[data-testid="quest-column"]')
    const tab = qc && [...qc.querySelectorAll('button')].find((b) => b.textContent?.trim().startsWith('线索'))
    if (tab) tab.click()
  })
  await sleep(300)
  side = await sidebarText()
  check('N11: Mount 搜索得线索「巡逻队徽记」', side.includes('巡逻队徽记'))
  check('N11: Mount 搜索不自动解决（调查按钮仍保留）', (await page.$('[data-testid="investigate-mnd"]')) !== null)
  const leakedMount = await leakedPrefixes()
  check('N11: 全程无 Production ID leak（Mount 分支）', leakedMount.length === 0, leakedMount.join(','))

  check('N15: 全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('North Outskirts E2E 脚本执行无异常', false, String(error))
} finally {
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
  try { if (dev) dev.kill() } catch { /* 已退出 */ }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-008 §16-29 North Outskirts E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
