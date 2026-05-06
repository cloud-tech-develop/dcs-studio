@echo off
REM ════════════════════════════════════════════════════════════════
REM  SEEDANCE STUDIO · Re-import edited prompts from Excel
REM  Reads seedance-prompts.xlsx and rewrites presets.json
REM ════════════════════════════════════════════════════════════════

cd /d "%~dp0"

title Seedance Studio - Import Prompts

echo.
echo  ============================================================
echo    SEEDANCE STUDIO  ::  Re-import prompts from Excel
echo  ============================================================
echo.

REM ─── Check Python ────────────────────────────────────────────
where python >nul 2>nul
if errorlevel 1 (
    echo  [ERROR] Python is not installed or not in PATH.
    echo.
    echo  Install Python 3.9+ from: https://python.org
    echo  ^(make sure to check "Add Python to PATH" during install^)
    echo.
    pause
    exit /b 1
)

REM ─── Check that openpyxl is available (auto-install if not) ──
python -c "import openpyxl" >nul 2>nul
if errorlevel 1 (
    echo  [...]  Installing openpyxl ^(one-time setup^)
    python -m pip install openpyxl --quiet
    if errorlevel 1 (
        echo  [ERROR] Failed to install openpyxl.
        echo  Run manually:  pip install openpyxl
        pause
        exit /b 1
    )
    echo  [OK]   openpyxl installed.
)

REM ─── Run the import script ──────────────────────────────────
python import_presets.py
if errorlevel 1 (
    echo.
    echo  [ERROR] Import failed. See message above.
    pause
    exit /b 1
)

echo.
echo  ============================================================
echo   Done. Reload the app in your browser ^(Ctrl+Shift+R^).
echo  ============================================================
echo.
pause
