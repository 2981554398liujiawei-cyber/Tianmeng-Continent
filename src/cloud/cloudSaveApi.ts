/**
 * 云存档 API 客户端（TM-P2-005 11/20/37/58 节）。
 *  - 纯原生 fetch，不引入第三方云端 SDK。
 *  - 唯一客户端公开配置：VITE_CLOUD_SAVE_ENDPOINT（构建时注入；未配置 = 云层不可用）。
 *  - 前端 bundle 绝不包含 SAVE_PEPPER（服务器端才存在）。
 *  - passphrase 只出现在 HTTPS body 中；禁止 console / URL / localStorage / telemetry。
 */
import {
  PASSPHRASE_MIN_LENGTH,
  PASSPHRASE_MAX_LENGTH,
  type CloudSaveRequest,
  type CloudSaveResponse,
} from './cloudSaveTypes'

/** 构建时注入的云端端点（生产：Edge Function 公网 URL；开发：本地 mock server） */
export function cloudEndpoint(): string {
  return (import.meta.env?.VITE_CLOUD_SAVE_API_BASE as string | undefined) ?? (import.meta.env?.VITE_CLOUD_SAVE_ENDPOINT as string | undefined) ?? ''
}

/** 云层是否已配置（无 endpoint → 页面显示“云存档服务尚未配置”，允许仅本机模式） */
export function isCloudConfigured(): boolean {
  return cloudEndpoint().trim().length > 0
}

/**
 * 口令标准化（TM-P2-005 7.2 节）：
 *  trim() 但**不 lowercase**（口令大小写有意义）。
 *  “ MySave ” → “MySave”；“MySave” ≠ “mysave”。
 */
export function normalizePassphrase(raw: string): string {
  return raw.trim().normalize('NFKC')
}

/**
 * 口令校验（TM-P2-005 19 节）：8–128 字符，禁空串。
 * 返回 null 表示合法；否则返回错误信息。
 */
export function validatePassphrase(passphrase: string): string | null {
  const normalized = normalizePassphrase(passphrase)
  if (normalized.length === 0) return '口令不能为空。'
  if ([...normalized].length < PASSPHRASE_MIN_LENGTH) return `口令至少 ${PASSPHRASE_MIN_LENGTH} 个字符。`
  if ([...normalized].length > PASSPHRASE_MAX_LENGTH) return `口令最多 ${PASSPHRASE_MAX_LENGTH} 个字符。`
  return null
}

const REQUEST_TIMEOUT_MS = 12_000

/**
 * 调用云 API（单 endpoint，action 分派）。
 *  - 网络/超时/非 JSON → { ok:false, code:'server_error', message:'网络错误' }（调用方走本地降级）。
 *  - 409 → { ok:false, code:'conflict', revision }。
 *  - 绝不把 passphrase 写入日志。
 */
export async function callCloudSave(req: CloudSaveRequest, endpointOverride?: string): Promise<CloudSaveResponse> {
  const normalizedPassphrase = normalizePassphrase(req.passphrase)
  const passphraseError = validatePassphrase(normalizedPassphrase)
  if (passphraseError) {
    return { ok: false, code: 'invalid', message: passphraseError }
  }
  const endpoint = (endpointOverride ?? cloudEndpoint()).trim()
  if (!endpoint) {
    return { ok: false, code: 'server_error', message: '云存档服务尚未配置' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const normalizedRequest = { ...req, passphrase: normalizedPassphrase } as CloudSaveRequest
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalizedRequest),
      signal: controller.signal,
    })
    let data: unknown = null
    try {
      data = await res.json()
    } catch {
      return { ok: false, code: 'server_error', message: '云响应格式错误' }
    }
    if (res.status === 409) {
      const d = data as { revision?: unknown }
      return {
        ok: false,
        code: 'conflict',
        revision: Number.isSafeInteger(d?.revision) ? (d.revision as number) : 0,
      }
    }
    if (!res.ok) {
      return { ok: false, code: 'server_error', message: '云存档暂时无法连接。' }
    }
    return data as CloudSaveResponse
  } catch {
    // 网络失败/超时/abort：调用方保留本地存档并标记云同步失败
    return { ok: false, code: 'server_error', message: '云存档暂时无法连接。' }
  } finally {
    clearTimeout(timer)
  }
}
