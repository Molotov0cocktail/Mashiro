param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('pre', 'post')]
  [string]$Phase
)

$ErrorActionPreference = 'Stop'
$install = 'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本'
$executable = Join-Path $install 'Mashiro.exe'
$asar = Join-Path $install 'resources\app.asar'
$uninstaller = Join-Path $install 'Uninstall Mashiro.exe'
$shortcut = 'C:\Users\30910\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Mashiro.lnk'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$clsid = '{B5051779-A11F-4603-BE81-C87C46CCB6C5}'
$localServerKey = 'HKCU:\Software\Classes\CLSID\' + $clsid + '\LocalServer32'
$toastActivatorClsids = @(
  $clsid,
  '{14AB9FD1-34ED-48E8-8F0C-906FA2009CFA}'
)
$uninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\5555e988-f7b5-5fe3-b6bd-8df3b21f793e'
$evidenceDirectory = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT'

function Read-NamedValue([string]$Path, [string]$Name) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  try { return Get-ItemPropertyValue -LiteralPath $Path -Name $Name -ErrorAction Stop }
  catch [System.Management.Automation.PSArgumentException] { return $null }
}

function Read-DefaultValue([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  return (Get-Item -LiteralPath $Path).GetValue('')
}

function Read-File([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return [ordered]@{ exists = $false; bytes = $null; sha256 = $null }
  }
  $item = Get-Item -LiteralPath $Path
  return [ordered]@{
    exists = $true
    bytes = $item.Length
    sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
  }
}

$processIds = @(
  Get-Process -Name Mashiro -ErrorAction SilentlyContinue |
    Where-Object { [string]::Equals($_.Path, $executable, [StringComparison]::Ordinal) } |
    Select-Object -ExpandProperty Id
)
$shortcutMetadata = $null
if (Test-Path -LiteralPath $shortcut -PathType Leaf) {
  $shortcutMetadata = (& (Join-Path $evidenceDirectory 'delivery-014-mashiro-shortcut-metadata.ps1')) | ConvertFrom-Json
}
$uninstall = $null
if (Test-Path -LiteralPath $uninstallKey) {
  $record = Get-ItemProperty -LiteralPath $uninstallKey
  $uninstall = [ordered]@{
    displayName = $record.DisplayName
    displayVersion = $record.DisplayVersion
    uninstallString = $record.UninstallString
    quietUninstallString = $record.QuietUninstallString
  }
}
$toastActivators = @(
  $toastActivatorClsids | ForEach-Object {
    $key = 'HKCU:\Software\Classes\CLSID\' + $_ + '\LocalServer32'
    [ordered]@{
      clsid = $_
      localServer32 = Read-DefaultValue $key
    }
  }
)
$report = [ordered]@{
  scope = 'exact isolated Mashiro installation system state before/after uninstall'
  observedAt = [DateTimeOffset]::Now.ToString('o')
  phase = $Phase
  installDirectoryExists = Test-Path -LiteralPath $install -PathType Container
  executable = Read-File $executable
  asar = Read-File $asar
  uninstaller = Read-File $uninstaller
  processIds = $processIds
  run = [ordered]@{
    appId = Read-NamedValue $runKey 'Mashiro.Desktop'
    legacyName = Read-NamedValue $runKey 'Mashiro'
  }
  shortcut = if ($null -eq $shortcutMetadata) { [ordered]@{ exists = $false } } else { $shortcutMetadata }
  toastActivator = [ordered]@{
    clsid = $clsid
    localServer32 = Read-DefaultValue $localServerKey
  }
  toastActivators = $toastActivators
  uninstallRegistration = $uninstall
  unrelatedRegistryValuesRead = $false
  personalDataAccessed = $false
}
$output = Join-Path $evidenceDirectory ('delivery-014-uninstall-system-' + $Phase + '.json')
[IO.File]::WriteAllText(
  $output,
  (($report | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
  [Text.UTF8Encoding]::new($false)
)
[ordered]@{
  output = $output
  phase = $Phase
  processCount = $processIds.Count
  executableExists = $report.executable.exists
  runAppIdPresent = $null -ne $report.run.appId
  shortcutExists = if ($null -eq $shortcutMetadata) { $false } else { $true }
  toastActivatorPresent = $null -ne $report.toastActivator.localServer32
  toastActivatorCount = @($toastActivators | Where-Object { $null -ne $_.localServer32 }).Count
  uninstallRegistrationPresent = $null -ne $uninstall
  sha256 = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
} | ConvertTo-Json -Depth 4
