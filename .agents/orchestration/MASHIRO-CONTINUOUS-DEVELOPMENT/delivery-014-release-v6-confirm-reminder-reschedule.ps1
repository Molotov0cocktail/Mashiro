param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][long]$WindowHandle,
  [Parameter(Mandatory = $true)][string]$ExpectedValue
)
$ErrorActionPreference = 'Stop'
$expectedExecutable =
  'C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe'
if ((Get-Process -Id $ProcessId -ErrorAction Stop).Path -ne $expectedExecutable) {
  throw 'PROCESS_PATH_MISMATCH'
}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root = [Windows.Automation.AutomationElement]::FromHandle([IntPtr]$WindowHandle)

function Find-Exact([string]$Name, [Windows.Automation.ControlType]$Type) {
  $condition = [Windows.Automation.AndCondition]::new(
    [Windows.Automation.PropertyCondition]::new(
      [Windows.Automation.AutomationElement]::NameProperty,
      $Name
    ),
    [Windows.Automation.PropertyCondition]::new(
      [Windows.Automation.AutomationElement]::ControlTypeProperty,
      $Type
    )
  )
  $matches = $root.FindAll(
    [Windows.Automation.TreeScope]::Descendants,
    $condition
  )
  if ($matches.Count -ne 1) { throw "CONTROL_COUNT_${Name}_$($matches.Count)" }
  $matches.Item(0)
}

$edit = Find-Exact '提醒本地日期和时间' ([Windows.Automation.ControlType]::Edit)
$value = ([Windows.Automation.ValuePattern]$edit.GetCurrentPattern(
  [Windows.Automation.ValuePattern]::Pattern
)).Current.Value
if ($value -cne $ExpectedValue) { throw "DATE_VALUE_MISMATCH_$value" }

$confirm = Find-Exact '确认改期' ([Windows.Automation.ControlType]::Button)
if (-not $confirm.Current.IsEnabled) { throw 'CONFIRM_DISABLED' }
([Windows.Automation.InvokePattern]$confirm.GetCurrentPattern(
  [Windows.Automation.InvokePattern]::Pattern
)).Invoke()

[ordered]@{
  processId = $ProcessId
  window = $WindowHandle
  dateValue = $value
  confirmEnabled = $true
  confirmInvoked = $true
} | ConvertTo-Json -Compress
