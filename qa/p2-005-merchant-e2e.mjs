// TM-P2-005-R1 D2：商店闭环真实 UI E2E。
// 自启 Vite，使用隔离 Chrome profile；只预置合法版本化存档，不注入运行中状态。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.MERCHANT_E2E_PORT || 5215)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
// R2 任务卡独立字面量：当前 V5 的 Lv.4 必须至少拥有 450 累计冒险阅历。
// 不引用生产 progression/validator，避免测试与实现共享同一判据来源。
const V5_FIXTURE_LEVEL = 4
const V5_FIXTURE_ADVENTURE_XP = 450
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-005-merchant-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL
  ? null
  : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'inherit' })
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  userDataDir: profile,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 900 })

async function ready() {
  for (let i = 0; i < 60; i += 1) {
    try { await fetch(APP_URL); return } catch { await sleep(250) }
  }
  throw new Error('Vite 启动超时')
}

const bodyText = () => page.evaluate(() => document.body.textContent || '')

async function enterLocalModeIfNeeded() {
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式'))
    if (!button) return false
    button.click()
    return true
  })
  if (clicked) await sleep(350)
}

async function clickButton(text) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === label)
    if (!button || button.disabled) return false
    button.click()
    return true
  }, text)
  if (clicked) await sleep(350)
  return clicked
}

function legacyV4Fixture({ profession, locationId }) {
  return {
    player: {
      id: 'player-hero', name: `商店E2E-${profession}`, gender: 'male', level: V5_FIXTURE_LEVEL,
      profession, attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 26, maxHp: 26, mp: 9, maxMp: 9, gold: 100,
      learnedSkillIds: profession === 'mage' ? ['mage_arcane_bolt'] : ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'traveler_cloth_armor', quantity: 1 },
    ],
    equipment: { weapon: null, armor: 'traveler_cloth_armor', accessory: null },
    quests: [],
    world: { currentLocationId: locationId, flags: {}, completedEvents: [], npcStates: {}, restCount: 0 },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
  }
}

function v5Fixture(options) {
  const state = legacyV4Fixture(options)
  return {
    ...state,
    player: { ...state.player, adventureXp: V5_FIXTURE_ADVENTURE_XP },
  }
}

async function loadVersionedSave(version, gameState) {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate(({ slotVersion, state }) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({
      version: slotVersion,
      savedAt: '2026-08-21T00:00:00.000Z',
      gameState: state,
    }))
  }, { slotVersion: version, state: gameState })
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  if (!await clickButton('继续游戏')) throw new Error(`V${version} 存档未出现可用的继续游戏入口`)
}

async function merchantSection(title) {
  return page.evaluate((heading) => {
    const h3 = [...document.querySelectorAll('h3')].find((el) => el.textContent?.trim() === heading)
    const section = h3?.closest('section')
    if (!section) return null
    return {
      text: section.textContent || '',
      rows: [...section.querySelectorAll('button')].map((button) => ({
        disabled: button.disabled,
        rowText: button.parentElement?.parentElement?.textContent || '',
      })),
    }
  }, title)
}

async function buyFromMerchant(title, itemName) {
  const clicked = await page.evaluate(({ heading, item }) => {
    const h3 = [...document.querySelectorAll('h3')].find((el) => el.textContent?.trim() === heading)
    const section = h3?.closest('section')
    const button = section
      ? [...section.querySelectorAll('button')].find((el) => el.parentElement?.parentElement?.textContent?.includes(item))
      : null
    if (!button || button.disabled) return false
    button.click()
    return true
  }, { heading: title, item: itemName })
  if (clicked) await sleep(350)
  return clicked
}

async function readGold() {
  return page.evaluate(() => {
    const label = [...document.querySelectorAll('span')].find((el) => el.textContent?.trim() === '金币')
    const value = label?.parentElement?.querySelector('.tabular-nums')?.textContent
    return value ? Number(value.trim()) : null
  })
}

