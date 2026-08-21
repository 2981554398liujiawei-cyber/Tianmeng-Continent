// ============================================================================
// 《天梦大陆》云存档 Edge Function（TM-P2-005）
// ----------------------------------------------------------------------------
// 单一 endpoint，按请求 body 的 action 分派：load / save / force_save。
//
// 环境变量（必须在部署时通过 secrets 设置，见 docs/cloud-save.md）：
//   VAULT_HMAC_SECRET          → 派生 vault_id 的 HMAC 密钥（服务器端机密）
//   SUPABASE_URL               → 项目 REST URL（如 https://xxxx.supabase.co）
//   SUPABASE_SERVICE_ROLE_KEY  → service role key（服务器端机密，绝不进前端）
//   CORS_ORIGINS（可选）        → 逗号分隔的允许来源；缺省用内置默认列表
//
// 部署：
//   supabase functions deploy cloud-save --no-verify-jwt
//   supabase secrets set VAULT_HMAC_SECRET=... SUPABASE_URL=... \
//     SUPABASE_SERVICE_ROLE_KEY=...
//
//   ⚠️ 必须带 --no-verify-jwt：前端 fetch 不携带 Authorization 头（浏览器
//   只有 anon key，且 anon 不应有函数访问权），默认 verify_jwt 会把所有
//   请求挡在 401。函数内部用 service role 访问 PostgREST，与 JWT 网关无关。
//
// 安全红线：
//   - 绝不把 passphrase 写入日志 / 错误消息 / 响应体以外的任何地方。
//   - 绝不把 payload（含存档数据）写入日志。
//   - vault_id 是 HMAC 哈希，可安全出现在日志与数据库，但不可逆推口令。
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ---------------------------------------------------------------------------
// 常量（与前端 src/cloud/cloudSaveTypes.ts 保持一致）
// ---------------------------------------------------------------------------
const PASSPHRASE_MIN = 8
const PASSPHRASE_MAX = 128
const BODY_SIZE_LIMIT = 1_000_000 // body ≤ 1MB（TM-P2-005 18 节）
const CLOUD_VERSION = 1 // CloudVaultPayload.cloudVersion（CLOUD_SAVE_FORMAT_VERSION）
const HISTORY_KEEP = 5 // 每个 vault 保留最近 5 条历史（人工恢复用途）

/** CORS 默认允许来源：生产 GitHub Pages + 本地开发端口（5173/5199/5198） */
const DEFAULT_ORIGINS = [
  'https://2981554398liujiawei-cyber.github.io',
  'http://localhost:5173',
  'http://localhost:5199',
  'http://localhost:5198',
]

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
function allowedOrigins(): string[] {
  const raw = Deno.env.get('CORS_ORIGINS')
  if (!raw) return DEFAULT_ORIGINS
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
}

const ORIGINS = allowedOrigins()

function corsHeaders(origin: string | null): Record<string, string> {
  if (origin && ORIGINS.includes(origin)) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    }
  }
  return {}
}

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------
function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function badRequest(message: string, headers: Record<string, string>): Response {
  return json({ ok: false, code: 'invalid', message }, 400, headers)
}

function conflict(revision: number, headers: Record<string, string>): Response {
  return json({ ok: false, code: 'conflict', revision }, 409, headers)
}

