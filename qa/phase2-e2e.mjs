// ============================================================================
// 《天梦大陆》Phase 2 北门新剧情 E2E 验收脚本（TM-P2-001 第五部分）
// 运行前提：先运行 qa/phase1-playthrough.mjs 留下「Phase 1 完成存档」（脚本末已保存）
// 运行：node qa/phase2-e2e.mjs （需 dev server 已在 5199 端口运行）
// 环境变量：CHROME_PATH（默认系统 Chrome）、BASE_URL（默认 http://localhost:5199/）
//
// 路线（全程正式 UI / Store 入口推进，严禁开发者控制台/直接改 GameState/localStorage）：
//   1. 主菜单 Continue（Phase 1 完成存档）→ 武馆
//   2. 未接任务验证：北门无黑鬃魔狼、无调查入口
//   3. 武馆马科发现《北门失联》→ 接受
//   4. 北门：未调查时无狼 → 查看巡逻队留下的痕迹 → 痕迹剧情
//   5. 黑鬃魔狼（Lv.3）出现 → 战斗（Math.random 隔离 0.99 天然 20 暴击）→ 胜利
//   6. 铜牌胜利剧情 → 狼不复活 → 任务可完成
//   7. 回武馆 → 提交任务 → completed（金币 +30）→ 马科固定剧情
//   8. 不能重复奖励；任务完成后旧调查按钮消失
//   9. 保存 → 主菜单 → Continue → 状态保持；无 dead button
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
  // CHROME_PROFILE：跨脚本共享浏览器 profile（Phase 1 存档 → Phase 2 读取）
  userDataDir: process.env.CHROME_PROFILE || undefined,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768 })

// ---------------- 辅助函数（复用 e2e.mjs 顶部实现） ----------------

const clickByText = async (text) => {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('未找到按钮: ' + t)
    btn.click()
  }, text)
  // TM-P2-003-R3：持久 profile 下 React 渲染稍慢，点击后留足时序余量
  await sleep(400)
}

// TM-P2-006：精确匹配按钮文本（trim 相等；避免「离开」误匹配文案）
const clickExactButton = async (text) => {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)
    if (!btn) throw new Error('未找到按钮: ' + t)
    btn.click()
  }, text)
  await sleep(400)
}

// TM-P2-006：右栏任务中心（quest-column）内点击按钮
const clickInQuestColumn = async (text) => {
  await page.evaluate((t) => {
    const col = document.querySelector('[data-testid="quest-column"]')
    if (!col) throw new Error('未找到 quest-column')
    const btn = [...col.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('quest-column 未找到按钮: ' + t)
    btn.click()
  }, text)
  await sleep(400)
}

// TM-P2-006：右栏附近委托完整接受流程
const acceptNearbyQuest = async () => {
  await clickInQuestColumn('查看')
  const body = await bodyText()
  if (body.includes('查看委托')) {
    await clickInQuestColumn('查看委托')
    await sleep(200)
    await clickInQuestColumn('接受任务')
  } else if (body.includes('接受任务')) {
    await clickInQuestColumn('接受任务')
  } else {
    throw new Error('附近委托展开后未找到「查看委托/接受任务」按钮')
  }
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

// ---- TM-P2-002：五槽位存档辅助 ----
const SAVE_KEYS = [
  'tianmeng_continent_save',
  'tianmeng_continent_saves_index',
  'tianmeng_continent_save_slot_slot1',
  'tianmeng_continent_save_slot_slot2',
  'tianmeng_continent_save_slot_slot3',
  'tianmeng_continent_save_slot_slot4',
  'tianmeng_continent_save_slot_slot5',
]
const clearAllSaves = () =>
  page.evaluate((keys) => keys.forEach((k) => localStorage.removeItem(k)), SAVE_KEYS)
// 保存游戏：打开五槽位 → 保存到 Slot 1（已有存档先点「覆盖保存」确认）→ 返回游戏页
const saveToSlot1 = async () => {
  await clickByText('保存游戏')
  await sleep(300)
  const body = await page.evaluate(() => document.body.textContent)
  if (body.includes('确认覆盖')) {
    await clickByText('确认覆盖')
  } else if (body.includes('覆盖保存')) {
    // 已有存档：第一次点击进入覆盖确认，第二次点击确认执行
    await clickByText('覆盖保存')
    await sleep(300)
    await clickByText('确认覆盖')
  } else {
    await clickByText('保存到此槽')
  }
  await sleep(300)
}
// 读取 Slot 1 存档（SaveSlot 结构 { savedAt, gameState }）
const readSlot1Save = () =>
  page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')
    } catch {
      return null
    }
  })


