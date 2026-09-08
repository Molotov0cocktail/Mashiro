$ErrorActionPreference = 'Stop'

$root = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT'
$probe = Join-Path $root 'delivery-014-release-v6-cold-class-factory-probe.ps1'
$expectedProbeHash = '77108C92991891CDAFA76911196A647BA15643363AB12B56DAE3424BD7D49247'
$startedPath = Join-Path $root 'delivery-014-release-v6-explorer-prepare-started-01.json'
$stdoutPath = Join-Path $root 'delivery-014-release-v6-explorer-prepare-01.stdout.json'
$stderrPath = Join-Path $root 'delivery-014-release-v6-explorer-prepare-01.stderr.txt'
$receiptPath = Join-Path $root 'delivery-014-release-v6-explorer-prepare-receipt-01.json'

foreach ($path in @($startedPath, $stdoutPath, $stderrPath, $receiptPath)) {
  if (Test-Path -LiteralPath $path) { throw "OUTPUT_ALREADY_EXISTS_$path" }
}
if ((Get-FileHash -LiteralPath $probe -Algorithm SHA256).Hash -ne $expectedProbeHash) {
  throw 'PROBE_HASH_MISMATCH'
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MashiroExplorerPrepareOwner {
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
}
'@

$self = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
$parentProcessId = [int]$self.ParentProcessId
$shellWindow = [MashiroExplorerPrepareOwner]::GetShellWindow()
$shellProcessId = [uint32]0
[void][MashiroExplorerPrepareOwner]::GetWindowThreadProcessId($shellWindow, [ref]$shellProcessId)
$parent = Get-Process -Id $parentProcessId -ErrorAction Stop
$parentIsShell = $parentProcessId -eq $shellProcessId -and $parent.ProcessName -eq 'explorer'

$utf8 = [Text.UTF8Encoding]::new($false)
$started = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  wrapperProcessId = $PID
  parentProcessId = $parentProcessId
  shellProcessId = $shellProcessId
  parentProcessName = $parent.ProcessName
  parentIsShellProcess = $parentIsShell
  probePath = $probe
  probeSha256 = $expectedProbeHash
  execute = $false
}
[IO.File]::WriteAllText($startedPath, ($started | ConvertTo-Json -Depth 5) + "`n", $utf8)

[IO.File]::WriteAllText($stdoutPath, '', $utf8)
[IO.File]::WriteAllText($stderrPath, '', $utf8)
$probeExitCode = 0
$caughtError = $null
try {
  & $probe 1> $stdoutPath 2> $stderrPath
  if (-not $?) { $probeExitCode = 1 }
} catch {
  $probeExitCode = 1
  $caughtError = $_.Exception.GetType().FullName
  [IO.File]::WriteAllText($stderrPath, ($_ | Out-String), $utf8)
}

$probeReport = $null
try {
  $probeReport = Get-Content -Raw -LiteralPath $stdoutPath | ConvertFrom-Json
} catch {
  if ($null -eq $caughtError) { $caughtError = $_.Exception.GetType().FullName }
}

$receipt = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  wrapperProcessId = $PID
  parentProcessId = $parentProcessId
  shellProcessId = $shellProcessId
  parentIsShellProcess = $parentIsShell
  probeExitCode = $probeExitCode
  caughtErrorType = $caughtError
  probeMode = $probeReport.mode
  probeExecuteRequested = $probeReport.executeRequested
  probeCurrentProcessId = $probeReport.host.currentProcessId
  probeParentProcessId = $probeReport.host.parentProcessId
  probeParentIsShellProcess = $probeReport.host.parentIsShellProcess
  probeResult = $probeReport.observation.result
  stdoutPath = $stdoutPath
  stdoutSha256 = (Get-FileHash -LiteralPath $stdoutPath -Algorithm SHA256).Hash
  stderrPath = $stderrPath
  stderrSha256 = (Get-FileHash -LiteralPath $stderrPath -Algorithm SHA256).Hash
  comInvoked = $false
}
[IO.File]::WriteAllText($receiptPath, ($receipt | ConvertTo-Json -Depth 6) + "`n", $utf8)
