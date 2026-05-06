#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════
#  SEEDANCE STUDIO · Dead Camera Studios
#  Reinvented Cinema · Absolute Creative Control
# ════════════════════════════════════════════════════════════════

set -e

# Move to the script's directory
cd "$(dirname "$0")"

echo ""
echo "  ============================================================"
echo "    SEEDANCE STUDIO  ::  Dead Camera Studios"
echo "    Reinvented Cinema. Absolute Creative Control."
echo "  ============================================================"
echo ""

# ─── Check Node.js ──────────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
  echo "  [ERROR] Node.js is not installed."
  echo "  Install Node.js 18+ from: https://nodejs.org"
  exit 1
fi
echo "  [OK]   Node.js detected: $(node -v)"

# ─── Install deps if missing ────────────────────────────────────
if [ ! -d "node_modules" ]; then
  echo ""
  echo "  [...]  First-time setup: installing dependencies"
  npm install
  echo "  [OK]   Dependencies installed."
else
  echo "  [OK]   Dependencies already installed."
fi

# ─── Open browser after delay ───────────────────────────────────
echo ""
echo "  [...]  Launching server on http://localhost:3300"
echo "  [...]  Opening browser in 3 seconds..."
echo ""
echo "  ------------------------------------------------------------"
echo "   Press CTRL+C to stop the server."
echo "  ------------------------------------------------------------"
echo ""

(
  sleep 3
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:3300"          # macOS
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:3300"      # Linux
  fi
) &

# ─── Start the server ───────────────────────────────────────────
npm start
