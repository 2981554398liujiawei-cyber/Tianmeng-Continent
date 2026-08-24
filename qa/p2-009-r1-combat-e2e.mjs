// ============================================================================
// qa/p2-009-r1-combat-e2e.mjs —— TM-P2-009-R1 Combat V6 浏览器 E2E。
//
// 覆盖 08_验收矩阵：
//   B  Initiative（B1-B5：公式 / AGI9 vs AGI8 高骰 / 开场简报 / D20 明细 / 平手 tie-break）
//   C  Encounter roster（C1-C5：未固化多候选 / 固化 A / 固化 B / preview==battle / 无 2+1 假阵容）
//   D  Combat UI（D1-D10：≤3 卡 / 三行 / 高亮 / detail log / ActionBar Y 固定 / 断点 1920-390）
//   E  Action Economy（E1-E8/E10：初始资源 / 攻击消耗 / 技能消耗 / 药水消耗 / End Turn / 逃跑 / 重置）
//   F  Friendly switching（F1-F5：段内切换 / 不跨 enemy / ended 弱化 / 死亡不可切）
//   G5 Enemy skill 日志可读（黑法师真实施法黑火球）+ G6 无 raw ID
//
// 运行：node qa/p2-009-r1-combat-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_009_R1_COMBAT_PORT || 5251)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}
const partError = (name, err) => {
  console.log(`ERROR | ${name} | ${err?.stack || err}`)
  results.push({ name, ok: false })
}

const ID_PREFIXES = ['quest_', 'clue_', 'enemy_', 'encounter_', 'location_', 'item_', 'skill_', 'companion_', 'mount_']

const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-009-r1-combat-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })

let browser
let page
let jsErrors = []

async function ready() {
  for (let i = 0; i < 80; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

async function cleanup() {
  try { await browser?.close() } catch {}
  try { dev?.kill() } catch {}
  try { await rm(profile, { recursive: true, force: true }) } catch {}
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')
const takeErrors = () => {
  const errs = jsErrors
  jsErrors = []
  return errs
}

async function enterLocalModeIfNeeded() {
  const clicked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').includes('仅本机模式'))
    if (!b) return false
    b.click()
    return true
  })
  if (clicked) await sleep(350)
}

/** 带 sleep 的通用点击（找到即点；disabled 不点） */
async function clickButton(text, waitMs = 400) {
  const clicked = await page.evaluate((label) => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().includes(label))
    if (!b || b.disabled) return false
    b.click()
    return true
  }, text)
  if (clicked) await sleep(waitMs)
  return clicked
}

/** 无 sleep 点击（用于紧接 rng 切换，抢在敌方 AI 400ms timer 前） */
async function fastClick(text) {
  return page.evaluate((label) => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().includes(label))
    if (!b || b.disabled) return false
    b.click()
    return true
  }, text)
}

/** Action Bar 一级按钮（技能/背包）按前缀匹配（文本在「技能 ▾/▴」间切换） */
async function clickBarButton(prefix) {
  const clicked = await page.evaluate((label) => {
    const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().startsWith(label))
    if (!b || b.disabled) return false
    b.click()
    return true
  }, prefix)
  if (clicked) await sleep(300)
  return clicked
}

/** target selector 内点目标：精确 trim 匹配按钮文本（多敌取第一个） */
async function clickTarget(name) {
  await sleep(150)
  const ok = await page.evaluate((targetName) => {
    const btns = [...document.querySelectorAll('button')].filter((b) => (b.textContent || '').trim() === targetName)
    if (btns.length === 0) return false
    btns[0].click()
    return true
  }, name)
  if (!ok) throw new Error(`未找到目标按钮: ${name}`)
  await sleep(700)
}

async function setRandom(v) {
  await page.evaluate((value) => {
    Math.random = () => value
  }, v)
}

/** 序列 rng：前 values.length 次依次返回，之后恒 fallback（控制 initiative 差异化） */
async function setRandomSeq(values, fallback = 0.99) {
  await page.evaluate((seq, tail) => {
    window.__rngSeq = seq.slice()
    Math.random = () => (window.__rngSeq.length ? window.__rngSeq.shift() : tail)
  }, values, fallback)
}

