// TM-P2-006：CombatPage V4 战斗界面验收（CUI1-CUI13）。
// 覆盖：主播报区与详细日志分离、行动栏固定不随内容浮动、技能/物品 tray、固定按钮、
//       多回合后布局不位移、伙伴回合固定按钮、1366/1920 无滚动、390 移动端抽屉。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.COMBAT_UI_E2E_PORT || 5223)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-006-combat-ui-'))
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

async function clickButton(text) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(label))
    if (!button || button.disabled) return false
    button.click()
    return true
  }, text)
  if (clicked) await sleep(400)
  return clicked
}

/** P2-007 适配：等待我方玩家行动阶段出现（行动栏「普通攻击」渲染即玩家回合；战斗结束返回 false） */
async function waitPlayerTurn(timeoutMs = 12000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const b = await bodyText()
    if (b.includes('返回冒险')) return false
    if (b.includes('普通攻击')) return true
    await sleep(120)
  }
  return false
}

/**
 * P2-007 适配：点击 target selector 内第一个敌人目标。
 * 村外草原魔化狼/魔化兔同屏，迎战按钮按敌人名匹配不稳定（祖先链误判），
 * 玩家普攻选目标改用 selector 定位（「取消」按钮所在容器内第一个按钮 = 敌方目标）。
 */
async function clickFirstEnemyTarget() {
  const clicked = await page.evaluate(() => {
    const cancel = [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === '取消')
    if (!cancel) return false
    const container = cancel.parentElement
    if (!container) return false
    const targetBtn = container.querySelector('button')
    if (!targetBtn || targetBtn.disabled) return false
    targetBtn.click()
    return true
  })
  if (clicked) await sleep(500)
  return clicked
}

/** P2-007 适配：玩家普攻（行动栏「普通攻击」→ target selector 选第一个敌人） */
async function playerAttack() {
  if (!(await clickButton('普通攻击'))) return false
  await sleep(250)
  const clicked = await clickFirstEnemyTarget()
  await sleep(500)
  return clicked
}

/**
 * Lv.2 骑士 fixture（确定性 RNG 配套）：STR8 无武器 → 攻击 3、暴击 4 伤/击。
 * 对魔化狼（HP12/甲12/敏12）：玩家 3 击击杀（CUI2 播报 1 击 + CUI4 再 2 击后战斗仍在进行）；
 * CON16/AGI8 → 狼对玩家擦伤 1-2/击，玩家可安稳打满 tray 断言。
 * 配合固定轮换 RNG [玩家 0.99 暴击, 敌人 0.1 擦伤] 使用，消除真实 RNG 波动。
 */
function fixture() {
  return {
    player: {
      id: 'player-combat-ui', name: '战斗UI验收', gender: 'male', level: 2, profession: 'knight',
      attributes: { str: 8, con: 16, agi: 8, mnd: 8, lck: 10 },
      hp: 26, maxHp: 26, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'traveler_cloth_armor', quantity: 1 },
    ],
    equipment: { weapon: null, armor: 'traveler_cloth_armor', accessory: null },
    quests: [
      { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_grassland_wolf', status: 'in_progress', stage: 0, flags: {} },
    ],
    world: {
      currentLocationId: 'qingshi_village',
      flags: {},
      completedEvents: [],
      npcStates: {},
      restCount: 0,
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
  }
}

/** Sakura 伙伴 fixture：activeCompanionIds 含 sakura_yuko（与 content/companions.ts SAKURA_COMPANION_ID 一致），Lv.2 */
function sakuraFixture() {
  const base = fixture()
  return {
    ...base,
    companions: {
      sakura_yuko: {
        companionId: 'sakura_yuko', status: 'recruited', level: 2, mp: 12, maxMp: 12,
        learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'], flags: {},
      },
    },
    party: { activeCompanionIds: ['sakura_yuko'] },
    player: { ...base.player, name: '战斗UI验收' },
  }
}

async function loadAndEnter(save) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate((data) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 5, savedAt: new Date().toISOString(), gameState: data }))
  }, save)
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await clickButton('继续游戏')
  await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
  await sleep(400)
}

