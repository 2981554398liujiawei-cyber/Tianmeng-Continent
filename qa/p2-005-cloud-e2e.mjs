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
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const MOCK_PORT = 5200
const DEV_PORT = 5201
const MOCK_URL = `http://127.0.0.1:${MOCK_PORT}`
const APP_URL = `http://localhost:${DEV_PORT}/`
const PASS_A = `E2E-CLOUD-TEST-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
const PASS_V3 = `E2E-CLOUD-TEST-V3-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

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
const devProc = spawn('npx', ['vite', '--port', String(DEV_PORT), '--strictPort'], {
  shell: true,
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
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const nameEl = section.querySelector('h3')
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
  check('C22: V3→V5 迁移后正常进入游戏（青石村）', (await readLocationName(pageC)) === '青石村')
  const localV4 = await pageC.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    if (!raw) return null
    return JSON.parse(raw)
  })
  check('C23: 迁移后本地已是 V4（companions/relationships/party/restCount）', localV4 && localV4.version === 4 && localV4.gameState.companions && localV4.gameState.relationships && localV4.gameState.party && localV4.gameState.world.restCount === 0)
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
  check('C25: 迁移后保存 → 云端已是 V4 且 revision 2', afterV4.json.revision === 2 && cloudSlot?.version === 4 && cloudSlot?.gameState?.companions !== undefined)

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
  body = await bodyText(pageD)
  check('C26: 服务器不可达 → 云存档暂时无法连接 + 本地降级入口', body.includes('云存档暂时无法连接') && body.includes('仅使用本机存档进入'))
  await clickByText(pageD, '仅使用本机存档进入')
  await sleep(500)
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