function serverError(headers: Record<string, string>): Response {
  return json({ ok: false, code: 'server_error', message: '服务器内部错误' }, 500, headers)
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** 口令标准化：trim() 但绝不 lowercase（大小写有意义，与前端一致） */
function normalizePassphrase(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const p = raw.trim()
  if (p.length < PASSPHRASE_MIN || p.length > PASSPHRASE_MAX) return null
  return p
}

/** expectedRevision 必须是安全非负整数（0 = 无 vault 时的首次创建） */
function parseExpectedRevision(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return null
  return v
}

/** 云信封形状校验（与前端 isCloudVaultPayloadShape 一致；服务器侧再次防御） */
function isValidPayload(p: unknown): p is Record<string, unknown> {
  if (!isPlainObject(p)) return false
  if (p.cloudVersion !== CLOUD_VERSION) return false
  if (!isPlainObject(p.savesExport)) return false
  const se = p.savesExport
  if (typeof se.version !== 'number') return false
  if (typeof se.exportedAt !== 'string') return false
  if (!isPlainObject(se.slots)) return false
  return true
}

// ---------------------------------------------------------------------------
// 环境与客户端（惰性初始化；缺失/初始化失败时按 server_error 处理）
// ---------------------------------------------------------------------------
let hmacKey: CryptoKey | null = null
let supabase: ReturnType<typeof createClient> | null = null

async function getHmacKey(): Promise<CryptoKey | null> {
  const secret = Deno.env.get('VAULT_HMAC_SECRET')
  if (!secret) return null
  if (!hmacKey) {
    hmacKey = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  }
  return hmacKey
}

function getSupabase() {
  if (supabase) return supabase
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) return null
  supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return supabase
}

/** vaultId = HMAC-SHA256(VAULT_HMAC_SECRET, normalizedPassphrase) 的 hex */
async function deriveVaultId(passphrase: string): Promise<string | null> {
  const key = await getHmacKey()
  if (!key) return null
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(passphrase))
  let hex = ''
  for (const b of new Uint8Array(sig)) hex += b.toString(16).padStart(2, '0')
  return hex
}

// ---------------------------------------------------------------------------
// 历史快照：覆盖前把旧版写入 cloud_save_history，并裁剪到最近 5 条。
// 尽力而为（不阻塞主流程）：并发下偶发多留/少删一条不影响正确性，
// 历史仅用于人工数据库恢复，UNIQUE(vault_id, revision) 防重复写入。
// ---------------------------------------------------------------------------
async function recordHistory(
  db: NonNullable<ReturnType<typeof getSupabase>>,
  vaultId: string,
  oldRevision: number,
  oldPayload: unknown,
): Promise<void> {
  const { error: insErr } = await db
    .from('cloud_save_history')
    .upsert(
      {
        vault_id: vaultId,
        revision: oldRevision,
        payload: oldPayload,
        created_at: new Date().toISOString(),
      },
      { onConflict: 'vault_id,revision', ignoreDuplicates: true },
    )
  if (insErr) {
    console.error(`[cloud-save] history insert failed (vault=${vaultId.slice(0, 12)} rev=${oldRevision})`)
    return
  }
  // 保留最新 HISTORY_KEEP 条（按 revision 降序），删除更旧的行
  try {
    const { data: all } = await db
      .from('cloud_save_history')
      .select('id')
      .eq('vault_id', vaultId)
      .order('revision', { ascending: false })
      .limit(HISTORY_KEEP + 1)
    if (all && all.length > HISTORY_KEEP) {
      const keep = all.slice(0, HISTORY_KEEP).map((r: { id: number }) => r.id)
      const { data: rows } = await db.from('cloud_save_history').select('id').eq('vault_id', vaultId)
      const del = (rows ?? []).map((r: { id: number }) => r.id).filter((id: number) => !keep.includes(id))
      if (del.length > 0) await db.from('cloud_save_history').delete().in('id', del)
    }
  } catch (err) {
    console.error(`[cloud-save] history prune failed (vault=${vaultId.slice(0, 12)})`, err)
  }
}

// ---------------------------------------------------------------------------
// action 实现
// ---------------------------------------------------------------------------

/** load：SELECT 当前 vault；不存在 → exists:false / revision:0 / payload:null */
async function handleLoad(passphrase: string, headers: Record<string, string>): Promise<Response> {
  const db = getSupabase()
  const vaultId = await deriveVaultId(passphrase)
  if (!db || !vaultId) return serverError(headers)
  const { data, error } = await db
    .from('cloud_save_vaults')
    .select('revision, payload')
    .eq('vault_id', vaultId)
    .maybeSingle()
  if (error) {
    console.error(`[cloud-save] load select failed (vault=${vaultId.slice(0, 12)})`)
    return serverError(headers)
  }
  if (!data) {
    return json({ ok: true, exists: false, revision: 0, payload: null }, 200, headers)
  }
  return json(
    { ok: true, exists: true, revision: data.revision, payload: data.payload },
    200,
    headers,
  )
}

