// Production Smoke QA：验证 TM-P0-023 —— 生产构建主菜单隐藏开发者控制台
// 运行方式（真实生产构建，不得拿 dev server 冒充）：
//   npm run build
//   npm run preview -- --port 5198
//   BASE_URL=http://localhost:5198 node qa/prod-smoke.mjs
// 环境变量：CHROME_PATH（默认系统 Chrome）、BASE_URL（默认 http://localhost:5198/）
// 本脚本只验证主菜单正式入口；不点击新游戏、不写 localStorage、不修改 GameState。
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.BASE_URL || 'http://localhost:5198/'
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

try {
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(800)
  await enterLocalModeIfNeeded()
  const body = await page.evaluate(() => document.body.textContent)

  // TM-P0-023：生产主菜单只保留正式玩家入口
  check('Prod: 显示天梦大陆', body.includes('天梦大陆'))
  check('Prod: 显示新游戏', body.includes('新游戏'))
  check('Prod: 显示继续游戏', body.includes('继续游戏'))
  check('Prod: 不显示开发者控制台', !body.includes('开发者控制台'))

  // 生产主菜单 DOM 中不存在开发者控制台按钮
  const hasDevButton = await page.evaluate(() =>
    [...document.querySelectorAll('button')].some((b) => b.textContent.includes('开发者控制台')),
  )
  check('Prod: 主菜单无开发者控制台按钮', !hasDevButton)

  // 未写 localStorage（不触碰任何状态）
  const saved = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('tianmeng')))
  check('Prod: 未写入任何存档状态', saved.length === 0, `keys=${saved.join(',')}`)
} catch (err) {
  check('Prod: 脚本执行无异常', false, String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== 结果：${results.length - failed}/${results.length} 通过 =====`)
if (failed > 0) process.exit(1)
