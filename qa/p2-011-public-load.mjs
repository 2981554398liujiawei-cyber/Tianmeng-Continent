#!/usr/bin/env node
// TM-P2-011 public first-load probe: five direct, random, load-only requests.
// The probe never sends save/force_save and never prints the random credential.
import { randomBytes } from 'node:crypto'

const publicGameUrl = (process.env.PUBLIC_GAME_URL || '').trim()
const workerUrl = (process.env.WORKER_URL || 'https://tianmeng-cloud-save.2981554398.workers.dev').trim()

if (!publicGameUrl) {
  console.error('PUBLIC_LOAD_PROBE_BLOCKED: PUBLIC_GAME_URL is missing')
  process.exit(1)
}
if (!workerUrl.startsWith('https://')) {
  console.error('PUBLIC_LOAD_PROBE_BLOCKED: WORKER_URL must be an https URL')
  process.exit(1)
}

const origin = new URL(publicGameUrl).origin
const results = []

for (let i = 0; i < 5; i += 1) {
  const passphrase = `P2-011-${randomBytes(18).toString('base64url')}`
  const startedAt = Date.now()
  let status = 'network_error'
  let protocolOk = false

  try {
    const response = await fetch(workerUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin,
      },
      body: JSON.stringify({ action: 'load', passphrase }),
      signal: AbortSignal.timeout(10_000),
    })
    status = response.status
    const body = await response.json().catch(() => null)
    protocolOk = response.status === 200
      && body?.ok === true
      && body?.exists === false
      && body?.payload == null
  } catch {
    protocolOk = false
  }

  const elapsedMs = Date.now() - startedAt
  results.push(protocolOk)
  console.log(`${protocolOk ? 'PASS' : 'FAIL'} | fresh load ${i + 1} | action=load status=${status} elapsed_ms=${elapsedMs} protocol=${protocolOk ? 'ok' : 'invalid'}`)
}

const passed = results.filter(Boolean).length
console.log(`PUBLIC_LOAD_SUCCESS_RATE=${passed}/5`)
console.log(`===== P2-011 public LOAD probe: ${passed}/5 =====`)
process.exit(passed === 5 ? 0 : 1)
