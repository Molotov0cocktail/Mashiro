param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('InitializeIsolation', 'FreezeTestProfile', 'RestoreOriginal')]
  [string]$Action
)

$ErrorActionPreference = 'Stop'
$sceneId = 'post-release-019-69f785a9'
$evidenceRoot = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT'
$bindingPath = Join-Path $evidenceRoot 'post-release-019-native-artifact-binding.json'
$initializedReceiptPath = Join-Path $evidenceRoot 'post-release-019-isolated-profile-initialized-01.json'
$testFinalReceiptPath = Join-Path $evidenceRoot 'post-release-019-test-profile-final-01.json'
$retirePendingPath = Join-Path $evidenceRoot 'post-release-019-profile-retire-pending-01.json'
$restorePendingPath = Join-Path $evidenceRoot 'post-release-019-profile-restore-pending-01.json'
$restoredReceiptPath = Join-Path $evidenceRoot 'post-release-019-original-profile-restored-01.json'
$failurePath = Join-Path $evidenceRoot ('post-release-019-profile-transition-' + $Action + '-failed-01.json')
$testMoved = $false
$originalMoved = $false
$stage = 'INITIALIZE'
$testSummary = $null

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class Mashiro019ProfileNative {
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
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool CreateDirectory(string path, IntPtr security);
}
"@

function Write-CreateNewJson([string]$path, [object]$value) {
  $bytes = [Text.UTF8Encoding]::new($false).GetBytes(($value | ConvertTo-Json -Depth 12) + [Environment]::NewLine)
  $stream = [IO.File]::Open($path, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::Read)
  try {
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Flush($true)
  } finally {
    $stream.Dispose()
  }
}

function Get-DirectoryIdentity([string]$path) {
  $handle = [Mashiro019ProfileNative]::CreateFile($path, 0, 7, [IntPtr]::Zero, 3, 0x02000000, [IntPtr]::Zero)
  if ($handle -eq [IntPtr]::new(-1)) { throw 'DIRECTORY_ID_UNAVAILABLE' }
  try {
    $info = New-Object Mashiro019ProfileNative+FileInfo
    if (-not [Mashiro019ProfileNative]::GetFileInformationByHandle($handle, [ref]$info)) {
      throw 'DIRECTORY_ID_UNAVAILABLE'
    }
    return ('{0:X8}:{1:X8}{2:X8}' -f $info.Volume, $info.IndexHigh, $info.IndexLow)
  } finally {
    [void][Mashiro019ProfileNative]::CloseHandle($handle)
  }
}

function Assert-ExistingDirectoryChain([string]$path) {
  $full = [IO.Path]::GetFullPath($path)
  $root = [IO.Path]::GetPathRoot($full)
  $rootItem = Get-Item -LiteralPath $root -Force
  if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'PATH_CHAIN_ROOT_UNSAFE'
  }
  $current = $root
  $relative = $full.Substring($root.Length)
  foreach ($segment in $relative.Split([char[]]@([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar), [StringSplitOptions]::RemoveEmptyEntries)) {
    $current = Join-Path $current $segment
    if (-not (Test-Path -LiteralPath $current)) { continue }
    $item = Get-Item -LiteralPath $current -Force
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
      throw 'PATH_CHAIN_CONTAINS_NON_DIRECTORY_OR_REPARSE'
    }
  }
}

