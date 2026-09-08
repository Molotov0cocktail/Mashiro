import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { canonicalProductionDirectory } from './production-location.js'

export type StartupStage =
  | 'RUNTIME_PATHS'
  | 'SESSION_PREPARE'
  | 'ASSISTANT_OPEN'
  | 'PROVIDER_OPEN'
  | 'IPC_REGISTER'
  | 'WINDOW_LOAD'
  | 'REMINDER_START'

export type StartupCleanup = 'NOT_STARTED' | 'COMPLETE' | 'FAILED'

export interface StartupFailureDiagnostic {
  formatVersion: 1
  correlationId: string
  observedAt: string
  stage: StartupStage
  code: StartupFailureCode
  cleanup: StartupCleanup
}

type StartupFailureCode =
  | 'ACCESS_DENIED'
  | 'DATA_IN_USE'
  | 'DATA_UNAVAILABLE'
  | 'DISK_FULL'
  | 'INTEGRITY_FAILED'
  | 'LOCATION_INVALID'
  | 'SCHEMA_UNSUPPORTED'
  | 'STORAGE_BUSY'
  | 'UNEXPECTED'

const accessDenied = new Set(['EACCES', 'EPERM'])
const dataInUse = new Set(['DATA_SET_IN_USE', 'EADDRINUSE'])
const dataUnavailable = new Set([
  'ENOENT',
  'DATA_SET_DATABASE_MISSING',
  'DATA_SET_LOCK_LOST',
  'DATA_SET_LOCK_TIMEOUT',
  'DATA_SET_LOCK_UNAVAILABLE',
  'DATA_SET_NOT_OWNED',
  'PREPARATION_CANCELLED',
  'PRODUCTION_OWNERSHIP_LOST'
])
const integrityFailed = new Set([
  'DATA_SET_DATABASE_INVALID',
  'DATA_SET_IDENTITY_MISMATCH',
  'DATA_SET_MANIFEST_CHANGED',
  'GOVERNANCE_KNOWN_LOCATOR_REQUIRES_LEDGER',
  'GOVERNANCE_STATE_UNCERTAIN',
  'INITIALIZED_SCHEMA_INVALID',
  'PREPARATION_DATABASE_INVALID',
  'PREPARATION_MIGRATION_INVALID',
  'STORAGE_INCONSISTENT'
])
const locationInvalid = new Set([
  'DATA_SET_LOCATION_CHANGED',
  'DATA_SET_NOT_EMPTY',
  'LOCATION_CHANGED_DURING_OPEN',
  'LOCATION_CHANGED_DURING_PREPARATION',
  'LOCATION_CHANGED_DURING_SELECTION',
  'LOCATION_CHANGED_OR_UNREADABLE',
  'LOCATION_FILE_INVALID',
  'LOCATION_UNSAFE',
  'LOCATION_UNSUPPORTED',
  'SNAPSHOT_RESTORE_REQUIRED'
])
const storageBusy = new Set(['EBUSY', 'EMFILE', 'ENFILE', 'EIO'])

function rawCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const system = 'code' in error ? error.code : undefined
  if (typeof system === 'string') return system
  const message = error instanceof Error ? error.message : null
  return message && /^[A-Z][A-Z0-9_]{2,79}$/u.test(message) ? message : null
}

export function allowlistedStartupFailureCode(error: unknown): StartupFailureCode {
  const code = rawCode(error)
  if (!code) return 'UNEXPECTED'
  if (accessDenied.has(code)) return 'ACCESS_DENIED'
  if (dataInUse.has(code)) return 'DATA_IN_USE'
  if (dataUnavailable.has(code)) return 'DATA_UNAVAILABLE'
  if (code === 'ENOSPC') return 'DISK_FULL'
  if (integrityFailed.has(code)) return 'INTEGRITY_FAILED'
  if (locationInvalid.has(code)) return 'LOCATION_INVALID'
  if (code === 'PREPARATION_SCHEMA_UNSUPPORTED') return 'SCHEMA_UNSUPPORTED'
  if (storageBusy.has(code)) return 'STORAGE_BUSY'
  return 'UNEXPECTED'
}

export function createStartupFailureDiagnostic(
  stage: StartupStage,
  error: unknown,
  cleanup: StartupCleanup
): StartupFailureDiagnostic {
  return {
    formatVersion: 1,
    correlationId: randomUUID(),
    observedAt: new Date().toISOString(),
    stage,
    code: allowlistedStartupFailureCode(error),
    cleanup
  }
}

export function startupFailureDetail(value: StartupFailureDiagnostic): string {
  const reason = {
    ACCESS_DENIED: 'Windows 拒绝访问所需的数据位置。',
    DATA_IN_USE: '当前数据集正被另一个 Mashiro 进程占用。',
    DATA_UNAVAILABLE: '当前数据位置或必要文件暂时不可用。',
    DISK_FULL: '磁盘空间不足，无法安全完成启动。',
    INTEGRITY_FAILED: '数据完整性或治理校验未通过。',
    LOCATION_INVALID: '数据位置不安全、已变化或不是有效数据集。',
    SCHEMA_UNSUPPORTED: '该数据由当前版本不支持的更新版本创建。',
    STORAGE_BUSY: 'Windows 暂时无法稳定访问数据文件。',
    UNEXPECTED: '启动组件发生未分类错误。'
  }[value.code]
  return (
    reason +
    '\n阶段：' +
    value.stage +
    '\n诊断编号：' +
    value.correlationId +
    (value.cleanup === 'FAILED'
      ? '\n部分启动资源未能确认关闭，本进程将退出；请勿在本进程内切换数据。'
      : '')
  )
}

/** Best effort only. A diagnostics failure never replaces the startup failure. */
export function persistStartupFailureDiagnostic(
  configurationDirectory: string | undefined,
  value: StartupFailureDiagnostic
): boolean {
  if (!configurationDirectory) return false
  let descriptor: number | undefined
  let temporary: string | undefined
  let owned = false
  try {
    const directory = canonicalProductionDirectory(configurationDirectory)
    const target = join(directory, 'startup-failure.json')
    if (existsSync(target)) {
      const entry = lstatSync(target)
      if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 65536) return false
    }
    temporary = join(directory, '.startup-failure-' + value.correlationId + '.tmp')
    descriptor = openSync(temporary, 'wx', 0o600)
    owned = true
    writeFileSync(descriptor, JSON.stringify(value, null, 2) + '\n', 'utf8')
    fsyncSync(descriptor)
    closeSync(descriptor)
    descriptor = undefined
    renameSync(temporary, target)
    owned = false
    return true
  } catch {
    return false
  } finally {
    if (descriptor !== undefined)
      try {
        closeSync(descriptor)
      } catch {
        // Keep the original diagnostics result.
      }
    if (owned && temporary)
      try {
        unlinkSync(temporary)
      } catch {
        // Keep an owned correlation-named temporary file for later inspection.
      }
  }
}