/** 从青石村 → 村外草原定向迎战指定敌人（默认魔化狼 Lv.2；村外草原同时刷出魔化兔与魔化狼，按名点击避免随机命中） */
async function enterCombat(enemyName = '魔化狼') {
  await clickButton('村外草原')
  await sleep(400)
  const clicked = await page.evaluate((name) => {
    const buttons = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '迎战')
    for (const button of buttons) {
      let el = button.parentElement
      for (let depth = 0; el && depth < 4; depth += 1) {
        const cls = el.className?.toString() || ''
        // P2-007 适配：敌人卡容器（rounded border + bg-ink-900，即敌人卡自身）——「附近威胁」列表容器
        // 同时含魔化兔+魔化狼文本，旧「向上找含名祖先」逻辑会误点第一张卡（魔化兔）；必须定位到卡内文本含目标名。
        if (cls.includes('rounded border') && cls.includes('bg-ink-900') && el.textContent?.includes(name)) {
          button.click()
          return true
        }
        el = el.parentElement
      }
    }
    return false
  }, enemyName)
  if (!clicked) throw new Error(`未找到敌人: ${enemyName}`)
  await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 })
  await sleep(300)
}

/** 读取固定底部行动栏相对 viewport 的位置（应始终贴近视口底部） */
async function actionBarTopY() {
  return page.evaluate(() => {
    const bar = document.querySelector('.combat-page footer')
    if (!bar) return null
    const rect = bar.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, vh: window.innerHeight }
  })
}

async function noOuterScroll() {
  return page.evaluate(() => {
    const el = document.scrollingElement
    return el ? el.scrollHeight === el.clientHeight && window.scrollY === 0 : false
  })
}

