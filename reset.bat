@echo off
cd /d "%~dp0"
echo This DELETES all test data and starts fresh with the demo data.
set /p ok=Type YES and press Enter to continue: 
if /i not "%ok%"=="YES" exit /b 0
docker compose down -v
call start.bat
