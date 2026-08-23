// ============================================================================
// 《天梦大陆》TM-P2-008 完整主线 Journey E2E（FJ1-FJ20）。
//
// 与 qa/p2-008-north-outskirts-e2e.mjs 互补：
//   - north-outskirts：注入「北门失联 completed」前置，聚焦北郊追踪内部细节（多解分支/Sakura/Mount/遭遇/ID leak）
//   - full-journey：从「Phase 1 完成」存档出发，走真实 UI 完整主线
//     （Golden Rabbit 冻结 → 北门失联调查/战斗/提交 → 马科发布北郊 → 北郊追踪完成），
//     验证 P2-008 后既有主线零回归 + 新北郊自然衔接 + Golden Rabbit HARD FREEZE。
//
// 覆盖：
//   FJ1  Golden Rabbit 冻结 fixture 存档合法（in_progress / stage 0 / 四调查 flags / rabbit_path ×1）
//   FJ2  武馆接《北门失联》（附近委托 · 马科）→ in_progress + 目标更新
//   FJ3  北门调查痕迹 → 黑鬃魔狼出现（零回归：既有北门失联流程不受中间区重构影响）
//   FJ4  击败黑鬃魔狼（真实战斗 UI，RNG 固定）→ 胜利剧情 + 可提交
//   FJ5  回武馆提交《北门失联》→ completed + 金币 +30 + 马科固定剧情（封锁消息继续查）
//   FJ6  北门失联完成后马科发布《北郊追踪》（accept-north-outskirts）→ 接取 in_progress
//   FJ7  Stage A 追踪足迹 → 北郊解锁 + 线索拖行痕迹
//   FJ8  北郊搜索现场 → Stage C 多解按钮
//   FJ9  MND 检定成功 → 推进调查（roll 20）
//   FJ10 回北门向马科汇报 → 可提交
//   FJ11 武馆提交《北郊追踪》→ completed + 金币 +40 + 冒险阅历 +100
//   FJ12 Golden Rabbit 全程冻结（UI 仍进行中 + 存档 in_progress/stage0/四 flags/rabbit_path ×1 不变）
//   FJ13 全程无 Production ID leak + 无 JS exception
//
// 运行前提：无（脚本自备本地 dev server 5240）。
// 运行：node qa/p2-008-full-journey-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.FULL_JOURNEY_E2E_PORT || 5240)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const SLEEP = 350

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-008-full-journey-'))
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

// ---- 战斗辅助（复用 phase2-e2e.mjs 的 P2-007 战斗适配） ----
const readLocationId = () =>
  page.evaluate(() => document.querySelector('[data-current-location-id]')?.getAttribute('data-current-location-id') || null)

const buttonDisabled = (text) =>
  page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    return btn ? btn.disabled : null
  }, text)

const clickInQuestColumn = async (text) => {
  await page.evaluate((t) => {
    const col = document.querySelector('[data-testid="quest-column"]')
    if (!col) throw new Error('未找到 quest-column')
    const btn = [...col.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('quest-column 未找到按钮: ' + t)
    btn.click()
  }, text)
  await sleep(SLEEP)
}

const acceptNearbyQuest = async (name) => {
  await clickInQuestColumn('查看')
  const body = await bodyText()
  if (body.includes('查看委托')) {
    await clickInQuestColumn('查看委托')
    await sleep(200)
    await clickInQuestColumn('接受任务')
  } else if (body.includes('接受任务')) {
    await clickInQuestColumn('接受任务')
  } else {
    throw new Error(`附近委托展开后未找到「查看委托/接受任务」按钮（${name}）`)
  }
}

const waitPlayerTurn = async (timeoutMs = 10000) => {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const t = await bodyText()
    if (t.includes('返回冒险')) return false
    if (t.includes('普通攻击')) return true
    await sleep(120)
  }
  return false
}

const clickEnemyTarget = async () => {
  const clicked = await page.evaluate(() => {
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '取消')
    if (!cancel) return false
    const btn = cancel.parentElement?.querySelector('button')
    if (!btn || btn.disabled) return false
    btn.click()
    return true
  })
  await sleep(250)
  return clicked
}

const playerAttack = async () => {
  const clicked = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('普通攻击'))
    if (!btn || btn.disabled) return false
    btn.click()
    return true
  })
  if (!clicked) return false
  await sleep(250)
  return clickEnemyTarget()
}

