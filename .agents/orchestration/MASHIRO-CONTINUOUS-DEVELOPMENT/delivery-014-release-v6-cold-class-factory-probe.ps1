param(
  [switch]$Execute,
  [string]$OutputPath
)

# Bounded release-v6 diagnostic. The default mode validates the frozen identity
# and host context without invoking COM. -Execute calls only CoGetClassObject.
$ErrorActionPreference = 'Stop'

$expectedExecutable =
  'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe'
$expectedExecutableSha256 = '33F79D190010A5A6E0C3B9AFDC4D3E14020BCEA272BEDBD209508CFA684454D7'
$expectedAppUserModelId = 'io.github.molotov0cocktail.mashiro'
$expectedClsid = '{145B11B4-27B4-4C65-8585-F689F4C2CBB9}'
$classFactoryIid = '{00000001-0000-0000-C000-000000000046}'
$expectedRegistrationSubkey =
  "Software\Classes\CLSID\$expectedClsid\LocalServer32"
$timeoutMilliseconds = 30000
$sampleIntervalMilliseconds = 75
$allowedOutputPath = Join-Path $PSScriptRoot 'delivery-014-release-v6-cold-class-factory-probe-01.json'
$resolvedOutputPath = $null

if (-not [string]::IsNullOrEmpty($OutputPath)) {
  if (-not $Execute) {
    throw 'OUTPUT_PATH_REQUIRES_EXECUTE'
  }
  $candidateOutputPath = if ([IO.Path]::IsPathRooted($OutputPath)) {
    [IO.Path]::GetFullPath($OutputPath)
  } else {
    [IO.Path]::GetFullPath((Join-Path (Get-Location).Path $OutputPath))
  }
  if (-not [string]::Equals(
      $candidateOutputPath,
      [IO.Path]::GetFullPath($allowedOutputPath),
      [StringComparison]::OrdinalIgnoreCase
    )) {
    throw 'OUTPUT_PATH_NOT_ALLOWLISTED'
  }
  if (Test-Path -LiteralPath $candidateOutputPath) {
    throw 'OUTPUT_PATH_ALREADY_EXISTS'
  }
  $resolvedOutputPath = $candidateOutputPath
}

Add-Type @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using Microsoft.Win32;

public sealed class MashiroClassFactoryHostContext {
  public int CurrentProcessId { get; set; }
  public int ParentProcessId { get; set; }
  public int ShellProcessId { get; set; }
  public bool ParentIsShellProcess { get; set; }
  public bool Is64BitProcess { get; set; }
  public int PackageIdentityStatus { get; set; }
  public string PackageFullName { get; set; }
  public bool TokenElevated { get; set; }
  public int TokenElevationType { get; set; }
  public uint IntegrityRid { get; set; }
}

public sealed class MashiroClassFactoryRegistrationContext {
  public bool Hkcu64KeyExists { get; set; }
  public bool Hkcr64KeyExists { get; set; }
  public string Hkcu64ValueType { get; set; }
  public string Hkcr64ValueType { get; set; }
  public bool Hkcu64ValueEqualsExpected { get; set; }
  public bool Hkcr64ValueEqualsExpected { get; set; }
  public bool ValueTypesEqual { get; set; }
  public bool ValuesEqual { get; set; }
}

public sealed class MashiroClassFactoryProbeResult {
  public bool Completed { get; set; }
  public bool TimedOut { get; set; }
  public string Outcome { get; set; }
  public int? CoInitializeHresult { get; set; }
  public string CoInitializeHresultHex { get; set; }
  public int? CoGetClassObjectHresult { get; set; }
  public string CoGetClassObjectHresultHex { get; set; }
  public string ErrorType { get; set; }
  public int? ErrorHresult { get; set; }
  public string ErrorHresultHex { get; set; }
  public long ElapsedMilliseconds { get; set; }
  public bool UnderlyingCallCancellationProven { get; set; }
  public int SampleIntervalMilliseconds { get; set; }
  public int SampleCount { get; set; }
  public int SampleIdentityErrors { get; set; }
  public bool SamplerCompleted { get; set; }
  public int[] FirstSampleProcessIds { get; set; }
  public long? FirstSampleAtMilliseconds { get; set; }
  public int[] LastSampleProcessIds { get; set; }
  public long? LastSampleAtMilliseconds { get; set; }
  public int[] FirstObservedProcessIds { get; set; }
  public long? FirstObservedAtMilliseconds { get; set; }
  public int[] LastObservedProcessIds { get; set; }
  public long? LastObservedAtMilliseconds { get; set; }
  public int[] AllObservedProcessIds { get; set; }
}

