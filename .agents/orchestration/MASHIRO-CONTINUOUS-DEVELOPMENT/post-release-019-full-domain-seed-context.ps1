param(
  [Parameter(Mandatory = $true)]
  [int]$TargetProcessId,
  [Parameter(Mandatory = $true)]
  [string]$ProfilePath
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Mashiro019SeedContextNative {
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [StructLayout(LayoutKind.Sequential, Pack=4)] public struct FileInfo {
    public uint Attributes; public long Creation; public long Access; public long Write;
    public uint Volume; public uint SizeHigh; public uint SizeLow; public uint Links;
    public uint IndexHigh; public uint IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateFile(string path, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetFileInformationByHandle(IntPtr handle, out FileInfo info);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
"@

function Get-DirectoryIdentity([string]$Path) {
  $handle = [Mashiro019SeedContextNative]::CreateFile(
    $Path,
    0,
    7,
    [IntPtr]::Zero,
    3,
    0x02000000,
    [IntPtr]::Zero
  )
  if ($handle -eq [IntPtr]::new(-1)) { throw 'PROFILE_IDENTITY_UNAVAILABLE' }
  try {
    $info = New-Object Mashiro019SeedContextNative+FileInfo
    if (-not [Mashiro019SeedContextNative]::GetFileInformationByHandle($handle, [ref]$info)) {
      throw 'PROFILE_IDENTITY_UNAVAILABLE'
    }
    return ('{0:X8}:{1:X8}{2:X8}' -f $info.Volume, $info.IndexHigh, $info.IndexLow)
  } finally {
    [void][Mashiro019SeedContextNative]::CloseHandle($handle)
  }
}

$expectedProfile = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Mashiro')).TrimEnd('\')
$actualProfile = [IO.Path]::GetFullPath($ProfilePath).TrimEnd('\')
if (-not $actualProfile.Equals($expectedProfile, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'PROFILE_SCOPE_CHANGED'
}
$profileItem = Get-Item -LiteralPath $actualProfile -Force
if (
  -not $profileItem.PSIsContainer -or
  ($profileItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -or
  -not $profileItem.FullName.TrimEnd('\').Equals($actualProfile, [StringComparison]::OrdinalIgnoreCase)
) {
  throw 'PROFILE_PATH_UNSAFE'
}

[uint32]$shellProcessId = 0
[void][Mashiro019SeedContextNative]::GetWindowThreadProcessId(
  [Mashiro019SeedContextNative]::GetShellWindow(),
  [ref]$shellProcessId
)
$currentProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
$targetProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$TargetProcessId" -ErrorAction Stop
$target = Get-Process -Id $TargetProcessId -ErrorAction Stop
$shell = Get-Process -Id $shellProcessId -ErrorAction Stop
if (
  $shellProcessId -eq 0 -or
  [int]$currentProcess.ParentProcessId -ne $TargetProcessId -or
  [int]$targetProcess.ParentProcessId -ne $shellProcessId -or
  $shell.ProcessName -ne 'explorer' -or
  $target.ProcessName -ne 'node'
) {
  throw 'NOT_DIRECT_DESKTOP_NODE_CONTEXT'
}

[ordered]@{
  schemaVersion = 1
  kind = 'FULL_DOMAIN_SEED_DESKTOP_CONTEXT'
  targetProcessId = $TargetProcessId
  helperParentIsTarget = $true
  parentProcessId = [int]$targetProcess.ParentProcessId
  shellProcessId = $shellProcessId
  parentIsShell = $true
  targetProcessName = $target.ProcessName
  profilePath = $actualProfile
  profileIdentity = Get-DirectoryIdentity $actualProfile
  profileWrite = $false
  registryRead = $false
  applicationStarted = $false
} | ConvertTo-Json -Depth 4 -Compress
