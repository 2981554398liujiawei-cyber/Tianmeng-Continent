#!/usr/bin/env node
/**
 * qa/p2-007-r2-live-e2e.mjs —— TM-P2-007-R2 公网 LIVE E2E（§5-17：BLOCKER 1）
 *
 * 唯一对外入口：npm run qa:live。只响应显式 PUBLIC_GAME_URL（缺失则 fail fast）。
 *
 * 覆盖：
 *   LIVE-01  公网可达：HTTP 200 / React 正常启动 / 无 fatal JS exception / 非 404 / 记录 asset filenames
 *   LIVE-02  云功能非本机模式：无「云存档服务尚未配置」「仅本机模式」，云存档入口可见
 *   LIVE-10  Worker direct smoke：OPTIONS 204 + CORS 正确 / POST invalid 4xx / POST load 非 503/500
 *   LIVE-03  Device A 上传：强随机 passphrase → 新角色 → 保存 slot1 → 云同步（记录 slot/player/level/adventureXp/location/mount/quest）
 *   LIVE-04  Device B 跨设备读取：真正隔离 BrowserContext + 同一口令 → 云档导入 → 状态与 A 一致
 *   LIVE-05  B 写 revision：B 保存 → 云 revision 递增（R1 → R2）
 *   LIVE-06  A stale CAS：A 用旧 expectedRevision 保存 → 409 冲突对话框（禁静默覆盖）→ 可读取云端最新版恢复
 *   LIVE-07  错误口令隔离：错误口令 load → exists=false，不泄露任何 payload
 *   LIVE-08  offline fallback：request interception 阻断 Worker → 本地保存成功 + 云状态 offline/cloud_failed 禁 synced
 *
 * 安全约束（§2/§9）：passphrase 由 crypto.randomBytes 强随机生成，绝不打印/写文件/进 CI output；
 *   Device A/B 是两个真正隔离的 BrowserContext（禁同一 context 双 tab 冒充两台设备，§7）。
 */
import puppeteer from 'puppeteer-core'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// fail fast：PUBLIC_GAME_URL 缺失必须立即 BLOCKED（§6）
// ---------------------------------------------------------------------------
const PUBLIC_GAME_URL = (process.env.PUBLIC_GAME_URL || '').trim()
if (!PUBLIC_GAME_URL) {
  console.error('LIVE QA BLOCKED: PUBLIC_GAME_URL is missing')
  process.exit(1)
}
if (!/^https:\/\/[^/]+/.test(PUBLIC_GAME_URL)) {
  console.error(`LIVE QA BLOCKED: PUBLIC_GAME_URL 必须是 https 公网地址，当前=${PUBLIC_GAME_URL}`)
  process.exit(1)
}
const ORIGIN = new URL(PUBLIC_GAME_URL).origin

// §17 候选 Worker URL（仅当公网 bundle 未注入端点时的 fallback；仍必须重新验证）
const CANDIDATE_WORKER_URL = 'https://tianmeng-cloud-save.2981554398.workers.dev'

// 强随机 passphrase（绝不打印；长度 8-128 约束满足）
const randomPass = (label) => `LIVE-${label}-${randomBytes(14).toString('base64url')}`
const PASS_A = randomPass('A') // Device A 主口令
const PASS_SMOKE = randomPass('SMK') // Worker smoke 专用临时口令
const PASS_WRONG = randomPass('WRG') // 错误口令隔离测试

