param(
  [Parameter(Mandatory=$true)][int]$ProcessId,
  [Parameter(Mandatory=$true)][long]$WindowHandle
)
$ErrorActionPreference='Stop'
$expectedPath='C:\Users\30910\AppData\Local\Temp\mashiro-install-full-Zbzmgp\安装 旧版本\Mashiro.exe'
$expectedSha256='F5566CEDB14AF2C2908717B12860FBEBA4EB6BBA12BE25F722BC919009164F05'
$process=Get-Process -Id $ProcessId -ErrorAction Stop
if($process.ProcessName -ne 'Mashiro' -or $process.Path -ne $expectedPath){throw 'PROCESS_PATH_MISMATCH'}
if((Get-FileHash -Algorithm SHA256 -LiteralPath $expectedPath).Hash -ne $expectedSha256){throw 'EXECUTABLE_HASH_MISMATCH'}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$root=[System.Windows.Automation.AutomationElement]::FromHandle([IntPtr]$WindowHandle)
if($root.Current.ProcessId -ne $ProcessId){throw 'WINDOW_PID_MISMATCH'}
$keyCondition=[System.Windows.Automation.AndCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'API Key'),
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit)
)
$keyFields=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$keyCondition)
if($keyFields.Count -ne 1){throw "KEY_FIELD_NOT_UNIQUE_$($keyFields.Count)"}
$keyField=$keyFields.Item(0)
if($keyField.Current.ProcessId -ne $ProcessId -or -not $keyField.Current.IsPassword -or -not $keyField.Current.IsEnabled){throw 'KEY_FIELD_NOT_TRUSTED'}

$persistCondition=[System.Windows.Automation.AndCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::NameProperty,'使用 Windows 凭据保护持久保存'),
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::CheckBox)
)
$persistBoxes=$root.FindAll([System.Windows.Automation.TreeScope]::Descendants,$persistCondition)
if($persistBoxes.Count -ne 1){throw "PERSIST_BOX_NOT_UNIQUE_$($persistBoxes.Count)"}
$persistBox=$persistBoxes.Item(0)
if($persistBox.Current.ProcessId -ne $ProcessId -or -not $persistBox.Current.IsEnabled){throw 'PERSIST_BOX_NOT_TRUSTED'}

$secret=$null
$secretBuffer=[Text.StringBuilder]::new()
try {
  while($true){$key=[Console]::ReadKey($true);if($key.Key -eq [ConsoleKey]::Enter){break};if($key.KeyChar -ne [char]0){[void]$secretBuffer.Append($key.KeyChar)}}
  $secret=$secretBuffer.ToString()
  if([string]::IsNullOrWhiteSpace($secret) -or $secret.Length -gt 4096){throw 'KEY_INPUT_INVALID'}
  $keyField.SetFocus()
  ([System.Windows.Automation.ValuePattern]$keyField.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).SetValue($secret)
  $toggle=[System.Windows.Automation.TogglePattern]$persistBox.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)
  if($toggle.Current.ToggleState -ne [System.Windows.Automation.ToggleState]::On){$toggle.Toggle()}
  Start-Sleep -Milliseconds 250
  if(([System.Windows.Automation.TogglePattern]$persistBox.GetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern)).Current.ToggleState -ne [System.Windows.Automation.ToggleState]::On){throw 'PERSIST_BOX_NOT_ON'}
} finally {
  $secret=$null
  [void]$secretBuffer.Clear()
  [GC]::Collect()
}

[ordered]@{
  processId=$ProcessId
  windowHandle=$WindowHandle
  executableSha256=$expectedSha256
  keyField='UNIQUE_PASSWORD_EDIT'
  persistence='On'
  secretEmitted=$false
  secretWrittenToFile=$false
}|ConvertTo-Json -Compress
