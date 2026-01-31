#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Uninstalls the HemSoft Conductor Server background task
    
.DESCRIPTION
    Stops and removes the Windows Scheduled Task that runs Conductor 
    in the background. This does NOT remove the application files.
    
    REQUIRES ADMIN PRIVILEGES
    
.EXAMPLE
    ./uninstall-service.ps1
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
    Write-Host ""
    Write-Host "[ERR] This script requires administrator privileges" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please run PowerShell as Administrator and try again:" -ForegroundColor Yellow
    Write-Host "  1. Right-click on PowerShell or Windows Terminal" -ForegroundColor Gray
    Write-Host "  2. Select 'Run as administrator'" -ForegroundColor Gray
    Write-Host "  3. Navigate to this folder and run: .\uninstall-service.ps1" -ForegroundColor Gray
    Write-Host ""
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

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Uninstall HemSoft Conductor Service" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if task exists
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if (-not $task) {
    Write-Warning-Custom "Task '$taskName' not found - nothing to uninstall"
    Write-Host ""
    Write-Host "The background service was not installed or has already been removed." -ForegroundColor Gray
    Write-Host ""
    exit 0
}

Write-Info "Found task: $taskName (State: $($task.State))"

# Confirm with user
Write-Host ""
$response = Read-Host "Are you sure you want to remove the background service? (y/N)"
if ($response -ne 'y' -and $response -ne 'Y') {
    Write-Host ""
    Write-Host "Uninstall cancelled." -ForegroundColor Gray
    exit 0
}

Write-Host ""

# Stop the task if running
if ($task.State -eq 'Running') {
    Write-Info "Stopping task..."
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    Start-Sleep -Seconds 2
}

# Kill any processes on the monitored ports
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
                } catch {}
            }
        }
    }
}
Start-Sleep -Seconds 1

# Remove the task
Write-Info "Removing scheduled task..."
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null

Write-Host ""
Write-Success "Background service removed successfully"
Write-Host ""
Write-Host "What was removed:" -ForegroundColor White
Write-Host "  - Windows Scheduled Task: $taskName" -ForegroundColor Gray
Write-Host "  - Auto-start on Windows boot" -ForegroundColor Gray
Write-Host ""
Write-Host "What was NOT removed:" -ForegroundColor White
Write-Host "  - Application files (this folder)" -ForegroundColor Gray
Write-Host "  - Your workloads and data" -ForegroundColor Gray
Write-Host "  - Log files in ~/.claude/skills/logs/hs-conductor/" -ForegroundColor Gray
Write-Host ""
Write-Host "You can still run Conductor manually anytime with: .\run.ps1" -ForegroundColor Cyan
Write-Host ""
