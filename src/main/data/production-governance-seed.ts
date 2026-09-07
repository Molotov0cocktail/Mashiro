import { closeSync, fstatSync, lstatSync, openSync, readSync } from 'node:fs'
import { createHash } from 'node:crypto'

/** The owned registry binds the accepted seed size; never read beyond that recorded boundary. */
export function readGovernanceSeed(
  path: string,
  expectedHash: string,
  expectedBytes?: number
): Buffer {
  const before = lstatSync(path)
  const length = expectedBytes ?? before.size
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    !Number.isSafeInteger(length) ||
    length < 0 ||
    before.size !== length ||
    (expectedBytes === undefined && length > 8388608)
  )
    throw Error('GOVERNANCE_SEED_SIZE_INVALID')
  const fd = openSync(path, 'r')
  try {
    const opened = fstatSync(fd)
    if (opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== length)
      throw Error('GOVERNANCE_SEED_CHANGED')
    const chunks: Buffer[] = [],
      hash = createHash('sha256')
    let offset = 0
    while (offset < length) {
      const chunk = Buffer.allocUnsafe(Math.min(65536, length - offset))
      const count = readSync(fd, chunk, 0, chunk.length, offset)
      if (count === 0) throw Error('GOVERNANCE_SEED_TRUNCATED')
      const bytes = chunk.subarray(0, count)
      chunks.push(bytes)
      hash.update(bytes)
      offset += count
    }
    const after = fstatSync(fd),
      current = lstatSync(path)
    if (
      readSync(fd, Buffer.alloc(1), 0, 1, length) !== 0 ||
      after.size !== length ||
      after.mtimeMs !== opened.mtimeMs ||
      !current.isFile() ||
      current.size !== length ||
      current.mtimeMs !== opened.mtimeMs ||
      current.dev !== opened.dev ||
      current.ino !== opened.ino ||
      current.isSymbolicLink() ||
      hash.digest('hex') !== expectedHash
    )
      throw Error('GOVERNANCE_SEED_CHANGED')
    return Buffer.concat(chunks, length)
  } finally {
    closeSync(fd)
  }
}
