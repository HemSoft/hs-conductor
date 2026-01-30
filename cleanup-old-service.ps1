#!/usr/bin/env pwsh
# Quick cleanup script - removes old broken Windows Service
# Run as Administrator

Stop-Service HemSoft-Conductor-Server -Force -ErrorAction SilentlyContinue
sc.exe delete HemSoft-Conductor-Server

Write-Host "Old service removed. Now run .\setup-service.ps1 to create the Scheduled Task." -ForegroundColor Green
