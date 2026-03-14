@echo off
setlocal
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-run.ps1"
set EXIT_CODE=%ERRORLEVEL%
if not "%EXIT_CODE%"=="0" (
  echo.
  echo OpenClawWindowsDock setup failed with exit code %EXIT_CODE%.
  pause
)
exit /b %EXIT_CODE%