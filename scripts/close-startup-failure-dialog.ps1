param(
  [Parameter(Mandatory = $true)]
  [ValidateRange(1, 2147483647)]
  [int]$TargetProcessId
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class MashiroStartupFailureDialogNative {
  public delegate bool EnumWindowsProc(IntPtr hwnd, IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc callback, IntPtr parameter);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hwnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr hwnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int maximum);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hwnd, StringBuilder name, int maximum);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hwnd);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool PostMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);
}
"@

$script:lastObserved = @()

function Get-WindowTextValue([IntPtr]$window) {
  $length = [MashiroStartupFailureDialogNative]::GetWindowTextLength($window)
  $text = [Text.StringBuilder]::new([Math]::Max(2, $length + 1))
  [void][MashiroStartupFailureDialogNative]::GetWindowText($window, $text, $text.Capacity)
  return $text.ToString()
}

function Get-WindowClassValue([IntPtr]$window) {
  $name = [Text.StringBuilder]::new(256)
  [void][MashiroStartupFailureDialogNative]::GetClassName($window, $name, $name.Capacity)
  return $name.ToString()
}

function Get-TextShape([string]$text) {
  $bytes = [Text.Encoding]::UTF8.GetBytes($text)
  $digest = [Security.Cryptography.SHA256]::Create()
  try { $sha = ([BitConverter]::ToString($digest.ComputeHash($bytes))).Replace('-', '') }
  finally { $digest.Dispose() }
  return [ordered]@{ length = $text.Length; sha256 = $sha }
}

function Test-TargetProcess {
  try {
    $process = Get-Process -Id $TargetProcessId -ErrorAction Stop
    return $process.ProcessName -eq 'electron'
  } catch {
    return $false
  }
}

function Find-ExactDialog {
  $matches = [Collections.Generic.List[object]]::new()
  $observed = [Collections.Generic.List[object]]::new()
  $callback = [MashiroStartupFailureDialogNative+EnumWindowsProc]{
    param([IntPtr]$window, [IntPtr]$parameter)

    [uint32]$owner = 0
    [void][MashiroStartupFailureDialogNative]::GetWindowThreadProcessId($window, [ref]$owner)
    if ($owner -ne [uint32]$TargetProcessId -or -not [MashiroStartupFailureDialogNative]::IsWindowVisible($window)) {
      return $true
    }

    $windowClass = Get-WindowClassValue $window
    $caption = Get-WindowTextValue $window
    $observed.Add([ordered]@{
      handle = $window.ToInt64()
      className = $windowClass
      caption = Get-TextShape $caption
      captionIsError = $caption -eq 'Error'
    })
    if ($windowClass -eq '#32770' -and $caption -eq 'Error') {
      $matches.Add([ordered]@{
        handle = $window.ToInt64()
        className = $windowClass
        captionIsError = $true
      })
    }
    return $true
  }

  [void][MashiroStartupFailureDialogNative]::EnumWindows($callback, [IntPtr]::Zero)
  $script:lastObserved = @($observed)
  return @($matches)
}

$deadline = [DateTimeOffset]::Now.AddSeconds(20)
while ([DateTimeOffset]::Now -lt $deadline) {
  $dialogs = @(Find-ExactDialog)
  if ($dialogs.Count -gt 1) {
    [Console]::Error.WriteLine('MULTIPLE_EXACT_DIALOGS')
    exit 4
  }
  if ($dialogs.Count -eq 1) {
    $dialog = $dialogs[0]
    $handle = [IntPtr]::new([int64]$dialog.handle)
    if (-not [MashiroStartupFailureDialogNative]::PostMessage($handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)) {
      [Console]::Error.WriteLine('DIALOG_CLOSE_REQUEST_FAILED')
      exit 5
    }
    $closeDeadline = [DateTimeOffset]::Now.AddSeconds(5)
    while ([DateTimeOffset]::Now -lt $closeDeadline -and [MashiroStartupFailureDialogNative]::IsWindow($handle)) {
      Start-Sleep -Milliseconds 50
    }
    if ([MashiroStartupFailureDialogNative]::IsWindow($handle)) {
      [Console]::Error.WriteLine('DIALOG_DID_NOT_CLOSE')
      exit 6
    }

    [ordered]@{
      schemaVersion = 4
      outcome = 'EXACT_STARTUP_FAILURE_DIALOG_CLOSED'
      observedAt = [DateTimeOffset]::Now.ToString('o')
      targetProcessId = $TargetProcessId
      className = $dialog.className
      captionIsError = $dialog.captionIsError
      binding = 'TARGET_PID_UNIQUE_VISIBLE_ERROR_DIALOG_AFTER_STABLE_EVENT'
      closeMessage = 'WM_CLOSE'
      processStillRunningAfterDialogClose = Test-TargetProcess
      unrelatedWindowContentRead = $false
      childWindowContentRead = $false
      applicationStartedByHelper = $false
    } | ConvertTo-Json -Compress
    exit 0
  }

  if (-not (Test-TargetProcess)) {
    [Console]::Error.WriteLine('TARGET_EXITED_BEFORE_DIALOG')
    exit 3
  }
  Start-Sleep -Milliseconds 50
}

[Console]::Error.WriteLine(([ordered]@{
  code = 'EXACT_DIALOG_TIMEOUT'
  targetProcessId = $TargetProcessId
  observedTargetWindows = $script:lastObserved
} | ConvertTo-Json -Depth 5 -Compress))
exit 2
