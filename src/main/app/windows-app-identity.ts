import { app } from 'electron'
import { resolveRuntimeAppUserModelId } from '../../shared/windows-app-identity.mjs'

export function initializeWindowsAppIdentity(): string {
  const identity = resolveRuntimeAppUserModelId({
    isPackaged: app.isPackaged,
    isTest: process.env.MASHIRO_E2E === '1'
  })
  app.setAppUserModelId(identity)
  return identity
}
