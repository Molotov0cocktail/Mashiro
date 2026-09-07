import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'

export interface CredentialProtector {
  isEncryptionAvailable(): boolean
  encryptString(value: string): Buffer
  decryptString(value: Buffer): string
}

export class CredentialProtectionUnavailableError extends Error {}

export class CredentialVault {
  private readonly temporary = new Map<string, string>()

  constructor(
    private readonly directory: string,
    private readonly protector: CredentialProtector
  ) {
    mkdirSync(directory, { recursive: true })
  }

  temporaryIds(): ReadonlySet<string> {
    return new Set(this.temporary.keys())
  }

  setTemporary(connectionId: string, apiKey: string): void {
    this.temporary.set(connectionId, apiKey)
  }

  setPersistent(connectionId: string, apiKey: string): void {
    if (!this.protector.isEncryptionAvailable()) {
      throw new CredentialProtectionUnavailableError()
    }
    const encrypted = this.protector.encryptString(apiKey)
    const target = this.path(connectionId)
    const temporary = target + '.tmp'
    writeFileSync(temporary, encrypted, { flag: 'wx', mode: 0o600 })
    try {
      renameSync(temporary, target)
    } catch (error) {
      rmSync(temporary, { force: true })
      throw error
    }
    // The explicit new persistent Key has replaced the old encrypted bytes successfully.
    rmSync(this.path(connectionId) + '.revoked', { force: true })
    this.temporary.delete(connectionId)
  }

  get(connectionId: string): string | undefined {
    const temporary = this.temporary.get(connectionId)
    if (temporary !== undefined) return temporary
    const path = this.path(connectionId)
    const revocation = path + '.revoked'
    // Only a genuinely absent marker permits decryption; dangling links and I/O errors do not.
    try {
      const stat = lstatSync(revocation, { throwIfNoEntry: false })
      if (stat) {
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 512) return undefined
        const marker = JSON.parse(readFileSync(revocation, 'utf8'))
        if (
          marker.format !== 1 ||
          marker.connectionId !== connectionId ||
          marker.reason !== 'restored-deletion'
        )
          return undefined
        return undefined
      }
    } catch {
      return undefined
    }
    if (!existsSync(path) || !this.protector.isEncryptionAvailable()) return undefined
    try {
      return this.protector.decryptString(readFileSync(path))
    } catch {
      return undefined
    }
  }

  delete(connectionId: string): void {
    this.temporary.delete(connectionId)
    rmSync(this.path(connectionId), { force: true })
  }

  clearTemporary(): void {
    this.temporary.clear()
  }

  private path(connectionId: string): string {
    return join(this.directory, connectionId + '.credential')
  }
}
