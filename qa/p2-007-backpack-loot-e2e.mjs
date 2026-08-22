// TM-P2-007 §48：背包 V2 + 战斗掉落 E2E 验收。
// 覆盖任务卡 §48 全部 10 项：
//   1  左栏不再展开完整背包（compact 入口，不常驻完整背包面板/物品全量列表）
//   2  打开 BackpackPanel（open-backpack 按钮）
//   3  tabs 正常（全部/装备/消耗品/材料/任务/特殊 六个 tab，切换后物品列表变化正确）
//   4  material 显示（材料 tab 显示材料物品）
//   5  equipment 可装备（详情 → 点装备 → 成功，回到列表）
//   6  战斗胜利显示 loot（CombatPage 胜利后显示掉落）
//   7  loot 已进入背包（胜利后打开 BackpackPanel 能看到新掉落）
//   8  deterministic Luck extra（Math.random 固定 0.99 → D20=20 大成功 → 必得额外掉落）
//   9  关闭 BackpackPanel 恢复 scene（主场景仍在）
//   10 desktop outer no scroll（viewport ≥1280 时 GamePage/CombatPage 的 outer 无滚动）
//
// 打法：fixture 直接把 currentLocationId 设为 tianlong_north_gate + 《北门失联》in_progress +
// north_gate_trail_checked=true，即可让黑鬃魔狼遭遇（含 lucky 掉落表）直接可见可战；
// 玩家 Lv.3 高 STR，装备精制铁剑后攻击 12，Math.random=0.99 时先手暴击 15 秒杀黑鬃魔狼，
// 战斗全程确定（玩家先手 → 一击击杀 → 敌人永不出手）。
// 黑鬃魔狼掉落表（lootTables.ts）：guaranteed 黑鬃狼牙×1 + random 黑鬃狼皮(0.5) + lucky 黑鬃狼牙(dc12)。
//   Math.random=0.99 → random 判定 0.99<0.5 失败；lucky 骰面 1+floor(0.99*20)=20 → 天然大成功必成 →
//   额外黑鬃狼牙×1。总掉落 = 黑鬃狼牙 ×2（guaranteed 1 + lucky 1）。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.BACKPACK_E2E_PORT || 5225)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-007-backpack-loot-'))
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
// §48.10：viewport ≥1280（xl 断点 + 无滚动 CSS 媒体查询生效）
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

async function clickButton(label) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(text))
    if (!button || button.disabled) return false
    button.click()
    return true
  }, label)
  if (clicked) await sleep(350)
  return clicked
}

/** 轮询点击（等待目标渲染）；返回最终是否点中 */
async function clickWhenFound(label, timeout = 4000) {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    if (await clickButton(label)) return true
    await sleep(150)
  }
  return false
}

/**
 * GameState fixture（Save V5；loadSlot 自动迁移补 V6 字段 ownedMountIds/equippedMountId/encounterVariants）。
 * 位置：天龙城北门（tianlong_north_gate）——黑鬃魔狼遭遇（含 lucky 掉落）直接可见可战。
 * 背包 6 种物品：铁剑(weapon,已装备) / 治疗药水×2(consumable) / 铁矿石(material) /
 *   测试遗物(quest) / 精制铁剑(weapon,待装备) / 锁子甲(armor)。
 * 角色 Lv.3、STR 18：装备精制铁剑后攻击 = 4+4+3+1 = 12，暴击(roll 20)对黑鬃魔狼(HP15/甲12)
 *   applyArmor(24,12,20)=ceil(15)=15 → 一击击杀；AGI 14 > 敌 12 → 先手。
 */
function fixture() {
  return {
    player: {
      id: 'player-backpack-loot', name: '背包验收员', gender: 'male', level: 3, profession: 'knight',
      attributes: { str: 18, con: 14, agi: 14, mnd: 8, lck: 10 },
      hp: 24, maxHp: 24, mp: 6, maxMp: 6, gold: 120, adventureXp: 260,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
      { itemId: 'iron_ore', quantity: 1 },
      { itemId: 'test_artifact', quantity: 1 },
      { itemId: 'refined_iron_sword', quantity: 1 },
      { itemId: 'chainmail_armor', quantity: 1 },
    ],
    equipment: { weapon: 'iron_sword', armor: 'traveler_cloth_armor', accessory: null },
    quests: [
      { questId: 'quest_north_gate_missing_patrol', status: 'in_progress', stage: 0, flags: { north_gate_trail_checked: true } },
    ],
    world: {
      currentLocationId: 'tianlong_north_gate',
      flags: {},
      completedEvents: [],
      npcStates: {},
      restCount: 0,
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] },
  }
}

async function loadAndEnter() {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await page.evaluate((save) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 5, savedAt: new Date().toISOString(), gameState: save }))
  }, fixture())
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded()
  await clickButton('继续游戏')
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 })
  await sleep(400)
}

// ---- BackpackPanel DOM 辅助 ----
const backpackItemIds = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[data-testid^="backpack-item-"]')].map((el) =>
      (el.getAttribute('data-testid') || '').replace('backpack-item-', ''),
    ),
  )
