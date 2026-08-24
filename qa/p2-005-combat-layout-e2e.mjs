// TM-P2-005-R1 / TM-P2-006 CombatPage V4 适配：CombatPage 真实布局验收。
// 自启 Vite，经正式存档/Continue/迎战 UI 进入战斗；覆盖桌面双分辨率与无/有伙伴状态。
// V4：技能/物品收进底部固定行动栏 tray（combat-skill-tray / combat-item-tray），Sakura 阶段按钮仍平铺直接可见。
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

/** V4：点击行动栏一级按钮（技能/物品文本随展开在「技能 ▾/▴」间切换，按前缀匹配，避免误中 tray 内技能名） */
async function clickBarButton(prefix) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim().startsWith(label))
    if (!button) return false
    button.click()
    return true
  }, prefix)
  if (!clicked) throw new Error(`未找到行动栏按钮: ${prefix}`)
  await sleep(350)
}

async function waitForTray(testid) {
  await page.waitForSelector(`[data-testid="${testid}"]`, { visible: true })
}

async function waitForTrayGone(testid) {
  await page.waitForFunction((id) => !document.querySelector(`[data-testid="${id}"]`), { timeout: 5000 }, testid)
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

/** scopeSelector 非空时只在指定容器（如 tray）内查找按钮 */
async function accessibleButtons(labels, scopeSelector = null) {
  return page.evaluate(([wanted, scope]) => wanted.map((label) => {
    const root = scope ? document.querySelector(scope) : document
    const buttons = root ? [...root.querySelectorAll('button')] : [...document.querySelectorAll('button')]
    const button = buttons.find((item) => item.textContent?.includes(label))
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
  }), [labels, scopeSelector])
}

try {
  await ready()
  for (const [width, height] of [[1366, 768], [1920, 1080]]) {
    for (const sakura of [false, true]) {
      const stateName = sakura ? 'Sakura active' : '普通玩家无 companion'
      await page.setViewport({ width, height })
      await enterCombat(sakura)

      if (sakura) {
        // 玩家先手（fixture 固定高敏捷）打一轮 → TM-P2-009-R1 §6/§8 行动不自动流转，
        // 显式结束回合推进（initiative 序：玩家 → Sakura）→ 等 Sakura 回合做伙伴侧布局断言。
        // 注意不能由 Sakura 普攻打这轮：rng=0.99 必暴击会直接秒杀残灾进入 victory。
        await clickButton('普通攻击')
        await clickButton('残灾之影') // P2-007 普攻进 target selector 选敌
        await clickButton('结束回合')
        await page.waitForFunction(() => document.body.textContent?.includes('樱花优子的回合'))
      }

      if (!sakura) {
        // V4：底部固定行动栏一级按钮直接可见可访问
        const primary = await accessibleButtons(['普通攻击', '技能 ▾', '背包 ▾', '逃跑'])
        for (const button of primary) {
          const ok = button.present && button.visible && button.inViewport && button.focusable && !button.disabled
          check(`${width}x${height} ${stateName}: 行动栏 ${button.label} 可见可访问`, ok, JSON.stringify(button))
        }

        // V4：技能 tray 展开 → tray 内技能按钮可见可访问 → 收起 → tray 消失
        await clickBarButton('技能')
        await waitForTray('combat-skill-tray')
        const skillButtons = await accessibleButtons(['骑士重击（2 灵力）'], '[data-testid="combat-skill-tray"]')
        for (const button of skillButtons) {
          const ok = button.present && button.visible && button.inViewport && button.focusable && !button.disabled
          check(`${width}x${height} ${stateName}: 技能 tray 内 骑士重击（2 灵力）可见可访问`, ok, JSON.stringify(button))
        }
        await clickBarButton('技能')
        await waitForTrayGone('combat-skill-tray')
        check(`${width}x${height} ${stateName}: 技能 tray 收起后消失`, true)

        // V4：物品 tray 展开 → tray 内药水按钮可见可访问 + 剩余数量文案 → 收起 → tray 消失
        await clickBarButton('背包')
        await waitForTray('combat-item-tray')
        const itemButtons = await accessibleButtons(['使用治疗药水（+8 生命）'], '[data-testid="combat-item-tray"]')
        for (const button of itemButtons) {
          const ok = button.present && button.visible && button.inViewport && button.focusable && !button.disabled
          check(`${width}x${height} ${stateName}: 物品 tray 内 使用治疗药水 可见可访问`, ok, JSON.stringify(button))
        }
        const itemTrayText = await page.evaluate(() => document.querySelector('[data-testid="combat-item-tray"]')?.textContent ?? '')
        check(`${width}x${height} ${stateName}: 物品 tray 显示剩余药水数量`, itemTrayText.includes('剩余：2'), `trayText=${itemTrayText}`)
        await clickBarButton('背包')
        await waitForTrayGone('combat-item-tray')
        check(`${width}x${height} ${stateName}: 物品 tray 收起后消失`, true)
      } else {
        // P2-007：伙伴技能收敛进「技能」tray（带灵力后缀）；「跳过」仍在行动栏平铺
        await clickBarButton('技能')
        await waitForTray('combat-skill-tray')
        const skillButtons = await accessibleButtons(['樱花飞斩（1 灵力）', '樱花魔法盾（2 灵力）', '樱花轻舞（2 灵力）'], '[data-testid="combat-skill-tray"]')
        for (const button of skillButtons) {
          const ok = button.present && button.visible && button.inViewport && button.focusable && !button.disabled
          check(`${width}x${height} ${stateName}: ${button.label} 可见可访问`, ok, JSON.stringify(button))
        }
        await clickBarButton('技能')
        await waitForTrayGone('combat-skill-tray')
        check(`${width}x${height} ${stateName}: 技能 tray 收起后消失`, true)
        const skipButtons = await accessibleButtons(['跳过'])
        for (const button of skipButtons) {
          const ok = button.present && button.visible && button.inViewport && button.focusable && !button.disabled
          check(`${width}x${height} ${stateName}: ${button.label} 可见可访问`, ok, JSON.stringify(button))
        }
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
console.log(`===== TM-P2-005-R1 / TM-P2-006 CombatPage V4 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