/** 进入遭遇：匹配含 encounterName 的迎战按钮（可排除含 excludeName 的卡片，避免候选文本误匹配） */
async function clickEngage(encounterName, { exclude } = {}) {
  const ok = await page.evaluate(([name, excl]) => {
    const btn = [...document.querySelectorAll('button')].find((b) => {
      if (!(b.textContent || '').includes('迎战')) return false
      let el = b
      let ctx = ''
      for (let i = 0; i < 4 && el; i += 1) {
        ctx += el.textContent || ''
        el = el.parentElement
      }
      if (excl && ctx.includes(excl)) return false
      return ctx.includes(name)
    })
    if (btn) { btn.click(); return true }
    return false
  }, [encounterName, exclude ?? null])
  if (!ok) throw new Error(`未找到遭遇迎战按钮: ${encounterName}`)
  await sleep(500)
}

async function loadAndEnter(fixture) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate((save) => {
    localStorage.clear()
    localStorage.setItem(
      'tianmeng_continent_save_slot_slot1',
      JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: save }),
    )
  }, fixture)
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  const ok = await clickButton('继续游戏')
  if (!ok) throw new Error('未找到「继续游戏」按钮')
  await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
  await sleep(400)
}

async function enterCombat(fixture, encounterName, rngValue = 0.99, opts = {}) {
  await loadAndEnter(fixture)
  await setRandom(rngValue)
  await clickEngage(encounterName, opts)
  await page.waitForSelector('[data-testid="combat-enemy-panel"]', { timeout: 8000 })
  await sleep(700)
}

const enemyUnitCount = () => page.evaluate(() => document.querySelectorAll('[data-testid="combat-enemy-unit"]').length)
const playerPanelCount = () => page.evaluate(() => document.querySelectorAll('[data-testid="combat-player-panel"]').length)
const companionPanelCount = () => page.evaluate(() => document.querySelectorAll('[data-testid="combat-companion-panel"]').length)
const cardClassName = (testid) =>
  page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    return el ? el.className : ''
  }, testid)

async function waitForTurnType(timeoutMs = 14000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const t = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim())
      if (btns.some((x) => x === '跳过')) return 'companion'
      if (btns.some((x) => x.includes('普通攻击'))) return 'player'
      return null
    })
    if (t) return t
    await sleep(150)
  }
  return null
}

/** Action Bar 主按钮行 Y：以「普通攻击」按钮的 top 为基准（tray 内容变化不应移动主按钮行） */
const footerRect = () =>
  page.evaluate(() => {
    const bar = [...document.querySelectorAll('.combat-page footer button')].find((b) => (b.textContent || '').trim().includes('普通攻击'))
    if (!bar) return null
    const r = bar.getBoundingClientRect()
    return { y: r.top, h: r.height, visible: r.height > 0 && r.bottom <= window.innerHeight && r.top >= 0 }
  })

const outerLayout = () =>
  page.evaluate(() => {
    const root = document.scrollingElement
    return { docWidth: root.scrollWidth, clientWidth: root.clientWidth, docHeight: root.scrollHeight, clientHeight: root.clientHeight }
  })

const detailLogVisible = () =>
  page.evaluate(() => {
    const el = document.querySelector('[data-testid="combat-detail-log"]')
    if (!el) return false
    return getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0
  })

// ---------- GameState fixtures ----------
function baseFixture(overrides = {}) {
  return {
    player: {
      id: 'player-r1', name: '雅各布', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 22, maxHp: 22, mp: 8, maxMp: 8, gold: 50, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'traveler_cloth_armor', quantity: 1 },
    ],
    equipment: { weapon: 'iron_sword', armor: 'traveler_cloth_armor', accessory: null },
    quests: [],
    world: {
      currentLocationId: 'black_stone_tower_floor2',
      flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: {},
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
    ownedMountIds: [], equippedMountId: null,
    ...overrides,
  }
}

function withSakura(state) {
  return {
    ...state,
    companions: {
      ...state.companions,
      sakura_yuko: {
        companionId: 'sakura_yuko', status: 'recruited', level: 3, mp: 6, maxMp: 6,
        learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'], flags: {},
      },
    },
    party: { activeCompanionIds: ['sakura_yuko'] },
  }
}

