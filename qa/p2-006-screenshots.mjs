// TM-P2-006 视觉验收截图采集：qa/screenshots/p2-006/（A–O，对齐 TM-P2-007 任务卡第 3 节规范）
// 分辨率：A–J 1920×1080；K–L 1366×768；M–O 390×844。
// A 青石村普通探索 / B 任务较多状态 / C NPC 交互 / D MerchantPanel / E 已完成任务折叠
// F 普通战斗 / G 战斗详细日志 / H 技能 Tray / I Sakura 伙伴战斗 / J 胜利 XP 结算
// K 1366 GamePage / L 1366 CombatPage / M 390 GamePage / N 390 CombatPage / O 390 战斗详细日志(drawer)
// 自启 Vite（strictPort），fixture 预置存档（localStorage + 仅本机模式 + 继续游戏）。
// 截图仅供人工视觉验收（AUTOMATED LAYOUT 断言在 game-ui/combat-ui e2e 中）；失败即非零退出。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = Number(process.env.PORT || 5228)
const APP_URL = `http://localhost:${PORT}/`
const OUT_DIR = fileURLToPath(new URL('./screenshots/p2-006/', import.meta.url))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const passes = []
const fails = []
const check = (name, ok, extra = '') => {
  ;(ok ? passes : fails).push(name)
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ` | ${extra}` : ''}`)
}

/** Lv.2 骑士 + 樱花优子伙伴（recruited）fixture；确定性 RNG 配套：全 0.99 → 双方必暴击。
 *  STR8 无武器 → 攻击 3、暴击 4 伤/击：对魔化兔（HP8）一击剩 4 → 伙伴回合确定性出现；
 *  伙伴樱花飞斩（暴击 11 伤）收割获胜 → J 胜利结算。 */
function fixture() {
  return {
    version: 5,
    savedAt: new Date().toISOString(),
    gameState: {
      player: {
        id: 'player-screenshot', name: '视觉验收', gender: 'male', level: 2, profession: 'knight',
        // AGI 14 > 魔化兔 AGI 10 / 魔化狼 AGI 12 → D20 平局时玩家先手
        attributes: { str: 8, con: 14, agi: 14, mnd: 8, lck: 10 },
        hp: 26, maxHp: 26, mp: 7, maxMp: 7, gold: 100, adventureXp: 130,
        learnedSkillIds: ['knight_power_strike'],
      },
      inventory: [
        { itemId: 'iron_sword', quantity: 1 },
        { itemId: 'healing_potion', quantity: 2 },
        { itemId: 'traveler_cloth_armor', quantity: 1 },
        { itemId: 'rabbit_path', quantity: 1 },
      ],
      equipment: { weapon: null, armor: 'traveler_cloth_armor', accessory: null },
      quests: [
        { questId: 'quest_village_monsters', status: 'completed', stage: 0, flags: {} },
        { questId: 'quest_mine_cleanup', status: 'completed', stage: 0, flags: {} },
        { questId: 'quest_grassland_wolf', status: 'in_progress', stage: 0, flags: {} },
        { questId: 'quest_golden_rabbit_search', status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } },
      ],
      world: {
        currentLocationId: 'qingshi_village',
        flags: { rabbit_path_examined: true, rabbit_path_reported: true },
        completedEvents: [],
        npcStates: {},
        restCount: 0,
      },
      companions: {
        sakura_yuko: {
          companionId: 'sakura_yuko', status: 'recruited', level: 2, mp: 12, maxMp: 12,
          learnedSkillIds: ['sakura_petalslash', 'sakura_magic_shield', 'sakura_light_dance'], flags: {},
        },
      },
      relationships: {},
      party: { activeCompanionIds: ['sakura_yuko'] },
    },
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const profile = await mkdtemp(join(tmpdir(), 'tianmeng-shot-'))
  const dev = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url)), '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] })
  const page = await browser.newPage()
  try {
    for (let i = 0; i < 40; i += 1) {
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

    const clickBtn = async (label) => {
      await page.evaluate((t) => {
        const b = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim().includes(t))
        if (b && !b.disabled) b.click()
      }, label)
      await sleep(450)
    }

    const loadFixture = async () => {
      await page.goto(APP_URL, { waitUntil: 'networkidle0' })
      await enterLocal()
      await page.evaluate((s) => localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(s)), fixture())
      await page.reload({ waitUntil: 'networkidle0' })
      await enterLocal()
      await clickBtn('继续游戏')
      await page.waitForSelector('[data-testid="quest-column"]', { timeout: 8000 })
      await sleep(500)
    }

    const enterCombat = async (enemyName = '魔化兔') => {
      await clickBtn('村外草原')
      await sleep(400)
      // 确定性 RNG 提前到点击「迎战」前：rollInitiative 在 CombatPage 组件渲染（useRef 惰性初始化）时掷骰，
      // 若在 waitForSelector 之后才覆盖 Math.random，先手仍是真实随机 → 敌人可能先手导致 G 段「跳过」后玩家被反击致死。
      // 提前覆盖 0.99 → 玩家 D20=20 先手（AGI14 > 兔10/狼12），G/I 段流程确定性成立。
      await page.evaluate(() => { Math.random = () => 0.99 })
      // 定向迎战指定敌人（威胁行的「迎战」按钮其直接父级即含该敌人名的行——depth 1 即可，
      // 不能 depth 4：会爬到威胁列表容器，其 textContent 含全部敌人名，导致首个按钮误判）
      const clicked = await page.evaluate((name) => {
        const buttons = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '迎战')
        for (const button of buttons) {
          let el = button.parentElement
          for (let depth = 0; el && depth < 1; depth += 1) {
            if (el.textContent?.includes(name)) {
              button.click()
              return true
            }
            el = el.parentElement
          }
        }
        return false
      }, enemyName)
      if (!clicked) throw new Error(`未找到敌人: ${enemyName}`)
      await page.waitForSelector('[data-testid="combat-summary-feed"]', { timeout: 8000 })
      await sleep(500)
    }

    // ===== A–J：1920×1080 =====
    await page.setViewport({ width: 1920, height: 1080 })
    await loadFixture()
    await shot('A_qingshi_village')          // A 青石村普通探索（GamePage 三列）

    // B：任务较多状态（点开「已完成」折叠区 → 4 条任务全部可见）
    await page.evaluate(() => {
      const col = document.querySelector('[data-testid="quest-column"]')
      const btn = [...col.querySelectorAll('button')].find((b) => b.textContent.includes('已完成'))
      if (btn) btn.click()
    })
    await sleep(400)
    await shot('B_quest_many')

    // C：NPC 交互（与铁匠交谈——按钮文本为「交谈」，按钮直接父级为 NPC 行）
    await page.evaluate(() => {
      const buttons = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '交谈')
      for (const btn of buttons) {
        if (btn.parentElement?.textContent?.includes('铁匠')) { btn.click(); return true }
      }
      return false
    })
    await sleep(500)
    const talkOpen = await page.evaluate(() => document.body.textContent.includes('购买装备'))
    check('C 前置：铁匠交谈面板打开', talkOpen)
    await shot('C_npc_interaction')

    // D：MerchantPanel（购买装备 → 内嵌 MerchantPanel）
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('购买装备'))
      if (b) b.click()
    })
    await page.waitForSelector('[data-testid="merchant-panel"]', { timeout: 5000 })
    await sleep(300)
    await shot('D_merchant_panel')
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('返回交谈'))
      if (b) b.click()
    })
    await sleep(300)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('离开'))
      if (b) b.click()
    })
    await sleep(300)

    // E：已完成任务折叠（quest-column 元素特写——「已完成」Accordion 收起态，与 B 展开态区分。
    //   A 是整页全景、B 是任务全展开、E 用 quest-column 特写突出「已完成折叠」，三图互不相同；
    //   quest-column 核心操作区完整保留，不裁核心区。
    //   B 段已点开折叠区；若经 C/D 交互未重挂（Accordion 保持展开），这里再点一次收起。
    //   若已重挂为默认收起（aria-expanded=false），则不点击直接截图折叠态。）
    await page.evaluate(() => {
      const col = document.querySelector('[data-testid="quest-column"]')
      const btn = [...col.querySelectorAll('button')].find((b) => b.textContent?.includes('已完成'))
      if (btn && btn.getAttribute('aria-expanded') === 'true') btn.click()
    })
    await sleep(300)
    const questColEl = await page.$('[data-testid="quest-column"]')
    if (!questColEl) throw new Error('quest-column 元素未找到')
    const eBuf = await questColEl.screenshot({ type: 'png' })
    await writeFile(join(OUT_DIR, 'E_quest_completed.png'), eBuf)
    const eInfo = await stat(join(OUT_DIR, 'E_quest_completed.png'))
    check('截图 E_quest_completed', eInfo.size > 1000, `bytes=${eInfo.size}`)

    // F–J：战斗页（村外草原 → 迎战魔化狼 HP12：玩家两次普攻各 4 伤后狼仍存活，可进入伙伴回合；
    //   魔化兔 HP8 两击即死无伙伴回合画面，故用狼。）
    await enterCombat('魔化狼')

    // F：普通战斗（初始）
    await shot('F_combat_initial')

    // H：技能 Tray（玩家回合展开；先 H 后 G，避免伙伴回合占用行动栏）
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能') && !el.disabled)
      if (b) b.click()
    })
    await sleep(350)
    await shot('H_combat_skill_tray')
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('技能') && !el.disabled)
      if (b) b.click()
    })
    await sleep(250)

    // G：战斗详细日志（玩家普攻暴击 4 伤 → 狼 HP8 存活 → 伙伴回合出现 → 伙伴「跳过」→ 狼反击 →
    //   回到玩家回合。截图时行动栏是玩家回合（普通攻击/技能/物品/逃跑）、右侧 detail log 有回合分组，
    //   与 I 的伙伴回合画面区分。）
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('普通攻击') && !el.disabled)
      if (b) b.click()
    })
    await sleep(600)
    await clickBtn('跳过')
    await sleep(600)
    const detailHasRounds = await page.evaluate(() => /回合 \d+/.test(document.querySelector('[data-testid="combat-detail-log"]')?.textContent || ''))
    check('G 前置：详细日志有回合分组', detailHasRounds)
    const gIsPlayerTurn = await page.evaluate(() => document.body.textContent.includes('普通攻击'))
    check('G 前置：G 截图时回到玩家回合', gIsPlayerTurn)
    await shot('G_combat_detail_log')

    // I：Sakura 伙伴战斗（玩家再普攻暴击 4 伤 → 狼 HP4 存活 → 伙伴回合出现；截图展示伙伴行动栏）
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('普通攻击') && !el.disabled)
      if (b) b.click()
    })
    await sleep(600)
    const partnerTurn = await page.evaluate(() => document.body.textContent.includes('樱花优子的行动'))
    check('I 前置：进入伙伴回合', partnerTurn)
    await shot('I_sakura_partner_turn')

    // J：胜利 XP 结算（伙伴「樱花飞斩」暴击 10 伤收割击杀魔化狼 HP4）
    // 不能再「跳过」：跳过会触发狼反击，玩家此前已被反击一次（26-17=9），再挨反击会失败。
    await clickBtn('樱花飞斩')
    await sleep(700)
    const victory = await page.evaluate(() => document.body.textContent.includes('战斗胜利'))
    check('J 前置：胜利面板出现', victory)
    await shot('J_combat_victory')

    // ===== K–L：1366×768 =====
    await clickBtn('返回冒险')
    await sleep(400)
    await page.setViewport({ width: 1366, height: 768 })
    await sleep(300)
    await clickBtn('青石村')
    await sleep(400)
    await shot('K_qingshi_1366')             // K 1366 GamePage
    await enterCombat()                       // 定向魔化狼
    await sleep(400)
    await shot('L_combat_1366')              // L 1366 CombatPage

    // ===== M–O：390×844 =====
    // 退出 L 战斗（返回冒险）后 loadFixture 干净重载，避免停留在 CombatPage 导致 M 与 N 相同
    await clickBtn('返回冒险')
    await sleep(400)
    await page.setViewport({ width: 390, height: 844 })
    await loadFixture()
    await sleep(300)
    await shot('M_qingshi_390')              // M 390 GamePage
    await enterCombat()                       // 定向魔化狼
    await sleep(400)
    await shot('N_combat_390')               // N 390 CombatPage

    // O：390 战斗详细日志（Drawer/Modal 打开态；行动栏仍在视口内）
    await clickBtn('详细战斗日志')
    await page.waitForSelector('[data-testid="combat-detail-drawer"]', { timeout: 3000 })
    await sleep(300)
    const drawerOpen = await page.evaluate(() => document.querySelector('[data-testid="combat-detail-drawer"]') !== null)
    check('O 前置：移动端详细日志 drawer 打开', drawerOpen)
    await shot('O_combat_390_drawer')        // O 390 战斗详细日志（drawer）
  } finally {
    await browser.close()
    dev.kill()
    await rm(profile, { recursive: true, force: true })
  }

  console.log(`\n===== TM-P2-006 截图采集结果：${passes.length} 通过 / ${fails.length} 失败 =====`)
  if (fails.length > 0) process.exitCode = 1
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
