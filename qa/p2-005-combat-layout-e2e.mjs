// TM-P2-005-R1：CombatPage 真实布局验收。
// 自启 Vite，经正式存档/Continue/迎战 UI 进入战斗；覆盖桌面双分辨率与无/有伙伴状态。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.PORT || 5213)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const ownsServer = !process.env.BASE_URL
const dev = ownsServer
  ? spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
  : null
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
const jsErrors = []
page.on('pageerror', (error) => jsErrors.push(String(error)))

async function ready() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(APP_URL)
      if (response.ok) return
    } catch { /* Vite 尚未就绪 */ }
    await sleep(250)
  }
  throw new Error(`应用启动超时: ${APP_URL}`)
}

function fixture({ sakura }) {
  const state = {
    player: {
      id: 'player-combat-layout', name: '战斗布局验收员', gender: 'female', level: 4, profession: 'knight',
      attributes: { str: 14, con: 12, agi: 18, mnd: 8, lck: 10 },
      hp: 20, maxHp: 26, mp: 9, maxMp: 9, gold: 100,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
    ],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [],
    world: {
      currentLocationId: sakura ? 'sakura_domain_fragment' : 'village_grassland',
      flags: sakura ? { sakura_guest: true } : {},
      completedEvents: [], npcStates: {}, restCount: 0,
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
  }
  if (sakura) {
    state.companions.sakura_yuko = {
      companionId: 'sakura_yuko', status: 'guest', level: 4, mp: 6, maxMp: 6,
      learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'], flags: {},
    }
    state.party.activeCompanionIds = ['sakura_yuko']
  }
  return state
}

async function clickButton(text) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
    if (!button) return false
    button.click()
    return true
  }, text)
  if (!clicked) throw new Error(`未找到按钮: ${text}`)
  await sleep(500)
}

async function enterCombat(sakura) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  const slot = { version: 4, savedAt: new Date().toISOString(), gameState: fixture({ sakura }) }
  await page.evaluate((save) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(save))
  }, slot)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes('仅本机模式'))
    button?.click()
  })
  await sleep(400)
  await clickButton('继续游戏')
  // 固定高敏捷玩家先手，避免先手动画短暂禁用操作按钮。
  await page.evaluate(() => { Math.random = () => 0.99 })
  await clickButton('迎战')
  await page.waitForSelector('.combat-page')
  await sleep(450)
}

async function outerLayout() {
  return page.evaluate(() => {
    const root = document.scrollingElement
    const combat = document.querySelector('.combat-page')
    const styles = combat ? getComputedStyle(combat) : null
    return {
      docWidth: root.scrollWidth,
      docHeight: root.scrollHeight,
      clientWidth: root.clientWidth,
      clientHeight: root.clientHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      combatScrollHeight: combat?.scrollHeight ?? 0,
      combatClientHeight: combat?.clientHeight ?? 0,
      combatOverflowY: styles?.overflowY ?? '',
    }
  })
}

async function accessibleButtons(labels) {
  return page.evaluate((wanted) => wanted.map((label) => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.includes(label))
    if (!button) return { label, present: false }
    button.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const rect = button.getBoundingClientRect()
    const style = getComputedStyle(button)
    return {
      label, present: true, disabled: button.disabled,
      visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0,
      inViewport: rect.top >= -1 && rect.left >= -1 && rect.bottom <= innerHeight + 1 && rect.right <= innerWidth + 1,
      focusable: button.tabIndex >= 0,
    }
  }), labels)
}

try {
  await ready()
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    for (const sakura of [false, true]) {
      const stateName = sakura ? 'Sakura active' : '普通玩家无 companion'
      await page.setViewport({ width, height })
      await enterCombat(sakura)

      if (sakura) {
        await clickButton('普通攻击')
        await page.waitForFunction(() => document.body.textContent?.includes('樱花优子的行动'))
      }

      const labels = sakura
        ? ['樱花飞斩', '樱花魔法盾', '樱花轻舞', '跳过']
        : ['普通攻击', '骑士重击', '使用治疗药水']
      const buttons = await accessibleButtons(labels)
      for (const button of buttons) {
        const ok = button.present && button.visible && button.inViewport && button.focusable && !button.disabled
        check(`${width}x${height} ${stateName}: ${button.label} 可见可访问`, ok, JSON.stringify(button))
      }

      // 截图进入内存，确保真实渲染帧可被浏览器捕获且不是空输出；不落盘，遵守仅改指定脚本。
      const screenshot = await page.screenshot({ type: 'png', captureBeyondViewport: false })
      check(`${width}x${height} ${stateName}: 战斗页真实渲染帧`, screenshot.length > 1000, `bytes=${screenshot.length}`)

      const layout = await outerLayout()
      check(`${width}x${height} ${stateName}: browser outer 无横向溢出`, layout.docWidth <= layout.clientWidth + 1, `doc=${layout.docWidth} client=${layout.clientWidth}`)
      check(`${width}x${height} ${stateName}: browser outer 无纵向溢出`, layout.docHeight <= layout.clientHeight + 1, `doc=${layout.docHeight} client=${layout.clientHeight}`)
      check(`${width}x${height} ${stateName}: 访问按钮未滚动 browser outer`, layout.scrollX === 0 && layout.scrollY === 0, `x=${layout.scrollX} y=${layout.scrollY}`)
    }
  }
  check('全程无 JS exception', jsErrors.length === 0, jsErrors.join(' | '))
} catch (error) {
  check('CombatPage 布局脚本执行无异常', false, String(error))
} finally {
  await browser.close()
  if (dev) dev.kill()
}

const failed = results.filter((result) => !result.ok).length
console.log(`===== TM-P2-005-R1 CombatPage 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
