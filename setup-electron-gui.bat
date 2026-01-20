@echo off
REM Installation script for Electron GUI on Windows

echo ===============================================
echo  CMD Executor - Electron GUI Setup
echo ===============================================
echo.

echo [1/3] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)
echo.

echo [2/3] Verifying Electron installation...
call npm list electron --depth=0
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Electron not found, installing...
    call npm install --save-dev electron electron-builder
)
echo.

echo [3/3] Setup complete!
echo.
echo ===============================================
echo  Ready to launch!
echo ===============================================
echo.
echo To start the Electron GUI, run:
echo   npm run electron
echo.
echo Or for development mode:
echo   npm run electron:dev
echo.
echo For more information, see:
echo   electron/QUICKSTART.md
echo   electron/README.md
echo.
pause
