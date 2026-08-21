// ============================================================================
// 《天梦大陆》TM-P2-004-R1 focused E2E：伙伴技能真实执行（B1-B4）
//   B1 魔法盾即时减伤：施盾后敌人立即命中 → 真实吸收 + DOM 日志（stale state 修复验证）
//   B2 魔法盾 MISS 持续：敌人 miss 不消耗盾（HP 不变、盾仍展开）→ 下一轮命中才消耗
//   B3 樱花轻舞：本轮敌人不反击（HP 不变、可进入下一玩家行动）
//   B4 樱花飞斩：保留真实攻击/暴击击杀
// 运行前提：dev server 已在 5199 端口运行
// 运行：node qa/p2-004-r1-e2e.mjs
// 环境变量：CHROME_PATH（默认系统 Chrome）、BASE_URL（默认 http://localhost:5199/）
// 随机数分步固定：0.4 → 玩家 D20=8 命中不足（miss，进入伙伴阶段）；0.05 → 敌人反击 D20=1 miss；
//              0.99 → D20=20（检定成功 / 敌人反击命中 / 樱花飞斩暴击）
// 第一场战斗（盾 miss 保留 + 轻舞）不击杀 → 刷新退出 → 第二场战斗（盾即时吸收 + 飞斩击杀）
// ============================================================================
import puppeteer from 'puppeteer-core'

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const URL = process.env.BASE_URL || 'http://localhost:5199/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
function check(name, ok, extra = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768 })

const jsErrors = []
page.on('pageerror', (err) => jsErrors.push(String(err)))

const clickByText = async (text) => {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('未找到按钮: ' + t)
    btn.click()
  }, text)
  await sleep(450)
}

const bodyText = () => page.evaluate(() => document.body.textContent)

/** TM-P2-005：云口令页出现「仅本机模式」时点击进入（未配置云端端点的降级入口） */
const enterLocalModeIfNeeded = async () => {
  try {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('仅本机模式'))
      if (btn) { btn.click(); return true }
      return false
    })
    if (clicked) await sleep(500)
    return clicked
  } catch { return false }
}

const setRandom = (v) =>
  page.evaluate((x) => {
    Math.random = () => x
  }, v)

/** 玩家当前生命（战斗页「生命 X / Y」） */
const readPlayerHp = async () => {
  const m = (await bodyText()).match(/生命\s*(\d+)\s*\/\s*(\d+)/)
  return m ? { hp: Number(m[1]), max: Number(m[2]) } : null
}

/** 樱花优子灵力（战斗页伙伴面板「灵力 X / Y」——取最后一个匹配，玩家面板在前） */
const readSakuraMp = async () => {
  const matches = (await bodyText()).match(/灵力\s*(\d+)\s*\/\s*(\d+)/g)
  if (!matches || matches.length === 0) return null
  const last = matches[matches.length - 1]
  const m = last.match(/(\d+)\s*\/\s*(\d+)/)
  return m ? Number(m[1]) : null
}

const readLocationId = () =>
  page.evaluate(() => document.querySelector('[data-current-location-id]')?.getAttribute('data-current-location-id') || null)

/** 基础合法角色：骑士 Lv.4（hp 不满）；北门失联 completed（Sakura 触发条件 fallback） */
function sakuraFixtureState() {
  return {
    player: {
      id: 'player-hero',
      name: 'P2004R1测试骑士',
      gender: 'male',
      level: 4,
      profession: 'knight',
      attributes: { str: 14, con: 12, agi: 10, mnd: 8, lck: 10 },
      hp: 23,
      maxHp: 26,
      mp: 8,
      maxMp: 9,
      gold: 100,
      learnedSkillIds: ['knight_power_strike'],
    },
    inventory: [{ itemId: 'iron_sword', quantity: 1 }],
    equipment: { weapon: 'iron_sword', armor: null, accessory: null },
    quests: [
      {
        questId: 'quest_north_gate_missing_patrol',
        status: 'completed',
        stage: 0,
        flags: {},
      },
    ],
    world: { currentLocationId: 'tianlong_city', flags: {}, completedEvents: [], npcStates: {}, restCount: 0 },
    companions: {},
    relationships: {},
    party: { activeCompanionIds: [] },
  }
}

