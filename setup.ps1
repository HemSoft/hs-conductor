# hs-conductor Setup Script
# Initializes the repository for first-time use

param(
    [switch]$SkipWorkloads,
    [switch]$SkipDependencies
)

$ErrorActionPreference = "Stop"

Write-Host "" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  hs-conductor Setup" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Check Bun installation
if (-not $SkipDependencies) {
    Write-Host "[1/4] Checking Bun..." -ForegroundColor Yellow
    $bunInstalled = $false
    try {
        $bunVersion = bun --version 2>$null
        if ($bunVersion) {
            Write-Host "  [OK] Bun v$bunVersion detected" -ForegroundColor Green
            $bunInstalled = $true
        }
    } catch {}
    
    if (-not $bunInstalled) {
        Write-Host "  [X] Bun is not installed" -ForegroundColor Red
        Write-Host ""
        Write-Host "Bun is required to run hs-conductor." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Installation options:" -ForegroundColor White
        Write-Host ""
        Write-Host "  Option 1: Using PowerShell (recommended)" -ForegroundColor Cyan
        Write-Host "    powershell -c `"irm bun.sh/install.ps1 | iex`"" -ForegroundColor Gray
        Write-Host ""
        Write-Host "  Option 2: Using Windows Package Manager" -ForegroundColor Cyan
        Write-Host "    winget install Oven-sh.Bun" -ForegroundColor Gray
        Write-Host ""
        Write-Host "After installing, restart this terminal and run setup again:" -ForegroundColor Yellow
        Write-Host "    .\setup.ps1" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "More info: https://bun.sh" -ForegroundColor DarkGray
        Write-Host ""
        exit 1
    }

    # Install dependencies
    Write-Host "[2/4] Installing dependencies..." -ForegroundColor Yellow
    bun install
    Write-Host "  [OK] Dependencies installed" -ForegroundColor Green
} else {
    Write-Host "[1-2/4] Skipping dependency check..." -ForegroundColor Gray
}

# Copy demo workloads
if (-not $SkipWorkloads) {
    Write-Host "[3/4] Setting up workloads..." -ForegroundColor Yellow
    
    # Create workloads directory if it doesn't exist
    if (-not (Test-Path "workloads")) {
        New-Item -ItemType Directory -Path "workloads\ad-hoc", "workloads\tasks", "workloads\workflows" -Force | Out-Null
    }

    # Check if workloads are already populated
    $existingWorkloads = Get-ChildItem -Path "workloads" -Recurse -Filter "*.yaml" -ErrorAction SilentlyContinue
    
    if ($existingWorkloads.Count -gt 0) {
        Write-Host "  [!] Workloads already exist" -ForegroundColor Yellow
        $response = Read-Host "  Overwrite with demo examples? (y/N)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Host "  [OK] Keeping existing workloads" -ForegroundColor Green
        } else {
            Copy-Item -Recurse -Path "workloads-demo\*" -Destination "workloads\" -Force
            Write-Host "  [OK] Demo workloads copied to workloads/" -ForegroundColor Green
        }
    } else {
        Copy-Item -Recurse -Path "workloads-demo\*" -Destination "workloads\" -Force
        Write-Host "  [OK] Demo workloads copied to workloads/" -ForegroundColor Green
    }
} else {
    Write-Host "[3/4] Skipping workload setup..." -ForegroundColor Gray
}

# Check .env file
Write-Host "[4/4] Checking environment..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "  [OK] Created .env from .env.example" -ForegroundColor Green
        Write-Host "  [!] Please edit .env and add your configuration" -ForegroundColor Yellow
    } else {
        Write-Host "  [!] No .env.example found" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [OK] .env already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "What was done:" -ForegroundColor White
Write-Host "  [OK] Bun dependencies installed" -ForegroundColor Green
Write-Host "  [OK] Demo workloads copied to workloads/" -ForegroundColor Green
Write-Host "  [OK] Environment file created (.env)" -ForegroundColor Green
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Ready to Run!" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "For local development, the default .env works out of the box." -ForegroundColor Gray
Write-Host "(Only edit .env if deploying to production with Inngest Cloud)" -ForegroundColor DarkGray
Write-Host ""
Write-Host "Choose how to run Conductor:" -ForegroundColor White
Write-Host ""
Write-Host "  Option A - Manual (for development):" -ForegroundColor Yellow
Write-Host "    .\run.ps1" -ForegroundColor Cyan
Write-Host "    Runs in foreground. Press Ctrl+C to stop." -ForegroundColor Gray
Write-Host ""
Write-Host "  Option B - Background Service (for 24/7 operation):" -ForegroundColor Yellow
Write-Host "    .\setup-service.ps1" -ForegroundColor Cyan
Write-Host "    Requires Administrator. Starts automatically with Windows." -ForegroundColor Gray
Write-Host "    To remove later: .\uninstall-service.ps1" -ForegroundColor Gray
Write-Host ""
Write-Host "============================================" -ForegroundColor Gray
Write-Host "  Documentation" -ForegroundColor Gray
Write-Host "============================================" -ForegroundColor Gray
Write-Host "  README.md              - Getting started" -ForegroundColor DarkGray
Write-Host "  docs/ADDING-WORKLOADS.md - Create your own workloads" -ForegroundColor DarkGray
Write-Host "  workloads-demo/        - Example workloads" -ForegroundColor DarkGray
Write-Host ""
