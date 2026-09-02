param(
  [Parameter(Mandatory = $true)]
  [string]$TargetId,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{64}$')]
  [string]$PreimageSha256,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{64}$')]
  [string]$ExpectedPostimageSha256,

  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[0-9a-f]{40}$')]
  [string]$ExpectedHead,

  [Parameter(Mandatory = $true)]
  [string[]]$OldBase64,

  [Parameter(Mandatory = $true)]
  [string[]]$NewBase64,

  [Parameter(Mandatory = $true)]
  [int[]]$ExpectedMatchCount
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false

$projectRoot = 'D:\Mashiro'
$gitExecutable = 'D:\Git\Git\cmd\git.exe'
$expectedScriptPath = 'D:\Mashiro\.agents\orchestration\MASHIRO-CONTINUOUS-DEVELOPMENT\tooling\content-addressed-atomic-file-writer-v1.ps1'
$targetMap = @{
  'agents-root' = 'D:\Mashiro\AGENTS.md'
  'readme' = 'D:\Mashiro\README.md'
  'gitignore' = 'D:\Mashiro\.gitignore'
  'gitattributes' = 'D:\Mashiro\.gitattributes'
  'editorconfig' = 'D:\Mashiro\.editorconfig'
  'npmrc' = 'D:\Mashiro\.npmrc'
  'node-version' = 'D:\Mashiro\.node-version'
  'prettierignore' = 'D:\Mashiro\.prettierignore'
  'prettierrc' = 'D:\Mashiro\.prettierrc.json'
  'package-json' = 'D:\Mashiro\package.json'
  'package-lock' = 'D:\Mashiro\package-lock.json'
  'electron-vite-config' = 'D:\Mashiro\electron.vite.config.ts'
  'eslint-config' = 'D:\Mashiro\eslint.config.mjs'
  'tsconfig' = 'D:\Mashiro\tsconfig.json'
  'tsconfig-node' = 'D:\Mashiro\tsconfig.node.json'
  'tsconfig-web' = 'D:\Mashiro\tsconfig.web.json'
  'vitest-config' = 'D:\Mashiro\vitest.config.ts'
  'assistant-contract' = 'D:\Mashiro\src\shared\assistant-contract.ts'
  'main-index' = 'D:\Mashiro\src\main\index.ts'
  'create-window' = 'D:\Mashiro\src\main\app\create-window.ts'
  'data-root' = 'D:\Mashiro\src\main\data\data-root.ts'
  'schema' = 'D:\Mashiro\src\main\data\schema.ts'
  'sqlite' = 'D:\Mashiro\src\main\data\sqlite.ts'
  'assistant-repository' = 'D:\Mashiro\src\main\assistant\assistant-repository.ts'
  'assistant-service' = 'D:\Mashiro\src\main\assistant\assistant-service.ts'
  'assistant-ipc' = 'D:\Mashiro\src\main\ipc\register-assistant-ipc.ts'
  'e2e-controller' = 'D:\Mashiro\src\main\testing\e2e-controller.ts'
  'preload-index' = 'D:\Mashiro\src\preload\index.ts'
  'preload-types' = 'D:\Mashiro\src\preload\index.d.ts'
  'renderer-index' = 'D:\Mashiro\src\renderer\index.html'
  'renderer-main' = 'D:\Mashiro\src\renderer\src\main.tsx'
  'renderer-app' = 'D:\Mashiro\src\renderer\src\App.tsx'
  'assistant-panel' = 'D:\Mashiro\src\renderer\src\features\assistants\AssistantPanel.tsx'
  'renderer-styles' = 'D:\Mashiro\src\renderer\src\styles.css'
  'tests-setup' = 'D:\Mashiro\tests\setup.ts'
  'test-contract' = 'D:\Mashiro\tests\unit\assistant-contract.test.ts'
  'test-service' = 'D:\Mashiro\tests\integration\assistant-service.test.ts'
  'test-ipc' = 'D:\Mashiro\tests\integration\assistant-ipc.test.ts'
  'test-panel' = 'D:\Mashiro\tests\renderer\AssistantPanel.test.tsx'
  'electron-harness' = 'D:\Mashiro\scripts\electron-f1-harness.mjs'
  'doc-proposal' = 'D:\Mashiro\doc\proposal.md'
  'doc-high-level' = 'D:\Mashiro\doc\high-level-design.md'
  'doc-detailed' = 'D:\Mashiro\doc\detailed-design.md'
  'task-001' = 'D:\Mashiro\doc\tasks\001-project-foundation.md'
  'task-002' = 'D:\Mashiro\doc\tasks\002-node-sqlite-qualification.md'
  'task-003' = 'D:\Mashiro\doc\tasks\003-provider-live-qualification.md'
  'task-progress' = 'D:\Mashiro\doc\tasks\progress.md'
}

function Get-Sha256([byte[]]$Bytes) {
  return [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($Bytes)).ToLowerInvariant()
}

function Get-FileSha256([string]$Path) {
  return Get-Sha256 ([IO.File]::ReadAllBytes($Path))
}

function Get-DecodedFile([byte[]]$Bytes) {
  if ($Bytes.Length -ge 3 -and $Bytes[0] -eq 0xEF -and $Bytes[1] -eq 0xBB -and $Bytes[2] -eq 0xBF) {
    $encoding = [Text.UTF8Encoding]::new($false, $true)
    return [pscustomobject]@{ Encoding = $encoding; EncodingName = 'utf-8'; Bom = [byte[]](0xEF, 0xBB, 0xBF); Text = $encoding.GetString($Bytes, 3, $Bytes.Length - 3) }
  }
  if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0xFF -and $Bytes[1] -eq 0xFE) {
    $encoding = [Text.UnicodeEncoding]::new($false, $false, $true)
    return [pscustomobject]@{ Encoding = $encoding; EncodingName = 'utf-16le'; Bom = [byte[]](0xFF, 0xFE); Text = $encoding.GetString($Bytes, 2, $Bytes.Length - 2) }
  }
  if ($Bytes.Length -ge 2 -and $Bytes[0] -eq 0xFE -and $Bytes[1] -eq 0xFF) {
    $encoding = [Text.UnicodeEncoding]::new($true, $false, $true)
    return [pscustomobject]@{ Encoding = $encoding; EncodingName = 'utf-16be'; Bom = [byte[]](0xFE, 0xFF); Text = $encoding.GetString($Bytes, 2, $Bytes.Length - 2) }
  }
  $encoding = [Text.UTF8Encoding]::new($false, $true)
  return [pscustomobject]@{ Encoding = $encoding; EncodingName = 'utf-8'; Bom = [byte[]]@(); Text = $encoding.GetString($Bytes) }
}

