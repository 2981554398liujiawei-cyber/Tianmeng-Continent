import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5226
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
await page.type('input', '调试骑士')
await page.evaluate(() => { const l = [...document.querySelectorAll('label')].find((el) => el.textContent.includes('骑士')); if (l) l.click() })
await sleep(200); await clickBtn('使用职业推荐配点'); await sleep(200); await clickBtn('确认')
await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 }); await sleep(300)
const acceptQuest = async (title) => {
  await page.evaluate((t) => { const col = document.querySelector('[data-testid="quest-column"]'); const nameEl = [...col.querySelectorAll('p')].find((p) => p.textContent.includes(`《${t}》`)); let row = nameEl; while (row && row !== col) { const b = [...row.querySelectorAll('button')].find((x) => x.textContent.trim() === '查看'); if (b) { b.click(); return } row = row.parentElement } }, title)
  await sleep(400)
  await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const b = [...col.querySelectorAll('button')].find((x) => x.textContent.includes('查看委托')); if (b) b.click() })
  await sleep(300)
  await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const b = [...col.querySelectorAll('button')].find((x) => x.textContent.includes('接受任务')); if (b) b.click() })
  await sleep(400)
}
// 接村外异动 → 打魔化兔 → 提交
await acceptQuest('村外异动')
await clickBtn('村外草原'); await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(300)
await page.evaluate(() => { Math.random = () => 0.99 })
for (let i = 0; i < 10; i++) {
  const b = await page.evaluate(() => document.body.innerText)
  if (b.includes('返回冒险')) break
  await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('骑士重击')); if (x && !x.disabled) x.click(); else { const s = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能')); if (s && !s.disabled) s.click() } })
  await sleep(500)
}
if (await page.evaluate(() => document.body.textContent.includes('返回冒险'))) await clickBtn('返回冒险')
await clickBtn('青石村'); await sleep(300)
// 提交
await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const b = [...col.querySelectorAll('button')].find((x) => x.textContent.includes('提交任务')); if (b) b.click() })
await sleep(400)
// 关 Modal
const hasModal = await page.evaluate(() => document.body.textContent.includes('任务完成'))
if (hasModal) { await page.evaluate(() => { [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '知道了').forEach((b) => b.click()) }); await sleep(400) }
// 接草原狼影
await acceptQuest('草原狼影')
await clickBtn('村外草原'); await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(300)
const dump = async (label) => {
  const info = await page.evaluate(() => ({
    hp: (document.body.textContent.match(/生命\s*(\d+)\s*\/\s*(\d+)/) || [])[1],
    buttons: [...document.querySelectorAll('button')].map((b) => `${b.textContent.trim()}|${b.disabled ? 'D' : 'E'}`).slice(0, 8),
    phase: document.body.textContent.includes('战斗胜利') ? 'VICTORY' : document.body.textContent.includes('战斗失败') ? 'DEFEAT' : 'active',
  }))
  console.log(label, JSON.stringify(info))
}
await page.evaluate(() => { Math.random = () => 0.99 })
for (let i = 0; i < 12; i++) {
  await dump(`round${i}`)
  const b = await page.evaluate(() => document.body.innerText)
  if (b.includes('返回冒险')) break
  // 模拟 combatLoop：用药 → 技能 → 普通
  const hpInfo = await page.evaluate(() => { const m = document.body.textContent.match(/生命\s*(\d+)\s*\/\s*(\d+)/); return m ? Number(m[1]) / Number(m[2]) : 1 })
  if (hpInfo < 0.7) {
    await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('物品')); if (x && !x.disabled) x.click() })
    await sleep(300)
    const used = await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('使用治疗药水')); if (x && !x.disabled) { x.click(); return true } return false })
    if (used) { await sleep(400); continue }
    await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('物品')); if (x) x.click() })
    await sleep(200)
  }
  const skillOpen = await page.evaluate(() => { const s = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能')); if (s && !s.disabled) { s.click(); return true } return false })
  if (skillOpen) {
    await sleep(300)
    const skillUsed2 = await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('骑士重击')); if (x && !x.disabled) { x.click(); return true } return false })
    if (skillUsed2) { await sleep(500); continue }
    await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能')); if (x) x.click() })
    await sleep(200)
  }
  await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('普通攻击')); if (x) x.click() })
  await sleep(500)
}
await dump('final')
await browser.close(); dev.kill(); await rm(profile, { recursive: true, force: true })
