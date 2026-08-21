// TM-P2-005-R1：完整当前主线 Journey + Golden Rabbit 冻结回归。
// 串行复用 Phase 1/2 正式 UI 路线，并通过隔离 Chrome profile 传递真实存档。
// 不注入状态、不使用开发者控制台，也不修改云端架构。
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = [
  fileURLToPath(new URL('./phase1-playthrough.mjs', import.meta.url)),
  fileURLToPath(new URL('./phase2-e2e.mjs', import.meta.url)),
]
const profile = await mkdtemp(join(tmpdir(), 'tianmeng-p2-005-full-'))
const env = {
  ...process.env,
  BASE_URL: process.env.BASE_URL || 'http://localhost:5199/',
  CHROME_PROFILE: profile,
}

const run = (script) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [script], { env, stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString()
    stdout += text
    process.stdout.write(text)
  })
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString()
    stderr += text
    process.stderr.write(text)
  })
  child.on('error', reject)
  child.on('close', (code) => resolve({ code, stdout, stderr }))
})

let outputs = []
try {
  for (const script of scripts) {
    const output = await run(script)
    outputs.push(output)
    if (output.code !== 0) break
  }
} finally {
  await rm(profile, { recursive: true, force: true })
}

const stdout = outputs.map((output) => output.stdout).join('\n')
const required = [
  // 既有 Golden Rabbit 冻结断言。
  '存档：追寻黄金兔子王 in_progress（冻结）',
  '存档：追寻黄金兔子王 stage 0（冻结）',
  '存档：黄金兔子调查 flags 保持（asked/汇报/复查）',
  'Continue 后黄金兔子王仍进行中',
  'Continue 后兔子的路径 ×1 保持',
  // Phase 2：北门任务、调查、黑鬃魔狼、回马科提交、最终北方边界。
  '《北门失联》可接受（发布者马科）',
  '查看巡逻队留下的痕迹按钮可用',
  '调查后黑鬃魔狼 Lv.3 出现',
  '击败黑鬃魔狼（战斗胜利）',
  '《北门失联》已完成',
  '马科固定剧情（封锁消息继续查）',
  'Continue 后《北门失联》仍 completed',
  'Continue 后胜利剧情仍保留',
]
const missing = required.filter((marker) => !stdout.includes(`PASS | ${marker}`))
for (const marker of required) {
  console.log(`${missing.includes(marker) ? 'FAIL' : 'PASS'} | P2-005-R1: ${marker}`)
}

const totals = outputs.map(({ stdout: text }) => {
  const matches = [...text.matchAll(/===== 结果：(\d+)\/(\d+) 通过 =====/g)]
  return matches.length ? Number(matches.at(-1)[2]) : 0
})
const phase1BaselineKept = totals[0] >= 195
console.log(`${phase1BaselineKept ? 'PASS' : 'FAIL'} | P2-005-R1: 既有 Phase 1 断言不少于 195 项（实际 ${totals[0]}）`)

const childFailure = outputs.length !== scripts.length || outputs.some((output) => output.code !== 0)
if (childFailure || missing.length > 0 || !phase1BaselineKept) {
  console.error(
    `P2-005 full journey failed: childExits=${outputs.map((output) => output.code).join(',') || 'none'}; ` +
    `missing=${missing.join(', ') || 'none'}; phaseTotals=${totals.join(',') || 'none'}`,
  )
  process.exit(1)
}

const total = totals.reduce((sum, value) => sum + value, 0) + required.length + 1
console.log(`===== P2-005 full current story Journey 结果：${total}/${total} 通过 =====`)