/**
 * save：带 expectedRevision 的乐观并发写入（CAS）。
 *  - vault 不存在：仅 expectedRevision===0 时 INSERT（revision=1）；
 *    INSERT 被并发抢占（ON CONFLICT DO NOTHING 影响 0 行）→ 重读当前 revision 返回 409。
 *  - vault 存在：CAS 更新（WHERE vault_id AND revision=expectedRevision）；
 *    0 行命中 → 重读当前 revision 返回 409。
 *  - 覆盖成功后把旧版写入历史。
 */
async function handleSave(
  passphrase: string,
  expectedRevision: number,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  const db = getSupabase()
  const vaultId = await deriveVaultId(passphrase)
  if (!db || !vaultId) return serverError(headers)

  const { data: cur, error: selErr } = await db
    .from('cloud_save_vaults')
    .select('revision, payload')
    .eq('vault_id', vaultId)
    .maybeSingle()
  if (selErr) {
    console.error(`[cloud-save] save select failed (vault=${vaultId.slice(0, 12)})`)
    return serverError(headers)
  }

  if (!cur) {
    // 新 vault：只允许 expectedRevision===0 的首次创建
    if (expectedRevision !== 0) return conflict(0, headers)
    const { data: inserted, error: insErr } = await db
      .from('cloud_save_vaults')
      .upsert(
        { vault_id: vaultId, revision: 1, payload, updated_at: new Date().toISOString() },
        { onConflict: 'vault_id', ignoreDuplicates: true },
      )
      .select('revision')
    if (insErr) {
      console.error(`[cloud-save] save insert failed (vault=${vaultId.slice(0, 12)})`)
      return serverError(headers)
    }
    if (!inserted || inserted.length === 0) {
      // 并发创建抢占：重读当前 revision 返回冲突
      const { data: reread } = await db
        .from('cloud_save_vaults')
        .select('revision')
        .eq('vault_id', vaultId)
        .maybeSingle()
      return conflict(reread ? reread.revision : 0, headers)
    }
    return json({ ok: true, revision: inserted[0].revision }, 200, headers)
  }

  // 已存在：CAS 更新。PostgREST 不支持 SQL 表达式 revision=revision+1，
  // 用 expectedRevision+1 等价——WHERE revision=expectedRevision 保证并发安全：
  // 只有当前 revision 仍等于期望值时才写，命中即成功（语义同任务卡 SQL）。
  const { data: updated, error: updErr } = await db
    .from('cloud_save_vaults')
    .update({ payload, revision: expectedRevision + 1, updated_at: new Date().toISOString() })
    .eq('vault_id', vaultId)
    .eq('revision', expectedRevision)
    .select('revision')
  if (updErr) {
    console.error(`[cloud-save] save cas update failed (vault=${vaultId.slice(0, 12)})`)
    return serverError(headers)
  }
  if (!updated || updated.length === 0) {
    // CAS 未命中：重读当前 revision 返回 409（前端据此提示冲突并给用户选择）
    const { data: reread } = await db
      .from('cloud_save_vaults')
      .select('revision')
      .eq('vault_id', vaultId)
      .maybeSingle()
    return conflict(reread ? reread.revision : cur.revision, headers)
  }

  // 覆盖前把旧版写入历史（尽力而为）
  await recordHistory(db, vaultId, cur.revision, cur.payload)
  return json({ ok: true, revision: updated[0].revision }, 200, headers)
}

