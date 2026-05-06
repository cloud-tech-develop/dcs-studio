@echo off
REM ════════════════════════════════════════════════════════════════
REM  SEEDANCE STUDIO v1.0 · Dead Camera Studios
REM  Reinvented Cinema · Absolute Creative Control
REM ════════════════════════════════════════════════════════════════

REM Move to the directory where this .bat lives
cd /d "%~dp0"

title Seedance Studio v1.0 - Dead Camera Studios

echo.
echo  ============================================================
echo    SEEDANCE STUDIO v1.0  ::  Dead Camera Studios
echo    Reinvented Cinema. Absolute Creative Control.
echo  ============================================================
echo.

REM ─── Auto-cleanup: detect keys.json from older versions ────────
REM Older versions stored keys without the "endpoint" field which
REM caused 500 errors on /api/generate. If detected, remove it so
REM the user re-adds keys with the new schema.
if exist "keys.json" (
    findstr /C:"endpoint" keys.json >nul 2>nul
    if errorlevel 1 (
        echo  [WARN] Detected keys.json from an older version.
        echo         Removing it so you can re-add keys cleanly.
        del /Q keys.json
        echo.
    )
)

REM ─── Check Node.js is installed ────────────────────────────────
where node >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo.
    echo  Install Node.js 18+ from: https://nodejs.org
    echo  Then run this script again.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
echo  [OK]   Node.js detected: %NODE_VERSION%

REM ─── Install dependencies if missing ───────────────────────────
if not exist "node_modules" (
    echo.
    echo  [...]  First-time setup: installing dependencies
    echo         This may take a minute on the first run.
    echo.
    call npm install
    if errorlevel 1 (
        echo.
        echo  [ERROR] npm install failed. Check your internet connection.
        echo.
        pause
        exit /b 1
    )
    echo.
    echo  [OK]   Dependencies installed.
) else (
    echo  [OK]   Dependencies already installed.
)

REM ─── Open browser after a short delay ──────────────────────────
echo.
echo  [...]  Launching server on http://localhost:3000
echo  [...]  Browser will open automatically in 3 seconds.
echo.
echo  ------------------------------------------------------------
echo   Press CTRL+C in this window to stop the server.
echo  ------------------------------------------------------------
echo.

REM Open browser in 3 seconds (in background) so the server has time to bind
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

REM ─── Start the server (this blocks until you Ctrl+C) ───────────
call npm start

REM ─── If the server exits unexpectedly, keep window open ────────
echo.
echo  ------------------------------------------------------------
echo   Server stopped.
echo  ------------------------------------------------------------
pause
