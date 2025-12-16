$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$apiDir = Join-Path $repoRoot 'apps\api'
$apiVenvPython = Join-Path $apiDir '.venv\Scripts\python.exe'

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Host $Label
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "Command failed ($Label) with exit code $LASTEXITCODE"
  }
}

# --- API quality gates ---
if (-not (Test-Path $apiVenvPython)) {
  Write-Host 'Creating Python venv for API...'
  Push-Location $apiDir
  py -m venv .venv
  & $apiVenvPython -m pip install --upgrade pip
  & $apiVenvPython -m pip install -r requirements-dev.txt
  Pop-Location
}

Push-Location $apiDir
Invoke-Checked -Label 'Running API ruff format (check)...' -Command { & $apiVenvPython -m ruff format --check . }
Invoke-Checked -Label 'Running API ruff lint...' -Command { & $apiVenvPython -m ruff check . }
Invoke-Checked -Label 'Running API pytest...' -Command { & $apiVenvPython -m pytest }

Invoke-Checked -Label 'Exporting OpenAPI snapshot...' -Command { & $apiVenvPython scripts\export_openapi.py }
Pop-Location

# --- Web quality gates ---
Push-Location $repoRoot
Invoke-Checked -Label 'Installing Node deps...' -Command { npm install }
Invoke-Checked -Label 'Running Web lint...' -Command { npm --workspace apps/web run lint }
Invoke-Checked -Label 'Running Web tests...' -Command { npm --workspace apps/web run test }

Invoke-Checked -Label 'Generating api-client types...' -Command { npm --workspace packages/api-client run gen }
Pop-Location

Write-Host 'VERIFY complete.'
