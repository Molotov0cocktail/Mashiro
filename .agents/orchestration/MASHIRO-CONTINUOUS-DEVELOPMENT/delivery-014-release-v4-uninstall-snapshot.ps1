param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('pre', 'post')]
  [string]$Phase
)

$ErrorActionPreference = 'Stop'
$scene = 'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp'
$install = Join-Path $scene '安装 旧版本'
$data = Join-Path $install 'data'
$executable = Join-Path $install 'Mashiro.exe'
$asar = Join-Path $install 'resources\app.asar'
$uninstaller = Join-Path $install 'Uninstall Mashiro.exe'
$unknownFile = Join-Path $install 'uninstall-preserve-user-v4.txt'
$shortcut = 'C:\Users\30910\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Mashiro.lnk'
$location = 'C:\Users\30910\AppData\Roaming\Mashiro\configuration\location.json'
$runSubkey = 'Software\Microsoft\Windows\CurrentVersion\Run'
$startupSubkey = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$uninstallSubkey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\5555e988-f7b5-5fe3-b6bd-8df3b21f793e'
$knownClsids = @(
  '{B5051779-A11F-4603-BE81-C87C46CCB6C5}',
  '{14AB9FD1-34ED-48E8-8F0C-906FA2009CFA}',
  '{4750F408-E9BA-47B9-90F7-9F926B5DA47F}',
  '{77ECE83F-1281-41F7-A306-A45192D2B840}'
)
$evidence = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT'

function Open-CurrentUserKey([string]$Subkey) {
  $view = [Microsoft.Win32.RegistryView]::Registry64
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::CurrentUser,
    $view
  )
  try {
    return $base.OpenSubKey($Subkey, $false)
  }
  finally {
    $base.Dispose()
  }
}

function Read-RegistryValue([string]$Subkey, [string]$Name) {
  $key = Open-CurrentUserKey $Subkey
  if ($null -eq $key) {
    return [ordered]@{ keyExists = $false; valueExists = $false; kind = $null; value = $null }
  }
  try {
    $matchingNames = @(
      $key.GetValueNames() |
        Where-Object { [string]::Equals($_, $Name, [StringComparison]::Ordinal) }
    )
    if ($matchingNames.Count -ne 1) {
      return [ordered]@{ keyExists = $true; valueExists = $false; kind = $null; value = $null }
    }
    $kind = $key.GetValueKind($Name).ToString()
    $value = $key.GetValue($Name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    if ($value -is [byte[]]) {
      return [ordered]@{
        keyExists = $true
        valueExists = $true
        kind = $kind
        value = [Convert]::ToHexString($value)
      }
    }
    return [ordered]@{ keyExists = $true; valueExists = $true; kind = $kind; value = $value }
  }
  finally {
    $key.Dispose()
  }
}

function Read-RegistryKeySummary([string]$Subkey) {
  $key = Open-CurrentUserKey $Subkey
  if ($null -eq $key) {
    return [ordered]@{ exists = $false; values = @{}; subkeys = @() }
  }
  try {
    $values = [ordered]@{}
    foreach ($name in @($key.GetValueNames() | Sort-Object)) {
      $safeName = if ($name.Length -eq 0) { '(default)' } else { $name }
      $value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      $values[$safeName] = [ordered]@{
        kind = $key.GetValueKind($name).ToString()
        value = if ($value -is [byte[]]) { [Convert]::ToHexString($value) } else { $value }
      }
    }
    return [ordered]@{
      exists = $true
      values = $values
      subkeys = @($key.GetSubKeyNames() | Sort-Object)
    }
  }
  finally {
    $key.Dispose()
  }
}

function Read-FileSummary([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return [ordered]@{ exists = $false; bytes = $null; sha256 = $null }
  }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "REPARSE_FILE_$Path"
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
  $entries = @()
  foreach ($item in @(Get-ChildItem -LiteralPath $rootFull -Force -Recurse | Sort-Object FullName)) {
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "DATA_REPARSE_POINT_$($item.FullName)"
    }
    $relative = $item.FullName.Substring($rootFull.Length + 1).Replace('\', '/')
    if ($item.PSIsContainer) {
      $entries += [ordered]@{ path = $relative; type = 'directory'; bytes = $null; sha256 = $null }
    }
    else {
      $entries += [ordered]@{
        path = $relative
        type = 'file'
        bytes = $item.Length
        sha256 = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256).Hash
      }
    }
  }
  return $entries
}

