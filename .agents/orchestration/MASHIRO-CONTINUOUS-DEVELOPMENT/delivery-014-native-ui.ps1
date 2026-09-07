param(
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [ValidateSet('inspect','invoke','value','close')][string]$Action='inspect',
  [string]$Name='',
  [string]$AutomationId='',
  [string]$Value=''
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class MashiroNativeReview {
  public delegate bool Callback(IntPtr handle,IntPtr parameter);
  [DllImport("user32.dll")] public static extern bool EnumWindows(Callback callback,IntPtr parameter);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr handle,out uint process);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr handle);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle,StringBuilder value,int capacity);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr handle,uint message,IntPtr w,IntPtr l);
  public static IntPtr[] Windows(int process) {
    var found=new List<IntPtr>();
    EnumWindows((h,p)=>{uint actual;GetWindowThreadProcessId(h,out actual);if(actual==process&&IsWindowVisible(h))found.Add(h);return true;},IntPtr.Zero);
    return found.ToArray();
  }
}
'@
$process=Get-Process -Id $ProcessId -ErrorAction Stop
if ($process.ProcessName -ne 'Mashiro' -or $process.Path -ne 'C:\Users\30910\AppData\Local\Temp\mashiro-packaged-review-f0d34871-0c37-4abc-878e-3ea9fd5e89ee\原生候选 安装\Mashiro.exe') {throw 'UNEXPECTED_PROCESS'}
$results=@()
foreach($handle in [MashiroNativeReview]::Windows($ProcessId)) {
  $element=[System.Windows.Automation.AutomationElement]::FromHandle($handle)
  $controls=$element.FindAll([System.Windows.Automation.TreeScope]::Subtree,[System.Windows.Automation.Condition]::TrueCondition)
  if ($Action -eq 'close') {[void][MashiroNativeReview]::PostMessage($handle,0x0010,[IntPtr]::Zero,[IntPtr]::Zero);continue}
  for($index=0;$index -lt $controls.Count;$index++) {
    $control=$controls.Item($index)
    $current=$control.Current
    if($Action -eq 'inspect') {
      if($index -lt 250) {$results += [PSCustomObject]@{window=$handle.ToInt64();index=$index;name=$current.Name;automationId=$current.AutomationId;type=$current.ControlType.ProgrammaticName;enabled=$current.IsEnabled;offscreen=$current.IsOffscreen;handle=$current.NativeWindowHandle}}
    } elseif(($Name -and $current.Name -eq $Name) -or ($AutomationId -and $current.AutomationId -eq $AutomationId)) {
      if($Action -eq 'value') {
        $pattern=$control.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
        $pattern.SetValue($Value)
      } elseif($current.NativeWindowHandle -ne 0 -and $current.ControlType -eq [System.Windows.Automation.ControlType]::Button) {
        [void][MashiroNativeReview]::PostMessage([IntPtr]$current.NativeWindowHandle,0x00F5,[IntPtr]::Zero,[IntPtr]::Zero)
      } else {
        $pattern=$control.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
        $pattern.Invoke()
      }
      [PSCustomObject]@{processId=$ProcessId;action=$Action;name=$current.Name;automationId=$current.AutomationId}|ConvertTo-Json -Compress
      exit 0
    }
  }
}
if($Action -eq 'inspect') {$results|ConvertTo-Json -Depth 4}
elseif($Action -ne 'close') {throw 'EXACT_CONTROL_NOT_FOUND'}
