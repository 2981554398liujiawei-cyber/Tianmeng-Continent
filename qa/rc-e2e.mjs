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
]

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function runSuite(suite) {
  const env = { ...process.env }
  if (suite.shared) env.BASE_URL = sharedUrl
  else delete env.BASE_URL

  return new Promise((resolve, reject) => {
    console.log(`\n===== RC suite start: ${suite.name} =====`)
    const child = spawn(process.execPath, [suite.script], {
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