function Get-EncodedBytes($Decoded, [string]$Text) {
  [byte[]]$payload = $Decoded.Encoding.GetBytes($Text)
  if ($Decoded.Bom.Length -eq 0) {
    return $payload
  }
  [byte[]]$result = [byte[]]::new($Decoded.Bom.Length + $payload.Length)
  [Array]::Copy($Decoded.Bom, 0, $result, 0, $Decoded.Bom.Length)
  [Array]::Copy($payload, 0, $result, $Decoded.Bom.Length, $payload.Length)
  return $result
}

function Get-NewlineProfile([string]$Text) {
  $crlf = [regex]::Matches($Text, "`r`n").Count
  $lf = [regex]::Matches($Text, "(?<!`r)`n").Count
  $cr = [regex]::Matches($Text, "`r(?!`n)").Count
  $kinds = @(@(($crlf -gt 0), ($lf -gt 0), ($cr -gt 0)) | Where-Object { $_ })
  $convention = if ($kinds.Count -gt 1) { 'mixed' } elseif ($crlf -gt 0) { 'crlf' } elseif ($lf -gt 0) { 'lf' } elseif ($cr -gt 0) { 'cr' } else { 'none' }
  return [pscustomobject]@{ Convention = $convention; FinalNewline = ($Text.EndsWith("`n") -or $Text.EndsWith("`r")) }
}

function Invoke-GuardedGit([string[]]$Arguments) {
  $output = @(& $gitExecutable -c 'safe.directory=D:/Mashiro' @Arguments 2>&1)
  $exitCode = $LASTEXITCODE
  return [pscustomobject]@{ Arguments = $Arguments; ExitCode = $exitCode; Output = ($output -join "`n") }
}

