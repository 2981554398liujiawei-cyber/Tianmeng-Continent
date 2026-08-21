import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5221
const APP_URL = `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
for (let i = 0; i < 60; i++) { try { await fetch(APP_URL); break } catch { await sleep(250) } }
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 900 })
await page.goto(APP_URL, { waitUntil: 'networkidle0' })
await page.evaluate(() => { localStorage.clear(); [...document.querySelectorAll('button')].find((x) => x.textContent.includes('仅本机模式'))?.click() })
await sleep(300)
await page.evaluate(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.includes('新游戏'))?.click() })
await sleep(300)
await page.type('input[placeholder="输入角色姓名"]', '探查员2')
await page.evaluate(() => { [...document.querySelectorAll('label')].find((l) => l.textContent.includes('骑士'))?.click() })
await sleep(200)
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('使用职业推荐配点'))?.click() })
await sleep(200)
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('确认进入天梦大陆'))?.click() })
await sleep(800)
// 点击第 2 个交谈（药师 index 2）→ 无购买装备；点第 1 个（铁匠）
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '交谈')[1]?.click() })
await sleep(500)
let btns = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t))
console.log('=== 铁匠面板按钮 ===')
console.log(JSON.stringify(btns))
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.includes('购买装备'))?.click() })
await sleep(500)
const shopText = await page.evaluate(() => document.querySelector('[data-testid="merchant-panel"]')?.textContent || 'NO-PANEL')
console.log('=== MerchantPanel 文本 ===')
console.log(shopText.slice(0, 400))
btns = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t))
console.log('=== 商店内按钮 ===')
console.log(JSON.stringify(btns.filter((t) => ['购买', '返回交谈', '关闭'].includes(t))))
// 关闭面板
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '关闭')?.click() })
await sleep(300)
// 右栏「查看」展开委托
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '查看')?.click() })
await sleep(400)
const questCol = await page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')
console.log('=== 展开委托后 quest-column ===')
console.log(questCol.slice(0, 400))
btns = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => t))
console.log('=== 展开后按钮 ===')
console.log(JSON.stringify(btns.filter((t) => ['查看', '收起', '查看委托', '接受任务', '找到发布者'].includes(t))))
await browser.close()
dev.kill()
