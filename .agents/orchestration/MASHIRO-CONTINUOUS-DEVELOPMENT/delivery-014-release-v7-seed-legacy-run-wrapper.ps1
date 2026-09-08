$ErrorActionPreference = 'Stop'
$output = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\delivery-014-release-v7-seed-legacy-run-01.json'
if (Test-Path -LiteralPath $output) { throw 'OUTPUT_ALREADY_EXISTS' }

$install = 'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本'
$executable = Join-Path $install 'Mashiro.exe'
$expectedExecutableSha256 = '33F79D190010A5A6E0C3B9AFDC4D3E14020BCEA272BEDBD209508CFA684454D7'
$expectedCommand = '"' + $executable + '" --mashiro-login'
$locationPath = 'C:\Users\30910\AppData\Roaming\Mashiro\configuration\location.json'
$expectedDataPath = Join-Path $install 'data'
$expectedDataSetId = '9f2cf384-daa4-4bb6-819a-33976e479c5a'
$runSubkey = 'Software\Microsoft\Windows\CurrentVersion\Run'
$approvalSubkey = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$legacyName = 'Mashiro.Desktop'
$currentName = 'io.github.molotov0cocktail.mashiro'

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MashiroV7SeedOwner {
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
}
'@

$shellProcessId = [uint32]0
[void][MashiroV7SeedOwner]::GetWindowThreadProcessId(
  [MashiroV7SeedOwner]::GetShellWindow(),
  [ref]$shellProcessId
)
$self = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
$parentProcessId = [int]$self.ParentProcessId
$parent = Get-Process -Id $parentProcessId -ErrorAction Stop
if ($parentProcessId -ne $shellProcessId -or $parent.ProcessName -ne 'explorer') {
  throw 'PARENT_IS_NOT_EXPLORER'
}
if (-not [Environment]::Is64BitProcess) { throw 'PROCESS_IS_NOT_64_BIT' }

if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) { throw 'EXECUTABLE_MISSING' }
if ((Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash -ne $expectedExecutableSha256) {
  throw 'EXECUTABLE_HASH_MISMATCH'
}
$running = @(
  Get-Process Mashiro -ErrorAction SilentlyContinue |
    Where-Object { [string]::Equals($_.Path, $executable, [StringComparison]::Ordinal) } |
    Select-Object -ExpandProperty Id
)
if ($running.Count -ne 0) { throw 'MASHIRO_IS_RUNNING' }

$location = Get-Content -LiteralPath $locationPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not [string]::Equals($location.dataPath, $expectedDataPath, [StringComparison]::Ordinal) -or
    -not [string]::Equals($location.dataSetId, $expectedDataSetId, [StringComparison]::Ordinal)) {
  throw 'LOCATION_IDENTITY_MISMATCH'
}

function Read-Value($key, [string]$name) {
  if ($null -eq $key -or -not @($key.GetValueNames()).Contains($name)) {
    return [ordered]@{ exists = $false; kind = $null; value = $null }
  }
  $value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
  return [ordered]@{
    exists = $true
    kind = $key.GetValueKind($name).ToString()
    value = if ($value -is [byte[]]) { [Convert]::ToBase64String($value) } else { $value }
  }
}

$base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
  [Microsoft.Win32.RegistryHive]::CurrentUser,
  [Microsoft.Win32.RegistryView]::Registry64
)
$runKey = $null
$approvalKey = $null
try {
  $runKey = $base.OpenSubKey($runSubkey, $true)
  if ($null -eq $runKey) { throw 'RUN_KEY_MISSING' }
  $approvalKey = $base.OpenSubKey($approvalSubkey, $false)

  $before = [ordered]@{
    legacy = Read-Value $runKey $legacyName
    current = Read-Value $runKey $currentName
    legacyApproval = Read-Value $approvalKey $legacyName
    currentApproval = Read-Value $approvalKey $currentName
  }
  if ($before.legacy.exists) { throw 'LEGACY_VALUE_ALREADY_EXISTS' }
  if (-not $before.current.exists -or $before.current.kind -ne 'String' -or
      -not [string]::Equals($before.current.value, $expectedCommand, [StringComparison]::Ordinal)) {
    throw 'CURRENT_VALUE_NOT_EXACT_ON'
  }

  # Re-read both values immediately before the sole mutation.
  $legacyGuard = Read-Value $runKey $legacyName
  $currentGuard = Read-Value $runKey $currentName
  if ($legacyGuard.exists -or -not $currentGuard.exists -or $currentGuard.kind -ne 'String' -or
      -not [string]::Equals($currentGuard.value, $expectedCommand, [StringComparison]::Ordinal)) {
    throw 'RUN_VALUES_CHANGED_BEFORE_SEED'
  }

  $runKey.SetValue($legacyName, $expectedCommand, [Microsoft.Win32.RegistryValueKind]::String)
  $after = [ordered]@{
    legacy = Read-Value $runKey $legacyName
    current = Read-Value $runKey $currentName
    legacyApproval = Read-Value $approvalKey $legacyName
    currentApproval = Read-Value $approvalKey $currentName
  }
  if (-not $after.legacy.exists -or $after.legacy.kind -ne 'String' -or
      -not [string]::Equals($after.legacy.value, $expectedCommand, [StringComparison]::Ordinal) -or
      -not $after.current.exists -or $after.current.kind -ne 'String' -or
      -not [string]::Equals($after.current.value, $expectedCommand, [StringComparison]::Ordinal)) {
    throw 'SEEDED_VALUES_NOT_EXACT'
  }

  $report = [ordered]@{
    observedAt = [DateTimeOffset]::Now.ToString('o')
    kind = 'synthetic exact legacy Run precondition for v7 same-version overlay'
    wrapperProcessId = $PID
    parentProcessId = $parentProcessId
    shellProcessId = $shellProcessId
    parentIsShellProcess = $true
    is64Bit = $true
    exactMashiroProcessIds = $running
    executableSha256 = $expectedExecutableSha256
    dataPath = $expectedDataPath
    dataSetId = $expectedDataSetId
    before = $before
    after = $after
    mutation = [ordered]@{
      hive = 'HKCU Registry64'
      subkey = $runSubkey
      name = $legacyName
      operation = 'create absent REG_SZ with exact synthetic scene command'
    }
    currentRunModified = $false
    startupApprovedModified = $false
    unrelatedRegistryValuesRead = $false
  }
  $json = ($report | ConvertTo-Json -Depth 9) + "`n"
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
  $stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
  try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
} finally {
  if ($null -ne $approvalKey) { $approvalKey.Dispose() }
  if ($null -ne $runKey) { $runKey.Dispose() }
  $base.Dispose()
}