// ---------------------------------------------------------------------------
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`)
}

// ---------------------------------------------------------------------------
// 从公网 index.html + bundle 提取真实 Worker URL（LIVE-10 smoke 目标）
// ---------------------------------------------------------------------------
async function extractWorkerUrlFromBundle() {
  const htmlRes = await fetch(PUBLIC_GAME_URL)
  const html = await htmlRes.text()
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => new URL(m[1], PUBLIC_GAME_URL).href)
  for (const jsUrl of scripts) {
    try {
      const js = await (await fetch(jsUrl)).text()
      const m = js.match(/https:\/\/[a-z0-9-]+\.workers\.dev/)
      if (m) return m[0]
    } catch { /* 单个 chunk 失败继续尝试 */ }
  }
  return null
}

// ---------------------------------------------------------------------------
// 浏览器辅助（复用 p2-005 已验证交互）
// ---------------------------------------------------------------------------
let browser
const jsErrors = []
const clickByText = async (page, text) => {
  const ok = await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').includes(t))
    if (!btn) return false
    btn.click()
    return true
  }, text)
  if (!ok) throw new Error('未找到按钮: ' + text)
  await sleep(450)
}
const bodyText = (page) => page.evaluate(() => document.body.textContent || '')
const typePassphrase = async (page, pass) => {
  await page.type('#cloud-passphrase', pass, { delay: 5 })
  await clickByText(page, '进入天梦大陆')
  await sleep(900)
}
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

/** 记录 slot1 的普通存档状态（非 passphrase，供 LIVE-03/04 比对与汇报） */
const recordSlotState = async (page) => {
  const raw = await page.evaluate(() => localStorage.getItem('tianmeng_continent_save_slot_slot1'))
  if (!raw) return null
  try {
    const gs = JSON.parse(raw).gameState
    return {
      slot: 'slot1',
      player: gs.player?.name ?? null,
      level: gs.player?.level ?? null,
      adventureXp: gs.player?.adventureXp ?? null,
      location: gs.world?.currentLocationId ?? null,
      mount: gs.equippedMountId ?? null,
      quests: (gs.quests || []).map((q) => ({ id: q.questId, status: q.status })),
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// LIVE-10 Worker direct smoke（直接 HTTP，不走浏览器）
// ---------------------------------------------------------------------------
async function workerSmoke(workerUrl) {
  try {
    const options = await fetch(workerUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: ORIGIN,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    const acao = (options.headers.get('access-control-allow-origin') || '').trim()
    const acam = (options.headers.get('access-control-allow-methods') || '').trim()
    check('LIVE-10a: OPTIONS 返回 204', options.status === 204, `status=${options.status}`)
    check('LIVE-10b: CORS Allow-Origin 匹配公网 origin', acao === ORIGIN, `acao=${acao || '(空)'}`)
    check('LIVE-10c: CORS Allow-Methods 含 POST', /\bPOST\b/.test(acam), `acam=${acam || '(空)'}`)

    const invalid = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ action: 'load' }), // 缺 passphrase → 4xx
    })
    check('LIVE-10d: POST invalid（缺 passphrase）→ 4xx', invalid.status >= 400 && invalid.status < 500, `status=${invalid.status}`)

    const load = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ action: 'load', passphrase: PASS_SMOKE }),
    })
    const loadJson = await load.json().catch(() => null)
    const serverErr = load.status >= 500
    const msg = loadJson?.message || ''
    check(
      'LIVE-10e: POST load 非 503/500/Worker not found/D1 missing',
      load.status === 200 && !serverErr && !/worker not found|d1 missing/i.test(msg),
      `status=${load.status} code=${loadJson?.code || 'n/a'}`,
    )
    check('LIVE-10f: fresh 口令 load → exists=false 且 payload=null', loadJson?.ok === true && loadJson?.exists === false && loadJson?.payload === null)
  } catch (err) {
    check('LIVE-10: Worker direct smoke', false, String(err))
  }
}

// ---------------------------------------------------------------------------
let workerUrl = null
let workerFromBundle = false

try {
  // ---- LIVE-01 公网可达（HTTP 层面 + asset 记录） ----
  const htmlRes = await fetch(PUBLIC_GAME_URL)
  const html = await htmlRes.text()
  const scriptAssets = [...html.matchAll(/src="([^"]+\.js)"/g)].map((m) => m[1])
  const styleAssets = [...html.matchAll(/href="([^"]+\.css)"/g)].map((m) => m[1])
  const assetNames = [...scriptAssets, ...styleAssets].map((p) => p.split('/').pop()).filter(Boolean)
  check('LIVE-01a: 公网 HTTP 200', htmlRes.status === 200, `status=${htmlRes.status}`)
  check('LIVE-01b: index.html 含 JS/CSS asset（非 404 页面）', scriptAssets.length > 0, `assets=[${assetNames.join(', ')}]`)

  // ---- 提取 Worker URL（bundle 注入优先，候选 fallback） ----
  workerUrl = await extractWorkerUrlFromBundle()
  workerFromBundle = Boolean(workerUrl)
  if (!workerUrl) {
    workerUrl = CANDIDATE_WORKER_URL
    console.log(`[qa:live] bundle 未发现端点，使用候选 URL: ${CANDIDATE_WORKER_URL}`)
  } else {
    console.log(`[qa:live] 从公网 bundle 提取 Worker URL: ${workerUrl}`)
  }

  // ---- LIVE-10 Worker direct smoke ----
  await workerSmoke(workerUrl)

  // ---- 浏览器（真实公网页面） ----
  const profileDir = mkdtempSync(join(tmpdir(), 'p2-007-r2-live-'))
  browser = await puppeteer.launch({
    executablePath: findChromeExecutable(),
    headless: true,
    userDataDir: profileDir,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1366,768'],
  })
  try {
    // ============ LIVE-01/02 Device A（桌面 1366×768） ============
    const ctxA = await browser.createBrowserContext()
    const pageA = await ctxA.newPage()
    await pageA.setViewport({ width: 1366, height: 768 })
    pageA.on('pageerror', (e) => jsErrors.push('A:' + String(e)))
    await pageA.goto(PUBLIC_GAME_URL, { waitUntil: 'networkidle0' })
    await sleep(600)
    let body = await bodyText(pageA)
    check('LIVE-01c: React 正常启动（云存档口令页可见）', body.includes('云存档口令') && body.includes('进入天梦大陆'))
    check('LIVE-02a: 无「云存档服务尚未配置」', !body.includes('云存档服务尚未配置'))
    check('LIVE-02b: 无「仅本机模式」', !body.includes('仅本机模式'))
    check('LIVE-02c: 云存档入口可见（存档将同步到云端）', body.includes('存档将同步到云端'))

    // ============ LIVE-03 Device A 上传 ============
    await typePassphrase(pageA, PASS_A)
    body = await bodyText(pageA)
    check('LIVE-03a: 新口令 → 主菜单 + 云存档已连接（Main Menu 可见）', body.includes('新游戏') && body.includes('继续游戏') && body.includes('读取存档') && body.includes('☁ 云存档已连接'))
    await clickByText(pageA, '新游戏')
    await sleep(400)
    await createQuickKnight(pageA, 'R2公网测试骑士')
    body = await bodyText(pageA)
    check('LIVE-03b: 新角色进入游戏页（青石村）', (await readLocationName(pageA)) === '青石村' && body.includes('保存游戏'))
    await saveToSlot1(pageA)
    const stateA = await recordSlotState(pageA)
    const afterA = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ action: 'load', passphrase: PASS_A }),
    }).then((r) => r.json())
    check('LIVE-03c: A 保存后云 revision ≥ 1 且 slot1 有档', afterA.ok === true && afterA.revision >= 1 && afterA.payload?.savesExport?.slots?.slot1 !== null, `revision=${afterA.revision}`)
    check(
      'LIVE-03d: 记录 A slot 状态',
      Boolean(stateA),
      stateA ? `slot=${stateA.slot} player=${stateA.player} level=${stateA.level} adventureXp=${stateA.adventureXp} location=${stateA.location} mount=${stateA.mount} quests=${JSON.stringify(stateA.quests)}` : '(无存档)',
    )

    // ============ LIVE-04 Device B 跨设备读取（390×844 手机，真正隔离 context） ============
    const ctxB = await browser.createBrowserContext()
    const pageB = await ctxB.newPage()
    await pageB.setViewport({ width: 390, height: 844 })
    pageB.on('pageerror', (e) => jsErrors.push('B:' + String(e)))
    await pageB.goto(PUBLIC_GAME_URL, { waitUntil: 'networkidle0' })
    await sleep(500)
    await typePassphrase(pageB, PASS_A)
    body = await bodyText(pageB)
    check('LIVE-04a: B 同一口令 → 云档导入 → 可继续游戏', body.includes('继续游戏') && body.includes('☁ 云存档已连接'))
    await clickByText(pageB, '继续游戏')
    await sleep(600)
    const stateB = await recordSlotState(pageB)
    check(
      'LIVE-04b: B 读取到的状态与 A 一致（player/level/xp/location/mount）',
      Boolean(stateA) && Boolean(stateB) &&
        stateA.player === stateB.player && stateA.level === stateB.level &&
        stateA.adventureXp === stateB.adventureXp && stateA.location === stateB.location &&
        stateA.mount === stateB.mount,
      stateB ? `B player=${stateB.player} level=${stateB.level} xp=${stateB.adventureXp} location=${stateB.location} mount=${stateB.mount}` : '(B 无存档)',
    )

    // ============ LIVE-05 B 写 revision（R1 → R2） ============
    await saveToSlot1(pageB)
    const afterB = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ action: 'load', passphrase: PASS_A }),
    }).then((r) => r.json())
    check('LIVE-05: B 保存后云 revision 递增（R1→R2）', afterB.ok === true && afterB.revision === afterA.revision + 1, `rev ${afterA.revision} → ${afterB.revision}`)

    // ============ LIVE-06 A stale CAS 冲突（禁静默覆盖） ============
    await saveToSlot1(pageA)
    await sleep(800)
    body = await bodyText(pageA)
    check('LIVE-06a: A 旧 revision 保存 → 409 冲突对话框', body.includes('云端存档已在另一台设备更新'))
    check('LIVE-06b: 冲突不静默覆盖（显式双选择）', body.includes('读取云端最新版') && body.includes('用当前存档覆盖云端'))
    await clickByText(pageA, '读取云端最新版')
    await sleep(900)
    body = await bodyText(pageA)
    check('LIVE-06c: A 读取云端最新版 → 恢复同步', body.includes('保存游戏'))
    await clickByText(pageA, '返回')
    await sleep(400)

    // ============ LIVE-07 错误口令隔离（不泄露任何数据） ============
    const wrong = await fetch(workerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body: JSON.stringify({ action: 'load', passphrase: PASS_WRONG }),
    }).then((r) => r.json())
    check('LIVE-07a: 错误口令 load → ok 且 exists=false', wrong.ok === true && wrong.exists === false)
    check('LIVE-07b: 错误口令不泄露 payload/revision', wrong.payload === null && (wrong.revision === 0 || wrong.revision === undefined))

    // ============ LIVE-08 offline fallback（request interception 阻断 Worker） ============
    const ctxOff = await browser.createBrowserContext()
    const pageOff = await ctxOff.newPage()
    pageOff.on('pageerror', (e) => jsErrors.push('OFF:' + String(e)))
    await pageOff.setRequestInterception(true)
    pageOff.on('request', (req) => {
      if (req.url().includes('workers.dev')) void req.abort('failed')
      else void req.continue()
    })
    await pageOff.goto(PUBLIC_GAME_URL, { waitUntil: 'networkidle0' })
    await sleep(500)
    await typePassphrase(pageOff, PASS_A)
    await pageOff.waitForFunction(
      () => document.body.textContent.includes('云存档暂时无法连接') && document.body.textContent.includes('仅使用本机存档进入'),
      { timeout: 15_000 },
    )
    await clickByText(pageOff, '仅使用本机存档进入')
    await pageOff.waitForFunction(() => document.body.textContent.includes('新游戏'), { timeout: 5_000 })
    await clickByText(pageOff, '新游戏')
    await sleep(400)
    await createQuickKnight(pageOff, 'R2离线测试骑士')
    await saveToSlot1(pageOff)
    body = await bodyText(pageOff)
    check('LIVE-08a: 本地保存成功（游戏可玩）', body.includes('保存游戏'))
    check('LIVE-08b: 云状态非 synced（不显示「云端已同步」）', !body.includes('云端已同步'))
    check('LIVE-08c: 云状态 offline/cloud_failed', body.includes('云同步未启用') || body.includes('仅本机模式') || body.includes('云存档暂时无法连接') || body.includes('云同步失败'))
    // 恢复网络：解除拦截 → 本地存档不被破坏
    await pageOff.setRequestInterception(false)
    await sleep(300)
    check('LIVE-08d: 恢复网络后本地存档仍保留', (await localSlot1Name(pageOff)) === 'R2离线测试骑士')

    check('LIVE: 全程无 fatal JS exception', jsErrors.length === 0, jsErrors.length > 0 ? jsErrors.join(' | ') : '')
  } finally {
    try { if (browser) await browser.close() } catch { /* 已关闭 */ }
    rmSync(profileDir, { recursive: true, force: true })
  }
} catch (err) {
  check('LIVE: 脚本执行无异常', false, String(err))
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== P2-007-R2 LIVE E2E =====`)
console.log(`TOTAL ${results.length} | PASS ${results.length - failed.length} | FAIL ${failed.length}`)
if (failed.length) {
  for (const f of results.filter((r) => !r.ok)) console.log(`  FAIL: ${f.name}`)
}
process.exit(failed.length > 0 ? 1 : 0)
