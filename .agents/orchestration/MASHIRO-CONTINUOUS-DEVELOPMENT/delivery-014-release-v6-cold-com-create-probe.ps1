param(
  [switch]$Execute
)

# Bounded diagnostic for the release-v6 installed COM local server.
# The default mode validates the frozen identity and does not invoke COM.
$ErrorActionPreference = 'Stop'

$expectedExecutable =
  'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe'
$expectedExecutableSha256 = '33F79D190010A5A6E0C3B9AFDC4D3E14020BCEA272BEDBD209508CFA684454D7'
$expectedShortcut =
  'C:\Users\30910\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Mashiro.lnk'
$expectedAppUserModelId = 'io.github.molotov0cocktail.mashiro'
$expectedClsid = '{145B11B4-27B4-4C65-8585-F689F4C2CBB9}'
$expectedIid = '{53E31837-6600-4A81-9395-75CFFE746F94}'
$expectedRegistrationPath =
  "Software\Classes\CLSID\$expectedClsid\LocalServer32"
$timeoutMilliseconds = 30000
$sampleIntervalMilliseconds = 75

Add-Type @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

public sealed class MashiroComCreateProbeResult {
  public bool Completed { get; set; }
  public bool TimedOut { get; set; }
  public string Outcome { get; set; }
  public int? CoInitializeHresult { get; set; }
  public string CoInitializeHresultHex { get; set; }
  public int? CoCreateHresult { get; set; }
  public string CoCreateHresultHex { get; set; }
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

public sealed class MashiroHostPackageIdentity {
  public int Status { get; set; }
  public string PackageFullName { get; set; }
  public bool Is64BitProcess { get; set; }
}

public static class MashiroColdComCreateProbe {
  private const int AppModelErrorNoPackage = 15700;

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, PreserveSig = true)]
  private static extern int GetCurrentPackageFullName(ref uint packageFullNameLength, StringBuilder packageFullName);

  [DllImport("ole32.dll", PreserveSig = true)]
  private static extern int CoInitializeEx(IntPtr reserved, uint flags);

  [DllImport("ole32.dll", PreserveSig = true)]
  private static extern void CoUninitialize();

  [DllImport("ole32.dll", PreserveSig = true)]
  private static extern int CoCreateInstance(
    ref Guid clsid,
    IntPtr outer,
    uint context,
    ref Guid iid,
    out IntPtr instance
  );

  private sealed class WorkerState {
    public int? CoInitializeHresult;
    public int? CoCreateHresult;
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

  public static MashiroHostPackageIdentity ReadHostPackageIdentity() {
    uint length = 0;
    int status = GetCurrentPackageFullName(ref length, null);
    string packageFullName = null;
    if (status != AppModelErrorNoPackage && length > 0) {
      StringBuilder value = new StringBuilder(checked((int)length));
      status = GetCurrentPackageFullName(ref length, value);
      if (status == 0) packageFullName = value.ToString();
    }
    return new MashiroHostPackageIdentity {
      Status = status,
      PackageFullName = packageFullName,
      Is64BitProcess = Environment.Is64BitProcess
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

  public static MashiroComCreateProbeResult CreateOnly(
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
    sampler.Name = "Mashiro cold COM process sampler";

    Thread worker = new Thread(() => {
      bool initialized = false;
      IntPtr instance = IntPtr.Zero;
      try {
        int initializeResult = CoInitializeEx(IntPtr.Zero, 2);
        workerState.CoInitializeHresult = initializeResult;
        if (initializeResult < 0) return;
        initialized = true;
        Guid clsid = Guid.Parse(clsidText);
        Guid iid = Guid.Parse(iidText);
        workerState.CoCreateHresult = CoCreateInstance(
          ref clsid,
          IntPtr.Zero,
          4,
          ref iid,
          out instance
        );
      } catch (Exception error) {
        workerState.ErrorType = error.GetType().FullName;
        workerState.ErrorHresult = error.HResult;
      } finally {
        if (instance != IntPtr.Zero) Marshal.Release(instance);
        if (initialized) CoUninitialize();
      }
    });
    worker.IsBackground = true;
    worker.Name = "Mashiro cold COM create-only worker";
    worker.SetApartmentState(ApartmentState.STA);

    sampler.Start();
    worker.Start();
    bool completed = worker.Join(timeoutMilliseconds);
    stopSampling.Set();
    bool samplerCompleted = sampler.Join(1000);
    elapsed.Stop();

    MashiroComCreateProbeResult result = new MashiroComCreateProbeResult {
      Completed = completed,
      TimedOut = !completed,
      Outcome = !completed ? "OBSERVATION_TIMEOUT_UNKNOWN" : "FAILED",
      ElapsedMilliseconds = elapsed.ElapsedMilliseconds,
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
    result.CoCreateHresult = workerState.CoCreateHresult;
    result.CoCreateHresultHex = HresultHex(workerState.CoCreateHresult);
    result.ErrorType = workerState.ErrorType;
    result.ErrorHresult = workerState.ErrorHresult;
    result.ErrorHresultHex = HresultHex(workerState.ErrorHresult);
    if (workerState.ErrorType == null &&
        workerState.CoInitializeHresult.HasValue && workerState.CoInitializeHresult.Value >= 0 &&
        workerState.CoCreateHresult.HasValue && workerState.CoCreateHresult.Value == 0) {
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

$metadata =
  (& (Join-Path $PSScriptRoot 'delivery-014-release-v6-shortcut-metadata.ps1')) |
    ConvertFrom-Json
$hostIdentity = [MashiroColdComCreateProbe]::ReadHostPackageIdentity()

$executableItem = Get-Item -LiteralPath $expectedExecutable -Force
$shortcutItem = Get-Item -LiteralPath $expectedShortcut -Force
if (($executableItem.Attributes -band [IO.FileAttributes]::Directory) -ne 0 -or
    ($executableItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or
    ($shortcutItem.Attributes -band [IO.FileAttributes]::Directory) -ne 0 -or
    ($shortcutItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
  throw 'EXACT_INSTALLED_IDENTITY_NOT_REGULAR_FILES'
}

$executableHash = (Get-FileHash -LiteralPath $expectedExecutable -Algorithm SHA256).Hash
$identityMatches =
  [string]::Equals($metadata.shortcut.path, $expectedShortcut, [StringComparison]::Ordinal) -and
  [string]::Equals($metadata.shortcut.target, $expectedExecutable, [StringComparison]::Ordinal) -and
  [string]::Equals($metadata.shortcut.arguments, '', [StringComparison]::Ordinal) -and
  [string]::Equals(
    $metadata.shortcut.appUserModelId,
    $expectedAppUserModelId,
    [StringComparison]::Ordinal
  ) -and
  [string]::Equals(
    $metadata.shortcut.toastActivatorClsid,
    $expectedClsid,
    [StringComparison]::OrdinalIgnoreCase
  ) -and
  [string]::Equals($metadata.registration.scope, 'current-user', [StringComparison]::Ordinal) -and
  [string]::Equals(
    $metadata.registration.path,
    $expectedRegistrationPath,
    [StringComparison]::OrdinalIgnoreCase
  ) -and
  [string]::Equals(
    $metadata.registration.value,
    $expectedExecutable,
    [StringComparison]::Ordinal
  ) -and
  [string]::Equals(
    $executableHash,
    $expectedExecutableSha256,
    [StringComparison]::Ordinal
  )
if (-not $identityMatches) {
  throw 'EXACT_INSTALLED_COM_IDENTITY_MISMATCH'
}
if ($hostIdentity.Status -ne 15700 -or $null -ne $hostIdentity.PackageFullName) {
  throw 'PROBE_HOST_MUST_HAVE_NO_PACKAGE_IDENTITY'
}
if (-not $hostIdentity.Is64BitProcess) {
  throw 'PROBE_HOST_MUST_BE_64_BIT'
}

$beforeProcessIds = @(Get-ExactInstalledProcessIds)
if ($beforeProcessIds.Count -ne 0) {
  throw 'COLD_PROBE_REQUIRES_ZERO_EXACT_INSTALLED_PROCESSES'
}

$report = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  mode = 'PREPARE_ONLY'
  operation = 'CoCreateInstance only'
  identity = [ordered]@{
    appUserModelId = $expectedAppUserModelId
    clsid = $expectedClsid
    iid = $expectedIid
    clsctx = 'CLSCTX_LOCAL_SERVER'
    executableSha256 = $expectedExecutableSha256
    shortcutSha256 = $metadata.shortcut.sha256
    exactShortcutTarget = $true
    exactLocalServerRegistration = $true
  }
  host = [ordered]@{
    bitness = 64
    packageIdentityStatus = $hostIdentity.Status
    packageFullName = $hostIdentity.PackageFullName
  }
  initialExactExecutableProcessIds = $beforeProcessIds
  executeRequested = [bool]$Execute
  activateInvoked = $false
  registryWrites = $false
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
    'This helper calls only CoCreateInstance when -Execute is explicit. It never calls Activate and does not simulate or prove a user notification click.'
}

if (-not $Execute) {
  $report | ConvertTo-Json -Depth 8
  return
}

$probe = [MashiroColdComCreateProbe]::CreateOnly(
  $expectedClsid,
  $expectedIid,
  $expectedExecutable,
  $timeoutMilliseconds,
  $sampleIntervalMilliseconds
)
$report.mode = 'COLD_COM_CREATE_ONLY'
$report.observation = [ordered]@{
  timeoutMilliseconds = $timeoutMilliseconds
  elapsedMilliseconds = $probe.ElapsedMilliseconds
  completed = $probe.Completed
  timedOut = $probe.TimedOut
  result = $probe.Outcome
  coInitializeHresult = $probe.CoInitializeHresult
  coInitializeHresultHex = $probe.CoInitializeHresultHex
  coCreateHresult = $probe.CoCreateHresult
  coCreateHresultHex = $probe.CoCreateHresultHex
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
$report | ConvertTo-Json -Depth 10

if ($probe.TimedOut) {
  throw 'COM_CREATE_OBSERVATION_TIMEOUT_RESULT_UNKNOWN_UNDERLYING_CALL_NOT_PROVEN_CANCELLED'
}
if (-not $probe.Completed -or $probe.Outcome -ne 'S_OK') {
  throw 'COM_CREATE_DID_NOT_COMPLETE_WITH_S_OK'
}
