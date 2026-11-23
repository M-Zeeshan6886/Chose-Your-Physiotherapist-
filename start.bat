@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"
echo ============================================
echo   Choose Your Dr : starting the test version
echo   The first start takes a few minutes.
echo ============================================
docker compose up -d --build
if errorlevel 1 goto failed
echo Waiting for the website to be ready...
set n=0
:wait
set /a n+=1
if !n! gtr 80 goto failed
curl -s -f http://localhost:3000/api/health >nul 2>&1
if errorlevel 1 (
  timeout /t 3 /nobreak >nul
  goto wait
)
start http://localhost:3000
echo.
echo READY.
echo   Website:         http://localhost:3000
echo   Test checklist:  http://localhost:3000/test-guide
echo   Database viewer: http://localhost:8080
echo.
pause
exit /b 0
:failed
echo.
echo Something went wrong. Please check that Docker Desktop is open and says "running", then double-click start.bat again.
echo If it still fails, send the team lead a photo of this window and the result of:  docker compose logs web --tail 50
pause
exit /b 1
