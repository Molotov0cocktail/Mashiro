import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { CredentialVault } from '../../src/main/provider/credential-vault.js'

it.each(['directory', 'dangling-link'] as const)(
  'a %s revocation marker fails closed before decryption',
  (kind) => {
    const root = mkdtempSync(join(realpathSync.native(tmpdir()), 'mashiro-revocation-'))
    try {
      const decryptString = vi.fn(() => 'must-not-decrypt')
      const vault = new CredentialVault(root, {
        isEncryptionAvailable: () => true,
        encryptString: () => Buffer.from('SYNTHETIC-PROTECTED'),
        decryptString
      })
      const id = randomUUID()
      vault.setPersistent(id, 'synthetic-input')
      const before = readFileSync(join(root, id + '.credential'))
      const marker = join(root, id + '.credential.revoked')
      if (kind === 'directory') mkdirSync(marker)
      else symlinkSync(join(root, 'does-not-exist'), marker, 'junction')
      expect(vault.get(id)).toBeUndefined()
      expect(decryptString).not.toHaveBeenCalled()
      expect(readFileSync(join(root, id + '.credential'))).toEqual(before)
      if (kind === 'directory') {
        expect(() => vault.setPersistent(id, 'explicit-new-value')).toThrow()
        expect(vault.get(id)).toBeUndefined()
        expect(decryptString).not.toHaveBeenCalled()
      }
    } finally {
      const actual = realpathSync.native(root)
      if (
        dirname(actual) !== realpathSync.native(tmpdir()) ||
        !basename(actual).startsWith('mashiro-revocation-')
      )
        rejectUnownedRoot()
      rmSync(actual, { recursive: true, force: true })
    }
  }
)

function rejectUnownedRoot(): never {
  throw Error('UNOWNED_ROOT')
}
