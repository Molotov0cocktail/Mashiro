import { resolve } from 'node:path'
import { afterPack } from './build/after-pack.mjs'
import { productionAppUserModelId } from './src/shared/windows-app-identity.mjs'

/** Explicit unsigned Windows distribution; publishing occurs only after independent release acceptance. */
export default {
  appId: productionAppUserModelId,
  productName: 'Mashiro',
  directories: { output: 'dist/windows', buildResources: 'build' },
  files: ['out/**/*', 'package.json', '!**/*.map'],
  asar: true,
  npmRebuild: false,
  forceCodeSigning: false,
  publish: null,
  afterPack,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '${productName}-${version}-win-${arch}-setup.${ext}',
    signAndEditExecutable: true,
    signtoolOptions: {
      sign: async () => {
        return
      }
    }
  },
  nsis: {
    guid: '5555e988-f7b5-5fe3-b6bd-8df3b21f793e',
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    runAfterFinish: true,
    include: resolve('.cache/packaging/owned-files.nsh'),
    installerLanguages: ['zh_CN', 'en_US']
  }
}
