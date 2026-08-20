// ============================================================================
// 《天梦大陆》Phase 1 收口 playthrough 验收脚本（TM-P1-030 第四部分）
// 运行：node qa/phase1-playthrough.mjs （需 dev server 已在 5199 端口运行）
// 环境变量：CHROME_PATH（默认系统 Chrome）、BASE_URL（默认 http://localhost:5199/）
//
// 路线（全程正式 UI / Store 入口推进，严禁开发者控制台/直接改 GameState/localStorage）：
//   1. 空存档 → 新游戏 → 创建角色（显式填写姓名 + 选择骑士 + 使用推荐配点）→ 青石村
//   2. 村长《村外异动》→ 村外草原战魔化兔 → 提交（金币 +20）
//   3. 铁匠《矿洞清理》→ 废弃矿洞战魔化鼠 → 提交（金币 +15）
//   4. 村长《草原狼影》→ 村外草原战魔化狼 → 提交（金币 +25，升级提示点「知道了」）
//   5. 村外草原 → 兔王巢穴战嘟嘟兔 → 获得《兔子的路径》×1 → 展开地图
//   6. 黄金兔子调查：铁匠打听 + 药师打听 → 村长汇报（《追寻黄金兔子王》in_progress/stage 0）
//   7. 支线《采药受阻》→ 村外草原查看采药区域 → 提交（金币 +10）
//   8. 支线《矿洞余患》→ 废弃矿洞战魔化鼠 → 提交（金币 +10）
//   9. 离村 → 天龙城 → 武馆马科接《商人王财的麻烦》→ 王财 → 询问黑石塔附近的遭遇
//  10. 黑石塔一层：骷髅士兵(Lv.3) → 骷髅队长(Lv.4)
//  11. 黑石塔二层：僵尸(Lv.4) → 黑法师(Lv.4) → 骷髅战士(Lv.5)（解锁三层）
//  12. 黑石塔三层：骷髅女妖(Lv.5) → 夔峒项链 ×1
//  13. 返回天龙城 → 交还王财 → 武馆马科提交 → 第一阶段完成
//  14. 保存 → 主菜单 → Continue → 状态保持；无 dead button；黄金兔子任务冻结
//
// 战斗稳定性：Math.random 隔离为 0.99（天然 20 暴击；击杀回合敌人不反击），
//   每场塔内战斗前经武馆休整保证 HP 满（跨塔不战败，参考 e2e.mjs P1-027 教训）。
// 复用 e2e.mjs 顶部的辅助函数与 P006~P030 各段交互文本（独立文件，不 import）。
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

// 点击包含指定文本的 label（用于职业 radio 选择）
const clickLabel = async (text) => {
  await page.evaluate((t) => {
    const labels = [...document.querySelectorAll('label')]
    const target = labels.find((l) => l.textContent.includes(t))
    if (!target) throw new Error('未找到选项: ' + t)
    target.click()
  }, text)
  await sleep(250)
}

const bodyText = () => page.evaluate(() => document.body.textContent)

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


// TM-P1-031：continuity 占位符扫描——玩家正式流程 UI 不得出现任何开发占位/未定义/缺失文案
const PLACEHOLDER_MARKERS = ['待补充', '待开放', 'TODO', 'TBD', 'undefined', '未知任务', '未知物品', '缺失物品定义']
const assertNoPlaceholders = async (label) => {
  const t = await page.evaluate(() => document.body.textContent)
  const hit = PLACEHOLDER_MARKERS.filter((m) => t.includes(m))
  check(label, hit.length === 0, hit.length ? hit.join('、') : '')
}

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

// 点击第 index 个「交谈」按钮（青石村卡片顺序：村长0 / 铁匠1 / 药师2；天龙城/武馆仅 1 个 NPC）
const clickNthTalk = async (index) => {
  await page.evaluate((i) => {
    const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '交谈')
    const btn = btns[i]
    if (!btn) throw new Error('未找到第 ' + i + ' 个交谈按钮')
    btn.click()
  }, index)
  await sleep(250)
}

