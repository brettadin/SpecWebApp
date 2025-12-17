$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot 'apps\api'
$webDir = Join-Path $repoRoot 'apps\web'

# --- Python API ---
$venvDir = Join-Path $apiDir '.venv'
$venvPython = Join-Path $venvDir 'Scripts\python.exe'

if (-not (Test-Path $venvPython)) {
  Write-Host 'Creating Python venv for API...'
  Push-Location $apiDir
  py -m venv .venv
  & $venvPython -m pip install --upgrade pip
  & $venvPython -m pip install -r requirements-dev.txt
  Pop-Location
}

Write-Host 'Starting API (new terminal window)...'
$apiCmd = "cd '$apiDir'; .\.venv\Scripts\Activate.ps1; python -m uvicorn app.main:app --reload --port 8000"
Start-Process pwsh -ArgumentList @('-NoExit','-Command', $apiCmd)

# --- Web UI ---
if (-not (Test-Path (Join-Path $repoRoot 'node_modules'))) {
  Write-Host 'Installing Node dependencies at repo root...'
  Push-Location $repoRoot
  npm install
  Pop-Location
}

Write-Host 'Starting Web UI in current terminal...'
Push-Location $webDir
npm run dev
