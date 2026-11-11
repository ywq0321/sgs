@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
if errorlevel 1 (
    echo Server stopped due to an error.
    pause
    exit /b 1
)
exit /b 0
