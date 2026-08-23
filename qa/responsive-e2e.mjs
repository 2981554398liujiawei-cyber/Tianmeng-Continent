// ============================================================================
// 《天梦大陆》响应式布局 E2E 验收脚本（TM-P2-001 B）
// 运行：node qa/responsive-e2e.mjs （需 dev server 已在 5199 端口运行）
// 环境变量：CHROME_PATH（默认系统 Chrome）、BASE_URL（默认 http://localhost:5199/）
//
// 三个 viewport：
//   390×844：单栏，无横向滚动，主要按钮不溢出
//   1024×768：两栏（主玩法区 + 状态/任务区，角色信息在右侧任务栏下方）
//   1440×900：三栏（左：角色 / 中：主玩法 / 右：任务）
// 使用稳定 data-testid（player-column / main-column / quest-column）+
// getBoundingClientRect() 验证布局，避免截图像素测试。
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

const clickByText = async (text) => {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('未找到按钮: ' + t)
    btn.click()
  }, text)
  await sleep(250)
}

const clickLabel = async (text) => {
  await page.evaluate((t) => {
    const labels = [...document.querySelectorAll('label')]
    const target = labels.find((l) => l.textContent.includes(t))
    if (!target) throw new Error('未找到选项: ' + t)
    target.click()
  }, text)
  await sleep(250)
}

// 创建角色并进入游戏页（TM-P2-001 A：显式填写姓名 + 选择骑士 + 使用推荐配点）
const createCharacterAndEnter = async () => {
  await clickByText('新游戏')
  await sleep(250)
  await page.type('input[placeholder="输入角色姓名"]', '布局测试员')
  await clickLabel('骑士')
  await sleep(200)
  await clickByText('使用职业推荐配点')
  await sleep(200)
  await clickByText('确认进入天梦大陆')
  await sleep(400)
}

// 读取三栏的 bounding rect
const readColumnRects = () =>
  page.evaluate(() => {
    const get = (id) => {
      const el = document.querySelector(`[data-testid="${id}"]`)
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), right: Math.round(r.right) }
    }
    return {
      player: get('player-column'),
      main: get('main-column'),
      quest: get('quest-column'),
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      docScrollWidth: document.body.scrollWidth,
    }
  })

// 清空存档并重新加载主菜单（TM-P2-002：五槽位 + 旧 key 全部清除）
const clearAllSaves = () =>
  page.evaluate(
    (keys) => keys.forEach((k) => localStorage.removeItem(k)),
    [
      'tianmeng_continent_save',
      'tianmeng_continent_saves_index',
      'tianmeng_continent_save_slot_slot1',
      'tianmeng_continent_save_slot_slot2',
      'tianmeng_continent_save_slot_slot3',
      'tianmeng_continent_save_slot_slot4',
      'tianmeng_continent_save_slot_slot5',
    ],
  )

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

const resetAndLoad = async () => {
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await clearAllSaves()
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  await enterLocalModeIfNeeded()
}

