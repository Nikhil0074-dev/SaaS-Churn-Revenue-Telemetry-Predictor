# Windows setup

Tested design: every command below mirrors the Linux commands that were executed during development. The PowerShell script itself was **not** run on Windows.

Prerequisites: Python 3.11+ (tick "Add python.exe to PATH"), Node.js 20+.

```powershell
# one-time, from the repository root
powershell -ExecutionPolicy Bypass -File scripts\setup_windows.ps1

# demo data (SQLite file churn_dev.db is created in the current directory)
.\.venv\Scripts\python.exe scripts\seed_demo_data.py

# terminal 1: API
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app_factory --factory --port 8000

# terminal 2: UI
cd frontend
npm run dev          # http://localhost:5173
```

Run the tests:

```powershell
cd backend;  ..\.venv\Scripts\python.exe -m pytest -q
cd ..\frontend; npm run typecheck; npm test
```

Environment variables in PowerShell: `$env:DATABASE_URL = "sqlite:///C:/data/churn.db"`; or put them in `.env` (loaded automatically). Use forward slashes in SQLite URLs.
If script execution is blocked, use the `-ExecutionPolicy Bypass` form above. Long paths: keep the repository close to the drive root.
