import { listPackage, extractFile } from '@electron/asar'
import { sep } from 'node:path'

/** Read the actual ASAR dependency inventory; unknown runtime packages require their own notices. */
export function inspectPackagedRuntime(archivePath) {
  const result = []
  for (const path of listPackage(archivePath, {})) {
    const normalized = path.replaceAll('\\', '/')
    if (!/(?:^|\/)node_modules\/((?:@[^/]+\/)?[^/]+)\/package\.json$/.test(normalized)) continue
    const metadata = JSON.parse(
      extractFile(archivePath, normalized.replace(/^\//, '').split('/').join(sep)).toString('utf8')
    )
    if (typeof metadata.name !== 'string' || typeof metadata.version !== 'string')
      throw new Error('PACKAGING_INVALID_RUNTIME_METADATA')
    result.push({ name: metadata.name, version: metadata.version })
  }
  return result.sort((a, b) => a.name.localeCompare(b.name))
}
