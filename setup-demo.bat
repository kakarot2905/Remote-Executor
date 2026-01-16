@echo off
REM ============================================================================
REM Phase 2 Quick Start Script for Windows
REM 
REM This script demonstrates the distributed command executor system.
REM Prerequisites: Node.js installed
REM 
REM Usage:
REM   setup-demo.bat [--server http://localhost:3000]
REM ============================================================================

setlocal enabledelayedexpansion

set SERVER=http://localhost:3000
set DEMO_DIR=%TEMP%\cmd-executor-demo

if not "%1"=="" (
    if "%1"=="--server" (
        set SERVER=%2
    )
)

cls
echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║  CMD Executor - Phase 2 Quick Start (Windows)                  ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo Server: %SERVER%
echo Demo directory: %DEMO_DIR%
echo.
echo ============================================================================
echo SETUP OPTIONS:
echo ============================================================================
echo.
echo 1. Create demo project (ZIP file)
echo 2. Start Web Server (npm run dev)
echo 3. Start Worker Agent (node worker-agent.js)
echo 4. Run Quick Test (node quickstart.js)
echo 5. View All Workers (curl API)
echo 6. View All Jobs (curl API)
echo 7. Open Web UI in Browser
echo 8. Clean up demo files
echo 9. Exit
echo.

set /p CHOICE="Enter your choice (1-9): "

if "%CHOICE%"=="1" goto create_demo
if "%CHOICE%"=="2" goto start_server
if "%CHOICE%"=="3" goto start_worker
if "%CHOICE%"=="4" goto run_quickstart
if "%CHOICE%"=="5" goto list_workers
if "%CHOICE%"=="6" goto list_jobs
if "%CHOICE%"=="7" goto open_ui
if "%CHOICE%"=="8" goto cleanup
if "%CHOICE%"=="9" goto end

echo Invalid choice. Please try again.
goto menu

:create_demo
echo.
echo Creating demo project...
mkdir "%DEMO_DIR%" 2>nul

REM Create package.json
(
    echo {
    echo   "name": "demo-project",
    echo   "version": "1.0.0",
    echo   "scripts": {
    echo     "test": "echo Demo project test passed"
    echo   }
    echo }
) > "%DEMO_DIR%\package.json"

REM Create demo script
(
    echo @echo off
    echo echo ============== Demo Test Results ==============
    echo echo Current Directory:
    echo cd
    echo echo.
    echo echo Files:
    echo dir /B
    echo echo.
    echo echo System Info:
    echo systeminfo ^| findstr /C:"OS Name"
    echo echo.
    echo echo Test completed successfully!
) > "%DEMO_DIR%\run-test.bat"

REM Create ZIP (requires 7-Zip or PowerShell)
echo Creating ZIP file...
pushd "%DEMO_DIR%"
powershell -NoProfile -Command "Compress-Archive -Path * -DestinationPath ../demo-project.zip -Force"
popd

echo ✓ Demo project created: %TEMP%\demo-project.zip
pause
goto menu

:start_server
echo.
echo Starting web server...
echo.
npm run dev
goto menu

:start_worker
echo.
echo Starting worker agent...
echo Set the server URL if different from %SERVER%
echo.
node worker-agent.js --server %SERVER%
goto menu

:run_quickstart
echo.
node quickstart.js --server %SERVER%
pause
goto menu

:list_workers
echo.
echo Fetching registered workers...
echo.
curl -s %SERVER%/api/workers/register | powershell -Command "[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8; $input | ConvertFrom-Json | ConvertTo-Json -Depth 10"
echo.
pause
goto menu

:list_jobs
echo.
echo Fetching all jobs...
echo.
curl -s %SERVER%/api/jobs/create | powershell -Command "[Console]::OutputEncoding = [Text.UTF8Encoding]::UTF8; $input | ConvertFrom-Json | ConvertTo-Json -Depth 10"
echo.
pause
goto menu

:open_ui
echo.
echo Opening web UI in default browser...
start %SERVER%
pause
goto menu

:cleanup
echo.
echo Cleaning up demo files...
rmdir /S /Q "%DEMO_DIR%" 2>nul
del "%TEMP%\demo-project.zip" 2>nul
echo ✓ Cleanup complete
pause
goto menu

:end
echo.
echo Goodbye!
echo.
exit /b 0
