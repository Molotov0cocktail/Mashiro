import type { SqliteStore } from '../data/sqlite.js'
import { ProviderDomainError } from './provider-repository.js'
export class HistoryPermissionRepository {
  constructor(private readonly store: SqliteStore) {}
  read(
    assistantId: string,
    fingerprint: string | null
  ): { readHistory: boolean; sendHistory: boolean; version: number } {
    const row = this.store.database
      .prepare('SELECT read_history,version FROM history_permissions WHERE assistant_id=?')
      .get(assistantId) as { read_history: number; version: number } | undefined
    const grant =
      fingerprint === null
        ? undefined
        : (this.store.database
            .prepare(
              'SELECT send_history FROM history_recipient_grants WHERE assistant_id=? AND endpoint_fingerprint=?'
            )
            .get(assistantId, fingerprint) as { send_history: number } | undefined)
    return {
      readHistory: row?.read_history !== 0,
      sendHistory: grant?.send_history === 1,
      version: row?.version ?? 0
    }
  }
  update(
    assistantId: string,
    fingerprint: string | null,
    expectedVersion: number,
    readHistory: boolean,
    sendHistory: boolean
  ): void {
    this.store.transaction(() => {
      if (this.read(assistantId, fingerprint).version !== expectedVersion)
        throw new ProviderDomainError('STALE_WRITE')
      this.store.database
        .prepare(
          'INSERT INTO history_permissions(assistant_id,read_history,version) VALUES(?,?,1) ON CONFLICT(assistant_id) DO UPDATE SET read_history=excluded.read_history,version=history_permissions.version+1'
        )
        .run(assistantId, readHistory ? 1 : 0)
      if (fingerprint !== null)
        this.store.database
          .prepare(
            'INSERT INTO history_recipient_grants(assistant_id,endpoint_fingerprint,send_history) VALUES(?,?,?) ON CONFLICT(assistant_id,endpoint_fingerprint) DO UPDATE SET send_history=excluded.send_history'
          )
          .run(assistantId, fingerprint, sendHistory ? 1 : 0)
    })
  }
}
