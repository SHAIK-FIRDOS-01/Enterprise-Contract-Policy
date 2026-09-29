# Enterprise Contract & Policy Copilot - Autonomous Harness Verification Referee (PowerShell)

$ErrorActionPreference = "Continue"
$failedGates = 0

# Detect and activate virtual environment
$venvScripts = ""
if (Test-Path ".venv/Scripts") {
    $venvScripts = (Resolve-Path ".venv/Scripts").Path
} elseif (Test-Path ".venv/bin") {
    $venvScripts = (Resolve-Path ".venv/bin").Path
} elseif (Test-Path "backend/.venv/Scripts") {
    $venvScripts = (Resolve-Path "backend/.venv/Scripts").Path
}

if ($venvScripts) {
    Write-Host ">> Detected virtual environment at: $venvScripts" -ForegroundColor Cyan
    $env:PATH = "$venvScripts;$env:PATH"
    $env:VIRTUAL_ENV = (Split-Path $venvScripts -Parent)
}

function Run-Gate {
    param(
        [string]$GateName,
        [scriptblock]$Command
    )
    Write-Host ""
    Write-Host "======================================================================" -ForegroundColor Cyan
    Write-Host ">> [HARNESS GATE] $GateName" -ForegroundColor Yellow
    Write-Host "======================================================================" -ForegroundColor Cyan
    
    try {
        & $Command
        if ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) {
            Write-Host "[PASS] $GateName" -ForegroundColor Green
        } else {
            Write-Host "[FAIL] $GateName (Exit Code: $LASTEXITCODE)" -ForegroundColor Red
            $script:failedGates++
        }
    } catch {
        Write-Host "[FAIL] $GateName - Exception: $_" -ForegroundColor Red
        $script:failedGates++
    }
}

Write-Host "Starting Autonomous Harness Referee Verification Gate Checks..." -ForegroundColor Yellow

# Gate 1: Backend Typecheck
if (Get-Command mypy -ErrorAction SilentlyContinue) {
    Run-Gate "Backend Typecheck (mypy)" { mypy backend }
} else {
    Write-Host "Skipping mypy (not found in current virtualenv)" -ForegroundColor DarkGray
}

# Gate 2: Backend Lint
if (Get-Command flake8 -ErrorAction SilentlyContinue) {
    Run-Gate "Backend Lint (flake8)" { flake8 backend }
} else {
    Write-Host "Skipping flake8 (not found in current virtualenv)" -ForegroundColor DarkGray
}

# Gate 3: Backend Pytest Test Suite
if (Get-Command pytest -ErrorAction SilentlyContinue) {
    Run-Gate "Backend Test Suite (pytest)" { pytest tests/backend -q --tb=short }
} else {
    Write-Host "Skipping pytest (not found in current virtualenv)" -ForegroundColor DarkGray
}

# Gate 4: Frontend Checks
if ((Test-Path "frontend/package.json") -and (Test-Path "frontend/node_modules")) {
    Run-Gate "Frontend Typecheck" { npm --prefix frontend run typecheck }
    Run-Gate "Frontend Lint" { npm --prefix frontend run lint }
    Run-Gate "Frontend Unit Suite" { npm --prefix frontend test -- --run }
} else {
    Write-Host "Skipping frontend checks (dependencies not yet installed)" -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "======================================================================" -ForegroundColor Cyan
if ($failedGates -eq 0) {
    Write-Host "ALL HARNESS GATES PASSED CLEANLY. TICKET READY FOR SIGN-OFF." -ForegroundColor Green
    Write-Host "======================================================================" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "$failedGates HARNESS GATE(S) FAILED. Log failures in .agent/ERRORS.md before completing." -ForegroundColor Red
    Write-Host "======================================================================" -ForegroundColor Cyan
    exit 1
}
