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
    $bunVersion = $null
    
    # Try to run bun --version
    try {
        $bunVersion = bun --version 2>$null
        if ($bunVersion) {
            $bunInstalled = $true
        }
    } catch {}
    
    # If not found via PATH, check common installation locations
    if (-not $bunInstalled) {
        $bunPaths = @(
            "$env:USERPROFILE\scoop\shims\bun.exe",
            "$env:USERPROFILE\.bun\bin\bun.exe",
            "$env:ProgramFiles\Bun\bin\bun.exe",
            "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Oven-sh.Bun_*\bun.exe"
        )
        
        foreach ($path in $bunPaths) {
            if (Test-Path $path) {
                try {
                    $bunVersion = & $path --version 2>$null
                    if ($bunVersion) {
                        $bunInstalled = $true
                        Write-Host "  [OK] Bun v$bunVersion detected (found at: $path)" -ForegroundColor Green
                        Write-Host "  [!] Bun is installed but not in your current PATH" -ForegroundColor Yellow
                        Write-Host "  Please restart this terminal to refresh your PATH, then run:" -ForegroundColor Yellow
                        Write-Host "    .\setup.ps1" -ForegroundColor Cyan
                        Write-Host ""
                        exit 0
                    }
                } catch {}
            }
        }
    } else {
        Write-Host "  [OK] Bun v$bunVersion detected" -ForegroundColor Green
    }
    
    if (-not $bunInstalled) {
        Write-Host "  [X] Bun is not installed" -ForegroundColor Red
        Write-Host ""
        Write-Host "Bun is required to run hs-conductor." -ForegroundColor Yellow
        Write-Host ""
        
        # Detect available package managers
        $hasWinget = Get-Command winget -ErrorAction SilentlyContinue
        $hasScoop = Get-Command scoop -ErrorAction SilentlyContinue
        $hasChoco = Get-Command choco -ErrorAction SilentlyContinue
        $hasNpm = Get-Command npm -ErrorAction SilentlyContinue
        
        Write-Host "How would you like to install Bun?" -ForegroundColor White
        Write-Host ""
        
        $options = @()
        $commands = @{}
        $optionNum = 1
        
        # Add PowerShell installer (always available)
        $options += "PowerShell installer (official)"
        $commands[$optionNum] = @{
            Name = "PowerShell"
            Command = { powershell -c "irm bun.sh/install.ps1 | iex" }
        }
        Write-Host "  $optionNum. PowerShell installer" -ForegroundColor Cyan
        Write-Host "     Command: powershell -c `"irm bun.sh/install.ps1 | iex`"" -ForegroundColor DarkGray
        $optionNum++
        
        # Add package managers that are installed
        if ($hasWinget) {
            $options += "Windows Package Manager (winget)"
            $commands[$optionNum] = @{
                Name = "winget"
                Command = { winget install Oven-sh.Bun }
            }
            Write-Host "  $optionNum. Windows Package Manager (winget)" -ForegroundColor Cyan
            Write-Host "     Command: winget install Oven-sh.Bun" -ForegroundColor DarkGray
            $optionNum++
        }
        
        if ($hasScoop) {
            $options += "Scoop"
            $commands[$optionNum] = @{
                Name = "Scoop"
                Command = { scoop install bun }
            }
            Write-Host "  $optionNum. Scoop" -ForegroundColor Cyan
            Write-Host "     Command: scoop install bun" -ForegroundColor DarkGray
            $optionNum++
        }
        
        if ($hasChoco) {
            $options += "Chocolatey"
            $commands[$optionNum] = @{
                Name = "Chocolatey"
                Command = { choco install bun -y }
            }
            Write-Host "  $optionNum. Chocolatey" -ForegroundColor Cyan
            Write-Host "     Command: choco install bun -y" -ForegroundColor DarkGray
            $optionNum++
        }
        
        if ($hasNpm) {
            $options += "npm"
            $commands[$optionNum] = @{
                Name = "npm"
                Command = { npm install -g bun }
            }
            Write-Host "  $optionNum. npm" -ForegroundColor Cyan
            Write-Host "     Command: npm install -g bun" -ForegroundColor DarkGray
            $optionNum++
        }
        
        # Skip option
        $skipOption = $optionNum
        Write-Host "  $skipOption. Skip - I'll install it manually" -ForegroundColor Gray
        
        Write-Host ""
        $choice = Read-Host "Enter your choice (1-$skipOption)"
        
        if ($choice -eq $skipOption) {
            Write-Host ""
            Write-Host "Installation commands:" -ForegroundColor White
            Write-Host ""
            Write-Host "  PowerShell:     powershell -c `"irm bun.sh/install.ps1 | iex`"" -ForegroundColor Gray
            if ($hasWinget) { Write-Host "  Winget:         winget install Oven-sh.Bun" -ForegroundColor Gray }
            if ($hasScoop) { Write-Host "  Scoop:          scoop install bun" -ForegroundColor Gray }
            if ($hasChoco) { Write-Host "  Chocolatey:     choco install bun" -ForegroundColor Gray }
            if ($hasNpm) { Write-Host "  npm:            npm install -g bun" -ForegroundColor Gray }
            Write-Host "  More info:      https://bun.sh" -ForegroundColor Gray
            Write-Host ""
            Write-Host "After installing, restart your terminal and run: .\setup.ps1" -ForegroundColor Yellow
            Write-Host ""
            exit 1
        }
        
        [int]$choiceInt = 0
        if ([int]::TryParse($choice, [ref]$choiceInt) -and $commands.ContainsKey($choiceInt)) {
            $installer = $commands[$choiceInt]
            Write-Host ""
            Write-Host "Installing Bun via $($installer.Name)..." -ForegroundColor Yellow
            try {
                & $installer.Command
                Write-Host ""
                Write-Host "[OK] Bun installed successfully!" -ForegroundColor Green
                Write-Host ""
                Write-Host "Please restart this terminal for PATH changes to take effect, then run:" -ForegroundColor Yellow
                Write-Host "  .\setup.ps1" -ForegroundColor Cyan
                Write-Host ""
                exit 0
            } catch {
                Write-Host ""
                Write-Host "[X] Installation failed: $_" -ForegroundColor Red
                Write-Host "Please try a different method or install manually from: https://bun.sh" -ForegroundColor Yellow
                Write-Host ""
                exit 1
            }
        } else {
            Write-Host ""
            Write-Host "[X] Invalid choice. Please run setup again and choose a valid option." -ForegroundColor Red
            Write-Host ""
            exit 1
        }
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
