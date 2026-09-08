param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('pre', 'postinstall-prelaunch', 'postfirstlaunch', 'preuninstall', 'postuninstall', 'postreinstall-prelaunch')]
  [string]$Phase
)

$ErrorActionPreference = 'Stop'
$scene = 'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp'
$install = Join-Path $scene '安装 旧版本'
$executable = Join-Path $install 'Mashiro.exe'
$asar = Join-Path $install 'resources\app.asar'
$uninstaller = Join-Path $install 'Uninstall Mashiro.exe'
$data = Join-Path $install 'data'
$unknown = Join-Path $install 'uninstall-preserve-user-v4.txt'
$location = 'C:\Users\30910\AppData\Roaming\Mashiro\configuration\location.json'
$evidence = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT'

function Read-File([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return [ordered]@{ exists = $false; bytes = $null; sha256 = $null }
  }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "FILE_REPARSE_POINT_$Path"
  }
  return [ordered]@{
    exists = $true
    bytes = $item.Length
    sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  }
}

function Read-Tree([string]$Root) {
  $rootItem = Get-Item -LiteralPath $Root -Force
  if (($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'DATA_ROOT_REPARSE_POINT'
  }
  $rootFull = $rootItem.FullName.TrimEnd('\')
  return @(
    foreach ($item in @(Get-ChildItem -LiteralPath $rootFull -Force -Recurse | Sort-Object FullName)) {
      if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "DATA_REPARSE_POINT_$($item.FullName)"
      }
      $relative = $item.FullName.Substring($rootFull.Length + 1).Replace('\', '/')
      if ($item.PSIsContainer) {
        [ordered]@{ path = $relative; type = 'directory'; bytes = $null; sha256 = $null }
      }
      else {
        [ordered]@{
          path = $relative
          type = 'file'
          bytes = $item.Length
          sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
        }
      }
    }
  )
}

function Read-RegistryValue([string]$Subkey, [string]$Name) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::CurrentUser,
    [Microsoft.Win32.RegistryView]::Registry64
  )
  try {
    $key = $base.OpenSubKey($Subkey, $false)
    if ($null -eq $key) {
      return [ordered]@{ exists = $false; kind = $null; value = $null }
    }
    try {
      if (-not @($key.GetValueNames()).Contains($Name)) {
        return [ordered]@{ exists = $false; kind = $null; value = $null }
      }
      $value = $key.GetValue(
        $Name,
        $null,
        [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
      )
      return [ordered]@{
        exists = $true
        kind = $key.GetValueKind($Name).ToString()
        value = if ($value -is [byte[]]) { [Convert]::ToHexString($value) } else { $value }
      }
    }
    finally {
      $key.Dispose()
    }
  }
  finally {
    $base.Dispose()
  }
}

$locationDocument = Get-Content -LiteralPath $location -Raw -Encoding utf8 | ConvertFrom-Json
$runSubkey = 'Software\Microsoft\Windows\CurrentVersion\Run'
$startupSubkey = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$uninstallSubkey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\5555e988-f7b5-5fe3-b6bd-8df3b21f793e'
$uninstallPresence = Read-RegistryValue $uninstallSubkey 'UninstallString'
$processIds = @(
  Get-Process Mashiro -ErrorAction SilentlyContinue |
    Where-Object { [string]::Equals($_.Path, $executable, [StringComparison]::Ordinal) } |
    Select-Object -ExpandProperty Id
)

$report = [ordered]@{
  scope = 'release-v6 exact same-path upgrade preservation snapshot'
  observedAt = [DateTimeOffset]::Now.ToString('o')
  phase = $Phase
  scene = $scene
  install = $install
  processIds = $processIds
  executable = Read-File $executable
  asar = Read-File $asar
  uninstaller = Read-File $uninstaller
  unknownFile = Read-File $unknown
  data = [ordered]@{ path = $data; entries = Read-Tree $data }
  location = [ordered]@{
    path = $location
    sha256 = (Get-FileHash -LiteralPath $location -Algorithm SHA256).Hash
    dataPath = $locationDocument.dataPath
    dataSetId = $locationDocument.dataSetId
  }
  run = [ordered]@{
    old = Read-RegistryValue $runSubkey 'Mashiro.Desktop'
    current = Read-RegistryValue $runSubkey 'io.github.molotov0cocktail.mashiro'
    oldStartupApproved = Read-RegistryValue $startupSubkey 'Mashiro.Desktop'
    currentStartupApproved = Read-RegistryValue $startupSubkey 'io.github.molotov0cocktail.mashiro'
  }
  uninstall = [ordered]@{
    guid = '5555e988-f7b5-5fe3-b6bd-8df3b21f793e'
    exists = $uninstallPresence.exists
    uninstallString = $uninstallPresence
  }
  unrelatedRegistryValuesRead = $false
  credentialContentsRead = $false
}

$output = Join-Path $evidence "delivery-014-release-v6-upgrade-$Phase.json"
[IO.File]::WriteAllText(
  $output,
  ($report | ConvertTo-Json -Depth 12) + [Environment]::NewLine,
  [Text.UTF8Encoding]::new($false)
)
[ordered]@{
  output = $output
  phase = $Phase
  processCount = $processIds.Count
  dataEntries = @($report.data.entries).Count
  oldRun = $report.run.old.exists
  currentRun = $report.run.current.exists
  uninstallGuidPresent = $report.uninstall.exists
  sha256 = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
} | ConvertTo-Json -Compress
