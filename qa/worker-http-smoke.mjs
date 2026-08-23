#!/usr/bin/env node
/**
 * qa/worker-http-smoke.mjs —— Cloudflare Worker 公网 HTTP 快速健康检查。
 *
 * 用于 release workflow build:public 前快速探测（无需 Cloudflare API token）：
 *   1. OPTIONS 预检 → 204 + Access-Control-Allow-Origin 匹配
 *   2. POST load（强随机临时口令）→ 200 { ok:true, exists:false }（非 503/500）
 *
 * fail-closed 设计：Worker 缺 SAVE_PEPPER 会返回 503「SAVE_PEPPER is required」→ 本检查 FAIL，
 *   从而在发布前端前拦截问题（间接证明 SAVE_PEPPER: PRESENT + D1 binding 存在）。
 *
 * 用法：WORKER_URL=https://... PUBLIC_GAME_URL=https://... node qa/worker-http-smoke.mjs
 */
import { randomBytes } from 'node:crypto'

const WORKER_URL = (process.env.WORKER_URL || '').trim()
if (!WORKER_URL) {
  console.error('WORKER SMOKE BLOCKED: WORKER_URL is missing')
  process.exit(1)
}
const ORIGIN = process.env.PUBLIC_GAME_URL
  ? new URL(process.env.PUBLIC_GAME_URL).origin
  : 'https://2981554398liujiawei-cyber.github.io'
const pass = `W-SMOKE-${randomBytes(12).toString('base64url')}` // 绝不打印

let failed = 0
const mark = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${name}${extra ? ' | ' + extra : ''}`)
  if (!ok) failed++
}

try {
  const o = await fetch(WORKER_URL, {
    method: 'OPTIONS',
    headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  })
  const acao = (o.headers.get('access-control-allow-origin') || '').trim()
  mark('worker OPTIONS 204', o.status === 204, `status=${o.status}`)
  mark('worker CORS Allow-Origin 匹配', acao === ORIGIN, `acao=${acao || '(空)'}`)
} catch (err) {
  mark('worker OPTIONS', false, String(err))
}

try {
  const r = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ action: 'load', passphrase: pass }),
  })
  const j = await r.json().catch(() => null)
  const healthy = r.status === 200 && j?.ok === true && j?.exists === false
  mark('worker POST load（非 503/500/D1 missing）', healthy, `status=${r.status} exists=${j?.exists}`)
} catch (err) {
  mark('worker POST load', false, String(err))
}

console.log(failed === 0 ? 'WORKER SMOKE: PASS' : `WORKER SMOKE: FAIL (${failed})`)
process.exit(failed === 0 ? 0 : 1)
