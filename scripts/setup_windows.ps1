# Windows (PowerShell 5.1+ / 7) one-time setup. Run from the repository root:  powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1
# Prerequisites: Python 3.11+ (python.org, "Add to PATH"), Node.js 20+ (nodejs.org).
$ErrorActionPreference = "Stop"

python -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt

Push-Location frontend
npm ci
Pop-Location

if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host "Created .env (edit it to add JWT_SECRET / Stripe test keys)." }

Write-Host ""
Write-Host "Setup complete. Next:"
Write-Host "  1) Demo data : .\.venv\Scripts\python.exe scripts\seed_demo_data.py"
Write-Host "  2) API       : cd backend; ..\.venv\Scripts\python.exe -m uvicorn app.main:app_factory --factory --port 8000"
Write-Host "  3) Frontend  : cd frontend; npm run dev      (open http://localhost:5173)"
Write-Host "  Sign in as owner@example.com / DemoPass2026!"
