import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { canonicalProductionDirectory } from './production-location.js'

export interface ProductionLease {
  readonly dataPath: string
  release(): Promise<void>
}

interface Ownership {
  dataPath: string
  held: boolean
}
const ownerships = new WeakMap<ProductionLease, Ownership>()

/** A structural imitation or released token is not proof of exclusive filesystem ownership. */
export function assertProductionLease(lease: ProductionLease, directory: string): void {
  const ownership = ownerships.get(lease)
  if (!ownership?.held || ownership.dataPath !== canonicalProductionDirectory(directory))
    throw new Error('DATA_SET_NOT_OWNED')
}

/** OS-owned exclusion survives different program locations and is released on process death. */
export async function acquireProductionLease(
  path: string,
  onLost: (error: Error) => void
): Promise<ProductionLease> {
  if (process.platform !== 'win32') throw new Error('DATA_SET_LOCK_UNSUPPORTED')
  const dataPath = canonicalProductionDirectory(path)
  const identity = createHash('sha256').update(dataPath.toLowerCase()).digest('hex')
  const endpoint = '\\\\.\\pipe\\mashiro-dataset-' + identity
  return new Promise((resolve, reject) => {
    // No commands, data, activation messages or filesystem authority are exposed by this pipe.
    const server = createServer((socket) => socket.destroy())
    let acquired = false
    let closing = false
    let lost = false
    let released: Promise<void> | undefined
    let ownership: Ownership | undefined
    const fail = (error: Error): void => {
      if (closing || lost) return
      lost = true
      if (ownership) ownership.held = false
      clearTimeout(deadline)
      server.close()
      if (acquired) onLost(error)
      else reject(error)
    }
    const deadline = setTimeout(() => fail(new Error('DATA_SET_LOCK_TIMEOUT')), 5000)
    server.on('error', (error: NodeJS.ErrnoException) => {
      fail(new Error(error.code === 'EADDRINUSE' ? 'DATA_SET_IN_USE' : 'DATA_SET_LOCK_UNAVAILABLE'))
    })
    server.on('close', () => {
      if (acquired && !closing) fail(new Error('DATA_SET_LOCK_LOST'))
    })
    server.listen(endpoint, () => {
      if (lost) {
        server.close()
        return
      }
      clearTimeout(deadline)
      acquired = true
      const lease: ProductionLease = Object.freeze({
        dataPath,
        release() {
          if (!released) {
            closing = true
            if (ownership) ownership.held = false
            released = new Promise<void>((done) => {
              server.close(() => done())
            })
          }
          return released
        }
      })
      ownership = { dataPath, held: true }
      ownerships.set(lease, ownership)
      resolve(lease)
    })
  })
}