// 多敌人卡片精准定位：按敌人名字找卡片并点击其「迎战」按钮（村外草原魔化兔+魔化狼并存时用）
const engageEnemy = async (enemyName) => {
  await page.evaluate((n) => {
    const nameEl = [...document.querySelectorAll('p')].find((p) => p.textContent.includes(n))
    if (!nameEl) throw new Error('未找到敌人卡片: ' + n)
    let card = nameEl
    while (card && card !== document.body) {
      if (card.tagName === 'DIV' && card.textContent.includes('迎战')) {
        const btn = [...card.querySelectorAll('button')].find((b) => b.textContent.includes('迎战'))
        if (!btn) throw new Error('卡片内未找到迎战按钮: ' + n)
        btn.click()
        return
      }
      card = card.parentElement
    }
    throw new Error('未找到迎战按钮: ' + n)
  }, enemyName)
  await sleep(300)
}

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

// 战斗循环：已点击「迎战」进入战斗页后调用。
// Math.random 隔离为 0.99（天然 20 暴击；击杀回合敌人不反击），打完恢复原函数（e2e P008-R1/P025 同模式）。
// 循环点「普通攻击」直到出现「返回冒险」（战斗有结局）。
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

// 从任意黑石塔层/武馆逐级下到天龙城
const goDownToCity = async () => {
  for (let i = 0; i < 6; i += 1) {
    const loc = await readLocationId()
    if (loc === 'tianlong_city') return true
    if (loc === 'tianlong_martial_hall') await clickByText('天龙城')
    else if (loc === 'black_stone_tower_floor3') await clickByText('黑石塔二层')
    else if (loc === 'black_stone_tower_floor2') await clickByText('黑石塔一层')
    else if (loc === 'black_stone_tower_floor1') await clickByText('天龙城')
    else await sleep(300)
  }
  return (await readLocationId()) === 'tianlong_city'
}

// 武馆休整：回天龙城 → 武馆 → 休整（HP/MP 恢复满）→ 回天龙城。
// 跨塔战斗前必调，保证 HP 满（参考 e2e P1-027 的「HP0 无法战斗」教训）。
const restAtMartialHall = async () => {
  await goDownToCity()
  await clickByText('武馆')
  await sleep(300)
  let body = await bodyText()
  check('武馆休整入口存在', body.includes('武馆休整'))
  const hp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  if (hp && Number(hp[1]) < Number(hp[2])) {
    check('休整按钮可用', (await buttonDisabled('休整')) === false)
    await clickByText('休整')
    await sleep(300)
    body = await bodyText()
    const after = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
    check('休整后 HP/MP 满', after !== null && after[1] === after[2], `HP ${after?.[1]}/${after?.[2]}`)
  } else {
    check('休整后 HP 满（无需休整）', true)
  }
  await clickByText('天龙城')
  await sleep(300)
}

