import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5225
const APP_URL = `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-probe-'))
const dev = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768 })
for (let i = 0; i < 40; i++) { try { await fetch(APP_URL); break } catch { await sleep(250) } }
const enterLocal = async () => { const c = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式')); if (b) { b.click(); return true } return false }); if (c) await sleep(400) }
await page.goto(APP_URL, { waitUntil: 'networkidle0' }); await enterLocal()
await page.evaluate(() => { localStorage.clear() })
await page.reload({ waitUntil: 'networkidle0' }); await enterLocal()
const clickBtn = async (t) => { await page.evaluate((label) => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(label)); if (b && !b.disabled) b.click() }, t); await sleep(500) }
await clickBtn('新游戏')
// 创建角色：姓名 + 骑士 + 推荐配点
await page.type('input', '调试骑士')
await page.evaluate(() => { const l = [...document.querySelectorAll('label')].find((el) => el.textContent.includes('骑士')); if (l) l.click() })
await sleep(200)
await clickBtn('使用职业推荐配点'); await sleep(200)
await clickBtn('确认')
await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 }); await sleep(300)
// 接村外异动
const qc = await page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')
console.log('QUESTCOL:', qc.slice(0, 200))
await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const nameEl = [...col.querySelectorAll('p')].find((p) => p.textContent.includes('《村外异动》')); let row = nameEl; while (row && row !== col) { const b = [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === '查看'); if (b) { b.click(); return } row = row.parentElement } })
await sleep(400)
await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const b = [...col.querySelectorAll('button')].find((x) => x.textContent.includes('查看委托')); if (b) b.click() })
await sleep(300)
await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const b = [...col.querySelectorAll('button')].find((x) => x.textContent.includes('接受任务')); if (b) b.click() })
await sleep(400)
await clickBtn('村外草原'); await sleep(400)
await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(300)
const dump = async (label) => {
  const info = await page.evaluate(() => ({
    hp: (document.body.textContent.match(/生命\s*(\d+)\s*\/\s*(\d+)/) || [])[1],
    buttons: [...document.querySelectorAll('button')].map((b) => `${b.textContent.trim()}|${b.disabled ? 'D' : 'E'}`).filter((t) => !t.startsWith('查看|')).slice(0, 12),
    phase: document.body.textContent.includes('战斗胜利') ? 'VICTORY' : document.body.textContent.includes('战斗失败') ? 'DEFEAT' : 'active',
    feed: document.querySelector('[data-testid="combat-summary-feed"]')?.textContent?.slice(0, 120),
  }))
  console.log(label, JSON.stringify(info))
}
await dump('start')
await page.evaluate(() => { Math.random = () => 0.99 })
// 模拟 combatLoop 第一轮：技能优先
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('技能')); if (b && !b.disabled) b.click() })
await sleep(300)
await dump('skillTrayOpen')
await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('骑士重击')); if (b && !b.disabled) b.click() })
await sleep(700)
await dump('afterSkill')
await browser.close(); dev.kill(); await rm(profile, { recursive: true, force: true })
