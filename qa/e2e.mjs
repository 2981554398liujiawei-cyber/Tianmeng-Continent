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

  // P006：可完成提交 —— 在给予者所在地显示提交任务，完成获得固定金币奖励（TM-P0-018）
  check('P006: 回到青石村后任务显示可完成', body.includes('可完成'))
  await clickByText('提交任务')
  body = await bodyText()
  check('P006: 提交任务后任务日志显示已完成', body.includes('已完成'))
  check('P018: 完成任务金币 50 → 70', body.includes('70'))

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

  // D. 状态修改（P006 提交任务奖励后金币为 70，用相对断言验证 +10/-10）
  let state = await readState()
  const goldBeforeAdd = state.player.gold
  await clickByText('+10 金币')
  state = await readState()
  check('+10 金币后 gold 增加 10', state.player.gold === goldBeforeAdd + 10, `gold=${state.player.gold}`)

  await clickByText('-10 金币')
  state = await readState()
  check('-10 金币后 gold 恢复原值', state.player.gold === goldBeforeAdd, `gold=${state.player.gold}`)

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
  check('读档后金币恢复（任务奖励后基数）', body.includes(String(goldBeforeAdd)))
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
  check('P018: 提交后金币 50 → 70（任务奖励 20 金币）', body.includes('70'))
  check('P018: 任务日志显示奖励 20 金币', body.includes('奖励：20 金币'))

  // P018：存档恢复（任务 completed / 金币 70 / 兔王巢穴解锁保留）
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P018: Continue 后任务仍已完成', body.includes('已完成'))
  check('P018: Continue 后金币仍 70', body.includes('70'))

  // P018：经济消费联动：任务奖励金币 → 药师商店购买
  await clickByText('购买')
  await sleep(200)
  body = await bodyText()
  check('P018: 任务金币可在商店消费（70→60 药水+1）', body.includes('60') && body.includes('治疗药水 ×3'))

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
  check('P1-013-A: Boss 战前无展开地图且无具体地点占位', !body.includes('展开地图') && !body.includes('具体地点：【待补充】'))
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
  check('P019: Boss 后返回冒险显示新的线索区域', body.includes('新的线索'))

  // TM-P1-013：正式查看《兔子的路径》
  // B. 获得地图后：展开地图 enabled；未查看前不得提前显示具体地点占位
  check('P1-013-B: 显示展开地图按钮（enabled）', (await buttonDisabled('展开地图')) === false)
  check('P1-013-B: 未查看前不显示具体地点：【待补充】', !body.includes('具体地点：【待补充】'))
  // D. 查看前状态快照（等级/生命/灵力/金币/当前位置 ID——位置 ID 从「当前位置」区域确定性读取，不用模糊文本）
  const beforePathLevel = body.match(/Lv\.(\d+)/)
  const beforePathHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const beforePathMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const beforePathGold = body.match(/金币\s*(\d+)/)
  const beforePathLocationId = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  // C. 正式查看
  await clickByText('展开地图')
  await sleep(300)
  body = await bodyText()
  check('P1-013-C: 显示固定文案（地图指向黄金兔子王所在之地）', body.includes('地图上的路线最终指向黄金兔子王所在之地。'))
  check('P1-013-C: 显示具体地点：【待补充】', body.includes('具体地点：【待补充】'))
  check('P1-013-C: 展开地图按钮消失（不残留 disabled）', !body.includes('展开地图'))
  check('P1-013-C: 兔子的路径仍 ×1（不消耗地图）', body.includes('兔子的路径 ×1'))
  // D. 查看后无其他状态副作用
  const afterPathLevel = body.match(/Lv\.(\d+)/)
  const afterPathHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const afterPathMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const afterPathGold = body.match(/金币\s*(\d+)/)
  const afterPathLocationId = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-013-D: 查看前当前位置为 rabbit_lair', beforePathLocationId === 'rabbit_lair')
  check(
    'P1-013-D: 查看后 currentLocationId 与查看前完全相等',
    beforePathLocationId !== null && afterPathLocationId === beforePathLocationId,
  )
  check(
    'P1-013-D: 查看后等级/生命/灵力/金币全不变',
    beforePathLevel !== null && afterPathLevel !== null && beforePathLevel[1] === afterPathLevel[1] &&
      beforePathHp !== null && afterPathHp !== null && beforePathHp[1] === afterPathHp[1] && beforePathHp[2] === afterPathHp[2] &&
      beforePathMp !== null && afterPathMp !== null && beforePathMp[1] === afterPathMp[1] && beforePathMp[2] === afterPathMp[2] &&
      beforePathGold !== null && afterPathGold !== null && beforePathGold[1] === afterPathGold[1],
  )

  // TM-P1-014：嘟嘟兔一次性 Boss 清场
  // B. Boss 胜利返回冒险后：当前地点仍 rabbit_lair；整个「附近威胁」section 不存在（精确检查，非 !body.includes('嘟嘟兔')）
  check('P1-014-B: 清场后当前地点仍 rabbit_lair', afterPathLocationId === 'rabbit_lair')
  const lairThreatsAfterClear = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('附近威胁'))
    if (!heading) return null // 威胁区整体不渲染
    const section = heading.closest('section')
    const text = section ? section.textContent : ''
    return { hasDudu: text.includes('嘟嘟兔'), hasEngage: text.includes('迎战') }
  })
  check('P1-014-B: 清场后兔王巢穴整个附近威胁 section 不存在', lairThreatsAfterClear === null)
  await clickByText('村外草原')
  // C. 离开再返回：Boss 不重生；地图与查看状态保持
  await clickByText('兔王巢穴')
  await sleep(300)
  body = await bodyText()
  check('P1-014-C: 重进巢穴后附近威胁 section 仍不存在', (await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('附近威胁'))
    return heading === undefined || heading === null
  })) === true)
  check('P1-014-C: 重进巢穴后兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  check('P1-014-C: 重进巢穴后新的线索仍显示', body.includes('新的线索'))
  check('P1-014-C: 重进巢穴后地图查看状态保持（无展开地图按钮）', !body.includes('展开地图'))
  await clickByText('村外草原')
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P011: Continue 后仍在村外草原', body.includes('村外草原'))
  check('P011: Continue 后兔王巢穴仍可进入', (await buttonDisabled('兔王巢穴')) === false)
  check('P012: Continue 后兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  check('P019: Continue 后新的线索仍显示', body.includes('新的线索'))
  // TM-P1-013-E：Save/Continue 保持查看状态（rabbit_path_examined 经 world.flags 自然持久化）
  check('P1-013-E: Continue 后已查看文案保持', body.includes('地图上的路线最终指向黄金兔子王所在之地。') && body.includes('具体地点：【待补充】'))
  check('P1-013-E: Continue 后无展开地图按钮', !body.includes('展开地图'))
  // TM-P1-014-D：Save/Continue 后 Boss 不重生——重进巢穴威胁区仍不存在，查看状态继续保持
  await clickByText('兔王巢穴')
  await sleep(300)
  body = await bodyText()
  check('P1-014-D: Continue 后重进巢穴嘟嘟兔仍不出现', !body.includes('嘟嘟兔'))
  const lairThreatsAfterContinue = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('附近威胁'))
    if (!heading) return null
    const section = heading.closest('section')
    const text = section ? section.textContent : ''
    return { hasDudu: text.includes('嘟嘟兔'), hasEngage: text.includes('迎战') }
  })
  check('P1-014-D: Continue 后重进巢穴附近威胁 section 仍不存在', lairThreatsAfterContinue === null)
  check('P1-014-D: Continue 后巢穴地图查看状态保持（无展开地图）', !body.includes('展开地图'))
  check('P1-014-D: Continue 后兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  await clickByText('村外草原')
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

  // P013：铁剑装备与武器伤害加成（新游戏默认骑士石头城 STR14）
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P013: 初始武器未装备', body.includes('未装备'))
  check('P013: 背包铁剑 ×1 且显示装备按钮', body.includes('铁剑 ×1') && body.includes('装备'))
  await clickByText('装备')
  await sleep(200)
  body = await bodyText()
  check('P013: 装备后武器显示铁剑', body.includes('武器： 铁剑'))
  check('P013: 装备后铁剑仍 ×1（不消耗背包）', body.includes('铁剑 ×1'))
  check('P013: 已装备显示卸下按钮', body.includes('卸下'))

  // 装备后真实伤害：玩家 roll 7 → 7+4=11 >= 11 命中 → 造成 8 点伤害 → 魔化兔 HP8 一击胜利（无反击）
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P013: 战斗页玩家区显示武器铁剑', body.includes('武器： 铁剑'))
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.3 // floor(0.3 * 20) + 1 = 7
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P013: 装备铁剑普通命中造成 8 点伤害', body.includes('造成 8 点伤害'))
  check('P013: 一击击杀魔化兔（战斗胜利）', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('青石村')

  // 卸下恢复未装备
  await clickByText('卸下')
  await sleep(200)
  body = await bodyText()
  check('P013: 卸下后武器恢复未装备', body.includes('未装备'))
  check('P013: 卸下后铁剑仍 ×1', body.includes('铁剑 ×1'))

  // 存档恢复：再装备 → 保存 → Continue → 装备状态保留
  await clickByText('装备')
  await sleep(200)
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P013: Continue 后武器仍为铁剑', body.includes('武器： 铁剑'))
  check('P013: Continue 后铁剑仍 ×1', body.includes('铁剑 ×1'))
  await clickByText('返回主菜单')

  // P014：药师商店与治疗药水购买
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P014: 青石村显示药师的小铺', body.includes('药师的小铺'))
  check('P014: 商品信息读注册表（价格 10 金币）', body.includes('治疗药水') && body.includes('价格：10 金币'))
  check('P014: 初始购买按钮启用', (await buttonDisabled('购买')) === false)
  await clickByText('购买')
  await sleep(200)
  body = await bodyText()
  check('P014: 购买后金币 40', body.includes('40'))
  check('P014: 购买后治疗药水 ×3', body.includes('治疗药水 ×3'))

  // 存档恢复：购买 → 保存 → Continue → 金币 40 / 药水 ×3
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P014: Continue 后金币 40 且药水 ×3', body.includes('40') && body.includes('治疗药水 ×3'))

  // 确定性受伤（HP 22→20）后购买不治疗，再使用药水恢复
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    const seq = [0.05, 0.35, 0.95] // 玩家2未命中 / 敌8命中伤2 / 玩家20击杀
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('普通攻击')
  await sleep(200)
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P014: 战斗胜利（受伤 2 点）', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('青石村')
  body = await bodyText()
  check('P014: 受伤后 HP 20 / 22', body.includes('20 / 22'))
  await clickByText('购买')
  await sleep(200)
  body = await bodyText()
  check('P014: 购买后 HP 仍 20（不自动治疗）', body.includes('20 / 22'))
  check('P014: 购买后金币 30 药水 ×4', body.includes('治疗药水 ×4'))
  await clickByText('使用')
  await sleep(200)
  body = await bodyText()
  check('P014: 背包使用药水后 HP 22 / 22', body.includes('22 / 22'))
  check('P014: 药水减少为 ×3', body.includes('治疗药水 ×3'))

  // 金币不足：30→20→10→0，购买按钮禁用且显示金币不足
  await clickByText('购买')
  await sleep(150)
  await clickByText('购买')
  await sleep(150)
  await clickByText('购买')
  await sleep(150)
  body = await bodyText()
  check('P014: 金币耗尽后购买按钮禁用', (await buttonDisabled('购买')) === true)
  check('P014: 显示金币不足', body.includes('金币不足'))
  await clickByText('返回主菜单')

  // P015：青石村附近人物与最小对话交互
  // 点击第 index 个「交谈」按钮（卡片顺序：村长0 / 铁匠1 / 药师2）
  const clickNthTalk = async (index) => {
    await page.evaluate((i) => {
      const btns = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '交谈')
      const btn = btns[i]
      if (!btn) throw new Error('未找到第 ' + i + ' 个交谈按钮')
      btn.click()
    }, index)
    await sleep(250)
  }
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P015: 青石村显示附近人物（村长/铁匠/药师）', body.includes('附近人物') && body.includes('村长') && body.includes('铁匠') && body.includes('药师'))
  check('P015: 人物简介来自注册表（村长/药师 summary）', body.includes('年迈而沉稳的老人') && body.includes('采药与炼药'))

  // 村长交谈：精确 greeting → 结束 → 文字消失
  await clickByText('交谈')
  await sleep(250)
  body = await bodyText()
  check('P015: 与村长交谈面板', body.includes('与村长交谈'))
  check('P015: 村长固定 greeting 全文', body.includes('村外的野兽越来越不安分，村里的人都很担心。'))
  check('P015: 显示结束交谈按钮', body.includes('结束交谈'))
  await clickByText('结束交谈')
  body = await bodyText()
  check('P015: 结束交谈后 greeting 消失', !body.includes('村外的野兽越来越不安分'))

  // 药师交谈与商店互不干扰
  await clickNthTalk(2)
  body = await bodyText()
  check('P015: 与药师交谈面板', body.includes('与药师交谈'))
  check('P015: 药师固定 greeting 全文', body.includes('最近村外采药不太安稳。要是受了伤，我这里还有些治疗药水。'))
  await clickByText('结束交谈')
  body = await bodyText()
  check('P015: 结束药师交谈后商店仍在（药师的小铺/购买）', body.includes('药师的小铺') && body.includes('购买'))

  // 移动清除对话：村长交谈中前往村外草原
  await clickByText('交谈')
  await sleep(250)
  await clickByText('村外草原')
  await sleep(300)
  body = await bodyText()
  check('P015: 移动后村长对话清除', !body.includes('村外的野兽越来越不安分'))
  check('P015: 草原无附近人物区', !body.includes('附近人物'))
  await clickByText('青石村')
  body = await bodyText()
  check('P015: 回青石村附近人物重新出现', body.includes('附近人物') && body.includes('村长'))
  check('P015: 返回后对话保持关闭', !body.includes('与村长交谈'))
  await clickByText('返回主菜单')

  // P016：废弃矿洞调查 D20 正式玩法
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('废弃矿洞')
  body = await bodyText()
  check('P016: 矿洞显示调查入口（心智检定 DC 12）', body.includes('调查矿洞') && body.includes('心智检定') && body.includes('DC 12'))
  check('P016: 显示仔细调查按钮', body.includes('仔细调查'))
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.999 // 天然 20
  })
  await clickByText('仔细调查')
  await sleep(300)
  body = await bodyText()
  check('P016: 即时显示 D20 20 大成功', body.includes('D20 20') && body.includes('大成功'))
  check('P016: 成功文本（利爪泥痕）', body.includes('你在洞口附近发现了被利爪抓乱的泥痕'))
  check('P016: 显示调查已完成', body.includes('调查已完成'))
  const noInvestigateBtn = () =>
    page.evaluate(() => ![...document.querySelectorAll('button')].some((b) => b.textContent.includes('仔细调查')))
  check('P016: 不再显示仔细调查按钮', await noInvestigateBtn())
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })

  // 移动返回不可重掷
  await clickByText('青石村')
  await clickByText('废弃矿洞')
  body = await bodyText()
  check('P016: 返回矿洞仍显示同一成功文本', body.includes('你在洞口附近发现了被利爪抓乱的泥痕') && body.includes('调查已完成'))
  check('P016: 返回后无法重掷（无仔细调查）', await noInvestigateBtn())

  // 存档恢复
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P016: Continue 后成功文本仍在且无法重掷', body.includes('你在洞口附近发现了被利爪抓乱的泥痕') && body.includes('调查已完成'))
  await clickByText('返回主菜单')

  // P017：无敌人地点隐藏「附近威胁」
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P017: 青石村不显示附近威胁', !body.includes('附近威胁'))
  check('P017: 青石村不显示空状态文案', !body.includes('这里暂时没有威胁'))
  check('P017: 青石村其他区域正常（附近人物/药师的小铺/附近委托）', body.includes('附近人物') && body.includes('药师的小铺') && body.includes('附近委托'))
  check('P019: 未获得藏宝图时不显示新的线索', !body.includes('新的线索'))
  await clickByText('村外草原')
  body = await bodyText()
  check('P017: 村外草原显示附近威胁（魔化兔 HP 8 防御 11）', body.includes('附近威胁') && body.includes('魔化兔') && body.includes('HP 8') && body.includes('防御 11') && body.includes('迎战'))
  await clickByText('青石村')
  body = await bodyText()
  check('P017: 返回青石村后附近威胁消失', !body.includes('附近威胁'))
  await clickByText('返回主菜单')

  // P020：废弃矿洞魔化鼠掉落铁矿石
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('废弃矿洞')
  body = await bodyText()
  check('P020: Boss 战前背包不存在铁矿石', !body.includes('铁矿石'))
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P020: 魔化鼠战斗开始（HP 6 / 6）', body.includes('魔化鼠') && body.includes('6 / 6'))
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.999 // 天然 20，暴击 12 一击击杀 HP6 魔化鼠
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P020: 首次击败魔化鼠（战斗胜利）', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  body = await bodyText()
  check('P020: 返回冒险背包显示铁矿石 ×1', body.includes('铁矿石 ×1'))
  check('P020: 铁矿石描述含普通铁矿石与金属光泽', body.includes('普通铁矿石') && body.includes('金属光泽'))

  // 重复击败堆叠
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.999
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P020: 再次击败魔化鼠（战斗胜利）', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  body = await bodyText()
  check('P020: 重复击败后铁矿石堆叠为 ×2', body.includes('铁矿石 ×2'))
  check('P020: 不出现两条独立铁矿石 ×1', !body.includes('铁矿石 ×1'))

  // 存档恢复
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P020: Continue 后铁矿石仍 ×2', body.includes('铁矿石 ×2'))
  await clickByText('返回主菜单')

  // P021：青石村铁匠收购铁矿石
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('废弃矿洞')
  await sleep(300)
  const killRat = async () => {
    await clickByText('迎战')
    await sleep(300)
    await page.evaluate(() => {
      window.__origRandom = Math.random.bind(Math)
      Math.random = () => 0.999
    })
    await clickByText('普通攻击')
    await sleep(300)
    await page.evaluate(() => {
      Math.random = window.__origRandom
    })
    body = await bodyText()
    check('P021: 击败魔化鼠获得铁矿石（战斗胜利）', body.includes('战斗胜利'))
    await clickByText('返回冒险')
  }
  await killRat()
  body = await bodyText()
  check('P021: 首次掉落铁矿石 ×1', body.includes('铁矿石 ×1'))
  await killRat()
  body = await bodyText()
  check('P021: 铁矿石 ×2', body.includes('铁矿石 ×2'))
  await clickByText('青石村')
  body = await bodyText()
  check('P021: 青石村显示铁匠的收购（收购价 5 金币）', body.includes('铁匠的收购') && body.includes('收购价：5 金币'))
  check('P021: 持有 2 且出售按钮启用', body.includes('持有：2') && (await buttonDisabled('出售 1 个')) === false)
  await clickByText('出售 1 个')
  await sleep(200)
  body = await bodyText()
  check('P021: 出售后金币 50→55 铁矿石 ×1', body.includes('55') && body.includes('铁矿石 ×1'))

  // 存档恢复：铁矿石 ×1 金币 55
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P021: Continue 后铁矿石 ×1 金币 55', body.includes('铁矿石 ×1') && body.includes('55'))

  // 经济联动：铁匠出售金币 → 药师购买药水（55→45）
  await clickByText('购买')
  await sleep(200)
  body = await bodyText()
  check('P021: 战利品经济闭环（金币 55→45 药水+1）', body.includes('治疗药水 ×3'))

  // 出售最后一块
  await clickByText('出售 1 个')
  await sleep(200)
  body = await bodyText()
  check('P021: 最后一块出售后金币 45→50 背包无铁矿石', body.includes('50') && !body.includes('铁矿石 ×1'))
  check('P021: 无铁矿石时出售按钮禁用', (await buttonDisabled('出售 1 个')) === true)
  check('P021: 显示没有可出售的铁矿石', body.includes('没有可出售的铁矿石'))
  await clickByText('返回主菜单')

  // P022：青石村休整与战败恢复出口
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  // 固定第一轮：玩家失手 + 敌人命中受伤，随后暴击击杀
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    const seq = [0.05, 0.35, 0.95] // 玩家2未命中 / 敌8命中伤2 / 玩家20击杀
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('普通攻击')
  await sleep(300)
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P022: 击败魔化兔（战斗胜利）', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  body = await bodyText()
  const hpAfterBattle = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  check('P022: 战斗受伤后 HP < 22', hpAfterBattle && Number(hpAfterBattle[1]) < 22, `hp=${hpAfterBattle?.[1]}`)

  // 青石村休整恢复
  await clickByText('青石村')
  body = await bodyText()
  check('P022: 青石村显示村中休整', body.includes('村中休整'))
  check('P022: 受伤后休整按钮启用', (await buttonDisabled('休整')) === false)
  await clickByText('休整')
  await sleep(300)
  body = await bodyText()
  check('P022: 休整后生命 22 / 22 灵力 6 / 6', body.includes('22 / 22') && body.includes('6 / 6'))
  check('P022: 休整后显示状态良好无需休整', body.includes('状态良好，无需休整'))
  check('P022: 休整后按钮禁用', (await buttonDisabled('休整')) === true)

  // 其他地点隐藏村中休整
  await clickByText('村外草原')
  body = await bodyText()
  check('P022: 村外草原不显示村中休整', !body.includes('村中休整'))

  // 存档恢复：休整后的 HP/MP
  await clickByText('青石村')
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P022: Continue 后生命 22 / 22 灵力 6 / 6', body.includes('22 / 22') && body.includes('6 / 6'))
  await clickByText('返回主菜单')

  // P022-R1：真正战败 → HP0 返回冒险 → 回村休整（修复战败软锁出口）
  // 先清空历史存档，验证「无存档起始」下战败与休整全程不自动创建存档
  await page.evaluate(() => localStorage.removeItem('tianmeng_continent_save'))
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  // 固定随机：玩家持续天然1 大失败失手（0 伤害）、魔化兔持续命中（2 伤/轮），直至 HP 0
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    const seq = [0.0, 0.6] // 玩家 roll 1（大失败，不命中）/ 敌 roll 13 命中 2 伤
    let i = 0
    Math.random = () => seq[i++ % 2]
  })
  for (let i = 0; i < 14; i++) {
    body = await bodyText()
    if (body.includes('战斗失败')) break
    await clickByText('普通攻击')
    await sleep(300)
  }
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  body = await bodyText()
  check('P022-R1: 真正战败出现（战斗失败/返回冒险）', body.includes('战斗失败') && body.includes('返回冒险'))
  check('P022-R1: 战败按钮不是返回主菜单', !body.includes('返回主菜单'))
  await clickByText('返回冒险')
  body = await bodyText()
  check('P022-R1: 返回冒险后当前位置村外草原', body.includes('当前位置') && body.includes('村外草原'))
  check('P022-R1: 战败返回后生命 0 / 22', body.includes('0 / 22'))
  check('P022-R1: HP0 显示当前状态无法战斗', body.includes('当前状态无法战斗'))
  check('P022-R1: HP0 迎战按钮禁用', (await buttonDisabled('迎战')) === true)

  // HP0 仍可移动回青石村
  await clickByText('青石村')
  body = await bodyText()
  check('P022-R1: HP0 可移动回青石村（显示村中休整）', body.includes('村中休整'))
  check('P022-R1: 休整按钮启用', (await buttonDisabled('休整')) === false)
  await clickByText('休整')
  await sleep(300)
  body = await bodyText()
  check('P022-R1: 休整后生命 22 / 22 灵力 6 / 6', body.includes('22 / 22') && body.includes('6 / 6'))
  check('P022-R1: 休整后状态良好无需休整', body.includes('状态良好，无需休整'))

  // 恢复后可重新战斗
  await clickByText('村外草原')
  body = await bodyText()
  check('P022-R1: 恢复后迎战按钮重新启用', (await buttonDisabled('迎战')) === false)

  // 战败与休整全程不自动存档（初始无存档 → 继续游戏仍禁用）
  await clickByText('返回主菜单')
  body = await bodyText()
  check('P022-R1: 无自动存档（继续游戏无存档仍禁用）', (await buttonDisabled('继续游戏')) === true)

  // P1-001：法师职业技能「法术攻击」与灵力消耗
  // A. 非法师（默认骑士）没有法术攻击
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P1-001-A: 骑士战斗中显示普通攻击', body.includes('普通攻击'))
  check('P1-001-A: 骑士不显示法术攻击', !body.includes('法术攻击'))
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99 // 普通攻击天然 20
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-001-A: 骑士普通攻击胜利', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('返回主菜单')

  // B. 法师拥有法术攻击（创建页选择法师，属性使用合法默认分配）
  await clickByText('新游戏')
  await clickLabel('法师')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P1-001-B: 战斗页职业显示法师', body.includes('法师'))
  check('P1-001-B: 显示灵力 6 / 6', body.includes('6 / 6'))
  check('P1-001-B: 显示法术攻击（2 灵力）', body.includes('法术攻击（2 灵力）'))
  check('P1-001-B: 法术按钮启用', (await buttonDisabled('法术攻击')) === false)
  check('P1-001-B: 法师不显示骑士重击/迅捷突袭/压制猛击', !body.includes('骑士重击') && !body.includes('迅捷突袭') && !body.includes('压制猛击'))

  // C. 灵力耗尽：法术天然1 + 敌天然1，连续施法三次并逐次断言 MP 6→4→2→0
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.0 // 法术 roll1 大失败（0 伤），敌 roll1 大失败（0 伤）
  })
  await clickByText('法术攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-001-C: 第一次法术后灵力 4 / 6', body.includes('4 / 6'))
  check('P1-001-C: 第一次法术后魔化兔仍 HP 8 / 8', body.includes('8 / 8'))
  await clickByText('法术攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-001-C: 第二次法术后灵力 2 / 6', body.includes('2 / 6'))
  check('P1-001-C: 第二次法术后魔化兔仍 HP 8 / 8', body.includes('8 / 8'))
  await clickByText('法术攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-001-C: 第三次法术后灵力 0 / 6', body.includes('0 / 6'))
  check('P1-001-C: 第三次法术后魔化兔仍 HP 8 / 8', body.includes('8 / 8'))
  check('P1-001-C: 法术按钮禁用', (await buttonDisabled('法术攻击')) === true)
  check('P1-001-C: 显示灵力不足', body.includes('灵力不足'))
  check('P1-001-C: 普通攻击仍启用', (await buttonDisabled('普通攻击')) === false)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })

  // D. MP0 仍可普通攻击（天然20 暴击击败魔化兔，普通攻击不消费 MP）
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-001-D: MP0 普通攻击战斗胜利', body.includes('战斗胜利'))
  check('P1-001-D: 普通攻击后灵力仍 0 / 6（不消费 MP）', body.includes('0 / 6'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })

  // E. 返回冒险 → 青石村休整恢复灵力
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('休整')
  await sleep(300)
  body = await bodyText()
  check('P1-001-E: 休整后灵力 6 / 6', body.includes('6 / 6'))

  // F. 真正法术命中/暴击：法术天然20，默认法师 MND8 伤害5 暴击10 击败魔化兔
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('法术攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-001-F: 显示你的法术攻击', body.includes('你的法术攻击'))
  check('P1-001-F: 暴击造成 10 点伤害', body.includes('暴击') && body.includes('造成 10 点伤害'))
  check('P1-001-F: 法术暴击战斗胜利', body.includes('战斗胜利'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })

  // G. 战斗后 MP 保留 + 手动存档 Continue 保持剩余 MP
  await clickByText('返回冒险')
  body = await bodyText()
  check('P1-001-G: 战斗后灵力 4 / 6', body.includes('4 / 6'))
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P1-001-G: Continue 后灵力仍 4 / 6', body.includes('4 / 6'))
  await clickByText('返回主菜单')

  // P1-002：《村外异动》完成后村长信任 +1
  // 复用 P015 段 clickNthTalk（青石村卡片顺序：村长0 / 铁匠1 / 药师2）
  // A. 完成前村长交谈显示 信任：0
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-002-A: 完成前村长对话显示 信任：0', body.includes('信任：0'))
  await clickByText('结束交谈')

  // B/C. 正式完成任务（查看委托→接受→村外草原确定性击败魔化兔→回村提交）
  await clickByText('查看委托')
  await clickByText('接受任务')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99 // 普通攻击天然 20，暴击击杀魔化兔
  })
  await clickByText('普通攻击')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-002-C: 提交后任务已完成且金币 70', body.includes('已完成') && body.includes('70'))
  // 兔王巢穴入口在村外草原（青石村无此连接按钮）
  await clickByText('村外草原')
  body = await bodyText()
  check('P1-002-C: 兔王巢穴已解锁可进入', (await buttonDisabled('兔王巢穴')) === false)
  await clickByText('青石村')

  // D. 关系即时反馈：村长交谈显示 信任：1（无好感/尊敬/恋爱）
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-002-D: 完成后村长对话显示 信任：1', body.includes('信任：1'))
  // TM-P1-003：村长对话已扩展为 信任+尊敬 两维显示；好感/恋爱仍不出现
  check('P1-002-D: 不显示好感/恋爱（尊敬维度显示为 0）', !body.includes('好感') && !body.includes('恋爱') && body.includes('尊敬：0'))
  await clickByText('结束交谈')

  // E. 重复交谈不加信任
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-002-E: 再次交谈仍 信任：1', body.includes('信任：1'))
  await clickByText('结束交谈')

  // F. 保存恢复后仍 信任：1
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-002-F: Continue 后村长对话仍 信任：1', body.includes('信任：1'))
  await clickByText('结束交谈')

  // G. 铁匠/药师无关系 UI 扩张
  await clickNthTalk(1)
  body = await bodyText()
  check('P1-002-G: 铁匠对话无关系数值 UI', !body.includes('信任：') && !body.includes('好感') && !body.includes('尊敬'))
  await clickByText('结束交谈')
  await clickNthTalk(2)
  body = await bodyText()
  check('P1-002-G: 药师对话无关系数值 UI', !body.includes('信任：') && !body.includes('好感') && !body.includes('尊敬'))
  await clickByText('结束交谈')
  await clickByText('返回主菜单')

  // P1-003：村长任务后一次性回应选择与关系分支
  // A. 任务完成前：无回应选择
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-003-A: 完成前村长显示 信任：0 尊敬：0', body.includes('信任：0') && body.includes('尊敬：0'))
  check('P1-003-A: 完成前无回应选择按钮', !body.includes('村子平安就好。') && !body.includes('我会继续追查这些异动。'))
  await clickByText('结束交谈')

  // B. 正式完成任务
  await clickByText('查看委托')
  await clickByText('接受任务')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('提交任务')
  await sleep(300)
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-003-B: 完成后村长显示 信任：1 尊敬：0', body.includes('信任：1') && body.includes('尊敬：0'))
  check('P1-003-B: 完成后显示回应提示与两个选项', body.includes('村长看着你，神色比之前放松了一些。') && body.includes('村子平安就好。') && body.includes('我会继续追查这些异动。'))
  check('P1-003-B: 两个回应按钮启用', (await buttonDisabled('村子平安就好。')) === false && (await buttonDisabled('我会继续追查这些异动。')) === false)

  // C. 选择 resolve：尊敬 0→1，信任保持 1，按钮永久消失
  await clickByText('我会继续追查这些异动。')
  await sleep(300)
  body = await bodyText()
  check('P1-003-C: resolve 后尊敬 0→1 且信任仍 1', body.includes('信任：1') && body.includes('尊敬：1'))
  check('P1-003-C: 回应后按钮与提示消失', !body.includes('村子平安就好。') && !body.includes('我会继续追查这些异动。') && !body.includes('村长看着你，神色比之前放松了一些。'))
  await clickByText('结束交谈')

  // D. 重复交谈不可重选
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-003-D: 再次交谈仍 信任：1 尊敬：1', body.includes('信任：1') && body.includes('尊敬：1'))
  check('P1-003-D: 不可重选（无回应按钮）', !body.includes('村子平安就好。'))
  await clickByText('结束交谈')

  // E. Save + Continue 后仍 1/1 且不可重选
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-003-E: Continue 后仍 信任：1 尊敬：1', body.includes('信任：1') && body.includes('尊敬：1'))
  check('P1-003-E: Continue 后不可重选', !body.includes('村子平安就好。'))
  await clickByText('结束交谈')

  // F. 其他 NPC 无关系 UI
  await clickNthTalk(1)
  body = await bodyText()
  check('P1-003-F: 铁匠无关系数值 UI', !body.includes('信任：') && !body.includes('尊敬：'))
  await clickByText('结束交谈')
  await clickByText('返回主菜单')

  // P1-004：村长关系值驱动后续对话反应（只读 UI，gameStore 零修改）
  // A. resolve 分支：点击后当前对话立即切换为尊敬反应文案，旧 greeting 不再同时显示
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('查看委托')
  await clickByText('接受任务')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('提交任务')
  await sleep(300)
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-004-A: 未回应时仍显示原 greeting', body.includes('村外的野兽越来越不安分'))
  await clickByText('我会继续追查这些异动。')
  await sleep(300)
  body = await bodyText()
  check('P1-004-A: resolve 后立即切换为尊敬反应文案', body.includes('村长郑重地点了点头') && body.includes('若你还要继续追查，务必小心'))
  check('P1-004-A: 旧 greeting 不再同时显示', !body.includes('村外的野兽越来越不安分'))
  check('P1-004-A: 关系仍显示 信任：1 尊敬：1', body.includes('信任：1') && body.includes('尊敬：1'))
  check('P1-004-A: 回应按钮仍消失', !body.includes('村子平安就好。'))
  await clickByText('结束交谈')

  // B. 重新交谈保持 resolve 文案
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-004-B: 重新交谈保持尊敬反应文案', body.includes('村长郑重地点了点头'))
  check('P1-004-B: 仍显示 信任：1 尊敬：1', body.includes('信任：1') && body.includes('尊敬：1'))
  await clickByText('结束交谈')

  // C. Save + Continue 后仍 resolve 文案
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-004-C: Continue 后保持尊敬反应文案', body.includes('村长郑重地点了点头'))
  check('P1-004-C: Continue 后仍 信任：1 尊敬：1', body.includes('信任：1') && body.includes('尊敬：1'))
  await clickByText('结束交谈')
  await clickByText('返回主菜单')

  // D. reassure 分支：点击后立即切换为信任反应文案
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('查看委托')
  await clickByText('接受任务')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('提交任务')
  await sleep(300)
  await clickNthTalk(0)
  await clickByText('村子平安就好。')
  await sleep(300)
  body = await bodyText()
  check('P1-004-D: reassure 后立即切换为信任反应文案', body.includes('村长舒展了眉头') && body.includes('好，村里能安稳一些就好'))
  check('P1-004-D: 旧 greeting 不再显示', !body.includes('村外的野兽越来越不安分'))
  check('P1-004-D: 关系显示 信任：2 尊敬：0', body.includes('信任：2') && body.includes('尊敬：0'))
  check('P1-004-D: 回应按钮消失', !body.includes('我会继续追查这些异动。'))
  await clickByText('结束交谈')

  // E. reassure 重新交谈保持 + 铁匠无关系反应扩张
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-004-E: 重新交谈保持信任反应文案', body.includes('村长舒展了眉头'))
  await clickByText('结束交谈')
  await clickNthTalk(1)
  body = await bodyText()
  check('P1-004-E: 铁匠无关系反应扩张', !body.includes('村长郑重地点了点头') && !body.includes('村长舒展了眉头'))
  await clickByText('结束交谈')
  await clickByText('返回主菜单')

  // P1-005：第二个正式任务《矿洞清理》
  // A. 新游戏时任务未出现（不显示「矿洞清理」/「铁匠似乎有事相托」），《村外异动》原入口保持
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P1-005-A: 新游戏青石村无矿洞清理入口', !body.includes('矿洞清理') && !body.includes('铁匠似乎有事相托'))
  check('P1-005-A: 村外异动原入口保持', body.includes('村长似乎有事相托。'))

  // B. 正式完成第一任务后解锁
  await clickByText('查看委托')
  await clickByText('接受任务')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-005-B: 第一任务完成且金币 70', body.includes('已完成') && body.includes('70'))
  check('P1-012-E: 《村外异动》完成不显示升级提示', !body.includes('等级提升！'))
  check('P1-005-B: 铁匠新委托出现', body.includes('铁匠似乎有事相托。'))

  // C. 发现并接受《矿洞清理》
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('P1-005-C: 矿洞清理可接受（发布者铁匠）', body.includes('矿洞清理') && body.includes('发布者：铁匠') && body.includes('可接受'))
  await clickByText('接受任务')
  body = await bodyText()
  check('P1-005-C: 矿洞清理进行中', body.includes('矿洞清理') && body.includes('进行中'))

  // D. 正式进入矿洞战斗（固定随机击败魔化鼠）
  await clickByText('废弃矿洞')
  body = await bodyText()
  check('P1-005-D: 废弃矿洞出现魔化鼠', body.includes('魔化鼠') && body.includes('迎战'))
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })

  // E. 同一次胜利同时产生任务推进与战利品
  await clickByText('返回冒险')
  body = await bodyText()
  check('P1-005-E: 胜利后获得铁矿石 ×1', body.includes('铁矿石') && body.includes('×1'))
  await clickByText('青石村')
  body = await bodyText()
  check('P1-005-E: 矿洞清理可完成', body.includes('矿洞清理') && body.includes('可完成'))

  // F. 提交第二任务
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-005-F: 矿洞清理已完成且金币 85', body.includes('矿洞清理') && body.includes('已完成') && body.includes('85'))
  check('P1-012-E: 《矿洞清理》完成不显示升级提示', !body.includes('等级提升！'))

  // G. 无关系副作用：铁匠交谈无关系数值，村长既有关系不变
  await clickNthTalk(1)
  body = await bodyText()
  check('P1-005-G: 铁匠交谈无关系数值 UI', !body.includes('信任：') && !body.includes('尊敬：'))
  await clickByText('结束交谈')
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-005-G: 村长关系保持 信任：1 尊敬：0（未受矿洞任务影响）', body.includes('信任：1') && body.includes('尊敬：0'))
  await clickByText('结束交谈')

  // H. Save + Continue 保持任务完成/金币/铁矿石
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P1-005-H: Continue 后矿洞清理已完成', body.includes('矿洞清理') && body.includes('已完成'))
  check('P1-005-H: Continue 后金币 85 且铁矿石 ×1', body.includes('85') && body.includes('铁矿石') && body.includes('×1'))
  await clickByText('返回主菜单')

  // P1-006：骑士职业技能「骑士重击」
  // A. 默认骑士拥有职业技能（无法术攻击）
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P1-006-A: 战斗页职业显示骑士', body.includes('骑士'))
  check('P1-006-A: 显示灵力 6 / 6', body.includes('6 / 6'))
  check('P1-006-A: 显示骑士重击（2 灵力）', body.includes('骑士重击（2 灵力）'))
  check('P1-006-A: 骑士重击按钮启用', (await buttonDisabled('骑士重击')) === false)
  check('P1-006-A: 不显示法术攻击/迅捷突袭/压制猛击', !body.includes('法术攻击') && !body.includes('迅捷突袭') && !body.includes('压制猛击'))

  // B. 逐次 MP 消费：骑士重击天然1 + 敌天然1，6→4→2→0（魔化兔保持 8/8，玩家 HP 逐回合锁定不变）
  let initialPlayerHp = readHps(await bodyText()).player
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.0
  })
  await clickByText('骑士重击')
  await sleep(300)
  body = await bodyText()
  check('P1-006-B: 第一次重击后灵力 4 / 6', body.includes('4 / 6'))
  check('P1-006-B: 第一次重击后魔化兔仍 HP 8 / 8', body.includes('8 / 8'))
  check('P1-006-B: 第一次天然1后玩家 HP 不变', readHps(body).player === initialPlayerHp)
  await clickByText('骑士重击')
  await sleep(300)
  body = await bodyText()
  check('P1-006-B: 第二次重击后灵力 2 / 6', body.includes('2 / 6'))
  check('P1-006-B: 第二次重击后魔化兔仍 HP 8 / 8', body.includes('8 / 8'))
  check('P1-006-B: 第二次天然1后玩家 HP 不变', readHps(body).player === initialPlayerHp)
  await clickByText('骑士重击')
  await sleep(300)
  body = await bodyText()
  check('P1-006-B: 第三次重击后灵力 0 / 6', body.includes('0 / 6'))
  check('P1-006-B: 第三次重击后魔化兔仍 HP 8 / 8', body.includes('8 / 8'))
  check('P1-006-B: 第三次天然1后玩家 HP 不变', readHps(body).player === initialPlayerHp)
  check('P1-006-B: 骑士重击禁用+灵力不足', (await buttonDisabled('骑士重击')) === true && body.includes('灵力不足'))
  check('P1-006-B: 普通攻击仍启用', (await buttonDisabled('普通攻击')) === false)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })

  // C. MP0 普通攻击天然20 胜利，MP 仍 0/6（普攻不消费 MP）
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-006-C: MP0 普通攻击战斗胜利', body.includes('战斗胜利'))
  check('P1-006-C: 普通攻击后灵力仍 0 / 6', body.includes('0 / 6'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })

  // D. 返回冒险 → 青石村休整恢复灵力
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('休整')
  await sleep(300)
  body = await bodyText()
  check('P1-006-D: 休整后灵力 6 / 6', body.includes('6 / 6'))

  // E. 真实骑士重击命中：天然20，STR14 重击伤害 8 暴击 16 击败魔化兔，MP 6→4，敌人不反击（玩家 HP 不变）
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  const beforeStrikePlayerHp = readHps(await bodyText()).player
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('骑士重击')
  await sleep(300)
  body = await bodyText()
  check('P1-006-E: 显示你的骑士重击', body.includes('你的骑士重击'))
  check('P1-006-E: 暴击造成 16 点伤害', body.includes('暴击') && body.includes('造成 16 点伤害'))
  check('P1-006-E: 骑士重击暴击战斗胜利', body.includes('战斗胜利'))
  check('P1-006-E: 致死后玩家 HP 未下降（敌人不反击）', readHps(body).player === beforeStrikePlayerHp)
  check('P1-006-E: 无魔化兔的攻击（敌人未行动）', !body.includes('魔化兔的攻击：'))
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })

  // F. 战斗后 MP 保留 + Save/Continue
  await clickByText('返回冒险')
  body = await bodyText()
  check('P1-006-F: 战斗后灵力 4 / 6', body.includes('4 / 6'))
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P1-006-F: Continue 后灵力仍 4 / 6', body.includes('4 / 6'))
  await clickByText('返回主菜单')

  // G. 法师隔离：创建法师后只有法术攻击，无骑士重击
  await clickByText('新游戏')
  await clickLabel('法师')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P1-006-G: 法师显示法术攻击（2 灵力）', body.includes('法术攻击（2 灵力）'))
  check('P1-006-G: 法师不显示骑士重击', !body.includes('骑士重击'))
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await clickByText('返回主菜单')

  // P1-007：游侠职业技能「迅捷突袭」（每场一次、不耗 MP、AGI 攻击）
  // 本段只保存一次真实 Math.random（P1-007-R1：mock 不泄漏给后续测试）
  await page.evaluate(() => {
    window.__p1007OriginalRandom = Math.random.bind(Math)
  })
  // A. 游侠拥有迅捷突袭（无法术攻击/骑士重击）
  await clickByText('新游戏')
  await clickLabel('游侠')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P1-007-A: 战斗页职业显示游侠', body.includes('游侠'))
  check('P1-007-A: 显示普通攻击与迅捷突袭', body.includes('普通攻击') && body.includes('迅捷突袭'))
  check('P1-007-A: 迅捷突袭按钮启用', (await buttonDisabled('迅捷突袭')) === false)
  check('P1-007-A: 游侠不显示法术攻击/骑士重击/压制猛击', !body.includes('法术攻击') && !body.includes('骑士重击') && !body.includes('压制猛击'))

  // B. 天然1仍消耗本场次数：敌 HP/玩家 HP/MP 均不变
  const rangerInitialHp = readHps(await bodyText()).player
  await page.evaluate(() => {
    Math.random = () => 0.0
  })
  await clickByText('迅捷突袭')
  await sleep(300)
  body = await bodyText()
  check('P1-007-B: 显示你的迅捷突袭与大失败', body.includes('你的迅捷突袭') && body.includes('大失败'))
  check('P1-007-B: 天然1后魔化兔仍 HP 8 / 8', body.includes('8 / 8'))
  check('P1-007-B: 天然1后玩家 HP 不变', readHps(body).player === rangerInitialHp)
  check('P1-007-B: 天然1后玩家 MP 不变（仍 6 / 6）', body.includes('6 / 6'))
  check('P1-007-B: 迅捷突袭禁用+本场战斗已使用', (await buttonDisabled('迅捷突袭')) === true && body.includes('本场战斗已使用'))
  check('P1-007-B: 普通攻击仍启用', (await buttonDisabled('普通攻击')) === false)

  // C. 不能再次使用（disabled 状态锁定）
  check('P1-007-C: 迅捷突袭保持禁用', (await buttonDisabled('迅捷突袭')) === true)

  // D. 普通攻击继续结束战斗（与迅捷突袭使用状态互不影响；直接切换 mock，不覆盖已保存的真实函数）
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-007-D: 普通攻击战斗胜利', body.includes('战斗胜利'))
  check('P1-007-D: MP 仍未变化（仍 6 / 6）', body.includes('6 / 6'))
  // 第一场结束：恢复真实随机
  await page.evaluate(() => {
    Math.random = window.__p1007OriginalRandom
  })

  // E. 下一场战斗迅捷突袭重新可用（局部 boolean 随新 CombatPage 重置；返回冒险后仍在村外草原）
  await clickByText('返回冒险')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P1-007-E: 第二场迅捷突袭重新启用', (await buttonDisabled('迅捷突袭')) === false)
  check('P1-007-E: 无本场战斗已使用残留', !body.includes('本场战斗已使用'))

  // F. 真实迅捷突袭暴击：AGI10 base 6 暴击 12 击败魔化兔，无敌人反击，MP 保持
  const beforeSwiftHp = readHps(await bodyText()).player
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  await clickByText('迅捷突袭')
  await sleep(300)
  body = await bodyText()
  check('P1-007-F: 显示你的迅捷突袭', body.includes('你的迅捷突袭'))
  check('P1-007-F: 暴击造成 12 点伤害', body.includes('暴击') && body.includes('造成 12 点伤害'))
  check('P1-007-F: 迅捷突袭暴击战斗胜利', body.includes('战斗胜利'))
  check('P1-007-F: 致死后玩家 HP 未下降（敌人不反击）', readHps(body).player === beforeSwiftHp)
  check('P1-007-F: 无魔化兔的攻击（敌人未行动）', !body.includes('魔化兔的攻击：'))
  check('P1-007-F: MP 仍 6 / 6（不消费 MP）', body.includes('6 / 6'))
  // P1-007-R1：确定性断言——恢复后 Math.random 与段首保存的真实函数同一引用
  const randomRestored = await page.evaluate(() => {
    const original = window.__p1007OriginalRandom
    Math.random = original
    const isOriginal = Math.random === original
    delete window.__p1007OriginalRandom
    return isOriginal
  })
  check('P1-007-R1: 段末 Math.random 已恢复真实实现（不污染后续测试）', randomRestored === true)
  await clickByText('返回冒险')
  await clickByText('返回主菜单')

  // P1-008：战士职业技能「压制猛击」（2 灵力；命中且敌人未死 → 本次敌人不反击；未命中 → 正常反击）
  // 本段只保存一次真实 Math.random（P1-008-R1 模式：mock 不泄漏给后续测试）
  await page.evaluate(() => {
    window.__p1008OriginalRandom = Math.random.bind(Math)
  })
  // A. 战士技能隔离：仅显示压制猛击（2 灵力），无其他职业技能
  await clickByText('新游戏')
  await clickLabel('战士')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P1-008-A: 战斗页职业显示战士', body.includes('战士'))
  check('P1-008-A: 显示灵力 6 / 6', body.includes('6 / 6'))
  check('P1-008-A: 显示压制猛击（2 灵力）', body.includes('压制猛击（2 灵力）'))
  check('P1-008-A: 压制猛击按钮启用', (await buttonDisabled('压制猛击')) === false)
  check('P1-008-A: 战士不显示法术攻击/骑士重击/迅捷突袭', !body.includes('法术攻击') && !body.includes('骑士重击') && !body.includes('迅捷突袭'))

  // B. 命中压制成功：D20 7 + 攻击加值 4 = 11 命中魔化兔 DEF11；STR14 无武器伤害 6 → 兔 HP 8→2，本次敌人不反击
  const warriorInitialHp = readHps(await bodyText()).player
  await page.evaluate(() => {
    Math.random = () => 0.3 // D20 = floor(0.3*20)+1 = 7
  })
  await clickByText('压制猛击')
  await sleep(300)
  body = await bodyText()
  check('P1-008-B: 显示你的压制猛击', body.includes('你的压制猛击'))
  check('P1-008-B: 命中并造成 6 点伤害', body.includes('命中') && body.includes('造成 6 点伤害'))
  check('P1-008-B: MP 6→4', body.includes('4 / 6'))
  check('P1-008-B: 魔化兔 HP 8→2', body.includes('2 / 8'))
  check('P1-008-B: 玩家 HP 不变（压制反击未发生）', readHps(body).player === warriorInitialHp)
  check('P1-008-B: 无魔化兔的攻击（敌人未行动）', !body.includes('魔化兔的攻击：'))
  check('P1-008-B: 战斗仍在进行（phase active）', body.includes('普通攻击') && (await buttonDisabled('普通攻击')) === false)
  check('P1-008-B: 压制猛击仍启用（MP4 足够，无本场次数限制）', (await buttonDisabled('压制猛击')) === false)

  // C. 未命中不压制：第二次压制猛击天然1 + 敌人天然20 → MP 4→2、敌 HP 仍 2、敌人反击且玩家 HP 下降
  await page.evaluate(() => {
    let i = 0
    const seq = [0.0, 0.99]
    Math.random = () => seq[i++ % 2]
  })
  await clickByText('压制猛击')
  await sleep(300)
  body = await bodyText()
  check('P1-008-C: 显示你的压制猛击：大失败', body.includes('你的压制猛击') && body.includes('大失败'))
  check('P1-008-C: MP 4→2', body.includes('2 / 6'))
  check('P1-008-C: 魔化兔仍 HP 2 / 8（未命中不造成伤害）', body.includes('2 / 8'))
  check('P1-008-C: 出现魔化兔的攻击（未命中正常反击）', body.includes('魔化兔的攻击：'))
  check('P1-008-C: 玩家 HP 明确下降（敌人天然20 反击）', readHps(body).player < warriorInitialHp)

  // D. 普通攻击天然20 结束战斗（普攻不消费 MP）
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-008-D: 普通攻击战斗胜利', body.includes('战斗胜利'))
  check('P1-008-D: MP 仍 2 / 6（普通攻击不消费 MP）', body.includes('2 / 6'))

  // E. 返回青石村休整：HP 恢复满、MP 2→6（复用既有休整规则）
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('休整')
  await sleep(300)
  body = await bodyText()
  check('P1-008-E: 休整后灵力 6 / 6', body.includes('6 / 6'))
  const restHpMatch = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  check('P1-008-E: 休整后生命恢复满（当前 HP === 上限）', restHpMatch !== null && restHpMatch[1] === restHpMatch[2])

  // F. Save / Continue 保留 MP：再战一场压制猛击天然20 击杀，MP 6→4，保存后 Continue 仍 4/6
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  await clickByText('压制猛击')
  await sleep(300)
  body = await bodyText()
  check('P1-008-F: 压制猛击天然20 暴击胜利', body.includes('战斗胜利') && body.includes('暴击'))
  await clickByText('返回冒险')
  body = await bodyText()
  check('P1-008-F: 战斗后灵力 4 / 6', body.includes('4 / 6'))
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P1-008-F: Continue 后灵力仍 4 / 6', body.includes('4 / 6'))
  await clickByText('返回主菜单')
  // P1-008-R1 模式：确定性断言——段末 Math.random 与段首保存的真实函数同一引用
  const p1008Restored = await page.evaluate(() => {
    const original = window.__p1008OriginalRandom
    Math.random = original
    const isOriginal = Math.random === original
    delete window.__p1008OriginalRandom
    return isOriginal
  })
  check('P1-008-R1: 段末 Math.random 已恢复真实实现（不污染后续测试）', p1008Restored === true)

  // P1-010：第三个正式任务《草原狼影》（复用既有 corrupted_wolf；仅《矿洞清理》完成后由村长发布）
  // 本段只保存一次真实 Math.random（P1-007-R1 模式：mock 不泄漏给后续测试）
  await page.evaluate(() => {
    window.__p1010OriginalRandom = Math.random.bind(Math)
  })
  // 多敌人卡片精准定位：先找名字所在元素，再向上找含「迎战」按钮的最近卡片容器（只用于解决多敌人卡片，不引入测试框架）
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

  // A. 新游戏：不存在《草原狼影》；草原无魔化狼（只有魔化兔）
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  body = await bodyText()
  check('P1-010-A: 新游戏青石村无草原狼影', !body.includes('草原狼影'))
  check('P1-010-A: 村外异动原入口保持', body.includes('村长似乎有事相托。'))
  await clickByText('村外草原')
  body = await bodyText()
  check('P1-010-A: 草原只有魔化兔、无魔化狼', body.includes('魔化兔') && !body.includes('魔化狼'))

  // B. 正式完成《村外异动》：仍无《草原狼影》
  await clickByText('青石村')
  await clickByText('查看委托')
  await clickByText('接受任务')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-010-B: 村外异动完成且金币 70', body.includes('已完成') && body.includes('70'))
  check('P1-010-B: 第一任务完成后仍无草原狼影', !body.includes('草原狼影'))

  // C. 正式完成《矿洞清理》：金币 85，村长新委托《草原狼影》出现（发布者：村长 可接受）
  await clickByText('查看委托')
  await clickByText('接受任务')
  await clickByText('废弃矿洞')
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await clickByText('返回冒险')
  await clickByText('青石村')
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-010-C: 矿洞清理完成且金币 85', body.includes('矿洞清理') && body.includes('已完成') && body.includes('85'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('P1-010-C: 草原狼影可接受（发布者村长）', body.includes('草原狼影') && body.includes('发布者：村长') && body.includes('可接受'))

  // D. 接受后：进行中；草原魔化兔仍存在且魔化狼出现
  await clickByText('接受任务')
  body = await bodyText()
  check('P1-010-D: 草原狼影进行中', body.includes('草原狼影') && body.includes('进行中'))
  await clickByText('村外草原')
  body = await bodyText()
  check('P1-010-D: 魔化兔仍存在且魔化狼出现', body.includes('魔化兔') && body.includes('魔化狼'))

  // E. 精准进入魔化狼战斗：Lv.2 / HP 12/12 / 防御 12；骑士 STR14 普攻天然20 暴击 12 伤一次击杀
  await engageEnemy('魔化狼')
  body = await bodyText()
  check(
    'P1-010-E: 战斗页魔化狼 Lv.2 HP 12 / 12 防御 12',
    body.includes('魔化狼') && body.includes('Lv.2') && body.includes('12 / 12') && body.includes('防御 12'),
  )
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-010-E: 魔化狼战斗胜利', body.includes('战斗胜利'))

  // F. 胜利后返回：任务可完成；魔化狼从威胁列表消失（任务生命周期控制，非永久刷怪），魔化兔仍存在
  // （委托 summary 含「魔化狼」文本，因此用「附近威胁」区域精确断言，不检查整页）
  await clickByText('返回冒险')
  body = await bodyText()
  check('P1-010-F: 草原狼影可完成', body.includes('草原狼影') && body.includes('可完成'))
  const threatsAfterWolf = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('附近威胁'))
    if (!heading) return null
    const section = heading.closest('section')
    return section ? section.textContent : ''
  })
  check(
    'P1-010-F: 附近威胁区魔化狼消失且魔化兔仍存在',
    threatsAfterWolf !== null && !threatsAfterWolf.includes('魔化狼') && threatsAfterWolf.includes('魔化兔'),
  )

  // G. 回村提交：金币 85→110；村长关系不受第三任务影响（信任：1 尊敬：0）
  await clickByText('青石村')
  body = await bodyText()
  check('P1-012-A: 第三任务提交前不显示升级提示', !body.includes('等级提升！') && !body.includes('你已达到 Lv.2。'))
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-010-G: 草原狼影已完成且金币 110', body.includes('草原狼影') && body.includes('已完成') && body.includes('110'))
  // TM-P1-011-J：提交瞬间里程碑升级——Lv1→Lv2、maxHp+2、maxMp+1；当前 HP/MP 不恢复（狼天然20 一次击杀未受伤）
  const levelUpHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const levelUpMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  check('P1-011-J: 提交瞬间升级 Lv.2', body.includes('Lv.2'))
  check('P1-011-J: 生命 22 / 24（当前不恢复）', levelUpHp !== null && levelUpHp[1] === '22' && levelUpHp[2] === '24')
  check('P1-011-J: 灵力 6 / 7（当前不恢复）', levelUpMp !== null && levelUpMp[1] === '6' && levelUpMp[2] === '7')
  // TM-P1-012-B：提交成功立即显示升级提示（文案读取封板常量渲染）
  check('P1-012-B: 提交后显示等级提升！', body.includes('等级提升！'))
  check('P1-012-B: 显示你已达到 Lv.2。', body.includes('你已达到 Lv.2。'))
  check('P1-012-B: 显示最大生命 +2，最大灵力 +1。', body.includes('最大生命 +2，最大灵力 +1。'))
  check('P1-012-B: 显示知道了按钮', body.includes('知道了'))
  await clickByText('知道了')
  await sleep(300)
  body = await bodyText()
  // TM-P1-012-C（R1 补强）：点击知道了后提示消失，且完整锁定四类角色状态——关闭提示本身无 GameState 副作用
  const noticeClosedHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const noticeClosedMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  check('P1-012-C: 点击知道了后提示消失', !body.includes('等级提升！') && !body.includes('你已达到 Lv.2。'))
  check('P1-012-C: 关闭提示后仍 Lv.2', body.includes('Lv.2'))
  check('P1-012-C: 关闭提示后生命仍 22 / 24', noticeClosedHp !== null && noticeClosedHp[1] === '22' && noticeClosedHp[2] === '24')
  check('P1-012-C: 关闭提示后灵力仍 6 / 7', noticeClosedMp !== null && noticeClosedMp[1] === '6' && noticeClosedMp[2] === '7')
  check('P1-012-C: 关闭提示后金币仍 110', body.includes('110'))
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-010-G: 村长关系保持 信任：1 尊敬：0（第三任务无关系副作用）', body.includes('信任：1') && body.includes('尊敬：0'))
  await clickByText('结束交谈')

  // H. Save + Continue：任务完成/金币 110 保持；草原不再显示魔化狼
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P1-010-H: Continue 后草原狼影已完成且金币 110', body.includes('草原狼影') && body.includes('已完成') && body.includes('110'))
  // TM-P1-011-L：Continue（休整前）保留 Lv.2 与新上限
  const continueHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const continueMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  check('P1-011-L: Continue 后保持 Lv.2', body.includes('Lv.2'))
  check('P1-011-L: Continue 后生命 22 / 24', continueHp !== null && continueHp[1] === '22' && continueHp[2] === '24')
  check('P1-011-L: Continue 后灵力 6 / 7', continueMp !== null && continueMp[1] === '6' && continueMp[2] === '7')
  check('P1-012-D: Continue 不重复显示升级提示', !body.includes('等级提升！') && !body.includes('知道了'))
  await clickByText('村外草原')
  body = await bodyText()
  const threatsAfterContinue = await page.evaluate(() => {
    const heading = [...document.querySelectorAll('h3')].find((h) => h.textContent.includes('附近威胁'))
    if (!heading) return null
    const section = heading.closest('section')
    return section ? section.textContent : ''
  })
  check(
    'P1-010-H: Continue 后附近威胁区不显示魔化狼且魔化兔仍存在',
    threatsAfterContinue !== null && !threatsAfterContinue.includes('魔化狼') && threatsAfterContinue.includes('魔化兔'),
  )
  await clickByText('青石村')
  // TM-P1-011-M：休整读取新上限（复用既有 restAtVillage，未修改休整规则）
  await clickByText('休整')
  await sleep(300)
  body = await bodyText()
  const restHpUpgraded = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const restMpUpgraded = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  check('P1-011-M: 休整后生命 24 / 24（新上限）', restHpUpgraded !== null && restHpUpgraded[1] === '24' && restHpUpgraded[2] === '24')
  check('P1-011-M: 休整后灵力 7 / 7（新上限）', restMpUpgraded !== null && restMpUpgraded[1] === '7' && restMpUpgraded[2] === '7')
  await clickByText('返回主菜单')
  // P1-007-R1 模式：确定性断言——段末 Math.random 与段首保存的真实函数同一引用
  const p1010Restored = await page.evaluate(() => {
    const original = window.__p1010OriginalRandom
    Math.random = original
    const isOriginal = Math.random === original
    delete window.__p1010OriginalRandom
    return isOriginal
  })
  check('P1-010-R1: 段末 Math.random 已恢复真实实现（不污染后续测试）', p1010Restored === true)

  // TM-P1-016：青石村阶段收束——向村长汇报《兔子的路径》
  // 直接复用 P1-010 段已保存的正式长流程存档（Lv.2、狼 completed、金币 110、青石村）→ 不再复制前三任务
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-016-A: Continue 后狼任务已完成且金币 110', body.includes('草原狼影') && body.includes('已完成') && body.includes('110'))
  // A. 无地图/未查看：村长对话不存在「向村长展示《兔子的路径》」（汇报入口前置严格）
  await clickByText('交谈')
  body = await bodyText()
  check('P1-016-A: 无地图时村长对话无汇报按钮', !body.includes('向村长展示《兔子的路径》'))
  await clickByText('结束交谈')
  // 获取《兔子的路径》：村外草原 → 兔王巢穴 → 确定性击败嘟嘟兔（复用 P012 序列：玩家20暴击12 → 24→12；嘟嘟兔天然1；玩家20暴击12 → 击杀）
  await clickByText('村外草原')
  await clickByText('兔王巢穴')
  await sleep(300)
  await page.evaluate(() => {
    window.__p1016OriginalRandom = Math.random.bind(Math)
    const seq = [0.999, 0, 0.999]
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('迎战')
  await sleep(300)
  await clickByText('普通攻击')
  await sleep(250)
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-016-A: 确定性击败嘟嘟兔（战斗胜利）', body.includes('战斗胜利'))
  await clickByText('返回冒险')
  body = await bodyText()
  check('P1-016-A: 背包显示兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  // A. 已持有地图但尚未展开（rabbit_path_examined !== true）：村长对话仍无汇报按钮
  await clickByText('村外草原')
  await clickByText('青石村')
  await clickByText('交谈')
  body = await bodyText()
  check('P1-016-A: 已持图未查看时村长对话仍无汇报按钮', !body.includes('向村长展示《兔子的路径》'))
  await clickByText('结束交谈')
  // 展开地图（P1-013 既有入口）→ examined=true
  await clickByText('村外草原')
  await clickByText('兔王巢穴')
  await sleep(300)
  await clickByText('展开地图')
  await sleep(300)
  body = await bodyText()
  check('P1-016-A: 展开地图后已查看且具体地点仍【待补充】', body.includes('具体地点：【待补充】') && !body.includes('展开地图'))
  await clickByText('村外草原')
  await clickByText('青石村')
  // B. 已查看+狼 completed：村长对话显示汇报入口（enabled）
  await clickByText('交谈')
  body = await bodyText()
  check('P1-016-B: 村长对话显示带回地图文案', body.includes('你带回了一张指向黄金兔子王所在之地的地图。'))
  check('P1-016-B: 向村长展示按钮 enabled', (await buttonDisabled('向村长展示《兔子的路径》')) === false)
  // C. 记录汇报前状态
  const reportBeforeLv = body.match(/Lv\.(\d+)/)
  const reportBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const reportBeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const reportBeforeGold = body.match(/金币\s*(\d+)/)
  const reportBeforeLocation = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  // D. 正式汇报
  await clickByText('向村长展示《兔子的路径》')
  await sleep(300)
  body = await bodyText()
  check('P1-016-D: 已汇报文案（展示给村长）', body.includes('你已经把《兔子的路径》展示给村长。'))
  check('P1-016-D: 地图仍指向黄金兔子王所在之地', body.includes('地图仍指向黄金兔子王所在之地。'))
  check('P1-016-D: 下一步目的地：【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-016-D: 向村长展示按钮消失（不残留 disabled）', !body.includes('向村长展示《兔子的路径》'))
  // E. 无副作用：与 C 对比
  const reportAfterLv = body.match(/Lv\.(\d+)/)
  const reportAfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const reportAfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const reportAfterGold = body.match(/金币\s*(\d+)/)
  check(
    'P1-016-E: 汇报后等级/生命/灵力/金币全不变',
    reportBeforeLv !== null && reportAfterLv !== null && reportBeforeLv[1] === reportAfterLv[1] &&
      reportBeforeHp !== null && reportAfterHp !== null && reportBeforeHp[1] === reportAfterHp[1] && reportBeforeHp[2] === reportAfterHp[2] &&
      reportBeforeMp !== null && reportAfterMp !== null && reportBeforeMp[1] === reportAfterMp[1] && reportBeforeMp[2] === reportAfterMp[2] &&
      reportBeforeGold !== null && reportAfterGold !== null && reportBeforeGold[1] === reportAfterGold[1],
  )
  check('P1-016-E: 兔子的路径仍 ×1（展示不交出）', body.includes('兔子的路径 ×1'))
  check('P1-016-E: 村长关系信任：1 尊敬：0 不变', body.includes('信任：1') && body.includes('尊敬：0'))
  check('P1-016-E: 当前位置仍 qingshi_village', reportBeforeLocation === 'qingshi_village')
  await clickByText('结束交谈')
  // F. 冒险页阶段完成 panel
  body = await bodyText()
  check('P1-016-F: 显示青石村阶段完成', body.includes('青石村阶段完成'))
  check('P1-016-F: 阶段正文（处理三威胁并取得地图）', body.includes('你已经处理了村外异动、矿洞威胁与草原狼影，并取得了《兔子的路径》。'))
  check('P1-016-F: 下一步目的地：【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-016-F: 无新地点按钮（无前往【待补充】/下一章/进入新区域）', !body.includes('前往【待补充】') && !body.includes('下一章') && !body.includes('进入新区域'))
  // G. Save/Continue 保持 reported；重开村长不重复汇报
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  body = await bodyText()
  check('P1-016-G: Continue 后青石村阶段完成保持', body.includes('青石村阶段完成'))
  check('P1-016-G: Continue 后下一步目的地：【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-016-G: Continue 后兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  await clickByText('交谈')
  body = await bodyText()
  check('P1-016-G: 重开村长仍显示已汇报文案', body.includes('你已经把《兔子的路径》展示给村长。'))
  check('P1-016-G: 重开村长不再显示汇报按钮', !body.includes('向村长展示《兔子的路径》'))
  await clickByText('结束交谈')
  await clickByText('返回主菜单')
  // P1-007-R1 模式：段末 Math.random 与段首保存的真实函数同一引用
  const p1016Restored = await page.evaluate(() => {
    const original = window.__p1016OriginalRandom
    Math.random = original
    const isOriginal = Math.random === original
    delete window.__p1016OriginalRandom
    return isOriginal
  })
  check('P1-016-R1: 段末 Math.random 已恢复真实实现（不污染后续测试）', p1016Restored === true)

  // TM-P1-017：第四正式主线目标《追寻黄金兔子王》（直接继续 P1-016 汇报完成档，不重打前三任务/狼/嘟嘟兔）
  // A. Continue 后：阶段完成 panel 保留 + 地图仍 ×1 + 附近委托出现第四任务入口（未发现状态只显示「村长似乎有事相托。」，不显示任务卡）
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-017-A: Continue 后青石村阶段完成保留', body.includes('青石村阶段完成'))
  check('P1-017-A: 兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  check('P1-017-A: 附近委托出现第四任务入口（村长似乎有事相托）', body.includes('村长似乎有事相托。'))
  check('P1-017-A: 未发现状态不直接显示追寻黄金兔子王任务卡', !body.includes('追寻黄金兔子王'))
  // B. 发现任务：查看委托 → 可接受
  await clickByText('查看委托')
  body = await bodyText()
  check('P1-017-B: 追寻黄金兔子王状态可接受', body.includes('追寻黄金兔子王') && body.includes('可接受'))
  check('P1-017-B: 任务描述含《兔子的路径》与具体目的地【待补充】', body.includes('《兔子的路径》指向黄金兔子王所在之地') && body.includes('具体目的地：【待补充】'))
  // D 前置：接受任务前真实记录金币（P1-017-R1：不能只证明存在金币数字）
  const p1017GoldBefore = body.match(/金币\s*(\d+)/)
  // C. 接受任务 → 进行中（附近委托入口消失，任务日志显示进行中）
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('P1-017-C: 接受后任务日志显示追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-017-C: 接受后第四任务委托入口消失（村长似乎有事相托不再显示；药师支线入口不受影响）', !body.includes('村长似乎有事相托'))
  // D. 主线状态保持：Lv.2 / 金币不变（before===after 精确对比）/ 地图 ×1 / 阶段完成 / 【待补充】
  const p1017GoldAfter = body.match(/金币\s*(\d+)/)
  check(
    'P1-017-D: 接受任务前后金币精确相等（无即时奖励）',
    p1017GoldBefore !== null && p1017GoldAfter !== null && p1017GoldAfter[1] === p1017GoldBefore[1],
  )
  check('P1-017-D: 青石村阶段完成 panel 仍保留', body.includes('青石村阶段完成'))
  check('P1-017-D: 下一步目的地仍【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-017-D: 兔子的路径仍 ×1（发现/接受不消耗）', body.includes('兔子的路径 ×1'))
  check('P1-017-D: 等级仍 Lv.2', body.includes('Lv.2'))
  // E. 没有新移动入口：从「当前位置」section 内精确读取真实可前往 button 文本集合，排序后精确等于 村外草原+废弃矿洞（P1-017-R1：不得用模糊文本代替）
  check('P1-017-E: 无前往黄金兔子王按钮', !body.includes('前往黄金兔子王'))
  check('P1-017-E: 无前往【待补充】按钮', !body.includes('前往【待补充】'))
  check('P1-017-E: 无进入下一章按钮', !body.includes('下一章') && !body.includes('进入新区域'))
  const p1017TravelButtons = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    const names = [...container.querySelectorAll('button')].map((b) => b.textContent.trim())
    return names.sort()
  })
  check(
    'P1-017-E: 可前往按钮精确等于 [废弃矿洞, 村外草原]（无任何第三个移动入口）',
    JSON.stringify(p1017TravelButtons) === JSON.stringify(['废弃矿洞', '村外草原']),
  )
  // F. Save / Continue：第四任务进行中保持
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-017-F: Continue 后追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-017-F: Continue 后兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  check('P1-017-F: Continue 后青石村阶段完成保留', body.includes('青石村阶段完成'))
  check('P1-017-F: Continue 后具体目的地【待补充】', body.includes('具体目的地：【待补充】'))
  await clickByText('返回主菜单')

  // TM-P1-018：《追寻黄金兔子王》第一步——向村中两人打听地图线索（直接继续 P1-017 第四任务 in_progress 档）
  // A. Continue：进行中 + 地图线索调查 0/2
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-018-A: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-018-A: 地图线索调查 0 / 2', body.includes('地图线索调查：0 / 2'))
  // F 前置：调查开始前记录 Lv/HP/MP/金币/地图数/trust/respect
  const invBeforeLevel = body.match(/Lv\.(\d+)/)
  const invBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const invBeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const invBeforeGold = body.match(/金币\s*(\d+)/)
  const invBeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  // B. 铁匠：打听地图
  await clickNthTalk(1)
  body = await bodyText()
  check('P1-018-B: 铁匠对话显示打听入口', body.includes('你把《兔子的路径》拿给铁匠辨认。'))
  check('P1-018-B: 向铁匠打听地图按钮 enabled', (await buttonDisabled('向铁匠打听地图')) === false)
  await clickByText('向铁匠打听地图')
  await sleep(300)
  body = await bodyText()
  check('P1-018-B: 铁匠固定回复', body.includes('铁匠看了看地图，摇了摇头：“这上面的路线，我认不出来。”'))
  check('P1-018-B: 向铁匠打听地图按钮消失', !body.includes('向铁匠打听地图'))
  // C. 任务仍不能完成
  check('P1-018-C: 仍为进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-018-C: 无提交任务按钮', !body.includes('提交任务'))
  await clickByText('结束交谈')
  body = await bodyText()
  check('P1-018-B: 询问铁匠后调查进度 1 / 2', body.includes('地图线索调查：1 / 2'))
  // D. 药师：打听地图
  await clickNthTalk(2)
  body = await bodyText()
  check('P1-018-D: 药师对话显示打听入口', body.includes('你请药师看看《兔子的路径》上的标记。'))
  check('P1-018-D: 向药师打听地图按钮 enabled', (await buttonDisabled('向药师打听地图')) === false)
  await clickByText('向药师打听地图')
  await sleep(300)
  body = await bodyText()
  check('P1-018-D: 药师固定回复', body.includes('药师仔细辨认了一会儿：“我也没见过这处标记。”'))
  check('P1-018-D: 向药师打听地图按钮消失', !body.includes('向药师打听地图'))
  await clickByText('结束交谈')
  // E. 两人全部调查：2/2 + 调查结果文案 + 仍进行中
  body = await bodyText()
  check('P1-018-E: 地图线索调查 2 / 2', body.includes('地图线索调查：2 / 2'))
  check('P1-018-E: 调查结果固定文案', body.includes('你已经向铁匠和药师打听过，但仍无法确认地图指向的具体地点。'))
  check('P1-018-E: 下一步目的地：【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-018-E: 状态仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  // F. 无副作用：Lv/HP/MP/金币/地图数精确对比（信任/尊敬从村长对话验证）
  const invAfterLevel = body.match(/Lv\.(\d+)/)
  const invAfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const invAfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const invAfterGold = body.match(/金币\s*(\d+)/)
  const invAfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  check(
    'P1-018-F: 调查前后等级/生命/灵力/金币/地图数全不变',
    invBeforeLevel !== null && invAfterLevel !== null && invBeforeLevel[1] === invAfterLevel[1] &&
      invBeforeHp !== null && invAfterHp !== null && invBeforeHp[1] === invAfterHp[1] && invBeforeHp[2] === invAfterHp[2] &&
      invBeforeMp !== null && invAfterMp !== null && invBeforeMp[1] === invAfterMp[1] && invBeforeMp[2] === invAfterMp[2] &&
      invBeforeGold !== null && invAfterGold !== null && invBeforeGold[1] === invAfterGold[1] &&
      invBeforeMapCount !== null && invAfterMapCount !== null && invBeforeMapCount[1] === invAfterMapCount[1],
  )
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-018-F: 村长信任 1 尊敬 0 不变（调查不建立/修改关系）', body.includes('信任：1') && body.includes('尊敬：0'))
  await clickByText('结束交谈')
  // G. 移动入口继续锁定：可前往按钮精确等于 [废弃矿洞, 村外草原]
  const p1018TravelButtons = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => b.textContent.trim()).sort()
  })
  check('P1-018-G: 可前往按钮精确等于 [废弃矿洞, 村外草原]', JSON.stringify(p1018TravelButtons) === JSON.stringify(['废弃矿洞', '村外草原']))
  // H. Save/Continue：2/2 保持；铁匠/药师已询问回复 + 无按钮
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-018-H: Continue 后追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-018-H: Continue 后地图线索调查 2 / 2', body.includes('地图线索调查：2 / 2'))
  check('P1-018-H: Continue 后下一步目的地【待补充】', body.includes('下一步目的地：【待补充】'))
  await clickNthTalk(1)
  body = await bodyText()
  check('P1-018-H: 重开铁匠显示已询问回复', body.includes('铁匠看了看地图，摇了摇头：“这上面的路线，我认不出来。”'))
  check('P1-018-H: 重开铁匠无打听按钮', !body.includes('向铁匠打听地图'))
  await clickByText('结束交谈')
  await clickNthTalk(2)
  body = await bodyText()
  check('P1-018-H: 重开药师显示已询问回复', body.includes('药师仔细辨认了一会儿：“我也没见过这处标记。”'))
  check('P1-018-H: 重开药师无打听按钮', !body.includes('向药师打听地图'))
  await clickByText('结束交谈')
  await clickByText('返回主菜单')

  // TM-P1-019：村内调查复命——向村长汇报两人均无法辨认地图（直接继续 P1-018 已保存的 2/2 档）
  // A. Continue：进行中 + 地图线索调查 2/2
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-019-A: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-019-A: 地图线索调查 2 / 2', body.includes('地图线索调查：2 / 2'))
  // C 前置：复命前记录 Lv/HP/MP/金币/地图数/位置
  const rep2BeforeLevel = body.match(/Lv\.(\d+)/)
  const rep2BeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const rep2BeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const rep2BeforeGold = body.match(/金币\s*(\d+)/)
  const rep2BeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  const rep2BeforeLocation = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  // B. 村长出现新复命入口（与 P1-016 地图汇报入口严格分开）
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-019-B: 村长对话显示复命入口文案', body.includes('你已经问过铁匠和药师，但两人都无法辨认地图上的标记。'))
  check('P1-019-B: 向村长汇报调查结果按钮 enabled', (await buttonDisabled('向村长汇报调查结果')) === false)
  check('P1-019-B: P1-016 旧入口不重复出现（无向村长展示地图按钮）', !body.includes('向村长展示《兔子的路径》'))
  // C. 复命前 trust/respect
  const rep2BeforeTrustRespect = body.includes('信任：1') && body.includes('尊敬：0')
  // D. 点击复命
  await clickByText('向村长汇报调查结果')
  await sleep(300)
  body = await bodyText()
  check('P1-019-D: 已复命固定文案（告诉村长）', body.includes('你已经把调查结果告诉了村长。'))
  check('P1-019-D: 村里没人能够确认地图标记', body.includes('村里目前没人能够确认地图上的标记。'))
  check('P1-019-D: 下一步目的地：【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-019-D: 复命按钮消失', !body.includes('向村长汇报调查结果'))
  await clickByText('结束交谈')
  // E. 任务仍进行中：任务日志 2/2 + 村内调查已汇报 + 【待补充】+ 无完成/提交
  body = await bodyText()
  check('P1-019-E: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-019-E: 地图线索调查 2 / 2', body.includes('地图线索调查：2 / 2'))
  check('P1-019-E: 村内调查已汇报', body.includes('村内调查已汇报。'))
  check('P1-019-E: 下一步目的地：【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-019-E: 原 2/2 调查结果保留', body.includes('你已经向铁匠和药师打听过，但仍无法确认地图指向的具体地点。'))
  check('P1-019-E: 第四任务状态标签仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-019-E: 无提交任务按钮（不可完成/不可提交）', !body.includes('提交任务') && !body.includes('可完成'))
  // F. 无副作用精确比较
  const rep2AfterLevel = body.match(/Lv\.(\d+)/)
  const rep2AfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const rep2AfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const rep2AfterGold = body.match(/金币\s*(\d+)/)
  const rep2AfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  check(
    'P1-019-F: 复命前后等级/生命/灵力/金币/地图数全不变',
    rep2BeforeLevel !== null && rep2AfterLevel !== null && rep2BeforeLevel[1] === rep2AfterLevel[1] &&
      rep2BeforeHp !== null && rep2AfterHp !== null && rep2BeforeHp[1] === rep2AfterHp[1] && rep2BeforeHp[2] === rep2AfterHp[2] &&
      rep2BeforeMp !== null && rep2AfterMp !== null && rep2BeforeMp[1] === rep2AfterMp[1] && rep2BeforeMp[2] === rep2AfterMp[2] &&
      rep2BeforeGold !== null && rep2AfterGold !== null && rep2BeforeGold[1] === rep2AfterGold[1] &&
      rep2BeforeMapCount !== null && rep2AfterMapCount !== null && rep2BeforeMapCount[1] === rep2AfterMapCount[1],
  )
  check('P1-019-F: 当前位置仍 qingshi_village', rep2BeforeLocation === 'qingshi_village')
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-019-F: 村长 trust 1 respect 0 保持（复命无关系奖励）', body.includes('信任：1') && body.includes('尊敬：0') && rep2BeforeTrustRespect)
  await clickByText('结束交谈')
  // G. 移动按钮精确锁定 [废弃矿洞, 村外草原]
  const p1019TravelButtons = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => b.textContent.trim()).sort()
  })
  check('P1-019-G: 可前往按钮精确等于 [废弃矿洞, 村外草原]', JSON.stringify(p1019TravelButtons) === JSON.stringify(['废弃矿洞', '村外草原']))
  // H. Save/Continue 保持复命状态；重开村长已汇报文案无按钮
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-019-H: Continue 后追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-019-H: Continue 后地图线索调查 2 / 2', body.includes('地图线索调查：2 / 2'))
  check('P1-019-H: Continue 后村内调查已汇报', body.includes('村内调查已汇报。'))
  check('P1-019-H: Continue 后下一步目的地【待补充】', body.includes('下一步目的地：【待补充】'))
  await clickNthTalk(0)
  body = await bodyText()
  check('P1-019-H: 重开村长显示已复命文案', body.includes('你已经把调查结果告诉了村长。'))
  check('P1-019-H: 重开村长无复命按钮', !body.includes('向村长汇报调查结果'))
  await clickByText('结束交谈')
  await clickByText('返回主菜单')

  // TM-P1-020：返回兔王巢穴复查《兔子的路径》（直接继续 P1-019 已保存复命完成档）
  // A. Continue：进行中 + 村内调查已汇报 + 当前目标
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-020-A: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-020-A: 村内调查已汇报', body.includes('村内调查已汇报。'))
  check('P1-020-A: 当前目标：返回兔王巢穴重新比对地图', body.includes('当前目标：返回兔王巢穴重新比对地图。'))
  // G 前置：复查前记录 Lv/HP/MP/金币/地图数
  const lairBeforeLevel = body.match(/Lv\.(\d+)/)
  const lairBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const lairBeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const lairBeforeGold = body.match(/金币\s*(\d+)/)
  const lairBeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  // B. 精确移动：青石村可前往按钮仍 [废弃矿洞, 村外草原] → 村外草原 → 兔王巢穴
  const p1020StartButtons = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => b.textContent.trim()).sort()
  })
  check('P1-020-B: 青石村可前往按钮精确等于 [废弃矿洞, 村外草原]', JSON.stringify(p1020StartButtons) === JSON.stringify(['废弃矿洞', '村外草原']))
  await clickByText('村外草原')
  await sleep(200)
  await clickByText('兔王巢穴')
  await sleep(300)
  body = await bodyText()
  const lairLocationId = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-020-B: 已到达兔王巢穴（currentLocationId === rabbit_lair）', lairLocationId === 'rabbit_lair')
  // C. Boss 清场回归：无附近威胁 section/无嘟嘟兔/无迎战按钮 + 地图 ×1
  check('P1-020-C: 无附近威胁 section', !body.includes('附近威胁'))
  check('P1-020-C: 无嘟嘟兔', !body.includes('嘟嘟兔'))
  check('P1-020-C: 无迎战按钮', !body.includes('迎战'))
  check('P1-020-C: 兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  // D. 地图复查入口
  check('P1-020-D: 巢穴复查剧情块文案', body.includes('你带着《兔子的路径》返回兔王巢穴，准备重新比对地图上的标记。'))
  check('P1-020-D: 重新比对地图按钮 enabled', (await buttonDisabled('重新比对地图')) === false)
  // E. 点击复查
  await clickByText('重新比对地图')
  await sleep(300)
  body = await bodyText()
  check('P1-020-E: 复查固定结果', body.includes('你重新比对了地图与巢穴周边，但仍没有找到足以确认下一处地点的线索。'))
  check('P1-020-E: 下一步目的地：【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-020-E: 重新比对地图按钮消失', !body.includes('重新比对地图'))
  // F. 任务状态：进行中 + 2/2 + 村内调查已汇报 + 巢穴复查完成 + 【待补充】+ 无完成/提交
  check('P1-020-F: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-020-F: 地图线索调查 2 / 2', body.includes('地图线索调查：2 / 2'))
  check('P1-020-F: 村内调查已汇报', body.includes('村内调查已汇报。'))
  check('P1-020-F: 巢穴复查完成', body.includes('巢穴复查完成。'))
  check('P1-020-F: 下一步目的地：【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-020-F: 复查前当前目标已消失', !body.includes('当前目标：返回兔王巢穴重新比对地图。'))
  check('P1-020-F: 无可完成/提交任务', !body.includes('可完成') && !body.includes('提交任务'))
  // G. 无副作用精确比较
  const lairAfterLevel = body.match(/Lv\.(\d+)/)
  const lairAfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const lairAfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const lairAfterGold = body.match(/金币\s*(\d+)/)
  const lairAfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  check(
    'P1-020-G: 复查前后等级/生命/灵力/金币/地图数全不变',
    lairBeforeLevel !== null && lairAfterLevel !== null && lairBeforeLevel[1] === lairAfterLevel[1] &&
      lairBeforeHp !== null && lairAfterHp !== null && lairBeforeHp[1] === lairAfterHp[1] && lairBeforeHp[2] === lairAfterHp[2] &&
      lairBeforeMp !== null && lairAfterMp !== null && lairBeforeMp[1] === lairAfterMp[1] && lairBeforeMp[2] === lairAfterMp[2] &&
      lairBeforeGold !== null && lairAfterGold !== null && lairBeforeGold[1] === lairAfterGold[1] &&
      lairBeforeMapCount !== null && lairAfterMapCount !== null && lairBeforeMapCount[1] === lairAfterMapCount[1],
  )
  // H. Save/Continue：复查完成保持；无按钮/无嘟嘟兔/无威胁/地图 ×1/进行中
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-020-H: Continue 后巢穴复查完成', body.includes('巢穴复查完成。'))
  check('P1-020-H: Continue 后下一步目的地【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-020-H: Continue 后第四任务仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-020-H: Continue 后兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  await clickByText('村外草原')
  await sleep(200)
  await clickByText('兔王巢穴')
  await sleep(300)
  body = await bodyText()
  check('P1-020-H: 重进巢穴无重新比对地图按钮', !body.includes('重新比对地图'))
  check('P1-020-H: 重进巢穴无嘟嘟兔', !body.includes('嘟嘟兔'))
  check('P1-020-H: 重进巢穴无附近威胁 section', !body.includes('附近威胁'))
  check('P1-020-H: 重进巢穴地图仍 ×1', body.includes('兔子的路径 ×1'))
  check('P1-020-H: 重进巢穴复查完成保留', body.includes('巢穴复查完成。'))
  await clickByText('返回主菜单')

  // TM-P1-021：首条正式支线《采药受阻》（药师发布；直接继续 P1-020 已保存档，当前位于兔王巢穴）
  // A. Continue 后返回青石村：兔王巢穴 → 村外草原 → 青石村；黄金主线保持
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-021-A: Continue 后在兔王巢穴', body.includes('兔王巢穴'))
  await clickByText('村外草原')
  await sleep(200)
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()
  check('P1-021-A: 黄金主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-021-A: 巢穴复查完成保留', body.includes('巢穴复查完成。'))
  check('P1-021-A: 下一步目的地【待补充】', body.includes('下一步目的地：【待补充】'))
  // B. 药师委托出现
  check('P1-021-B: 附近委托出现药师入口', body.includes('药师似乎有事相托'))
  await clickByText('查看委托')
  body = await bodyText()
  check('P1-021-B: 采药受阻可接受', body.includes('采药受阻') && body.includes('可接受'))
  check('P1-021-B: 描述来自注册表', body.includes('村外魔化野兽让采药变得不安全。药师希望你去村外草原查看采药区域的情况。'))
  // C. 接受
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('P1-021-C: 采药受阻进行中', body.includes('采药受阻') && body.includes('进行中'))
  check('P1-021-C: 当前目标：前往村外草原查看采药区域', body.includes('当前目标：前往村外草原查看采药区域。'))
  const herbGoldBefore = body.match(/金币\s*(\d+)/)
  check('P1-021-C: 记录金币成功', herbGoldBefore !== null)
  // D. 前往草原
  await clickByText('村外草原')
  await sleep(300)
  body = await bodyText()
  check('P1-021-D: 草原剧情块文案', body.includes('药师常来这一带采药。附近魔化野兽的活动让这里变得不再安全。'))
  check('P1-021-D: 查看采药区域按钮 enabled', (await buttonDisabled('查看采药区域')) === false)
  // E. 调查
  await clickByText('查看采药区域')
  await sleep(300)
  body = await bodyText()
  check('P1-021-E: 调查固定结果', body.includes('你检查了附近的采药区域，确认魔化野兽的活动确实影响了这里。'))
  check('P1-021-E: 可以回青石村向药师复命', body.includes('可以回青石村向药师复命了。'))
  check('P1-021-E: 采药区域已查看', body.includes('采药区域已查看。'))
  check('P1-021-E: 当前目标：返回青石村向药师复命', body.includes('当前目标：返回青石村向药师复命。'))
  check('P1-021-E: 任务状态可完成', body.includes('采药受阻') && body.includes('可完成'))
  const herbButtonAfter = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '查看采药区域'),
  )
  check('P1-021-E: 查看采药区域按钮消失', herbButtonAfter === false)
  // F. 返回并提交
  await clickByText('青石村')
  await sleep(300)
  body = await bodyText()
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-021-F: 采药受阻已完成', body.includes('采药受阻') && body.includes('已完成'))
  const herbGoldAfter = body.match(/金币\s*(\d+)/)
  check(
    'P1-021-F: 金币严格 +10（完成后 = 完成前 + 10）',
    herbGoldBefore !== null && herbGoldAfter !== null && Number(herbGoldAfter[1]) === Number(herbGoldBefore[1]) + 10,
  )
  // G. 无副作用：Lv/maxHP/maxMP/兔子的路径/黄金主线
  const herbAfterLevel = body.match(/Lv\.(\d+)/)
  const herbAfterMaxHp = body.match(/生命\s*\d+\s*\/\s*(\d+)/)
  const herbAfterMaxMp = body.match(/灵力\s*\d+\s*\/\s*(\d+)/)
  check('P1-021-G: 等级不变（Lv.2）', herbAfterLevel !== null && herbAfterLevel[1] === '2')
  check('P1-021-G: maxHP/maxMP 不变', herbAfterMaxHp !== null && herbAfterMaxHp[1] === '24' && herbAfterMaxMp !== null && herbAfterMaxMp[1] === '7')
  check('P1-021-G: 兔子的路径仍 ×1', body.includes('兔子的路径 ×1'))
  check('P1-021-G: 黄金主线仍 in_progress', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-021-G: 巢穴复查完成仍保留', body.includes('巢穴复查完成。'))
  // H. Save/Continue：采药受阻已完成；黄金主线保持；无采药调查按钮
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-021-H: Continue 后采药受阻已完成', body.includes('采药受阻') && body.includes('已完成'))
  check('P1-021-H: Continue 后黄金主线进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-021-H: Continue 后巢穴复查完成', body.includes('巢穴复查完成。'))
  check('P1-021-H: Continue 后下一步目的地【待补充】', body.includes('下一步目的地：【待补充】'))
  await clickByText('村外草原')
  await sleep(300)
  body = await bodyText()
  const herbButtonAfterContinue = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '查看采药区域'),
  )
  check('P1-021-H: 草原无采药调查按钮', herbButtonAfterContinue === false)
  await clickByText('返回主菜单')

  // TM-P1-022：第二条支线《矿洞余患》（铁匠发布；直接继续 P1-021 已保存档，青石村）
  // A. Continue：采药受阻已完成 + 黄金主线保持
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-022-A: 采药受阻已完成', body.includes('采药受阻') && body.includes('已完成'))
  check('P1-022-A: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-022-A: 巢穴复查完成', body.includes('巢穴复查完成。'))
  check('P1-022-A: 下一步目的地【待补充】', body.includes('下一步目的地：【待补充】'))
  // B. 铁匠支线：发现→查看→接受
  check('P1-022-B: 附近委托出现铁匠入口', body.includes('铁匠似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('P1-022-B: 矿洞余患可接受（发布者铁匠）', body.includes('矿洞余患') && body.includes('发布者：铁匠') && body.includes('可接受'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('P1-022-B: 矿洞余患进行中', body.includes('矿洞余患') && body.includes('进行中'))
  check('P1-022-B: 当前目标：前往废弃矿洞处理残余的魔化鼠', body.includes('当前目标：前往废弃矿洞处理残余的魔化鼠。'))
  const remnantGoldBefore = body.match(/金币\s*(\d+)/)
  const remnantOreBefore = body.match(/铁矿石\s*×(\d+)/)
  check('P1-022-B: 记录金币与铁矿石成功', remnantGoldBefore !== null)
  // C. 前往矿洞，魔化鼠仍存在可迎战
  await clickByText('废弃矿洞')
  await sleep(300)
  body = await bodyText()
  check('P1-022-C: 废弃矿洞出现魔化鼠', body.includes('魔化鼠') && body.includes('迎战'))
  // D. 确定性击败魔化鼠（沿用 Math.random 隔离模式：保存真实随机 → mock → 恢复）
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  await clickByText('普通攻击')
  await sleep(300)
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await clickByText('返回冒险')
  await sleep(300)
  body = await bodyText()
  check('P1-022-D: 矿洞余患可完成', body.includes('矿洞余患') && body.includes('可完成'))
  check('P1-022-D: 矿洞余患已确认', body.includes('矿洞余患已确认。'))
  check('P1-022-D: 当前目标：返回青石村向铁匠复命', body.includes('当前目标：返回青石村向铁匠复命。'))
  const remnantOreAfter = body.match(/铁矿石\s*×(\d+)/)
  check(
    'P1-022-D: 铁矿石数量 = 战前 + 1',
    remnantOreBefore !== null && remnantOreAfter !== null && Number(remnantOreAfter[1]) === Number(remnantOreBefore[1]) + 1,
  )
  // E. 返回铁匠提交
  await clickByText('青石村')
  await sleep(300)
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-022-E: 矿洞余患已完成', body.includes('矿洞余患') && body.includes('已完成'))
  const remnantGoldAfter = body.match(/金币\s*(\d+)/)
  check(
    'P1-022-E: 金币精确 +10（提交后 = 提交前 + 10）',
    remnantGoldBefore !== null && remnantGoldAfter !== null && Number(remnantGoldAfter[1]) === Number(remnantGoldBefore[1]) + 10,
  )
  // F. 主线零回归
  check('P1-022-F: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-022-F: 巢穴复查完成', body.includes('巢穴复查完成。'))
  check('P1-022-F: 下一步目的地【待补充】', body.includes('下一步目的地：【待补充】'))
  check('P1-022-F: 采药受阻已完成', body.includes('采药受阻') && body.includes('已完成'))
  // G. Save/Continue：支线均已完成，不重新出现为可接受
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-022-G: Continue 后矿洞余患已完成', body.includes('矿洞余患') && body.includes('已完成'))
  check('P1-022-G: Continue 后采药受阻已完成', body.includes('采药受阻') && body.includes('已完成'))
  check('P1-022-G: Continue 后追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-022-G: Continue 后巢穴复查完成', body.includes('巢穴复查完成。'))
  await clickByText('返回主菜单')

  // TM-P1-023：离开青石村前往天龙城（直接继续 P1-022 已保存完成档，青石村）
  // A. Continue：两条支线已完成 + 黄金主线保持 + 当前位置 qingshi_village
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-023-A: 矿洞余患已完成', body.includes('矿洞余患') && body.includes('已完成'))
  check('P1-023-A: 采药受阻已完成', body.includes('采药受阻') && body.includes('已完成'))
  check('P1-023-A: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-023-A: 巢穴复查完成', body.includes('巢穴复查完成。'))
  check('P1-023-A: 兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  const departLocationBefore = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-023-A: 当前位置 qingshi_village', departLocationBefore === 'qingshi_village')
  // B. 新旅程入口
  check('P1-023-B: 新的旅程入口', body.includes('新的旅程'))
  check('P1-023-B: 入口正文', body.includes('青石村的事情暂时告一段落。你已经可以前往天龙城继续旅程。'))
  check('P1-023-B: 准备前往天龙城按钮 enabled', (await buttonDisabled('准备前往天龙城')) === false)
  // R1：UI 与 Store 前置对齐——异常地图状态（缺失/quantity 0/examined false/reported false）时不得出现离村入口
  const departureSaveBackup = await page.evaluate(() => localStorage.getItem('tianmeng_continent_save'))
  check('R1: 合法存档已备份（供注入后恢复）', departureSaveBackup !== null)
  const injectDepartureSave = async (label, mutateFn) => {
    await page.evaluate(
      ({ saveStr, mutateKey }) => {
        const save = JSON.parse(saveStr)
        const mutate = JSON.parse(mutateKey) // 传递函数体字符串再 eval
        // eslint-disable-next-line no-eval
        eval(mutate.fn)(save.gameState)
        localStorage.setItem('tianmeng_continent_save', JSON.stringify(save))
      },
      { saveStr: departureSaveBackup, mutateKey: JSON.stringify({ fn: mutateFn.toString() }) },
    )
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(400)
    const continueDisabledAfter = await continueDisabled()
    if (continueDisabledAfter) {
      // 非法存档（如 quantity=0）被 loadGame 拒绝 → 无法进入游戏页 → UI 层面自然不存在离村入口（比「入口隐藏」更强）
      check(`R1: ${label} → 存档无效无法进入游戏页，UI 无离村入口`, true)
      return
    }
    await clickByText('继续游戏')
    await sleep(300)
    const injectedBody = await bodyText()
    check(`R1: ${label} → 无离村入口`, !injectedBody.includes('新的旅程') && !injectedBody.includes('准备前往天龙城'))
    await clickByText('返回主菜单')
  }
  await injectDepartureSave('rabbit_path 缺失', (gs) => {
    gs.inventory = gs.inventory.filter((e) => e.itemId !== 'rabbit_path')
  })
  await injectDepartureSave('quantity=0', (gs) => {
    const entry = gs.inventory.find((e) => e.itemId === 'rabbit_path')
    if (entry) entry.quantity = 0
  })
  await injectDepartureSave('rabbit_path_examined=false', (gs) => {
    gs.world.flags.rabbit_path_examined = false
  })
  await injectDepartureSave('rabbit_path_reported=false', (gs) => {
    gs.world.flags.rabbit_path_reported = false
  })
  // 恢复合法存档：入口必须仍在且 enabled（零回归）
  await page.evaluate((saveStr) => localStorage.setItem('tianmeng_continent_save', saveStr), departureSaveBackup)
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(400)
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('R1: 恢复合法档后入口仍在', body.includes('新的旅程') && body.includes('准备前往天龙城'))
  check('R1: 恢复合法档后按钮 enabled', (await buttonDisabled('准备前往天龙城')) === false)
  // D 前置：离村前记录 Lv/HP/MP/gold/地图数
  const departBeforeLevel = body.match(/Lv\.(\d+)/)
  const departBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const departBeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const departBeforeGold = body.match(/金币\s*(\d+)/)
  const departBeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  // C. 二次确认：暂不离开 → 仍在青石村 → 重新打开
  await clickByText('准备前往天龙城')
  await sleep(200)
  body = await bodyText()
  check('P1-023-C: 二次确认文案（无法返回）', body.includes('离开青石村后将无法返回。'))
  check('P1-023-C: 二次确认文案（委托留在此地）', body.includes('尚未发现的村内委托将被留在这里。'))
  check('P1-023-C: 前往天龙城按钮存在', body.includes('前往天龙城'))
  check('P1-023-C: 暂不离开按钮存在', body.includes('暂不离开'))
  await clickByText('暂不离开')
  await sleep(200)
  const departLocationAfterCancel = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-023-C: 暂不离开后仍在青石村', departLocationAfterCancel === 'qingshi_village')
  await clickByText('准备前往天龙城')
  await sleep(200)
  // E. 真正确认：前往天龙城
  await clickByText('前往天龙城')
  await sleep(300)
  body = await bodyText()
  const departLocationAfter = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-023-E: 当前位置 = tianlong_city', departLocationAfter === 'tianlong_city')
  check('P1-023-E: 地点名称天龙城', body.includes('天龙城'))
  check('P1-023-E: 描述来自注册表', body.includes('天龙王朝的皇城'))
  // F. 单向性：无移动按钮、无返回青石村
  const departTravelButtons = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => b.textContent.trim())
  })
  check('P1-023-F: 可前往按钮精确 [武馆, 黑石塔一层]（P1-025 起天龙城连接黑石塔一层）', JSON.stringify(departTravelButtons) === JSON.stringify(['武馆', '黑石塔一层']))
  check('P1-023-F: 无返回青石村按钮', !body.includes('返回青石村'))
  // G. 无副作用精确比较
  const departAfterLevel = body.match(/Lv\.(\d+)/)
  const departAfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const departAfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const departAfterGold = body.match(/金币\s*(\d+)/)
  const departAfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  check(
    'P1-023-G: 离村前后等级/生命/灵力/金币/地图数全不变',
    departBeforeLevel !== null && departAfterLevel !== null && departBeforeLevel[1] === departAfterLevel[1] &&
      departBeforeHp !== null && departAfterHp !== null && departBeforeHp[1] === departAfterHp[1] && departBeforeHp[2] === departAfterHp[2] &&
      departBeforeMp !== null && departAfterMp !== null && departBeforeMp[1] === departAfterMp[1] && departBeforeMp[2] === departAfterMp[2] &&
      departBeforeGold !== null && departAfterGold !== null && departBeforeGold[1] === departAfterGold[1] &&
      departBeforeMapCount !== null && departAfterMapCount !== null && departBeforeMapCount[1] === departAfterMapCount[1],
  )
  // H. 黄金兔子长期线保持（不把天龙城写成目标）
  check('P1-023-H: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-023-H: 巢穴复查完成', body.includes('巢穴复查完成。'))
  check('P1-023-H: 具体目的地【待补充】', body.includes('具体目的地：【待补充】'))
  check('P1-023-H: 两条支线仍已完成', body.includes('采药受阻') && body.includes('已完成') && body.includes('矿洞余患') && body.includes('已完成'))
  // I. Save/Continue：仍在天龙城
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  const departLocationSaved = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-023-I: Continue 后当前位置 = tianlong_city', departLocationSaved === 'tianlong_city')
  check('P1-023-I: Continue 后地点天龙城', body.includes('天龙城'))
  check('P1-023-I: Continue 后无青石村返回按钮', !body.includes('返回青石村'))
  check('P1-023-I: Continue 后追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-023-I: Continue 后兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  await clickByText('返回主菜单')

  // TM-P1-024：天龙城第一段——武馆、马科与商人王财（直接继续 P1-023 Save/Continue 后的天龙城档）
  // A. Continue：在天龙城，黄金主线保持，可前往精确 ['武馆']
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  const wangcaiLocBefore = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-024-A: 当前位置 = tianlong_city', wangcaiLocBefore === 'tianlong_city')
  check('P1-024-A: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-024-A: 兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  const tianlongTravelButtons = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => b.textContent.trim())
  })
  check('P1-024-A: 天龙城可前往按钮精确 [武馆, 黑石塔一层]', JSON.stringify(tianlongTravelButtons) === JSON.stringify(['武馆', '黑石塔一层']))
  // B. 前往武馆
  await clickByText('武馆')
  await sleep(300)
  body = await bodyText()
  const martialHallLoc = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-024-B: 当前位置 = tianlong_martial_hall', martialHallLoc === 'tianlong_martial_hall')
  check('P1-024-B: 地点武馆', body.includes('武馆'))
  const hallTravelButtons = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => b.textContent.trim())
  })
  check('P1-024-B: 武馆可前往按钮精确 [天龙城]', JSON.stringify(hallTravelButtons) === JSON.stringify(['天龙城']))
  check('P1-024-B: 附近人物马科（骑士队长）', body.includes('马科') && body.includes('骑士队长'))
  // C. 接取第五主线
  check('P1-024-C: 附近委托出现马科入口', body.includes('马科似乎有事相托'))
  await clickByText('查看委托')
  await sleep(300)
  body = await bodyText()
  check('P1-024-C: 发布者：马科 可接受', body.includes('发布者：马科') && body.includes('可接受'))
  await clickByText('接受任务')
  await sleep(200)
  body = await bodyText()
  check('P1-024-C: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-024-C: 当前目标：返回天龙城找到商人王财', body.includes('当前目标：返回天龙城，找到商人王财了解情况。'))
  const wangcaiBeforeLevel = body.match(/Lv\.(\d+)/)
  const wangcaiBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const wangcaiBeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const wangcaiBeforeGold = body.match(/金币\s*(\d+)/)
  const wangcaiBeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  // D. 返回天龙城找王财（附近人物卡片按钮统一为「交谈」）
  await clickByText('天龙城')
  await sleep(300)
  body = await bodyText()
  check('P1-024-D: 附近人物王财（商人）', body.includes('王财') && body.includes('商人'))
  await clickByText('交谈')
  await sleep(300)
  body = await bodyText()
  check('P1-024-D: 王财对话剧情入口文案', body.includes('马科让你来了解王财最近遇到的麻烦。'))
  check('P1-024-D: 询问黑石塔附近的遭遇按钮 enabled', (await buttonDisabled('询问黑石塔附近的遭遇')) === false)
  // E. 询问王财
  await clickByText('询问黑石塔附近的遭遇')
  await sleep(300)
  body = await bodyText()
  check('P1-024-E: 王财说明固定文案（夔峒项链）', body.includes('王财告诉你，几天前他在黑石塔附近遭到魔物袭击，混乱中遗失了妻子的夔峒项链。'))
  check('P1-024-E: 王财希望调查找回项链', body.includes('他希望你能前去调查，并设法找回项链。'))
  check('P1-024-E: 询问按钮消失', (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '询问黑石塔附近的遭遇'))) === false)
  await clickByText('结束交谈')
  await sleep(200)
  body = await bodyText()
  check('P1-024-E: 任务日志已向王财了解情况', body.includes('已向王财了解情况。'))
  check('P1-024-E: 当前目标：调查黑石塔附近的情况', body.includes('当前目标：调查黑石塔附近的情况。'))
  check('P1-024-E: 黑石塔：【待开放】', body.includes('黑石塔：【待开放】'))
  // F. 任务不能完成
  check('P1-024-F: 无可完成/提交任务/已完成（商人王财的麻烦仍进行中）', !body.includes('提交任务') && !body.includes('可完成') && body.includes('商人王财的麻烦') && body.includes('进行中'))
  // G. 黑石塔不能前往
  const tianlongTravelAfter = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => b.textContent.trim())
  })
  check('P1-024-G: 天龙城移动按钮精确 [武馆, 黑石塔一层]（P1-025 起）', JSON.stringify(tianlongTravelAfter) === JSON.stringify(['武馆', '黑石塔一层']))
  check('P1-024-G: 无城外按钮', !body.includes('城外'))
  // H. 无副作用
  const wangcaiAfterLevel = body.match(/Lv\.(\d+)/)
  const wangcaiAfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const wangcaiAfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const wangcaiAfterGold = body.match(/金币\s*(\d+)/)
  const wangcaiAfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  check(
    'P1-024-H: 接任务前后 Lv/HP/MP/gold/地图数全不变',
    wangcaiBeforeLevel !== null && wangcaiAfterLevel !== null && wangcaiBeforeLevel[1] === wangcaiAfterLevel[1] &&
      wangcaiBeforeHp !== null && wangcaiAfterHp !== null && wangcaiBeforeHp[1] === wangcaiAfterHp[1] && wangcaiBeforeHp[2] === wangcaiAfterHp[2] &&
      wangcaiBeforeMp !== null && wangcaiAfterMp !== null && wangcaiBeforeMp[1] === wangcaiAfterMp[1] && wangcaiBeforeMp[2] === wangcaiAfterMp[2] &&
      wangcaiBeforeGold !== null && wangcaiAfterGold !== null && wangcaiBeforeGold[1] === wangcaiAfterGold[1] &&
      wangcaiBeforeMapCount !== null && wangcaiAfterMapCount !== null && wangcaiBeforeMapCount[1] === wangcaiAfterMapCount[1],
  )
  check('P1-024-H: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-024-H: 巢穴复查完成', body.includes('巢穴复查完成。'))
  check('P1-024-H: 具体目的地【待补充】', body.includes('具体目的地：【待补充】'))
  // I. Save/Continue
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  const wangcaiLocAfter = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-024-I: Continue 后当前位置 = tianlong_city', wangcaiLocAfter === 'tianlong_city')
  check('P1-024-I: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-024-I: 已向王财了解情况', body.includes('已向王财了解情况。'))
  check('P1-024-I: 黑石塔：【待开放】', body.includes('黑石塔：【待开放】'))
  check('P1-024-I: 追寻黄金兔子王进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  // I：再次打开王财——显示已说明剧情，无询问按钮
  await clickByText('交谈')
  await sleep(300)
  body = await bodyText()
  check('P1-024-I: 王财已说明剧情（无询问按钮）', body.includes('王财告诉你，几天前他在黑石塔附近遭到魔物袭击，混乱中遗失了妻子的夔峒项链。') && !body.includes('询问黑石塔附近的遭遇'))
  await clickByText('结束交谈')
  await clickByText('返回主菜单')

  // TM-P1-025：黑石塔一层——解锁路线、骷髅士兵与骷髅队长踪迹（直接继续 P1-024 Save/Continue 后的天龙城档）
  // A. Continue：天龙城，第五主线 in_progress/briefed；武馆 enabled、黑石塔一层 disabled
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-025-A: 当前位置 = tianlong_city', body.includes('当前位置'))
  check('P1-025-A: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-025-A: 已向王财了解情况', body.includes('已向王财了解情况。'))
  const towerTravelBefore = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled }))
  })
  check(
    'P1-025-A: 可前往 [武馆 enabled, 黑石塔一层 disabled]',
    JSON.stringify(towerTravelBefore) === JSON.stringify([{ text: '武馆', disabled: false }, { text: '黑石塔一层', disabled: true }]),
  )
  check('P1-025-A: 无返回青石村', !body.includes('返回青石村'))
  // B. 解锁路线
  check('P1-025-B: 黑石塔调查入口', body.includes('黑石塔调查'))
  check('P1-025-B: 入口正文', body.includes('王财提供的情况已经足够，你可以动身前往黑石塔调查。'))
  await clickByText('动身调查黑石塔')
  await sleep(300)
  body = await bodyText()
  check('P1-025-B: 动身调查按钮消失', !body.includes('动身调查黑石塔'))
  const towerTravelUnlocked = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled }))
  })
  check(
    'P1-025-B: 解锁后黑石塔一层 enabled',
    JSON.stringify(towerTravelUnlocked) === JSON.stringify([{ text: '武馆', disabled: false }, { text: '黑石塔一层', disabled: false }]),
  )
  check('P1-025-B: 黑石塔路线已确认', body.includes('黑石塔路线已确认。'))
  check('P1-025-B: 当前目标：前往黑石塔一层调查', body.includes('当前目标：前往黑石塔一层调查。'))
  check('P1-025-B: 不再显示黑石塔：【待开放】', !body.includes('黑石塔：【待开放】'))
  // C. 进入黑石塔一层
  await clickByText('黑石塔一层')
  await sleep(300)
  body = await bodyText()
  const towerFloor1Loc = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-025-C: 当前位置 = black_stone_tower_floor1', towerFloor1Loc === 'black_stone_tower_floor1')
  check('P1-025-C: 地点黑石塔一层', body.includes('黑石塔一层'))
  const floor1Travel = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled }))
  })
  // P1-027 到期调整：一层 connections 增加黑石塔二层——按钮含天龙城 + 黑石塔二层（disabled，未解锁）
  check(
    'P1-025-C: 一层可前往按钮含天龙城 + 黑石塔二层（disabled）',
    floor1Travel.some((b) => b.text === '天龙城' && !b.disabled) && floor1Travel.some((b) => b.text === '黑石塔二层' && b.disabled),
  )
  // D. 第一场地牢战斗（确定性击败骷髅士兵 Lv.3）
  check('P1-025-D: 附近威胁骷髅士兵', body.includes('附近威胁') && body.includes('骷髅士兵') && body.includes('Lv.3'))
  const towerBeforeLevel = body.match(/Lv\.(\d+)/)
  const towerBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const towerBeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const towerBeforeGold = body.match(/金币\s*(\d+)/)
  const towerBeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  // 骷髅士兵 HP14 防御12——需要数次普通攻击（0.99 天然20 暴击；每击后检查胜利「返回冒险」跳出）
  for (let i = 0; i < 12; i += 1) {
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
  await clickByText('返回冒险')
  await sleep(300)
  body = await bodyText()
  check('P1-025-D: 战斗胜利返回冒险', body.includes('当前位置'))
  // E. 胜利后清场（P1-026 到期调整：骷髅队长正式出现，无【待开放】；附近威胁只含骷髅队长）
  check('P1-025-E: 大厅中的骷髅士兵已经被击败', body.includes('大厅中的骷髅士兵已经被击败。'))
  check('P1-025-E: 骷髅队长踪迹剧情', body.includes('更深处传来沉重的骨骼碰撞声，一名身材高大的骷髅队长守在前方。'))
  check('P1-025-E: 无骷髅队长：【待开放】', !body.includes('骷髅队长：【待开放】'))
  check('P1-025-E: 无威胁卡片骷髅士兵；附近威胁仅骷髅队长', !body.includes('骷髅士兵 · Lv.3') && body.includes('骷髅队长') && body.includes('Lv.4') && body.includes('迎战'))
  // F. 任务状态（P1-026 到期调整：战前目标改为击败骷髅队长）
  check('P1-025-F: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-025-F: 黑石塔一层：已击败骷髅士兵', body.includes('黑石塔一层：已击败骷髅士兵。'))
  check('P1-025-F: 当前目标：击败骷髅队长', body.includes('当前目标：击败骷髅队长。'))
  check('P1-025-F: 无可完成/提交任务/已完成', !body.includes('提交任务') && !body.includes('可完成'))
  // G. 无奖励（HP 允许正常战斗变化）
  const towerAfterLevel = body.match(/Lv\.(\d+)/)
  const towerAfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const towerAfterGold = body.match(/金币\s*(\d+)/)
  const towerAfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  check(
    'P1-025-G: 战斗前后 Lv/maxMP/gold/地图数不变',
    towerBeforeLevel !== null && towerAfterLevel !== null && towerBeforeLevel[1] === towerAfterLevel[1] &&
      towerBeforeMp !== null && towerAfterMp !== null && towerBeforeMp[2] === towerAfterMp[2] &&
      towerBeforeGold !== null && towerAfterGold !== null && towerBeforeGold[1] === towerAfterGold[1] &&
      towerBeforeMapCount !== null && towerAfterMapCount !== null && towerBeforeMapCount[1] === towerAfterMapCount[1],
  )
  // H. 往返保持清场
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('黑石塔一层')
  await sleep(300)
  body = await bodyText()
  check('P1-025-H: 再次进入无威胁卡片骷髅士兵；附近威胁仅骷髅队长', !body.includes('骷髅士兵 · Lv.3') && body.includes('骷髅队长') && body.includes('Lv.4') && body.includes('迎战'))
  check('P1-025-H: 骷髅队长踪迹剧情仍在', body.includes('更深处传来沉重的骨骼碰撞声，一名身材高大的骷髅队长守在前方。'))
  // I. Save/Continue（黑石塔一层；P1-026 到期调整：无【待开放】，附近威胁仅骷髅队长）
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  const towerFloor1Saved = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-025-I: Continue 后当前位置 = black_stone_tower_floor1', towerFloor1Saved === 'black_stone_tower_floor1')
  check('P1-025-I: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-025-I: 黑石塔路线已确认', body.includes('黑石塔路线已确认。'))
  check('P1-025-I: 黑石塔一层：已击败骷髅士兵', body.includes('黑石塔一层：已击败骷髅士兵。'))
  check('P1-025-I: 无威胁卡片骷髅士兵', !body.includes('骷髅士兵 · Lv.3'))
  check('P1-025-I: 无骷髅队长：【待开放】', !body.includes('骷髅队长：【待开放】'))
  check('P1-025-I: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-025-I: 兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  await clickByText('返回主菜单')

  // TM-P1-025-R1：黑石塔解锁 UI 守卫对齐——stage!=0 或 unlock flag 异常非 boolean 时不得出现「动身调查黑石塔」死按钮（沿用存档注入模式）
  const towerSaveBackup = await page.evaluate(() => localStorage.getItem('tianmeng_continent_save'))
  check('P1-025-R1: 合法存档已备份', towerSaveBackup !== null)
  const injectTowerSave = async (label, mutateFn, expectEntry) => {
    await page.evaluate(
      ({ saveStr, mutateKey }) => {
        const save = JSON.parse(saveStr)
        const mutate = JSON.parse(mutateKey)
        // eslint-disable-next-line no-eval
        eval(mutate.fn)(save.gameState)
        localStorage.setItem('tianmeng_continent_save', JSON.stringify(save))
      },
      { saveStr: towerSaveBackup, mutateKey: JSON.stringify({ fn: mutateFn.toString() }) },
    )
    await page.reload({ waitUntil: 'networkidle0' })
    await sleep(400)
    const continueDisabledAfter = await continueDisabled()
    if (continueDisabledAfter) {
      // 存档被 loadGame 拒绝 → 无法进入游戏页 → UI 层面自然无入口（更强保证）
      check(`P1-025-R1: ${label} → 存档无效无法进入游戏页，UI 无动身调查按钮`, !expectEntry)
      return
    }
    await clickByText('继续游戏')
    await sleep(300)
    const injectedBody = await bodyText()
    check(`P1-025-R1: ${label} → 无「动身调查黑石塔」`, expectEntry ? injectedBody.includes('动身调查黑石塔') : !injectedBody.includes('动身调查黑石塔'))
    await clickByText('返回主菜单')
  }
  // E. 基础注入档：天龙城 + unlock=false + stage0 + briefed + 清 defeated → 入口存在
  await injectTowerSave('unlock=false + stage0 → 入口存在', (gs) => {
    gs.world.currentLocationId = 'tianlong_city'
    gs.world.flags.black_stone_tower_unlocked = false
    const q = gs.quests.find((qq) => qq.questId === 'quest_wangcai_trouble')
    if (q) {
      q.stage = 0
      delete q.flags.floor1_soldier_defeated
    }
  }, true)
  // A. stage=1 → 无按钮
  await injectTowerSave('stage=1 → 无动身调查按钮', (gs) => {
    gs.world.currentLocationId = 'tianlong_city'
    gs.world.flags.black_stone_tower_unlocked = false
    const q = gs.quests.find((qq) => qq.questId === 'quest_wangcai_trouble')
    if (q) {
      q.stage = 1
      delete q.flags.floor1_soldier_defeated
    }
  }, false)
  // B/C/D. unlock 异常非 boolean → 无按钮
  await injectTowerSave('unlock="yes" → 无动身调查按钮', (gs) => {
    gs.world.currentLocationId = 'tianlong_city'
    gs.world.flags.black_stone_tower_unlocked = 'yes'
  }, false)
  await injectTowerSave('unlock=1 → 无动身调查按钮', (gs) => {
    gs.world.currentLocationId = 'tianlong_city'
    gs.world.flags.black_stone_tower_unlocked = 1
  }, false)
  await injectTowerSave('unlock=0.5 → 无动身调查按钮', (gs) => {
    gs.world.currentLocationId = 'tianlong_city'
    gs.world.flags.black_stone_tower_unlocked = 0.5
  }, false)
  // F. 恢复正式合法存档（P1-025-I 档：黑石塔一层清场状态）→ 零回归
  await page.evaluate((saveStr) => localStorage.setItem('tianmeng_continent_save', saveStr), towerSaveBackup)
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(400)
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-025-R1: 恢复合法档后当前位置黑石塔一层', body.includes('当前位置'))
  check('P1-025-R1: 恢复合法档后骷髅士兵清场状态保持', body.includes('大厅中的骷髅士兵已经被击败。') && body.includes('更深处传来沉重的骨骼碰撞声，一名身材高大的骷髅队长守在前方。') && !body.includes('骷髅队长：【待开放】'))
  check('P1-025-R1: 恢复合法档后无动身调查按钮', !body.includes('动身调查黑石塔'))
  await clickByText('返回主菜单')

  // TM-P1-026：黑石塔一层——骷髅队长 Boss 战与项链线索推进（直接继续 P1-025 Save/Continue 后的黑石塔一层清场档）
  // A. Continue：黑石塔一层 + 士兵清场 + 骷髅队长正式出现
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-026-A: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-026-A: 黑石塔一层：已击败骷髅士兵', body.includes('黑石塔一层：已击败骷髅士兵。'))
  // B. Boss 正式出现（无【待开放】；附近威胁精确只剩骷髅队长）
  check('P1-026-B: 骷髅士兵击败剧情', body.includes('大厅中的骷髅士兵已经被击败。'))
  check('P1-026-B: 骷髅队长踪迹剧情', body.includes('更深处传来沉重的骨骼碰撞声，一名身材高大的骷髅队长守在前方。'))
  check('P1-026-B: 无骷髅队长：【待开放】', !body.includes('骷髅队长：【待开放】'))
  check('P1-026-B: 附近威胁仅骷髅队长 Lv.4', body.includes('附近威胁') && body.includes('骷髅队长') && body.includes('Lv.4') && body.includes('迎战'))
  check('P1-026-B: 威胁卡片无骷髅士兵', !body.includes('骷髅士兵 · Lv.3'))
  check('P1-026-B: 当前目标：击败骷髅队长', body.includes('当前目标：击败骷髅队长。'))
  // C. 记录战前状态（HP/MP 允许战斗变化，不作为无副作用锁定）
  const captainBeforeLevel = body.match(/Lv\.(\d+)/)
  const captainBeforeMaxHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const captainBeforeMaxMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const captainBeforeGold = body.match(/金币\s*(\d+)/)
  const captainBeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  const captainBeforeInventory = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '背包')
    if (!label) return ''
    const section = label.closest('section')
    if (!section) return ''
    return section.textContent.trim()
  })
  // D. 确定性 Boss 战（Math.random 隔离 0.99；骷髅队长 HP22 防御13 需多击）
  await clickByText('迎战')
  await sleep(300)
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  for (let i = 0; i < 16; i += 1) {
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
  await clickByText('返回冒险')
  await sleep(300)
  body = await bodyText()
  check('P1-026-D: 战斗胜利返回冒险', body.includes('当前位置'))
  // E. Boss 清场（无附近威胁 section；无迎战）
  check('P1-026-E: 骷髅队长已经倒下', body.includes('骷髅队长已经倒下。'))
  check('P1-026-E: 未发现夔峒项链', body.includes('你检查了骷髅队长与周围，没有发现夔峒项链。'))
  check('P1-026-E: 通往更深处的道路仍需继续调查', body.includes('通往黑石塔更深处的道路仍需继续调查。'))
  check('P1-026-E: 黑石塔二层：【待开放】', body.includes('黑石塔二层：【待开放】'))
  check('P1-026-E: 无附近威胁/迎战/威胁卡片骷髅士兵', !body.includes('附近威胁') && !body.includes('迎战') && !body.includes('骷髅士兵 · Lv.3'))
  // F. 第五主线推进（不完成）
  check('P1-026-F: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-026-F: 黑石塔一层：骷髅队长已击败未发现项链', body.includes('黑石塔一层：骷髅队长已击败，未发现夔峒项链。'))
  check('P1-026-F: 当前目标：继续深入黑石塔', body.includes('当前目标：继续深入黑石塔。'))
  check('P1-026-F: 无可完成/提交任务/已完成', !body.includes('提交任务') && !body.includes('可完成'))
  // G. 无即时奖励（战前后精确比较）
  const captainAfterLevel = body.match(/Lv\.(\d+)/)
  const captainAfterMaxHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const captainAfterMaxMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const captainAfterGold = body.match(/金币\s*(\d+)/)
  const captainAfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  const captainAfterInventory = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '背包')
    if (!label) return ''
    const section = label.closest('section')
    if (!section) return ''
    return section.textContent.trim()
  })
  check(
    'P1-026-G: 战前后 Lv/maxHP/maxMP/gold/地图数/inventory 全不变',
    captainBeforeLevel !== null && captainAfterLevel !== null && captainBeforeLevel[1] === captainAfterLevel[1] &&
      captainBeforeMaxHp !== null && captainAfterMaxHp !== null && captainBeforeMaxHp[2] === captainAfterMaxHp[2] &&
      captainBeforeMaxMp !== null && captainAfterMaxMp !== null && captainBeforeMaxMp[2] === captainAfterMaxMp[2] &&
      captainBeforeGold !== null && captainAfterGold !== null && captainBeforeGold[1] === captainAfterGold[1] &&
      captainBeforeMapCount !== null && captainAfterMapCount !== null && captainBeforeMapCount[1] === captainAfterMapCount[1] &&
      captainAfterInventory === captainBeforeInventory,
  )
  // H. 往返清场持久（一层移动按钮仍精确 [天龙城]，无二层按钮）
  await clickByText('天龙城')
  await sleep(300)
  body = await bodyText()
  const captainTravelBack = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => b.textContent.trim())
  })
  check('P1-026-H: 天龙城可前往精确 [武馆, 黑石塔一层]', JSON.stringify(captainTravelBack) === JSON.stringify(['武馆', '黑石塔一层']))
  await clickByText('黑石塔一层')
  await sleep(300)
  body = await bodyText()
  check('P1-026-H: 骷髅队长不复活（无迎战/附近威胁）', !body.includes('附近威胁') && !body.includes('迎战'))
  check('P1-026-H: 骷髅士兵不复活', !body.includes('骷髅士兵 · Lv.3'))
  check('P1-026-H: Boss 后剧情仍显示', body.includes('骷髅队长已经倒下。') && body.includes('黑石塔二层：【待开放】'))
  const captainFloor1Travel = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled }))
  })
  // P1-027 到期调整：一层 connections 增加黑石塔二层——按钮含天龙城 + 黑石塔二层（未解锁 disabled；无三层）
  check(
    'P1-026-H: 一层移动按钮含天龙城 + 黑石塔二层（disabled，未解锁）无三层',
    captainFloor1Travel.some((b) => b.text === '天龙城') &&
      captainFloor1Travel.some((b) => b.text === '黑石塔二层' && b.disabled) &&
      !captainFloor1Travel.some((b) => b.text.includes('黑石塔三层')),
  )
  // I. Save/Continue
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  const captainFloor1Saved = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-026-I: Continue 后当前位置 = black_stone_tower_floor1', captainFloor1Saved === 'black_stone_tower_floor1')
  check('P1-026-I: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-026-I: 黑石塔一层：已击败骷髅士兵', body.includes('黑石塔一层：已击败骷髅士兵。'))
  check('P1-026-I: 骷髅队长已击败未发现项链', body.includes('黑石塔一层：骷髅队长已击败，未发现夔峒项链。'))
  check('P1-026-I: 当前目标：继续深入黑石塔', body.includes('当前目标：继续深入黑石塔。'))
  check('P1-026-I: 黑石塔二层：【待开放】', body.includes('黑石塔二层：【待开放】'))
  check('P1-026-I: 无附近威胁', !body.includes('附近威胁') && !body.includes('迎战'))
  check('P1-026-I: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-026-I: 兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  await clickByText('返回主菜单')

  // TM-P1-027：黑石塔二层——武馆休整、僵尸与黑法师（直接继续 P1-026 Save/Continue 后的黑石塔一层清场档）
  // A. Continue：黑石塔一层 + 士兵/队长均已击败 + 无附近威胁 + 一层移动按钮含黑石塔二层（disabled）
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  const floor2StartLoc = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })
  check('P1-027-A: Continue 后当前位置 = black_stone_tower_floor1', floor2StartLoc === 'black_stone_tower_floor1')
  check('P1-027-A: 士兵已击败', body.includes('黑石塔一层：已击败骷髅士兵。'))
  check('P1-027-A: 队长已击败未发现项链', body.includes('黑石塔一层：骷髅队长已击败，未发现夔峒项链。'))
  check('P1-027-A: 当前目标继续深入黑石塔', body.includes('当前目标：继续深入黑石塔。'))
  check('P1-027-A: 无附近威胁', !body.includes('附近威胁') && !body.includes('迎战'))
  check('P1-027-A: 一层移动按钮含黑石塔二层（disabled）', body.includes('黑石塔二层'))
  // B. 武馆休整（存档注入 HP=1）：备份 → 注入 → 武馆休整 → HP 满 → 保存满血档继续（不恢复旧档，避免带回 P1-026 战后残血导致二层战斗被击败）
  const floor2SaveBackup = await page.evaluate(() => localStorage.getItem('tianmeng_continent_save'))
  check('P1-027-B: 合法存档已备份', floor2SaveBackup !== null)
  await page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save')
    if (!raw) return
    const save = JSON.parse(raw)
    save.gameState.player.hp = 1
    localStorage.setItem('tianmeng_continent_save', JSON.stringify(save))
  })
  await page.reload()
  await sleep(600)
  await clickByText('继续游戏')
  await sleep(300)
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('武馆')
  await sleep(300)
  body = await bodyText()
  check('P1-027-B: 武馆休整入口存在', body.includes('武馆休整'))
  const restBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  check('P1-027-B: 注入后 HP=1', restBeforeHp !== null && restBeforeHp[1] === '1')
  await clickByText('休整')
  await sleep(300)
  body = await bodyText()
  const restAfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  check(
    'P1-027-B: 休整后 HP=maxHp',
    restBeforeHp !== null && restAfterHp !== null && restAfterHp[1] === restAfterHp[2] && restAfterHp[2] === restBeforeHp[2],
  )
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  // C. Continue（满血档）→ 武馆 → 天龙城 → 黑石塔一层 → 解锁二层
  await clickByText('继续游戏')
  await sleep(300)
  await clickByText('天龙城')
  await sleep(300)
  await clickByText('黑石塔一层')
  await sleep(300)
  body = await bodyText()
  check('P1-027-C: 一层士兵/队长已击败状态保持', body.includes('黑石塔一层：已击败骷髅士兵。') && body.includes('黑石塔一层：骷髅队长已击败，未发现夔峒项链。'))
  check('P1-027-C: 无附近威胁', !body.includes('附近威胁') && !body.includes('迎战'))
  check('P1-027-C: 继续深入块存在', body.includes('继续深入') && body.includes('深入黑石塔二层'))
  await clickByText('深入黑石塔二层')
  await sleep(300)
  body = await bodyText()
  check('P1-027-C: 解锁后继续深入块消失', !body.includes('深入黑石塔二层'))
  const floor2BtnAfterUnlock = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled }))
  })
  check(
    'P1-027-C: 解锁后黑石塔二层按钮 enabled',
    floor2BtnAfterUnlock.some((b) => b.text === '黑石塔二层' && !b.disabled),
  )
  // D. 进入二层：只看到僵尸（无黑法师）
  await clickByText('黑石塔二层')
  await sleep(300)
  body = await bodyText()
  check('P1-027-D: 当前位置黑石塔二层', body.includes('黑石塔二层'))
  check('P1-027-D: 只看到僵尸 Lv.4 迎战', body.includes('僵尸 · Lv.4') && body.includes('迎战'))
  check('P1-027-D: 无黑法师卡片', !body.includes('黑法师 · Lv.4'))
  check('P1-027-D: 二层移动按钮仅一层', body.includes('可前往'))
  // E. 挑战僵尸（Math.random 隔离 0.99）→ 胜利 → 僵尸消失 + 黑法师出现
  await clickByText('迎战')
  await sleep(300)
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
  await clickByText('返回冒险')
  await sleep(300)
  body = await bodyText()
  check('P1-027-E: 僵尸战斗胜利返回冒险', body.includes('当前位置'))
  check('P1-027-E: 僵尸消失', !body.includes('僵尸 · Lv.4'))
  check('P1-027-E: 黑法师出现 Lv.4 迎战', body.includes('黑法师 · Lv.4') && body.includes('迎战'))
  // F. 挑战黑法师 → 胜利 → 两敌均消失 + 清场剧情
  await clickByText('迎战')
  await sleep(300)
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
  await clickByText('返回冒险')
  await sleep(300)
  body = await bodyText()
  check('P1-027-F: 黑法师战斗胜利返回冒险', body.includes('当前位置'))
  // P1-028 到期调整：黑法师消失后骷髅战士出现，附近威胁区仍有骷髅战士（无僵尸/黑法师卡片）
  check('P1-027-F: 僵尸/黑法师卡片均消失', !body.includes('僵尸 · Lv.4') && !body.includes('黑法师 · Lv.4'))
  check('P1-027-F: 二层前段清场剧情', body.includes('二层前段的僵尸与黑法师已经被清理。'))
  check('P1-027-F: 骷髅战士剧情文本', body.includes('前方小厅中出现了更强的骷髅战士，挡住继续深入的道路。'))
  // P1-028 到期调整：二层深处【待开放】被骷髅战士正式开放取代
  check('P1-027-F: 无黑石塔二层深处：【待开放】', !body.includes('黑石塔二层深处：【待开放】'))
  check('P1-027-F: 骷髅战士出现 Lv.5 迎战（预告正式开放）', body.includes('骷髅战士 · Lv.5') && body.includes('迎战'))
  // G. 任务最终状态
  check('P1-027-G: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-027-G: 黑石塔二层：入口区域已清理', body.includes('黑石塔二层：入口区域已清理。'))
  // P1-028 到期调整：入口区清场后当前目标变为击败骷髅战士
  check('P1-027-G: 当前目标：击败骷髅战士', body.includes('当前目标：击败骷髅战士。'))
  check('P1-027-G: 无可完成/提交任务/已完成', !body.includes('提交任务') && !body.includes('可完成'))
  check('P1-027-G: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-027-G: 兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  // 保存二层清场档（供 H 注入与 I 恢复使用）
  await clickByText('保存游戏')
  // H. 负路径：僵尸未击败时黑法师不可通过正式战斗入口挑战（存档注入二层 + zombie 未击败）
  const floor2ClearedSave = await page.evaluate(() => localStorage.getItem('tianmeng_continent_save'))
  check('P1-027-H: 清场档已保存', floor2ClearedSave !== null && floor2ClearedSave.includes('floor2_black_mage_defeated'))
  await page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save')
    if (!raw) return
    const save = JSON.parse(raw)
    save.gameState.world.currentLocationId = 'black_stone_tower_floor2'
    save.gameState.world.flags.black_stone_tower_floor2_unlocked = true
    const quest = save.gameState.quests.find((q) => q.questId === 'quest_wangcai_trouble')
    if (quest && quest.flags) delete quest.flags.floor2_zombie_defeated
    if (quest && quest.flags) delete quest.flags.floor2_black_mage_defeated
    localStorage.setItem('tianmeng_continent_save', JSON.stringify(save))
  })
  await page.reload()
  await sleep(600)
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-027-H: 僵尸未击败时僵尸可见', body.includes('僵尸 · Lv.4') && body.includes('迎战'))
  check('P1-027-H: 黑法师不可见（无法经正式入口挑战）', !body.includes('黑法师 · Lv.4'))
  // P1-028 到期调整：入口区两敌未全部击败时骷髅战士同样不可见
  check('P1-027-H: 骷髅战士不可见', !body.includes('骷髅战士 · Lv.5'))
  const engageableButtons = await page.evaluate(() =>
    [...document.querySelectorAll('button')].filter((b) => b.textContent.includes('黑法师') || b.textContent.includes('骷髅战士')).map((b) => b.textContent.trim()),
  )
  check('P1-027-H: 页面无任何黑法师/骷髅战士按钮', engageableButtons.length === 0)
  // I. 恢复二层清场档（负路径注入不污染存档）
  await page.evaluate((saveStr) => {
    localStorage.setItem('tianmeng_continent_save', saveStr)
  }, floor2ClearedSave)
  await page.reload()
  await sleep(600)
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  // P1-028 到期调整：清场档在二层显示骷髅战士（入口区剧情保留，深处【待开放】删除）
  check(
    'P1-027-I: 恢复清场档后二层清场状态保持',
    body.includes('二层前段的僵尸与黑法师已经被清理。') && body.includes('骷髅战士 · Lv.5') && !body.includes('黑石塔二层深处：【待开放】'),
  )
  await clickByText('返回主菜单')

  // ================= TM-P1-028：黑石塔二层深处骷髅战士 =================
  // 起点：P1-027 二层清场档（floor2ClearedSave 已恢复，zombie+mage 均击败；主菜单）
  // 存档注入满 HP/MP（P1-027 战后残血不足以打满血 HP20 骷髅战士；P1-027-B 同模式测试手段）
  await page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save')
    if (!raw) return
    const save = JSON.parse(raw)
    save.gameState.player.hp = save.gameState.player.maxHp
    save.gameState.player.mp = save.gameState.player.maxMp
    localStorage.setItem('tianmeng_continent_save', JSON.stringify(save))
  })
  await page.reload()
  await sleep(600)
  // A. Continue → 二层只出现骷髅战士 Lv.5（僵尸/黑法师均消失；入口区清场剧情保留）
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-028-A: 当前位置 black_stone_tower_floor2', body.includes('当前位置') && body.includes('black_stone_tower_floor2'))
  check('P1-028-A: 二层入口区清场剧情保留', body.includes('二层前段的僵尸与黑法师已经被清理。'))
  check('P1-028-A: 只看到骷髅战士 Lv.5 迎战', body.includes('骷髅战士 · Lv.5') && body.includes('迎战'))
  check('P1-028-A: 无僵尸/黑法师卡片', !body.includes('僵尸 · Lv.4') && !body.includes('黑法师 · Lv.4'))
  // B. 记录战前状态（HP/MP 允许战斗变化）
  const warriorBeforeLevel = body.match(/Lv\.(\d+)/)
  const warriorBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const warriorBeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const warriorBeforeGold = body.match(/金币\s*(\d+)/)
  const warriorBeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  // C. 挑战骷髅战士（Math.random 隔离 0.99）→ 确定性胜利
  await clickByText('迎战')
  await sleep(300)
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
  await clickByText('返回冒险')
  await sleep(300)
  body = await bodyText()
  check('P1-028-C: 骷髅战士战斗胜利返回冒险', body.includes('当前位置'))
  // D. 骷髅战士消失 + 无附近威胁 + 击败后剧情四句
  check('P1-028-D: 骷髅战士消失', !body.includes('骷髅战士 · Lv.5'))
  check('P1-028-D: 无附近威胁/迎战', !body.includes('附近威胁') && !body.includes('迎战'))
  check('P1-028-D: 小厅中的骷髅战士已经倒下', body.includes('小厅中的骷髅战士已经倒下。'))
  check('P1-028-D: 仍未发现夔峒项链', body.includes('你仔细搜索了周围，依然没有发现王财遗失的夔峒项链。'))
  check('P1-028-D: 石阶通往黑石塔更高处', body.includes('小厅后方，一道向上的石阶通往黑石塔更高处。'))
  // P1-029 到期调整：三层【待开放】改为「继续向上」入口（仅调用 Store 解锁三层）
  check('P1-028-D: 无黑石塔三层：【待开放】', !body.includes('黑石塔三层：【待开放】'))
  check('P1-028-D: 继续向上入口存在', body.includes('继续向上'))
  // E. 任务日志最终态 + 不可提交
  check('P1-028-E: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-028-E: 黑石塔二层深处：骷髅战士已击败，仍未发现夔峒项链', body.includes('黑石塔二层深处：骷髅战士已击败，仍未发现夔峒项链。'))
  // P1-029 到期调整：当前目标改为击败骷髅女妖
  check('P1-028-E: 当前目标：击败骷髅女妖', body.includes('当前目标：击败骷髅女妖。'))
  check('P1-028-E: 无可完成/提交任务', !body.includes('提交任务') && !body.includes('可完成'))
  // F. 无奖励精确比较（Lv/maxHP/maxMP/gold/背包/rabbit_path 全不变）
  const warriorAfterLevel = body.match(/Lv\.(\d+)/)
  const warriorAfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const warriorAfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const warriorAfterGold = body.match(/金币\s*(\d+)/)
  const warriorAfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  check(
    'P1-028-F: 战前后 Lv/maxHP/maxMP/gold/rabbit_path 精确全不变',
    warriorBeforeLevel !== null && warriorAfterLevel !== null && warriorBeforeLevel[1] === warriorAfterLevel[1] &&
      warriorBeforeHp !== null && warriorAfterHp !== null && warriorBeforeHp[2] === warriorAfterHp[2] &&
      warriorBeforeMp !== null && warriorAfterMp !== null && warriorBeforeMp[2] === warriorAfterMp[2] &&
      warriorBeforeGold !== null && warriorAfterGold !== null && warriorBeforeGold[1] === warriorAfterGold[1] &&
      warriorBeforeMapCount !== null && warriorAfterMapCount !== null && warriorBeforeMapCount[1] === warriorAfterMapCount[1],
  )
  // G. 黄金兔子主线冻结
  check('P1-028-G: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-028-G: 兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  // H. Save/Continue 状态保持
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-028-H: 读档后当前位置 floor2', body.includes('当前位置') && body.includes('black_stone_tower_floor2'))
  check('P1-028-H: 日志最终态保持', body.includes('黑石塔二层深处：骷髅战士已击败，仍未发现夔峒项链。') && body.includes('当前目标：击败骷髅女妖。') && !body.includes('黑石塔三层：【待开放】'))
  check('P1-028-H: 无附近威胁/迎战', !body.includes('附近威胁') && !body.includes('迎战'))
  check('P1-028-H: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  await clickByText('返回主菜单')

  // ================= TM-P1-029：黑石塔三层骷髅女妖与夔峒项链 =================
  // 起点：P1-028-H 保存的档（二层、warrior 已击败、三层未解锁、HP 满；主菜单）
  // A. Continue → 二层 + 继续向上入口
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-029-A: 当前位置 floor2', body.includes('当前位置') && body.includes('black_stone_tower_floor2'))
  check('P1-029-A: 骷髅战士已消失', !body.includes('骷髅战士 · Lv.5'))
  check('P1-029-A: 继续向上入口存在', body.includes('继续向上'))
  check('P1-029-A: 无附近威胁/迎战', !body.includes('附近威胁') && !body.includes('迎战'))
  // R1：三层「继续向上」UI guard 负路径——注入异常存档验证入口不显示（合法状态已由 A 段确认入口存在）
  const floor3UnlockLegalSave = await page.evaluate(() => localStorage.getItem('tianmeng_continent_save'))
  const injectFloor3Entry = async (mutateBody) => {
    // 在浏览器侧执行注入（Node 侧无 localStorage）：mutateBody 是 new Function('gs', body) 的函数体字符串
    // 每条负路径先从 floor3UnlockLegalSave 恢复再注入单一异常（保证隔离，避免 stage=1 残留到下一条）
    await page.evaluate((body, legalSave) => {
      localStorage.setItem('tianmeng_continent_save', legalSave)
      const raw = localStorage.getItem('tianmeng_continent_save')
      if (!raw) return
      const save = JSON.parse(raw)
      save.gameState.world.currentLocationId = 'black_stone_tower_floor2'
      // eslint-disable-next-line no-new-func
      const fn = new Function('gs', body)
      fn(save.gameState)
      localStorage.setItem('tianmeng_continent_save', JSON.stringify(save))
    }, mutateBody, floor3UnlockLegalSave)
    await page.reload()
    await sleep(600)
    await clickByText('继续游戏')
    await sleep(300)
    return await bodyText()
  }
  // ① stage=1 → 不显示
  let b = await injectFloor3Entry("const q = gs.quests.find((x) => x.questId === 'quest_wangcai_trouble'); if (q) q.stage = 1")
  check('P1-029-R1: stage=1 不显示继续向上', !b.includes('继续向上'))
  // ② wangcai_briefed=false → 不显示
  b = await injectFloor3Entry("const q = gs.quests.find((x) => x.questId === 'quest_wangcai_trouble'); if (q) q.flags.wangcai_briefed = false")
  check('P1-029-R1: briefed=false 不显示继续向上', !b.includes('继续向上'))
  // ③ floor2_black_mage_defeated=false → 不显示
  b = await injectFloor3Entry("const q = gs.quests.find((x) => x.questId === 'quest_wangcai_trouble'); if (q) q.flags.floor2_black_mage_defeated = false")
  check('P1-029-R1: mage=false 不显示继续向上', !b.includes('继续向上'))
  // ④ black_stone_tower_floor3_unlocked="yes" → 不显示（malformed 不当 false）
  b = await injectFloor3Entry("gs.world.flags.black_stone_tower_floor3_unlocked = 'yes'")
  check('P1-029-R1: floor3_unlocked="yes" 不显示继续向上', !b.includes('继续向上'))
  // ⑤ 恢复合法存档 → 入口重新出现
  await page.evaluate((saveStr) => {
    localStorage.setItem('tianmeng_continent_save', saveStr)
  }, floor3UnlockLegalSave)
  await page.reload()
  await sleep(600)
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-029-R1: 恢复合法存档后继续向上入口重新出现', body.includes('继续向上'))
  // B. 继续向上 → 解锁三层
  await clickByText('继续向上')
  await sleep(300)
  body = await bodyText()
  check('P1-029-B: 解锁后继续向上入口消失', !body.includes('继续向上'))
  const floor2Travel3 = await page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '可前往：')
    if (!label) return []
    const container = label.parentElement
    if (!container) return []
    return [...container.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), disabled: b.disabled }))
  })
  check('P1-029-B: 二层移动按钮含黑石塔三层（enabled）', floor2Travel3.some((b) => b.text === '黑石塔三层' && !b.disabled))
  // C. 前往三层 → 骷髅女妖 Lv.5
  await clickByText('黑石塔三层')
  await sleep(300)
  body = await bodyText()
  check('P1-029-C: 当前位置 floor3', body.includes('当前位置') && body.includes('black_stone_tower_floor3'))
  check('P1-029-C: 地点黑石塔三层', body.includes('黑石塔三层'))
  check('P1-029-C: 三层描述', body.includes('越过石阶后，塔内变得更加阴冷'))
  check('P1-029-C: 只看到骷髅女妖 Lv.5 迎战', body.includes('骷髅女妖 · Lv.5') && body.includes('迎战'))
  // D. 记录战前状态（HP/MP 允许战斗变化）
  const witchBeforeLevel = body.match(/Lv\.(\d+)/)
  const witchBeforeHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const witchBeforeMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const witchBeforeGold = body.match(/金币\s*(\d+)/)
  const witchBeforeMapCount = body.match(/兔子的路径 ×(\d+)/)
  // E. 挑战骷髅女妖（Math.random 隔离 0.99）→ 确定性胜利
  await clickByText('迎战')
  await sleep(300)
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
  await clickByText('返回冒险')
  await sleep(300)
  body = await bodyText()
  check('P1-029-E: 骷髅女妖战斗胜利返回冒险', body.includes('当前位置'))
  // F. 女妖消失 + 无附近威胁 + 三层剧情
  check('P1-029-F: 骷髅女妖消失', !body.includes('骷髅女妖 · Lv.5'))
  check('P1-029-F: 无附近威胁/迎战', !body.includes('附近威胁') && !body.includes('迎战'))
  check('P1-029-F: 骷髅女妖倒在破碎的石柱之间', body.includes('骷髅女妖倒在破碎的石柱之间。'))
  check('P1-029-F: 灰尘覆盖的项链', body.includes('你在厅堂深处搜索时，发现了一条被灰尘覆盖的项链。'))
  check('P1-029-F: 正是王财所说的夔峒项链', body.includes('这正是王财所说的夔峒项链。'))
  check('P1-029-F: 夔峒项链 ×1 已获得', body.includes('夔峒项链 ×1 已获得。'))
  check('P1-029-F: 当前目标：返回天龙城，将夔峒项链交还王财', body.includes('当前目标：返回天龙城，将夔峒项链交还王财。'))
  // G. 任务日志最终态 + 不可提交
  check('P1-029-G: 商人王财的麻烦进行中', body.includes('商人王财的麻烦') && body.includes('进行中'))
  check('P1-029-G: 黑石塔三层：骷髅女妖已击败', body.includes('黑石塔三层：骷髅女妖已击败。'))
  check('P1-029-G: 黑石塔三层：已找到夔峒项链', body.includes('黑石塔三层：已找到夔峒项链。'))
  check('P1-029-G: 当前目标：返回天龙城，将夔峒项链交还王财', body.includes('当前目标：返回天龙城，将夔峒项链交还王财。'))
  check('P1-029-G: 无可完成/提交任务', !body.includes('提交任务') && !body.includes('可完成'))
  // H. 无奖励精确比较 + 项链 ×1 + 黄金主线不变
  const witchAfterLevel = body.match(/Lv\.(\d+)/)
  const witchAfterHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const witchAfterMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const witchAfterGold = body.match(/金币\s*(\d+)/)
  const witchAfterMapCount = body.match(/兔子的路径 ×(\d+)/)
  check(
    'P1-029-H: 战前后 Lv/maxHP/maxMP/gold/rabbit_path 精确全不变',
    witchBeforeLevel !== null && witchAfterLevel !== null && witchBeforeLevel[1] === witchAfterLevel[1] &&
      witchBeforeHp !== null && witchAfterHp !== null && witchBeforeHp[2] === witchAfterHp[2] &&
      witchBeforeMp !== null && witchAfterMp !== null && witchBeforeMp[2] === witchAfterMp[2] &&
      witchBeforeGold !== null && witchAfterGold !== null && witchBeforeGold[1] === witchAfterGold[1] &&
      witchBeforeMapCount !== null && witchAfterMapCount !== null && witchBeforeMapCount[1] === witchAfterMapCount[1],
  )
  const witchNecklaceCount = (body.match(/夔峒项链 ×(\d+)/) || [])[1]
  check('P1-029-H: 夔峒项链 ×1', witchNecklaceCount === '1')
  check('P1-029-H: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  // I. Save/Continue 状态保持
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-029-I: 读档后当前位置 floor3', body.includes('当前位置') && body.includes('black_stone_tower_floor3'))
  check('P1-029-I: 日志最终态保持', body.includes('黑石塔三层：骷髅女妖已击败。') && body.includes('黑石塔三层：已找到夔峒项链。') && body.includes('当前目标：返回天龙城，将夔峒项链交还王财。'))
  check('P1-029-I: 夔峒项链 ×1 保持', body.includes('夔峒项链 ×1'))
  check('P1-029-I: 无附近威胁/迎战', !body.includes('附近威胁') && !body.includes('迎战'))
  check('P1-029-I: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  await clickByText('返回主菜单')

  // ================= TM-P1-030：交还夔峒项链 → 向马科复命 → Phase 1 收口 =================
  // 起点：P1-029-I 保存的三层档（位置 floor3、女妖已击败、项链 ×1；主菜单）
  // A. Continue → 三层 + 项链 + 女妖已击败
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-030-A: 当前位置 floor3', body.includes('当前位置') && body.includes('black_stone_tower_floor3'))
  check('P1-030-A: 夔峒项链 ×1', body.includes('夔峒项链 ×1'))
  check('P1-030-A: 女妖已击败剧情', body.includes('骷髅女妖倒在破碎的石柱之间。'))
  check('P1-030-A: 无附近威胁/迎战', !body.includes('附近威胁') && !body.includes('迎战'))
  // B. 移动回天龙城（三层→二层→一层→天龙城）
  await clickByText('黑石塔二层')
  await sleep(250)
  body = await bodyText()
  check('P1-030-B: 经二层回城', body.includes('当前位置') && body.includes('black_stone_tower_floor2'))
  await clickByText('黑石塔一层')
  await sleep(250)
  body = await bodyText()
  check('P1-030-B: 经一层回城', body.includes('当前位置') && body.includes('black_stone_tower_floor1'))
  await clickByText('天龙城')
  await sleep(300)
  body = await bodyText()
  check('P1-030-B: 已到天龙城', body.includes('当前位置') && body.includes('tianlong_city'))
  // C. 找王财交还
  check('P1-030-C: 附近人物王财', body.includes('王财') && body.includes('商人'))
  await clickByText('交谈')
  await sleep(300)
  body = await bodyText()
  check('P1-030-C: 交还项链按钮存在', (await buttonDisabled('将夔峒项链交还王财')) === false)
  // P1-030-R1：交还按钮负路径——quantity=2 / 两条 entry 均不显示（与 Store 一致，避免 dead button）；每条从合法基线（唯一 entry、quantity=1、位置天龙城）独立恢复再注入单一异常
  const necklaceLegalSave = await page.evaluate(() => localStorage.getItem('tianmeng_continent_save'))
  const injectNecklaceSave = async (mutateBody) => {
    await page.evaluate((saveStr, body) => {
      localStorage.setItem('tianmeng_continent_save', saveStr)
      const raw = localStorage.getItem('tianmeng_continent_save')
      const save = JSON.parse(raw)
      save.gameState.world.currentLocationId = 'tianlong_city'
      // eslint-disable-next-line no-new-func
      const fn = new Function('gs', body)
      fn(save.gameState)
      localStorage.setItem('tianmeng_continent_save', JSON.stringify(save))
    }, necklaceLegalSave, mutateBody)
    await page.reload()
    await sleep(600)
    await clickByText('继续游戏')
    await sleep(300)
    await clickByText('交谈')
    await sleep(300)
    return await bodyText()
  }
  const wangcaiReturnBtnExists = () =>
    page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '将夔峒项链交还王财'))
  // ① quantity=2 → 不显示
  let nb = await injectNecklaceSave("const n = gs.inventory.find((i) => i.itemId === 'kuidong_necklace'); if (n) n.quantity = 2")
  check('P1-030-R1: quantity=2 不显示交还按钮', (await wangcaiReturnBtnExists()) === false)
  // ② 两条 entry ×1 → 不显示
  nb = await injectNecklaceSave("gs.inventory.push({ itemId: 'kuidong_necklace', quantity: 1 })")
  check('P1-030-R1: 两条 entry 不显示交还按钮', (await wangcaiReturnBtnExists()) === false)
  // ③ 恢复合法（injectNecklaceSave('') 空注入，设位置天龙城、quantity 保持 1）→ 交还按钮重现
  body = await injectNecklaceSave('')
  check('P1-030-R1: 恢复合法后交还按钮重现', (await buttonDisabled('将夔峒项链交还王财')) === false)
  // D. 交还项链
  await clickByText('将夔峒项链交还王财')
  await sleep(300)
  body = await bodyText()
  check('P1-030-D: 王财接过项链', body.includes('王财接过项链，久久没有说话。'))
  check('P1-030-D: 正是我妻子留下的东西', body.includes('“没错……就是它。这是我妻子留下的东西。”'))
  check('P1-030-D: 谢谢你找回', body.includes('“谢谢你。若不是你，我恐怕再也找不回来了。”'))
  check('P1-030-D: 王财郑重道谢', body.includes('王财收好项链，又向你郑重道谢。'))
  check('P1-030-D: 请告诉马科队长', body.includes('“黑石塔里的情况，也请你告诉马科队长。”'))
  check('P1-030-D: 交还按钮消失', (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '将夔峒项链交还王财'))) === false)
  check('P1-030-D: 背包无夔峒项链', !body.includes('夔峒项链 ×'))
  await clickByText('结束交谈')
  // E. 日志：交还后回武馆复命
  body = await bodyText()
  check('P1-030-E: 日志夔峒项链已交还王财', body.includes('夔峒项链：已交还王财。'))
  check('P1-030-E: 当前目标返回武馆向马科复命', body.includes('当前目标：返回武馆，向马科复命。'))
  // F. 去武馆找马科
  await clickByText('武馆')
  await sleep(300)
  body = await bodyText()
  check('P1-030-F: 已到武馆', body.includes('当前位置') && body.includes('tianlong_martial_hall'))
  check('P1-030-F: 附近人物马科', body.includes('马科'))
  await clickByText('交谈')
  await sleep(300)
  body = await bodyText()
  // G. 提交任务（复用 generic；交还后 completable）
  check('P1-030-G: 提交任务按钮存在', (await buttonDisabled('提交任务')) === false)
  await clickByText('提交任务')
  await sleep(300)
  body = await bodyText()
  check('P1-030-G: 马科听完经过', body.includes('马科听完黑石塔里的经过，神情明显严肃起来。'))
  check('P1-030-G: 魔物异动不是偶然', body.includes('“看来最近的魔物异动并不是偶然。”'))
  check('P1-030-G: 向上面汇报你先休息', body.includes('“这件事我会向上面汇报。你先休息一下。”'))
  check('P1-030-G: 黑石塔调查告一段落', body.includes('黑石塔的调查暂时告一段落。'))
  check('P1-030-G: 第一阶段完成', body.includes('第一阶段完成'))
  check('P1-030-G: 当前可玩主线内容已完成', body.includes('当前可玩主线内容已完成。'))
  check('P1-030-G: 黄金兔子后续阶段继续', body.includes('《追寻黄金兔子王》将在后续阶段继续。'))
  check('P1-030-G: 王财任务已完成', body.includes('商人王财的麻烦') && body.includes('已完成'))
  // H. 黄金兔子仍冻结 + 项链不在背包 + 无 dead button
  check('P1-030-H: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-030-H: 兔子的路径 ×1', body.includes('兔子的路径 ×1'))
  check('P1-030-H: 背包无夔峒项链', !body.includes('夔峒项链 ×'))
  check('P1-030-H: 无交还按钮残留', (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('交还王财')))) === false)
  check('P1-030-H: 无提交任务按钮残留', (await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '提交任务'))) === false)
  await clickByText('结束交谈')
  // I. Save → 主菜单 → Continue 后 Phase1 完成状态保持
  await clickByText('保存游戏')
  await clickByText('返回主菜单')
  await clickByText('继续游戏')
  await sleep(300)
  body = await bodyText()
  check('P1-030-I: Continue 后第一阶段完成保持', body.includes('第一阶段完成'))
  check('P1-030-I: 王财任务已完成', body.includes('商人王财的麻烦') && body.includes('已完成'))
  check('P1-030-I: 黄金兔子主线仍进行中', body.includes('追寻黄金兔子王') && body.includes('进行中'))
  check('P1-030-I: 兔子的路径 ×1 保持', body.includes('兔子的路径 ×1'))
  check('P1-030-I: 背包无夔峒项链', !body.includes('夔峒项链 ×'))
  await clickByText('返回主菜单')


  // TM-P1-015：战斗中使用治疗药水（独立最小段：默认骑士 + 村外草原魔化兔；魔化兔零修改 HP8/DEF11/atk+2/dmg2）
  // P1-007-R1 模式：段首只保存一次真实 Math.random
  await page.evaluate(() => {
    window.__p1015OriginalRandom = Math.random.bind(Math)
  })
  await clickByText('新游戏')
  await clickByText('确认进入天梦大陆')
  await clickByText('村外草原')
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  // A. 满血时禁用：药水 disabled + 生命已满；普通攻击仍可用
  check('P1-015-A: 满血时药水按钮禁用且显示生命已满', (await buttonDisabled('使用治疗药水（+8 生命）')) === true && body.includes('生命已满'))
  check('P1-015-A: 满血时普通攻击仍可用', (await buttonDisabled('普通攻击')) === false)
  // B. 确定性受伤：两轮 [玩家天然1, 敌天然20] → 22→18→14（敌暴击 2×2=4）；魔化兔 8/8 未受伤
  await page.evaluate(() => {
    const seq = [0, 0.99, 0, 0.99]
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('普通攻击')
  await sleep(250)
  await clickByText('普通攻击')
  await sleep(250)
  body = await bodyText()
  check('P1-015-B: 两轮大失败受伤后生命 14 / 22', body.includes('14 / 22'))
  check('P1-015-B: 魔化兔 8 / 8 未受伤', body.includes('8 / 8'))
  check('P1-015-B: 受伤后药水按钮可用', (await buttonDisabled('使用治疗药水（+8 生命）')) === false)
  // C. 第一瓶：恢复 14→22（实际+8），敌普通命中反击 2 伤 → 20/22；药水 2→1
  await page.evaluate(() => {
    const seq = [0.5] // 敌普通命中（非暴击非天然1）
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('使用治疗药水（+8 生命）')
  await sleep(300)
  body = await bodyText()
  check('P1-015-C: 第一瓶后生命 20 / 22', body.includes('20 / 22'))
  check('P1-015-C: 魔化兔仍 8 / 8', body.includes('8 / 8'))
  check('P1-015-C: 灵力仍 6 / 6', body.includes('6 / 6'))
  check('P1-015-C: 药水剩余 1', body.includes('剩余：1'))
  check('P1-015-C: 日志显示恢复 8 点生命', body.includes('你使用了治疗药水：恢复 8 点生命。'))
  check('P1-015-C: 日志显示魔化兔的攻击', body.includes('魔化兔的攻击：'))
  // D. 喝药是治疗行动不是攻击：无玩家攻击/技能日志；敌 HP 不变
  check('P1-015-D: 无你的攻击/骑士重击日志', !body.includes('你的攻击：') && !body.includes('你的骑士重击：'))
  // E. 第二瓶：上限截断实际恢复 2（20→22），敌天然1 大失败；药水 1→0
  await page.evaluate(() => {
    const seq = [0] // 敌天然1 大失败
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('使用治疗药水（+8 生命）')
  await sleep(300)
  body = await bodyText()
  check('P1-015-E: 第二瓶后生命 22 / 22', body.includes('22 / 22'))
  check('P1-015-E: 日志显示实际恢复 2 点生命（非8）', body.includes('你使用了治疗药水：恢复 2 点生命。'))
  check('P1-015-E: 魔化兔的攻击且大失败', body.includes('魔化兔的攻击：') && body.includes('大失败'))
  // F. 库存耗尽：没有治疗药水 + disabled + 普通攻击仍可用 + MP 6/6 + 魔化兔 8/8
  check('P1-015-F: 显示没有治疗药水', body.includes('没有治疗药水'))
  check('P1-015-F: 药水按钮禁用', (await buttonDisabled('使用治疗药水（+8 生命）')) === true)
  check('P1-015-F: 普通攻击仍可用', (await buttonDisabled('普通攻击')) === false)
  check('P1-015-F: 灵力仍 6 / 6 且魔化兔 8 / 8', body.includes('6 / 6') && body.includes('8 / 8'))
  // G. 继续正常战斗：玩家天然20 暴击 12 伤击杀魔化兔（8HP）
  await page.evaluate(() => {
    const seq = [0.99]
    let i = 0
    Math.random = () => seq[Math.min(i++, seq.length - 1)]
  })
  await clickByText('普通攻击')
  await sleep(300)
  body = await bodyText()
  check('P1-015-G: 后续普攻正常暴击胜利', body.includes('战斗胜利') && body.includes('暴击'))
  await clickByText('返回冒险')
  await clickByText('返回主菜单')
  // P1-007-R1 模式：确定性断言——段末 Math.random 与段首保存的真实函数同一引用
  const p1015Restored = await page.evaluate(() => {
    const original = window.__p1015OriginalRandom
    Math.random = original
    const isOriginal = Math.random === original
    delete window.__p1015OriginalRandom
    return isOriginal
  })
  check('P1-015-R1: 段末 Math.random 已恢复真实实现（不污染后续测试）', p1015Restored === true)

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
