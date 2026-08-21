// TM-P2-005：真实应用布局回归。脚本自启 Vite，覆盖手机/平板/桌面视口并检查裁切。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5212
const APP_URL = `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`) }

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()

async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

async function enterGame() {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  const localMode = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('仅本机模式'))
    if (!button) return false
    button.click()
    return true
  })
  if (localMode) await sleep(250)
  await page.evaluate(() => localStorage.clear())
  await page.reload({ waitUntil: 'networkidle0' })
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('仅本机模式'))?.click())
  await sleep(250)
  const clickText = async (text) => {
    const clicked = await page.evaluate((label) => {
      const button = [...document.querySelectorAll('button')].find((el) => el.textContent.includes(label))
      if (!button) return false
      button.click()
      return true
    }, text)
    if (clicked) await sleep(100)
    return clicked
  }
  if (!await clickText('新游戏')) throw new Error('未进入角色创建页：' + await page.evaluate(() => document.body.textContent.slice(0, 120)))
  await sleep(150)
  const name = await page.$('input[placeholder="输入角色姓名"]')
  if (name) {
    await name.type('布局测试员')
    await page.evaluate(() => [...document.querySelectorAll('label')].find((l) => l.textContent.includes('骑士'))?.click())
    await clickText('使用职业推荐配点')
    await clickText('确认进入天梦大陆')
  } else throw new Error('未找到角色姓名输入框：' + await page.evaluate(() => document.body.textContent.slice(0, 120)))
  await sleep(350)
}

try {
  await ready()
  for (const [width, height] of [[1920, 1080], [1600, 900], [1366, 768], [1024, 768], [390, 844]]) {
    await page.setViewport({ width, height })
    await enterGame()
    const metrics = await page.evaluate(() => ({
      innerWidth: window.innerWidth,
      docWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      outerHeight: document.scrollingElement.scrollHeight,
      clientHeight: document.scrollingElement.clientHeight,
      clipped: [...document.querySelectorAll('body *')].some((el) => { const r = el.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1 }),
      criticalInView: ['header', '[data-testid="player-column"]', '[data-testid="quest-column"]'].every((selector) => {
        const el = document.querySelector(selector)
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.top >= -1 && r.left >= -1 && r.right <= window.innerWidth + 1 && r.top < window.innerHeight
      }),
    }))
    check(`${width}x${height}: 无横向滚动`, metrics.docWidth <= width && metrics.bodyWidth <= width, `doc=${metrics.docWidth} body=${metrics.bodyWidth}`)
    check(`${width}x${height}: 无元素越过视口`, !metrics.clipped)
    check(`${width}x${height}: 游戏三栏与防具 UI 可渲染`, await page.evaluate(() => Boolean(document.querySelector('[data-testid="player-column"]')) && Boolean(document.querySelector('[data-testid="main-column"]')) && document.body.textContent.includes('防具')))
    check(`${width}x${height}: header/player/current objective 均在首屏`, metrics.criticalInView)
    if (width >= 1280) check(`${width}x${height}: 浏览器外层无纵向滚动`, metrics.outerHeight <= metrics.clientHeight + 1, `scroll=${metrics.outerHeight} client=${metrics.clientHeight}`)
  }
} catch (error) {
  check('布局脚本执行无异常', false, String(error))
} finally {
  await browser.close()
  dev.kill()
}

const failed = results.filter((ok) => !ok).length
console.log(`===== 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
