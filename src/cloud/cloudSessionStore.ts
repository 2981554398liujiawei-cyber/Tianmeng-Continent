/**
 * 云会话 runtime store（TM-P2-005 21/8 节）。
 *  - 轻量状态：status/revision/passphrase/syncStatus。
 *  - passphrase 只存在于 runtime memory：禁止 persisted middleware / localStorage / 日志 / URL。
 *  - 云同步只绑定正式存档生命周期（save/delete/import），禁止订阅 GameState 逐变化上传（60 节）。
 *  - 本地失败不因云端失败而丢失（14 节）：调用方先保证本地操作成功，再调 sync 上传。
 */
import { create } from 'zustand'
import { callCloudSave, isCloudConfigured, normalizePassphrase, validatePassphrase } from './cloudSaveApi'
import {
  createEmptyCloudVaultPayload,
  type CloudSession,
  type CloudSyncStatus,
  type CloudVaultPayload,
  type CloudSaveResponse,
} from './cloudSaveTypes'
import { exportSaves, importSaves, hasAnySave } from '../game/utils/storage'
import { useGameStore } from '../game/state/gameStore'

export interface CloudSyncResult {
  outcome: 'synced' | 'conflict' | 'cloud_failed' | 'not_configured'
  revision: number
}

export interface CloudSaveSummary {
  playerName: string
  level: number
  locationId: string
  savedAt: string
}

export interface CloudUnlockConflict {
  local: CloudSaveSummary | null
  cloud: CloudSaveSummary | null
}

interface CloudSessionStore extends CloudSession {
  unlockConflict: CloudUnlockConflict | null
  /** 解锁：输入口令 → load 云存档 →（存在则导入本地）→ connected */
  unlock: (passphrase: string) => Promise<'connected' | 'error' | 'invalid'>,
  /** 仅本机模式（未配置/服务器不可达降级；24 节：明确显示不会跨设备同步） */
  enterLocalOnly: () => void
  /** 云端存在且本机无档：自动创建空 vault 并进入主菜单 */
  createEmptyVault: () => Promise<'connected' | 'error' | 'conflict'>
  /** 云端不存在 + 本机有档：把本机五槽上传为 vault 初始版本（16 节迁移体验） */
  uploadLocalAsVault: () => Promise<'connected' | 'error' | 'conflict'>
  /** 冲突时读取云端最新版（12.1 节；导入前备份本地，导入失败自动回滚） */
  loadCloudLatest: () => Promise<'connected' | 'error'>
  /** 冲突时用当前本地档强制覆盖云端（13 节：仅二次确认后调用） */
  forceOverwriteCloud: () => Promise<'synced' | 'conflict' | 'cloud_failed'>
  /** 保存生命周期后的同步（save/delete/import 已成功写本地 → 上传当前五槽） */
  syncAfterLocalSave: () => Promise<CloudSyncResult>
  /** 同步冲突后由用户选择：读取云端最新版 */
  resolveConflictByLoading: () => Promise<boolean>
  /** 同步冲突后由用户选择：强制覆盖云端（二次确认后调用） */
  resolveConflictByOverwrite: () => Promise<boolean>
  resetSyncStatus: () => void
}

/** 从当前本地存档系统导出五槽（复用既有 exportSaves schema） */
function exportCurrentSaves(): CloudVaultPayload {
  return {
    cloudVersion: 1,
    savesExport: JSON.parse(exportSaves()) as CloudVaultPayload['savesExport'],
  }
}

