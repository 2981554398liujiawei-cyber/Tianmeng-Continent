import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Miniflare } from 'miniflare'

const root = fileURLToPath(new URL('..', import.meta.url))
const tscCli = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const cloudRoot = join(root, 'cloud')
const persistence = mkdtempSync(join(tmpdir(), 'tianmeng-worker-e2e-'))
const workerEntry = join(persistence, 'index.js')
const transpile = spawnSync(process.execPath, [tscCli, join(cloudRoot, 'src', 'index.ts'), '--ignoreConfig', '--target', 'ES2022', '--module', 'ESNext', '--noCheck', '--outDir', persistence], {
  cwd: cloudRoot,
  encoding: 'utf8',
})
assert.equal(transpile.status, 0, transpile.stderr || transpile.stdout)
const workerUrl = 'http://127.0.0.1:8790'
const missingPepperUrl = 'http://127.0.0.1:8791'
const emptyPepperUrl = 'http://127.0.0.1:8792'
const results = []
const runtimes = []

function check(name, condition, detail = '') {
  const ok = Boolean(condition)
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function startWorker(port, vars = []) {
  const bindings = Object.fromEntries(vars.map((value) => {
    const separator = value.indexOf(':')
    return [value.slice(0, separator), value.slice(separator + 1)]
  }))
  const runtime = new Miniflare({
    resourcePersistencePath: join(persistence, String(port)),
    host: '127.0.0.1',
    port,
    workers: [{
      config: {
        name: `tianmeng-worker-e2e-${port}`,
        type: 'worker',
        compatibilityDate: '2026-08-21',
        manifest: {
          mainModule: 'index.js',
          modulesRoot: persistence,
          modules: {
            'index.js': { type: 'esm', contents: readFileSync(workerEntry, 'utf8') },
          },
        },
        env: {
          DB: { type: 'd1', id: `tianmeng-worker-e2e-${port}` },
          ...Object.fromEntries(Object.entries(bindings).map(([name, value]) => [name, { type: 'json', value }])),
        },
      },
    }],
  })
  runtimes.push(runtime)
  await runtime.ready
  return runtime
}

const payload = (marker) => ({
  cloudVersion: 1,
  savesExport: {
    version: 5,
    exportedAt: '2026-08-21T00:00:00.000Z',
    lastSavedSlot: 'slot1',
    slots: { slot1: { marker } },
  },
})

async function request(body, {
  url = workerUrl,
  origin = 'http://localhost:5173',
  raw,
  method = 'POST',
  contentType = 'application/json',
} = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...(origin ? { origin } : {}), ...(contentType ? { 'content-type': contentType } : {}) },
    body: method === 'GET' || method === 'HEAD' ? undefined : (raw ?? JSON.stringify(body)),
  })
  const text = await response.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* malformed response is asserted by callers */ }
  return { response, json }
}

