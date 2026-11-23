@echo off
cd /d "%~dp0"
docker compose down
echo Stopped. Your data is kept. Double-click start.bat to run again.
pause