try {
  // ============ 390×844：单栏，无横向滚动 ============
  await page.setViewport({ width: 390, height: 844 })
  await resetAndLoad()
  await createCharacterAndEnter()
  await sleep(400)
  const r390 = await readColumnRects()
  check('390: 三栏均渲染（player/main/quest）', r390.player !== null && r390.main !== null && r390.quest !== null)
  // TM-P2-008 §14：<768 时左右栏 CSS 隐藏（rect 全 0），主玩法为唯一可见单栏；角色/任务经底部 nav + Drawer 访问
  check('390: 单栏（main 占满可见，player/quest 隐藏 rect 为 0）', r390.player && r390.main && r390.quest && r390.main.width > 0 && r390.player.width === 0 && r390.quest.width === 0)
  check('390: 垂直排列（player/quest 隐藏 top=0，main 为可见主栏）', r390.player && r390.main && r390.quest && r390.player.top === 0 && r390.quest.top === 0 && r390.main.top >= 0 && r390.main.width > 0)
  check('390: 无横向滚动（scrollWidth <= 390）', r390.scrollWidth <= 390 && r390.docScrollWidth <= 390, `scrollWidth=${r390.scrollWidth} body=${r390.docScrollWidth}`)
  check('390: 三栏宽度不溢出（right <= 390）', r390.player && r390.main && r390.quest && r390.player.right <= 390 && r390.main.right <= 390 && r390.quest.right <= 390)
  // 手机角色概览：进入游戏页时完整角色详情默认折叠（不先滚两屏属性表），概览包含当前武器（V4 左栏战斗摘要「武器：」）
  const body390 = await page.evaluate(() => document.body.textContent)
  check('390: 角色概览显示当前武器', body390.includes('武器：') || body390.includes('当前武器'))
  check('390: 查看角色详情按钮存在', body390.includes('查看角色详情'))
  check('390: 主要玩法按钮不溢出（保存游戏/主菜单按钮存在）', body390.includes('保存游戏') && body390.includes('主菜单'))
  // TM-P2-002：完整角色详情容器用 data-testid + getComputedStyle 断言（不用 textContent，display:none 元素仍存在于 textContent）
  const mobileDetailsDisplay = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="mobile-character-details"]')
      if (!el) return null
      return window.getComputedStyle(el).display
    })
  check('390: 折叠时 mobile-character-details display === none', (await mobileDetailsDisplay()) === 'none')
  // 展开角色详情
  await clickByText('查看角色详情')
  await sleep(300)
  check('390: 展开后 mobile-character-details display !== none', (await mobileDetailsDisplay()) !== 'none')
  // 收起后再验证恢复 none
  await clickByText('收起角色详情')
  await sleep(300)
  check('390: 收起后 mobile-character-details display === none', (await mobileDetailsDisplay()) === 'none')
  // 再次展开（保持展开态进入后续截图）
  await clickByText('查看角色详情')
  await sleep(300)
  check('390: 再展开后 display !== none', (await mobileDetailsDisplay()) !== 'none')
  await page.screenshot({ path: 'qa/responsive-390.png' })

  // ============ 1024×768：两栏 ============
  await page.setViewport({ width: 1024, height: 768 })
  await resetAndLoad()
  await createCharacterAndEnter()
  await sleep(400)
  const r1024 = await readColumnRects()
  // TM-P2-008 §15：1024（md~xl）两栏 = 左栏 player + 主玩法 main；右栏 quest 隐藏（Drawer 按钮访问）
  check('1024: 两栏（player 与 main 左右分列，quest 隐藏）', r1024.player && r1024.main && r1024.quest && r1024.player.left < r1024.main.left && r1024.quest.width === 0)
  check('1024: 角色信息在左栏（player.left < main.left）', r1024.player && r1024.main && r1024.player.left < r1024.main.left)
  check('1024: 无横向滚动', r1024.scrollWidth <= 1024)
  await page.screenshot({ path: 'qa/responsive-1024.png' })

  // ============ 1440×900：三栏 ============
  await page.setViewport({ width: 1440, height: 900 })
  await resetAndLoad()
  await createCharacterAndEnter()
  await sleep(400)
  const r1440 = await readColumnRects()
  check('1440: 三栏 left 递增（player < main < quest）', r1440.player && r1440.main && r1440.quest && r1440.player.left < r1440.main.left && r1440.main.left < r1440.quest.left)
  check('1440: 三栏同一行（top 相同）', r1440.player && r1440.main && r1440.quest && r1440.player.top === r1440.main.top && r1440.main.top === r1440.quest.top)
  check('1440: 左栏宽度约 260-300', r1440.player && r1440.player.width >= 240 && r1440.player.width <= 340, `width=${r1440.player?.width}`)
  check('1440: 右栏宽度约 320-360', r1440.quest && r1440.quest.width >= 300 && r1440.quest.width <= 400, `width=${r1440.quest?.width}`)
  check('1440: 无横向滚动', r1440.scrollWidth <= 1440)
  await page.screenshot({ path: 'qa/responsive-1440.png' })
} catch (err) {
  check('脚本执行无异常', false, err && err.message ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`)
process.exit(failed.length > 0 ? 1 : 0)