/** 残破巡逻队：lockedVariant 为 'broken_patrol_a' | 'broken_patrol_b' | undefined（未固化） */
function brokenPatrolFixture({ lockedVariant, agi = 10, hp = 22, sakura = false } = {}) {
  const base = baseFixture()
  const state = {
    ...base,
    player: {
      ...base.player,
      attributes: { ...base.player.attributes, agi },
      hp,
      maxHp: 22,
    },
    quests: [],
    world: {
      currentLocationId: 'black_stone_tower_floor2',
      flags: {}, completedEvents: [], npcStates: {}, restCount: 0,
      encounterVariants: lockedVariant ? { encounter_broken_patrol: lockedVariant } : {},
    },
  }
  return sakura ? withSakura(state) : state
}

/** 残破巡逻队 B variant（骷髅战士 + 黑法师）用于黑法师技能演示 */
function brokenPatrolBForSkillFixture() {
  return brokenPatrolFixture({ lockedVariant: 'broken_patrol_b' })
}

// =====================================================================
// Part A：Initiative（B1/B2/B5 引擎级 + B3/B4 UI 级）
// =====================================================================
async function partA() {
  const label = 'Part A Initiative'
  try {
    // 先加载应用运行时（引擎级 page.evaluate 动态 import 需要 Vite 环境）
    await page.goto(APP_URL, { waitUntil: 'networkidle0' })
    await enterLocalModeIfNeeded()

    // ---- 引擎级 B1：公式仍 D20+AGI ----
    const engineB1 = await page.evaluate(async () => {
      const pc = await import('/src/game/rules/partyCombat.ts')
      const mk = (id, agility, side) => ({
        instanceId: id, side, sourceType: side === 'friendly' ? 'player' : 'enemy', sourceId: id,
        name: id, currentHp: 10, maxHp: 10, currentMp: 0, maxMp: 0, attack: 5, armor: 5, agility, isAlive: true,
      })
      const turns = pc.rollInitiativeQueue([mk('p', 9, 'friendly')], () => 0.4)
      const t = turns[0]
      return { roll: t.roll, initiative: t.initiative, agility: t.combatant.agility }
    })
    // rollD20With(0.4) = floor(0.4*20)+1 = 9；initiative = 9 + 9 = 18
    check('B1: Initiative = D20 + AGI（公式）', engineB1.roll === 9 && engineB1.initiative === 18, JSON.stringify(engineB1))

    // ---- 引擎级 B2：AGI9 可被 AGI8 高骰击败（先手排序） ----
    const engineB2 = await page.evaluate(async () => {
      const pc = await import('/src/game/rules/partyCombat.ts')
      const mk = (id, agility, side) => ({
        instanceId: id, side, sourceType: side === 'friendly' ? 'player' : 'enemy', sourceId: id,
        name: id, currentHp: 10, maxHp: 10, currentMp: 0, maxMp: 0, attack: 5, armor: 5, agility, isAlive: true,
      })
      const seq = [0.0, 0.99]
      const turns = pc.rollInitiativeQueue([mk('p', 9, 'friendly'), mk('e', 8, 'enemy')], () => seq.shift() ?? 0.99)
      return turns.map((t) => ({ id: t.combatant.sourceId, roll: t.roll, initiative: t.initiative }))
    })
    check(
      'B2: 敏捷9可被敏捷8高骰击败（28 > 10）',
      engineB2.length === 2 && engineB2[0].id === 'e' && engineB2[0].initiative === 28 && engineB2[1].initiative === 10,
      JSON.stringify(engineB2),
    )

    // ---- 引擎级 B5：平手 tie-break（同 initiative → AGI 高 → friendly 先 → 稳定顺序） ----
    const engineB5 = await page.evaluate(async () => {
      const pc = await import('/src/game/rules/partyCombat.ts')
      const mk = (id, agility, side) => ({
        instanceId: id, side, sourceType: side === 'friendly' ? 'player' : 'enemy', sourceId: id,
        name: id, currentHp: 10, maxHp: 10, currentMp: 0, maxMp: 0, attack: 5, armor: 5, agility, isAlive: true,
      })
      const turns = pc.rollInitiativeQueue(
        [mk('f1', 8, 'friendly'), mk('f2', 8, 'friendly'), mk('e1', 8, 'enemy'), mk('e2', 8, 'enemy')],
        () => 0.99,
      )
      return turns.map((t) => t.combatant.sourceId)
    })
    check('B5: 平手 tie-break friendly 先', engineB5.join(',') === 'f1,f2,e1,e2', engineB5.join(','))

    // ---- UI 级 B2/B3/B4：AGI9 玩家 vs 2 骷髅（AGI8），rng 序列 [0.0, 0.99] → 骷髅先手 ----
    await loadAndEnter(brokenPatrolFixture({ lockedVariant: 'broken_patrol_a', agi: 9 }))
    await setRandomSeq([0.0, 0.99])
    await clickEngage('残破巡逻队')
    await page.waitForSelector('[data-testid="combat-enemy-panel"]', { timeout: 8000 })
    await sleep(600)

    let body = await bodyText()
    check('B3: 开场简报「骷髅战士先行动」', body.includes('骷髅战士先行动。'))
    const stripText = await page.evaluate(() => document.querySelector('[data-testid="combat-initiative-strip"]')?.textContent ?? '')
    check(
      'B3: Initiative Strip 显示双方 initiative 数值',
      stripText.includes('先手：') && stripText.includes('28') && stripText.includes('10'),
      stripText.replace(/\s+/g, ' ').trim(),
    )
    const detailText = await page.evaluate(() => document.querySelector('[data-testid="combat-detail-log"]')?.textContent ?? '')
    check(
      'B4: 详细日志显示 D20(骰面) + 敏捷 = 总和',
      detailText.includes('D20(1) + 敏捷9 = 10') && detailText.includes('D20(20) + 敏捷8 = 28'),
      detailText.replace(/\s+/g, ' ').trim().slice(0, 160),
    )
    const leaked = ID_PREFIXES.filter((p) => body.includes(p))
    check('B3b: 战斗页无 raw ID leak', leaked.length === 0, leaked.join(','))
  } catch (err) {
    partError(`${label} 异常`, err)
  }
}