export const useCloudSession = create<CloudSessionStore>()((set, get) => ({
  status: isCloudConfigured() ? 'locked' : 'not_configured',
  revision: 0,
  passphrase: null,
  syncStatus: 'idle',
  unlockConflict: null,

  unlock: async (rawPassphrase) => {
    const passphrase = normalizePassphrase(rawPassphrase)
    if (validatePassphrase(passphrase)) return 'invalid'
    set({ status: 'loading', passphrase, unlockConflict: null })
    const res = await loadCloudSaveWithRetry(passphrase)
    if (!res.ok || !('exists' in res)) {
      set({ status: 'error', passphrase: null })
      return 'error'
    }
    if (res.exists && res.payload) {
      if (hasAnySave()) {
        const localPayload = exportCurrentSaves()
        if (!cloudVaultsContainSameSaves(localPayload, res.payload)) {
          // Both sides contain valid but different saves.  Unlocking establishes the
          // session, but must never choose a winner: the existing conflict actions
          // remain the only paths that may load cloud or force-overwrite it.
          set({
            status: 'locked', revision: res.revision, passphrase, syncStatus: 'conflict',
            unlockConflict: {
              local: getLatestCloudSaveSummary(localPayload),
              cloud: getLatestCloudSaveSummary(res.payload),
            },
          })
          return 'connected'
        }
        // exportSaves() generates a fresh exportedAt on every call.  Matching save
        // contents are already connected safely and do not need a destructive import.
        set({ status: 'connected', revision: res.revision, passphrase, syncStatus: 'synced', unlockConflict: null })
        return 'connected'
      }
      // 云端为该口令的主档 → 导入本地（导入前备份，失败回滚；不破坏本机已有合法档）
      const imported = importCloudPayloadToLocal(res.payload)
      if (!imported) {
        set({ status: 'error', passphrase: null })
        return 'error'
      }
      // 导入后刷新槽位索引，「继续游戏」才可用（TM-P2-005 27 节）
      useGameStore.getState().refreshSlots()
      set({ status: 'connected', revision: res.revision, passphrase })
      return 'connected'
    }
    // 云端不存在：本机已有有效存档 → 留在口令页给出上传/空白选择（15.1 节）；无档 → 自动创建空 vault
    if (hasAnySave()) {
      set({ status: 'migration_choice', revision: 0, passphrase, syncStatus: 'idle' })
      return 'connected'
    }
    const created = await get().createEmptyVault()
    // 抢先创建会设置 unlockConflict；沿用 unlock 的 connected 语义，UI 据此留在冲突页。
    return created === 'conflict' ? 'connected' : created
  },

  enterLocalOnly: () => {
    set({ status: 'connected', revision: 0, passphrase: null, syncStatus: 'offline', unlockConflict: null })
  },

  createEmptyVault: async () => {
    const passphrase = get().passphrase
    if (!passphrase || validatePassphrase(passphrase)) return 'error'
    const payload = createEmptyCloudVaultPayload()
    const res = await callCloudSave({ action: 'save', passphrase, expectedRevision: 0, payload })
    if (res.ok) {
      set({ status: 'connected', revision: res.revision, passphrase, syncStatus: 'synced', unlockConflict: null })
      return 'connected'
    }
    if (res.code === 'conflict') {
      return enterVaultCreationConflict(passphrase, res.revision, set)
    }
    set({ status: 'error', passphrase: null })
    return 'error'
  },

  uploadLocalAsVault: async () => {
    const passphrase = get().passphrase
    if (!passphrase || validatePassphrase(passphrase) || !hasAnySave()) return 'error'
    const payload = exportCurrentSaves()
    const res = await callCloudSave({ action: 'save', passphrase, expectedRevision: 0, payload })
    if (res.ok) {
      set({ status: 'connected', revision: res.revision, passphrase, syncStatus: 'synced' })
      return 'connected'
    }
    if (!res.ok && res.code === 'conflict') {
      return enterVaultCreationConflict(passphrase, res.revision, set)
    }
    set({ status: 'error', passphrase: null })
    return 'error'
  },

  loadCloudLatest: async () => {
    const passphrase = get().passphrase
    if (!passphrase || validatePassphrase(passphrase)) return 'error'
    const res = await loadCloudSaveWithRetry(passphrase)
    if (!res.ok || !('exists' in res) || !res.exists || !res.payload) {
      set({ syncStatus: 'cloud_failed' })
      return 'error'
    }
    if (!importCloudPayloadToLocal(res.payload)) {
      set({ syncStatus: 'cloud_failed' })
      return 'error'
    }
    useGameStore.getState().refreshSlots()
    set({ status: 'connected', revision: res.revision, syncStatus: 'synced', unlockConflict: null })
    return 'connected'
  },

  forceOverwriteCloud: async () => {
    const passphrase = get().passphrase
    if (!passphrase || validatePassphrase(passphrase)) return 'cloud_failed'
    const payload = exportCurrentSaves()
    const res = await callCloudSave({ action: 'force_save', passphrase, payload })
    if (res.ok) {
      set({ status: 'connected', revision: res.revision, syncStatus: 'synced', unlockConflict: null })
      return 'synced'
    }
    set({ syncStatus: 'cloud_failed' })
    return 'cloud_failed'
  },

  syncAfterLocalSave: async () => {
    const { status, passphrase, syncStatus } = get()
    if (status === 'not_configured') return { outcome: 'not_configured', revision: 0 }
    // 仅本机模式（offline）：本地操作正常，不上传
    if (syncStatus === 'offline') return { outcome: 'not_configured', revision: 0 }
    if (!passphrase || validatePassphrase(passphrase)) return { outcome: 'cloud_failed', revision: get().revision }
    set({ syncStatus: 'syncing' })
    const payload = exportCurrentSaves()
    const res = await callCloudSave({ action: 'save', passphrase, expectedRevision: get().revision, payload })
    if (res.ok) {
      set({ revision: res.revision, syncStatus: 'synced' })
      return { outcome: 'synced', revision: res.revision }
    }
    if (!res.ok && res.code === 'conflict') {
      set({ syncStatus: 'conflict', revision: res.revision })
      return { outcome: 'conflict', revision: res.revision }
    }
    set({ syncStatus: 'cloud_failed' })
    return { outcome: 'cloud_failed', revision: get().revision }
  },

  resolveConflictByLoading: async () => {
    set({ syncStatus: 'syncing' })
    const ok = await get().loadCloudLatest()
    if (ok !== 'connected') {
      set({ syncStatus: 'cloud_failed' })
      return false
    }
    return true
  },

  resolveConflictByOverwrite: async () => {
    set({ syncStatus: 'syncing' })
    const result = await get().forceOverwriteCloud()
    return result === 'synced'
  },

  resetSyncStatus: () => set({ syncStatus: 'idle' }),
}))

