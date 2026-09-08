$ErrorActionPreference = 'Stop'
$probeStartedPath = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\post-release-shell-metadata-started-01.json'
$probeFailurePath = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\post-release-shell-metadata-failed-01.json'
$probeStart = @{ stage='STARTED'; processId=$PID; at=[DateTimeOffset]::Now.ToString('o') } | ConvertTo-Json -Compress
$probeStartStream=[IO.File]::Open($probeStartedPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try { $probeBytes=[Text.UTF8Encoding]::new($false).GetBytes($probeStart); $probeStartStream.Write($probeBytes,0,$probeBytes.Length) } finally { $probeStartStream.Dispose() }
try {
$ErrorActionPreference = 'Stop'
$output = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\post-release-shell-metadata-observed-01.json'
if (Test-Path -LiteralPath $output) { throw 'OUTPUT_EXISTS' }
$parentId = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class MashiroMetadataShellOwner { [DllImport("user32.dll")] public static extern IntPtr GetShellWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p); }'
$explorerProcessId = [uint32]0
[void][MashiroMetadataShellOwner]::GetWindowThreadProcessId([MashiroMetadataShellOwner]::GetShellWindow(), [ref]$explorerProcessId)
if ($parentId -ne $explorerProcessId) { throw 'PARENT_NOT_EXPLORER' }
$config = Join-Path $env:APPDATA 'Mashiro\configuration'
$locatorPath = Join-Path $config 'location.json'
$locator = $null
$target = $null
if (Test-Path -LiteralPath $locatorPath -PathType Leaf) {
  $entry = Get-Item -LiteralPath $locatorPath -Force
  $value = Get-Content -LiteralPath $locatorPath -Encoding UTF8 -Raw | ConvertFrom-Json
  $locator = [ordered]@{
    exists = $true
    path = $locatorPath
    linkType = $entry.LinkType
    bytes = $entry.Length
    lastWriteTime = $entry.LastWriteTime.ToString('o')
    sha256 = (Get-FileHash -LiteralPath $locatorPath -Algorithm SHA256).Hash
    formatVersion = $value.formatVersion
    dataSetId = $value.dataSetId
    dataPath = $value.dataPath
    revision = $value.revision
  }
  $manifestPath = Join-Path $value.dataPath '.mashiro-dataset.json'
  $databasePath = Join-Path $value.dataPath 'mashiro.sqlite'
  $target = [ordered]@{
    directoryExists = Test-Path -LiteralPath $value.dataPath -PathType Container
    manifestExists = Test-Path -LiteralPath $manifestPath -PathType Leaf
    manifest = if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
      $manifest = Get-Content -LiteralPath $manifestPath -Encoding UTF8 -Raw | ConvertFrom-Json
      [ordered]@{
        formatVersion = $manifest.formatVersion
        dataSetId = $manifest.dataSetId
        state = $manifest.state
        createdAt = $manifest.createdAt
        sha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash
      }
    } else { $null }
    databaseExists = Test-Path -LiteralPath $databasePath -PathType Leaf
    databaseMetadata = if (Test-Path -LiteralPath $databasePath -PathType Leaf) {
      $database = Get-Item -LiteralPath $databasePath
      [ordered]@{ bytes = $database.Length; lastWriteTime = $database.LastWriteTime.ToString('o') }
    } else { $null }
    databaseOpened = $false
  }
} else { $locator = [ordered]@{ exists = $false; path = $locatorPath } }
$uninstallKey = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Uninstall\5555e988-f7b5-5fe3-b6bd-8df3b21f793e'
$uninstall = if (Test-Path -LiteralPath $uninstallKey) {
  $value = Get-ItemProperty -LiteralPath $uninstallKey
  [ordered]@{
    exists = $true
    displayName = $value.DisplayName
    displayVersion = $value.DisplayVersion
    displayIcon = $value.DisplayIcon
    uninstallString = $value.UninstallString
  }
} else { [ordered]@{ exists = $false } }
$runKey = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run'
$approvalKey = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$run = [ordered]@{}
$approval = [ordered]@{}
foreach ($name in @('io.github.molotov0cocktail.mashiro', 'Mashiro.Desktop')) {
  try {
    $value = Get-ItemPropertyValue -LiteralPath $runKey -Name $name -ErrorAction Stop
    $run[$name] = [ordered]@{ exists = $true; kind = (Get-Item -LiteralPath $runKey).GetValueKind($name).ToString(); value = $value }
  } catch { $run[$name] = [ordered]@{ exists = $false } }
  try {
    $value = [byte[]](Get-ItemPropertyValue -LiteralPath $approvalKey -Name $name -ErrorAction Stop)
    $approval[$name] = [ordered]@{ exists = $true; kind = (Get-Item -LiteralPath $approvalKey).GetValueKind($name).ToString(); bytes = $value.Length; sha256 = ([BitConverter]::ToString(([Security.Cryptography.SHA256]::Create()).ComputeHash($value))).Replace('-', '') }
  } catch { $approval[$name] = [ordered]@{ exists = $false } }
}
$wsh = New-Object -ComObject WScript.Shell
$links = @(
  [ordered]@{ kind = 'StartMenuUser'; path = (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Mashiro.lnk') },
  [ordered]@{ kind = 'DesktopUser'; path = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Mashiro.lnk') },
  [ordered]@{ kind = 'DesktopPublic'; path = 'C:\Users\Public\Desktop\Mashiro.lnk' }
)
$shortcuts = @(foreach ($link in $links) {
  if (Test-Path -LiteralPath $link.path -PathType Leaf) {
    $shortcut = $wsh.CreateShortcut($link.path)
    [ordered]@{ kind = $link.kind; path = $link.path; exists = $true; sha256 = (Get-FileHash -LiteralPath $link.path -Algorithm SHA256).Hash; target = $shortcut.TargetPath; arguments = $shortcut.Arguments; targetExists = (Test-Path -LiteralPath $shortcut.TargetPath -PathType Leaf) }
  } else { [ordered]@{ kind = $link.kind; path = $link.path; exists = $false } }
})
$knownPaths = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Mashiro\Mashiro.exe'),
  'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe',
  (Join-Path $env:LOCALAPPDATA 'Mashiro\Mashiro.exe')
)
$report = [ordered]@{
  schemaVersion = 1
  kind = 'POST_RELEASE_INSTALL_RESIDUAL_EXPLORER_OBSERVATION'
  observedAt = [DateTimeOffset]::Now.ToString('o')
  processId = $PID
  parentProcessId = $parentId
  shellProcessId = $explorerProcessId
  parentIsShellProcess = $true
  is64BitProcess = [Environment]::Is64BitProcess
  windowsSandboxExecutableExists = Test-Path -LiteralPath (Join-Path $env:WINDIR 'System32\WindowsSandbox.exe')
  exactMashiroProcesses = @(Get-CimInstance Win32_Process -Filter "Name='Mashiro.exe'" -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId, ExecutablePath, CreationDate)
  locator = $locator
  target = $target
  uninstall = $uninstall
  run = $run
  startupApproved = $approval
  shortcuts = $shortcuts
  knownExecutables = @($knownPaths | ForEach-Object { [ordered]@{ path = $_; exists = Test-Path -LiteralPath $_ -PathType Leaf } })
  registryWrites = $false
  applicationStarted = $false
  databaseOpened = $false
}
$json = $report | ConvertTo-Json -Depth 14
$bytes = [Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
} catch {
 $probeCode = if ($_.Exception.Message -match '^[A-Z][A-Z_]+$') { $_.Exception.Message } else { 'METADATA_PROBE_FAILED' }
 $probeFailure = @{ stage='FAILED'; code=$probeCode; processId=$PID; parentProcessId=$parentId; shellProcessId=$explorerProcessId; at=[DateTimeOffset]::Now.ToString('o') } | ConvertTo-Json -Compress
 $probeFailureStream=[IO.File]::Open($probeFailurePath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 try { $probeBytes=[Text.UTF8Encoding]::new($false).GetBytes($probeFailure); $probeFailureStream.Write($probeBytes,0,$probeBytes.Length) } finally { $probeFailureStream.Dispose() }
 exit 1
}