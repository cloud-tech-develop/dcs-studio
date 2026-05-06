#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  SEEDANCE STUDIO · Re-import edited prompts from Excel
# ════════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")"

echo ""
echo "  ============================================================"
echo "    SEEDANCE STUDIO  ::  Re-import prompts from Excel"
echo "  ============================================================"
echo ""

# Pick a python command that exists
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "  [ERROR] Python is not installed."
  exit 1
fi

# Auto-install openpyxl if missing
if ! "$PY" -c "import openpyxl" >/dev/null 2>&1; then
  echo "  [...]  Installing openpyxl (one-time setup)"
  "$PY" -m pip install openpyxl --quiet
fi

"$PY" import_presets.py

echo ""
echo "  ============================================================"
echo "   Done. Reload the app in your browser (Ctrl+Shift+R)."
echo "  ============================================================"
echo ""