const useSkillIfAvailable = async (skillName) => {
  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('技能'))
    if (!btn || btn.disabled) return false
    btn.click()
    return true
  })
  if (!opened) return false
  await sleep(300)
  const clickedSkill = await page.evaluate((name) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(name) && !b.disabled)
    if (!btn) return false
    btn.click()
    return true
  }, skillName)
  if (!clickedSkill) {
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('技能'))?.click())
    await sleep(200)
    return false
  }
  await sleep(250)
  return clickEnemyTarget()
}

/** 进入战斗前固定 0.1 RNG（先手检定各单位 D20=3 → 按 AGI 排序） */
const enterBattle = async (enemyName) => {
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.1
  })
  await page.evaluate((n) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('迎战'))
    if (!btn) throw new Error('未找到迎战按钮: ' + n)
    btn.click()
  }, enemyName)
  await sleep(500)
}

/** 战斗循环：每轮玩家暴击 0.99 → 敌人大失败 0；低血用药；胜利后返回冒险 */
const combatLoop = async (enemyName, level) => {
  let body = await bodyText()
  check(`进入${enemyName}战斗（Lv.${level}）`, body.includes(enemyName) && body.includes(`Lv.${level}`))
  await page.evaluate(() => { Math.random = () => 0.1 })
  let skillFirst = true
  for (let i = 0; i < 30; i += 1) {
    const onPlayerTurn = await waitPlayerTurn()
    const combatBody = await page.evaluate(() => document.body.innerText)
    if (combatBody.includes('返回冒险')) break
    if (!onPlayerTurn) break
    await page.evaluate(() => {
      Math.random = () => { Math.random = () => 0; return 0.99 }
    })
    let acted = false
    if (skillFirst) {
      acted = await useSkillIfAvailable('骑士重击')
      skillFirst = false
    }
    if (acted) continue
    const hp = combatBody.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
    if (hp && Number(hp[1]) / Number(hp[2]) < 0.5) {
      const potionUsed = await page.evaluate(() => {
        const open = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('物品'))
        if (!open || open.disabled) return false
        open.click()
        return true
      })
      if (potionUsed) {
        await sleep(300)
        const used = await page.evaluate(() => {
          const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('使用治疗药水'))
          if (b && !b.disabled) { b.click(); return true }
          return false
        })
        if (used) {
          await sleep(600)
          continue
        }
        await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('物品'))?.click())
        await sleep(200)
      }
    }
    const attacked = await playerAttack()
    if (!attacked) break
  }
  await page.evaluate(() => {
    if (window.__origRandom) Math.random = window.__origRandom
  })
  body = await bodyText()
  check(`击败${enemyName}（战斗胜利）`, body.includes('战斗胜利'), body.includes('战斗失败') ? '战斗失败！' : '')
  await clickButton('返回冒险')
}

/** Phase 1 完成等价 fixture：Golden Rabbit 冻结 + 北门失联 available + 玩家在武馆 */
function phase1Fixture() {
  return {
    player: {
      id: 'player-full-journey', name: '主线验收员', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 24, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'rabbit_path', quantity: 1 }, // Golden Rabbit 冻结：兔子的路径 ×1
    ],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      // Golden Rabbit HARD FREEZE（安全约束：四 flags + in_progress + stage 0）
      {
        questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0,
        flags: {
          asked_blacksmith: true, asked_apothecary: true,
          village_inquiry_reported: true, rabbit_lair_rechecked: true,
        },
      },
      { questId: 'quest_wangcai_trouble', status: 'completed', stage: 0, flags: {} }, // Phase 1 主线完成（北门失联附近委托前置）
      { questId: 'quest_north_gate_missing_patrol', status: 'available', stage: 0, flags: {} },
    ],
    world: {
      currentLocationId: 'tianlong_martial_hall', flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: {},
    },
    companions: {},
    relationships: {},
    party: { activeCompanionIds: [] },
    ownedMountIds: [],
    equippedMountId: null,
  }
}

async function loadAndEnterLocal(save) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate((s) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s }))
  }, save)
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await clickButton('继续游戏')
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 })
  await sleep(400)
}

/** 读 Slot 1 存档 JSON（Golden Rabbit 冻结最终校验用） */
const readSaveGameState = () =>
  page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    if (!raw) return null
    try { return JSON.parse(raw).gameState } catch { return null }
  })

