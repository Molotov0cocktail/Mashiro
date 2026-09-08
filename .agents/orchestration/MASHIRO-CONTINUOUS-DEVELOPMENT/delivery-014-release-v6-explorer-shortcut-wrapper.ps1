$ErrorActionPreference = 'Stop'
$root = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT'
$helper = Join-Path $root 'delivery-014-release-v6-shortcut-metadata.ps1'
$output = Join-Path $root 'delivery-014-release-v6-explorer-shortcut-after-app-launch-01.json'
if (Test-Path -LiteralPath $output) { throw 'OUTPUT_ALREADY_EXISTS' }

Add-Type @'
using System;using System.Runtime.InteropServices;
public static class MashiroExplorerShortcutOwner {
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
}
'@
$shellProcessId = [uint32]0
[void][MashiroExplorerShortcutOwner]::GetWindowThreadProcessId(
  [MashiroExplorerShortcutOwner]::GetShellWindow(),
  [ref]$shellProcessId
)
$self = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
$parentProcessId = [int]$self.ParentProcessId
$parent = Get-Process -Id $parentProcessId -ErrorAction Stop
$metadata = $null
$errorType = $null
$errorText = $null
try {
  $metadata = (& $helper) | ConvertFrom-Json
} catch {
  $errorType = $_.Exception.GetType().FullName
  $errorText = $_.Exception.Message
}
$report = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  wrapperProcessId = $PID
  parentProcessId = $parentProcessId
  shellProcessId = $shellProcessId
  parentProcessName = $parent.ProcessName
  parentIsShellProcess = $parentProcessId -eq $shellProcessId -and $parent.ProcessName -eq 'explorer'
  is64Bit = [Environment]::Is64BitProcess
  metadata = $metadata
  errorType = $errorType
  errorText = $errorText
  comInvoked = $false
  registryWrites = $false
}
$json = ($report | ConvertTo-Json -Depth 9) + "`n"
$bytes = [Text.UTF8Encoding]::new($false).GetBytes($json)
$stream = [IO.File]::Open($output, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose() }
