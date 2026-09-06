import { randomUUID } from 'node:crypto'
import type {
  ProviderBinding,
  ProviderConnection,
  ProviderSnapshot
} from '../../shared/provider-contract.js'
import { SqliteStore } from '../data/sqlite.js'

type ConnectionRow = {
  id: string
  display_name: string
  base_url: string
  enabled: number
  has_persistent_credential: number
  created_at: string
  updated_at: string
  version: number
}
type BindingRow = {
  assistant_id: string
  connection_id: string
  model: string
  updated_at: string
  version: number
}

export class ProviderDomainError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'INVALID_INPUT'
      | 'LIMIT'
      | 'PERMISSION_DENIED'
      | 'STALE_WRITE'
      | 'ASSISTANT_ARCHIVED'
      | 'CONNECTION_DISABLED'
      | 'STORAGE_UNAVAILABLE'
  ) {
    super(code)
  }
}

export class ProviderRepository {
  constructor(private readonly store: SqliteStore) {}

  snapshot(temporaryCredentialIds: ReadonlySet<string> = new Set()): ProviderSnapshot {
    const rows = this.store.database
      .prepare(
        'SELECT id, display_name, base_url, enabled, has_persistent_credential, created_at, updated_at, version FROM provider_connections ORDER BY created_at, id'
      )
      .all() as unknown as ConnectionRow[]
    const bindingRows = this.store.database
      .prepare(
        'SELECT assistant_id, connection_id, model, updated_at, version FROM assistant_provider_bindings ORDER BY assistant_id'
      )
      .all() as unknown as BindingRow[]
    return {
      connections: rows.map((row) => this.connectionDto(row, temporaryCredentialIds)),
      bindings: bindingRows.map((row) => this.bindingDto(row))
    }
  }

  saveConnection(input: {
    connectionId?: string
    displayName: string
    baseUrl: string
    enabled: boolean
    expectedVersion?: number
  }): void {
    this.store.transaction(() => {
      const now = new Date().toISOString()
      if (!input.connectionId) {
        this.store.database
          .prepare(
            'INSERT INTO provider_connections(id, display_name, base_url, enabled, has_persistent_credential, created_at, updated_at, version) VALUES (?, ?, ?, ?, 0, ?, ?, 1)'
          )
          .run(randomUUID(), input.displayName, input.baseUrl, input.enabled ? 1 : 0, now, now)
        return
      }
      const row = this.connectionRow(input.connectionId)
      if (!row) throw new ProviderDomainError('NOT_FOUND')
      if (row.version !== input.expectedVersion) throw new ProviderDomainError('STALE_WRITE')
      this.store.database
        .prepare(
          'UPDATE provider_connections SET display_name = ?, base_url = ?, enabled = ?, updated_at = ?, version = version + 1 WHERE id = ?'
        )
        .run(input.displayName, input.baseUrl, input.enabled ? 1 : 0, now, input.connectionId)
    })
  }

  setPersistentCredential(connectionId: string, present: boolean): void {
    const row = this.connectionRow(connectionId)
    if (!row) throw new ProviderDomainError('NOT_FOUND')
    this.store.database
      .prepare(
        'UPDATE provider_connections SET has_persistent_credential = ?, updated_at = ?, version = version + 1 WHERE id = ?'
      )
      .run(present ? 1 : 0, new Date().toISOString(), connectionId)
  }

  bind(input: {
    assistantId: string
    connectionId: string
    model: string
    expectedVersion: number | null
  }): void {
    this.store.transaction(() => {
      const assistant = this.store.database
        .prepare('SELECT archived_at FROM assistants WHERE id = ?')
        .get(input.assistantId) as { archived_at: string | null } | undefined
      if (!assistant) throw new ProviderDomainError('NOT_FOUND')
      if (assistant.archived_at !== null) throw new ProviderDomainError('ASSISTANT_ARCHIVED')
      if (!this.connectionRow(input.connectionId)) throw new ProviderDomainError('NOT_FOUND')
      const current = this.bindingRow(input.assistantId)
      const now = new Date().toISOString()
      if (!current) {
        if (input.expectedVersion !== null) throw new ProviderDomainError('STALE_WRITE')
        this.store.database
          .prepare(
            'INSERT INTO assistant_provider_bindings(assistant_id, connection_id, model, updated_at, version) VALUES (?, ?, ?, ?, 1)'
          )
          .run(input.assistantId, input.connectionId, input.model, now)
        return
      }
      if (current.version !== input.expectedVersion) throw new ProviderDomainError('STALE_WRITE')
      this.store.database
        .prepare(
          'UPDATE assistant_provider_bindings SET connection_id = ?, model = ?, updated_at = ?, version = version + 1 WHERE assistant_id = ?'
        )
        .run(input.connectionId, input.model, now, input.assistantId)
    })
  }

  execution(assistantId: string): {
    connection: ProviderConnection
    binding: ProviderBinding
  } {
    const assistant = this.store.database
      .prepare('SELECT archived_at FROM assistants WHERE id = ?')
      .get(assistantId) as { archived_at: string | null } | undefined
    if (!assistant) throw new ProviderDomainError('NOT_FOUND')
    if (assistant.archived_at !== null) throw new ProviderDomainError('ASSISTANT_ARCHIVED')
    const binding = this.bindingRow(assistantId)
    if (!binding) throw new ProviderDomainError('NOT_FOUND')
    const connection = this.connectionRow(binding.connection_id)
    if (!connection) throw new ProviderDomainError('NOT_FOUND')
    if (connection.enabled !== 1) throw new ProviderDomainError('CONNECTION_DISABLED')
    return {
      connection: this.connectionDto(connection, new Set()),
      binding: this.bindingDto(binding)
    }
  }

  connectionExists(connectionId: string): boolean {
    return Boolean(this.connectionRow(connectionId))
  }

  assistantExists(assistantId: string): boolean {
    return Boolean(
      this.store.database.prepare('SELECT 1 FROM assistants WHERE id = ?').get(assistantId)
    )
  }

  private connectionRow(connectionId: string): ConnectionRow | undefined {
    return this.store.database
      .prepare(
        'SELECT id, display_name, base_url, enabled, has_persistent_credential, created_at, updated_at, version FROM provider_connections WHERE id = ?'
      )
      .get(connectionId) as ConnectionRow | undefined
  }

  private bindingRow(assistantId: string): BindingRow | undefined {
    return this.store.database
      .prepare(
        'SELECT assistant_id, connection_id, model, updated_at, version FROM assistant_provider_bindings WHERE assistant_id = ?'
      )
      .get(assistantId) as BindingRow | undefined
  }

  private connectionDto(
    row: ConnectionRow,
    temporaryCredentialIds: ReadonlySet<string>
  ): ProviderConnection {
    const persistent = row.has_persistent_credential === 1
    const temporary = temporaryCredentialIds.has(row.id)
    return {
      id: row.id,
      displayName: row.display_name,
      baseUrl: row.base_url,
      enabled: row.enabled === 1,
      hasCredential: persistent || temporary,
      credentialPersistence: temporary ? 'temporary' : persistent ? 'persistent' : 'none',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version
    }
  }

  private bindingDto(row: BindingRow): ProviderBinding {
    return {
      assistantId: row.assistant_id,
      connectionId: row.connection_id,
      model: row.model,
      updatedAt: row.updated_at,
      version: row.version
    }
  }
}