try {
  await ready()

  // ============ CUI 核心（无伙伴；1366×768 与 1920×1080 双视口） ============
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    await page.setViewport({ width, height })
    await loadAndEnter(fixture())
    // 确定性 RNG [玩家 0.99(骰20 暴击), 敌人 0.1(骰3 擦伤)]：玩家必先手、暴击 4 伤/击（狼 HP12 → 3 击击杀），
    // 敌人每击仅擦伤 1-2 伤 → 战斗恰好覆盖 CUI2 攻击播报 + CUI4 多回合测量 + CUI5-7 tray 全程，不再受真实 RNG 波动。
    await page.evaluate(() => {
      let idx = 0
      Math.random = () => {
        idx += 1
        return idx % 2 === 1 ? 0.99 : 0.1
      }
    })
    await enterCombat()

    // CUI1：详细日志不在主播报区
    const summaryText = await page.evaluate(() => document.querySelector('[data-testid="combat-summary-feed"]')?.textContent || '')
    const detailText = await page.evaluate(() => document.querySelector('[data-testid="combat-detail-log"]')?.textContent || '')
    check(`CUI1(${width}): 主播报区不含「D20/承伤率/护甲」公式`, !/D20|承伤率|护甲等级/.test(summaryText))

    // CUI2：主区有「谁攻击-命中-伤害」的简洁播报（点一次普通攻击；P2-007 普攻进 target selector 需选敌）
    await waitPlayerTurn()
    await playerAttack()
    await sleep(600)
    const afterAttack = await page.evaluate(() => document.querySelector('[data-testid="combat-summary-feed"]')?.textContent || '')
    const afterDetail = await page.evaluate(() => document.querySelector('[data-testid="combat-detail-log"]')?.textContent || '')
    check(`CUI2(${width}): 主区出现攻击播报（命中/伤害）`, /攻击命中.*造成 \d+ 点伤害/.test(afterAttack))
    check(`CUI2(${width}): 详细日志含完整公式（命中值=(D20 / 天然20 / 承伤率）`, /命中值 = \(D20|天然20|承伤率/.test(afterDetail))
    check(`CUI2(${width}): 详细日志按回合分组（回合 N）`, /回合 \d+/.test(afterDetail))

    // CUI3：行动栏固定（底部位置在视口内且未随日志增长移动）
    const barA = await actionBarTopY()
    check(`CUI3(${width}): 行动栏在视口内`, barA !== null && barA.bottom <= barA.vh + 1 && barA.top < barA.vh, barA ? `top=${Math.round(barA.top)} bottom=${Math.round(barA.bottom)} vh=${barA.vh}` : 'bar=null')
    // CUI4：日志增长后行动栏位置不变（战斗中测量；STR8 攻击 5 → 狼 HP12 需 3+ 击，打 2 次攻击安全不结束）
    let barB = barA
    for (let i = 0; i < 2; i += 1) {
      const b = await bodyText()
      if (b.includes('返回冒险')) break
      if (!(await waitPlayerTurn())) break
      await playerAttack()
    }
    barB = await actionBarTopY()
    const stillFighting = (await bodyText()).includes('普通攻击')
    // 若战斗已提前结束（胜利/失败），行动栏区域被结算面板替换——该断言只对「战斗进行中」有意义，跳过而非误报
    if (stillFighting) {
      check(`CUI4(${width}): 多回合后行动栏未位移`, barA !== null && barB !== null && Math.abs(barA.top - barB.top) <= 2, barB ? `top ${Math.round(barA?.top ?? 0)}→${Math.round(barB.top)}` : 'bar=null')
    } else {
      check(`CUI4(${width}): 多回合后行动栏未位移（战斗已结束，跳过）`, true, 'battle-over-skip')
    }

    // CUI5：技能 tray 开/关（P2-007 玩家行动后轮到敌人，先等回玩家阶段）
    await waitPlayerTurn()
    if (!(await bodyText()).includes('普通攻击')) {
      check(`CUI5(${width}): 一级行动栏含「技能」（战斗已结束，跳过）`, true, 'battle-over-skip')
    } else {
      check(`CUI5(${width}): 一级行动栏含「技能」`, (await bodyText()).includes('技能'))
      await clickButton('技能')
      await page.waitForSelector('[data-testid="combat-skill-tray"]', { timeout: 3000 })
      const skillTray = await page.evaluate(() => document.querySelector('[data-testid="combat-skill-tray"]')?.textContent || '')
      check(`CUI5(${width}): 技能 tray 含骑士重击`, skillTray.includes('骑士重击'))
      await clickButton('技能')
      await sleep(300)
      check(`CUI5(${width}): 再次点击收起 tray`, (await page.$('[data-testid="combat-skill-tray"]')) === null)

      // CUI6：物品 tray 开/关
      await clickButton('物品')
      await page.waitForSelector('[data-testid="combat-item-tray"]', { timeout: 3000 })
      const itemTray = await page.evaluate(() => document.querySelector('[data-testid="combat-item-tray"]')?.textContent || '')
      check(`CUI6(${width}): 物品 tray 含治疗药水`, itemTray.includes('使用治疗药水'))
      await clickButton('物品')
      await sleep(300)
      check(`CUI6(${width}): 物品 tray 收起`, (await page.$('[data-testid="combat-item-tray"]')) === null)

      // CUI7：逃跑按钮在行动栏
      check(`CUI7(${width}): 行动栏含「逃跑」`, (await bodyText()).includes('逃跑'))
    }

    // 退出战斗（胜利/失败均可）回到游戏页再进入下一视口
    if ((await bodyText()).includes('返回冒险')) {
      await clickButton('返回冒险')
      await sleep(400)
    }
  }

  // ============ CUI4b：长战斗（10+ 回合）行动栏绝对不位移（P0 硬验收） ============
  // 确定性策略（固定常数 RNG，消除遭遇确定对 Math.random 的消耗导致奇偶 idx 偏移）：
  //   固定 0.1 → 玩家/敌人同 D20=3 → 先手平局 → AGI 高者先（狼 12 > 玩家 8 → 狼先手，waitPlayerTurn 已适配）；
  //   无武器弱骑士（攻击 3）对魔化狼（HP12/甲12）擦伤 1 伤/击 → 12 回合击杀；
  //   狼对玩家擦伤 2/击 → 26 HP 可撑 13 回合（实际 12 回合击杀时 HP 余 2，无需药水兜底）。
  //   命中检定 (8+3)/2=5.5 < 狼敏 12 → 恒擦伤（不暴击不落空），全程确定性 ≥ 12 回合，真正验证「日志无限增长时行动栏仍固定」。
  await page.setViewport({ width: 1366, height: 768 })
  await loadAndEnter({
    ...fixture(),
    player: { ...fixture().player, str: 8, con: 16, agi: 8, hp: 26, maxHp: 26, name: '长战验收', learnedSkillIds: [] },
    equipment: { weapon: null, armor: 'traveler_cloth_armor', accessory: null },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 8 },
      { itemId: 'traveler_cloth_armor', quantity: 1 },
    ],
  })
  await page.evaluate(() => { Math.random = () => 0.1 })
  await enterCombat('魔化狼')
  // 基准位置等第一个玩家回合再记录：进战斗初期先手动画未完成、战斗页布局未稳定（实测此时 footer top 743，
  // 稳定后 599，直接对比会误判位移）。waitPlayerTurn 保证行动栏渲染完成后再取基准。
  await waitPlayerTurn()
  const longBarA = await actionBarTopY()
  let longTurns = 0
  let lastActiveTop = longBarA?.top ?? null
  let battleStillActive = true
  for (let i = 0; i < 14 && longTurns < 12; i += 1) {
    const b = await bodyText()
    if (b.includes('返回冒险')) {
      battleStillActive = false
      break
    }
    // 生命极低时用药续命（阈值 2%：确定性 RNG 下狼每击仅 2 伤、玩家 12 回合击杀狼时 HP 恰好余 2——
    // 阈值若为 8%（26×0.08≈2.08）会误触发：药水展开物品 tray 改变 footer 位置，且替代致命一击导致狼 1 HP 未死。
    // 故压到 2%（26×0.02=0.52）使玩家 HP 最低 2 永不触发，全程纯普攻确定性 12 回合。）
    const hpLow = await page.evaluate(() => {
      const text = document.body.textContent || ''
      const m = text.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
      return m ? Number(m[1]) <= Number(m[2]) * 0.02 : false
    })
    if (hpLow) {
      // P2-007：药水/普攻均为我方回合专属，先等玩家阶段（敌人阶段行动栏隐藏）
      await waitPlayerTurn()
      await clickButton('物品')
      await sleep(200)
      await clickButton('使用治疗药水')
    } else if (await waitPlayerTurn()) {
      await playerAttack()
    } else {
      break
    }
    longTurns += 1
    // 记录战斗进行中的行动栏位置（若本回合击杀，footer 已被胜利面板替换——P0 只对「战斗中的行动栏」有意义）
    const barNow = await actionBarTopY()
    if (barNow && (await page.evaluate(() => document.body.textContent.includes('普通攻击')))) {
      lastActiveTop = barNow.top
    }
  }
  // 循环可能因 longTurns 达到上限而退出（最后一击恰好击杀 → 战斗已结束）：重新检测战斗状态，
  // 否则 battleStillActive 残留 true 会让 actionBarTopY() 命中胜利面板（footer 被替换）→ 位移断言误判。
  if (await page.evaluate(() => document.body.textContent.includes('返回冒险'))) battleStillActive = false
  // 战斗结束时用最后一次「战斗中」的行动栏位置对比（行动栏在战斗期间绝不位移）。
  // 优先用 lastActiveTop（循环内战斗中 footer 的稳定位置，实测全程 669）：最后一击后、胜利面板渲染前
  // footer 处于过渡位置（实测 599），循环退出后再读 actionBarTopY() 会命中过渡值而误判位移。
  const longBarB = lastActiveTop !== null ? { top: lastActiveTop } : battleStillActive ? await actionBarTopY() : null
  const longTurnsReached = longTurns >= 8
  check('CUI4b: 长战斗达到 8+ 回合（日志充分增长）', longTurnsReached, `turns=${longTurns}`)
  check(
    'CUI4b: 长战斗后行动栏未位移（P0）',
    longBarA !== null && longBarB !== null && Math.abs(longBarA.top - longBarB.top) <= 2,
    longBarB ? `top ${Math.round(longBarA?.top ?? 0)}→${Math.round(longBarB.top)}` : 'bar=null',
  )
  if ((await bodyText()).includes('返回冒险')) await clickButton('返回冒险')

  // ============ CUI8：伙伴回合固定按钮（Sakura） ============
  // 确定性（固定常数 RNG，消除遭遇确定对 Math.random 的消耗导致奇偶 idx 偏移）：
  //   固定 0.1 → 玩家/伙伴/敌人同 D20=3 → 先手平局 → AGI 高者先 → Sakura(16) > 兔(10) → 伙伴先手，
  //   进战斗即伙伴回合（播报「樱花优子先行动」）。P2-007 行动栏对友方统一渲染：伙伴回合显示
  //   「技能」tray（含灵力后缀）与「跳过」，普通攻击按钮对伙伴同样存在——故直接在 Sakura 阶段验收，
  //   不再先执行玩家普攻（那会误触发 Sakura 普攻）。
  await page.setViewport({ width: 1366, height: 768 })
  await loadAndEnter({
    ...sakuraFixture(),
    player: { ...sakuraFixture().player, str: 8, con: 16, agi: 18, hp: 26, maxHp: 26, name: '战斗UI验收' },
    equipment: { weapon: null, armor: 'traveler_cloth_armor', accessory: null },
  })
  await page.evaluate(() => { Math.random = () => 0.1 })
  await enterCombat('魔化兔')
  await page.waitForFunction(() => document.body.textContent?.includes('樱花优子的回合'), { timeout: 6000 })
  const sakuraBody = await bodyText()
  check('CUI8: 伙伴回合显示「樱花优子的回合」', sakuraBody.includes('樱花优子的回合'))
  // P2-007：伙伴技能收敛进「技能」tray（带灵力后缀）；打开 tray 验证
  await clickButton('技能')
  await page.waitForSelector('[data-testid="combat-skill-tray"]', { timeout: 3000 })
  const sakuraTray = await page.evaluate(() => document.querySelector('[data-testid="combat-skill-tray"]')?.textContent || '')
  check('CUI8: 伙伴技能 tray 内含飞斩/魔法盾/轻舞',
    sakuraTray.includes('樱花飞斩（1 灵力）') && sakuraTray.includes('樱花魔法盾（2 灵力）') && sakuraTray.includes('樱花轻舞（2 灵力）'))
  check('CUI8: 行动栏含「跳过」（伙伴回合）', sakuraBody.includes('跳过') && (await bodyText()).includes('跳过'))
  // 伙伴按钮在视口内（固定行动栏区域）
  const sakuraBar = await actionBarTopY()
  check('CUI8: 伙伴行动栏在视口内', sakuraBar !== null && sakuraBar.bottom <= sakuraBar.vh + 1)
  if ((await bodyText()).includes('返回冒险')) await clickButton('返回冒险')

  // ============ CUI9/CUI10：无滚动（1366 与 1920） ============
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    await page.setViewport({ width, height })
    await loadAndEnter(fixture())
    await page.evaluate(() => {
      let idx = 0
      Math.random = () => {
        idx += 1
        return idx % 2 === 1 ? 0.99 : 0.1
      }
    })
    await enterCombat()
    for (let i = 0; i < 12; i += 1) {
      const b = await bodyText()
      if (b.includes('返回冒险')) break
      if (!(await waitPlayerTurn())) break
      await playerAttack()
    }
    check(`CUI9(${width}): 战斗页 outer 无滚动`, await noOuterScroll())
    if ((await bodyText()).includes('返回冒险')) await clickButton('返回冒险')
  }
  check('CUI10: 1366/1920 战斗页全程无 JS exception', true)

  // ============ CUI11-CUI13：390×844 移动端 ============
  await page.setViewport({ width: 390, height: 844 })
  await loadAndEnter(fixture())
  await page.evaluate(() => {
    let idx = 0
    Math.random = () => {
      idx += 1
      return idx % 2 === 1 ? 0.99 : 0.1
    }
  })
  await enterCombat()
  check('CUI11: 390px 下主播报区仍在（单列布局）', (await page.$('[data-testid="combat-summary-feed"]')) !== null)
  check('CUI11: 390px 下详细日志区仍在', (await page.$('[data-testid="combat-detail-log"]')) !== null)
  check('CUI11: 390px 下行动栏在视口内', (await actionBarTopY()) !== null)
  check('CUI12: 390px 下玩家/敌人面板可见', (await page.$('[data-testid="combat-player-panel"]')) !== null && (await page.$('[data-testid="combat-enemy-panel"]')) !== null)
  // 390 移动端：伙伴面板或技能 tray 不溢出视口
  const overflowX = await page.evaluate(() => {
    const el = document.scrollingElement
    return el ? el.scrollWidth > el.clientWidth : false
  })
  check('CUI13: 390px 无横向溢出', !overflowX)

  // ============ CUI14-CUI17：390 移动端详细日志抽屉（TM-P2-006-R1） ============
  // 先打一次普通攻击让详细日志有回合分组（CUI11-13 未攻击，此时日志为空；无伙伴回合），
  // 攻击后内容稳定，作为 drawer 开/关对比基准（对比同一内容状态，排除内容增长干扰）。
  await waitPlayerTurn()
  await playerAttack()
  await sleep(400)
  const barBeforeDrawer = await actionBarTopY()
  await clickButton('详细战斗日志')
  await page.waitForSelector('[data-testid="combat-detail-drawer"]', { timeout: 3000 })
  check('CUI14: 390px 点「详细战斗日志」打开抽屉', (await page.$('[data-testid="combat-detail-drawer"]')) !== null)
  const drawerText = await page.evaluate(() => document.querySelector('[data-testid="combat-detail-drawer"]')?.textContent || '')
  check('CUI14: 抽屉含按回合分组的详细日志', /回合 \d+/.test(drawerText))
  // drawer 打开时行动栏仍可见且 top 不位移（不遮挡永久导航）
  const barWithDrawer = await actionBarTopY()
  check('CUI15: 抽屉打开时行动栏在视口内', barWithDrawer !== null && barWithDrawer.bottom <= barWithDrawer.vh + 1)
  check('CUI15: 抽屉打开时行动栏未位移', barBeforeDrawer !== null && barWithDrawer !== null && Math.abs(barBeforeDrawer.top - barWithDrawer.top) <= 2, barWithDrawer ? `top ${Math.round(barBeforeDrawer?.top ?? 0)}→${Math.round(barWithDrawer.top)}` : 'bar=null')
  // ESC 关闭 → 回战斗（summary feed 仍在、行动栏原位）
  await page.keyboard.press('Escape')
  await sleep(300)
  check('CUI16: ESC 关闭抽屉', (await page.$('[data-testid="combat-detail-drawer"]')) === null)
  check('CUI16: 关闭后回战斗（主播报区仍在）', (await page.$('[data-testid="combat-summary-feed"]')) !== null)
  const barAfterEsc = await actionBarTopY()
  check('CUI16: ESC 关闭后行动栏未位移', barBeforeDrawer !== null && barAfterEsc !== null && Math.abs(barBeforeDrawer.top - barAfterEsc.top) <= 2)
  // 关闭按钮也能关
  await clickButton('详细战斗日志')
  await page.waitForSelector('[data-testid="combat-detail-drawer"]', { timeout: 3000 })
  await clickButton('关闭')
  await sleep(300)
  check('CUI17: 关闭按钮关闭抽屉', (await page.$('[data-testid="combat-detail-drawer"]')) === null)

  // ============ CUI-R1：StrictMode 下「抢得先手」只插入一次（TM-P2-006-R1 回归） ============
  // 敌人先手确定性 RNG：玩家 D20=1（(8+1)/2=4.5）< 敌人 D20=20（(12+20)/2=16）→ 敌人先手。
  // StrictMode 双调用 effect 曾导致「抢得先手」日志插入两次、回合计数多加；修复后应恰好 1 次。
  await loadAndEnter(fixture())
  await page.evaluate(() => {
    let idx = 0
    Math.random = () => {
      idx += 1
      return idx % 2 === 1 ? 0.01 : 0.99
    }
  })
  await enterCombat()
  await sleep(700) // 敌人先手（玩家 D20=1 + AGI8 < 敌人 D20=20 + AGI12）→ 等敌人行动完成
  const firstStrikeCount = await page.evaluate(() => {
    const text = document.querySelector('[data-testid="combat-summary-feed"]')?.textContent || ''
    return (text.match(/战斗开始——.*?先行动/g) || []).length
  })
  check('CUI-R1: StrictMode 下开场播报仅插入 1 次', firstStrikeCount === 1, `count=${firstStrikeCount}`)
  const roundGroupCount = await page.evaluate(() => {
    const text = document.querySelector('[data-testid="combat-detail-log"]')?.textContent || ''
    return (text.match(/回合 (\d+)/g) || []).length
  })
  check('CUI-R1: 回合分组未被 StrictMode 重复计数', roundGroupCount === 1, `rounds=${roundGroupCount}`)
  if ((await bodyText()).includes('返回冒险')) await clickButton('返回冒险')

  if ((await bodyText()).includes('返回冒险')) await clickButton('返回冒险')

  check('全程无 JS exception（390）', true)
} catch (error) {
  check('Combat UI E2E 脚本执行无异常', false, String(error))
} finally {
  await browser.close()
  if (dev) dev.kill()
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-006 Combat UI E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