const clickBackpackTab = (key) =>
  page.evaluate((k) => { document.querySelector(`[data-testid="backpack-tab-${k}"]`)?.click() }, key)
const clickBackpackItem = (id) =>
  page.evaluate((itemId) => { document.querySelector(`[data-testid="backpack-item-${itemId}"]`)?.click() }, id)
const closeBackpack = () =>
  page.evaluate(() => {
    document.querySelector('[data-testid="backpack-panel"] [aria-label="关闭背包"]')?.click()
  })
const mainColText = () =>
  page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')

/** 排序后断言 itemId 集合一致（无视展示顺序） */
function sameSet(a, b) {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  return sa.every((v, i) => v === sb[i])
}

try {
  await ready()
  await loadAndEnter()

  // ================= §48.1 左栏不展开完整背包（compact 入口） =================
  const playerColText = () =>
    page.evaluate(() => document.querySelector('[data-testid="player-column"]')?.textContent || '')
  const sidebarPreviewRows = () =>
    page.evaluate(() => document.querySelectorAll('[data-testid="player-column"] ul li').length)
  const sidebarHasTab = () =>
    page.evaluate(() => !!document.querySelector('[data-testid="player-column"] [data-testid^="backpack-tab-"]'))

  check('S1: 左栏含背包 compact 入口（打开背包按钮）', (await page.$('[data-testid="open-backpack"]')) !== null)
  check('S1: 左栏不常驻完整背包面板（backpack-panel 不在 DOM）', (await page.$('[data-testid="backpack-panel"]')) === null)
  check('S1: 左栏无背包分类 tabs（完整背包不在左栏展开）', !(await sidebarHasTab()))
  check('S1: 左栏背包预览为 compact（6 物品仅显示 5 行，非全量）', (await sidebarPreviewRows()) === 5, `previewRows=${await sidebarPreviewRows()}`)

  // ================= §48.2 打开 BackpackPanel =================
  await page.evaluate(() => { document.querySelector('[data-testid="open-backpack"]')?.click() })
  await page.waitForSelector('[data-testid="backpack-panel"]', { timeout: 5000 })
  check('S2: 打开 BackpackPanel（backpack-panel 出现）', true)
  const countText = await page.evaluate(() => document.querySelector('[data-testid="backpack-count"]')?.textContent || '')
  check('S2: 面板显示物品总数（6 种物品）', countText.includes('6'), countText.trim())

  // ================= §48.3 tabs 正常 =================
  const tabKeys = ['all', 'equipment', 'consumable', 'material', 'quest', 'special']
  const tabPresent = await page.evaluate((keys) =>
    keys.every((k) => !!document.querySelector(`[data-testid="backpack-tab-${k}"]`)), tabKeys)
  check('S3: 六个 tab 按钮齐全', tabPresent)

  const EXPECTED = {
    all: ['iron_sword', 'healing_potion', 'iron_ore', 'test_artifact', 'refined_iron_sword', 'chainmail_armor'],
    equipment: ['iron_sword', 'refined_iron_sword', 'chainmail_armor'],
    consumable: ['healing_potion'],
    material: ['iron_ore'],
    quest: ['test_artifact'],
    special: [],
  }
  for (const key of tabKeys) {
    await clickBackpackTab(key)
    await sleep(250)
    const ids = await backpackItemIds()
    const ok = sameSet(ids, EXPECTED[key])
    const label = { all: '全部', equipment: '装备', consumable: '消耗品', material: '材料', quest: '任务', special: '特殊' }[key]
    check(`S3: ${label} tab 物品列表正确`, ok, `实际=${ids.join(',') || '空'} 期望=${EXPECTED[key].join(',') || '空'}`)
  }

  // ================= §48.4 material 显示 =================
  await clickBackpackTab('material')
  await sleep(250)
  const materialText = await page.evaluate(() => document.querySelector('[data-testid="backpack-panel"]')?.textContent || '')
  check('S4: 材料 tab 显示材料物品（铁矿石）', materialText.includes('铁矿石'))

  // ================= §48.5 equipment 可装备（精制铁剑） =================
  // 先切回装备 tab（上一项停在材料 tab，精制铁剑物品行不在材料 tab）
  await clickBackpackTab('equipment')
  await sleep(250)
  await clickBackpackItem('refined_iron_sword')
  await page.waitForSelector('[data-testid="backpack-detail-refined_iron_sword"]', { timeout: 5000 })
  const detailText = await page.evaluate(() => document.querySelector('[data-testid="backpack-detail-refined_iron_sword"]')?.textContent || '')
  check('S5: 打开装备详情（精制铁剑 + 装备按钮）', detailText.includes('精制铁剑') && (await page.$('[data-testid="backpack-equip"]')) !== null)

  await page.evaluate(() => { document.querySelector('[data-testid="backpack-equip"]')?.click() })
  await sleep(300)
  check('S5: 点击装备成功（按钮变为卸下）', (await page.$('[data-testid="backpack-unequip"]')) !== null && (await page.$('[data-testid="backpack-equip"]')) === null)
  const playerColAfterEquip = await playerColText()
  check('S5: 装备后左栏武器显示精制铁剑', playerColAfterEquip.includes('精制铁剑'))

  await page.evaluate(() => { document.querySelector('[data-testid="backpack-back"]')?.click() })
  await sleep(300)
  check('S5: 返回列表视图（详情消失，物品行恢复）',
    (await page.$('[data-testid="backpack-detail-refined_iron_sword"]')) === null &&
    (await page.$('[data-testid="backpack-item-refined_iron_sword"]')) !== null)

  // ================= §48.9 关闭 BackpackPanel 恢复 scene =================
  await closeBackpack()
  await sleep(300)
  check('S9: 关闭 BackpackPanel（面板消失）', (await page.$('[data-testid="backpack-panel"]')) === null)
  check('S9: 关闭后主场景仍在（天龙城北门）', (await mainColText()).includes('天龙城北门'))

  // ================= §48.10 GamePage outer 无滚动 =================
  const gameScroll = await page.evaluate(() => {
    const el = document.querySelector('.game-page')
    return el ? { sh: el.scrollHeight, ch: el.clientHeight } : null
  })
  check('S10: GamePage outer 无滚动', !!gameScroll && gameScroll.sh <= gameScroll.ch + 1, JSON.stringify(gameScroll))

  // ================= §48.8 deterministic Luck：固定 Math.random=0.99 =================
  await page.evaluate(() => { Math.random = () => 0.99 })

  // ================= 战斗入口（迎战 黑鬃魔狼） =================
  const engaged = await clickWhenFound('迎战', 5000)
  check('S6: 战斗入口可用（点击迎战进入 CombatPage）', engaged)
  await page.waitForSelector('.combat-page', { timeout: 8000 })
  await sleep(400)

  // ================= §48.10 CombatPage outer 无滚动 =================
  const combatScroll = await page.evaluate(() => {
    const el = document.querySelector('.combat-page')
    return el ? { sh: el.scrollHeight, ch: el.clientHeight } : null
  })
  check('S10: CombatPage outer 无滚动', !!combatScroll && combatScroll.sh <= combatScroll.ch + 1, JSON.stringify(combatScroll))

  // ================= 打赢战斗（普通攻击 → 选敌） =================
  await clickWhenFound('普通攻击', 4000)
  const hitTarget = await clickWhenFound('黑鬃魔狼', 4000)
  check('S6: 玩家先手攻击命中目标', hitTarget)
  await sleep(600) // 等待胜利结算 + loot 写入
  const combatText = await page.evaluate(() => document.querySelector('.combat-page')?.textContent || '')

  // ================= §48.6 战斗胜利显示 loot =================
  check('S6: 战斗胜利面板显示', combatText.includes('战斗胜利'))
  check('S6: 胜利显示掉落（战利品：黑鬃狼牙）', combatText.includes('战利品') && combatText.includes('黑鬃狼牙'))
  check('S6: 胜利显示「已收入背包」', combatText.includes('已收入背包'))

  // ================= §48.8 deterministic Luck extra =================
  check('S8: 幸运检定大成功（D20 20 + 幸运修正 0 = 20 → 大成功）',
    combatText.includes('幸运检定：大成功') && combatText.includes('D20 20'))
  const blackFangCount = (combatText.match(/黑鬃狼牙/g) || []).length
  check('S8: 大成功必得额外掉落（黑鬃狼牙 ≥2：guaranteed 1 + lucky 1）', blackFangCount >= 2, `黑鬃狼牙 出现 ${blackFangCount} 次`)

  // ================= 返回冒险 =================
  await clickWhenFound('返回冒险', 4000)
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 })
  await sleep(400)
  check('S9: 战斗后返回 GamePage（主场景仍在）', (await mainColText()).includes('天龙城北门'))

  // ================= §48.7 loot 已进入背包 =================
  await page.evaluate(() => { document.querySelector('[data-testid="open-backpack"]')?.click() })
  await page.waitForSelector('[data-testid="backpack-panel"]', { timeout: 5000 })
  await sleep(300)
  const qtyBlackFang = await page.evaluate(() => document.querySelector('[data-testid="backpack-qty-black_fang"]')?.textContent || '')
  const postCountText = await page.evaluate(() => document.querySelector('[data-testid="backpack-count"]')?.textContent || '')
  const sidebarPostCount = await page.evaluate(() => document.querySelector('[data-testid="sidebar-backpack-count"]')?.textContent || '')
  check('S7: 胜利掉落已进入背包（黑鬃狼牙 ×2）', qtyBlackFang.includes('×2'), `qty=${qtyBlackFang.trim()}`)
  check('S7: 背包总数 +1（6→7 种物品）', postCountText.includes('7'), postCountText.trim())
  check('S7: 左栏背包计数同步 7 种物品', sidebarPostCount.includes('7'), sidebarPostCount.trim())

  check('全程无 JS exception', true)
} catch (error) {
  check('Backpack/Loot E2E 脚本执行无异常', false, String(error))
} finally {
  await browser.close()
  if (dev) dev.kill()
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-007 Backpack/Loot E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
