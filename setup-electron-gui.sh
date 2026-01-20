#!/bin/bash
# Installation script for Electron GUI on Linux/macOS

echo "==============================================="
echo " CMD Executor - Electron GUI Setup"
echo "==============================================="
echo ""

echo "[1/3] Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install dependencies"
    exit 1
fi
echo ""

echo "[2/3] Verifying Electron installation..."
npm list electron --depth=0
if [ $? -ne 0 ]; then
    echo "WARNING: Electron not found, installing..."
    npm install --save-dev electron electron-builder
fi
echo ""

echo "[3/3] Setup complete!"
echo ""
echo "==============================================="
echo " Ready to launch!"
echo "==============================================="
echo ""
echo "To start the Electron GUI, run:"
echo "  npm run electron"
echo ""
echo "Or for development mode:"
echo "  npm run electron:dev"
echo ""
echo "For more information, see:"
echo "  electron/QUICKSTART.md"
echo "  electron/README.md"
echo ""