$processIds = @(
  Get-Process -Name Mashiro -ErrorAction SilentlyContinue |
    Where-Object { [string]::Equals($_.Path, $executable, [StringComparison]::Ordinal) } |
    Select-Object -ExpandProperty Id
)
$shortcutMetadata = $null
if (Test-Path -LiteralPath $shortcut -PathType Leaf) {
  $shortcutMetadata = (& (Join-Path $evidence 'delivery-014-mashiro-shortcut-metadata.ps1')) |
    ConvertFrom-Json
}
$locationJson = Get-Content -LiteralPath $location -Raw | ConvertFrom-Json
$toast = @(
  foreach ($clsid in $knownClsids) {
    [ordered]@{
      clsid = $clsid
      registration = Read-RegistryKeySummary ("Software\Classes\CLSID\$clsid\LocalServer32")
      clsidKey = Read-RegistryKeySummary ("Software\Classes\CLSID\$clsid")
    }
  }
)

$report = [ordered]@{
  scope = 'exact isolated Mashiro final-v4 uninstall preservation state'
  observedAt = [DateTimeOffset]::Now.ToString('o')
  phase = $Phase
  scene = $scene
  processIds = $processIds
  installDirectoryExists = Test-Path -LiteralPath $install -PathType Container
  executable = Read-FileSummary $executable
  asar = Read-FileSummary $asar
  uninstaller = Read-FileSummary $uninstaller
  unknownFile = Read-FileSummary $unknownFile
  data = [ordered]@{
    path = $data
    entries = Read-Tree $data
  }
  location = [ordered]@{
    path = $location
    sha256 = (Get-FileHash -LiteralPath $location -Algorithm SHA256).Hash
    dataPath = $locationJson.dataPath
    dataSetId = $locationJson.dataSetId
  }
  run = [ordered]@{
    appId = Read-RegistryValue $runSubkey 'Mashiro.Desktop'
    legacy = Read-RegistryValue $runSubkey 'Mashiro'
    startupApproved = Read-RegistryValue $startupSubkey 'Mashiro.Desktop'
  }
  shortcut = if ($null -eq $shortcutMetadata) { [ordered]@{ exists = $false } } else {
    [ordered]@{ exists = $true; metadata = $shortcutMetadata }
  }
  toastActivators = $toast
  uninstallRegistration = Read-RegistryKeySummary $uninstallSubkey
  unrelatedRegistryValuesRead = $false
  fileContentsRead = @('location.json')
  credentialContentsRead = $false
}

$output = Join-Path $evidence "delivery-014-release-v4-uninstall-system-$Phase.json"
$json = ($report | ConvertTo-Json -Depth 12) + [Environment]::NewLine
[IO.File]::WriteAllText($output, $json, [Text.UTF8Encoding]::new($false))
[ordered]@{
  output = $output
  phase = $Phase
  processCount = $processIds.Count
  dataEntries = @($report.data.entries).Count
  runPresent = $report.run.appId.valueExists
  startupApprovedPresent = $report.run.startupApproved.valueExists
  shortcutPresent = $report.shortcut.exists
  toastRegistrationsPresent = @($toast | Where-Object { $_.registration.exists }).Count
  uninstallRegistrationPresent = $report.uninstallRegistration.exists
  sha256 = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
} | ConvertTo-Json -Compress