// =====================================================================
// Part B：Encounter roster（C1-C5）
// =====================================================================
async function partB() {
  const label = 'Part B Roster'
  try {
    // C1：未固化 → 两个可能 variant（或分隔）
    await loadAndEnter(brokenPatrolFixture({}))
    let body = await bodyText()
    check(
      'C1: 未固化显示「可能遭遇」双候选',
      body.includes('可能遭遇：• 骷髅战士×2 或 • 骷髅战士+黑法师'),
      '未找到双候选文案',
    )
    check('C1b: 未固化不显示「本次遭遇」假阵容', !body.includes('本次遭遇：骷髅战士×2+黑法师'))

    // C2：固化 A → 只显示 2 骷髅战士
    await loadAndEnter(brokenPatrolFixture({ lockedVariant: 'broken_patrol_a' }))
    body = await bodyText()
    check('C2: 固化 A → 本次遭遇：骷髅战士×2', body.includes('本次遭遇：骷髅战士×2'))
    check('C2b: 固化 A 不含黑法师', !body.includes('黑法师'))

    // C3：固化 B → 1 骷髅 + 1 黑法师
    await loadAndEnter(brokenPatrolFixture({ lockedVariant: 'broken_patrol_b' }))
    body = await bodyText()
    check('C3: 固化 B → 本次遭遇：骷髅战士+黑法师', body.includes('本次遭遇：骷髅战士+黑法师'))

    // C4a：固化 A 进战斗 preview == battle（2 骷髅）
    await enterCombat(brokenPatrolFixture({ lockedVariant: 'broken_patrol_a' }), '残破巡逻队', 0.99)
    const enemyTextA = await page.evaluate(() => document.querySelector('[data-testid="combat-enemy-panel"]')?.textContent ?? '')
    check('C4a: 固化 A 战斗 2 敌方卡', (await enemyUnitCount()) === 2)
    check('C4b: 固化 A 战斗阵容全是骷髅战士', enemyTextA.includes('骷髅战士') && !enemyTextA.includes('黑法师'))

    // C4c：固化 B 进战斗 preview == battle（骷髅 + 黑法师）
    await enterCombat(brokenPatrolFixture({ lockedVariant: 'broken_patrol_b' }), '残破巡逻队', 0.99)
    const enemyTextB = await page.evaluate(() => document.querySelector('[data-testid="combat-enemy-panel"]')?.textContent ?? '')
    check('C4c: 固化 B 战斗 2 敌方卡', (await enemyUnitCount()) === 2)
    check('C4d: 固化 B 战斗阵容 骷髅+黑法师', enemyTextB.includes('骷髅战士') && enemyTextB.includes('黑法师'))

    // C5：引擎级——broken_patrol 任何 variant 成员 ≤2（绝无 2+1 假三人组）
    const engineC5 = await page.evaluate(async () => {
      const ec = await import('/src/game/content/encounters.ts')
      const def = ec.getEncounter('encounter_broken_patrol')
      if (!def) return { ok: false, reason: 'no def' }
      const variants = def.variants ?? []
      const counts = variants.map((v) => v.members.reduce((s, m) => s + m.count, 0))
      const hasFakeTrio = counts.some((c) => c >= 3)
      const anyComboHasMageTrio = variants.some(
        (v) =>
          v.members.filter((m) => m.enemyId === 'skeleton_warrior').reduce((s, m) => s + m.count, 0) === 2 &&
          v.members.some((m) => m.enemyId === 'black_mage'),
      )
      return { counts, hasFakeTrio, anyComboHasMageTrio }
    })
    check(
      'C5: 不允许 2 骷髅 + 1 黑法师假阵容',
      engineC5.ok !== false && !engineC5.hasFakeTrio && !engineC5.anyComboHasMageTrio,
      JSON.stringify(engineC5),
    )
  } catch (err) {
    partError(`${label} 异常`, err)
  }
}

