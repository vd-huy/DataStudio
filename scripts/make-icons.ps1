# Renders src/assets/logo.svg into the app icons (src-tauri/icons/icon.png and icon.ico) with the Tauri CLI.
$ErrorActionPreference = 'Stop'

$root = Join-Path $PSScriptRoot '..'
$iconDir = Join-Path $root 'src-tauri\icons'
$temp = Join-Path ([System.IO.Path]::GetTempPath()) "datastudio-icons-$PID"

Push-Location $root
try {
    npx tauri icon src/assets/logo.svg -o $temp 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "tauri icon failed" }
    New-Item -ItemType Directory -Force $iconDir | Out-Null
    Copy-Item (Join-Path $temp 'icon.png'), (Join-Path $temp 'icon.ico') $iconDir -Force
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $temp -ErrorAction SilentlyContinue
}
Write-Output "Icons written to $iconDir"
