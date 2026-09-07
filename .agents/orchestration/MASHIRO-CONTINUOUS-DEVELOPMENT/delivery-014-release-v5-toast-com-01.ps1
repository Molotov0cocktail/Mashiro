param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-f0-9]{64}$')]
  [string]$GroupId,
  [switch]$Execute,
  [switch]$RequireCold
)

# Final release-v5 synthetic installed-artifact probe, not a simulated user click.
# Run in PowerShell 7. No credentials, arbitrary COM classes or registry writes.
$ErrorActionPreference = 'Stop'
$metadata = (& (Join-Path $PSScriptRoot 'delivery-014-mashiro-shortcut-metadata.ps1')) | ConvertFrom-Json
$expectedClsid = [string]$metadata.shortcut.toastActivatorClsid
if ($expectedClsid -notmatch '^\{[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}\}$') { throw 'INVALID_SHORTCUT_CLSID' }
$expectedHash = '3BD29B9E9C4300000B98251D07C3D4A98E1638EBE4D4F9EF152FF8596DFB1030'
$expectedShortcutHash = $metadata.shortcut.sha256
$expectedExecutable = 'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe'
if (-not [string]::Equals($metadata.shortcut.target, $expectedExecutable, [StringComparison]::Ordinal) -or
    $metadata.shortcut.appUserModelId -cne 'Mashiro.Desktop' -or
    $metadata.shortcut.arguments -cne '' -or
    -not [string]::Equals($metadata.registration.value, $expectedExecutable, [StringComparison]::Ordinal) -or
    (Get-FileHash -LiteralPath $expectedExecutable -Algorithm SHA256).Hash -cne $expectedHash) {
  throw 'EXACT_INSTALLED_COM_IDENTITY_MISMATCH'
}
$before = @(Get-Process -Name Mashiro -ErrorAction SilentlyContinue |
  Where-Object { [string]::Equals($_.Path, $expectedExecutable, [StringComparison]::Ordinal) } |
  Select-Object -ExpandProperty Id)
if ($RequireCold -and $before.Count -ne 0) { throw 'COLD_PROBE_REQUIRES_NO_INSTALLED_PROCESSES' }
$arguments = 'mashiro-reminder-group:' + $GroupId
$report = [ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  mode = 'PREPARE_ONLY'
  appId = 'Mashiro.Desktop'
  clsid = $expectedClsid
  executableSha256 = $expectedHash
  shortcutSha256 = $expectedShortcutHash
  arguments = $arguments
  requireCold = [bool]$RequireCold
  beforeProcessIds = $before
  actualNotificationClick = $false
  boundary = 'Direct OS COM activation probe; does not prove a user clicked a Windows notification.'
}
if (-not $Execute) { $report | ConvertTo-Json -Depth 4; return }

Add-Type @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

public static class MashiroExactToastActivationV2 {
  [ComImport, Guid("53E31837-6600-4A81-9395-75CFFE746F94")]
  [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface INotificationActivationCallback {
    [PreserveSig] int Activate(
      [MarshalAs(UnmanagedType.LPWStr)] string appId,
      [MarshalAs(UnmanagedType.LPWStr)] string arguments,
      IntPtr userInput, uint userInputCount);
  }
  [DllImport("ole32.dll")]
  private static extern int CoInitializeEx(IntPtr reserved, uint flags);
  [DllImport("ole32.dll")]
  private static extern void CoUninitialize();
  [DllImport("ole32.dll", PreserveSig = true)]
  private static extern int CoCreateInstance(ref Guid clsid, IntPtr outer, uint context,
    ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out INotificationActivationCallback callback);

  public static int Activate(string clsidText, string arguments) {
    int result = unchecked((int)0x80004005);
    Exception error = null;
    Thread worker = new Thread(() => {
      bool initialized = false;
      INotificationActivationCallback callback = null;
      try {
        int hr = CoInitializeEx(IntPtr.Zero, 2);
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        initialized = true;
        Guid clsid = Guid.Parse(clsidText);
        Guid iid = new Guid("53E31837-6600-4A81-9395-75CFFE746F94");
        hr = CoCreateInstance(ref clsid, IntPtr.Zero, 4, ref iid, out callback);
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        result = callback.Activate("Mashiro.Desktop", arguments, IntPtr.Zero, 0);
      } catch (Exception failure) {
        error = failure;
      } finally {
        if (callback != null) Marshal.FinalReleaseComObject(callback);
        if (initialized) CoUninitialize();
      }
    });
    worker.IsBackground = true;
    worker.SetApartmentState(ApartmentState.STA);
    worker.Start();
    if (!worker.Join(30000)) throw new TimeoutException("COM_ACTIVATION_RESULT_UNKNOWN_AFTER_30_SECONDS");
    if (error != null) throw error;
    return result;
  }
}
'@
$report.mode = 'DIRECT_OS_COM_ACTIVATION_PENDING'
$report | ConvertTo-Json -Depth 4
try {
  $result = [MashiroExactToastActivationV2]::Activate($expectedClsid, $arguments)
} catch {
  $report.mode = 'DIRECT_OS_COM_ACTIVATION_FAILED_OR_UNKNOWN'
  $failure = $_.Exception
  while ($null -ne $failure.InnerException) { $failure = $failure.InnerException }
  $report.errorType = $failure.GetType().FullName
  $report.errorHresult = $failure.HResult
  $report | ConvertTo-Json -Depth 4
  throw 'COM_PROBE_FAILED_OR_UNKNOWN_SEE_STAGE_REPORT'
}
$report.mode = 'DIRECT_OS_COM_ACTIVATION'
$report.hresult = $result
$report.afterProcessIds = @(Get-Process -Name Mashiro -ErrorAction SilentlyContinue |
  Where-Object { [string]::Equals($_.Path, $expectedExecutable, [StringComparison]::Ordinal) } |
  Select-Object -ExpandProperty Id)
$report | ConvertTo-Json -Depth 4
if ($result -ne 0) { throw 'COM_ACTIVATION_DID_NOT_RETURN_S_OK' }
