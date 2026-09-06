import { randomUUID } from 'node:crypto'
import type { AssistantDto, AssistantSnapshot } from '../../shared/assistant-contract.js'
import { SqliteStore } from '../data/sqlite.js'

type AssistantRow = {
  id: string
  display_name: string
  created_at: string
  updated_at: string
  archived_at: string | null
  version: number
}

type AssistantStateRow = {
  primary_assistant_id: string | null
  current_assistant_id: string | null
  revision: number
}

export class DomainError extends Error {
  constructor(
    readonly code:
      | 'NOT_FOUND'
      | 'STALE_WRITE'
      | 'ASSISTANT_ARCHIVED'
      | 'PRIMARY_ARCHIVE_FORBIDDEN'
      | 'STORAGE_INCONSISTENT'
  ) {
    super(code)
  }
}

export class AssistantRepository {
  constructor(private readonly store: SqliteStore) {}

  snapshot(): AssistantSnapshot {
    const rows = this.store.database
      .prepare(
        'SELECT id, display_name, created_at, updated_at, archived_at, version FROM assistants WHERE id NOT IN (SELECT id FROM assistant_tombstones) ORDER BY created_at, id'
      )
      .all() as unknown as AssistantRow[]
    const state = this.state()
    const assistants = rows.map<AssistantDto>((row) => ({
      id: row.id,
      displayName: row.display_name,
      isArchived: row.archived_at !== null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      archivedAt: row.archived_at,
      version: row.version
    }))
    this.assertInvariant(assistants, state)
    return {
      assistants,
      primaryAssistantId: state.primary_assistant_id,
      currentAssistantId: state.current_assistant_id,
      stateRevision: state.revision
    }
  }

  create(displayName: string, expectedStateRevision: number): AssistantSnapshot {
    return this.store.transaction(() => {
      const state = this.requireRevision(expectedStateRevision)
      const id = randomUUID()
      const now = new Date().toISOString()
      this.store.database
        .prepare(
          'INSERT INTO assistants(id, display_name, created_at, updated_at, archived_at, version) VALUES (?, ?, ?, ?, NULL, 1)'
        )
        .run(id, displayName, now, now)
      if (state.primary_assistant_id === null) {
        this.store.database
          .prepare(
            'UPDATE assistant_state SET primary_assistant_id = ?, current_assistant_id = ?, revision = revision + 1 WHERE singleton = 1'
          )
          .run(id, id)
      } else {
        this.bumpStateRevision()
      }
      return this.snapshot()
    })
  }

  switch(assistantId: string, expectedStateRevision: number): AssistantSnapshot {
    return this.store.transaction(() => {
      this.requireRevision(expectedStateRevision)
      this.requireActive(assistantId)
      this.store.database
        .prepare(
          'UPDATE assistant_state SET current_assistant_id = ?, revision = revision + 1 WHERE singleton = 1'
        )
        .run(assistantId)
      return this.snapshot()
    })
  }

  rename(
    assistantId: string,
    displayName: string,
    expectedAssistantVersion: number,
    expectedStateRevision: number
  ): AssistantSnapshot {
    return this.store.transaction(() => {
      this.requireRevision(expectedStateRevision)
      this.requireVersion(assistantId, expectedAssistantVersion)
      const now = new Date().toISOString()
      this.store.database
        .prepare(
          'UPDATE assistants SET display_name = ?, updated_at = ?, version = version + 1 WHERE id = ?'
        )
        .run(displayName, now, assistantId)
      this.bumpStateRevision()
      return this.snapshot()
    })
  }

  setPrimary(
    assistantId: string,
    expectedAssistantVersion: number,
    expectedStateRevision: number
  ): AssistantSnapshot {
    return this.store.transaction(() => {
      this.requireRevision(expectedStateRevision)
      this.requireVersion(assistantId, expectedAssistantVersion)
      const now = new Date().toISOString()
      this.store.database
        .prepare('UPDATE assistants SET updated_at = ?, version = version + 1 WHERE id = ?')
        .run(now, assistantId)
      this.store.database
        .prepare(
          'UPDATE assistant_state SET primary_assistant_id = ?, revision = revision + 1 WHERE singleton = 1'
        )
        .run(assistantId)
      return this.snapshot()
    })
  }

  archive(
    assistantId: string,
    expectedAssistantVersion: number,
    expectedStateRevision: number
  ): AssistantSnapshot {
    return this.store.transaction(() => {
      const state = this.requireRevision(expectedStateRevision)
      this.requireVersion(assistantId, expectedAssistantVersion)
      if (state.primary_assistant_id === assistantId) {
        throw new DomainError('PRIMARY_ARCHIVE_FORBIDDEN')
      }
      if (state.current_assistant_id === assistantId) {
        this.store.database
          .prepare('UPDATE assistant_state SET current_assistant_id = ? WHERE singleton = 1')
          .run(state.primary_assistant_id)
      }
      const now = new Date().toISOString()
      this.store.database
        .prepare(
          'UPDATE assistants SET archived_at = ?, updated_at = ?, version = version + 1 WHERE id = ?'
        )
        .run(now, now, assistantId)
      this.bumpStateRevision()
      return this.snapshot()
    })
  }

  private bumpStateRevision(): void {
    this.store.database
      .prepare('UPDATE assistant_state SET revision = revision + 1 WHERE singleton = 1')
      .run()
  }

  private state(): AssistantStateRow {
    const value = this.store.database
      .prepare(
        'SELECT primary_assistant_id, current_assistant_id, revision FROM assistant_state WHERE singleton = 1'
      )
      .get() as AssistantStateRow | undefined
    if (!value) throw new DomainError('STORAGE_INCONSISTENT')
    return value
  }

  private requireRevision(expected: number): AssistantStateRow {
    const state = this.state()
    if (state.revision !== expected) throw new DomainError('STALE_WRITE')
    return state
  }

  private row(assistantId: string): AssistantRow | undefined {
    return this.store.database
      .prepare(
        'SELECT id, display_name, created_at, updated_at, archived_at, version FROM assistants WHERE id = ? AND id NOT IN (SELECT id FROM assistant_tombstones)'
      )
      .get(assistantId) as AssistantRow | undefined
  }

  private requireActive(assistantId: string): AssistantRow {
    const row = this.row(assistantId)
    if (!row) throw new DomainError('NOT_FOUND')
    if (row.archived_at !== null) throw new DomainError('ASSISTANT_ARCHIVED')
    return row
  }

  private requireVersion(assistantId: string, expectedVersion: number): AssistantRow {
    const row = this.requireActive(assistantId)
    if (row.version !== expectedVersion) throw new DomainError('STALE_WRITE')
    return row
  }

  private assertInvariant(assistants: AssistantDto[], state: AssistantStateRow): void {
    const active = assistants.filter((assistant) => !assistant.isArchived)
    if (active.length === 0) {
      if (state.primary_assistant_id !== null || state.current_assistant_id !== null) {
        throw new DomainError('STORAGE_INCONSISTENT')
      }
      return
    }
    if (
      !active.some((assistant) => assistant.id === state.primary_assistant_id) ||
      !active.some((assistant) => assistant.id === state.current_assistant_id)
    ) {
      throw new DomainError('STORAGE_INCONSISTENT')
    }
  }
}
