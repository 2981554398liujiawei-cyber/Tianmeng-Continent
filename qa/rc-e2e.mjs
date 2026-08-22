import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))
const sharedUrl = 'http://localhost:5199/'

const suites = [
  { name: 'P2-004-R1', script: 'qa/p2-004-r1-e2e.mjs', shared: true },
  { name: 'P2-004', script: 'qa/p2-004-e2e.mjs', shared: true },
  { name: 'Cloud', script: 'qa/p2-005-cloud-e2e.mjs' },
  { name: 'Full Journey', script: 'qa/p2-005-full-journey-e2e.mjs', shared: true },
  { name: 'Responsive', script: 'qa/responsive-e2e.mjs', shared: true },
  { name: 'GamePage/Layout', script: 'qa/p2-005-layout-e2e.mjs' },
  { name: 'Combat', script: 'qa/p2-005-combat-layout-e2e.mjs' },
  { name: 'Merchant', script: 'qa/p2-005-merchant-e2e.mjs' },
  { name: 'Worker + Local D1', script: 'qa/p2-005-worker-e2e.mjs' },
  // TM-P2-006：Game UI 信息架构 + CombatPage V4 + Balance（balance 0.4s，满足任务卡 87 节 <2min）
  { name: 'P2-006 Game UI', script: 'qa/p2-006-game-ui-e2e.mjs' },
  { name: 'P2-006 Combat UI', script: 'qa/p2-006-combat-ui-e2e.mjs' },
  { name: 'P2-006 Balance', script: 'qa/p2-006-balance.mjs --phase after' },
  // TM-P2-007：核心 RPG 系统扩展。各 suite 自带独立 server/端口：
  //   backpack-loot 自起 5225；mount 自备 localDev 5227 + cloudDev(搬 5204 避开共享 Vite) + mock 5203；
  //   save-v6 纯逻辑无浏览器；layout-idleak 自起 5231；party-combat 自起 5226。
  { name: 'P2-007 Backpack/Loot', script: 'qa/p2-007-backpack-loot-e2e.mjs' },
  { name: 'P2-007 Party Combat', script: 'qa/p2-007-party-combat-e2e.mjs' },
  {
    name: 'P2-007 Mount',
    script: 'qa/p2-007-mount-e2e.mjs',
    env: { MOUNT_CLOUD_E2E_PORT: '5204', MOCK_ALLOWED_EXTRA_ORIGINS: '5204' },
  },
  { name: 'P2-007 Save V6', script: 'qa/p2-007-save-v6.mjs' },
  { name: 'P2-007 Layout/IDLeak', script: 'qa/p2-007-layout-idleak-e2e.mjs' },
]

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function runSuite(suite) {
  const env = { ...process.env, ...(suite.env || {}) }
  if (suite.shared) env.BASE_URL = sharedUrl
  else delete env.BASE_URL

  return new Promise((resolve, reject) => {
    console.log(`\n===== RC suite start: ${suite.name} =====`)
    // script 字段可含参数（如 'qa/p2-006-balance.mjs --phase after'）；Windows 下不能把整串当一个模块路径，
    // 按空白拆分后传给 node（本项目脚本路径不含空格）。
    const child = spawn(process.execPath, suite.script.split(/\s+/).filter(Boolean), {
      cwd: root,
      env,
      stdio: 'inherit',
      windowsHide: true,
    })
    child.once('error', reject)
    child.once('close', (code, signal) => {
      console.log(`===== RC suite end: ${suite.name} (exit=${code ?? `signal:${signal}`}) =====`)
      resolve(code ?? 1)
    })
  })
}

async function waitUntilReady(server) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`shared Vite exited before ready (exit ${server.exitCode})`)
    try {
      const response = await fetch(sharedUrl)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await sleep(100)
  }
  throw new Error(`shared Vite did not become ready at ${sharedUrl}`)
}

async function stopOwnedServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) return
  server.kill('SIGTERM')
  const exited = await Promise.race([
    new Promise((resolve) => server.once('exit', () => resolve(true))),
    sleep(5_000).then(() => false),
  ])
  if (!exited && server.exitCode === null && server.signalCode === null) {
    server.kill('SIGKILL')
    await new Promise((resolve) => server.once('exit', resolve))
  }
}

const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', '5199', '--strictPort'], {
  cwd: root,
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
})

let exitCode = 0
try {
  await waitUntilReady(vite)
  console.log(`===== RC shared Vite ready: ${sharedUrl} =====`)
  for (const suite of suites) {
    const suiteExit = await runSuite(suite)
    if (suiteExit !== 0) {
      exitCode = 1
      break
    }
  }
} catch (error) {
  console.error(`RC orchestrator failed: ${error instanceof Error ? error.stack ?? error.message : String(error)}`)
  exitCode = 1
} finally {
  await stopOwnedServer(vite)
  console.log('===== RC shared Vite stopped =====')
}

process.exitCode = exitCode
