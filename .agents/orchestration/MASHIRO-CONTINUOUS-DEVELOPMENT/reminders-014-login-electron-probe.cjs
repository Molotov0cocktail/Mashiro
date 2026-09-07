const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const { existsSync, readFileSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { app } = require('electron')

const appId = 'Mashiro.LoginProbe.f2c4ba98-c8e0-45ea-a899-1d29a6d36532'
const executable =
  'C:\\Users\\30910\\AppData\\Local\\Temp\\mashiro-install-full-Zbzmgp\\安装 旧版本\\Mashiro.exe'
const expectedHash = 'BA5AA5BD3A78EFB437A9F2FFF46CEB4E088204B0594BCDD0132B0CC72A1DE8E6'
const args = ['--mashiro-login-probe-f2c4ba98']
const quoted = '"' + executable + '"'
const runKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const approvalKey =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run'
const output = resolve(
  '.agents/orchestration/MASHIRO-CONTINUOUS-DEVELOPMENT/reminders-014-login-electron-probe-02.json'
)

function registryValue(key) {
  try {
    const value = execFileSync('reg.exe', ['query', key, '/v', appId], {
      encoding: 'utf8',
      windowsHide: true
    })
    const line = value
      .split(/\r?\n/)
      .find((candidate) => candidate.trimStart().startsWith(appId + ' '))
    if (!line) return null
    const payload = line.match(/\s+REG_(?:SZ|BINARY)\s+(.*)$/)?.[1] ?? ''
    return {
      length: line.trim().length,
      sha256: createHash('sha256').update(line.trim()).digest('hex').toUpperCase(),
      ...(key === runKey ? { containsArgument: payload.includes(args[0]) } : {})
    }
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && error.status === 1) return null
    throw error
  }
}

