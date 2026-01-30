#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Updates the HemSoft Conductor Server background task
    
.DESCRIPTION
    Restarts the monitoring task to pick up any changes.
    
    Code changes in src/ are auto-reloaded by Bun's --watch mode,
    but if you change the monitoring script itself, run this.
    
    REQUIRES ADMIN PRIVILEGES
    
.EXAMPLE
    ./update-service.ps1
#>

param(
    [switch]$Help
)

if ($Help) {
    Get-Help $MyInvocation.MyCommand.Path -Detailed
    exit 0
}

$ErrorActionPreference = "Stop"

# Check for admin privileges
$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($currentUser)

if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "[ERR] This script requires administrator privileges" -ForegroundColor Red
    Write-Host "Please run PowerShell as Administrator and try again" -ForegroundColor Yellow
    exit 1
}

# Colors
$InfoColor = "Cyan"
$SuccessColor = "Green"
$WarningColor = "Yellow"

function Write-Info { Write-Host "[INFO]" -ForegroundColor $InfoColor -NoNewline; Write-Host " $args" }
function Write-Success { Write-Host "[OK]" -ForegroundColor $SuccessColor -NoNewline; Write-Host " $args" }
function Write-Warning-Custom { Write-Host "[!]" -ForegroundColor $WarningColor -NoNewline; Write-Host " $args" }

$taskName = "HemSoft-Conductor-Server"

Write-Info "Updating HemSoft Conductor Server task..."
Write-Host ""

# Check if task exists
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $task) {
    Write-Warning-Custom "Task '$taskName' not found. Run ./setup-service.ps1 to create it."
    exit 1
}

Write-Info "Current task state: $($task.State)"

# Stop the task
Write-Info "Stopping task..."
Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
Start-Sleep -Seconds 2

# Kill any lingering processes on the monitored ports
Write-Info "Cleaning up processes on ports 2900, 2901..."
$portsToCheck = @(2900, 2901)
foreach ($port in $portsToCheck) {
    $connections = netstat -ano | Select-String ":$port.*LISTENING"
    if ($connections) {
        $connections | ForEach-Object {
            $procId = ($_ -split '\s+')[-1]
            if ($procId -match '^\d+$') {
                try { 
                    Stop-Process -Id ([int]$procId) -Force -ErrorAction SilentlyContinue 
                    Write-Info "Stopped process $procId on port $port"
                } catch {}
            }
        }
    }
}
Start-Sleep -Seconds 1

# Start the task again
Write-Info "Starting task..."
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 2

# Verify it's running
$updatedTask = Get-ScheduledTask -TaskName $taskName
Write-Success "Task restarted - State: $($updatedTask.State)"

Write-Host ""
Write-Host "Update complete!" -ForegroundColor Green
Write-Host ""
Write-Warning-Custom "The backend services will restart within 60 seconds (next monitoring cycle)"
Write-Info "Check logs: c:\Users\User\.claude\skills\logs\hs-conductor\"
