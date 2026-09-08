$ErrorActionPreference='Stop'
$profilePreflightStage='INITIALIZE'
$didMove=$false
$restoredOnFailure=$false
try {
$ErrorActionPreference = 'Stop'
$reportPath = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\review019-profile-preserve-pending-01.json'
if (Test-Path -LiteralPath $reportPath) { throw 'REPORT_EXISTS' }

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class MashiroProfilePreflightNative {
  [DllImport("user32.dll")] public static extern IntPtr GetShellWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [StructLayout(LayoutKind.Sequential, Pack=4)] public struct FileInfo {
    public uint Attributes; public long Creation; public long Access; public long Write;
    public uint Volume; public uint SizeHigh; public uint SizeLow; public uint Links;
    public uint IndexHigh; public uint IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  public static extern IntPtr CreateFile(string p, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GetFileInformationByHandle(IntPtr h, out FileInfo info);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
}
'@

function Get-DirectoryIdentity([string]$path) {
  $handle = [MashiroProfilePreflightNative]::CreateFile($path, 0, 7, [IntPtr]::Zero, 3, 0x02000000, [IntPtr]::Zero)
  if ($handle -eq [IntPtr]::new(-1)) { throw 'DIRECTORY_ID_UNAVAILABLE' }
  try {
    $info = New-Object MashiroProfilePreflightNative+FileInfo
    if (-not [MashiroProfilePreflightNative]::GetFileInformationByHandle($handle, [ref]$info)) { throw 'DIRECTORY_ID_UNAVAILABLE' }
    return ('{0:X8}:{1:X8}{2:X8}' -f $info.Volume, $info.IndexHigh, $info.IndexLow)
  } finally { [void][MashiroProfilePreflightNative]::CloseHandle($handle) }
}

function Read-RegistryValue([string]$subkey, [string]$name) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser, [Microsoft.Win32.RegistryView]::Registry64)
  try {
    $key = $base.OpenSubKey($subkey, $false)
    if ($null -eq $key) { return @{ keyExists=$false; valueExists=$false } }
    try {
      if (-not @($key.GetValueNames()).Contains($name)) { return @{ keyExists=$true; valueExists=$false } }
      return @{ keyExists=$true; valueExists=$true; kind=$key.GetValueKind($name).ToString(); value=$key.GetValue($name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) }
    } finally { $key.Dispose() }
  } finally { $base.Dispose() }
}

$profilePreflightStage = 'OWNER_CHECK'
$desktopProcessId = [uint32]0
[void][MashiroProfilePreflightNative]::GetWindowThreadProcessId([MashiroProfilePreflightNative]::GetShellWindow(), [ref]$desktopProcessId)
$parentProcessId = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop).ParentProcessId
if ($parentProcessId -ne $desktopProcessId -or $desktopProcessId -eq 0) { throw 'NOT_DESKTOP_CONTEXT' }
if (@(Get-Process -Name Mashiro -ErrorAction SilentlyContinue).Count) { throw 'MASHIRO_RUNNING' }
$profilePath = [IO.Path]::GetFullPath((Join-Path $env:APPDATA 'Mashiro'))
if ($profilePath.StartsWith('\\') -or -not $profilePath.StartsWith([IO.Path]::GetFullPath($env:USERPROFILE) + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'PROFILE_SCOPE_INVALID' }
$cursor = $profilePath
while ($cursor) {
  $entry = Get-Item -LiteralPath $cursor -Force
  if (-not $entry.PSIsContainer -or ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'PROFILE_PATH_UNSAFE' }
  $cursor = [IO.Path]::GetDirectoryName($cursor)
}
$profilePreflightStage = 'TREE_READ'
$identity = Get-DirectoryIdentity $profilePath
$records = [Collections.Generic.List[string]]::new()
$queue = [Collections.Generic.Queue[string]]::new()
$queue.Enqueue($profilePath)
$fileCount = 0
$totalBytes = [long]0
while ($queue.Count) {
  $directory = $queue.Dequeue()
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PROFILE_CONTAINS_REPARSE_POINT' }
    $relative = $entry.FullName.Substring($profilePath.Length + 1)
    if ($entry.PSIsContainer) {
      $records.Add('D|' + $relative)
      $queue.Enqueue($entry.FullName)
    } else {
      $length = $entry.Length
      $modified = $entry.LastWriteTimeUtc.Ticks
      $hash = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
      $after = Get-Item -LiteralPath $entry.FullName -Force
      if ($after.Length -ne $length -or $after.LastWriteTimeUtc.Ticks -ne $modified) { throw 'PROFILE_CHANGED_DURING_READ' }
      $records.Add('F|' + $relative + '|' + $length + '|' + $hash)
      $fileCount += 1
      $totalBytes += $length
    }
  }
}
$records.Sort([StringComparer]::Ordinal)
$digest = [Security.Cryptography.SHA256]::Create()
try { $treeHash = ([BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]::Join("`n", $records))))).Replace('-', '') } finally { $digest.Dispose() }
if ((Get-DirectoryIdentity $profilePath) -ne $identity) { throw 'PROFILE_ID_CHANGED' }
$profilePreflightStage = 'REGISTRY_READ'
$runPath = 'Software\Microsoft\Windows\CurrentVersion\Run'
$approvalPath = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
$report = [ordered]@{
  kind='PROFILE_READ_ONLY_PREFLIGHT'; observedAt=[DateTimeOffset]::Now.ToString('o'); processId=$PID;
  parentProcessId=$parentProcessId; shellProcessId=$desktopProcessId; profilePath=$profilePath;
  directoryIdentity=$identity; treeHash=$treeHash; fileCount=$fileCount; totalBytes=$totalBytes;
  runCurrent=(Read-RegistryValue $runPath 'io.github.molotov0cocktail.mashiro');
  runLegacy=(Read-RegistryValue $runPath 'Mashiro.Desktop');
  approvalCurrent=(Read-RegistryValue $approvalPath 'io.github.molotov0cocktail.mashiro');
  approvalLegacy=(Read-RegistryValue $approvalPath 'Mashiro.Desktop');
  uninstall=(Read-RegistryValue 'Software\Microsoft\Windows\CurrentVersion\Uninstall\5555e988-f7b5-5fe3-b6bd-8df3b21f793e' 'UninstallString');
  profileMoved=$false; applicationStarted=$false; businessContentParsed=$false; registryWrites=$false
}
$expectedProfile = 'C:\Users\30910\AppData\Roaming\Mashiro'
$preservedPath = 'C:\Users\30910\AppData\Roaming\Mashiro-preserved-019-20260908-69f785a9'
$expectedIdentity = 'D4AE69AB:011C00000001C1FF'
$expectedTreeHash = 'BFA47C4C5514DE7E6183202465063DB767B65C2593BD0BDAC6A7B70419EAE103'
if (-not [string]::Equals($profilePath,$expectedProfile,[StringComparison]::OrdinalIgnoreCase)) { throw 'PROFILE_SCOPE_CHANGED' }
if (-not [string]::Equals([IO.Path]::GetDirectoryName($profilePath),[IO.Path]::GetDirectoryName($preservedPath),[StringComparison]::OrdinalIgnoreCase)) { throw 'DESTINATION_SCOPE_INVALID' }
if ($identity -ne $expectedIdentity -or $treeHash -ne $expectedTreeHash) { throw 'PROFILE_BASELINE_CHANGED' }
if (Test-Path -LiteralPath $preservedPath) { throw 'PRESERVATION_TARGET_EXISTS' }
if ($report.runCurrent.valueExists -or $report.runLegacy.valueExists -or $report.approvalCurrent.valueExists -or $report.approvalLegacy.valueExists -or $report.uninstall.keyExists) { throw 'INSTALLATION_BASELINE_CHANGED' }
$report.kind='PROFILE_PRESERVE_PENDING'
$report['preservedPath']=$preservedPath
$bytes = [Text.UTF8Encoding]::new($false).GetBytes(($report | ConvertTo-Json -Depth 8) + "`n")
$stream = [IO.File]::Open($reportPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }

