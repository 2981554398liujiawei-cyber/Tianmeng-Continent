// TM-P2-005-R1：完整当前主线 Journey + Golden Rabbit 冻结回归。
// 复用既有正式 UI 全路线脚本；本入口将其纳入 P2-005/RC，并独立锁定冻结断言。
// 不注入状态、不使用开发者控制台，也不修改云端架构。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = fileURLToPath(new URL('./phase1-playthrough.mjs', import.meta.url))
const env = { ...process.env, BASE_URL: process.env.BASE_URL || 'http://localhost:5199/' }

const output = await new Promise((resolve, reject) => {
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

const required = [
  '存档：追寻黄金兔子王 in_progress（冻结）',
  '存档：追寻黄金兔子王 stage 0（冻结）',
  '存档：黄金兔子调查 flags 保持（asked/汇报/复查）',
  'Continue 后黄金兔子王仍进行中',
  'Continue 后兔子的路径 ×1 保持',
]
const missing = required.filter((marker) => !output.stdout.includes(`PASS | ${marker}`))
for (const marker of required) {
  console.log(`${missing.includes(marker) ? 'FAIL' : 'PASS'} | P2-005-R1: ${marker}`)
}

if (output.code !== 0 || missing.length > 0) {
  console.error(`P2-005 full journey failed: childExit=${output.code}; missing=${missing.join(', ') || 'none'}`)
  process.exit(1)
}
console.log(`===== P2-005 full journey 结果：${required.length}/${required.length} 冻结断言通过 =====`)
