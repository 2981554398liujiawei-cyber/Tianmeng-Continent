// TM-P2-009 视觉验收截图采集：qa/screenshots/p2-009/（A–O，对齐任务卡第 3 节规范）
// 分辨率：A–J 1920×1080；K–L 1366×768；M–O 390×844。
// A 主菜单 / B 武馆马科发布块《断旗余声》（北郊 completed） / C 北郊旧驿站场景（含驿站狼群遭遇卡）
// D 搜索驿站后 Stage C 多解按钮（combat/MND/LCK + 断裂队旗线索 + 线索角标）
// E 线索 Journal 折叠态（3 条线索） / F 线索展开态（同时最多 1 条展开）
// G Stage D 搜救幸存者（沈拓 + 黑篷车辙线索） / H 日志 Tab 最近记录（上限 5 + 查看全部）
// I 消息中心 Drawer（上限 20 + 沈拓/马科用户文案） / J 提交后骑士试炼预告块（§17 只预告）
// K 1366 GamePage（旧驿站三栏） / L 1366 预告块 / M 390 GamePage（MobileNav） / N 390 冒险 Drawer / O 390 背包
// 自启 Vite（strictPort 5245），fixture 预置存档（localStorage + 仅本机模式 + 继续游戏）。
// 截图仅供人工视觉验收；失败即非零退出。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.P2_009_SCREENSHOT_PORT || 5245)
const APP_URL = process.env.BASE_URL || `http://localhost:${PORT}/`
const OUT_DIR = fileURLToPath(new URL('./screenshots/p2-009/', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const passes = []
const fails = []
const check = (name, ok, extra = '') => {
  ;(ok ? passes : fails).push(name)
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

/** 基础玩家（Lv2 骑士，MND8/LCK10） */
function basePlayer() {
  return {
    id: 'player-p2-009-shot', name: '视觉验收', gender: 'male', level: 2, profession: 'knight',
    attributes: { str: 13, con: 12, agi: 10, mnd: 8, lck: 10 },
    hp: 20, maxHp: 24, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
    learnedSkillIds: ['knight_power_strike'],
  }
}

const defaultPlayerBox = (player) => ({
  player,
  inventory: [{ itemId: 'iron_sword', quantity: 1 }, { itemId: 'healing_potion', quantity: 2 }],
  equipment: { weapon: 'iron_sword', armor: null, accessory: null },
  companions: {}, relationships: {}, party: { activeCompanionIds: [] },
  ownedMountIds: [], equippedMountId: null,
})

/** A fixture：主菜单（无存档）——直接由脚本 goto 空 localStorage。 */

/** B fixture：武馆 + 北郊 completed + 断旗余声 available（马科发布块） */
function fPublish() {
  return {
    ...defaultPlayerBox(basePlayer()),
    quests: [{ questId: 'quest_north_outskirts', status: 'completed', stage: 0, flags: {} }],
    world: {
      currentLocationId: 'tianlong_martial_hall',
      flags: { north_outskirts_unlocked: true },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
  }
}

/**
 * C/D/E/F/K/M/N fixture：旧驿站 + 断旗余声 in_progress + make_briefed 完成（Stage B 可搜索）。
 * 存量线索 2 条（兔子的路径/黑色鬃毛，视为已读）+ 搜索得断裂队旗（未读角标）。
 */
function fWaystation() {
  return {
    ...defaultPlayerBox(basePlayer()),
    quests: [{
      questId: 'quest_north_broken_banner', status: 'in_progress', stage: 0,
      flags: { north_broken_banner_make_briefed: true },
    }],
    world: {
      currentLocationId: 'tianlong_north_abandoned_waystation',
      flags: {
        north_outskirts_unlocked: true,
        north_waystation_unlocked: true,
        clue_rabbit_path: true,
        clue_north_black_mane: true,
      },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
  }
}

/** G fixture：旧驿站 + searched + barrier_resolved 完成（Stage D 可搜救） */
function fRescue() {
  return {
    ...defaultPlayerBox(basePlayer()),
    quests: [{
      questId: 'quest_north_broken_banner', status: 'in_progress', stage: 0,
      flags: {
        north_broken_banner_make_briefed: true,
        north_waystation_searched: true,
        north_waystation_barrier_resolved: true,
      },
    }],
    world: {
      currentLocationId: 'tianlong_north_abandoned_waystation',
      flags: {
        north_outskirts_unlocked: true,
        north_waystation_unlocked: true,
        clue_rabbit_path: true,
        clue_north_black_mane: true,
        clue_north_broken_banner: true,
      },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
  }
}

/**
 * H/I fixture：旧驿站 + 断旗余声 in_progress（searched 完成）+ 已完成任务 6 个 + 活动事件 27 条
 * （north_survivor_rescued / knight_trial_invited / 25×村长事件）→ 日志最近记录 5 / 消息中心 20。
 */
function fActivity() {
  return {
    ...defaultPlayerBox(basePlayer()),
    quests: [
      { questId: 'quest_north_broken_banner', status: 'in_progress', stage: 0, flags: { north_broken_banner_make_briefed: true, north_waystation_searched: true } },
      { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_apothecary_herb_route', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_blacksmith_mine_remnant', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_grassland_wolf', status: 'completed', stage: 0, flags: {} },
      { questId: 'quest_north_gate_missing_patrol', status: 'completed', stage: 0, flags: {} },
    ],
    world: {
      currentLocationId: 'tianlong_north_abandoned_waystation',
      flags: {
        north_outskirts_unlocked: true,
        north_waystation_unlocked: true,
        clue_rabbit_path: true,
        clue_north_black_mane: true,
      },
      completedEvents: [
        'north_survivor_rescued',
        'knight_trial_invited',
        ...Array.from({ length: 25 }, () => 'village_elder_post_quest_response'),
      ],
      npcStates: {}, restCount: 0, encounterVariants: {},
    },
  }
}

/** J/L fixture：武馆 + 断旗余声 completable（可提交 → 骑士试炼预告块） */
function fCompletable() {
  return {
    ...defaultPlayerBox(basePlayer()),
    quests: [{
      questId: 'quest_north_broken_banner', status: 'completable', stage: 0,
      flags: {
        north_broken_banner_make_briefed: true,
        north_waystation_searched: true,
        north_waystation_barrier_resolved: true,
        north_waystation_survivor_rescued: true,
        north_waystation_survivor_debriefed: true,
        north_broken_banner_reported: true,
      },
    }],
    world: {
      currentLocationId: 'tianlong_martial_hall',
      flags: {
        north_outskirts_unlocked: true,
        north_waystation_unlocked: true,
        clue_rabbit_path: true,
        clue_north_black_mane: true,
        clue_north_broken_banner: true,
        clue_north_black_wagon_tracks: true,
        clue_north_alchemical_bait: true,
        // TM-P2-009-R1 §2.3：邀请在向马科汇报时写入；completable 前置已含 report，故补齐（预告块依赖此 flag）
        knight_trial_invited: true,
      },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-009-shot-'))
  const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
  const dev = process.env.BASE_URL
    ? null
    : spawn(process.execPath, [viteBin, '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'],
  })
  const page = await browser.newPage()
  try {
    for (let i = 0; i < 60; i += 1) {
      try { await fetch(APP_URL); break } catch { await sleep(250) }
    }

    const enterLocal = async () => {
      const clicked = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.includes('仅本机模式'))
        if (b) { b.click(); return true }
        return false
      })
      if (clicked) await sleep(400)
    }

    const shot = async (name) => {
      const path = join(OUT_DIR, `${name}.png`)
      await page.screenshot({ path, type: 'png', captureBeyondViewport: false })
      const info = await stat(path)
      check(`截图 ${name}`, info.size > 1000, `bytes=${info.size}`)
    }

    const shotEl = async (name, selector) => {
      const el = await page.$(selector)
      if (!el) throw new Error(`元素未找到: ${selector}`)
      const buf = await el.screenshot({ type: 'png' })
      const path = join(OUT_DIR, `${name}.png`)
      await writeFile(path, buf)
      const info = await stat(path)
      check(`截图 ${name}`, info.size > 1000, `bytes=${info.size}`)
    }

    const clickBtn = async (label) => {
      const clicked = await page.evaluate((t) => {
        const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(t))
        if (b && !b.disabled) { b.click(); return true }
        return false
      }, label)
      if (clicked) await sleep(450)
      return clicked
    }

    const clickTestId = async (testId) => {
      const clicked = await page.evaluate((id) => {
        const b = document.querySelector(`[data-testid="${id}"]`)
        if (b && !b.disabled) { b.click(); return true }
        return false
      }, testId)
      if (clicked) await sleep(450)
      return clicked
    }

    const clickTab = async (label) => {
      await page.evaluate((t) => {
        const qc = document.querySelector('[data-testid="quest-column"]')
        const tab = qc && [...qc.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim().startsWith(t))
        if (tab && !tab.disabled) tab.click()
      }, label)
      await sleep(400)
    }

    const loadSave = async (save) => {
      await page.goto(APP_URL, { waitUntil: 'networkidle0' })
      await enterLocal()
      await page.evaluate((s) => {
        localStorage.clear()
        localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: s }))
      }, save)
      await page.reload({ waitUntil: 'networkidle0' })
      await enterLocal()
      await clickBtn('继续游戏')
      await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 })
      await sleep(500)
    }

    const goWaystation = async () => {
      await clickBtn('天龙城')
      await clickBtn('天龙城北门')
      await clickBtn('天龙城北郊')
      await clickBtn('北郊旧驿站')
      await sleep(500)
    }

    // ==================== A–J：1920×1080 ====================
    await page.setViewport({ width: 1920, height: 1080 })

    // A：主菜单
    await page.goto(APP_URL, { waitUntil: 'networkidle0' })
    await sleep(600)
    await shot('A_main_menu')

    // B：武馆马科发布块（北郊 completed → 断旗余声 available）
    await loadSave(fPublish())
    const bMain = await page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')
    check('B 前置：武馆展示《断旗余声》发布块', bMain.includes('北郊驿站的传闻') && bMain.includes('接受任务：断旗余声'))
    await shot('B_publish_block')

    // C：北郊旧驿站场景（Stage B 搜索前 + 驿站狼群遭遇卡）
    await loadSave(fWaystation())
    await goWaystation()
    const cMain = await page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')
    check('C 前置：旧驿站场景渲染', cMain.includes('北郊旧驿站'))
    check('C 前置：驿站狼群遭遇卡渲染', cMain.includes('驿站狼群') && cMain.includes('荒原野狼×2+魔化狼'))
    await shot('C_waystation')

    // D：搜索驿站 → 断裂队旗线索 + Stage C 多解按钮 + 线索 Tab 角标
    await clickTestId('search-waystation')
    const dHasStageC = await page.evaluate(() => document.querySelector('[data-testid="barrier-mnd"]') !== null)
    check('D 前置：搜索后 Stage C 出现', dHasStageC)
    await shot('D_waystation_searched')

    // E：线索 Journal 折叠态（打开线索 Tab → 3 条，全部折叠 + 无角标【已读】）
    await clickTab('线索')
    const eSide = await page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')
    check('E 前置：线索 Tab 含 3 条线索标题', eSide.includes('断裂队旗') && eSide.includes('兔子的路径') && eSide.includes('黑色鬃毛'))
    await shotEl('E_clues_collapsed', '[data-testid="quest-column"]')

    // F：线索展开态（展开断裂队旗 → description + 来源；同时最多 1 条展开）
    await page.evaluate(() => {
      const qc = document.querySelector('[data-testid="quest-column"]')
      const cardEl = [...qc.querySelectorAll('li')].find((li) => li.textContent?.includes('断裂队旗'))
      const btn = cardEl && [...cardEl.querySelectorAll('button')].find((b) => b.textContent?.trim() === '展开')
      if (btn) btn.click()
    })
    await sleep(400)
    const fSide = await page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')
    check('F 前置：断裂队旗展开显示描述', fSide.includes('一面被撕成两半'))
    await shotEl('F_clues_expanded', '[data-testid="quest-column"]')
    await clickTab('任务')

    // G：Stage D 搜救幸存者（沈拓 + 黑篷车辙线索）
    await loadSave(fRescue())
    await goWaystation()
    const gRescue = await page.evaluate(() => document.querySelector('[data-testid="rescue-survivor"]') !== null)
    check('G 前置：搜救按钮出现', gRescue)
    await clickTestId('rescue-survivor')
    await shot('G_rescue_stage')

    // H：日志 Tab 最近记录（上限 5 + 查看全部）
    await loadSave(fActivity())
    await goWaystation()
    await clickTab('日志')
    const hLiCount = await page.evaluate(() => {
      const qc = document.querySelector('[data-testid="quest-column"]')
      if (!qc) return -1
      const sectionEl = [...qc.querySelectorAll('section')].find((s) => s.textContent?.includes('最近记录'))
      return sectionEl ? sectionEl.querySelectorAll('li').length : -1
    })
    check('H 前置：日志最近记录上限 5 条', hLiCount === 5, `li=${hLiCount}`)
    const hSide = await page.evaluate(() => document.querySelector('[data-testid="quest-column"]')?.textContent || '')
    check('H 前置：含「查看全部」按钮', hSide.includes('查看全部'))
    await shotEl('H_log_recent', '[data-testid="quest-column"]')

    // I：消息中心 Drawer（20 条上限）
    await clickBtn('查看全部')
    await sleep(500)
    const iDrawer = await page.evaluate(() => document.querySelector('[role="dialog"][aria-label="消息中心"]')?.textContent ?? '')
    check('I 前置：消息中心打开且含用户文案', iDrawer.includes('救出了失联巡逻骑士沈拓') && iDrawer.includes('准备安排正式骑士试炼'))
    await shot('I_message_center')
    await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]')
      const btn = dlg && dlg.querySelector('button[aria-label="关闭"]')
      if (btn) btn.click()
    })
    await sleep(400)

    // J：提交后骑士试炼预告块（§17 只预告）
    await loadSave(fCompletable())
    await clickBtn('提交任务')
    await sleep(600)
    const jMain = await page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')
    check('J 前置：骑士试炼预告块渲染', jMain.includes('骑士试炼的预告') && jMain.includes('试炼内容尚待展开'))
    await shot('J_quest_completed')

    // ==================== K–L：1366×768 ====================
    await page.setViewport({ width: 1366, height: 768 })

    // K：1366 GamePage（旧驿站三栏）
    await loadSave(fWaystation())
    await goWaystation()
    const kMain = await page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')
    check('K 前置：1366 旧驿站渲染', kMain.includes('北郊旧驿站'))
    await shot('K_waystation_1366')

    // L：1366 预告块
    await loadSave(fCompletable())
    await clickBtn('提交任务')
    await sleep(600)
    const lMain = await page.evaluate(() => document.querySelector('[data-testid="main-column"]')?.textContent || '')
    check('L 前置：1366 预告块渲染', lMain.includes('骑士试炼的预告'))
    await shot('L_quest_completed_1366')

    // ==================== M–O：390×844 ====================
    await page.setViewport({ width: 390, height: 844 })

    // M：390 GamePage（旧驿站 + MobileNav）
    await loadSave(fWaystation())
    await goWaystation()
    const mMobile = await page.evaluate(() => document.querySelector('[aria-label="移动端导航"]') !== null)
    check('M 前置：移动端导航可见', mMobile)
    await shot('M_mobile_waystation')

    // N：390 冒险 Drawer（内嵌 AdventureSidebar）
    await clickTestId('mobile-nav-adventure')
    const nDrawer = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"][aria-label="冒险"]')
      return dlg && dlg.querySelector('[data-testid="quest-column"]') !== null
    })
    check('N 前置：冒险 Drawer 含 AdventureSidebar', nDrawer)
    await shot('N_mobile_adventure')
    await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]')
      const btn = dlg && dlg.querySelector('button[aria-label="关闭"]')
      if (btn) btn.click()
    })
    await sleep(400)

    // O：390 背包面板
    await clickTestId('mobile-nav-backpack')
    const oPack = await page.evaluate(() => document.querySelector('[data-testid="backpack-panel"]') !== null)
    check('O 前置：背包面板打开', oPack)
    await shot('O_mobile_backpack')

    const total = passes.length + fails.length
    console.log(`===== TM-P2-009 截图采集结果：${passes.length}/${total} 通过 =====`)
    if (fails.length) {
      console.log(`FAIL 项：\n${fails.join('\n')}`)
      process.exit(1)
    }
  } finally {
    try { if (browser) await browser.close() } catch { /* 已关闭 */ }
    try { if (dev) dev.kill() } catch { /* 已退出 */ }
    await rm(profile, { recursive: true, force: true })
  }
}

await main()