// =====================================================================
// Part C：Combat UI 断点（D1-D10）
// =====================================================================
async function partC() {
  const label = 'Part C Combat UI'
  try {
    // 一次进战斗（玩家先手，不动资源），循环 5 档视口
    await enterCombat(brokenPatrolFixture({ lockedVariant: 'broken_patrol_a' }), '残破巡逻队', 0.99)
    if ((await waitForTurnType(10000)) !== 'player') throw new Error('Part C 未到玩家回合')
    await setRandom(0.99)

    for (const [width, height] of [[1920, 1080], [1600, 900], [1366, 768], [1024, 768], [390, 844]]) {
      await page.setViewport({ width, height })
      await sleep(350)

      const friendlyCount = (await playerPanelCount()) + (await companionPanelCount())
      const enemyCount = await enemyUnitCount()
      check(`D1/D2: ${width}x${height} 我方≤3 敌方≤3`, friendlyCount >= 1 && friendlyCount <= 3 && enemyCount >= 1 && enemyCount <= 3, `我方${friendlyCount} 敌方${enemyCount}`)

      // D3：敌方卡三行（攻击 · 护甲 · 敏捷）
      const enemyCardText = await page.evaluate(() => document.querySelector('[data-testid="combat-enemy-unit"]')?.textContent ?? '')
      check(`D3: ${width}x${height} 三行单位卡（攻击/护甲/敏捷）`, enemyCardText.includes('生命') && enemyCardText.includes('攻击') && enemyCardText.includes('护甲') && enemyCardText.includes('敏捷'))

      // D4：当前单位（玩家）高亮
      const playerClass = await cardClassName('combat-player-panel')
      check(`D4: ${width}x${height} 当前单位高亮 ring-gold-400`, playerClass.includes('ring-gold-400'))

      // D5：detail log 仅在 >=1280 显示
      const visible = await detailLogVisible()
      check(`D5: ${width}x${height} 详细日志${width >= 1280 ? '可见' : '隐藏'}`, visible === (width >= 1280))

      // D6-D8：ActionBar Y 在技能/背包 tray 展开前后不动
      const y0 = (await footerRect())?.y ?? null
      await clickBarButton('技能')
      const y1 = (await footerRect())?.y ?? null
      check(`D6/D7: ${width}x${height} 技能 tray 展开 ActionBar Y 不位移`, y0 !== null && y1 !== null && Math.abs(y1 - y0) <= 1, `y ${y0}→${y1}`)
      await clickBarButton('技能')
      await clickBarButton('背包')
      const y2 = (await footerRect())?.y ?? null
      check(`D6/D8: ${width}x${height} 背包 tray 展开 ActionBar Y 不位移`, y1 !== null && y2 !== null && Math.abs(y2 - y0) <= 1, `y ${y0}→${y2}`)
      await clickBarButton('背包')

      // D9：>=1280 外层无滚动
      if (width >= 1280) {
        const layout = await outerLayout()
        check(`D9: ${width}x${height} 外层无滚动`, layout.docWidth <= layout.clientWidth + 1 && layout.docHeight <= layout.clientHeight + 1, `doc ${layout.docWidth}x${layout.docHeight} client ${layout.clientWidth}x${layout.clientHeight}`)
      }
      // D10：390 无横向 overflow
      if (width === 390) {
        const layout = await outerLayout()
        check(`D10: 390 无横向 overflow`, layout.docWidth <= layout.clientWidth + 1, `docW ${layout.docWidth} clientW ${layout.clientWidth}`)
      }
    }
  } catch (err) {
    partError(`${label} 异常`, err)
  }
}

