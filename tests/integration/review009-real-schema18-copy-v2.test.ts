import { createHash } from 'node:crypto'
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, it, vi } from 'vitest'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { MemoryService } from '../../src/main/memory/memory-service.js'
import { RetentionPolicyService } from '../../src/main/retention/retention-policy-service.js'
import { applyProductionGovernance } from '../../src/main/data/production-governance-apply.js'

const evidence = '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/'
const backup =
  'C:/Users/30910/AppData/Local/Temp/mashiro-install-full-Zbzmgp/完整备份-凭据调用后-04'
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

it.skipIf(process.env.MASHIRO_REVIEW_APPROVED_SCHEMA18_V2 !== '1')(
  'migrates only a newly copied approved schema18 payload and preserves all prior tables',
  async () => {
    const reference = JSON.parse(
      readFileSync(evidence + 'delivery-014-current-backup-root-check.json', 'utf8')
    ) as {
      manifestSha256: string
      files: { path: string; bytes: number; sha256: string }[]
    }
    const verifySource = () => {
      expect(hash(readFileSync(join(backup, 'backup.json')))).toBe(reference.manifestSha256)
      for (const file of reference.files) {
        const path = join(backup, 'payload', file.path)
        expect(lstatSync(path).isSymbolicLink()).toBe(false)
        expect(lstatSync(path).size).toBe(file.bytes)
        expect(hash(readFileSync(path))).toBe(file.sha256)
      }
    }
    verifySource()
    expect(reference.files).toHaveLength(16)
    const target = mkdtempSync(join(tmpdir(), 'mashiro-review009-real18-'))
    for (const file of reference.files) {
      const destination = join(target, file.path)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(join(backup, 'payload', file.path), destination)
    }
    const before = new DatabaseSync(join(target, 'mashiro.sqlite'))
    expect(before.prepare('PRAGMA user_version').get()).toEqual({ user_version: 18 })
    const tables = before
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => String(row.name))
    const tableDigest = (db: DatabaseSync, name: string) => {
      const rows = db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()
      const serialized = rows
        .map((row) =>
          JSON.stringify(row, (_key, value) =>
            typeof value === 'bigint' ? value.toString() : value
          )
        )
        .sort()
      return { count: rows.length, sha256: hash(JSON.stringify(serialized)) }
    }
    const baseline = Object.fromEntries(tables.map((name) => [name, tableDigest(before, name)]))
    before.close()
    const store = new SqliteStore(join(target, 'mashiro.sqlite'))
    let policy: RetentionPolicyService | undefined
    try {
      expect(store.database.prepare('PRAGMA user_version').get()).toEqual({ user_version: 19 })
      for (const name of tables) expect(tableDigest(store.database, name)).toEqual(baseline[name])
      const defaults = store.database.prepare('SELECT * FROM retention_policy').get()!
      expect(defaults).toMatchObject({
        capacity_bytes: 104857600,
        capacity_enabled: 1,
        staging_days: 90,
        staging_enabled: 1,
        restored_paused: 0
      })
      const seeded = store.database.prepare('SELECT * FROM retention_policy_objects').all()
      expect(seeded).toHaveLength(10)
      expect(
        seeded.every((row) => row.measurement_state === 'UNKNOWN' && row.accepted_bytes === null)
      ).toBe(true)
      for (const row of seeded.filter((row) => row.zone === 'staging'))
        expect(row.staging_entered_at).toBe(defaults.activated_at)
      const memory = new MemoryService(store, join(target, 'memory'), () => ({
        fingerprint: null,
        display: null
      }))
      policy = new RetentionPolicyService(store, memory, () => undefined)
      await vi.waitFor(() => expect(policy!.snapshot().audit.state).toBe('COMPLETE'))
      const measured = policy.snapshot()
      policy.close()
      writeFileSync(join(target, '.mashiro-snapshot.json'), '{}')
      applyProductionGovernance(store.database, target, [])
      expect(store.database.prepare('SELECT restored_paused FROM retention_policy').get()).toEqual({
        restored_paused: 1
      })
      expect(store.database.prepare('PRAGMA integrity_check').all()).toEqual([
        { integrity_check: 'ok' }
      ])
      expect(store.database.prepare('PRAGMA foreign_key_check').all()).toEqual([])
      for (const file of reference.files.filter((file) => file.path !== 'mashiro.sqlite'))
        expect(hash(readFileSync(join(target, file.path)))).toBe(file.sha256)
      verifySource()
      const sources = [
        'src/main/data/sqlite.ts',
        'src/main/data/schema.ts',
        'src/main/retention/retention-policy-schema.ts',
        'src/main/retention/retention-policy-service.ts',
        'src/main/memory/memory-service.ts',
        'src/main/data/production-governance-apply.ts'
      ]
      writeFileSync(
        evidence + 'retention-009-review-real18-copy-result-v2.json',
        JSON.stringify(
          {
            verdict: 'PASS',
            target,
            sourcePayloadFiles: 16,
            priorTables: baseline,
            defaults,
            seededUnknown: seeded.length,
            firstMeasurement: measured.usage,
            restoredPaused: true,
            originalPayloadUnchanged: true,
            credentialDecryptedOrPrinted: false,
            sourceHashes: Object.fromEntries(
              sources.map((path) => [path, hash(readFileSync(path))])
            )
          },
          null,
          2
        ) + '\n',
        { flag: 'wx' }
      )
    } finally {
      policy?.close()
      store.close()
    }
  }
)
