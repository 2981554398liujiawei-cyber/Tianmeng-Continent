import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5220
const APP_URL = `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
for (let i = 0; i < 60; i++) { try { await fetch(APP_URL); break } catch { await sleep(250) } }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 900 })
await page.goto(APP_URL, { waitUntil: 'networkidle0' })
await page.evaluate(() => { localStorage.clear(); const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('仅本机模式')); b?.click() })
await sleep(300)
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('新游戏')); b?.click() })
await sleep(300)
await page.type('input[placeholder="输入角色姓名"]', '探查员')
await page.evaluate(() => { [...document.querySelectorAll('label')].find((l) => l.textContent.includes('骑士'))?.click() })
await sleep(200)
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('使用职业推荐配点'))?.click() })
await sleep(200)
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('确认进入天梦大陆'))?.click() })
await sleep(800)
// 右栏任务中心文本
const questText = await page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')
console.log('=== quest-column 文本 ===')
console.log(questText.slice(0, 600))
// 附近人物按钮
const npcBtns = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t))
console.log('=== 全部按钮 ===')
console.log(JSON.stringify(npcBtns))
// 点击第 0 个交谈（村长）
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '交谈')?.click() })
await sleep(500)
const modalText = await page.evaluate(() => document.body.textContent)
console.log('=== 打开交谈后包含关键词 ===')
for (const kw of ['村长', '购买装备', '相关委托', '离开', '交谈', '结束交谈']) {
  console.log(`${kw}: ${modalText.includes(kw)}`)
}
const modalBtns = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t))
console.log('=== 面板按钮 ===')
console.log(JSON.stringify(modalBtns))
await browser.close()
dev.kill()
