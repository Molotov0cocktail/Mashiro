import { randomUUID } from 'node:crypto'
import { branchGovernanceDigest } from './steward-branch-guard.js'
import type { SqliteStore } from '../data/sqlite.js'
import { MemoryError, type MemoryService } from '../memory/memory-service.js'
import {
  memorySourceSchema,
  type MemorySource,
  type MemoryRecord
} from '../../shared/memory-contract.js'
import {
  stewardBranchSchema,
  stewardConflictSchema,
  type StewardBranch,
  type StewardConflict
} from '../../shared/steward-contract.js'
import { BackgroundError } from './background-sources.js'

/** Organization metadata never replaces or changes a Markdown acceptance pointer. */
export class StewardOrganization {
  constructor(
    private readonly store: SqliteStore,
    private readonly memory: MemoryService,
    private readonly governanceChanged: () => void = () => undefined
  ) {}
  openConflictIds(id: string): string[] {
    const result: string[] = []
    for (const row of this.store.database
      .prepare(
        "SELECT record_json FROM memory_conflicts WHERE json_extract(record_json,'$.state')='OPEN' AND (json_extract(record_json,'$.left.id')=? OR json_extract(record_json,'$.right.id')=?) LIMIT 100"
      )
      .all(id, id)) {
      const conflict = stewardConflictSchema.parse(JSON.parse(String(row.record_json)))
      const current = [conflict.left, conflict.right].every((s) => {
        const memory = this.store.database
          .prepare('SELECT version,record_json FROM memory_objects WHERE id=?')
          .get(s.id)
        if (!memory || memory.version !== s.version) return false
        const record = JSON.parse(String(memory.record_json)) as {
          state: string
          retention: string
        }
        return record.state === 'active' && record.retention !== 'trash'
      })
      if (current) result.push(conflict.id)
    }
    return result
  }
  refreshGovernance(id?: string): boolean {
    let changed = false
    for (const row of this.store.database
      .prepare(
        'SELECT id,governance_digest FROM memory_branches WHERE (? IS NULL OR id=?) ORDER BY id'
      )
      .all(id ?? null, id ?? null)) {
      const digest = branchGovernanceDigest(this.store, String(row.id))
      if (digest === row.governance_digest) continue
      // The public version and its persistent guard change in one SQLite statement.
      this.store.database
        .prepare(
          "UPDATE memory_branches SET version=version+1,record_json=json_set(record_json,'$.version',version+1),governance_digest=? WHERE id=? AND governance_digest=?"
        )
        .run(digest, String(row.id), String(row.governance_digest))
      changed = true
    }
    if (changed) this.governanceChanged()
    return changed
  }
  branch(id: string): StewardBranch {
    this.refreshGovernance(id)
    const row = this.store.database
      .prepare('SELECT record_json FROM memory_branches WHERE id=?')
      .get(id)
    if (!row) throw new BackgroundError('NOT_FOUND')
    return stewardBranchSchema.parse(JSON.parse(String(row.record_json)))
  }
  branches(cursor = 0, limit = 100): StewardBranch[] {
    this.refreshGovernance()
    return this.store.database
      .prepare('SELECT record_json FROM memory_branches ORDER BY rowid DESC LIMIT ? OFFSET ?')
      .all(limit, cursor)
      .map((r) => stewardBranchSchema.parse(JSON.parse(String(r.record_json))))
  }
  ensure(title: string): StewardBranch {
    const row = this.store.database
      .prepare(
        "SELECT record_json FROM memory_branches WHERE json_extract(record_json,'$.title')=?"
      )
      .get(title)
    if (row) return stewardBranchSchema.parse(JSON.parse(String(row.record_json)))
    const branch = { id: randomUUID(), version: 1, title }
    this.store.database
      .prepare('INSERT INTO memory_branches(id,version,record_json) VALUES(?,?,?)')
      .run(branch.id, branch.version, JSON.stringify(branch))
    return branch
  }
  link(
    branch: StewardBranch,
    source: MemorySource,
    relation: string,
    dependencies: MemorySource[]
  ): void {
    const prior = this.store.database
      .prepare(
        'SELECT memory_version,relation,source_json FROM branch_members WHERE branch_id=? AND memory_id=?'
      )
      .get(branch.id, source.id)
    if (
      prior?.memory_version === source.version &&
      prior.relation === relation &&
      prior.source_json === JSON.stringify(dependencies)
    )
      return
    this.store.database
      .prepare(
        'INSERT INTO branch_members VALUES(?,?,?,?,?) ON CONFLICT(branch_id,memory_id) DO UPDATE SET memory_version=excluded.memory_version,relation=excluded.relation,source_json=excluded.source_json'
      )
      .run(branch.id, source.id, source.version, relation, JSON.stringify(dependencies))
    branch.version++
    this.store.database
      .prepare('UPDATE memory_branches SET version=?,record_json=? WHERE id=?')
      .run(branch.version, JSON.stringify(branch), branch.id)
  }
  conflicts(
    assistantId: string,
    fingerprint?: string,
    cursor = 0,
    limit = 100,
    branchId?: string
  ): StewardConflict[] {
    const conflicts: StewardConflict[] = []
    for (const row of this.store.database
      .prepare(
        "SELECT record_json FROM memory_conflicts WHERE (? IS NULL OR EXISTS(SELECT 1 FROM json_each(json_extract(record_json,'$.branchIds')) WHERE value=?)) ORDER BY rowid DESC LIMIT ? OFFSET ?"
      )
      .all(branchId ?? null, branchId ?? null, limit, cursor)) {
      const conflict = stewardConflictSchema.parse(JSON.parse(String(row.record_json)))
      try {
        // Resolved sides are historical evidence; the accepted correction is authoritative.
        if (conflict.state === 'RESOLVED' && !conflict.resolution)
          throw new BackgroundError('STALE_WRITE')
        const sources =
          conflict.state === 'RESOLVED' ? [conflict.resolution!] : [conflict.left, conflict.right]
        for (const source of sources) {
          this.memory.acceptedBackgroundMemory(assistantId, source.id, source.version)
          if (fingerprint) this.memory.assertSource(source, assistantId, fingerprint)
        }
      } catch {
        conflict.state = 'STALE'
        conflict.resolution = null
      }
      conflicts.push(conflict)
    }
    return conflicts
  }
  createConflict(left: MemorySource, right: MemorySource, branchId: string): string {
    const branchIds = [
      ...new Set([
        branchId,
        ...this.store.database
          .prepare('SELECT branch_id FROM branch_members WHERE memory_id IN(?,?)')
          .all(left.id, right.id)
          .map((r) => String(r.branch_id))
      ])
    ].slice(0, 2)
    const conflict: StewardConflict = {
      id: randomUUID(),
      version: 1,
      state: 'OPEN',
      left,
      right,
      branchIds,
      resolution: null
    }
    this.store.database
      .prepare('INSERT INTO memory_conflicts VALUES(?,?,?)')
      .run(conflict.id, 1, JSON.stringify(conflict))
    return conflict.id
  }
  members(
    assistantId: string,
    branchId: string,
    cursor = 0
  ): { members: MemoryRecord[]; nextCursor: number | null } {
    const records: MemoryRecord[] = []
    const rows = this.store.database
      .prepare(
        'SELECT memory_id,memory_version,source_json FROM branch_members WHERE branch_id=? ORDER BY rowid LIMIT 101 OFFSET ?'
      )
      .all(branchId, cursor)
    for (const row of rows.slice(0, 100)) {
      try {
        const record = this.memory.acceptedBackgroundMemory(
          assistantId,
          String(row.memory_id),
          Number(row.memory_version)
        )
        if (record.scope !== 'global') continue
        // Local display still observes versioned dependencies, even without a model recipient.
        for (const source of memorySourceSchema
          .array()
          .parse(JSON.parse(String(row.source_json)))) {
          if (source.type === 'memory')
            this.memory.acceptedBackgroundMemory(assistantId, source.id, source.version)
          if (
            this.store.database
              .prepare(
                'SELECT 1 FROM memory_suppressions WHERE source_type=? AND source_id=? AND source_version=?'
              )
              .get(source.type, source.id, source.version)
          )
            throw new BackgroundError('STALE_WRITE')
          if (
            source.type === 'round' &&
            (this.store.database
              .prepare('SELECT 1 FROM retention_original_trash WHERE request_id=?')
              .get(source.id) ||
              this.store.database
                .prepare("SELECT 1 FROM content_tombstones WHERE kind='round' AND id=?")
                .get(source.id))
          )
            throw new BackgroundError('STALE_WRITE')
        }
        records.push(record)
      } catch (error) {
        // Only governed omissions are safe; missing/corrupt accepted content blocks export.
        if (
          (error instanceof MemoryError &&
            ['PERMISSION_DENIED', 'NOT_FOUND'].includes(error.code)) ||
          (error instanceof BackgroundError && error.code === 'STALE_WRITE')
        )
          continue
        throw error
      }
    }
    return { members: records, nextCursor: rows.length > 100 ? cursor + 100 : null }
  }
}
