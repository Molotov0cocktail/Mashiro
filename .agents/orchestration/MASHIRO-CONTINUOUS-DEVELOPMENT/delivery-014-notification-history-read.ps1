$ErrorActionPreference = 'Stop'
# Read only this project's toast metadata. Never enumerate other applications or emit XML/body.
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$taskHistory = [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory('Mashiro.Desktop')
$taskRows = @($taskHistory | ForEach-Object {
  [pscustomobject]@{ tag = $_.Tag; group = $_.Group; expirationTime = $_.ExpirationTime }
})
[pscustomobject]@{ appId = 'Mashiro.Desktop'; count = $taskRows.Count; notifications = $taskRows } | ConvertTo-Json -Depth 5
