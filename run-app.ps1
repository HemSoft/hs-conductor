#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts hs-conductor admin app

.DESCRIPTION
    Launches the admin UI on port 5173

.EXAMPLE
    ./run-app.ps1
#>

param(
    [switch]$Help
)

if ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
    exit 0
}

$ErrorActionPreference = "Stop"

# Colors
$InfoColor = "Cyan"
$SuccessColor = "Green"
$ErrorColor = "Red"
$WarningColor = "Yellow"

function Write-Info { Write-Host "[INFO]" -ForegroundColor $InfoColor -NoNewline; Write-Host " $args" }
function Write-Success { Write-Host "[OK]" -ForegroundColor $SuccessColor -NoNewline; Write-Host " $args" }
function Write-Error-Custom { Write-Host "[ERR]" -ForegroundColor $ErrorColor -NoNewline; Write-Host " $args" }
function Write-Warning-Custom { Write-Host "[!]" -ForegroundColor $WarningColor -NoNewline; Write-Host " $args" }

Write-Info "Starting hs-conductor admin app..."
Write-Host ""

# Check if backend server is running
Write-Info "Checking if backend server is running on port 2900..."
if (-not (netstat -ano 2>$null | Select-String ":2900.*LISTENING")) {
    Write-Error-Custom "Backend server is not running on port 2900"
    Write-Host ""
    Write-Host "The admin app requires the backend server to be running." -ForegroundColor Yellow
    Write-Host "You have two options:" -ForegroundColor Yellow
    Write-Host "  1. Run: ./run-server.ps1" -ForegroundColor Yellow
    Write-Host "  2. Or if set up as a service, verify it's running: Get-Service HemSoft-Conductor-Server" -ForegroundColor Yellow
    exit 1
}
Write-Success "Backend server is running"
Write-Host ""

# Check if Bun is installed
$bunExe = "bun"  # Default to 'bun' if found in PATH
$bunFound = $false

if (Get-Command bun -ErrorAction SilentlyContinue) {
    $bunFound = $true
} else {
    # Check common installation locations
    $bunPaths = @(
        "$env:USERPROFILE\scoop\shims\bun.exe",
        "$env:USERPROFILE\.bun\bin\bun.exe",
        "$env:ProgramFiles\Bun\bin\bun.exe"
    )
    
    foreach ($path in $bunPaths) {
        if (Test-Path $path) {
            $bunExe = $path
            $bunFound = $true
            break
        }
    }
}

if (-not $bunFound) {
    Write-Error-Custom "Bun is not installed or not found"
    Write-Host "Please run .\setup.ps1 first" -ForegroundColor Yellow
    exit 1
}

$bunVersion = & $bunExe --version 2>$null
Write-Success "Bun detected: v$bunVersion"

# Save current directory
$rootDir = (Get-Location).Path
$adminDir = Join-Path $rootDir "admin"

# Verify directories exist
if (-not (Test-Path $adminDir)) {
    Write-Error-Custom "Admin directory not found: $adminDir"
    exit 1
}

# Kill any existing processes on our port
Write-Info "Cleaning up any existing processes..."
$port = 5173
$connections = netstat -ano | Select-String ":$port.*LISTENING"
if ($connections) {
    $connections | ForEach-Object {
        $procId = ($_ -split '\s+')[-1]
        if ($procId -match '^\d+$') {
            try { Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue } catch {}
        }
    }
}
Start-Sleep -Milliseconds 500

# Start admin app
Write-Info "Starting admin app on port 5173..."
$adminProc = Start-Process -FilePath $bunExe -ArgumentList "run", "dev" -WorkingDirectory $adminDir -PassThru -NoNewWindow

Write-Success "Admin app started"
Write-Host ""
Write-Host "  Admin:     http://localhost:5173" -ForegroundColor $InfoColor
Write-Host ""
Write-Warning-Custom "Press Ctrl+C to stop"
Write-Host ""

# Keep running until Ctrl+C
try {
    while ($true) {
        if ($adminProc.HasExited) {
            if ($adminProc.ExitCode -ne 0) {
                Write-Error-Custom "Admin app exited with code $($adminProc.ExitCode)"
            }
            break
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host ""
    Write-Info "Stopping admin app..."
    
    if (-not $adminProc.HasExited) {
        Stop-Process -Id $adminProc.Id -Force -ErrorAction SilentlyContinue
    }
    
    # Force kill any remaining processes on our port
    $connections = netstat -ano | Select-String ":$port.*LISTENING"
    if ($connections) {
        $connections | ForEach-Object {
            $procId = ($_ -split '\s+')[-1]
            if ($procId -match '^\d+$') {
                try { Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue } catch {}
            }
        }
    }
    
    Write-Success "Admin app stopped"
}
