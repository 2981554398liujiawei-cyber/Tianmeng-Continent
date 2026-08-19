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
  await sleep(250)
}

const bodyText = () => page.evaluate(() => document.body.textContent)

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
  page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })

const readGold = async () => {
  const m = (await bodyText()).match(/金币\s*(\d+)/)
  return m ? Number(m[1]) : null
}

// 战斗循环：已点击「迎战」进入战斗页后调用。Math.random 隔离为 0.99（天然 20 暴击；击杀回合敌人不反击）
const combatLoop = async (enemyName, level) => {
  let body = await bodyText()
  check(`进入${enemyName}战斗（Lv.${level}）`, body.includes(enemyName) && body.includes(`Lv.${level}`))
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  for (let i = 0; i < 24; i += 1) {
    const combatBody = await page.evaluate(() => document.body.innerText)
    if (combatBody.includes('返回冒险')) break
    if (combatBody.includes('普通攻击')) {
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('普通攻击'))?.click())
      await sleep(300)
    } else {
      break
    }
  }
  await page.evaluate(() => {
    Math.random = window.__origRandom
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
  check('马科似乎有事相托（北门失联入口）', body.includes('马科似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('《北门失联》可接受（发布者马科）', body.includes('北门失联') && body.includes('可接受') && body.includes('发布者：马科'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('《北门失联》进行中', body.includes('北门失联') && body.includes('进行中'))
  check('日志显示当前目标：前往天龙城北门', body.includes('前往天龙城北门，寻找巡逻队留下的踪迹'))

  // 4. 北门：未调查时无狼 → 查看痕迹 → 痕迹剧情
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

  // 5. 黑鬃魔狼战斗（0.99 暴击）
  await clickByText('迎战')
  await sleep(300)
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
  check('日志《北门失联》可完成', body.includes('北门失联') && body.includes('可完成'))
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
  check('《北门失联》已完成', body.includes('北门失联') && body.includes('已完成'))
  check('马科固定剧情（接过断裂的铜牌）', body.includes('马科接过断裂的铜牌，脸色沉了下来。'))
  check('马科固定剧情（北门第三巡逻队）', body.includes('这是北门第三巡逻队的东西。'))
  check('马科固定剧情（黑石塔之外北面也不对劲）', body.includes('看来黑石塔之外，北面的情况也不对劲。'))
  check('马科固定剧情（封锁消息继续查）', body.includes('我会先派人封锁消息。下一步，我们得沿着他们留下的路线继续查。'))
  const goldAfter = await readGold()
  check('提交《北门失联》金币 +30', goldBefore !== null && goldAfter === goldBefore + 30, `金币 ${goldBefore}→${goldAfter}`)

  // 8. 不能重复奖励；任务完成后旧调查按钮消失
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
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('武馆')
  await sleep(300)

  // 9. 保存 → 主菜单 → Continue → 状态保持；无 dead button
  await clickByText('保存游戏')
  await sleep(300)
  body = await bodyText()
  check('北门任务完成后保存成功（✓ 已保存）', body.includes('已保存'))
  const saveData = await page.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem('tianmeng_continent_save') || 'null')
    } catch {
      return null
    }
  })
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
  check('Continue 后北门任务已完成', body.includes('北门失联') && body.includes('已完成'))
  check('Continue 后马科剧情保持', body.includes('马科接过断裂的铜牌，脸色沉了下来。'))
  // 无 dead button：页面按钮集合精确检查
  const deadButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()))
  check('无「查看巡逻队留下的痕迹」残留按钮', !deadButtons.some((t) => t.includes('查看巡逻队留下的痕迹')))
  check('无「提交任务」残留按钮', !deadButtons.some((t) => t === '提交任务'))
} catch (err) {
  check('脚本执行无异常', false, err && err.message ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`)
process.exit(failed.length > 0 ? 1 : 0)
