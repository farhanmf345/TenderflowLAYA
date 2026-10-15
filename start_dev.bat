@echo off
echo.
echo  ████████╗███████╗███╗   ██╗██████╗ ███████╗██████╗ ███████╗██╗      ██████╗ ██╗    ██╗
echo  ╚══██╔══╝██╔════╝████╗  ██║██╔══██╗██╔════╝██╔══██╗██╔════╝██║     ██╔═══██╗██║    ██║
echo     ██║   █████╗  ██╔██╗ ██║██║  ██║█████╗  ██████╔╝█████╗  ██║     ██║   ██║██║ █╗ ██║
echo     ██║   ██╔══╝  ██║╚██╗██║██║  ██║██╔══╝  ██╔══██╗██╔══╝  ██║     ██║   ██║██║███╗██║
echo     ██║   ███████╗██║ ╚████║██████╔╝███████╗██║  ██║██║     ███████╗╚██████╔╝╚███╔███╔╝
echo     ╚═╝   ╚══════╝╚═╝  ╚═══╝╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝
echo.
echo                          v4.0  AI-Powered Tender Intelligence
echo  ──────────────────────────────────────────────────────────────────────────
echo.

:: Start FastAPI backend
echo [1/2] Starting FastAPI backend  (http://localhost:8000)...
start "TenderFlow Backend" cmd /k "cd /d %~dp0server && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

timeout /t 2 /nobreak >nul

:: Start Vite frontend
echo [2/2] Starting React frontend   (http://localhost:5173)...
start "TenderFlow Frontend" cmd /k "cd /d %~dp0client && npm run dev"

echo.
echo  ✓ Both servers started.
echo    Backend  → http://localhost:8000/docs
echo    Frontend → http://localhost:5173
echo.
pause