function Get-TreeSummary([string]$path) {
  $root = [IO.Path]::GetFullPath($path)
  Assert-ExistingDirectoryChain $root
  $rootItem = Get-Item -LiteralPath $root -Force
  if (-not $rootItem.PSIsContainer -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'TREE_ROOT_UNSAFE'
  }
  $records = [Collections.Generic.List[string]]::new()
  $queue = [Collections.Generic.Queue[string]]::new()
  $queue.Enqueue($root)
  $fileCount = 0
  $totalBytes = [long]0
  while ($queue.Count) {
    $directory = $queue.Dequeue()
    foreach ($entry in Get-ChildItem -LiteralPath $directory -Force) {
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        throw 'TREE_CONTAINS_REPARSE_POINT'
      }
      $relative = $entry.FullName.Substring($root.Length + 1)
      if ($entry.PSIsContainer) {
        $records.Add('D|' + $relative)
        $queue.Enqueue($entry.FullName)
      } else {
        $length = $entry.Length
        $modified = $entry.LastWriteTimeUtc.Ticks
        $hash = (Get-FileHash -LiteralPath $entry.FullName -Algorithm SHA256).Hash
        $after = Get-Item -LiteralPath $entry.FullName -Force
        if ($after.Length -ne $length -or $after.LastWriteTimeUtc.Ticks -ne $modified) {
          throw 'TREE_CHANGED_DURING_READ'
        }
        $records.Add('F|' + $relative + '|' + $length + '|' + $hash)
        $fileCount += 1
        $totalBytes += $length
      }
    }
  }
  $records.Sort([StringComparer]::Ordinal)
  $digest = [Security.Cryptography.SHA256]::Create()
  try {
    $treeHash = ([BitConverter]::ToString(
      $digest.ComputeHash([Text.Encoding]::UTF8.GetBytes([string]::Join([char]10, $records)))
    )).Replace('-', '')
  } finally {
    $digest.Dispose()
  }
  return [ordered]@{
    identity = Get-DirectoryIdentity $root
    treeHash = $treeHash
    fileCount = $fileCount
    totalBytes = $totalBytes
  }
}

function Assert-Summary([object]$actual, [object]$expected, [string]$code) {
  if (
    [string]$actual.identity -ne [string]$expected.identity -or
    [string]$actual.treeHash -ne [string]$expected.treeHash -or
    [int]$actual.fileCount -ne [int]$expected.fileCount -or
    [long]$actual.totalBytes -ne [long]$expected.totalBytes
  ) {
    throw $code
  }
}

function Registry-ValueExists([string]$subkey, [string]$name) {
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::CurrentUser,
    [Microsoft.Win32.RegistryView]::Registry64
  )
  try {
    $key = $base.OpenSubKey($subkey, $false)
    if ($null -eq $key) { return $false }
    try {
      return @($key.GetValueNames()).Contains($name)
    } finally {
      $key.Dispose()
    }
  } finally {
    $base.Dispose()
  }
}

function Assert-NoMashiroProcesses {
  if (@(Get-Process -Name Mashiro -ErrorAction SilentlyContinue).Count) {
    throw 'MASHIRO_RUNNING'
  }
  if (@(
    Get-Process -Name 'Mashiro-0.1.1-win-x64-setup', 'Uninstall Mashiro' -ErrorAction SilentlyContinue
  ).Count) {
    throw 'INSTALLER_RUNNING'
  }
}

function Assert-RegistrationClear([object]$binding) {
  $runKey = 'Software\Microsoft\Windows\CurrentVersion\Run'
  $approvalKey = 'Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
  foreach ($name in @(
    [string]$binding.windowsIdentity.currentRunName,
    [string]$binding.windowsIdentity.legacyRunName
  )) {
    if (
      (Registry-ValueExists $runKey $name) -or
      (Registry-ValueExists $approvalKey $name)
    ) {
      throw 'LOGIN_REGISTRATION_REMAINS'
    }
  }

  $uninstallPath = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\' +
    [string]$binding.windowsIdentity.uninstallGuid
  $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey(
    [Microsoft.Win32.RegistryHive]::CurrentUser,
    [Microsoft.Win32.RegistryView]::Registry64
  )
  try {
    $key = $base.OpenSubKey($uninstallPath, $false)
    if ($null -ne $key) {
      $key.Dispose()
      throw 'UNINSTALL_REGISTRATION_REMAINS'
    }
  } finally {
    $base.Dispose()
  }
}

function Assert-Marker([string]$markerPath, [object]$binding) {
  if (-not (Test-Path -LiteralPath $markerPath -PathType Leaf)) {
    throw 'ISOLATION_MARKER_MISSING'
  }
  $marker = Get-Content -LiteralPath $markerPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (
    $marker.schemaVersion -ne 1 -or
    $marker.sceneId -ne $sceneId -or
    $marker.containsOriginalData -ne $false -or
    $marker.candidateSetupSha256 -ne $binding.candidate.setupSha256
  ) {
    throw 'ISOLATION_MARKER_INVALID'
  }
  return $marker
}

