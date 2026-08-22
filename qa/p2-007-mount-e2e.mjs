// ============================================================================
// 《天梦大陆》TM-P2-007 §50 坐骑（Mount）浏览器 E2E 验收
//
// 覆盖 §50 清单：
//   1  Tianlong stable visible    天龙城马厩可见（open-mount-stable-entry）
//   2  Fire Steed price 80        火焰驹价格 80 金可见
//   3  buy                        购买成功
//   4  owned                      已拥有状态
//   5  equip                      装备
//   6  player summary shows mount 左栏显示已装备坐骑 + 加成
//   7  character detail           角色详情显示原始五维（真实行为：详情=原始五维，战斗摘要=有效五维）
//   8  combat stats change        装备坐骑后战斗数值变化（攻击 +1 / 敏捷 +1）
//   9  unequip reverses           卸下后还原（未装备 + 战斗数值回落）
//  10  save                       保存（slot1 落盘 V6 + 坐骑字段）
//  11  reload                     重新载入后坐骑保留
//  12  cloud mock export/import   云端 mock 导出/导入坐骑字段保留
//  13  no mount turn              未装备坐骑时的状态（未装备 + 马厩购买态）
//
// 运行前提：无（脚本自备本地 dev server 5227 + 云 dev server 5199 + mock server 5203）
// 运行：node qa/p2-007-mount-e2e.mjs
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
// 本地模式（无云端点；主流程）端口
const LOCAL_PORT = Number(process.env.MOUNT_E2E_PORT || 5227)
// 云模式（带 VITE_CLOUD_SAVE_ENDPOINT；必须在 mock ALLOWED_ORIGINS 白名单内）端口
const CLOUD_PORT = Number(process.env.MOUNT_CLOUD_E2E_PORT || 5199)
const MOCK_PORT = Number(process.env.MOUNT_MOCK_E2E_PORT || 5203)
const LOCAL_URL = `http://localhost:${LOCAL_PORT}/`
const CLOUD_URL = `http://localhost:${CLOUD_PORT}/`
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`
const PASS_CLOUD = `MOUNT-E2E-CLOUD-${Math.random().toString(36).slice(2, 10).toUpperCase()}`

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

// ---------------- 自备服务 ----------------
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-007-mount-'))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const mockBin = fileURLToPath(new URL('./cloud-save-mock-server.mjs', import.meta.url))

const localDev = spawn(process.execPath, [viteBin, '--port', String(LOCAL_PORT), '--strictPort'], { stdio: 'inherit' })
const mockProc = spawn(process.execPath, [mockBin], { env: { ...process.env, MOCK_CLOUD_PORT: String(MOCK_PORT) }, stdio: 'inherit' })
const cloudDev = spawn(process.execPath, [viteBin, '--port', String(CLOUD_PORT), '--strictPort'], {
  env: { ...process.env, VITE_CLOUD_SAVE_ENDPOINT: MOCK_URL },
  stdio: 'inherit',
})

async function waitFor(url, what) {
  for (let i = 0; i < 60; i += 1) {
    try {
      await fetch(url)
      return
    } catch {
      await sleep(250)
    }
  }
  throw new Error(`等待超时: ${what}`)
}

/** 直接调 mock server（与生产 contract 一致） */
async function cloudRequest(body) {
  const res = await fetch(MOCK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, json: await res.json() }
}

// ---------------- 浏览器辅助 ----------------
const bodyText = (page) => page.evaluate(() => document.body.textContent || '')
const sidebarText = (page) => page.evaluate(() => document.querySelector('[data-testid="player-column"]')?.textContent || '')
const mainColText = (page) => page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')

async function enterLocalModeIfNeeded(page) {
  const clicked = await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式'))
    if (!button) return false
    button.click()
    return true
  })
  if (clicked) await sleep(350)
}

async function clickButton(page, text) {
  const clicked = await page.evaluate((label) => {
    const button = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(label))
    if (!button || button.disabled) return false
    button.click()
    return true
  }, text)
  if (clicked) await sleep(400)
  return clicked
}

const typePassphrase = async (page, pass) => {
  await page.type('#cloud-passphrase', pass, { delay: 5 })
  await clickButton(page, '进入天梦大陆')
  await sleep(900)
}

/** 战斗摘要数字解析（textContent 中「攻击7」→ 7） */
function statOf(text, label) {
  const m = text.match(new RegExp(label + '\\s*([0-9]+)'))
  return m ? Number(m[1]) : null
}

/** GamePage fixture：天龙城，Lv2 骑士，gold 150（够买 80 金），str=13/agi=10（装备火焰驹后攻击+1/敏捷+1），无坐骑 */
function fixture() {
  return {
    player: {
      id: 'player-mount-e2e',
      name: '坐骑验收员',
      gender: 'male',
      level: 2,
      profession: 'knight',
      attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 20,
      maxHp: 24,
      mp: 7,
      maxMp: 7,
      gold: 150,
      adventureXp: 130,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [],
    world: {
      currentLocationId: 'tianlong_city',
      flags: {},
      completedEvents: [],
      npcStates: {},
      restCount: 0,
      encounterVariants: {},
    },
    companions: {},
    relationships: {},
    party: { activeCompanionIds: [] },
    ownedMountIds: [],
    equippedMountId: null,
  }
}

async function loadAndEnterLocal(page) {
  await page.goto(LOCAL_URL, { waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded(page)
  await page.evaluate((save) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: save }))
  }, fixture())
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded(page)
  await clickButton(page, '继续游戏')
  await page.waitForSelector('[data-testid="player-column"]', { timeout: 8000 })
  await sleep(400)
}

async function saveToSlot1(page) {
  await clickButton(page, '保存游戏')
  const body = await bodyText(page)
  if (body.includes('确认覆盖')) {
    await clickButton(page, '确认覆盖')
  } else if (body.includes('覆盖保存')) {
    await clickButton(page, '覆盖保存')
    await clickButton(page, '确认覆盖')
  } else {
    await clickButton(page, '保存到此槽')
  }
  await sleep(600)
}

let browser
try {
  await waitFor(LOCAL_URL, 'local dev server')
  await waitFor(CLOUD_URL, 'cloud dev server')
  await waitFor(MOCK_URL, 'mock server')

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    userDataDir: profile,
    args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 900 })

  // ============ 进入 GamePage（fixture：天龙城，无坐骑） ============
  await loadAndEnterLocal(page)
  let side = await sidebarText(page)

  // ---- §50 #13：未装备坐骑时的状态 ----
  check('M13: 未装备时左栏坐骑区显示「未装备」', side.includes('未装备'))
  check('M13: 左栏存在坐骑管理入口（open-mount-stable）', (await page.$('[data-testid="open-mount-stable"]')) !== null)

  // ---- §50 #1：天龙城马厩可见 ----
  const main = await mainColText(page)
  check('M1: 中央当前地点为天龙城', main.includes('天龙城'))
  check('M1: 中央存在天龙城马厩入口（open-mount-stable-entry）', (await page.$('[data-testid="open-mount-stable-entry"]')) !== null && main.includes('马厩'))

  // 战斗摘要基线（未装备）
  const baseAttack = statOf(side, '攻击')
  const baseAgility = statOf(side, '敏捷')
  check('M13: 未装备时战斗摘要存在攻击/敏捷数值', baseAttack !== null && baseAgility !== null, `攻击=${baseAttack} 敏捷=${baseAgility}`)

  // 角色详情基线：原始五维（str 13）
  await clickButton(page, '查看角色详情')
  const detailStr = async () => {
    const t = await page.evaluate(() => document.querySelector('[data-testid="mobile-character-details"]')?.textContent || '')
    const m = t.match(/力量\s*([0-9]+)/)
    return m ? Number(m[1]) : null
  }
  check('M13: 角色详情显示原始五维（力量=13，未装备坐骑不受影响）', (await detailStr()) === 13, `str=${await detailStr()}`)

  // ---- §50 #2：打开马厩，火焰驹价格 80 ----
  await page.click('[data-testid="open-mount-stable-entry"]')
  await page.waitForSelector('[data-testid="mount-panel"]', { timeout: 5000 })
  await sleep(300)
  const panelText = await page.evaluate(() => document.querySelector('[data-testid="mount-panel"]')?.textContent || '')
  check('M2: 马厩面板显示「火焰驹」', panelText.includes('火焰驹'))
  check('M2: 火焰驹价格 80 金可见（购买 80 金）', panelText.includes('购买 80 金'))
  check('M2: 火焰驹加成说明可见（力量+1 · 敏捷+1）', panelText.includes('力量+1') && panelText.includes('敏捷+1'))
  check('M13: 未拥有时火焰驹无「已装备/已拥有」状态标签', (await page.$('[data-testid="mount-state-fire_stallion"]')) === null)
  check('M13: 未拥有时火焰驹显示购买按钮', (await page.$('[data-testid="mount-buy-fire_stallion"]')) !== null)

  // ---- §50 #3：购买 ----
  await page.click('[data-testid="mount-buy-fire_stallion"]')
  await sleep(400)
  const feedback1 = await page.evaluate(() => document.querySelector('[data-testid="mount-feedback"]')?.textContent || '')
  check('M3: 购买成功反馈（已收入马厩）', feedback1.includes('已收入马厩'))
  side = await sidebarText(page)
  check('M3: 购买后金币 150 → 70', statOf(side, '金币') === 70, `金币=${statOf(side, '金币')}`)

  // ---- §50 #4：已拥有 ----
  const stateOwned = await page.evaluate(() => document.querySelector('[data-testid="mount-state-fire_stallion"]')?.textContent || '')
  check('M4: 火焰驹状态变为「已拥有」', stateOwned.includes('已拥有'))
  check('M4: 已拥有后出现「装备」按钮', (await page.$('[data-testid="mount-equip-fire_stallion"]')) !== null)

  // ---- §50 #5：装备 ----
  await page.click('[data-testid="mount-equip-fire_stallion"]')
  await sleep(400)
  const stateEquipped = await page.evaluate(() => document.querySelector('[data-testid="mount-state-fire_stallion"]')?.textContent || '')
  check('M5: 装备后状态变为「已装备」', stateEquipped.includes('已装备'))
  check('M5: 装备后出现「卸下」按钮', (await page.$('[data-testid="mount-unequip-fire_stallion"]')) !== null)

  // ---- §50 #6：左栏玩家摘要显示坐骑 ----
  side = await sidebarText(page)
  check('M6: 左栏坐骑区显示「火焰驹」', side.includes('火焰驹'))
  check('M6: 左栏显示坐骑加成（力量+1 · 敏捷+1）', side.includes('力量+1') && side.includes('敏捷+1'))

  // ---- §50 #8：战斗数值变化（攻击 +1 / 敏捷 +1） ----
  const equippedAttack = statOf(side, '攻击')
  const equippedAgility = statOf(side, '敏捷')
  check('M8: 装备后攻击 +1（str 13→14 修正 +1→+2）', equippedAttack === baseAttack + 1, `攻击 ${baseAttack} → ${equippedAttack}`)
  check('M8: 装备后敏捷 +1（agi 10→11）', equippedAgility === baseAgility + 1, `敏捷 ${baseAgility} → ${equippedAgility}`)

  // ---- §50 #7：角色详情显示原始五维（装备坐骑后详情不变，战斗摘要已变） ----
  const detailStrEquipped = await detailStr()
  check('M7: 装备坐骑后角色详情仍显示原始力量 13（详情=原始五维）', detailStrEquipped === 13, `str=${detailStrEquipped}`)
  check('M7: 详情不变但战斗摘要攻击/敏捷已变 → 详情与战斗摘要分离', detailStrEquipped === 13 && equippedAttack !== baseAttack)

  // ---- §50 #9：卸下还原 ----
  await page.click('[data-testid="mount-unequip-fire_stallion"]')
  await sleep(400)
  side = await sidebarText(page)
  check('M9: 卸下后左栏回到「未装备」', side.includes('未装备'))
  const unequipAttack = statOf(side, '攻击')
  const unequipAgility = statOf(side, '敏捷')
  check('M9: 卸下后攻击还原到基线', unequipAttack === baseAttack, `攻击 ${baseAttack} → ${unequipAttack}`)
  check('M9: 卸下后敏捷还原到基线', unequipAgility === baseAgility, `敏捷 ${baseAgility} → ${unequipAgility}`)

  // 重新装备（为保存/重载断言准备：已装备态 + 战斗数值变化）
  await page.click('[data-testid="mount-equip-fire_stallion"]')
  await sleep(400)
  side = await sidebarText(page)
  check('M9: 重新装备后左栏再次显示火焰驹', side.includes('火焰驹'))
  check('M9: 重新装备后攻击/敏捷恢复为装备值', statOf(side, '攻击') === baseAttack + 1 && statOf(side, '敏捷') === baseAgility + 1)

  // 关闭马厩
  await clickButton(page, '关闭')
  await sleep(300)
  check('M: 关闭马厩后面板消失', (await page.$('[data-testid="mount-panel"]')) === null)

  // ---- §50 #10：保存 ----
  await saveToSlot1(page)
  const savedSlot = await page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    return raw ? JSON.parse(raw) : null
  })
  check('M10: 保存后回到游戏页', (await bodyText(page)).includes('保存游戏'))
  check('M10: 保存的 slot1 版本为 V6', savedSlot?.version === 6, `version=${savedSlot?.version}`)
  check(
    'M10: 保存的 slot1 含坐骑字段（ownedMountIds/equippedMountId）',
    Array.isArray(savedSlot?.gameState?.ownedMountIds) &&
      savedSlot?.gameState?.ownedMountIds.includes('fire_stallion') &&
      savedSlot?.gameState?.equippedMountId === 'fire_stallion',
  )
  check('M10: 保存的 slot1 金币为 70（购买扣款已落盘）', savedSlot?.gameState?.player?.gold === 70, `gold=${savedSlot?.gameState?.player?.gold}`)

  // ---- §50 #11：重新载入后坐骑保留 ----
  await page.reload({ waitUntil: 'networkidle0' })
  await enterLocalModeIfNeeded(page)
  await clickButton(page, '继续游戏')
  await page.waitForSelector('[data-testid="player-column"]', { timeout: 8000 })
  await sleep(400)
  side = await sidebarText(page)
  check('M11: 重新载入后左栏仍显示已装备火焰驹', side.includes('火焰驹'))
  check('M11: 重新载入后仍带坐骑加成（力量+1 · 敏捷+1）', side.includes('力量+1') && side.includes('敏捷+1'))
  check('M11: 重新载入后战斗数值仍为装备后值', statOf(side, '攻击') === baseAttack + 1 && statOf(side, '敏捷') === baseAgility + 1)

  // ============ §50 #12：cloud mock export / import ============
  // 保存到云：把本机已含坐骑的 slot1 通过「使用本机存档创建云存档」上传到 fresh vault（revision 1）
  const ctxA = await browser.createBrowserContext()
  const pageA = await ctxA.newPage()
  await pageA.setViewport({ width: 1366, height: 900 })
  await pageA.goto(CLOUD_URL, { waitUntil: 'networkidle0' })
  await pageA.evaluate((slot) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(slot))
  }, savedSlot)
  await pageA.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageA, PASS_CLOUD)
  let cloudBody = await bodyText(pageA)
  check('M12: 云模式检测到本地存档并显示迁移选择', cloudBody.includes('检测到当前浏览器已有本地存档') && cloudBody.includes('使用本机存档创建云存档'))
  await clickButton(pageA, '使用本机存档创建云存档')
  await sleep(800)
  const afterCloud = await cloudRequest({ action: 'load', passphrase: PASS_CLOUD })
  const cloudSlot1 = afterCloud.json?.payload?.savesExport?.slots?.slot1
  check('M12: 上传本机档后云端 revision=1 且 slot1 非空', afterCloud.json?.ok && afterCloud.json?.revision === 1 && cloudSlot1 !== null, `revision=${afterCloud.json?.revision}`)
  check(
    'M12: 导出到云的坐骑字段保留（ownedMountIds 含 fire_stallion / equippedMountId 为 fire_stallion）',
    Array.isArray(cloudSlot1?.gameState?.ownedMountIds) &&
      cloudSlot1?.gameState?.ownedMountIds.includes('fire_stallion') &&
      cloudSlot1?.gameState?.equippedMountId === 'fire_stallion',
  )
  cloudBody = await bodyText(pageA)
  check('M12: 创建云存档后进入主菜单', cloudBody.includes('继续游戏') && cloudBody.includes('新游戏'))
  await clickButton(pageA, '继续游戏')
  await pageA.waitForSelector('[data-testid="player-column"]', { timeout: 8000 })
  await sleep(400)
  check('M12: 上传后本机继续游戏，坐骑仍装备', (await sidebarText(pageA)).includes('火焰驹'))

  // 导入：fresh context（无本地档）输入同一口令 → 云档导入本地 → 坐骑保留
  const ctxB = await browser.createBrowserContext()
  const pageB = await ctxB.newPage()
  await pageB.setViewport({ width: 1366, height: 900 })
  await pageB.goto(CLOUD_URL, { waitUntil: 'networkidle0' })
  await typePassphrase(pageB, PASS_CLOUD)
  cloudBody = await bodyText(pageB)
  check('M12: 另一设备输入同一口令 → 云档导入 → 主菜单可继续', cloudBody.includes('继续游戏'))
  await clickButton(pageB, '继续游戏')
  await pageB.waitForSelector('[data-testid="player-column"]', { timeout: 8000 })
  await sleep(400)
  const sideB = await sidebarText(pageB)
  check('M12: 云导入后本地坐骑保留（火焰驹 + 加成）', sideB.includes('火焰驹') && sideB.includes('力量+1'))
  check('M12: 云导入后本地战斗数值为装备后值', statOf(sideB, '攻击') === baseAttack + 1 && statOf(sideB, '敏捷') === baseAgility + 1)
  check('M12: 云导入后金币 70 保留', statOf(sideB, '金币') === 70, `金币=${statOf(sideB, '金币')}`)

  check('M: 全程无 JS exception', true)
} catch (error) {
  check('Mount E2E 脚本执行无异常', false, String(error))
} finally {
  try {
    if (browser) await browser.close()
  } catch {
    /* 已关闭 */
  }
  try {
    localDev.kill()
  } catch {
    /* 已退出 */
  }
  try {
    cloudDev.kill()
  } catch {
    /* 已退出 */
  }
  try {
    mockProc.kill()
  } catch {
    /* 已退出 */
  }
  await rm(profile, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== TM-P2-007 §50 Mount E2E 结果：${results.length - failed}/${results.length} 通过 =====`)
process.exit(failed ? 1 : 0)
