param([switch]$Check)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

$candidates = @()
$available = Get-Command node.exe -ErrorAction SilentlyContinue
if ($available) { $candidates += $available.Source }
$candidates += Join-Path $env:ProgramFiles 'nodejs\node.exe'
$candidates += Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'

# The desktop app has a runtime even when Node.js is absent from Windows PATH.
$savedPath = Join-Path $PSScriptRoot '.node-runtime'
if (Test-Path -LiteralPath $savedPath) {
    $candidates += (Get-Content -LiteralPath $savedPath -Raw).Trim()
}
$runtime = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $runtime) {
    $packages = @(Get-AppxPackage -Name '*Codex*' -ErrorAction SilentlyContinue)
    foreach ($package in $packages) {
        $candidate = Join-Path $package.InstallLocation 'dependencies\node\bin\node.exe'
        if (Test-Path -LiteralPath $candidate) { $runtime = $candidate; break }
    }
}
if (-not $runtime) {
    Write-Host 'Node.js was not found. Install Node.js LTS from https://nodejs.org and try again.' -ForegroundColor Yellow
    exit 1
}
if ($Check) {
    & $runtime --version
    & $runtime --check (Join-Path $PSScriptRoot 'server.mjs')
    exit $LASTEXITCODE
}
Write-Host 'Starting Sanguosha: http://localhost:3000' -ForegroundColor Green
Write-Host 'Keep this window open while playing. Use quit in the host menu to stop.'
& $runtime (Join-Path $PSScriptRoot 'server.mjs') --tui
exit $LASTEXITCODE
