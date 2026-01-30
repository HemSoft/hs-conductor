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
    try {
        $bunVersion = bun --version 2>$null
        Write-Host "  ✓ Bun v$bunVersion detected" -ForegroundColor Green
    } catch {
        Write-Host "  ✗ Bun not found!" -ForegroundColor Red
        Write-Host "  Install from: https://bun.sh" -ForegroundColor Yellow
        exit 1
    }

    # Install dependencies
    Write-Host "[2/4] Installing dependencies..." -ForegroundColor Yellow
    bun install
    Write-Host "  ✓ Dependencies installed" -ForegroundColor Green
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
        Write-Host "  ! Workloads already exist" -ForegroundColor Yellow
        $response = Read-Host "  Overwrite with demo examples? (y/N)"
        if ($response -ne 'y' -and $response -ne 'Y') {
            Write-Host "  ✓ Keeping existing workloads" -ForegroundColor Green
        } else {
            Copy-Item -Recurse -Path "workloads-demo\*" -Destination "workloads\" -Force
            Write-Host "  ✓ Demo workloads copied to workloads/" -ForegroundColor Green
        }
    } else {
        Copy-Item -Recurse -Path "workloads-demo\*" -Destination "workloads\" -Force
        Write-Host "  ✓ Demo workloads copied to workloads/" -ForegroundColor Green
    }
} else {
    Write-Host "[3/4] Skipping workload setup..." -ForegroundColor Gray
}

# Check .env file
Write-Host "[4/4] Checking environment..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "  ✓ Created .env from .env.example" -ForegroundColor Green
        Write-Host "  ! Please edit .env and add your configuration" -ForegroundColor Yellow
    } else {
        Write-Host "  ! No .env.example found" -ForegroundColor Yellow
    }
} else {
    Write-Host "  ✓ .env already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Setup Complete!" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Edit .env and configure your environment" -ForegroundColor Gray
Write-Host "  2. Start Docker: docker compose up -d" -ForegroundColor Gray
Write-Host "  3. Run: .\run.ps1" -ForegroundColor Gray
Write-Host "  4. Try example: bun run dev (then in another terminal: conductor run joke)" -ForegroundColor Gray
Write-Host ""
Write-Host "Documentation:" -ForegroundColor White
Write-Host "  - README.md - Getting started guide" -ForegroundColor Gray
Write-Host "  - workloads-demo/README.md - Example workloads" -ForegroundColor Gray
Write-Host "  - docs/EXAMPLES.md - Detailed examples" -ForegroundColor Gray
Write-Host ""