// =====================================================================
// Part D：Action Economy（E1-E8/E10）
// =====================================================================
async function partD() {
  const label = 'Part D Action Economy'
  try {
    // ---- 战斗 1（rng 0.99，hp 不满）：E1-E5 ----
    await enterCombat(brokenPatrolFixture({ lockedVariant: 'broken_patrol_a', hp: 10 }), '残破巡逻队', 0.99)
    if ((await waitForTurnType(10000)) !== 'player') throw new Error('战斗1 未到玩家回合')
    await setRandom(0.99)

    let body = await bodyText()
    check('E1: 初始行动栏可攻击/技能/背包/逃跑', body.includes('普通攻击') && body.includes('技能 ▾') && body.includes('背包 ▾') && body.includes('逃跑') && body.includes('结束回合'))

    // E2/E3：普攻只消耗 Action（技能 actionType 缺省 action）
    await clickButton('普通攻击')
    await clickTarget('骷髅战士')
    body = await bodyText()
    check('E2a: 普攻命中（crit）', body.includes('雅各布的攻击命中骷髅战士，造成'))
    await clickBarButton('技能')
    const skillTrayText = await page.evaluate(() => document.querySelector('[data-testid="combat-skill-tray"]')?.textContent ?? '')
    check('E3: 攻击后技能 tray「本回合行动已用完」', skillTrayText.includes('本回合行动已用完'))
    const strikeDisabled = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-testid="combat-skill-tray"] button')].find((el) => el.textContent?.includes('骑士重击'))
      return b ? b.disabled : null
    })
    check('E3b: 攻击后技能按钮禁用（action 消耗）', strikeDisabled === true)
    await clickBarButton('技能') // 收起

    // E5/E4：攻击后仍可喝药（Bonus 独立），喝药消耗 Bonus
    await clickBarButton('背包')
    let potionDisabled = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-testid="combat-item-tray"] button')].find((el) => el.textContent?.includes('使用治疗药水'))
      return b ? b.disabled : null
    })
    check('E5: 攻击后仍可喝药（Bonus 保留）', potionDisabled === false)
    await clickButton('使用治疗药水（+8 生命）', 500)
    body = await bodyText()
    check('E5b: 药水使用成功', body.includes('你使用了治疗药水，恢复'))
    const itemTrayText = await page.evaluate(() => document.querySelector('[data-testid="combat-item-tray"]')?.textContent ?? '')
    check('E4: 喝药后「本回合附赠行动已用完」', itemTrayText.includes('本回合附赠行动已用完'))

    // ---- 战斗 2（rng 0.1）：E6 喝药后仍可攻击 + E7 End Turn + E10 新回合重置 ----
    await enterCombat(brokenPatrolFixture({ lockedVariant: 'broken_patrol_a', hp: 10 }), '残破巡逻队', 0.1)
    if ((await waitForTurnType(10000)) !== 'player') throw new Error('战斗2 未到玩家回合')
    await setRandom(0.1)

    await clickBarButton('背包')
    await clickButton('使用治疗药水（+8 生命）', 500)
    await clickBarButton('背包') // 收起
    let attackDisabled = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().includes('普通攻击'))
      return b ? b.disabled : null
    })
    check('E6: 喝药后仍可普通攻击（Action 独立）', attackDisabled === false)
    await clickButton('普通攻击')
    await clickTarget('骷髅战士')
    await sleep(300)
    body = await bodyText()
    check('E6b: 喝药后攻击成功结算', body.includes('雅各布的攻击'))

    // E7：End Turn 放弃剩余 → 推进到 enemy（行动栏消失）
    const ended = await fastClick('结束回合')
    if (!ended) throw new Error('结束回合按钮不可点')
    await setRandom(0.1) // 骷髅 0.1 → D20 3 → miss，不击杀
    await sleep(300)
    body = await bodyText()
    check('E7: End Turn 后推进到敌方回合（行动栏消失）', !body.includes('普通攻击') && !body.includes('结束回合'), '行动栏仍可见')

    // E10：新回合重置资源（骷髅 miss 后回玩家，Action/Bonus 恢复）
    const turnType = await waitForTurnType(16000)
    check('E10a: 新回合回到玩家（敌方 miss）', turnType === 'player', `turn=${turnType}`)
    attackDisabled = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().includes('普通攻击'))
      return b ? b.disabled : null
    })
    await clickBarButton('背包')
    potionDisabled = await page.evaluate(() => {
      const b = [...document.querySelectorAll('[data-testid="combat-item-tray"] button')].find((el) => el.textContent?.includes('使用治疗药水'))
      return b ? b.disabled : null
    })
    await clickBarButton('背包')
    check('E10b: 新回合 Action/Bonus 重置（攻击与药水均可用）', attackDisabled === false && potionDisabled === false, `attack=${attackDisabled} potion=${potionDisabled}`)

    // ---- 战斗 3（rng 0.5）：E8 failed escape 消耗 Action ----
    await enterCombat(brokenPatrolFixture({ lockedVariant: 'broken_patrol_a', hp: 22 }), '残破巡逻队', 0.5)
    if ((await waitForTurnType(10000)) !== 'player') throw new Error('战斗3 未到玩家回合')
    await setRandom(0.5)
    await clickButton('逃跑')
    body = await bodyText()
    check('E8: 逃跑失败（消耗回合）', body.includes('逃跑失败，敌人封住了退路。'))
    attackDisabled = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => (el.textContent || '').trim().includes('普通攻击'))
      return b ? b.disabled : null
    })
    check('E8b: 逃跑失败后普通攻击禁用（Action 已消耗）', attackDisabled === true, `attack=${attackDisabled}`)
  } catch (err) {
    partError(`${label} 异常`, err)
  }
}

