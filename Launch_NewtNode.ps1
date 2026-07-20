$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appUrl = "http://127.0.0.1:5176/"

Set-Location $root

$distIndex = Join-Path $root "dist\index.html"
$sourcePaths = @(
  (Join-Path $root "src"),
  (Join-Path $root "public"),
  (Join-Path $root "index.html"),
  (Join-Path $root "vite.config.js"),
  (Join-Path $root "package.json")
)
$buildRequired = -not (Test-Path -LiteralPath $distIndex)
if (-not $buildRequired) {
  $builtAt = (Get-Item -LiteralPath $distIndex).LastWriteTimeUtc
  foreach ($sourcePath in $sourcePaths) {
    if (-not (Test-Path -LiteralPath $sourcePath)) { continue }
    $newerSource = Get-ChildItem -LiteralPath $sourcePath -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTimeUtc -gt $builtAt } |
      Select-Object -First 1
    if ($newerSource) {
      $buildRequired = $true
      break
    }
  }
}

if ($buildRequired) {
  Write-Host "Building the optimized NewtNode client..."
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw "NewtNode client build failed." }
}

try {
  Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3336/api/health" -TimeoutSec 1 | Out-Null
  Write-Host "NewtNode server is already running."
} catch {
  Write-Host "Starting NewtNode server..."
  Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "server") -WorkingDirectory $root -WindowStyle Minimized
}

try {
  Invoke-WebRequest -UseBasicParsing -Uri $appUrl -TimeoutSec 1 | Out-Null
  Write-Host "NewtNode client is already running."
} catch {
  Write-Host "Starting the optimized NewtNode client..."
  Start-Process -FilePath "npm.cmd" -ArgumentList @("run", "preview", "--", "--port", "5176", "--strictPort") -WorkingDirectory $root -WindowStyle Minimized
}

Write-Host "Waiting for NewtNode..."
$appReady = $false
$deadline = (Get-Date).AddSeconds(20)
while (-not $appReady -and (Get-Date) -lt $deadline) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $appUrl -TimeoutSec 1
    $appReady = $response.StatusCode -eq 200
  } catch {
    Start-Sleep -Milliseconds 250
  }
}

if (-not $appReady) {
  Write-Host "Could not start the optimized NewtNode app at $appUrl"
  Read-Host "Press Enter to close"
  exit 1
}

Write-Host "NewtNode is running at $appUrl"
Write-Host "Opening browser window..."

$browserPaths = @(
  (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
  (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
  (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe")
)

$browser = $browserPaths | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if ($browser) {
  Start-Process -FilePath $browser -ArgumentList @("--new-window", "--app=$appUrl")
} else {
  Start-Process $appUrl
}

return $appUrl