async function enterVaultCreationConflict(
  passphrase: string,
  conflictRevision: number,
  set: (partial: Partial<CloudSessionStore>) => void,
): Promise<'conflict' | 'error'> {
  const latest = await loadCloudSaveWithRetry(passphrase)
  if (!latest.ok || !('exists' in latest) || !latest.exists || !latest.payload) {
    set({ status: 'error', revision: conflictRevision, passphrase: null, syncStatus: 'cloud_failed' })
    return 'error'
  }
  const localPayload = exportCurrentSaves()
  set({
    status: 'locked',
    revision: latest.revision,
    passphrase,
    syncStatus: 'conflict',
    unlockConflict: {
      local: getLatestCloudSaveSummary(localPayload),
      cloud: getLatestCloudSaveSummary(latest.payload),
    },
  })
  return 'conflict'
}

/**
 * 云端 payload → 本地存档（TM-P2-005 64/65 节）：
 *  - 导入前导出当前本地五槽为 runtime 备份；importSaves 自带事务语义，失败自动回滚。
 *  - cloud payload malformed → 不触碰本地（本机已有合法档必须保持）。
 *  - payload 内的旧版 SaveSlot 由既有 migration chain 在读取时升级（lazy migration，17.1 节）。
 */
export function importCloudPayloadToLocal(payload: unknown): boolean {
  if (!isCloudVaultPayloadShape(payload)) return false
  try {
    const json = JSON.stringify(payload.savesExport)
    // importSaves 执行完整游戏 schema validation + 迁移链；失败返回 false 且不动本地
    return importSaves(json)
  } catch {
    return false
  }
}

