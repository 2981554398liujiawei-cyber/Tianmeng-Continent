// ============================================================================
// TM-P2-009-R1 §19 Screenshots A-O (final candidate @ 521503c)
// Capture: combat action tray / friend tray / enemy cards / Action+Bonus+
// End Turn / XP bar / Golden Rabbit sidebar / encounter roster
// No assertions — only visual evidence from final green code.
// ============================================================================
import puppeteer from 'puppeteer-core'
import fs from 'fs'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.BASE_URL || 'http://localhost:5199/'
const OUT = 'qa/screenshots/p2-009-r1/'
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu'] })
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768 })
await page.goto(URL, { waitUntil: 'networkidle0' })
await new Promise(r => setTimeout(r, 500))

const shot = async (name) => {
  const path = OUT + name + '.png'
  await page.screenshot({ path, fullPage: false })
  console.log('CAPTURE | ' + name + ' -> ' + path)
}

// A: 主菜单 / 继续（基线）
await shot('A-menu')

// B: 进入战斗页（普通玩家无 companion）— action tray
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('迎战'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 600))
await shot('B-combat-empty-tray')

// C: 技能 tray 展开
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('技能') && !b.textContent.includes('樱花'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 400))
await shot('C-skill-tray-open')

// D: Sakura active — 伙伴 skill tray + friend panel
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('迎战'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 600))
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent === '技能' || b.textContent?.includes('技能 ▾'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 400))
await shot('D-sakura-friend-tray')

// E: 行动栏（普通攻击 / 技能 ▾ / 背包 ▾ / 逃跑）
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('技能 ▾'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 300))
await shot('E-action-bar')

// F: 敌人卡片（残灾之影）+ target picker
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('普通攻击'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 400))
await shot('F-enemy-card-target')

// G: End Turn 按钮可见
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('结束回合') || b.textContent?.includes('End Turn'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 400))
await shot('G-end-turn-btn')

// H: Bonus Action / 伙伴技能已用后状态
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('跳过'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 300))
await shot('H-skip-state')

// I: 侧边栏 Golden Rabbit 待续
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button'), ...document.querySelectorAll('a')].find(b => b.textContent?.includes('任务') || b.textContent?.includes('冒险') || b.textContent?.includes('侧边栏'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 400))
await shot('I-sidebar-golden-rabbit')

// J: XP 条 / Lv.3 55.6%
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button'), ...document.querySelectorAll('a')].find(b => b.textContent?.includes('状态'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 300))
await shot('J-xp-bar')

// K: 遇敌列表（encounter roster preview）— 固定 + 加权
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button'), ...document.querySelectorAll('a')].find(b => b.textContent?.includes('冒险') || b.textContent?.includes('进入') || b.textContent?.includes('休息'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 500))
await shot('K-encounter-roster')

// L: 战斗胜利面板
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('返回冒险'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 300))
await shot('L-victory-panel')

// M: 红颜录 / 关系阶段
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button'), ...document.querySelectorAll('a')].find(b => b.textContent?.includes('红颜录') || b.textContent?.includes('伙伴'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 300))
await shot('M-relationship-panel')

// N: 物品 tray + 药水数量
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent?.includes('背包 ▾'))
  if (btn) btn.click()
})
await new Promise(r => setTimeout(r, 300))
await shot('N-item-tray')

// O: 完整 CombatPage 布局（桌面 1366x768）
await page.setViewport({ width: 1366, height: 768 })
await page.evaluate(() => window.scrollTo(0, 0))
await new Promise(r => setTimeout(r, 200))
await shot('O-full-combat-layout')

await browser.close()
console.log('===== §19 Screenshots A-O 完成 =====')
console.log('路径清单:')
for (let i = 0; i < 15; i++) {
  const label = String.fromCharCode(65 + i) // A-O
  console.log('  ' + label + ' -> qa/screenshots/p2-009-r1/' + label.toLowerCase() + '-*.png (实际文件名见目录)')
}
