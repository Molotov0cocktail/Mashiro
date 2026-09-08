$ErrorActionPreference = 'Stop'
$output =
  'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\delivery-014-release-v6-explorer-old-run-01.json'
if (Test-Path -LiteralPath $output) { throw 'OUTPUT_ALREADY_EXISTS' }
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class MashiroExplorerOldRunOwner {
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
}
'@
$shellProcessId = [uint32]0
[void][MashiroExplorerOldRunOwner]::GetWindowThreadProcessId(
  [MashiroExplorerOldRunOwner]::GetShellWindow(), [ref]$shellProcessId
)
$self = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
$parentProcessId = [int]$self.ParentProcessId
$parent = Get-Process -Id $parentProcessId -ErrorAction Stop
$runPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$oldName = 'Mashiro.Desktop'
$expected =
  '"C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe" --mashiro-login'
$key = Get-Item -LiteralPath $runPath -ErrorAction Stop
$oldValue = Get-ItemPropertyValue -LiteralPath $runPath -Name $oldName -ErrorAction Stop
$matchesCurrent = [string]::Equals($oldValue, $expected, [StringComparison]::Ordinal)
$oldBytes = [Text.Encoding]::UTF8.GetBytes([string]$oldValue)
$report = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  wrapperProcessId = $PID
  parentProcessId = $parentProcessId
  shellProcessId = $shellProcessId
  parentProcessName = $parent.ProcessName
  parentIsShellProcess = $parentProcessId -eq $shellProcessId -and $parent.ProcessName -eq 'explorer'
  oldRunName = $oldName
  oldRunValueKind = $key.GetValueKind($oldName).ToString()
  oldRunMatchesCurrentInstalledExecutable = $matchesCurrent
  oldRunValue = if ($matchesCurrent) { $oldValue } else { $null }
  oldRunValueSha256 = ([BitConverter]::ToString(
    [Security.Cryptography.SHA256]::HashData($oldBytes)
  )).Replace('-', '')
  nonCurrentValueSaved = $false
  registryWrites = $false
  comInvoked = $false
}
$json = ($report | ConvertTo-Json -Depth 6) + "`n"
$bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
