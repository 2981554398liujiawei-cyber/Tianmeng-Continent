export interface Env { DB: D1Database; SAVE_PEPPER: string }

const MIN = 8
const MAX = 128
const BODY_LIMIT = 1_000_000
type CloudPayload = { cloudVersion: 1; savesExport: { version: number; exportedAt: string; lastSavedSlot: string | null; slots: Record<string, unknown> } }

const json = (data: unknown, status = 200, origin = '') => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': origin, 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'POST,OPTIONS' } })
const normalize = (value: unknown) => typeof value === 'string' ? value.trim().normalize('NFKC') : null
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

async function keyHash(passphrase: string, pepper: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const bytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(passphrase))
  return [...new Uint8Array(bytes)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function validPayload(value: unknown): value is CloudPayload {
  if (!isRecord(value) || value.cloudVersion !== 1 || !isRecord(value.savesExport)) return false
  const save = value.savesExport
  return typeof save.version === 'number' && Number.isFinite(save.version) && typeof save.exportedAt === 'string' &&
    (save.lastSavedSlot === null || typeof save.lastSavedSlot === 'string') && isRecord(save.slots)
}
const validRevision = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin') ?? ''
    if (request.method === 'OPTIONS') return json(null, 204, origin)
    if (request.method !== 'POST') return json({ ok: false, code: 'invalid', message: 'method not allowed' }, 405, origin)
    if ((request.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase() !== 'application/json') return json({ ok: false, code: 'invalid', message: 'content-type must be application/json' }, 415, origin)
    if (Number(request.headers.get('content-length') ?? 0) > BODY_LIMIT) return json({ ok: false, code: 'invalid', message: 'payload too large' }, 413, origin)
    const rawBody = await request.text()
    if (new TextEncoder().encode(rawBody).byteLength > BODY_LIMIT) return json({ ok: false, code: 'invalid', message: 'payload too large' }, 413, origin)
    let body: Record<string, unknown> | null = null
    try { body = JSON.parse(rawBody) } catch { /* handled below */ }
    if (!body) return json({ ok: false, code: 'invalid', message: 'invalid JSON body' }, 400, origin)
    const passphrase = normalize(body.passphrase)
    if (!passphrase || [...passphrase].length < MIN || [...passphrase].length > MAX) return json({ ok: false, code: 'invalid', message: '口令长度必须为 8–128 个字符' }, 400, origin)
    const action = body.action
    if (action !== 'load' && action !== 'save' && action !== 'force_save') return json({ ok: false, code: 'invalid', message: '未知操作' }, 400, origin)
    if (action === 'save' && !validRevision(body.expectedRevision)) return json({ ok: false, code: 'invalid', message: 'expectedRevision 必须为非负整数' }, 400, origin)
    if (action !== 'load' && !validPayload(body.payload)) return json({ ok: false, code: 'invalid', message: '无效的存档数据' }, 400, origin)

    const hash = await keyHash(passphrase, env.SAVE_PEPPER)
    const row = await env.DB.prepare('SELECT revision, payload_json FROM cloud_saves WHERE key_hash = ?').bind(hash).first<{ revision: number; payload_json: string }>()
    if (action === 'load') return json(row ? { ok: true, exists: true, revision: row.revision, payload: JSON.parse(row.payload_json) } : { ok: true, exists: false, revision: 0, payload: null }, 200, origin)

    const payloadJson = JSON.stringify(body.payload)
    const now = new Date().toISOString()
    if (action === 'force_save') {
      if (!row) {
        await env.DB.prepare('INSERT INTO cloud_saves (key_hash, revision, protocol_version, slot_format_version, payload_json, created_at, updated_at) VALUES (?, 1, 1, ?, ?, ?, ?)').bind(hash, body.payload.savesExport.version, payloadJson, now, now).run()
        return json({ ok: true, revision: 1 }, 200, origin)
      }
      const next = row.revision + 1
      await env.DB.prepare('UPDATE cloud_saves SET revision = ?, payload_json = ?, slot_format_version = ?, updated_at = ?, previous_revision = ?, previous_payload_json = ?, previous_updated_at = ? WHERE key_hash = ?').bind(next, payloadJson, body.payload.savesExport.version, now, row.revision, row.payload_json, now, hash).run()
      return json({ ok: true, revision: next }, 200, origin)
    }

    const expected = body.expectedRevision as number
    if (!row) {
      if (expected !== 0) return json({ ok: false, code: 'conflict', revision: 0 }, 409, origin)
      try {
        await env.DB.prepare('INSERT INTO cloud_saves (key_hash, revision, protocol_version, slot_format_version, payload_json, created_at, updated_at) VALUES (?, 1, 1, ?, ?, ?, ?)').bind(hash, body.payload.savesExport.version, payloadJson, now, now).run()
      } catch {
        return json({ ok: false, code: 'conflict', revision: 1 }, 409, origin)
      }
      return json({ ok: true, revision: 1 }, 200, origin)
    }
    if (row.revision !== expected) return json({ ok: false, code: 'conflict', revision: row.revision }, 409, origin)
    const next = expected + 1
    const result = await env.DB.prepare('UPDATE cloud_saves SET revision = ?, payload_json = ?, slot_format_version = ?, updated_at = ?, previous_revision = ?, previous_payload_json = ?, previous_updated_at = ? WHERE key_hash = ? AND revision = ?').bind(next, payloadJson, body.payload.savesExport.version, now, row.revision, row.payload_json, now, hash, expected).run()
    if (!result.meta || result.meta.changes !== 1) {
      const current = await env.DB.prepare('SELECT revision FROM cloud_saves WHERE key_hash = ?').bind(hash).first<{ revision: number }>()
      return json({ ok: false, code: 'conflict', revision: current?.revision ?? 0 }, 409, origin)
    }
    return json({ ok: true, revision: next }, 200, origin)
  },
}
