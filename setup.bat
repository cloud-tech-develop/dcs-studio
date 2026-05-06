@echo off
REM ════════════════════════════════════════════════════════════════
REM  SEEDANCE STUDIO · One-time setup
REM  Run this once before the first start.bat
REM ════════════════════════════════════════════════════════════════

cd /d "%~dp0"

title Seedance Studio - Setup

echo.
echo  ============================================================
echo    SEEDANCE STUDIO  ::  Setup
echo  ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed.
    echo  Install from: https://nodejs.org  ^(version 18 or later^)
    echo.
    pause
    exit /b 1
)

echo  [...]  Installing dependencies
call npm install
if errorlevel 1 (
    echo.
    echo  [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
)

echo.
echo  [OK]   Setup complete. You can now run start.bat
echo.
pause
