// ============================================================================
// 《天梦大陆》TM-P2-003-R3 focused E2E：精制铁剑玩家闭环 + 真实 Luck 奖励链
// 运行前提：dev server 已在 5199 端口运行
// 运行：node qa/r3-e2e.mjs
// 环境变量：CHROME_PATH（默认系统 Chrome）、BASE_URL（默认 http://localhost:5199/）
// 不依赖真实概率：Math.random 固定为 0.99（D20=20 → 大成功）。
// 存档通过合法 localStorage fixture 注入（SLOT_FORMAT_VERSION=3），不跑 40 分钟真实流程。
// ============================================================================
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.BASE_URL || 'http://localhost:5199/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768 })

const jsErrors = []
page.on('pageerror', (err) => jsErrors.push(String(err)))

const clickByText = async (text) => {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('未找到按钮: ' + t)
    btn.click()
  }, text)
  await sleep(250)
}

const bodyText = () => page.evaluate(() => document.body.textContent)

/** TM-P2-005：云口令页出现「仅本机模式」时点击进入（未配置云端端点的降级入口） */
const enterLocalModeIfNeeded = async () => {
  try {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('仅本机模式'))
      if (btn) { btn.click(); return true }
      return false
    })
    if (clicked) await sleep(500)
    return clicked
  } catch { return false }
}

/** 在包含指定物品名的背包行中点击指定文本的按钮（如 装备/卸下）；名称精确匹配（startsWith，避免「铁剑」误中「精制铁剑」行） */
const clickInRow = async (rowContains, btnText) => {
  const ok = await page.evaluate(
    ([contains, text]) => {
      const buttons = [...document.querySelectorAll('button')]
      for (const btn of buttons) {
        if (!btn.textContent.includes(text)) continue
        const row = btn.closest('div[class*="rounded"]')
        if (!row) continue
        const nameEl = row.querySelector('p.font-bold')
        if (!nameEl) continue
        const name = (nameEl.textContent || '').trim()
        if (name === contains || name.startsWith(contains + ' ')) {
          btn.click()
          return true
        }
      }
      return false
    },
    [rowContains, btnText],
  )
  if (!ok) throw new Error(`未找到「${rowContains}」行内的「${btnText}」按钮`)
  await sleep(250)
}

/** 某物品所在背包行是否包含指定按钮文本（名称精确匹配） */
const rowHasButton = async (itemName, btnText) =>
  page.evaluate(
    ([name, text]) => {
      const buttons = [...document.querySelectorAll('button')]
      return buttons.some((btn) => {
        if (!btn.textContent.includes(text)) return false
        const row = btn.closest('div[class*="rounded"]')
        if (!row) return false
        const nameEl = row.querySelector('p.font-bold')
        if (!nameEl) return false
        const rowName = (nameEl.textContent || '').trim()
        return rowName === name || rowName.startsWith(name + ' ')
      })
    },
    [itemName, btnText],
  )

/** 注入 slot1 存档（v3 合法 fixture）并刷新 → 主菜单出现「继续游戏」 */
const injectSaveAndContinue = async (gameState) => {
  const slot = {
    version: 3,
    savedAt: new Date().toISOString(),
    gameState,
  }
  await page.evaluate((data) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(data))
  }, slot)
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  await enterLocalModeIfNeeded()
  const body = await bodyText()
  if (!body.includes('继续游戏')) throw new Error('注入存档后未出现继续游戏入口')
  await clickByText('继续游戏')
  await sleep(500)
}

/** 基础合法角色：骑士 Lv.2，背包铁剑 + 治疗药水（Part A 再注入精制铁剑） */
function baseKnightState(overrides = {}) {
  return {
    player: {
      id: 'player-hero',
      name: 'R3测试骑士',
      gender: 'male',
      level: 2,
      profession: 'knight',
      attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 24,
      maxHp: 24,
      mp: 7,
      maxMp: 7,
      gold: 50,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
    ],
    equipment: { weapon: null, armor: null, accessory: null },
    quests: [],
    world: { currentLocationId: 'tianlong_martial_hall', flags: {}, completedEvents: [], npcStates: {} },
    ...overrides,
  }
}