// =====================================================================
// Part E：Friendly switching（F1-F5）
// =====================================================================
async function partE() {
  const label = 'Part E Friendly switching'
  try {
    // rng 0.1：Sakura(AGI16→19) > 玩家(AGI10→13) > 骷髅(AGI8→11, 11)；骷髅 0.1 → miss
    await enterCombat(brokenPatrolFixture({ lockedVariant: 'broken_patrol_a', sakura: true }), '残破巡逻队', 0.1)
    if ((await waitForTurnType(10000)) !== 'companion') throw new Error('未到 Sakura 回合')
    await setRandom(0.1)

    let body = await bodyText()
    check('F0: Sakura 先行动', body.includes('樱花优子的回合'))

    // F1：当前 friendly 段内玩家卡可切换（role=button）
    const playerSwitchable = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="combat-player-panel"]')
      return el?.getAttribute('role') === 'button' && el.className.includes('cursor-pointer')
    })
    check('F1: 连续 friendly 段内玩家卡可点击切换', playerSwitchable === true)

    // F2：点击玩家卡 → 切到玩家回合（双向验证）
    const switchedToPlayer = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="combat-player-panel"]')
      if (!el) return false
      el.click()
      return true
    })
    await sleep(300)
    body = await bodyText()
    check('F2: 点击伙伴/玩家卡切换控制（到玩家）', switchedToPlayer && body.includes('雅各布的回合'))
    const backToSakura = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="combat-companion-panel"]')
      if (!el) return false
      el.click()
      return true
    })
    await sleep(300)
    body = await bodyText()
    check('F2b: 双向切换（回到 Sakura）', backToSakura && body.includes('樱花优子的回合'))

    // F3：Sakura End Turn → 推进到玩家（同 friendly 段，不跨 enemy）
    const endTurnSakura = await fastClick('结束回合')
    if (!endTurnSakura) throw new Error('Sakura 结束回合失败')
    await sleep(400)
    body = await bodyText()
    check('F3: friendly 段内 End Turn 不跨 enemy（到玩家）', body.includes('雅各布的回合') && !body.includes('骷髅战士的回合'), '未推进到玩家')

    // F4：玩家 End Turn 后已结束单位弱化且不可再切
    const endTurnPlayer = await fastClick('结束回合')
    if (!endTurnPlayer) throw new Error('玩家结束回合失败')
    await setRandom(0.1)
    await sleep(150)
    const playerClassAfterEnd = await cardClassName('combat-player-panel')
    const playerRoleAfterEnd = await page.evaluate(() => document.querySelector('[data-testid="combat-player-panel"]')?.getAttribute('role') ?? null)
    check('F4: 已结束单位弱化（opacity-70）且不可点击', playerClassAfterEnd.includes('opacity-70') && playerRoleAfterEnd !== 'button', `class=${playerClassAfterEnd.slice(0, 80)} role=${playerRoleAfterEnd}`)

    // F5：引擎级——死亡单位不可切换（switchable 过滤 isAlive）
    const engineF5 = await page.evaluate(async () => {
      const pc = await import('/src/game/rules/partyCombat.ts')
      const mk = (id, agility, side, alive) => ({
        instanceId: id, side, sourceType: side === 'friendly' ? 'player' : 'enemy', sourceId: id,
        name: id, currentHp: alive ? 10 : 0, maxHp: 10, currentMp: 0, maxMp: 0, attack: 5, armor: 5, agility, isAlive: alive,
      })
      const turns = pc.rollInitiativeQueue(
        [mk('f1', 16, 'friendly', true), mk('f2', 10, 'friendly', false), mk('e1', 8, 'enemy', true)],
        () => 0.99,
      )
      const block = pc.friendlyBlockIndices(turns, 0)
      // 模拟 UI 过滤：alive && !ended
      const switchable = block
        .filter((i) => turns[i].combatant.isAlive && !turns[i].combatant.side.includes('x'))
        .map((i) => turns[i].combatant.sourceId)
      return { block, switchable }
    })
    check('F5: 死亡单位不进入可切换集', engineF5.switchable.join(',') === 'f1', JSON.stringify(engineF5))
  } catch (err) {
    partError(`${label} 异常`, err)
  }
}

