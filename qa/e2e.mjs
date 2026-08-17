// E2E QA 脚本：验证 TM-P0-001~003 验收与 TM-P0-004 角色创建流程
// 运行：node qa/e2e.mjs （需 dev server 已在 5199 端口运行）
// 环境变量：CHROME_PATH（默认系统 Chrome）、BASE_URL（默认 http://localhost:5199/）
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

const clickByText = async (text) => {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('未找到按钮: ' + t)
    btn.click()
  }, text)
  await sleep(250)
}

// 点击包含指定文本的 label（用于性别/职业 radio 选择）
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

// 解析战斗页玩家/敌人 HP（玩家：生命 X / Y；敌人：HP X / Y）
const readHps = (body) => {
  const playerMatch = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const enemyMatch = body.match(/HP\s*(\d+)\s*\/\s*(\d+)/)
  return { player: playerMatch ? Number(playerMatch[1]) : null, enemy: enemyMatch ? Number(enemyMatch[1]) : null }
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

try {
  // B.1 主菜单
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(500)
  let body = await bodyText()
  check('主菜单显示「天梦大陆」', body.includes('天梦大陆'))
  check('主菜单显示「新游戏」', body.includes('新游戏'))
  check('无存档时「继续游戏」禁用', (await continueDisabled()) === true)

  // B.2 点击新游戏 → 角色创建页（TM-P0-004）
  await clickByText('新游戏')
  body = await bodyText()
  check('P004: 点击新游戏进入角色创建页', body.includes('创建角色'))
  check('P004: 创建页显示五项属性', ['力量', '体质', '敏捷', '冥想', '幸运'].every((t) => body.includes(t)))
  check('P004-R1: 默认剩余属性点为 0 / 14', body.includes('0 / 14'))
  check('P004: 默认姓名为石头城', body.includes('石头城'))
  check('P004: 默认职业为骑士', body.includes('骑士'))
  await page.screenshot({ path: 'qa/creation-page.png' })

  // P004-R1：属性点预算交互（默认 0/14 → 降 1 点 → 1/14 → 加回 → 0/14）
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '降低力量')
    if (!btn) throw new Error('未找到降低力量按钮')
    btn.click()
  })
  await sleep(200)
  body = await bodyText()
  check('P004-R1: 降低力量 1 点后剩余属性点 1 / 14', body.includes('1 / 14'))
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '提高力量')
    if (!btn) throw new Error('未找到提高力量按钮')
    btn.click()
  })
  await sleep(200)
  body = await bodyText()
  check('P004-R1: 加回后剩余属性点恢复 0 / 14', body.includes('0 / 14'))

  // 修改姓名与职业
  await page.focus('input[placeholder="输入角色姓名"]')
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.type('input[placeholder="输入角色姓名"]', '云岚')
  await clickLabel('法师')
  await sleep(200)
  body = await bodyText()
  check('P004: 摘要显示新姓名云岚与新职业法师', body.includes('云岚') && body.includes('法师'))

  // 确认创建 → 游戏页
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P004: 确认创建进入游戏页面（冒险日志）', body.includes('冒险日志'))
  check('P004: 游戏页显示新角色「云岚」', body.includes('云岚'))
  check('P004: 游戏页显示所选职业「法师」', body.includes('法师'))
  check('游戏页显示当前位置「青石村」', body.includes('qingshi_village'))
  check('游戏页显示金币 50', body.includes('50'))
  await page.screenshot({ path: 'qa/game-page.png' })

  // P006：任务流程 —— 发现与接受《村外异动》
  body = await bodyText()
  check('P006: 青石村显示村长似乎有事相托', body.includes('村长似乎有事相托'))
  await clickByText('查看委托')
  body = await bodyText()
  check('P006: 查看委托后任务日志显示村外异动（可接受）', body.includes('村外异动') && body.includes('可接受'))
  check('P006: 委托详情来自注册表（发布者村长）', body.includes('发布者：村长'))
  await clickByText('接受任务')
  body = await bodyText()
  check('P006: 接受任务后任务日志显示进行中', body.includes('进行中'))

  // P005：流程 A —— 基本移动
  await clickByText('村外草原')
  body = await bodyText()
  check('P005-A: 移动至村外草原（显示描述）', body.includes('村外草原') && body.includes('风吹草低'))
  check('P006: 移动后任务日志仍显示村外异动/进行中', body.includes('村外异动') && body.includes('进行中'))
  await clickByText('青石村')
  body = await bodyText()
  check('P005-A: 返回青石村（显示描述）', body.includes('青石村') && body.includes('群山环抱'))
  await clickByText('废弃矿洞')
  body = await bodyText()
  check('P005-A: 移动至废弃矿洞（显示描述）', body.includes('废弃矿洞') && body.includes('洞口杂草丛生'))
  await clickByText('青石村')
  body = await bodyText()
  check('P005-A: 回到青石村', body.includes('青石村'))

  // P005：流程 D —— 存档恢复位置（青石村 → 村外草原 → 保存 → Continue → 仍村外草原）
  await clickByText('村外草原')
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P005-D: 保存并继续游戏后仍处于村外草原', body.includes('村外草原') && body.includes('风吹草低'))
  check('P006: 存档恢复后任务仍为村外异动/进行中', body.includes('村外异动') && body.includes('进行中'))

  // P005：流程 B —— 兔王巢穴锁定
  check('P005-B: 兔王巢穴按钮可见', body.includes('兔王巢穴'))
  check('P005-B: 未解锁时兔王巢穴按钮禁用', (await buttonDisabled('兔王巢穴')) === true)
  check('P005-B: 显示尚未找到进入此地的方法', body.includes('尚未找到进入此地的方法'))

  // P005：流程 C —— 开发者控制台解锁+标记可完成（保存存档，Continue 读档才保留）→ 进入兔王巢穴
  await clickByText('返回主菜单')
  await clickByText('开发者控制台')
  await clickByText('解锁兔王巢穴')
  await clickByText('标记可完成') // P006：开发者控制台标记任务可完成
  await clickByText('保存存档')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P005-C: 解锁后读档仍在村外草原', body.includes('村外草原'))
  check('P006: 标记可完成后任务日志显示可完成', body.includes('可完成'))
  check('P005-C: 解锁后兔王巢穴按钮启用', (await buttonDisabled('兔王巢穴')) === false)
  await clickByText('兔王巢穴')
  body = await bodyText()
  check('P005-C: 进入兔王巢穴（显示描述）', body.includes('兔王巢穴') && body.includes('魔化兔群的巢穴'))
  check('P005-C: 兔王巢穴可返回村外草原', body.includes('村外草原'))
  // 回到青石村，保证后续切换测试地点逻辑（qingshi_village → misty_ruins）正确
  await clickByText('村外草原')
  await clickByText('青石村')
  body = await bodyText()

  // P006：可完成提交 —— 在给予者所在地显示提交任务，完成后无奖励
  check('P006: 回到青石村后任务显示可完成', body.includes('可完成'))
  await clickByText('提交任务')
  body = await bodyText()
  check('P006: 提交任务后任务日志显示已完成', body.includes('已完成'))
  check('P006: 完成任务金币不变（仍 50）', body.includes('50'))

  // P008：战斗 —— 村外草原迎战魔化兔
  await clickByText('村外草原')
  body = await bodyText()
  check('P008: 村外草原显示附近威胁（魔化兔）', body.includes('魔化兔') && body.includes('迎战'))
  check('P008: 威胁信息含 HP 8 · 防御 11', body.includes('HP 8 · 防御 11'))
  await clickByText('迎战')
  body = await bodyText()
  check('P008: 进入战斗页', body.includes('战斗'))
  check('P008: 战斗页显示玩家与魔化兔', body.includes('云岚') && body.includes('魔化兔'))
  check('P008: 敌人初始 HP 8 / 8', body.includes('8 / 8'))
  check('P008: 普通攻击按钮存在', body.includes('普通攻击'))

  // 循环普通攻击直到胜负（最多 100 轮），断言 HP 单调不增且不小于 0
  let combatOver = false
  for (let i = 0; i < 100 && !combatOver; i++) {
    body = await bodyText()
    const before = readHps(body)
    await clickByText('普通攻击')
    await sleep(150)
    body = await bodyText()
    const after = readHps(body)
    check(
      `P008: 第${i + 1}轮攻击后 HP 不增且非负`,
      after.enemy !== null &&
        after.player !== null &&
        after.enemy <= before.enemy &&
        after.player <= before.player &&
        after.enemy >= 0 &&
        after.player >= 0,
      `敌 ${before.enemy}→${after.enemy} 玩 ${before.player}→${after.player}`,
    )
    if (body.includes('战斗胜利') || body.includes('战斗失败')) combatOver = true
  }
  body = await bodyText()
  check('P008: 战斗有明确结局（胜利或失败）', body.includes('战斗胜利') || body.includes('战斗失败'))

  // 结局处理：胜利返回冒险；失败返回主菜单后 Continue 恢复（读 P005-C 存档）
  if (body.includes('战斗胜利')) {
    await clickByText('返回冒险')
    body = await bodyText()
    check('P008: 胜利后返回冒险（仍村外草原，HP 保留）', body.includes('村外草原'))
  } else {
    await clickByText('返回主菜单')
    await clickByText('继续游戏')
    body = await bodyText()
    check('P008: 失败后返回主菜单，Continue 可恢复', body.includes('村外草原'))
  }
  await clickByText('青石村')

  // P008-R1：固定 Math.random 让第一击天然 20（暴击 12 > 魔化兔 HP 8）→ 胜利且玩家 HP 完全不变（无反击）
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  const hpBeforeDeterministic = readHps(body)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.999 // floor(0.999 * 20) + 1 = 20
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P008-R1: 天然 20 第一击即战斗胜利', body.includes('战斗胜利'))
  const hpAfterDeterministic = readHps(body)
  check(
    'P008-R1: 致死攻击后玩家 HP 完全不变（敌人不反击）',
    hpAfterDeterministic.player === hpBeforeDeterministic.player && hpAfterDeterministic.player >= 0,
  )
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('青石村')

  // 回主菜单 → 开发者控制台
  await clickByText('返回主菜单')
  await clickByText('开发者控制台')
  body = await bodyText()
  check('进入开发者控制台', body.includes('开发者控制台') && body.includes('GameState'))

  const readState = () =>
    page.evaluate(() => JSON.parse(document.querySelector('pre').textContent))

  // D. 状态修改
  await clickByText('+10 金币')
  let state = await readState()
  check('+10 金币后 gold=60', state.player.gold === 60, `gold=${state.player.gold}`)

  await clickByText('-10 金币')
  state = await readState()
  check('-10 金币后 gold=50', state.player.gold === 50, `gold=${state.player.gold}`)

  await clickByText('获得测试物品')
  state = await readState()
  const hasTestItem = state.inventory.some((e) => e.itemId === 'test_artifact' && e.quantity === 1)
  check('获得测试物品后背包新增 test_artifact×1', hasTestItem)

  await clickByText('设置测试 Flag')
  state = await readState()
  check('设置测试 Flag 后 world.flags.test_flag=true', state.world.flags.test_flag === true)

  await clickByText('切换测试地点')
  state = await readState()
  check('切换测试地点为 misty_ruins', state.world.currentLocationId === 'misty_ruins', state.world.currentLocationId)
  await page.screenshot({ path: 'qa/dev-state.png' })

  // P003：D20 检定测试区（执行检定并显示完整计算过程与中文结果）
  await clickByText('执行检定')
  await sleep(400)
  body = await bodyText()
  check(
    'P003: D20 检定显示计算过程（D20/总值/DC/结果）',
    body.includes('D20：') && body.includes('总值：') && body.includes('DC：') && body.includes('结果：'),
  )
  check('P003: 检定结果显示中文结果（大成功/成功/失败/大失败）', /结果：(大成功|成功|失败|大失败)/.test(body))

  // P007：普通攻击规则测试区
  body = await bodyText()
  check('P007: 控制台显示普通攻击规则测试', body.includes('普通攻击规则测试'))
  check('P007: 敌人选择含四敌人（读注册表）', ['魔化兔', '魔化鼠', '魔化狼', '嘟嘟兔'].every((t) => body.includes(t)))
  state = await readState()
  const hpBeforePlayerAttack = state.player.hp
  await clickByText('玩家攻击敌人')
  await sleep(300)
  body = await bodyText()
  check(
    'P007: 玩家攻击显示完整计算过程',
    ['D20：', '攻击加值：', '总值：', '目标防御：', '是否命中：', '造成伤害：', '结果：'].every((t) =>
      body.includes(t),
    ),
  )
  check('P007: 玩家攻击中文结果（暴击/命中/未命中/大失败）', /结果：(暴击|命中|未命中|大失败)/.test(body))
  state = await readState()
  check('P007: 玩家攻击后 HP 未变', state.player.hp === hpBeforePlayerAttack && state.player.hp >= 0)
  const hpBeforeEnemyAttack = state.player.hp
  await clickByText('敌人攻击玩家')
  await sleep(300)
  body = await bodyText()
  check(
    'P007: 敌人攻击显示完整计算过程',
    ['D20：', '攻击加值：', '总值：', '目标防御：', '造成伤害：', '结果：'].every((t) => body.includes(t)),
  )
  check('P007: 敌人攻击中文结果', /结果：(暴击|命中|未命中|大失败)/.test(body))
  state = await readState()
  check('P007: 敌人攻击后 HP 未变', state.player.hp === hpBeforeEnemyAttack && state.player.hp >= 0)

  // E. 存档 → 刷新 → 继续游戏
  await clickByText('保存存档')
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  body = await bodyText()
  check('刷新后回到主菜单', body.includes('天梦大陆'))
  await clickByText('继续游戏')
  body = await bodyText()
  check('继续游戏后进入游戏页面', body.includes('冒险日志'))
  check('读档后金币恢复 50', body.includes('50'))
  check('读档后位置恢复 misty_ruins', body.includes('misty_ruins'))
  check('P005: 未知地点安全显示不崩溃', body.includes('未知地点'))

  // P004：旧存档回归——已有存档时新游戏→创建页→返回，Continue 仍可用，原存档不破坏
  await clickByText('返回主菜单')
  await clickByText('新游戏')
  body = await bodyText()
  check('P004: 已有存档时点击新游戏仍进入创建页', body.includes('创建角色'))
  await clickByText('返回主菜单')
  check('P004: 创建页返回主菜单后 Continue 仍可用', (await continueDisabled()) === false)
  await clickByText('继续游戏')
  body = await bodyText()
  check('P004: 原存档仍可继续（云岚）', body.includes('冒险日志') && body.includes('云岚'))

  // R1：物品恢复断言（进开发者控制台读背包）
  await clickByText('返回主菜单')
  await clickByText('开发者控制台')
  state = await readState()
  const restoredItem = state.inventory.some((e) => e.itemId === 'test_artifact' && e.quantity === 1)
  check('R1: 刷新读档后 test_artifact×1 恢复', restoredItem)
  await clickByText('返回主菜单')

  // 删除存档流程
  await clickByText('开发者控制台')
  await clickByText('删除存档')
  await clickByText('返回主菜单')
  check('删除存档后「继续游戏」重新禁用', (await continueDisabled()) === true)

  // P009：首个完整任务闭环 —— 新游戏 → 接受任务 → 真实战斗胜利 → 自动可完成 → 提交（无奖励）
  await clickByText('新游戏')
  body = await bodyText()
  check('P009: 进入创建页', body.includes('创建角色'))
  await page.focus('input[placeholder="输入角色姓名"]')
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.type('input[placeholder="输入角色姓名"]', '云岚')
  await clickLabel('法师')
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P009: 新游戏进入青石村', body.includes('冒险日志') && body.includes('qingshi_village'))
  check('P009: 初始金币 50', body.includes('50'))

  await clickByText('查看委托')
  await clickByText('接受任务')
  body = await bodyText()
  check('P009: 接受《村外异动》进行中', body.includes('进行中'))

  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  const hpBeforeClosedLoop = readHps(body)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.999 // 第一击天然 20 暴击 12 击杀魔化兔（HP 8）
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P009: 真实战斗胜利（天然 20）', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  const hpAfterVictory = readHps(body)
  check('P009: 一击击杀玩家未受伤（无反击）', hpAfterVictory.player === hpBeforeClosedLoop.player)

  await clickByText('返回冒险')
  body = await bodyText()
  check('P009: 返回村外草原后任务日志显示可完成', body.includes('村外异动') && body.includes('可完成'))
  check('P009: 村外草原没有提交任务按钮（不在给予者所在地）', !body.includes('提交任务'))
  check('P011: 任务可完成但未提交时兔王巢穴仍锁定', (await buttonDisabled('兔王巢穴')) === true)

  await clickByText('青石村')
  body = await bodyText()
  check('P009: 回青石村出现提交任务按钮', body.includes('提交任务'))
  await clickByText('提交任务')
  body = await bodyText()
  check('P009: 提交后任务已完成', body.includes('已完成'))
  check('P009: 完成任务金币仍 50（无奖励）', body.includes('50'))

  // P011：提交后解锁兔王巢穴 → 进入巢穴见嘟嘟兔 → 存档恢复
  await clickByText('村外草原')
  body = await bodyText()
  check('P011: 提交后兔王巢穴按钮启用', (await buttonDisabled('兔王巢穴')) === false)
  check('P011: 不再显示尚未找到进入此地的方法', !body.includes('尚未找到进入此地的方法'))
  await clickByText('兔王巢穴')
  body = await bodyText()
  check('P011: 进入兔王巢穴（显示地点描述）', body.includes('兔王巢穴') && body.includes('魔化兔群的巢穴'))
  check('P011: 巢穴可见嘟嘟兔威胁（HP 24 · 防御 13）', body.includes('嘟嘟兔') && body.includes('HP 24 · 防御 13'))

  // P012：击败嘟嘟兔获得唯一《兔子的路径》
  check('P012: Boss 战前背包无兔子的路径', !body.includes('兔子的路径'))
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P012: 嘟嘟兔战斗开始（HP 24 / 24）', body.includes('嘟嘟兔') && body.includes('24 / 24'))
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    const seq = [0.999, 0, 0.999] // 玩家20暴击12 → 嘟嘟兔 24→12；嘟嘟兔天然1 玩家不受伤；玩家20暴击12 → 击杀
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('普通攻击')
  await sleep(200)
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P012: 确定性击败嘟嘟兔（战斗胜利）', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  body = await bodyText()
  check('P012: 返回后背包显示兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  check('P012: 藏宝图描述含藏宝图与黄金兔子王', body.includes('藏宝图') && body.includes('黄金兔子王'))
  await clickByText('村外草原')
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P011: Continue 后仍在村外草原', body.includes('村外草原'))
  check('P011: Continue 后兔王巢穴仍可进入', (await buttonDisabled('兔王巢穴')) === false)
  check('P012: Continue 后兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  await clickByText('青石村')

  await clickByText('返回主菜单')
  body = await bodyText()
  check('P009: 闭环完成返回主菜单', body.includes('天梦大陆'))

  // P010：背包展示与治疗药水 —— 新游戏（默认骑士，maxHp 22）
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P010: 背包显示铁剑 ×1', body.includes('铁剑 ×1'))
  check('P010: 背包显示治疗药水 ×2', body.includes('治疗药水 ×2'))
  check('P010: 药水描述读取注册表', body.includes('装在小陶瓶中的淡红药水'))
  check('P010: 满血时使用按钮禁用', (await buttonDisabled('使用')) === true)
  check('P010: 满血提示生命已满', body.includes('生命已满'))

  // 确定性受伤：随机序列 [玩家2, 敌8, 玩家20] → 玩家未命中受伤2 → 第二击天然20击杀
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    const seq = [0.05, 0.35, 0.95] // floor(x*20)+1 → 2 / 8 / 20
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('普通攻击') // 玩家未命中，魔化兔命中 → HP 22→20
  await sleep(200)
  await clickByText('普通攻击') // 玩家天然 20 暴击 12 击杀 → 胜利
  await sleep(300)
  body = await bodyText()
  check('P010: 确定性战斗胜利', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  body = await bodyText()
  check('P010: 受伤后 HP 20 / 22', body.includes('20 / 22'))
  check('P010: 受伤后治疗药水仍 ×2', body.includes('治疗药水 ×2'))
  check('P010: 受伤后使用按钮启用', (await buttonDisabled('使用')) === false)

  await clickByText('使用')
  await sleep(250)
  body = await bodyText()
  check('P010: 使用药水后 HP 恢复 22 / 22', body.includes('22 / 22'))
  check('P010: 药水数量减少为 ×1', body.includes('治疗药水 ×1'))
  check('P010: 满血后使用按钮重新禁用', (await buttonDisabled('使用')) === true)

  // 存档恢复：用药后手动保存 → Continue → HP/药水保持使用后值
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P010: Continue 后 HP 为使用后值 22 / 22', body.includes('22 / 22'))
  check('P010: Continue 后药水为使用后值 ×1', body.includes('治疗药水 ×1'))
  check('P010: Continue 后使用按钮仍禁用', (await buttonDisabled('使用')) === true)
  await clickByText('返回主菜单')

  // R2：运行期间存档改坏 → 触发一次 load → Continue 禁用且不进入游戏页
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆') // P004：默认预填合法，直接确认创建
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  check('R2: 合法存档存在时 Continue 可用', (await continueDisabled()) === false)
  await clickByText('开发者控制台')
  await page.evaluate(() => {
    window.localStorage.setItem('tianmeng_continent_save', '{ broken')
  })
  await clickByText('返回主菜单')
  await clickByText('继续游戏') // 按钮此时仍 enabled（hasSave 尚未同步），点击触发 loadGame
  body = await bodyText()
  check('R2: 运行期改坏后点击继续不进入游戏页', body.includes('天梦大陆') && !body.includes('冒险日志'))
  check('R2: 运行期改坏并触发 load 后 Continue 随即禁用', (await continueDisabled()) === true)

  // R1：五件套存在但 player 内部损坏的坏档 → 刷新后主菜单正常、继续游戏禁用
  await page.evaluate(() => {
    const bad = {
      version: 1,
      savedAt: 'x',
      gameState: {
        player: {},
        inventory: [],
        equipment: { weapon: null, armor: null, accessory: null },
        quests: [],
        world: { currentLocationId: 'x', flags: {}, completedEvents: [], npcStates: {} },
      },
    }
    window.localStorage.setItem('tianmeng_continent_save', JSON.stringify(bad))
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  body = await bodyText()
  check('R1: player 内部损坏坏档刷新不白屏', body.includes('天梦大陆'))
  check('R1: player 内部损坏坏档时「继续游戏」禁用', (await continueDisabled()) === true)

  // F. 异常存档回退：注入非法 JSON 后刷新不得白屏
  await page.evaluate(() => {
    window.localStorage.setItem('tianmeng_continent_save', '{ broken json')
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  body = await bodyText()
  check('损坏 JSON 刷新不白屏（主菜单可见）', body.includes('天梦大陆'))
  check('损坏 JSON 时「继续游戏」禁用', (await continueDisabled()) === true)
} catch (err) {
  check('脚本执行无异常', false, err.message)
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`)
process.exit(failed.length > 0 ? 1 : 0)