const continueDisabled = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('继续游戏'))
    return btn ? btn.disabled : null
  })

const buttonDisabled = (text) =>
  page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    return btn ? btn.disabled : null
  }, text)

// 读取「当前位置」区域的地点 ID（确定性读取，避免模糊文本）
const readLocationId = () =>
  page.evaluate(() => document.querySelector('[data-current-location-id]')?.getAttribute('data-current-location-id') || null)

const readGold = async () => {
  const m = (await bodyText()).match(/金币\s*(\d+)/)
  return m ? Number(m[1]) : null
}

// ---- P2-007 战斗适配辅助 ----
// 骰序：先手在点击「迎战」时由 enterBattle 固定 0.1 RNG 结算（各单位 D20=3 → 按 AGI 排序）。
// 本循环每轮玩家行动前注入一次性 RNG：玩家行动 roll → 0.99（D20=20 暴击）；
// 行动后敌人回合（chooseEnemyTarget 1 次 + performAttack 1 次）第二次调用 → 0（D20=1 大失败，0 伤）。
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

/** target selector 内选第一个目标（「取消」按钮容器内第一个按钮；单敌场景唯一目标） */
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

/** 普通攻击：点击行动栏按钮 → target selector 选敌 */
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

/** 技能：展开技能 tray → 点击技能名 → target selector 选敌；技能禁用（MP/oncePerCombat）返回 false 并收起 tray */
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

/** P2-007：进入战斗前固定 0.1 RNG（先手检定各单位 D20=3 → 按 AGI 排序，避免原生骰敌人先手暴击秒伤）；保存原始 RNG 供 combatLoop 战斗结束恢复 */
const enterBattle = async (enemyName) => {
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.1
  })
  if (enemyName) {
    await page.evaluate((n) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('迎战'))
      if (!btn) throw new Error('未找到迎战按钮: ' + n)
      btn.click()
    }, enemyName)
    await sleep(500)
  } else {
    await clickByText('迎战')
    await sleep(500)
  }
}

// 战斗循环：已点击「迎战」进入战斗页后调用。
// P2-007 策略：先手检定由 enterBattle 固定 0.1 结算；本循环每轮等玩家阶段（普通攻击渲染）→
// 注入一次性 RNG（玩家暴击 0.99 → 敌人大失败 0）→ 首轮骑士重击（oncePerCombat 每场一次）后续普攻；
// 低血（<50%）经物品 tray 用药。战斗结束（返回冒险）break 后恢复原始 RNG。
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
    // 一次性 RNG：玩家行动 0.99 暴击 → 敌人回合 0 大失败
    await page.evaluate(() => {
      Math.random = () => { Math.random = () => 0; return 0.99 }
    })
    let acted = false
    if (skillFirst) {
      acted = await useSkillIfAvailable('骑士重击')
      skillFirst = false
    }
    if (acted) continue
    // 低血（<50%）→ 用药（物品 tray；无 random，敌人回合仍被一次性 RNG 二次调用 0 压制）
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
    // 兜底普通攻击 → target selector 选敌
    const attacked = await playerAttack()
    if (!attacked) break
  }
  await page.evaluate(() => {
    if (window.__origRandom) Math.random = window.__origRandom
  })
  body = await bodyText()
  check(`击败${enemyName}（战斗胜利）`, body.includes('战斗胜利'), body.includes('战斗失败') ? '战斗失败！' : '')
  await clickByText('返回冒险')
  await sleep(300)
}

