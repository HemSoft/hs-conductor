#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts hs-conductor backend: Inngest Dev + Server

.DESCRIPTION
    Launches the backend services:
    - Backend server (port 2900)
    - Inngest dev server (port 2901) - auto-discovers and syncs functions

.PARAMETER NoInngest
    Skip starting Inngest dev server (use if already running)

.EXAMPLE
    ./run-server.ps1
    ./run-server.ps1 -NoInngest
#>

param(
    [switch]$NoInngest,
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

Write-Info "Starting hs-conductor server..."
Write-Host ""

# Check if Bun is installed
if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
    Write-Error-Custom "Bun is not installed or not in PATH"
    exit 1
}
$bunVersion = & bun --version 2>$null
Write-Success "Bun detected: v$bunVersion"

# Save current directory
$rootDir = (Get-Location).Path

# Kill any existing processes on our ports
Write-Info "Cleaning up any existing processes..."
$portsToCheck = @(2900, 2901)
foreach ($port in $portsToCheck) {
    $connections = netstat -ano | Select-String ":$port.*LISTENING"
    if ($connections) {
        $connections | ForEach-Object {
            $procId = ($_ -split '\s+')[-1]
            if ($procId -match '^\d+$') {
                try { Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue } catch {}
            }
        }
    }
}
Start-Sleep -Milliseconds 500

# Track processes for cleanup
$processes = @()

# Start backend server
Write-Info "Starting backend server on port 2900..."
$serverProc = Start-Process -FilePath "bun" -ArgumentList "run", "--watch", "src/index.ts" -WorkingDirectory $rootDir -PassThru -NoNewWindow
$processes += $serverProc

# Wait for server to be ready
Write-Info "Waiting for backend server to be ready..."
$maxWait = 30
$waited = 0
while ($waited -lt $maxWait) {
    if (netstat -ano | Select-String ":2900.*LISTENING") { break }
    Start-Sleep -Milliseconds 500
    $waited++
}

if (-not (netstat -ano | Select-String ":2900.*LISTENING")) {
    Write-Error-Custom "Backend server failed to start"
    $processes | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
    exit 1
}
Write-Success "Backend server ready on port 2900"

# Start Inngest
if (-not $NoInngest) {
    Write-Info "Starting Inngest dev server on port 2901..."
    $inngestProc = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "npx inngest-cli@latest dev --port 2901 --host 127.0.0.1 -u http://localhost:2900/api/inngest --no-discovery" -WorkingDirectory $rootDir -PassThru -NoNewWindow
    $processes += $inngestProc
    Start-Sleep -Seconds 2
    Write-Success "Inngest dev server started"
} else {
    Write-Info "Skipping Inngest (--NoInngest flag)"
}

Write-Success "Server services started"
Write-Host ""
Write-Host "  Server:    http://localhost:2900" -ForegroundColor $InfoColor
if (-not $NoInngest) {
    Write-Host "  Inngest:   http://localhost:2901" -ForegroundColor $InfoColor
}
Write-Host ""
Write-Warning-Custom "Press Ctrl+C to stop all services"
Write-Host ""

# Keep running until Ctrl+C
try {
    while ($true) {
        # Check if any process has exited unexpectedly
        $stillRunning = @()
        foreach ($proc in $processes) {
            if ($proc.HasExited) {
                if ($proc.ExitCode -ne 0) {
                    Write-Error-Custom "Process $($proc.Id) exited with code $($proc.ExitCode)"
                }
                # A critical process exited - break out of loop
                break
            } else {
                $stillRunning += $proc
            }
        }
        # If any process exited, stop everything
        if ($stillRunning.Count -ne $processes.Count) {
            break
        }
        Start-Sleep -Seconds 1
    }
}
finally {
    Write-Host ""
    Write-Info "Stopping services..."
    
    # Stop all processes
    foreach ($proc in $processes) {
        if (-not $proc.HasExited) {
            Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Force kill any remaining processes on our ports
    foreach ($port in $portsToCheck) {
        $connections = netstat -ano | Select-String ":$port.*LISTENING"
        if ($connections) {
            $connections | ForEach-Object {
                $procId = ($_ -split '\s+')[-1]
                if ($procId -match '^\d+$') {
                    try { Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue } catch {}
                }
            }
        }
    }
    
    Write-Success "All services stopped"
}
