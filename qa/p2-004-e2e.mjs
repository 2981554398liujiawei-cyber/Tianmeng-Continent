// ============================================================================
// 《天梦大陆》TM-P2-004 focused E2E：樱花优子完整纵切片
// （反季樱雨 → 神域 → 初见 → 职业对话 → MND 检定 → 临时合作 → 残灾战斗 → 契约 → 伙伴/红颜录 → 交谈 → 赠礼 → 首次休整 → 存档刷新保持）
// 运行前提：dev server 已在 5199 端口运行
// 运行：node qa/p2-004-e2e.mjs
// 环境变量：CHROME_PATH（默认系统 Chrome）、BASE_URL（默认 http://localhost:5199/）
// 不依赖真实概率：Math.random 分步固定（0.2 → 低伤不击杀进入伙伴阶段；0.99 → D20=20 检定成功 / 樱花飞斩暴击击杀）。
// 存档通过合法 localStorage fixture 注入（SLOT_FORMAT_VERSION=4；北门失联 completed → 触发条件 fallback）。
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
  await sleep(400)
}

const bodyText = () => page.evaluate(() => document.body.textContent)

const setRandom = (v) =>
  page.evaluate((x) => {
    Math.random = () => x
  }, v)

/** 注入 slot1 存档（V4 合法 fixture）并刷新 → 主菜单出现「继续游戏」 */
const injectSaveAndContinue = async (gameState) => {
  const slot = {
    version: 4,
    savedAt: new Date().toISOString(),
    gameState,
  }
  await page.evaluate((data) => {
    localStorage.clear()
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(data))
  }, slot)
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  const body = await bodyText()
  if (!body.includes('继续游戏')) throw new Error('注入存档后未出现继续游戏入口')
  await clickByText('继续游戏')
  await sleep(500)
}

/** 读取好感/信任数值（红颜录文本「阶段：相识 · 好感 12/100 · 信任 14/100」） */
const readAffection = async () => {
  const m = (await bodyText()).match(/好感\s*(\d+)\/100/)
  return m ? Number(m[1]) : null
}
const readTrust = async () => {
  const m = (await bodyText()).match(/信任\s*(\d+)\/100/)
  return m ? Number(m[1]) : null
}

const readLocationId = () =>
  page.evaluate(() => {
    const label = [...document.querySelectorAll('p')].find((el) => el.textContent.trim() === '当前位置')
    if (!label) return null
    const section = label.closest('section')
    if (!section) return null
    const idEl = [...section.querySelectorAll('p')].find((el) => /^[a-z0-9_]+$/.test(el.textContent.trim()))
    return idEl ? idEl.textContent.trim() : null
  })

