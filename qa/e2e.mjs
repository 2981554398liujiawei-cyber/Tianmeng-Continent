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

const continueDisabled = () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('继续游戏'))
    return btn ? btn.disabled : null
  })

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
