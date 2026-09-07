import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { openProductionSession } from '../../src/main/data/production-session.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ProviderRepository } from '../../src/main/provider/provider-repository.js'
import { CredentialVault } from '../../src/main/provider/credential-vault.js'

it.each(['unchanged', 'replacement', 'connection-edit'] as const)(
  'restored credential generation %s preserves current Key or blocks uncertain old Key without regressing version',
  async (mode) => {
    const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-governance-key-floor-'))
    const config = join(root, '配置'),
      data = join(root, '数据'),
      backup = join(root, '备份'),
      target = join(root, '恢复')
    for (const path of [config, data, backup, target]) mkdirSync(path)
    const session = await openProductionSession({
      configurationDirectory: config,
      choose: async () => ({ action: 'create', directory: data }),
      prepareExisting: async () => {},
      onOwnershipLost() {}
    })
    if (!session) throw Error('NO_SESSION')
    const stores: SqliteStore[] = []
    const decryptString = vi.fn((bytes: Buffer) => bytes.toString().slice(7))
    const protector = {
      isEncryptionAvailable: () => true,
      encryptString: (value: string) => Buffer.from('SEALED:' + value),
      decryptString
    }
    try {
      const before = new SqliteStore(session.databasePath)
      stores.push(before)
      const repository = new ProviderRepository(before)
      repository.saveConnection({
        displayName: '合成',
        baseUrl: 'https://example.invalid/v1',
        enabled: true
      })
      const id = repository.snapshot().connections[0]!.id
      const vault = new CredentialVault(session.credentialDirectory, protector)
      vault.setPersistent(id, 'review014-synthetic-old')
      repository.setPersistentCredential(id, true)
      before.close()
      const receipt = await session.backup(backup, () => {})
      const originalBytes = readFileSync(join(backup, 'payload', 'credentials', id + '.credential'))
      const later = new SqliteStore(session.databasePath)
      stores.push(later)
      const laterRepository = new ProviderRepository(later)
      // Same committed metadata as explicit deletion; no protected file is physically deleted.
      if (mode === 'replacement') {
        laterRepository.setPersistentCredential(id, false)
        vault.setPersistent(id, 'review014-synthetic-replacement')
        laterRepository.setPersistentCredential(id, true)
      } else if (mode === 'connection-edit') {
        laterRepository.saveConnection({
          connectionId: id,
          expectedVersion: Number(
            later.database.prepare('SELECT version FROM provider_connections WHERE id=?').get(id)!
              .version
          ),
          displayName: '合成已编辑',
          baseUrl: 'https://example.invalid/v1',
          enabled: true
        })
      }
      const floor = Number(
        later.database.prepare('SELECT version FROM provider_connections WHERE id=?').get(id)!
          .version
      )
      later.close()
      await session.restore(backup, target, receipt, () => {})
      expect(readFileSync(join(target, 'credentials', id + '.credential'))).toEqual(originalBytes)
      const restored = new CredentialVault(join(target, 'credentials'), protector)
      decryptString.mockClear()
      if (mode === 'unchanged') {
        expect(restored.get(id)).toBe('review014-synthetic-old')
        expect(decryptString).toHaveBeenCalledOnce()
      } else {
        expect(restored.get(id)).toBeUndefined()
        expect(decryptString).not.toHaveBeenCalled()
      }
      const check = new SqliteStore(join(target, 'mashiro.sqlite'))
      stores.push(check)
      expect(
        Number(
          check.database.prepare('SELECT version FROM provider_connections WHERE id=?').get(id)!
            .version
        )
      ).toBe(floor)
      const renewed = new ProviderRepository(check)
      restored.setPersistent(id, 'synthetic-explicitly-new')
      renewed.setPersistentCredential(id, true)
      expect(
        Number(
          check.database.prepare('SELECT version FROM provider_connections WHERE id=?').get(id)!
            .version
        )
      ).toBe(floor + 1)
      expect(restored.get(id)).toBe('synthetic-explicitly-new')
    } finally {
      for (const store of stores) if (store.database.isOpen) store.close()
      await session.release()
      const actual = realpathSync.native(root)
      if (
        dirname(actual) !== realpathSync.native(tmpdir()) ||
        !basename(actual).startsWith('mashiro-governance-key-floor-')
      )
        rejectUnownedRoot()
      rmSync(actual, { recursive: true, force: true })
    }
  }
)

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