// ---------------- 主流程 ----------------
try {
  let body

  // 0. 清空存档：从空存档开始（必须无 localStorage 残留）
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await clearAllSaves()
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  body = await bodyText()
  check('清空存档后主菜单显示「天梦大陆」', body.includes('天梦大陆'))
  check('空存档时「继续游戏」禁用', (await continueDisabled()) === true)

  // 1. 新游戏 → 创建角色（TM-P2-001 A：显式填写姓名 + 显式选择骑士 + 使用职业推荐配点，不再依赖默认角色）→ 青石村
  await clickByText('新游戏')
  body = await bodyText()
  check('进入角色创建页', body.includes('创建角色'))
  check('初始姓名为空（无默认石头城）', !body.includes('石头城'))
  check('初始无职业选择（未选择职业）', body.includes('未选择职业'))
  check('初始剩余属性点 14 / 14', body.includes('14 / 14'))
  check('初始确认按钮禁用', (await buttonDisabled('确认进入天梦大陆')) === true)
  // 显式填写姓名
  await page.type('input[placeholder="输入角色姓名"]', '石敢当')
  // 显式选择骑士
  await clickLabel('骑士')
  await sleep(200)
  body = await bodyText()
  check('选择骑士后显示推荐配点按钮', body.includes('使用职业推荐配点'))
  await clickByText('使用职业推荐配点')
  await sleep(200)
  body = await bodyText()
  check('推荐配点后剩余属性点 0 / 14', body.includes('0 / 14'))
  check('姓名+职业+属性齐全后确认按钮可用', (await buttonDisabled('确认进入天梦大陆')) === false)
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('创建完成进入游戏页（冒险日志）', body.includes('冒险日志'))
  check('进入青石村（qingshi_village）', body.includes('qingshi_village'))
  check('初始金币 50', (await readGold()) === 50, `金币=${await readGold()}`)

  // 2. 村长《村外异动》：接受 → 村外草原战魔化兔 → 提交（金币 +20）
  check('村长似乎有事相托', body.includes('村长似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('《村外异动》可接受（发布者村长）', body.includes('村外异动') && body.includes('可接受') && body.includes('发布者：村长'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('《村外异动》进行中', body.includes('村外异动') && body.includes('进行中'))
  await clickByText('村外草原')
  await sleep(300)
  body = await bodyText()
  check('村外草原显示魔化兔（迎战）', body.includes('魔化兔') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('魔化兔', 1)
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()
  check('《村外异动》可完成', body.includes('村外异动') && body.includes('可完成'))
  const goldB1 = await readGold()
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('《村外异动》已完成', body.includes('村外异动') && body.includes('已完成'))
  const goldA1 = await readGold()
  check('提交《村外异动》金币 +20', goldB1 !== null && goldA1 === goldB1 + 20, `金币 ${goldB1}→${goldA1}`)

  // 3. 铁匠《矿洞清理》：接受 → 废弃矿洞战魔化鼠 → 提交（金币 +15）
  check('铁匠似乎有事相托', body.includes('铁匠似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('《矿洞清理》可接受（发布者铁匠）', body.includes('矿洞清理') && body.includes('可接受') && body.includes('发布者：铁匠'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('《矿洞清理》进行中', body.includes('矿洞清理') && body.includes('进行中'))
  await clickByText('废弃矿洞')
  await sleep(300)
  body = await bodyText()
  check('废弃矿洞显示魔化鼠（迎战）', body.includes('魔化鼠') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('魔化鼠', 1)
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()
  check('《矿洞清理》可完成', body.includes('矿洞清理') && body.includes('可完成'))
  const goldB2 = await readGold()
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('《矿洞清理》已完成', body.includes('矿洞清理') && body.includes('已完成'))
  const goldA2 = await readGold()
  check('提交《矿洞清理》金币 +15', goldB2 !== null && goldA2 === goldB2 + 15, `金币 ${goldB2}→${goldA2}`)

  // 4. 村长《草原狼影》：接受 → 村外草原战魔化狼 → 提交（金币 +25，升级提示点「知道了」）
  check('村长似乎有事相托（草原狼影入口）', body.includes('村长似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('《草原狼影》可接受（发布者村长）', body.includes('草原狼影') && body.includes('可接受') && body.includes('发布者：村长'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('《草原狼影》进行中', body.includes('草原狼影') && body.includes('进行中'))
  await clickByText('村外草原')
  await sleep(300)
  body = await bodyText()
  check('村外草原出现魔化狼', body.includes('魔化狼') && body.includes('迎战'))
  await engageEnemy('魔化狼')
  await combatLoop('魔化狼', 2)
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()
  check('《草原狼影》可完成', body.includes('草原狼影') && body.includes('可完成'))
  const goldB3 = await readGold()
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('《草原狼影》已完成', body.includes('草原狼影') && body.includes('已完成'))
  const goldA3 = await readGold()
  check('提交《草原狼影》金币 +25', goldB3 !== null && goldA3 === goldB3 + 25, `金币 ${goldB3}→${goldA3}`)
  check('升级提示出现（Lv.2）', body.includes('等级提升！') && body.includes('Lv.2'))
  await clickByText('知道了')
  await sleep(300)

  // 5. 村外草原 → 兔王巢穴战嘟嘟兔 → 获得《兔子的路径》×1 → 展开地图
  await clickByText('村外草原')
  await sleep(300)
  await clickByText('兔王巢穴')
  await sleep(300)
  body = await bodyText()
  check('进入兔王巢穴（rabbit_lair）', body.includes('兔王巢穴') && body.includes('魔化兔群的巢穴'))
  check('嘟嘟兔可迎战（HP 24 · 护甲 13）', body.includes('嘟嘟兔') && body.includes('HP 24') && body.includes('护甲 13') && body.includes('迎战'))
  check('Boss 战前背包无兔子的路径', !body.includes('兔子的路径 ×'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('嘟嘟兔', 3)
  body = await bodyText()
  check('击败嘟嘟兔获得《兔子的路径》×1', body.includes('兔子的路径 ×1'))
  check('展开地图按钮可用', (await buttonDisabled('展开地图')) === false)
  await clickByText('展开地图')
  await sleep(300)
  body = await bodyText()
  check('地图已查看（指向黄金兔子王）', body.includes('地图上的路线最终指向黄金兔子王所在之地。') && body.includes('地图上的标记仍无法对应到任何已知地点。'))
  check('地图仍保留（兔子的路径 ×1）', body.includes('兔子的路径 ×1'))

  // 6. 黄金兔子调查：铁匠打听 + 药师打听 → 村长汇报（《追寻黄金兔子王》in_progress）
  await clickByText('村外草原')
  await sleep(300)
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()
  // 6a. 向村长展示《兔子的路径》（展示后冒险页出现「青石村阶段完成」面板，P1-016-F）
  await clickNthTalk(0)
  body = await bodyText()
  check('村长对话显示展示地图入口', body.includes('向村长展示《兔子的路径》'))
  await clickByText('向村长展示《兔子的路径》')
  await sleep(300)
  body = await bodyText()
  check('已向村长展示地图', body.includes('你已经把《兔子的路径》展示给村长。'))
  await clickByText('结束交谈')
  await sleep(200)
  body = await bodyText()
  check('青石村阶段完成面板出现', body.includes('青石村阶段完成'))
  await assertNoPlaceholders('continuity：青石村阶段完成无占位符')
  // 6b. 接受《追寻黄金兔子王》
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('《追寻黄金兔子王》可接受', body.includes('追寻黄金兔子王') && body.includes('可接受'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('《追寻黄金兔子王》进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  // 6c. 铁匠打听
  await clickNthTalk(1)
  body = await bodyText()
  check('铁匠打听入口（向铁匠打听地图）', body.includes('向铁匠打听地图'))
  await clickByText('向铁匠打听地图')
  await sleep(300)
  body = await bodyText()
  check('铁匠固定回复', body.includes('铁匠看了看地图，摇了摇头：“这上面的路线，我认不出来。”'))
  await clickByText('结束交谈')
  await sleep(200)
  body = await bodyText()
  check('地图线索调查 1 / 2', body.includes('地图线索调查：1 / 2'))
  // 6d. 药师打听
  await clickNthTalk(2)
  body = await bodyText()
  check('药师打听入口（向药师打听地图）', body.includes('向药师打听地图'))
  await clickByText('向药师打听地图')
  await sleep(300)
  body = await bodyText()
  check('药师固定回复', body.includes('药师仔细辨认了一会儿：“我也没见过这处标记。”'))
  await clickByText('结束交谈')
  await sleep(200)
  body = await bodyText()
  check('地图线索调查 2 / 2', body.includes('地图线索调查：2 / 2'))
  // 6e. 村长汇报调查结果
  await clickNthTalk(0)
  body = await bodyText()
  check('村长汇报入口（向村长汇报调查结果）', body.includes('向村长汇报调查结果'))
  await clickByText('向村长汇报调查结果')
  await sleep(300)
  body = await bodyText()
  check('已向村长汇报调查结果', body.includes('你已经把调查结果告诉了村长。') && body.includes('村内调查已汇报。'))
  await clickByText('结束交谈')
  await sleep(200)
  body = await bodyText()
  check('《追寻黄金兔子王》仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  // 6f. 返回兔王巢穴复查《兔子的路径》（P1-020；离村前置 rabbit_lair_rechecked 的正式入口）
  await clickByText('村外草原')
  await sleep(300)
  await clickByText('兔王巢穴')
  await sleep(300)
  body = await bodyText()
  check('巢穴复查入口（重新比对地图）', (await buttonDisabled('重新比对地图')) === false)
  await clickByText('重新比对地图')
  await sleep(300)
  body = await bodyText()
  check('巢穴复查完成（仍进行中）', body.includes('巢穴复查完成。') && body.includes('追寻黄金兔子王') && body.includes('进行中'))
  await clickByText('村外草原')
  await sleep(300)
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()

  // 7. 支线《采药受阻》：接受 → 村外草原查看采药区域 → 提交（金币 +10）
  check('药师似乎有事相托', body.includes('药师似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('《采药受阻》可接受（发布者药师）', body.includes('采药受阻') && body.includes('可接受') && body.includes('发布者：药师'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('《采药受阻》进行中', body.includes('采药受阻') && body.includes('进行中'))
  await clickByText('村外草原')
  await sleep(300)
  body = await bodyText()
  check('草原显示查看采药区域按钮', (await buttonDisabled('查看采药区域')) === false)
  await clickByText('查看采药区域')
  await sleep(300)
  body = await bodyText()
  check('采药区域已查看（可完成）', body.includes('采药区域已查看。') && body.includes('采药受阻') && body.includes('可完成'))
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()
  const goldB4 = await readGold()
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('《采药受阻》已完成', body.includes('采药受阻') && body.includes('已完成'))
  const goldA4 = await readGold()
  check('提交《采药受阻》金币 +10', goldB4 !== null && goldA4 === goldB4 + 10, `金币 ${goldB4}→${goldA4}`)

  // 8. 支线《矿洞余患》：接受 → 废弃矿洞战魔化鼠 → 提交（金币 +10）
  check('铁匠似乎有事相托（矿洞余患入口）', body.includes('铁匠似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('《矿洞余患》可接受（发布者铁匠）', body.includes('矿洞余患') && body.includes('可接受') && body.includes('发布者：铁匠'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('《矿洞余患》进行中', body.includes('矿洞余患') && body.includes('进行中'))
  await clickByText('废弃矿洞')
  await sleep(300)
  body = await bodyText()
  check('废弃矿洞魔化鼠可迎战', body.includes('魔化鼠') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('魔化鼠', 1)
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()
  check('《矿洞余患》可完成', body.includes('矿洞余患') && body.includes('可完成'))
  const goldB5 = await readGold()
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('《矿洞余患》已完成', body.includes('矿洞余患') && body.includes('已完成'))
  const goldA5 = await readGold()
  check('提交《矿洞余患》金币 +10', goldB5 !== null && goldA5 === goldB5 + 10, `金币 ${goldB5}→${goldA5}`)

  // 9. 离开青石村 → 天龙城（departQingshiVillageToTianlongCity 的正式 UI 入口）
  check('离村入口（新的旅程/准备前往天龙城）', body.includes('新的旅程') && body.includes('准备前往天龙城'))
  await clickByText('准备前往天龙城')
  await sleep(200)
  body = await bodyText()
  check('二次确认（离开后无法返回）', body.includes('离开青石村后将无法返回。'))
  await clickByText('前往天龙城')
  await sleep(300)
  body = await bodyText()
  check('到达天龙城（tianlong_city）', body.includes('tianlong_city') && body.includes('天龙王朝的皇城'))
  await assertNoPlaceholders('continuity：天龙城无占位符')
  check('离村后《追寻黄金兔子王》仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('离村后兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  check('离村后无返回青石村按钮', !body.includes('返回青石村'))

  // 10. 武馆马科接《商人王财的麻烦》→ 天龙城找王财 → 询问黑石塔附近的遭遇（wangcai_briefed）
  await clickByText('武馆')
  await sleep(300)
  body = await bodyText()
  check('到达武馆（马科 · 骑士队长）', body.includes('武馆') && body.includes('马科') && body.includes('骑士队长'))
  check('马科似乎有事相托', body.includes('马科似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('《商人王财的麻烦》可接受（发布者马科）', body.includes('商人王财的麻烦') && body.includes('可接受') && body.includes('发布者：马科'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('《商人王财的麻烦》进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  // TM-P1-031-R1：接受任务后马科 greeting = 调查中台词，不再「刚到天龙城？」
  await clickByText('交谈')
  await sleep(300)
  body = await bodyText()
  check('马科接受任务后 greeting（调查中）', body.includes('王财的事情有进展了吗？黑石塔那边不要大意。'))
  check('接受任务后不出现「刚到天龙城？」', !body.includes('刚到天龙城'))
  await clickByText('结束交谈')
  await sleep(200)
  await clickByText('天龙城')
  await sleep(300)
  body = await bodyText()
  check('天龙城附近人物王财（商人）', body.includes('王财') && body.includes('商人'))
  check('未解锁时黑石塔一层按钮禁用', (await buttonDisabled('黑石塔一层')) === true)
  await clickByText('交谈')
  await sleep(300)
  body = await bodyText()
  check('询问黑石塔附近的遭遇按钮可用', (await buttonDisabled('询问黑石塔附近的遭遇')) === false)
  await clickByText('询问黑石塔附近的遭遇')
  await sleep(300)
  body = await bodyText()
  check('王财说明夔峒项链遭遇', body.includes('王财告诉你，几天前他在黑石塔附近遭到魔物袭击，混乱中遗失了妻子的夔峒项链。'))
  await clickByText('结束交谈')
  await sleep(200)
  body = await bodyText()
  check('日志已向王财了解情况（wangcai_briefed）', body.includes('已向王财了解情况。') && body.includes('黑石塔的调查尚未开始。'))

  // 11. 黑石塔一层：动身调查 → 骷髅士兵 → 休整 → 骷髅队长
  await restAtMartialHall() // 进塔前满血
  body = await bodyText()
  check('黑石塔调查入口（动身调查黑石塔）', body.includes('动身调查黑石塔'))
  await clickByText('动身调查黑石塔')
  await sleep(300)
  body = await bodyText()
  check('黑石塔路线已确认，一层按钮启用', body.includes('黑石塔路线已确认。') && (await buttonDisabled('黑石塔一层')) === false)
  await clickByText('黑石塔一层')
  await sleep(300)
  body = await bodyText()
  check('到达黑石塔一层（black_stone_tower_floor1）', (await readLocationId()) === 'black_stone_tower_floor1')
  check('一层骷髅士兵 Lv.3 可迎战', body.includes('骷髅士兵') && body.includes('Lv.3') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('骷髅士兵', 3)
  body = await bodyText()
  check('骷髅士兵已击败（骷髅队长 Lv.4 出现）', body.includes('大厅中的骷髅士兵已经被击败。') && body.includes('骷髅队长') && body.includes('Lv.4') && body.includes('迎战'))
  check('士兵击败后无骷髅士兵威胁卡', !body.includes('骷髅士兵 · Lv.3'))
  // 休整后战骷髅队长
  await restAtMartialHall()
  await clickByText('黑石塔一层')
  await sleep(300)
  body = await bodyText()
  check('骷髅队长 Lv.4 可迎战', body.includes('骷髅队长') && body.includes('Lv.4') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('骷髅队长', 4)
  body = await bodyText()
  check('骷髅队长已击败（未发现项链）', body.includes('骷髅队长已经倒下。') && body.includes('你检查了骷髅队长与周围，没有发现夔峒项链。') && body.includes('黑石塔上层尚未开启。'))

  // 12. 黑石塔二层：僵尸 → 黑法师 → 骷髅战士（解锁三层）
  await restAtMartialHall()
  await clickByText('黑石塔一层')
  await sleep(300)
  body = await bodyText()
  check('未解锁时二层按钮禁用', (await buttonDisabled('黑石塔二层')) === true)
  check('深入黑石塔二层入口存在', body.includes('深入黑石塔二层'))
  await clickByText('深入黑石塔二层')
  await sleep(300)
  body = await bodyText()
  check('解锁后二层按钮启用', (await buttonDisabled('黑石塔二层')) === false)
  await clickByText('黑石塔二层')
  await sleep(300)
  body = await bodyText()
  check('到达黑石塔二层（僵尸 Lv.4）', (await readLocationId()) === 'black_stone_tower_floor2' && body.includes('僵尸') && body.includes('Lv.4') && body.includes('迎战'))
  check('二层只出现僵尸（无黑法师）', !body.includes('黑法师 · Lv.4'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('僵尸', 4)
  body = await bodyText()
  check('僵尸已击败（黑法师 Lv.4 出现）', !body.includes('僵尸 · Lv.4') && body.includes('黑法师') && body.includes('Lv.4') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('黑法师', 4)
  body = await bodyText()
  check('黑法师已击败（骷髅战士 Lv.5 出现）', !body.includes('黑法师 · Lv.4') && body.includes('骷髅战士') && body.includes('Lv.5') && body.includes('迎战'))
  check('二层前段清场剧情', body.includes('二层前段的僵尸与黑法师已经被清理。'))
  // 休整后战骷髅战士
  await restAtMartialHall()
  await clickByText('黑石塔一层')
  await sleep(300)
  await clickByText('黑石塔二层')
  await sleep(300)
  body = await bodyText()
  check('骷髅战士 Lv.5 可迎战', body.includes('骷髅战士') && body.includes('Lv.5') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('骷髅战士', 5)
  body = await bodyText()
  check('骷髅战士已击败（继续向上入口出现）', body.includes('小厅中的骷髅战士已经倒下。') && body.includes('你仔细搜索了周围，依然没有发现王财遗失的夔峒项链。') && body.includes('继续向上'))

  // 13. 黑石塔三层：继续向上 → 骷髅女妖 → 夔峒项链 ×1
  await restAtMartialHall()
  await clickByText('黑石塔一层')
  await sleep(300)
  await clickByText('黑石塔二层')
  await sleep(300)
  body = await bodyText()
  check('未解锁时三层按钮禁用', (await buttonDisabled('黑石塔三层')) === true)
  check('继续向上入口存在', body.includes('继续向上'))
  await clickByText('继续向上')
  await sleep(300)
  body = await bodyText()
  check('解锁后三层按钮启用', (await buttonDisabled('黑石塔三层')) === false)
  await clickByText('黑石塔三层')
  await sleep(300)
  body = await bodyText()
  check('到达黑石塔三层（骷髅女妖 Lv.5）', (await readLocationId()) === 'black_stone_tower_floor3' && body.includes('骷髅女妖') && body.includes('Lv.5') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await combatLoop('骷髅女妖', 5)
  body = await bodyText()
  check('骷髅女妖已击败', body.includes('骷髅女妖倒在破碎的石柱之间。'))
  check('找到夔峒项链（×1 已获得）', body.includes('夔峒项链 ×1') && body.includes('夔峒项链 ×1 已获得。'))
  check('当前目标：返回天龙城交还王财', body.includes('当前目标：返回天龙城，将夔峒项链交还王财。'))
  await assertNoPlaceholders('continuity：黑石塔三层女妖击败后无占位符')

  // 14. 返回天龙城 → 王财交还项链 → 武馆马科提交（第一阶段完成）
  await clickByText('黑石塔二层')
  await sleep(250)
  await clickByText('黑石塔一层')
  await sleep(250)
  await clickByText('天龙城')
  await sleep(300)
  body = await bodyText()
  check('回到天龙城（tianlong_city）', (await readLocationId()) === 'tianlong_city')
  check('背包持有夔峒项链 ×1', body.includes('夔峒项链 ×1'))
  await clickByText('交谈')
  await sleep(300)
  body = await bodyText()
  check('将夔峒项链交还王财按钮可用', (await buttonDisabled('将夔峒项链交还王财')) === false)
  await clickByText('将夔峒项链交还王财')
  await sleep(300)
  body = await bodyText()
  check('王财接过项链（固定剧情）', body.includes('王财接过项链，久久没有说话。') && body.includes('“谢谢你。若不是你，我恐怕再也找不回来了。”'))
  check('交还后背包不再有夔峒项链', !body.includes('夔峒项链 ×'))
  await clickByText('结束交谈')
  await sleep(200)
  body = await bodyText()
  check('日志：夔峒项链已交还王财', body.includes('夔峒项链：已交还王财。') && body.includes('当前目标：返回武馆，向马科复命。'))
  // 武馆向马科提交（复用 generic 提交）
  await clickByText('武馆')
  await sleep(300)
  body = await bodyText()
  check('到达武馆（马科）', body.includes('武馆') && body.includes('马科'))
  await clickByText('交谈')
  await sleep(300)
  body = await bodyText()
  check('提交任务按钮可用', (await buttonDisabled('提交任务')) === false)
  // TM-P1-031-R1：交还项链、提交前马科 greeting = 复命台词，不再「刚到天龙城？」
  check('马科复命 greeting（可提交）', body.includes('王财那边已经处理好了？把黑石塔里的情况告诉我。'))
  check('复命时不再出现「刚到天龙城？」', !body.includes('刚到天龙城'))
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()

  // ---- 最终断言（提交后，马科对话面板 + 任务日志）----
  // TM-P1-031-R1：提交后马科 greeting = 完成台词
  check('马科完成后 greeting', body.includes('黑石塔的情况我已经记下了。你先休整一下。'))
  check('显示「第一阶段完成」', body.includes('第一阶段完成'))
  check('显示「第一阶段主线已经告一段落。」', body.includes('第一阶段主线已经告一段落。'))
  check('显示「《追寻黄金兔子王》仍需等待新的线索。」', body.includes('《追寻黄金兔子王》仍需等待新的线索。'))
  check('quest_wangcai_trouble 已完成（任务卡显示已完成）', body.includes('商人王财的麻烦') && body.includes('已完成'))
  check('《追寻黄金兔子王》仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('兔子的路径 ×1 仍在背包', body.includes('兔子的路径 ×1'))
  check('背包无夔峒项链', !body.includes('夔峒项链 ×'))
  await assertNoPlaceholders('continuity：第一阶段完成后无占位符')
  // 单当前目标：完成后不再出现旧目标/矛盾目标（找项链/交还/去黑石塔/提交均不得残留）
  check('完成后无「交还王财」目标残留', !body.includes('将夔峒项链交还王财'))
  check('完成后无「返回武馆向马科复命」目标残留', !body.includes('当前目标：返回武馆，向马科复命。'))
  await clickByText('结束交谈')
  await sleep(200)
  body = await bodyText()

  // ---- 保存 → 读存档校验（只读，不修改任何状态）→ 主菜单 → Continue ----
  check('提交后冒险页仍显示第一阶段完成', body.includes('第一阶段完成') && body.includes('第一阶段主线已经告一段落。'))
  await saveToSlot1()
  await sleep(300)
  body = await bodyText()
  check('保存后返回游戏页（当前位置）', body.includes('当前位置'))
  const saveData = await readSlot1Save()
  const qWangcai = saveData?.gameState?.quests?.find((q) => q.questId === 'quest_wangcai_trouble')
  const qGolden = saveData?.gameState?.quests?.find((q) => q.questId === 'quest_golden_rabbit_search')
  const inv = saveData?.gameState?.inventory ?? []
  check('存档：quest_wangcai_trouble = completed', qWangcai?.status === 'completed')
  check('存档：追寻黄金兔子王 in_progress（冻结）', qGolden?.status === 'in_progress')
  check('存档：追寻黄金兔子王 stage 0（冻结）', qGolden?.stage === 0)
  check(
    '存档：黄金兔子调查 flags 保持（asked/汇报/复查）',
    qGolden?.flags?.asked_blacksmith === true &&
      qGolden?.flags?.asked_apothecary === true &&
      qGolden?.flags?.village_inquiry_reported === true &&
      qGolden?.flags?.rabbit_lair_rechecked === true,
  )
  check('存档：背包无夔峒项链', !inv.some((e) => e.itemId === 'kuidong_necklace'))
  check('存档：兔子的路径 ×1', inv.some((e) => e.itemId === 'rabbit_path' && e.quantity === 1))
  await clickByText('返回主菜单')
  await sleep(300)
  body = await bodyText()
  check('返回主菜单成功', body.includes('天梦大陆'))
  check('有存档时「继续游戏」可用', (await continueDisabled()) === false)
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('Continue 后仍显示「第一阶段完成」', body.includes('第一阶段完成') && body.includes('第一阶段主线已经告一段落。') && body.includes('《追寻黄金兔子王》仍需等待新的线索。'))
  check('Continue 后王财任务已完成', body.includes('商人王财的麻烦') && body.includes('已完成'))
  check('Continue 后黄金兔子王仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('Continue 后兔子的路径 ×1 保持', body.includes('兔子的路径 ×1'))
  check('Continue 后背包无夔峒项链', !body.includes('夔峒项链 ×'))
  // 无 dead button：页面按钮集合精确检查
  const deadButtons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()))
  check('无「将夔峒项链交还王财」残留按钮', !deadButtons.some((t) => t.includes('交还王财')))
  check('无「提交任务」残留按钮', !deadButtons.some((t) => t === '提交任务'))
  check('无「动身调查黑石塔」残留按钮', !deadButtons.some((t) => t.includes('动身调查黑石塔')))
  check('无「深入黑石塔二层」残留按钮', !deadButtons.some((t) => t.includes('深入黑石塔二层')))
  check('无「继续向上」残留按钮', !deadButtons.some((t) => t === '继续向上'))
} catch (err) {
  check('脚本执行无异常', false, err && err.message ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`)
process.exit(failed.length > 0 ? 1 : 0)
