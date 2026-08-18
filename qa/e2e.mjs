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
  // D. 查看前状态快照（等级/生命/灵力/金币/位置）
  const beforePathLevel = body.match(/Lv\.(\d+)/)
  const beforePathHp = body.match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  const beforePathMp = body.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
  const beforePathGold = body.match(/金币\s*(\d+)/)
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
  check('P1-013-D: 查看后仍在兔王巢穴（位置不变）', body.includes('兔王巢穴'))
  check(
    'P1-013-D: 查看后等级/生命/灵力/金币全不变',
    beforePathLevel !== null && afterPathLevel !== null && beforePathLevel[1] === afterPathLevel[1] &&
      beforePathHp !== null && afterPathHp !== null && beforePathHp[1] === afterPathHp[1] && beforePathHp[2] === afterPathHp[2] &&
      beforePathMp !== null && afterPathMp !== null && beforePathMp[1] === afterPathMp[1] && beforePathMp[2] === afterPathMp[2] &&
      beforePathGold !== null && afterPathGold !== null && beforePathGold[1] === afterPathGold[1],
  )
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
