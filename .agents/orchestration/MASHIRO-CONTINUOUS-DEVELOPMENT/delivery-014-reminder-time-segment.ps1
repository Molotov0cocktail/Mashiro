param(
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [Parameter(Mandatory=$true)][long]$WindowHandle,
  [Parameter(Mandatory=$true)][ValidateSet('hour','minute')][string]$Segment,
  [Parameter(Mandatory=$true)][ValidatePattern('^\d{2}$')][string]$Value
)
$ErrorActionPreference='Stop'
$expected='C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe'
$process=Get-Process -Id $ProcessId -ErrorAction Stop
if($process.ProcessName -ne 'Mashiro' -or $process.Path -ne $expected){throw 'PROCESS_PATH_MISMATCH'}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class MashiroOwnedDateInput {
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$window=[IntPtr]$WindowHandle
$owner=[uint32]0
[void][MashiroOwnedDateInput]::GetWindowThreadProcessId($window,[ref]$owner)
if($owner -ne $ProcessId){throw 'WINDOW_PID_MISMATCH'}
$root=[System.Windows.Automation.AutomationElement]::FromHandle($window)
$label=if($Segment -eq 'hour'){'小时 提醒本地日期和时间'}else{'分钟 提醒本地日期和时间'}
$condition=[System.Windows.Automation.AndCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,$label),
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Spinner)
)
$matches=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)
if($matches.Count -ne 1){throw "SEGMENT_NOT_UNIQUE_$($matches.Count)"}
$target=$matches.Item(0)
if(-not $target.Current.IsEnabled){throw 'SEGMENT_DISABLED'}
[void][MashiroOwnedDateInput]::SetForegroundWindow($window)
if([MashiroOwnedDateInput]::GetForegroundWindow() -ne $window){throw 'FOREGROUND_NOT_OWNED'}
$target.SetFocus()
Start-Sleep -Milliseconds 150
$focused=[System.Windows.Automation.AutomationElement]::FocusedElement
if($focused.Current.ProcessId -ne $ProcessId -or $focused.Current.Name -ne $label){throw 'FOCUS_NOT_EXACT_SEGMENT'}
[System.Windows.Forms.SendKeys]::SendWait('^a')
[System.Windows.Forms.SendKeys]::SendWait($Value)
Start-Sleep -Milliseconds 250
$editCondition=[System.Windows.Automation.AndCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'提醒本地日期和时间'),
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)
)
$edit=$root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$editCondition)
if($null -eq $edit){throw 'DATE_EDIT_NOT_FOUND'}
$current=([System.Windows.Automation.ValuePattern]$edit.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).Current.Value
[ordered]@{processId=$ProcessId;window=$WindowHandle;segment=$Segment;value=$Value;current=$current}|ConvertTo-Json -Compress
