param([int]$ProcessId,[long]$WindowHandle,[string]$Name)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;using System.Runtime.InteropServices;
public static class MashiroOwnedClick {
 [DllImport("user32.dll")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")]public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")]public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")]public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")]public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
}
'@
$expected='C:\Users\30910\AppData\Local\Temp\mashiro-packaged-review-f0d34871-0c37-4abc-878e-3ea9fd5e89ee\原生候选 安装\Mashiro.exe'
if((Get-Process -Id $ProcessId).Path -ne $expected){throw 'PROCESS_PATH_MISMATCH'}
$actual=0
[void][MashiroOwnedClick]::GetWindowThreadProcessId([IntPtr]$WindowHandle,[ref]$actual)
if($actual -ne $ProcessId){throw 'WINDOW_PID_MISMATCH'}
$root=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$WindowHandle)
$condition=[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$Name)
$control=$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
if($null -eq $control -or -not $control.Current.IsEnabled -or $control.Current.IsOffscreen){throw 'CONTROL_UNAVAILABLE'}
$bounds=$control.Current.BoundingRectangle
if($bounds.Width -le 0 -or $bounds.Height -le 0){throw 'EMPTY_BOUNDS'}
[void][MashiroOwnedClick]::SetForegroundWindow([IntPtr]$WindowHandle)
if([MashiroOwnedClick]::GetForegroundWindow().ToInt64() -ne $WindowHandle){throw 'FOREGROUND_MISMATCH'}
[void][MashiroOwnedClick]::SetCursorPos([int]($bounds.X+$bounds.Width/2),[int]($bounds.Y+$bounds.Height/2))
[MashiroOwnedClick]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
[MashiroOwnedClick]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
[ordered]@{processId=$ProcessId;window=$WindowHandle;control=$Name;action='native-pointer-click'}|ConvertTo-Json -Compress
