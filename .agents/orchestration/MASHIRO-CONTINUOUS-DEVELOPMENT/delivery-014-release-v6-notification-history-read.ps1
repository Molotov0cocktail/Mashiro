$ErrorActionPreference = 'Stop'
# Read only the release-v6 production AUMID's toast metadata. Never enumerate other apps or emit XML/body.
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$history = [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory(
  'io.github.molotov0cocktail.mashiro'
)
$rows = @(
  $history | ForEach-Object {
    [pscustomobject]@{ tag = $_.Tag; group = $_.Group; expirationTime = $_.ExpirationTime }
  }
)
[pscustomobject]@{
  appId = 'io.github.molotov0cocktail.mashiro'
  count = $rows.Count
  notifications = $rows
} | ConvertTo-Json -Depth 5
