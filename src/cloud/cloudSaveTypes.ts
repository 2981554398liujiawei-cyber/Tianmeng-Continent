/**
 * 云存档类型与 API contract（TM-P2-005）。
 *
 * 重要（TM-P2-005 66 节）：
 *  Cloud payload 只是 transport/storage 容器，不承载任何 GameState 兼容性。
 *  游戏存档兼容性属于 src/game/utils/storage.ts（migration chain 唯一权威）。
 *  未来 Save V5：只改 storage.ts 的 migration chain，不改云 vault 身份/契约。
 *
 * 云层版本与 Game Save Slot 版本严格分离（TM-P2-005 10 节）：
 *  - SLOT_FORMAT_VERSION（=4）继续表示 GameState schema；本卡不动它。
 *  - CLOUD_SAVE_FORMAT_VERSION（=1）表示云信封格式。
 */

/** 云信封版本（区别于 GameState SLOT_FORMAT_VERSION；见文件头注释） */
export const CLOUD_SAVE_FORMAT_VERSION = 1

/** 口令长度约束（TM-P2-005 19 节：8–128 字符，禁空串；trim 但大小写有意义） */
export const PASSPHRASE_MIN_LENGTH = 8
export const PASSPHRASE_MAX_LENGTH = 128

/** 服务器 body 大小上限（TM-P2-005 18 节：≤ 1 MB；本项目存档远低于此） */
export const CLOUD_BODY_SIZE_LIMIT = 1_000_000

/** 云端空 vault 的 payload 构造函数（TM-P2-005 62 节：唯一构造入口，禁止多处硬编码） */
export function createEmptyCloudVaultPayload(): CloudVaultPayload {
  return {
    cloudVersion: CLOUD_SAVE_FORMAT_VERSION,
    savesExport: {
      version: 2,
      exportedAt: new Date().toISOString(),
      lastSavedSlot: null,
      slots: {
        slot1: null,
        slot2: null,
        slot3: null,
        slot4: null,
        slot5: null,
      },
    },
  }
}

/** 云 vault payload（信封：云版本 + 游戏现有 SavesExport；TM-P2-005 9 节） */
export interface CloudVaultPayload {
  cloudVersion: number
  /** 游戏五槽导出（复用 exportSaves/importSaves 的既有 schema，不发明第二套） */
  savesExport: {
    version: number
    exportedAt: string
    lastSavedSlot: string | null
    slots: Record<string, unknown>
  }
}

/** 云 API 请求（TM-P2-005 11 节：单 endpoint 按 action 分派） */
export type CloudSaveRequest =
  | { action: 'load'; passphrase: string }
  | { action: 'save'; passphrase: string; expectedRevision: number; payload: CloudVaultPayload }
  | { action: 'force_save'; passphrase: string; payload: CloudVaultPayload }

/** 云 API 成功响应 */
export type CloudSaveResponse =
  | { ok: true; exists: boolean; revision: number; payload: CloudVaultPayload | null } // load
  | { ok: true; revision: number } // save / force_save
  | { ok: false; code: 'conflict'; revision: number } // 409：revision CAS 冲突（TM-P2-005 12 节）
  | { ok: false; code: 'invalid'; message: string } // 400：请求/校验失败
  | { ok: false; code: 'server_error'; message: string } // 5xx

/** 前端云连接状态（TM-P2-005 21 节：轻量 runtime state，不入 GameState） */
export type CloudConnectionState = 'locked' | 'loading' | 'connected' | 'error' | 'not_configured'

/** 前端云同步状态（保存生命周期内的短时状态） */
export type CloudSyncStatus =
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'cloud_failed'
  | 'conflict'
  | 'offline'

/** 解锁会话（仅 runtime memory；禁止持久化/日志/URL） */
export interface CloudSession {
  status: CloudConnectionState
  /** 云端当前 revision（0 = 无 vault） */
  revision: number
  /** 口令只存在于 runtime memory（TM-P2-005 8 节） */
  passphrase: string | null
  syncStatus: CloudSyncStatus
}