/** 注入 slot1 存档并 Continue */
const injectSaveAndContinue = async (gameState) => {
  const slot = { version: 4, savedAt: new Date().toISOString(), gameState }
  await page.evaluate((data) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(data))
  }, slot)
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  await enterLocalModeIfNeeded()
  const body = await bodyText()
  if (!body.includes('继续游戏')) throw new Error('注入存档后未出现继续游戏入口')
  await clickByText('继续游戏')
  await sleep(500)
}

/** GamePage 保存到 slot1（处理覆盖确认弹窗） */
const saveToSlot1 = async () => {
  await clickByText('保存游戏')
  await sleep(300)
  const body = await bodyText()
  if (body.includes('确认覆盖')) {
    await clickByText('确认覆盖')
  } else if (body.includes('覆盖保存')) {
    await clickByText('覆盖保存')
    await sleep(300)
    await clickByText('确认覆盖')
  } else {
    await clickByText('保存到此槽')
  }
  await sleep(300)
}

try {
  // ================= 走到 guest（樱雨 → 神域 → 初见 → 职业 → MND → 并肩） =================
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(400)
  await enterLocalModeIfNeeded()
  await injectSaveAndContinue(sakuraFixtureState())
  let body = await bodyText()
  check('R1-01: Continue 后到达天龙城且樱雨入口出现', (await readLocationId()) === 'tianlong_city' && body.includes('查看异象'))
  await clickByText('查看异象')
  await clickByText('踏入裂隙')
  await clickByText('你伤得很重。我先帮你。')
  await clickByText('若需要契约，我可以先立誓：你的意志不会属于我。')
  setRandom(0.99)
  await clickByText('凝神观察（精神）')
  await clickByText('与她并肩作战')
  body = await bodyText()
  check('R1-02: 临时同行（神域崩塌前兆 + 残灾威胁）', body.includes('神域崩塌前兆') && body.includes('残灾之影') && body.includes('迎战'))
  // 在神域保存一次：刷新退出第一场战斗后 Continue 才能回到神域继续迎战（残灾威胁可见性 = guest + 未击败 + 神域）
  await saveToSlot1()
  const savedLoc = await page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    if (!raw) return null
    try {
      return JSON.parse(raw).gameState.world.currentLocationId
    } catch {
      return null
    }
  })
  check('R1-02b: 神域状态已保存（存档位置 = sakura_domain_fragment）', savedLoc === 'sakura_domain_fragment', `loc=${savedLoc}`)

  // ================= 第一场战斗：B2 盾 MISS 持续 + B3 轻舞 =================
  setRandom(0.4) // 玩家 D20=8 → miss → 进入伙伴阶段
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('R1-03: 进入残灾战斗（Lv.3 + 樱花优子伙伴面板）', body.includes('残灾之影') && body.includes('Lv.3') && body.includes('樱花优子'))
  const hp0 = await readPlayerHp()
  await clickByText('普通攻击')
  await sleep(500)
  body = await bodyText()
  check('R1-04: 玩家行动后进入「樱花优子的行动」阶段', body.includes('樱花优子的行动'))
  check('R1-05: 三个伙伴技能按钮真实出现', body.includes('樱花飞斩') && body.includes('樱花魔法盾') && body.includes('樱花轻舞'))

  // ---- B2a：施盾后敌人反击 MISS（D20=1）→ 盾不消耗、保持展开 ----
  setRandom(0) // 敌人反击 D20=1 → critical_miss（V3 唯一真正的 miss）
  await clickByText('樱花魔法盾')
  await sleep(500)
  body = await bodyText()
  const hpAfterShieldMiss = await readPlayerHp()
  check('R1-06: B2a 敌人反击 miss → 玩家 HP 不变', hpAfterShieldMiss.hp === hp0.hp, `before=${hp0.hp} after=${hpAfterShieldMiss.hp}`)
  check('R1-07: B2a 盾未消耗仍展开（可抵消 3 点伤害）', body.includes('樱花魔法盾已展开（可抵消 3 点伤害）'))
  check('R1-08: B2a 无抵消日志（miss 不吸收）', !body.includes('樱花魔法盾抵消了'))

  // ---- B2b：下一轮敌人反击暴击命中（D20=20 → 原始伤害 4）→ 盾抵消 3、HP -1、盾消失 ----
  setRandom(0.4)
  await clickByText('普通攻击')
  await sleep(500)
  body = await bodyText()
  check('R1-09: B2b 盾保留期间伙伴阶段盾按钮显示「盾已展开」', body.includes('盾已展开'))
  setRandom(0.99) // 敌人反击 D20=20 → 暴击，V3 最终伤害 = ceil(3×2×20/(11+20)) = 4
  await clickByText('跳过')
  await sleep(500)
  body = await bodyText()
  const hpAfterShieldAbsorb = await readPlayerHp()
  check('R1-10: B2b 敌人命中 → 盾抵消 3 点伤害（日志）', body.includes('樱花魔法盾抵消了 3 点伤害'))
  // TM-P2-006 数值平衡：残灾之影 attackPower 3→14（Combat V3 公式冻结不动）。不再硬编码 raw=4，
  // 改为相对断言：日志中的造成伤害（已含盾减伤）必须恰好等于实际 HP 变化（盾确实吸收 3 点）。
  const absorbedDealt = Number((body.match(/残灾之影的攻击命中，造成 (\d+) 点伤害/) ?? [])[1] ?? -1)
  check('R1-11: B2b 盾减伤后 HP 变化 = 日志伤害（盾吸收 3 点已计入）', hpAfterShieldAbsorb.hp === hp0.hp - absorbedDealt && absorbedDealt >= 0, `before=${hp0.hp} after=${hpAfterShieldAbsorb.hp} logDealt=${absorbedDealt}`)
  check('R1-12: B2b 盾被消耗（已展开提示消失）', !body.includes('樱花魔法盾已展开'))
  check('R1-13: 盾施放只扣一次 MP（灵力 6→4）', (await readSakuraMp()) === 4, `mp=${await readSakuraMp()}`)

  // ---- B3：樱花轻舞 → 本轮敌人不反击 ----
  setRandom(0.4)
  await clickByText('普通攻击')
  await sleep(500)
  await clickByText('樱花轻舞')
  await sleep(500)
  body = await bodyText()
  const hpAfterDance = await readPlayerHp()
  check('R1-14: B3 轻舞日志（敌人找不到反击机会）', body.includes('敌人的攻势被牵走，没有找到反击的机会'))
  check('R1-15: B3 本轮敌人未反击（玩家 HP 不变）', hpAfterDance.hp === hpAfterShieldAbsorb.hp, `before=${hpAfterShieldAbsorb.hp} after=${hpAfterDance.hp}`)
  // 轻舞只取消本轮：下一玩家行动 → 跳过 → 敌人反击恢复正常（无盾无轻舞，HP -4）
  setRandom(0.4)
  await clickByText('普通攻击')
  await sleep(500)
  body = await bodyText()
  check('R1-16: B3 轻舞后可进入下一玩家行动', body.includes('樱花优子的行动'))
  setRandom(0.99)
  await clickByText('跳过')
  await sleep(500)
  body = await bodyText()
  const hpAfterCounterBack = await readPlayerHp()
  // TM-P2-006 数值平衡：残灾攻击 3→14，暴击反击在无盾下会重创甚至击杀玩家。不再硬编码 -4，
  // 断言「下一轮反击恢复（HP 必然下降）」即可验证轻舞只取消本轮的语义。
  check('R1-17: 轻舞只取消本轮（下一轮反击恢复，HP 下降）', hpAfterCounterBack.hp < hpAfterShieldAbsorb.hp, `before=${hpAfterShieldAbsorb.hp} after=${hpAfterCounterBack.hp}`)

  // ================= 刷新退出第一场战斗 → 神域残灾威胁仍在 =================
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  await enterLocalModeIfNeeded()
  await clickByText('继续游戏')
  await sleep(500)
  body = await bodyText()
  check('R1-18: 刷新后仍在神域且残灾威胁可再迎战（未击败）', (await readLocationId()) === 'sakura_domain_fragment' && body.includes('迎战'))

  // ================= 第二场战斗：B1 盾即时吸收 + B4 飞斩击杀 =================
  setRandom(0.4)
  await clickByText('迎战')
  await sleep(300)
  const hp1 = await readPlayerHp()
  check('R1-19: 第二场战斗玩家 HP 恢复存档值（23/26）', hp1.hp === 23, `hp=${hp1.hp}`)
  await clickByText('普通攻击')
  await sleep(500)
  // ---- B1：施盾 → 敌人立即暴击命中 → 即时吸收（stale state 修复核心验证） ----
  setRandom(0.99) // 敌人反击 D20=20 → 暴击，V3 最终伤害 4 → 盾吸收 3 → HP -1
  await clickByText('樱花魔法盾')
  await sleep(500)
  body = await bodyText()
  const hpAfterImmediateAbsorb = await readPlayerHp()
  check('R1-20: B1 施盾后敌人立即命中 → 抵消 3 点伤害（DOM 日志）', body.includes('樱花魔法盾抵消了 3 点伤害'))
  // TM-P2-006 数值平衡：与 R1-11 相同，改为相对断言（日志伤害已含盾减伤 == 实际 HP 变化）
  const immediateDealt = Number((body.match(/残灾之影的攻击命中，造成 (\d+) 点伤害/) ?? [])[1] ?? -1)
  check('R1-21: B1 即时吸收生效（HP 变化 = 日志伤害，盾吸收 3 点）', hpAfterImmediateAbsorb.hp === hp1.hp - immediateDealt && immediateDealt >= 0, `before=${hp1.hp} after=${hpAfterImmediateAbsorb.hp} logDealt=${immediateDealt}`)
  check('R1-22: B1 盾已消耗（已展开提示消失）', !body.includes('樱花魔法盾已展开'))
  // ---- B4：樱花飞斩暴击击杀（保留真实攻击/击杀） ----
  setRandom(0.4)
  await clickByText('普通攻击')
  await sleep(500)
  setRandom(0.99) // 飞斩 D20=20 → 暴击击杀
  await clickByText('樱花飞斩')
  await sleep(500)
  body = await bodyText()
  check('R1-23: B4 樱花优子的攻击实际结算（战斗日志）', body.includes('樱花飞斩') && (body.includes('造成') || body.includes('落空')))
  check('R1-24: B4 飞斩暴击击杀 → 战斗胜利', body.includes('战斗胜利'), body.includes('战斗失败') ? '战斗失败！' : '')
  await clickByText('返回冒险')
  await sleep(500)

  // ================= 收尾：神域崩塌 → 契约（保持主线完整） =================
  body = await bodyText()
  check('R1-25: 神域崩塌 → 寄灵神契（她自主提出）', body.includes('神域崩塌') && body.includes('寄灵神契') && body.includes('这不是奴役，也不是收服'))
  await clickByText('可以，但契约必须由你自己决定。')
  await sleep(500)
  body = await bodyText()
  check('R1-26: 神契已缔结 → 回天龙城（伙伴面板 + 红颜录）', body.includes('神契已缔结') && (await readLocationId()) === 'tianlong_city' && body.includes('同行伙伴') && body.includes('神契宠物'))

  check('R1-27: 全程无 JS exception', jsErrors.length === 0, jsErrors.length > 0 ? jsErrors.join(' | ') : '')
} catch (err) {
  check('R1: 脚本执行无异常', false, String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== P2-004-R1 focused 结果：${results.length - failed}/${results.length} 通过 =====`)
if (failed > 0) process.exit(1)
