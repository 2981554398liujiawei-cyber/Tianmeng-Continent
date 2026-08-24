import { spawn } from 'node:child_process'
import { mkdir, writeFile, appendFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

const evidenceLog = resolve('qa/evidence/verify.log')
await mkdir(dirname(evidenceLog), { recursive: true })
await writeFile(evidenceLog, `TM-P2-010 authoritative verification\nstarted=${new Date().toISOString()}\nnode=${process.version}\nplatform=${process.platform}\n\n`)

const suites = [
  ['unit', ['test']],
  ['build', ['run', 'build']],
  ['cloud', ['run', 'qa:cloud']],
  ['worker', ['run', 'qa:worker']],
  ['production-smoke', ['run', 'qa:prod']],
  ['p2-008', ['run', 'qa:p2-008']],
  ['p2-009', ['run', 'qa:p2-009']],
  ['p2-009-r1', ['run', 'qa:p2-009-r1']],
  ['p2-010', ['run', 'qa:p2-010']],
  ['release-candidate', ['run', 'qa:rc']],
  ['p2-010-screenshots', ['run', 'qa:p2-010-screenshots']],
]

const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm'

async function runSuite(id, args, extraEnv = {}) {
  const heading = `\n===== SUITE ${id} | npm ${args.join(' ')} =====\n`
  process.stdout.write(heading)
  await appendFile(evidenceLog, heading)
  const started = Date.now()
  const child = spawn(npmExecutable, args, { env: { ...process.env, ...extraEnv }, stdio: ['ignore', 'pipe', 'pipe'] })
  const forward = (stream, destination) => {
    stream.on('data', (chunk) => {
      destination.write(chunk)
      void appendFile(evidenceLog, chunk)
    })
  }
  forward(child.stdout, process.stdout)
  forward(child.stderr, process.stderr)
  const exitCode = await new Promise((resolveCode, reject) => {
    child.once('error', reject)
    child.once('close', (code) => resolveCode(code ?? 1))
  })
  const footer = `\n===== RESULT ${id}: ${exitCode === 0 ? 'PASS' : 'FAIL'} exit=${exitCode} durationMs=${Date.now() - started} =====\n`
  process.stdout.write(footer)
  await appendFile(evidenceLog, footer)
  if (exitCode !== 0) process.exit(exitCode)
}

async function runProductionSmoke(id, args) {
  const port = 5198
  const preview = spawn(npmExecutable, ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  preview.stdout.on('data', (chunk) => { process.stdout.write(chunk); void appendFile(evidenceLog, chunk) })
  preview.stderr.on('data', (chunk) => { process.stderr.write(chunk); void appendFile(evidenceLog, chunk) })
  try {
    let ready = false
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try { await fetch(`http://127.0.0.1:${port}/`); ready = true; break } catch { await new Promise((resolve) => setTimeout(resolve, 250)) }
    }
    if (!ready) throw new Error('production preview did not become ready')
    await runSuite(id, args, { BASE_URL: `http://127.0.0.1:${port}/` })
  } finally {
    preview.kill()
  }
}

for (const [id, args] of suites) {
  if (id === 'production-smoke') await runProductionSmoke(id, args)
  else await runSuite(id, args)
}
await appendFile(evidenceLog, `\ncompleted=${new Date().toISOString()}\noverall=PASS\n`)
