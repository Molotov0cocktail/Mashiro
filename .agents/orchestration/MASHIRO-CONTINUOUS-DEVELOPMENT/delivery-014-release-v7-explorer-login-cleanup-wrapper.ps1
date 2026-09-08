$ErrorActionPreference = 'Stop'
$output = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\delivery-014-release-v7-explorer-login-cleanup-01.json'
if (Test-Path -LiteralPath $output) { throw 'OUTPUT_ALREADY_EXISTS' }

Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MashiroExplorerPostUninstallOwner {
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
}
'@

$shellProcessId = [uint32]0
[void][MashiroExplorerPostUninstallOwner]::GetWindowThreadProcessId(
  [MashiroExplorerPostUninstallOwner]::GetShellWindow(),
  [ref]$shellProcessId
)
$self = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
$parentProcessId = [int]$self.ParentProcessId
$parent = Get-Process -Id $parentProcessId -ErrorAction Stop

function Read-RegistryValue([string]$subkey, [string]$name) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::CurrentUser,
    [Microsoft.Win32.RegistryView]::Registry64
  )
  try {
    $key = $base.OpenSubKey($subkey, $false)
    if ($null -eq $key) { return [ordered]@{ keyExists = $false; valueExists = $false; kind = $null; value = $null } }
    try {
      if (-not @($key.GetValueNames()).Contains($name)) {
        return [ordered]@{ keyExists = $true; valueExists = $false; kind = $null; value = $null }
      }
      return [ordered]@{
        keyExists = $true
        valueExists = $true
        kind = $key.GetValueKind($name).ToString()
        value = $key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
      }
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

$install = 'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本'
$runKey = 'Software\Microsoft\Windows\CurrentVersion\Run'
$report = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  wrapperProcessId = $PID
  parentProcessId = $parentProcessId
  shellProcessId = $shellProcessId
  parentProcessName = $parent.ProcessName
  parentIsShellProcess = $parentProcessId -eq $shellProcessId -and $parent.ProcessName -eq 'explorer'
  is64Bit = [Environment]::Is64BitProcess
  program = [ordered]@{
    executableExists = Test-Path -LiteralPath (Join-Path $install 'Mashiro.exe') -PathType Leaf
    asarExists = Test-Path -LiteralPath (Join-Path $install 'resources\app.asar') -PathType Leaf
    uninstallerExists = Test-Path -LiteralPath (Join-Path $install 'Uninstall Mashiro.exe') -PathType Leaf
  }
  dataRootExists = Test-Path -LiteralPath (Join-Path $install 'data') -PathType Container
  shortcutExists = Test-Path -LiteralPath 'C:\Users\30910\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Mashiro.lnk' -PathType Leaf
  run = [ordered]@{
    old = Read-RegistryValue $runKey 'Mashiro.Desktop'
    current = Read-RegistryValue $runKey 'io.github.molotov0cocktail.mashiro'
  }
  com = [ordered]@{
    preOverlayClsid = Read-RegistryValue 'Software\Classes\CLSID\{145B11B4-27B4-4C65-8585-F689F4C2CBB9}\LocalServer32' ''
    postOverlayClsid = Read-RegistryValue 'Software\Classes\CLSID\{88058F74-4FE1-4431-8581-09F8762BDEBC}\LocalServer32' ''
  }
  uninstallGuid = Read-RegistryValue 'Software\Microsoft\Windows\CurrentVersion\Uninstall\5555e988-f7b5-5fe3-b6bd-8df3b21f793e' 'UninstallString'
  registryWrites = $false
  comInvoked = $false
}

$json = ($report | ConvertTo-Json -Depth 10) + "`n"
$bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
