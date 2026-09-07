import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { expect, it, vi } from 'vitest'
import { openProductionSession } from '../../src/main/data/production-session.js'
import { SqliteStore } from '../../src/main/data/sqlite.js'
import { ProviderRepository } from '../../src/main/provider/provider-repository.js'
import { CredentialVault } from '../../src/main/provider/credential-vault.js'

it('preserves synthetic protected backup bytes but never decrypts a later-revoked credential until an explicit new key', async () => {
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-gov-credential-'))
  const config = join(root, '配置'),
    data = join(root, '原数据'),
    backup = join(root, '备份'),
    target = join(root, '恢复')
  for (const path of [config, data, backup, target]) mkdirSync(path)
  const session = await openProductionSession({
    configurationDirectory: config,
    choose: async () => ({ action: 'create', directory: data }),
    prepareExisting: async () => {},
    onOwnershipLost: () => {}
  })
  if (!session) throw Error('NO_SESSION')
  const stores: SqliteStore[] = []
  // Synthetic protector only: no Windows user credential or real API Key is accessed.
  const decryptString = vi.fn((value: Buffer) => value.toString('utf8').slice(7))
  const protector = {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from('SEALED:' + value),
    decryptString
  }
  try {
    const original = new SqliteStore(session.databasePath)
    stores.push(original)
    const repository = new ProviderRepository(original)
    repository.saveConnection({
      displayName: '合成撤权',
      baseUrl: 'https://example.invalid/v1',
      enabled: true
    })
    const id = repository.snapshot().connections[0]!.id
    const vault = new CredentialVault(session.credentialDirectory, protector)
    vault.setPersistent(id, 'synthetic-old-value')
    repository.setPersistentCredential(id, true)
    original.close()
    const receipt = await session.backup(backup, () => {})
    const protectedBytes = readFileSync(join(backup, 'payload', 'credentials', id + '.credential'))
    const later = new SqliteStore(session.databasePath)
    stores.push(later)
    // The existing explicit user deletion API's committed repository result; original blob stays intact in this non-destructive fixture.
    new ProviderRepository(later).setPersistentCredential(id, false)
    later.close()
    await session.restore(backup, target, receipt, () => {})
    const restoredVault = new CredentialVault(join(target, 'credentials'), protector)
    expect(readFileSync(join(target, 'credentials', id + '.credential'))).toEqual(protectedBytes)
    decryptString.mockClear()
    expect(restoredVault.get(id)).toBeUndefined()
    expect(decryptString).not.toHaveBeenCalled()
    writeFileSync(join(target, 'credentials', id + '.credential.revoked'), '{damaged-marker')
    expect(restoredVault.get(id)).toBeUndefined()
    expect(decryptString).not.toHaveBeenCalled()
    restoredVault.setTemporary(id, 'synthetic-new-temporary')
    expect(restoredVault.get(id)).toBe('synthetic-new-temporary')
    restoredVault.clearTemporary()
    expect(restoredVault.get(id)).toBeUndefined()
    restoredVault.setPersistent(id, 'synthetic-new-persistent')
    expect(restoredVault.get(id)).toBe('synthetic-new-persistent')
    expect(readFileSync(join(backup, 'payload', 'credentials', id + '.credential'))).toEqual(
      protectedBytes
    )
  } finally {
    for (const store of stores) if (store.database.isOpen) store.close()
    await session.release()
    const actual = realpathSync.native(root)
    if (
      dirname(actual) !== realpathSync.native(tmpdir()) ||
      !basename(actual).startsWith('mashiro-gov-credential-')
    )
      rejectUnownedRoot()
    rmSync(actual, { recursive: true, force: true })
  }
})

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