/** force_save：无条件覆盖（前端仅在用户二次确认后调用）；不校验 expectedRevision */
async function handleForceSave(
  passphrase: string,
  payload: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<Response> {
  const db = getSupabase()
  const vaultId = await deriveVaultId(passphrase)
  if (!db || !vaultId) return serverError(headers)

  const { data: cur, error: selErr } = await db
    .from('cloud_save_vaults')
    .select('revision, payload')
    .eq('vault_id', vaultId)
    .maybeSingle()
  if (selErr) {
    console.error(`[cloud-save] force_save select failed (vault=${vaultId.slice(0, 12)})`)
    return serverError(headers)
  }

  if (!cur) {
    // 不存在 → 创建 revision=1
    const { data: inserted, error: insErr } = await db
      .from('cloud_save_vaults')
      .upsert(
        { vault_id: vaultId, revision: 1, payload, updated_at: new Date().toISOString() },
        { onConflict: 'vault_id', ignoreDuplicates: true },
      )
      .select('revision')
    if (insErr) {
      console.error(`[cloud-save] force_save insert failed (vault=${vaultId.slice(0, 12)})`)
      return serverError(headers)
    }
    if (!inserted || inserted.length === 0) {
      const { data: reread } = await db
        .from('cloud_save_vaults')
        .select('revision')
        .eq('vault_id', vaultId)
        .maybeSingle()
      return conflict(reread ? reread.revision : 0, headers)
    }
    return json({ ok: true, revision: inserted[0].revision }, 200, headers)
  }

  // 存在 → 无条件覆盖（revision 仍 +1，保持单调）
  const { data: updated, error: updErr } = await db
    .from('cloud_save_vaults')
    .update({ payload, revision: cur.revision + 1, updated_at: new Date().toISOString() })
    .eq('vault_id', vaultId)
    .select('revision')
  if (updErr) {
    console.error(`[cloud-save] force_save update failed (vault=${vaultId.slice(0, 12)})`)
    return serverError(headers)
  }
  if (!updated || updated.length === 0) {
    const { data: reread } = await db
      .from('cloud_save_vaults')
      .select('revision')
      .eq('vault_id', vaultId)
      .maybeSingle()
    return conflict(reread ? reread.revision : cur.revision, headers)
  }

  await recordHistory(db, vaultId, cur.revision, cur.payload)
  return json({ ok: true, revision: updated[0].revision }, 200, headers)
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  const headers = corsHeaders(origin)

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }
  if (req.method !== 'POST') {
    return badRequest('仅支持 POST', headers)
  }
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().includes('application/json')) {
    return badRequest('仅接受 application/json', headers)
  }

  // body ≤ 1MB（读原始字节判断，兼容 chunked 传输）
  let raw: string
  try {
    const buf = await req.arrayBuffer()
    if (buf.byteLength > BODY_SIZE_LIMIT) {
      return badRequest('请求体超过 1MB 限制', headers)
    }
    raw = new TextDecoder().decode(buf)
  } catch {
    return badRequest('无法读取请求体', headers)
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return badRequest('JSON 解析失败', headers)
  }
  if (!isPlainObject(body)) {
    return badRequest('请求体必须是 JSON 对象', headers)
  }

  const action = body.action
  if (action !== 'load' && action !== 'save' && action !== 'force_save') {
    return badRequest('未知 action', headers)
  }

  const passphrase = normalizePassphrase(body.passphrase)
  if (!passphrase) {
    return badRequest(`口令必须是 ${PASSPHRASE_MIN}-${PASSPHRASE_MAX} 个字符（去除首尾空白后）`, headers)
  }

  try {
    if (action === 'load') {
      return await handleLoad(passphrase, headers)
    }
    if (action === 'force_save') {
      if (!isValidPayload(body.payload)) {
        return badRequest('payload 格式非法', headers)
      }
      return await handleForceSave(passphrase, body.payload, headers)
    }
    // action === 'save'
    const expectedRevision = parseExpectedRevision(body.expectedRevision)
    if (expectedRevision === null) {
      return badRequest('expectedRevision 必须是非负整数', headers)
    }
    if (!isValidPayload(body.payload)) {
      return badRequest('payload 格式非法', headers)
    }
    return await handleSave(passphrase, expectedRevision, body.payload, headers)
  } catch (err) {
    // 只记录动作类型，绝不记录 passphrase / payload
    console.error(`[cloud-save] unhandled error (action=${action})`, err)
    return serverError(headers)
  }
})
