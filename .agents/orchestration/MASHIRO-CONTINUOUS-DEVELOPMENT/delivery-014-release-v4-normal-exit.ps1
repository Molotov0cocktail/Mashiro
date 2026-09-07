param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][long]$WindowHandle
)

$ErrorActionPreference = 'Stop'
$expected = 'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe'
$process = Get-Process -Id $ProcessId -ErrorAction Stop
if ($process.ProcessName -ne 'Mashiro' -or $process.Path -ne $expected) {
  throw 'PROCESS_PATH_MISMATCH'
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Runtime.InteropServices;

public static class ExactMashiroClick {
  [StructLayout(LayoutKind.Sequential)]
  public struct Point { public int X; public int Y; }

  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr h, out uint processId);
  [DllImport("user32.dll")]
  public static extern IntPtr WindowFromPoint(Point point);
  [DllImport("user32.dll")]
  public static extern IntPtr GetAncestor(IntPtr h, uint flags);
  [DllImport("user32.dll")]
  public static extern bool ScreenToClient(IntPtr h, ref Point point);
  [DllImport("user32.dll")]
  public static extern bool PostMessage(IntPtr h, uint message, IntPtr wParam, IntPtr lParam);

  public static IntPtr Pack(int x, int y) {
    return (IntPtr)((y << 16) | (x & 0xffff));
  }
}
'@

$window = [IntPtr]$WindowHandle
$actual = [uint32]0
[void][ExactMashiroClick]::GetWindowThreadProcessId($window, [ref]$actual)
if ($actual -ne $ProcessId) {
  throw 'WINDOW_PID_MISMATCH'
}

$root = [System.Windows.Automation.AutomationElement]::FromHandle($window)
$buttonCondition = [System.Windows.Automation.AndCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::NameProperty,
    '数据与备份'
  ),
  [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
)
$buttons = $root.FindAll([System.Windows.Automation.TreeScope]::Descendants, $buttonCondition)
if ($buttons.Count -ne 1) {
  throw "BUTTON_COUNT_$($buttons.Count)"
}
$button = $buttons.Item(0)
if (
  $button.Current.ProcessId -ne $ProcessId -or
  -not $button.Current.IsEnabled -or
  $button.Current.IsOffscreen
) {
  throw 'BUTTON_INVALID'
}

$bounds = $button.Current.BoundingRectangle
$screen = [ExactMashiroClick+Point]::new()
$screen.X = [int]($bounds.X + $bounds.Width / 2)
$screen.Y = [int]($bounds.Y + $bounds.Height / 2)
$hit = [ExactMashiroClick]::WindowFromPoint($screen)
$owner = [uint32]0
[void][ExactMashiroClick]::GetWindowThreadProcessId($hit, [ref]$owner)
if ($owner -ne $ProcessId -or [ExactMashiroClick]::GetAncestor($hit, 2) -ne $window) {
  throw 'POINTER_TARGET_NOT_OWNED'
}

$client = $screen
if (-not [ExactMashiroClick]::ScreenToClient($hit, [ref]$client)) {
  throw 'SCREEN_TO_CLIENT_FAILED'
}
$lParam = [ExactMashiroClick]::Pack($client.X, $client.Y)
if (-not [ExactMashiroClick]::PostMessage($hit, 0x0201, [IntPtr]1, $lParam)) {
  throw 'POST_DOWN_FAILED'
}
if (-not [ExactMashiroClick]::PostMessage($hit, 0x0202, [IntPtr]::Zero, $lParam)) {
  throw 'POST_UP_FAILED'
}

Start-Sleep -Milliseconds 350
$exitCondition = [System.Windows.Automation.AndCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
    $ProcessId
  ),
  [System.Windows.Automation.AndCondition]::new(
    [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::NameProperty,
      '退出 Mashiro'
    ),
    [System.Windows.Automation.PropertyCondition]::new(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::MenuItem
    )
  )
)
$items = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
  [System.Windows.Automation.TreeScope]::Descendants,
  $exitCondition
)
if ($items.Count -ne 1) {
  throw "EXIT_COUNT_$($items.Count)"
}
$exitItem = $items.Item(0)
if (-not $exitItem.Current.IsEnabled -or $exitItem.Current.IsOffscreen) {
  throw 'EXIT_UNAVAILABLE'
}
([System.Windows.Automation.InvokePattern]$exitItem.GetCurrentPattern(
  [System.Windows.Automation.InvokePattern]::Pattern
)).Invoke()

[ordered]@{
  processId = $ProcessId
  window = $WindowHandle
  button = '数据与备份'
  menuItem = '退出 Mashiro'
  pointerOwner = $owner
  method = 'guarded-pointer-then-uia-invoke'
} | ConvertTo-Json -Compress