try {
  // ================= Part A：双武器装备/卸下/切换闭环 =================
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(400)
  await enterLocalModeIfNeeded()
  const stateA = baseKnightState()
  stateA.inventory = [
    { itemId: 'iron_sword', quantity: 1 },
    { itemId: 'refined_iron_sword', quantity: 1 },
    { itemId: 'healing_potion', quantity: 2 },
  ]
  await injectSaveAndContinue(stateA)
  let body = await bodyText()

  check('R3-A1: 背包同时显示铁剑与精制铁剑', body.includes('铁剑') && body.includes('精制铁剑'))

  // 铁剑行有装备、精制铁剑行有装备（尚未装备任何武器；名称精确匹配）
  const ironHasEquip = await rowHasButton('铁剑', '装备')
  const refinedHasEquip = await rowHasButton('精制铁剑', '装备')
  check('R3-A2: 铁剑行提供「装备」入口', ironHasEquip, '')
  check('R3-A3: 精制铁剑行提供「装备」入口', refinedHasEquip, '')

  // 点击精制铁剑的装备 → 当前武器 = 精制铁剑
  await clickInRow('精制铁剑', '装备')
  body = await bodyText()
  const refinedEquipped = await rowHasButton('精制铁剑', '卸下')
  const ironStillEquip = await rowHasButton('铁剑', '装备')
  check('R3-A4: 装备精制铁剑 → 精制铁剑行变「卸下」', refinedEquipped, '')
  check('R3-A5: 装备精制铁剑 → 铁剑行仍为「装备」（未装备）', ironStillEquip, '')
  check('R3-A6: 装备区当前武器显示「精制铁剑」', body.includes('武器：') && body.includes('精制铁剑'), '')

  // 点击铁剑的装备 → 当前武器 = 铁剑（自动替换）
  await clickInRow('铁剑', '装备')
  body = await bodyText()
  check('R3-A7: 装备铁剑 → 铁剑行变「卸下」', await rowHasButton('铁剑', '卸下'), '')
  check('R3-A8: 装备铁剑 → 精制铁剑行变回「装备」', await rowHasButton('精制铁剑', '装备'), '')
  check('R3-A9: 装备区当前武器显示「铁剑」', body.includes('武器：') && body.includes('铁剑') && !body.includes('武器：精制铁剑'), '')

  // 切回精制铁剑
  await clickInRow('精制铁剑', '装备')
  body = await bodyText()
  check('R3-A10: 切回精制铁剑 → 当前武器 = 精制铁剑', await rowHasButton('精制铁剑', '卸下') && body.includes('武器：精制铁剑'), '')

  // ================= Part B：真实 Luck 奖励链（北门旧哨塔 → 大成功 → 精制铁剑 → 装备） =================
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(400)
  await enterLocalModeIfNeeded()
  const stateB = baseKnightState()
  stateB.world = {
    currentLocationId: 'tianlong_north_gate',
    flags: {},
    completedEvents: [],
    npcStates: {},
  }
  stateB.quests = [
    {
      questId: 'quest_north_gate_missing_patrol',
      status: 'in_progress',
      stage: 0,
      flags: { north_gate_trail_checked: true, north_gate_wolf_defeated: true },
    },
  ]
  await injectSaveAndContinue(stateB)
  body = await bodyText()
  check('R3-B1: 北门旧哨塔场景出现', body.includes('北门旧哨塔的巡逻补给匣'), '')

  // 固定 Math.random：D20=20 → 大成功
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  // 技能路线开启（骑士重击，force tag，MP 7 ≥ 2）
  await clickByText('骑士重击')
  await sleep(300)
  body = await bodyText()
  check('R3-B2: 技能开启成功（MP 消耗 + 哨塔打开）', body.includes('你用骑士重击移开了阻碍'), '')

  // 打开补给匣（大成功 → 精制铁剑 ×1）
  await clickByText('打开补给匣')
  await sleep(300)
  body = await bodyText()
  check('R3-B3: 大成功获得精制铁剑 ×1', body.includes('精制铁剑') && body.includes('×1'), '')
  check('R3-B4: 基础补给（治疗药水 + 金币）仍在', body.includes('治疗药水') && body.includes('金币 +'), '')

  // 恢复随机（后续不依赖）
  await page.evaluate(() => {
    delete Math.random
  })

  // 背包精制铁剑行提供装备入口 → 点击装备
  check('R3-B5: 背包精制铁剑行提供「装备」入口', await rowHasButton('精制铁剑', '装备'), '')
  await clickInRow('精制铁剑', '装备')
  await sleep(300)
  body = await bodyText()
  check('R3-B6: 装备精制铁剑成功 → 行变「卸下」+ 当前武器显示精制铁剑', (await rowHasButton('精制铁剑', '卸下')) && body.includes('武器：精制铁剑'), '')

  check('R3-C1: 全程无 JS exception', jsErrors.length === 0, jsErrors.length > 0 ? jsErrors.join(' | ') : '')
} catch (err) {
  check('R3: 脚本执行无异常', false, String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== R3 focused 结果：${results.length - failed}/${results.length} 通过 =====`)
if (failed > 0) process.exit(1)