$profilePreflightStage='PRESERVE_MOVE'
if (@(Get-Process -Name Mashiro -ErrorAction SilentlyContinue).Count) { throw 'MASHIRO_RUNNING' }
if ((Get-DirectoryIdentity $profilePath) -ne $expectedIdentity) { throw 'PROFILE_ID_CHANGED' }
[IO.Directory]::Move($profilePath,$preservedPath)
$didMove=$true
if (Test-Path -LiteralPath $profilePath) { throw 'ORIGINAL_PATH_REAPPEARED' }
if ((Get-DirectoryIdentity $preservedPath) -ne $expectedIdentity) { throw 'PRESERVED_ID_CHANGED' }
$profilePreflightStage='VERIFY_PRESERVED_TREE'
$originalProfilePath=$profilePath
$profilePath=$preservedPath
$identity = Get-DirectoryIdentity $profilePath
$records = [Collections.Generic.List[string]]::new()
$queue = [Collections.Generic.Queue[string]]::new()
$queue.Enqueue($profilePath)
$fileCount = 0
$totalBytes = [long]0
while ($queue.Count) {
  $directory = $queue.Dequeue()
  foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
    if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'PROFILE_CONTAINS_REPARSE_POINT' }
    $relative = $entry.FullName.Substring($profilePath.Length + 1)
    if ($entry.PSIsContainer) {
      $records.Add('D|' + $relative)
      $queue.Enqueue($entry.FullName)
    } else {
      $length = $entry.Length
      $modified = $entry.LastWriteTimeUtc.Ticks
      $hash = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
      $after = Get-Item -LiteralPath $entry.FullName -Force
      if ($after.Length -ne $length -or $after.LastWriteTimeUtc.Ticks -ne $modified) { throw 'PROFILE_CHANGED_DURING_READ' }
      $records.Add('F|' + $relative + '|' + $length + '|' + $hash)
      $fileCount += 1
      $totalBytes += $length
    }
  }
}
$records.Sort([StringComparer]::Ordinal)
$digest = [Security.Cryptography.SHA256]::Create()
try { $treeHash = ([BitConverter]::ToString($digest.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]::Join("`n", $records))))).Replace('-', '') } finally { $digest.Dispose() }
if ((Get-DirectoryIdentity $profilePath) -ne $identity) { throw 'PROFILE_ID_CHANGED' }