let section = 0
try {
  await ready()

  // ==================== FJ1：Phase 1 完成 fixture 存档校验 ====================
  const save = phase1Fixture()
  const goldenQuest = save.quests.find((q) => q.questId === 'quest_golden_rabbit_search')
  check('FJ1: Golden Rabbit 冻结存档合法（in_progress/stage 0）', goldenQuest?.status === 'in_progress' && goldenQuest?.stage === 0)
  check(
    'FJ1: 四调查 flags 保持（铁匠/药师/村长汇报/巢穴复查）',
    goldenQuest?.flags?.asked_blacksmith === true && goldenQuest?.flags?.asked_apothecary === true &&
      goldenQuest?.flags?.village_inquiry_reported === true && goldenQuest?.flags?.rabbit_lair_rechecked === true,
  )
  check('FJ1: rabbit_path ×1', save.inventory.some((e) => e.itemId === 'rabbit_path' && e.quantity === 1))
  check('FJ1: 北门失联 available（马科附近委托）', save.quests.some((q) => q.questId === 'quest_north_gate_missing_patrol' && q.status === 'available'))

  await loadAndEnterLocal(save)
  section = 1

  // ==================== FJ2：接《北门失联》 ====================
  let body = await bodyText()
  check('FJ2: 武馆场景加载（马科）', body.includes('武馆') && body.includes('马科'))
  check('FJ2: 《北门失联》附近委托可见（发布者马科）', body.includes('附近委托') && body.includes('马科：《北门失联》'))
  await acceptNearbyQuest('北门失联')
  let side = await sidebarText()
  check('FJ2: 《北门失联》进行中 + 目标更新', side.includes('北门失联') && side.includes('前往天龙城北门'))

  // ==================== FJ3：北门调查 → 黑鬃魔狼 ====================
  await clickButton('天龙城')
  await clickButton('天龙城北门')
  check('FJ3: 到达北门（tianlong_north_gate）', (await readLocationId()) === 'tianlong_north_gate')
  check('FJ3: 「查看巡逻队留下的痕迹」可用', (await buttonDisabled('查看巡逻队留下的痕迹')) === false)
  await clickButton('查看巡逻队留下的痕迹')
  body = await bodyText()
  check('FJ3: 痕迹剧情（凌乱马蹄印）', body.includes('凌乱马蹄印'))
  check('FJ3: 调查后黑鬃魔狼 Lv.3 出现（迎战）', body.includes('黑鬃魔狼') && body.includes('Lv.3') && body.includes('迎战'))

  // ==================== FJ4：击败黑鬃魔狼 ====================
  await enterBattle('黑鬃魔狼')
  await combatLoop('黑鬃魔狼', 3)
  body = await bodyText()
  check('FJ4: 北门胜利剧情（黑鬃魔狼倒在荒草之间）', body.includes('黑鬃魔狼倒在荒草之间。'))
  check('FJ4: 铜牌剧情（断裂铜牌）', body.includes('断裂铜牌'))
  check('FJ4: 日志显示黑鬃魔狼已击败', body.includes('黑鬃魔狼已击败，找到了断裂的铜牌。'))
  check('FJ4: 《北门失联》可提交（右栏）', (await sidebarText()).includes('可提交'))

  // ==================== FJ5：回武馆提交《北门失联》 ====================
  await clickButton('天龙城')
  await clickButton('武馆')
  const goldBefore = await page.evaluate(() => {
    const m = (document.body.textContent || '').match(/金币\s*(\d+)/)
    return m ? Number(m[1]) : null
  })
  check('FJ5: 「提交任务」按钮可用（武馆）', (await buttonDisabled('提交任务')) === false)
  await clickButton('提交任务')
  await sleep(500)
  body = await bodyText()
  check('FJ5: 《北门失联》已完成（右栏已完成区）', (await sidebarText()).includes('已完成（'))
  check('FJ5: 马科固定剧情（接过断裂的铜牌）', body.includes('马科接过断裂的铜牌，脸色沉了下来。'))
  check('FJ5: 马科固定剧情（封锁消息继续查）', body.includes('我会先派人封锁消息。下一步，我们得沿着他们留下的路线继续查。'))
  const goldAfter = await page.evaluate(() => {
    const m = (document.body.textContent || '').match(/金币\s*(\d+)/)
    return m ? Number(m[1]) : null
  })
  check('FJ5: 提交《北门失联》金币 +30', goldBefore !== null && goldAfter === goldBefore + 30, `金币 ${goldBefore}→${goldAfter}`)

  // ==================== FJ6：马科发布《北郊追踪》→ 接取 ====================
  check('FJ6: 北门失联完成后马科发布块（北门失联 · 调查终结）', body.includes('北门失联 · 调查终结'))
  check('FJ6: 「接受任务：前往北郊继续追查」', (await page.$('[data-testid="accept-north-outskirts"]')) !== null)
  await clickTestId('accept-north-outskirts')
  side = await sidebarText()
  check('FJ6: 《北郊追踪》进行中 + 目标更新', side.includes('北郊追踪') && side.includes('沿着巡逻队留下的足迹继续追踪'))

  // ==================== FJ7：Stage A 追踪（北门） ====================
  await clickButton('天龙城')
  await clickButton('天龙城北门')
  check('FJ7: 北门「沿着足迹继续追踪」', (await page.$('[data-testid="track-north-trail"]')) !== null)
  await clickTestId('track-north-trail')
  check('FJ7: 追踪后北郊连接解锁可点', (await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent?.trim())
    return btns.includes('天龙城北郊') && !document.body.textContent.includes('尚未找到进入此地的方法')
  })) === true)
  const toast = await page.evaluate(() => document.querySelector('[role="status"]')?.textContent?.trim() ?? null)
  check('FJ7: toast 获得线索「拖行痕迹」', toast !== null && toast.includes('拖行痕迹'), `toast=${toast}`)

  // ==================== FJ8：北郊搜索 → Stage C ====================
  await clickButton('天龙城北郊')
  body = await bodyText()
  check('FJ8: 进入天龙城北郊', body.includes('天龙城北郊') && body.includes('荒草与碎石的官道'))
  check('FJ8: 「搜索袭击现场」', (await page.$('[data-testid="search-north-ambush"]')) !== null)
  await clickTestId('search-north-ambush')
  check('FJ8: Stage C 多解按钮（MND 检定）', (await page.$('[data-testid="investigate-mnd"]')) !== null)

  // ==================== FJ9：MND 检定成功 ====================
  await clickWithRoll('investigate-mnd', 0.99)
  check('FJ9: 调查成功推进（按钮消失）', (await page.$('[data-testid="investigate-mnd"]')) === null)

  // ==================== FJ10：回北门汇报 ====================
  await clickButton('天龙城北门')
  check('FJ10: 北门「向马科汇报发现」', (await page.$('[data-testid="report-north-outskirts"]')) !== null)
  await clickTestId('report-north-outskirts')
  side = await sidebarText()
  check('FJ10: 汇报后进入「可提交」', side.includes('可提交') && side.includes('前往任务发布者处提交'))

  // ==================== FJ11：武馆提交《北郊追踪》 ====================
  await clickButton('天龙城')
  await clickButton('武馆')
  check('FJ11: 「提交任务」按钮可用（武馆）', (await buttonDisabled('提交任务')) === false)
  await clickButton('提交任务')
  await sleep(500)
  body = await bodyText()
  check('FJ11: 提交反馈任务完成 + 金币 +40 + 冒险阅历 +100', body.includes('任务完成') && body.includes('金币 +40') && body.includes('冒险阅历 +100'))
  check('FJ11: 右栏可提交区消失', !(await sidebarText()).includes('可提交（1）'))

  // ==================== FJ12：Golden Rabbit 全程冻结 ====================
  // UI 层面：右栏《追寻黄金兔子王》仍进行中
  side = await sidebarText()
  check('FJ12: 主线完成后 UI 中黄金兔子王仍进行中', side.includes('追寻黄金兔子王') && side.includes('进行中'))
  // 存档层面：读 localStorage 最终态，flags/stage/rabbit_path 全部不变
  const gs = await readSaveGameState()
  const qg = gs?.quests?.find((q) => q.questId === 'quest_golden_rabbit_search')
  check('FJ12: 存档仍 in_progress / stage 0', qg?.status === 'in_progress' && qg?.stage === 0)
  check(
    'FJ12: 存档四 flags 保持',
    qg?.flags?.asked_blacksmith === true && qg?.flags?.asked_apothecary === true &&
      qg?.flags?.village_inquiry_reported === true && qg?.flags?.rabbit_lair_rechecked === true,
  )
  check('FJ12: 存档 rabbit_path ×1 保持', gs?.inventory?.some((e) => e.itemId === 'rabbit_path' && e.quantity === 1) === true)

  // ==================== FJ13：ID leak + JS exception ====================
  const leaked = await leakedPrefixes()
  check('FJ13: 全程无 Production ID leak', leaked.length === 0, leaked.join(','))
  check('FJ13: 全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '))
} catch (error) {
  check('Full Journey E2E 脚本执行无异常', false, String(error))
} finally {
  try { if (browser) await browser.close() } catch { /* 已关闭 */ }
  try { if (dev) dev.kill() } catch { /* 已退出 */ }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-008 Full Journey E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
