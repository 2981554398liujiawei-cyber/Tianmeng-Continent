import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 5229
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
const combatLoopProbe = async (label) => {
  await page.evaluate(() => { window.__origRandom = Math.random.bind(Math); Math.random = () => 0.99 })
  for (let i = 0; i < 30; i++) {
    const cb = await page.evaluate(() => document.body.innerText)
    if (cb.includes('返回冒险')) break
    if (!cb.includes('普通攻击')) break
    const hpM = cb.match(/生命\s*(\d+)\s*\/\s*(\d+)/); const mpM = cb.match(/灵力\s*(\d+)\s*\/\s*(\d+)/)
    console.log(`R${i} HP=${hpM?.[1]}/${hpM?.[2]} MP=${mpM?.[1]} feed=${cb.includes('战斗失败') ? 'DEFEAT' : ''}`)
    const skillOpen = await page.evaluate(() => { const s = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能')); if (s && !s.disabled) { s.click(); return true } return false })
    if (skillOpen) {
      await sleep(300)
      const skillUsed = await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('骑士重击')); if (x && !x.disabled) { x.click(); return true } return false })
      if (skillUsed) { console.log(`  → 技能`); await sleep(500); continue }
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('技能'))?.click())
      await sleep(200)
    }
    if (hpM && Number(hpM[1]) / Number(hpM[2]) < 0.7) {
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('物品'))?.click())
      await sleep(300)
      const used = await page.evaluate(() => { const x = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('使用治疗药水')); if (x && !x.disabled) { x.click(); return true } return false })
      if (used) { console.log(`  → 用药`); await sleep(500); continue }
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('物品'))?.click())
      await sleep(200)
    }
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('普通攻击'))?.click())
    console.log(`  → 普攻`)
    await sleep(500)
  }
  await page.evaluate(() => { Math.random = window.__origRandom })
}
// 村外异动 → 魔化兔 → 提交
await acceptQuest('村外异动'); await clickBtn('村外草原'); await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(300)
await combatLoopProbe('兔')
await clickBtn('返回冒险'); await clickBtn('青石村'); await sleep(300)
await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const x = [...col.querySelectorAll('button')].find((el) => el.textContent.includes('提交任务')); if (x) x.click() })
await sleep(400)
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === '知道了').forEach((x) => x.click()) })
await sleep(300)
// 矿洞清理 → 魔化鼠
await acceptQuest('矿洞清理'); await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '休整'); if (b && !b.disabled) b.click() }); await sleep(400)
await clickBtn('废弃矿洞'); await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(300)
await combatLoopProbe('鼠')
await clickBtn('返回冒险'); await clickBtn('青石村'); await sleep(300)
await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const x = [...col.querySelectorAll('button')].find((el) => el.textContent.includes('提交任务')); if (x) x.click() })
await sleep(400)
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === '知道了').forEach((x) => x.click()) })
await sleep(300)
// 草原狼影 → 魔化狼
await acceptQuest('草原狼影'); await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === '休整'); if (b && !b.disabled) b.click() }); await sleep(400)
await clickBtn('村外草原'); await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(300)
await combatLoopProbe('狼')
await clickBtn('返回冒险'); await clickBtn('青石村'); await sleep(300)
await page.evaluate(() => { const col = document.querySelector('[data-testid="quest-column"]'); const x = [...col.querySelectorAll('button')].find((el) => el.textContent.includes('提交任务')); if (x) x.click() })
await sleep(400)
await page.evaluate(() => { [...document.querySelectorAll('button')].filter((x) => x.textContent.trim() === '知道了').forEach((x) => x.click()) })
await sleep(300)
// 嘟嘟兔
await clickBtn('村外草原'); await sleep(300); await clickBtn('兔王巢穴'); await sleep(300)
await clickBtn('迎战')
await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 }); await sleep(300)
const dump = async (lbl) => {
  const info = await page.evaluate(() => ({
    hp: (document.body.textContent.match(/生命\s*(\d+)\s*\/\s*(\d+)/) || [])[1],
    mp: (document.body.textContent.match(/灵力\s*(\d+)\s*\/\s*(\d+)/) || [])[1],
    feed: document.querySelector('[data-testid="combat-summary-feed"]')?.textContent?.slice(0, 300),
  }))
  console.log(lbl, JSON.stringify(info))
}
await dump('嘟嘟兔start')
await combatLoopProbe('嘟嘟兔')
const res = await page.evaluate(() => document.body.textContent)
console.log('嘟嘟兔结果:', res.includes('战斗胜利') ? 'WIN' : res.includes('战斗失败') ? 'LOSE' : '?')
await browser.close(); dev.kill(); await rm(profile, { recursive: true, force: true })
