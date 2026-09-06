[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$electronPath = 'D:\Mashiro\node_modules\electron\dist\electron.exe'
$probeSource = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\reminders-012-notification-probe.cjs'
$evidenceRoot = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT'
$runId = [Guid]::NewGuid().ToString('N')
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$spikeRoot = [IO.Path]::GetFullPath((Join-Path $tempBase "Mashiro-Notification-Spike-012-$runId"))
$appUserModelId = "io.mashiro.synthetic.notification-spike.012.$runId"
$stdoutPath = Join-Path $spikeRoot 'stdout.jsonl'
$stderrPath = Join-Path $spikeRoot 'stderr.txt'
$probePath = Join-Path $spikeRoot 'main.cjs'
$packageJsonPath = Join-Path $spikeRoot 'package.json'
$eventPath = Join-Path $spikeRoot 'events.jsonl'
$resultPath = Join-Path $evidenceRoot 'reminders-012-notification-route-a-attempt-4-result.json'
$eventsEvidencePath = Join-Path $evidenceRoot 'reminders-012-notification-route-a-attempt-4-events.jsonl'
$stderrEvidencePath = Join-Path $evidenceRoot 'reminders-012-notification-route-a-attempt-4-stderr.txt'

if (-not $spikeRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing non-temp spike root: $spikeRoot"
}
if (Test-Path -LiteralPath $spikeRoot) {
  throw "Unique spike root unexpectedly exists: $spikeRoot"
}

New-Item -ItemType Directory -Path $spikeRoot | Out-Null
Copy-Item -LiteralPath $probeSource -Destination $probePath
[IO.File]::WriteAllText($packageJsonPath, '{"name":"mashiro-notification-spike-012","version":"0.0.0","private":true,"main":"main.cjs"}', [Text.UTF8Encoding]::new($false))

$priorRoot = [Environment]::GetEnvironmentVariable('MASHIRO_NOTIFICATION_SPIKE_ROOT', 'Process')
$priorAumid = [Environment]::GetEnvironmentVariable('MASHIRO_NOTIFICATION_SPIKE_AUMID', 'Process')
$priorRunAsNode = [Environment]::GetEnvironmentVariable('ELECTRON_RUN_AS_NODE', 'Process')
$process = $null
$timedOut = $false
$launcherError = $null
$exitCode = $null

try {
  [Environment]::SetEnvironmentVariable('MASHIRO_NOTIFICATION_SPIKE_ROOT', $spikeRoot, 'Process')
  [Environment]::SetEnvironmentVariable('MASHIRO_NOTIFICATION_SPIKE_AUMID', $appUserModelId, 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'Process')
  $process = Start-Process -FilePath $electronPath -ArgumentList @($spikeRoot) -WorkingDirectory $spikeRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -Environment @{ ELECTRON_RUN_AS_NODE = $null } -PassThru
} catch {
  $launcherError = $_.Exception.Message
} finally {
  [Environment]::SetEnvironmentVariable('MASHIRO_NOTIFICATION_SPIKE_ROOT', $priorRoot, 'Process')
  [Environment]::SetEnvironmentVariable('MASHIRO_NOTIFICATION_SPIKE_AUMID', $priorAumid, 'Process')
  [Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $priorRunAsNode, 'Process')
}

if ($null -ne $process) {
  if (-not $process.WaitForExit(15000)) {
    $timedOut = $true
    Stop-Process -Id $process.Id -Force
    $process.WaitForExit(5000) | Out-Null
  }
  $exitCode = $process.ExitCode
}

Start-Sleep -Milliseconds 750
$residuals = @(Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and $_.CommandLine.IndexOf($spikeRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
} | Select-Object ProcessId, ParentProcessId, Name, CommandLine)

$events = @()
if (Test-Path -LiteralPath $eventPath) {
  Copy-Item -LiteralPath $eventPath -Destination $eventsEvidencePath
  $events = @(Get-Content -LiteralPath $eventPath | ForEach-Object { $_ | ConvertFrom-Json })
} else {
  [IO.File]::WriteAllText($eventsEvidencePath, '', [Text.UTF8Encoding]::new($false))
}
if (Test-Path -LiteralPath $stderrPath) {
  Copy-Item -LiteralPath $stderrPath -Destination $stderrEvidencePath
} else {
  [IO.File]::WriteAllText($stderrEvidencePath, '', [Text.UTF8Encoding]::new($false))
}

$result = [ordered]@{
  route = 'A-unpackaged-temp-app-directory-explicitly-unset-run-as-node-no-shortcut-or-registry-attempt-4'
  runId = $runId
  spikeRoot = $spikeRoot
  appUserModelId = $appUserModelId
  electronPath = $electronPath
  electronSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $electronPath).Hash
  probeSourceSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $probeSource).Hash
  os = [Environment]::OSVersion.VersionString
  powershell = $PSVersionTable.PSVersion.ToString()
  pid = if ($null -ne $process) { $process.Id } else { $null }
  exitCode = $exitCode
  timedOut = $timedOut
  launcherError = $launcherError
  eventNames = @($events | ForEach-Object { $_.event })
  residualProcessesBeforeCleanup = @($residuals)
  shortcutCreated = $false
  childRunAsNodeHandling = 'Start-Process -Environment explicit unset'
  registryChanged = $false
  existingShortcutModified = $false
}

[IO.File]::WriteAllText($resultPath, ($result | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))

$resolvedSpikeRoot = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $spikeRoot).Path)
$tempPrefix = $tempBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
if (-not $resolvedSpikeRoot.StartsWith($tempPrefix, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing cleanup outside temp base: $resolvedSpikeRoot"
}
Remove-Item -LiteralPath $resolvedSpikeRoot -Recurse -Force
$cleanup = [ordered]@{
  spikeRootRemoved = -not (Test-Path -LiteralPath $resolvedSpikeRoot)
  residualProcessesAfterCleanup = @(Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -and $_.CommandLine.IndexOf($resolvedSpikeRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0
  } | Select-Object ProcessId, ParentProcessId, Name, CommandLine)
}
$result.cleanup = $cleanup
[IO.File]::WriteAllText($resultPath, ($result | ConvertTo-Json -Depth 6), [Text.UTF8Encoding]::new($false))
$result | ConvertTo-Json -Depth 6
