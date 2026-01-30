#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Sets up the HemSoft Conductor Server background task
    
.DESCRIPTION
    Creates a Windows Scheduled Task that auto-starts on system boot
    and monitors the backend services 24/7.
    
    REQUIRES ADMIN PRIVILEGES
    
.EXAMPLE
    ./setup-service.ps1
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
$ErrorColor = "Red"
$WarningColor = "Yellow"

function Write-Info { Write-Host "[INFO]" -ForegroundColor $InfoColor -NoNewline; Write-Host " $args" }
function Write-Success { Write-Host "[OK]" -ForegroundColor $SuccessColor -NoNewline; Write-Host " $args" }
function Write-Error-Custom { Write-Host "[ERR]" -ForegroundColor $ErrorColor -NoNewline; Write-Host " $args" }
function Write-Warning-Custom { Write-Host "[!]" -ForegroundColor $WarningColor -NoNewline; Write-Host " $args" }

Write-Info "Setting up HemSoft Conductor Server Background Task"
Write-Host ""

# Configuration
$taskName = "HemSoft-Conductor-Server"
$description = "Monitors and maintains hs-conductor backend services (Backend Server + Inngest) for continuous scheduled task execution"
$scriptPath = "c:\Users\User\.claude\skills\windows-service\scripts\hs-conductor-service-worker.ps1"
$workingDir = "d:\github\HemSoft\hs-conductor"

# Verify script exists
if (-not (Test-Path $scriptPath)) {
    Write-Error-Custom "Worker script not found at: $scriptPath"
    exit 1
}

Write-Info "Task Configuration:"
Write-Host "  Name: $taskName" -ForegroundColor Gray
Write-Host "  Description: $description" -ForegroundColor Gray
Write-Host "  Script: $scriptPath" -ForegroundColor Gray
Write-Host "  Working Dir: $workingDir" -ForegroundColor Gray
Write-Host ""

# Remove existing task if it exists
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Warning-Custom "Task '$taskName' already exists"
    Write-Info "Stopping and removing existing task..."
    
    Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue | Out-Null
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
    Start-Sleep -Seconds 1
}

Write-Info "Creating Scheduled Task..."

# Create task action
$action = New-ScheduledTaskAction `
    -Execute "pwsh.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" `
    -WorkingDirectory $workingDir

# Create trigger - at system startup
$trigger = New-ScheduledTaskTrigger -AtStartup

# Create settings
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable:$false `
    -DontStopOnIdleEnd `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 365)

# Create principal (run whether user is logged on or not, with highest privileges)
$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType S4U `
    -RunLevel Highest

# Register the task
try {
    $task = Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description $description `
        -ErrorAction Stop
    
    Write-Success "Task '$taskName' created successfully"
    Write-Host ""
    
    # Start the task immediately
    Write-Info "Starting task..."
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Seconds 2
    
    # Verify it's running
    $taskInfo = Get-ScheduledTask -TaskName $taskName
    Write-Success "Task started - State: $($taskInfo.State)"
    Write-Host ""
    Write-Host "The HemSoft Conductor Server is now running in the background." -ForegroundColor Green
    Write-Host "It will:" -ForegroundColor Green
    Write-Host "  ✓ Start automatically when Windows boots" -ForegroundColor Green
    Write-Host "  ✓ Monitor backend services every 60 seconds" -ForegroundColor Green
    Write-Host "  ✓ Auto-restart services if they crash" -ForegroundColor Green
    Write-Host "  ✓ Auto-restart itself if it crashes (3 attempts, 1 min interval)" -ForegroundColor Green
    Write-Host "  ✓ Log all events to ~/.claude/skills/logs/hs-conductor/" -ForegroundColor Green
    Write-Host ""
    Write-Warning-Custom "To stop the task, run: Stop-ScheduledTask -TaskName HemSoft-Conductor-Server"
    Write-Info "To view logs, check: c:\Users\User\.claude\skills\logs\hs-conductor\"
    Write-Info "To view task: taskschd.msc"
} catch {
    Write-Error-Custom "Failed to create task: $_"
    exit 1
}
