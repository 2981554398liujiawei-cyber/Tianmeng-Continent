/**
 * 云存档单元测试（TM-P2-005 41 节清单）。
 *  - 口令校验/标准化（trim、大小写敏感、空/过短/过长拒绝）
 *  - 信封构造与形状校验
 *  - 云端导入失败不破坏本地存档（64 节 failure atomicity）
 *  - mock handler 的 load/save/conflict/force 行为（与生产 contract 一致）
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createEmptyCloudVaultPayload, CLOUD_SAVE_FORMAT_VERSION } from './cloudSaveTypes'
import { callCloudSave, normalizePassphrase, validatePassphrase } from './cloudSaveApi'
import { cloudVaultsContainSameSaves, getLatestCloudSaveSummary, isCloudVaultPayloadShape, importCloudPayloadToLocal, loadCloudSaveWithRetry, useCloudSession } from './cloudSessionStore'
// QA handler is a Node-only .mjs module; its runtime is covered by the cloud E2E.
// @ts-expect-error no browser-side declaration is emitted for the Node QA helper.
import { createMockCloudStore, handleCloudRequest } from '../../qa/cloud-save-mock-handler.mjs'

describe('TM-P2-005：口令标准化与校验（7.2/19 节）', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('normalize：trim 但保留大小写（" MySave " → "MySave"；不 lowercase）', () => {
    expect(normalizePassphrase('  MySave  ')).toBe('MySave')
    expect(normalizePassphrase('MySave')).toBe('MySave')
    expect(normalizePassphrase('MySave')).not.toBe('mysave')
  })

  it('normalize：前后端统一使用 NFKC（全角字符折叠）', () => {
    expect(normalizePassphrase('  ＴＭ－Ｐ２－００５  ')).toBe('TM-P2-005')
  })

  it('空口令拒绝', () => {
    expect(validatePassphrase('')).not.toBeNull()
    expect(validatePassphrase('   ')).not.toBeNull()
  })

  it('过短拒绝（<8）', () => {
    expect(validatePassphrase('short')).not.toBeNull()
  })

  it('过长拒绝（>128）', () => {
    expect(validatePassphrase('x'.repeat(129))).not.toBeNull()
  })

  it('合法 8-128 字符通过', () => {
    expect(validatePassphrase('TM-LJW-MAIN-2026')).toBeNull()
    expect(validatePassphrase('E2E-CLOUD-TEST-ABC')).toBeNull()
  })

  it('大小写不同 → 不同 vault（handler 层）', async () => {
    const store = createMockCloudStore()
    const a = await handleCloudRequest(store, { action: 'save', passphrase: 'CloudPassA', expectedRevision: 0, payload: createEmptyCloudVaultPayload() })
    const b = await handleCloudRequest(store, { action: 'load', passphrase: 'cloudpassa' })
    expect(a.status).toBe(200)
    expect(b.json).toMatchObject({ ok: true, exists: false })
  })
})

describe('TM-P2-010-R1：LOAD retry policy（CLD1-CLD6）', () => {
  it('transient server_error retries at most twice, then succeeds', async () => {
    const responses = [
      { ok: false, code: 'server_error', message: 'temporary' } as const,
      { ok: false, code: 'server_error', message: 'temporary' } as const,
      { ok: true, exists: false, revision: 0 } as const,
    ]
    const calls: string[] = []
    const result = await loadCloudSaveWithRetry('RetryPass', async (passphrase) => { calls.push(passphrase); return responses.shift()! })
    expect(result).toMatchObject({ ok: true, exists: false })
    expect(calls).toEqual(['RetryPass', 'RetryPass', 'RetryPass'])
  }, 5000)

  it('validation and conflict are never retried', async () => {
    for (const response of [
      { ok: false, code: 'invalid', message: 'bad' } as const,
      { ok: false, code: 'conflict', revision: 2 } as const,
    ]) {
      let calls = 0
      const result = await loadCloudSaveWithRetry('NoRetryPass', async () => { calls += 1; return response })
      expect(result).toEqual(response)
      expect(calls).toBe(1)
    }
  })

  it('final transient failure is returned after exactly three attempts', async () => {
    let calls = 0
    const result = await loadCloudSaveWithRetry('FailPass', async () => { calls += 1; return { ok: false, code: 'server_error', message: 'down' } as const })
    expect(result).toMatchObject({ ok: false, code: 'server_error' })
    expect(calls).toBe(3)
  }, 5000)
})

describe('TM-P2-005：云信封构造与形状（9/18/62 节）', () => {
  it('createEmptyCloudVaultPayload：cloudVersion=1 + 空五槽 SavesExport', () => {
    const payload = createEmptyCloudVaultPayload()
    expect(payload.cloudVersion).toBe(CLOUD_SAVE_FORMAT_VERSION)
    expect(payload.savesExport.version).toBe(2)
    expect(payload.savesExport.lastSavedSlot).toBeNull()
    for (const slot of ['slot1', 'slot2', 'slot3', 'slot4', 'slot5']) {
      expect(payload.savesExport.slots[slot]).toBeNull()
    }
  })

  it('isCloudVaultPayloadShape：合法通过；缺字段/错版本拒绝', () => {
    expect(isCloudVaultPayloadShape(createEmptyCloudVaultPayload())).toBe(true)
    expect(isCloudVaultPayloadShape(null)).toBe(false)
    expect(isCloudVaultPayloadShape({ cloudVersion: 2, savesExport: {} })).toBe(false)
    expect(isCloudVaultPayloadShape({ cloudVersion: 1 })).toBe(false)
    expect(isCloudVaultPayloadShape({ cloudVersion: 1, savesExport: { version: 'x' } })).toBe(false)
  })
})

describe('TM-P2-005-R1：云解锁存档身份比较', () => {
  it('相同档忽略导出时间，可安全连接', () => {
    const local = createEmptyCloudVaultPayload()
    const cloud = structuredClone(local)
    cloud.savesExport.exportedAt = '2099-01-01T00:00:00.000Z'
    expect(cloudVaultsContainSameSaves(local, cloud)).toBe(true)
  })

  it('按 Unicode code points 计数，代理对不被重复计算', () => {
    expect(validatePassphrase('😀'.repeat(8))).toBeNull()
    expect(validatePassphrase('😀'.repeat(7))).not.toBeNull()
    expect(validatePassphrase('😀'.repeat(128))).toBeNull()
    expect(validatePassphrase('😀'.repeat(129))).not.toBeNull()
  })

  it.each(['load', 'save', 'force_save'] as const)('API %s：无效口令返回 invalid 且 fetch 0 次', async (action) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const payload = createEmptyCloudVaultPayload()
    const request = action === 'load'
      ? { action, passphrase: 'short' } as const
      : action === 'save'
        ? { action, passphrase: 'short', expectedRevision: 0, payload } as const
        : { action, passphrase: 'short', payload } as const
    await expect(callCloudSave(request, 'https://cloud.example.test')).resolves.toMatchObject({ ok: false, code: 'invalid' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each(['load', 'save', 'force_save'] as const)('API %s：129 Unicode code points 返回 invalid 且 fetch 0 次', async (action) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const payload = createEmptyCloudVaultPayload()
    const passphrase = '😀'.repeat(129)
    const request = action === 'load'
      ? { action, passphrase } as const
      : action === 'save'
        ? { action, passphrase, expectedRevision: 0, payload } as const
        : { action, passphrase, payload } as const
    await expect(callCloudSave(request, 'https://cloud.example.test')).resolves.toMatchObject({ ok: false, code: 'invalid' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('session unlock：short 直接返回 invalid 且 fetch 0 次', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(useCloudSession.getState().unlock('short')).resolves.toBe('invalid')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('API NFKC 后恰好 8 code points 可发送', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, exists: false, revision: 0, payload: null }),
    })
    vi.stubGlobal('fetch', fetchSpy)
    const rawPassphrase = '  Ｃｌｏｕｄ１２３  '
    expect([...normalizePassphrase(rawPassphrase)]).toHaveLength(8)
    expect(validatePassphrase(rawPassphrase)).toBeNull()
    await expect(callCloudSave({ action: 'load', passphrase: rawPassphrase }, 'https://cloud.example.test'))
      .resolves.toMatchObject({ ok: true, exists: false })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const requestInit = fetchSpy.mock.calls[0]![1] as RequestInit
    expect(JSON.parse(requestInit.body as string)).toMatchObject({ passphrase: 'Cloud123' })
  })

  it('本机槽位更新时判为 divergent，不能视为相同档', () => {
    const cloud = createEmptyCloudVaultPayload()
    const local = structuredClone(cloud)
    local.savesExport.slots.slot1 = {
      version: 5,
      savedAt: '2099-01-01T00:00:00.000Z',
      gameState: { marker: 'local-newer' },
    }
    local.savesExport.lastSavedSlot = 'slot1'
    expect(cloudVaultsContainSameSaves(local, cloud)).toBe(false)
  })

  it('云端与本机各自变化时判为 divergent', () => {
    const local = createEmptyCloudVaultPayload()
    const cloud = structuredClone(local)
    local.savesExport.slots.slot1 = { marker: 'local' }
    cloud.savesExport.slots.slot1 = { marker: 'cloud' }
    expect(cloudVaultsContainSameSaves(local, cloud)).toBe(false)
  })

  it('Continue 槽位不同也不是相同档', () => {
    const local = createEmptyCloudVaultPayload()
    const cloud = structuredClone(local)
    local.savesExport.lastSavedSlot = 'slot1'
    expect(cloudVaultsContainSameSaves(local, cloud)).toBe(false)
  })

  it('摘要选择 savedAt 最新槽并返回角色、等级、地点、保存时间', () => {
    const payload = createEmptyCloudVaultPayload()
    payload.savesExport.slots.slot1 = {
      savedAt: '2026-01-01T00:00:00.000Z',
      gameState: { player: { name: '旧角色', level: 2 }, world: { currentLocationId: 'old_place' } },
    }
    payload.savesExport.slots.slot4 = {
      savedAt: '2026-08-21T00:00:00.000Z',
      gameState: { player: { name: '天梦行者', level: 5 }, world: { currentLocationId: 'tianlong_city' } },
    }
    expect(getLatestCloudSaveSummary(payload)).toEqual({
      playerName: '天梦行者', level: 5, locationId: 'tianlong_city', savedAt: '2026-08-21T00:00:00.000Z',
    })
  })
})

describe('TM-P2-005：mock handler 与生产 contract 一致（11/12/13/31 节）', () => {
  it('load 不存在的口令 → exists:false revision:0', async () => {
    const store = createMockCloudStore()
    const res = await handleCloudRequest(store, { action: 'load', passphrase: 'E2E-CLOUD-TEST-AAA' })
    expect(res.status).toBe(200)
    expect(res.json).toMatchObject({ ok: true, exists: false, revision: 0, payload: null })
  })

  it('save expectedRevision=0 创建 → revision 1；再次 save → revision 2', async () => {
    const store = createMockCloudStore()
    const r1 = await handleCloudRequest(store, { action: 'save', passphrase: 'E2E-CLOUD-TEST-BBB', expectedRevision: 0, payload: createEmptyCloudVaultPayload() })
    expect(r1.status).toBe(200)
    expect(r1.json).toMatchObject({ ok: true, revision: 1 })
    const r2 = await handleCloudRequest(store, { action: 'save', passphrase: 'E2E-CLOUD-TEST-BBB', expectedRevision: 1, payload: createEmptyCloudVaultPayload() })
    expect(r2.json).toMatchObject({ ok: true, revision: 2 })
  })

  it('save revision 冲突（旧 expectedRevision）→ 409 + 服务器当前 revision；不覆盖', async () => {
    const store = createMockCloudStore()
    await handleCloudRequest(store, { action: 'save', passphrase: 'E2E-CLOUD-TEST-CCC', expectedRevision: 0, payload: createEmptyCloudVaultPayload() })
    await handleCloudRequest(store, { action: 'save', passphrase: 'E2E-CLOUD-TEST-CCC', expectedRevision: 1, payload: createEmptyCloudVaultPayload() })
    const conflict = await handleCloudRequest(store, { action: 'save', passphrase: 'E2E-CLOUD-TEST-CCC', expectedRevision: 1, payload: createEmptyCloudVaultPayload() })
    expect(conflict.status).toBe(409)
    expect(conflict.json).toMatchObject({ ok: false, code: 'conflict', revision: 2 })
    const load = await handleCloudRequest(store, { action: 'load', passphrase: 'E2E-CLOUD-TEST-CCC' })
    expect(load.json.revision).toBe(2)
  })

  it('force_save 无条件覆盖 → revision+1', async () => {
    const store = createMockCloudStore()
    await handleCloudRequest(store, { action: 'save', passphrase: 'E2E-CLOUD-TEST-DDD', expectedRevision: 0, payload: createEmptyCloudVaultPayload() })
    const forced = await handleCloudRequest(store, { action: 'force_save', passphrase: 'E2E-CLOUD-TEST-DDD', payload: createEmptyCloudVaultPayload() })
    expect(forced.json).toMatchObject({ ok: true, revision: 2 })
  })

  it('passphrase 过短 → 400 invalid', async () => {
    const store = createMockCloudStore()
    const res = await handleCloudRequest(store, { action: 'load', passphrase: 'short' })
    expect(res.status).toBe(400)
    expect(res.json.code).toBe('invalid')
  })

  it('payload 校验：cloudVersion 错误 → 400 invalid', async () => {
    const store = createMockCloudStore()
    const res = await handleCloudRequest(store, {
      action: 'save',
      passphrase: 'E2E-CLOUD-TEST-EEE',
      expectedRevision: 0,
      payload: { cloudVersion: 99, savesExport: { version: 2, exportedAt: 'x', slots: {} } },
    })
    expect(res.status).toBe(400)
    expect(res.json.code).toBe('invalid')
  })

  it('未知 action → 400 invalid', async () => {
    const store = createMockCloudStore()
    const res = await handleCloudRequest(store, { action: 'delete_everything', passphrase: 'E2E-CLOUD-TEST-FFF' })
    expect(res.status).toBe(400)
  })

  it('历史保留：覆盖前旧版本进入 history（上限 5）', async () => {
    const store = createMockCloudStore()
    for (let i = 0; i < 7; i += 1) {
      const rev = i === 0 ? 0 : i
      await handleCloudRequest(store, { action: 'save', passphrase: 'E2E-CLOUD-TEST-HHH', expectedRevision: rev, payload: createEmptyCloudVaultPayload() })
    }
    const history = store.history.get(store.vaults.keys().next().value)
    expect(history!.length).toBeLessThanOrEqual(5)
  })
})

describe('TM-P2-005：云导入失败不破坏本地（64 节 failure atomicity）', () => {
  it('malformed cloud payload → 拒绝且本地合法档保持（用空 localStorage 环境验证返回 false）', () => {
    expect(importCloudPayloadToLocal(null)).toBe(false)
    expect(importCloudPayloadToLocal({ cloudVersion: 1 })).toBe(false)
    expect(importCloudPayloadToLocal({ cloudVersion: 1, savesExport: { version: 2, exportedAt: 'x', slots: { slot1: 'not-a-slot' } } })).toBe(false)
  })
})
