import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

vi.mock('../../src/main/data/production-session.js', () => ({
  openProductionSession: vi.fn(async () => {
    throw Object.assign(new Error('PRIVATE_SYNTHETIC_PATH_AND_KEY'), { code: 'EACCES' })
  })
}))

it('records and displays classified SESSION_PREPARE diagnostics when data opening fails and the user exits', async () => {
  const { prepareProductionRuntimePaths, openProductionApplicationData } =
    await import('../../src/main/data/production-bootstrap.js')
  const root = mkdtempSync(join(tmpdir(), 'mashiro-review019-open-failure-'))
  try {
    const paths = prepareProductionRuntimePaths({ getPath: () => root, setPath() {} })
    const showMessageBox = vi.fn(async () => ({ response: 0 }))
    expect(
      await openProductionApplicationData({
        paths,
        dialogs: {
          showMessageBox,
          showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] }))
        },
        onOwnershipLost() {},
        assertQuiescent() {}
      })
    ).toBeNull()
    const shown = JSON.stringify(showMessageBox.mock.calls)
    expect(shown).not.toContain('PRIVATE_SYNTHETIC_PATH_AND_KEY')
    expect(shown).toContain('SESSION_PREPARE')
    const diagnostic = JSON.parse(
      readFileSync(join(paths.configurationDirectory, 'startup-failure.json'), 'utf8')
    )
    expect(diagnostic).toMatchObject({ stage: 'SESSION_PREPARE', code: 'ACCESS_DENIED' })
    expect(shown).toContain(diagnostic.correlationId)
    expect(JSON.stringify(diagnostic)).not.toContain('PRIVATE_SYNTHETIC_PATH_AND_KEY')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
