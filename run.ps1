#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Starts hs-cli-conductor: Inngest Dev + Server + Admin app

.DESCRIPTION
    Launches the full stack:
    - Inngest dev server (port 2901) - auto-discovers and syncs functions
    - Backend server (port 2900)
    - Admin app (port 5173)

.PARAMETER NoInngest
    Skip starting Inngest dev server (use if already running)

.EXAMPLE
    ./run.ps1
    ./run.ps1 -NoInngest
#>

param(
    [switch]$NoInngest,
    [switch]$Help
)

if ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
    exit 0
}

# Set UTF-8 encoding for proper character handling
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'

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

Write-Info "Starting hs-conductor..."
Write-Host ""

# Check if Bun is installed
try {
    $bunVersion = bun --version 2>$null
    Write-Success "Bun detected: v$bunVersion"
} catch {
    Write-Error-Custom "Bun is not installed or not in PATH"
    exit 1
}

# Save current directory
$rootDir = Get-Location
$adminDir = Join-Path $rootDir "admin"

# Verify directories exist
if (-not (Test-Path $adminDir)) {
    Write-Error-Custom "Admin directory not found: $adminDir"
    exit 1
}

# Kill any existing processes on our ports
Write-Info "Cleaning up any existing processes..."
$bunProcesses = Get-Process | Where-Object { $_.ProcessName -match "bun|node" }
if ($bunProcesses) {
    $bunProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

# Start Inngest dev server (auto-discovers and syncs functions)
$inngestJob = $null
if (-not $NoInngest) {
    Write-Info "Starting Inngest dev server on port 2901..."
    $inngestJob = Start-Job -ScriptBlock {
        # Inngest dev server auto-discovers apps on localhost
        # -u points to our app's Inngest endpoint
        npx inngest-cli@latest dev --port 2901 -u http://localhost:2900/api/inngest --no-discovery 2>&1
    } -Name "conductor-inngest"
    
    # Give Inngest a moment to start
    Start-Sleep -Seconds 2
    Write-Success "Inngest dev server starting"
} else {
    Write-Info "Skipping Inngest (--NoInngest flag)"
}

Write-Info "Starting backend server on port 2900..."
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:rootDir
    & bun run dev 2>&1
} -Name "conductor-server"

# Wait for server to be ready before Inngest can sync
Start-Sleep -Seconds 2

Write-Info "Starting admin app on port 5173..."
$adminJob = Start-Job -ScriptBlock {
    Set-Location $using:adminDir
    & bun run dev 2>&1
} -Name "conductor-admin"

Write-Success "All services started"
Write-Host ""
Write-Host "  Server:    http://localhost:2900" -ForegroundColor $InfoColor
Write-Host "  Admin:     http://localhost:5173" -ForegroundColor $InfoColor
Write-Host "  Inngest:   http://localhost:2901" -ForegroundColor $InfoColor
Write-Host ""
Write-Warning-Custom "Press Ctrl+C to stop all services"
Write-Host ""

# Build jobs list
$jobs = @($serverJob, $adminJob)
if ($inngestJob) { $jobs = @($inngestJob) + $jobs }

try {
    while ($true) {
        foreach ($job in $jobs) {
            $output = Receive-Job -Job $job
            if ($output) {
                $jobName = switch ($job.Name) {
                    "conductor-server" { "SERVER" }
                    "conductor-admin" { "ADMIN" }
                    "conductor-inngest" { "INNGEST" }
                    default { "UNKNOWN" }
                }
                $jobColor = switch ($job.Name) {
                    "conductor-server" { "Blue" }
                    "conductor-admin" { "Magenta" }
                    "conductor-inngest" { "Yellow" }
                    default { "Gray" }
                }
                
                $output | ForEach-Object {
                    Write-Host "[$jobName]" -ForegroundColor $jobColor -NoNewline
                    Write-Host " $_"
                }
            }

            # Check if job has errors
            if ($job.State -eq "Failed") {
                $jobError = $job.ChildJobs[0].Error
                Write-Error-Custom "$($job.Name) failed: $jobError"
            }
        }

        Start-Sleep -Milliseconds 100
    }
}
catch [System.Management.Automation.PipelineStoppedException] {
    # User pressed Ctrl+C
    Write-Host ""
    Write-Info "Stopping services..."
}
finally {
    if ($inngestJob) {
        Write-Info "Stopping Inngest..."
        Stop-Job -Job $inngestJob -ErrorAction SilentlyContinue
        Remove-Job -Job $inngestJob -ErrorAction SilentlyContinue
    }
    
    Write-Info "Stopping server..."
    Stop-Job -Job $serverJob -ErrorAction SilentlyContinue
    Remove-Job -Job $serverJob -ErrorAction SilentlyContinue
    
    Write-Info "Stopping admin app..."
    Stop-Job -Job $adminJob -ErrorAction SilentlyContinue
    Remove-Job -Job $adminJob -ErrorAction SilentlyContinue
    
    # Force kill any remaining processes
    Write-Info "Cleaning up remaining processes..."
    Get-Process | Where-Object { $_.ProcessName -match "bun|node" } | Stop-Process -Force -ErrorAction SilentlyContinue
    
    Write-Success "All services stopped"
}