async function inventoryQuantity(itemName) {
  return page.evaluate((name) => {
    const text = [...document.querySelectorAll('p')].find((el) => el.textContent?.includes(name) && el.textContent.includes('×'))?.textContent || ''
    const match = text.match(/×(\d+)/)
    return match ? Number(match[1]) : 0
  }, itemName)
}

try {
  await ready()

  // A. V5 青石村铁匠：三件报价、职业禁用、合法购买闭环。
  await loadVersionedSave(5, v5Fixture({ profession: 'mage', locationId: 'qingshi_village' }))
  let shop = await merchantSection('铁匠的货架')
  check('V5 青石村铁匠商店通过正式 UI 可见', shop !== null)
  check('青石村铁匠出售三件商品', shop?.rows.length === 3, `实际 ${shop?.rows.length ?? 0} 件`)
  check('铁匠三件商品为旅行布衣/硬皮甲/锁子甲',
    ['旅行布衣', '硬皮甲', '锁子甲'].every((name) => shop?.text.includes(name)))
  const hardened = shop?.rows.find((row) => row.rowText.includes('硬皮甲'))
  check('法师职业不符的硬皮甲购买按钮 disabled', hardened?.disabled === true)
  const goldBeforeArmor = await readGold()
  const armorBefore = await inventoryQuantity('旅行布衣')
  check('合法防具可通过商店按钮购买', await buyFromMerchant('铁匠的货架', '旅行布衣'))
  check('购买旅行布衣扣除 12 金币', (await readGold()) === goldBeforeArmor - 12)
  check('购买旅行布衣后数量 +1', (await inventoryQuantity('旅行布衣')) === armorBefore + 1)

  // B. V5 天龙城王财：四防具 + 8 金币桂花糕，购买闭环。
  await loadVersionedSave(5, v5Fixture({ profession: 'knight', locationId: 'tianlong_city' }))
  shop = await merchantSection('王财的货摊')
  check('V5 天龙城王财商店通过正式 UI 可见', shop !== null)
  check('王财出售四件防具与天龙桂花糕（共五件）', shop?.rows.length === 5 &&
    ['旅行布衣', '硬皮甲', '锁子甲', '灵纹法袍', '天龙桂花糕'].every((name) => shop.text.includes(name)),
  `实际 ${shop?.rows.length ?? 0} 件`)
  check('王财的天龙桂花糕标价 8 金币', shop?.text.includes('天龙桂花糕') && shop.text.includes('价格：8 金币'))
  const goldBeforeCake = await readGold()
  check('通过王财货摊购买天龙桂花糕', await buyFromMerchant('王财的货摊', '天龙桂花糕'))
  check('购买桂花糕扣除 8 金币', (await readGold()) === goldBeforeCake - 8)
  check('购买桂花糕后背包数量为 1', (await inventoryQuantity('天龙桂花糕')) === 1)

  // C. V4 版本化存档：由主菜单 Continue 走正式迁移/读取入口，不改运行中状态。
  await loadVersionedSave(4, legacyV4Fixture({ profession: 'knight', locationId: 'tianlong_city' }))
  shop = await merchantSection('王财的货摊')
  check('旧 V4 存档经正式 Continue 迁移后进入王财商店', shop !== null && (await bodyText()).includes('天龙城'))
  const v4GoldBefore = await readGold()
  check('旧 V4 存档迁移后可购买防具', await buyFromMerchant('王财的货摊', '硬皮甲'))
  check('旧 V4 存档购买硬皮甲扣 30 金币且数量为 1',
    (await readGold()) === v4GoldBefore - 30 && (await inventoryQuantity('硬皮甲')) === 1)
} catch (error) {
  check('商店 E2E 脚本执行无异常', false, String(error))
} finally {
  await browser.close()
  if (dev) dev.kill()
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((result) => !result.ok).length
console.log(`===== TM-P2-005 merchant E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