/** 基础合法角色：骑士 Lv.4（hp 不满 → 休整按钮可用）；北门失联 completed（Sakura 触发条件 fallback） */
function sakuraFixtureState() {
  return {
    player: {
      id: 'player-hero',
      name: 'P2004测试骑士',
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
    inventory: [
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'healing_potion', quantity: 2 },
    ],
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

// 五槽位清理辅助（刷新保持阶段使用）
const SAVE_KEYS = [
  'tianmeng_continent_save',
  'tianmeng_continent_saves_index',
  'tianmeng_continent_save_slot_slot1',
]
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
  // ================= 注入 V4 fixture → Continue → 天龙城 =================
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(400)
  await injectSaveAndContinue(sakuraFixtureState())
  let body = await bodyText()
  check('P2-004-1: Continue 后到达天龙城（tianlong_city）', (await readLocationId()) === 'tianlong_city')
  check('P2-004-2: 反季樱雨入口出现（触发条件满足）', body.includes('反季樱雨') && body.includes('查看异象'))

  // ================= 樱雨 → 神域 =================
  await clickByText('查看异象')
  body = await bodyText()
  check('P2-004-3: 樱雨场景展开（踏入裂隙入口）', body.includes('踏入裂隙') && body.includes('不合时节的樱花漫天飘落'))
  check('P2-004-4: 《落樱越界》进入冒险日志（进行中）', body.includes('落樱越界') && body.includes('进行中'))
  await clickByText('踏入裂隙')
  body = await bodyText()
  check('P2-004-5: 进入樱华神域·破碎边界（sakura_domain_fragment）', (await readLocationId()) === 'sakura_domain_fragment' && body.includes('樱华神域'))

  // ================= 初见（help） =================
  await clickByText('你伤得很重。我先帮你。')
  body = await bodyText()
  check('P2-004-6: 初见后关系变化短提示（好感 +2 信任 +3）', body.includes('樱花优子 好感 +2') && body.includes('信任 +3'))
  check('P2-004-7: 初见后她出现在红颜录（已相识）', body.includes('红颜录') && body.includes('樱花优子') && body.includes('相识'))

  // ================= 职业对话（骑士） =================
  await clickByText('若需要契约，我可以先立誓：你的意志不会属于我。')
  body = await bodyText()
  check('P2-004-8: 职业对话后骑士专属回应 + 关系变化', body.includes('骑士的誓言') && body.includes('信任 +3'))

  // ================= MND 检定（固定 0.99 → D20=20 成功） =================
  setRandom(0.99)
  await clickByText('凝神观察（精神）')
  body = await bodyText()
  check('P2-004-9: MND 检定成功（DC 12 展示）', body.includes('你看清了') && body.includes('DC 12'))
  check('P2-004-10: MND 成功后不再出现 LUCK 补救入口', !body.includes('留意落樱（幸运）'))

  // ================= 临时合作（guest） =================
  await clickByText('与她并肩作战')
  body = await bodyText()
  check('P2-004-11: 临时同行（神域崩塌前兆 + 并肩而立）', body.includes('神域崩塌前兆') && body.includes('与你并肩而立'))
  check('P2-004-12: 残灾之影威胁出现（可迎战）', body.includes('残灾之影') && body.includes('迎战'))

  // ================= 残灾战斗（玩家低伤 → 伙伴阶段 → 樱花飞斩暴击击杀） =================
  setRandom(0.2) // 玩家低伤（roll 4-5）：命中但不击杀 → 进入伙伴阶段
  await clickByText('迎战')
  await sleep(300)
  body = await bodyText()
  check('P2-004-13: 进入残灾战斗（残灾之影 Lv.3）', body.includes('残灾之影') && body.includes('Lv.3'))
  check('P2-004-14: 战斗页出现樱花优子伙伴面板（临时同行）', body.includes('樱花优子') && body.includes('临时同行') && body.includes('灵力'))
  await clickByText('普通攻击')
  await sleep(500)
  body = await bodyText()
  check('P2-004-15: 玩家行动后进入「樱花优子的行动」阶段', body.includes('樱花优子的行动'))
  check('P2-004-16: 伙伴技能按钮真实出现（樱花飞斩/魔法盾/轻舞）', body.includes('樱花飞斩') && body.includes('樱花魔法盾') && body.includes('樱花轻舞'))
  check('P2-004-17: 伙伴面板展示封印技能（未恢复）', body.includes('封印') && body.includes('樱花天神舞'))
  setRandom(0.99) // 樱花飞斩 D20=20 → 暴击击杀
  await clickByText('樱花飞斩')
  await sleep(500)
  body = await bodyText()
  check('P2-004-18: 樱花优子的攻击实际造成伤害（战斗日志）', body.includes('樱花优子的攻击'))
  check('P2-004-19: 战斗胜利（残灾被击破）', body.includes('战斗胜利'), body.includes('战斗失败') ? '战斗失败！' : '')
  await clickByText('返回冒险')
  await sleep(500)

  // ================= 神域崩塌 → 契约 =================
  body = await bodyText()
  check('P2-004-20: 神域崩塌剧情（她主动提出寄灵神契）', body.includes('神域崩塌') && body.includes('寄灵神契') && body.includes('这不是奴役，也不是收服'))
  await clickByText('可以，但契约必须由你自己决定。')
  body = await bodyText()
  check('P2-004-21: 神契已缔结（正式成为神契宠物）', body.includes('神契已缔结'))
  check('P2-004-22: 《落樱越界》已完成', body.includes('落樱越界') && body.includes('已完成'))
  check('P2-004-23: 回天龙城（sakura_domain_fragment 已离场）', (await readLocationId()) === 'tianlong_city')

  // ================= 伙伴面板 / 红颜录 / banter =================
  body = await bodyText()
  check('P2-004-24: 同行伙伴面板（神契宠物 · Lv.4）', body.includes('同行伙伴') && body.includes('樱花优子') && body.includes('神契宠物') && body.includes('Lv.4'))
  check('P2-004-25: 红颜录显示阶段/好感/信任/同行中', body.includes('红颜录') && body.includes('好感') && body.includes('信任') && body.includes('同行中'))
  check('P2-004-26: 天龙城同行 banter 出现（第一次见市井）', body.includes('这里的灵脉比神域混乱得多'))
  await clickByText('你也会慢慢喜欢这里。')
  body = await bodyText()
  check('P2-004-27: banter 后好感 +1（关系短提示）', body.includes('好感 +1'))
  check('P2-004-28: banter 一次性（不再出现）', !body.includes('这里的灵脉比神域混乱得多'))

  // ================= 常驻交谈（每休整周期前 2 次） =================
  const affBeforeTalk = await readAffection()
  await clickByText('聊一聊天梦大陆')
  await sleep(300)
  await clickByText('询问她的伤势')
  await sleep(300)
  body = await bodyText()
  const affAfterTalk = await readAffection()
  check('P2-004-29: 前 2 次交谈好感 +1/+2（MND 成功伤口话题 +2）', affAfterTalk === affBeforeTalk + 3, `before=${affBeforeTalk} after=${affAfterTalk}`)
  await clickByText('询问她的过去')
  await sleep(300)
  body = await bodyText()
  const affAfterThird = await readAffection()
  check('P2-004-30: 第 3 次交谈周期限制（不刷分）', affAfterThird === affAfterTalk && body.includes('本休整周期内已没有更多收获'), `after3=${affAfterThird}`)

  // ================= 赠礼（桂花糕 liked +2） =================
  body = await bodyText()
  check('P2-004-31: 天龙城桂花糕铺可购买（8 金币）', body.includes('桂花糕铺') && body.includes('桂花糕'))
  await clickByText('购买')
  await sleep(300)
  await clickByText('购买') // 买 2 个：1 个赠礼消耗，1 个留给刷新保持检查
  await sleep(300)
  body = await bodyText()
  const affBeforeGift = await readAffection()
  check('P2-004-32: 红颜录出现桂花糕赠礼按钮（买 2 个 → ×2）', body.includes('桂花糕 ×2'))
  await clickByText('桂花糕 ×')
  await sleep(300)
  body = await bodyText()
  check('P2-004-33: 赠礼成功（好感 +2）', body.includes('赠礼：') && body.includes('天龙桂花糕') && body.includes('好感 +2'))
  check('P2-004-34: 好感数值实际 +2', (await readAffection()) === affBeforeGift + 2, `before=${affBeforeGift}`)

  // ================= 首次休整（武馆 Long Rest → 第一夜谈话） =================
  await clickByText('武馆')
  await sleep(400)
  body = await bodyText()
  check('P2-004-35: 到达武馆（tianlong_martial_hall）可休整', (await readLocationId()) === 'tianlong_martial_hall' && body.includes('武馆休整'))
  await clickByText('休整')
  await sleep(400)
  body = await bodyText()
  check('P2-004-36: Long Rest 后首次休整谈话就绪（第一夜）', body.includes('第一夜：神与凡人的距离'))
  const trustBeforeRest = await readTrust()
  await clickByText('神契只是让你留在这里，不代表你属于我。')
  await sleep(300)
  body = await bodyText()
  check('P2-004-37: 第一夜 respect 回应 + 关系变化（信任 +4 好感 +2）', body.includes('比任何契约都重') && body.includes('信任 +4') && body.includes('好感 +2'))
  check('P2-004-38: 信任数值实际 +4', (await readTrust()) === trustBeforeRest + 4, `before=${trustBeforeRest}`)

  // ================= 存档刷新保持（V4 持久化） =================
  await saveToSlot1()
  await sleep(300)
  await page.evaluate(() => {
    Math.random = () => 0.5
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  await clickByText('继续游戏')
  await sleep(500)
  body = await bodyText()
  check('P2-004-39: 刷新后 Continue → 剧情状态保持（神契宠物同行）', body.includes('同行伙伴') && body.includes('神契宠物') && body.includes('Lv.4'))
  check('P2-004-40: 刷新后红颜录好感/信任保持（>5）', (await readAffection()) > 5 && (await readTrust()) > 5)
  check('P2-004-41: 刷新后不重复初见/不重复契约（无神域入口）', !body.includes('踏入裂隙') && !body.includes('神域崩塌'))
  // 赠礼周期已恢复：再次赠礼成功（新休整周期）
  body = await bodyText()
  check('P2-004-42: 刷新后桂花糕仍在背包（可再赠）', body.includes('桂花糕 ×1'))

  check('P2-004-43: 全程无 JS exception', jsErrors.length === 0, jsErrors.length > 0 ? jsErrors.join(' | ') : '')
} catch (err) {
  check('P2-004: 脚本执行无异常', false, String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok).length
console.log(`===== P2-004 focused 结果：${results.length - failed}/${results.length} 通过 =====`)
if (failed > 0) process.exit(1)