function sameRegistryState(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function registryState() {
  return { run: registryValue(runKey), startupApproved: registryValue(approvalKey) }
}

function deleteIfOwned(key, expected) {
  const current = registryValue(key)
  if (current === null) return 'ALREADY_ABSENT'
  if (expected === null || JSON.stringify(current) !== JSON.stringify(expected))
    return 'OWNERSHIP_LOST'
  execFileSync('reg.exe', ['delete', key, '/v', appId, '/f'], {
    stdio: 'ignore',
    windowsHide: true
  })
  return 'DELETED_OWNED'
}

function read(path) {
  const state = app.getLoginItemSettings({ path, args })
  const item = state.launchItems.find(
    (value) => value.name === appId && value.scope === 'user'
  )
  return {
    openAtLogin: state.openAtLogin,
    executableWillLaunchAtLogin: state.executableWillLaunchAtLogin,
    item: item
      ? {
          name: item.name,
          path: item.path,
          args: item.args,
          scope: item.scope,
          enabled: item.enabled
        }
      : null
  }
}

void app
  .whenReady()
  .then(() => {
    if (process.platform !== 'win32' || !existsSync(executable)) throw new Error('PROBE_ENVIRONMENT')
    const actualHash = createHash('sha256').update(readFileSync(executable)).digest('hex').toUpperCase()
    if (actualHash !== expectedHash) throw new Error('PROBE_EXECUTABLE_HASH')
    app.setAppUserModelId(appId)
    const before = read(quoted)
    const registryBefore = registryState()
    if (before.openAtLogin || before.item || registryBefore.run || registryBefore.startupApproved)
      throw new Error('PROBE_REGISTRATION_ALREADY_EXISTS')

    let attempted = false
    let ownedRegistry = null
    let enabled
    let disabled
    let unquoted
    let registryEnabled
    let registryDisabled
    let registryBeforeElectronCleanup
    let registryAfterElectronCleanup
    let registryAfterCleanup
    let afterCleanup
    let cleanupOwnership = 'NOT_REQUIRED'
    let runFallback = 'NOT_REQUIRED'
    let approvalFallback = 'NOT_REQUIRED'
    try {
      attempted = true
      app.setLoginItemSettings({ path: quoted, args, openAtLogin: true, enabled: true })
      registryEnabled = registryState()
      ownedRegistry = registryEnabled
      enabled = read(quoted)
      unquoted = read(executable)

      app.setLoginItemSettings({ path: quoted, args, openAtLogin: true, enabled: false })
      registryDisabled = registryState()
      ownedRegistry = registryDisabled
      disabled = read(quoted)
    } finally {
      registryBeforeElectronCleanup = registryState()
      if (attempted && ownedRegistry && sameRegistryState(registryBeforeElectronCleanup, ownedRegistry)) {
        cleanupOwnership = 'MATCHED'
        app.setLoginItemSettings({ path: quoted, args, openAtLogin: false, enabled: false })
        registryAfterElectronCleanup = registryState()
        runFallback = deleteIfOwned(runKey, ownedRegistry.run)
        approvalFallback = deleteIfOwned(approvalKey, ownedRegistry.startupApproved)
      } else if (attempted) {
        cleanupOwnership = 'LOST'
        registryAfterElectronCleanup = registryBeforeElectronCleanup
      } else {
        registryAfterElectronCleanup = registryBeforeElectronCleanup
      }
      registryAfterCleanup = registryState()
      afterCleanup = read(quoted)
    }

    const checks = {
      quotedRegistered: enabled?.openAtLogin === true,
      quotedEffective: enabled?.executableWillLaunchAtLogin === true,
      quotedItemPath: enabled?.item?.path === executable,
      quotedItemEnabled: enabled?.item?.enabled === true,
      quotedSwitchOmittedFromLaunchItem: enabled?.item?.args.length === 0,
      unquotedLookupRejected:
        unquoted?.executableWillLaunchAtLogin === false && unquoted?.item === null,
      disabledRegistered: disabled?.openAtLogin === true,
      disabledNotEffective: disabled?.executableWillLaunchAtLogin === false,
      disabledItem: disabled?.item?.enabled === false,
      enabledRunPresent: registryEnabled?.run !== null,
      enabledRunArgumentPresent: registryEnabled?.run?.containsArgument === true,
      disabledRunPresent: registryDisabled?.run !== null,
      disabledRunArgumentPresent: registryDisabled?.run?.containsArgument === true,
      disabledApprovalPresent: registryDisabled?.startupApproved !== null,
      cleanupOwnershipMatched: cleanupOwnership === 'MATCHED',
      cleanupOnlyOwnedValues:
        runFallback !== 'OWNERSHIP_LOST' && approvalFallback !== 'OWNERSHIP_LOST',
      apiCleanup: afterCleanup?.openAtLogin === false && afterCleanup?.item === null,
      rawCleanup: registryAfterCleanup.run === null && registryAfterCleanup.startupApproved === null
    }
    const failures = Object.entries(checks)
      .filter(([, passed]) => !passed)
      .map(([name]) => name)
    writeFileSync(
      output,
      JSON.stringify(
        {
          electron: process.versions.electron,
          appId,
          executableSha256: actualHash,
          executablePathKind: 'synthetic Chinese path with spaces',
          quotedQuery: enabled,
          unquotedQuery: unquoted,
          disabledQuery: disabled,
          registryBefore,
          registryEnabled,
          registryDisabled,
          registryBeforeElectronCleanup,
          registryAfterElectronCleanup,
          cleanupOwnership,
          fallbackCleanup: { run: runFallback, startupApproved: approvalFallback },
          registryAfterCleanup,
          cleanup: afterCleanup,
          checks,
          failures,
          passed: failures.length === 0,
          externalCalls: 0,
          personalDataAccessed: false
        },
        null,
        2
      ) + '\n'
    )
    if (failures.length) throw new Error('PROBE_ASSERTION_' + failures.join(','))
  })
  .then(() => app.quit())
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'PROBE_FAILURE')
    app.exit(1)
  })