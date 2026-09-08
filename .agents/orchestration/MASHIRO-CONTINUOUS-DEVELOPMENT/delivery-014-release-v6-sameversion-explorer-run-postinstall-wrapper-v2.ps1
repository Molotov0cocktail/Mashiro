$ErrorActionPreference = 'Stop'
$output =
  'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\delivery-014-release-v6-sameversion-explorer-run-postinstall-prelaunch-02.json'
if (Test-Path -LiteralPath $output) { throw 'OUTPUT_ALREADY_EXISTS' }

Add-Type @'
using System;using System.Runtime.InteropServices;
public static class MashiroExplorerRunOwner {
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
}
'@
$shellProcessId = [uint32]0
[void][MashiroExplorerRunOwner]::GetWindowThreadProcessId(
  [MashiroExplorerRunOwner]::GetShellWindow(),
  [ref]$shellProcessId
)
$self = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
$parentProcessId = [int]$self.ParentProcessId
$parent = Get-Process -Id $parentProcessId -ErrorAction Stop
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$newName = 'io.github.molotov0cocktail.mashiro'
$oldName = 'Mashiro.Desktop'
$expected =
  '"C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe" --mashiro-login'
function Read-Run([string]$Name) {
  try {
    Get-ItemPropertyValue -LiteralPath $runKey -Name $Name -ErrorAction Stop
  } catch {
    $null
  }
}
$newValue = Read-Run $newName
$oldValue = Read-Run $oldName
$report = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  wrapperProcessId = $PID
  parentProcessId = $parentProcessId
  shellProcessId = $shellProcessId
  parentProcessName = $parent.ProcessName
  parentIsShellProcess = $parentProcessId -eq $shellProcessId -and $parent.ProcessName -eq 'explorer'
  is64Bit = [Environment]::Is64BitProcess
  newRunName = $newName
  newRunValue = $newValue
  newRunExact = [string]::Equals($newValue, $expected, [StringComparison]::Ordinal)
  oldRunName = $oldName
  oldRunAbsent = $null -eq $oldValue
  registryWrites = $false
  comInvoked = $false
}
$json = ($report | ConvertTo-Json -Depth 6) + "`n"
$bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