if ($identity -ne $expectedIdentity -or $treeHash -ne $expectedTreeHash) { throw 'PRESERVED_TREE_CHANGED' }
if (Test-Path -LiteralPath $originalProfilePath) { throw 'ORIGINAL_PATH_REAPPEARED' }
$receipt=@{ kind='PROFILE_PRESERVED'; at=[DateTimeOffset]::Now.ToString('o'); source=$originalProfilePath; preservedPath=$preservedPath; identity=$identity; treeHash=$treeHash; fileCount=$fileCount; totalBytes=$totalBytes; profileMoved=$true; sourceAbsent=$true; newProfileCreated=$false; registryWrites=$false; businessContentParsed=$false }
$receiptBytes=[Text.UTF8Encoding]::new($false).GetBytes(($receipt | ConvertTo-Json -Depth 5)+"`n")
$receiptStream=[IO.File]::Open('D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\review019-profile-preserved-01.json',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try { $receiptStream.Write($receiptBytes,0,$receiptBytes.Length); $receiptStream.Flush($true) } finally { $receiptStream.Dispose() }
} catch {
  if ($didMove) {
    try {
      if (-not (Test-Path -LiteralPath $expectedProfile) -and (Test-Path -LiteralPath $preservedPath) -and (Get-DirectoryIdentity $preservedPath) -eq $expectedIdentity) {
        [IO.Directory]::Move($preservedPath,$expectedProfile)
        $restoredOnFailure=$true
      }
    } catch { $restoredOnFailure=$false }
  }
  $failure=@{ kind='PROFILE_PRESERVATION_FAILED'; stage=$profilePreflightStage; code='PRESERVATION_OPERATION_FAILED'; at=[DateTimeOffset]::Now.ToString('o'); moveOccurred=$didMove; restoredOnFailure=$restoredOnFailure; registryWrites=$false; dataDeleted=$false }
  try {
    $failureBytes=[Text.UTF8Encoding]::new($false).GetBytes(($failure|ConvertTo-Json -Compress)+"`n")
    $failureStream=[IO.File]::Open('D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\review019-profile-preserve-failed-01.json',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    try { $failureStream.Write($failureBytes,0,$failureBytes.Length); $failureStream.Flush($true) } finally { $failureStream.Dispose() }
  } catch { [Console]::Error.WriteLine('PROFILE_PRESERVATION_FAILURE_RECEIPT_UNAVAILABLE') }
  exit 1
}