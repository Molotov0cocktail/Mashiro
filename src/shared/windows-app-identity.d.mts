export const productionAppUserModelId: 'io.github.molotov0cocktail.mashiro'
export const legacyProductionAppUserModelId: 'Mashiro.Desktop'
export const developmentAppUserModelId: 'io.github.molotov0cocktail.mashiro.development'
export const testAppUserModelId: 'io.github.molotov0cocktail.mashiro.test'
export const loginStartupArgument: '--mashiro-login'
export function resolveRuntimeAppUserModelId(options: {
  isPackaged: boolean
  isTest: boolean
}): string
