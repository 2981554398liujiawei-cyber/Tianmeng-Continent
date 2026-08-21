/**
 * 云会话 runtime store（TM-P2-005 21/8 节）。
 *  - 轻量状态：status/revision/passphrase/syncStatus。
 *  - passphrase 只存在于 runtime memory：禁止 persisted middleware / localStorage / 日志 / URL。
 *  - 云同步只绑定正式存档生命周期（save/delete/import），禁止订阅 GameState 逐变化上传（60 节）。
 *  - 本地失败不因云端失败而丢失（14 节）：调用方先保证本地操作成功，再调 sync 上传。
 */
import { create } from 'zustand'
import { callCloudSave, isCloudConfigured, normalizePassphrase } from './cloudSaveApi'
import {
  createEmptyCloudVaultPayload,
  type CloudSession,
  type CloudSyncStatus,
  type CloudVaultPayload,
} from './cloudSaveTypes'
import { exportSaves, importSaves, hasAnySave } from '../game/utils/storage'
import { useGameStore } from '../game/state/gameStore'

export interface CloudSyncResult {
  outcome: 'synced' | 'conflict' | 'cloud_failed' | 'not_configured'
  revision: number
}

interface CloudSessionStore extends CloudSession {
  /** 解锁：输入口令 → load 云存档 →（存在则导入本地）→ connected */
  unlock: (passphrase: string) => Promise<'connected' | 'error' | 'invalid'>,
  /** 仅本机模式（未配置/服务器不可达降级；24 节：明确显示不会跨设备同步） */
  enterLocalOnly: () => void
  /** 云端存在且本机无档：自动创建空 vault 并进入主菜单 */
  createEmptyVault: () => Promise<'connected' | 'error'>
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

  unlock: async (rawPassphrase) => {
    const passphrase = normalizePassphrase(rawPassphrase)
    if (!passphrase) return 'invalid'
    set({ status: 'loading', passphrase })
    const res = await callCloudSave({ action: 'load', passphrase })
    if (!res.ok || !('exists' in res)) {
      set({ status: 'error', passphrase: null })
      return 'error'
    }
    if (res.exists && res.payload) {
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
      set({ status: 'connected', revision: 0, passphrase, syncStatus: 'idle' })
      return 'connected'
    }
    const created = await get().createEmptyVault()
    return created
  },

  enterLocalOnly: () => {
    set({ status: 'connected', revision: 0, passphrase: null, syncStatus: 'offline' })
  },

  createEmptyVault: async () => {
    const passphrase = get().passphrase
    if (!passphrase) return 'error'
    const payload = createEmptyCloudVaultPayload()
    const res = await callCloudSave({ action: 'save', passphrase, expectedRevision: 0, payload })
    if (res.ok) {
      set({ status: 'connected', revision: res.revision, passphrase })
      return 'connected'
    }
    set({ status: 'error', passphrase: null })
    return 'error'
  },

  uploadLocalAsVault: async () => {
    const passphrase = get().passphrase
    if (!passphrase || !hasAnySave()) return 'error'
    const payload = exportCurrentSaves()
    const res = await callCloudSave({ action: 'save', passphrase, expectedRevision: 0, payload })
    if (res.ok) {
      set({ status: 'connected', revision: res.revision, passphrase, syncStatus: 'synced' })
      return 'connected'
    }
    if (!res.ok && res.code === 'conflict') {
      set({ status: 'connected', revision: res.revision, passphrase })
      return 'conflict'
    }
    set({ status: 'error', passphrase: null })
    return 'error'
  },

  loadCloudLatest: async () => {
    const passphrase = get().passphrase
    if (!passphrase) return 'error'
    const res = await callCloudSave({ action: 'load', passphrase })
    if (!res.ok || !('exists' in res) || !res.exists || !res.payload) {
      set({ syncStatus: 'cloud_failed' })
      return 'error'
    }
    if (!importCloudPayloadToLocal(res.payload)) {
      set({ syncStatus: 'cloud_failed' })
      return 'error'
    }
    useGameStore.getState().refreshSlots()
    set({ revision: res.revision, syncStatus: 'synced' })
    return 'connected'
  },

  forceOverwriteCloud: async () => {
    const passphrase = get().passphrase
    if (!passphrase) return 'cloud_failed'
    const payload = exportCurrentSaves()
    const res = await callCloudSave({ action: 'force_save', passphrase, payload })
    if (res.ok) {
      set({ revision: res.revision, syncStatus: 'synced' })
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
    if (!passphrase) return { outcome: 'cloud_failed', revision: get().revision }
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

export type { CloudSyncStatus }