// ---------------- 主流程 ----------------
try {
  let body

  // 0. 前提：Phase 1 完成存档必须存在（先跑 phase1-playthrough.mjs）
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(500)
  await enterLocalModeIfNeeded()
  body = await bodyText()
  const hasPhase1Save = (await continueDisabled()) === false
  check('Phase 1 完成存档存在（Continue 可用）', hasPhase1Save)
  if (!hasPhase1Save) {
    check('前置提示：请先运行 node qa/phase1-playthrough.mjs', false)
    throw new Error('缺少 Phase 1 完成存档，请先运行 phase1-playthrough.mjs')
  }

  // 1. Continue → 武馆（Phase 1 完成态）
  await clickByText('继续游戏')
  await sleep(400)
  body = await bodyText()

  check('Continue 后到达武馆（tianlong_martial_hall）', (await readLocationId()) === 'tianlong_martial_hall')
  check('Phase 1 主线已完成（第一阶段完成）', body.includes('第一阶段完成'))
  // TM-P2-006：已完成任务默认折叠 → 展开右栏「已完成」区验证王财任务行存在
  await clickInQuestColumn('已完成')
  await sleep(300)
  body = await bodyText()
  check('王财任务已完成', body.includes('商人王财的麻烦') && body.includes('已完成'))

  // 2. 未接任务验证：北门无黑鬃魔狼、无调查入口（任何时候可参观北门，但任务行动不出现）
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('天龙城北门')
  await sleep(300)
  body = await bodyText()
  check('未接任务可参观北门（tianlong_north_gate）', (await readLocationId()) === 'tianlong_north_gate')
  check('未接任务时北门无调查入口', !body.includes('查看巡逻队留下的痕迹'))
  check('未接任务时北门无黑鬃魔狼', !body.includes('黑鬃魔狼'))
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('武馆')
  await sleep(300)

  // 3. 马科发现《北门失联》→ 接受
  body = await bodyText()

  check('《北门失联》可接受（发布者马科）', body.includes('附近委托') && body.includes('马科：《北门失联》'))
  await acceptNearbyQuest('北门失联')
  await sleep(300)
  body = await bodyText()
  check('《北门失联》进行中', body.includes('北门失联') && body.includes('进行中'))
  check('日志显示当前目标：前往天龙城北门', body.includes('前往天龙城北门，寻找巡逻队留下的踪迹'))

  // 4. 北门：未调查时无狼 → 查看痕迹 → 痕迹剧情（战前在武馆休整保证满血——当前已在武馆，无需再点「武馆」）
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '休整')
    if (b && !b.disabled) b.click()
  })
  await sleep(400)
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('天龙城北门')
  await sleep(300)
  body = await bodyText()
  check('任务进行中且未调查时无黑鬃魔狼', !body.includes('黑鬃魔狼'))
  check('查看巡逻队留下的痕迹按钮可用', (await buttonDisabled('查看巡逻队留下的痕迹')) === false)
  await clickByText('查看巡逻队留下的痕迹')
  await sleep(300)
  body = await bodyText()
  check('痕迹剧情（凌乱马蹄印）', body.includes('城门外侧的泥地上散落着凌乱马蹄印'))
  check('痕迹剧情（偏离官道消失在荒草间）', body.includes('其中一串痕迹突然偏离官道，消失在北面的荒草间'))
  check('痕迹剧情（魔化气息）', body.includes('草叶间还残留着明显的魔化气息'))
  check('调查后黑鬃魔狼 Lv.3 出现', body.includes('黑鬃魔狼') && body.includes('Lv.3') && body.includes('迎战'))

  // 5. 黑鬃魔狼战斗（enterBattle 固定 0.1 先手 + 每轮一次性暴击 RNG）
  await enterBattle()
  await combatLoop('黑鬃魔狼', 3)
  body = await bodyText()

  // 6. 铜牌胜利剧情 → 狼不复活 → 任务可完成
  check('北门胜利剧情（黑鬃魔狼倒在荒草之间）', body.includes('黑鬃魔狼倒在荒草之间。'))
  check('北门胜利剧情（断裂铜牌）', body.includes('你在附近找到了一块刻着骑士团纹章的断裂铜牌'))
  check('北门胜利剧情（痕迹继续向北）', body.includes('马蹄印和拖拽痕迹仍然继续向北延伸。'))
  check('北门胜利剧情（巡逻队没停在这里）', body.includes('失联巡逻队显然没有停在这里。'))
  check('胜利后目标：返回武馆告诉马科', body.includes('当前目标：返回武馆，将发现告诉马科。'))
  // 胜利剧情块（D5）是持久剧情，击败后仍含「黑鬃魔狼」文本——用「附近威胁」区域精确断言（无迎战黑鬃魔狼）
  const threatsAfterWolf = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('附近威胁'))
    if (!heading) return null
    const section = heading.closest('section')
    return section ? section.textContent : ''
  })
  check('击败后狼不复活（威胁区无黑鬃魔狼/迎战）', threatsAfterWolf === null || (!threatsAfterWolf.includes('黑鬃魔狼') && !threatsAfterWolf.includes('迎战')))
  check('日志《北门失联》可提交（右栏可提交区）', body.includes('可提交') && body.includes('北门失联'))
  check('日志显示黑鬃魔狼已击败', body.includes('黑鬃魔狼已击败，找到了断裂的铜牌。'))

  // 7. 回武馆 → 提交任务 → completed（金币 +30）→ 马科固定剧情
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('武馆')
  await sleep(300)
  body = await bodyText()
  check('到达武馆', body.includes('武馆') && body.includes('马科'))
  const goldBefore = await readGold()
  check('提交任务按钮可用', (await buttonDisabled('提交任务')) === false)
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('《北门失联》已完成（右栏已完成区）', body.includes('已完成（'))
  check('马科固定剧情（接过断裂的铜牌）', body.includes('马科接过断裂的铜牌，脸色沉了下来。'))
  check('马科固定剧情（北门第三巡逻队）', body.includes('这是北门第三巡逻队的东西。'))
  check('马科固定剧情（黑石塔之外北面也不对劲）', body.includes('看来黑石塔之外，北面的情况也不对劲。'))
  check('马科固定剧情（封锁消息继续查）', body.includes('我会先派人封锁消息。下一步，我们得沿着他们留下的路线继续查。'))
  const goldAfter = await readGold()
  check('提交《北门失联》金币 +30', goldBefore !== null && goldAfter === goldBefore + 30, `金币 ${goldBefore}→${goldAfter}`)

  // 8. 不能重复奖励；任务完成后旧目标/旧按钮/旧文案全部清除（TM-P2-002 关键回归）
  check('提交后无提交任务按钮残留', !body.includes('提交任务'))
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('天龙城北门')
  await sleep(300)
  body = await bodyText()
  check('任务完成后旧调查按钮消失', !body.includes('查看巡逻队留下的痕迹'))
  const threatsAfterComplete = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('附近威胁'))
    if (!heading) return null
    const section = heading.closest('section')
    return section ? section.textContent : ''
  })
  check('任务完成后黑鬃魔狼不复活（威胁区无黑鬃魔狼）', threatsAfterComplete === null || !threatsAfterComplete.includes('黑鬃魔狼'))
  // TM-P2-002：completed 后北门不得残留「当前目标：返回武馆，将发现告诉马科。」
  check('完成后北门无旧目标「返回武馆，将发现告诉马科。」', !body.includes('当前目标：返回武馆，将发现告诉马科。'))
  // TM-P2-002：completed 后胜利剧情仍保留（狼倒下/铜牌/痕迹继续向北）
  check('完成后北门胜利剧情保留（黑鬃魔狼倒下）', body.includes('黑鬃魔狼倒在荒草之间。'))
  check('完成后北门胜利剧情保留（断裂铜牌）', body.includes('你在附近找到了一块刻着骑士团纹章的断裂铜牌。'))
  check('完成后北门胜利剧情保留（痕迹继续向北）', body.includes('马蹄印和拖拽痕迹仍然继续向北延伸。'))
  // TM-P2-002：北门任务仍 completed；无 Phase 1 过时文案
  check('完成后《北门失联》仍 completed（右栏已完成区）', body.includes('已完成（'))
  check('完成后不存在「当前可玩主线内容已完成。」', !body.includes('当前可玩主线内容已完成。'))
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('武馆')
  await sleep(300)

  // 9. 保存 → 主菜单 → Continue → 状态保持；无 dead button
  await saveToSlot1()
  await sleep(300)
  body = await bodyText()
  check('北门任务完成后保存成功（返回游戏页）', (await page.evaluate(() => document.querySelector('[data-testid="quest-column"]') !== null)) || body.includes('当前目标'))
  const saveData = await readSlot1Save()
  const qNorth = saveData?.gameState?.quests?.find((q) => q.questId === 'quest_north_gate_missing_patrol')
  check('存档：quest_north_gate_missing_patrol = completed', qNorth?.status === 'completed')
  check('存档：北门 flags 保持（trail_checked/wolf_defeated）', qNorth?.flags?.north_gate_trail_checked === true && qNorth?.flags?.north_gate_wolf_defeated === true)
  await clickByText('主菜单')
  await sleep(300)
  body = await bodyText()
  check('返回主菜单成功', body.includes('天梦大陆'))
  await clickByText('继续游戏')
  await sleep(400)
  body = await bodyText()
  check('Continue 后《北门失联》仍 completed（右栏已完成区）', body.includes('已完成（'))
  check('Continue 后马科剧情保持', body.includes('马科接过断裂的铜牌，脸色沉了下来。'))
  // 无 dead button：页面按钮集合精确检查
  const deadButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()))
  check('无「查看巡逻队留下的痕迹」残留按钮', !deadButtons.some((t) => t.includes('查看巡逻队留下的痕迹')))
  check('无「提交任务」残留按钮', !deadButtons.some((t) => t === '提交任务'))
  // TM-P2-002：Save → Main Menu → Continue 后再次回北门验证（旧目标/旧按钮/旧文案/狼不复活/任务 completed）
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('天龙城北门')
  await sleep(300)
  body = await bodyText()
  check('Continue 后北门无旧目标「返回武馆，将发现告诉马科。」', !body.includes('当前目标：返回武馆，将发现告诉马科。'))
  check('Continue 后北门无旧调查按钮', !body.includes('查看巡逻队留下的痕迹'))
  const threatsAfterContinue = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('附近威胁'))
    if (!heading) return null
    const section = heading.closest('section')
    return section ? section.textContent : ''
  })
  check('Continue 后黑鬃魔狼不重新出现', threatsAfterContinue === null || !threatsAfterContinue.includes('黑鬃魔狼'))
  check('Continue 后《北门失联》仍 completed（右栏已完成区）', body.includes('已完成（'))
  check('Continue 后不存在「当前可玩主线内容已完成。」', !body.includes('当前可玩主线内容已完成。'))
  check('Continue 后胜利剧情仍保留', body.includes('黑鬃魔狼倒在荒草之间。') && body.includes('你在附近找到了一块刻着骑士团纹章的断裂铜牌。'))
} catch (err) {
  check('脚本执行无异常', false, err && err.message ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`)
process.exit(failed.length > 0 ? 1 : 0)
