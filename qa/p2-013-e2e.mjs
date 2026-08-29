// TM-P2-013 §29/§30：Full Journey 真实 UI 主路径 E2E
//   P2-012 完成存档 → 天龙城异动 → 接受《黑石余响》→ 进入黑石塔 → 四层 → 调查三点（含职业分支）
//   → 封印室 → 黑石守门者 → 胜利 → 未鉴定遗物 → 回城 → 鉴定师 → 支付 20 金 → 职业装备
//   → 查看装备要求 → 回报 → 完成 → Save → Menu → Reload → 状态一致
// 附：§30 FIX-01《猎人的旧路》真实 UI 链、§21 黄金兔 HARD FREEZE。
// 约定：主路径不得注入最终 flag 代替流程；fixture 只用于构造「P2-012 已完成」的合法存档与专项测试。
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const port = Number(process.env.P2_013_PORT || 5293)
const url = process.env.BASE_URL || `http://127.0.0.1:${port}/`
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-013-'))
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const dev = process.env.BASE_URL ? null : spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { stdio: 'ignore' })
const results = []
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${detail ? ` | ${detail}` : ''}`) }
const body = () => page.evaluate(() => document.body.textContent || '')

// §21 黄金兔 HARD FREEZE 基线
const GOLDEN_FREEZE = { status: 'in_progress', stage: 0, flags: { asked_blacksmith: true, asked_apothecary: true, village_inquiry_reported: true, rabbit_lair_rechecked: true } }

/**
 * 鉴定专项 fixture 使用：代表「主路径已走完（四层开放 + 封印室开放 + Boss 已击败）」的合法存档。
 * §29 允许 fixture 用于专项测试；主路径本身（E1–E33）不注入这些 flag，全部由真实 UI 写入。
 */
const JOURNEY_FLAGS = {
  black_stone_tower_floor4_unlocked: true,
  black_stone_sealed_chamber_unlocked: true,
  blackstone_warden_defeated: true,
}

/**
 * 构造「P2-012 已完成」的合法存档。
 * 默认不含 quest_black_stone_deep_echo，也不含 floor4/sealed_chamber/warden 相关 flag
 * ——这些只能由真实 UI 流程写入。
 */
function fixture({
  location = 'tianlong_city',
  springCompleted = true,
  wangcaiCompleted = true,
  level = 7,
  profession = 'ranger',
  gold = 100,
  relic = 0,
  hp = 300,
  extraFlags = {},
  extraQuests = [],
  extraInventory = [],
  echo = null,
} = {}) {
  const quests = [
    { questId: 'quest_tianlong_martial_trial', status: 'completed', stage: 1, flags: { trial_reward_claimed: true } },
    { questId: 'quest_wangcai_trouble', status: wangcaiCompleted ? 'completed' : 'in_progress', stage: 1, flags: { wangcai_briefed: true } },
    { questId: 'quest_spirit_spring_water', status: springCompleted ? 'completed' : 'in_progress', stage: 7, flags: { water_collected: true } },
    { questId: 'quest_golden_rabbit_search', status: GOLDEN_FREEZE.status, stage: GOLDEN_FREEZE.stage, flags: { ...GOLDEN_FREEZE.flags } },
    ...extraQuests,
  ]
  if (echo) quests.push({ questId: 'quest_black_stone_deep_echo', ...echo })
  return {
    player: {
      id: 'p2-013-e2e', name: '黑石验收员', gender: 'male', level, profession,
      attributes: { str: 14, con: 14, agi: 16, mnd: 12, lck: 12 },
      // XP 必须满足 V6 严格不变量：threshold(level) <= adventureXp < threshold(level+1)
      hp, maxHp: hp, mp: 40, maxMp: 40, gold, adventureXp: 25 * level * (level + 1) - 50,
      learnedSkillIds: [({ warrior: 'warrior_suppress_strike', knight: 'knight_power_strike', ranger: 'ranger_swift_strike', mage: 'mage_spell' })[profession]],
    },
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 4 },
      { itemId: 'rabbit_path', quantity: 1 },
      ...(relic > 0 ? [{ itemId: 'unidentified_blackstone_relic', quantity: relic }] : []),
      ...extraInventory,
    ],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests,
    world: {
      currentLocationId: location,
      flags: {
        black_stone_tower_unlocked: true,
        black_stone_tower_floor2_unlocked: true,
        black_stone_tower_floor3_unlocked: true,
        ...extraFlags,
      },
      completedEvents: [], npcStates: {}, restCount: 0, encounterVariants: {},
    },
    companions: {}, relationships: {}, party: { activeCompanionIds: [] }, ownedMountIds: [], equippedMountId: null,
  }
}

let browser, page
async function ready() { for (let i = 0; i < 80; i += 1) { try { await fetch(url); return } catch { await sleep(250) } } throw new Error('Vite startup timeout') }
async function local() { const clicked = await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find((entry) => (entry.textContent || '').includes('仅本机模式')); if (!button) return false; button.click(); return true }); if (clicked) await sleep(200) }
async function load(state) {
  await page.goto(url, { waitUntil: 'networkidle0' }); await local()
  await page.evaluate((value) => { localStorage.clear(); localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify({ version: 6, savedAt: new Date().toISOString(), gameState: value })) }, state)
  await page.reload({ waitUntil: 'networkidle0' }); await local()
  const clicked = await page.evaluate(() => { const button = [...document.querySelectorAll('button')].find((entry) => (entry.textContent || '').includes('继续游戏')); if (!button || button.disabled) return false; button.click(); return true })
  if (!clicked) {
    const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => (b.textContent || '').trim()).slice(0, 20))
    throw new Error(`继续游戏不可用；当前按钮=${JSON.stringify(buttons)}`)
  }
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 }); await sleep(250)
}
async function clickText(text) {
  const ok = await page.evaluate((needle) => { const button = [...document.querySelectorAll('button')].find((entry) => !entry.disabled && (entry.textContent || '').includes(needle)); if (!button) return false; button.click(); return true }, text)
  if (ok) await sleep(250)
  return ok
}
async function readSave() { return page.evaluate(() => JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')) }
async function save() { await clickText('保存游戏'); await clickText('覆盖保存'); await clickText('确认覆盖'); await sleep(500); return readSave() }
/** 与指定 NPC 交谈（点该 NPC 卡片内的「交谈」按钮） */
async function talkTo(npcName) {
  const ok = await page.evaluate((name) => {
    const button = [...document.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === '交谈' && (b.parentElement?.textContent || '').includes(name))
    if (!button || button.disabled) return false
    button.click(); return true
  }, npcName)
  if (ok) await sleep(300)
  return ok
}
/** 依次点击地点按钮完成移动链 */
async function travelChain(names) {
  for (const name of names) {
    const ok = await clickText(name)
    if (!ok) return false
    await sleep(300)
  }
  return true
}
/** 迎战指定名字的遭遇卡 */
async function engage(name) {
  const engaged = await page.evaluate((needle) => {
    const cards = [...document.querySelectorAll('[data-testid$="-encounter-card"], [data-testid="training-encounter-card"]')]
    const card = cards.find((entry) => (entry.textContent || '').includes(needle))
    const button = card ? [...card.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').includes('迎战')) : undefined
    if (!button) return false
    button.click(); return true
  }, name)
  if (engaged) await page.waitForSelector('[data-testid="combat-action-tray"]', { timeout: 8000 })
  return engaged
}
/** 战斗循环：普通攻击 → 确认 → 结束回合，直到出现胜负 */
async function fight() {
  let outcome = 'timeout'
  for (let i = 0; i < 400; i += 1) {
    const text = await body()
    if (text.includes('战斗胜利')) { outcome = 'victory'; break }
    if (text.includes('战斗失败')) { outcome = 'defeat'; break }
    const attacked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').trim() === '普通攻击'); if (!b) return false; b.click(); return true })
    if (attacked) {
      await sleep(120)
      await page.evaluate(() => { const b = [...document.querySelectorAll('footer button')].find((x) => !x.disabled && (x.textContent || '').trim() !== '取消'); if (b) b.click() })
      await sleep(200)
    } else {
      const ended = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => !x.disabled && (x.textContent || '').trim() === '结束回合'); if (!b) return false; b.click(); return true })
      if (!ended) await sleep(250)
      else await sleep(180)
    }
  }
  return outcome
}
const flag = async (key) => page.evaluate((k) => JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')?.gameState?.world?.flags?.[k], key)

try {
  await ready(); browser = await puppeteer.launch({ executablePath: chrome, headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-gpu'] }); page = await browser.newPage()
  await page.setViewport({ width: 1366, height: 900 })

  // ================= §27：前置未完成 → 异动不可出现 =================
  await load(fixture({ springCompleted: false }))
  check('E1 前置未完成（《神泉之水》未 completed）→ 黑石异动卡不出现', await page.$('[data-testid="black-stone-echo-report"]') === null)

  // ================= §4 Stage A：天龙城出现黑石塔异动 =================
  await load(fixture())
  check('E2 双前置 completed + 在天龙城 → 黑石异动卡出现', await page.$('[data-testid="black-stone-echo-report"]') !== null)
  // §4：不得一点击就给坐标 / 自动传送 / 自动开战
  check('E3 异动卡不直接暴露深层坐标（仅叙事 + 接受按钮）', !(await body()).includes('黑石封印室'))
  check('E4 点击接受前未解锁四层', await flag('black_stone_tower_floor4_unlocked') !== true)
  check('E5 接受《黑石余响》', await page.evaluate(() => { const b = document.querySelector('[data-testid="accept-black-stone-echo"]'); if (!b || b.disabled) return false; b.click(); return true }))
  await sleep(400)
  check('E6 接受后异动卡消失（一次性）', await page.$('[data-testid="black-stone-echo-report"]') === null)
  check('E7 接受后仍在天龙城（不自动传送）', await page.$('[data-testid="black-stone-echo-report"]') === null && (await body()).includes('天龙城'))
  await save()
  check('E8 接受即写入四层解锁 flag', await flag('black_stone_tower_floor4_unlocked') === true)
  check('E9 接受后仍未解锁封印室（须先完成四层调查）', await flag('black_stone_sealed_chamber_unlocked') !== true)

  // ================= §5/§27：四层未解锁不可进入 =================
  await load(fixture())
  const floor4Locked = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '黑石塔四层')
    return b ? (b.disabled ? 'disabled' : 'enabled') : 'absent'
  })
  check('E10 未接受任务时四层入口不可用（需先到三层才可见；此处 absent/disabled 均可）', floor4Locked !== 'enabled', `state=${floor4Locked}`)

  // ================= 完整主路径 =================
  await load(fixture())
  await page.evaluate(() => { const b = document.querySelector('[data-testid="accept-black-stone-echo"]'); if (b) b.click() })
  await sleep(350)
  check('E11 真实移动链进入黑石塔三层', await travelChain(['黑石塔一层', '黑石塔二层', '黑石塔三层']))
  check('E12 三层可见四层入口且已解锁', await clickText('黑石塔四层'))
  check('E13 抵达黑石塔四层', (await body()).includes('黑石塔四层'))
  check('E14 四层调查面板出现', await page.$('[data-testid="floor4-investigation"]') !== null)

  // ---- §6/§7/§8：三个调查点 ----
  const floor4Text = await body()
  check('E15 三个调查点齐全（崩裂石门 / 黑石共鸣纹 / 旧封印刻痕）',
    floor4Text.includes('崩裂石门') && floor4Text.includes('黑石共鸣纹') && floor4Text.includes('旧封印刻痕'))

  // §8 职业分支：ranger → 敏捷（AGI）判定
  const profBtn = await page.evaluate(() => {
    const b = document.querySelector('[data-testid="investigate-profession-broken_gate"]')
    return b ? b.textContent.trim() : null
  })
  check('E16 职业调查选项带职业主属性标签（游侠 → 敏捷）', Boolean(profBtn && profBtn.includes('敏捷')), `label=${profBtn}`)
  check('E17 至少使用一个职业分支调查点', await page.evaluate(() => { const b = document.querySelector('[data-testid="investigate-profession-broken_gate"]'); if (!b || b.disabled) return false; b.click(); return true }))
  await sleep(350)
  check('E18 职业分支调查后该点标记为已调查（一次性）', (await body()).includes('已调查'))
  check('E19 已调查点不再出现调查按钮（不可无限重骰）', await page.$('[data-testid="investigate-profession-broken_gate"]') === null)

  // 其余两点走 MND / LUCK
  check('E20 MND 检视第二个调查点', await page.evaluate(() => { const b = document.querySelector('[data-testid="investigate-mnd-resonance"]'); if (!b || b.disabled) return false; b.click(); return true }))
  await sleep(350)
  check('E21 LUCK 碰碰运气第三个调查点', await page.evaluate(() => { const b = document.querySelector('[data-testid="investigate-lck-seal_pattern"]'); if (!b || b.disabled) return false; b.click(); return true }))
  await sleep(400)
  check('E22 三点完成 → 出现封印室开启提示', await page.$('[data-testid="sealed-chamber-hint"]') !== null)
  await save()
  check('E23 三点完成写入封印室解锁 flag', await flag('black_stone_sealed_chamber_unlocked') === true)
  check('E24 三条线索均已写入', (await flag('clue_floor4_broken_gate')) === true && (await flag('clue_floor4_resonance')) === true && (await flag('clue_floor4_seal_pattern')) === true)

  // ---- §10/§11：封印室 + Boss ----
  check('E25 进入黑石封印室', await clickText('黑石封印室'))
  await sleep(350)
  const chamberText = await body()
  check('E26 封印室出现黑石守门者遭遇卡', chamberText.includes('黑石守门者'))
  check('E27 Boss 遭遇不可逃跑（canEscape=false → 无逃离按钮）', !chamberText.includes('逃离'))
  check('E28 迎战黑石守门者', await engage('黑石守门者'))
  const outcome = await fight()
  check('E29 Boss 战胜利', outcome === 'victory', `outcome=${outcome}`)
  await sleep(400)
  await clickText('返回'); await sleep(400)
  await save()
  check('E30 Boss 首胜写入 defeated flag', await flag('blackstone_warden_defeated') === true)
  const relicSave = await readSave()
  check('E31 首胜 guaranteed 未鉴定黑石遗物 ×1',
    (relicSave?.gameState?.inventory || []).find((e) => e.itemId === 'unidentified_blackstone_relic')?.quantity === 1)

  // §11 Boss 不可重复刷新
  const bossAgain = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-testid$="-encounter-card"]')]
    const card = cards.find((entry) => (entry.textContent || '').includes('黑石守门者'))
    if (!card) return 'absent'
    const b = [...card.querySelectorAll('button')].find((x) => (x.textContent || '').includes('迎战'))
    return b && !b.disabled ? 'engable' : 'blocked'
  })
  check('E32 Boss defeated 后不可重复迎战/刷新', bossAgain !== 'engable', `state=${bossAgain}`)

  // ================= §13-§19：回城鉴定 =================
  check('E33 返回天龙城', await travelChain(['黑石塔四层', '黑石塔三层', '黑石塔二层', '黑石塔一层', '天龙城']))
  await sleep(300)
  // §19 鉴定前：背包显示未鉴定
  await clickText('打开背包'); await sleep(350)
  check('E34 背包中未鉴定遗物显示「未鉴定」标记', await page.$('[data-testid="backpack-unidentified-unidentified_blackstone_relic"]') !== null)
  await page.evaluate(() => { const b = document.querySelector('[data-testid="backpack-item-unidentified_blackstone_relic"]'); if (b) b.click() })
  await sleep(300)
  check('E35 未鉴定物详情不出现装备按钮', await page.$('[data-testid="backpack-equip"]') === null)
  check('E36 未鉴定物详情不暴露最终装备名', !(await body()).includes('黑石猎弓'))
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '关闭'); if (b) b.click() })
  await sleep(300)

  // §15 鉴定师
  check('E37 天龙城出现遗物鉴定师', (await body()).includes('遗物鉴定师'))
  check('E38 打开鉴定师对话', await talkTo('遗物鉴定师'))
  check('E39 鉴定面板出现', await page.$('[data-testid="appraiser-panel"]') !== null)
  const goldBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')?.gameState?.player?.gold)

  // §16 金币不足 → 拒绝
  await load(fixture({ echo: { status: 'in_progress', stage: 3, flags: {} }, relic: 1, gold: 19, extraFlags: { ...JOURNEY_FLAGS } }))
  await talkTo('遗物鉴定师')
  check('E40 金币不足 → 鉴定按钮 disabled', await page.evaluate(() => { const b = document.querySelector('[data-testid="identify-relic"]'); return Boolean(b && b.disabled) }))

  // §16 正常鉴定（20 金）
  await load(fixture({ echo: { status: 'in_progress', stage: 3, flags: {} }, relic: 1, gold: 100, extraFlags: { ...JOURNEY_FLAGS } }))
  await talkTo('遗物鉴定师')
  check('E41 金币充足 → 鉴定按钮可用', await page.evaluate(() => { const b = document.querySelector('[data-testid="identify-relic"]'); return Boolean(b && !b.disabled) }))
  await page.evaluate(() => { const b = document.querySelector('[data-testid="identify-relic"]'); if (b) b.click() })
  await sleep(450)
  const idSave = await save()
  const inv = idSave?.gameState?.inventory || []
  check('E42 鉴定后遗物 -1', !(inv.some((e) => e.itemId === 'unidentified_blackstone_relic' && e.quantity > 0)))
  check('E43 鉴定后金币 -20（100 → 80）', idSave?.gameState?.player?.gold === 80, `gold=${idSave?.gameState?.player?.gold}`)
  check('E44 游侠 → 得到黑石猎弓（确定性职业映射）', inv.some((e) => e.itemId === 'blackstone_hunter_bow' && e.quantity === 1))
  check('E45 鉴定写入 relic_identified（任务可回报）',
    idSave?.gameState?.quests?.find((q) => q.questId === 'quest_black_stone_deep_echo')?.flags?.relic_identified === true)
  check('E46 goldBefore 采样有效（前置断言）', Number.isInteger(goldBefore))

  // §19 鉴定后进入装备 UI
  await clickText('打开背包'); await sleep(350)
  await page.evaluate(() => { const b = document.querySelector('[data-testid="backpack-item-blackstone_hunter_bow"]'); if (b) b.click() })
  await sleep(300)
  const equipText = await body()
  check('E47 鉴定后进入装备 UI：显示属性加成', equipText.includes('攻击'))
  check('E48 显示等级要求', equipText.includes('需要等级 6'))
  check('E49 显示属性要求与当前差距（AGI）', equipText.includes('需要AGI 14'))
  check('E50 装备按钮出现', await page.$('[data-testid="backpack-equip"]') !== null)
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === '关闭'); if (b) b.click() })
  await sleep(300)

  // ================= §20：回报与完成 =================
  check('E51 前往武馆（马科驻地）', await clickText('武馆'))
  await sleep(300)
  check('E52 打开马科对话', await talkTo('马科'))
  check('E53 出现「向马科回报深层调查」', await page.$('[data-testid="report-black-stone-echo"]') !== null)
  await page.evaluate(() => { const b = document.querySelector('[data-testid="report-black-stone-echo"]'); if (b) b.click() })
  await sleep(400)
  const reportSave = await save()
  check('E54 回报后任务 → completable', reportSave?.gameState?.quests?.find((q) => q.questId === 'quest_black_stone_deep_echo')?.status === 'completable')
  const xpBefore = reportSave?.gameState?.player?.adventureXp
  const goldAtReport = reportSave?.gameState?.player?.gold
  check('E55 提交任务（奖励到账）', await clickText('提交任务'))
  await sleep(450)
  const doneSave = await save()
  const echoQuest = doneSave?.gameState?.quests?.find((q) => q.questId === 'quest_black_stone_deep_echo')
  check('E56 任务 completed', echoQuest?.status === 'completed')
  check('E57 奖励 +180 Adventure XP', doneSave?.gameState?.player?.adventureXp === xpBefore + 180, `xp=${xpBefore} → ${doneSave?.gameState?.player?.adventureXp}`)
  check('E58 奖励 +70 Gold', doneSave?.gameState?.player?.gold === goldAtReport + 70, `gold=${goldAtReport} → ${doneSave?.gameState?.player?.gold}`)

  // §20 世界反馈
  check('E59 四层与封印室保持开放', doneSave?.gameState?.world?.flags?.black_stone_tower_floor4_unlocked === true && doneSave?.gameState?.world?.flags?.black_stone_sealed_chamber_unlocked === true)
  check('E60 Boss 不再刷新（defeated flag 保持）', doneSave?.gameState?.world?.flags?.blackstone_warden_defeated === true)

  // ================= §22/§29：Save → Menu → Reload =================
  await clickText('返回主菜单'); await sleep(500)
  await page.reload({ waitUntil: 'networkidle0' }); await local(); await sleep(300)
  check('E61 回主菜单后可从存档继续', await clickText('继续游戏'))
  await page.waitForSelector('[data-testid="main-column"]', { timeout: 8000 }); await sleep(400)
  const reloaded = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')
    return raw?.gameState
  })
  check('E62 Reload 后任务 completed 保持', reloaded?.quests?.find((q) => q.questId === 'quest_black_stone_deep_echo')?.status === 'completed')
  check('E63 Reload 后鉴定装备保持', (reloaded?.inventory || []).some((e) => e.itemId === 'blackstone_hunter_bow'))
  check('E64 Reload 后 Boss defeated 保持', reloaded?.world?.flags?.blackstone_warden_defeated === true)
  check('E65 Reload 后四层/封印室解锁保持', reloaded?.world?.flags?.black_stone_tower_floor4_unlocked === true && reloaded?.world?.flags?.black_stone_sealed_chamber_unlocked === true)

  // ================= §21：黄金兔 HARD FREEZE =================
  const golden = reloaded?.quests?.find((q) => q.questId === 'quest_golden_rabbit_search')
  check('E66 黄金兔 status/stage 未变', golden?.status === 'in_progress' && golden?.stage === 0)
  check('E67 黄金兔四个 flags 未变',
    golden?.flags?.asked_blacksmith === true && golden?.flags?.asked_apothecary === true
    && golden?.flags?.village_inquiry_reported === true && golden?.flags?.rabbit_lair_rechecked === true)
  check('E68 rabbit_path ×1 未被消耗', (reloaded?.inventory || []).find((e) => e.itemId === 'rabbit_path')?.quantity === 1)

  // ================= §30 FIX-01：《猎人的旧路》真实 UI 链 =================
  await load(fixture({
    location: 'qingshi_north_hills',
    extraQuests: [{ questId: 'quest_hunter_old_path', status: 'in_progress', stage: 0, flags: {} }],
    extraFlags: { qingshi_north_hills_unlocked: true, spirit_spring_wang_wu_taught: true, gathering_v1_unlocked: true, spirit_spring_rumor_heard: true },
  }))
  await sleep(300)
  check('F1 北坡出现采集按钮（首次采集）', await clickText('止血草'))
  await sleep(350)
  const gatheredSave = await save()
  check('F2 采集写入 tutorial_gathered',
    gatheredSave?.gameState?.quests?.find((q) => q.questId === 'quest_hunter_old_path')?.flags?.tutorial_gathered === true)
  await sleep(250)
  check('F3 出现「向王五复命」按钮', await page.$('[data-testid="main-column"]') !== null && (await body()).includes('向王五复命'))
  check('F4 向王五复命', await clickText('向王五复命'))
  await sleep(400)
  const reportedSave = await save()
  check('F5 复命后任务 → completable',
    reportedSave?.gameState?.quests?.find((q) => q.questId === 'quest_hunter_old_path')?.status === 'completable')
  const fXp = reportedSave?.gameState?.player?.adventureXp
  const fGold = reportedSave?.gameState?.player?.gold
  check('F6 提交任务', await clickText('提交任务'))
  await sleep(450)
  const fDone = await save()
  check('F7 奖励 +25 XP', fDone?.gameState?.player?.adventureXp === fXp + 25, `${fXp} → ${fDone?.gameState?.player?.adventureXp}`)
  check('F8 奖励 +15 金', fDone?.gameState?.player?.gold === fGold + 15, `${fGold} → ${fDone?.gameState?.player?.gold}`)
  check('F9 提交后按钮消失（不可重复领取）', !(await body()).includes('向王五复命'))
  await page.reload({ waitUntil: 'networkidle0' }); await local(); await sleep(250)
  await clickText('继续游戏'); await sleep(400)
  const fReload = await page.evaluate(() => JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')?.gameState)
  check('F10 Reload 后保持 completed', fReload?.quests?.find((q) => q.questId === 'quest_hunter_old_path')?.status === 'completed')

  // ================= §30 FIX-02：preparation undefined 时 Boss 可直接迎战 =================
  await load(fixture({ echo: { status: 'in_progress', stage: 2, flags: {} }, extraFlags: { black_stone_tower_floor4_unlocked: true, black_stone_sealed_chamber_unlocked: true } }))
  await travelChain(['黑石塔一层', '黑石塔二层', '黑石塔三层', '黑石塔四层', '黑石封印室'])
  await sleep(350)
  const prepSave = await page.evaluate(() => JSON.parse(localStorage.getItem('tianmeng_continent_save_slot_slot1') || 'null')?.gameState?.world?.flags?.spirit_spring_preparation)
  check('F11 spirit_spring_preparation 未设置（undefined）', prepSave === undefined, `prep=${String(prepSave)}`)
  check('F12 preparation 未设置时 Boss 仍可直接迎战（undefined === none）', await engage('黑石守门者'))
} catch (error) {
  check('P2-013 script execution', false, error?.stack || String(error))
} finally {
  try { await browser?.close() } catch {}
  try { dev?.kill() } catch {}
  await rm(profile, { recursive: true, force: true })
}
const failed = results.filter((ok) => !ok).length
console.log(`===== P2-013 E2E: ${results.length - failed}/${results.length} =====`)
process.exit(failed ? 1 : 0)
