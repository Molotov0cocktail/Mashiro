import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { canonicalProductionDirectory } from './production-location.js'

/** Non-destructive revocation: the original protected blob remains byte-for-byte untouched. */
export function markRestoredCredentialRevoked(directory: string, connectionId: string): void {
  if (!existsSync(join(directory, '.mashiro-snapshot.json')))
    throw Error('GOVERNANCE_RESTORE_MARKER_REQUIRED')
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(connectionId))
    throw Error('GOVERNANCE_CREDENTIAL_ID_INVALID')
  const root = join(canonicalProductionDirectory(directory), 'credentials')
  if (!existsSync(root)) mkdirSync(root)
  canonicalProductionDirectory(root)
  const path = join(root, connectionId + '.credential.revoked')
  const marker = JSON.stringify({ format: 1, connectionId, reason: 'restored-deletion' })
  if (existsSync(path)) {
    const stat = lstatSync(path)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 512 ||
      readFileSync(path, 'utf8') !== marker
    )
      throw Error('GOVERNANCE_CREDENTIAL_MARKER_INVALID')
    return
  }
  const fd = openSync(path, 'wx', 0o600)
  try {
    writeFileSync(fd, marker)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}
