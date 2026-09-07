# Reopens only the retained, user-authorized synthetic review scene. No elevated shell.
$ErrorActionPreference='Stop'
$scene='C:\Users\30910\AppData\Local\Temp\mashiro-packaged-review-f0d34871-0c37-4abc-878e-3ea9fd5e89ee'
$owner=Get-Content -LiteralPath (Join-Path $scene 'review-owner.json') -Raw | ConvertFrom-Json
if($owner.testRoot -ne $scene){throw 'OWNER_MISMATCH'}
$exe=Join-Path $owner.install 'Mashiro.exe'
$asar=Join-Path $owner.install 'resources\app.asar'
if((Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash -ne $owner.exeHash){throw 'EXE_CHANGED'}
if((Get-FileHash -LiteralPath $asar -Algorithm SHA256).Hash -ne $owner.asarHash){throw 'ASAR_CHANGED'}
$handle=0
$desktop=(New-Object -ComObject Shell.Application).Windows().FindWindowSW(0,0,8,[ref]$handle,1)
if($null -eq $desktop -or $handle -eq 0){throw 'EXISTING_DESKTOP_UNAVAILABLE'}
$shell=$desktop.Document.Application
if($null -eq $shell.NameSpace($owner.install).ParseName('Mashiro.exe')){throw 'DESKTOP_EXE_UNAVAILABLE'}
$shell.ShellExecute($exe,'',$owner.install,'open',1)
[ordered]@{desktopHandle=$handle;exe=$exe;scene=$scene;launch='existing-normal-desktop-shell'}|ConvertTo-Json
