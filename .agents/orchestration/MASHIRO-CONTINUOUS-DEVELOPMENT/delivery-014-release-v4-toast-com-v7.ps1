param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-f0-9]{64}$')]
  [string]$GroupId,
  [switch]$Execute,
  [switch]$RequireCold
)

# Final release-v4 v7 synthetic installed-artifact probe, not a simulated user click.
# Run in PowerShell 7. No credentials, arbitrary COM classes or registry writes.
$ErrorActionPreference = 'Stop'
$metadata = (& (Join-Path $PSScriptRoot 'delivery-014-mashiro-shortcut-metadata.ps1')) | ConvertFrom-Json
$expectedClsid = '{77ECE83F-1281-41F7-A306-A45192D2B840}'
$expectedHash = '73A4AFA12FF36B758C0F8D450F6B6AACFC0F3566C63EFAD14F458173D8508E4D'
$expectedShortcutHash = '0EB7419527F83306D4D3F289457D6ADC44B438D53A8538119422011DA4D0BF83'
$expectedExecutable = $metadata.shortcut.target
if ($metadata.shortcut.toastActivatorClsid -cne $expectedClsid -or
    $metadata.shortcut.sha256 -cne $expectedShortcutHash -or
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

public static class MashiroExactToastActivation {
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

  public static int Activate(string arguments) {
    int result = unchecked((int)0x80004005);
    Exception error = null;
    Thread worker = new Thread(() => {
      bool initialized = false;
      INotificationActivationCallback callback = null;
      try {
        int hr = CoInitializeEx(IntPtr.Zero, 2);
        if (hr < 0) Marshal.ThrowExceptionForHR(hr);
        initialized = true;
        Guid clsid = new Guid("B5051779-A11F-4603-BE81-C87C46CCB6C5");
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
$result = [MashiroExactToastActivation]::Activate($arguments)
$report.mode = 'DIRECT_OS_COM_ACTIVATION'
$report.hresult = $result
$report.afterProcessIds = @(Get-Process -Name Mashiro -ErrorAction SilentlyContinue |
  Where-Object { [string]::Equals($_.Path, $expectedExecutable, [StringComparison]::Ordinal) } |
  Select-Object -ExpandProperty Id)
$report | ConvertTo-Json -Depth 4
if ($result -ne 0) { throw 'COM_ACTIVATION_DID_NOT_RETURN_S_OK' }
