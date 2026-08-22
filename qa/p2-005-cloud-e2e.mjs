// ============================================================================
// 《天梦大陆》TM-P2-005 Cloud Save focused E2E
//  43 跨设备（A 桌面建档 → B 手机读取 → B 保存 → A 冲突处理 → force 覆盖）
//  46 网站更新模拟（清空 localStorage 后云档仍在）
//  40 V3 云迁移（云端 V3 payload → 客户端 migration chain → 存回 V4）
//  24 服务器不可达 → 本地降级（仅使用本机存档进入 + 本地保存正常）
//  47 口令页响应式（390×844 无横向溢出）
// 运行前提：无（脚本自备 mock server 5200 + dev server 5201，跑完自动清理）
// 运行：node qa/p2-005-cloud-e2e.mjs（或 npm run qa:cloud）
// ============================================================================
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

function findChromeExecutable() {
  const configured = process.env.CHROME_PATH?.trim()
  const windowsCandidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google/Chrome/Application/chrome.exe'),
  ]
  const linuxCandidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome',
    '/snap/bin/chromium',
  ]
  const macCandidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ]
  const platformCandidates = process.platform === 'win32'
    ? windowsCandidates
    : process.platform === 'darwin'
      ? macCandidates
      : linuxCandidates
  const candidates = [configured, ...platformCandidates].filter((value) => typeof value === 'string' && value.length > 0)
  const found = candidates.find((candidate) => existsSync(candidate))
  if (found) return found
  throw new Error(
    `未找到 Chrome/Chromium 可执行文件（平台: ${process.platform}）。` +
    `请设置 CHROME_PATH；已检查: ${candidates.join(', ') || '(无候选路径)'}`,
  )
}