$evidence = [ordered]@{
  targetId = $TargetId
  target = $null
  head = $null
  statusBefore = $null
  preimageSha256 = $null
  expectedPostimageSha256 = $ExpectedPostimageSha256
  postimageSha256 = $null
  matchCounts = @()
  encoding = $null
  newline = $null
  finalNewline = $null
  tempPath = $null
  backupPath = $null
  rollback = 'not-required'
  residuals = @()
  success = $false
  error = $null
}

$target = $null
$tempPath = $null
$backupPath = $null
$replaceCompleted = $false

try {
  if ([IO.Path]::GetFullPath($PSCommandPath) -cne $expectedScriptPath) {
    throw 'Writer script path is not the fixed authorized path'
  }
  if ([IO.Path]::GetFullPath((Resolve-Path -LiteralPath $projectRoot).Path) -cne $projectRoot) {
    throw 'Project root did not resolve to the fixed canonical path'
  }
  if (-not $targetMap.ContainsKey($TargetId)) {
    throw 'TargetId is not in the fixed internal allowlist'
  }
  if ($OldBase64.Count -ne $NewBase64.Count -or $OldBase64.Count -ne $ExpectedMatchCount.Count -or $OldBase64.Count -eq 0) {
    throw 'Transformation arrays must have the same non-zero length'
  }

  $target = $targetMap[$TargetId]
  $evidence.target = $target
  $item = Get-Item -LiteralPath $target -Force
  if ([IO.Path]::GetFullPath($item.FullName) -cne $target) {
    throw 'Target canonical path differs from the fixed allowlist path'
  }
  if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'Target is a reparse point'
  }
  $parent = Get-Item -LiteralPath $item.DirectoryName -Force
  if ($parent.Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'Target parent is a reparse point'
  }

  $headResult = Invoke-GuardedGit @('rev-parse', 'HEAD')
  if ($headResult.ExitCode -ne 0 -or $headResult.Output.Trim() -cne $ExpectedHead) {
    throw 'Git HEAD guard failed'
  }
  $evidence.head = $headResult.Output.Trim()
  $indexResult = Invoke-GuardedGit @('diff', '--cached', '--quiet')
  if ($indexResult.ExitCode -ne 0) {
    throw 'Git index is not empty'
  }
  $statusResult = Invoke-GuardedGit @('status', '--short', '--untracked-files=all')
  if ($statusResult.ExitCode -ne 0) {
    throw 'Git status guard failed'
  }
  $evidence.statusBefore = $statusResult.Output

  [byte[]]$preimageBytes = [IO.File]::ReadAllBytes($target)
  $actualPreimageSha256 = Get-Sha256 $preimageBytes
  $evidence.preimageSha256 = $actualPreimageSha256
  if ($actualPreimageSha256 -cne $PreimageSha256) {
    throw 'Preimage SHA-256 mismatch; zero target writes performed'
  }

  $decoded = Get-DecodedFile $preimageBytes
  $profile = Get-NewlineProfile $decoded.Text
  $evidence.encoding = $decoded.EncodingName
  $evidence.newline = $profile.Convention
  $evidence.finalNewline = $profile.FinalNewline
  $transformed = $decoded.Text
  $counts = [Collections.Generic.List[int]]::new()
  for ($index = 0; $index -lt $OldBase64.Count; $index++) {
    $old = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($OldBase64[$index]))
    $new = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($NewBase64[$index]))
    $count = [regex]::Matches($transformed, [regex]::Escape($old)).Count
    $counts.Add($count)
    if ($count -ne $ExpectedMatchCount[$index]) {
      throw "Exact replacement match count mismatch at transformation $index; zero target writes performed"
    }
    $transformed = $transformed.Replace($old, $new)
  }
  $evidence.matchCounts = $counts.ToArray()

  [byte[]]$postimageBytes = Get-EncodedBytes $decoded $transformed
  $computedPostimageSha256 = Get-Sha256 $postimageBytes
  if ($computedPostimageSha256 -cne $ExpectedPostimageSha256) {
    throw 'Computed postimage SHA-256 did not match the fixed expectation; zero target writes performed'
  }
  $postDecoded = Get-DecodedFile $postimageBytes
  $postProfile = Get-NewlineProfile $postDecoded.Text
  if ($postDecoded.EncodingName -cne $decoded.EncodingName -or $postDecoded.Bom.Length -ne $decoded.Bom.Length) {
    throw 'Encoding or BOM policy would change; zero target writes performed'
  }
  if ($postProfile.Convention -cne $profile.Convention -or $postProfile.FinalNewline -ne $profile.FinalNewline) {
    throw 'Newline convention or final-newline state would change; zero target writes performed'
  }

  $nonce = [Guid]::NewGuid().ToString('N')
  $tempPath = [IO.Path]::Combine($item.DirectoryName, ".{0}.codex-temp-{1}" -f $item.Name, $nonce)
  $backupPath = [IO.Path]::Combine($item.DirectoryName, ".{0}.codex-backup-{1}-{2}" -f $item.Name, $PreimageSha256, $nonce)
  $evidence.tempPath = $tempPath
  $evidence.backupPath = $backupPath
  if ([IO.File]::Exists($tempPath) -or [IO.File]::Exists($backupPath)) {
    throw 'Unique temp or backup path collision'
  }

  $stream = [IO.FileStream]::new($tempPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  try {
    $stream.Write($postimageBytes, 0, $postimageBytes.Length)
    $stream.Flush($true)
  } finally {
    $stream.Dispose()
  }
  [byte[]]$tempBytes = [IO.File]::ReadAllBytes($tempPath)
  if ($tempBytes.Length -ne $postimageBytes.Length) {
    throw 'Sibling temp content verification failed'
  }
  if ((Get-Sha256 $tempBytes) -cne $ExpectedPostimageSha256) {
    throw 'Sibling temp SHA-256 verification failed'
  }
  $tempDecoded = Get-DecodedFile $tempBytes
  $tempProfile = Get-NewlineProfile $tempDecoded.Text
  if ($tempDecoded.EncodingName -cne $decoded.EncodingName -or $tempDecoded.Bom.Length -ne $decoded.Bom.Length -or $tempProfile.Convention -cne $profile.Convention -or $tempProfile.FinalNewline -ne $profile.FinalNewline) {
    throw 'Sibling temp encoding/newline verification failed'
  }

  if ((Get-FileSha256 $target) -cne $PreimageSha256) {
    throw 'Target changed concurrently before atomic replace'
  }
  [IO.File]::Replace($tempPath, $target, $backupPath, $false)
  $replaceCompleted = $true
  $tempPath = $null

  $actualPostimageSha256 = Get-FileSha256 $target
  $evidence.postimageSha256 = $actualPostimageSha256
  if ($actualPostimageSha256 -cne $ExpectedPostimageSha256) {
    throw 'Target postimage SHA-256 verification failed'
  }
  if ((Get-FileSha256 $backupPath) -cne $PreimageSha256) {
    throw 'Content-addressed backup SHA-256 verification failed'
  }
  $targetPostBytes = [IO.File]::ReadAllBytes($target)
  if ($targetPostBytes.Length -ne $postimageBytes.Length) {
    throw 'Target postimage bytes differ from the deterministic transformation'
  }

  $evidence.residuals = @($backupPath)
  $evidence.success = $true
  $evidence | ConvertTo-Json -Depth 8
  exit 0
} catch {
  $evidence.error = $_.Exception.Message
  if ($replaceCompleted -and $null -ne $target -and $null -ne $backupPath -and [IO.File]::Exists($backupPath)) {
    try {
      $failedPath = "$target.codex-failed-$([Guid]::NewGuid().ToString('N'))"
      [IO.File]::Replace($backupPath, $target, $failedPath, $false)
      if ((Get-FileSha256 $target) -cne $PreimageSha256) {
        throw 'Rollback completed but restored preimage hash does not match'
      }
      $evidence.rollback = 'restored-preimage'
      $evidence.residuals = @($failedPath)
    } catch {
      $evidence.rollback = "failed: $($_.Exception.Message)"
    }
  } else {
    $evidence.rollback = 'not-required-target-unchanged'
    $residuals = [Collections.Generic.List[string]]::new()
    if ($null -ne $tempPath -and [IO.File]::Exists($tempPath)) { $residuals.Add($tempPath) }
    if ($null -ne $backupPath -and [IO.File]::Exists($backupPath)) { $residuals.Add($backupPath) }
    $evidence.residuals = $residuals.ToArray()
  }
  if ($null -ne $target -and [IO.File]::Exists($target)) {
    $evidence.postimageSha256 = Get-FileSha256 $target
  }
  $evidence | ConvertTo-Json -Depth 8
  exit 1
}
