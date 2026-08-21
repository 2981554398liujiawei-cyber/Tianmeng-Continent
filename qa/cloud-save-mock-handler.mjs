/**
 * 云存档 mock handler（纯函数模块，供 vitest 单测 / 浏览器 E2E 共用）。
 *
 * 与生产 API contract（TM-P2-005，src/cloud/cloudSaveTypes.ts）保持一致：
 *  - 口令 normalize = trim（不 lowercase），长度 8–128，非法 → 400 invalid
 *  - vaultId = HMAC-SHA256('mock-hmac-secret', normalizedPassphrase)
 *  - action load / save / force_save，revision CAS 语义（冲突 → 409 conflict）
 *  - 严禁把 passphrase 写入任何日志 / 错误信息
 *
 * HTTP 层职责（method / content-type / body 大小 / JSON 解析 / CORS）由
 * cloud-save-mock-server.mjs 负责；本模块只处理业务逻辑。
 */
import { createHmac } from 'node:crypto'

// ---- contract 常量（与 src/cloud/cloudSaveTypes.ts 对齐） ----
export const PASSPHRASE_MIN_LENGTH = 8
export const PASSPHRASE_MAX_LENGTH = 128
export const CLOUD_SAVE_FORMAT_VERSION = 1

/** 固定 mock HMAC secret；生产用真实 secret，流程一致，DB 不存明文口令 */
const HMAC_SECRET = 'mock-hmac-secret'

/** 每个 vault 的 history 最多保留的旧版本条数 */
const HISTORY_LIMIT = 5

/**
 * 创建一个空的 mock store。
 * @returns {{ vaults: Map<string, {revision:number, payload:object, updatedAt:string}>,
 *             history: Map<string, Array<{revision:number, payload:object, createdAt:string}>> }}
 */
export function createMockCloudStore() {
  return { vaults: new Map(), history: new Map() }
}

/** 由口令（已 normalize）派生 vaultId；与生产 HMAC 流程一致 */
function deriveVaultId(normalizedPassphrase) {
  return createHmac('sha256', HMAC_SECRET).update(normalizedPassphrase).digest('hex')
}

/** 覆盖前把当前版本 push 进 history，最多保留 HISTORY_LIMIT 条，超限删最旧 */
function pushHistory(store, vaultId, revision, payload) {
  const list = store.history.get(vaultId) || []
  list.push({ revision, payload, createdAt: new Date().toISOString() })
  while (list.length > HISTORY_LIMIT) list.shift()
  store.history.set(vaultId, list)
}

/**
 * payload 信封校验（与 CloudVaultPayload 契约一致）：
 *  - payload 是普通对象
 *  - cloudVersion === CLOUD_SAVE_FORMAT_VERSION
 *  - savesExport 是普通对象，且含 version(数字) / exportedAt(字符串) / slots(对象)
 */
function isValidPayload(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return false
  if (payload.cloudVersion !== CLOUD_SAVE_FORMAT_VERSION) return false
  const se = payload.savesExport
  if (se === null || typeof se !== 'object' || Array.isArray(se)) return false
  if (typeof se.version !== 'number' || !Number.isFinite(se.version)) return false
  if (typeof se.exportedAt !== 'string') return false
  if (se.slots === null || typeof se.slots !== 'object' || Array.isArray(se.slots)) return false
  return true
}

function invalid(message) {
  return { status: 400, json: { ok: false, code: 'invalid', message } }
}

function conflict(revision) {
  return { status: 409, json: { ok: false, code: 'conflict', revision } }
}

/**
 * 处理一个已解析的 CloudSaveRequest，返回 { status, json }（json 为 CloudSaveResponse 形状）。
 * @param {{vaults: Map, history: Map}} store createMockCloudStore() 的返回值
 * @param {any} body 已解析的 JSON body
 */
export function handleCloudRequest(store, body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return invalid('无效的请求')
  }

  // passphrase 校验：normalize = trim（不 lowercase），长度 8–128
  const rawPassphrase = body.passphrase
  if (typeof rawPassphrase !== 'string') {
    return invalid('口令长度必须为 8–128 个字符')
  }
  const normalized = rawPassphrase.trim()
  if (normalized.length < PASSPHRASE_MIN_LENGTH || normalized.length > PASSPHRASE_MAX_LENGTH) {
    return invalid('口令长度必须为 8–128 个字符')
  }
  // vaultId 由 HMAC 派生，明文口令不进 DB、不进日志、不进错误信息
  const vaultId = deriveVaultId(normalized)

  switch (body.action) {
    case 'load': {
      const vault = store.vaults.get(vaultId)
      if (!vault) {
        return { status: 200, json: { ok: true, exists: false, revision: 0, payload: null } }
      }
      return { status: 200, json: { ok: true, exists: true, revision: vault.revision, payload: vault.payload } }
    }

    case 'save': {
      // expectedRevision 必须是非负安全整数
      const expected = body.expectedRevision
      if (typeof expected !== 'number' || !Number.isSafeInteger(expected) || expected < 0) {
        return invalid('expectedRevision 必须为非负整数')
      }
      if (!isValidPayload(body.payload)) {
        return invalid('无效的存档数据')
      }
      const existing = store.vaults.get(vaultId)
      if (!existing) {
        // INSERT 语义：仅 expectedRevision===0 可创建；否则按 CAS 冲突处理
        if (expected !== 0) return conflict(0)
        store.vaults.set(vaultId, { revision: 1, payload: body.payload, updatedAt: new Date().toISOString() })
        return { status: 200, json: { ok: true, revision: 1 } }
      }
      if (existing.revision !== expected) return conflict(existing.revision)
      pushHistory(store, vaultId, existing.revision, existing.payload)
      const next = existing.revision + 1
      store.vaults.set(vaultId, { revision: next, payload: body.payload, updatedAt: new Date().toISOString() })
      return { status: 200, json: { ok: true, revision: next } }
    }

    case 'force_save': {
      if (!isValidPayload(body.payload)) {
        return invalid('无效的存档数据')
      }
      const existing = store.vaults.get(vaultId)
      if (!existing) {
        store.vaults.set(vaultId, { revision: 1, payload: body.payload, updatedAt: new Date().toISOString() })
        return { status: 200, json: { ok: true, revision: 1 } }
      }
      pushHistory(store, vaultId, existing.revision, existing.payload)
      const next = existing.revision + 1
      store.vaults.set(vaultId, { revision: next, payload: body.payload, updatedAt: new Date().toISOString() })
      return { status: 200, json: { ok: true, revision: next } }
    }

    default:
      return invalid('未知操作')
  }
}
