// 一次性 E2E QA 脚本：验证 TM-P0-001 验收标准 B/D/E/F 及 R1 存档边界收敛
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

  // B.2 点击新游戏进入游戏页面
  await clickByText('新游戏')
  body = await bodyText()
  check('点击新游戏进入游戏页面（冒险日志）', body.includes('冒险日志'))
  check('游戏页显示角色「石头城」', body.includes('石头城'))
  check('游戏页显示职业「骑士」', body.includes('骑士'))
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
