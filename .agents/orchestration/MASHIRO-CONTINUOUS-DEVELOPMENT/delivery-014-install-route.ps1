$ErrorActionPreference = 'Stop'
$taskRepository = 'D:\Mashiro'
$taskInstaller = Join-Path $taskRepository 'dist\windows\Mashiro-INTERNAL-ROUTE-0.1.0.exe'
$taskRoot = Join-Path ([IO.Path]::GetTempPath()) ('mashiro-delivery-014-' + [guid]::NewGuid().ToString('N'))
if (Test-Path -LiteralPath $taskRoot) { throw 'ISOLATION_ROOT_EXISTS' }
[IO.Directory]::CreateDirectory($taskRoot) | Out-Null
$taskCanonicalRoot = (Get-Item -LiteralPath $taskRoot).FullName
if ((Split-Path $taskCanonicalRoot) -ne ([IO.Path]::GetTempPath().TrimEnd('\')) -or -not (Split-Path $taskCanonicalRoot -Leaf).StartsWith('mashiro-delivery-014-')) { throw 'ISOLATION_SCOPE' }
$taskInstall = Join-Path $taskRoot '安装 空格\Mashiro'
[IO.Directory]::CreateDirectory((Join-Path $taskInstall 'data')) | Out-Null
[IO.Directory]::CreateDirectory((Join-Path $taskInstall 'resources')) | Out-Null
$taskKeep = @('data\synthetic-governance.json','unknown-user-file.txt','resources\unknown-user-file.txt')
$taskHashes = @{}
foreach ($taskRelative in $taskKeep) {
  $taskPath = Join-Path $taskInstall $taskRelative
  [IO.File]::WriteAllText($taskPath,'synthetic-only-' + [guid]::NewGuid(),[Text.UTF8Encoding]::new($false))
  $taskHashes[$taskRelative] = (Get-FileHash -LiteralPath $taskPath).Hash
}
$taskOutcomes = @()
function Invoke-TaskProcess([string]$TaskFile, [string]$TaskArguments, [string]$TaskPhase) {
  $taskProcess = Start-Process -FilePath $TaskFile -ArgumentList $TaskArguments -WindowStyle Hidden -PassThru
  $taskFinished = $taskProcess.WaitForExit(60000)
  if (-not $taskFinished) { throw "PROCESS_STILL_RUNNING phase=$TaskPhase pid=$($taskProcess.Id) root=$taskRoot" }
  $taskProcess.Refresh()
  if ($taskProcess.ExitCode -ne 0) { throw "PROCESS_FAILED phase=$TaskPhase exit=$($taskProcess.ExitCode)" }
  return [ordered]@{phase=$TaskPhase;pid=$taskProcess.Id;exitCode=$taskProcess.ExitCode}
}
function Assert-TaskKept {
  foreach ($taskRelative in $taskKeep) {
    if ((Get-FileHash -LiteralPath (Join-Path $taskInstall $taskRelative)).Hash -ne $taskHashes[$taskRelative]) { throw 'SYNTHETIC_DATA_CHANGED' }
  }
}
$taskOutcomes += Invoke-TaskProcess $taskInstaller ('/S /D=' + $taskInstall) 'install'
Assert-TaskKept
if (-not (Test-Path -LiteralPath (Join-Path $taskInstall 'Mashiro.exe'))) { throw 'INSTALLED_EXE_MISSING' }
$taskOwned = (Get-Content -LiteralPath (Join-Path $taskInstall 'resources\mashiro-program-files.json') -Raw | ConvertFrom-Json).files
foreach ($taskRelative in $taskOwned) {
  if (-not (Test-Path -LiteralPath (Join-Path $taskInstall $taskRelative))) { throw "OWNED_NOT_INSTALLED $taskRelative" }
}
$taskOutcomes += Invoke-TaskProcess $taskInstaller ('/S /D=' + $taskInstall) 'same-version-reinstall'
Assert-TaskKept
$taskUninstallers = @(Get-ChildItem -LiteralPath $taskInstall -Filter 'Uninstall*.exe' -File)
if ($taskUninstallers.Count -ne 1) { throw 'UNINSTALLER_NOT_UNIQUE' }
$taskOutcomes += Invoke-TaskProcess $taskUninstallers[0].FullName '/S' 'uninstall-launcher'
$taskRemoveNames = @($taskOwned) + $taskUninstallers[0].Name
$taskRemaining = @()
for ($taskAttempt = 0; $taskAttempt -lt 120; $taskAttempt++) {
  $taskRemaining = @($taskRemoveNames | Where-Object { Test-Path -LiteralPath (Join-Path $taskInstall $_) })
  if (-not $taskRemaining.Count) { break }
  Start-Sleep -Milliseconds 500
}
if ($taskRemaining.Count) { throw ('OWNED_FILES_REMAIN ' + ($taskRemaining -join ',')) }
Assert-TaskKept
$taskActual = @(Get-ChildItem -LiteralPath $taskInstall -File -Recurse | ForEach-Object { [IO.Path]::GetRelativePath($taskInstall,$_.FullName) } | Sort-Object)
if (($taskActual -join '|') -ne (($taskKeep | Sort-Object) -join '|')) { throw 'UNEXPECTED_INSTALL_RESIDUE' }
$taskReport = [ordered]@{
  scope='internal installer file protection only; app not launched; no cross-version update'
  root=$taskRoot
  installerSha256=(Get-FileHash -LiteralPath $taskInstaller).Hash
  signature=(Get-AuthenticodeSignature -LiteralPath $taskInstaller).Status.ToString()
  isAdministrator=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  phases=$taskOutcomes
  preservedFiles=$taskHashes
  ownedFilesRemoved=$taskRemoveNames.Count
  remainingFiles=$taskActual
}
$taskReportPath = Join-Path $taskRepository '.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\delivery-014-install-route-01.json'
if (Test-Path -LiteralPath $taskReportPath) { throw 'REPORT_ALREADY_EXISTS' }
[IO.File]::WriteAllText($taskReportPath,($taskReport | ConvertTo-Json -Depth 5) + "`n",[Text.UTF8Encoding]::new($false))
$taskReport | ConvertTo-Json -Depth 5