public static class MashiroColdClassFactoryProbe {
  private const int AppModelErrorNoPackage = 15700;
  private const uint TokenQuery = 0x0008;
  private const int TokenElevationTypeClass = 18;
  private const int TokenElevationClass = 20;
  private const int TokenIntegrityLevelClass = 25;

  [StructLayout(LayoutKind.Sequential)]
  private struct ProcessBasicInformation {
    public IntPtr Reserved1;
    public IntPtr PebBaseAddress;
    public IntPtr Reserved2_0;
    public IntPtr Reserved2_1;
    public IntPtr UniqueProcessId;
    public IntPtr InheritedFromUniqueProcessId;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct TokenElevation {
    public uint TokenIsElevated;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct SidAndAttributes {
    public IntPtr Sid;
    public uint Attributes;
  }

  [StructLayout(LayoutKind.Sequential)]
  private struct TokenMandatoryLabel {
    public SidAndAttributes Label;
  }

  private sealed class WorkerState {
    public int? CoInitializeHresult;
    public int? CoGetClassObjectHresult;
    public string ErrorType;
    public int? ErrorHresult;
  }

  private sealed class SampleState {
    public int Count;
    public int IdentityErrors;
    public int[] FirstIds;
    public long? FirstAt;
    public int[] LastIds;
    public long? LastAt;
    public int[] FirstObservedIds;
    public long? FirstObservedAt;
    public int[] LastObservedIds;
    public long? LastObservedAt;
    public readonly HashSet<int> AllObservedIds = new HashSet<int>();
  }

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
  private static extern int GetCurrentPackageFullName(ref uint packageFullNameLength, StringBuilder packageFullName);

  [DllImport("kernel32.dll")]
  private static extern IntPtr GetCurrentProcess();

  [DllImport("user32.dll")]
  private static extern IntPtr GetShellWindow();

  [DllImport("user32.dll")]
  private static extern uint GetWindowThreadProcessId(IntPtr window, out uint processId);

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern bool CloseHandle(IntPtr handle);

  [DllImport("ntdll.dll")]
  private static extern int NtQueryInformationProcess(
    IntPtr processHandle,
    int processInformationClass,
    ref ProcessBasicInformation processInformation,
    int processInformationLength,
    out int returnLength
  );

  [DllImport("advapi32.dll", SetLastError = true)]
  private static extern bool OpenProcessToken(IntPtr processHandle, uint desiredAccess, out IntPtr tokenHandle);

  [DllImport("advapi32.dll", SetLastError = true)]
  private static extern bool GetTokenInformation(
    IntPtr tokenHandle,
    int tokenInformationClass,
    IntPtr tokenInformation,
    int tokenInformationLength,
    out int returnLength
  );

  [DllImport("advapi32.dll")]
  private static extern IntPtr GetSidSubAuthorityCount(IntPtr sid);

  [DllImport("advapi32.dll")]
  private static extern IntPtr GetSidSubAuthority(IntPtr sid, uint subAuthority);

  [DllImport("ole32.dll", PreserveSig = true)]
  private static extern int CoInitializeEx(IntPtr reserved, uint flags);

  [DllImport("ole32.dll", PreserveSig = true)]
  private static extern void CoUninitialize();

  [DllImport("ole32.dll", PreserveSig = true)]
  private static extern int CoGetClassObject(
    ref Guid clsid,
    uint context,
    IntPtr serverInfo,
    ref Guid iid,
    out IntPtr classFactory
  );

  private static int ReadIntTokenInformation(IntPtr token, int informationClass) {
    IntPtr buffer = Marshal.AllocHGlobal(sizeof(int));
    try {
      int returned;
      if (!GetTokenInformation(token, informationClass, buffer, sizeof(int), out returned)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      }
      return Marshal.ReadInt32(buffer);
    } finally {
      Marshal.FreeHGlobal(buffer);
    }
  }

  private static uint ReadIntegrityRid(IntPtr token) {
    int required;
    GetTokenInformation(token, TokenIntegrityLevelClass, IntPtr.Zero, 0, out required);
    if (required <= 0) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    IntPtr buffer = Marshal.AllocHGlobal(required);
    try {
      if (!GetTokenInformation(token, TokenIntegrityLevelClass, buffer, required, out required)) {
        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
      }
      TokenMandatoryLabel label = (TokenMandatoryLabel)Marshal.PtrToStructure(
        buffer,
        typeof(TokenMandatoryLabel)
      );
      byte count = Marshal.ReadByte(GetSidSubAuthorityCount(label.Label.Sid));
      if (count == 0) throw new InvalidOperationException("TOKEN_INTEGRITY_SID_HAS_NO_RID");
      return unchecked((uint)Marshal.ReadInt32(GetSidSubAuthority(label.Label.Sid, (uint)(count - 1))));
    } finally {
      Marshal.FreeHGlobal(buffer);
    }
  }

  public static MashiroClassFactoryHostContext ReadHostContext() {
    uint packageLength = 0;
    int packageStatus = GetCurrentPackageFullName(ref packageLength, null);
    string packageFullName = null;
    if (packageStatus != AppModelErrorNoPackage && packageLength > 0) {
      StringBuilder package = new StringBuilder(checked((int)packageLength));
      packageStatus = GetCurrentPackageFullName(ref packageLength, package);
      if (packageStatus == 0) packageFullName = package.ToString();
    }

    ProcessBasicInformation processInformation = new ProcessBasicInformation();
    int processInformationLength;
    int processStatus = NtQueryInformationProcess(
      GetCurrentProcess(),
      0,
      ref processInformation,
      Marshal.SizeOf(typeof(ProcessBasicInformation)),
      out processInformationLength
    );
    if (processStatus != 0) throw new InvalidOperationException("PARENT_PROCESS_QUERY_FAILED");
    uint shellProcessId;
    IntPtr shellWindow = GetShellWindow();
    if (shellWindow == IntPtr.Zero || GetWindowThreadProcessId(shellWindow, out shellProcessId) == 0) {
      throw new InvalidOperationException("SHELL_PROCESS_QUERY_FAILED");
    }

    IntPtr token;
    if (!OpenProcessToken(GetCurrentProcess(), TokenQuery, out token)) {
      throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
    }
    try {
      return new MashiroClassFactoryHostContext {
        CurrentProcessId = Process.GetCurrentProcess().Id,
        ParentProcessId = checked((int)processInformation.InheritedFromUniqueProcessId.ToInt64()),
        ShellProcessId = checked((int)shellProcessId),
        ParentIsShellProcess =
          checked((int)processInformation.InheritedFromUniqueProcessId.ToInt64()) == checked((int)shellProcessId),
        Is64BitProcess = Environment.Is64BitProcess,
        PackageIdentityStatus = packageStatus,
        PackageFullName = packageFullName,
        TokenElevated = ReadIntTokenInformation(token, TokenElevationClass) != 0,
        TokenElevationType = ReadIntTokenInformation(token, TokenElevationTypeClass),
        IntegrityRid = ReadIntegrityRid(token)
      };
    } finally {
      CloseHandle(token);
    }
  }

  private static string ReadDefaultValue(
    RegistryHive hive,
    string subkey,
    out bool exists,
    out string valueType
  ) {
    using (RegistryKey baseKey = RegistryKey.OpenBaseKey(hive, RegistryView.Registry64))
    using (RegistryKey key = baseKey.OpenSubKey(subkey, false)) {
      exists = key != null;
      valueType = null;
      if (key == null) return null;
      try {
        valueType = key.GetValueKind(String.Empty).ToString();
      } catch (ArgumentException) {
        return null;
      }
      return key.GetValue(String.Empty, null, RegistryValueOptions.DoNotExpandEnvironmentNames) as string;
    }
  }

  public static MashiroClassFactoryRegistrationContext ReadRegistration(
    string hkcuSubkey,
    string hkcrSubkey,
    string expectedValue
  ) {
    bool hkcuExists;
    bool hkcrExists;
    string hkcuType;
    string hkcrType;
    string hkcuValue = ReadDefaultValue(
      RegistryHive.CurrentUser,
      hkcuSubkey,
      out hkcuExists,
      out hkcuType
    );
    string hkcrValue = ReadDefaultValue(
      RegistryHive.ClassesRoot,
      hkcrSubkey,
      out hkcrExists,
      out hkcrType
    );
    return new MashiroClassFactoryRegistrationContext {
      Hkcu64KeyExists = hkcuExists,
      Hkcr64KeyExists = hkcrExists,
      Hkcu64ValueType = hkcuType,
      Hkcr64ValueType = hkcrType,
      Hkcu64ValueEqualsExpected = String.Equals(hkcuValue, expectedValue, StringComparison.Ordinal),
      Hkcr64ValueEqualsExpected = String.Equals(hkcrValue, expectedValue, StringComparison.Ordinal),
      ValueTypesEqual = String.Equals(hkcuType, hkcrType, StringComparison.Ordinal),
      ValuesEqual = String.Equals(hkcuValue, hkcrValue, StringComparison.Ordinal)
    };
  }

  private static string HresultHex(int? value) {
    return value.HasValue ? "0x" + unchecked((uint)value.Value).ToString("X8") : null;
  }

  private static int[] ReadExactProcessIds(string executable, ref int identityErrors) {
    List<int> ids = new List<int>();
    foreach (Process process in Process.GetProcessesByName("Mashiro")) {
      try {
        string path = process.MainModule == null ? null : process.MainModule.FileName;
        if (String.Equals(path, executable, StringComparison.Ordinal)) ids.Add(process.Id);
      } catch {
        Interlocked.Increment(ref identityErrors);
      } finally {
        process.Dispose();
      }
    }
    ids.Sort();
    return ids.ToArray();
  }

  private static void RecordSample(SampleState state, long elapsedMilliseconds, int[] ids, int identityErrors) {
    state.Count += 1;
    state.IdentityErrors += identityErrors;
    if (state.FirstIds == null) {
      state.FirstIds = ids;
      state.FirstAt = elapsedMilliseconds;
    }
    state.LastIds = ids;
    state.LastAt = elapsedMilliseconds;
    if (ids.Length == 0) return;
    if (state.FirstObservedIds == null) {
      state.FirstObservedIds = ids;
      state.FirstObservedAt = elapsedMilliseconds;
    }
    state.LastObservedIds = ids;
    state.LastObservedAt = elapsedMilliseconds;
    foreach (int id in ids) state.AllObservedIds.Add(id);
  }

  public static MashiroClassFactoryProbeResult GetClassFactoryOnly(
    string clsidText,
    string iidText,
    string executable,
    int timeoutMilliseconds,
    int sampleIntervalMilliseconds
  ) {
    WorkerState workerState = new WorkerState();
    SampleState sampleState = new SampleState();
    ManualResetEventSlim stopSampling = new ManualResetEventSlim(false);
    Stopwatch elapsed = Stopwatch.StartNew();

    Thread sampler = new Thread(() => {
      do {
        int identityErrors = 0;
        int[] ids = ReadExactProcessIds(executable, ref identityErrors);
        RecordSample(sampleState, elapsed.ElapsedMilliseconds, ids, identityErrors);
      } while (!stopSampling.Wait(sampleIntervalMilliseconds));
    });
    sampler.IsBackground = true;
    sampler.Name = "Mashiro cold class-factory process sampler";

    Thread worker = new Thread(() => {
      bool initialized = false;
      IntPtr classFactory = IntPtr.Zero;
      try {
        int initializeResult = CoInitializeEx(IntPtr.Zero, 2);
        workerState.CoInitializeHresult = initializeResult;
        if (initializeResult < 0) return;
        initialized = true;
        Guid clsid = Guid.Parse(clsidText);
        Guid iid = Guid.Parse(iidText);
        workerState.CoGetClassObjectHresult = CoGetClassObject(
          ref clsid,
          4,
          IntPtr.Zero,
          ref iid,
          out classFactory
        );
      } catch (Exception error) {
        workerState.ErrorType = error.GetType().FullName;
        workerState.ErrorHresult = error.HResult;
      } finally {
        if (classFactory != IntPtr.Zero) Marshal.Release(classFactory);
        if (initialized) CoUninitialize();
      }
    });
    worker.IsBackground = true;
    worker.Name = "Mashiro cold class-factory-only worker";
    worker.SetApartmentState(ApartmentState.STA);

    sampler.Start();
    worker.Start();
    bool completed = worker.Join(timeoutMilliseconds);
    long workerElapsedMilliseconds = elapsed.ElapsedMilliseconds;
    stopSampling.Set();
    bool samplerCompleted = sampler.Join(1000);
    elapsed.Stop();

    MashiroClassFactoryProbeResult result = new MashiroClassFactoryProbeResult {
      Completed = completed,
      TimedOut = !completed,
      Outcome = !completed ? "OBSERVATION_TIMEOUT_UNKNOWN" : "FAILED",
      ElapsedMilliseconds = workerElapsedMilliseconds,
      UnderlyingCallCancellationProven = false,
      SampleIntervalMilliseconds = sampleIntervalMilliseconds,
      SampleCount = sampleState.Count,
      SampleIdentityErrors = sampleState.IdentityErrors,
      SamplerCompleted = samplerCompleted,
      FirstSampleProcessIds = sampleState.FirstIds ?? new int[0],
      FirstSampleAtMilliseconds = sampleState.FirstAt,
      LastSampleProcessIds = sampleState.LastIds ?? new int[0],
      LastSampleAtMilliseconds = sampleState.LastAt,
      FirstObservedProcessIds = sampleState.FirstObservedIds ?? new int[0],
      FirstObservedAtMilliseconds = sampleState.FirstObservedAt,
      LastObservedProcessIds = sampleState.LastObservedIds ?? new int[0],
      LastObservedAtMilliseconds = sampleState.LastObservedAt,
      AllObservedProcessIds = sampleState.AllObservedIds.OrderBy(id => id).ToArray()
    };
    if (!completed) return result;

    result.CoInitializeHresult = workerState.CoInitializeHresult;
    result.CoInitializeHresultHex = HresultHex(workerState.CoInitializeHresult);
    result.CoGetClassObjectHresult = workerState.CoGetClassObjectHresult;
    result.CoGetClassObjectHresultHex = HresultHex(workerState.CoGetClassObjectHresult);
    result.ErrorType = workerState.ErrorType;
    result.ErrorHresult = workerState.ErrorHresult;
    result.ErrorHresultHex = HresultHex(workerState.ErrorHresult);
    if (workerState.ErrorType == null &&
        workerState.CoInitializeHresult.HasValue && workerState.CoInitializeHresult.Value >= 0 &&
        workerState.CoGetClassObjectHresult.HasValue && workerState.CoGetClassObjectHresult.Value == 0) {
      result.Outcome = "S_OK";
    }
    return result;
  }
}
'@

function Get-ExactInstalledProcessIds {
  $ids = [System.Collections.Generic.List[int]]::new()
  foreach ($process in @(Get-Process -Name Mashiro -ErrorAction SilentlyContinue)) {
    try {
      $path = $process.Path
      if ([string]::IsNullOrEmpty($path)) {
        throw 'MASHIRO_PROCESS_PATH_UNAVAILABLE'
      }
      if ([string]::Equals($path, $expectedExecutable, [StringComparison]::Ordinal)) {
        $ids.Add($process.Id)
      }
    } catch {
      throw 'MASHIRO_PROCESS_IDENTITY_UNAVAILABLE'
    }
  }
  @($ids.ToArray() | Sort-Object)
}

function Write-ProbeReport([object]$Value) {
  $json = $Value | ConvertTo-Json -Depth 10
  if ($null -eq $resolvedOutputPath) {
    $json
    return
  }
  $stream = [IO.File]::Open(
    $resolvedOutputPath,
    [IO.FileMode]::CreateNew,
    [IO.FileAccess]::Write,
    [IO.FileShare]::Read
  )
  try {
    $writer = [IO.StreamWriter]::new($stream, [Text.UTF8Encoding]::new($false))
    try {
      $writer.Write($json)
      $writer.Write([Environment]::NewLine)
      $writer.Flush()
    } finally {
      $writer.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

# Reuse the frozen D9BA helper as the exact shortcut, LocalServer32, executable
# hash, unpackaged 64-bit host, and zero-process guard. It remains prepare-only.
$identityGuard =
  (& (Join-Path $PSScriptRoot 'delivery-014-release-v6-cold-com-create-probe.ps1')) |
    ConvertFrom-Json
if ($identityGuard.mode -cne 'PREPARE_ONLY' -or
    $identityGuard.executeRequested -ne $false -or
    $identityGuard.identity.appUserModelId -cne $expectedAppUserModelId -or
    -not [string]::Equals(
      $identityGuard.identity.clsid,
      $expectedClsid,
      [StringComparison]::OrdinalIgnoreCase
    ) -or
    $identityGuard.identity.executableSha256 -cne $expectedExecutableSha256 -or
    @($identityGuard.initialExactExecutableProcessIds).Count -ne 0) {
  throw 'FROZEN_IDENTITY_GUARD_MISMATCH'
}

$hostContext = [MashiroColdClassFactoryProbe]::ReadHostContext()
$hkcrSubkey = "CLSID\$expectedClsid\LocalServer32"
$registration = [MashiroColdClassFactoryProbe]::ReadRegistration(
  $expectedRegistrationSubkey,
  $hkcrSubkey,
  $expectedExecutable
)
if (-not $hostContext.Is64BitProcess -or
    $hostContext.PackageIdentityStatus -ne 15700 -or
    $null -ne $hostContext.PackageFullName -or
    $hostContext.TokenElevated -or
    $hostContext.IntegrityRid -ne 8192 -or
    -not $registration.Hkcu64KeyExists -or
    -not $registration.Hkcr64KeyExists -or
    $registration.Hkcu64ValueType -cne 'String' -or
    $registration.Hkcr64ValueType -cne 'String' -or
    -not $registration.Hkcu64ValueEqualsExpected -or
    -not $registration.Hkcr64ValueEqualsExpected -or
    -not $registration.ValueTypesEqual -or
    -not $registration.ValuesEqual) {
  throw 'EXACT_HOST_OR_64_BIT_REGISTRATION_CONTEXT_MISMATCH'
}

$beforeProcessIds = @(Get-ExactInstalledProcessIds)
if ($beforeProcessIds.Count -ne 0) {
  throw 'COLD_PROBE_REQUIRES_ZERO_EXACT_INSTALLED_PROCESSES'
}

$report = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  mode = 'PREPARE_ONLY'
  operation = 'CoGetClassObject only'
  identity = [ordered]@{
    appUserModelId = $expectedAppUserModelId
    clsid = $expectedClsid
    iid = $classFactoryIid
    clsctx = 'CLSCTX_LOCAL_SERVER'
    executableSha256 = $expectedExecutableSha256
    shortcutSha256 = $identityGuard.identity.shortcutSha256
    frozenIdentityGuardSha256 = 'D9BA2AAB1C85173549C8BB0E6B7AA38B171280713C1B4036897DC95FF8CD9366'
  }
  host = [ordered]@{
    currentProcessId = $hostContext.CurrentProcessId
    parentProcessId = $hostContext.ParentProcessId
    shellProcessId = $hostContext.ShellProcessId
    parentIsShellProcess = $hostContext.ParentIsShellProcess
    bitness = if ($hostContext.Is64BitProcess) { 64 } else { 32 }
    packageIdentityStatus = $hostContext.PackageIdentityStatus
    packageFullName = $hostContext.PackageFullName
    tokenElevated = $hostContext.TokenElevated
    tokenElevationType = $hostContext.TokenElevationType
    integrityRid = $hostContext.IntegrityRid
  }
  registration = [ordered]@{
    registryView = 'Registry64'
    hkcuKeyExists = $registration.Hkcu64KeyExists
    hkcrKeyExists = $registration.Hkcr64KeyExists
    hkcuValueType = $registration.Hkcu64ValueType
    hkcrValueType = $registration.Hkcr64ValueType
    hkcuValueEqualsAuthorizedExecutable = $registration.Hkcu64ValueEqualsExpected
    hkcrValueEqualsAuthorizedExecutable = $registration.Hkcr64ValueEqualsExpected
    valueTypesEqual = $registration.ValueTypesEqual
    valuesEqual = $registration.ValuesEqual
  }
  initialExactExecutableProcessIds = $beforeProcessIds
  executeRequested = [bool]$Execute
  createInstanceInvoked = $false
  activateInvoked = $false
  registryWritesDirectlyPerformedByProbe = $false
  automaticRetry = $false
  applicationCloseRequested = $false
  paidProviderCall = $false
  observation = [ordered]@{
    timeoutMilliseconds = $timeoutMilliseconds
    processSampleIntervalMilliseconds = $sampleIntervalMilliseconds
    result = 'NOT_RUN'
    underlyingComCallCancellationProven = $false
    samplingBoundary =
      'Only the exact installed executable is sampled; a process shorter than the 75 ms interval or an unreadable process identity can be missed.'
  }
  boundary =
    'With explicit -Execute this helper calls only CoGetClassObject for IClassFactory. It never calls CreateInstance or Activate and does not prove a user notification click.'
}

if (-not $Execute) {
  Write-ProbeReport $report
  return
}

$probe = [MashiroColdClassFactoryProbe]::GetClassFactoryOnly(
  $expectedClsid,
  $classFactoryIid,
  $expectedExecutable,
  $timeoutMilliseconds,
  $sampleIntervalMilliseconds
)
$report.mode = 'COLD_CLASS_FACTORY_ONLY'
$report.observation = [ordered]@{
  timeoutMilliseconds = $timeoutMilliseconds
  elapsedMilliseconds = $probe.ElapsedMilliseconds
  completed = $probe.Completed
  timedOut = $probe.TimedOut
  result = $probe.Outcome
  coInitializeHresult = $probe.CoInitializeHresult
  coInitializeHresultHex = $probe.CoInitializeHresultHex
  coGetClassObjectHresult = $probe.CoGetClassObjectHresult
  coGetClassObjectHresultHex = $probe.CoGetClassObjectHresultHex
  errorType = $probe.ErrorType
  errorHresult = $probe.ErrorHresult
  errorHresultHex = $probe.ErrorHresultHex
  underlyingComCallCancellationProven = $probe.UnderlyingCallCancellationProven
  processSampling = [ordered]@{
    intervalMilliseconds = $probe.SampleIntervalMilliseconds
    sampleCount = $probe.SampleCount
    identityReadErrors = $probe.SampleIdentityErrors
    samplerCompleted = $probe.SamplerCompleted
    firstSample = [ordered]@{
      elapsedMilliseconds = $probe.FirstSampleAtMilliseconds
      processIds = $probe.FirstSampleProcessIds
    }
    lastSample = [ordered]@{
      elapsedMilliseconds = $probe.LastSampleAtMilliseconds
      processIds = $probe.LastSampleProcessIds
    }
    firstNonEmptyObservation = [ordered]@{
      elapsedMilliseconds = $probe.FirstObservedAtMilliseconds
      processIds = $probe.FirstObservedProcessIds
    }
    lastNonEmptyObservation = [ordered]@{
      elapsedMilliseconds = $probe.LastObservedAtMilliseconds
      processIds = $probe.LastObservedProcessIds
    }
    allObservedProcessIds = $probe.AllObservedProcessIds
    boundary =
      'Only the exact installed executable was sampled; a process shorter than the 75 ms interval or an unreadable process identity may have been missed.'
  }
}
Write-ProbeReport $report

if ($probe.TimedOut) {
  throw 'CLASS_FACTORY_OBSERVATION_TIMEOUT_RESULT_UNKNOWN_UNDERLYING_CALL_NOT_PROVEN_CANCELLED'
}
if (-not $probe.Completed -or $probe.Outcome -ne 'S_OK') {
  throw 'CO_GET_CLASS_OBJECT_DID_NOT_COMPLETE_WITH_S_OK'
}