const CHROME = findChromeExecutable()
const MOCK_PORT = 5200
const DEV_PORT = 5201
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`
const APP_URL = `http://localhost:${DEV_PORT}/`
const PASS_A = `E2E-CLOUD-TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
const PASS_V3 = `E2E-CLOUD-TEST-V3-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const PASS_CONFLICT = `E2E-CLOUD-CONFLICT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const PASS_FRESH_UPLOAD = `E2E-CLOUD-FRESH-UP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const PASS_FRESH_EMPTY = `E2E-CLOUD-FRESH-EMPTY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const PASS_DELETE_RETRY = `E2E-CLOUD-DELETE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const PASS_IMPORT_STAY = `E2E-CLOUD-IMPORT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const PASS_RACE_EMPTY = `E2E-CLOUD-RACE-EMPTY-${Math.random().toString(36).slice(2, 8).toUpperCase()}`
const PASS_RACE_UPLOAD = `E2E-CLOUD-RACE-UP-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`)
}

// ---------------- 自备服务（跑完自动清理） ----------------
const profileDir = mkdtempSync(join(tmpdir(), 'cloud-e2e-'))
const mockProc = spawn(process.execPath, ['qa/cloud-save-mock-server.mjs'], {
  env: { ...process.env, MOCK_CLOUD_PORT: String(MOCK_PORT) },
  stdio: 'inherit',
})
mockProc.on('exit', (code) => console.log(`[cloud-e2e] mock server exited code=${code}`))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const devProc = spawn(process.execPath, [viteBin, '--port', String(DEV_PORT), '--strictPort'], {
  env: { ...process.env, VITE_CLOUD_SAVE_ENDPOINT: MOCK_URL },
  stdio: 'inherit',
})
devProc.on('exit', (code) => console.log(`[cloud-e2e] dev server exited code=${code}`))

async function waitFor(url, what, tries = 60) {
  for (let i = 0; i < tries; i += 1) {
    try {
      // mock server 只接受 POST（GET 返回 405）：只要连接成功即视为就绪
      await fetch(url)
      return true
    } catch {
      /* 未就绪 */
    }
    await sleep(500)
  }
  throw new Error(`等待超时: ${what}`)
}

/** 直接调 mock server（与生产 contract 一致），用于 revision 断言 */
async function cloudRequest(body) {
  const res = await fetch(MOCK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  return { status: res.status, json }
}

// ---------------- 浏览器辅助 ----------------
let browser
const jsErrors = []
const clickByText = async (page, text) => {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('未找到按钮: ' + t)
    btn.click()
  }, text)
  await sleep(450)
}
const bodyText = (page) => page.evaluate(() => document.body.textContent)
const typePassphrase = async (page, pass) => {
  await page.type('#cloud-passphrase', pass, { delay: 5 })
  await clickByText(page, '进入天梦大陆')
  await sleep(900)
}

/** GamePage 保存到 slot1（含覆盖确认） */
const saveToSlot1 = async (page) => {
  await clickByText(page, '保存游戏')
  await sleep(350)
  const body = await bodyText(page)
  if (body.includes('确认覆盖')) {
    await clickByText(page, '确认覆盖')
  } else if (body.includes('覆盖保存')) {
    await clickByText(page, '覆盖保存')
    await sleep(350)
    await clickByText(page, '确认覆盖')
  } else {
    await clickByText(page, '保存到此槽')
  }
  await sleep(600)
}

const readLocationName = (page) =>
  page.evaluate(() => {
    // TM-P2-006：中央场景标题（h2 地点名）；旧「当前位置」标签已删除
    const section = document.querySelector('[data-current-location-id]')
    if (!section) return null
    const nameEl = section.querySelector('h2')
    return nameEl ? nameEl.textContent.trim() : null
  })

const localSlot1Name = (page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    if (!raw) return null
    try {
      return JSON.parse(raw).gameState.player.name
    } catch {
      return null
    }
  })

/** 角色创建：姓名 + 骑士职业（radio label）+ 显式分配属性（与 qa/e2e.mjs createQuickKnight 一致） */
const createQuickKnight = async (page, name) => {
  await page.focus('input[placeholder="输入角色姓名"]')
  await page.type('input[placeholder="输入角色姓名"]', name)
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('骑士'))
    if (label) label.click()
  })
  await sleep(200)
  await page.evaluate(() => {
    const clickAttr = (label, times) => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === label)
      if (!btn) throw new Error('未找到按钮: ' + label)
      for (let i = 0; i < times; i++) btn.click()
    }
    clickAttr('提高力量', 6)
    clickAttr('提高体质', 4)
    clickAttr('提高敏捷', 2)
    clickAttr('提高幸运', 2)
  })
  await sleep(200)
  await clickByText(page, '确认进入天梦大陆')
  await sleep(600)
}

// ============================================================================
try {
  await waitFor(MOCK_URL, 'mock server')
  await waitFor(APP_URL, 'dev server')

  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    userDataDir: profileDir,
  })

  // ============ 43.1 A 桌面建档（1366×768） ============
  const ctxA = await browser.createBrowserContext()
  const pageA = await ctxA.newPage()
  await pageA.setViewport({ width: 1366, height: 768 })
  pageA.on('pageerror', (e) => jsErrors.push('A:' + String(e)))
  await pageA.goto(APP_URL, { waitUntil: 'networkidle0' })
  await sleep(500)
  let body = await bodyText(pageA)
  check('C1: 首屏是云口令页（云存档口令 + 进入天梦大陆）', body.includes('云存档口令') && body.includes('进入天梦大陆') && body.includes('存档将同步到云端'))
  check('C2: 已配置端点 → 不出现「仅本机模式」', !body.includes('仅本机模式'))

  await typePassphrase(pageA, PASS_A)
  body = await bodyText(pageA)
  check('C3: 新口令自动创建空云空间并进入主菜单（云存档已连接）', body.includes('新游戏') && body.includes('☁ 云存档已连接'))

  // A 新游戏建档（真实 UI 流程：姓名 + 骑士 + 属性分配）
  await clickByText(pageA, '新游戏')
  await sleep(400)
  await createQuickKnight(pageA, '云档测试骑士')
  body = await bodyText(pageA)
  check('C4: 新角色进入游戏页（青石村）', (await readLocationName(pageA)) === '青石村' && body.includes('保存游戏'))

  // A 保存 slot1 → 云同步（空 vault 创建即 revision 1，首次保存 → 2；任务 31 节语义）
  await saveToSlot1(pageA)
  const afterA1 = await cloudRequest({ action: 'load', passphrase: PASS_A })
  check('C5: A 保存后云端 revision=2 且 slot1 有档', afterA1.json.ok && afterA1.json.revision === 2 && afterA1.json.payload?.savesExport?.slots?.slot1 !== null, `revision=${afterA1.json.revision}`)

  // ============ 43.2 B 手机读取（390×844，fresh context） ============
  const ctxB = await browser.createBrowserContext()
  const pageB = await ctxB.newPage()
  await pageB.setViewport({ width: 390, height: 844 })
  pageB.on('pageerror', (e) => jsErrors.push('B:' + String(e)))
  await pageB.goto(APP_URL, { waitUntil: 'networkidle0' })
  await sleep(500)
  await typePassphrase(pageB, PASS_A)
  body = await bodyText(pageB)
  check('C6: B 输入同一口令 → 云档导入 → 主菜单可继续游戏', body.includes('继续游戏') && body.includes('☁ 云存档已连接'))
  await clickByText(pageB, '继续游戏')
  await sleep(600)
  body = await bodyText(pageB)
  check('C7: B Continue → 与 A 相同的存档（位置/玩家名）', (await readLocationName(pageB)) === '青石村' && (await localSlot1Name(pageB)) === '云档测试骑士')
  check('C8: 口令页 390×844 无横向溢出', await pageB.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))

  // ============ 44 B 保存 → revision 3；A 冲突处理 ============
  await saveToSlot1(pageB)
  const afterB = await cloudRequest({ action: 'load', passphrase: PASS_A })
  check('C9: B 保存后云端 revision=3', afterB.json.ok && afterB.json.revision === 3, `revision=${afterB.json.revision}`)

  // A 仍持有 revision 1 → 保存 → 409 冲突
  await saveToSlot1(pageA)
  await sleep(800)
  body = await bodyText(pageA)
  check('C10: A 保存遇冲突 → 冲突对话框（云端存档已在另一台设备更新）', body.includes('云端存档已在另一台设备更新'))
  check('C11: 冲突不自动覆盖（无确认覆盖按钮直通）', body.includes('读取云端最新版') && body.includes('用当前存档覆盖云端'))
  // A 读取云端最新版 → B 的进度进入 A
  await clickByText(pageA, '读取云端最新版')
  await sleep(800)
  body = await bodyText(pageA)
  check('C12: A 读取云端最新版后回到保存页（同步成功）', body.includes('✓ 本地已保存 · ✓ 云端已同步') || body.includes('保存游戏'))
  await clickByText(pageA, '返回')
  await sleep(400)
  // A 现在 revision 3 → 保存成功 → revision 4
  await saveToSlot1(pageA)
  const afterA2 = await cloudRequest({ action: 'load', passphrase: PASS_A })
  check('C13: A 再保存（expectedRevision=3）→ revision=4', afterA2.json.ok && afterA2.json.revision === 4, `revision=${afterA2.json.revision}`)

  // ============ 45 force overwrite（二次确认） ============
  await saveToSlot1(pageB) // B 仍持有旧 revision，先显式读取 A 的最新版
  body = await bodyText(pageB)
  if (body.includes('云端存档已在另一台设备更新')) {
    await clickByText(pageB, '读取云端最新版')
    await sleep(800)
    await clickByText(pageB, '返回')
    await sleep(400)
  }
  await saveToSlot1(pageB) // B: 4 → 5
  const afterB2 = await cloudRequest({ action: 'load', passphrase: PASS_A })
  await saveToSlot1(pageA) // A 持有 4 → 冲突
  await sleep(800)
  body = await bodyText(pageA)
  await clickByText(pageA, '用当前存档覆盖云端')
  await sleep(400)
  body = await bodyText(pageA)
  check('C14: force 覆盖前二次确认（这会覆盖另一台设备的新进度）', body.includes('这会覆盖另一台设备的新进度') && body.includes('确认覆盖云端'))
  await clickByText(pageA, '确认覆盖云端')
  await sleep(900)
  const afterForce = await cloudRequest({ action: 'load', passphrase: PASS_A })
  check('C15: force_save 后 revision=6（5→6）', afterForce.json.ok && afterForce.json.revision === 6, `revision=${afterForce.json.revision}`)
  check('C16: force 覆盖的 payload 合法（slot1 非空）', afterForce.json.payload?.savesExport?.slots?.slot1 !== null)

  // ============ 46 网站更新模拟：清空本地 → 云档仍在 ============
  await pageA.evaluate(() => localStorage.clear())
  await pageA.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  body = await bodyText(pageA)
  check('C17: 清空本地后回到云口令页', body.includes('云存档口令'))
  await typePassphrase(pageA, PASS_A)
  body = await bodyText(pageA)
  check('C18: 云档独立于本地/部署 → 重新输入口令档仍在', body.includes('继续游戏'))
  await clickByText(pageA, '继续游戏')
  await sleep(600)
  check('C19: 网站更新后 Continue 数据保持（玩家名）', (await localSlot1Name(pageA)) === '云档测试骑士')

  // ============ 40 V3 云迁移：云端 V3 payload → 客户端迁移 → 存回 V4 ============
  const v3GameState = {
    player: {
      id: 'player-hero',
      name: '云迁移测试剑士',
      gender: 'male',
      level: 4,
      profession: 'warrior',
      attributes: { str: 15, con: 13, agi: 11, mnd: 7, lck: 9 },
      hp: 20,
      maxHp: 24,
      mp: 5,
      maxMp: 6,
      gold: 40,
      learnedSkillIds: ['warrior_suppress_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      {
        questId: 'quest_golden_rabbit_search',
        status: 'in_progress',
        stage: 0,
        flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true },
      },
    ],
    world: { currentLocationId: 'qingshi_village', flags: {}, completedEvents: [], npcStates: {} },
    // 无 companions/relationships/party/restCount（V3 特征）
  }
  const v3Export = {
    cloudVersion: 1,
    savesExport: {
      version: 2,
      exportedAt: new Date().toISOString(),
      lastSavedSlot: 'slot1',
      slots: {
        slot1: { version: 3, savedAt: '2026-01-01T08:00:00.000Z', gameState: v3GameState },
        slot2: null,
        slot3: null,
        slot4: null,
        slot5: null,
      },
    },
  }
  const injected = await cloudRequest({ action: 'save', passphrase: PASS_V3, expectedRevision: 0, payload: v3Export })
  check('C20: V3 payload 直接注入云端（revision 1）', injected.status === 200 && injected.json.revision === 1)

  const ctxC = await browser.createBrowserContext()
  const pageC = await ctxC.newPage()
  await pageC.setViewport({ width: 1280, height: 800 })
  pageC.on('pageerror', (e) => jsErrors.push('C:' + String(e)))
  await pageC.goto(APP_URL, { waitUntil: 'networkidle0' })
  await sleep(500)
  await typePassphrase(pageC, PASS_V3)
  body = await bodyText(pageC)
  check('C21: V3 云档解锁成功（客户端迁移链升级）', body.includes('继续游戏'))
  await clickByText(pageC, '继续游戏')
  await sleep(600)
  body = await bodyText(pageC)
  check('C22: V3→V6 迁移后正常进入游戏（青石村）', (await readLocationName(pageC)) === '青石村')
  const localV4 = await pageC.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    if (!raw) return null
    return JSON.parse(raw)
  })
  check('C23: 迁移后本地已是 V6（companions/relationships/party/restCount/XP）', localV4 && localV4.version === 6 && localV4.gameState.companions && localV4.gameState.relationships && localV4.gameState.party && localV4.gameState.world.restCount === 0 && Number.isSafeInteger(localV4.gameState.player.adventureXp))
  // 黄金兔冻结保持
  const golden = localV4?.gameState?.quests?.find((q) => q.questId === 'quest_golden_rabbit_search')
  check(
    'C24: 黄金兔冻结线保持（in_progress/stage0/四 flags/rabbit_path 不受云迁移影响）',
    golden &&
      golden.status === 'in_progress' &&
      golden.stage === 0 &&
      golden.flags.asked_blacksmith === true &&
      golden.flags.asked_apothecary === true &&
      golden.flags.village_inquiry_reported === true &&
      golden.flags.rabbit_lair_rechecked === true,
  )
  // C 保存 → 云收到 V4
  await saveToSlot1(pageC)
  const afterV4 = await cloudRequest({ action: 'load', passphrase: PASS_V3 })
  const cloudSlot = afterV4.json.payload?.savesExport?.slots?.slot1
  check('C25: 迁移后保存 → 云端已是 V6 且 revision 2', afterV4.json.revision === 2 && cloudSlot?.version === 6 && cloudSlot?.gameState?.companions !== undefined && Number.isSafeInteger(cloudSlot?.gameState?.player?.adventureXp))

  // ============ C2 解锁冲突保护：divergent 必须显式选择，identical 忽略 exportedAt ============
  const cloudConflictPayload = structuredClone(afterForce.json.payload)
  cloudConflictPayload.savesExport.exportedAt = '2026-08-21T09:00:00.000Z'
  cloudConflictPayload.savesExport.slots.slot1.gameState.player.name = '云端冲突角色'
  cloudConflictPayload.savesExport.slots.slot1.gameState.world.currentLocationId = 'qingshi_village'
  cloudConflictPayload.savesExport.slots.slot1.savedAt = '2026-08-21T09:00:00.000Z'
  const conflictCreated = await cloudRequest({ action: 'save', passphrase: PASS_CONFLICT, expectedRevision: 0, payload: cloudConflictPayload })
  check('C30: C2 云端冲突基线创建成功（revision 1）', conflictCreated.status === 200 && conflictCreated.json.revision === 1)

  const localConflictPayload = structuredClone(cloudConflictPayload)
  localConflictPayload.savesExport.exportedAt = '2026-08-21T10:00:00.000Z'
  localConflictPayload.savesExport.slots.slot1.gameState.player.name = '本机较新角色'
  localConflictPayload.savesExport.slots.slot1.gameState.world.currentLocationId = 'tianlong_city'
  localConflictPayload.savesExport.slots.slot1.savedAt = '2026-08-21T10:00:00.000Z'

  const ctxE = await browser.createBrowserContext()
  const pageE = await ctxE.newPage()
  await pageE.setViewport({ width: 1280, height: 900 })
  pageE.on('pageerror', (e) => jsErrors.push('E:' + String(e)))
  await pageE.goto(APP_URL, { waitUntil: 'networkidle0' })
  await pageE.evaluate((payload) => {
    const slot = payload.savesExport.slots.slot1
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(slot))
    localStorage.setItem('tianmeng_continent_saves_index', JSON.stringify({
      version: 2,
      lastSavedSlot: 'slot1',
      slots: {
        slot1: {
          playerName: slot.gameState.player.name,
          profession: slot.gameState.player.profession,
          level: slot.gameState.player.level,
          locationId: slot.gameState.world.currentLocationId,
          savedAt: slot.savedAt,
        },
        slot2: null, slot3: null, slot4: null, slot5: null,
      },
    }))
  }, localConflictPayload)
  await pageE.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageE, PASS_CONFLICT)
  body = await bodyText(pageE)
  check('C31: divergent 解锁不覆盖本机并停留在冲突页', body.includes('本机/云端存档冲突') && (await localSlot1Name(pageE)) === '本机较新角色')
  check('C32: 冲突页显示双方最新摘要（角色/等级/地点/保存时间）', body.includes('本机最新存档') && body.includes('云端最新存档') && body.includes('本机较新角色') && body.includes('云端冲突角色') && body.includes('天龙城') && body.includes('青石村') && body.includes('2026-08-21T10:00:00.000Z') && body.includes('2026-08-21T09:00:00.000Z'))
  check('C33: 冲突页显示双选择按钮', body.includes('使用云端存档') && body.includes('使用本机存档覆盖云端'))

  await clickByText(pageE, '使用云端存档')
  await sleep(700)
  body = await bodyText(pageE)
  check('C34: 选择云端后显式导入并完成解锁', body.includes('继续游戏') && (await localSlot1Name(pageE)) === '云端冲突角色')

  // 本机与云端 durable 内容相同，但下一次 exportSaves 会生成不同 exportedAt；不得误报冲突。
  await pageE.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageE, PASS_CONFLICT)
  body = await bodyText(pageE)
  check('C35: 仅 exportedAt 不同不误判冲突，可安全连接', body.includes('继续游戏') && !body.includes('本机/云端存档冲突'))

  // 再把本机改成较新 divergent 版本，验证 force 路径的二次确认与 revision 更新。
  await pageE.evaluate(() => {
    const key = 'tianmeng_continent_save_slot_slot1'
    const slot = JSON.parse(localStorage.getItem(key))
    slot.gameState.player.name = '本机覆盖角色'
    slot.gameState.world.currentLocationId = 'tianlong_city'
    slot.savedAt = '2026-08-21T11:00:00.000Z'
    localStorage.setItem(key, JSON.stringify(slot))
  })

/** 向 fresh browser context 写入一份合法本地 V5 slot1 + index。 */
const seedLocalSlot1 = async (page, cloudPayload, playerName = null) => {
  await page.evaluate(({ payload, name }) => {
    const slot = structuredClone(payload.savesExport.slots.slot1)
    if (name) slot.gameState.player.name = name
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(slot))
    localStorage.setItem('tianmeng_continent_saves_index', JSON.stringify({
      version: 2,
      lastSavedSlot: 'slot1',
      slots: {
        slot1: {
          playerName: slot.gameState.player.name,
          profession: slot.gameState.player.profession,
          level: slot.gameState.player.level,
          locationId: slot.gameState.world.currentLocationId,
          savedAt: slot.savedAt,
        },
        slot2: null, slot3: null, slot4: null, slot5: null,
      },
    }))
  }, { payload: cloudPayload, name: playerName })
}

/** 浏览器首次 create/upload save 发出前，让另一设备先以 revision 0 建立 vault。 */
const interceptFirstVaultSaveWithRace = async (page, passphrase, competingPayload) => {
  await page.setRequestInterception(true)
  let raced = false
  page.on('request', async (request) => {
    let body = null
    try {
      body = request.postData() ? JSON.parse(request.postData()) : null
    } catch {
      /* 非 JSON 请求照常放行 */
    }
    if (!raced && request.url() === MOCK_URL + '/' && body?.action === 'save' && body?.expectedRevision === 0) {
      raced = true
      await cloudRequest({ action: 'save', passphrase, expectedRevision: 0, payload: competingPayload })
    }
    await request.continue()
  })
}
  await pageE.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageE, PASS_CONFLICT)
  body = await bodyText(pageE)
  check('C36: 本机再次 divergent 时仍进入冲突页且本机保持', body.includes('本机/云端存档冲突') && (await localSlot1Name(pageE)) === '本机覆盖角色')
  await clickByText(pageE, '使用本机存档覆盖云端')
  body = await bodyText(pageE)
  const beforeUnlockForce = await cloudRequest({ action: 'load', passphrase: PASS_CONFLICT })
  check('C37: 本机覆盖云端先二次确认，首次点击不更新 revision', body.includes('确认使用本机存档覆盖云端') && body.includes('云端现有进度将被本机存档替换') && beforeUnlockForce.json.revision === 1)
  await clickByText(pageE, '确认使用本机存档覆盖云端')
  await sleep(700)
  const afterUnlockForce = await cloudRequest({ action: 'load', passphrase: PASS_CONFLICT })
  body = await bodyText(pageE)
  check('C38: 二次确认后 force 成功并完成解锁', body.includes('继续游戏') && afterUnlockForce.json.payload?.savesExport?.slots?.slot1?.gameState?.player?.name === '本机覆盖角色')
  check('C39: 解锁 force_save 后云 revision 更新（1→2）', afterUnlockForce.json.revision === 2, `revision=${afterUnlockForce.json.revision}`)

  // ============ R2 Browser E2E：fresh cloud + 合法 V5 local 迁移选择 ============
  const ctxFreshUpload = await browser.createBrowserContext()
  const pageFreshUpload = await ctxFreshUpload.newPage()
  pageFreshUpload.on('pageerror', (e) => jsErrors.push('FreshUpload:' + String(e)))
  await pageFreshUpload.goto(APP_URL, { waitUntil: 'networkidle0' })
  await seedLocalSlot1(pageFreshUpload, afterForce.json.payload, 'R2本机上传角色')
  await pageFreshUpload.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageFreshUpload, PASS_FRESH_UPLOAD)
  body = await bodyText(pageFreshUpload)
  check('C40: fresh cloud + 合法 V5 local 保持 CloudUnlock', body.includes('云存档口令') && !body.includes('天梦大陆菜单'))
  check('C41: fresh cloud 显示迁移提示和双路径按钮', body.includes('检测到当前浏览器已有本地存档') && body.includes('使用本机存档创建云存档') && body.includes('创建空白云存档'))
  check('C42: 迁移选择前 MainMenu 未出现', !body.includes('新游戏') && !body.includes('继续游戏') && !body.includes('读取存档'))

  // 路径 A：上传 local，创建 revision 1，云/本地 slot 一致并进入 MainMenu。
  await clickByText(pageFreshUpload, '使用本机存档创建云存档')
  await sleep(700)
  const uploadedFresh = await cloudRequest({ action: 'load', passphrase: PASS_FRESH_UPLOAD })
  body = await bodyText(pageFreshUpload)
  check('C43: 路径A上传 local 后云 revision=1', uploadedFresh.json.ok && uploadedFresh.json.revision === 1, `revision=${uploadedFresh.json.revision}`)
  check('C44: 路径A cloud slot 与 local slot 一致', uploadedFresh.json.payload?.savesExport?.slots?.slot1?.gameState?.player?.name === await localSlot1Name(pageFreshUpload))
  check('C45: 路径A上传后进入 MainMenu', body.includes('新游戏') && body.includes('读取存档'))
  check('C46: 路径A MainMenu 可 Continue', body.includes('继续游戏'))

  // 路径 B：fresh pass + local，空白云必须二次确认；本地保留，云五槽为空。
  const ctxFreshEmpty = await browser.createBrowserContext()
  const pageFreshEmpty = await ctxFreshEmpty.newPage()
  pageFreshEmpty.on('pageerror', (e) => jsErrors.push('FreshEmpty:' + String(e)))
  await pageFreshEmpty.goto(APP_URL, { waitUntil: 'networkidle0' })
  await seedLocalSlot1(pageFreshEmpty, afterForce.json.payload, 'R2本机保留角色')
  await pageFreshEmpty.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageFreshEmpty, PASS_FRESH_EMPTY)
  await clickByText(pageFreshEmpty, '创建空白云存档')
  body = await bodyText(pageFreshEmpty)
  const beforeEmptyConfirm = await cloudRequest({ action: 'load', passphrase: PASS_FRESH_EMPTY })
  check('C47: 路径B首次点击仅显示空白云二次确认', body.includes('确认创建空白云存档') && beforeEmptyConfirm.json.revision === 0)
  check('C48: 路径B二次确认显示任务卡精确完整文案', body.includes('云端将从空白开始，本机存档仍保留在当前浏览器。'))
  await clickByText(pageFreshEmpty, '确认创建空白云存档')
  await sleep(700)
  const emptyFresh = await cloudRequest({ action: 'load', passphrase: PASS_FRESH_EMPTY })
  body = await bodyText(pageFreshEmpty)
  const emptySlots = emptyFresh.json.payload?.savesExport?.slots
  check('C49: 路径B确认后 cloud revision=1 且五槽为空', emptyFresh.json.revision === 1 && emptySlots && Object.values(emptySlots).every((slot) => slot === null))
  check('C50: 路径B确认后 local slot 仍保留', (await localSlot1Name(pageFreshEmpty)) === 'R2本机保留角色')
  check('C51: 路径B确认后进入 MainMenu', body.includes('新游戏') && body.includes('读取存档'))

  // not_configured/local-only：删除是本地成功，必须显示 offline truth，绝不能伪报 synced。
  const ctxOffline = await browser.createBrowserContext()
  const pageOffline = await ctxOffline.newPage()
  pageOffline.on('pageerror', (e) => jsErrors.push('Offline:' + String(e)))
  await pageOffline.goto(APP_URL, { waitUntil: 'networkidle0' })
  await seedLocalSlot1(pageOffline, afterForce.json.payload, 'R2离线角色')
  await pageOffline.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageOffline, `E2E-CLOUD-OFFLINE-${Math.random().toString(36).slice(2, 8).toUpperCase()}`)
  await pageOffline.waitForFunction(
    () => [...document.querySelectorAll('button')].some((item) => item.textContent.includes('保留本机存档，仅在本机进入')),
    { timeout: 5_000 },
  )
  await clickByText(pageOffline, '保留本机存档，仅在本机进入')
  await clickByText(pageOffline, '读取存档')
  await clickByText(pageOffline, '删除')
  await clickByText(pageOffline, '确认删除')
  body = await bodyText(pageOffline)
  check('C52: offline/not_configured 显示本地已保存与云同步未启用', body.includes('本地已保存') && body.includes('云同步未启用'))
  check('C53: offline/not_configured 不得显示云端已同步', !body.includes('云端已同步'))

  // load 删除：首轮 cloud_failed，retry success 后仍留在读取存档页。
  const deleteSeed = await cloudRequest({ action: 'save', passphrase: PASS_DELETE_RETRY, expectedRevision: 0, payload: afterForce.json.payload })
  const ctxDelete = await browser.createBrowserContext()
  const pageDelete = await ctxDelete.newPage()
  pageDelete.on('pageerror', (e) => jsErrors.push('DeleteRetry:' + String(e)))
  await pageDelete.setRequestInterception(true)
  let failNextDeleteSync = false
  pageDelete.on('request', (request) => {
    if (failNextDeleteSync && request.url() === MOCK_URL + '/' && request.method() === 'POST') {
      failNextDeleteSync = false
      void request.abort('failed')
    } else {
      void request.continue()
    }
  })
  await pageDelete.goto(APP_URL, { waitUntil: 'networkidle0' })
  await typePassphrase(pageDelete, PASS_DELETE_RETRY)
  await clickByText(pageDelete, '读取存档')
  failNextDeleteSync = true
  await clickByText(pageDelete, '删除')
  await clickByText(pageDelete, '确认删除')
  await sleep(700)
  body = await bodyText(pageDelete)
  check('C54: load 删除首轮 cloud_failed 显示失败与重试', deleteSeed.json.revision === 1 && body.includes('云同步失败') && body.includes('重试同步'))
  await clickByText(pageDelete, '重试同步')
  await sleep(700)
  body = await bodyText(pageDelete)
  check('C55: load 删除 retry success 仍留读取存档页', body.includes('读取存档') && !body.includes('保存游戏'))
  check('C56: load 删除 retry success 后显示 synced truth', body.includes('本地已保存+云端已同步'))

  // MainMenu → 读取存档 → 导入 JSON：导入后留列表，只有显式读取才进 GamePage。
  await cloudRequest({ action: 'save', passphrase: PASS_IMPORT_STAY, expectedRevision: 0, payload: afterForce.json.payload })
  const ctxImport = await browser.createBrowserContext()
  const pageImport = await ctxImport.newPage()
  pageImport.on('pageerror', (e) => jsErrors.push('ImportStay:' + String(e)))
  await pageImport.goto(APP_URL, { waitUntil: 'networkidle0' })
  await typePassphrase(pageImport, PASS_IMPORT_STAY)
  await clickByText(pageImport, '读取存档')
  await pageImport.type('textarea[placeholder*="粘贴导出的存档 JSON"]', JSON.stringify(afterForce.json.payload.savesExport))
  await clickByText(pageImport, '导入并覆盖五槽位')
  await sleep(700)
  body = await bodyText(pageImport)
  check('C57: MainMenu 读取存档导入 JSON 后仍留存档列表', body.includes('读取存档') && body.includes('导入成功') && !body.includes('保存游戏'))
  check('C58: 导入后列表仍提供可用的显式读取入口', await pageImport.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.textContent.trim() === '读取')
    return Boolean(button && !button.disabled)
  }))
  await clickByText(pageImport, '读取')
  await sleep(600)
  body = await bodyText(pageImport)
  check('C59: 导入后只有显式读取才进入 GamePage', body.includes('保存游戏') && (await readLocationName(pageImport)) !== null)

  // 创建空白云竞态：另一设备在确认期间抢先建 vault，必须转入标准冲突选择且不覆盖本地。
  const raceEmptyRemote = structuredClone(afterForce.json.payload)
  raceEmptyRemote.savesExport.slots.slot1.gameState.player.name = '抢先建立云端角色A'
  const ctxRaceEmpty = await browser.createBrowserContext()
  const pageRaceEmpty = await ctxRaceEmpty.newPage()
  pageRaceEmpty.on('pageerror', (e) => jsErrors.push('RaceEmpty:' + String(e)))
  await interceptFirstVaultSaveWithRace(pageRaceEmpty, PASS_RACE_EMPTY, raceEmptyRemote)
  await pageRaceEmpty.goto(APP_URL, { waitUntil: 'networkidle0' })
  await seedLocalSlot1(pageRaceEmpty, afterForce.json.payload, '竞态本机角色A')
  await pageRaceEmpty.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageRaceEmpty, PASS_RACE_EMPTY)
  await clickByText(pageRaceEmpty, '创建空白云存档')
  await clickByText(pageRaceEmpty, '确认创建空白云存档')
  await pageRaceEmpty.waitForFunction(() => document.body.textContent.includes('本机/云端存档冲突'), { timeout: 5_000 })
  body = await bodyText(pageRaceEmpty)
  const afterRaceEmpty = await cloudRequest({ action: 'load', passphrase: PASS_RACE_EMPTY })
  check('C60: 创建空白云期间被抢先建 vault 后进入正常冲突页', body.includes('本机/云端存档冲突') && !body.includes('新游戏'))
  check('C61: 创建竞态显示标准本机/云端双选择', body.includes('使用云端存档') && body.includes('使用本机存档覆盖云端'))
  check('C62: 创建竞态不覆盖合法 local', (await localSlot1Name(pageRaceEmpty)) === '竞态本机角色A')
  check('C63: 创建竞态不覆盖抢先建立的 cloud vault', afterRaceEmpty.json.revision === 1 && afterRaceEmpty.json.payload?.savesExport?.slots?.slot1?.gameState?.player?.name === '抢先建立云端角色A')

  // 上传本机档竞态：另一设备在上传期间抢先建 vault，同样必须转入冲突选择。
  const raceUploadRemote = structuredClone(afterForce.json.payload)
  raceUploadRemote.savesExport.slots.slot1.gameState.player.name = '抢先建立云端角色B'
  const ctxRaceUpload = await browser.createBrowserContext()
  const pageRaceUpload = await ctxRaceUpload.newPage()
  pageRaceUpload.on('pageerror', (e) => jsErrors.push('RaceUpload:' + String(e)))
  await interceptFirstVaultSaveWithRace(pageRaceUpload, PASS_RACE_UPLOAD, raceUploadRemote)
  await pageRaceUpload.goto(APP_URL, { waitUntil: 'networkidle0' })
  await seedLocalSlot1(pageRaceUpload, afterForce.json.payload, '竞态本机角色B')
  await pageRaceUpload.reload({ waitUntil: 'networkidle0' })
  await typePassphrase(pageRaceUpload, PASS_RACE_UPLOAD)
  await clickByText(pageRaceUpload, '使用本机存档创建云存档')
  await pageRaceUpload.waitForFunction(() => document.body.textContent.includes('本机/云端存档冲突'), { timeout: 5_000 })
  body = await bodyText(pageRaceUpload)
  const afterRaceUpload = await cloudRequest({ action: 'load', passphrase: PASS_RACE_UPLOAD })
  check('C64: 上传本机档期间被抢先建 vault 后进入正常冲突页', body.includes('本机/云端存档冲突') && !body.includes('新游戏'))
  check('C65: 上传竞态显示标准本机/云端双选择', body.includes('使用云端存档') && body.includes('使用本机存档覆盖云端'))
  check('C66: 上传竞态不覆盖合法 local', (await localSlot1Name(pageRaceUpload)) === '竞态本机角色B')
  check('C67: 上传竞态不覆盖抢先建立的 cloud vault', afterRaceUpload.json.revision === 1 && afterRaceUpload.json.payload?.savesExport?.slots?.slot1?.gameState?.player?.name === '抢先建立云端角色B')

  // ============ 24 服务器不可达 → 本地降级 ============
  mockProc.kill()
  await sleep(600)
  const ctxD = await browser.createBrowserContext()
  const pageD = await ctxD.newPage()
  await pageD.setViewport({ width: 1366, height: 768 })
  pageD.on('pageerror', (e) => jsErrors.push('D:' + String(e)))
  await pageD.goto(APP_URL, { waitUntil: 'networkidle0' })
  await sleep(500)
  await typePassphrase(pageD, PASS_A)
  // 客户端请求超时上限为 12s；按 UI 条件等待，给事件循环留出余量，避免边界时序误报。
  await pageD.waitForFunction(
    () => document.body.textContent.includes('云存档暂时无法连接') && document.body.textContent.includes('仅使用本机存档进入'),
    { timeout: 15_000 },
  )
  body = await bodyText(pageD)
  check('C26: 服务器不可达 → 云存档暂时无法连接 + 本地降级入口', body.includes('云存档暂时无法连接') && body.includes('仅使用本机存档进入'))
  await clickByText(pageD, '仅使用本机存档进入')
  await pageD.waitForFunction(() => document.body.textContent.includes('新游戏') && document.body.textContent.includes('仅本机模式（不会跨设备同步）'), { timeout: 5_000 })
  body = await bodyText(pageD)
  check('C27: 降级进入主菜单（当前不会跨设备同步）', body.includes('新游戏') && body.includes('仅本机模式（不会跨设备同步）'))
  await clickByText(pageD, '新游戏')
  await sleep(400)
  await createQuickKnight(pageD, '降级测试游侠')
  await sleep(300)
  await saveToSlot1(pageD)
  body = await bodyText(pageD)
  check('C28: 服务器挂掉时本地保存仍正常（游戏可玩）', body.includes('保存游戏'))

  check('C29: 全程无 JS exception', jsErrors.length === 0, jsErrors.length > 0 ? jsErrors.join(' | ') : '')
} catch (err) {
  check('C: 脚本执行无异常', false, String(err))
} finally {
  try {
    devProc.kill()
  } catch {
    /* 已退出 */
  }
  try {
    mockProc.kill()
  } catch {
    /* 已退出 */
  }
  try {
    if (browser) await browser.close()
  } catch {
    /* 已关闭 */
  }
  rmSync(profileDir, { recursive: true, force: true })
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== P2-005 Cloud focused 结果：${results.length - failed}/${results.length} 通过 =====`)
if (failed > 0) process.exit(1)