try {
  $stage = 'DESKTOP_OWNER'
  [uint32]$shellProcessId = 0
  [void][Mashiro019ProfileNative]::GetWindowThreadProcessId(
    [Mashiro019ProfileNative]::GetShellWindow(),
    [ref]$shellProcessId
  )
  $parentProcessId = [int](
    Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop
  ).ParentProcessId
  $parent = Get-Process -Id $parentProcessId -ErrorAction Stop
  if (
    $shellProcessId -eq 0 -or
    $parentProcessId -ne $shellProcessId -or
    $parent.ProcessName -ne 'explorer'
  ) {
    throw 'NOT_DESKTOP_CONTEXT'
  }
  Assert-NoMashiroProcesses

  $stage = 'BINDING'
  if (-not (Test-Path -LiteralPath $bindingPath -PathType Leaf)) { throw 'BINDING_MISSING' }
  $binding = Get-Content -LiteralPath $bindingPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (
    $binding.schemaVersion -ne 1 -or
    $binding.status -ne 'REVIEWED_READY' -or
    $binding.candidateVersion -ne '0.1.1'
  ) {
    throw 'BINDING_NOT_READY'
  }
  if (
    -not $binding.execution.profilePreserved -or
    -not $binding.execution.candidateStaticPass -or
    -not $binding.execution.nativeExecutionAuthorized
  ) {
    throw 'EXECUTION_NOT_READY'
  }

  $profilePath = [IO.Path]::GetFullPath(
    [Environment]::ExpandEnvironmentVariables([string]$binding.paths.profilePath)
  )
  $preservedPath = [IO.Path]::GetFullPath(
    [Environment]::ExpandEnvironmentVariables([string]$binding.paths.preservedProfilePath)
  )
  $retiredPath = [IO.Path]::GetFullPath(
    [Environment]::ExpandEnvironmentVariables([string]$binding.paths.retiredTestProfilePath)
  )
  $profileParent = [IO.Path]::GetFullPath($env:APPDATA)
  $expectedProfile = [IO.Path]::GetFullPath((Join-Path $profileParent 'Mashiro'))
  $expectedPreserved = [IO.Path]::GetFullPath(
    (Join-Path $profileParent 'Mashiro-preserved-019-20260908-69f785a9')
  )
  $expectedRetired = [IO.Path]::GetFullPath(
    (Join-Path $profileParent 'Mashiro-test-retired-019-20260908-69f785a9')
  )
  if (-not [string]::Equals($profilePath, $expectedProfile, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'PROFILE_SCOPE_CHANGED'
  }
  if (-not [string]::Equals($preservedPath, $expectedPreserved, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'PRESERVED_SCOPE_CHANGED'
  }
  if (-not [string]::Equals($retiredPath, $expectedRetired, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'RETIRED_SCOPE_CHANGED'
  }
  foreach ($path in @($profilePath, $preservedPath, $retiredPath)) {
    if (
      -not [string]::Equals(
        [IO.Path]::GetDirectoryName($path),
        $profileParent.TrimEnd([IO.Path]::DirectorySeparatorChar),
        [StringComparison]::OrdinalIgnoreCase
      )
    ) {
      throw 'PROFILE_PARENT_CHANGED'
    }
    Assert-ExistingDirectoryChain $path
  }

  $fixedPreserveReceiptPath = Join-Path $evidenceRoot 'review019-profile-preserved-01.json'
  $receiptPath = [IO.Path]::GetFullPath([string]$binding.profileBaseline.preserveReceiptPath)
  if (
    -not [string]::Equals(
      $receiptPath,
      [IO.Path]::GetFullPath($fixedPreserveReceiptPath),
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw 'PRESERVE_RECEIPT_SCOPE_CHANGED'
  }
  if (
    (Get-FileHash -LiteralPath $receiptPath -Algorithm SHA256).Hash -ne
    [string]$binding.profileBaseline.preserveReceiptSha256
  ) {
    throw 'PRESERVE_RECEIPT_CHANGED'
  }
  $preserveReceipt = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
  if (
    $preserveReceipt.kind -ne 'PROFILE_PRESERVED' -or
    -not $preserveReceipt.profileMoved -or
    -not $preserveReceipt.sourceAbsent
  ) {
    throw 'PRESERVE_RECEIPT_INVALID'
  }
  if (
    -not [string]::Equals(
      [string]$preserveReceipt.source,
      $profilePath,
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    -not [string]::Equals(
      [string]$preserveReceipt.preservedPath,
      $preservedPath,
      [StringComparison]::OrdinalIgnoreCase
    )
  ) {
    throw 'PRESERVE_SCOPE_MISMATCH'
  }
  if (
    [string]$preserveReceipt.identity -ne [string]$binding.profileBaseline.directoryIdentity -or
    [string]$preserveReceipt.treeHash -ne [string]$binding.profileBaseline.treeSha256
  ) {
    throw 'PRESERVE_BASELINE_MISMATCH'
  }

  $baseline = [ordered]@{
    identity = [string]$binding.profileBaseline.directoryIdentity
    treeHash = [string]$binding.profileBaseline.treeSha256
    fileCount = [int]$binding.profileBaseline.fileCount
    totalBytes = [long]$binding.profileBaseline.totalBytes
  }
  $markerPath = Join-Path $profilePath '.mashiro-019-isolated-profile.json'

  if ($Action -eq 'InitializeIsolation') {
    $stage = 'INITIALIZE_ISOLATION'
    if (Test-Path -LiteralPath $profilePath) { throw 'PROFILE_ALREADY_EXISTS' }
    if (-not (Test-Path -LiteralPath $preservedPath -PathType Container)) {
      throw 'PRESERVED_PROFILE_MISSING'
    }
    if (Test-Path -LiteralPath $retiredPath) { throw 'RETIRED_TARGET_EXISTS' }
    if (
      (Test-Path -LiteralPath $initializedReceiptPath) -or
      (Test-Path -LiteralPath $testFinalReceiptPath) -or
      (Test-Path -LiteralPath $retirePendingPath) -or
      (Test-Path -LiteralPath $restorePendingPath)
    ) {
      throw 'TRANSITION_RECEIPT_ALREADY_EXISTS'
    }

    $preserved = Get-TreeSummary $preservedPath
    Assert-Summary $preserved $baseline 'PRESERVED_PROFILE_CHANGED'

    Assert-NoMashiroProcesses
    Assert-RegistrationClear $binding
    Assert-ExistingDirectoryChain $profilePath
    Assert-ExistingDirectoryChain $preservedPath
    if (Test-Path -LiteralPath $profilePath) { throw 'PROFILE_REAPPEARED_BEFORE_CREATE' }
    if (Test-Path -LiteralPath $retiredPath) { throw 'RETIRED_TARGET_REAPPEARED' }
    if ((Get-DirectoryIdentity $preservedPath) -ne $baseline.identity) {
      throw 'PRESERVED_ID_CHANGED_BEFORE_CREATE'
    }
    if (-not [Mashiro019ProfileNative]::CreateDirectory($profilePath, [IntPtr]::Zero)) {
      throw ('PROFILE_EXCLUSIVE_CREATE_FAILED_' + [Runtime.InteropServices.Marshal]::GetLastWin32Error())
    }

    $marker = [ordered]@{
      schemaVersion = 1
      sceneId = $sceneId
      createdAt = [DateTimeOffset]::Now.ToString('o')
      sourceCommit = $binding.sourceCommit
      candidateSetupSha256 = $binding.candidate.setupSha256
      containsOriginalData = $false
    }
    Write-CreateNewJson $markerPath $marker
    $summary = Get-TreeSummary $profilePath
    Write-CreateNewJson $initializedReceiptPath ([ordered]@{
      kind = 'ISOLATED_PROFILE_INITIALIZED'
      at = [DateTimeOffset]::Now.ToString('o')
      sceneId = $sceneId
      profilePath = $profilePath
      candidateSetupSha256 = $binding.candidate.setupSha256
      profile = $summary
      preservedOriginal = $preserved
      applicationStarted = $false
      databaseOpened = $false
      registryWrites = $false
      exclusiveCreate = $true
    })
    exit 0
  }

  $stage = 'TEST_PROFILE_PREFLIGHT'
  if (-not (Test-Path -LiteralPath $profilePath -PathType Container)) {
    throw 'ISOLATED_PROFILE_MISSING'
  }
  if (-not (Test-Path -LiteralPath $preservedPath -PathType Container)) {
    throw 'PRESERVED_PROFILE_MISSING'
  }
  if (Test-Path -LiteralPath $retiredPath) { throw 'RETIRED_TARGET_EXISTS' }
  [void](Assert-Marker $markerPath $binding)
  if (-not (Test-Path -LiteralPath $initializedReceiptPath -PathType Leaf)) {
    throw 'INITIALIZED_RECEIPT_MISSING'
  }
  $initializedReceipt = Get-Content -LiteralPath $initializedReceiptPath -Raw -Encoding UTF8 |
    ConvertFrom-Json
  if (
    $initializedReceipt.kind -ne 'ISOLATED_PROFILE_INITIALIZED' -or
    $initializedReceipt.sceneId -ne $sceneId -or
    $initializedReceipt.candidateSetupSha256 -ne $binding.candidate.setupSha256 -or
    -not [string]::Equals(
      [string]$initializedReceipt.profilePath,
      $profilePath,
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    [string]::IsNullOrWhiteSpace([string]$initializedReceipt.profile.identity) -or
    $initializedReceipt.exclusiveCreate -ne $true -or
    $initializedReceipt.applicationStarted -ne $false -or
    $initializedReceipt.databaseOpened -ne $false
  ) {
    throw 'INITIALIZED_RECEIPT_INVALID'
  }
  if (
    (Get-DirectoryIdentity $profilePath) -ne
    [string]$initializedReceipt.profile.identity
  ) {
    throw 'ISOLATED_PROFILE_ID_CHANGED_AFTER_INITIALIZE'
  }

  if ($Action -eq 'FreezeTestProfile') {
    if (Test-Path -LiteralPath $testFinalReceiptPath) {
      throw 'TEST_PROFILE_FINAL_RECEIPT_EXISTS'
    }
    Assert-NoMashiroProcesses
    Assert-RegistrationClear $binding
    $preservedSummary = Get-TreeSummary $preservedPath
    Assert-Summary $preservedSummary $baseline 'PRESERVED_PROFILE_CHANGED'
    $testSummary = Get-TreeSummary $profilePath
    if ($testSummary.identity -eq $baseline.identity) {
      throw 'TEST_PROFILE_REUSES_ORIGINAL_IDENTITY'
    }
    if ($testSummary.identity -ne [string]$initializedReceipt.profile.identity) {
      throw 'TEST_PROFILE_ID_CHANGED_AFTER_INITIALIZE'
    }

    Assert-NoMashiroProcesses
    Assert-RegistrationClear $binding
    Assert-ExistingDirectoryChain $profilePath
    Assert-ExistingDirectoryChain $preservedPath
    $testSummary = Get-TreeSummary $profilePath
    if ($testSummary.identity -eq $baseline.identity) {
      throw 'TEST_PROFILE_REUSES_ORIGINAL_IDENTITY'
    }
    if ((Get-DirectoryIdentity $preservedPath) -ne $baseline.identity) {
      throw 'PRESERVED_ID_CHANGED_BEFORE_FREEZE'
    }

    Write-CreateNewJson $testFinalReceiptPath ([ordered]@{
      kind = 'ISOLATED_TEST_PROFILE_FROZEN'
      schemaVersion = 1
      at = [DateTimeOffset]::Now.ToString('o')
      sceneId = $sceneId
      profilePath = $profilePath
      candidateSetupSha256 = $binding.candidate.setupSha256
      testProfile = $testSummary
      preservedOriginal = $baseline
      applicationRunning = $false
      registrationClear = $true
      databaseOpened = $false
      dataDeleted = $false
    })
    exit 0
  }

  $stage = 'RESTORE_PREFLIGHT'
  if (-not (Test-Path -LiteralPath $testFinalReceiptPath -PathType Leaf)) {
    throw 'TEST_PROFILE_FINAL_RECEIPT_MISSING'
  }
  if (
    (Test-Path -LiteralPath $retirePendingPath) -or
    (Test-Path -LiteralPath $restorePendingPath) -or
    (Test-Path -LiteralPath $restoredReceiptPath)
  ) {
    throw 'RESTORE_RECEIPT_ALREADY_EXISTS'
  }
  $testReceipt = Get-Content -LiteralPath $testFinalReceiptPath -Raw -Encoding UTF8 |
    ConvertFrom-Json
  if (
    $testReceipt.kind -ne 'ISOLATED_TEST_PROFILE_FROZEN' -or
    $testReceipt.schemaVersion -ne 1 -or
    $testReceipt.sceneId -ne $sceneId -or
    $testReceipt.candidateSetupSha256 -ne $binding.candidate.setupSha256 -or
    -not [string]::Equals(
      [string]$testReceipt.profilePath,
      $profilePath,
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    $testReceipt.registrationClear -ne $true -or
    $testReceipt.applicationRunning -ne $false
  ) {
    throw 'TEST_PROFILE_FINAL_RECEIPT_INVALID'
  }

  $testSummary = Get-TreeSummary $profilePath
  Assert-Summary $testSummary $testReceipt.testProfile 'TEST_PROFILE_CHANGED_AFTER_FREEZE'
  if ($testSummary.identity -eq $baseline.identity) {
    throw 'TEST_PROFILE_REUSES_ORIGINAL_IDENTITY'
  }
  $preservedSummary = Get-TreeSummary $preservedPath
  Assert-Summary $preservedSummary $baseline 'PRESERVED_PROFILE_CHANGED'
  Assert-NoMashiroProcesses
  Assert-RegistrationClear $binding

  $stage = 'RETIRE_TEST_PROFILE_PENDING'
  Write-CreateNewJson $retirePendingPath ([ordered]@{
    kind = 'PROFILE_RENAME_PENDING'
    operation = 'RETIRE_TEST_PROFILE'
    at = [DateTimeOffset]::Now.ToString('o')
    source = $profilePath
    target = $retiredPath
    sourceProfile = $testReceipt.testProfile
    expectedSourceAbsentAfterMove = $true
    dataDeleted = $false
  })

  $stage = 'RETIRE_TEST_PROFILE'
  $testSummary = Get-TreeSummary $profilePath
  Assert-Summary $testSummary $testReceipt.testProfile 'TEST_PROFILE_CHANGED_BEFORE_RETIRE'
  Assert-NoMashiroProcesses
  Assert-RegistrationClear $binding
  Assert-ExistingDirectoryChain $profilePath
  Assert-ExistingDirectoryChain $retiredPath
  if (Test-Path -LiteralPath $retiredPath) { throw 'RETIRED_TARGET_REAPPEARED' }
  if ((Get-DirectoryIdentity $profilePath) -ne [string]$testReceipt.testProfile.identity) {
    throw 'TEST_PROFILE_ID_CHANGED_BEFORE_RETIRE'
  }
  [IO.Directory]::Move($profilePath, $retiredPath)
  $testMoved = $true
  if (Test-Path -LiteralPath $profilePath) { throw 'PROFILE_PATH_REAPPEARED' }
  $retiredSummary = Get-TreeSummary $retiredPath
  Assert-Summary $retiredSummary $testReceipt.testProfile 'RETIRED_TEST_CHANGED'

  $stage = 'RESTORE_ORIGINAL_PROFILE_PENDING'
  Write-CreateNewJson $restorePendingPath ([ordered]@{
    kind = 'PROFILE_RENAME_PENDING'
    operation = 'RESTORE_ORIGINAL_PROFILE'
    at = [DateTimeOffset]::Now.ToString('o')
    source = $preservedPath
    target = $profilePath
    sourceProfile = $baseline
    retiredTestProfile = $testReceipt.testProfile
    expectedSourceAbsentAfterMove = $true
    dataDeleted = $false
  })

  $stage = 'RESTORE_ORIGINAL_PROFILE'
  $preservedSummary = Get-TreeSummary $preservedPath
  Assert-Summary $preservedSummary $baseline 'PRESERVED_PROFILE_CHANGED_BEFORE_RESTORE'
  $retiredSummary = Get-TreeSummary $retiredPath
  Assert-Summary $retiredSummary $testReceipt.testProfile 'RETIRED_TEST_CHANGED_BEFORE_RESTORE'
  Assert-NoMashiroProcesses
  Assert-RegistrationClear $binding
  Assert-ExistingDirectoryChain $profilePath
  Assert-ExistingDirectoryChain $preservedPath
  Assert-ExistingDirectoryChain $retiredPath
  if (Test-Path -LiteralPath $profilePath) { throw 'PROFILE_REAPPEARED_BEFORE_RESTORE' }
  if ((Get-DirectoryIdentity $preservedPath) -ne $baseline.identity) {
    throw 'PRESERVED_ID_CHANGED_BEFORE_RESTORE'
  }
  if ((Get-DirectoryIdentity $retiredPath) -ne [string]$testReceipt.testProfile.identity) {
    throw 'RETIRED_TEST_ID_CHANGED_BEFORE_RESTORE'
  }
  [IO.Directory]::Move($preservedPath, $profilePath)
  $originalMoved = $true

  $restoredSummary = Get-TreeSummary $profilePath
  Assert-Summary $restoredSummary $baseline 'RESTORED_PROFILE_CHANGED'
  $retiredSummary = Get-TreeSummary $retiredPath
  Assert-Summary $retiredSummary $testReceipt.testProfile 'RETIRED_TEST_CHANGED_AFTER_RESTORE'
  Write-CreateNewJson $restoredReceiptPath ([ordered]@{
    kind = 'ORIGINAL_PROFILE_RESTORED'
    at = [DateTimeOffset]::Now.ToString('o')
    originalProfile = $restoredSummary
    retiredTestPath = $retiredPath
    retiredTestProfile = $retiredSummary
    preservedPathAbsent = -not (Test-Path -LiteralPath $preservedPath)
    applicationStarted = $false
    databaseOpened = $false
    registryWrites = $false
    dataDeleted = $false
  })
} catch {
  $rolledBackTest = $false
  if ($testMoved -and -not $originalMoved -and $null -ne $testSummary) {
    try {
      Assert-NoMashiroProcesses
      if (
        -not (Test-Path -LiteralPath $profilePath) -and
        (Test-Path -LiteralPath $retiredPath -PathType Container)
      ) {
        $rollbackSummary = Get-TreeSummary $retiredPath
        Assert-Summary $rollbackSummary $testSummary 'ROLLBACK_TEST_PROFILE_CHANGED'
        [IO.Directory]::Move($retiredPath, $profilePath)
        $rolledBackTest = $true
      }
    } catch {
      $rolledBackTest = $false
    }
  }
  try {
    Write-CreateNewJson $failurePath ([ordered]@{
      kind = 'PROFILE_TRANSITION_FAILED'
      action = $Action
      stage = $stage
      code = 'PROFILE_TRANSITION_GUARD_OR_MOVE_FAILED'
      at = [DateTimeOffset]::Now.ToString('o')
      testMoved = $testMoved
      originalMoved = $originalMoved
      testMoveRolledBack = $rolledBackTest
      dataDeleted = $false
      databaseOpened = $false
      registryWrites = $false
    })
  } catch {
    [Console]::Error.WriteLine('PROFILE_TRANSITION_FAILURE_RECEIPT_UNAVAILABLE')
  }
  exit 1
}