// =====================================================================
// Part F：Enemy skill（G5 日志可读 + G6 无 raw ID）
// =====================================================================
async function partF() {
  const label = 'Part F Enemy skill'
  try {
    // rng 0.5：残破巡逻队 B（骷髅战士+黑法师）。玩家 AGI10 先手（ini 21 > 19）。
    // 玩家普攻黑法师命中（D20 11 → 9.5>=8，4 伤）；End Turn → 骷髅顺劈（6 伤）→ 黑法师施法。
    // 黑法师 caster 0.5 → 技能 index 1 = 黑火球（raw 18；glancing 5 伤）。
    await enterCombat(brokenPatrolBForSkillFixture(), '残破巡逻队', 0.5)
    if ((await waitForTurnType(10000)) !== 'player') throw new Error('未到玩家回合')
    await setRandom(0.5)

    // 玩家普攻黑法师
    await clickButton('普通攻击')
    await clickTarget('黑法师')
    await sleep(300)

    // End Turn → 敌方回合（timer 400ms 内 rng 仍 0.5）
    const ended = await fastClick('结束回合')
    if (!ended) throw new Error('结束回合失败')
    await setRandom(0.5)
    await sleep(1800) // 骷髅 + 黑法师 两个 enemy 各 400ms

    let body = await bodyText()
    check('G5: 黑法师真实施用技能（黑火球命中）', body.includes('黑法师的技能黑火球命中雅各布'), body.replace(/\s+/g, ' ').slice(0, 200))
    const detailText = await page.evaluate(() => document.querySelector('[data-testid="combat-detail-log"]')?.textContent ?? '')
    check('G5b: 详细日志包含技能名 黑火球', detailText.includes('黑火球'))
    const leaked = ID_PREFIXES.filter((p) => body.includes(p))
    check('G6: 敌方技能日志无 raw ID', leaked.length === 0, leaked.join(','))
  } catch (err) {
    partError(`${label} 异常`, err)
  }
}

// =====================================================================
try {
  await ready()
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: profile,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 900 })
  page.on('pageerror', (e) => jsErrors.push(`pageerror: ${String(e)}`))
  page.on('console', (m) => {
    if (m.type() === 'error') {
      if (/Failed to load resource/.test(m.text())) return
      jsErrors.push(`console: ${m.text()}`)
    }
  })

  await partA()
  await partB()
  await partC()
  await partD()
  await partE()
  await partF()

  check('全程无 JS exception', jsErrors.length === 0, jsErrors.slice(0, 3).join(' | '))
} catch (error) {
  check('R1 combat E2E 脚本执行无异常', false, String(error))
} finally {
  await cleanup()
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-009-R1 Combat E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
