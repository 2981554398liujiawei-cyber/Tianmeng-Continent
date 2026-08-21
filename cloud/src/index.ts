export interface Env {
  DB: D1Database
  SAVE_PEPPER?: string
  CORS_ORIGINS?: string
}

const BODY_LIMIT = 1_000_000
type CloudPayload = { cloudVersion: 1; savesExport: { version: number; exportedAt: string; lastSavedSlot: string | null; slots: Record<string, unknown> } }
type SaveRow = { revision: number; payload_json: string }

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const normalizePassphrase = (value: unknown) => typeof value === 'string' ? value.trim().normalize('NFKC') : null
const validRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function validPayload(value: unknown): value is CloudPayload {
  if (!isRecord(value) || value.cloudVersion !== 1 || !isRecord(value.savesExport)) return false
  const save = value.savesExport
  return Number.isSafeInteger(save.version) && (save.version as number) >= 1 && typeof save.exportedAt === 'string' &&
    (save.lastSavedSlot === null || typeof save.lastSavedSlot === 'string') && isRecord(save.slots)
}

function allowedOrigin(requestOrigin: string | null, configuredOrigins?: string) {
  if (!requestOrigin) return null
  let origin: URL
  try { origin = new URL(requestOrigin) } catch { return null }
  const githubPages = origin.origin === 'https://2981554398liujiawei-cyber.github.io'
  const localhost = (origin.protocol === 'http:' || origin.protocol === 'https:') &&
    ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  const configured = (configuredOrigins ?? '').split(',').map((item) => item.trim()).filter(Boolean).some((item) => {
    try { return new URL(item).origin === origin.origin } catch { return false }
  })
  return githubPages || localhost || configured ? origin.origin : null
}

function json(data: unknown, status: number, origin: string | null) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST,OPTIONS',
  })
  if (origin) {
    headers.set('access-control-allow-origin', origin)
    headers.set('vary', 'Origin')
  }
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers })
}

async function keyHash(passphrase: string, pepper: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(passphrase))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function currentConflict(env: Env, hash: string, origin: string | null) {
  const current = await env.DB.prepare('SELECT revision FROM cloud_saves WHERE key_hash = ?').bind(hash).first<{ revision: number }>()
  return json({ ok: false, code: 'conflict', revision: current?.revision ?? 0 }, 409, origin)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request.headers.get('origin'), env.CORS_ORIGINS)
    if (typeof env.SAVE_PEPPER !== 'string' || env.SAVE_PEPPER.trim().length === 0) {
      return json({ ok: false, code: 'server_error', message: 'SAVE_PEPPER is required' }, 503, origin)
    }
    if (request.method === 'OPTIONS') return json(null, 204, origin)
    if (request.method !== 'POST') return json({ ok: false, code: 'invalid', message: 'method not allowed' }, 405, origin)
    if ((request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      return json({ ok: false, code: 'invalid', message: 'content-type must be application/json' }, 415, origin)
    }
    const declaredLength = Number(request.headers.get('content-length') ?? 0)
    if (Number.isFinite(declaredLength) && declaredLength > BODY_LIMIT) return json({ ok: false, code: 'invalid', message: 'payload too large' }, 413, origin)
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > BODY_LIMIT) return json({ ok: false, code: 'invalid', message: 'payload too large' }, 413, origin)

    let parsed: unknown
    try { parsed = JSON.parse(rawBody) } catch { return json({ ok: false, code: 'invalid', message: 'invalid JSON body' }, 400, origin) }
    if (!isRecord(parsed)) return json({ ok: false, code: 'invalid', message: 'invalid JSON body' }, 400, origin)
    const passphrase = normalizePassphrase(parsed.passphrase)
    if (!passphrase || [...passphrase].length < 8 || [...passphrase].length > 128) {
      return json({ ok: false, code: 'invalid', message: '口令长度必须为 8–128 个字符' }, 400, origin)
    }
    const action = parsed.action
    if (action !== 'load' && action !== 'save' && action !== 'force_save') return json({ ok: false, code: 'invalid', message: '未知操作' }, 400, origin)
    if (action === 'save' && !validRevision(parsed.expectedRevision)) return json({ ok: false, code: 'invalid', message: 'expectedRevision 必须为非负整数' }, 400, origin)
    if (action !== 'load' && !validPayload(parsed.payload)) return json({ ok: false, code: 'invalid', message: '无效的存档数据' }, 400, origin)

    const hash = await keyHash(passphrase, env.SAVE_PEPPER)
    const row = await env.DB.prepare('SELECT revision, payload_json FROM cloud_saves WHERE key_hash = ?').bind(hash).first<SaveRow>()
    if (action === 'load') {
      return json(row ? { ok: true, exists: true, revision: row.revision, payload: JSON.parse(row.payload_json) } :
        { ok: true, exists: false, revision: 0, payload: null }, 200, origin)
    }

    const payload = parsed.payload
    const payloadJson = JSON.stringify(payload)
    const now = new Date().toISOString()
    if (action === 'force_save') {
      if (!row) {
        try {
          await env.DB.prepare('INSERT INTO cloud_saves (key_hash, revision, protocol_version, slot_format_version, payload_json, created_at, updated_at) VALUES (?, 1, 1, ?, ?, ?, ?)')
            .bind(hash, payload.savesExport.version, payloadJson, now, now).run()
          return json({ ok: true, revision: 1 }, 200, origin)
        } catch { return currentConflict(env, hash, origin) }
      }
      const next = row.revision + 1
      const result = await env.DB.prepare('UPDATE cloud_saves SET revision = ?, payload_json = ?, slot_format_version = ?, updated_at = ?, previous_revision = ?, previous_payload_json = ?, previous_updated_at = ? WHERE key_hash = ? AND revision = ?')
        .bind(next, payloadJson, payload.savesExport.version, now, row.revision, row.payload_json, now, hash, row.revision).run()
      return result.meta?.changes === 1 ? json({ ok: true, revision: next }, 200, origin) : currentConflict(env, hash, origin)
    }

    const expected = parsed.expectedRevision
    if (!row) {
      if (expected !== 0) return json({ ok: false, code: 'conflict', revision: 0 }, 409, origin)
      try {
        await env.DB.prepare('INSERT INTO cloud_saves (key_hash, revision, protocol_version, slot_format_version, payload_json, created_at, updated_at) VALUES (?, 1, 1, ?, ?, ?, ?)')
          .bind(hash, payload.savesExport.version, payloadJson, now, now).run()
        return json({ ok: true, revision: 1 }, 200, origin)
      } catch { return currentConflict(env, hash, origin) }
    }
    if (row.revision !== expected) return json({ ok: false, code: 'conflict', revision: row.revision }, 409, origin)
    const next = expected + 1
    const result = await env.DB.prepare('UPDATE cloud_saves SET revision = ?, payload_json = ?, slot_format_version = ?, updated_at = ?, previous_revision = ?, previous_payload_json = ?, previous_updated_at = ? WHERE key_hash = ? AND revision = ?')
      .bind(next, payloadJson, payload.savesExport.version, now, row.revision, row.payload_json, now, hash, expected).run()
    return result.meta?.changes === 1 ? json({ ok: true, revision: next }, 200, origin) : currentConflict(env, hash, origin)
  },
}
