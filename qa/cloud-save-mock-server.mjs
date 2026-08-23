/**
 * 云存档 mock HTTP 服务（node:http 内置模块，无第三方依赖）。
 *
 * 与生产 API contract（TM-P2-005）一致：
 *  - 仅 POST + application/json；非 POST → 405，Content-Type 不符 → 415
 *  - body 上限 1MB → 413 {ok:false, code:'invalid', message:'payload too large'}
 *  - JSON 解析失败 → 400
 *  - CORS 白名单 + OPTIONS 预检；Origin 不在白名单 → 403
 *  - 启动打印「cloud-save mock server on <port>」；请求日志只含 action/状态码，绝不打印 passphrase
 *
 * 用法：
 *  - 直接运行：node qa/cloud-save-mock-server.mjs（MOCK_CLOUD_PORT 可覆盖默认 5200）
 *  - vitest/脚本：import { createMockCloudServer } from './cloud-save-mock-server.mjs'
 */
import http from 'node:http'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createMockCloudStore, handleCloudRequest } from './cloud-save-mock-handler.mjs'

// ---- 常量 ----
const DEFAULT_PORT = 5200
const HOST = '127.0.0.1'
const CLOUD_BODY_SIZE_LIMIT = 1_000_000 // 与 contract 一致（≤ 1 MB）

const ALLOWED_ORIGINS = new Set([
  'https://2981554398liujiawei-cyber.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5199',
  'http://127.0.0.1:5199',
  'http://localhost:5198',
  'http://127.0.0.1:5198',
  // TM-P2-005：cloud E2E 自备 dev server（qa/p2-005-cloud-e2e.mjs）
  'http://localhost:5201',
  'http://127.0.0.1:5201',
])

// TM-P2-007：rc-e2e 集成时可注入额外端口（逗号分隔，如 Mount suite 把 cloudDev 搬到 5204 避开共享 Vite）
for (const port of (process.env.MOCK_ALLOWED_EXTRA_ORIGINS || '').split(',').map((p) => p.trim()).filter(Boolean)) {
  if (!/^\d{1,5}$/.test(port)) throw new Error(`MOCK_ALLOWED_EXTRA_ORIGINS 含非法端口: ${port}`)
  ALLOWED_ORIGINS.add(`http://localhost:${port}`)
  ALLOWED_ORIGINS.add(`http://127.0.0.1:${port}`)
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function sendJson(res, status, json, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8' }
  // 仅对白名单内的 Origin 回显 CORS 头
  if (origin !== null && ALLOWED_ORIGINS.has(origin)) {
    Object.assign(headers, corsHeaders(origin))
  }
  res.writeHead(status, headers)
  res.end(JSON.stringify(json))
}

function requestLog(req, action, status) {
  // 只打印 method / action / 状态码；严禁打印 body / passphrase
  console.log(`[cloud-save mock] ${req.method} ${typeof action === 'string' ? action : '?'} -> ${status}`)
}

/**
 * 创建一个 mock 云存档 HTTP server（内存 store 随 server 一起创建）。
 * @returns {import('node:http').Server}
 */
export function createMockCloudServer() {
  const store = createMockCloudStore()

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin ?? null
    const originAllowed = origin === null || ALLOWED_ORIGINS.has(origin)

    // OPTIONS 预检：白名单内 → 204 + CORS 头；否则 403
    if (req.method === 'OPTIONS') {
      if (!originAllowed) {
        sendJson(res, 403, { ok: false, code: 'invalid', message: 'origin not allowed' }, origin)
        requestLog(req, 'preflight', 403)
        return
      }
      res.writeHead(204, corsHeaders(origin))
      res.end()
      requestLog(req, 'preflight', 204)
      return
    }

    // Origin 不在白名单 → 403（无 Origin 的请求视为非浏览器/同源，放行，便于 vitest 单测）
    if (!originAllowed) {
      sendJson(res, 403, { ok: false, code: 'invalid', message: 'origin not allowed' }, origin)
      requestLog(req, undefined, 403)
      return
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, code: 'invalid', message: 'method not allowed' }, origin)
      requestLog(req, undefined, 405)
      return
    }

    const contentType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase()
    if (contentType !== 'application/json') {
      sendJson(res, 415, { ok: false, code: 'invalid', message: 'content-type must be application/json' }, origin)
      requestLog(req, undefined, 415)
      return
    }

    // 读取 body，上限 1MB；超限停止累积，但仍消费完请求流以正常返回 413
    let size = 0
    let tooLarge = false
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > CLOUD_BODY_SIZE_LIMIT) {
        tooLarge = true
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) {
        sendJson(res, 413, { ok: false, code: 'invalid', message: 'payload too large' }, origin)
        requestLog(req, undefined, 413)
        return
      }
      let body
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch {
        sendJson(res, 400, { ok: false, code: 'invalid', message: 'invalid JSON body' }, origin)
        requestLog(req, undefined, 400)
        return
      }
      const action = body !== null && typeof body === 'object' ? body.action : undefined
      const { status, json } = handleCloudRequest(store, body)
      sendJson(res, status, json, origin)
      requestLog(req, action, status)
    })
    req.on('error', () => {})
  })

  return server
}

// 直接运行时启动服务（import 时仅导出，不自动监听，便于 vitest 自行控制端口）
const isMain = typeof process.argv[1] === 'string'
  && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  const port = Number(process.env.MOCK_CLOUD_PORT || DEFAULT_PORT)
  const server = createMockCloudServer()
  server.listen(port, HOST, () => {
    console.log(`cloud-save mock server on ${port}`)
  })
}
