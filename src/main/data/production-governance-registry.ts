import { lstatSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { canonicalProductionDirectory } from './production-location.js'
import { connectGovernanceDatabase } from './production-governance-connection.js'
import type {
  GovernanceAnchor,
  ProductionGovernanceJournal
} from './production-governance-journal.js'

interface Registration {
  path: string
  journal: ProductionGovernanceJournal
  anchor: GovernanceAnchor
  connections: number
  assertOwnership(): void
  onUncertain(): void
}
const registrations = new Map<string, Registration>()
const key = (path: string) => resolve(path).toLowerCase()

/** Called only by the owned production session before any application service opens a store. */
export function registerProductionGovernance(
  options: Omit<Registration, 'connections'>
): () => void {
  if (basename(options.path) !== 'mashiro.sqlite') throw Error('GOVERNANCE_DATABASE_PATH_INVALID')
  canonicalProductionDirectory(dirname(options.path))
  options.assertOwnership()
  const id = key(options.path)
  if (registrations.has(id)) throw Error('GOVERNANCE_ALREADY_REGISTERED')
  const registration = { ...options, connections: 0 }
  registrations.set(id, registration)
  let released = false
  return () => {
    if (released) return
    if (registration.connections) throw Error('GOVERNANCE_WRITERS_STILL_OPEN')
    registrations.delete(id)
    released = true
  }
}

/** Unregistered development/test stores remain isolated; there is no implicit production path. */
export function attachProductionGovernance(path: string, database: DatabaseSync): DatabaseSync {
  const registration = registrations.get(key(path))
  if (!registration) return database
  const assertCurrent = () => {
    registration.assertOwnership()
    const stat = lstatSync(registration.path)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      String(stat.dev) !== registration.anchor.device ||
      String(stat.ino) !== registration.anchor.inode
    )
      throw Error('GOVERNANCE_DATABASE_FILE_CHANGED')
  }
  assertCurrent()
  const guarded = connectGovernanceDatabase(
    database,
    registration.journal,
    registration.anchor,
    assertCurrent,
    registration.onUncertain
  )
  registration.connections++
  let closed = false
  return new Proxy(guarded, {
    get(target, name) {
      if (name === 'close')
        return () => {
          if (closed) return
          try {
            target.close()
          } finally {
            if (!database.isOpen) {
              registration.connections--
              closed = true
            }
          }
        }
      const value = Reflect.get(target, name, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
}