try {
  const worker = await startWorker(8790, [
    'SAVE_PEPPER:e2e-only-pepper',
    'CORS_ORIGINS:https://allowed.example, https://second.example',
  ])
  const database = await worker.getD1Database('DB')
  await database.prepare(readFileSync(join(cloudRoot, 'migrations', '0001_cloud_save.sql'), 'utf8')).run()

  let result = await request(null, {
    method: 'OPTIONS',
    origin: 'https://2981554398liujiawei-cyber.github.io',
    contentType: null,
  })
  check('W1 OPTIONS returns 204 with the complete CORS method/header contract',
    result.response.status === 204 &&
    result.response.headers.get('access-control-allow-origin') === 'https://2981554398liujiawei-cyber.github.io' &&
    result.response.headers.get('access-control-allow-methods') === 'POST,OPTIONS' &&
    result.response.headers.get('access-control-allow-headers') === 'content-type')

  result = await request(null, { raw: '{}', contentType: 'text/plain' })
  check('W2 invalid content-type is rejected', result.response.status === 415 && result.json?.code === 'invalid')

  result = await request({ action: 'load', passphrase: 'short' })
  check('W3 passphrases shorter than 8 characters are rejected', result.response.status === 400 && result.json?.code === 'invalid')

  const normalizedSave = await request({ action: 'save', passphrase: '  Ａlpha-normalized  ', expectedRevision: 0, payload: payload('nfkc') })
  const normalizedLoad = await request({ action: 'load', passphrase: 'Alpha-normalized' })
  check('W4 passphrases are trim+NFKC normalized', normalizedSave.json?.revision === 1 && normalizedLoad.json?.payload?.savesExport?.slots?.slot1?.marker === 'nfkc')

  result = await request({ action: 'load', passphrase: 'absent-vault' })
  check('W5 absent vault loads as exists=false, revision=0 and payload=null', result.response.status === 200 && result.json?.exists === false && result.json?.revision === 0 && result.json?.payload === null)

  result = await request({ action: 'save', passphrase: 'revision-passphrase', expectedRevision: 0, payload: payload('v1') })
  check('W6 first save creates revision 1', result.response.status === 200 && result.json?.revision === 1)

  result = await request({ action: 'load', passphrase: 'revision-passphrase' })
  check('W7 load returns the revision-1 payload from Local D1', result.response.status === 200 && result.json?.revision === 1 && result.json?.payload?.savesExport?.slots?.slot1?.marker === 'v1')

  result = await request({ action: 'save', passphrase: 'revision-passphrase', expectedRevision: 1, payload: payload('v2') })
  check('W8 save with expectedRevision=1 creates revision 2', result.response.status === 200 && result.json?.revision === 2)

  result = await request({ action: 'save', passphrase: 'revision-passphrase', expectedRevision: 1, payload: payload('stale') })
  check('W9 stale save returns HTTP 409 and current revision 2', result.response.status === 409 && result.json?.code === 'conflict' && result.json?.revision === 2)

  result = await request({ action: 'load', passphrase: 'revision-passphrase' })
  check('W10 stale save does not overwrite the revision-2 payload', result.response.status === 200 && result.json?.revision === 2 && result.json?.payload?.savesExport?.slots?.slot1?.marker === 'v2')

  result = await request({ action: 'force_save', passphrase: 'revision-passphrase', payload: payload('forced-v3') })
  check('W11 force_save increments the existing vault to revision 3', result.response.status === 200 && result.json?.revision === 3)

  result = await request(null, { raw: '{broken' })
  check('W14 malformed JSON is rejected', result.response.status === 400 && result.json?.code === 'invalid')

  const oversizedResponse = await worker.dispatchFetch(workerUrl, {
    method: 'POST',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    body: JSON.stringify({ padding: 'x'.repeat(1_000_001) }),
  })
  result = { response: oversizedResponse, json: await oversizedResponse.json() }
  check('W15 request bodies larger than 1 MB are rejected', result.response.status === 413 && result.json?.code === 'invalid')

  await Promise.all([startWorker(8791), startWorker(8792, ['SAVE_PEPPER:'])])
  const pepperResponses = await Promise.all([
    request({ action: 'load', passphrase: 'pepper-check' }, { url: missingPepperUrl }),
    request({ action: 'load', passphrase: 'pepper-check' }, { url: emptyPepperUrl }),
  ])
  check('S1 missing or empty SAVE_PEPPER fails closed with code=server_error', pepperResponses.every(({ response, json }) => response.status === 503 && json?.code === 'server_error'))

  const allowedOrigins = [
    'https://2981554398liujiawei-cyber.github.io',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'https://allowed.example',
  ]
  const allowed = await Promise.all(allowedOrigins.map((origin) => request({ action: 'load', passphrase: 'cors-check' }, { origin })))
  const evilGithub = await request({ action: 'load', passphrase: 'cors-check' }, { origin: 'https://evil.github.io' })
  const unknownPreflight = await request(null, { method: 'OPTIONS', contentType: null, origin: 'https://evil.github.io' })
  check('S2 default CORS is exact project GitHub Pages plus localhost/loopback; CORS_ORIGINS extends it',
    allowed.every(({ response }, index) => response.headers.get('access-control-allow-origin') === allowedOrigins[index]) &&
    evilGithub.response.headers.get('access-control-allow-origin') === null &&
    unknownPreflight.response.headers.get('access-control-allow-origin') === null)

  const wrongMethod = await request(null, { method: 'GET' })
  const caseSensitive = await request({ action: 'load', passphrase: 'alpha-normalized' })
  check('S3 method allowlist and passphrase case isolation remain enforced', wrongMethod.response.status === 405 && caseSensitive.json?.exists === false)

  const stored = await database.prepare("SELECT key_hash, revision, previous_revision, json_extract(payload_json, '$.savesExport.slots.slot1.marker') AS marker, json_extract(previous_payload_json, '$.savesExport.slots.slot1.marker') AS previous_marker FROM cloud_saves WHERE revision = 3").all()
  const row = stored.results[0]
  check('W12 Local D1 key_hash is a 64-char digest and never stores the plaintext passphrase', stored.success === true && /^[0-9a-f]{64}$/.test(row?.key_hash ?? '') && row?.key_hash !== 'revision-passphrase')
  check('W13 Local D1 preserves previous_revision and previous_payload_json', row?.revision === 3 && row?.marker === 'forced-v3' && row?.previous_revision === 2 && row?.previous_marker === 'v2')
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await Promise.all(runtimes.map((runtime) => runtime.dispose()))
  let cleaned = false
  for (let attempt = 1; attempt <= 15 && !cleaned; attempt += 1) {
    try {
      rmSync(persistence, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 })
      cleaned = true
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }
  if (!cleaned) {
    console.error(`Failed to clean temporary Local D1 state (EPERM persists after retries): ${persistence}`)
    process.exitCode = 1
  }
}

const failed = results.filter((result) => !result.ok)
const taskCard = results.filter((result) => /^W(?:1[0-5]|[1-9])\b/.test(result.name))
console.log(`Worker task card W1-W15: ${taskCard.filter((result) => result.ok).length}/${taskCard.length} passed`)
console.log(`Worker + Local D1 total: ${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0 || taskCard.length !== 15) process.exitCode = 1
