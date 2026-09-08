$ErrorActionPreference = 'Stop'
$appId = 'io.github.molotov0cocktail.mashiro'
$group = 'reminders'
$oldTag = 'c6cd7a1fdeae2f59'
$currentTag = 'c15fc141f5c05243'
$null = [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime]
$history = [Windows.UI.Notifications.ToastNotificationManager]::History
$before = @($history.GetHistory($appId))
$oldCount = @($before | Where-Object { $_.Tag -eq $oldTag -and $_.Group -eq $group }).Count
$currentCount = @($before | Where-Object { $_.Tag -eq $currentTag -and $_.Group -eq $group }).Count
if ($oldCount -ne 1 -or $currentCount -ne 1) { throw 'EXACT_TAG_PRECONDITION_FAILED' }
$history.Remove($oldTag, $group, $appId)
$after = @($history.GetHistory($appId))
$afterOldCount = @($after | Where-Object { $_.Tag -eq $oldTag -and $_.Group -eq $group }).Count
$afterCurrentCount = @($after | Where-Object { $_.Tag -eq $currentTag -and $_.Group -eq $group }).Count
if ($afterOldCount -ne 0 -or $afterCurrentCount -ne 1) { throw 'EXACT_TAG_POSTCONDITION_FAILED' }
[ordered]@{
  observedAt = [DateTimeOffset]::Now.ToString('o')
  appId = $appId
  group = $group
  removedTag = $oldTag
  retainedTag = $currentTag
  beforeCount = $before.Count
  afterCount = $after.Count
  removedTagAfterCount = $afterOldCount
  retainedTagAfterCount = $afterCurrentCount
  globalClearInvoked = $false
  unrelatedNotificationContentRead = $false
} | ConvertTo-Json -Depth 5
