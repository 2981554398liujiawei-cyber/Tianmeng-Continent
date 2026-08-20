// ============================================================================
// 《天梦大陆》TM-P2-003 E2E 验收：技能注册表 / Luck / Loot / 哨塔场景 / 机缘社交
// 运行前提：先运行 phase1-playthrough.mjs + phase2-e2e.mjs（共享 CHROME_PROFILE），
// 存档为「北门失联 completed + 黑鬃魔狼已击败」。
// 运行：CHROME_PROFILE=... node qa/phase3-e2e.mjs（需 dev server 5199）
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
  userDataDir: process.env.CHROME_PROFILE || undefined,
  args: ['--no-sandbox', '--disable-gpu'],
})
const page = await browser.newPage()
await page.setViewport({ width: 1366, height: 768 })

const clickByText = async (text) => {
  await page.evaluate((t) => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes(t))
    if (!btn) throw new Error('未找到按钮: ' + t)
    btn.click()
  }, text)
  // TM-P2-003-R3：持久 profile 下 React 渲染稍慢，点击后留足时序余量
  await sleep(400)
}
const bodyText = () => page.evaluate(() => document.body.textContent)

// TM-P2-002：五槽位保存（slot1；覆盖需二次确认）——验证持久化用
const saveToSlot1 = async () => {
  await clickByText('保存游戏')
  await sleep(300)
  const b = await bodyText()
  if (b.includes('确认覆盖')) {
    await clickByText('确认覆盖')
  } else if (b.includes('覆盖保存')) {
    await clickByText('覆盖保存')
    await sleep(300)
    await clickByText('确认覆盖')
  } else {
    await clickByText('保存到此槽')
  }
  await sleep(300)
}

let body