/** 云信封形状校验（服务器也已校验；前端再次防御） */
export function isCloudVaultPayloadShape(value: unknown): value is CloudVaultPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (v.cloudVersion !== 1) return false
  const se = v.savesExport
  if (typeof se !== 'object' || se === null) return false
  const s = se as Record<string, unknown>
  if (typeof s.version !== 'number') return false
  if (typeof s.exportedAt !== 'string') return false
  if (typeof s.slots !== 'object' || s.slots === null) return false
  return true
}

/**
 * Compare the durable save identity of two vaults. `exportedAt` describes the
 * transport/export operation, so it is deliberately excluded; slot `savedAt`,
 * game state, slot occupancy, and Continue semantics all remain significant.
 */
export function cloudVaultsContainSameSaves(a: unknown, b: unknown): boolean {
  if (!isCloudVaultPayloadShape(a) || !isCloudVaultPayloadShape(b)) return false
  return deepEqualJson(
    {
      cloudVersion: a.cloudVersion,
      version: a.savesExport.version,
      lastSavedSlot: a.savesExport.lastSavedSlot,
      slots: a.savesExport.slots,
    },
    {
      cloudVersion: b.cloudVersion,
      version: b.savesExport.version,
      lastSavedSlot: b.savesExport.lastSavedSlot,
      slots: b.savesExport.slots,
    },
  )
}

/** Read the newest slot's display fields defensively from local or cloud payloads. */
export function getLatestCloudSaveSummary(payload: unknown): CloudSaveSummary | null {
  if (!isCloudVaultPayloadShape(payload)) return null
  let latest: CloudSaveSummary | null = null
  let latestTime = -1
  for (const slot of Object.values(payload.savesExport.slots)) {
    if (typeof slot !== 'object' || slot === null) continue
    const record = slot as Record<string, unknown>
    const state = record.gameState
    if (typeof record.savedAt !== 'string' || typeof state !== 'object' || state === null) continue
    const player = (state as Record<string, unknown>).player
    const world = (state as Record<string, unknown>).world
    if (typeof player !== 'object' || player === null || typeof world !== 'object' || world === null) continue
    const p = player as Record<string, unknown>
    const w = world as Record<string, unknown>
    const time = Date.parse(record.savedAt)
    if (typeof p.name !== 'string' || typeof p.level !== 'number' || typeof w.currentLocationId !== 'string' || !Number.isFinite(time) || time <= latestTime) continue
    latestTime = time
    latest = { playerName: p.name, level: p.level, locationId: w.currentLocationId, savedAt: record.savedAt }
  }
  return latest
}

function deepEqualJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((value, index) => deepEqualJson(value, b[index]))
  }
  const aRecord = a as Record<string, unknown>
  const bRecord = b as Record<string, unknown>
  const aKeys = Object.keys(aRecord).sort()
  const bKeys = Object.keys(bRecord).sort()
  return aKeys.length === bKeys.length &&
    aKeys.every((key, index) => key === bKeys[index] && deepEqualJson(aRecord[key], bRecord[key]))
}

/**
 * LOAD-only resilience policy (TM-P2-010-R1 CLD1-CLD6).
 * Retry only transient server/network failures, with the two prescribed waits.
 * Save, force_save, conflicts, validation failures and malformed successful
 * responses are returned immediately to their caller.
 */
export async function loadCloudSaveWithRetry(
  passphrase: string,
  loadCall: (value: string) => Promise<CloudSaveResponse> = (value) => callCloudSave({ action: 'load', passphrase: value }),
): Promise<CloudSaveResponse> {
  const waits = [500, 1200]
  let result = await loadCall(passphrase)
  for (const wait of waits) {
    if (result.ok || result.code !== 'server_error') return result
    await new Promise((resolve) => setTimeout(resolve, wait))
    result = await loadCall(passphrase)
  }
  return result
}

export type { CloudSyncStatus }
