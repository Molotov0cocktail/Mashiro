import { expect, it } from 'vitest'
import {
  developmentAppUserModelId,
  legacyProductionAppUserModelId,
  loginStartupArgument,
  productionAppUserModelId,
  resolveRuntimeAppUserModelId,
  testAppUserModelId
} from '../../src/shared/windows-app-identity.mjs'
import { reminderAppId } from '../../src/main/reminder/windows-reminder-platform.js'

it('keeps packaged, development and synthetic-test Shell identities disjoint', () => {
  expect(productionAppUserModelId).toBe('io.github.molotov0cocktail.mashiro')
  expect(legacyProductionAppUserModelId).toBe('Mashiro.Desktop')
  expect(loginStartupArgument).toBe('--mashiro-login')
  expect(
    new Set([productionAppUserModelId, developmentAppUserModelId, testAppUserModelId]).size
  ).toBe(3)
  expect(resolveRuntimeAppUserModelId({ isPackaged: true, isTest: false })).toBe(
    productionAppUserModelId
  )
  expect(resolveRuntimeAppUserModelId({ isPackaged: false, isTest: false })).toBe(
    developmentAppUserModelId
  )
  expect(resolveRuntimeAppUserModelId({ isPackaged: false, isTest: true })).toBe(testAppUserModelId)
  expect(reminderAppId).toBe(productionAppUserModelId)
})