try {
  // 0. 幂等重置：清掉本卡可选场景 flags（基于 phase2 完成存档；保留北门任务/狼击败状态）
  await page.goto(URL, { waitUntil: 'networkidle0' })
  await sleep(400)
  await page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    if (!raw) return
    const sv = JSON.parse(raw)
    const f = sv.gameState.world.flags
    delete f.north_tower_opened
    delete f.north_tower_mnd_failed
    delete f.north_tower_luck_used
    delete f.north_tower_cache_claimed
    delete f.old_trader_talked
    delete f.old_trader_outcome
    sv.gameState.world.currentLocationId = 'tianlong_martial_hall'
    localStorage.setItem('tianmeng_continent_save_slot_slot1', JSON.stringify(sv))
  })
  await page.reload({ waitUntil: 'networkidle0' })
  await sleep(500)
  body = await bodyText()
  if (!body.includes('继续游戏')) throw new Error('缺少 Phase 1+2 存档，请先串行运行 phase1 + phase2')
  await clickByText('继续游戏')
  await sleep(400)
  body = await bodyText()
  check('P3-1: Continue 后北门失联已完成', body.includes('北门失联') && body.includes('已完成'))

  // 2. 机缘型社交：天龙城旧货商（首次交流自动幸运检定；结果进存档不可反复刷）
  await clickByText('天龙城')
  await sleep(300)
  body = await bodyText()
  check('P3-2: 天龙城显示路边旧货商', body.includes('路边旧货商') && body.includes('上前搭话'))
  // 固定 Math.random：D20=20 → 大成功（+15 金币 + 情报）
  await page.evaluate(() => {
    window.__origRandom = Math.random.bind(Math)
    Math.random = () => 0.99
  })
  const goldBeforeTrader = await page.evaluate(() => {
    const m = document.body.textContent.match(/金币\s*(\d+)/)
    return m ? Number(m[1]) : null
  })
  await clickByText('上前搭话')
  await sleep(300)
  body = await bodyText()
  check('P3-2: 幸运检定可见（D20 + 幸运修正 = 总值 / DC / 幸运检定）', body.includes('幸运修正') && body.includes('DC') && body.includes('幸运检定：大成功'))
  check('P3-2: 大成功叙事（有缘 + 铜钱）', body.includes('咱爷俩有缘') && body.includes('他摸出几枚铜钱塞进你手里'))
  const goldAfterTrader = await page.evaluate(() => {
    const m = document.body.textContent.match(/金币\s*(\d+)/)
    return m ? Number(m[1]) : null
  })
  check('P3-2: 大成功小礼物金币 +15', goldAfterTrader !== null && goldBeforeTrader !== null && goldAfterTrader === goldBeforeTrader + 15, `gold ${goldBeforeTrader}→${goldAfterTrader}`)
  // 不可反复刷：搭话结果进存档（手动保存）→ 主菜单 → Continue（模拟刷新）→ 不可重刷
  await page.evaluate(() => {
    Math.random = window.__origRandom
  })
  await saveToSlot1()
  await sleep(300)
  await clickByText('返回主菜单')
  await sleep(300)
  await clickByText('继续游戏')
  await sleep(400)
  // Continue 后存档位置 = 天龙城（保存时所在），无需再点「天龙城」（会误匹配「天龙城北门」按钮）
  body = await bodyText()
  check('P3-2: 交谈后不可反复刷（无上前搭话按钮）', body.includes('路边旧货商') && !body.includes('上前搭话'))
  check('P3-2: 交谈后固定叙事保持（有缘）', body.includes('咱爷俩有缘'))

  // 3. 北门旧哨塔：技能 Tag 路线 + MND 失败 → 命运补救 → 宝箱
  await clickByText('天龙城北门')
  await sleep(300)
  body = await bodyText()
  check('P3-3: 北门显示旧哨塔补给匣（狼击败后）', body.includes('北门旧哨塔的巡逻补给匣'))
  check('P3-3: 技能路线按钮来自 Registry（骑士重击（2 灵力））', body.includes('骑士重击（2 灵力）'))
  check('P3-3: MND 检定路线存在', body.includes('[MND 检定] 寻找备用机关'))
  // MND 检定失败（D20=2）→ 触发命运补救
  await page.evaluate(() => {
    Math.random = () => 0.05 // D20=2 → 失败
  })
  await clickByText('[MND 检定] 寻找备用机关')
  await sleep(300)
  body = await bodyText()
  check('P3-3: MND 检定失败叙事', body.includes('没能找到任何机关'))
  check('P3-3: MND 检定日志可见（D20 + 冥想修正 = 总值 / DC / 检定）', body.includes('冥想修正') && body.includes('DC') && body.includes('检定：失败'))
  check('P3-3: 命运补救入口出现', body.includes('命运似乎还没有放弃你') && body.includes('[幸运检定] 寻求一线转机'))
  // 幸运补救成功（D20=20）
  await page.evaluate(() => {
    Math.random = () => 0.99
  })
  await clickByText('[幸运检定] 寻求一线转机')
  await sleep(300)
  body = await bodyText()
  check('P3-3: 命运补救成功叙事（新巧合：松动石片/旧拉索/备用锁舌）', body.includes('松动石片') && body.includes('旧拉索') && body.includes('备用锁舌'))
  check('P3-3: 幸运检定日志可见', body.includes('幸运检定：大成功'))
  // 打开补给匣（宝箱：基础必给 + Luck 大成功追加精制铁剑）
  const invBeforeCache = await page.evaluate(() => document.body.textContent.includes('精制铁剑'))
  await page.evaluate(() => {
    Math.random = () => 0.99 // 大成功
  })
  const goldBeforeCache = await page.evaluate(() => {
    const m = document.body.textContent.match(/金币\s*(\d+)/)
    return m ? Number(m[1]) : null
  })
  await clickByText('打开补给匣')
  await sleep(300)
  body = await bodyText()
  check('P3-3: 宝箱基础奖励（治疗药水 ×1）', body.includes('治疗药水 ×1'))
  check('P3-3: 宝箱 Luck 大成功精制铁剑', body.includes('精制铁剑 ×1'))
  const goldAfterCache = await page.evaluate(() => {
    const m = document.body.textContent.match(/金币\s*(\d+)/)
    return m ? Number(m[1]) : null
  })
  check('P3-3: 宝箱金币 +50（基础 20 + Luck 成功 30）', goldAfterCache !== null && goldBeforeCache !== null && goldAfterCache === goldBeforeCache + 50, `gold ${goldBeforeCache}→${goldAfterCache}`)
  check('P3-3: 宝箱幸运检定日志可见', body.includes('幸运检定：大成功'))
  // 一次性：已领取 → 无"打开补给匣"按钮
  check('P3-3: 宝箱一次性（无打开按钮）', !body.includes('打开补给匣'))

  // 4. 黑鬃魔狼掉落（phase2 狼战已结算）：背包含黑鬃狼牙 / 黑鬃狼皮
  body = await bodyText()
  check('P3-4: 背包含黑鬃狼牙（基础掉落，Luck 无关）', body.includes('黑鬃狼牙'))
  check('P3-4: 背包含黑鬃狼皮（Luck 大成功追加，uncommon）', body.includes('黑鬃狼皮'))
  check('P3-4: 剧情必掉断裂铜牌未进掉落表（无铜牌物品堆叠重复）', !body.includes('断裂骑士团铜牌'))

  // 5. 黄金兔长期线完全冻结
  const goldenState = await page.evaluate(() => {
    const raw = localStorage.getItem('tianmeng_continent_save_slot_slot1')
    if (!raw) return null
    const gs = JSON.parse(raw).gameState
    const q = gs.quests.find((x) => x.questId === 'quest_golden_rabbit_search')
    return {
      status: q?.status,
      stage: q?.stage,
      flags: q?.flags,
      hasPath: gs.inventory.some((e) => e.itemId === 'rabbit_path' && e.quantity === 1),
    }
  })
  check('P3-5: 黄金兔 in_progress/stage 0 冻结', goldenState?.status === 'in_progress' && goldenState?.stage === 0)
  check(
    'P3-5: 黄金兔四 flags 冻结',
    goldenState?.flags?.asked_blacksmith === true &&
      goldenState?.flags?.asked_apothecary === true &&
      goldenState?.flags?.village_inquiry_reported === true &&
      goldenState?.flags?.rabbit_lair_rechecked === true,
  )
  check('P3-5: rabbit_path ×1 保持', goldenState?.hasPath === true)

  // 6. Save/Continue 保持（哨塔/宝箱/旧货商状态进存档）
  await saveToSlot1()
  await sleep(300)
  await clickByText('返回主菜单')
  await sleep(300)
  await clickByText('继续游戏')
  await sleep(400)
  // Continue 后存档位置 = 北门（P3-3 操作所在），直接检查哨塔状态
  body = await bodyText()
  check('P3-6: Continue 后哨塔已领取叙事保持', body.includes('补给匣已经打开'))
  check('P3-6: Continue 后无重复领取入口', !body.includes('打开补给匣'))
} catch (err) {
  check('脚本执行无异常', false, err && err.message ? err.message : String(err))
} finally {
  await browser.close()
}

const failed = results.filter((r) => !r.ok)
console.log(`\n===== 结果：${results.length - failed.length}/${results.length} 通过 =====`)
process.exit(failed.length > 0 ? 1 : 0)
